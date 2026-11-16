const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, nativeImage, desktopCapturer, screen, safeStorage, dialog, shell, clipboard, crashReporter, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execFileSync, spawn } = require('child_process');
const net = require('net');   // V4.3.33b：isBlockedHost 判 IPv6 形态用（Node 内置，不是新依赖）
const dns = require('dns');   // V4.3.35：httpGet 连接前解析用（防 DNS 重绑定），Node 内置
let cheerio = null;
try { cheerio = require('cheerio'); } catch (e) {}
let iconv = null;
try { iconv = require('iconv-lite'); } catch (e) {}
// 受支持的文档扩展名：与渲染层共用同一份（scripts/exts.js），避免多处白名单走偏
const READER_EXTS = require('./scripts/exts.js');
/* 🧩 V4.3.79（F5/S3 模块化第一刀）：日志三件套搬到 lib/log.js —— 零外部状态，行为逐字一致 */
const { safeStringify, logToFile, patchConsole } = require('./lib/log.js');
// 文本解码的唯一真源（BOM / UTF-16 / 严格 UTF-8 / GB18030 vs Big5 投票），本地文件与书源页共用
const { decodeBuffer } = require('./scripts/encoding.js');
/* 🟥 V4.3.45（R4-4）：导出文件名里的日期必须是**本地日期**，唯一真源是 scripts/util.js
   （渲染层同一个文件挂成 window.ReaderUtil，主进程这里 require 到的是**同一份实现**）。
   原先主进程两处导出用 `toISOString()`（UTC），北京时间 00:00–08:00 会差一天。 */
const { localDateKey } = require('./scripts/util.js');
/* 🟥 V4.3.45（R4-3）：主进程界面语言的**唯一开关**。
   渲染层启动与每次切语言都会通过 preload 的 setLang 把当前语言发过来（IPC `app:lang`），
   这里用 TT(zh,en) 就地取词 —— 与渲染层 panel.js 的 PT(zh,en) 同一形态，不另立一套词表。
   覆盖范围：托盘菜单 / 系统对话框标题与过滤器名 / 回传给渲染层显示的 error 串 /
   防截屏能力说明（note）/ 站点判定证据 / 诊断文本 / 投屏与远控提示。
   注：**日志文件仍用中文**（logToFile 的内容面向售后检索，口径不跟着界面语言漂）；
   网页匹配用的中文关键词表（SITE_BOOK_MARKERS、CN_DIGITS）也不是界面文案，同样不动。
   ⚠️ 这两行必须留在模块最顶部：下面有模块级立即调用 `detectProtectSupport()` 就要用 TT，
   把 `let` 放到文件后半部分会踩 TDZ，程序直接起不来。 */
let APP_LANG = 'zh';
function TT(zh, en) { return APP_LANG === 'en' ? en : zh; }

// ===== 🛡 安全加固（V4.3.13 全局安全审查）=====
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
       `file:///C:/Users/*/Downloads/index.html` 全部返回 true ⇒ 白名单形同虚设，
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
patchConsole();   /* 早于一切业务代码：之后的 console 输出都会落盘 */

function safeSend(target, channel) {
  try {
    if (!target) return false;
    if (target.isDestroyed && target.isDestroyed()) return false;
    const wc = target.webContents || target;
    if (!wc || (wc.isDestroyed && wc.isDestroyed())) return false;
    const args = Array.prototype.slice.call(arguments, 2);
    wc.send.apply(wc, [channel].concat(args));
    return true;
  } catch (err) {
    if (!err || err.code !== 'EPIPE') {
      try { logToFile('error', 'safeSend failed: ' + ((err && err.stack) || err)); } catch (e) {}
    }
    return false;
  }
}

process.on('uncaughtException', function (err) {
  try {
    const code = err && err.code;
    const msg = err && (err.message || err.stack || String(err));
    if (code === 'EPIPE' || /broken pipe/i.test(String(msg))) {
      logToFile('suppressed', 'suppressed EPIPE/broken-pipe exception');
      return;
    }
    logToFile('uncaught', err && err.stack ? err.stack : String(err));
  } catch (e) {}
});
process.on('unhandledRejection', function (reason) {
  try {
    const msg = reason && (reason.message || reason.stack || safeStringify(reason));
    // V4.3.33：补括号。原写法靠 && 优先级「碰巧」能用，但意图不清，容易被后人改错
    if ((reason && reason.code === 'EPIPE') || /broken pipe/i.test(String(msg))) {
      logToFile('suppressed', 'suppressed EPIPE/broken-pipe rejection');
      return;
    }
    logToFile('unhandled', reason && reason.stack ? reason.stack : safeStringify(reason));
  } catch (e) {}
});

function backupDir() {
  return path.join(app.getPath('userData'), 'backup');
}

function listBackups() {
  try {
    return fs.readdirSync(backupDir()).filter(function (f) { return /^backup-.*\.json$/.test(f); }).sort().reverse();
  } catch (e) {
    return [];
  }
}

function cryptoKeyFile() {
  return path.join(app.getPath('userData'), 'keystore.dat');
}

function getOrCreateCryptoKey() {
  try {
    /* V4.3.33 修（H3）：把「本机不支持加密」与「密钥文件解不开」分成两件事。
       原先两者都 return null —— 前者是对的（降级明文并提示），后者是错的：
       文件在、加密可用、却解不开（换 Windows 账户 / 重装 / 文件损坏），
       这时函数**永远**返回 null，之后所有新正文都静默以明文落库，而且再也不会恢复。
       注意：这种情况下它保护的旧密文**本来就已经解不开了**（密钥拿不到），
       所以「重建密钥」不会额外损失任何数据。 */
    if (!safeStorage.isEncryptionAvailable()) return null;
    const fp = cryptoKeyFile();
    if (fs.existsSync(fp)) {
      try {
        const dec = safeStorage.decryptString(fs.readFileSync(fp));
        if (dec) return dec;
        throw new Error(TT('keystore 解密结果为空','keystore decryption returned empty'));
      } catch (decErr) {
        /* 改名留档后再重建 —— 旧密钥**不销毁**（万一以后 DPAPI 环境恢复还能抢救），
           同时加密能力立刻恢复，不再无限期静默降级成明文。
           旧正文打不开这件事，渲染层已有 chaptersLocked 提示兜着（app.js 的 noteChaptersLocked）。 */
        const bak = fp + '.broken-' + new Date().toISOString().replace(/[:.]/g, '-');
        try {
          fs.renameSync(fp, bak);
          logToFile('error', 'keystore 解不开，已留档为 ' + bak + ' 并重建新密钥（旧正文将不可解密）：' + (decErr && decErr.message));
        } catch (e2) {
          logToFile('error', 'keystore 解不开、且改名留档失败，保持只读不动：' + (e2 && e2.message));
          return null;
        }
      }
    }
    const key = crypto.randomBytes(32).toString('base64');
    fs.writeFileSync(fp, safeStorage.encryptString(key));
    return key;
  } catch (err) {
    logToFile('error', 'crypto key init failed: ' + (err && err.message ? err.message : err));
    return null;
  }
}

function exportLogsFile() {
  const src = path.join(app.getPath('userData'), 'logs', 'app.log');
  if (!fs.existsSync(src)) return Promise.resolve({ ok: false, error: 'no-log' });
  const defaultName = '浅水鲸日志-' + localDateKey() + '.log';
  return dialog.showSaveDialog({
    title: TT('导出日志','Export logs'),
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: TT('日志文件','Log files'), extensions: ['log', 'txt'] }]
  }).then(function (r) {
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.copyFileSync(src, r.filePath);
    return { ok: true, path: r.filePath };
  });
}

function trayIcon() {
  try {
    const img = nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, 'assets', 'tray.png')));
    // macOS 托盘使用模板图，跟随系统深浅色
    if (process.platform === 'darwin') {
      try { img.setTemplateImage(true); } catch (e) {}
    }
    return img;
  } catch (e) {
    console.error('加载托盘图标失败', e);
    return nativeImage.createEmpty();
  }
}

function toAccelerator(s) {
  return String(s || '').split('+').map(p => {
    if (p === 'Ctrl') return 'CommandOrControl';
    if (p === 'Meta') return 'Super';
    if (p === '←') return 'Left';
    if (p === '→') return 'Right';
    if (p === '↑') return 'Up';
    if (p === '↓') return 'Down';
    return p;
  }).join('+');
}

function notifyMainWindow(channel, payload) {
  safeSend(mainWindow, channel, payload);
}

// ---------- 内容保护（防截屏 / 防录屏）----------
// Windows 底层是 SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)：窗口照常显示，
// 但一切「捕获屏幕」的手段（Win+Shift+S、QQ/微信截图、录屏、远程协助）拿到的这块区域都是黑的。
// 能力边界（别过度承诺）：
//   · 需要 Win10 2004(build 19041) 及以上；更老系统只退化成 WDA_MONITOR，只拦得住一部分方式
//   · 拦不住**手机拍屏**，也拦不住有内核驱动/直接读显存的企业监控 agent
//   · 代价：开启时**自己也截不了图** —— 这正是要配合「文本模式」的原因
// 用户定案（2026-09-14）：默认开启；按 T 进「文本模式」时同时解除保护（可复制文本 + 可正常截图）。
// 🟥 V4.3.19：**默认关闭**（用户定案）。渲染层在 loadSettings() 时会用持久化状态覆盖它；
// 在那之前主进程就用这个初值，所以这里必须与渲染层的默认值一致，否则开窗瞬间会闪一下保护态。
let contentProtectOn = false;

function applyContentProtection() {
  BrowserWindow.getAllWindows().forEach(w => {
    try { if (!w.isDestroyed()) w.setContentProtection(contentProtectOn); } catch (e) {}
  });
}
function setContentProtection(on) {
  contentProtectOn = !!on;
  applyContentProtection();
}

// ---------- 跨系统能力自检（V4.3.19）----------
// 防截屏在各平台/各系统版本上的支撑度差别很大，**不能默默失效**：
// 查出来如实告诉用户「完整生效 / 只部分生效 / 完全不支持」，以及补救手段（投屏·远控自动隐身）。
// 各平台实际情况：
//   · Windows 11 / Windows 10 2004(build 19041)+ → 完整支持（WDA_EXCLUDEFROMCAPTURE）
//   · Windows 10 早于 2004                        → 退化成 WDA_MONITOR，只拦得住一部分捕获方式
//   · macOS                                      → 支持（NSWindowSharingNone，窗口不进截屏/录屏）
//   · Linux                                      → Electron 未实现，等于没保护，只能靠自动隐身
// ⚠️ Windows 7 / 8 / 8.1 **根本跑不起本程序**：Electron 28 用的 Chromium 120 早已不支持它们
//    （最后一个支持 Win7 的是 Electron 22 / Chromium 108），所以这里不存在「适配 Win7」的空间。
function detectProtectSupport() {
  try {
    const p = process.platform;
    if (p === 'win32') {
      const rel = String(require('os').release() || '');          // 形如 10.0.19045 / 10.0.26100
      const m = rel.match(/^(\d+)\.(\d+)\.(\d+)/);
      const build = m ? parseInt(m[3], 10) : 0;
      if (build >= 22000) return { level: 'full', note: TT('Windows 11：完整支持（截屏/录屏均为黑屏）','Windows 11: fully supported (screenshots / recordings come out black)') };
      if (build >= 19041) return { level: 'full', note: TT('Windows 10 2004 及以上：完整支持（截屏/录屏均为黑屏）','Windows 10 2004 or later: fully supported (screenshots / recordings come out black)') };
      if (build > 0) return { level: 'partial', note: TT('这台电脑的 Windows 10 低于 2004 版，防截屏只能拦住一部分方式，建议同时开启「投屏 / 远控自动隐身」','This Windows 10 build is older than 2004: capture blocking only covers part of the methods. Turn on "auto-hide when casting / remote-controlled" as well.') };
      return { level: 'unknown', note: TT('无法识别系统版本，防截屏效果未知','Unrecognized OS version: the effect of capture blocking is unknown') };
    }
    if (p === 'darwin') return { level: 'full', note: TT('macOS：窗口已排除在截屏 / 录屏之外','macOS: the window is excluded from screenshots / screen recordings') };
    return { level: 'none', note: TT('本系统（' + p + '）未提供窗口防截屏能力，只有「投屏 / 远控自动隐身」可用', 'This OS (' + p + ') offers no per-window capture blocking; only "auto-hide when casting / remote-controlled" is available') };
  } catch (e) {
    return { level: 'unknown', note: '' };
  }
}
/* 🟥 V4.3.45（R4-3）：**不要**把检测结果冻结成模块级常量。
   它的 `note` 是按**当前语言**取词的（TT），而模块级常量在启动时就求值一次 ——
   用户切到英文后，设置→诊断里那句「防截屏能力说明」会一直停在启动时的语言。
   实测探针（`_r5_main_i18n.js`）正是靠"切英文后 note 仍是中文"抓到这条的。
   detectProtectSupport 只读 process.platform / os.release，每次重算可忽略不计。 */
function protectInfo() { const s = detectProtectSupport(); return { level: s.level, note: s.note }; }

// 🆕 V4.3.23：设备指纹 —— 用来给「防截屏实测结论」定有效期。
// 结论只对**这台机器 + 这个系统版本**成立，换机器必须重测，否则会把别的机器的结论当成自己的。
function protectFingerprint() {
  try { return process.platform + '|' + String(require('os').release() || ''); }
  catch (e) { return process.platform + '|unknown'; }
}

// ---------- 脱监自检（V4.3.20）：一键实测本机防截屏到底有没有生效 ----------
// 为什么要它：用户问「怎么知道有没有正确脱离 / 有没有起效」。光看按钮亮着只能证明**开了**，
// 证明不了**管用**。所以做一次端到端实测，而不是让用户靠感觉。
// 原理（与 work/asar-src/_protect_probe.js 同构，本机已实测有效）：
//   造一个纯品红小窗 → 先关保护截一次屏（应能看到这片品红）→ 再开保护截一次屏（应看不到，变黑）。
//   两次结果不同 = 生效；两次都看得到 = 没生效；两次都看不到 = 本机截屏能力不可用（无法判定）。
// 注意：desktopCapturer 抓整屏是本程序里最重的操作（项目内实测单次约 540ms），要抓两次，
// 所以这是**按需触发**的动作，不做成自动跑。
/* V4.3.97：原 SELFTEST_RGB 常量 0 引用已删；品红窗用的是 backgroundColor '#FF00FF' 与硬编码判据。 */

async function countScreenMagenta() {
  try {
    const disp = screen.getPrimaryDisplay();
    const W = Math.round(disp.size.width * (disp.scaleFactor || 1));
    const H = Math.round(disp.size.height * (disp.scaleFactor || 1));
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: W, height: H } });
    if (!sources || !sources.length) return -1;
    const bmp = sources[0].thumbnail.toBitmap();   // BGRA
    let n = 0;
    for (let i = 0; i + 3 < bmp.length; i += 4) {
      if (bmp[i + 2] > 200 && bmp[i + 1] < 80 && bmp[i] > 200) n++;
    }
    return n;
  } catch (e) { return -1; }
}

async function runProtectSelfTest() {
  const _pi = protectInfo();
  const out = { verdict: 'unknown', offCount: -1, onCount: -1, level: _pi.level, note: _pi.note, platform: process.platform };
  let testWin = null;
  try {
    // 自检期间先确保业务窗口不是「恰好被保护」的状态，避免干扰：只动测试窗，业务窗保持原样
    const disp = screen.getPrimaryDisplay();
    const w = Math.max(120, Math.min(220, Math.round(disp.size.width * 0.09)));
    const h = Math.round(w * 0.62);
    testWin = new BrowserWindow({
      x: 40, y: 40, width: w, height: h,
      frame: false, resizable: false, movable: false, skipTaskbar: true,
      alwaysOnTop: true, focusable: false, show: false,
      backgroundColor: '#FF00FF',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    testWin.setContentProtection(false);
    await testWin.loadURL('data:text/html,<html><body style="margin:0;background:%23FF00FF"></body></html>');
    testWin.showInactive();
    await new Promise(r => setTimeout(r, 500));
    out.offCount = await countScreenMagenta();
    testWin.setContentProtection(true);
    await new Promise(r => setTimeout(r, 600));
    out.onCount = await countScreenMagenta();

    if (out.offCount <= 0 && out.onCount <= 0) out.verdict = 'unavailable';
    else if (out.offCount > 0 && out.onCount === 0) out.verdict = 'ok';
    else if (out.onCount > 0) out.verdict = 'ineffective';
    else out.verdict = 'unknown';
    logToFile('info', '脱监自检 ' + JSON.stringify(out));
  } catch (e) {
    out.verdict = 'unavailable';
    out.note = String((e && e.message) || e);
  } finally {
    try { if (testWin && !testWin.isDestroyed()) testWin.destroy(); } catch (e) {}
  }
  return out;
}

// ---------- 隐私隐身：投屏 / 远控命中时自动藏起来 ----------
// 只在「本来就是显示状态」时才动它，避免跟用户手动隐藏打架（同前台监听的策略）。
let privacyHiddenBy = '';
let lastDisplayCount = 0;

function privacyHide(reason) {
  // 🛡 V4.3.19：脱离监控总开关关掉时，投屏/远控自动隐身也一并停用（工具栏「🛡 脱监」按钮 = 这一项）
  if (!contentProtectOn) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) return;
  try { closeAllPanels(); } catch (e) {}
  mainWindow.hide();
  privacyHiddenBy = reason;
  logToFile('info', '隐私隐身触发: ' + reason);
}

// 投屏检测：只在「运行中新增显示器」时触发（= 有人插上投影/扩展屏）。
// 刻意**不用**「当前显示器数 > 1」判断 —— 常驻双屏的用户一启动就会被隐藏（误报太多）。
function startDisplayWatch() {
  try {
    if (lastDisplayCount === 0) lastDisplayCount = screen.getAllDisplays().length;
    screen.on('display-added', () => {
      const n = screen.getAllDisplays().length;
      const added = n - lastDisplayCount;
      lastDisplayCount = n;
      if (added > 0) privacyHide(TT('检测到新增显示器（可能是投屏/扩展屏）','New display detected (casting / extended screen?)'));
    });
    screen.on('display-removed', () => { lastDisplayCount = screen.getAllDisplays().length; });
  } catch (e) { /* screen 模块异常不影响主流程 */ }
}

// ---------- 面板窗口 ----------
/* ⬜ V4.3.60：面板窗现在和主窗一样要留内衬（`#panel { inset: var(--win-pad) }`），
   否则 CSS 投影画不进窗口 —— 7 个面板贴着桌面时一点投影都没有（像贴纸）。
   窗口尺寸必须 +2×内衬，内容区才和原来一样大。
   🟥 这个数字必须等于 CSS 里的 `--win-pad`（= blur/2 + offsetY = 24/2 + 8 = 20），
      由门禁 `_v460_corner_gate.js` 逐字核对 —— 两处不同步会让内容区悄悄变小。 */
const WIN_PAD = 20;
function panelOptions(type) {
  const sizes = { toolbar: [250, 470], settings: [320, 430], toc: [250, 380], search: [330, 400], source: [340, 540], shelf: [280, 440], bookmarks: [280, 420], annot: [300, 460] };
  const base = sizes[type] || [260, 400];
  const width = base[0] + WIN_PAD * 2;
  const height = base[1] + WIN_PAD * 2;
  return {
    width, height,
    minWidth: width, minHeight: height,
    maxWidth: width, maxHeight: height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: type !== 'source',
    skipTaskbar: true,
    focusable: true,
    resizable: false,
    movable: true,
    show: false,
    webPreferences: {
      /* ⬜ V4.3.62：面板窗改用**专用 preload**（21 个方法的最小面）。
         原先和主窗共用 `preload.js`，等于把备份读写 / 文件关联 / 检查更新 /
         快捷键注册 / 拖拽全屏等只属于主窗的能力也暴露给了会渲染远端内容的窗口。 */
      preload: path.join(__dirname, 'preload-panel.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: true
    }
  };
}

function createPanel(type) {
  lastPanelOpAt = Date.now();   // 🟥 V4.3.76：面板操作宽限期起点
  if (panels[type] && !panels[type].isDestroyed()) return panels[type];
  const win = new BrowserWindow(panelOptions(type));
  // 面板也一并纳入防截屏：否则主窗内容被保护了，旁边工具栏照样把「阅读统计/伪装皮肤」截进去
  try { win.setContentProtection(contentProtectOn); } catch (e) {}
  panelByWebContents.set(win.webContents.id, type);
  win.loadFile('panel.html', { query: { type } });
  win.on('move', () => { if (!autoPlacing && !draggingWindow) panelUserMoved[type] = true; });
  win.on('closed', () => {
    delete panels[type];
    panelOpen[type] = false;
    panelUserMoved[type] = false;
    /* V4.3.34：panelStack 也要同步摘掉。原先只有 closePanel() 会 splice，
       若面板是被别的途径销毁的（例如主窗 closed 时批量 destroy），栈里就会留下
       「已经关了但还在栈中」的条目 —— closeTopPanel() 会因此漏掉真正该关的那个窗口。 */
    const si = panelStack.indexOf(type);
    if (si >= 0) panelStack.splice(si, 1);
    panelByWebContents.forEach((v, k) => { if (v === type) panelByWebContents.delete(k); });
    try { win.removeAllListeners(); } catch (e) {}
  });
  panels[type] = win;
  return win;
}

function movePanelTo(win, x, y) {
  autoPlacing = true;
  win.setPosition(Math.round(x), Math.round(y));
  setTimeout(() => { autoPlacing = false; }, 80);
}

function rectsOverlap(a, b) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

function visiblePanelRects(exceptType) {
  const list = [];
  PANEL_TYPES.forEach(type => {
    if (type === exceptType) return;
    const win = panels[type];
    if (!win || win.isDestroyed() || !panelOpen[type]) return;
    list.push(win.getBounds());
  });
  return list;
}

// 只给新打开的面板找一个空位：固定在本侧向下顺延，不换边、不动其他面板
const LEFT_PANELS = ['toolbar', 'toc', 'shelf'];

// 纯函数：只在同一侧向下找空位，绝不换边、不影响其他面板
function findFreeSpot(others, wa, baseX, baseY, w, h, gap) {
  const step = gap || 8;
  const clampX = x => Math.max(wa.x, Math.min(x, wa.x + wa.width - w));
  const clampY = y => Math.max(wa.y, Math.min(y, wa.y + wa.height - h));
  const x = clampX(baseX);
  const downStep = h + step;
  for (let i = 0; i < 8; i++) {
    const rect = { x, y: clampY(baseY + i * downStep), width: w, height: h };
    if (!others.some(r => rectsOverlap(rect, r))) return { x: rect.x, y: rect.y };
  }
  return { x, y: clampY(baseY) };
}

function placeNewPanel(type) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const win = panels[type];
  if (!win || win.isDestroyed()) return;
  const mb = mainWindow.getBounds();
  const size = win.getSize();
  const gap = 8;
  const baseX = LEFT_PANELS.includes(type) ? (mb.x - size[0] - gap) : (mb.x + mb.width + gap);
  const wa = screen.getDisplayMatching(mb).workArea;
  const spot = findFreeSpot(visiblePanelRects(type), wa, baseX, mb.y, size[0], size[1], gap);
  movePanelTo(win, spot.x, spot.y);
  lastMainBounds = mb;
}

// 主窗口移动时让面板整体跟随（只做加法位移，不重算布局）
function translatePanelsWithWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const mb = mainWindow.getBounds();
  if (!lastMainBounds) { lastMainBounds = mb; return; }
  const dx = mb.x - lastMainBounds.x;
  const dy = mb.y - lastMainBounds.y;
  lastMainBounds = mb;
  if (!dx && !dy) return;
  PANEL_TYPES.forEach(type => {
    const win = panels[type];
    if (!win || win.isDestroyed() || !panelOpen[type]) return;
    const b = win.getBounds();
    movePanelTo(win, b.x + dx, b.y + dy);
  });
}

function snapshotPanelBounds() {
  const snap = {};
  PANEL_TYPES.forEach(type => {
    const win = panels[type];
    if (win && !win.isDestroyed() && panelOpen[type]) snap[type] = win.getBounds();
  });
  return snap;
}

// 主窗口尺寸变化或显示器变化时，重新归位未被手动拖动的面板
function layoutPanels() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const mb = mainWindow.getBounds();
  const wa = screen.getDisplayMatching(mb).workArea;
  const gap = 8;
  PANEL_TYPES.forEach(type => {
    const win = panels[type];
    if (!win || win.isDestroyed() || !panelOpen[type]) return;
    const b = win.getBounds();
    if (panelUserMoved[type]) {
      const x = Math.max(wa.x, Math.min(b.x, wa.x + wa.width - b.width));
      const y = Math.max(wa.y, Math.min(b.y, wa.y + wa.height - b.height));
      if (x !== b.x || y !== b.y) movePanelTo(win, x, y);
      return;
    }
    const baseX = LEFT_PANELS.includes(type) ? (mb.x - b.width - gap) : (mb.x + mb.width + gap);
    const spot = findFreeSpot(visiblePanelRects(type), wa, baseX, mb.y, b.width, b.height, gap);
    if (spot.x !== b.x || spot.y !== b.y) movePanelTo(win, spot.x, spot.y);
  });
  lastMainBounds = mb;
}

