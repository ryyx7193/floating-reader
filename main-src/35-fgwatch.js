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
