/* V4.3.99 八向拉伸实测
 * ① 8 个热区元素存在、cursor 正确
 * ② 主进程方向计算：对每个方向发 startResize(dir) + resizeMove(dx,dy)，
 *    断言 bounds 变化方向正确（拖左/上边时 x/y 必须跟着走）
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UD = path.join(os.tmpdir(), 'floating-reader-resize-probe');
try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) {}
app.setPath('userData', UD);
app.setAppPath(path.resolve(__dirname, '..'));
process.argv = [process.argv[0]];
require('../main.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const ck = (n, ok, d) => out.push([n, !!ok, d || '']);

app.whenReady().then(async () => {
  await sleep(2400);
  const W = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /index\.html/.test(w.webContents.getURL() || ''));
  if (!W) { console.log('NO_MAIN'); app.exit(1); return; }
  const mw = W.webContents;
  W.show();
  await sleep(400);

  // ① 热区与 cursor
  const ui = await mw.executeJavaScript(`JSON.stringify({
    count: document.querySelectorAll('[data-rz]').length,
    dirs: [...document.querySelectorAll('[data-rz]')].map(e => e.getAttribute('data-rz')).sort(),
    hasGripId: !!document.getElementById('resizeGrip'),
    cursors: [...document.querySelectorAll('[data-rz]')].reduce((m, e) => {
      const d = e.getAttribute('data-rz'); m[d] = getComputedStyle(e).cursor; return m;
    }, {})
  })`).catch(e => 'ERR:' + e.message);
  let h = {};
  try { h = JSON.parse(ui); } catch (e) { ck('UI_PARSE', false, String(ui)); }
  ck('RZ_COUNT_8', h.count === 8, 'count=' + h.count);
  ck('RZ_ALL_DIRS', JSON.stringify(h.dirs) === JSON.stringify(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']), JSON.stringify(h.dirs));
  ck('RZ_GRIP_ID_KEPT', h.hasGripId === true, 'smoke.js 依赖这个 id');
  const cur = h.cursors || {};
  ck('RZ_CURSOR_N', cur.n === 'ns-resize', 'n=' + cur.n);
  ck('RZ_CURSOR_E', cur.e === 'ew-resize', 'e=' + cur.e);
  ck('RZ_CURSOR_NW', cur.nw === 'nwse-resize', 'nw=' + cur.nw);
  ck('RZ_CURSOR_NE', cur.ne === 'nesw-resize', 'ne=' + cur.ne);
  ck('RZ_CURSOR_SW', cur.sw === 'nesw-resize', 'sw=' + cur.sw);

  // ② 方向计算：基准 620x420，向右下各推 60/40
  const DX = 60, DY = 40;
  const cases = [
    ['e',  { dx: DX, dy: 0 }],
    ['w',  { dx: DX, dy: 0 }],
    ['s',  { dx: 0, dy: DY }],
    ['n',  { dx: 0, dy: DY }],
    ['se', { dx: DX, dy: DY }],
    ['nw', { dx: DX, dy: DY }],
    ['ne', { dx: DX, dy: DY }],
    ['sw', { dx: DX, dy: DY }],
  ];
  for (const [dir, mv] of cases) {
    W.setBounds({ x: 300, y: 200, width: 620, height: 420 });
    await sleep(160);
    const base = W.getBounds();
    await mw.executeJavaScript(`window.readerAPI.startResize(${JSON.stringify(dir)})`);
    await sleep(120);
    await mw.executeJavaScript(`window.readerAPI.resizeMove(${mv.dx}, ${mv.dy})`);
    await sleep(200);
    const b = W.getBounds();
    const dw = b.width - base.width, dh = b.height - base.height;
    const dX = b.x - base.x, dY = b.y - base.y;

    let want = { dw: 0, dh: 0, dX: 0, dY: 0 };
    if (dir.includes('e')) want.dw = DX;
    if (dir.includes('w')) { want.dw = -DX; want.dX = DX; }
    if (dir.includes('s')) want.dh = DY;
    if (dir.includes('n')) { want.dh = -DY; want.dY = DY; }

    const ok = dw === want.dw && dh === want.dh && dX === want.dX && dY === want.dY;
    ck('DIR_' + dir.toUpperCase(), ok,
       `base=${base.width}x${base.height}@${base.x},${base.y} -> ${b.width}x${b.height}@${b.x},${b.y} | 实际 dw=${dw} dh=${dh} dX=${dX} dY=${dY} | 期望 dw=${want.dw} dh=${want.dh} dX=${want.dX} dY=${want.dY}`);
  }

  // ③ 最小尺寸钳制：向左推超过最小宽，x 不能被推到右边界之外
  W.setBounds({ x: 300, y: 200, width: 400, height: 300 });
  await sleep(160);
  const b3 = W.getBounds();
  await mw.executeJavaScript(`window.readerAPI.startResize('w')`);
  await sleep(120);
  await mw.executeJavaScript(`window.readerAPI.resizeMove(9999, 0)`);
  await sleep(220);
  const b4 = W.getBounds();
  const minW = W.getMinimumSize()[0];
  ck('MIN_WIDTH_CLAMP', b4.width === minW && b4.x === b3.x + (b3.width - minW),
     `w=${b4.width} (min=${minW}) x=${b4.x} 期望 x=${b3.x + (b3.width - minW)}`);

  report();
});

function report() {
  const bad = out.filter(x => !x[1]);
  out.forEach(x => { if (!x[1]) console.log('  X  ' + x[0] + ' -> ' + x[2]); });
  console.log('RESIZE499: ' + (out.length - bad.length) + '/' + out.length + ' OK');
  console.log('RESIZE499_VERDICT=' + (bad.length ? 'FAIL' : 'PASS'));
  app.exit(bad.length ? 1 : 0);
}
