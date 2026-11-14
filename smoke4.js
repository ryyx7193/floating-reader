const { app, BrowserWindow } = require('electron');
const path = require('path');

// 用独立 userData，避免测试数据写进正式版书架
app.setPath('userData', path.join(__dirname, '..', '_smoke_userdata'));

const problems = [];
app.on('render-process-gone', (e, wc, d) => problems.push('RENDER_GONE ' + (d && d.reason)));
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.webContents.on('did-fail-load', (e, code, desc) => problems.push('DID_FAIL_LOAD ' + code + ' ' + desc));

  await win.loadFile('index.html');
  await new Promise(r => setTimeout(r, 1200));

  let parsed = null;
  try {
    const raw = await win.webContents.executeJavaScript(`(function(){
      const dz = document.getElementById('dropZone');
      const out = {};
      const fileDT = () => { const d = new DataTransfer(); d.items.add(new File(['x'], 'a.txt', {type:'text/plain'})); return d; };
      const textDT = () => { const d = new DataTransfer(); d.setData('text/plain', 'hello'); return d; };
      const fire = (type, init) => document.body.dispatchEvent(new DragEvent(type, Object.assign({bubbles:true, cancelable:true}, init)));
      const active = () => dz.classList.contains('active');

      out.pointerEvents = getComputedStyle(dz).pointerEvents;

      // 1. 外部文件拖入 -> 显示
      fire('dragover', {dataTransfer: fileDT()});
      out.shownOnFileDrag = active();

      // 2. 遮罩显示时不得吞掉点击（命中测试必须落在遮罩之下）
      const cx = Math.round(innerWidth/2), cy = Math.round(innerHeight/2);
      const hit = document.elementFromPoint(cx, cy);
      out.hitIsNotOverlay = !!hit && hit.id !== 'dropZone' && !dz.contains(hit);

      // 3. 拖出窗口（relatedTarget 为 null）-> 立即消失
      fire('dragleave', {relatedTarget: null});
      out.hiddenOnLeave = !active();

      // 4. 按住 Esc -> 消失
      fire('dragover', {dataTransfer: fileDT()});
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
      out.hiddenOnEscape = !active();

      // 5. 能点到窗口（mousedown 兜底）-> 消失
      fire('dragover', {dataTransfer: fileDT()});
      document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles:true}));
      out.hiddenOnMouseDown = !active();

      // 6. 拖拽结束 -> 消失
      fire('dragover', {dataTransfer: fileDT()});
      document.dispatchEvent(new DragEvent('dragend', {bubbles:true}));
      out.hiddenOnDragEnd = !active();

      // 7. 内部拖文字/元素不触发遮罩
      fire('dragover', {dataTransfer: textDT()});
      out.textDragNoOverlay = !active();

      // 8. 看门狗：无后续事件时 1.5s 内自动清除
      fire('dragover', {dataTransfer: fileDT()});
      out.shownBeforeWatchdog = active();
      return JSON.stringify(out);
    })()`);
    parsed = JSON.parse(raw);
  } catch (err) {
    problems.push('EXEC_FAIL ' + err.message);
  }

  await new Promise(r => setTimeout(r, 1500));
  try {
    const stillActive = await win.webContents.executeJavaScript(
      `document.getElementById('dropZone').classList.contains('active')`);
    if (stillActive) problems.push('WATCHDOG: dropZone 超时后仍然显示');
  } catch (err) {
    problems.push('EXEC_FAIL2 ' + err.message);
  }

  if (parsed) {
    const expect = {
      pointerEvents: 'none',
      shownOnFileDrag: true,
      hitIsNotOverlay: true,
      hiddenOnLeave: true,
      hiddenOnEscape: true,
      hiddenOnMouseDown: true,
      hiddenOnDragEnd: true,
      textDragNoOverlay: true,
      shownBeforeWatchdog: true
    };
    Object.keys(expect).forEach(k => {
      if (parsed[k] !== expect[k]) problems.push('MISMATCH ' + k + ' expected=' + expect[k] + ' got=' + parsed[k]);
    });
  }

  if (problems.length) {
    console.log('PROBLEMS:\n' + problems.join('\n'));
    app.exit(1);
  } else {
    console.log('SMOKE4 PASS');
    app.exit(0);
  }
});

setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 30000);
