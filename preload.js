const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('readerAPI', {
  // 主窗口
  hideWindow: () => ipcRenderer.send('window:hide'),
  /* 🆕 V4.3.84：标题栏「最小化」按钮（与 hideWindow 刻意分开：
     隐藏 = 从任务栏消失、只能从托盘叫回；最小化 = 留在任务栏、点一下就回来）。 */
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  showWindow: () => ipcRenderer.send('window:show'),
  setWindowOpacity: (v) => ipcRenderer.send('window:opacity', v),
  /* 🟥 V4.3.49（R8-2）：改回 invoke —— 注册**可能失败**（新键被别的程序占用），
     主进程会回滚到旧键；原先用 send 单向发出去，渲染层拿不到结果，
     设置面板就一直显示那个注册不上的新键。返回值：
     { ok, requested, effective(显示形态), rolledBack, reason, detail }。 */
  setGlobalShortcut: (accel) => ipcRenderer.invoke('shortcut:set', accel),
  quit: () => ipcRenderer.send('app:quit'),
  /* 🎨 V4.3.86：可传取样点的屏幕 x（圆点正下方采样）；不传就走窗口中线。 */
  pickColor: (opts) => ipcRenderer.invoke('color:pick', opts),
  pickColorAt: (x, y) => ipcRenderer.invoke('color:pick-at', { x, y }),
  setAlwaysOnTop: (v) => ipcRenderer.send('window:always-on-top', v),
  setMinSize: (width, height) => ipcRenderer.send('window:min-size', { width, height }),
  // 拖动：mousedown 时把屏幕坐标一起送过去当基准，之后每个动画帧送一次拖动位置。
  // 拖动由渲染进程的鼠标事件驱动（和缩放窗口同一条策略），主进程只负责 setPosition。
  startDrag: (screenX, screenY) => ipcRenderer.send('window:drag-start', { x: screenX, y: screenY }),
  dragMove: (screenX, screenY) => ipcRenderer.send('window:drag-move', { x: screenX, y: screenY }),
  endDrag: () => ipcRenderer.send('window:drag-end'),
  /* V4.3.99：带上方向（n/s/e/w/ne/nw/se/sw），主进程据此决定改哪条边 */
  startResize: (dir) => ipcRenderer.send('window:resize-start', { dir }),
  resizeMove: (dx, dy) => ipcRenderer.send('window:resize-move', { dx, dy }),
  /* V4.4.0：第三个参数 force=true 表示「被动隐藏」（前台监听 / 伴随自动收起），必须强制停朗读 */
  onVisibilityChange: (cb) => ipcRenderer.on('window:visibility', (e, visible, force) => cb(visible, !!force)),
  /* 🖥 V4.3.53：双击标题栏切全屏。拖拽区那半由主进程的窗口消息钩子兜住，
     这里走的是标题栏里 no-drag 的部分；状态与失败都由主进程回传（规则 41）。 */
  toggleFullScreen: () => ipcRenderer.send('win:fullscreen'),
  onFullscreenChange: (cb) => ipcRenderer.on('window:fullscreen', (e, on) => cb(on)),
  onFullscreenFailed: (cb) => ipcRenderer.on('window:fullscreen-failed', (e, detail) => cb(detail)),
  onAppHover: (cb) => ipcRenderer.on('app:hover', (e, hovered) => cb(hovered)),
  // 老板模式：全局快捷键（主进程）→ 渲染层开关伪装
  onDisguiseToggle: (cb) => ipcRenderer.on('app:disguise', () => cb()),
  // 🛡 V4.3.37：伪装时把窗口标题/托盘名也换掉（DOM 层盖不住任务栏与 Alt-Tab 的标题）
  setDisguiseTitle: (payload) => ipcRenderer.send('app:disguise-title', payload),
  // 🛡 V4.3.39：向主进程上报「隐蔽态」（SOS/伪装）—— 二次启动时据此决定要不要拉起窗口
  setUiState: (st) => ipcRenderer.send('app:uiState', st),
  /* 🟥 V4.3.45（R4-3）：把界面语言同步给主进程 —— 托盘菜单 / 系统对话框标题 /
     回传给渲染层显示的 error 串都在主进程里生成，它们也必须跟着切语言。 */
  setLang: (lang) => ipcRenderer.send('app:lang', lang),
  // 🆘 V4.3.24 SOS：全局快捷键（Ctrl+Shift+H）由主进程转发过来 —— 窗口没焦点时也能一键收起/恢复
  onSos: (cb) => ipcRenderer.on('app:sos', () => cb()),
  // 前台窗口监听（自动隐身）：把开关与名单交给主进程的 PowerShell 观察器
  setFgWatch: (cfg) => ipcRenderer.send('fgwatch:set', cfg),
  /* 🟥 V4.3.49（R8-1）：观察器**真实状态**回传。
     原先主进程只有在拿不到观察器时写一行日志（且实测落盘成 `{}`），
     渲染层的开关照样点亮 —— 自动隐身/远控检测静默失效而用户毫不知情。
     payload: { ok, reason, detail, list }，reason ∈
       started / spawn-failed / child-error / exited / empty-list /
       unsupported-platform / not-ready / build-script */
  onFgWatchStatus: (cb) => ipcRenderer.on('fgwatch:status', (e, payload) => cb(payload)),
  /* 🆕 V4.3.53（R12-2）伴随模式：跟着目标程序一起出现 / 一起收起 + 贴边跟随。
     setCompanion 一次交齐 { enabled, list, mode, edge }（观察器把目标名单烧进命令行，
     改任何一项都整条重启）；redock 走 invoke，渲染层要按**真实结果**提示。 */
  setCompanion: (cfg) => ipcRenderer.send('companion:set', cfg),
  redockCompanion: () => ipcRenderer.invoke('companion:redock'),
  onCompanionStatus: (cb) => ipcRenderer.on('companion:status', (e, payload) => cb(payload)),
  /* 待命 / 恢复（standby:true = 目标关掉了，已收进托盘等它回来）。
     渲染层收到 true 就把朗读暂停掉 —— 窗口藏了但声音还在是最糟的体验。 */
  onCompanionStandby: (cb) => ipcRenderer.on('companion:standby', (e, payload) => cb(payload)),
  // 用户把窗口拖走 → 贴边暂停（一次性通知，别每拍弹）
  onCompanionDock: (cb) => ipcRenderer.on('companion:dock', (e, payload) => cb(payload)),
  /* 🆕 V4.3.54：检测阅读器正下方的应用（目标程序自动填入）。
     invoke 回 { ok, name, why }：ok=false 时渲染层出声引导（规则 41/46：失败必须可见）。 */
  detectCompanion: () => ipcRenderer.invoke('companion:detect'),
  // 🆕 V4.3.54：吸色联动 —— 主进程采到目标窗口框架主色就推过来（量化去抖后，不是每拍都推）
  onCompanionTint: (cb) => ipcRenderer.on('companion:tint', (e, payload) => cb(payload)),
  /* 🆕 V4.3.94：跟进设置里「重置」吸色 */
  resetCompanionTint: () => ipcRenderer.send('companion:tint-reset'),
  // 内容保护（防截屏/防录屏，V4.3.18）：true = 截屏录屏拿到黑屏；false = 文本模式，可正常截图
  setContentProtection: (on) => ipcRenderer.send('content:protect', !!on),
  getContentProtection: () => ipcRenderer.invoke('content:protect-get'),
  // 跨系统能力自检：本机防截屏是「完整生效 / 只部分生效 / 不支持」，用于如实提示用户
  getCapabilities: () => ipcRenderer.invoke('app:capabilities'),
  // 脱监自检：真截两次屏对比，给出「生效 / 未生效 / 无法判定」的结论
  runProtectSelfTest: () => ipcRenderer.invoke('content:selftest'),

  // 面板管理（主窗口调用）
  openPanel: (type) => ipcRenderer.send('panel:open', type),
  closePanel: (type) => ipcRenderer.send('panel:close', type),
  closeAllPanels: () => ipcRenderer.send('panel:close-all'),
  closeTopPanel: () => ipcRenderer.send('panel:close-top'),
  togglePanel: (type) => ipcRenderer.send('panel:toggle', type),
  sendPanelData: (type, payload) => ipcRenderer.send('panel:data', { type, payload }),
  onPanelAction: (cb) => ipcRenderer.on('panel:action', (e, payload) => cb(payload)),
  onPanelReady: (cb) => ipcRenderer.on('panel:ready', (e, type) => cb(type)),
  onPanelOpen: (cb) => ipcRenderer.on('panel:open', (e, type) => cb(type)),
  onPanelClosed: (cb) => ipcRenderer.on('panel:closed', (e, type) => cb(type)),
  onPanelsAllClosed: (cb) => ipcRenderer.on('panel:all-closed', () => cb()),

  // 日志与备份
  saveBackup: (data) => ipcRenderer.invoke('backup:save', data),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  /* 🛡 V4.3.75 S2：主进程备份 watchdog 的"补备"推送（备份超龄时主进程发 backup:nudge） */
  onBackupNudge: (cb) => ipcRenderer.on('backup:nudge', () => cb()),
  loadBackup: (name) => ipcRenderer.invoke('backup:load', name),
  logError: (msg) => ipcRenderer.send('log:error', msg),
  getCryptoKey: () => ipcRenderer.invoke('crypto:get-key'),
  exportLogs: () => ipcRenderer.invoke('log:export'),
  tailLog: (count) => ipcRenderer.invoke('log:tail', count),
  openLogFolder: () => ipcRenderer.invoke('log:open'),
  copyDiagnostics: () => ipcRenderer.invoke('log:copyDiagnostics'),
  exportFeedback: () => ipcRenderer.invoke('feedback:export'),

  // 更新检查 / 文件关联 / 外部链接
  checkUpdate: (url) => ipcRenderer.invoke('update:check', url),
  associateFiles: () => ipcRenderer.invoke('shell:associate'),
  openDefaultApps: () => ipcRenderer.invoke('shell:openDefaultApps'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  onOpenFile: (cb) => ipcRenderer.on('open:file', (e, payload) => cb(payload)),

  // 版本号唯一真源是 package.json。preload 运行在沙箱中，无法 require('fs') 直接读文件，
  // 故静态 appVersion 仅作占位，运行时版本统一由主进程经 IPC（getVersion）下发，
  // 渲染层在 syncAppVersion() 中 await getVersion() 取出并写入 APP_VERSION。
  appVersion: '0.0.0',
  getVersion: () => ipcRenderer.invoke('app:version'),

  // 文件对话框（由主进程弹出，避免子窗口调用系统弹窗时闪退）
  openTextFile: (opts) => ipcRenderer.invoke('file:open-text', opts),
  saveTextFile: (opts) => ipcRenderer.invoke('file:save-text', opts),
  /* 🛡 V4.3.43：本地 txt 的编码判定必须走**唯一真源** scripts/encoding.js。
     该模块是 CommonJS（module.exports），只被主进程 require，渲染层拿不到；
     而渲染层自己写的那份 ['UTF-8','GBK','big5'] 循环会把 Big5 繁体与 UTF-16 中文解成乱码。
     所以开一条只做解码的通道，把字节交回主进程算。 */
  decodeText: (bytes) => ipcRenderer.invoke('text:decode', bytes),

  sourceListRules: () => ipcRenderer.invoke('source:list-rules'),
  sourceAddRule: (rule) => ipcRenderer.invoke('source:add-rule', rule),
  sourceRemoveRule: (name) => ipcRenderer.invoke('source:remove-rule', name),
  sourceChapters: (payload) => ipcRenderer.invoke('source:chapters', payload),
  sourceContents: (payload) => ipcRenderer.invoke('source:contents', payload),
  sourceSearch: (payload) => ipcRenderer.invoke('source:search', payload),
  sourceFetchOne: (payload) => ipcRenderer.invoke('source:fetch-one', payload),
  sourceCancel: () => ipcRenderer.send('source:cancel'),
  onSourceProgress: (cb) => ipcRenderer.on('source:progress', (e, p) => cb(p)),
  // 🆕 V4.3.23 书库：真去请求站点根、判「首页 / 书籍详情页」、找搜索入口 → 返回判定与证据链
  siteJudge: (payload) => ipcRenderer.invoke('site:judge', payload),

  // 面板窗口自身调用
  panelReady: () => ipcRenderer.send('panel:ready'),
  panelAction: (payload) => ipcRenderer.send('panel:action', payload),
  onPanelUpdate: (cb) => ipcRenderer.on('panel:update', (e, payload) => cb(payload))
});
