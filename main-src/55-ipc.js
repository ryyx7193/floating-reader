ipcMain.on('window:hide', () => { if (mainWindow) mainWindow.hide(); });
/* 🆕 V4.3.84：标题栏「最小化」按钮。与 window:hide 是两条不同的语义（隐藏 vs 最小化到任务栏），
   别合并 —— 隐藏要从托盘叫回，最小化点任务栏就回来。
   🟥 实测结论（V4.3.84 用 _v484_min_diag.js 量的，别凭直觉改回去）：
     ① 全屏窗口上 `minimize()` **直接有效**（166ms 落地），**不需要**先退全屏。
        最初按"Windows 不落地"的猜测写了「先退全屏再最小化」，那套逻辑反而有竞态：
        leave-full-screen 与 300ms 兜底谁先到不确定，结果是"最小化时窗口还是全屏尺寸"。
     ② 还原后窗口回到**原状态**（全屏仍是全屏）—— 这是对的，不丢阅读现场，
        与全屏视频播放器的行为一致。
   最小化之后该做的事（推 window:visibility=false 停朗读/自动滚动、隐藏面板窗、
   联动最小化目标窗口）已由 createWindow 里的 'minimize' 监听统一处理，这里不重复。 */
ipcMain.on('window:minimize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try { mainWindow.minimize(); }
  catch (e) { console.warn('minimize failed: ' + errTextOf(e)); }
});
/* 🖥 V4.3.53：渲染层那条"双击标题栏"的路（标题栏里 no-drag 的部分，如 📖阅读器 文字）
   从这里进来，与主进程的 WM_NCLBUTTONDBLCLK 钩子汇流到同一个 switch
   （规则 34：同一动作多个入口 ⇒ 收口成单一 helper）。 */
ipcMain.on('win:fullscreen', () => toggleMainFullScreen());
ipcMain.on('window:show', () => {
  if (mainWindow) { mainWindow.setOpacity(1); mainWindow.show(); mainWindow.focus(); }
});
ipcMain.on('window:opacity', (e, v) => setAllOpacity(v));
/* 🆕 V4.3.79：置顶收口 —— 专注模式（screen-saver 级，盖住一切）与伴随模式（floating 级）
   两个来源任一为真即置顶，避免「关专注把伴随置顶也关掉」「目标全屏让位被专注顶回」互相覆盖。 */
let topFocus = false;
let companionTopActive = false;
function applyAlwaysOnTop() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (topFocus) mainWindow.setAlwaysOnTop(true, 'screen-saver');
    else if (companionTopActive) mainWindow.setAlwaysOnTop(true, 'floating');
    else mainWindow.setAlwaysOnTop(false);
  } catch (err) { try { mainWindow.setAlwaysOnTop(topFocus || companionTopActive); } catch (e2) {} }
}
ipcMain.on('window:always-on-top', (e, v) => {
  topFocus = !!v;   /* 🆕 V4.3.79：只记意图，实际级别由收口统一判（伴随/全屏让位不覆盖专注） */
  applyAlwaysOnTop();
});
ipcMain.on('window:min-size', (e, size) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  /* V4.3.33：补上限。原先只有下限 —— 渲染层传个极大值就能把最小尺寸顶到不可用，
     之后窗口再也缩不小，只能重启恢复。上限取当前主显示器的工作区尺寸。 */
  /* V4.3.33b：上限要取**窗口所在**显示器的工作区，不能用主屏 ——
     主窗停在较小的副屏上时，拿主屏尺寸当上限会让它永远缩不到适配的大小。 */
  const wa = screen.getDisplayMatching(mainWindow.getBounds()).workAreaSize;
  const w = Math.min(wa.width, Math.max(160, Math.round(Number(size && size.width) || 360)));
  const h = Math.min(wa.height, Math.max(90, Math.round(Number(size && size.height) || 260)));
  mainWindow.setMinimumSize(w, h);
});
/* 🟥 V4.3.49（R8-2）：`on` → `handle`。改键**会失败**（新键被别的程序占用），
   而 `ipcMain.on` 是单向的 —— 主进程即使知道失败也回不去，渲染层只能一直显示
   那个注册不上的键。改成 invoke，把真实生效的键位如实交回渲染层。 */
