/* V4.3.99 拉伸热区：真实鼠标事件链路验证
 *
 * 分工：
 *   · resize-probe.js  → 主进程方向计算（API 层，17 项，可靠）
 *   · rz-geom.js       → 热区几何与遮挡（elementFromPoint，可靠）
 *   · 本脚本            → 真鼠标事件能否命中热区、方向是否传到主进程
 *
 * 🟥 为什么不在这里断言"拖 30px 窗口就该缩 30px"：
 *   `webContents.sendInputEvent` 的 x/y 是**窗口内相对坐标**，Electron 用
 *   「窗口位置 + 坐标」反推 screenX/screenY。而拖上/左边时窗口位置本身在变，
 *   下一帧的 screenY 基准就漂了 —— 实测拖 30px 被算成 160px。
 *   真实鼠标给的是绝对屏幕坐标，不会漂。所以尺寸断言只能手工验证，
 *   自动化这里只验「事件有没有到、方向对不对」。
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UD = path.join(os.tmpdir(), 'floating-reader-rz-drag');
try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) {}
app.setPath('userData', UD);
app.setAppPath(path.resolve(__dirname, '..'));
process.argv = [process.argv[0]];
require('../main.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const ck = (n, ok, d) => out.push([n, !!ok, d || '']);

const diag = { start: 0, move: 0, dirs: [] };
ipcMain.on('window:resize-start', (e, p) => { diag.start++; diag.dirs.push(String((p && p.dir) || 'se')); });
ipcMain.on('window:resize-move', () => { diag.move++; });

function drag(mw, from, to) {
  mw.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 });
  return sleep(60)
    .then(() => mw.sendInputEvent({ type: 'mouseMove', x: to.x, y: to.y, button: 'left', clickCount: 0 }))
    .then(() => sleep(150))
    .then(() => mw.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 }))
    .then(() => sleep(220));
}

app.whenReady().then(async () => {
  await sleep(2400);
  const W = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /index\.html/.test(w.webContents.getURL() || ''));
  if (!W) { console.log('NO_MAIN'); app.exit(1); return; }
  W.setBounds({ x: 300, y: 200, width: 620, height: 420 });
  W.show(); W.focus();
  await sleep(700);
  const mw = W.webContents;

  const pad = await mw.executeJavaScript(`parseFloat(getComputedStyle(document.getElementById('app')).paddingTop) || 0`);
  const edge = Math.round(pad);
  ck('PAD_DETECTED', edge >= 8 && edge <= 40, 'pad=' + edge);

  // ① 五个边缘点必须命中对应热区（判定位置正确性）
  const probes = [
    ['n', 310, edge],
    ['s', 310, 420 - edge],
    ['w', edge, 210],
    ['e', 620 - edge, 210],
    ['nw', edge, edge],
  ];
  const hits = await mw.executeJavaScript(`JSON.stringify(${JSON.stringify(probes)}.map(function(p){
    const el = document.elementFromPoint(p[1], p[2]);
    return { want: p[0], got: el && el.getAttribute ? (el.getAttribute('data-rz') || '') : '', tag: el ? el.tagName : 'null' };
  }))`).catch(() => '[]');
  let hl = [];
  try { hl = JSON.parse(hits); } catch (e) {}
  hl.forEach(h => ck('HIT_' + String(h.want).toUpperCase(), h.got === h.want, 'want=' + h.want + ' got=' + h.got + ' tag=' + h.tag));

  // ② 每个边缘点拖一下，主进程必须收到对应方向
  for (const [dir, x, y] of probes) {
    /* 🟥 每次拖拽前必须把窗口还原：上一轮拖左/上边会改窗口位置与尺寸，
       下一轮的坐标基准就错位了（实测右边缘那轮因此落到了内容区上）。 */
    W.setBounds({ x: 300, y: 200, width: 620, height: 420 });
    await sleep(180);
    const before = diag.start;
    await drag(mw, { x: x, y: y }, { x: x + 12, y: y + 12 });
    const got = diag.dirs[diag.start - 1];
    ck('IPC_DIR_' + dir.toUpperCase(), diag.start === before + 1 && got === dir,
       'start ' + before + '->' + diag.start + ' dir=' + got + ' 期望=' + dir);
  }

  // ③ 内容区中间按下不该触发 resize-start（对照：证明不是"到处都能拉"）
  {
    const before = diag.start;
    await drag(mw, { x: 310, y: 210 }, { x: 340, y: 240 });
    ck('CENTER_NO_RESIZE_START', diag.start === before, 'start ' + before + '->' + diag.start + '（内容区不应触发拉伸）');
  }

  // ④ 标题栏按钮中心按下不该触发 resize-start（对照：证明按钮没被抢）
  {
    const btn = await mw.executeJavaScript(`(function(){const b=document.getElementById('minimizeBtn');const r=b.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)});})()`);
    let pt = { x: 512, y: 44 };
    try { pt = JSON.parse(btn); } catch (e) {}
    const before = diag.start;
    await drag(mw, pt, { x: pt.x + 6, y: pt.y + 6 });
    ck('BUTTON_NO_RESIZE_START', diag.start === before,
       '按钮(' + pt.x + ',' + pt.y + ') start ' + before + '->' + diag.start + '（按钮不应触发拉伸）');
  }

  console.log('DIAG start=' + diag.start + ' move=' + diag.move + ' dirs=' + JSON.stringify(diag.dirs));
  ck('MOVE_EVENTS_FLOW', diag.move >= 5, 'move=' + diag.move);
  report();
});

function report() {
  const bad = out.filter(x => !x[1]);
  out.forEach(x => { if (!x[1]) console.log('  X  ' + x[0] + ' -> ' + x[2]); });
  console.log('RZDRAG499: ' + (out.length - bad.length) + '/' + out.length + ' OK');
  console.log('RZDRAG499_VERDICT=' + (bad.length ? 'FAIL' : 'PASS'));
  app.exit(bad.length ? 1 : 0);
}
