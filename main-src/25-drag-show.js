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
