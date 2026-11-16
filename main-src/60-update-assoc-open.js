// 版本清单专用：沿用旧的错误文案，避免上层提示措辞变化
function fetchJsonUrl(urlStr, timeout) {
  return httpGet(urlStr, { timeout: timeout || 10000, asJson: true, accept: 'application/json,*/*' })
    .catch(e => { throw new Error(e && e.message === 'JSON_PARSE_FAILED' ? TT('版本清单不是有效 JSON','Release manifest is not valid JSON') : ((e && e.message) || String(e))); });
}

/* 🛡 V4.3.37：伪装外观时把窗口标题与托盘名一起换掉。
   原先伪装只画 DOM 层（z-index:700 能盖住窗内一切），但**盖不住操作系统级的标题文本** ——
   悬停任务栏 / Alt-Tab 一眼就能看到「浅水鲸 · Vx.y.z 正式版」，伪装等于白做。 */
/* 🛡 V4.3.39：伪装时连**图标**一起换 —— 标题与托盘名都改了，任务栏/托盘图标还是鲸鱼照样穿帮。
   进入伪装 → win.setIcon(皮肤图标) + tray.setImage；退出 → 还原成应用图标与原托盘图。
   Windows 下 BrowserWindow.setIcon 直接改任务栏/Alt-Tab 图标。 */
const DISGUISE_ICONS = { word: 'disguise-word.png', code: 'disguise-code.png', sheet: 'disguise-sheet.png' };
ipcMain.on('app:disguise-title', (e, payload) => {
  if (!mainWindow || mainWindow.isDestroyed() || e.sender.id !== mainWindow.webContents.id) return;
  const t = String((payload && payload.title) || '').slice(0, 160);
  const tn = String((payload && payload.tray) || '').slice(0, 60);
  const skin = String((payload && payload.skin) || '');
  /* 🛡 V4.3.38：回落值带上版本号。原先回落成裸「浅水鲸」，而渲染层刚设好的
     document.title 会被这次 setTitle 覆盖 —— 退出伪装后任务栏标题丢版本号。 */
  try { mainWindow.setTitle(t || TT('浅水鲸 · V' + app.getVersion() + ' 正式版', 'Shallow Whale · V' + app.getVersion())); } catch (err) {}
  try { if (tray) tray.setToolTip(tn || TT('浅水鲸','Shallow Whale')); } catch (err) {}
  try {
    const skinIcon = DISGUISE_ICONS[skin];
    if (skinIcon) {
      const img = nativeImage.createFromPath(path.join(__dirname, 'assets', skinIcon));
      if (!img.isEmpty()) {
        if (tray) tray.setImage(img);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(img);
      }
    } else {
      if (tray) tray.setImage(trayIcon());
      const appIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
      if (!appIcon.isEmpty() && mainWindow && !mainWindow.isDestroyed()) mainWindow.setIcon(appIcon);
    }
  } catch (err) { try { logToFile('error', 'disguise icon failed: ' + ((err && err.message) || err)); } catch (e) {} }
});