ipcMain.handle('shortcut:set', (e, raw) => { if (!isTrustedUI(e)) return false; return registerHideShortcut(toAccelerator(raw)); });
ipcMain.on('fgwatch:set', (e, cfg) => { if (isTrustedUI(e)) setForegroundWatch(cfg); });
/* 🆕 V4.3.53（R12-2）伴随模式：开关 / 目标程序 / 判定模式 / 贴边位置 一次交齐 ——
   观察器把目标名单**烧进了命令行**，所以改任何一项都走整条重启（setCompanion 内部判等）。 */
ipcMain.on('companion:set', (e, cfg) => { if (!isTrustedUI(e)) return; try { setCompanion(cfg); } catch (err) { reportCompanionStatus(false, 'set-failed', errTextOf(err)); } });
/* 「重新贴边」用 handle/invoke：渲染层要拿到**真实结果**再决定提示什么
   （贴边位置选的是「关闭」时没有贴边可恢复，得如实告诉用户去选一个位置）。 */
ipcMain.handle('companion:redock', () => {
  try { return resumeCompanionDock(); } catch (err) { return { edge: 'off', active: false, resumed: false, error: errTextOf(err) }; }
});
/* 🆕 V4.3.54：检测阅读器正下方是哪个应用 —— handle/invoke（规则 41：渲染层要按真实结果出声） */
ipcMain.handle('companion:detect', () => detectCompanionApp());
/* 🆕 V4.3.94：跟随设置「重置」→ 只重置吸色（清缓存 + 重新采样），不动其它跟随配置 */
ipcMain.on('companion:tint-reset', () => { try { resetCompanionTintState(); } catch (err) { logToFile('error', '重置吸色失败: ' + errTextOf(err)); } });
ipcMain.on('content:protect', (e, on) => { if (isTrustedUI(e)) setContentProtection(on); });
ipcMain.handle('content:protect-get', () => contentProtectOn);   // 供冒烟断言主进程侧真实状态
// 能力自检：渲染层据此如实提示用户「本机防截屏到底管不管用」，而不是让人以为一定生效
ipcMain.handle('app:capabilities', () => ({
  platform: process.platform,
  protect: protectInfo(),        // { level: 'full' | 'partial' | 'none' | 'unknown', note: '...' }（每次取用按当前语言生成）
  protectOn: contentProtectOn,
  /* 🆕 V4.3.23：设备指纹（平台 + 系统版本）。渲染层用它判断「上次的实测结论还算不算数」——
     换电脑 / 换系统后指纹变了，旧结论作废，必须重新实测，避免拿别的机器的结论误导用户。 */
  protectFp: protectFingerprint()
}));
ipcMain.handle('app:version', () => APP_VERSION);
// 🛡 脱监自检：端到端实测本机防截屏到底管不管用（用户问「怎么知道有没有起效」的答案）
/* V4.3.33 修：自检每次都会新建一个品红测试窗 + 两次全屏抓屏（项目注释自述单次约 540ms），
   原先既无互斥也无冷却 —— 被反复触发会堆测试窗并把主进程拖住（本地 DoS）。
   加「进行中」互斥：重复请求直接回一条明确说明，不再叠加新的实测。 */
let protectSelfTestRunning = false;
ipcMain.handle('content:selftest', async () => {
  if (protectSelfTestRunning) {
    return { verdict: 'unknown', level: protectInfo().level, note: TT('自检正在进行中，请等它跑完再看结果','Self-test is still running — check again when it finishes'), platform: process.platform };
  }
  protectSelfTestRunning = true;
  try { return await runProtectSelfTest(); }
  finally { protectSelfTestRunning = false; }
});

ipcMain.on('app:quit', (e) => { if (!isTrustedUI(e)) return; app.isQuitting = true; app.quit(); });

