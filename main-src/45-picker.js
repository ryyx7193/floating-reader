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