ipcMain.handle('update:check', async (e, urlStr) => {
  const target = String(urlStr || '').trim();
  if (!target) return { ok: false, error: TT('未配置更新清单地址','No release manifest URL configured') };
  try {
    let json = null;
    /* 🛡 V4.3.38：更新清单**必须 https**。明文 http 可被中间人篡改 version 与 url ——
       用户会看到伪造的版本号和恶意下载链接（点「检查更新」直接变成钓鱼入口）。 */
    if (/^http:/i.test(target)) return { ok: false, error: TT('更新清单必须使用 https（明文 http 可被中间人篡改版本号与下载地址）','The release manifest must use https (plain http lets a man-in-the-middle tamper with the version and download URL)') };
    if (/^https:/i.test(target)) json = await fetchJsonUrl(target, 10000);
    else if (fs.existsSync(target)) {
      // 🛡 本地清单只允许读取数据目录内的文件（旧实现可读任意路径，属渲染层越权读文件）
      const resolved = path.resolve(target), root = path.resolve(app.getPath('userData'));
      if (resolved !== root && !resolved.startsWith(root + path.sep)) return { ok: false, error: TT('更新清单不可访问（仅限 http/https 或数据目录内）','Release manifest is not accessible (only http/https or inside the data folder)') };
      json = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    }
    else return { ok: false, error: TT('更新清单不可访问','Release manifest is not accessible') };
    const latest = String((json && (json.version || json.tag_name)) || '').replace(/^v/i, '');
    if (!latest) return { ok: false, error: TT('清单缺少 version 字段','The manifest has no version field') };
    return {
      ok: true,
      current: app.getVersion(),
      latest,
      /* 🛡 V4.3.38：清单里的下载地址必须也是 https —— 否则一份 https 清单仍可给出
         `http://attacker/…` 的下载链接，把用户导向中间人可篡改的安装包。非 https 直接置空。 */
      url: (function () {
        const u = String((json && (json.url || json.download)) || '');
        return /^https:/i.test(u) ? u : '';
      })(),
      notes: String((json && json.notes) || '')
    };
  } catch (err) {
    logToFile('error', 'update check failed: ' + ((err && err.message) || err));
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

// ---------- 文件关联（写入 HKCU，出现在「打开方式」里） ----------
const ASSOC_PROGID = 'QianShuiJing.Document';
// 只有「文档类」类型登记进系统「打开方式」（不抢默认程序）：故意比 OPENABLE_EXTS 窄，
// 否则 .js / .bat / .ps1 这类开发文件的右键菜单也会被塞进阅读器，纯添乱。
// 真源仍是 scripts/exts.js —— 这里是「文档类」白名单，与之取交集，改 exts.js 时自动同步。
const DOC_CLASS = ['.txt', '.md', '.epub', '.pdf', '.docx'];
const ASSOC_EXTS = READER_EXTS.filter(e => DOC_CLASS.includes(e));

ipcMain.handle('shell:associate', async (e) => {
  if (!isTrustedUI(e)) return { ok: false, error: TT('来源不可信','Untrusted sender') };
  if (process.platform !== 'win32') return { ok: false, error: TT('仅支持 Windows','Windows only') };
  const exe = process.execPath;
  const run = (args) => execFileSync('reg', args, { windowsHide: true, stdio: 'pipe' });
  try {
    run(['add', 'HKCU\\Software\\Classes\\' + ASSOC_PROGID, '/ve', '/d', TT('浅水鲸文档','Shallow Whale Document'), '/f']);
    run(['add', 'HKCU\\Software\\Classes\\' + ASSOC_PROGID + '\\DefaultIcon', '/ve', '/d', '"' + exe + '",0', '/f']);
    run(['add', 'HKCU\\Software\\Classes\\' + ASSOC_PROGID + '\\shell\\open\\command', '/ve', '/d', '"' + exe + '" "%1"', '/f']);
    for (const ext of ASSOC_EXTS) {
      run(['add', 'HKCU\\Software\\Classes\\' + ext + '\\OpenWithProgids', '/v', ASSOC_PROGID, '/t', 'REG_NONE', '/d', '', '/f']);
    }
    return { ok: true, exts: ASSOC_EXTS, exe };
  } catch (err) {
    logToFile('error', 'associate failed: ' + ((err && err.message) || err));
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

ipcMain.handle('shell:openDefaultApps', async (e) => {
  if (!isTrustedUI(e)) return { ok: false, error: TT('来源不可信','Untrusted sender') };
  if (process.platform !== 'win32') return { ok: false, error: TT('仅 Windows 支持跳转默认应用设置','Jumping to the default-apps settings is Windows-only') };
  try { await shell.openExternal('ms-settings:defaultapps'); return { ok: true }; }
  catch (err) { return { ok: false, error: (err && err.message) || String(err) }; }
});

ipcMain.handle('shell:openExternal', async (e, url) => {
  try {
    const target = String(url || '');
    /* 🟥 V4.3.48（R7-1，真缺陷）：白名单从「只有 http/https」放宽到「http/https + ms-settings:」。
       起因：设置面板「去系统装更多语音…」按钮传的是 `ms-settings:speech`，被旧白名单整条拒掉，
       而渲染层当时既不 await 也不看返回值 —— 那条引导功能**从 V4.3.29 上线起就没生效过**，
       用户点下去毫无反应（端到端实证见 `asar-src/_r7_ext_open.js`）。
       ms-settings: 只会把**系统设置应用**拉到指定页（不能执行代码、不能读磁盘），
       与 `shell:openDefaultApps` 早已放行的 `ms-settings:defaultapps` 同族。
       ⚠️ 这是**封闭列举**，不是"放开协议校验"：javascript: / file: / data: / vbscript: 等
       一律继续拒绝，`_r7_ext_open.js` 里有 4 条回归锁盯着（防止下次有人顺手把边界拆了）。 */
    /* 🟥 V4.3.97（代码审查 S-4）：原来只按「协议前缀」匹配，把**整个**
       ms-settings: 命名空间放行 —— 被攻陷的渲染层能把系统设置拉到任意页。
       收敛成产品实际只用到的两条封闭枚举；http/https 仍是"打开外链"的正常能力
       （openExternal 不做内容解析，不执行对方代码）。 */
    if (!isTrustedUI(e)) return { ok: false, error: TT('来源不可信','Untrusted sender') };
    const msOk = /^ms-settings:(speech|defaultapps)$/i.test(target);
    const webOk = /^https?:\/\//i.test(target);
    if (!msOk && !webOk) {
      return { ok: false, error: TT('仅支持 http/https 与系统设置页','Only http/https and ms-settings pages are supported') };
    }
    await shell.openExternal(target);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

// ---------- 从系统打开文件（双击 / 拖到图标上） ----------
// 从系统双击 / 拖到图标上打开：凡是能加载的类型一律接受（真源 scripts/exts.js）。
const OPENABLE_EXTS = READER_EXTS;

function pickOpenableFromArgv(argv) {
  const list = Array.isArray(argv) ? argv.slice(1) : [];
  for (const a of list) {
    if (!a || a.startsWith('-')) continue;
    try {
      if (!fs.existsSync(a)) continue;
      if (!fs.statSync(a).isFile()) continue;
      if (!OPENABLE_EXTS.includes(path.extname(a).toLowerCase())) continue;
      return a;
    } catch (e) {}
  }
  return null;
}

function openFileFromOs(filePath) {
  if (!filePath || !mainWindow || mainWindow.isDestroyed()) return;
  /* 🟥 V4.3.31：「拖入 / 系统双击打开一本书」走的正是这里，而它原来是同步 readFileSync ——
     几十 MB 的 epub / pdf 会把主进程（所有窗口的拖动与事件都归它管）整个按住，界面当场僵住。
     改成异步读；读完后**重新取一次窗口引用**再发（读盘期间用户完全可能已经把窗口关了）。
     传输格式仍是 base64（渲染端 atob 解成 Uint8Array），不动协议：换二进制传输的收益
     抵不上改协议的风险。 */
  fs.promises.readFile(filePath).then(data => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    safeSend(mainWindow, 'open:file', { name: path.basename(filePath), data: data.toString('base64') });
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.setOpacity(1);
    mainWindow.focus();
    /* 🟥 V4.3.72：argv 里的路径可能带重复分隔符（实测 C://Users//<用户名>//…），
       读盘没问题（Windows 容忍），但日志里的路径没法直接复制去资源管理器打开。 */
    logToFile('info', 'opened from system: ' + path.normalize(filePath));
  }).catch(err => {
    logToFile('error', 'open file failed: ' + ((err && err.message) || err));
  });
}

// ---------- 诊断信息与反馈包 ----------
