// 本软件只渲染本地页面与纯文本：① 禁止页面新建窗口（window.open / target=_blank）
// ② 禁止跳转到任何非 file: 地址（外链改由系统浏览器打开，且仅 http/https）
// ③ 拒绝一切权限请求（摄像头/麦克风/定位等）—— 统一兜底，覆盖主窗与所有小窗
/* 🟥 V4.3.48（R7-2）：`shell.openExternal` 返回的是 **Promise** ——
   `try{ shell.openExternal(u) }catch(e){}` 里的 catch 是**死的**，永远抓不到拒绝。
   实测（`_r7_ext_open.js`）：让底层 openExternal 拒绝，日志里出现一条 `[unhandled]`，
   而这里的 catch 一行都没执行 —— 代码却"以为自己处理了"。这正是 V4.3.43 缺陷 D 的同族形态。
   改成 async + await，并在 catch 里留痕（硬规则：被 try/catch 包住的异步，catch 必须写日志）。 */
async function openSafeExternal(url){
  const u = String(url || '');
  if (!/^https?:/i.test(u)) return;
  try { await shell.openExternal(u); }
  catch (e) { try { logToFile('error', 'openSafeExternal failed: ' + u + ' · ' + ((e && e.message) || e)); } catch (e2) {} }
}
app.on('web-contents-created', (e, wc) => {
  try {
    wc.setWindowOpenHandler(({ url }) => { openSafeExternal(url); return { action: 'deny' }; });
    /* 🟥 V4.3.97 第 3 轮（P1，实测复现）：S-2 第一版只按**文件名后缀**放行，
       实测 `file://evilhost/index.html`、`file:///C:/Windows/System32/index.html`、
       `file:///C:/Users/RYYX/Downloads/index.html` 全部返回 true ⇒ 白名单形同虚设，
       任意本地/UNC 同名 HTML 都能加载并沿用主窗 preload 的完整 readerAPI。
       现在改为：① 必须是 file: 且 hostname 为空（挡 UNC/远程主机）；
       ② 解码后的绝对路径必须**落在本应用目录内**且文件名恰为 index.html / panel.html。
       ⚠️ 不会影响正常启动：页面由 loadFile 加载，不触发 will-navigate。 */
    const APP_DIR = path.resolve(__dirname);
    const isOwnPage = (u) => {
      try {
        const parsed = new URL(String(u));
        if (parsed.protocol !== 'file:' || parsed.hostname) return false;
        let p = decodeURIComponent(parsed.pathname).replace(/\\/g, '/');
        if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);      // Windows: /C:/… → C:/…
        const abs = path.resolve(p);
        if (path.dirname(abs).toLowerCase() !== APP_DIR.toLowerCase()) return false;
        const base = path.basename(abs).toLowerCase();
        return base === 'index.html' || base === 'panel.html';
      } catch (e) { return false; }
    };
    /* V4.3.97：两个事件的处理体原来逐字重复，收口成一个 onNav。
       ⚠️ 两个**事件名**必须分别注册 —— V4.3.33 曾把 `will-redirect` 写成
       `will-redirect-navigation`，结果 HTTP 重定向导航完全没被拦。 */
    const onNav = (ev, url) => { if (!isOwnPage(url)) { ev.preventDefault(); openSafeExternal(url); } };
    wc.on('will-navigate', onNav);
    wc.on('will-redirect', onNav);
  } catch (e) {}
});
/* 🟥 V4.3.43 修复（真缺陷 D）：原先这一行在**模块顶层**直接注册权限兜底 ——

     try { session.defaultSession.setPermissionRequestHandler((wc, p, cb) => cb(false)); } catch (e) {}

   但 Electron 在 app ready 之前访问 `session.defaultSession` 会**直接抛错**
   （"Session can only be received when app is ready"，实测证据 work/_v443_session_probe.js：
   顶层 THROW / whenReady 之后调用成功）。异常被 catch 静默吞掉，于是上面 ③ 声称的
   「拒绝一切权限请求（摄像头/麦克风/定位等）—— 统一兜底」**从未生效过**，
   Electron 回落到默认行为「自动批准所有许可请求」。改为函数，由 app.whenReady() 内部
   **创建窗口之前**调用（窗口一建出来就可能收到权限请求，注册晚了同样会漏）。 */
