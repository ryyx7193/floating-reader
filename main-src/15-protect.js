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
  const out = { verdict: 'unknown', offCount: -1, onCount: -1, ratio: -1, level: _pi.level, note: _pi.note, platform: process.platform };
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

    /* 开保护后残留的品红像素按「关保护时的比例」算，不按绝对个数。
       新版 Electron 的 desktopCapturer 抓屏时会把受保护窗口的边角/抗锯齿像素算进来（实测约 0.26%），
       主体已经变黑（保护生效），但若沿用 onCount>0 就算失败的零容忍判据会误报成「没生效」。
       1% 容差：0.26% 这类边角残留判为生效；真失效时 onCount 接近 offCount（>1%）仍然报红。 */
    out.ratio = out.offCount > 0 ? (out.onCount / out.offCount) : -1;
    if (out.offCount <= 0 && out.onCount <= 0) out.verdict = 'unavailable';
    else if (out.offCount > 0 && out.ratio <= 0.01) out.verdict = 'ok';
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