ipcMain.on('window:drag-start', (e, p) => startDrag(p && p.x, p && p.y));
ipcMain.on('window:drag-move', (e, p) => { if (p) dragMoveTo(Number(p.x), Number(p.y)); });
ipcMain.on('window:drag-end', stopDrag);
ipcMain.on('window:resize-start', () => {
  if (mainWindow) {
    const b = mainWindow.getBounds();
    resizeBase = { x: b.x, y: b.y, width: b.width, height: b.height };
  }
});
ipcMain.on('window:resize-move', (e, p) => {
  if (!mainWindow || !resizeBase) return;
  const dx = Number(p && p.dx) || 0;
  const dy = Number(p && p.dy) || 0;
  const min = mainWindow.getMinimumSize();
  const w = Math.max(min[0], resizeBase.width + Math.round(dx));
  const h = Math.max(min[1], resizeBase.height + Math.round(dy));
  mainWindow.setBounds({ x: resizeBase.x, y: resizeBase.y, width: w, height: h });
});
/* 🟥 V4.3.97 第 3 轮（P2，真缺陷）：原来直接传函数引用，Electron 把 `event`
   塞进首个形参 opts，渲染层传的 {x} 成第二参被忽略 ⇒ pickScreenColor 里
   Number.isFinite(opts.x) 恒 false，采样点恒为窗口中线 —— V4.3.86「取样点跟随圆点」
   从上线起就是静默失效。与下一行 color:pick-at 的写法保持一致。 */
ipcMain.handle('color:pick', (e, opts) => pickScreenColor(opts));
ipcMain.handle('color:pick-at', (e, point) => pickColorAt(point));

/* 🛡 V4.3.43（真缺陷 A）：本地文本解码统一走 scripts/encoding.js 的 decodeBuffer —— 唯一真源。
   渲染层此前自写了一份 ['UTF-8','GBK','big5'] + fatal 的循环，它没有 BOM 判定、没有无 BOM
   UTF-16 判定、没有「中文反证」投票。实测：Big5 繁体、UTF-16 中文（带不带 BOM 都算）的 txt
   打开即乱码；同一批字节交给 decodeBuffer 全部解对（对照证据 work/_v443_decode_gap.js）。
   本通道**只做解码**：不碰磁盘、不写文件、入参只能是字节序列，且有体积上限。 */
