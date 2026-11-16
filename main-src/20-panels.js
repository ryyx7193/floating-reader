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