function openPanel(type) {
  if (!PANEL_TYPES.includes(type)) return;
  const wasOpen = panelOpen[type];
  createPanel(type);
  panelOpen[type] = true;
  const idx = panelStack.indexOf(type);
  if (idx >= 0) panelStack.splice(idx, 1);
  if (wasOpen) panelStack.push(type);
  else if (idx < 0) panelStack.push(type);
  const win = panels[type];
  if (!win) return;
  if (!wasOpen) placeNewPanel(type);
  win.show();
  win.moveTop();
  if (type === 'settings' || type === 'search' || type === 'source' || type === 'shelf' || type === 'bookmarks') {
    win.focus();
  }
  if (type === 'search') safeSend(win, 'panel:update', { focus: true });
  notifyMainWindow('panel:open', type);
}

function closePanel(type) {
  lastPanelOpAt = Date.now();   // 🟥 V4.3.76：面板操作宽限期起点
  if (!PANEL_TYPES.includes(type)) return;
  panelOpen[type] = false;
  const idx = panelStack.indexOf(type);
  if (idx >= 0) panelStack.splice(idx, 1);
  const win = panels[type];
  if (win && !win.isDestroyed()) win.destroy();
  notifyMainWindow('panel:closed', type);
}

function closeAllPanels() {
  PANEL_TYPES.forEach(function (type) {
    if (type === 'source') return;
    closePanel(type);
  });
  if (!panelOpen.source) notifyMainWindow('panel:all-closed');
}

function closeTopPanel() {
  for (let i = panelStack.length - 1; i >= 0; i--) {
    const type = panelStack[i];
    if (type === 'source') continue;
    closePanel(type);
    return;
  }
}

function togglePanel(type) {
  if (panelOpen[type]) closePanel(type);
  else openPanel(type);
}

function syncPanelsToMainVisibility(visible) {
  PANEL_TYPES.forEach(type => {
    if (type === 'source') return;
    const win = panels[type];
    if (!win || win.isDestroyed()) return;
    if (visible && panelOpen[type]) win.show();
    else win.hide();
  });
}

function setAllOpacity(v) {
  /* V4.3.33 修：原先直接把 Number(v) 塞给 setOpacity。传 NaN / 越界值会抛错，
     而 IPC handler 抛错会被全局 uncaughtException 吞掉 —— 表现为「透明度滑杆拖了没反应」
     外加日志里一堆噪音。setOpacity 合法区间是 0~1，这里统一夹取。 */
  const raw = Number(v);
  if (!Number.isFinite(raw)) return;
  const op = Math.max(0, Math.min(1, raw));
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setOpacity(op);
  PANEL_TYPES.forEach(type => {
    const win = panels[type];
    if (win && !win.isDestroyed()) win.setOpacity(op);
  });
}

let hoverInterval = null;
let appHovered = false;
let appFocusLostAt = null;
/* 🟥 V4.3.76：面板开/关的宽限计时 —— 重排期间「无聚焦」是常态，不许当成"用户离开"关全部 */
let lastPanelOpAt = 0;
const PANEL_CLOSE_GRACE = 900;

// 🔴 书架导入「没反应」的根因：系统文件对话框打开期间，没有任何 BrowserWindow
// 持有焦点（对话框不是 BrowserWindow），updateAppHover 的「失焦 400ms 关闭全部面板」
// 会把正等着对话框结果的面板整个销毁 —— 渲染进程一死，await 的结果永远回不来。
// 给 dialog 的弹窗方法加守卫：弹窗期间挂起面板自动关闭，结束后给 400ms 宽限。
let fileDialogOpen = false;
['showOpenDialog', 'showSaveDialog', 'showMessageBox'].forEach(m => {
  const orig = dialog[m].bind(dialog);
  dialog[m] = (...args) => {
    fileDialogOpen = true;
    const done = () => { fileDialogOpen = false; appFocusLostAt = null; };
    /* V4.3.33 修：orig 同步抛错时，原本 done() 永不执行 → fileDialogOpen 卡在 true，
       「失焦 400ms 自动关面板」从此永久失效，且没有任何日志可查。
       这里保证无论成功、异步、还是同步抛错，都一定复位。 */
    let r;
    try { r = orig(...args); }
    catch (err) { done(); throw err; }
    if (r && typeof r.then === 'function') return r.finally(done);
    done();
    return r;
  };
});

function isPointInWindow(win, x, y) {
  if (!win || win.isDestroyed() || !win.isVisible()) return false;
  const b = win.getBounds();
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
}

function updateAppHover() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  let hovered = isPointInWindow(mainWindow, p.x, p.y);
  if (!hovered) {
    for (const type of PANEL_TYPES) {
      const win = panels[type];
      if (win && !win.isDestroyed() && win.isVisible()) {
        if (isPointInWindow(win, p.x, p.y)) { hovered = true; break; }
      }
    }
  }
  if (hovered !== appHovered) {
    appHovered = hovered;
    notifyMainWindow('app:hover', hovered);
  }

  const focused = BrowserWindow.getFocusedWindow();
  if (focused) {
    appFocusLostAt = null;
  } else if (appFocusLostAt === null) {
    appFocusLostAt = Date.now();
  } else if (Date.now() - appFocusLostAt > 400) {
    // 文件对话框打开期间不关面板：面板可能正等着对话框的结果（书架导入/导出等）
    if (!fileDialogOpen) {
      /* 🟥 V4.3.76 修（实机反馈：工具栏面板所有按钮「点了没反应」）：
         「无聚焦 400ms → 关全部面板」有两个误伤场景，都会让用户刚点开的面板闪现即毁：
         ① **面板重排期**：点面板按钮 → 新面板创建 + 旧面板销毁的瞬间没有任何窗口持有
            焦点；真实书架数据大、渲染慢，这个空窗会超过 400ms → 刚开的设置面板被整批关掉，
            用户看到的就是「每个按钮点了都没反应」。
         ② **焦点系统抖动**：外部程序抢焦点（IM 弹窗 / 助手浮窗）时鼠标可能仍停在阅读器
            窗口上 —— 用户并没有"点到外面去"。
         双保险：鼠标仍在任一窗内（hovered）＝用户没离开，只重置计时不清面板；
         刚发生过面板开/关（PANEL_CLOSE_GRACE 内）＝正在重排，同样只重置计时。 */
      const inGrace = Date.now() - lastPanelOpAt < PANEL_CLOSE_GRACE;
      /* ⚠️ 行为注记（V4.3.76 双保险的已知取舍）：鼠标坐标落在阅读器 bounds 内、但阅读器被
         其他全屏窗口盖住时，isPointInWindow 仍判 true → 面板不再自动收起（旧版会关）。
         这是有意取舍（防误关），不是 bug —— 别当回归改回去。 */
      if (!hovered || inGrace) {
        appFocusLostAt = Date.now();   // 不是"用户离开"，重置计时继续观察，不关
      } else {
        closeAllPanels();
        appFocusLostAt = null;
      }
    }
  }
}

function startHoverPolling() {
  if (hoverInterval) return;
  updateAppHover();
  hoverInterval = setInterval(updateAppHover, 150);
}

function stopHoverPolling() {
  if (hoverInterval) { clearInterval(hoverInterval); hoverInterval = null; }
}

// ---------- Ctrl 拖动（主进程实时定位） ----------
function stopDrag() {
  if (dragInterval) { clearInterval(dragInterval); dragInterval = null; }
  dragBase = null;
  cursorBase = null;
  dragPanelBase = null;
  draggingWindow = false;
  dragLastEventAt = 0;
  dragStartupUntil = 0;
  dragTick = 0;
  // 拖动期间刻意不刷 lastMainBounds（每帧读一次 bounds 是同步 IPC，白花时间还加剧掉帧），结束后补一次
  if (mainWindow && !mainWindow.isDestroyed()) lastMainBounds = mainWindow.getBounds();
  startHoverPolling();
}

// 拖动 = 渲染进程鼠标事件驱动（每帧一次），和缩放窗口走同一条策略。
// 以前是主进程 setInterval(16) 轮询光标：Node 定时器会被主进程其它工作挤后，
// 帧间隔忽长忽短 —— 看上去就是「顿」。现在节奏由真实鼠标输入 + 显示器刷新率决定。
function startDrag(cx, cy) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  stopDrag();
  dragBase = mainWindow.getPosition();
  cursorBase = (typeof cx === 'number' && typeof cy === 'number')
    ? { x: cx, y: cy }
    : screen.getCursorScreenPoint();
  dragPanelBase = snapshotPanelBounds();
  draggingWindow = true;
  dragLastEventAt = Date.now();
  dragTick = 0;
  // 拖动期间停掉悬停轮询：它每 150ms 要读主窗 + 6 个面板的 bounds，
  // 和拖动的每帧 setPosition 叠在一起是白白的开销
  stopHoverPolling();
  // 心跳兜底 + 起手加速：
  // 🟥 起手延迟的来源是「渲染层 mousemove 要等 Chrome 的帧对齐合并才派发」（最多 1 帧 ≈16.7ms），
  //    再加上 IPC 与合成，起手跟随就要 ~33ms。所以 mousedown 后的前 520ms 由主进程
  //    16ms 轮询 GetCursorPos 直接驱动（不等任何事件），起手跟随延迟约减半；
  //    520ms 后渲染层 mousemove 接管（持续拖动的丝滑节奏由它保证），本 interval 退回心跳兜底。
  dragStartupUntil = Date.now() + 520;
  dragInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) { stopDrag(); return; }
    if (Date.now() < dragStartupUntil) {              // 起手阶段：无条件跟光标
      const c = screen.getCursorScreenPoint();
      dragMoveTo(c.x, c.y, true);
      return;
    }
    if (Date.now() - dragLastEventAt < 60) return;    // 之后：事件断流才兜底
    const c = screen.getCursorScreenPoint();
    dragMoveTo(c.x, c.y, true);
  }, 16);
}

// 把主窗（以及已打开的面板）整体平移到光标新位置所对应的偏移。
// fromHeartbeat=true 表示这次是兜底心跳发的，不刷新事件时间戳。
function dragMoveTo(cx, cy, fromHeartbeat) {
  if (!draggingWindow || !mainWindow || mainWindow.isDestroyed() || !dragBase || !cursorBase) return;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
  if (!fromHeartbeat) dragLastEventAt = Date.now();
  const dx = Math.round(cx - cursorBase.x);
  const dy = Math.round(cy - cursorBase.y);
  mainWindow.setPosition(dragBase[0] + dx, dragBase[1] + dy);
  // 面板只做整体位移（不重算布局），且每 3 帧同步一次：
  // 主窗每帧跟手，面板慢一点基本看不出来，主进程的同步调用少三分之二
  if ((dragTick++ % 3) === 0) {
    PANEL_TYPES.forEach(type => {
      const win = panels[type];
      const base = dragPanelBase[type];
      if (!win || win.isDestroyed() || !base || !panelOpen[type]) return;
      win.setPosition(base.x + dx, base.y + dy);
    });
  }
}

// ---------- 显示/隐藏 ----------
function toggleShowHide() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.setOpacity(1);
    mainWindow.show();
    mainWindow.focus();
    /* 🆕 V4.3.53（R12-2）：用户自己从托盘把窗口叫出来 —— 伴随模式要认这个事实：
       “待命”状态就地结束（托盘提示跟着改回来），否则提示会一直挂着说在等目标。 */
    if (companionStandby || companionAutoHidden) {
      companionStandby = false;
      companionAutoHidden = false;
      refreshCompanionTray();
    }
  }
}

/* 🖥 V4.3.53（第十二轮）：双击标题栏 → 全屏 / 退出全屏。
   🟥 这条链路为什么非得挂在主进程：标题栏与专注模式顶部细条都是
   `-webkit-app-region:drag` 的系统非客户区 —— 鼠标事件被系统吃掉，渲染层的 DOM
   收不到任何 dblclick（与"拖拽区里的按钮点不动"是同一个原因）。
   唯一能听到"用户在拖拽区双击了"的通道是窗口消息 WM_NCLBUTTONDBLCLK（0x00A3）。
   🟥 V4.3.53：**不许用 isFullScreen() 判方向**。实测（transparent + frame:false + maximizable(false)）：
   `setFullScreen(true)` 之后窗口确实铺满整屏（bounds 变成 0,0,屏幕宽高）、
   `enter-full-screen` 事件也照常触发，但 `isFullScreen()` **恒为 false** ——
   拿它取反来决定下一次动作，就会"只能进、不能出"，用户会被困在全屏里出不来。
   所以自己维护 mainFullScreen：动作推进它，enter/leave 事件再校正它。 */
let mainFullScreen = false;
function toggleMainFullScreen() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const next = !mainFullScreen;
  try {
    mainWindow.setFullScreen(next);
    mainFullScreen = next;   /* 事件到达时会再校正一次（见 createWindow 里的 enter/leave） */
  } catch (e) {
    const detail = errTextOf(e);
    console.warn('setFullScreen failed: ' + detail);
    /* 🟥 规则 41：主进程知道坏了必须回传渲染层（只写日志 = 界面在骗你） */
    notifyMainWindow('window:fullscreen-failed', detail);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 620,
    height: 420,
    minWidth: 360,
    minHeight: 260,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    icon: trayIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  try { mainWindow.setContentProtection(contentProtectOn); } catch (e) {}
  /* 🖥 V4.3.53：双击标题栏切全屏 —— 见 toggleMainFullScreen 的注释。
     `setMaximizable(false)`：frameless 窗口的拖拽区双击**默认会被系统最大化**，
     我们要的是"全屏"，不关掉这个默认动作就会"先最大化、再全屏"双重生效。
     这是明说的行为变更（说明书 / CHANGELOG 都写了）：双击标题栏不再最大化，而是全屏。 */
  try { mainWindow.setMaximizable(false); } catch (e) { console.warn('setMaximizable(false) failed: ' + errTextOf(e)); }
  try { mainWindow.hookWindowMessage(0x00A3, () => { toggleMainFullScreen(); }); }
  catch (e) { console.warn('WM_NCLBUTTONDBLCLK hook failed: ' + errTextOf(e)); }
  /* 全屏进出都要重排面板：主窗盖满一屏后，面板得在工作区里重新找空位。
     🟥 同时优先信**事件**回传的真实状态（mainFullScreen 由它校正）。 */
  mainWindow.on('enter-full-screen', () => {
    mainFullScreen = true;
    /* 🟥 V4.3.97（审查 R-7）：缓动定时器是 16ms 一帧在跑，全屏守卫只拦"新的" dock 调用，
       已经在跑的那一帧会把窗口从全屏位置拽回小矩形（而 mainFullScreen 还记着在全屏）。 */
    try { companionStopGlide(); } catch (e) {}
    notifyMainWindow('window:fullscreen', true); layoutPanels();
  });
  mainWindow.on('leave-full-screen', () => { mainFullScreen = false; notifyMainWindow('window:fullscreen', false); layoutPanels(); });
  mainWindow.loadFile('index.html');
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      /* 🆕 V4.3.55（关闭联动）：联动开着且伴随模式启用 ⇒ 点 X = **关掉目标窗口 + 阅读器真退出**
         （不再藏托盘——用户要求“关闭项目窗口时，目标窗口要一起关闭”；藏托盘的话目标永远等不到那一下）。
         联动没开 ⇒ 保持原行为：preventDefault 藏进托盘。
         ⚠️ 行为变更已披露（CHANGELOG V4.3.55）：联动开 = X 从「藏托盘」变成「真退出」。 */
      if (companionLinkEnabled('linkClose')) {
        runCompanionTargetAction('close', 'close-link');
        return;   // 不 preventDefault：窗口真关闭 → window-all-closed → 应用退出
      }
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('show', () => {
    safeSend(mainWindow, 'window:visibility', true);
    syncPanelsToMainVisibility(true);
    /* 🟥 V4.3.97（代码审查 R-6）：`privacyHiddenBy` 只写不清（全仓无第二处赋值），
       而 40-companion.js 拿它当防窥守卫 —— 插过一次投影 / 命中一次远控之后，
       **本次会话内**伴随模式的"目标回来 → 恢复显示"就永久失效了。
       用户主动把窗口叫回来 = 他知道并接受了当下环境，隐私隐身到此结束。 */
    if (privacyHiddenBy) { logToFile('info', '隐私隐身解除（用户叫回窗口）: ' + privacyHiddenBy); privacyHiddenBy = ''; }
    /* 🆕 V4.3.55（打开联动）：阅读器被打开/叫回时，目标若还最小化着一并恢复
       （IsIconic 守卫：目标本来就可见时是空操作，不干扰最大化状态）。 */
    if (companionLinkEnabled('linkMin')) runCompanionTargetAction('restore', 'open-link');
  });
  mainWindow.on('hide', () => {
    safeSend(mainWindow, 'window:visibility', false);
    syncPanelsToMainVisibility(false);
    stopDrag();
  });
  /* 🛡 V4.3.38：最小化也算「窗口不可见」。原先只同步面板、不推 window:visibility ——
     渲染层的 state.isHidden 仍为 false，于是**最小化后朗读继续出声、阅读计时继续累加**
     （用户报的"关掉还在计时"在最小化路径上原样复现）。 */
  mainWindow.on('minimize', () => {
    safeSend(mainWindow, 'window:visibility', false);
    syncPanelsToMainVisibility(false);
    try { companionStopGlide(); } catch (e) {}   /* V4.3.97：最小化后别再按旧目标挪窗口 */
    /* 🆕 V4.3.55（最小化联动）：阅读器最小化 ⇒ 目标一起最小化 */
    if (companionLinkEnabled('linkMin')) runCompanionTargetAction('min', 'minimize-link');
  });
  mainWindow.on('restore', () => {
    safeSend(mainWindow, 'window:visibility', true);
    syncPanelsToMainVisibility(true);
    /* 🆕 V4.3.55（恢复联动）：阅读器恢复 ⇒ 目标一起恢复 */
    if (companionLinkEnabled('linkMin')) runCompanionTargetAction('restore', 'restore-link');
  });
  mainWindow.on('move', () => { if (!draggingWindow) translatePanelsWithWindow(); });
  mainWindow.on('resize', () => { lastMainBounds = mainWindow.getBounds(); layoutPanels(); });
  mainWindow.on('blur', stopDrag);
  mainWindow.on('closed', () => {
    const win = mainWindow;
    mainWindow = null;
    PANEL_TYPES.forEach(type => {
      const panel = panels[type];
      if (panel && !panel.isDestroyed()) panel.destroy();
    });
    try { if (win) win.removeAllListeners(); } catch (e) {}
  });
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip(TT('浅水鲸', 'Shallow Whale'));
  refreshTrayMenu();
  tray.on('click', toggleShowHide);
}

/* 🟥 V4.3.45（R4-3）：托盘菜单文案要能跟着界面语言变。
   单独抽成函数 —— 语言切换时只 `setContextMenu` 重建菜单，
   **不新建 Tray**（再 new 一个会在托盘区多出一个图标，且旧的没人 dispose）。 */
