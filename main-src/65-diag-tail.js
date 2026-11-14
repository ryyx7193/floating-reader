// 🟥 L-2 安全修复轮(2026-10-13)：改 async —— app.log 可长到数 MB，readFileSync 在 IPC 线程上
// 会卡住主进程一整拍；两个调用点（log:copyDiagnostics / feedback:export）都是 async handler，直接 await。
async function buildDiagnostics() {
  const os = require('os');
  const fp = path.join(app.getPath('userData'), 'logs', 'app.log');
  let tail = '';
  if (fs.existsSync(fp)) {
    const text = await fs.promises.readFile(fp, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    tail = lines.slice(-200).join('\n');
  }
  return [
    TT('浅水鲸 · 诊断信息','Shallow Whale · Diagnostics'),
    TT('版本: ','Version: ') + app.getVersion(),
    'Electron: ' + process.versions.electron + ' / Chrome: ' + process.versions.chrome + ' / Node: ' + process.versions.node,
    TT('平台: ','Platform: ') + process.platform + ' ' + process.arch + ' ' + (os.release ? os.release() : ''),
    'CPU: ' + ((os.cpus && os.cpus()[0] && os.cpus()[0].model) || TT('未知','unknown')),
    TT('内存: ','Memory: ') + Math.round((os.totalmem ? os.totalmem() : 0) / 1024 / 1024 / 1024) + ' GB',
    TT('用户数据: ','User data: ') + app.getPath('userData'),
    /* V4.3.27：便携模式以前是「悄悄生效 / 悄悄失败」，用户放好了 flag 却看不见数据在哪。
       这里如实上报三种状态：已生效 / 有 flag 但没生效（多半是目录不可写）/ 未启用。 */
    TT('便携模式: ','Portable mode: ') + (PORTABLE_ACTIVE
      ? TT('已生效（数据在程序旁 Data 目录）','active (data lives in the Data folder next to the program)')
      : (PORTABLE_FLAG ? TT('未生效（检测到了 portable.flag，但数据目录不可用，已退回默认位置——详见日志）','not active (portable.flag was found, but the data folder is unusable — fell back to the default location; see the log)') : TT('未启用（默认 %APPDATA%）','disabled (defaults to %APPDATA%)'))),
    TT('程序路径: ','Program path: ') + process.execPath,
    TT('时间: ','Time: ') + new Date().toISOString(),
    '',
    TT('--- 最近日志（最新在后） ---','--- Recent log (newest last) ---'),
    tail
  ].join('\n');
}

ipcMain.handle('log:copyDiagnostics', async (e) => {
  if (!isTrustedUI(e)) return { ok: false, error: TT('来源不可信','Untrusted sender') };
  try {
    const text = await buildDiagnostics();
    /* 🟥 V4.3.36：Electron 44 起 clipboard 全面异步化 —— 官方 breaking changes 明确
       「clipboard.writeText(text) now returns Promise」（read/write/readText/has 同样）。
       不 await 的话，写入可能尚未提交就返回 {ok:true}，用户点「复制诊断信息」后粘出来是空的。
       （本机实测：writeText/readText 返回 Promise；readHTML/writeHTML/writeBuffer/availableFormats 已被移除。） */
    await clipboard.writeText(text);
    return { ok: true, length: text.length };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

ipcMain.handle('feedback:export', async (e) => {
  if (!isTrustedUI(e)) return { ok: false, error: TT('来源不可信','Untrusted sender') };
  try {
    const text = await buildDiagnostics();
    const name = '浅水鲸反馈_' + localDateKey() + '.txt';
    const r = await dialog.showSaveDialog({
      title: TT('导出反馈包','Export feedback bundle'),
      defaultPath: path.join(app.getPath('documents'), name),
      filters: [{ name: TT('文本','Text'), extensions: ['txt', 'log'] }]
    });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, text, 'utf8');
    return { ok: true, path: r.filePath };
  } catch (err) {
    logToFile('error', 'feedback export failed: ' + ((err && err.message) || err));
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

// 日志与备份 IPC
ipcMain.handle('backup:save', async (e, data) => {
  if (!isTrustedUI(e)) return { ok: false, error: TT('来源不可信','Untrusted sender') };
    try {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    // V4.3.34：ISO 串只到毫秒，同毫秒内的两次保存会同名互相覆盖。加一小段随机后缀。
    //          listBackups() 的筛选正则是 /^backup-.*\.json$/，不受影响。
    const name = 'backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + Math.random().toString(36).slice(2, 6) + '.json';
    /* 🟥 V4.3.43（真缺陷 B）：改成「先写临时文件、再 rename」的原子写。
       原先直接 writeFileSync 到目标名 —— 写入过程中崩溃/被强杀/磁盘满，就会留下一个
       **语法不完整、文件名却完全正常**的 backup-*.json；而恢复侧只认最新一份，
       于是用户看到的是「备份全丢了」，其实更旧的备份好好的。
       同目录 rename 是原子的：外人要么看到完整的旧文件，要么看到完整的新文件，没有"半个"。
       临时名以 .tmp 结尾，不会被 listBackups() 的 /^backup-.*\.json$/ 选中。 */
    const tmp = path.join(dir, name + '.tmp');
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
    fs.renameSync(tmp, path.join(dir, name));
    // 清掉历史上被打断留下的临时文件（否则会永久占着磁盘且没人认领）
    try {
      fs.readdirSync(dir).filter(function (f) { return /\.json\.tmp$/.test(f); })
        .forEach(function (f) {
          try { fs.unlinkSync(path.join(dir, f)); }
          /* 🆕 V4.3.62：这两处原来是空 catch —— 清理失败（文件被占用 / 权限）时
             用户看不到任何迹象，而症状是"磁盘莫名其妙被占"。清理失败必须留痕。 */
          catch (e) { logToFile('warn', 'backup tmp cleanup failed: ' + f + ' · ' + errTextOf(e)); }
        });
    } catch (e) { logToFile('warn', 'backup tmp scan failed: ' + errTextOf(e)); }
    /* 🆕 V4.3.62：保留策略从"只留最新 3 份"改成"最新 3 份 + 每天 1 份 × 7 天"。
       为什么：备份每 5 分钟一次（`backupTimer`），只留 3 份 = **实际只保留约 15 分钟历史**。
       而用户发现问题往往是几小时甚至几天后 —— 书源规则改错导致抓取失败、换源覆盖了正文、
       误删章节后没立刻察觉。等到那时，15 分钟前的备份早被覆盖，等于**没有备份**。
       现在的口径：最近 3 份（细粒度，覆盖手滑）+ 最近 7 天每天的第 1 份（粗粒度，覆盖迟觉）。
       上限 3 + 7 = 10 份，磁盘占用仍是有界的。 */
    const files = listBackups();
    const KEEP_RECENT = 3, KEEP_DAYS = 7;
    const keep = new Set(files.slice(0, KEEP_RECENT));
    const daySeen = new Set();
    for (let i = 0; i < files.length && daySeen.size < KEEP_DAYS; i++) {
      const day = String(files[i]).slice('backup-'.length, 'backup-'.length + 10);   // backup-YYYY-MM-DDT…
      if (daySeen.has(day)) continue;
      daySeen.add(day);
      keep.add(files[i]);
    }
    let pruned = 0;
    files.forEach(function (f) {
      if (keep.has(f)) return;
      try { fs.unlinkSync(path.join(dir, f)); pruned++; }
      catch (e) { logToFile('warn', 'backup prune failed: ' + f + ' · ' + errTextOf(e)); }
    });
    if (pruned) logToFile('info', 'backup pruned ' + pruned + ' old file(s), keep ' + keep.size);
    return { ok: true, name };
  } catch (err) {
    logToFile('error', 'backup save failed: ' + err.message);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('backup:list', async (e) => isTrustedUI(e) ? listBackups() : []);

/* ---------- 🛡 V4.3.75 S2：备份主进程兜底 watchdog ----------
   备份**写盘**在主进程（backup:save），但**触发**长期只有渲染层 5 分钟 setInterval 一条 ——
   两种真实失效它盖不住：① 窗口后台/最小化时 Chromium 对页面定时器做 intensive throttling，
   间隔被拉到 1 分钟以上甚至更久；② 渲染层崩溃 / 白屏后，备份整条链直接停摆且无声。
   主进程的 setInterval 不受页面生命周期节流，用它做 watchdog：每 5 分钟检查最新备份年龄，
   超 15 分钟就给渲染层发 backup:nudge 推它立即补备（盖①），同时落一条 warn
   （盖②——渲染层若已死，nudge 发出去没人接，但日志会留下"备份停了"的可查痕迹）。 */
function backupWatchdog() {
  try {
    const files = listBackups();
    if (!files.length) return;   // 从未备份过（首次使用 / 新数据目录）：不告警
    const fp = path.join(backupDir(), files[0]);
    const ageMin = Math.round((Date.now() - fs.statSync(fp).mtimeMs) / 60000);
    if (ageMin > 15) {
      logToFile('warn', 'backup watchdog: last backup ' + ageMin + ' min old (expected ~5) — nudging renderer');
      notifyMainWindow('backup:nudge');
    }
  } catch (e) { logToFile('warn', 'backup watchdog failed: ' + errTextOf(e)); }
}
setInterval(backupWatchdog, 5 * 60 * 1000);
/* AGENTS 规矩：新增能力顺手挂出来供端到端探针真跑 —— 探针进程即主进程，
   可伪造超龄备份后直接调它，断言「warn 日志 + nudge 推送 + 渲染层补备」整条链。 */
global.__backupWatchdog = backupWatchdog;


ipcMain.handle('backup:load', async (e, name) => {
  if (!isTrustedUI(e)) return { ok: false, error: TT('来源不可信','Untrusted sender') };
    try {
    const dir = backupDir();
    const file = name || (listBackups()[0]);
    if (!file) return null;
    /* 🛡 V4.3.32：name 由渲染层传入且**未做任何校验**。`path.join` 会把 `../` 规范化掉，
       所以 `backup-../../Desktop/xxx.json` 之类能跳出备份目录，等于给渲染层
       「读取磁盘上任意 JSON 文件并返回内容」的能力。
       这里与 update:check 用同一把尺子：① 文件名白名单（口径同 listBackups 的筛选正则）
       ② 解析成绝对路径后再确认仍在备份目录内。 */
    if (!/^backup-[^/\\]*\.json$/i.test(String(file))) {
      logToFile('error', 'backup load rejected (bad name): ' + String(file));
      return null;
    }
    const fp = path.join(dir, file);
    const resolved = path.resolve(fp), root = path.resolve(dir);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      logToFile('error', 'backup load rejected (escapes dir): ' + resolved);
      return null;
    }
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (err) {
    logToFile('error', 'backup load failed: ' + err.message);
    return null;
  }
});

/* V4.3.33：渲染层可传入含 \n 的字符串，能在 app.log 里伪造整行（含假时间戳、假级别），
   干扰排障。写盘前把换行压平。 */
/* 🟥 V4.3.97 第 4 轮（P2）：原来零来源校验、零长度上限。preload.js 与 preload-panel.js
   都暴露了 logError，被攻陷的面板可以反复发超长串 → logToFile 是**同步**写盘，
   即便脱敏已线性化，40 万字符仍要 ~1s，主进程连续被按就是界面持续假死。
   收口：只信主窗/已登记面板，且单条截断到 8KB（正常错误日志远小于此）。 */
const LOG_ERROR_MAX = 8192;
ipcMain.on('log:error', (e, msg) => {
  if (!isTrustedUI(e)) return;
  const s = String(msg == null ? '' : msg).replace(/[\r\n]+/g, ' ');
  logToFile('renderer', s.length > LOG_ERROR_MAX ? s.slice(0, LOG_ERROR_MAX) + '…<已截断>' : s);
});
/* 🟥 V4.3.97（第 2 轮复审 S-10）：这两条原来不看来源 ——
   crypto:get-key 直接返回 DPAPI 解出的 32 字节密钥，log:export 复制**整份** app.log
   （比 log:tail 的 2000 行更全），而 preload-panel.js:56 把 exportLogs 暴露给了所有面板。
   上一轮只锁 log:tail 等于门没关严，这里把剩下的出口一并收口。 */
ipcMain.handle('crypto:get-key', (e) => isTrustedUI(e) ? getOrCreateCryptoKey() : null);
ipcMain.handle('log:export', (e) => isTrustedUI(e) ? exportLogsFile() : { ok: false, error: TT('来源不可信','Untrusted sender') });
ipcMain.handle('source:list-rules', () => loadSourceRules());
ipcMain.handle('source:add-rule', (e, rule) => {
  const err = validateSourceRule(rule);
  if (err) return { ok: false, error: err };
  const rules = loadSourceRules();
  const idx = rules.findIndex(r => r.name === rule.name);
  if (idx >= 0) rules[idx] = rule; else rules.push(rule);
  /* V4.3.33 修：原先丢弃 saveSourceRules 的返回值、恒返回 ok:true ——
     磁盘写满 / 目录不可写时用户看到「保存成功」，重启后规则却没了，且没有任何提示。 */
  if (!saveSourceRules(rules)) return { ok: false, error: TT('规则写盘失败（磁盘空间或权限问题），详见日志','Failed to write the rules to disk (disk space or permissions); see the log') };
  return { ok: true, rules };
});
ipcMain.handle('source:remove-rule', (e, name) => {
  const rules = loadSourceRules().filter(r => r.name !== name);
  if (!saveSourceRules(rules)) return { ok: false, error: TT('规则写盘失败（磁盘空间或权限问题），详见日志','Failed to write the rules to disk (disk space or permissions); see the log') };   // V4.3.33：同上，不再静默
  return { ok: true, rules };
});
ipcMain.handle('source:chapters', (e, payload) => {
  if (!payload || !payload.url || !payload.rule) return { ok: false, error: TT('缺少参数','Missing parameter') };
  return fetchSourceChapters(payload.url, payload.rule);
});
/* V4.3.33 修：全书抓取的「取消」标志是模块级单例（sourceFetchCancelled），
   两个并发抓取会互相干扰 —— 一个取消两个都停；新任务开头又无条件把它重置成 false，
   于是旧任务刚设的取消标志会被抹掉。这里加互斥锁：同一时刻只允许一个全书抓取。
   渲染层本身就是点击触发、串行发起的，加锁不影响正常用法，只会把「并发串台」变成明确提示。 */
let sourceContentsRunning = false;
ipcMain.handle('source:contents', (e, payload) => {
  if (!payload || !Array.isArray(payload.chapters) || !payload.rule) return { ok: false, error: TT('缺少参数','Missing parameter') };
  if (sourceContentsRunning) return { ok: false, error: TT('已有一个抓取任务在进行中，请等它结束或先点「取消」','Another fetch task is already running — wait for it to finish or press Cancel first') };
  sourceContentsRunning = true;
  return Promise.resolve(fetchSourceContents(payload.chapters, payload.rule, e.sender))
    .finally(() => { sourceContentsRunning = false; });
});
/* 🆕 V4.3.85 自动抓取：一个 URL 走完全程（识别 → 抓目录 → 抓正文），返回可载入的整本。
   🟥 与 source:contents **共用同一把互斥锁** —— 两条路径最终都会调 fetchSourceContents，
   而它的取消标志是模块级单例（sourceFetchCancelled）。不共用锁就会出现
   「手动抓取点取消，自动抓取跟着停」这类串台（V4.3.33 修过一次同族问题）。 */
ipcMain.handle('source:auto', (e, payload) => {
  if (!payload || !payload.url) return { ok: false, error: TT('缺少参数','Missing parameter') };
  if (sourceContentsRunning) return { ok: false, error: TT('已有一个抓取任务在进行中，请等它结束或先点「取消」','Another fetch task is already running — wait for it to finish or press Cancel first') };
  sourceContentsRunning = true;
  return Promise.resolve(sourceAutoFetch(payload.url, e.sender))
    .finally(() => { sourceContentsRunning = false; });
});
ipcMain.on('source:cancel', () => { sourceFetchCancelled = true; });
// 🆕 V4.3.23 站点判定：书库用。真去请求站点根、判首页/书页、找搜索入口，返回可用证据链
ipcMain.handle('site:judge', (e, input) => judgeSite(input));
ipcMain.handle('source:fetch-one', (e, payload) => {
  if (!payload || !payload.url || !payload.rule) return { ok: false, error: TT('缺少参数','Missing parameter') };
  return fetchSourceOne(payload.url, payload.rule);
});
ipcMain.handle('source:search', (e, payload) => {
  if (!payload || !payload.query || !payload.rule) return { ok: false, error: TT('缺少参数','Missing parameter') };
  // 📑 V4.3.29：透传 page —— 模板里有 {page} 才翻得动页
  return searchSource(payload.query, payload.rule, payload.page);
});

// 面板 IPC
/* 🟥 V4.3.97（代码审查 S-3）：这几条原来完全不校验入参 —— 任意字符串都会进 openPanel，
   虽然最终按 PANEL_TYPES 查表不会炸，但属于"信任渲染层自报"的口子（同 V4.3.33b 修的 panel:data）。
   这里补一层类型白名单；面板之间互相开关是正常功能（书架里点"设置"），所以不做 sender 限制。 */
const PANEL_TYPE_SET = new Set(PANEL_TYPES);
const panelTypeOk = (type) => typeof type === 'string' && PANEL_TYPE_SET.has(type);
/* 🟥 V4.3.97（代码审查 S-8）：这几条原来完全不校验来源，而 preload-panel.js:31
   把 openPanel 暴露给了**所有**面板窗 —— 任一被攻陷的面板可反复开关任意面板做 UI 骚扰/遮挡。
   本轮早先只补了面板类型白名单（panelTypeOk），没补来源，这里补齐。
   口径与 panel:action 一致：主窗 + 已登记面板（书架面板确实要开目录面板）。 */
ipcMain.on('panel:open', (e, type) => { if (isTrustedUI(e) && panelTypeOk(type)) openPanel(type); });
ipcMain.on('panel:close', (e, type) => { if (isTrustedUI(e) && panelTypeOk(type)) closePanel(type); });
ipcMain.on('panel:close-all', (e) => { if (isTrustedUI(e)) closeAllPanels(); });
ipcMain.on('panel:close-top', (e) => { if (isTrustedUI(e)) closeTopPanel(); });
ipcMain.on('panel:toggle', (e, type) => { if (isTrustedUI(e) && panelTypeOk(type)) togglePanel(type); });
ipcMain.on('panel:data', (e, msg) => {
  /* 🛡 V4.3.33b：与 panel:action 用同一把尺子（上一轮只修了 action，把这条漏了）。
     这条通道是**主窗 → 面板**的单向推送，原先完全信任发送方自报的 `msg.type` ——
     而 preload 把 `sendPanelData` 暴露给了**所有**窗口，于是任一被攻陷的面板窗
     都能向别的面板（设置/书架等）推伪造的 `panel:update`，伪装 UI 或污染状态。
     这里限定只接受主窗发来的。 */
  if (!mainWindow || mainWindow.isDestroyed() || e.sender.id !== mainWindow.webContents.id) return;
  const type = msg && msg.type;
  const payload = msg && msg.payload;
  if (!type || !payload) return;
  const win = panels[type];
  safeSend(win, 'panel:update', payload);
});
ipcMain.on('panel:action', (e, payload) => {
  /* V4.3.33 修：原先「取不到来源就回退信任渲染层自报的 payload.type」——
     等于任何窗口都能冒充别的面板发动作。panel 一律由主进程创建、登记在 panelByWebContents 里，
     取不到就说明来源不可信，直接丢弃。 */
  const type = panelByWebContents.get(e.sender.id);
  if (!type) return;
  notifyMainWindow('panel:action', Object.assign({}, payload, { type }));
});
ipcMain.on('panel:ready', (e) => {
  const type = panelByWebContents.get(e.sender.id);
  if (type) notifyMainWindow('panel:ready', type);
});

/* 🛡 V4.3.39：渲染层上报的「隐蔽态」（SOS / 伪装）。二次启动时主进程据此决定
   要不要把窗口拉出来 —— SOS/伪装的整个意义就是"看起来不在"，被强行 show 就穿帮了。 */
let uiHiddenState = { sos: false, disguised: false };
let pendingOsFile = null;
/* 🟥 V4.3.45（R4-3）：渲染层同步界面语言。托盘是常驻的，菜单项与提示要跟着重建；
   主窗标题由渲染层自己下发，不在这里动。
   （`APP_LANG` / `TT()` 的定义在**文件最顶部**，见那里的说明 —— 模块级立即调用要用到它。） */
ipcMain.on('app:lang', (e, lang) => {
  const next = (lang === 'en') ? 'en' : 'zh';
  if (next === APP_LANG) return;
  APP_LANG = next;
  try { refreshTrayMenu(); } catch (err) { try { logToFile('error', 'tray relabel failed: ' + ((err && err.message) || err)); } catch (e2) {} }
});

ipcMain.on('app:uiState', (e, st) => {
  if (!mainWindow || mainWindow.isDestroyed() || e.sender.id !== mainWindow.webContents.id) return;
  uiHiddenState = { sos: !!(st && st.sos), disguised: !!(st && st.disguised) };
  /* 隐蔽期间被拦下的待开文件：退出隐蔽态后再打开 */
  if (!uiHiddenState.sos && !uiHiddenState.disguised && pendingOsFile) {
    const f = pendingOsFile; pendingOsFile = null;
    try { openFileFromOs(f); } catch (err) { try { logToFile('error', 'open pending file failed: ' + ((err && err.message) || err)); } catch (e) {} }
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  /* 🟥 V4.3.31：修「应用已经开着时，双击书籍文件毫无反应」。
     second-instance 的参数是**新实例**的命令行（回调第二个入参），原实现却传了 process.argv
     —— 那是主实例自己的启动参数，而主实例通常是不带文件启动的，于是 fromArgv 恒为 null，
     新实例送来的文件被无声丢掉（连日志都不会有一行）。
     实测复现：主实例已在运行 → 再从资源管理器/命令行给一个 txt → 阅读器纹丝不动。 */
  app.on('second-instance', (event, argv) => {
    const fromArgv = pickOpenableFromArgv(argv || process.argv);
    /* 🛡 V4.3.39：SOS / 伪装中**不拉起窗口**，有文件先收着（退出隐蔽态时由 app:uiState 打开）。
       原先无条件 show/focus —— 正在伪装或已收起的窗口会被二次启动强行拽出来。 */
    if (uiHiddenState.sos || uiHiddenState.disguised) {
      if (fromArgv) {
        pendingOsFile = fromArgv;
        try { logToFile('info', '隐蔽态下收到二次启动文件，暂缓打开: ' + fromArgv); } catch (e) {}
      } else {
        try { logToFile('info', '隐蔽态下忽略二次启动（不拉起窗口）'); } catch (e) {}
      }
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.setOpacity(1);
      mainWindow.show();
      mainWindow.focus();
    }
    if (fromArgv) openFileFromOs(fromArgv);
  });
  app.whenReady().then(() => {
    patchConsole();
    try {
      crashReporter.start({ companyName: '浅水鲸', productName: '悬浮阅读器', uploadToServer: false, compress: true });
    } catch (e) {}
    /* 🛡 V4.3.43：权限兜底——必须在 **ready 之后、创建窗口之前** 注册。
       原先写在模块顶层，被 Electron 抛错后静默吞掉（详见 setupPermissionGuard 处的说明）。 */
    setupPermissionGuard();
    createWindow();
    /* V4.3.36：托盘初始化单独兜住 —— 图标资源缺失/损坏时 new Tray 可能抛错，
       那会连累 whenReady 后面的 startDisplayWatch / registerHideShortcut（全局热键全没了）。 */
    try { createTray(); } catch (e) { try { logToFile('error', 'tray init failed: ' + ((e && e.message) || e)); } catch (err) {} }
    startDisplayWatch();   // 投屏检测：运行中新增显示器 → 自动隐身（零额外进程）
    registerHideShortcut(DEFAULT_HIDE_SHORTCUT);
  registerDisguiseShortcut(DEFAULT_DISGUISE_SHORTCUT);
    startHoverPolling();
    logToFile('info', '浅水鲸 main process started');
    const argvFile = pickOpenableFromArgv(process.argv);
    if (argvFile) {
      if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', () => openFileFromOs(argvFile));
      else setTimeout(() => openFileFromOs(argvFile), 800);
    }
  });
}

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  /* 🆕 V4.3.55（关闭联动）：托盘「退出」等不经主窗 close 事件的退出路径也要联动关目标。
     X 路径已经发过的话（10s 内）不重发，免得目标收到两条 WM_CLOSE 弹两次确认。 */
  if (companionLinkEnabled('linkClose') && Date.now() - companionCloseLinkSentAt > 10000) {
    runCompanionTargetAction('close', 'quit-link');
  }
  /* V4.3.34：两个轮询定时器也显式停掉（150ms 悬停检测 / 16ms 拖动）。
     注意顺序 —— stopDrag() 内部会调 startHoverPolling()（拖动结束后恢复悬停检测），
     所以 stopHoverPolling() 必须放在它后面，否则等于白停。 */
  try { stopDrag(); } catch (e) {}
  try { stopHoverPolling(); } catch (e) {}
  stopForegroundWatch(true);   // 别把 PowerShell 子进程留成孤儿
  stopCompanionWatch();        // 🆕 V4.3.53（R12-2）伴随模式的观察器同上
  stopColorServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