const MAX_TEXT_BYTES = 64 * 1024 * 1024;
ipcMain.handle('text:decode', async (e, bytes) => {
  try {
    if (!bytes) return { ok: true, text: '' };
    let buf = null;
    if (Buffer.isBuffer(bytes)) buf = bytes;
    else if (bytes instanceof ArrayBuffer) buf = Buffer.from(bytes);
    else if (ArrayBuffer.isView(bytes)) buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    else return { ok: false, error: 'bad payload' };
    if (buf.length > MAX_TEXT_BYTES) return { ok: false, error: 'too large' };
    return { ok: true, text: decodeBuffer(buf) };
  } catch (err) {
    logToFile('error', 'text decode failed: ' + ((err && err.message) || err));
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

/* 🟥 V4.3.97（代码审查 S-7）：defaultPath 原来原样来自渲染层。
   被攻陷的渲染层可把它预填到启动目录/系统目录，诱导用户一键落盘或选中敏感文件。
   收敛：只接受「纯文件名」或「用户目录内的绝对路径」；含 .. 段或指向用户目录之外一律丢弃
   （对话框会退回自己的默认目录，正常导出/导入功能不受影响）。 */
function safeDialogPath(raw) {
  try {
    const p = String(raw || '').trim();
    if (!p) return undefined;
    if (/(^|[\\/])\.\.([\\/]|$)/.test(p)) return undefined;
    /* 🟥 V4.3.97（第 2 轮复审）：Windows 路径大小写不敏感，原来的 startsWith 比较
       会把 c:\users\ryyx\desktop\x.txt 误判成"目录外"丢弃；另外只放行 userData+home
       会把用户重定向到 D 盘/网络的"上次保存路径"一律丢。改用 path.relative 判越界
       （它自己处理盘符大小写与 ..），并把桌面/文档/下载一并纳入允许根。 */
    const roots = ['userData', 'home', 'desktop', 'documents', 'downloads']
      .map(k => { try { return path.normalize(app.getPath(k)); } catch (err) { return null; } })
      .filter(Boolean);
    const isAbs = path.isAbsolute(p) || /^[a-zA-Z]:[\/]/.test(p);
    if (!isAbs) {
      if (/[\\\/]/.test(p)) return undefined;            // 相对路径只许纯文件名（含 Windows 反斜杠）
      return p;
    }
    const abs = path.normalize(path.resolve(p));
    const under = (root) => {
      const rel = path.relative(root, abs);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    };
    if (!roots.some(under)) return undefined;
    return abs;
  } catch (err) { return undefined; }
}

// 文件对话框（主进程统一处理，避免子窗口调用系统弹窗时闪退）
ipcMain.handle('file:open-text', async (e, opts) => {
  if (!isTrustedUI(e)) return { canceled: true };
  try {
    const r = await dialog.showOpenDialog({
      title: (opts && opts.title) || TT('选择文件','Choose a file'),
      defaultPath: safeDialogPath(opts && opts.defaultPath),
      filters: (opts && opts.filters) || [{ name: TT('所有文件','All files'), extensions: ['*'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths || !r.filePaths.length) return { canceled: true };
    const fp = r.filePaths[0];
    /* 🟥 V4.3.31：改异步读。原来是同步 readFileSync，用户误选一个大文件（几十 MB）就会把
       **主进程**整个按住 —— 主进程同时负责所有窗口的移动和事件派发，表现就是整个界面僵住。
       解码也一并交给 decodeBuffer（原来只认 UTF-8 / GB18030，Big5 与带 BOM 的 UTF-16 都会乱码）。 */
    /* 🛡 V4.3.82 审查补：加大小上限。原先用户误选一个几百 MB 的文件，readFile 会把整块读进
       主进程内存、紧接着 decodeBuffer 同步解码 —— 主进程同时负责所有窗口的移动与事件派发，
       表现是整个界面僵死甚至 OOM。50MB 足够覆盖任何正常 txt/epub 文本导入。 */
    const MAX_OPEN = 50 * 1024 * 1024;
    let st = null;
    try { st = await fs.promises.stat(fp); } catch (e) {}
    if (st && st.size > MAX_OPEN) {
      return { canceled: false, error: TT('文件过大（超过 50 MB），请先拆分后再导入', 'File too large (over 50 MB); please split it first') };
    }
    const buf = await fs.promises.readFile(fp);
    return { canceled: false, path: fp, name: path.basename(fp), content: decodeBuffer(buf) };
  } catch (err) {
    logToFile('error', 'file open failed: ' + ((err && err.stack) || err));
    return { canceled: false, error: (err && err.message) || String(err) };
  }
});

ipcMain.handle('file:save-text', async (e, opts) => {
  if (!isTrustedUI(e)) return { canceled: true };
  try {
    const r = await dialog.showSaveDialog({
      title: (opts && opts.title) || TT('保存文件','Save file'),
      defaultPath: safeDialogPath(opts && opts.defaultPath),
      filters: (opts && opts.filters) || [{ name: TT('所有文件','All files'), extensions: ['*'] }]
    });
    if (r.canceled || !r.filePath) return { canceled: true };
    /* V4.3.31：写也走异步。导出阅读数据 / 书架快照在书多的时候是 MB 级的，
       同步写会把主进程按住（用户看到的是「点导出后界面卡一下」）。 */
    await fs.promises.writeFile(r.filePath, String((opts && opts.content) || ''), 'utf8');
    return { canceled: false, path: r.filePath };
  } catch (err) {
    logToFile('error', 'file save failed: ' + ((err && err.stack) || err));
    return { canceled: false, error: (err && err.message) || String(err) };
  }
});

ipcMain.handle('log:tail', async (e, count) => {
  /* 🟥 V4.3.97（代码审查 S-9）：preload-panel.js:54 把 tailLog 暴露给了所有面板窗，
     而这里原来不看 e.sender 就返回**整份 app.log**（本机路径、进程名、历史 URL；
     URL query 已由 lib/log.js 的 S-1 统一打码）。设置面板确实要用它看日志，
     所以口径是「主窗 + 已登记面板」，不是只放行主窗。 */
  if (!isTrustedUI(e)) return { ok: false, error: TT('来源不可信','Untrusted sender') };
  try {
    const fp = path.join(app.getPath('userData'), 'logs', 'app.log');
    if (!fs.existsSync(fp)) return { ok: false, error: TT('暂无日志文件','No log file yet') };
    // 异步读：app.log 可长到数 MB，readFileSync 会阻塞主进程一整拍
    const text = await fs.promises.readFile(fp, 'utf8');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const n = Math.max(10, Math.min(2000, Number(count) || 200));
    return { ok: true, path: fp, lines: lines.slice(-n) };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

ipcMain.handle('log:open', async () => {
  try {
    const dir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(dir);
    return { ok: true, path: dir };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
});

// ---------- 更新检查（读取版本清单，不做静默安装） ----------