function refreshTrayMenu() {
  if (!tray) return;
  try {
    tray.setToolTip(TT('浅水鲸', 'Shallow Whale'));
    const menu = Menu.buildFromTemplate([
      { label: TT('显示 / 隐藏', 'Show / Hide'), click: toggleShowHide },
      { type: 'separator' },
      { label: TT('退出', 'Quit'), click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(menu);
  } catch (e) { try { logToFile('error', 'refreshTrayMenu failed: ' + ((e && e.message) || e)); } catch (e2) {} }
}

/* 🆘 V4.3.24：这个全局快捷键的语义从「显示 / 隐藏阅读窗口」升级为 **SOS**
   （收起**全部**界面：主窗 + 所有小窗，并停掉朗读；再按一次原样恢复）。
   用户原话：「Ctrl+Shift+H 只是隐藏阅读窗口，工具栏还在」—— 那不够用。
   主进程只负责转发，真正的收起/恢复在渲染层（scripts/app.js 的 toggleSOS），
   因为「哪些小窗开着」「朗读是否在播」只有渲染层知道。 */
/* 🟥 V4.3.49（R8-2）：accelerator → 渲染层显示形态。
   渲染层全平台都用 'Ctrl+...' 写键位（见 scripts/util.js 的 formatShortcut），
   `toAccelerator` 只做单向 Ctrl→CommandOrControl，这里把回传值转回去，
   渲染层才能把它原样写回输入框与 `fsc`。 */
function toUiShortcut(accel) {
  return String(accel || '').replace(/CommandOrControl/g, 'Ctrl').replace(/^Super\b/, 'Meta');
}

/* 🟥 V4.3.49（R8-2）：返回**真实结果**，而不是只写日志。
   V4.3.38 已经做到"新键被占用时回滚注册旧键"，但那只发生在主进程内部：
   渲染层的设置面板照样显示那个注册不上的新键、`fsc` 里存的也是它 ——
   用户每次开机都看到一个永远不生效的键位，界面上没有任何地方说破。
   现在把 {ok, requested, effective, rolledBack, reason, detail} 交回渲染层。 */
function registerHideShortcut(accel) {
  const out = { ok: false, requested: '', effective: toUiShortcut(currentHideAccel), rolledBack: false, reason: '', detail: '' };
  try {
    const next = String(accel || '').trim();
    out.requested = next;
    /* 🛡 V4.3.38 ①②：
       ① 空键位**直接不动**。原写法是先 unregister 旧键、再 register('') ——
          而 register('') 必然失败，于是「用户点一次保存」就把原来好用的全局 SOS 键弄没了。
       ② 新键被系统/其它软件占用时，把**旧键注册回去**。原先只写一行日志，
          渲染层的设置面板照常显示新键，用户以为改键成功、实际全局热键彻底失灵。 */
    if (!next) { out.reason = 'empty'; return out; }
    const prev = currentHideAccel;
    if (prev === next) { out.ok = true; out.effective = toUiShortcut(next); return out; }
    if (prev) { try { globalShortcut.unregister(prev); } catch (e) {} }
    if (globalShortcut.register(next, () => notifyMainWindow('app:sos'))) {
      currentHideAccel = next;
      out.ok = true; out.effective = toUiShortcut(next);
      return out;
    }
    try {
      if (prev && globalShortcut.register(prev, () => notifyMainWindow('app:sos'))) { currentHideAccel = prev; out.rolledBack = true; }
    } catch (e) {}
    out.effective = toUiShortcut(currentHideAccel);
    out.reason = 'occupied';
    // 🟥 主进程禁止 console（stdout 断管会 EPIPE 崩溃），统一写日志
    logToFile('error', '全局快捷键注册失败（要求的键=' + next + '，实际保留=' + currentHideAccel +
      (out.rolledBack ? '' : '；⚠️ 旧键也没能注册回来，本会话无全局 SOS 键'));
    return out;
  } catch (e) {
    out.reason = 'exception';
    out.detail = errTextOf(e);
    out.effective = toUiShortcut(currentHideAccel);
    logToFile('error', '全局快捷键注册异常：' + out.detail);
    return out;
  }
}

// 伪装外观的全局快捷键：窗口没有焦点时也得能一键切过去。
// 主进程只负责转发，具体开关在渲染层（scripts/app.js）。
function registerDisguiseShortcut(accel) {
  /* 🛡 V4.3.38：与 registerHideShortcut 同口径 ——
     ① 主进程禁止 console（stdout 断管会 EPIPE 崩溃），统一 logToFile；
     ② 空键位不动、注册失败回滚旧键（原先只写一行控制台告警，用户看不出伪装热键已经失灵）。 */
  try {
    const next = String(accel || '').trim();
    if (!next) return;
    const prev = currentDisguiseAccel;
    if (prev === next) return;
    if (prev) { try { globalShortcut.unregister(prev); } catch (e) {} }
    if (globalShortcut.register(next, () => notifyMainWindow('app:disguise'))) { currentDisguiseAccel = next; return; }
    try {
      if (prev && globalShortcut.register(prev, () => notifyMainWindow('app:disguise'))) currentDisguiseAccel = prev;
    } catch (e) {}
    logToFile('error', '伪装快捷键注册失败（已回滚到旧键）：' + next);
  } catch (e) {
    logToFile('error', '伪装快捷键注册异常：' + ((e && e.message) || e));
  }
}

// ---------- 前台窗口监听（自动隐身）----------
// Electron 拿不到「当前前台是哪个进程」，只能问 Windows：起一个常驻 PowerShell 子进程，
// 用 P/Invoke 轮询 GetForegroundWindow 的进程名，每行打印一个；主进程按名单匹配，
// 命中就把主窗藏起来，离开再恢复。默认关闭 —— 常驻 PowerShell 进程本身在任务管理器里
// 可能比 Electron 更显眼，这个权衡交给用户。
let fgProc = null;
let fgList = [];
let fgAutoHidden = false;
let fgLastHit = null;
/* 🟥 V4.3.49（R8-1）：观察器的**代次令牌**与真实状态。
   fgRunToken：每次 stop/start 都推进；回调用它判断"我这一拍还作不作数"，
               避免旧实例的异步 exit 把新实例误报成失败。
   fgWatchActive：观察器是否真的在跑（供 `app:capabilities` 等如实回报，不是"开关状态"）。 */
let fgRunToken = 0;
let fgWatchActive = false;

function fgNormalizeList(raw) {
  /* 🆕 V4.3.61：改走与伴随模式**同一条**白名单（原先只 trim + 小写）。
     行为变化：含引号/美元符/分号等的名单项会被**静默丢弃**，与伴随模式口径一致。 */
  return normalizeProcList(raw);
}

// 远控 / 远程会话进程名单（V4.3.18「脱离监控」）。
// rdpclip.exe 值得单独说：它只在**本机被别人 RDP 连进来**时出现（是会话内的剪贴板重定向器），
// 所以它是「这台机器正处在远程会话里」的一个相当可靠的信号。
const REMOTE_PROC_NAMES = [
  'teamviewer', 'anydesk', 'sunloginclient', 'sunlogin', 'todesk', 'rustdesk',
  'winvnc', 'vncserver', 'uvnc_service', 'rdpclip', 'quickassist', 'ammyy', 'gotohttp'
];

function foregroundWatchScript() {
  // 两处都不能省：
  // 1) [Console]::OutputEncoding = UTF8 —— stdout 走管道时用的是控制台代码页（GBK），
  //    进程名可能是中文（例如本程序自己叫「悬浮阅读器」），不设就是一堆乱码。
  // 2) [Console]::Out.WriteLine + Flush —— PowerShell 走管道会缓冲，不刷就一条都收不到。
  // V4.3.18：每拍除了打印前台进程名，再打印一行 REMOTE:<命中的远控进程>（空表示没有）。
  // 两件事共用一个常驻进程 —— 不为远控检测再单起一个 powershell.exe：
  // 任务管理器里每多一个可见的 powershell，对「脱离监控」本身就是反效果。
  return [
    "$sig = '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -Namespace FgWatch -Name Native -MemberDefinition $sig',
    "$remote = '" + REMOTE_PROC_NAMES.join(',') + "'.Split(',')",
    'while ($true) {',
    '  $h = [FgWatch.Native]::GetForegroundWindow()',
    '  $target = 0',
    '  [void][FgWatch.Native]::GetWindowThreadProcessId($h, [ref]$target)',
    '  $n = ""',
    '  if ($target -gt 0) { try { $n = (Get-Process -Id $target -ErrorAction Stop).ProcessName } catch { $n = "" } }',
    '  [Console]::Out.WriteLine($n)',
    '  $hit = @()',
    '  foreach ($p in $remote) { if (Get-Process -Name $p -ErrorAction SilentlyContinue) { $hit += $p } }',
    '  [Console]::Out.WriteLine("REMOTE:" + ($hit -join ","))',
    '  [Console]::Out.Flush()',
    '  Start-Sleep -Milliseconds 700',
    '}'
  ].join('\n');
}

// 远控命中的边沿触发：只在「从没有到有」的那一次藏窗口。
// 不藏第二次是为了可用性 —— 企业机器上 TeamViewer/向日葵这类常年挂着，
// 若每拍都藏，用户手动叫回来又会被立刻藏回去，应用就没法用了。
let remoteHitLast = false;

function handleWatchLine(line) {
  if (line.indexOf('REMOTE:') === 0) {
    const hits = line.slice(7).trim();
    const hit = !!hits;
    if (hit === remoteHitLast) return;
    remoteHitLast = hit;
    if (hit) privacyHide(TT('检测到远程控制程序在运行: ' + hits, 'Remote-control program detected: ' + hits));
    return;
  }
  handleForegroundLine(line);
}

function stopForegroundWatch(keepHit) {
  /* 🟥 V4.3.49（R8-1）：代次令牌。原先 `stop()` 先 kill + 置 null，
     紧接着 `start()` 赋新实例；而**旧实例的 exit 事件是异步到达的** ——
     它到达时若拿"当前是否该在监听"来判断，就会把新实例的正常运行误报成失败。
     这里让 stop 无条件推进令牌，在途实例的 exit 便一律视为"预期内"，不上报。 */
  fgRunToken++;
  if (fgProc) {
    try { fgProc.kill(); } catch (e) {}
    fgProc = null;
  }
  if (!keepHit) fgLastHit = null;
  fgWatchActive = false;
  /* 🟥 V4.3.97（代码审查 R-5）：`fgAutoHidden` 原来只在"下一次收到非命中行"时清零。
     而关掉「前台监听」后进程被杀，**再也不会来下一行** —— 于是它永久为 true，
     40-companion.js 的防窥守卫（`if (fgAutoHidden || privacyHiddenBy) return;`）
     会让伴随模式此后**再也不自动显示窗口**（用户以为跟随坏了）。
     这里随监听一起复位。刻意**不主动 show** —— 重启监听也会走这里，
     主动弹窗会打扰正在别的应用里干活的人；状态复位后由用户/伴随模式正常接管即可。 */
  fgAutoHidden = false;
}

function handleForegroundLine(name) {
  const n = String(name || '').toLowerCase().replace(/\.exe$/, '');
  const hit = !!n && fgList.indexOf(n) >= 0;
  if (hit === fgLastHit) return;
  fgLastHit = hit;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (hit) {
    // 只在窗口本来就是显示状态时才动它，免得跟「隐藏/显示」快捷键手动隐藏打架
    if (mainWindow.isVisible()) {
      fgAutoHidden = true;
      closeAllPanels();
      /* 🆕 V4.4.0：这是**被动隐藏**（被动隐藏）—— 必须在 hide 之前单独推一次 force，
         让渲染层强制停朗读。不能指望 on('hide') 知道是谁触发的，它只是统一出口。 */
      try { safeSend(mainWindow, 'window:visibility', false, true); } catch (e) {}
      mainWindow.hide();
    }
  } else if (fgAutoHidden) {
    fgAutoHidden = false;
    // 用 showInactive：后台应用切走时把窗口还回来，但不去抢焦点（抢焦点会吃掉用户正在敲的字）
    mainWindow.setOpacity(1);
    mainWindow.showInactive();
  }
}

function errTextOf(e) {
  if (!e) return '';
  /* 🟥 必须取 message/code 而不是把 Error 直接交给 logToFile/safeStringify ——
     实测（V4.3.49 R8-1）：`console.error(e)` → `safeStringify(Error)` 落盘的是
     **一个字面量 `{}`**，排障时连"前台监听"四个字都看不到。 */
  return String((e && (e.message || e.code)) || e);
}

/* 🟥 V4.3.49（R8-1）：**主进程侧的失败必须回传渲染层**（第七轮的镜像）。
   前台观察器（自动隐身 / 远控检测）原先在三种情况下拿不到：
     · spawn 同步抛错（PowerShell 被安全软件拦 / PATH 里没有）
     · 子进程 error 事件
     · 子进程未被要求停止却自己退出（Add-Type 编译失败、被杀）
   三种都只写一行日志 + `fgProc = null`，而渲染层的 `fgWatchEnabled` 仍是 true、
   设置面板开关照样点亮 —— 敏感功能静默失效且用户毫不知情。现在统一走这个出口。 */
/* 🟥 V4.3.72：这两种"不可用"是**正常状态**，不是故障 ——
     · empty-list：用户还没配目标程序（默认就是空）
     · unsupported-platform：非 Windows
     · not-ready：启动瞬间的暂态，自己会恢复
   原先一律记 [error]，实测 app.log 里「[error] 伴随模式不可用[empty-list]」出现 2 次，
   用户翻日志找问题时会被这两条引到错误方向。 */
const SOFT_STATUS_REASONS = { 'empty-list': 1, 'unsupported-platform': 1, 'not-ready': 1 };
function statusLogLevel(reason) {
  return SOFT_STATUS_REASONS[String(reason || '')] ? 'info' : 'error';
}
function reportFgWatchStatus(ok, reason, detail) {
  fgWatchActive = !!ok;
  const list = fgList.join(',');
  try {
    logToFile(ok ? 'info' : statusLogLevel(reason),
      '前台监听' + (ok ? '已启动' : '不可用') + '[' + reason + ']' +
      (detail ? ' · ' + detail : '') + (list ? ' · 名单=' + list : ''));
  } catch (e) {}
  try {
    safeSend(mainWindow, 'fgwatch:status', { ok: !!ok, reason: String(reason || ''), detail: String(detail || ''), list });
  } catch (e) {}
}

function startForegroundWatch(list) {
  fgList = fgNormalizeList(list);
  stopForegroundWatch(true);
  /* 🟥 V4.3.49（R8-1）：下面每一条 return 原先都是"静默不启动" ——
     开关亮着、实际什么都没在监听。现在一律出声，理由分门别类给渲染层。 */
  // 🟥 V4.3.19 跨系统：这个观察器是 PowerShell 写的，只有 Windows 有。
  // 非 Windows 直接不启动（否则 spawn 一个不存在的 powershell 只会白报错）。
  // 影响面：远控进程检测随之不可用；投屏检测走 Electron 的 screen 模块，各平台都能用。
  if (process.platform !== 'win32') { reportFgWatchStatus(false, 'unsupported-platform', process.platform); return; }
  if (!fgList.length) { reportFgWatchStatus(false, 'empty-list', ''); return; }
  if (!app.isReady()) { reportFgWatchStatus(false, 'not-ready', ''); return; }
  let args;
  let encoded;
  try {
    // -EncodedCommand：脚本转 base64(UTF-16LE)，彻底绕开 Windows 命令行的引号地狱
    encoded = Buffer.from(foregroundWatchScript(), 'utf16le').toString('base64');
    args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
  } catch (e) {
    reportFgWatchStatus(false, 'build-script', errTextOf(e));
    return;
  }
  try {
    fgProc = spawn('powershell', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    fgProc = null;
    reportFgWatchStatus(false, 'spawn-failed', errTextOf(e));
    return;
  }
  /* 🟥 V4.3.49（R8-1）：令牌在**本实例**建立时取；取号必须在上面那次
     `stopForegroundWatch`（它会把令牌推进一格）**之后**。之后只有本实例能用它上报。 */
  const token = ++fgRunToken;
  /* 🟥 V4.3.44（R3-5）：同取色服务 —— stdout 也要按本次实例过滤，旧进程缓冲里的行
     不能喂给新进程的 handleWatchLine（后果轻一些：误报一次前台窗口 / 误触发隐身）。 */
  const proc2 = fgProc;
  let buf = '';
  fgProc.stdout.setEncoding('utf8');
  fgProc.stdout.on('data', chunk => {
    if (fgProc !== proc2) return;
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      // V4.3.18：同一路输出现在有两种行 —— 前台进程名 与 REMOTE:<远控命中>，分流处理
      handleWatchLine(line);
    }
  });
  /* V4.3.33 修：回调里只能清「本次这个实例」，不能闭包清模块变量。
     否则：stopForegroundWatch() 先 kill + 置 null，startForegroundWatch() 紧接着赋新进程，
     而旧进程的 exit 事件是**异步**到达的，它执行 `fgProc = null` 时清掉的是新进程 ——
     结果新 powershell 还活着，主进程却再无句柄，之后永远杀不掉（进程孤儿）。 */
  const proc = fgProc;
  /* 🟥 V4.3.49（R8-1）：异常退出 / 起不来都要上报，但只认**本实例**的令牌 ——
     用户主动关开关时 stopForegroundWatch 已推进令牌，那些 exit 一律静默
     （负对照：关掉功能反而弹一条"失败"是更糟的体验）。 */
  proc.on('exit', (code, signal) => {
    if (fgProc === proc) fgProc = null;
    if (token === fgRunToken) reportFgWatchStatus(false, 'exited', 'code=' + code + ' signal=' + (signal || ''));
  });
  proc.on('error', (err) => {
    if (fgProc === proc) fgProc = null;
    if (token === fgRunToken) reportFgWatchStatus(false, 'child-error', errTextOf(err));
  });
  reportFgWatchStatus(true, 'started', '');
}

function setForegroundWatch(cfg) {
  if (!cfg || !cfg.enabled) {
    stopForegroundWatch(false);
    fgList = [];
    return;
  }
  startForegroundWatch(cfg.list);
}

// ---------- 伴随模式（V4.3.53 R12-2）：跟着某个目标程序一起出现 / 一起收起 ----------
/* 用户原话：“我们能够嵌进某一个软件或者说页面里面，它能够跟随页面的开启关闭，然后进行运行。
   当然它原本的功能要不受影响，比如说防监察啊，不能截图啊以及隐形。就是透明化还有取色等功能都不能受到影响”
   形态（2026-10-12 定案）：
     · **形态2 + 拖走即暂停** —— 阅读器自动贴到目标窗口边上、跟着它移动；
       你手动把阅读器拖走之后它就停在原地、不再被拉回（设置里有「重新贴边」按钮）；
     · 「算开着」的判定：目标**窗口可见且在前台**（可设，见 mode）；
     · 目标关掉 → **收进托盘待命**（不退出），目标再打开 → 自动回来；
     · 🚫 形态3（真作为子窗口塞进别的进程）**刻意不做** —— 那会牺牲防截屏/透明/取色，
       与需求里点名的「原功能不受影响」直接冲突。
   🟥 为什么又是常驻 PowerShell：Electron 拿不到“别的进程的窗口在哪、可不可见、在不在前台”。
   与前台监听**各自一个进程**（不共用）：两者的开关与节拍是独立的（前台监听 700ms 够用，
   贴边跟随要 300ms 才跟手），共用一个会让“关掉一个”连累另一个 —— 代价只是多一个隐藏窗口的
   powershell.exe（`windowsHide`，任务管理器里能看到但没有窗口）。 */
let companionProc = null;
let companionToken = 0;
let companionActive = false;
/* lastFixedEdge：上一次用过的**固定**嵌入位（左/右/上/下/居中）。
   用户拖窗口 → 自动转「自由跟随」，但原固定位要留着，点「贴回去」能回到那儿。 */
let companionCfg = { enabled: false, list: [], mode: 'foreground', edge: 'off', linkClose: false, linkMin: false, lastFixedEdge: 'right' };
let companionAutoHidden = false;    // 是我们（目标关掉 / 不可见）把它收起来的，才有资格叫回来
let companionStandby = false;       // 目标已关闭 → 收在托盘里待命（托盘提示会写明）
let companionWantLast = null;       // 上一拍的判定结果（**边沿触发**，见 handleCompanionTick）
let companionDockPaused = false;    // 用户自己把窗口拖走了 → 不再拉回，直到「重新贴边」
let companionLastSet = null;        // 我们最后一次**程序化**摆放的坐标（用来识别“用户动过窗口”）
let companionStderr = '';           // 子进程 stderr 尾巴 —— 退出时用来解释“为什么起不来”
let companionLastTarget = null;     // 目标窗口最近一次的矩形（贴边用）
/* 🧲 V4.3.88（用户：跟随模式要像贴在目标身上，想放哪儿就放哪儿）：
   自由跟随模式下记的「窗口相对目标左上角的偏移」。
   用偏移而不用绝对坐标 —— 目标一动，我们按偏移跟着动。 */
let companionRelOffset = null;

/* V4.3.92c（用户：「跟随着主窗口移动后，阅读器不会跟着移动，它会稍微停顿一下然后再瞬移过去」）
   根因是**轮询粒度**：目标位置由那个常驻的 shell 循环每 300ms 报一次，一拍才 setBounds 一次 --
   中间 300ms 窗口纹丝不动，然后整段位移一次性跳过去 = "停顿 + 瞬移"。
   降到 120ms（8.3 拍/秒）：循环体本身只做几次 P/Invoke，这个频率不会把它跑热。 */
const COMPANION_POLL_MS = 120;
const COMPANION_DOCK_TOL = 2;       // 位移容差（px）：小于它算“没动”（我们自己 setBounds 也会有 1px 抖动）
const COMPANION_MIN_W = 120;        // 目标窗口窄于这个宽度时不贴边（拿不到可信矩形）

/* 🆕 V4.3.54（吸色联动）跟随时采目标窗口的框架主色推给渲染层。
   🟥 V4.3.95：采样节流 600ms → **200ms**。观察器轮询在 V4.3.93 已从 300ms 降到 120ms，
   而 600ms 还停在"两拍一次"的旧口径（实际已是 5 拍一次）—— 换目标后要等近 1 秒才变色，
   正是"联动延迟"的另一半。GetPixel 单次 ~48ms、三点 ~144ms，200ms 节奏下主进程占用仍很低。
   颜色量化阈值 6/通道：小于它视为同色不重发，
   避免 IPC 与渲染层过渡动画被像素噪声推着抖（同吸色循环去抖的口径）。 */
let companionTintEnabled = false;
let companionTintLast = null;       // 上次**已发给渲染层**的颜色（量化后比较用）
let companionTintAt = 0;            // 上次采样的时刻（节流）
const COMPANION_TINT_MS = 200;
const COMPANION_TINT_TOL = 6;

/* 🟥 M-1 安全修复(2026-10-13)：名单项会拼进 PowerShell 单引号字符串（companionWatchScript /
   companionTargetActionScript），含引号等字符即可闭合脚本注入任意命令
   （-EncodedCommand 只防命令行转义、不防脚本内容注入）。
   白名单只留进程名合法字符（字母/数字/下划线/点/横杠/空格/中日韩文字），
   引号、反引号、美元符、分号、圆括号等注入关键字符一律丢弃。

   🆕 V4.3.61：这条白名单原来**只在伴随模式**这一条路径上生效；前台监听（自动隐身 / 远控检测）
   用的是 `fgNormalizeList`，只做了 trim + 小写，没有任何字符过滤。
   今天它没被利用，只是因为前台名单**没有进 PowerShell 脚本**（脚本只报前台进程名，
   名单匹配在 JS 侧做，见 `fgList.indexOf`）—— 这是一个**没有门禁保护的隐式不变式**：
   哪天有人把名单拼进脚本（伴随模式当初就是这么演化的），注入面立刻回来。
   所以把白名单抽成唯一入口，两条路径共用，并加门禁钉住。 */
const PROC_NAME_RE = /^[\w.\- \u4e00-\u9fff]+$/;
function normalizeProcList(raw) {
  return String(raw || '')
    .split(/[,，;；\s]+/)
    .map(s => s.trim().toLowerCase().replace(/\.exe$/i, ''))
    .filter(Boolean)
    .filter(s => PROC_NAME_RE.test(s));
}

function companionNormalizeList(raw) {
  return normalizeProcList(raw);
}

function companionWatchScript() {
  // 三个坑与前台监听同源，不能省：① OutputEncoding=UTF8（进程名可能是中文）；
  // ② WriteLine + Flush（走管道会缓冲，不刷一条都收不到）；③ -EncodedCommand 绕开引号地狱。
  return [
    "$sig = @'",
    '[StructLayout(LayoutKind.Sequential)]',
    'public struct RECT { public int L; public int T; public int R; public int B; }',
    /* 🆕 V4.3.55（嵌入叠加）：嵌入要把阅读器摆进目标窗口**客户区内部**——
       GetWindowRect 给的是外框（含标题栏/边框），直接用会盖住目标标题栏；
       GetClientRect 拿客户区尺寸 + ClientToScreen 把客户区原点换算成屏幕坐标。 */
    'public struct PT { public int X; public int Y; }',
    '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
    '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);',
    '[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);',
    '[DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT r);',
    '[DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, out PT p);',
    '[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
    '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);',
    "'@",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -Namespace Cmp -Name Native -MemberDefinition $sig',
    // 第二层兜底：即便白名单将来被放宽，引号也先转义（PowerShell 单引号串内两个连续引号表示字面引号）。
    // ⚠️ 正则里用 \x27 写引号、不写裸引号字符——门禁切片器(_gate_slice.js)不识别正则字面量，
    // 裸引号会被当成字符串定界符把块配平弄歪（规则 51 的新形态：正则字面量同样禁裸定界符）。
    "$names = '" + companionCfg.list.join(',').replace(/\x27/g, '\x27\x27') + "'.Split(',')" ,
    '$self = ' + String(process.pid),
    'while ($true) {',
    '  $fgp = 0',
    '  $h = [Cmp.Native]::GetForegroundWindow()',
    '  [void][Cmp.Native]::GetWindowThreadProcessId($h, [ref]$fgp)',
    '  $run = 0; $vis = 0; $x = 0; $y = 0; $w = 0; $hh = 0; $tpid = 0; $cx = 0; $cy = 0; $cw = 0; $ck = 0',
    '  foreach ($p in @(Get-Process -Name $names -ErrorAction SilentlyContinue)) {',
    '    $run = 1',
    '    $hw = $p.MainWindowHandle',
    '    if ($hw -eq 0) { continue }',
    '    $r = New-Object Cmp.Native+RECT',
    '    if ([Cmp.Native]::GetWindowRect($hw, [ref]$r)) {',
    '      $x = $r.L; $y = $r.T; $w = $r.R - $r.L; $hh = $r.B - $r.T; $tpid = $p.Id',
    '      if ([Cmp.Native]::IsWindowVisible($hw) -and -not [Cmp.Native]::IsIconic($hw)) { $vis = 1 }',
    '      $cr = New-Object Cmp.Native+RECT',
    '      if ([Cmp.Native]::GetClientRect($hw, [ref]$cr)) {',
    '        $cpt = New-Object Cmp.Native+PT',
    '        $cpt.X = 0; $cpt.Y = 0',
    '        if ([Cmp.Native]::ClientToScreen($hw, [ref]$cpt)) { $cx = $cpt.X; $cy = $cpt.Y; $cw = $cr.R; $ck = $cr.B }',
    '      }',
    '    }',
    '    break',
    '  }',
    '  $fg = 0',
    /* 🟥 “前台”要**连我们自己一起算**：用户点一下阅读器，前台就变成我们了 ——
     若只认目标进程，这一下会立刻判定成“目标不在前台”而把窗口藏起来（自己把自己藏了）。 */
    '  if ($tpid -gt 0 -and $fgp -gt 0 -and ($fgp -eq $tpid -or $fgp -eq $self)) { $fg = 1 }',
    '  [Console]::Out.WriteLine("CMP:run=$run;vis=$vis;fg=$fg;x=$x;y=$y;w=$w;h=$hh;cx=$cx;cy=$cy;cw=$cw;ch=$ck")',
    '  [Console]::Out.Flush()',
    '  Start-Sleep -Milliseconds ' + String(COMPANION_POLL_MS),
    '}'
  ].join('\n');
}

function companionParse(line) {
  if (line.indexOf('CMP:') !== 0) return null;
  const st = { run: 0, vis: 0, fg: 0, x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, cw: 0, ch: 0 };
  line.slice(4).split(';').forEach(kv => {
    const i = kv.indexOf('=');
    if (i < 0) return;
    const k = kv.slice(0, i).trim();
    const v = parseInt(kv.slice(i + 1), 10);
    if (Object.prototype.hasOwnProperty.call(st, k) && isFinite(v)) st[k] = v;
  });
  return st;
}

/* 🆕 V4.3.54（吸色联动）跟随时采目标窗口的「框架主色」。
   取样点选**标题栏**：目标窗口顶部 18px / 34px 两条横带的中点 —— 标题栏是应用视觉风格
   最具代表性的框架区，且贴边模式下阅读器在目标侧面、不会盖住这两点。
   ⚠️ 任一取样点若落进主窗自己的 bounds（贴上/下边 + 窗口重叠的极端布局）就丢弃该点：
   采到自己 = 又一条自反馈回路（同 pickScreenColor 的守卫口径）。
   多点取平均 + 量化阈值比较，没变化不重发。失败静默跳过（下一拍再试），不出声 ——
   颜色是锦上添花的功能，采不到不该打扰阅读（但观察器本身坏了照常走 companion:status 出声）。 */
async function companionTintSample() {
  if (!companionTintEnabled) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const t = companionLastTarget;
  if (!t || t.w < COMPANION_MIN_W || t.h <= 40) return;
  const now = Date.now();
  if (now - companionTintAt < COMPANION_TINT_MS) return;
  companionTintAt = now;
  const own = mainWindow.getBounds();
  /* 🟥 V4.3.93（用户：「自动吸色不准，目标程序是黑色的，阅读器却没变黑」）
     旧实现只取**外框**顶部 18/34px 两个点、再取**平均**：
       ① 外框顶部含窗口阴影/边框，很多应用在那里是浅色；
       ② 平均会把"深色标题栏 + 浅色图标/文字"混成中间灰 —— 目标明明是纯黑，量出来是灰的；
       ③ 两个点只要有一个落在按钮/图标上，结果就整体偏亮。
     改成：**客户区**坐标（拿得到就用客户区，拿不到退回外框）+ 三个高度各取一次 +
     **逐通道取中位数**（中位数天然抗单点异常，比平均稳得多）。 */
  const hasClient = t.cx > 0 && t.cw > 40 && t.ch > 40;
  const ax = hasClient ? t.cx : t.x;
  const ay = hasClient ? t.cy : t.y;
  const aw = hasClient ? t.cw : t.w;
  const midX = ax + Math.round(aw / 2);
  const pts = [
    [midX, ay + 6],
    [midX, ay + 18],
    [midX, ay + 30]
  ].filter(([x, y]) => !(x >= own.x && x <= own.x + own.width && y >= own.y && y <= own.y + own.height));
  if (!pts.length) return;
  const cols = [];
  for (const [x, y] of pts) {
    const c = await queryScreenPixel(x, y);   // FIFO 取色服务复用（48ms/次）
    if (c) cols.push(c);
  }
  if (!cols.length) return;
  const median = (arr) => {
    const a = arr.slice().sort((x, y) => x - y);
    const n = a.length;
    return n % 2 ? a[(n - 1) / 2] : Math.round((a[n / 2 - 1] + a[n / 2]) / 2);
  };
  const avg = {
    r: median(cols.map(c => c.r)),
    g: median(cols.map(c => c.g)),
    b: median(cols.map(c => c.b))
  };
  if (companionTintLast &&
      Math.abs(avg.r - companionTintLast.r) <= COMPANION_TINT_TOL &&
      Math.abs(avg.g - companionTintLast.g) <= COMPANION_TINT_TOL &&
      Math.abs(avg.b - companionTintLast.b) <= COMPANION_TINT_TOL) return;
  companionTintLast = avg;
  try { safeSend(mainWindow, 'companion:tint', { r: avg.r, g: avg.g, b: avg.b }); } catch (e) {}
}

/* 🆕 V4.3.94：跟随设置里的「重置」（只重置吸色）。
   🟥 只清渲染层的颜色是不够的：主进程还记着 companionTintLast，
   下一拍采到同一个颜色时量化去抖（COMPANION_TINT_TOL）会判定"没变"而不重发 ——
   用户点了重置却什么都没发生。清缓存 + 清节流时间戳 + 立刻重采一次。 */
function resetCompanionTintState() {
  companionTintLast = null;
  companionTintAt = 0;
  try { companionTintSample().catch(() => {}); } catch (e) {}
}

/* 🆕 V4.3.54（目标自动检测）检测「阅读器当前位置正下方」是哪个应用。
   思路：EnumWindows 按 Z 序扫可见顶层窗口，跳过自己进程的（主窗+面板同 pid）、
   最小化的、DWM cloaked 的（UWP 幽灵窗）和尺寸过小的（气泡/工具条），
   第一块盖住阅读器中心点的就是用户“放阅读器的那块地”。
   刻意**不动鼠标/不改自己的命中属性**：setIgnoreMouseEvents 那条路要把自窗透明
   几百 ms（一次 PowerShell 冷启动的时长），期间用户点击会穿透，风险不可控。
   找不到（阅读器悬在桌面空白上）如实回空，渲染层出声引导。 */
function companionDetectScript(cx, cy, selfPid) {
  return [
    "$sig = @'",
    '[StructLayout(LayoutKind.Sequential)]',
    'public struct RECT { public int L; public int T; public int R; public int B; }',
    'public delegate bool EnumProc(IntPtr h, IntPtr l);',
    '[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);',
    '[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
    '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
    '[DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);',
    "public static int FindTopmostOther(int cx, int cy, int selfPid) {",
    "  int found = 0;",
    "  EnumWindows(delegate(IntPtr h, IntPtr l) {",
    "    if (found != 0) return true;",
    "    if (!IsWindowVisible(h) || IsIconic(h)) return true;",
    "    uint pid; GetWindowThreadProcessId(h, out pid);",
    "    if (pid == (uint)selfPid) return true;",
    "    int cloaked; DwmGetWindowAttribute(h, 14, out cloaked, 4);",
    "    if (cloaked != 0) return true;",
    "    RECT r; if (!GetWindowRect(h, out r)) return true;",
    "    if (r.R - r.L < 80 || r.B - r.T < 60) return true;",
    "    if (cx >= r.L && cx < r.R && cy >= r.T && cy < r.B) { found = (int)pid; return false; }",
    "    return true;",
    "  }, IntPtr.Zero);",
    "  return found;",
    "}",
    "'@",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -Namespace Det -Name Native -MemberDefinition $sig',
    '$pid2 = [Det.Native]::FindTopmostOther(' + cx + ',' + cy + ',' + selfPid + ')',
    '$name = ""',
    'if ($pid2 -gt 0) { $p = Get-Process -Id $pid2 -ErrorAction SilentlyContinue; if ($p) { $name = $p.ProcessName } }',
    '[Console]::Out.WriteLine("DET:" + $name)',
    '[Console]::Out.Flush()'
  ].join('\n');
}

/* 🟥 V4.3.97（审查 R-8）：每次检测都真起一个 powershell + Add-Type（约 1s）。
   连点 🎯 10 次 = 10 个并发进程编译同一段 C#，主进程内存/CPU 尖峰。
   互斥 + 如实回 busy：第二次点击不再起进程，渲染层据此提示"正在检测"。 */
let companionDetectRunning = false;
async function detectCompanionApp() {
  if (companionDetectRunning) return { ok: false, name: '', why: 'busy' };
  companionDetectRunning = true;
  try { return await detectCompanionAppInner(); }
  finally { companionDetectRunning = false; }
}

async function detectCompanionAppInner() {
  const empty = { ok: false, name: '', why: 'none' };
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return empty;
    const b = mainWindow.getBounds();
    const cx = b.x + Math.round(b.width / 2);
    const cy = b.y + Math.round(b.height / 2);
    const encoded = Buffer.from(companionDetectScript(cx, cy, process.pid), 'utf16le').toString('base64');
    const out = await new Promise(resolve => {
      /* 一次性探针：检出即退。5s 上限（PowerShell 冷启动 + Add-Type 编译的 3 倍余量，规则 53）；
         超时杀进程回「检测失败」，绝不让渲染层 await 挂死（规则 41）。 */
      let done = false;
      const finish = v => {
        if (done) return; done = true;
        /* 🟥 V4.3.97（第 2 轮复审）：spawn 抛错时 child 为 undefined，kill 会抛 TypeError；
           原来被空 catch 吞掉且不留痕迹，于是"探针根本没起来"在日志里毫无线索。 */
        try { if (child) child.kill(); }
        catch (e) { logToFile('warn', '伴随检测探针收尾失败: ' + errTextOf(e)); }
        resolve(v);
      };
      const timer = setTimeout(() => finish({ ok: false, name: '', why: 'timeout' }), 5000);
      let child;
      try {
        child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (e) { clearTimeout(timer); finish({ ok: false, name: '', why: 'spawn-failed' }); return; }
      let buf = '';
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buf += chunk;
        const i = buf.indexOf('\n');
        if (i < 0) return;
        const line = buf.slice(0, i).trim();
        clearTimeout(timer);
        if (line.indexOf('DET:') === 0) {
          const nm = line.slice(4).trim();
          finish(nm ? { ok: true, name: nm, why: '' } : empty);
        } else finish(empty);
      });
      child.on('error', () => { clearTimeout(timer); finish({ ok: false, name: '', why: 'spawn-failed' }); });
      child.on('exit', () => { clearTimeout(timer); finish(empty); });
    });
    return out;
  } catch (err) {
    logToFile('error', 'companion detect failed: ' + errTextOf(err));
    return { ok: false, name: '', why: 'fail' };
  }
}

/* 🟥 规则 41：主进程知道坏了必须回传渲染层 —— 与前台监听同一个出口套路
   （只写日志 = 界面在骗你：开关亮着、实际什么都没发生）。 */
function reportCompanionStatus(ok, reason, detail) {
  companionActive = !!ok;
  try {
    logToFile(ok ? 'info' : statusLogLevel(reason),
      '伴随模式' + (ok ? '已启动' : '不可用') + '[' + reason + ']' +
      (detail ? ' · ' + detail : '') + (companionCfg.list.length ? ' · 目标=' + companionCfg.list.join(',') : ''));
  } catch (e) {}
  try {
    safeSend(mainWindow, 'companion:status', { ok: !!ok, reason: String(reason || ''), detail: String(detail || ''), list: companionCfg.list.join(',') });
  } catch (e) {}
}

function refreshCompanionTray() {
  if (!tray || tray.isDestroyed && tray.isDestroyed()) return;
  try {
    if (companionStandby && companionActive) {
      tray.setToolTip(TT('浅水鲸（伴随待命：' + (companionCfg.list.join(',') || '目标程序') + ' 关着，它一开我就回来）',
        'Shallow Whale (standby: waiting for ' + (companionCfg.list.join(',') || 'target') + ')'));
    } else {
      tray.setToolTip(TT('浅水鲸', 'Shallow Whale'));
    }
  } catch (e) {}
}

function stopCompanionWatch() {
  /* 🆕 V4.3.79：伴随关闭 → 撤掉伴随置顶（专注模式的置顶不受影响，由收口统一判） */
  if (companionTopActive) { companionTopActive = false; applyAlwaysOnTop(); }
  companionToken++;
  if (companionProc) {
    try { companionProc.kill(); } catch (e) {}
    companionProc = null;
  }
  companionStopGlide();          /* V4.3.92c：定时器必须跟观察器一起停，否则会一直空转 */
  companionActive = false;
  companionAutoHidden = false;
  companionStandby = false;
  companionWantLast = null;
  companionLastSet = null;
  companionRelOffset = null;   /* 🧲 V4.3.88：重新开始观察（换目标/重启）时，旧相对偏移必须作废 */
  companionStderr = '';
  companionTintLast = null;   // 🆕 V4.3.54：换目标/重启观察器后颜色从零重新收敛，别拿旧色当"没变"
  refreshCompanionTray();
}

/* 🆕 V4.3.55（嵌入叠加，替换原“贴边”语义）：把阅读器摆进目标窗口**客户区内部**的指定区域之上。
   - 定位基准：客户区（cx/cy/cw/ch）；旧数据（无客户区字段）兜底退回外框，偏一点总比不跟好。
   - 尺寸：优先保持阅读器当前尺寸；比客户区大就收缩到放得下（每边留 $m 内距）。
   - 锚点：right=客户区右缘内贴 / left=左缘 / top=顶缘 / bottom=底缘 / center=正中；
     纵向（right/left）垂直居中，横向（top/bottom）水平居中。
   - 终值再夹回客户区矩形内，绝不出界。找不到位置时**不是不动**，而是夹回客户区 ——
     目标窗口比阅读器还小的时候，宁可压住目标内容一点，也不能把阅读器送到客户区外。 */
/* V4.3.92c：把"一次跳到位"摊成"十几帧小步走"。
   做法是指数趋近（每 16ms 走剩余距离的 35%），到位即停 --
   不常驻 60fps，只在"离目标还远"的那一小段时间里跑。
   🟥 为什么不是"记录起点 + 按时间插值"：目标每 120ms 就会更新一次，
   按时间插值每次都要重算起点，容易在半路抖；指数趋近天然支持"中途改目标"。 */
const COMPANION_GLIDE_MS = 16;
const COMPANION_GLIDE_K = 0.35;
let companionGlideTimer = null;
let companionGlideWant = null;

function companionStopGlide() {
  if (companionGlideTimer) { try { clearInterval(companionGlideTimer); } catch (e) {} companionGlideTimer = null; }
  companionGlideWant = null;
}

function companionGlideStep() {
  if (!mainWindow || mainWindow.isDestroyed() || !companionGlideWant) { companionStopGlide(); return; }
  let cur;
  try { cur = mainWindow.getBounds(); } catch (e) { companionStopGlide(); return; }
  const w = companionGlideWant;
  /* 🟥 V4.3.97（代码审查 R-7）：缓动只在"新"的 companionDock 里被全屏守卫拦着，
     已经在跑的定时器不管这些 —— 自由跟随下目标持续移动时进全屏，16ms 后这一帧
     仍会按旧的 companionGlideWant setBounds，把窗口从全屏位置拽回小矩形，
     而 mainFullScreen 还记着"在全屏"。这里补一道帧级守卫。 */
  if (mainFullScreen) { companionStopGlide(); return; }
  const near = (a, b) => Math.abs(a - b) <= 1;
  if (near(cur.x, w.x) && near(cur.y, w.y) && near(cur.width, w.width) && near(cur.height, w.height)) {
    companionStopGlide();
    return;
  }
  const step = (a, b) => {
    const v = Math.round(a + (b - a) * COMPANION_GLIDE_K);
    return near(v, b) ? b : v;                 /* 收尾直接落到目标，避免"永远差 1px" */
  };
  const next = { x: step(cur.x, w.x), y: step(cur.y, w.y) };
  /* 只有尺寸真的要变才带上 w/h —— 纯移动时每帧 setBounds(width,height) 会额外触发重排 */
  if (!near(cur.width, w.width)) next.width = step(cur.width, w.width);
  if (!near(cur.height, w.height)) next.height = step(cur.height, w.height);
  try {
    mainWindow.setBounds(next);
    companionLastSet = mainWindow.getBounds();   /* 每帧都记，免得被 movedByUser 判成"用户拖的" */
  } catch (e) {
    companionStopGlide();
  }
}

function companionGlideTo(want) {
  companionGlideWant = want;
  if (companionGlideTimer) return;             /* 已在跑：换目标即可，帧内会读到新值 */
  try { companionGlideTimer = setInterval(companionGlideStep, COMPANION_GLIDE_MS); } catch (e) { companionGlideTimer = null; }
}

function companionDesiredBounds(t) {
  const b = mainWindow.getBounds();
  const edge = companionCfg.edge;
  if (edge === 'off') return { x: b.x, y: b.y, width: b.width, height: b.height };   // 不嵌入：不挪（调用点本就跳过，兜底）
  /* 🧲 V4.3.88 自由跟随：保持用户摆好的相对位置，目标怎么动就怎么动。
     尺寸不变（用户自己拉的大小不该被我们改）；偏移没建立时就以**当前位置**为基准。 */
  if (edge === 'free') {
    const off = companionRelOffset || { dx: b.x - t.x, dy: b.y - t.y };
    return { x: Math.round(t.x + off.dx), y: Math.round(t.y + off.dy), width: b.width, height: b.height };
  }
  const hasClient = t.cx > 0 && t.cw > 40 && t.ch > 40;
  const ax = hasClient ? t.cx : t.x, ay = hasClient ? t.cy : t.y;
  const aw = hasClient ? t.cw : t.w, ah = hasClient ? t.ch : t.h;
  const m = 6;   // 客户区内边距：留一线目标内容可见，也让嵌入体不至于顶死边框
  let W = Math.min(b.width, aw - 2 * m);   W = Math.max(W, 200);
  let H = Math.min(b.height, ah - 2 * m);  H = Math.max(H, 150);
  let x, y;
  if (edge === 'right')       { x = ax + aw - W - m; y = ay + Math.round((ah - H) / 2); }
  else if (edge === 'left')   { x = ax + m;          y = ay + Math.round((ah - H) / 2); }
  else if (edge === 'top')    { x = ax + Math.round((aw - W) / 2); y = ay + m; }
  else if (edge === 'bottom') { x = ax + Math.round((aw - W) / 2); y = ay + ah - H - m; }
  else /* center */           { x = ax + Math.round((aw - W) / 2); y = ay + Math.round((ah - H) / 2); }
  x = Math.min(Math.max(x, ax), ax + Math.max(0, aw - W));
  y = Math.min(Math.max(y, ay), ay + Math.max(0, ah - H));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(W), height: Math.round(H) };
}

