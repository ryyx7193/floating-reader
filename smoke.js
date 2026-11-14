const { app, BrowserWindow } = require('electron');
const path = require('path');
let failed = false;
app.on('render-process-gone', (e, wc, d) => { console.error('RENDER_GONE', d && d.reason); failed = true; });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 640, height: 440, webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true } });
  win.webContents.on('console-message', (e, level, message, line, sourceId) => {
    if (level >= 2) { console.log('CONSOLE_WARN/ERR:', message); }
  });
  win.webContents.on('did-fail-load', (e, code, desc, url) => { console.error('DID_FAIL_LOAD', code, desc, url); failed = true; });
  await win.loadFile('index.html');
  await new Promise(r => setTimeout(r, 1200));
  const result = await win.webContents.executeJavaScript(`(function(){
    const r = window.__reader;
    return JSON.stringify({
      hasReader: !!r,
      state: r ? { windowOpacity: r.state.windowOpacity, textOpacity: r.state.textOpacity, skins: r.CONFIG.SKINS.join(','), readMode: r.state.readMode } : null,
      funcs: r ? ['applyWindowOpacity','setAutoScrollSpeed','toggleAutoScroll','toggleAutoPick','performSearch','loadFiles','openPanel','closeAllPanels','runGlobalSearch','syncTOCPanel','handlePanelAction'].map(f=>typeof r[f]) : null,
      // 主窗滑块已随影子 UI 一起迁到工具栏小窗（见 smoke3 的 TOOLBAR 断言），
      // 这里只校验主窗仍保留的把手与轻提示，以及三块死面板确实已摘除
      shadowUiRemoved: !document.getElementById('toolbarPanel') && !document.getElementById('settingsPanel') && !document.getElementById('tocPanel'),
      grip: !!document.getElementById('resizeGrip'),
      toast: !!document.getElementById('hintToast'),
      darkRule: Array.from(document.styleSheets).some(s => { try { return Array.from(s.cssRules||[]).some(r => r.selectorText && r.selectorText.includes('skin-dark')); } catch(e){ return false; } })
    });
  })()`);
  console.log('RESULT', result);
  if (result && result.includes('"hasReader":true') && !result.includes('null')) {} else { failed = true; }
  app.exit(failed ? 1 : 0);
});
setTimeout(() => { console.error('TIMEOUT'); app.exit(2); }, 15000);