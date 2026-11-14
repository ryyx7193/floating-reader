/* V4.4.0「后台朗读」开关实测
 * 判据：
 *   ① 开关关闭（默认）→ 隐藏窗口必须停朗读（保持原有行为）
 *   ② 开关开启 → 用户主动隐藏（托盘 / Ctrl+Shift+H）**继续**朗读
 *   ③ 开关开启 → 被动隐藏（force=true，前台监听 / 伴随自动收起）**强制停**
 *   ④ 面板开关能真正翻转 state（不是只有视觉变化）
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UD = path.join(os.tmpdir(), 'floating-reader-ttsbg');
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

  const voices = await mw.executeJavaScript(`(function(){try{return (window.speechSynthesis.getVoices()||[]).length;}catch(e){return -1;}})()`);
  console.log('VOICES=' + voices);
  if (!voices || voices <= 0) { console.log('NO_VOICE'); console.log('TTSBG_VERDICT=SKIP'); app.exit(0); return; }

  const body = '第一章 测试\n' + '这是一段用于验证后台朗读开关的正文。'.repeat(150);
  await mw.executeJavaScript(`(function(){
    const f = new File([new Blob([${JSON.stringify(body)}],{type:'text/plain'})], 'ttsbg.txt', {type:'text/plain'});
    return window.__reader.loadFiles([f]).then(function(){return 'OK';}).catch(function(e){return 'ERR:'+e.message;});
  })()`).catch(() => {});
  await sleep(900);

  const speaking = () => mw.executeJavaScript(`(function(){try{return JSON.stringify({s:!!window.speechSynthesis.speaking,p:!!window.speechSynthesis.pending});}catch(e){return '{}';}})()`).then(JSON.parse).catch(() => ({}));
  const play = () => mw.executeJavaScript(`window.__reader.ttsPlay()`).catch(() => {});
  const stop = () => mw.executeJavaScript(`window.__reader.ttsStop()`).catch(() => {});
  const toggleBg = async () => {
    await mw.executeJavaScript(`window.readerAPI.openPanel('settings')`).catch(() => {});
    await sleep(1000);
    const SW = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /panel\.html.*type=settings/.test(w.webContents.getURL() || ''));
    if (!SW) return false;
    const r = await SW.webContents.executeJavaScript(`(function(){
      const el = document.getElementById('ttsBgSwitch');
      if(!el) return 'NO_SWITCH';
      el.click();
      return el.classList.contains('active') ? 'ON' : 'OFF';
    })()`).catch(() => 'ERR');
    await sleep(700);
    await mw.executeJavaScript(`window.readerAPI.closePanel('settings')`).catch(() => {});
    await sleep(400);
    return r;
  };

  // ① 默认关闭：隐藏 → 停
  await play();
  await sleep(1400);
  const a1 = await speaking();
  ck('DEFAULT_PLAYING', a1.s === true, JSON.stringify(a1));
  W.hide();
  await sleep(1300);
  const a2 = await speaking();
  ck('DEFAULT_STOPS_ON_HIDE', a2.s !== true && a2.p !== true, JSON.stringify(a2));
  W.show(); W.focus();
  await sleep(700);

  // ② 打开开关：隐藏 → 继续
  const t1 = await toggleBg();
  ck('SWITCH_ON', t1 === 'ON', 'toggle=' + t1);
  await play();
  await sleep(1400);
  const b1 = await speaking();
  ck('BG_PLAYING_BEFORE_HIDE', b1.s === true, JSON.stringify(b1));
  W.hide();
  await sleep(1600);
  const b2 = await speaking();
  ck('BG_CONTINUES_ON_HIDE', b2.s === true, '隐藏后应继续朗读；实际=' + JSON.stringify(b2));
  W.show(); W.focus();
  await sleep(700);
  await stop();
  await sleep(400);

  // ③ 开关仍开着，但发 force=true（模拟前台监听 / 伴随自动收起）→ 必须停
  await play();
  await sleep(1400);
  const c1 = await speaking();
  ck('BEFORE_FORCE_PLAYING', c1.s === true, JSON.stringify(c1));
  mw.send('window:visibility', false, true);
  await sleep(1400);
  const c2 = await speaking();
  ck('FORCE_HIDE_STOPS', c2.s !== true && c2.p !== true, '强制隐藏必须停；实际=' + JSON.stringify(c2));

  report();
});

function report() {
  const bad = out.filter(x => !x[1]);
  out.forEach(x => { if (!x[1]) console.log('  X  ' + x[0] + ' -> ' + x[2]); });
  console.log('TTSBG: ' + (out.length - bad.length) + '/' + out.length + ' OK');
  console.log('TTSBG_VERDICT=' + (bad.length ? 'FAIL' : 'PASS'));
  app.exit(bad.length ? 1 : 0);
}