function companionDock() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  /* 🟥 全屏守卫：吸附＝把窗口挪到目标旁边，全屏时这一挪就直接毁掉全屏。
     调用点目前只有 handleCompanionTick 一处（那里已整体让位），这里再钉一道，
     防将来有人从别处调它（"同一个动作多个入口"就是这么长出来的）。 */
  if (mainFullScreen) return;
  if (companionCfg.edge === 'off' || companionDockPaused) return;
  if (!mainWindow.isVisible()) return;
  /* 🟥 这里**不许**写 `companionLastSet && companionLastTarget` —— 探针
     （_r12_companion.js 首版 21/25）就是这么抓到的：companionLastSet 只在
     **贴边成功之后**才被赋值，拿它当进入条件 ⇒ 第一次进不来、于是永远是第一次 ⇒
     贴边**一次都不会执行**（功能整体是死的，而所有"没贴边"的判据都静默通过）。
     真正的进入条件是"目标矩形可信"，与"我们摆过没有"无关。 */
  const t = companionLastTarget;
  if (!t || t.w < COMPANION_MIN_W || t.h <= 0) return;
  /* 🟥「拖走即暂停」的判据：我们在上一拍摆放之后**没人再来动它**，
     现在读到的坐标却不一样 ⇒ 是用户自己拖的（或者被别的软件挪了）。
     两边都是我们自己写的值，所以容差只要盖住 1px 取整抖动即可。 */
  const cur = mainWindow.getBounds();
  /* 🧲 V4.3.88（门禁 F2/F4 抓到的真缺陷）：自由跟随的偏移必须**建立一次并存住**。
     第一版只在 companionDesiredBounds 里写 `companionRelOffset || {dx: b.x - t.x}` ——
     偏移从来没被赋值，于是每一拍都用“当前位置 − 当前目标”现算 ⇒
     目标位置 + 偏移 恒等于当前位置 ⇒ **窗口永远不动**（看着像“跟随生效了”，实际一步没跟）。
     所以在这里建立一次：第一次摆放就是基准，之后只读不算。 */
  if (companionCfg.edge === 'free' && !companionRelOffset) {
    companionRelOffset = { dx: cur.x - t.x, dy: cur.y - t.y };
    logToFile('info', '伴随模式（自由跟随）：以当前位置为基准，偏移 ' + companionRelOffset.dx + ',' + companionRelOffset.dy);
  }
  const want = companionDesiredBounds(t);
  /* 🟥 V4.3.53（R12-4）修一个真缺陷 —— 探针 R12C_UI_BAR_ON_PAUSE 抓到的：
     原来这里是裸 `return;`（早退**不写 companionLastSet**）。而 companionLastSet 是
     `movedByUser` 判定的唯一依据（`companionLastSet && …`，null 时整条判定恒为 false）。
     于是只要"窗口当前正好就在贴边位置"命中这次早退，判定就被**解除武装**：
     下一拍用户真把窗口拖走，代码会当成"我们还没摆过"→ 直接 setBounds 把它**拽回来**
     —— 用户看到的是"拖了又弹回去"，而不是"停下来 + 告诉你贴边暂停了"。

     能走到的真实路径（不是只有探针能造出来）：
       ① 用户习惯性地先把阅读器**手动拖到目标程序旁边**，再去开伴随模式选「贴右侧」；
       ② 或者刚点过「贴回去」、窗口已经回到位。
     两种情况下 cur ≈ want ⇒ 命中早退 ⇒ companionLastSet 一直是 null。
     （另外每次改配置都会重启观察器，stopCompanionWatch 里会把 companionLastSet 清成 null，
       所以"清空后第一次恰好就在位"是个常态入口，不是边角。）

     修法：cur 已经在目标位 ⇒ 这里就是**我们认可的位置**，照样记下来再返回。
     不会误判"用户拖走"：cur≈want 时本来就没有位移可判。 */
  /* 🆕 V4.3.55（嵌入）：嵌入还会**改窗口尺寸**，所以“已在位”判定 x/y 之外要比上 w/h ——
     否则尺寸不一致时每拍都 setBounds（浪费且会把用户刚调好的大小掰回去）。 */
  if (Math.abs(cur.x - want.x) <= COMPANION_DOCK_TOL && Math.abs(cur.y - want.y) <= COMPANION_DOCK_TOL &&
      Math.abs(cur.width - want.width) <= COMPANION_DOCK_TOL && Math.abs(cur.height - want.height) <= COMPANION_DOCK_TOL) {
    companionLastSet = cur;
    companionStopGlide();      /* 已经在目标位：缓动没必要再跑 */
    return;
  }
  /* 缓动进行中 cur 每帧都在变，会被误判成"用户拖的" —— 这时跳过用户拖动判定 */
  const movedByUser = !companionGlideTimer && companionLastSet &&
    (Math.abs(cur.x - companionLastSet.x) > COMPANION_DOCK_TOL || Math.abs(cur.y - companionLastSet.y) > COMPANION_DOCK_TOL);
  if (movedByUser) {
    /* V4.3.92c（用户：「嵌入位置只有左右上下跟居中，能不能做成……我拖到哪里就在哪里嵌入」）
       以前非自由跟随下拖窗口 = 暂停贴边（还要用户再点一次「贴回去」）；
       现在**拖动本身就是"换个地方嵌"**：记下相对偏移、自动切成自由跟随、继续跟。
       这样五种固定位只是"快捷落点"，真正的定位方式是拖 —— 与直觉一致。 */
    if (companionCfg.edge !== 'free') {
      if (companionCfg.edge !== 'off') companionCfg.lastFixedEdge = companionCfg.edge;
      companionCfg.edge = 'free';
      logToFile('info', '伴随模式：用户拖动窗口 → 转为自由跟随（原固定位 ' + companionCfg.lastFixedEdge + ' 已记住）');
      /* 让渲染层跟着改：下拉显示「自由跟随」、配置落盘，否则界面与真实行为不一致 */
      try { safeSend(mainWindow, 'companion:dock', { paused: false, edge: 'free', switched: true }); } catch (e) {}
    }
    companionRelOffset = { dx: cur.x - t.x, dy: cur.y - t.y };
    companionLastSet = cur;
    logToFile('info', '伴随模式（自由跟随）：按新位置重贴，偏移 ' + companionRelOffset.dx + ',' + companionRelOffset.dy);
    return;
  }
  try {
    /* V4.3.92c：不再一次性 setBounds（那就是"瞬移"），改成 16ms 一帧的指数趋近；
       每帧内部会把 companionLastSet 更新成实际落点，所以"用户拖动"判定不会被自己误导。 */
    companionGlideTo(want);
    companionLastSet = mainWindow.getBounds();
  } catch (e) {
    logToFile('error', '伴随模式贴边失败: ' + errTextOf(e));
  }
}

/* 边沿触发：只在「该显示 / 不该显示」**发生变化**的那一拍动手。
   这样用户手动从托盘把窗口叫回来时，我们不会下一拍又把它按回去。 */
