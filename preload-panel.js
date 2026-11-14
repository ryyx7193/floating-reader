/* ⬜ V4.3.62：**面板窗口专用** preload（最小暴露面）
 *
 * 为什么单独一个文件：7 个面板窗原来和主窗共用同一个 `preload.js`，
 * 于是它们拿到了**全部 80 个通道** —— 包括只属于主窗的
 * `saveBackup` / `loadBackup` / `crypto:get-key` / `associateFiles` / `checkUpdate` /
 * `file:open-text` / `text:decode` / `startDrag` / `toggleFullScreen` / `quit` /
 * `setCompanion` / `setFgWatch` / `setContentProtection` / `setGlobalShortcut` …
 *
 * 面板窗是**会渲染远端/用户内容**的窗口（书名、站点名、被抓页面的 <title>、书源规则名），
 * 一旦面板里出现一处注入，攻击面就是整套 API，而不是"只有它自己需要的那 21 个"。
 * 这是纵深防御：主窗与面板的**能力边界按窗口分开**。
 *
 * 🟥 这里的方法清单必须与 `scripts/panel.js` **实际用到**的一一对应：
 *    exportLogs / logError / onPanelUpdate / onSourceProgress / openExternal /
 *    openLogFolder / openPanel / openTextFile / panelAction / panelReady /
 *    saveTextFile / siteJudge / sourceAddRule / sourceCancel / sourceAuto / sourceChapters /
 *    sourceContents / sourceFetchOne / sourceListRules / sourceRemoveRule /
 *    sourceSearch / tailLog   （共 22 个）
 * 门禁 `_v461_panel_api_gate.js` 会逐字核对这份清单与 panel.js 的调用，
 * 两边不一致（漏一个面板就崩、多一个就是多余的暴露面）都会红。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('readerAPI', {
  /* ---- 面板自身：就绪上报 / 动作上抛 / 数据下发 ---- */
  panelReady: () => ipcRenderer.send('panel:ready'),
  panelAction: (payload) => ipcRenderer.send('panel:action', payload),
  onPanelUpdate: (cb) => ipcRenderer.on('panel:update', (e, payload) => cb(payload)),

  /* ---- 面板之间互开（书架里点「目录」要打开 toc 面板） ---- */
  openPanel: (type) => ipcRenderer.send('panel:open', type),

  /* ---- 书源 / 书库：面板自己发起抓取与判定（进度要回传） ---- */
  sourceListRules: () => ipcRenderer.invoke('source:list-rules'),
  sourceAddRule: (rule) => ipcRenderer.invoke('source:add-rule', rule),
  sourceRemoveRule: (name) => ipcRenderer.invoke('source:remove-rule', name),
  sourceChapters: (payload) => ipcRenderer.invoke('source:chapters', payload),
  sourceContents: (payload) => ipcRenderer.invoke('source:contents', payload),
  /* 🆕 V4.3.85：自动抓取（一个 URL → 自动识别 → 整本） */
  sourceAuto: (payload) => ipcRenderer.invoke('source:auto', payload),
  sourceSearch: (payload) => ipcRenderer.invoke('source:search', payload),
  sourceFetchOne: (payload) => ipcRenderer.invoke('source:fetch-one', payload),
  sourceCancel: () => ipcRenderer.send('source:cancel'),
  onSourceProgress: (cb) => ipcRenderer.on('source:progress', (e, p) => cb(p)),
  siteJudge: (payload) => ipcRenderer.invoke('site:judge', payload),

  /* ---- 书库：读本地文件 / 导出选中 ---- */
  openTextFile: (opts) => ipcRenderer.invoke('file:open-text', opts),
  saveTextFile: (opts) => ipcRenderer.invoke('file:save-text', opts),

  /* ---- 外链与日志 ---- */
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  logError: (msg) => ipcRenderer.send('log:error', msg),
  tailLog: (count) => ipcRenderer.invoke('log:tail', count),
  openLogFolder: () => ipcRenderer.invoke('log:open'),
  exportLogs: () => ipcRenderer.invoke('log:export'),
});
