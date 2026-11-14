/* 验证技术前提：窗口 hide() 之后，Web Speech 还能不能启动并持续朗读。
 * 这决定"后台继续朗读"方案是否可行 —— 如果隐藏后 TTS 根本不出声，
 * 加开关也没用，得改系统级 TTS。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path'); const fs = require('fs'); const os = require('os');
const UD = path.join(os.tmpdir(), 'floating-reader-tts-cap');
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
  const mw = W.webContents;
  const st = () => mw.executeJavaScript(`JSON.stringify({s:!!window.speechSynthesis.speaking,p:!!window.speechSynthesis.pending})`).then(JSON.parse).catch(()=>({}));

  // 直接绕过应用逻辑，用原生 API 在隐藏窗口里朗读
  W.hide();
  await sleep(800);
  console.log('HIDDEN=' + !W.isVisible());
  await mw.executeJavaScript(`(function(){
    try{
      window.__cap = { started:false, ended:false, err:'' };
      const u = new SpeechSynthesisUtterance('这是一段后台朗读测试文本，用来验证隐藏窗口能否继续发声。'.repeat(6));
      u.onstart = function(){ window.__cap.started = true; };
      u.onend = function(){ window.__cap.ended = true; };
      u.onerror = function(e){ window.__cap.err = String(e && e.error || e); };
      window.speechSynthesis.speak(u);
      return 'SPEAK_CALLED';
    }catch(e){ return 'ERR:' + e.message; }
  })()`).catch(e => 'EXEC_ERR:' + e.message).then(r => console.log('CALL=' + r));

  await sleep(1200);
  console.log('AFTER_1.2s=' + JSON.stringify(await st()));
  const cap1 = await mw.executeJavaScript(`JSON.stringify(window.__cap||{})`).catch(()=>'{}');
  console.log('CAP_1.2s=' + cap1);
  await sleep(2000);
  console.log('AFTER_3.2s=' + JSON.stringify(await st()));
  const cap2 = await mw.executeJavaScript(`JSON.stringify(window.__cap||{})`).catch(()=>'{}');
  console.log('CAP_3.2s=' + cap2);
  app.exit(0);
});