function handleCompanionTick(st) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  /* 🟥 V4.3.53：**用户明确表达的意图，伴随模式整体让位** ——
     ① 全屏（mainFullScreen）：那是用户主动在说「我现在专心看书」。若让吸附照跑，
        下一拍就会把窗口从铺满整屏的状态挪到目标旁边 ＝ 当场破坏全屏（而 mainFullScreen
        还记着"在全屏"⇒ 再双击一次会"退出"到一个本来就不是全屏的状态）；
        若让收起照跑，则人正读得入神时窗口被自动藏掉。所以全屏期间**既不吸附、也不收起/恢复**。
     ② SOS（uiHiddenState.sos）：SOS 键藏起来的窗口，不许伴随模式自己叫回来。
     这与既有「防窥优先」（fgAutoHidden / privacyHiddenBy）同一个道理：
     **用户明确表达的意图 > 自动化**。退出全屏 / 解除 SOS 之后，下一拍照常接管。 */
  if (mainFullScreen) return;
  if (uiHiddenState && uiHiddenState.sos) return;
  const mode = companionCfg.mode;
  const alive = !!st.run;
  const seen = alive && !!st.vis;
  let want;
  if (mode === 'process') want = alive;
  else if (mode === 'visible') want = seen;
  else want = seen && !!st.fg;           // foreground（默认）

  if (want) companionLastTarget = { x: st.x, y: st.y, w: st.w, h: st.h, cx: st.cx, cy: st.cy, cw: st.cw, ch: st.ch };
  else if (!alive) companionLastTarget = null;

  /* 🆕 V4.3.79（用户要求）：伴随模式开启时主窗**置顶**（floating 级），不被其他窗口遮挡；
     但**目标窗口全屏时让位**（需求明确「跟随模式不能全屏」）——目标矩形铺满屏幕（≥95% 且
     贴近左上角）视为全屏，此刻取消置顶让目标窗口盖上来，退出全屏下一拍自动恢复。
     专注模式（topFocus）优先级更高，不受让位影响——专心读书是用户更明确的意图。 */
  /* 🟥 V4.3.82 审查修复：全屏判定**必须用物理分辨率（display.size），不能用工作区（workAreaSize）**。
     最大化窗口的 bounds 恰好等于工作区（宽=workArea.width、高=workArea.height、x/y=0）——
     拿工作区当基准会把「最大化」误判成「全屏」，导致用户一把目标窗口最大化，伴随置顶就被
     错误让位（违反用户「不被遮挡」的要求）。全屏窗口的高度会覆盖任务栏区域（≈size.height），
     最大化不会，用 size 才能区分。任务栏设成自动隐藏时最大化≈整屏，此时判全屏可接受。 */
  /* 🟥 V4.3.83 审查补：必须用**目标窗口所在的那块屏**的尺寸，不能用主屏 ——
     目标在副屏全屏时，主屏尺寸判定会直接判错（副屏可能更小或更大），
     结果要么该让位时不让、要么把副屏最大化误判成全屏。 */
  const disp = screen.getDisplayMatching({ x: st.x, y: st.y, width: st.w, height: st.h });
  const fullW = disp.size.width, fullH = disp.size.height;
  const tgtFullscreen = want && st.w >= fullW * 0.98 && st.h >= fullH * 0.98 && st.x <= 8 && st.y <= 8;
  /* 🧲 V4.3.88（用户原话：“它那个永远置顶只是在它贴在你那个应用上，永远置顶在那个应用上…
     但如果我套了一件衣服的话，我上面有一个应用的话，它是会盖住我们的阅读窗口的，这个是正常的”）
     ⇒ 置顶是**相对目标**，不是全局。
        · 目标在前台（或我们在前台）→ 压在目标之上（floating）；
        · 目标被别的应用盖住 → **取消置顶**，让那个应用同时盖住我们（与“贴在人身上、人套了件外套”一致）。
     🛥 判据用观察器给的 fg：脚本里 `$fgp -eq $tpid -or $fgp -eq $self` 都记 1 ——
        后者是“用户正点着我们的窗口”，那时当然要看得见，一并算作该置顶。
     🛥 专注模式（topFocus / screen-saver 级）优先级更高，不受这条影响（applyAlwaysOnTop 内部处理）。 */
  const tgtForeground = !!st.fg;
  const wantTop = want && !tgtFullscreen && tgtForeground;
  if (companionTopActive !== wantTop) {
    companionTopActive = wantTop;
    if (!topFocus) applyAlwaysOnTop();
    logToFile('info', '伴随模式置顶: ' + (wantTop ? 'on（相对目标）'
      : 'off（' + (tgtFullscreen ? '目标全屏让位' : '目标不在前台，跟随让位') + '）'));
  }

  /* 🆕 V4.3.54（吸色联动）：有可信目标矩形就顺手采一拍框架色（内部 600ms 节流+量化去抖）。
     浮动 Promise 必须 .catch（规则 48）—— 采样挂在 tick 链上，炸了不能把 tick 带走。 */
  if (want) { try { companionTintSample().catch(e => logToFile('error', '伴随吸色采样失败: ' + errTextOf(e))); } catch (e) {} }

  if (companionWantLast === null) { companionWantLast = want; return; }   // 第一拍只记录，不动手
  if (want === companionWantLast) { if (want) companionDock(); return; }
  companionWantLast = want;

  if (!want) {
    /* 目标关掉 / 最小化 / 切到别的软件 —— 收起窗口。
       只有“本来就是显示状态”时才动它（同前台监听：免得跟用户手动隐藏/SOS 打架）。 */
    if (mainWindow.isVisible()) {
      try { closeAllPanels(); } catch (e) {}
      /* 🆕 V4.4.0：伴随模式自动收起也是**被动隐藏** —— 同前台监听，强制停朗读 */
      try { safeSend(mainWindow, 'window:visibility', false, true); } catch (e) {}
      mainWindow.hide();
      companionAutoHidden = true;
      logToFile('info', '伴随模式：' + (alive ? '目标不在前台/不可见 → 收起' : '目标已关闭 → 收托盘待命'));
      try { safeSend(mainWindow, 'companion:standby', { standby: !alive, alive: alive }); } catch (e) {}
    }
    companionStandby = !alive;
    refreshCompanionTray();
    return;
  }

  companionStandby = false;
  refreshCompanionTray();
  /* 🛡 防窥优先：前台监听的自动隐身（fgAutoHidden）或投屏/远控隐身（privacyHiddenBy）
     还激活着的时候，伴随模式**不许**把窗口抢回来 —— 两个隐私功能不该互相打架。 */
  if (fgAutoHidden || privacyHiddenBy) return;
  if (companionAutoHidden && !mainWindow.isVisible()) {
    try {
      mainWindow.setOpacity(1);
      mainWindow.showInactive();      // 不抢焦点（抢焦点会吃掉用户正在敲的字）
      companionAutoHidden = false;
      logToFile('info', '伴随模式：目标回来了 → 恢复显示');
      try { safeSend(mainWindow, 'companion:standby', { standby: false, alive: true }); } catch (e) {}
    } catch (e) {
      logToFile('error', '伴随模式恢复显示失败: ' + errTextOf(e));
    }
  }
}

function startCompanionWatch(cfg) {
  companionCfg = {
    enabled: true,
    list: companionNormalizeList(cfg && cfg.list),
    mode: (cfg && cfg.mode) || 'foreground',
    edge: (cfg && cfg.edge) || 'off',
    tint: !!(cfg && cfg.tint),   // 🆕 V4.3.54：吸色联动开关（只门控采样，不参与观察器重启判等）
    /* 🆕 V4.3.55：生命周期联动开关（只门控 close/minimize/restore 事件动作，不参与重启判等） */
    linkClose: !!(cfg && cfg.linkClose),
    linkMin: !!(cfg && cfg.linkMin),
    lastFixedEdge: (cfg && cfg.lastFixedEdge) || companionCfg.lastFixedEdge || 'right'
  };
  /* 固定位一旦被选中就记下来，供「贴回去」在自由跟随下还原 */
  if (companionCfg.edge === 'left' || companionCfg.edge === 'right' || companionCfg.edge === 'top' ||
      companionCfg.edge === 'bottom' || companionCfg.edge === 'center') {
    companionCfg.lastFixedEdge = companionCfg.edge;
  }
  stopCompanionWatch();
  companionCfg.enabled = true;   /* stopCompanionWatch 会清状态，但配置要留着 */
  companionTintEnabled = companionCfg.tint;
  if (process.platform !== 'win32') { reportCompanionStatus(false, 'unsupported-platform', process.platform); return; }
  if (!companionCfg.list.length) { reportCompanionStatus(false, 'empty-list', ''); return; }
  if (!app.isReady()) { reportCompanionStatus(false, 'not-ready', ''); return; }
  let args;
  try {
    const encoded = Buffer.from(companionWatchScript(), 'utf16le').toString('base64');
    args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
  } catch (e) {
    reportCompanionStatus(false, 'build-script', errTextOf(e));
    return;
  }
  try {
    companionProc = spawn('powershell', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    companionProc = null;
    reportCompanionStatus(false, 'spawn-failed', errTextOf(e));
    return;
  }
  const token = ++companionToken;      // 取号必须在 stopCompanionWatch 之后（它会推进一格）
  const proc = companionProc;
  let buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', chunk => {
    if (companionProc !== proc) return;
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      const st = companionParse(line);
      if (st) {
        try { handleCompanionTick(st); } catch (e) { logToFile('error', '伴随模式处理失败: ' + errTextOf(e)); }
      }
    }
  });
  /* stderr 留一截尾巴：起不来时（Add-Type 失败 / 被安全软件拦）**带上原因**再报，
     否则用户只看到“不可用”，跟规则 41 的“界面在骗你”只差一层。 */
  try {
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', chunk => {
      if (companionProc !== proc) return;
      companionStderr = (companionStderr + String(chunk)).slice(-400);
    });
  } catch (e) {}
  proc.on('exit', (code, signal) => {
    if (companionProc === proc) companionProc = null;
    if (token === companionToken) {
      reportCompanionStatus(false, 'exited', 'code=' + code + ' signal=' + (signal || '') +
        (companionStderr ? ' · stderr=' + companionStderr.replace(/\s+/g, ' ').trim() : ''));
    }
  });
  proc.on('error', (err) => {
    if (companionProc === proc) companionProc = null;
    if (token === companionToken) reportCompanionStatus(false, 'child-error', errTextOf(err));
  });
  reportCompanionStatus(true, 'started', '');
}

function setCompanion(cfg) {
  if (!cfg || !cfg.enabled) {
    companionTintEnabled = false;   // 🆕 V4.3.54：伴随一关，采样同步停（渲染层自己也会清色）
    companionCfg.enabled = false;   // 🆕 V4.3.55：联动判据读 companionCfg.enabled，关闭时必须同步落账
    stopCompanionWatch();
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return;
  /* 🆕 V4.3.54：吸色开关**先落账再判等** —— 它只门控采样、不需要重启观察器，
     所以刻意不进下面的 same 比较（不然每切一次吸色开关都杀/拉一次 PowerShell）。 */
  companionTintEnabled = !!(cfg && cfg.tint);
  /* 🆕 V4.3.55：生命周期联动开关同理 —— 只影响主窗 close/minimize/restore 事件动作，不重启观察器 */
  companionCfg.linkClose = !!(cfg && cfg.linkClose);
  companionCfg.linkMin = !!(cfg && cfg.linkMin);
  const same = companionActive && companionCfg.enabled &&
    companionCfg.list.join(',') === companionNormalizeList(cfg.list).join(',') &&
    companionCfg.mode === ((cfg && cfg.mode) || 'foreground') &&
    companionCfg.edge === ((cfg && cfg.edge) || 'off');
  if (same) return;                                  // 配置没变就别重启观察器（重启会丢“待命”状态）
  startCompanionWatch(cfg);
}

/* 「重新贴边」：把“用户拖走”那个暂停解除，下一拍重新算位置。
   🟥 这里**不改用户的设置**：贴边位置选的是「关闭」时就没有贴边可恢复，
   如实回一个 resumed:false 让渲染层提示「先选贴边位置」——
   若在这里偷偷把 edge 改成 right，界面还显示「关闭」，就是又一次“界面在骗你”。 */
function resumeCompanionDock() {
  /* V4.3.92c：自由跟随下点「贴回去」= 回到用户上次选的固定嵌入位。
     没有固定位可回（一直就是自由跟随）就退回"以当前位置为基准重新跟随"，并如实回报。 */
  let restored = false;
  if (companionCfg.edge === 'free' && companionCfg.lastFixedEdge && companionCfg.lastFixedEdge !== 'off') {
    companionCfg.edge = companionCfg.lastFixedEdge;
    companionRelOffset = null;
    restored = true;
    try { safeSend(mainWindow, 'companion:dock', { paused: false, edge: companionCfg.edge, restored: true }); } catch (e) {}
  }
  const canResume = companionCfg.edge !== 'off';
  companionDockPaused = false;
  companionLastSet = null;                           // 清掉旧落点，免得第一拍把它误判成“用户又拖了”
  companionRelOffset = null;   /* 🧲 V4.3.88：重新开始观察（换目标/重启）时，旧相对偏移必须作废 */
  companionWantLast = null;                          // 下一拍只记录、不动手（避免立刻抢焦点式挪窗）
  return { edge: companionCfg.edge, active: companionActive, resumed: canResume, restored: restored };
}

/* 🆕 V4.3.55（窗口生命周期联动）需求：关闭阅读器 → 目标窗口一起关；
   最小化阅读器 → 目标一起最小化；恢复/打开阅读器 → 目标一起恢复。
   实现方式：对 companionCfg.list 里的目标进程主窗口逐个发系统消息 ——
   close=WM_CLOSE(0x0010，等价点 X，应用自己走保存/退出流程)；
   min=ShowWindow SW_MINIMIZE(6)；restore=ShowWindow SW_RESTORE(9)。
   🟥 min/restore 都带 IsIconic 守卫：对**最大化**窗口发 SW_RESTORE 会把它从最大化
   掰回普通态（灾难）；已最小化的再 SW_MINIMIZE 也无意义。
   名单已过 companionNormalizeList 白名单（无引号类字符），这里再做一层转义兜底。 */
/* 🟥 V4.3.95（用户：「目前联动方面的延迟较大」）实测 `_diag_link_latency.js`：
   每次点「关闭联动 / 最小化联动」都要 spawn 一个全新 PowerShell + Add-Type 编译 P/Invoke，
   冷 1092ms / 热 944ms / 热 877ms，**平均 971ms** —— 用户点完阅读器关了，目标要等近一秒才动。
   改成**常驻侧车**：Add-Type 只编译一次，之后从 stdin 读命令，一条动作 ~几毫秒。
   模式与屏幕取色服务（45-picker.js）同款：FIFO 一问一答、空闲自退、异常回退。 */
const LINK_IDLE_MS = 60000;      // 空闲 60s 自退（与取色服务一致）
const LINK_WAIT_MS = 3000;       // 单条命令超时：超时即认为侧车坏了，杀掉并回退一次性脚本
let linkProc = null;
let linkWaiters = [];

/* 🟥 V4.3.97（第 2 轮复审 R-19）：结算出口原来有 5 个（DONE / exit / kill / 超时 /
   stdin 写异常），各自 clearTimeout + 各自决定是否回退。并发超时时会**重复结算**：
   A 的 timer 先 splice 自己 → killLinkSidecar('timeout') 回退队列里其余的 B →
   B 的 timer 回调已经入队（clearTimeout 撤不掉），随后执行时 indexOf 返回 -1，
   却仍无条件再跑一次 fallbackLinkAction ⇒ 连发两条联动 + 侧车卡住时，
   目标窗口会收到**两次** WM_CLOSE / 弹两次保存确认。
   统一成带 settled 标志的单一出口：一条动作无论从哪条路径来，只结算一次。
   ⚠️ fallbackLinkAction 是函数声明（hoisted），在此引用无 TDZ。 */
function settleLinkWaiter(w, doFallback) {
  if (!w || w.settled) return;
  w.settled = true;
  try { clearTimeout(w.timer); } catch (e) {}
  if (doFallback) { try { fallbackLinkAction(w.action, w.why); } catch (e) {} }
}
function settleAllLinkWaiters(list, doFallback) {
  (list || []).forEach(w => settleLinkWaiter(w, doFallback));
}
let linkBuf = '';
let linkIdleTimer = null;

function linkSidecarScript() {
  return [
    "$sig = @'",
    '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);',
    '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);',
    '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
    "'@",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -Namespace CmpLnk -Name Native -MemberDefinition $sig',
    '[Console]::Out.WriteLine("LNK:READY")',
    '[Console]::Out.Flush()',
    'while ($true) {',
    '  $line = [Console]::In.ReadLine()',
    '  if ($null -eq $line) { break }',
    '  $parts = $line.Split([char]9)',
    '  if ($parts.Length -lt 2) { [Console]::Out.WriteLine("LNK:DONE"); [Console]::Out.Flush(); continue }',
    '  $action = $parts[0]',
    '  $names = $parts[1].Split([char]44)',
    '  foreach ($p in @(Get-Process -Name $names -ErrorAction SilentlyContinue)) {',
    '    $h = $p.MainWindowHandle',
    '    if ($h -eq [IntPtr]::Zero) { continue }',
    '    if ($action -eq "close") { [void][CmpLnk.Native]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) }',
    '    elseif ($action -eq "min") { if (-not [CmpLnk.Native]::IsIconic($h)) { [void][CmpLnk.Native]::ShowWindow($h, 6) } }',
    '    elseif ($action -eq "restore") { if ([CmpLnk.Native]::IsIconic($h)) { [void][CmpLnk.Native]::ShowWindow($h, 9) } }',
    '  }',
    '  [Console]::Out.WriteLine("LNK:DONE")',
    '  [Console]::Out.Flush()',
    '}'
  ].join('\n');
}

function touchLinkIdle() {
  if (linkIdleTimer) clearTimeout(linkIdleTimer);
  linkIdleTimer = setTimeout(() => { killLinkSidecar('idle'); }, LINK_IDLE_MS);
  /* 别让这个 60s 定时器拦住应用退出（stdio 一断侧车自己就会 ReadLine 到 null 退出） */
  try { linkIdleTimer.unref && linkIdleTimer.unref(); } catch (e) {}
}

/* 🟥 V4.3.97（代码审查 R-4）：`killLinkSidecar` 原来只 `clearTimeout`、**不结算**队列 ——
   超时路径只回退了"当前那一条"，队列里其余动作被静默丢弃，与 V4.3.95 承诺的
   "兜底路径一个动作都不能丢"直接矛盾。
   现在区分场景：`idle`（空闲自退，队列本来就该是空的，不回退）与
   `timeout`/`error`/`quit`（异常，剩下的一律回退执行）。 */
function killLinkSidecar(reason) {
  const why = reason || 'timeout';
  if (linkIdleTimer) { clearTimeout(linkIdleTimer); linkIdleTimer = null; }
  const p = linkProc;
  linkProc = null;
  linkBuf = '';
  /* 🟥 先摘干净 waiters 再 kill —— 否则 child 的 exit 回调会把它们再回退一次，动作发两遍 */
  const pending = linkWaiters;
  linkWaiters = [];
  if (p) {
    try { p.stdin.end(); } catch (e) {}
    try { p.kill(); } catch (e) {}
  }
  /* 先整批标记 settled（撤掉各自 timer），再统一回退 ——
     已入队的 timer 回调进来时会被 settled 挡住，不会二次回退。 */
  /* 🟥 V4.3.97 第 3 轮（P2）：idle 时队列理论应为空；但一旦 timer 被绕过或参数调整，
     原来的 `why !== 'idle'` 会让非空队列被"标记 settled 后静默丢弃" —— 与
     V4.3.95「兜底路径一个动作都不能丢」的承诺直接矛盾。现在统一回退，并对
     idle 却非空这种异常留 warn，便于定位。 */
  if (pending.length) {
    logToFile(why === 'idle' ? 'warn' : 'info',
      '伴随联动侧车[' + why + ']：回退 ' + pending.length + ' 条未结算动作' +
      (why === 'idle' ? '（空闲自退时队列非空，属异常）' : ''));
  }
  settleAllLinkWaiters(pending, true);
}

function onLinkStdout(chunk) {
  linkBuf += chunk;
  let i;
  while ((i = linkBuf.indexOf('\n')) >= 0) {
    const line = linkBuf.slice(0, i).trim();
    linkBuf = linkBuf.slice(i + 1);
    if (line === 'LNK:READY') continue;          // 只是"编译好了"，不占一个 waiter
    if (line !== 'LNK:DONE') continue;
    /* 严格 FIFO：一条 DONE 结算一个 waiter。中途不 splice（取色服务踩过的响应错位坑） */
    const w = linkWaiters.shift();
    if (!w) continue;
    settleLinkWaiter(w, false);          /* 成功：撤 timer + 标记，不回退 */
    logToFile('info', '伴随联动[' + w.action + '](' + w.why + ') 侧车完成 ' + (Date.now() - w.t0) + 'ms');
  }
}

function ensureLinkSidecar() {
  if (linkProc) return linkProc;
  const encoded = Buffer.from(linkSidecarScript(), 'utf16le').toString('base64');
  const child = spawn('powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  linkProc = child;
  linkBuf = '';
  /* 🟥 V4.3.97（代码审查 R-3）：`onLinkStdout` 是模块级函数，原来直接绑给每个子进程 ——
     超时被 kill 的旧侧车，缓冲里可能还有一行迟到的 `LNK:DONE`；它落到**新**队列上会让
     `linkWaiters.shift()` 错位一格（该回退的没回退、该成功的被提前结算）。
     取色服务（45-picker.js）早就用 `colorProc !== proc` 做了同款守卫，这里补上。 */
  try { child.stdout.setEncoding('utf8'); child.stdout.on('data', c => { if (linkProc !== child) return; onLinkStdout(c); }); } catch (e) {}
  child.on('error', err => {
    logToFile('error', '伴随联动侧车启动失败: ' + errTextOf(err));
    if (linkProc === child) killLinkSidecar('error');
  });
  child.on('exit', code => {
    if (linkProc !== child) return;
    /* 异常退出：把还没结算的命令回退到一次性脚本，动作绝不丢 */
    const pending = linkWaiters.slice();
    linkWaiters = [];
    linkProc = null;
    linkBuf = '';
    logToFile('info', '伴随联动侧车退出 code=' + code + ' · 待回退 ' + pending.length + ' 条');
    settleAllLinkWaiters(pending, true);   /* 异常退出：动作一个都不能丢，也只回退一次 */
  });
  touchLinkIdle();
  return child;
}

function sendLinkCommand(action, why) {
  /* 名单每条命令都带（用户可能中途换目标）；白名单已过滤引号类字符，这里再兜掉分隔符 */
  const names = (companionCfg.list || []).join(',').replace(/[\r\n\t]/g, '');
  if (!names) return;
  let child;
  try { child = ensureLinkSidecar(); } catch (e) { fallbackLinkAction(action, why); return; }
  if (!child) { fallbackLinkAction(action, why); return; }
  const w = { action: action, why: why, t0: Date.now(), timer: null };
  w.timer = setTimeout(() => {
    if (w.settled) return;               /* 已被别的出口结算过了 */
    logToFile('info', '伴随联动[' + action + ']侧车超时 ' + LINK_WAIT_MS + 'ms → 回退一次性脚本');
    /* 🟥 不 splice 自己：整条队列（含自己）交给 killLinkSidecar 统一结算。
       先 splice 会让"自己"绕过 settled 标记，同时其余已入队 timer 回调会二次回退。 */
    killLinkSidecar('timeout');
  }, LINK_WAIT_MS);
  linkWaiters.push(w);
  try {
    /* 侧车若还在 Add-Type，stdin 会缓冲，编译完第一行就读到 —— 不必等 READY 再写 */
    child.stdin.write(action + '\t' + names + '\n');
    touchLinkIdle();
  } catch (e) {
    settleLinkWaiter(w, true);
    const i = linkWaiters.indexOf(w);
    if (i >= 0) linkWaiters.splice(i, 1);
  }
}

/* 原路径保留为**兜底**：侧车起不来 / 超时 / 异常退出时，功能一个都不能少。 */
function companionTargetActionScript(action) {
  const acts = {
    close:   '[void][CmpLnk.Native]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)',
    min:     'if (-not [CmpLnk.Native]::IsIconic($h)) { [void][CmpLnk.Native]::ShowWindow($h, 6) }',
    restore: 'if ([CmpLnk.Native]::IsIconic($h)) { [void][CmpLnk.Native]::ShowWindow($h, 9) }'
  }[action];
  if (!acts) return '';
  return [
    "$sig = @'",
    '[DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);',
    '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);',
    '[DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
    "'@",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -Namespace CmpLnk -Name Native -MemberDefinition $sig',
    "$names = '" + companionCfg.list.join(',').replace(/\x27/g, '\x27\x27') + "'.Split(',')",
    'foreach ($p in @(Get-Process -Name $names -ErrorAction SilentlyContinue)) {',
    '  $h = $p.MainWindowHandle',
    '  if ($h -eq [IntPtr]::Zero) { continue }',
    '  ' + acts,
    '}',
    '[Console]::Out.WriteLine("LNK:DONE")'
  ].join('\n');
}

let companionCloseLinkSentAt = 0;   // 关闭联动去重：X 路径发过之后 10s 内 before-quit 不重发（免得目标收两条 WM_CLOSE）

function fallbackLinkAction(action, why) {
  try {
    const src = companionTargetActionScript(action);
    if (!src) return;
    const encoded = Buffer.from(src, 'utf16le').toString('base64');
    const child = spawn('powershell',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    try { child.stdout.setEncoding('utf8'); child.stdout.on('data', c => { buf = (buf + c).slice(-200); }); } catch (e) {}
    /* 🟥 V4.3.97（审查 R-18）：兜底脚本原来既无超时也不回收 —— 被安全软件卡在 Add-Type 时
       会留下一个常驻 powershell，直到用户手动结束进程。这里照观察器（5s）同口径收尾。 */
    const fbTimer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      logToFile('info', '伴随联动[' + action + '](' + why + ') 兜底超时 5000ms，已结束子进程');
    }, 5000);
    try { fbTimer.unref && fbTimer.unref(); } catch (e) {}
    child.on('error', err => { clearTimeout(fbTimer); logToFile('error', '伴随联动[' + action + ']启动失败: ' + errTextOf(err)); });
    child.on('exit', code => { clearTimeout(fbTimer); logToFile('info', '伴随联动[' + action + '](' + why + ') 兜底 code=' + code +
      (buf.indexOf('LNK:DONE') >= 0 ? '' : ' · ' + buf.replace(/\s+/g, ' ').trim())); });
  } catch (e) {
    logToFile('error', '伴随联动[' + action + ']失败: ' + errTextOf(e));
  }
}

function runCompanionTargetAction(action, why) {
  if (action === 'close') companionCloseLinkSentAt = Date.now();
  try { sendLinkCommand(action, why); }
  catch (e) {
    logToFile('error', '伴随联动[' + action + ']侧车异常: ' + errTextOf(e));
    fallbackLinkAction(action, why);
  }
}

function companionLinkEnabled(kind) {
  return !!(companionCfg && companionCfg.enabled && companionCfg.list.length && companionCfg[kind]);
}

// ---------- 屏幕取色：GDI 单像素服务 ----------
// 以前是 desktopCapturer 抓一整屏再从图里取一个像素。实测（work/asar-src/_pickperf.js）：
// 抓屏单次 540ms、缩图到 480 也还是 473ms（瓶颈是抓屏本身，不是缩略图大小），
// 而且这 500ms 左右**整段卡在主进程**上 —— 拖动也走主进程，所以「一开吸色所有动作都卡」。
// 现在改成常驻 PowerShell 小服务：用 GDI 的 GetPixel 只读那一个像素，
// 实测单次 48ms、主进程最大阻塞 11ms（595ms → 11ms）。空闲 60 秒自动退出，不常驻。
let colorProc = null;
let colorWaiters = [];
let colorBuf = '';
let colorIdleTimer = null;
/* V4.3.33c：冷启动 / 假死的区分改用**布尔量**「本实例有没有成功产出过结果」，
   而不是 spawn 时刻差 —— PowerShell 启动 + Add-Type 运行时编译 P/Invoke 常要几百 ms 以上，
   渲染层每 1500ms 就来一发，若不区分，500ms 超时会把每个请求都变成「杀掉刚起一半的服务」。
   （原先还有个 colorSpawnedAt 记 spawn 时刻，但全文没有读取点，是死变量，已删。） */
let colorEverResponded = false;   // V4.3.33b：本实例是否成功产出过结果（区分「还在冷启动」与「已暖后假死」）

function colorServerScript() {
  // GetPixel 返回 COLORREF（0x00BBGGRR），所以要按位取出 r/g/b。
  // OutputEncoding 与 WriteLine+Flush 两个坑同前台监听（见 foregroundWatchScript 的注释）。
  return [
    "$sig = '[DllImport(\"user32.dll\")] public static extern IntPtr GetDC(IntPtr hWnd); [DllImport(\"user32.dll\")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC); [DllImport(\"gdi32.dll\")] public static extern uint GetPixel(IntPtr hdc, int x, int y);'",
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -Namespace Pick -Name Native -MemberDefinition $sig',
    '$hdc = [Pick.Native]::GetDC([IntPtr]::Zero)',
    'while ($true) {',
    '  $line = [Console]::In.ReadLine()',
    '  if ($line -eq $null) { break }',
    '  $parts = $line.Split(",")',
    '  try {',
    '    $c = [Pick.Native]::GetPixel($hdc, [int]$parts[0], [int]$parts[1])',
    '    $r = $c -band 255',
    '    $g = ($c -shr 8) -band 255',
    '    $b = ($c -shr 16) -band 255',
    '    [Console]::Out.WriteLine("$r,$g,$b")',
    '  } catch { [Console]::Out.WriteLine("") }',
    '  [Console]::Out.Flush()',
    '}',
    '[void][Pick.Native]::ReleaseDC([IntPtr]::Zero, $hdc)'
  ].join('\n');
}

function stopColorServer() {
  if (colorIdleTimer) { clearTimeout(colorIdleTimer); colorIdleTimer = null; }
  if (colorProc) {
    try { colorProc.kill(); } catch (e) {}
    colorProc = null;
  }
  /* V4.3.33 修：清队列前必须先把等待者全部放掉。
     原先直接 `colorWaiters = []`，那些 Promise 会**永远 pending** ——
     渲染层 await 取色的调用就再也回不来（表现为「取色按钮点了没反应」）。
     空闲 60 秒自动停服时队列本就该是空的，所以这个洞一直没被踩到；
     但一旦走到「超时 → 停服」这条新路径就会真踩到。 */
  const pending = colorWaiters;
  colorWaiters = [];
  pending.forEach(fn => { try { fn(''); } catch (e) {} });
  colorBuf = '';
}

function startColorServer() {
  if (colorProc) return true;
  if (!app.isReady()) return false;
  let args;
  try {
    const encoded = Buffer.from(colorServerScript(), 'utf16le').toString('base64');
    args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded];
  } catch (e) {
    /* 🟥 V4.3.49（R8-3）：同前台监听 —— 不能把 Error 直接交给日志。
       `logToFile('error', e)` 经 safeStringify 落盘的是**一个字面量 `{}`**，
       吸色服务起不来时日志里看不出任何原因。统一走 errTextOf()。 */
    logToFile('error', '吸色服务脚本构造失败 · ' + errTextOf(e));
    return false;
  }
  try {
    colorProc = spawn('powershell', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    colorEverResponded = false;    // V4.3.33b：全新实例，重新按冷启动对待（超时上限随之为 3s）
  } catch (e) {
    logToFile('error', '吸色服务启动失败 · ' + errTextOf(e));
    colorProc = null;
    return false;
  }
  /* 🟥 V4.3.44（R3-5）：`stdout` 也必须按**本次实例**过滤。
     原先只有 exit / error 侧比对了实例（V4.3.33 修的），data 侧没有 —— 而取色服务的空闲自动退出
     （60s）本身就会正常触发 exit，紧接着下一次取色又 spawn 新进程。被 kill 的旧进程在真正退出前
     仍可能投递**已缓冲**的 stdout，于是旧进程的迟到数据落进新进程的缓冲、错位应答了一个新请求的
     等待者 —— 表现为偶发"取到上一轮的颜色"；`colorEverResponded` 也会被旧数据误标成"服务已暖"，
     把本该 3s 的冷启动超时放宽到 15s。所以 `const proc` 提到注册之前，handler 先比对再吃数据。 */
  const proc = colorProc;
  colorProc.stdout.setEncoding('utf8');
  colorProc.stdout.on('data', chunk => {
    if (colorProc !== proc) return;   // 旧实例的迟到数据：直接丢弃
    colorBuf += chunk;
    let i;
    while ((i = colorBuf.indexOf('\n')) >= 0) {
      const line = colorBuf.slice(0, i).trim();
      colorBuf = colorBuf.slice(i + 1);
      colorEverResponded = true;   // V4.3.33b：服务已暖 —— 之后才谈得上「假死」
      const fn = colorWaiters.shift();
      if (fn) fn(line);
    }
  });
  /* V4.3.33 修：同 fgProc —— 必须比对「本次实例」。
     取色服务的空闲自动退出（60s）本身就会正常触发 exit，紧接着下一次取色又 spawn 新进程，
     所以这个竞态比前台监听更容易踩到：旧进程 exit 一到，就把新进程的引用清空了。 */
  const onGone = () => {
    if (colorProc !== proc) return;   // 已被新实例取代：别动新进程引用，也别清空它的等待队列
    colorProc = null;
    const pending = colorWaiters;
    colorWaiters = [];
    pending.forEach(fn => fn(''));
  };
  proc.on('exit', onGone);
  proc.on('error', onGone);
  return true;
}

// 空闲 60 秒就把服务关掉：取色是偶发需求，没必要时时刻刻挂一个 PowerShell 进程。
function touchColorIdle() {
  if (colorIdleTimer) clearTimeout(colorIdleTimer);
  colorIdleTimer = setTimeout(stopColorServer, 60000);
}

// 只读屏幕上 (x, y) 这一个像素，返回 {r,g,b}；失败或超时回 null（绝不阻塞主进程）。
const COLOR_COLD_MS = 3000;   // 服务「从没响应过」时的等待上限（覆盖 PowerShell 冷启动 + Add-Type 编译）
const COLOR_WAIT_MS = 500;    // 服务已经响应过之后，单次等待上限（超过即疑似假死）
function queryScreenPixel(x, y) {
  return new Promise(resolve => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !startColorServer()) { resolve(null); return; }
    touchColorIdle();
    let done = false;
    const finish = (v, drop) => {
      if (done) return;
      done = true;
      /* 🟥 V4.3.33c 修上一版引入的**响应错位**：不要无条件把自己从队列里摘掉。
         服务端是严格 FIFO 一问一答，队列里每个 waiter 都对应服务端一条「待答的行」。
         中途 splice 等于抽掉一个占位 —— 之后每个回包都会错位一格，
         表现为「这一轮取到的是上一轮的颜色」（冷启动分支刻意不杀进程，这条行一定会回包，必然错位）。
         保留占位才是对的：迟到的回包被这个已结束的 waiter 吞掉（done=true 直接丢弃），
         队列与服务端待答行的对应关系始终不乱。
         唯一必须摘的情形：stdin.write 就失败了 —— 那一行根本没发出去，服务端不会有它的回包。 */
      if (drop) {
        const qi = colorWaiters.indexOf(finish);
        if (qi >= 0) colorWaiters.splice(qi, 1);
      }
      if (!v) { resolve(null); return; }
      const p = String(v).split(',');
      if (p.length < 3) { resolve(null); return; }
      const r = Number(p[0]), g = Number(p[1]), b = Number(p[2]);
      resolve((Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) ? { r, g, b } : null);
    };
    colorWaiters.push(finish);
    /* 🟥 V4.3.33b 修上一版引入的**自毁循环**：
       上一版在 500ms 超时时无条件 `stopColorServer()`。但 500ms 是从「写 stdin」起算的，
       而此刻服务可能刚 spawn、正在 PowerShell 启动 + Add-Type 运行时编译 P/Invoke ——
       于是每个请求都在服务能回答之前把它杀掉，下一次又是全新冷启动，
       渲染层每 1500ms 轮询一次 → 取色**永远拿不到值**（比改之前更糟）。
       现在按「服务有没有成功响应过」分两种处置：
         · 从没响应过（还在冷启动）→ 给足 3s，超时也只弃本次请求，**绝不动进程**；
         · 已经响应过 → 500ms 超时视为假死，但**只有队列里没有别的在途请求时**才停服自愈，
           否则说明只是这一发慢，连带把别人也判失败属于误伤。 */
    setTimeout(() => {
      if (done) return;
      /* V4.3.33c：只有「队列最早的请求就是我自己」才停服自愈 ——
         说明服务连最早那一发都没回应 = 真的假死，杀掉重启（stopColorServer 会放掉全部等待者，包括占位）。
         若我前面还有别人在等，那只是这一发慢，保留占位即可，连带把同批请求判失败属于误伤。 */
      if (colorEverResponded && colorWaiters[0] === finish) { try { stopColorServer(); } catch (e) {} }
      finish(null);
    }, colorEverResponded ? COLOR_WAIT_MS : COLOR_COLD_MS);
    // 写失败 = 这行没发出去 → 必须摘掉自己的占位，否则队列会永久多一个等不到回包的 waiter
    try { colorProc.stdin.write(Math.round(x) + ',' + Math.round(y) + '\n'); } catch (e) { finish(null, true); }
  });
}

