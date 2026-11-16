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
