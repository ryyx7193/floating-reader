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
