/* V4.3.99 朗读在「最小化 / 托盘隐藏」两种不可见情况下的行为实测
 * 判据：
 *   ① 可见时能开始朗读（speechSynthesis.speaking = true）
 *   ② 最小化 → 必须停
 *   ③ 恢复 → 不应自动续读（免得突然出声）
 *   ④ 托盘隐藏（hide）→ 必须停
 * 若环境没有可用语音，会明确报 NO_VOICE 而不是假绿。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UD = path.join(os.tmpdir(), 'floating-reader-tts-vis');
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
  if (!voices || voices <= 0) {
    console.log('NO_VOICE: 本机没有可用语音，朗读无法真启动 —— 不伪造结论');
    console.log('TTSVIS_VERDICT=SKIP');
    app.exit(0);
    return;
  }

  // 造一本书并载入（TXT 按文件分章，单文件 1 章即可）
  const body = '第一章 测试\n' + '这是一段用于验证朗读可见性行为的正文。'.repeat(120);
  const inj = await mw.executeJavaScript(`(function(){
    const f = new File([new Blob([${JSON.stringify(body)}],{type:'text/plain'})], 'tts-vis.txt', {type:'text/plain'});
    return window.__reader.loadFiles([f]).then(function(){ return 'OK'; }).catch(function(e){ return 'ERR:' + e.message; });
  })()`).catch(e => 'EXEC_ERR:' + e.message);
  ck('BOOK_LOADED', inj === 'OK', String(inj));
  await sleep(900);

  const speaking = () => mw.executeJavaScript(`(function(){try{return JSON.stringify({speaking:!!window.speechSynthesis.speaking,pending:!!window.speechSynthesis.pending,paused:!!window.speechSynthesis.paused});}catch(e){return '{}';}})()`).then(s => JSON.parse(s)).catch(() => ({}));

  // ① 可见时开始朗读
  await mw.executeJavaScript(`window.__reader.ttsPlay()`).catch(() => {});
  await sleep(1600);
  let s = await speaking();
  ck('TTS_STARTS_WHEN_VISIBLE', s.speaking === true || s.pending === true, JSON.stringify(s));

  // ② 最小化 → 应停
  W.minimize();
  await sleep(1500);
  s = await speaking();
  ck('TTS_STOPS_ON_MINIMIZE', s.speaking !== true && s.pending !== true, JSON.stringify(s));

  // ③ 恢复 → 不应自动续读
  W.restore();
  await sleep(1200);
  s = await speaking();
  ck('TTS_NOT_AUTO_RESUME_ON_RESTORE', s.speaking !== true, JSON.stringify(s));

  // ④ 重新朗读后托盘隐藏（hide）→ 应停
  await mw.executeJavaScript(`window.__reader.ttsPlay()`).catch(() => {});
  await sleep(1500);
  const beforeHide = await speaking();
  W.hide();
  await sleep(1500);
  const afterHide = await speaking();
  ck('TTS_STARTS_BEFORE_HIDE', beforeHide.speaking === true || beforeHide.pending === true, JSON.stringify(beforeHide));
  ck('TTS_STOPS_ON_HIDE', afterHide.speaking !== true && afterHide.pending !== true, JSON.stringify(afterHide));

  report();
});

function report() {
  const bad = out.filter(x => !x[1]);
  out.forEach(x => { if (!x[1]) console.log('  X  ' + x[0] + ' -> ' + x[2]); });
  console.log('TTSVIS: ' + (out.length - bad.length) + '/' + out.length + ' OK');
  console.log('TTSVIS_VERDICT=' + (bad.length ? 'FAIL' : 'PASS'));
  app.exit(bad.length ? 1 : 0);
}
