     用户的需求：每次书源搜索都会遇到「小说网站的主页」，把它收进书库，以后可以直接从主页去搜书，
     而不是只能靠书源规则。用户的追问很关键：「回退两三个页面可能是全站，但你怎么确定它是全站？
     我们需要有这个会自行判断。」
     所以这里的判定**不是把书页路径砍两级猜**，而是交给主进程 site:judge 做三件有证据的事：
       ① 真请求站点根（跟随重定向）→ 拿最终落点；② 判它是「首页」还是「书籍详情页」；
       ③ 在页面里找搜索入口（表单 / 带 search 的链接）→ 派生搜索模板。
     置信度（由强到弱）：search 已实测搜出过结果 ＞ tpl 书源规则自带模板 ＞ form 首页找到入口
        ＞ home 只找到主页 ＞ unknown 站点没取到。
     用法：书源搜索/抓书时**自动入库**，也可以在书库卡片上点「复核」重新判定。 */
  const LIB_KEY = 'fsites';
  const LIB_MAX = 300;
  const LIB_BADGE = {
    search: { zh:'✅ 全站可搜（本机实测搜出过结果）', en:'✅ Site-wide (verified)' },
    tpl:    { zh:'✅ 全站可搜（书源规则带搜索模板）', en:'✅ Site-wide (rule template)' },
    form:   { zh:'🟡 疑似可搜（首页找到搜索入口，未实测）', en:'🟡 Probably searchable (unverified)' },
    home:   { zh:'🏠 仅主页（首页没找到搜索入口）', en:'🏠 Home only' },
    unknown:{ zh:'❓ 未验证（站点根页没取到）', en:'❓ Unverified' }
  };
  /* 🟥 V4.3.23：置信度只升不降。起因：判定要联网，站点偶发取不到就会返回 unknown，
     如果直接覆盖，就会把「书源规则自带模板」「本机实测搜出过结果」这种**更强的既有证据**抹掉 ——
     一次网络抖动不该让用户丢掉已经确认过的结论。所以按等级取最大值。 */
  const LIB_RANK = { unknown:0, home:1, form:2, tpl:3, search:4 };
  function libRank(c){ return LIB_RANK[c] === undefined ? 0 : LIB_RANK[c]; }
  function libBest(a, b){ return libRank(a) >= libRank(b) ? a : b; }
  function libLoad(){ try{ const a=JSON.parse(localStorage.getItem(LIB_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
  function libSave(list){ try{ localStorage.setItem(LIB_KEY, JSON.stringify((list||[]).slice(0,LIB_MAX))); }catch(e){} }
  function libHostOf(u){ try{ return new URL(u).host; }catch(e){ return ''; } }
  function libOriginOf(u){ try{ return new URL(u).origin; }catch(e){ return ''; } }
  function libFind(list, host){ for(const s of list){ if(s.host === host) return s; } return null; }
  /* 入库 / 合并。只补空字段，不覆盖已有判定（除非显式给了更强证据）。 */
  function libUpsert(patch){
    if(!patch || !patch.host) return null;
    const list = libLoad();
    let s = libFind(list, patch.host);
    if(!s){ s = { host:patch.host, origin:patch.origin||('https://'+patch.host), name:'', home:'', searchTpl:'', ruleName:'', conf:'unknown', hits:0, searchOkAt:0, lastAt:0, evidence:[], note:'' }; list.unshift(s); }
    s.hits = (s.hits||0) + (patch.hit ? 1 : 0);
    s.lastAt = Date.now();
    // 🆕 V4.3.24 name 优先级：用户改的名 / 书源规则名 ＞ 自动读出的站点名 ＞ 域名。
    // 自动判定**只写 siteName、从不写 name**，所以用户改过的名字不会被后续判定覆盖。
    if(patch.name) s.name = patch.name;
    if(patch.siteName) s.siteName = patch.siteName;           // 程序自动读出来的站点名（可能不准，用户可改）
    if(patch.pageTitle) s.pageTitle = patch.pageTitle;        // 判定时那张页面的 <title>，留作核对依据
    if(patch.origin) s.origin = patch.origin;
    if(patch.ruleName && !s.ruleName) s.ruleName = patch.ruleName;
    if(patch.searchOkAt) s.searchOkAt = patch.searchOkAt;
    if(patch.home) s.home = patch.home;
    if(patch.searchTpl) s.searchTpl = patch.searchTpl;
    if(patch.conf && (!s.conf || patch.forceConf)) s.conf = libBest(s.conf, patch.conf);
    if(Array.isArray(patch.evidence) && patch.evidence.length) s.evidence = patch.evidence.slice(0,6);
    if(patch.note !== undefined) s.note = patch.note;
    libSave(list);
    return s;
  }
  /* 一次成功的书源搜索 → 记下这个站（规则带模板）、以及结果里出现的所有站（"遇到过的站全收"）。 */
  function libRecordSearch(rule, results){
    try{
      const tpl = (rule && rule.search && rule.search.urlTemplate) || '';
      const origin = libOriginOf(tpl || (results && results[0] && results[0].url) || '');
      const host = libHostOf(tpl || (results && results[0] && results[0].url) || '');
      if(host){
        /* 🟥 V4.3.23：这次搜索**真的搜出结果了**（调用点只在 r.ok 之后）—— 这是最强证据，
           直接记成 search 级（"本机实测搜出过结果"），不是靠推断的 tpl。 */
        libUpsert({ host, origin:origin||('https://'+host), name:(rule && rule.name)||'', ruleName:(rule && rule.name)||'',
                    searchTpl:tpl, home:tpl, conf:'search', forceConf:true, searchOkAt: Date.now(), hit:true,
                    note:'本机实测搜索成功（' + new Date().toLocaleString() + '）' });
        libSpotCheck(host);   // 有实测了，让主进程核一下首页/搜索入口，把证据链补全
      }
      const seen = {};
      (results||[]).forEach(r=>{
        const h = libHostOf(r && r.url); if(!h || h === host || seen[h]) return;
        seen[h] = 1;
        libUpsert({ host:h, origin:libOriginOf(r.url), conf:'unknown', hit:true });
        libJudge(h, r.url);
      });
    }catch(e){}
  }
  /* 让主进程真去核一遍这个站（首页 / 搜索入口），把判定与证据链更新到库里。 */
  async function libJudge(host, hintUrl){
    if(!api || !api.siteJudge) return null;
    const list = libLoad(); const s = libFind(list, host); if(!s) return null;
    let r = null;
    try{ r = await api.siteJudge({ origin:s.origin || ('https://'+host), url: hintUrl || s.home || '', searchTpl: s.searchTpl || '' }); }
    catch(e){ r = { ok:false, note:String(e&&e.message||e) }; }
    if(!r) return null;
    // 判定要联网，站点偶发取不到会返回 unknown —— 用 libBest 只升不降，别把更强的既有证据抹掉
    const conf = libBest(s.conf || 'unknown', r.kind || 'unknown');
    const merged = libUpsert({ host:host, home:r.home||s.home, searchTpl:(r.searchTpl||s.searchTpl||''),
                               conf:conf, forceConf:true, evidence:r.evidence||[], note:r.note||'',
                               /* 🆕 V4.3.24：自动读出的站点名与页面标题。名字可能认不准（用户明确指出过），
                                  所以卡片上提供「改名」，且改名后**不再被自动判定覆盖**（见 libUpsert 的 nameRenamed）。 */
                               siteName:r.siteName||s.siteName||'', pageTitle:r.title||s.pageTitle||'' });
    libRender();
    return merged;
  }
  function libSpotCheck(host){
    const list = libLoad(); const s = libFind(list, host);
    if(!s || !s.evidence || !s.evidence.length) libJudge(host, '');
  }
  function libOpenUrl(u){ if(!u) return; if(api && api.openExternal){ try{ api.openExternal(u); return; }catch(e){} } send('openUrl', u); }
  /* 结构性文案走双语表（与 PANEL_TEXT 同思路）；area-log 里那些过程日志沿用既有做法（中文），
     项目里 setFetchLog / setSearchLog 等日志本来就是中文，不为新功能单独另起一套。
     🎨 V4.3.63：按钮文案里的 emoji 前缀去掉了 —— 图标改由 `ico()` 渲染成线条 SVG
     （与静态按钮同一套），文案只留文字。这样英文模式下也不会出现"中文位置一个 emoji"。 */
  const LIB_T = {
    zh: { empty:'还没有站点。用「书源」搜一次书，站点会自动入库。', ev:'判定依据：', evNone:'判定依据：暂无（点「复核」让程序真去请求一次这座站）',
          searchHere:'搜本站', home:'主页', recheck:'复核', rename:'改名', remove:'删除',
          used:'用过 ', times:' 次', searchOk:'搜索成功过', renameSave:'保存', renaming:'改名中：输入新名字后回车' },
    en: { empty:'No sites yet. Search once in "Sources" and sites will be stored automatically.', ev:'Evidence: ', evNone:'Evidence: none yet (hit "Re-check" so the app really requests this site)',
          searchHere:'Search here', home:'Home', recheck:'Re-check', rename:'Rename', remove:'Delete',
          used:'used ', times:'×', searchOk:'search worked', renameSave:'Save', renaming:'Renaming: type a new name and press Enter' }
  };
  function libT(k){ const d = LIB_T[panelLang] || LIB_T.zh; return d[k] !== undefined ? d[k] : (LIB_T.zh[k] || ''); }
  let libQueryHost = '';        // 当前在哪张卡上搜
  function libRender(){
    const box = $('libList'); if(!box) return;
    const list = libLoad();
    const cnt = $('libCount'); if(cnt) cnt.textContent = list.length ? '(' + list.length + ')' : '';
    box.innerHTML = '';
    if(!list.length){ box.innerHTML = '<div class="empty">' + escapeHtml(libT('empty')) + '</div>'; return; }
    list.sort((a,b)=>(b.lastAt||0)-(a.lastAt||0));
    list.forEach(s=>{
      const card = document.createElement('div'); card.className = 'lib-card';
      const head = document.createElement('div'); head.className = 'lib-head';
      /* 🆕 V4.3.24 名字的三级回退：用户改的名 / 书源名 ＞ 程序自动读出的站点名 ＞ 域名。
         自动读的可能不准（用户明确指出过），所以卡片上给「改名」，改完就不再被自动值覆盖。 */
      const shown = (s.name || s.siteName || s.host || '').trim();
      const nm = document.createElement('div'); nm.className = 'lib-name';
      nm.textContent = (shown && shown !== s.host) ? (shown + ' · ' + s.host) : s.host;
      if(s.pageTitle) nm.title = '自动读到的页面标题：' + s.pageTitle;
      const hits = document.createElement('div'); hits.className = 'lib-hits';
      hits.textContent = (s.hits ? libT('used') + s.hits + libT('times') : '') + (s.searchOkAt ? '｜' + libT('searchOk') : '');
      head.appendChild(nm); head.appendChild(hits);
      const badge = document.createElement('div'); badge.className = 'lib-badge ' + (s.conf||'unknown');
      badge.textContent = (LIB_BADGE[s.conf] || LIB_BADGE.unknown)[panelLang] || (LIB_BADGE[s.conf]||LIB_BADGE.unknown).zh;
      if(s.note) badge.title = s.note;
      const ev = document.createElement('div'); ev.className = 'lib-ev';
      ev.textContent = (s.evidence && s.evidence.length) ? (libT('ev') + s.evidence.join('；')) : libT('evNone');
      const acts = document.createElement('div'); acts.className = 'lib-acts';
      /* 🎨 V4.3.63：`icon` 是图标名（交给 ico() 渲染线条 SVG）；label 只留文字。 */
      const mk = (icon, label, title, fn, cls)=>{
        const b=document.createElement('button');
        if(icon){ const sp=document.createElement('span'); sp.className='ic'; sp.innerHTML=ico(icon); b.appendChild(sp); }
        const tx=document.createElement('span'); tx.className='tx'; tx.textContent=label; b.appendChild(tx);
        if(title) b.title=title; if(cls) b.className=cls;
        b.addEventListener('click', fn); acts.appendChild(b); return b;
      };
      // 搜本站：需要关键词 + 有搜索模板 + 能匹配到规则（没有选择器就没法解析结果）
      const canSearch = !!s.searchTpl;
      mk('search', libT('searchHere'), canSearch ? ('在该站搜索（模板：' + s.searchTpl + '）') : '这座站没有可用的搜索入口，只能打开主页', async ()=>{
        /* 🟥 V4.3.23：置灰态（.off）**必须与行为一致** —— 不能"看着禁用、点了却真去开浏览器"。
           没有搜索入口时只解释原因，不做任何动作。 */
        if(!canSearch){ libLog('这座站没有找到搜索入口（判定依据见卡片），只能点「🏠 主页」直接打开', true); return; }
        /* 🔍 V4.3.86（主人：把重复的功能统一）：原来面板里有**两个**搜索框（顶部 #searchInput
           与书库区的 #libQuery），输一半还得想“该输哪个”。现在只留顶部那一个，
           “搜本站”直接用它的值。 */
        const q = ($('searchInput') && $('searchInput').value.trim()) || '';
        if(!q){ libLog('请先在上面的「书名 / 作者」框里填关键词，再点「搜本站」', true); return; }
        await libSearchOn(s, q);
      }, canSearch ? '' : 'off');
      mk('home', libT('home'), s.home || ('打开 ' + (s.origin||s.host)), ()=>{ libOpenUrl(s.home || s.origin || ('https://'+s.host)); });
      mk('edit', libT('rename'), '站点名可能认不准（比如读到的是书名），可以在这里改成你能认出来的名字', ()=>libStartRename(s.host));
      mk('crosshair', libT('recheck'), '重新真请求一次这座站，更新判定与依据', ()=>{ libLog('正在复核 ' + s.host + ' …'); libJudge(s.host, '').then(()=>libLog('复核完成')); });
      mk('trash', libT('remove'), '从书库移除', ()=>{ libSave(libLoad().filter(x=>x.host!==s.host)); libRender(); });
      card.appendChild(head); card.appendChild(badge); card.appendChild(ev); card.appendChild(acts);
      if(libRenamingHost === s.host){
        const row = document.createElement('div'); row.className = 'lib-edit';
        const inp = document.createElement('input'); inp.type='text'; inp.id='libRenameInput'; inp.placeholder=libT('renaming');
        const ok = document.createElement('button'); ok.textContent = libT('renameSave');
        ok.addEventListener('click', ()=>libCommitRename(s.host, inp.value));
        inp.addEventListener('keydown', e=>{
          if(e.key==='Enter'){ e.preventDefault(); libCommitRename(s.host, inp.value); }
          else if(e.key==='Escape'){ e.preventDefault(); libRenamingHost=''; libRender(); }
        });
        row.appendChild(inp); row.appendChild(ok);
        card.appendChild(row);
      }
      if(libQueryHost === s.host){ const res = document.createElement('div'); res.className='lib-res'; res.id='libRes'; card.appendChild(res); }
      box.appendChild(card);
    });
  }
  function libLog(msg, warn){
    const el = $('libLog'); if(!el) return;
    el.textContent = msg || '';
    el.style.color = warn ? '#e03a3a' : '';
  }
  /* 在某个站上搜书：优先用它自己有模板的规则；没有规则就退化成「打开它的搜索页」（没选择器解析不了） */
  async function libSearchOn(site, q){
    libQueryHost = site.host;
    libRender();
    const box = $('libRes');
    const logLine = (m)=>libLog(m);
    if(!api || !api.sourceSearch){ logLine('当前版本不支持书源搜索'); return; }
    let rules = [];
    try{ rules = (await api.sourceListRules()) || []; }catch(e){ rules = []; }
    const hostOfTpl = (r)=>{ try{ return new URL((r.search&&r.search.urlTemplate)||'').host; }catch(e){ return ''; } };
    let rule = rules.find(r => hostOfTpl(r) === site.host) || null;
    if(!rule){
      // 没有匹配规则：只能给个能打开+能搜的地址，让用户去浏览器里搜
      const url = site.searchTpl ? site.searchTpl.replace('{kw}', encodeURIComponent(q)) : (site.home || site.origin);
      if(box) box.innerHTML = '<div class="empty">这座站没有配套书源规则，应用内解析不了结果（解析需要选择器）。已在浏览器打开它的搜索页。</div>';
      /* 🆕 V4.3.24（用户要求「搜索里直接保存网站」）：就算这次走的是浏览器，**也把这座站记进书库** ——
         下次它就出现在书库里，可以一键复核/改名，不用再手打一遍。 */
      libUpsert({ host: site.host, origin: site.origin || ('https://' + site.host), home: site.home || '',
                  searchTpl: site.searchTpl || '', conf: site.searchTpl ? 'form' : 'home', hit: true });
      libRender();
      libOpenUrl(url);
      logLine('已用浏览器打开该站搜索页（无书源规则 → 无法在应用内解析）；这座站已记进书库');
      return;
    }
    if(box) box.innerHTML = '<div class="empty">正在搜索…</div>';
    let r = null;
    try{ r = await api.sourceSearch({ query:q, rule }); }catch(e){ r = { ok:false, error:String(e&&e.message||e) }; }
    if(!r || !r.ok){
      if(box) box.innerHTML = '<div class="empty">搜索失败：' + escapeHtml((r&&r.error)||'未知错误') + '</div>';
      logLine('搜索失败：' + ((r&&r.error)||'未知错误'));
      return;
    }
    const results = r.results || [];
    // 实测出结果 → 该站等级升为「已实测」，这是最高置信度
    libUpsert({ host:site.host, conf:'search', forceConf:true, searchOkAt:Date.now(), hit:true, searchTpl:(rule.search&&rule.search.urlTemplate)||'' });
    if(box){
      box.innerHTML = '';
      if(!results.length){ box.innerHTML = '<div class="empty">无结果</div>'; }
      results.slice(0,12).forEach(rs=>{
        const d = document.createElement('div'); d.className='lib-resitem';
        d.textContent = (rs.title||PT('未命名', 'Untitled')) + (rs.author ? '（' + rs.author + '）' : '');
        d.title = '点击载入阅读器：' + (rs.url||'');
        d.addEventListener('click', ()=>libLoadBook(rs, rule));
        box.appendChild(d);
      });
    }
    logLine('搜索完成，共 ' + results.length + ' 条（点结果即可载入）｜该站已标记为「全站可搜·已实测」');
  }
  /* 从书库结果载入一本书：解析目录 → 抓正文 → 交给主窗载入（与书源面板同一条链路） */
  async function libLoadBook(rs, rule){
    libLog('正在载入《' + (rs.title||'') + '》…');
    /* 🟥 V4.3.47（R6-1）：书库载入要抓「目录 + 正文」两步，在途时间更长。
       同样必须在**点击这一刻**取号 —— 否则抓取期间用户清空/切书，这份迟到的正文
       照样会被装进阅读器（实测：清空后书自己又回来了）。 */
    const loadGen = beginSourceLoad();
    let r = null;
    try{ r = api && api.sourceChapters ? await api.sourceChapters({ url: rs.url, rule }) : null; }catch(e){ r = { ok:false, error:String(e&&e.message||e) }; }
    if(loadGen !== sourceLoadGen) return;      // 期间又点了别的结果 → 本次作废（后点者胜）
    if(!r || !r.ok){ libLog('目录解析失败：' + ((r&&r.error)||'未知错误'), true); return; }
    const all = r.chapters || [];
    if(!all.length){ libLog('没解析到章节，请检查规则选择器', true); return; }
    // 🆕 V4.3.24：章节倒序（站点把章节倒着排时，载入后按正序读）
    if(rule && rule.chaptersReversed) all.reverse();
    // 上限保护：默认首次载入最多 100 章（几千章一次抓会很久）；开启「正文自动分页」则解除上限，
    // 由底层并发队列分批续抓整本书（带进度、可随时取消）。
    const paginate = !!(rule && rule.contentAutoPaginate);
    const cap = paginate ? all.length : 100;
    const chs = all.slice(0, cap);
    libLog('解析到 ' + all.length + ' 章，' + (paginate ? ('已开启分批续抓，正在抓全部 ' + chs.length + ' 章…') : ('正在抓前 ' + chs.length + ' 章正文…')));
    let c = null;
    try{ c = api && api.sourceContents ? await api.sourceContents({ chapters: chs, rule }) : null; }catch(e){ c = { ok:false, error:String(e&&e.message||e) }; }
    if(!c || !c.ok){ libLog('正文抓取失败：' + ((c&&c.error)||'未知错误'), true); return; }
    const contents = (c.contents||[]).filter(Boolean);
    if(!contents.length){ libLog('没抓到正文', true); return; }
    send('load-book', { title: r.title || rs.title || '书源书籍', chapters: contents, rule, url: rs.url, loadGen });
    libLog('已载入 ' + contents.length + ' 章' + (all.length > cap ? ('（共 ' + all.length + ' 章，其余可到书源面板续抓）') : ''));
  }

  if(type==='toolbar') initToolbar();
  else if(type==='settings') initSettings();
  else if(type==='toc'){ $('tocList').addEventListener('click', e=>{ }); }
  else if(type==='source') initSource();
  else if(type==='shelf') initShelf();
  // 📑 V4.3.29 书签列表
  else if(type==='bookmarks') initBookmark();
  else if(type==='search'){
    $('searchInput').addEventListener('input', e=>{ const q=e.target.value; if(!q.trim()){ $('searchResults').innerHTML=''; $('searchHint').textContent=PT('输入内容后自动搜索', 'Type to search'); } send('query', q); });
    $('searchInput').addEventListener('keydown', e=>{ if(e.key==='Escape') send('close'); });
    libRender();   // 🆕 V4.3.23 书库（併进全文搜索面板，用户定案）
    // 🆕 V4.3.24：手动把站点存进书库（不用先建书源规则）
    const addBtn = $('libAddBtn'); if(addBtn) addBtn.addEventListener('click', libAddByUrl);
    const addInp = $('libAddInput');
    if(addInp) addInp.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); libAddByUrl(); } });
  }

  if(api && api.onPanelUpdate) api.onPanelUpdate(p => {
    // 合并目录章节缓存
    if(p && p.chapters !== undefined) currentChapters = p.chapters;
    onUpdate(p);
  });

  applyPanelLang(panelLang);
  if(api && api.panelReady) api.panelReady();
})();
