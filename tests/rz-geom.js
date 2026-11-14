/* V4.3.99 拉伸热区几何诊断
 * 回答两个问题：
 * ① 热区判定位置是否像正常应用（贴视觉边缘、宽度合理、不挡按钮）
 * ② 有没有挡住标题栏 / 标题栏按钮（R12 全屏门禁失败的怀疑点）
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UD = path.join(os.tmpdir(), 'floating-reader-rz-geom');
try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) {}
app.setPath('userData', UD);
app.setAppPath(path.resolve(__dirname, '..'));
process.argv = [process.argv[0]];
require('../main.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(async () => {
  await sleep(2400);
  const W = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /index\.html/.test(w.webContents.getURL() || ''));
  if (!W) { console.log('NO_MAIN'); app.exit(1); return; }
  W.show();
  await sleep(500);
  const mw = W.webContents;

  const geo = await mw.executeJavaScript(`(function(){
    const pad = getComputedStyle(document.documentElement).getPropertyValue('--win-pad').trim();
    const appEl = document.getElementById('app');
    const appR = appEl.getBoundingClientRect();
    const out = { pad, win: { w: innerWidth, h: innerHeight }, app: { x: appR.x, y: appR.y, w: appR.width, h: appR.height }, zones: [], bars: [] };
    document.querySelectorAll('[data-rz]').forEach(function(e){
      const r = e.getBoundingClientRect();
      out.zones.push({ dir: e.getAttribute('data-rz'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cursor: getComputedStyle(e).cursor });
    });
    // 标题栏与按钮
    const bar = document.querySelector('.title-bar');
    if (bar) { const r = bar.getBoundingClientRect(); out.bar = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; }
    document.querySelectorAll('.title-bar button').forEach(function(b){
      const r = b.getBoundingClientRect();
      out.bars.push({ id: b.id || '(no-id)', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width/2), cy: Math.round(r.y + r.height/2) });
    });
    // 关键点位命中测试：标题栏中央、标题文字、每个按钮中心、内容区顶部
    out.hits = [];
    function hit(label, x, y){
      const el = document.elementFromPoint(x, y);
      out.hits.push({ label: label, x: Math.round(x), y: Math.round(y), tag: el ? el.tagName : 'null', cls: el ? (el.className || '') : '', dir: el && el.getAttribute ? (el.getAttribute('data-rz') || '') : '' });
    }
    if (out.bar) {
      hit('标题栏中央', out.bar.x + out.bar.w/2, out.bar.y + out.bar.h/2);
      hit('标题栏左上区', out.bar.x + 60, out.bar.y + 4);
    }
    out.bars.forEach(function(b){ hit('按钮:' + b.id, b.cx, b.cy); });
    // 视觉边缘（--win-pad）往里 1px / 往外 1px
    const p = parseFloat(pad) || 20;
    hit('上边缘(内容侧)', out.win.w/2, p + 1);
    hit('上边缘(投影侧)', out.win.w/2, p - 1);
    hit('下边缘(内容侧)', out.win.w/2, out.win.h - p - 1);
    hit('右边缘(内容侧)', out.win.w - p - 1, out.win.h/2);
    hit('左边缘(内容侧)', p + 1, out.win.h/2);
    return JSON.stringify(out);
  })()`).catch(e => 'ERR:' + e.message);

  let g = {};
  try { g = JSON.parse(geo); } catch (e) { console.log('PARSE_ERR=' + String(geo).slice(0, 300)); app.exit(1); return; }

  console.log('WIN=' + JSON.stringify(g.win) + '  --win-pad=' + g.pad);
  console.log('TITLEBAR=' + JSON.stringify(g.bar));
  console.log('--- 热区 ---');
  g.zones.forEach(z => console.log('  ' + z.dir.padEnd(3) + ' x=' + String(z.x).padStart(4) + ' y=' + String(z.y).padStart(4) + ' ' + z.w + 'x' + z.h + '  ' + z.cursor));
  console.log('--- 标题栏按钮 ---');
  g.bars.forEach(b => console.log('  ' + b.id.padEnd(20) + ' x=' + b.x + ' y=' + b.y + ' ' + b.w + 'x' + b.h));
  console.log('--- 命中测试（elementFromPoint）---');
  g.hits.forEach(h => console.log('  ' + h.label.padEnd(22) + ' (' + h.x + ',' + h.y + ') -> ' + h.tag + (h.dir ? ' [rz=' + h.dir + ']' : '') + ' .' + h.cls));

  // 重叠判定：任一热区矩形与任一按钮矩形相交 = 挡按钮
  const p = parseFloat(g.pad) || 20;
  let overlapBtn = [];
  g.bars.forEach(b => {
    g.zones.forEach(z => {
      const ix = Math.max(0, Math.min(b.x + b.w, z.x + z.w) - Math.max(b.x, z.x));
      const iy = Math.max(0, Math.min(b.y + b.h, z.y + z.h) - Math.max(b.y, z.y));
      if (ix > 0 && iy > 0) overlapBtn.push(z.dir + '↔' + b.id + ' ' + ix + 'x' + iy + 'px');
    });
  });
  console.log('--- 热区 vs 按钮 重叠 ---');
  console.log(overlapBtn.length ? '  ★重叠: ' + overlapBtn.join(' | ') : '  无重叠');

  // 热区是否侵入标题栏（y 方向）
  if (g.bar) {
    const barBottom = g.bar.y + g.bar.h;
    const invade = g.zones.filter(z => z.y < barBottom && z.dir.indexOf('n') >= 0);
    console.log('--- 顶部热区 vs 标题栏 ---');
    console.log('  标题栏 y=' + g.bar.y + '~' + barBottom);
    invade.forEach(z => console.log('  rz-' + z.dir + ' y=' + z.y + '~' + (z.y + z.h) + (z.y + z.h > g.bar.y ? '  ★侵入标题栏 ' + Math.min(z.y + z.h, barBottom - g.bar.y + g.bar.y) + 'px' : '')));
  }
  app.exit(0);
});
