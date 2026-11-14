/* V4.3.98 反馈渠道与打赏入口实测
 * 只验证：默认反馈地址是否注入、支持开发按钮是否存在、点击是否给出明确提示。
 * ⚠️ 不点「打开反馈地址」—— 那会真调系统浏览器。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const UD = path.join(os.tmpdir(), 'floating-reader-support-probe');
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
  const main = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /index\.html/.test(w.webContents.getURL() || ''));
  if (!main) { console.log('NO_MAIN'); app.exit(1); return; }
  const mw = main.webContents;

  await mw.executeJavaScript("window.readerAPI.openPanel('settings')").catch(() => {});
  await sleep(1400);
  const SW = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /panel\.html.*type=settings/.test(w.webContents.getURL() || ''));
  ck('SETTINGS_WINDOW', !!SW);
  if (!SW) { report(); return; }
  const pw = SW.webContents;

  // 1. 按钮存在 + 文本正确
  const info = await pw.executeJavaScript(`JSON.stringify({
    hasSupport: !!document.querySelector('[data-a="supportOpen"]'),
    supportText: (document.querySelector('[data-a="supportOpen"]')||{}).textContent || '',
    hasFeedback: !!document.querySelector('[data-a="feedbackOpen"]'),
    fbInput: (document.getElementById('feedbackUrlInput')||{}).value || '',
    rowBtns: document.querySelectorAll('#view-settings .srow:nth-of-type(3) button').length
  })`).catch(e => 'ERR:' + e.message);
  let h = {};
  try { h = JSON.parse(info); } catch (e) { ck('INFO_PARSE', false, String(info)); }
  ck('BTN_SUPPORT_EXISTS', h.hasSupport === true);
  ck('BTN_SUPPORT_TEXT_ZH', /支持开发/.test(String(h.supportText)), 'text=' + h.supportText);
  ck('BTN_FEEDBACK_STILL_THERE', h.hasFeedback === true);
  ck('FEEDBACK_DEFAULT_INJECTED', /github\.com/.test(String(h.fbInput)), 'value=' + h.fbInput);

  // 2. 赞助按钮
  //    🟥 一旦 CONFIG.SUPPORT_URL 配了真实地址，点击会**真打开系统浏览器** —— 测试里不能点。
  //    所以这里先读源码判断：配了地址就只做静态断言，没配才验证「点了给明确提示」。
  const appSrc = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'app.js'), 'utf8');
  const mUrl = appSrc.match(/SUPPORT_URL:\s*'([^']*)'/);
  const supportUrl = mUrl ? mUrl[1] : '';
  if (supportUrl) {
    ck('SUPPORT_URL_CONFIGURED', /^https:\/\//.test(supportUrl), 'url=' + supportUrl);
    ck('SUPPORT_CLICK_SKIPPED', true, '已配置地址，跳过点击以免弹出浏览器');
  } else {
    await pw.executeJavaScript(`(function(){const e=document.querySelector('[data-a="supportOpen"]');if(e)e.click();})()`).catch(() => {});
    await sleep(700);
    const hint = await mw.executeJavaScript(`(function(){
      const el = document.getElementById('hintBar') || document.querySelector('.hint-bar') || document.querySelector('[class*="hint"]');
      return el ? el.textContent : '';
    })()`).catch(() => '');
    ck('SUPPORT_CLICK_HINT', /暂未设置赞助地址|No sponsorship URL set/.test(String(hint)), 'hint=' + hint);
  }

  // 3. 切英文，按钮文本应跟着变
  await pw.executeJavaScript(`(function(){const e=document.querySelector('[data-a="lang"][data-v="en"]');if(e)e.click();})()`).catch(() => {});
  await sleep(900);
  const enText = await pw.executeJavaScript(`(document.querySelector('[data-a="supportOpen"]')||{}).textContent || ''`).catch(() => '');
  ck('BTN_SUPPORT_TEXT_EN', /Support this project/i.test(String(enText)), 'text=' + enText);

  report();
});

function report() {
  const bad = out.filter(x => !x[1]);
  out.forEach(x => { if (!x[1]) console.log('  X  ' + x[0] + ' -> ' + x[2]); });
  console.log('SUPPORT498: ' + (out.length - bad.length) + '/' + out.length + ' OK');
  console.log('SUPPORT498_VERDICT=' + (bad.length ? 'FAIL' : 'PASS'));
  app.exit(bad.length ? 1 : 0);
}
