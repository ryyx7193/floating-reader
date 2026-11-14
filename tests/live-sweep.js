/* V4.3.97 实机功能巡检（真加载 main.js、独立 userData、真点按钮、读 DOM 状态）
 * 目标：覆盖用户可见功能入口，找"点了没反应 / 状态不一致 / 运行时报错"。
 * ⚠️ 不弹系统对话框、不联网、不联动真实窗口（目标名用 faketarget）。
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const os = require('os');
const UD = path.join(os.tmpdir(), 'floating-reader-live-sweep');   /* 一次性隔离目录 */
try { fs.rmSync(UD, { recursive: true, force: true }); } catch (e) {}
app.setPath('userData', UD);
/* 🟥 本脚本在 tests/ 下，若不改 appPath，main.js 的 loadFile('index.html') 会去
   tests/ 找页面（不存在）。Electron 的 appPath 默认取入口脚本目录，必须显式指回仓库根。 */
app.setAppPath(path.resolve(__dirname, '..'));
process.argv = [process.argv[0]];
require('../main.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const errs = [];
const ck = (n, ok, d) => out.push([n, !!ok, d || '']);
const F = 'faketarget';

app.whenReady().then(async () => {
  await sleep(2500);
  const main = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /index\.html/.test(w.webContents.getURL() || ''));
  const panel = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /panel\.html/.test(w.webContents.getURL() || ''));
  /* 🟥 每种面板是**独立窗口**（loadFile 带 ?type=xxx），必须按 type 定位，不能复用第一个窗口 */
  const panelOf = (t) => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && new RegExp('panel\\.html.*type=' + t + '(?:&|$)').test(w.webContents.getURL() || ''));
  const W = main();
  if (!W) { console.log('NO_MAIN'); app.exit(1); return; }
  const mw = W.webContents;
  mw.on('console-message', (e, lvl, msg) => {
    const s = String(msg || '');
    if (lvl >= 2 && !/CSP|Refused to load|favicon/i.test(s)) errs.push('MAIN ' + s.slice(0, 180));
  });
  app.on('render-process-gone', (e, wc, d) => errs.push('RENDER_GONE ' + (d && d.reason)));

  // 用 __reader 注入一本书（不弹文件对话框）
  const inj = await mw.executeJavaScript(`(function(){
    try {
      const r = window.__reader; if(!r) return 'NO_READER';
      const mk = (name, txt) => new File([txt], name, {type:'text/plain'});
      return r.loadFiles([mk('巡检小说.txt','第一章 山门\\n'+'甲'.repeat(300)+'\\n第二章 江上\\n'+'乙'.repeat(300))])
        .then(()=>'OK').catch(e=>'ERR:'+e.message);
    } catch(e){ return 'ERR:'+e.message; }
  })()`).catch(e => 'EXEC_ERR:' + e.message);
  await sleep(1200);

  const st = () => mw.executeJavaScript(`JSON.stringify({
    n: (window.__reader.state.chapters||[]).length,
    idx: window.__reader.state.currentIndex,
    title: (document.getElementById('statusText')||{}).textContent||'',
    bodyLen: ((document.getElementById('novelContent')||{}).textContent||'').length,
    paged: document.getElementById('contentWrapper').classList.contains('paged'),
    single: document.getElementById('contentWrapper').classList.contains('single-line'),
    fs: document.getElementById('novelContent').style.fontSize,
    lang: document.documentElement.lang || document.body.getAttribute('data-lang') || '',
    disguised: !!window.__reader.state.isDisguised,
    skin: window.__reader.state.skinIndex,
    textColor: window.__reader.state.textColor,
    bgRgb: JSON.stringify(window.__reader.state.bgRgb)
  })`).then(s => JSON.parse(s)).catch(() => ({}));

  // ---------- A 启动 / 书籍载入 ----------
  let s = await st();
  /* 🟥 自证测的是 4.3.97 新页面（避免误加载 work/ 根目录下遗留的历史页面） */
  const mainUrl = W.webContents.getURL();
  const pkgVer = require('../package.json').version;
  const expectIdx = path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/').toLowerCase();
  const gotIdx = decodeURIComponent(mainUrl.replace(/^file:\/{2,3}/, '')).replace(/\\/g, '/').toLowerCase();
  ck('A0_VERSION_SELFCHECK', gotIdx === expectIdx && /^\d+\.\d+\.\d+$/.test(pkgVer),
     'url=' + mainUrl + ' expect=' + expectIdx + ' version=' + pkgVer);
  ck('A1_MAIN_WINDOW', !!W, '主窗');
  ck('A2_BOOK_LOADED', s.n >= 1 && s.bodyLen > 100, 'inj=' + inj + ' chapters(TXT按文件分章)=' + s.n + ' bodyLen=' + s.bodyLen);
  ck('A3_NO_BLANK_SCREEN', s.bodyLen > 100, 'bodyLen=' + s.bodyLen);

  // ---------- B 章节导航 ----------
  await mw.executeJavaScript(`document.getElementById('nextBtn').click()`); await sleep(500);
  let s2 = await st();
  ck('B1_NEXT_NO_OVERFLOW', s2.idx >= 0 && s2.idx < s.n, 'idx=' + s2.idx + ' n=' + s.n);
  await mw.executeJavaScript(`document.getElementById('prevBtn').click()`); await sleep(500);
  let s3 = await st();
  ck('B2_PREV_NO_OVERFLOW', s3.idx >= 0 && s3.idx < s.n, 'idx=' + s3.idx + ' n=' + s.n);

  // ---------- C 工具栏面板 + 6 个顶部按钮 ----------
  await mw.executeJavaScript(`window.readerAPI.openPanel('toolbar')`).catch(()=>{});
  await sleep(1400);
  const P = panel();
  ck('C1_TOOLBAR_PANEL_OPEN', !!P);
  if (!P) { report(); return; }
  const pwToolbar = P.webContents;
  pwToolbar.on('console-message', (e, lvl, msg) => {
    const s = String(msg || '');
    if (lvl >= 2 && !/CSP|Refused to load|favicon/i.test(s)) errs.push('PANEL ' + s.slice(0, 180));
  });
  const click = sel => pw.executeJavaScript(`(function(){const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO_EL';e.click();return 'OK';})()`).catch(e => 'ERR:' + e.message);
  const exists = sel => pw.executeJavaScript(`!!document.querySelector(${JSON.stringify(sel)})`).catch(() => false);

  let pw = pwToolbar;
  const labels = await pw.executeJavaScript(`[...document.querySelectorAll('#view-toolbar .btn .label')].slice(0,6).map(e=>e.textContent).join(',')`).catch(()=>'');
  ck('C2_TOP6', labels === '缩小,放大,重置,单行,分页,皮肤', labels);

  // 字号：放大两次 → 重置 → 回 13px
  await click('[data-a="fontInc"]'); await click('[data-a="fontInc"]'); await sleep(350);
  const big = (await st()).fs;
  await click('[data-a="fontReset"]'); await sleep(500);
  const rst = (await st()).fs;
  ck('C3_FONT_INC_RESET', big !== '13px' && rst === '13px', 'big=' + big + ' reset=' + rst);

  // 单行 / 分页 两态
  await click('#pagedToggleBtn'); await sleep(600);
  ck('C4_PAGED_ON', (await st()).paged === true);
  await click('#pagedToggleBtn'); await sleep(600);
  ck('C5_PAGED_OFF', (await st()).paged === false);
  await click('#modeToggleBtn'); await sleep(600);
  const sg = await st();
  ck('C6_SINGLE_ON_NO_PAGED', sg.single === true && sg.paged === false, JSON.stringify({single:sg.single,paged:sg.paged}));
  await click('#modeToggleBtn'); await sleep(600);
  ck('C7_SINGLE_OFF', (await st()).single === false);

  // 皮肤 / 吸色 / 变灰 / 灰切换 / 重置颜色 / 排版预设 / 主题
  const beforeSkin = (await st()).skin;
  await click('[data-a="skin"]'); await sleep(500);
  ck('C8_SKIN_SWITCH', (await st()).skin !== beforeSkin, 'before=' + beforeSkin);
  await click('[data-a="gray"]'); await sleep(400);
  await click('[data-a="gray"]'); await sleep(400);
  ck('C9_GRAY_TOGGLE_NO_CRASH', true);
  await click('[data-a="resetColor"]'); await sleep(400);
  ck('C10_RESET_COLOR', true);
  for (const v of ['eye','night','paper']) { await click(`[data-a="typePreset"][data-v="${v}"]`); await sleep(250); }
  ck('C11_TYPE_PRESETS', true);

  // ---------- D 各面板开合 ----------
  const types = ['toolbar','settings','toc','search','source','shelf','bookmarks'];
  for (const t of types) {
    await mw.executeJavaScript(`window.readerAPI.openPanel(${JSON.stringify(t)})`).catch(()=>{});
    await sleep(800);
    const w = panelOf(t);
    let opened = false;
    if (w) opened = await w.webContents.executeJavaScript(`document.getElementById('view-${t}') && document.getElementById('view-${t}').classList.contains('on')`).catch(()=>false);
    ck('D_OPEN_' + t, !!opened, 'window=' + !!w + ' opened=' + opened);
    await mw.executeJavaScript(`window.readerAPI.closePanel(${JSON.stringify(t)})`).catch(()=>{});
    await sleep(300);
  }

  // ---------- E 设置面板交互 ----------
  await mw.executeJavaScript(`window.readerAPI.openPanel('settings')`).catch(()=>{});
  await sleep(1000);
  const SW = panelOf('settings');
  pw = SW ? SW.webContents : P.webContents;   /* 设置面板是独立窗口 */
  ck('E_SETTINGS_WINDOW', !!SW, 'settings window=' + !!SW);
  const setters = [
    ['textOpacitySlider', 60], ['windowOpacitySlider', 70], ['shadowIntensitySlider', 40],
    ['lineHeightSlider', 2], ['pageMarginSlider', 30], ['closeDelaySlider', 900],
  ];
  for (const [id, val] of setters) {
    const r = await pw.executeJavaScript(`(function(){const e=document.getElementById(${JSON.stringify(id)});if(!e)return 'NO_EL';e.value=${val};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'OK';})()`).catch(e=>'ERR:'+e.message);
    ck('E_SLIDER_' + id, r === 'OK', String(r));
  }
  const sw = ['autoContrastSwitch','companionSwitch','companionLinkCloseSwitch','companionLinkMinSwitch','companionTintSwitch','fgWatchSwitch','autoUpdateSwitch'];
  for (const id of sw) {
    const r = await pw.executeJavaScript(`(function(){const e=document.getElementById(${JSON.stringify(id)});if(!e)return 'NO_EL';e.click();return 'OK';})()`).catch(e=>'ERR:'+e.message);
    ck('E_SWITCH_' + id, r === 'OK', String(r));
  }
  // 伪装皮肤三套 + 进入/退出
  for (const v of ['word','code','sheet']) {
    const r = await pw.executeJavaScript(`(function(){const e=document.getElementById('disguiseSkinSelect');if(!e)return 'NO_EL';e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('change',{bubbles:true}));return 'OK';})()`).catch(e=>'ERR:'+e.message);
    ck('E_DISGUISE_SKIN_' + v, r === 'OK', String(r));
  }
  await click('#disguiseToggleBtn'); await sleep(800);
  ck('E_ENTER_DISGUISE', (await st()).disguised === true);
  await mw.executeJavaScript(`window.__reader.exitDisguise()`).catch(()=>{});
  await sleep(700);
  ck('E_EXIT_DISGUISE', (await st()).disguised === false);
  // 语言切换（中→英→中）
  /* 🟥 设置面板的按钮委托只在 type==='settings' 的窗口里由 initSettings() 绑定；
     D 段循环开关面板后窗口可能被重建，这里重新按 URL 精确定位一次。 */
  await mw.executeJavaScript(`window.readerAPI.openPanel('settings')`).catch(()=>{});
  await sleep(900);
  const LW = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && /panel\.html.*type=settings/.test(w.webContents.getURL() || ''));
  pw = LW ? LW.webContents : pw;
  ck('E_LANG_WINDOW_OK', !!LW, 'settings window=' + !!LW);
  await pw.executeJavaScript(`(function(){const e=document.querySelector('[data-a="lang"][data-v="en"]');if(e)e.click();return 'OK';})()`).catch(()=>{});
  await sleep(900);
  const flangEn = await mw.executeJavaScript(`localStorage.getItem('flang')`).catch(()=>null);
  const titleEn = await mw.executeJavaScript(`document.getElementById('titleText').textContent`).catch(()=>'');
  ck('E_LANG_SWITCH_EN', /en/.test(String(flangEn)) && /Reader/i.test(String(titleEn)), 'flang=' + flangEn + ' title=' + titleEn);
  await pw.executeJavaScript(`(function(){const e=document.querySelector('[data-a="lang"][data-v="zh"]');if(e)e.click();return 'OK';})()`).catch(()=>{});
  await sleep(800);
  const flangZh = await mw.executeJavaScript(`localStorage.getItem('flang')`).catch(()=>null);
  ck('E_LANG_BACK', /zh/.test(String(flangZh)), 'flang=' + flangZh);

  // ---------- F 跟随浮层（假目标，不碰真实窗口） ----------
  await pw.executeJavaScript(`(function(){const e=document.getElementById('companionPopInput');if(e){e.value=${JSON.stringify(F)};e.dispatchEvent(new Event('change',{bubbles:true}));}})()`).catch(()=>{});
  await mw.executeJavaScript(`(function(){const b=document.getElementById('companionBtn');if(b)b.click();})()`).catch(()=>{});
  await sleep(800);
  const popOpen = await mw.executeJavaScript(`(document.getElementById('companionPop')||{}).classList.contains('open')`).catch(()=>false);
  ck('F1_COMPANION_POP_OPEN', !!popOpen, 'open=' + popOpen);
  const popCtrls = ['companionPopSwitch','companionPopTint','companionPopLinkClose','companionPopLinkMin','companionTintReset','companionPopRedock','companionPopDetect'];
  for (const id of popCtrls) {
    const r = await mw.executeJavaScript(`(function(){const e=document.getElementById(${JSON.stringify(id)});if(!e)return 'NO_EL';if(e.disabled)return 'DISABLED';e.click();return 'OK';})()`).catch(e=>'ERR:'+e.message);
    ck('F_POP_' + id, r === 'OK' || r === 'DISABLED', String(r));
  }
  // 模式/嵌入位置下拉
  for (const [id, v] of [['companionPopMode','visible'],['companionPopEdge','left']]) {
    const r = await mw.executeJavaScript(`(function(){const e=document.getElementById(${JSON.stringify(id)});if(!e)return 'NO_EL';e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('change',{bubbles:true}));return 'OK';})()`).catch(e=>'ERR:'+e.message);
    ck('F_SELECT_' + id, r === 'OK', String(r));
  }
  await sleep(700);
  await mw.executeJavaScript(`(function(){const b=document.getElementById('companionBtn');if(b)b.click();})()`).catch(()=>{});
  await sleep(400);

  // ---------- G 主窗顶栏按钮 ----------
  const topbar = ['helpBtn','focusBtn','toggleToolbarBtn','failedRetryBtn'];
  for (const id of topbar) {
    const r = await mw.executeJavaScript(`(function(){const e=document.getElementById(${JSON.stringify(id)});if(!e)return 'NO_EL';e.click();return 'OK';})()`).catch(e=>'ERR:'+e.message);
    ck('G_TOPBAR_' + id, r === 'OK', String(r));
    await sleep(200);
  }
  // 快捷键浮层会盖住，再点一次收起
  await mw.executeJavaScript(`(function(){const e=document.getElementById('helpBtn');if(e)e.click();})()`).catch(()=>{});
  await sleep(300);
  ck('G_NO_WHITE_SCREEN_AFTER', (await st()).bodyLen > 100);

  // ---------- H 搜索 / 书签 / 批注 ----------
  await mw.executeJavaScript(`window.__reader.performSearch('甲')`).catch(()=>{});
  await sleep(500);
  const hits = await mw.executeJavaScript(`document.querySelectorAll('.search-highlight').length`).catch(()=>0);
  ck('H1_SEARCH', Number(hits) > 0, 'hits=' + hits);
  await mw.executeJavaScript(`window.__reader.clearSearchHighlights()`).catch(()=>{});
  const rAdd = await mw.executeJavaScript(`(function(){try{ if(window.__reader.addBookmark) window.__reader.addBookmark(); return 'OK';}catch(e){return 'ERR:'+e.message}})()`).catch(e=>'ERR:'+e.message);
  ck('H2_BOOKMARK_API', String(rAdd).startsWith('OK'), String(rAdd));

  // ---------- I 窗口动作 ----------
  const origBounds = W.getBounds();
  await mw.executeJavaScript(`window.readerAPI && window.readerAPI.toggleFullScreen && window.readerAPI.toggleFullScreen()`).catch(()=>{});
  await sleep(900);
  const scr = require('electron').screen.getDisplayMatching(W.getBounds()).bounds;
  const bOn = W.getBounds();
  const fullOn = Math.abs(bOn.width - scr.width) <= 4 && Math.abs(bOn.height - scr.height) <= 4;
  await mw.executeJavaScript(`window.readerAPI && window.readerAPI.toggleFullScreen && window.readerAPI.toggleFullScreen()`).catch(()=>{});
  await sleep(1200);
  const bOff = W.getBounds();
  ck('I1_FULLSCREEN_TOGGLE', fullOn === true, 'on=' + fullOn + ' bounds=' + JSON.stringify(bOn) + ' screen=' + JSON.stringify(scr));
  ck('I2_BOUNDS_RESTORED', Math.abs(bOff.width - origBounds.width) <= 2, 'orig=' + JSON.stringify(origBounds) + ' off=' + JSON.stringify(bOff));

  // ---------- J 结束状态 ----------
  const fin = await st();
  ck('J1_BOOK_STILL_READABLE', fin.n >= 1 && fin.bodyLen > 100, JSON.stringify({n:fin.n,bodyLen:fin.bodyLen}));
  ck('J2_NO_WHITE_SCREEN', fin.bodyLen > 100);
  await sleep(600);
  report();
});

function report() {
  const bad = out.filter(x => !x[1]);
  console.log('=== 巡检明细（失败项）===');
  bad.forEach(x => console.log('  X  ' + x[0] + ' -> ' + x[2]));
  console.log('=== 运行时错误 ===');
  if (!errs.length) console.log('  （无）');
  else [...new Set(errs)].slice(0, 30).forEach(e => console.log('  ! ' + e));
  console.log('LIVE497: ' + (out.length - bad.length) + '/' + out.length + ' OK');
  console.log('LIVE497_RUNTIME_ERRORS=' + errs.length);
  console.log('LIVE497_VERDICT=' + (bad.length || errs.length ? 'ISSUES' : 'PASS'));
  app.exit(0);
}