function rgbToHex(rgb) {
  if (!rgb) return null;
  return '#' + [rgb.r, rgb.g, rgb.b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

async function pickScreenColor(opts) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return null;
  try {
    // 采样窗口正下方/正上方紧邻的桌面像素，避免隐藏窗口造成闪烁
    const bounds = mainWindow.getBounds();
    const dBounds = screen.getDisplayMatching(bounds).bounds;
    /* 🆕 V4.3.86（用户问「吸色点跟吸色的真正判定点是否一致」）：
       原先 cx 恒等于**窗口水平中线**，而窗口里的取色圆点是可以放在别处的 ——
       于是"圆点指着 A、实际采的是 B"，两者对不上。
       现在渲染层把圆点的屏幕 x 传进来，采样点就落在**圆点正下方 12px**，
       x 严格跟随圆点（并夹在窗口范围内，避免采到隔壁窗口）。 */
    const cx = (opts && Number.isFinite(opts.x))
      ? Math.max(bounds.x + 2, Math.min(bounds.x + bounds.width - 2, Math.round(opts.x)))
      : bounds.x + Math.round(bounds.width / 2);
    let cy = bounds.y + bounds.height + 12;
    if (cy > dBounds.y + dBounds.height - 2) cy = bounds.y - 12;
    if (cy < dBounds.y + 2) cy = dBounds.y + 2;
    /* 🆕 V4.3.54（吸色优化）修闪烁根因①「自反馈回路」：上面两步兜底夹出来的采样点，
       在窗口上下都顶满屏幕时可能落回**主窗自己身上**（cx 是窗口中线必在窗内）。
       采到自己 55% 靠拢后的背景 → 下一次再采 → 颜色自我漂移，观感就是背景不停变。
       点在自己窗内（±2px 取整容差）→ 宁可不采，渲染层按"没采到"跳过。 */
    if (cy >= bounds.y - 2 && cy <= bounds.y + bounds.height + 2) return null;
    return rgbToHex(await queryScreenPixel(cx, cy));
  } catch (err) {
    logToFile('error', 'pick color failed: ' + (err && err.message ? err.message : err));
    return null;
  }
}

// 取色点：按屏幕坐标实时取样，供吸色预览使用
async function pickColorAt(point) {
  const x = Number(point && point.x);
  const y = Number(point && point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  try {
    return rgbToHex(await queryScreenPixel(x, y));
  } catch (err) {
    return null;
  }
}

// ---------- 书源系统 ----------
const SOURCE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let sourceFetchCancelled = false;

function sourceRulesFile() {
  return path.join(app.getPath('userData'), 'sources.json');
}

function loadSourceRules() {
  try {
    if (fs.existsSync(sourceRulesFile())) {
      const arr = JSON.parse(fs.readFileSync(sourceRulesFile(), 'utf8'));
      if (Array.isArray(arr)) return arr;
    }
  } catch (e) { logToFile('error', 'load source rules failed: ' + e.message); }
  return [];
}

function saveSourceRules(rules) {
  try { fs.writeFileSync(sourceRulesFile(), JSON.stringify(rules, null, 2), 'utf8'); return true; }
  catch (e) { logToFile('error', 'save source rules failed: ' + e.message); return false; }
}

function validateSourceRule(rule) {
  if (!rule || typeof rule !== 'object') return TT('规则必须是对象','Rule must be an object');
  if (!rule.name || typeof rule.name !== 'string') return TT('缺少名称','Missing name');
  if (!rule.chapterList || typeof rule.chapterList !== 'object' || !rule.chapterList.item) return TT('缺少章节列表选择器 chapterList.item','Missing chapter-list selector: chapterList.item');
  if (!rule.content || typeof rule.content !== 'object' || !rule.content.content) return TT('缺少正文选择器 content.content','Missing content selector: content.content');
  return null;
}

/* 🛡 V4.3.33（SSRF 收口）：书源规则是**可导入的第三方数据**，它的 URL 模板由规则作者决定，
   而这些 URL 会被主进程真去请求、响应正文还会回传给渲染层 ——
   等于把「读内网」开放给了任何一条导入的规则。
   这里只拦「本机 / 内网 / 链路本地」三类地址，**公网站点一律照放**（书源本来就该能访问任意小说站，
   不做公网白名单，否则正常书源全废）。重定向每一跳都会重新过这道校验，因为 step() 每次都重算。
   已知局限：拦不住「域名解析到内网」的 DNS 重绑定 —— 那需要在 connect 前解析 IP 再判，
   属于加固级别；当前能挡住的是「直接写内网 IP / localhost / 元数据地址」这类直球。 */

/* 🧩 V4.3.79（F5/S3 模块化第三刀）：出网守卫与统一 GET 搬到 lib/net.js。
   注入 TT / logToFile —— TT 是函数引用，切语言后内部读到的仍是当前语言。 */
const { createNet } = require('./lib/net.js');
const { isBlockedHost, guardedLookup, httpGet } = createNet({ tt: TT, log: logToFile, ua: SOURCE_UA });

// 保留旧名字做薄包装，调用点无需改动
function sourceFetch(urlStr, timeout) {
  return httpGet(urlStr, { timeout: timeout || 15000 });
}

function sourceDecode(buf, encoding) {
  const enc = String(encoding || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let text = null;
  if (enc === 'gbk' || enc === 'gb2312' || enc === 'gb18030') {
    if (iconv) text = iconv.decode(buf, 'gb18030');
  } else if (enc === 'big5') {
    if (iconv) text = iconv.decode(buf, 'big5');
  } else if (enc && enc !== 'utf-8' && enc !== 'utf8') {
    if (iconv) { try { text = iconv.decode(buf, enc); } catch (e) {} }
  }
  /* 🟥 V4.3.37：数字实体清洗必须**所有分支**都过 —— 原先只有"未声明编码"的兜底路径会 sanitize，
     于是规则里一写 encoding=gbk，含超范围实体（如 &#1332990;）的页面就原样进 cheerio 并抛
     Invalid code point，整章被标 failed，用户还以为是自己的选择器写错了。 */
  if (text !== null) return sanitizeNumericEntities(text);
  /* 没声明编码时才猜。旧实现是「UTF-8 解出替换符就换 GB18030」，只能覆盖 GBK 系：
     Big5 页面被 GB18030 解是**不会**产生替换符的（GB18030 字节面很宽），
     结果是满屏看不懂的汉字而且换不回来 —— 所以改交 decodeBuffer 统一判（含 BOM / UTF-16 / 简繁投票）。 */
  return sanitizeNumericEntities(decodeBuffer(buf));
}

// 部分站点会写出超范围的数字实体（如 &#1332990;），解析时会抛 Invalid code point
function sanitizeNumericEntities(html) {
  const fix = function (n) {
    if (!Number.isFinite(n) || n < 0 || n > 0x10FFFF) return '';
    if (n >= 0xD800 && n <= 0xDFFF) return '';
    try { return String.fromCodePoint(n); } catch (e) { return ''; }
  };
  return String(html)
    .replace(/&#x([0-9a-f]{1,8});/gi, function (m, h) { return fix(parseInt(h, 16)); })
    .replace(/&#(\d{1,10});/g, function (m, d) { return fix(parseInt(d, 10)); });
}

function htmlToText($el) {
  if (!$el || !$el.length) return '';
  const clone = $el.clone();
  try { clone.find('script,style').remove(); } catch (e) {}
  let html = clone.html() || '';
  html = html.replace(/<\s*br\s*\/?\s*>/gi, '\n')
             .replace(/<\s*\/\s*p\s*>/gi, '\n')
             .replace(/<\s*\/\s*div\s*>/gi, '\n')
             .replace(/<\s*\/\s*li\s*>/gi, '\n');
  const text = cheerio.load('<div>' + html + '</div>').text();
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function parseChapterList(html, pageUrl, rule) {
  if (!cheerio) return { error: TT('解析组件未加载','Parser component not loaded') };
  const $ = cheerio.load(html);
  const cl = rule.chapterList;
  const items = $(cl.item).toArray();
  if (!items.length) return { error: TT('未匹配到章节，请检查选择器','No chapters matched — check the selectors') };
  const chapters = [];
  let anchorSkipped = 0;   // V4.3.38：因「与目录页同路径、只有 #锚点不同」而被丢弃的条目数
  for (const el of items) {
    const $el = $(el);
    let title = $el.text().trim();
    if (cl.titleAttr) { const tv = $el.attr(cl.titleAttr); if (tv && tv.trim()) title = tv.trim(); }
    const linkAttr = cl.linkAttr || 'href';
    let link = $el.attr(linkAttr);
    if (!link) { const child = $el.find('a').first(); if (child.length) link = child.attr('href'); }
    if (!link) continue;
    /* 🟥 V4.3.37：先看**原始链接的协议**，再谈拼接。
       原先的顺序是"先 new URL、再拼 linkPrefix、最后才判 http" —— 而
       `new URL('javascript:void(0)', pageUrl)` 会**成功**返回 `javascript:void(0)`，
       拼上前缀后恰好以 http 开头，于是混过最终校验，给书架塞进一堆永远抓不到的垃圾章节。 */
    const rawLink = String(link).trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawLink) && !/^https?:/i.test(rawLink)) continue;   // javascript: / mailto: / data: … 一律丢
    let url = rawLink;
    try { url = new URL(rawLink, pageUrl).href; } catch (e) {}
    if (cl.linkPrefix && !/^https?:\/\//i.test(url)) url = cl.linkPrefix + url;
    if (!/^https?:\/\//i.test(url)) continue;
    // V4.3.37：同页锚点（解析后与当前页只差 #fragment）不是新章节
    if (url.split('#')[0] === String(pageUrl).split('#')[0]) { anchorSkipped++; continue; }
    chapters.push({ title: title || ('第' + (chapters.length + 1) + '章'), url });
  }
  /* 🛡 V4.3.38：用 normalizeChapters **去重并排序后**的数组。
     原先把统计量（duplicates / sortedByNumber）拼在**原始数组**上返回 ——
     于是面板打印「已自动去重 N 章 / 已按章节序号排序」，用户看到的却是带重复、顺序错乱的目录。
     这是"假承诺"：算了但没用。现在把 sorted 真正交出去。 */
  /* 🛡 V4.3.38：整本在**单页**、目录靠 #锚点跳章的站点，会把所有条目都判成"同页锚点"而丢光 ——
     原先这时的报错是「未匹配到章节，请检查选择器」，把站点兼容性问题误导成"用户选择器写错了"。
     这种情况下给出准确的成因。 */
  if (!chapters.length && anchorSkipped) {
    return { error: TT('该站目录为单页锚点模式（' + anchorSkipped + ' 条目录全部指向当前页），暂不支持自动抓取', 'This site uses a single-page anchor index (' + anchorSkipped + ' entries all point to the current page); automatic fetching is not supported yet') };
  }
  const norm = normalizeChapters(chapters);
  return Object.assign({}, norm, { chapters: norm.chapters, anchorSkipped });
}

// 章节名里的序号：阿拉伯数字优先，其次中文数字
const CN_DIGITS = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
function cnToNumber(s) {
  let total = 0;
  let num = 0;
  for (const ch of String(s || '')) {
    if (CN_DIGITS[ch] !== undefined) num = CN_DIGITS[ch];
    else if (ch === '十') { total += (num || 1) * 10; num = 0; }
    else if (ch === '百') { total += (num || 1) * 100; num = 0; }
    else if (ch === '千') { total += (num || 1) * 1000; num = 0; }
  }
  return total + num;
}

function chapterNumber(title) {
  const s = String(title || '');
  /* 🆕 V4.3.85：**优先认「第 N 章 / 节 / 回 / 卷 …」里的那个 N**。
     原实现直接取标题里第一个数字串，于是副标题里的年份/序号被当成章节号：
       「第五十一章 第五纪·1068年」→ 1068（真值 51）
       「第五百六十二章 大城玩家1853」→ 1853（真值 562）
     真站实测（玄幻阁《呢喃诗章》4652 章）：这样量出 55 处"逆序"，
     normalizeChapters 据此认定目录是乱序并重排 —— 结果把「第一卷卷末语」从卷末挪到第二章前面。
     只有紧跟在「第」后面、贴着「章节回卷集话篇」的数字才是章节号；副标题里的数字一概不算。 */
  const ar = s.match(/第\s*(\d{1,5})\s*[章节節回卷集话話篇]/);
  if (ar) return parseInt(ar[1], 10);
  const cnFirst = s.match(/第\s*([零一二两三四五六七八九十百千]{1,8})\s*[章节節回卷集话話篇]/);
  if (cnFirst) {
    const v = cnToNumber(cnFirst[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  /* 兜底：没有「第N章」形态时（如 "Chapter 12" / 纯数字标题），再退回原来的"第一个数字串" */
  const m = s.match(/(\d{1,5})/);
  if (m) return parseInt(m[1], 10);
  const cn = s.match(/[零一二两三四五六七八九十百千]{1,6}/);
  if (cn) {
    const v = cnToNumber(cn[0]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return NaN;
}

// 去重 + 按章节序号自然排序 + 缺章检测
function normalizeChapters(chapters) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const unique = [];
  let duplicates = 0;
  for (const ch of chapters) {
    const tkey = String(ch.title || '').replace(/\s+/g, '');
    if (seenUrl.has(ch.url) || (tkey && seenTitle.has(tkey))) { duplicates++; continue; }
    seenUrl.add(ch.url);
    if (tkey) seenTitle.add(tkey);
    unique.push(ch);
  }

  const nums = unique.map(c => chapterNumber(c.title));
  const numberedCount = nums.filter(n => Number.isFinite(n)).length;
  const enoughNumbered = unique.length >= 5 && numberedCount >= unique.length * 0.6;
  let sorted = unique;
  let sortedByNumber = false;
  if (enoughNumbered) {
    /* 🆕 V4.3.85：**站点自己已经排好序时不要重排**。
       真实案例（玄幻阁《呢喃诗章》，4652 章）：DOM 顺序本来完全正确
       （第一章 → 第二章 → …），但 chapterNumber('第一卷卷末语') 会从「第一卷」里抠出 1 ——
       一排序就把这句"卷末语"从第一卷末尾**挪到了第二章前面**；同理「上架感言」「不是没更啊」
       这类无号章节全被甩到书尾。用户看到的目录是乱的，而排序本来是为了修"倒序/乱序"站点。
       判据：只看**相邻两个已编号章节**，逆序对少于 2% ⇒ 站点自己排好了，原样保留。
       （倒序站点首尾就全是逆序，乱序站点也远超 2%，两者仍会被排序修正，行为不变。）
       🟥 用比例而不是"必须零逆序"：站点自己也会写错章节号（实测有「第一百零三十九章」
       其实是第 1039 章这类笔误），要求零逆序等于永远触发重排，等于没修。 */
    let inversions = 0, pairs = 0, prevNum = null;
    for (const n of nums) {
      if (!Number.isFinite(n)) continue;
      if (prevNum !== null) { pairs++; if (n < prevNum) inversions++; }
      prevNum = n;
    }
    const alreadyOrdered = pairs > 0 && (inversions / pairs) < 0.02;
    if (!alreadyOrdered) {
      sorted = unique
        .map((c, i) => ({ c, n: nums[i], i }))
        .sort((a, b) => {
          const an = Number.isFinite(a.n) ? a.n : Number.MAX_SAFE_INTEGER;
          const bn = Number.isFinite(b.n) ? b.n : Number.MAX_SAFE_INTEGER;
          if (an !== bn) return an - bn;
          return a.i - b.i;
        })
        .map(x => x.c);
      sortedByNumber = true;
    }
  }

  const missing = [];
  /* 🆕 V4.3.85：缺号统计不该依赖"有没有真的排过序"—— 已经有序的站点同样能算缺号。
     原先用 sortedByNumber 当闸门，站点排好了就永远报"无缺号"，等于少一个可见信号。 */
  if (enoughNumbered) {
    const order = sorted.map(c => chapterNumber(c.title)).filter(n => Number.isFinite(n));
    if (order.length >= 5) {
      const min = Math.min.apply(null, order);
      const max = Math.max.apply(null, order);
      if (max - min <= 5000) {
        const set = new Set(order);
        for (let n = min; n <= max; n++) if (!set.has(n)) missing.push(n);
      }
    }
  }

  return { chapters: sorted, duplicates, missing, sortedByNumber, rawCount: chapters.length };
}

function parseContent(html, pageUrl, rule) {
  if (!cheerio) return { error: TT('解析组件未加载','Parser component not loaded') };
  const $ = cheerio.load(html);
  const cc = rule.content || {};
  let $el = cc.content ? $(cc.content).first() : null;
  /* 🆕 V4.3.85（自动抓取）：自动识别出的规则，个别章节页模板不一样（多一层广告包装 / 换了容器 id）时
     选择器会落空 —— 这里退回**逐页启发式**再认一次，而不是把整章判成失败。
     🟥 只对 rule.auto 生效：手动规则的语义必须保持原样（用户填错了就该如实报"未匹配到正文"，
     不许被自动逻辑悄悄"修好"，否则他永远不知道自己的选择器是错的）。 */
  if ((!$el || !$el.length) && rule.auto) {
    const autoNode = autoPickContentNode($);
    if (autoNode) $el = $(autoNode);
  }
  if (!$el || !$el.length) return { error: TT('未匹配到正文','No content matched') };
  if (cc.remove) { try { $el.find(cc.remove).remove(); } catch (e) {} }
  /* 🆕 V4.3.85：自动模式下剥掉正文开头那一串"链接农场"（推荐位/导航）。
     实测站点把 8 条推荐书链接直接塞进 #content 的第一个孩子，不剥的话**每章**开头都顶着别人的书名。
     只对 rule.auto 生效 —— 手动规则按用户填的 remove 选择器办，不替他改。 */
  if (rule.auto) { try { autoStripLeadingLinkFarm($, $el); } catch (e) {} }
  let text = htmlToText($el);
  /* 🆕 V4.3.85：自动模式下顺手清掉正文里"上一章 / 返回目录"这类整行导航（只删整行完全相等的）。 */
  if (rule.auto) text = autoCleanChapterText(text);
  /* 🛡 V4.3.38：命中选择器但取到空内容 → 当**失败**。
     原先把空串当成功存进书架：用户读到一整本空白章，failed 标记不置位、
     面板也不会给重抓入口（`removeSel` 把正文父容器一起删掉、或站点对未登录返回空壳页时常见）。 */
  if (!text || !String(text).replace(/\s+/g, '')) return { error: TT('正文为空（选择器命中了，但取到的是空内容）','Content is empty (the selector matched, but the result was blank)') };
  return { content: text };
}

async function fetchSourceChapters(urlStr, rule) {
  try {
    const buf = await sourceFetch(urlStr);
    const html = sourceDecode(buf, rule.encoding);
    const $ = cheerio.load(html);
    const title = ($('title').text().trim()) || ($('h1').first().text().trim()) || (new URL(urlStr).hostname);
    const res = parseChapterList(html, urlStr, rule);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, title, chapters: res.chapters, duplicates: res.duplicates, missing: res.missing, sortedByNumber: res.sortedByNumber, rawCount: res.rawCount };
  } catch (err) {
    logToFile('error', 'fetch source chapters failed: ' + (err && err.message || err));
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

async function fetchSourceOne(url, rule) {
  if (!url || !rule) return { ok: false, error: TT('缺少参数','Missing parameter') };
  try {
    const buf = await sourceFetch(url);
    const html = sourceDecode(buf, rule.encoding);
    const r = parseContent(html, url, rule);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, content: r.content };
  } catch (err) {
    logToFile('error', 'fetch single chapter failed: ' + ((err && err.message) || err));
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

async function fetchSourceContents(chapters, rule, sender) {
  const results = new Array(chapters.length);
  const failedChapters = [];
  sourceFetchCancelled = false;
  const interval = Math.max(0, Number.isFinite(Number(rule.requestInterval)) ? Number(rule.requestInterval) : 250);
  const concurrency = Math.max(1, Math.min(8, Number.isFinite(Number(rule.concurrent)) ? Number(rule.concurrent) : 3));
  let next = 0;
  let done = 0;

  async function worker() {
    while (!sourceFetchCancelled && next < chapters.length) {
      const i = next++;
      const ch = chapters[i];
      const origIndex = Number.isFinite(ch && ch.index) ? ch.index : i;
      try {
        const buf = await sourceFetch(ch.url);
        const html = sourceDecode(buf, rule.encoding);
        const r = parseContent(html, ch.url, rule);
        if (r.error) {
          failedChapters.push({ title: ch.title, url: ch.url, index: origIndex });
          // 保留占位章节，保证书源顺序与章节位置不错位，可在阅读器内单独重抓
          results[i] = { title: ch.title, content: '', failed: true, url: ch.url, idx: i };
        } else {
          /* 🆕 V4.3.85：**必须带上 url**。原先成功章节只存 { title, content, idx }，
             于是阅读器里「重抓本章」（app-src/30-shelf.js）拿 `ch.url` 判空后直接
             showHint('retryNoRule') —— 每本书的单章重抓都失效，而且提示还错说成"没有书源规则"。
             失败章节本来就有 url（占位重抓要用），成功章节没有，两边口径也不一致。 */
          results[i] = { title: ch.title, content: r.content, idx: i, url: ch.url };
        }
      } catch (e) {
        failedChapters.push({ title: ch.title, url: ch.url, index: origIndex });
        results[i] = { title: ch.title, content: '', failed: true, url: ch.url, idx: i };
      }
      done++;
      safeSend(sender, 'source:progress', { done, total: chapters.length, title: ch.title });
      if (interval > 0 && !sourceFetchCancelled && next < chapters.length) {
        await new Promise(r => setTimeout(r, interval));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, chapters.length) }, () => worker()));
  return { ok: true, contents: results.filter(Boolean), failed: failedChapters.map(f => f.title), failedChapters, cancelled: sourceFetchCancelled };
}
/* 📑 V4.3.29：把同一本书的两种写法归一，用于**搜索结果去重**。
   同一个搜索页常把同一本书列多次（列表 + 推荐位），翻页时又会把上一页的重复一遍，
   不去重用户会看到一堆同名条目，还得自己猜哪个是真的。
   只删「纯跟踪参数」（utm 系列、spm、ref、from 等），**保留站点自己的 id 参数**——那常常就是书的标识。 */
const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'spm', 'ref', 'from'];
function normalizeBookUrl(u) {
  try {
    const o = new URL(u);
    o.hash = '';
    TRACKING_PARAMS.forEach(p => { try { o.searchParams.delete(p); } catch (e) {} });
    let s = o.href;
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch (e) { return String(u || '').trim().toLowerCase(); }
}
/* 📑 V4.3.29：搜索支持翻页 —— 模板里写 {page}（页码）就会翻页，没写就只有一页。
   page 从 1 开始；翻到空页时返回 ok + 空结果，让面板知道「没有更多了」而不是当成报错。 */
async function searchSource(query, rule, page) {
  if (!cheerio) return { ok: false, error: TT('解析组件未加载','Parser component not loaded') };
  const s = rule.search;
  if (!s || !s.urlTemplate) return { ok: false, error: TT('规则缺少搜索模板 search.urlTemplate','Rule is missing the search template: search.urlTemplate') };
  const pageNo = Math.max(1, Number(page) || 1);
  const hasPage = /\{page\}/.test(String(s.urlTemplate));
  /* 🟥 V4.3.27：String.replace 用字符串模式只替换**第一处** {kw}，
     模板里出现两次关键词（常见于「搜索页 + 页码参数」）时第二个会原样留下变成字面 {kw}。
     split/join 是唯一不引入正则转义坑的全量替换写法。 */
  let url = String(s.urlTemplate).split('{kw}').join(encodeURIComponent(query));
  if (hasPage) url = url.split('{page}').join(String(pageNo));
  try {
    const buf = await sourceFetch(url);
    const html = sourceDecode(buf, rule.encoding);
    const $ = cheerio.load(html);
    const items = $(s.resultItem || 'a').toArray();
    if (!items.length) {
      // 翻页翻到空页 = 没有更多了（不是错误）；只有**第一页**就空才算选择器没配好
      if (pageNo > 1) return { ok: true, results: [], dupes: 0, page: pageNo, hasPage };
      return { ok: false, error: TT('未匹配到搜索结果，请检查选择器','No search results matched — check the selectors'), page: pageNo, hasPage };
    }
    const results = [];
    // 📑 V4.3.29 页内去重：seen 记已收过的规范化 URL，dupes 记本页丢掉多少条（面板会如实汇报）
    const seen = new Set();
    let dupes = 0;
    const getVal = function ($el, sel, attr) {
      if (!sel) return '';
      const node = sel === '__self__' ? $el : $el.find(sel).first();
      if (!node.length) return '';
      return attr ? (node.attr(attr) || '') : node.text().trim();
    };
    for (const el of items) {
      const $el = $(el);
      let title = getVal($el, s.title || '__self__', s.titleAttr || null);
      if (!title) title = $el.text().trim();
      const author = getVal($el, s.author || null, s.authorAttr || null);
      let bookUrl = getVal($el, s.bookUrl || '__self__', s.bookUrlAttr || 'href');
      if (!bookUrl) { const a = $el.is('a') ? $el : $el.find('a').first(); if (a.length) bookUrl = a.attr('href') || ''; }
      if (!bookUrl) continue;
      try { bookUrl = new URL(bookUrl, url).href; } catch (e) {}
      if (!/^https?:\/\//i.test(bookUrl)) continue;
      // 📑 V4.3.29 页内去重：同一页里重复的书只留第一次出现的那条
      const key = normalizeBookUrl(bookUrl);
      if (key && seen.has(key)) { dupes++; continue; }
      if (key) seen.add(key);
      const cover = getVal($el, s.cover || null, s.coverAttr || 'src');
      let coverUrl = '';
      if (cover) { try { coverUrl = new URL(cover, url).href; } catch (e) {} }
      results.push({ title: title || ('结果' + (results.length + 1)), author, url: bookUrl, cover: coverUrl });
    }
    return { ok: true, results, dupes, page: pageNo, hasPage };
  } catch (err) {
    logToFile('error', 'search source failed: ' + (err && err.message || err));
    return { ok: false, error: (err && err.message) || String(err), page: pageNo, hasPage };
  }
}

// ---------- 站点判定（V4.3.23「书库」的地基）----------
/* ===================== 🤖 自动抓取（V4.3.85）=====================
 *
 * 目标：用户只给一个 URL，剩下的全自动 —— 自动识别章节目录、自动识别正文容器、抓完全书并载入，
 * 全程不需要填任何选择器。
 *
 * 🟥 设计要点（别改坏）：
 *   ① **识别只做一次**（目录页 + 第 1 章），产出的仍是一条**普通 rule**（只是 content/chapterList
 *      是自动填的）。之后整条链（fetchSourceContents / 阅读器内单章重抓 / 高级里再改再存）
 *      全部复用原有实现 —— 不新增第二条抓取通路（规则 34：同一动作多个入口 ⇒ 收口成单一 helper）。
 *   ② 识别靠**结构信号**（链接形状一致性 / 容器里链接文字的占比 / 章节关键词 / class 语义），
 *      不依赖任何站点白名单，也不联网查规则。判不准时**如实报错**并指路「高级」，
 *      绝不硬塞一个"大概是正文"的结果（宁可失败，也不给一本乱码书）。
 *   ③ 正文选择器一旦识别出来就固定下来（同一站的章节页结构一致）；万一某章用选择器抓不到，
 *      parseContent 会**退回逐页启发式**（rule.auto 标记）再试一次 —— 既稳又不至于整本失败。
 *
 * 已知取舍：识别时抓了第 1 章，随后 fetchSourceContents 会**再抓一次**第 1 章。
 * 多一次请求换来的是「进度总数准确 + 复用现成抓取链」，比省这一次请求更划算。
 */

const AUTO_CHAPTER_WORD_RE = /第\s*[0-9零一二两三四五六七八九十百千万]+\s*[章节節回卷集话話篇]|^\s*(序章|楔子|引子|前言|序言|后记|後記|尾声|尾聲|番外)/;
/* 容器语义：这些词出现在 id/class 里 ⇒ 多半是导航/页脚/推荐位，不是目录也不是正文 */
const AUTO_JUNK_RE = /(^|[-_\s])(nav|navbar|menu|footer|foot|header|topbar|top-nav|breadcrumb|crumb|sidebar|side|rank|ranking|hot|recommend|related|tuijian|tag|tags|comment|comments|ad|ads|advert|gg|share|search|pager|pagination|paging|page-nav|logo|banner|copyright|friendlink)([-_\s]|$)/i;
/* 容器语义：这些词 ⇒ 更像正文/目录 */
const AUTO_GOOD_RE = /(content|chapter|article|read|txt|text|novel|book|main|body|detail|show|entry|post|list)/i;
/* 自动模式下去掉的导航行（**整行完全等于**这些词才删，不做包含匹配，避免误删正文） */
/* 🧹 V4.3.88（用户：“正文界面偶尔会出现『章节错误，点此报送…』这种与小说无关的东西”）
 * 站点常往正文里塞一句套话（报送错章 / 请记住本站 / 手机用户请…）。
 * 它不是选择器能解决的 —— 文字就在正文容器里，所以只能在文本层过滤。
 * 🛥 两道安全闸：
 *   ① 必须**以它开头**（套话总是从行首起手；正文里“提到”这些词不算）；
 *   ② 行长 ≤ 60 字 —— 防止正文段落里恰好提到这些词被连带删掉。
 * 两条都满足才删；宁可漏一句广告，也不能吃正文。 */
const AUTO_BOILER_LINE_RE = /^(章节(内容)?(错误|有误|缺失|乱了)|点此报送|报送(本章|错误)|报送后.*(校正|修正)|请耐心等待|本章未完|点击?下一页继续|请记住本站|手机用户请|最新网址|首发(域名|网址)|一秒记住|免费阅读.*最新章节)/;
const AUTO_BOILER_MAXLEN = 60;

const AUTO_NAV_LINE_RE = /^(上一[章页節节]|下一[章页節节]|返回目录|回目录|目\s*录|章节目录|加入书签|添加书签|推荐本书|投推荐票|返回书架|上一页|下一页|手机阅读|电脑阅读|字体[大小]*[:：]?.*)$/;

function autoNormText(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function autoSigOf(el) {
  if (!el || !el.attribs) return '';
  return (String(el.attribs.id || '') + ' ' + String(el.attribs.class || '')).toLowerCase();
}

/* 往上 4 层找"坏味道"，命中越多越不可能是我们要的容器 */
function autoJunkPenalty(el) {
  let node = el, depth = 0, hit = 0;
  while (node && depth < 4) {
    if (AUTO_JUNK_RE.test(autoSigOf(node))) hit++;
    node = node.parent; depth++;
  }
  return Math.min(0.85, hit * 0.45);
}

function autoGoodBonus(el) {
  let node = el, depth = 0;
  while (node && depth < 4) {
    if (AUTO_GOOD_RE.test(autoSigOf(node))) return 0.3;
    node = node.parent; depth++;
  }
  return 0;
}

function autoIsDescendant(anc, node) {
  let n = node;
  while (n) { if (n === anc) return true; n = n.parent; }
  return false;
}

function autoDepthOf(el) {
  let d = 0, n = el;
  while (n && n.parent) { d++; n = n.parent; }
  return d;
}

/* 给一个 cheerio 元素生成**唯一**且能被 cheerio 再次解析的 CSS 选择器。
   优先级：id → tag.class → tag.class1.class2 → 结构路径（就近锚到带 id 的祖先）。
   🟥 每个候选都必须用 $(sel) 回验「只命中它自己」—— 不验证就返回，
   等于把"看起来对"当"真的对"，抓错容器时用户只会看到一本乱码书。 */
function autoSelectorFor($, el) {
  if (!el || !el.attribs || !el.name) return null;
  const tag = el.name;
  const isUnique = function (sel) {
    try { const found = $(sel); return found.length === 1 && found[0] === el; } catch (e) { return false; }
  };
  const id = String(el.attribs.id || '');
  if (/^[A-Za-z][\w-]*$/.test(id) && isUnique('#' + id)) return '#' + id;
  const classes = String(el.attribs.class || '').split(/\s+/).filter(function (c) { return /^[A-Za-z][\w-]*$/.test(c); });
  for (const c of classes) { if (isUnique(tag + '.' + c)) return tag + '.' + c; }
  if (classes.length >= 2) {
    const s2 = tag + '.' + classes.slice(0, 2).join('.');
    if (isUnique(s2)) return s2;
  }
  const segs = [];
  let node = el;
  while (node && node.name && node.name !== 'html') {
    const parent = node.parent;
    let seg = node.name;
    if (parent && parent.children) {
      const sibs = parent.children.filter(function (c) { return c.type === 'tag'; });
      if (sibs.length > 1) seg += ':nth-child(' + (sibs.indexOf(node) + 1) + ')';
    }
    segs.unshift(seg);
    const full = segs.join(' > ');
    if (isUnique(full)) return full;
    if (parent && parent.attribs && /^[A-Za-z][\w-]*$/.test(String(parent.attribs.id || ''))) {
      const anchored = '#' + parent.attribs.id + ' > ' + full;
      if (isUnique(anchored)) return anchored;
    }
    node = parent;
  }
  return null;
}

/* 章节列表识别：把每个链接挂到它最近 3 层祖先上分组，逐组打分取最高。
   打分信号（缺一不可地叠乘）：
     · 条数（开平方，避免"链接最多"就赢）
     · **链接形状一致性**：把 URL 里的数字抹成 # 后有多少条同形 —— 目录页几乎总是同形
     · **链接文字占容器文字的比**：目录容器几乎只有链接；body/正文段落会拉低它
     · 标题质量：非空、不太长
     · 章节关键词命中率（第N章/序章…）
     · class 语义（目录 vs 导航/页脚） */
function autoDetectChapterList($, pageUrl) {
  if (!cheerio || !$) return null;
  const pageKey = String(pageUrl).split('#')[0];
  let pageHost = '';
  try { pageHost = new URL(pageUrl).hostname; } catch (e) {}

  const groups = new Map();
  $('a[href]').each(function (i, a) {
    const raw = String((a.attribs && a.attribs.href) || '').trim();
    if (!raw || /^(javascript:|mailto:|tel:|data:|#)/i.test(raw)) return;
    let abs = '';
    try { abs = new URL(raw, pageUrl).href; } catch (e) { return; }
    if (!/^https?:/i.test(abs)) return;
    if (abs.split('#')[0] === pageKey) return;                 // 同页锚点不是新章节
    if (pageHost) {
      try { if (new URL(abs).hostname !== pageHost) return; } catch (e) { return; }   // 外链不算章节
    }
    const title = autoNormText($(a).text());
    let node = a.parent, depth = 0;
    while (node && node.attribs && depth < 3) {
      if (!groups.has(node)) groups.set(node, []);
      groups.get(node).push({ title: title, url: abs });
      node = node.parent; depth++;
    }
  });

  const shapeOf = function (u) {
    try { return new URL(u).pathname.replace(/\d+/g, '#'); } catch (e) { return ''; }
  };
  let best = null;
  groups.forEach(function (list, node) {
    if (list.length < 5) return;
    const good = list.filter(function (x) { return x.title && x.title.length <= 40; });
    const quality = good.length / list.length;
    if (quality < 0.7) return;
    const avgLen = good.reduce(function (s, x) { return s + x.title.length; }, 0) / Math.max(1, good.length);
    if (avgLen > 32) return;                                    // 平均太长 = 正文链接堆，不是目录
    const shapes = new Map();
    list.forEach(function (x) { const k = shapeOf(x.url); shapes.set(k, (shapes.get(k) || 0) + 1); });
    let maxShape = 0;
    shapes.forEach(function (v) { if (v > maxShape) maxShape = v; });
    const shapeRatio = maxShape / list.length;
    if (shapeRatio < 0.4) return;                               // 形状都不一致，基本不是目录
    const wordHits = good.filter(function (x) { return AUTO_CHAPTER_WORD_RE.test(x.title); }).length;
    const wordRatio = wordHits / Math.max(1, good.length);
    const containerLen = autoNormText($(node).text()).length;
    const linkLen = list.reduce(function (s, x) { return s + x.title.length; }, 0);
    const linkRatio = Math.min(1, linkLen / Math.max(1, containerLen));
    const junk = autoJunkPenalty(node);
    const bonus = autoGoodBonus(node);
    const score = Math.sqrt(list.length) * (0.3 + shapeRatio) * (0.2 + linkRatio) *
      quality * (1 + wordRatio * 0.8) * (1 + bonus) * (1 - junk);
    if (!best || score > best.score) {
      best = { node: node, list: list, score: score, shapeRatio: shapeRatio, wordRatio: wordRatio, linkRatio: linkRatio };
    }
  });
  if (!best) return null;
  /* 🟥 拿不到稳定选择器就别硬来 —— 交给上层报错并指路「高级」 */
  const sel = autoSelectorFor($, best.node);
  if (!sel) return null;
  return {
    item: sel + ' a',
    count: best.list.length,
    shapeRatio: Math.round(best.shapeRatio * 100) / 100,
    wordRatio: Math.round(best.wordRatio * 100) / 100,
    linkRatio: Math.round(best.linkRatio * 100) / 100
  };
}

/* 正文容器识别：按"文字量 ×（1-链接密度）× 语义加成"打分，再从最高分**往下钻**到最紧的包装层。
   不往下钻的话很容易停在 <body>/<main>（它也"包含正文"，但还裹着导航、推荐位、评论）。 */
function autoPickContentNode($) {
  if (!cheerio || !$) return null;
  const cands = [];
  $('div,article,section,main,td,pre').each(function (i, el) {
    const $el = $(el);
    const len = $el.text().replace(/\s+/g, '').length;
    if (len < 200) return;
    let linkLen = 0;
    $el.find('a').each(function (j, a) { linkLen += autoNormText($(a).text()).length; });
    const density = linkLen / Math.max(1, len);
    if (density > 0.4) return;                                   // 链接占四成以上 = 列表/导航
    const breaks = $el.find('p,br').length;
    const bonus = autoGoodBonus(el);
    const junk = autoJunkPenalty(el);
    const score = len * (1 - density) * (1 + bonus) * (1 - junk) * (1 + Math.min(1, breaks / 20) * 0.25);
    cands.push({ el: el, len: len, density: density, score: score });
  });
  if (!cands.length) return null;
  cands.sort(function (a, b) { return b.score - a.score; });
  let top = cands[0];
  for (let guard = 0; guard < 8; guard++) {
    let deeper = null;
    for (const c of cands) {
      if (c === top) continue;
      if (c.len < top.len * 0.75) continue;                      // 太小的后代是段落，不是容器
      if (!autoIsDescendant(top.el, c.el)) continue;
      if (!deeper || autoDepthOf(c.el) > autoDepthOf(deeper.el)) deeper = c;
    }
    if (!deeper) break;
    top = deeper;
  }
  return top.el;
}

function autoDetectContent($) {
  const node = autoPickContentNode($);
  if (!node) return null;
  const sel = autoSelectorFor($, node);
  if (!sel) return null;
  const chars = autoNormText($(node).text()).length;
  return { content: sel, remove: 'script,style,ins,iframe,.adsbygoogle', chars: chars };
}

/* 自动模式专用：只删**整行完全等于**导航词的行走，不做包含匹配（避免把正文里出现的
   "下一章"三个字连带删掉半句话）。 */
function autoCleanChapterText(text) {
  const lines = String(text == null ? '' : text).split('\n');
  const kept = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (t && AUTO_NAV_LINE_RE.test(t)) continue;
    /* 🧹 V4.3.88：站点套话（整行匹配 + 短行才删） */
    if (t && t.length <= AUTO_BOILER_MAXLEN && AUTO_BOILER_LINE_RE.test(t)) continue;
    kept.push(raw);
  }
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  while (kept.length && !kept[0].trim()) kept.shift();
  return kept.join('\n');
}

/* 正文容器开头那一串"链接农场"必须剥掉（V4.3.85）
 *
 * 真实案例（玄幻阁 xuanhuange.info）：每个章节页的 #content 第一个孩子就是
 *   「随机推荐：<a>书A</a>&nbsp;<a>书B</a>… ×8<br /><br />」然后才是正文。
 * 不剥的话**每一章**开头都会顶着 8 本别人的书名 —— 用户会以为抓到的是推荐页。
 *
 * 🟥 判据必须是**结构性的**，不能认站点、也不能认"推荐"这两个字：
 *   开头一小段（16 个节点内）里 ≥3 条链接，且链接文字占该段文字的 45% 以上 → 判为链接农场。
 *   正文段落一旦出现（>40 字的文本节点 / 块级元素）立刻停手，所以不会误删正文。
 *   两条都不满足就**一个字都不动**（宁可留一行广告，也不删正文）。
 *
 * 只对 rule.auto 生效：手动规则要保持原样，用户填了 remove 选择器就该按他说的办。 */
function autoStripLeadingLinkFarm($, $el) {
  if (!cheerio || !$ || !$el || !$el.length) return false;
  let removed = 0;
  /* 第一类：开头就是整块"几乎全是链接"的元素（推荐位常包一层 div） */
  for (let guard = 0; guard < 3; guard++) {
    const first = $el.contents().toArray().find(function (n) {
      return n.type === 'tag' || (n.type === 'text' && autoNormText(n.data || '') !== '');
    });
    if (!first || first.type !== 'tag') break;
    if (first.name === 'a' || first.name === 'br' || first.name === 'p') break;
    const $f = $(first);
    const fLinks = $f.find('a').length;
    if (fLinks < 3) break;
    const fText = autoNormText($f.text()).length;
    if (fText > 400) break;                              // 太长 ⇒ 是正文，不是推荐位
    let fLinkLen = 0;
    $f.find('a').each(function (j, a) { fLinkLen += autoNormText($(a).text()).length; });
    if (fLinkLen / Math.max(1, fText) < 0.5) break;
    try { $f.remove(); removed++; } catch (e) { break; }
  }
  /* 第二类：开头那"一行"（到第一个 <br> 为止）里链接占绝大多数 */
  const kids = $el.contents().toArray();
  const drop = [];
  let links = 0, linkLen = 0, otherLen = 0;
  for (let i = 0; i < kids.length && i < 16; i++) {
    const n = kids[i];
    if (n.type === 'tag' && n.name === 'a') {
      const t = autoNormText($(n).text());
      links++; linkLen += t.length; drop.push(n); continue;
    }
    if (n.type === 'text') {
      const t = autoNormText(n.data || '');
      if (t.length > 40) break;                          // 成段正文 → 停手
      otherLen += t.length; drop.push(n); continue;
    }
    if (n.type === 'tag' && n.name === 'br') {
      if (links >= 1) break;                             // 这一行结束了
      drop.push(n); continue;
    }
    if (n.type === 'tag' && n.name === 'span') {
      const t = autoNormText($(n).text());
      if (t.length > 40) break;
      otherLen += t.length; drop.push(n); continue;
    }
    break;
  }
  if (links >= 3 && linkLen / Math.max(1, linkLen + otherLen) >= 0.45) {
    drop.forEach(function (n) { try { $(n).remove(); removed++; } catch (e) {} });
  }
  if (removed) logToFile('info', 'auto source: stripped leading link farm (' + removed + ' nodes)');
  return removed > 0;
}

function autoHostOf(u) {
  try { return new URL(String(u || '')).hostname.replace(/^www\./i, ''); } catch (e) { return ''; }
}

/* ===== 详情页 → 目录页：跟一跳（V4.3.85）=====
 *
 * 为什么必须有：面板输入框的占位文案写的是「粘贴**目录/详情页** URL」——
 * 承诺了就得做到。很多站的书籍页（/book/123/）本身只有简介 + 一个「开始阅读」，
 * 目录在另一个页面（/book/123/index.html 或 /read/123/）。
 * 没有这一跳，用户粘详情页会被直接拒掉并要求自己去找目录页 —— 那就不是"无需任何手动操作"。
 *
 * 🟥 三条硬约束（别放宽）：
 *   ① **只跟一跳**。不递归 —— 递归跟链在坏站点上会变成爬虫，而且一旦跟错就再也回不来。
 *   ② **只跟同站**。跨站跳转是导航/广告，不是目录。
 *   ③ **必须换页**（去 # 后与原页不同），否则原地打转。
 * 跟丢就返回 null，让上层照旧报错并指路「高级」—— 不许硬塞一个"大概是目录"。
 */
const AUTO_TOC_ENTRY_RE = /^(查看目录|全部章节|章节目录|目录|章节列表|返回目录|目录页)$/;
const AUTO_START_ENTRY_RE = /^(开始阅读|立即阅读|在线阅读|免费阅读|从头阅读|点击阅读|正文|阅读)$/;

function autoFindReadEntry($, pageUrl) {
  if (!cheerio || !$) return null;
  const pageKey = String(pageUrl).split('#')[0];
  let pageHost = '';
  try { pageHost = new URL(pageUrl).hostname; } catch (e) { return null; }
  const tocHits = [], startHits = [];
  $('a[href]').each(function (i, a) {
    const raw = String((a.attribs && a.attribs.href) || '').trim();
    if (!raw || /^(javascript:|mailto:|tel:|data:|#)/i.test(raw)) return;
    const t = autoNormText($(a).text());
    if (!t || t.length > 12) return;                 // 入口按钮的文字很短；长句是正文链接
    const isToc = AUTO_TOC_ENTRY_RE.test(t);
    const isStart = AUTO_START_ENTRY_RE.test(t);
    if (!isToc && !isStart) return;
    let abs = '';
    try { abs = new URL(raw, pageUrl).href; } catch (e) { return; }
    if (!/^https?:/i.test(abs)) return;
    if (abs.split('#')[0] === pageKey) return;       // 原地打转
    try { if (new URL(abs).hostname !== pageHost) return; } catch (e) { return; }
    (isToc ? tocHits : startHits).push(abs);
  });
  /* 目录类入口优先：它直接就是目录页；「开始阅读」多半落到第 1 章，还得再认一次目录 */
  return tocHits[0] || startHits[0] || null;
}

/* 全自动主流程：一个 URL 进来，一本书出去。
   失败一律返回 { ok:false, error }，错误文案**要说人话并指路**（用户没有选择器可调，
   只说"未匹配"等于把他丢在原地）。 */
async function sourceAutoFetch(urlStr, sender) {
  const url = String(urlStr || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: TT('请粘贴一个 http(s) 开头的目录页或详情页 URL', 'Paste an http(s) index or detail page URL') };
  }
  if (!cheerio) return { ok: false, error: TT('解析组件未加载', 'Parser component not loaded') };
  const host = autoHostOf(url);
  const siteName = host || TT('书源站点', 'web source');

  /* ① 目录页 */
  let html = '';
  try {
    const buf = await sourceFetch(url);
    html = sourceDecode(buf, '');          // 空编码 = 交给 decodeBuffer 统一判（BOM / UTF-16 / 简繁投票）
  } catch (e) {
    logToFile('error', 'auto source: index fetch failed: ' + ((e && e.message) || e));
    return { ok: false, error: TT('打开这个页面失败：', 'Failed to open the page: ') + ((e && e.message) || e) };
  }
  const $ = cheerio.load(html);
  const pageTitle = autoNormText($('title').text()) || autoNormText($('h1').first().text()) || siteName;

  /* ② 章节列表（当前页认不出 → 跟一跳"查看目录/开始阅读"，再认一次）
     🟥 pageTitle 取的是**用户粘的那个页面**的标题：详情页的 title 通常就是书名，
     比跟过去之后的目录页 title（常带"最新章节列表"之类后缀）更干净。所以这里先算好，不随后续跳转改。 */
  let detList = autoDetectChapterList($, url);
  let entryUrl = '';
  if (!detList) {
    const entry = autoFindReadEntry($, url);
    if (entry) {
      try {
        const bufE = await sourceFetch(entry);
        const htmlE = sourceDecode(bufE, '');
        const $e = cheerio.load(htmlE);
        const detE = autoDetectChapterList($e, entry);
        if (detE) {
          detList = detE;
          html = htmlE;                     // 后续 parseChapterList 必须解析**目录页**的 HTML
          entryUrl = entry;
          logToFile('info', 'auto source: followed read entry ' + entry);
        }
      } catch (e) {
        logToFile('info', 'auto source: read entry fetch failed: ' + ((e && e.message) || e));
      }
    }
  }
  if (!detList) {
    return {
      ok: false,
      error: TT('没能自动识别出章节目录。这个地址既不是目录页，页面里也没找到「查看目录 / 开始阅读」这类入口 —— ' +
        '请换成「目录页」的 URL；也可以在「高级 → 规则」里手动填写选择器后走手动抓取。',
        'Could not auto-detect the chapter list. This is neither an index page nor does it link to one — ' +
        'paste the table-of-contents URL instead, or fill the selectors manually under Advanced → Rule.')
    };
  }
  const rule = {
    name: TT('自动', 'Auto') + ' · ' + siteName,
    auto: true,
    siteUrl: (function () { try { return new URL(url).origin; } catch (e) { return url; } })(),
    encoding: '',                          // 空 = 逐页自动判定编码（不同章节页编码可能不同）
    chapterList: { item: detList.item, linkAttr: 'href', titleAttr: null },
    content: { content: '', remove: '' },   // 第 ③ 步识别后填
    search: null,
    concurrent: 3,
    requestInterval: 250,
    chaptersReversed: false,
    contentAutoPaginate: false
  };
  const parsed = parseChapterList(html, url, rule);
  if (parsed.error) return { ok: false, error: parsed.error };
  const chapters = parsed.chapters || [];
  if (!chapters.length) {
    return { ok: false, error: TT('自动识别到了目录结构，但一个章节都没解析出来', 'Detected the index structure but parsed no chapters') };
  }

  /* ③ 正文容器：拿第 1 章来认（认不出就整单失败 —— 与其给一本乱码书，不如说清楚） */
  let detContent = null;
  try {
    const buf2 = await sourceFetch(chapters[0].url);
    detContent = autoDetectContent(cheerio.load(sourceDecode(buf2, '')));
  } catch (e) {
    logToFile('error', 'auto source: first chapter fetch failed: ' + ((e && e.message) || e));
  }
  if (!detContent) {
    return {
      ok: false,
      error: TT('目录已经识别好了（共 ' + chapters.length + ' 章），但第 1 章的正文容器认不出来。' +
        '可以在「高级 → 规则」里手动填「正文选择器」后走手动抓取。',
        'The index was detected (' + chapters.length + ' chapters), but the content container of chapter 1 could not be identified. ' +
        'Fill the content selector manually under Advanced → Rule and use the manual fetch.')
    };
  }
  rule.content = { content: detContent.content, remove: detContent.remove };

  /* ④ 抓正文（复用现成链路：并发 / 间隔 / 进度 / 取消 / 失败章节占位，全都不重复实现） */
  const res = await fetchSourceContents(chapters, rule, sender);
  if (res && res.cancelled) {
    return { ok: false, cancelled: true, error: TT('已取消，本次不载入', 'Cancelled — nothing was loaded') };
  }
  const contents = (res && res.contents) || [];
  const goodCount = contents.filter(function (c) { return c && !c.failed; }).length;
  if (!goodCount) {
    return { ok: false, error: TT('正文一章都没抓到（可能是站点需要登录 / 拦截了自动抓取）', 'No chapter content could be fetched (the site may require login or block automated access)') };
  }
  return {
    ok: true,
    title: pageTitle,
    chapters: contents,
    failed: (res && res.failed) || [],
    failedChapters: (res && res.failedChapters) || [],
    rule: rule,
    detected: {
      chapterSelector: detList.item,
      chapterCount: chapters.length,
      contentSelector: detContent.content,
      contentChars: detContent.chars,
      shapeRatio: detList.shapeRatio,
      wordRatio: detList.wordRatio,
      linkRatio: detList.linkRatio,
      duplicates: parsed.duplicates || 0,
      missing: (parsed.missing || []).length,
      sortedByNumber: !!parsed.sortedByNumber,
      followedEntry: entryUrl            // 非空 = 用户给的是详情页，自动跟到了目录页（面板会如实说）
    }
  };
}
// 用户的问题原话：「回退两三个页面可能是全站，但是你怎么确定它是全站？我们需要有这个会自行判断。」
// 所以这里**不用"砍路径猜"**，而是三件有证据的事：
//   ① 真实请求站点根（跟随重定向）→ 拿**最终落点**，这是它的真实主页，不是我们猜的；
//   ② 判它是不是"首页"而不是"某本书的详情页"（详情页特征明显：章节列表 / 作者 / 加入书架 / 最新章节…）；
//   ③ 在首页里**找搜索入口**（表单 action + 关键词参数名，或带 search 的链接），据此派生出搜索模板。
// 结论分级（由强到弱）：tpl（书源规则自带模板，最硬）> form（首页找到搜索入口，派生模板）> home（只找到主页，不可站内搜）
//   > unknown（连主页都没取到）。实测搜索成功过还会由渲染层把置信度升到 search（见 app.js/panel.js）。
const SITE_BOOK_MARKERS = ['章节列表', '目录', '最新章节', '加入书架', '作者：', '作者:', '字数：', '连载', '完本', '内容简介', '小说简介', '开始阅读', '投票推荐'];

function siteUpOneLevel(u) {
  try {
    const o = new URL(u);
    const seg = o.pathname.split('/').filter(Boolean);
    if (seg.length <= 1) return o.origin + '/';
    seg.pop();
    return o.origin + '/' + seg.join('/') + '/';
  } catch (e) { return ''; }
}

function siteSearchTemplateFromHtml($, baseUrl) {
  // ① 表单：最常见的搜索入口
  const forms = $('form').toArray();
  const nameCand = /^(q|wd|kw|keyword|key|keys|s|searchkey|searchword|search|word|query|k|text|name|bookname)$/i;
  for (const f of forms) {
    const $f = $(f);
    const inputs = $f.find('input,select').toArray();
    let kwName = '', kwId = '';
    for (const el of inputs) {
      const it = $(el);
      const t = String(it.attr('type') || 'text').toLowerCase();
      if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'image' || t === 'checkbox') continue;
      const n = it.attr('name') || it.attr('id') || '';
      if (n && nameCand.test(n)) { kwName = it.attr('name') || ''; kwId = it.attr('id') || ''; break; }
    }
    if (!kwName && !kwId) {
      for (const el of inputs) {
        const it = $(el);
        const t = String(it.attr('type') || 'text').toLowerCase();
        if (t !== 'text' && t !== 'search') continue;
        if (it.attr('name')) { kwName = it.attr('name'); break; }
      }
    }
    const param = kwName || kwId;
    if (!param) continue;
    const act0 = $f.attr('action') || baseUrl;
    let act; try { act = new URL(act0, baseUrl).href; } catch (e) { continue; }
    if (!/^https?:/i.test(act)) continue;
    // 参数名尽量原样（大多数站是 ASCII），非 ASCII 才编码
    const p = /^[A-Za-z0-9_\-]+$/.test(param) ? param : encodeURIComponent(param);
    return act + (act.indexOf('?') >= 0 ? '&' : '?') + p + '={kw}';
  }
  // ② 没有表单时的退路：找 href 里带 search 且带查询参数的链接，把参数值换成 {kw}
  const anchors = $('a[href]').toArray();
  for (const a of anchors) {
    let href = $(a).attr('href') || '';
    if (!/search|sou|so\?|=s\b|query/i.test(href)) continue;
    if (href.indexOf('=') < 0) continue;
    let abs; try { abs = new URL(href, baseUrl).href; } catch (e) { continue; }
    const qs = abs.split('?')[1];
    if (!qs) continue;
    const parts = qs.split('&');
    for (let i = 0; i < parts.length; i++) {
      const kv = parts[i].split('=');
      if (kv.length !== 2) continue;
      if (!/^(q|wd|kw|keyword|key|s|searchkey|word|query|k)$/i.test(kv[0])) continue;
      if (!kv[1]) continue;
      parts[i] = kv[0] + '={kw}';
      return abs.split('?')[0] + '?' + parts.join('&');
    }
  }
  return '';
}

function siteLooksLikeBookPage($, html) {
  let hits = 0;
  const t = ($('title').text() || '') + ' ' + String(html).slice(0, 200000);
  for (const m of SITE_BOOK_MARKERS) { if (t.indexOf(m) >= 0) hits++; }
  // 章节链接密集（第123章 / 第123节）也是详情页特征
  let chapLinks = 0;
  const as = $('a').toArray();
  for (const a of as) { if (/第\s*[0-9一二三四五六七八九十百千]+\s*[章节回]/.test($(a).text() || '')) { chapLinks++; if (chapLinks > 20) break; } }
  return { hits: hits, chapLinks: chapLinks, isBook: (hits >= 3 && chapLinks >= 8) || chapLinks >= 20 };
}

function hostOfUrl(u){ try { return new URL(u).host; } catch (e) { return ''; } }

/* 🆕 V4.3.24：判定站点时顺手**读出它叫什么名字**（用户要求：「也要自动读取它的名字，知道这是什么网站」）。
   取值优先级：og:site_name / application-name → <title> 里像站点名的那段 → 退回域名。
   title 常写成「页面名 - 站点名」或「站点名 | 页面名」，所以按分隔符切段后取**最后一段**更像站点名。 */
function siteNameFromHtml($, fallback) {
  const metaOf = sel => { try { return String(($(sel).first().attr('content')) || '').trim(); } catch (e) { return ''; } };
  let n = metaOf('meta[property="og:site_name"]') || metaOf('meta[name="og:site_name"]')
       || metaOf('meta[name="application-name"]') || metaOf('meta[name="apple-mobile-web-app-title"]');
  if (!n) {
    const t = String(($('title').text()) || '').trim();
    if (t) {
      const seg = t.split(/\s*[|\-–—_·]\s*/).map(s => s.trim()).filter(Boolean);
      n = (seg.length > 1 ? seg[seg.length - 1] : seg[0]) || '';
    }
  }
  n = String(n || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return n || fallback || '';
}

async function judgeSite(input) {
  const out = { ok: false, home: '', kind: 'unknown', searchTpl: '', name: '', title: '', evidence: [], note: '' };
  let origin = String((input && (input.origin || input.url)) || '').trim();
  if (!origin) return { ok: false, error: TT('缺少站点地址','Missing site address') };
  try { origin = new URL(origin).origin; } catch (e) { return { ok: false, error: TT('站点地址无效','Invalid site address') }; }
  out.home = origin + '/';
  const ruleTpl = String((input && input.searchTpl) || '').trim();

  // 从「书页」入手时先退到上一级，再从根开始试；最多 3 个候选
  const cands = [];
  const hintUrl = String((input && input.url) || '').trim();
  if (hintUrl) {
    let up = hintUrl;
    for (let i = 0; i < 2 && up; i++) { up = siteUpOneLevel(up); if (up && cands.indexOf(up) < 0) cands.push(up); }
  }
  if (cands.indexOf(origin + '/') < 0) cands.push(origin + '/');

  let html = '', finalUrl = '', got = false, lastErr = '';
  for (const c of cands) {
    try {
      const r = await httpGet(c, { timeout: 12000, withUrl: true });
      html = sourceDecode(r.buf, '');
      finalUrl = r.url || c;
      got = true;
      out.evidence.push(TT('已实际请求 ' + c + (finalUrl !== c ? ' → 跳转到 ' + finalUrl : '（无跳转）'), 'Actually requested ' + c + (finalUrl !== c ? ' → redirected to ' + finalUrl : ' (no redirect)')));
      break;
    } catch (e) { lastErr = String((e && e.message) || e); }
  }
  if (!got) {
    out.note = TT('站点根页取不到：' + lastErr, 'Could not fetch the site root: ' + lastErr);
    out.evidence.push(TT('站点根页请求失败：' + lastErr, 'Site root request failed: ' + lastErr));
    // 取不到页面时，只有「书源规则自带模板」这一条硬证据可用
    if (ruleTpl) { out.kind = 'tpl'; out.searchTpl = ruleTpl; out.ok = true; out.evidence.push(TT('采用书源规则里的搜索模板（未联网验证）','Using the search template from the source rule (not verified online)')); }
    return out;
  }
  out.home = finalUrl;
  let $ = cheerio.load(html);
  out.title = ($('title').text() || '').trim().slice(0, 60);

  // 主页 vs 书页
  let look = siteLooksLikeBookPage($, html);
  if (look.isBook) {
    out.evidence.push(TT('当前页面是「书籍详情页」特征（关键词命中 ' + look.hits + '、章节链接 ' + look.chapLinks + '）→ 退一级再看', 'This page looks like a book detail page (' + look.hits + ' keyword hits, ' + look.chapLinks + ' chapter links) → go up one level and retry'));
    const up = siteUpOneLevel(finalUrl);
    if (up && up !== finalUrl) {
      try {
        const r2 = await httpGet(up, { timeout: 12000, withUrl: true });
        const h2 = sourceDecode(r2.buf, '');
        const $2 = cheerio.load(h2);
        const l2 = siteLooksLikeBookPage($2, h2);
        out.evidence.push(TT('退到 ' + up + '：' + (l2.isBook ? '仍像书页' : '已是站点首页特征'), 'Went up to ' + up + ': ' + (l2.isBook ? 'still looks like a book page' : 'now looks like a site home page')));
        if (!l2.isBook) { $ = $2; html = h2; out.home = r2.url || up; look = l2; }
      } catch (e) { out.evidence.push(TT('退级请求失败：' + String((e && e.message) || e), 'Request after going up one level failed: ' + String((e && e.message) || e))); }
    }
  } else {
    out.evidence.push(TT('页面是「站点首页」特征（书页关键词仅 ' + look.hits + '、章节链接 ' + look.chapLinks + '）', 'This page looks like a site home page (only ' + look.hits + ' book keyword hits, ' + look.chapLinks + ' chapter links)'));
  }

  // 同域内链数量：首页通常导航密集
  let internal = 0;
  try {
    const host = new URL(out.home).host;
    for (const a of $('a[href]').toArray()) {
      const h = $(a).attr('href') || '';
      if (h.indexOf('http') === 0) { try { if (new URL(h).host === host) internal++; } catch (e) {} }
      else if (h && h[0] !== '#') internal++;
    }
  } catch (e) {}
  out.evidence.push(TT('站内链接 ' + internal + ' 个' + (internal >= 15 ? '（导航密集，符合站点首页）' : ''), internal + ' internal links' + (internal >= 15 ? ' (dense navigation, typical of a site home page)' : '')));

  // 🆕 V4.3.24：站点名字 —— 退级后要用**最终那张页面**的名字，所以在这里重新取一次
  out.siteName = siteNameFromHtml($, hostOfUrl(out.home));
  if (out.siteName) out.evidence.push(TT('站点名：' + out.siteName + '（自动读取，书库里能认出这是哪座站）', 'Site name: ' + out.siteName + ' (read automatically, so the library can tell which site it is)'));

  // 搜索入口
  const derived = siteSearchTemplateFromHtml($, out.home);
  if (ruleTpl) {
    out.kind = 'tpl'; out.searchTpl = ruleTpl;
    out.evidence.push(TT('书源规则自带搜索模板（最强证据）','The source rule ships its own search template (strongest evidence)'));
    if (derived && derived !== ruleTpl) out.evidence.push(TT('首页另有一个搜索入口：' + derived, 'The home page has another search entry: ' + derived));
  } else if (derived) {
    out.kind = 'form'; out.searchTpl = derived;
    out.evidence.push(TT('在首页找到搜索入口，派生模板：' + derived + '（尚未实测出结果）', 'Found a search entry on the home page, derived template: ' + derived + ' (not yet verified with a real query)'));
  } else {
    out.kind = 'home';
    out.evidence.push(TT('首页未找到可用的搜索入口 → 只能打开主页，不能在应用内直接搜这座站','No usable search entry found on the home page → this site can only be opened, not searched in-app'));
  }
  out.ok = true;
  return out;
}

// ---------- IPC ----------
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
ipcMain.on('window:resize-start', (e, p) => {
  if (mainWindow) {
    const b = mainWindow.getBounds();
    resizeBase = { x: b.x, y: b.y, width: b.width, height: b.height };
    /* 🆕 V4.3.99：记住拖的是哪条边。原来只算右下方向（dx/dy 一律加到 width/height），
       所以用户反馈「不能只有右下角可以」。缺省 'se' 兼容旧渲染层。 */
    resizeDir = String((p && p.dir) || 'se');
  }
});
ipcMain.on('window:resize-move', (e, p) => {
  if (!mainWindow || !resizeBase) return;
  const dx = Math.round(Number(p && p.dx) || 0);
  const dy = Math.round(Number(p && p.dy) || 0);
  const min = mainWindow.getMinimumSize();
  const d = resizeDir;
  let x = resizeBase.x, y = resizeBase.y;
  let w = resizeBase.width, h = resizeBase.height;
  /* 🟥 拖左/上边时 x/y 必须跟着走，否则窗口会朝反方向"长"出去（右边反而被推走）。
     宽度先夹到最小值再回算 x，保证被夹住时左边界不会越过右边界。 */
  if (d.indexOf('e') >= 0) w = Math.max(min[0], resizeBase.width + dx);
  if (d.indexOf('s') >= 0) h = Math.max(min[1], resizeBase.height + dy);
  if (d.indexOf('w') >= 0) {
    w = Math.max(min[0], resizeBase.width - dx);
    x = resizeBase.x + (resizeBase.width - w);
  }
  if (d.indexOf('n') >= 0) {
    h = Math.max(min[1], resizeBase.height - dy);
    y = resizeBase.y + (resizeBase.height - h);
  }
  mainWindow.setBounds({ x, y, width: w, height: h });
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
       会把 c:\users\<用户名>\desktop\x.txt 误判成"目录外"丢弃；另外只放行 userData+home
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
