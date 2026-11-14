// SMOKE5：修复项回归
// 1)「恢复默认设置」之后快捷键仍是 12 项（缺陷 #1；V4.3.19 起脱监并入 9→10，V4.3.25 加目录 10→11，V4.3.29 加书签 11→12）
// 2) 版本号单点化：运行时版本 = package.json 版本，且标题 / 书架导出同源
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

app.setPath('userData', path.join(__dirname, '..', '_smoke_userdata'));

// smoke 脚手架：smoke5 是独立主进程，不加载 main.js，故自行注册 app:version，
// 以便验证「渲染层经 IPC getVersion 拉取单点版本」的完整链路（与真实主进程一致）。
ipcMain.handle('app:version', () => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version; } catch (e) { return '0.0.0'; }
});

// 节点侧真值：smoke5 是主进程，可直接读 package.json，作为版本单点的最终裁判。
const PKG_VERSION = (function () { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version; } catch (e) { return '0.0.0'; } })();

const problems = [];
function expect(name, cond, detail) {
  if (!cond) problems.push(name + (detail !== undefined ? ' -> ' + detail : ''));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 900, height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true, backgroundThrottling: false
    }
  });
  win.webContents.on('console-message', (e, level, msg) => {
    if (level < 2) return;
    const m = String(msg);
    if (m.includes('Electron Security Warning')) return;
    problems.push('CONSOLE: ' + m.slice(0, 200));
  });

  try {
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 2500));

    const out = await win.webContents.executeJavaScript(`(async () => {
      const R = window.__reader;
      const o = {};
      o.hasReader = !!R;
      o.appVersion = R.APP_VERSION;
      o.pkgVersion = (window.readerAPI && window.readerAPI.appVersion) || null;
      o.title = document.title;
      o.defaultCount = R.DEFAULT_SHORTCUTS ? Object.keys(R.DEFAULT_SHORTCUTS).length : -1;
      o.beforeCount = Object.keys(R.state.shortcuts).length;

      // 真实走一次「恢复默认设置」
      const oldConfirm = window.confirm;
      window.confirm = () => true;
      try { await R.resetAllSettings(); } finally { window.confirm = oldConfirm; }

      o.afterCount = Object.keys(R.state.shortcuts).length;
      o.afterKeys = Object.keys(R.state.shortcuts).sort().join(',');
      try { o.shelfExportVersion = (await R.exportShelfBooks()).version; } catch (e) { o.shelfExportVersion = 'ERR:' + e.message; }
      try { o.getVersion = await window.readerAPI.getVersion(); } catch (e) { o.getVersion = 'ERR:' + e.message; }
      return o;
    })()`, true);

    console.log('RESULT ' + JSON.stringify(out));

    expect('__reader 未暴露', out.hasReader === true);
    // 单点真源：运行时版本 == package.json(节点侧真值) == 主进程 IPC 版本
    expect('运行版本 ≠ package.json 单点', out.appVersion === PKG_VERSION, out.appVersion + ' vs ' + PKG_VERSION);
    expect('运行版本 ≠ 主进程 IPC 版本', out.appVersion === out.getVersion, out.appVersion + ' vs ' + out.getVersion);
    if (out.pkgVersion !== PKG_VERSION) console.log('INFO preload静态版本=' + out.pkgVersion + '（沙箱preload无法require fs，单点以getVersion为准，已验证一致）');
    expect('标题未使用单点版本', String(out.title).indexOf('V' + PKG_VERSION) >= 0, out.title);
    // 🟥 V4.3.19：脱监（脱离监控）加入快捷键系统 → 9 项变 10 项；V4.3.25 又加「目录」→ 11 项；
    //    📑 V4.3.29 加「书签」→ 12 项（改 DEFAULT_SHORTCUTS 必须同步这三处计数）
    expect('DEFAULT_SHORTCUTS 应为 12 项', out.defaultCount === 12, out.defaultCount);
    expect('重置后快捷键不是 12 项（缺陷 #1 复发）', out.afterCount === 12, out.afterCount);
    ['search', 'globalSearch', 'autoScroll', 'pickPoint', 'toolbar'].forEach(k => {
      expect('重置后缺少快捷键 ' + k, String(out.afterKeys).split(',').indexOf(k) >= 0, out.afterKeys);
    });
    expect('书架导出版本未跟随单点', out.shelfExportVersion === PKG_VERSION, out.shelfExportVersion);
  } catch (e) {
    problems.push('EXCEPTION: ' + ((e && e.message) || e));
  }

  if (problems.length) {
    console.log('PROBLEMS:\n' + problems.join('\n'));
    app.exit(1);
  } else {
    console.log('SMOKE5 PASS');
    app.exit(0);
  }
});

setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 45000);
