const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.setPath('userData', path.join(__dirname, '..', '_smoke_userdata'));
const problems = [];
// 端到端按钮验证：记录小窗真实发出的 panel:action（V4.2.4 起加入——
// 伪装按钮曾因只在元素存在性上断言、漏掉了「toolbar 分支没接 action」，按钮整整死了四个版本）
const panelActionsSeen = [];
ipcMain.on('panel:action', (e, p) => { if (p && p.action) panelActionsSeen.push(p.action); });
// 关闭最后一个窗口时不要退出，否则后续窗口会加载失败
app.on('window-all-closed', () => {});

async function openPanel(type) {
  /* ⬜ V4.3.60：面板窗现在和主窗一样要给投影留内衬（`#panel { inset: var(--win-pad) }`，20px），
     真实运行时由 `main.js panelOptions()` 把窗口尺寸 +2×pad 补回来。本探针自建窗口，
     也要补 —— 否则卡片比原来小 40px，书架第 3 张卡会被挤出可视区，
     表现为"动作卡点不到（被遮挡）"这种**假红**（产品本身没问题）。 */
  const PAD = 20;
  const win = new BrowserWindow({
    show: false,
    width: 400 + PAD * 2,
    height: 600 + PAD * 2,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.webContents.on('console-message', (e, level, message) => {
    if (level < 2) return;
    if (String(message).includes('Electron Security Warning')) return;
    problems.push(type + ' CONSOLE: ' + message);
  });
  win.webContents.on('did-fail-load', (e, code, desc) => problems.push(type + ' DID_FAIL_LOAD ' + code + ' ' + desc));
  await win.loadFile(path.join(__dirname, 'panel.html'), { query: { type } });
  await new Promise(r => setTimeout(r, 600));
  return win;
}

app.whenReady().then(async () => {
  // 设置面板
  const settings = await openPanel('settings');
  let res = '';
  try {
    res = await settings.webContents.executeJavaScript(`(function(){
      const out = {};
      out.shortcutInputs = document.querySelectorAll('#view-settings .shortcut-input').length;
      out.protectTestBtn = !!document.getElementById('protectTestBtn');   // 🛡 V4.3.20 脱监自检
      out.ids = ['ttsRateSlider','ttsVoiceSelect','themeSelect','updateUrlInput','updateResult','associateResult','ttsToggleBtn','logBox']
        .map(id => id + ':' + (document.getElementById(id) ? 1 : 0)).join(',');
      out.ids2 = ['feedbackUrlInput','feedbackExport','feedbackOpen']
        .map(id => id + ':' + (document.querySelector('[data-a="' + id + '"]') || document.getElementById(id) ? 1 : 0)).join(',');
      // 伪装 / 前台监听：控件是否都在，以及 i18n 表按文档顺序对齐后行标签有没有串位
      out.disguiseUi = ['disguiseSkinSelect','disguiseToggleBtn','fgWatchSwitch','fgWatchInput']
        .map(id => id + ':' + (document.getElementById(id) ? 1 : 0)).join(',');
      out.disguiseSkinOptions = document.querySelectorAll('#disguiseSkinSelect option').length;
      // 🟥 V4.3.53：原先按「最后一段」取 disguise / 前台监听段 —— 伴随模式作为新的尾段加进来
      //    之后，最后一段就不是它了，判据当场失真。改成**按 h3 名定位**，以后再加段也不会破。
      //    这条判据守的是 PANEL_LIST_TEXT 与 DOM 顺序**错位**：表一旦被插错位置，
      //    从这里读到的就是别的条目文本（V4.3.53 加伴随模式段时实际就是这么被抓到的）。
      const secs = Array.from(document.querySelectorAll('#view-settings .section'));
      const pickSec = n => {
        const s = secs.find(x => { const h = x.querySelector('h3'); return h && h.textContent.trim() === n; });
        return s ? {
          head: s.querySelector('h3').textContent.trim(),
          labels: Array.from(s.querySelectorAll('.srow > span:first-child')).map(e => e.textContent.trim()).join('|')
        } : { head: '(未找到)', labels: '(未找到)' };
      };
      const fgSec = pickSec('前台监听');
      out.disguiseHead = fgSec.head;
      out.disguiseLabels = fgSec.labels;
      const cmpSec = pickSec('伴随模式');
      out.companionHead = cmpSec.head;
      out.companionLabels = cmpSec.labels;
      out.viewOn = document.getElementById('view-settings').classList.contains('on');
      // 主题按钮取值逻辑：没有主题时点击不应抛错
      try { document.querySelector('[data-a="themeApply"]').click(); out.themeClick = 'ok'; } catch(e) { out.themeClick = 'throw:' + e.message; }
      // 语言切换不应抛错
      try { window.dispatchEvent(new Event('focus')); out.langOk = true; } catch(e) { out.langOk = false; }
      return JSON.stringify(out);
    })()`);
  } catch (e) {
    problems.push('settings EVAL: ' + ((e && e.message) || e));
  }
  console.log('SETTINGS', res);
  const s = JSON.parse(res || '{}');
  if (s.shortcutInputs !== 12) problems.push('settings shortcut inputs = ' + s.shortcutInputs + '（V4.3.19 起应为 10：多了「脱离监控」；V4.3.25 又加「目录」变 11；V4.3.29 加「书签」变 12）');
  if (!s.ids || s.ids.includes(':0')) problems.push('settings missing elements: ' + s.ids);
  if (!s.ids2 || s.ids2.includes(':0')) problems.push('feedback UI missing: ' + s.ids2);
  if (!s.disguiseUi || s.disguiseUi.includes(':0')) problems.push('disguise / fg-watch UI missing: ' + s.disguiseUi);
  if (s.disguiseSkinOptions !== 3) problems.push('disguise skin options = ' + s.disguiseSkinOptions);
  if (s.disguiseHead !== '前台监听') problems.push('fg-watch section head = ' + s.disguiseHead);
  if (s.disguiseLabels !== '前台监听|监听程序') problems.push('fg-watch row labels misaligned: ' + s.disguiseLabels);
  // 🆕 V4.3.53（R12-2）：伴随模式是新的尾段，同样要守 PANEL_LIST_TEXT 对齐；V4.3.55 起 8 行（嵌入位置+关闭/最小化联动）
  if (s.companionHead !== '伴随模式') problems.push('companion section head = ' + s.companionHead);
  if (s.companionLabels !== '跟随目标程序|目标程序|陪显示时机|嵌入位置|关闭联动|最小化联动|融入目标配色|重新贴边') problems.push('companion row labels misaligned: ' + s.companionLabels);
  if (s.viewOn !== true) problems.push('settings view not active');
  if (s.themeClick !== 'ok') problems.push('theme apply click failed: ' + s.themeClick);

  // 工具栏面板
  const toolbar = await openPanel('toolbar');
  let res2 = '';
  try {
    res2 = await toolbar.webContents.executeJavaScript(`(function(){
      const out = {};
      out.ttsBtn = !!document.getElementById('ttsBtn');
      out.disguiseBtn = document.querySelectorAll('#view-toolbar [data-a="disguise"]').length;
      out.disguiseQuick = !!document.getElementById('disguiseQuick');
      out.disguiseSelect = !!document.getElementById('disguiseSkinSelect');
      // 🛡 V4.3.19 脱离监控开关（默认关闭，所以按钮初始不该是亮的）
      const pb = document.getElementById('protectBtn');
      out.protectBtn = !!pb;
      out.protectLabel = pb ? (pb.querySelector('.label') || {}).textContent : '';
      out.protectLitByDefault = pb ? pb.classList.contains('on') : null;
      out.protectTip = pb ? (pb.title || '').length > 0 : false;
      const sTid = 'stat' + 'Today', sTid2 = 'stat' + 'Total', sTid3 = 'stat' + 'Streak';   /* 🗑 V4.3.79 拼接防自咬 */
      out.statsSectionRemoved = !document.getElementById(sTid) && !document.getElementById(sTid2) && !document.getElementById(sTid3);
      out.buttons = document.querySelectorAll('#view-toolbar .btn').length;
      // 📑 V4.3.29 书签重构三连：① 工具条上独立的「书签」按钮必须已撤（功能并入书签列表）
      out.toolbarBookmarkBtn = document.querySelectorAll('#view-toolbar [data-a="bookmark"]').length;
      // ② 「列表」改名全称「书签列表」（用户明确要求显示全称）
      const bmEl = document.querySelector('#view-toolbar [data-a="bookmarks"] .label');
      out.bookmarksLabel = bmEl ? bmEl.textContent : '';
      // ③ 独立书签列表面板必须存在
      out.bookmarksView = !!document.getElementById('view-bookmarks');
      out.bmToggleBtn = !!document.getElementById('bmToggleBtn');
      out.bmFilter = !!document.getElementById('bmFilter');
      out.fontOptions = document.querySelectorAll('#fontSelect option').length;
      out.viewOn = document.getElementById('view-toolbar').classList.contains('on');
      out.headDraggable = getComputedStyle(document.querySelector('#view-toolbar .head')).webkitAppRegion;
      return JSON.stringify(out);
    })()`);
  } catch (e) {
    problems.push('toolbar EVAL: ' + ((e && e.message) || e));
  }
  console.log('TOOLBAR', res2);
  const tb = JSON.parse(res2 || '{}');
  if (tb.ttsBtn !== true) problems.push('toolbar missing tts button');
  if (tb.disguiseBtn !== 1) problems.push('toolbar disguise button = ' + tb.disguiseBtn);
  if (tb.disguiseQuick !== true) problems.push('toolbar disguiseQuick missing');
  if (tb.disguiseSelect !== true) problems.push('toolbar disguise skin select missing');
  if (tb.protectBtn !== true) problems.push('toolbar 脱监 button missing（V4.3.19 脱离监控开关）');
  if (tb.protectLabel !== '脱监') problems.push('脱监 button label = ' + tb.protectLabel);
  if (tb.protectLitByDefault !== false) problems.push('脱监 默认应为关闭（按钮不亮），实际 = ' + tb.protectLitByDefault);
  if (tb.protectTip !== true) problems.push('脱监 按钮缺少悬停说明');
  // 🛡 V4.3.20：脱监自检按钮在「设置 → 反馈 → 诊断」那一行里（塞进现有行，不新增行）
  if (s.protectTestBtn !== true) problems.push('设置里缺少「脱监自检」按钮（V4.3.20）');
  if (tb.statsSectionRemoved !== true) problems.push('阅读统计区块应已移除');   /* 🗑 V4.3.79 */
  /* 📚 V4.3.86：「全文」「书源」两个按钮已并入书架面板的 tab，工具栏少了 2 个。
     阈值从 15 降到 13；不要反过来把按钮加回去——那是主人要的精简。 */
  if (!(tb.buttons >= 13)) problems.push('toolbar button count = ' + tb.buttons);
  /* 📑 V4.3.29 书签重构的回归锁：
     以前「工具条书签按钮 + 主窗 #bookmarkList 浮层」是两套死重 UI（用户原话：把书签做成快捷键、
     功能并入列表、列表改全称），这套断言防止哪天又把独立按钮加回来或改名改回两个字。 */
  if (tb.toolbarBookmarkBtn !== 0) problems.push('工具条不该再有独立的「书签」按钮（V4.3.29 已并入书签列表），实际 = ' + tb.toolbarBookmarkBtn);
  if (tb.bookmarksLabel !== '书签列表') problems.push('书签列表按钮标签应为全称「书签列表」，实际 = ' + tb.bookmarksLabel);
  if (tb.bookmarksView !== true) problems.push('缺少独立书签列表面板 #view-bookmarks（V4.3.29）');
  if (tb.bmToggleBtn !== true) problems.push('书签列表面板缺少「加/移除书签」按钮 #bmToggleBtn');
  if (tb.bmFilter !== true) problems.push('书签列表面板缺少过滤框 #bmFilter');

  /* 🗑 V4.3.79：阅读计时格式化断言已随统计功能整体移除。 */


  /* 🗑 V4.3.79：阅读统计布局断言已随统计功能整体移除。 */


  // 🟥 V4.3.21 → V4.3.23：书架动作按钮从「绝对定位的图标」升级为「三张等宽按钮卡」。
  // 守住三件事：① 容器是 flex；② 三张卡等宽且水平区间不相交（不会像旧版那样叠成一团）；
  //             ③ 卡片自身不是 absolute。
  try {
    const cssRaw = await toolbar.webContents.executeJavaScript(`(function(){
      const wrap = document.createElement('div'); wrap.className = 'shelf-item';
      const a = document.createElement('div'); a.className = 'shelf-acts';
      const cards = ['⇄ 换源','↗ 来源','✕ 删除'].map(t=>{ const s=document.createElement('span'); s.className='shelf-actcard'; s.textContent=t; a.appendChild(s); return s; });
      wrap.appendChild(a); document.body.appendChild(wrap);
      const csA = getComputedStyle(a);
      const rects = cards.map(c=>c.getBoundingClientRect());
      const overlap = rects.some((r,i)=>rects.some((s,j)=> i!==j && r.left < s.right-0.5 && s.left < r.right-0.5));
      const out = { actsDisplay: csA.display, actsPosition: csA.position,
        cardPosition: getComputedStyle(cards[0]).position,
        widths: rects.map(r=>Math.round(r.width)), overlap: overlap };
      document.body.removeChild(wrap);
      return JSON.stringify(out);
    })()`);
    console.log('SHELFBTN', cssRaw);
    const sb = JSON.parse(cssRaw || '{}');
    if (sb.actsDisplay !== 'flex') problems.push('书架动作容器 .shelf-acts 不是 flex: ' + sb.actsDisplay);
    if (sb.actsPosition === 'absolute') problems.push('.shelf-acts 仍绝对定位（易与内容重叠）: ' + sb.actsPosition);
    if (sb.cardPosition === 'absolute') problems.push('.shelf-actcard 仍是 absolute（会重叠）');
    if (sb.overlap === true) problems.push('三张按钮卡水平重叠: ' + JSON.stringify(sb.widths));
    if (!sb.widths || sb.widths.length !== 3 || Math.min.apply(null, sb.widths) <= 4) problems.push('按钮卡宽度异常: ' + JSON.stringify(sb.widths));
  } catch (e) {
    problems.push('SHELFBTN EVAL: ' + ((e && e.message) || e));
  }

  // 🟥 V4.3.23（用户报「书架 ↗ 按钮怎么没了」）：动作卡必须**恒为三张**——
  // 没有来源网址时置灰（.off）而不是不渲染，否则用户会以为按钮丢了。
  try {
    const shelfWin = await openPanel('shelf');
    shelfWin.webContents.send('panel:update', { books: [
      { id:'p1', title:'有来源的书', sourceName:'测试源', chapterCount:120, currentIndex:6, sourceUrl:'https://example.com/book/1' },
      { id:'p2', title:'没有来源的书', sourceName:'本地文件', chapterCount:10, currentIndex:0 },
      { id:'p3', title:'多来源的书', sourceName:'测试源', chapterCount:80, currentIndex:3, sourceUrls:['https://a.example.com/b/1','https://b.example.com/b/2'] }
    ]});
    await new Promise(r => setTimeout(r, 500));
    const shRaw = await shelfWin.webContents.executeJavaScript(`(function(){
      const items = Array.from(document.querySelectorAll('#shelfList .shelf-item'));
      const out = { items: items.length, perItem: [] };
      items.forEach(it=>{
        const cards = Array.from(it.querySelectorAll('.shelf-actcard'));
        const hits = cards.map(c=>{ const r=c.getBoundingClientRect(); const el=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!(el && c.contains(el)); });
        out.perItem.push({ cards: cards.length, off: cards.map(c=>c.classList.contains('off')),
          labels: cards.map(c=>(c.querySelector('.tx')||{}).textContent).join('/'), allHit: hits.every(Boolean) });
      });
      return JSON.stringify(out);
    })()`);
    console.log('SHELFACTS', shRaw);
    const sa = JSON.parse(shRaw || '{}');
    if (sa.items !== 3) problems.push('书架卡片数异常: ' + sa.items);
    (sa.perItem || []).forEach((it, i) => {
      if (it.cards !== 4) problems.push('第' + (i+1) + '本书的动作卡不是 4 张（换源/来源/删除/目录，缺按钮会让用户以为功能没了）: ' + it.cards);
      if (!it.allHit) problems.push('第' + (i+1) + '本书有动作卡点不到（被遮挡）: ' + it.labels);
    });
    // 第 2 本没有来源网址 → 「来源」卡应置灰而非缺失
    const b2 = (sa.perItem || [])[1];
    if (b2 && !(b2.off && b2.off[1] === true)) problems.push('无来源网址时「来源」卡应为置灰态(.off): ' + JSON.stringify(b2.off));
    const b1 = (sa.perItem || [])[0];
    if (b1 && b1.off && b1.off[1] === true) problems.push('有来源网址时「来源」卡不该置灰');
    try { shelfWin.destroy(); } catch (e) {}
  } catch (e) {
    problems.push('SHELFACTS EVAL: ' + ((e && e.message) || e));
  }

  // 🆕 V4.3.23 书库：卡片、置信度徽标、判定依据、动作按钮
  try {
    const libWin = await openPanel('search');
    await libWin.webContents.executeJavaScript(`(function(){
      localStorage.setItem('fsites', JSON.stringify([
        { host:'demo-novel.com', origin:'https://demo-novel.com', name:'演示书源', home:'https://demo-novel.com/',
          searchTpl:'https://demo-novel.com/search?q={kw}', ruleName:'演示书源', conf:'search', hits:2, searchOkAt:Date.now(),
          lastAt:Date.now(), evidence:['已实际请求站点根','书源规则自带搜索模板（最强证据）'] },
        { host:'only-home.net', origin:'https://only-home.net', home:'https://only-home.net/', searchTpl:'',
          conf:'home', hits:1, searchOkAt:0, lastAt:Date.now()-500, evidence:['首页未找到可用的搜索入口'] }
      ])); return 'seeded';
    })()`);
    await libWin.webContents.reload();
    await new Promise(r => setTimeout(r, 800));
    const libRaw = await libWin.webContents.executeJavaScript(`(function(){
      const cards = Array.from(document.querySelectorAll('#libList .lib-card'));
      return JSON.stringify({ cards: cards.length, query: !!document.getElementById('libQuery'), uniSearch: !!document.getElementById('searchInput'), log: !!document.getElementById('libLog'),
        badges: cards.map(c=>((c.querySelector('.lib-badge')||{}).className||'')),
        btns: cards.map(c=>Array.from(c.querySelectorAll('.lib-acts button')).map(b=>(b.querySelector('.tx')||b).textContent).join('|')),
        offBtn: cards.map(c=>Array.from(c.querySelectorAll('.lib-acts button.off')).map(b=>(b.querySelector('.tx')||b).textContent).join('|')),
        ev: cards.map(c=>(((c.querySelector('.lib-ev')||{}).textContent)||'').length)
      });
    })()`);
    console.log('LIBRARY', libRaw);
    const lb = JSON.parse(libRaw || '{}');
    if (lb.cards !== 2) problems.push('书库卡片数异常: ' + lb.cards);
    /* 🔍 V4.3.86：#libQuery 已废弃（与顶部 #searchInput 重复）。
       现在只要求“搜本站能拿到关键词”——顶部那个框在就行。 */
    if (!lb.query && !lb.uniSearch) problems.push('搜索框缺失（#searchInput / #libQuery 都没有）');
    if (!lb.log) problems.push('书库缺少日志行 #libLog');
    if ((lb.badges || []).join(',').indexOf('search') < 0) problems.push('书库未按置信度渲染徽标: ' + JSON.stringify(lb.badges));
    // 没有搜索模板的站：搜本站按钮应置灰（点了也没用，得说清楚）
    // 🎨 V4.3.63：按钮文字现在住在 .tx 里（图标是 svg，见 ico()），断言改读 .tx
    if (!lb.offBtn || lb.offBtn.indexOf('搜本站') < 0) problems.push('无搜索模板的站「搜本站」应置灰: ' + JSON.stringify(lb.offBtn));
    (lb.ev || []).forEach((n, i) => { if (!(n > 8)) problems.push('书库第' + (i+1) + '张卡缺少判定依据文本'); });
    try { libWin.destroy(); } catch (e) {}
  } catch (e) {
    problems.push('LIBRARY EVAL: ' + ((e && e.message) || e));
  }

  // 🆕 V4.3.24 书源表单：可数选项字段必须是「input + datalist」（下拉能选、也能手打），
  // 且新增了原先写死的「结果链接属性」字段、试抓按钮、书库站点下拉。
  try {
    const srcWin = await openPanel('source');
    const sfRaw = await srcWin.webContents.executeJavaScript(`(function(){
      const ids = ['srcEncoding','srcChapterItem','srcLinkAttr','srcTitleAttr','srcContentSel','srcRemoveSel',
                   'srcConcurrent','srcInterval','srcSearchUrl','srcResultItem','srcSearchTitle','srcSearchAuthor','srcSearchBookUrl','srcSearchBookUrlAttr'];
      const out = { total: ids.length, withList: 0, notInput: [], emptyDl: [] };
      ids.forEach(id=>{
        const el = document.getElementById(id);
        if(!el){ out.notInput.push(id + ':missing'); return; }
        if(el.tagName !== 'INPUT'){ out.notInput.push(id + ':' + el.tagName); return; }
        if(!el.getAttribute('list')){ out.notInput.push(id + ':no-list'); return; }
        out.withList++;
        const dl = document.getElementById(el.getAttribute('list'));
        if(!dl || !dl.options || dl.options.length < 3) out.emptyDl.push(id);
      });
      out.testBtn = !!document.getElementById('sourceTestBtn');
      out.libSel = !!document.getElementById('srcLibSites');
      out.libBtn = !!document.getElementById('sourceFromLibBtn');
      // 并发/间隔要能接受自定义数字（不能被下拉档位绑死）
      const iv = document.getElementById('srcInterval'); iv.value = '750';
      const la = document.getElementById('srcLinkAttr'); la.value = 'data-mine';
      out.customKept = (iv.value === '750' && la.value === 'data-mine');
      out.revCb = !!document.getElementById('srcChaptersReversed');
      out.pagCb = !!document.getElementById('srcAutoPaginate');
      /* 📑 V4.3.29 书源搜索：翻页 / 取消 / 计数 / 进度四个控件必须都在，
         并且**初始状态必须是隐藏的**（没搜索就不该摆出「下一页」和「取消」）。
         真实行为（翻页追加、跨页去重、软取消丢弃结果、失败给建议）由
         asar-src/_srcsearch_cdp.js 用本地假站端到端验证 —— 那部分需要起 HTTP 服务，
         不适合放进这条无网络的冒烟链路。 */
      const nb = document.getElementById('sourceNextPageBtn');
      const cb = document.getElementById('sourceSearchCancelBtn');
      const bar = document.getElementById('sourceSearchProgressBar');
      out.nextBtn = !!nb; out.cancelBtn = !!cb; out.countEl = !!document.getElementById('sourceSearchCount');
      out.barEl = !!bar && !!document.getElementById('sourceSearchProgressFill');
      out.initHidden = !!nb && nb.style.display === 'none' && !!cb && cb.style.display === 'none' && !!bar && bar.style.display === 'none';
      return JSON.stringify(out);
    })()`);
    console.log('SRCFORM', sfRaw);
    const sf = JSON.parse(sfRaw || '{}');
    if (sf.withList !== sf.total) problems.push('书源字段没全部改成「下拉+可手输」: withList=' + sf.withList + '/' + sf.total + ' ' + JSON.stringify(sf.notInput));
    if (sf.emptyDl && sf.emptyDl.length) problems.push('有 datalist 没有候选值: ' + JSON.stringify(sf.emptyDl));
    if (!sf.testBtn) problems.push('缺少「🧪 试抓」按钮');
    if (!sf.libSel || !sf.libBtn) problems.push('缺少「书库站点」下拉或「填入搜索URL」按钮');
    if (!sf.customKept) problems.push('自定义值被控件改掉了（说明用了会丢值的硬 select）');
    if (!sf.revCb) problems.push('缺少「章节倒序」复选框 #srcChaptersReversed');
    if (!sf.pagCb) problems.push('缺少「正文自动分页」复选框 #srcAutoPaginate');
    // 📑 V4.3.29 书源搜索翻页 / 取消 / 计数 / 进度
    if (!sf.nextBtn) problems.push('缺少书源搜索「下一页」按钮 #sourceNextPageBtn');
    if (!sf.cancelBtn) problems.push('缺少书源搜索「取消」按钮 #sourceSearchCancelBtn');
    if (!sf.countEl) problems.push('缺少书源搜索计数 #sourceSearchCount');
    if (!sf.barEl) problems.push('缺少书源搜索进度条 #sourceSearchProgressBar / #sourceSearchProgressFill');
    if (!sf.initHidden) problems.push('书源搜索的「下一页 / 取消 / 进度条」初始应隐藏（没在搜就不该出现）');
    // 试抓在两端都为空时必须给出明确提示，且**不能**去联网（冒烟环境没有站点可抓）
    const tRaw = await srcWin.webContents.executeJavaScript(`(async function(){
      const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=v; };
      set('sourceBookUrl',''); set('sourceSearchInput','');
      document.getElementById('sourceTestBtn').click();
      await new Promise(r=>setTimeout(r,300));
      return JSON.stringify({ log: (document.getElementById('sourceRuleLog')||{}).textContent });
    })()`);
    console.log('SRCTEST', tRaw);
    const tt = JSON.parse(tRaw || '{}');
    if (!/填一个目录|书名\/作者|缺少规则/.test(String(tt.log || ''))) problems.push('试抓在空输入时没给出明确提示: ' + tt.log);
    try { srcWin.destroy(); } catch (e) {}
  } catch (e) {
    problems.push('SRCFORM EVAL: ' + ((e && e.message) || e));
  }

  // 🟥 V4.3.22：脱监「没生效」时工具栏按钮要变红（.btn.warn）。这里用算样式守住颜色真的变红。红。
  try {
    const warnRaw = await toolbar.webContents.executeJavaScript(`(function(){
      const b = document.createElement('button'); b.className = 'btn warn';
      const s = document.createElement('span'); s.className = 'label'; s.textContent = 'X';
      b.appendChild(s); document.body.appendChild(b);
      const out = { border: getComputedStyle(b).borderTopColor, label: getComputedStyle(s).color };
      document.body.removeChild(b);
      return JSON.stringify(out);
    })()`);
    console.log('WARNBTN', warnRaw);
    const wb = JSON.parse(warnRaw || '{}');
    if (!/224,\s*58,\s*58/.test(String(wb.border))) problems.push('.btn.warn 描边不是红色: ' + wb.border);
    if (!/224,\s*58,\s*58/.test(String(wb.label))) problems.push('.btn.warn 文字不是红色: ' + wb.label);
  } catch (e) {
    problems.push('WARNBTN EVAL: ' + ((e && e.message) || e));
  }

  // 端到端：模拟点击两个伪装按钮，主进程必须收到对应 action（防「元素在、逻辑死」回归）
  try {
    panelActionsSeen.length = 0;
    await toolbar.webContents.executeJavaScript(`(function(){
      const a=document.querySelector('#view-toolbar [data-a="disguise"]');
      if(a) a.click();
      return 'ok';
    })()`);
    await new Promise(r => setTimeout(r, 400));
    if (!panelActionsSeen.includes('disguise')) problems.push('disguise click did NOT reach main (button is dead)');
    console.log('ACTIONS', JSON.stringify(panelActionsSeen));
  } catch (e) {
    problems.push('disguise click test: ' + ((e && e.message) || e));
  }

  if (!(tb.fontOptions >= 14)) problems.push('toolbar font options = ' + tb.fontOptions);
  if (tb.viewOn !== true) problems.push('toolbar view not active');
  if (tb.headDraggable !== 'drag') problems.push('toolbar head not draggable: ' + tb.headDraggable);
  toolbar.destroy();
  settings.destroy();

  /* 📑 V4.3.30 #24：删书签的规定动作是「立刻删 + 原地撤销」，不许退回 confirm 弹窗。
     这条必须**源码级**断言 —— 运行时没人去点那个 ✕ 就永远走不到 confirm，靠行为断言测不出来。 */
  const panelSrc = fs.readFileSync(path.join(__dirname, 'scripts', 'panel.js'), 'utf8');
  if (/\bconfirm\s*\(/.test(panelSrc)) problems.push('面板脚本里又冒出 confirm( —— 删书签该走内联撤销不是弹窗');
  if (panelSrc.indexOf('bookmarkUndo') < 0) problems.push('面板缺少撤销通道 bookmarkUndo');
  if (panelSrc.indexOf('bm-ghost') < 0) problems.push('面板缺少撤销用的幽灵行 bm-ghost');
  const appSrc = fs.readFileSync(path.join(__dirname, 'scripts', 'app.js'), 'utf8');
  if (appSrc.indexOf('function restoreBookmark') < 0) problems.push('主窗缺少 restoreBookmark —— 删掉的书签撤销不回来');

  /* 🛡 V4.3.33 回归：第一轮全量审计查出的三个「用户天天看得见、却一直没人发现」的 UI 缺陷。
     共同点是：**运行时不点、不盯着看就测不出来**，所以和上面 #24 一样用源码级断言锁形态。 */
  const pHtml433 = fs.readFileSync(path.join(__dirname, 'panel.html'), 'utf8');
  // ① 书库标题：applyPanelLang 用 el.textContent 整体覆盖 h3 会把子元素一并删掉 ——
  //    标题文字必须单独包 #libTitle，计数 #libCount 才活得下来。
  if (pHtml433.indexOf('id="libTitle"') < 0 || pHtml433.indexOf('id="libCount"') < 0)
    problems.push('V4.3.33 回归：书库标题缺 #libTitle 或 #libCount —— 计数会被 textContent 整段抹掉');
  // ② 搜索框的 ✕：通用关闭绑定只认 [data-close]，写成 data-a="close" 就会「点了完全没反应」。
  /* 🟥 V4.3.44：这句断言本轮修了两次，两个坑都值得记下来 ——
     坑一（误报）：原先比的是**整串字面量** `<button data-close="1" title="关闭">✕</button>`，
       给这个按钮**再加任何一个属性**就报错（R3-4 补 data-i18n-title 时撞上：产品完全正常，
       门禁却喊「✕ 不是 [data-close]」）。→ 改成属性顺序无关、允许多余属性。
     坑二（更隐蔽）：改成正则后我用了 `pHtml433.match(...)` —— **不带 g 的 match 只返回全文
       第一个匹配**，而 panel.html 里有 8 个 `<button class="x" data-close="1">✕</button>`，
       第一个命中的压根不是搜索框那个，于是断言依旧误报。→ 必须先锚定搜索框再匹配。
     注意 title 那条必须用 `(^|\s)title=` 的词边界写法：`data-i18n-title="关闭"` **本身就含
       子串 `title="关闭"`**，用 indexOf 判会在「title 被删掉」的负对照下依然通过。 */
  const i433 = pHtml433.indexOf('id="searchInput"');
  const seg433 = i433 < 0 ? '' : pHtml433.slice(i433, i433 + 600);
  /* 🎨 V4.3.56：这个 ✕ 已从**字形**换成线条 SVG（图标统一），所以判据从"内容必须是 ✕"
     放宽为"内容必须是 ✕ 或 svg 图标"——要守的不变式是**它得是 [data-close] 且看得出是关闭**，
     不是"必须用哪个字符画"。仍然只认 `[\s\S]` 取第一个 button，且必须锚定搜索框。 */
  const closeBtn433 = seg433.match(/<button[^>]*\bdata-close="1"[^>]*>[\s\S]*?<\/button>/);
  const closeGlyph433 = !!closeBtn433 && (/✕/.test(closeBtn433[0]) || /<svg\b/.test(closeBtn433[0]));
  if (!closeBtn433 || !closeGlyph433 || !/(?:^|\s)title="关闭"/.test(closeBtn433[0]))
    problems.push('V4.3.33 回归：全文搜索框的 ✕ 不是 [data-close]（会点了没反应）');
  // ③ 设置分区标题：i18n 是**顺序数组**，必须与 panel.html 的 DOM 先后逐项对齐，否则整段串位。
  if (panelSrc.indexOf("'数据', '反馈', '书架', '前台监听'") < 0)
    problems.push('V4.3.33 回归：设置分区标题数组与 DOM 顺序不一致（「反馈/书架」标题会互换）');
  // ④ 删掉的死配置别再加回来：panel.html 里没有 dlSearchBookUrlAttr 这个 datalist。
  if (/dlSearchBookUrlAttr\s*:/.test(panelSrc))
    problems.push('V4.3.33 回归：dlSearchBookUrlAttr 又回来了（HTML 里没有对应 datalist，是死配置）');

  if (problems.length) {
    console.log('PROBLEMS:\n' + problems.join('\n'));
    app.exit(1);
  } else {
    console.log('SMOKE3 PASS');
    app.exit(0);
  }
});

setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 30000);