function setupPermissionGuard() {
  try {
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));
    /* 只装 request 侧会漏掉 navigator.permissions.query() 这条「只查不请求」的路径。 */
    if (typeof session.defaultSession.setPermissionCheckHandler === 'function') {
      session.defaultSession.setPermissionCheckHandler(() => false);
    }
    logToFile('info', 'permission guard installed (all permission requests denied)');
  } catch (e) {
    // 🟥 绝不能静默 —— 「看起来装了、其实没装」正是本次缺陷的成因
    try { logToFile('error', 'permission guard install failed: ' + ((e && e.message) || e)); } catch (err) {}
  }
}

// 版本号唯一真源：package.json。渲染层拿不到 fs，统一走 app:version 通道读取，
// 避免「标题 / 书架导出 / 数据导出 / 启动日志」四处硬编码不同步。
const APP_VERSION = (function () {
  try { return require('./package.json').version || '0.0.0'; } catch (e) { return '0.0.0'; }
})();

/* 🧩 V4.3.79（F5/S3 模块化第二刀）：便携模式整体搬到 lib/portable.js。
   ⚠️ 必须在 app ready / Chromium 打库之前执行 —— 下面这一行就是那个时机，别挪位置。 */
const { PORTABLE_FLAG, initPortable } = require('./lib/portable.js');
const PORTABLE_ACTIVE = initPortable();   /* true = 便携真的生效（诊断信息据此如实上报） */

let mainWindow = null;
let tray = null;
let dragInterval = null;
let dragBase = null;
let cursorBase = null;
let resizeBase = null;
let dragPanelBase = null;
let draggingWindow = false;
let dragLastEventAt = 0;      // 最近一次「渲染进程拖动事件」的到达时间（心跳兜底用）
let dragStartupUntil = 0;     // 起手加速截止时间：这段时间主进程 16ms 轮询光标直接驱动（见 startDrag）
let dragTick = 0;             // 面板同步降频计数（每 2 帧同步一次）

// 📑 V4.3.29：新增 'bookmarks'（书签列表）—— 工具条「书签」按钮取消后，列表升级为独立面板
const PANEL_TYPES = ['toolbar', 'settings', 'toc', 'search', 'source', 'shelf', 'bookmarks', 'annot'];
const panels = {};            // type -> BrowserWindow
const panelOpen = { toolbar: false, settings: false, toc: false, search: false, source: false, shelf: false };
const panelByWebContents = new Map(); // webContents.id -> type

/* 🟥 V4.3.97（代码审查 S-3b）：IPC 来源校验的**唯一入口**。
   preload.js 与 preload-panel.js 都暴露了 openPanel / tailLog / 文件对话框，
   所以口径不是"只放行主窗"，而是「主窗 + 主进程登记过的面板窗」——
   面板确实会开别的面板（书架→目录）、读日志（设置面板），一刀切放行主窗会砸功能。
   除此之外的任何 webContents（新开的、被注入的）一律不信。
   ⚠️ mainWindow 声明在 30-window-tray.js，但本函数只在 IPC 回调运行时求值，
      那时整份 main.js 已拼接执行完毕，不存在 TDZ。 */
function isTrustedUI(e) {
  try {
    const id = e && e.sender && e.sender.id;
    if (typeof id !== 'number') return false;
    if (mainWindow && !mainWindow.isDestroyed() && id === mainWindow.webContents.id) return true;
    return panelByWebContents.has(id);
  } catch (err) { return false; }
}
const panelStack = [];        // 面板打开顺序，后进先出关闭
const panelUserMoved = {};    // type -> 用户是否手动拖动过
let autoPlacing = false;      // 程序化摆放期间忽略 move 事件
let lastMainBounds = null;    // 用于计算主窗口位移

const DEFAULT_HIDE_SHORTCUT = 'CommandOrControl+Shift+H';
let currentHideAccel = DEFAULT_HIDE_SHORTCUT;
const DEFAULT_DISGUISE_SHORTCUT = 'CommandOrControl+Shift+B';
let currentDisguiseAccel = DEFAULT_DISGUISE_SHORTCUT;

// ---------- 日志（实现在 lib/log.js）与备份 ----------
