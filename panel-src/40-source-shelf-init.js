  let sourceRules = [];
  let sourceChapters = [];
  let sourceTitle = '';
  /* 🟥 V4.3.44（R3-2）：书源结果解析的代次令牌。
     连点两条搜索结果时，先点的（可能是慢源）会**后**返回并把后点的覆盖掉 ——
     用户看到的是先点那本的目录。发起时取号、返回后复检。 */
  let sourceOpenToken = 0;
  /* 🟥 V4.3.47（R6-1）：书源 / 书库「抓正文并载入」的**发起时刻**令牌。
     这条路径中间隔着抓正文的耗时（最多 100 章，可能几十秒），用户完全可能在等待期间
     点了「清空所有内容」/「恢复默认设置」（主窗已经把 bookSwitchToken 自增过）
     或从书架另开了一本 —— 而那些动作面板一无所知，抓完照样把书送过去，
     主窗也无从判断这次载入所依据的用户意图早已过期。
     所以要在**用户点下按钮的那一刻**先报一个 sourceLoadStart 给主窗，
     让主窗把当时的 bookSwitchToken 记成这次载入的期望代次；抓完再带着同一个 gen 交卷。
     🚫 令牌**绝不能**等到抓取回来之后才取 —— 那时「用户点它的那一刻」这个信息已经丢了。
     这正是 V4.3.44（R3-2）已经得出的结论（令牌必须在用户动作发生的那一刻取号），
     本轮只是把它补到书源/书库这条漏掉的入口上。 */
  let sourceLoadGen = 0;
  function beginSourceLoad(){ const gen = ++sourceLoadGen; send('sourceLoadStart', { gen }); return gen; }
  let sourceFetching = false;
  let sourceFailedChapters = [];
  let sourceSlots = [];

  function fillSourceForm(){
    const sel = $('sourceRuleSelect');
    const idx = Number(sel.value);
    const r = sourceRules[idx];
    const set = (id,v)=>{ const el=$(id); if(el) el.value = (v == null) ? '' : v; };
    if(r){
      set('srcName', r.name);
      set('srcEncoding', r.encoding || 'utf-8');
      set('srcChapterItem', (r.chapterList && r.chapterList.item) || '');
      set('srcLinkAttr', (r.chapterList && r.chapterList.linkAttr) || 'href');
      set('srcTitleAttr', (r.chapterList && r.chapterList.titleAttr) || '');
      set('srcContentSel', (r.content && r.content.content) || '');
      set('srcRemoveSel', (r.content && r.content.remove) || '');
      set('srcConcurrent', r.concurrent || 3);
      set('srcInterval', (r.requestInterval == null) ? 250 : r.requestInterval);
      set('srcSearchUrl', (r.search && r.search.urlTemplate) || '');
      set('srcSearchBookUrlAttr', (r.search && r.search.bookUrlAttr) || 'href');
      set('srcResultItem', (r.search && r.search.resultItem) || '');
      set('srcSearchTitle', (r.search && r.search.title) || '');
      set('srcSearchAuthor', (r.search && r.search.author) || '');
      set('srcSearchBookUrl', (r.search && r.search.bookUrl) || '');
      /* V4.3.33 修：把两个**书源级开关**也回填。复选框要走 checked，不能复用上面的 set()。
         原先 buildRuleFromForm 会读这两个 id，但 fillSourceForm（选中一条规则时）从不回填 ——
         于是界面上这两个勾永远是"上一次操作残留的状态"：直接点保存会把它**静默改掉**，
         「🧪 试抓」用的表单值也是错的。 */
      const cbRev = $('srcChaptersReversed'); if(cbRev) cbRev.checked = !!r.chaptersReversed;
      const cbPag = $('srcAutoPaginate'); if(cbPag) cbPag.checked = !!r.contentAutoPaginate;
    } else {
      set('srcName',''); set('srcEncoding','utf-8');
      set('srcChapterItem',''); set('srcLinkAttr','href');
      set('srcTitleAttr',''); set('srcContentSel',''); set('srcRemoveSel','');
      set('srcConcurrent',3); set('srcInterval',250);
      set('srcSearchUrl',''); set('srcResultItem',''); set('srcSearchTitle',''); set('srcSearchAuthor',''); set('srcSearchBookUrl','');
      const cbRev0 = $('srcChaptersReversed'); if(cbRev0) cbRev0.checked = false;
      const cbPag0 = $('srcAutoPaginate'); if(cbPag0) cbPag0.checked = false;
    }
  }

  /* ================= 🆕 V4.3.24 书源表单：候选值 + 历史值 + 试抓 =================
     背景（用户要求）：书源规则里有很多"可数选项"的字段，不想每次都重复输入。
     做法要点：
       ① 一律 `<input list=datalist>` —— **下拉可选、也能手打**。不用硬 `<select>` 是因为
          赋一个不在候选里的 value 会让 select 变空、保存时把用户的自定义值**静默改成默认值**；
       ② 候选 = 内置常见值 + **你填过的历史值**（历史优先、去重、每字段 20 条），越用越省事；
       ③ 加「🧪 试抓」：填完立刻验证 章节/标题/正文（或搜索）三个选择器是否命中，不再等真抓才知道。 */
  const SRC_SUGGEST = {
    dlEncoding:   ['utf-8','gb18030','big5','shift_jis','euc-kr','utf-16le'],
    dlChapterItem:['.list a','dd a','#list a','#chapterlist a','.chapter-list a','ul.list li a','.book_list a','#list-chapterAll a','#newlist a','#readerlist a'],
    dlLinkAttr:   ['href','src','data-src','data-original','data-url','data-href','content','onclick'],
    dlTitleAttr:  ['title','alt','data-title','content'],
    dlContentSel: ['#content','#chaptercontent','.read-content','#booktxt','#nr1','#htmlContent','.content','#readercontent'],
    dlRemoveSel:  ['script,style','script,style,.ad','script,style,.ad,.ads','script,style,.ad,.ads,.banner','script,style,.ad,.toolbar,.footer'],
    dlConcurrent: ['1','2','3','4','6','8'],
    dlInterval:   ['0','100','250','500','1000','2000'],
    dlResultItem: ['.result-item','.book-item','.search-result','.item','tr','li'],
    dlSearchTitle:['h3 a','.title a','.s2 a','h3','a'],
    dlSearchAuthor:['.author','.s4','.author-name','.result-game-item-info-tag'],
    dlSearchBookUrl:['h3 a','.title a','a','h3'],
    /* V4.3.33：原有一条 dlSearchBookUrlAttr 配置，但 panel.html 里**根本没有**这个 datalist，
       而「结果链接属性」输入框用的是 dlLinkAttr、历史值也记进 dlLinkAttr（见 srcHistRecordFromRule）——
       那份配置从来没生效过，删掉，免得后人以为它有用。 */
    /* 🟥 V4.3.27：候选里原来写 https://{host}/... ，但程序只代换 {kw}，**{host} 从不代换** ——
       用户照抄就会拿到字面 {host} 的 URL，表现为「点了搜索没反应」。改成真实域名的样子，
       一眼就知道这里要换成自己的站点。 */
    dlSearchUrl:['https://www.example.com/search?q={kw}','https://www.example.com/index.php?keyword={kw}','https://www.example.com/search.php?keyword={kw}','https://www.example.com/?s={kw}']
  };
  const SRC_HIST_KEY = 'fsrchist';
  function srcHistLoad(){ try{ const o=JSON.parse(localStorage.getItem(SRC_HIST_KEY)||'{}'); return (o && typeof o==='object' && !Array.isArray(o)) ? o : {}; }catch(e){ return {}; } }
  function srcHistSave(o){ try{ localStorage.setItem(SRC_HIST_KEY, JSON.stringify(o)); }catch(e){} }
  function srcHistRecord(field, value){
    const v = String(value == null ? '' : value).trim();
    if(!v) return;
    const all = srcHistLoad();
    const arr = Array.isArray(all[field]) ? all[field] : [];
    all[field] = [v].concat(arr.filter(x => x !== v)).slice(0, 20);
    srcHistSave(all);
  }
  function fillSourceDatalists(){
    const hist = srcHistLoad();
    Object.keys(SRC_SUGGEST).forEach(id=>{
      const dl = document.getElementById(id); if(!dl) return;
      const h = Array.isArray(hist[id]) ? hist[id] : [];
      const seen = {}, list = [];
      h.concat(SRC_SUGGEST[id]).forEach(v=>{ if(v && !seen[v]){ seen[v]=1; list.push(v); } });
      dl.innerHTML = '';
      list.forEach(v=>{ const o=document.createElement('option'); o.value=v; dl.appendChild(o); });
    });
  }
  // 保存规则时把用到的值记进历史（书源面板与主窗同源 localStorage，跨窗口共用）
  function srcHistRecordFromRule(rule){
    if(!rule) return;
    const cl = rule.chapterList || {}, s = rule.search || {}, ct = rule.content || {};
    srcHistRecord('dlEncoding', rule.encoding);
    srcHistRecord('dlChapterItem', cl.item);
    srcHistRecord('dlLinkAttr', cl.linkAttr);
    srcHistRecord('dlTitleAttr', cl.titleAttr);
    srcHistRecord('dlContentSel', ct.content);
    srcHistRecord('dlRemoveSel', ct.remove);
    srcHistRecord('dlConcurrent', String(rule.concurrent || ''));
    srcHistRecord('dlInterval', String(rule.requestInterval == null ? '' : rule.requestInterval));
    if(s.urlTemplate){
      srcHistRecord('dlSearchUrl', s.urlTemplate);
      srcHistRecord('dlResultItem', s.resultItem);
      srcHistRecord('dlSearchTitle', s.title);
      srcHistRecord('dlSearchAuthor', s.author);
      srcHistRecord('dlSearchBookUrl', s.bookUrl);
      srcHistRecord('dlLinkAttr', s.bookUrlAttr);
    }
    fillSourceDatalists();
  }
  // 书库站点 → 一键填入搜索URL（V4.3.23 的书库已经存了每站判定出来的 searchTpl）
  function fillLibSitesSelect(){
    const sel = $('srcLibSites'); if(!sel) return;
    const list = libLoad().filter(s => s && s.host);
    sel.innerHTML = '';
    const o0 = document.createElement('option');
    o0.value = '';
    /* 占位项也走同一套 data-i18n：它在 init 时按**当时**的语言生成，不标记的话切语言后不刷新 */
    const ph = list.length ? '（选一个站点）' : '（书库还是空的）';
    o0.setAttribute('data-i18n', ph); o0.textContent = ph;
    sel.appendChild(o0);
    list.forEach(s=>{
      const o = document.createElement('option'); o.value = s.host;
      o.textContent = (s.name ? s.name + ' · ' : '') + s.host + (s.searchTpl ? '' : PT('（无搜索入口）',' (no search entry)'));
      sel.appendChild(o);
    });
  }
  function fillSearchUrlFromLib(){
    const sel = $('srcLibSites'), host = sel && sel.value;
    if(!host){ setRuleLog('先在左边的下拉里选一个书库站点'); return; }
    const s = libLoad().filter(x => x.host === host)[0];
    if(!s || !s.searchTpl){ setRuleLog('这座站还没判定出搜索入口 —— 到「全文搜索 → 书库」点它的「🔎 复核」再判一次'); return; }
    $('srcSearchUrl').value = s.searchTpl;
    setRuleLog('已填入该站的搜索模板：' + s.searchTpl + '（还能再手改）');
  }
  /* ✏️ 改名：自动读出的站点名可能不准（读到书名、读到频道名…），用户改过之后不再被自动值覆盖。
     用卡片内嵌输入框而不是 window.prompt —— 小窗里弹系统对话框很突兀，也不好测。 */
  let libRenamingHost = '';
  function libStartRename(host){
    libRenamingHost = host;
    libRender();
    const el = $('libRenameInput');
    if(el){ const s = libLoad().find(x=>x.host===host); el.value = (s && (s.name || s.siteName)) || ''; el.focus(); el.select(); }
    else libLog(libT('renaming'), true);
  }
  function libCommitRename(host, value){
    const v = String(value || '').trim().slice(0, 40);
    libRenamingHost = '';
    if(!v){ libRender(); libLog('名字留空 = 用自动读出的名字显示', true); return; }
    libUpsert({ host: host, name: v });
    libRender();
    libLog('已改名为「' + v + '」（之后自动判定不会再覆盖它）');
    fillLibSitesSelect();
  }
  /* ＋ 不用先建书源规则，也能把站点存进书库（用户要求「搜索里直接保存网站」） */
  function libAddByUrl(){
    const el = $('libAddInput');
    const raw = String(((el && el.value) || '')).trim();
    if(!raw){ libLog('先填站点域名或主页 URL（如 example.com）', true); return; }
    let u = raw;
    if(!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
    let host = '', origin = '';
    try { const o = new URL(u); host = o.host; origin = o.origin; }
    catch(e){ libLog('看不出这是哪个站点（示例：example.com 或 https://example.com/）', true); return; }
    libUpsert({ host, origin, home: origin + '/', conf:'unknown', hit:true });
    if(el) el.value = '';
    libRender();
    fillLibSitesSelect();
    libLog('已加入书库，正在让程序真去判定这座站（含站点名）…');
    libJudge(host, u).then(s=>{ libLog(s ? ('判定完成：' + (s.conf||'') + '｜站点名：' + (s.name || s.siteName || '(没读到)') + '（依据见卡片）') : '判定失败（站点可能不通）'); });
  }
  /* 🧪 试抓：一次点击验证「章节选择器 / 标题属性 / 正文选择器」（有目录页 URL 时），
     或验证「搜索模板 + 结果选择器」（有关键词时）。只抓第一章，快、也尽量不打扰目标站。 */
  let srcTesting = false;
  async function testRulePanel(){
    if(srcTesting) return;
    /* 🟥 V4.3.24：试抓必须用**表单里当前的值**（buildRuleFromForm），不能用 selectedRule()。
       selectedRule() 返回的是已保存的那条规则 —— 用户把选择器改了但还没保存就点试抓时，
       会拿旧规则去测，报「命中 0 章」，把人往错误的方向带（探针实测到的就是这个）。
       表单未改动时两者等价（fillSourceForm 已把保存值填回表单），所以这个选择更安全。 */
    const rule = buildRuleFromForm();
    const fld = $('sourceRuleLog');
    const lines = [];
    const put = s => { lines.push(s); if(fld) fld.textContent = lines.join('\n'); };
    if(!rule){ put('缺少规则：至少要填「名称 / 章节选择器 / 正文选择器」'); return; }
    const url = ($('sourceBookUrl') && $('sourceBookUrl').value || '').trim();
    const kw = ($('sourceSearchInput') && $('sourceSearchInput').value || '').trim();
    if(!url && !kw){ put('先在「抓取」里填一个目录/详情页 URL，或在「搜索」里填书名/作者，再点试抓。'); return; }
    srcTesting = true;
    const btn = $('sourceTestBtn'); if(btn) btn.textContent = PT('🧪 试抓中…', '🧪 Testing…');
    put('🧪 试抓中…');
    try{
      if(url){
        let r = null;
        try{ r = api && api.sourceChapters ? await api.sourceChapters({ url, rule }) : null; }catch(e){ r = { ok:false, error:String((e&&e.message)||e) }; }
        if(!r || !r.ok){ put('❌ 章节选择器没命中：' + ((r && r.error) || '未知错误')); put('   → 先改「章节选择器」或「链接属性」，也可以换个目录页 URL'); return; }
        const chs = r.chapters || [];
        put('✅ 章节选择器命中 ' + chs.length + ' 章' + (r.title ? ('（书名：' + r.title + '）') : ''));
        if(!chs.length){ put('   ⚠️ 命中 0 章，选择器还得调'); return; }
        const t = String(chs[0].title || '').trim();
        put(t ? ('✅ 标题取到：「' + t + '」') : '⚠️ 标题是空的 → 试改「标题属性」（或留空直接取元素文字）');
        let c = null;
        try{ c = api && api.sourceFetchOne ? await api.sourceFetchOne({ url: chs[0].url, rule }) : null; }catch(e){ c = { ok:false, error:String((e&&e.message)||e) }; }
        if(c && c.ok && c.content && String(c.content).length) put('✅ 正文选择器抓到 ' + String(c.content).length + ' 字');
        else put('❌ 正文选择器没抓到内容：' + ((c && c.error) || '（空）') + ' → 检查「正文选择器」与「移除选择器」');
        return;
      }
      if(!rule.search || !rule.search.urlTemplate){ put('❌ 这条规则没有搜索URL，用不了搜索试抓'); return; }
      let r = null;
      try{ r = api && api.sourceSearch ? await api.sourceSearch({ query: kw, rule }) : null; }catch(e){ r = { ok:false, error:String((e&&e.message)||e) }; }
      if(r && r.ok){
        const arr = r.results || [];
        put('✅ 搜索命中 ' + arr.length + ' 条' + (arr[0] && arr[0].title ? ('（首条：' + arr[0].title + '）') : ''));
        if(!arr.length) put('   ⚠️ 命中 0 条 → 检查「结果选择器 / 标题选择器 / 链接选择器」');
      } else {
        // 📑 V4.3.29：试抓里的搜索失败也走同一套「下一步该干嘛」的引导，别只念原错误
        put('❌ 搜索失败：' + ((r && r.error) || '未知错误'));
        const adv = srcAdvise((r && r.error) || '未知错误');
        const tipLine = String(adv).split('\n').filter(s=>s.indexOf('👉') === 0)[0];
        if(tipLine) put('   ' + tipLine);
      }
    } finally {
      srcTesting = false;
      const b = $('sourceTestBtn'); if(b) b.textContent = PT('🧪 试抓（验证选择器）', '🧪 Test fetch (verify selectors)');
    }
  }

  function refreshSourceRules(selIndex){
    const sel = $('sourceRuleSelect');
    sel.innerHTML = '';
    sourceRules.forEach((r, i)=>{ const o=document.createElement('option'); o.value=String(i); o.textContent=r.name; sel.appendChild(o); });
    if(!sourceRules.length){ const o=document.createElement('option'); o.value=''; o.setAttribute('data-i18n','（无规则，请先保存一条）'); o.textContent=PT('（无规则，请先保存一条）', '(no rules — save one first)'); sel.appendChild(o); }
    if(selIndex !== undefined) sel.value = String(selIndex);
    fillSourceForm();
  }

  function buildRuleFromForm(){
    const name = $('srcName').value.trim();
    const item = $('srcChapterItem').value.trim();
    const content = $('srcContentSel').value.trim();
    if(!name || !item || !content){ return null; }
    const clampInt = (v,min,max,fallback)=>{ const n=parseInt(v,10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback; };
    const searchUrl = $('srcSearchUrl').value.trim();
    const search = searchUrl ? {
      urlTemplate: searchUrl,
      resultItem: $('srcResultItem').value.trim() || 'a',
      title: $('srcSearchTitle').value.trim() || '__self__',
      author: $('srcSearchAuthor').value.trim() || null,
      bookUrl: $('srcSearchBookUrl').value.trim() || '__self__',
      /* 🆕 V4.3.24：搜索结果的链接属性原先**写死 href**，表单里根本没有这个字段 ——
         遇到把真实地址放在 data-* 上的站点就搜不出结果。现在暴露出来，和其它属性一样可下拉可手打。 */
      bookUrlAttr: $('srcSearchBookUrlAttr').value.trim() || 'href'
    } : null;
    return {
      name,
      encoding: $('srcEncoding').value || 'utf-8',
      chapterList: { item, linkAttr: $('srcLinkAttr').value.trim() || 'href', titleAttr: $('srcTitleAttr').value.trim() || null },
      content: { content, remove: $('srcRemoveSel').value.trim() || null },
      search,
      concurrent: clampInt($('srcConcurrent').value, 1, 8, 3),
      requestInterval: clampInt($('srcInterval').value, 0, 2000, 250),
      /* 🆕 V4.3.24：两个书源级开关 */
      chaptersReversed: !!($('srcChaptersReversed') && $('srcChaptersReversed').checked),
      contentAutoPaginate: !!($('srcAutoPaginate') && $('srcAutoPaginate').checked)
    };
  }

  function selectedRule(){
    const idx = Number($('sourceRuleSelect').value);
    const r = sourceRules[idx];
    return r || buildRuleFromForm();
  }

  function setRuleLog(msg){ const el=$('sourceRuleLog'); if(el) el.textContent = msg || ''; }
  function setSearchLog(msg){ const el=$('sourceSearchLog'); if(el) el.textContent = msg || ''; }
  function setFetchLog(msg){ const el=$('sourceFetchLog'); if(el) el.textContent = msg || ''; }
  function setSourceProgress(done,total){ const el=$('sourceProgressFill'); if(el) el.style.width = (total ? Math.round(done/total*100) : 0) + '%'; }
  function setSourceProgressText(msg){ setFetchLog(msg); }

  function renderSourceList(){
    const box=$('sourceList'); box.innerHTML='';
    $('sourceCount').textContent = sourceChapters.length ? (PT('已解析 ', 'Parsed ')+sourceChapters.length+' 章') : '';
    if(!sourceChapters.length){ box.innerHTML='<div class="empty">暂无章节</div>'; return; }
    const frag=document.createDocumentFragment();
    sourceChapters.forEach((ch,i)=>{ const d=document.createElement('div'); d.className='item'; d.textContent=(i+1)+'. '+(ch.title||''); frag.appendChild(d); });
    box.appendChild(frag);
  }

  async function loadSourceRules(){
    if(api && api.sourceListRules){ try{ sourceRules = await api.sourceListRules() || []; }catch(e){ sourceRules=[]; } }
    refreshSourceRules();
    fillSourceDatalists();    // 🆕 V4.3.24：规则里已有的值也会成为候选（历史值随保存累积，这里再补一次）
  }

  async function fetchSourceList(){
    if(sourceFetching) return;
    const url = $('sourceBookUrl').value.trim();
    if(!/^https?:\/\//i.test(url)){ setFetchLog('请输入有效 http(s) URL'); return; }
    const rule = selectedRule();
    if(!rule){ setFetchLog('缺少规则，请先在规则区填写并保存'); return; }
    sourceFetching = true; setFetchLog('正在抓取章节列表…');
    let r = null;
    try{ r = api && api.sourceChapters ? await api.sourceChapters({ url, rule }) : null; }catch(e){ r = { ok:false, error:String(e && e.message || e) }; }
    sourceFetching = false;
    if(r && r.ok){
      sourceChapters = r.chapters || [];
      sourceTitle = r.title || '';
      renderSourceList();
      const parts = ['解析到 ' + sourceChapters.length + ' 章'];
      if(r.duplicates) parts.push('已自动去重 ' + r.duplicates + ' 章');
      if(r.sortedByNumber) parts.push('已按章节序号排序');
      if(r.missing && r.missing.length){
        const preview = r.missing.slice(0, 20).join('、');
        parts.push('缺少第 ' + preview + (r.missing.length > 20 ? ' 等共 ' + r.missing.length + ' 章' : ' 章'));
      }
      parts.push('可点击「抓取正文并载入」');
      setFetchLog(parts.join(' · '));
    } else {
      sourceChapters = [];
      renderSourceList();
      setFetchLog('抓取失败：'+((r && r.error) || '未知错误'));
    }
  }

  async function fetchSourceAll(){
    if(sourceFetching || !sourceChapters.length) return;
    const rule = selectedRule();
    if(!rule){ setFetchLog('缺少规则，请先在规则区填写并保存'); return; }
    /* 🟥 V4.3.47（R6-1）：在**点击这一刻**取号并报给主窗（详见 sourceLoadGen 处的说明） */
    const loadGen = beginSourceLoad();
    sourceFetching = true;
    sourceFailedChapters = [];
    sourceSlots = new Array(sourceChapters.length).fill(null);
    $('sourceFetchAllBtn').textContent = PT('抓取中…', 'Fetching…');
    $('sourceRetryBtn').style.display = 'none';
    setSourceProgress(0, sourceChapters.length);
    setSourceProgressText('正在抓取正文 0/'+sourceChapters.length);
    let r = null;
    try{ r = api && api.sourceContents ? await api.sourceContents({ chapters: sourceChapters, rule }) : null; }catch(e){ r = { ok:false, error:String(e && e.message || e) }; }
    sourceFetching = false;
    /* 🟥 V4.3.47（R6-1）：抓取途中又有新的一次抓取发起过 → 本次作废（后发者胜） */
    if(loadGen !== sourceLoadGen) return;
    $('sourceFetchAllBtn').textContent = PT('抓取正文并载入', 'Fetch content and load');
    if(r && r.ok){
      (r.contents || []).forEach(c=>{
        if(typeof c.idx !== 'number') return;
        sourceSlots[c.idx] = { title: c.title, content: c.content, failed: !!c.failed, url: c.url || '' };
      });
      for(let i=0;i<sourceSlots.length;i++){
        if(!sourceSlots[i]) sourceSlots[i] = { title: sourceChapters[i] ? sourceChapters[i].title : ('第'+(i+1)+'章'), content: '', failed: true, url: sourceChapters[i] ? sourceChapters[i].url : '' };
      }
      sourceFailedChapters = r.failedChapters || [];
      /* V4.3.33 修：失败章节在上一段被填成了「占位对象」（带 failed:true），
         所以 filter(Boolean) 会把它们一起算成成功 —— 提示里的成功数恒等于总章数，
         而且**全书都失败时 good.length 仍 > 0**，照样 send('load-book') 把一本全空白的书载进来。
         这里改成只认「拿到正文的」章节。 */
      const good = sourceSlots.filter(s => s && !s.failed);
      const fail = sourceSlots.length - good.length;
      setSourceProgress(1,1);
      setSourceProgressText('抓取完成：成功 '+good.length+' 章，失败 '+fail+' 章');
      setFetchLog(fail ? ('有 '+fail+' 章抓取失败，已在原位置保留空白章节，可点击「重试失败章节」或在阅读器内单章重抓') : '抓取完成');
      if(good.length){ send('load-book', { title: sourceTitle || '书源书籍', chapters: good, rule, url, loadGen }); libRecordSearch(rule, [{ url }]); }
      else { setFetchLog('没有抓到任何正文'); setSourceProgressText(''); }
      showRetryButton();
    } else {
      setFetchLog('抓取失败：'+((r && r.error) || '未知错误'));
      setSourceProgressText('');
    }
  }

  /* ===================== 🤖 V4.3.85 自动抓取（书源页主入口） =====================
     用户只给一个 URL：识别 + 抓取全在主进程完成（main-src/51-source-auto.js），
     面板只负责进度、取消、如实汇报识别结果、交卷。
     🟥 与手动路径共用 beginSourceLoad 的代次令牌（R6-1）：令牌必须在**点击那一刻**取号，
     否则抓取途中用户清空内容 / 另开一本时，主窗判不出这次载入已经过期。 */
  let autoBusy = false;
  function setAutoLog(msg){ const el = $('autoLog'); if(el) el.textContent = msg || ''; }
  function setAutoCount(msg){ const el = $('autoCount'); if(el) el.textContent = msg || ''; }
  function setAutoProgress(done, total){
    const bar = $('autoProgressBar'), fill = $('autoProgressFill');
    if(bar) bar.style.display = '';
    if(fill) fill.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  }
  function autoResetBar(){
    const bar = $('autoProgressBar'); if(bar) bar.style.display = 'none';
    const fill = $('autoProgressFill'); if(fill) fill.style.width = '0%';
  }

  async function autoFetchAll(){
    if(autoBusy) return;
    const url = ($('autoUrl') && $('autoUrl').value || '').trim();
    if(!/^https?:\/\//i.test(url)){
      setAutoLog(PT('请先粘贴一个 http(s) 开头的目录页或详情页 URL', 'Paste an http(s) index or detail page URL first'));
      return;
    }
    const loadGen = beginSourceLoad();
    autoBusy = true;
    setAutoLog(PT('正在打开页面、识别章节与正文…', 'Opening the page, detecting chapters and content…'));
    setAutoCount('');
    setAutoProgress(0, 0);
    const btn = $('autoFetchBtn');
    if(btn){ btn.disabled = true; btn.textContent = PT('抓取中…', 'Fetching…'); }
    const cancelBtn = $('autoCancelBtn'); if(cancelBtn) cancelBtn.style.display = '';
    let r = null;
    try{ r = api && api.sourceAuto ? await api.sourceAuto({ url }) : null; }
    catch(e){ r = { ok:false, error:String((e && e.message) || e) }; }
    autoBusy = false;
    if(btn){ btn.disabled = false; btn.textContent = PT('自动抓取并载入', 'Auto fetch and load'); }
    if(cancelBtn) cancelBtn.style.display = 'none';
    /* 途中又发起过一次抓取 → 本次作废（后发者胜） */
    if(loadGen !== sourceLoadGen) return;
    if(!r || !r.ok){
      autoResetBar();
      setAutoLog('❌ ' + ((r && r.error) || PT('未知错误', 'Unknown error')));
      return;
    }
    const d = r.detected || {};
    const list = r.chapters || [];
    const good = list.filter(c => c && !c.failed);
    const fail = list.length - good.length;
    setAutoProgress(1, 1);
    setAutoCount(PT('共 ', 'of ') + list.length + PT(' 章', ' ch'));
    /* 如实汇报"认出了什么"：用户看不见选择器，但有权知道系统认成了哪一块 ——
       认错了才可能发现（也才好去「高级」里改）。 */
    const bits = ['✅ ' + PT('识别到 ', 'detected ') + (d.chapterCount || list.length) + PT(' 章', ' chapters')];
    /* 用户粘的是详情页、系统自己跟到了目录页 —— 必须说出来，否则他会以为"我给的地址就是目录"。 */
    if(d.followedEntry) bits.push(PT('已从详情页跟到目录', 'followed index from detail page'));
    if(d.chapterSelector) bits.push(PT('目录 ', 'index ') + d.chapterSelector);
    if(d.contentSelector) bits.push(PT('正文 ', 'content ') + d.contentSelector);
    if(d.duplicates) bits.push(PT('已去重 ', 'dupes ') + d.duplicates);
    if(fail) bits.push(PT('失败 ', 'failed ') + fail);
    setAutoLog(bits.join(' · '));
    if(!good.length){ setAutoLog(PT('❌ 没有抓到任何正文', '❌ No content was fetched')); return; }
    send('load-book', { title: r.title || PT('书源书籍', 'Web book'), chapters: good, rule: r.rule, url, loadGen });
    /* 🆕 V4.3.85：把这个「真的读到了正文」的站点记进书库站点表。
       🟥 这里**不能**复用 libRecordSearch —— 它记的是「本机实测**搜索成功**」，
       而自动抓取根本没做搜索。记成 search 级会让书库置信度凭空变高，
       还会用 forceConf:true 盖掉别人真搜过的证据（下次自动填搜索 URL 就会填一个没验证过的）。
       只记 hit + 页面标题当证据，conf 保持 unknown，再让 libJudge 去补真实证据链。 */
    try{
      const autoHost = libHostOf(url);
      if(autoHost){
        libUpsert({ host:autoHost, origin:libOriginOf(url)||url, pageTitle:r.title||'', hit:true });
        Promise.resolve(libJudge(autoHost, url)).catch(()=>{});
      }
    }catch(e){}
  }

  function showRetryButton(){
    const btn=$('sourceRetryBtn');
    if(btn) btn.style.display = sourceFailedChapters.length ? '' : 'none';
  }

  async function retrySourceFailures(){
    if(sourceFetching || !sourceFailedChapters.length) return;
    const rule = selectedRule();
    if(!rule){ setFetchLog('缺少规则，请先在规则区填写并保存'); return; }
    /* 🟥 V4.3.47（R6-1）：同 fetchSourceAll —— 重试也是一次会在途很久的「抓完就载入」 */
    const loadGen = beginSourceLoad();
    sourceFetching = true;
    const retryList = sourceFailedChapters;
    $('sourceRetryBtn').textContent = PT('重试中…', 'Retrying…');
    setSourceProgress(0, retryList.length);
    setSourceProgressText('正在重试失败章节 0/'+retryList.length);
    let r = null;
    try{ r = api && api.sourceContents ? await api.sourceContents({ chapters: retryList, rule }) : null; }catch(e){ r = { ok:false, error:String(e && e.message || e) }; }
    sourceFetching = false;
    if(loadGen !== sourceLoadGen) return;      // 🟥 V4.3.47（R6-1）：本次重试已被新的一次抓取取代
    $('sourceRetryBtn').textContent = PT('重试失败章节', 'Retry failed chapters');
    if(r && r.ok){
      (r.contents || []).forEach(c=>{
        const item = retryList[c.idx];
        if(item) sourceSlots[item.index] = { title:c.title, content:c.content, failed: !!c.failed, url: c.url || item.url || '' };
      });
      sourceFailedChapters = r.failedChapters || [];
      const good = sourceSlots.filter(s => s && !s.failed);   // V4.3.33：同上，别把失败占位算成成功
      const fail = sourceSlots.length - good.length;
      /* V4.3.33：重试场景要报「本次成功几章」——good.length 是**全书累计**成功数，
         直接拿来当本次战果会把语义带偏（重试 1 章成功却显示"成功 300 章"）。 */
      const retriedOk = (r.contents || []).filter(c => c && !c.failed).length;
      setSourceProgress(1,1);
      setSourceProgressText('重试完成：本次成功 '+retriedOk+' 章，全书仍失败 '+fail+' 章');
      setFetchLog(fail ? ('仍有 '+fail+' 章失败，可继续重试') : '全部章节抓取完成');
      if(good.length){ send('load-book', { title: sourceTitle || '书源书籍', chapters: good, rule, url: $('sourceBookUrl').value.trim(), loadGen }); }
      showRetryButton();
    } else {
      setFetchLog('重试失败：'+((r && r.error) || '未知错误'));
      setSourceProgressText('');
    }
  }

  function initSource(){
    $('sourceRuleSelect').addEventListener('change', fillSourceForm);
    $('sourceSaveBtn').addEventListener('click', async ()=>{
      const rule = buildRuleFromForm();
      if(!rule){ setRuleLog('请填写：名称、章节选择器、正文选择器'); return; }
      const r = api && api.sourceAddRule ? await api.sourceAddRule(rule) : null;
      if(r && r.ok){ sourceRules = r.rules || []; refreshSourceRules(); setRuleLog('规则保存成功：'+rule.name); srcHistRecordFromRule(rule); }
      else setRuleLog((r && r.error) || '规则保存失败');
    });
    $('sourceDeleteBtn').addEventListener('click', async ()=>{
      const idx = Number($('sourceRuleSelect').value);
      const r = sourceRules[idx];
      if(!r){ setRuleLog('没有可删除的规则'); return; }
      const res = api && api.sourceRemoveRule ? await api.sourceRemoveRule(r.name) : null;
      if(res && res.ok){ sourceRules = res.rules || []; refreshSourceRules(0); setRuleLog('已删除规则：'+r.name); }
      // V4.3.33：原先这里只念「删除失败」，把主进程返回的具体原因（写盘失败等）丢掉了 —— 与保存/导入两条路径不一致
      else setRuleLog((res && res.error) || '删除失败');
    });
    $('sourceImportBtn').addEventListener('click', async ()=>{
      if(!api || !api.openTextFile){ setRuleLog('当前环境不支持文件导入'); return; }
      const f = await api.openTextFile({ title:'导入书源规则', filters:[{ name:'JSON', extensions:['json'] }] });
      if(!f || f.canceled) return;
      if(f.error){ setRuleLog('规则导入失败：'+f.error); return; }
      try{
        const rule = JSON.parse(f.content);
        const res = api.sourceAddRule ? await api.sourceAddRule(rule) : null;
        if(res && res.ok){ sourceRules = res.rules || []; refreshSourceRules(); setRuleLog('规则导入成功：'+rule.name); }
        else setRuleLog((res && res.error) || '规则导入失败');
      }catch(e){ setRuleLog('规则导入失败：'+(e && e.message || e)); }
    });
    $('sourceFetchListBtn').addEventListener('click', fetchSourceList);
    /* 📑 V4.3.29：显式传页码，别把 click 事件当 page 传进去（以前靠 Number(event)=NaN 兜成第 1 页，太脆） */
    $('sourceSearchBtn').addEventListener('click', ()=>searchSourcePanel(1));
    $('sourceSearchInput').addEventListener('keydown', e=>{ if(e.key==='Enter') searchSourcePanel(1); });
    const npb = $('sourceNextPageBtn');
    if(npb) npb.addEventListener('click', ()=>searchSourcePanel(srcSearch.page + 1));
    const scb = $('sourceSearchCancelBtn');
    if(scb) scb.addEventListener('click', ()=>{
      if(!srcSearch.busy) return;
      srcSearch.cancelled = true;
      setSearchLog('正在取消…（请求已在途中，等它返回后结果会被丢弃）');
    });
    $('sourceBookUrl').addEventListener('keydown', e=>{ if(e.key==='Enter') fetchSourceList(); });
    $('sourceFetchAllBtn').addEventListener('click', fetchSourceAll);
    $('sourceRetryBtn').addEventListener('click', retrySourceFailures);
    $('sourceCancelBtn').addEventListener('click', ()=>{ if(api && api.sourceCancel) api.sourceCancel(); setFetchLog('已请求取消'); });
    /* 🆕 V4.3.85：进度按"谁在跑"分流 —— 自动抓取时进度要落在自动区那条上，
       否则用户在自动区看不到任何进展（手动区默认收在「高级」里，看不见）。 */
    if(api && api.onSourceProgress) api.onSourceProgress(p=>{
      if(!p) return;
      if(autoBusy){
        setAutoProgress(p.done, p.total);
        setAutoLog(PT('正在抓取正文 ', 'Fetching ') + p.done + '/' + p.total + (p.title ? ' · ' + p.title : ''));
        return;
      }
      setSourceProgress(p.done, p.total);
      setSourceProgressText('正在抓取正文 '+p.done+'/'+p.total+(p.title?' · '+p.title:''));
    });
    /* 🆕 V4.3.85 自动抓取入口（书源页的主按钮） */
    const autoBtn = $('autoFetchBtn'); if(autoBtn) autoBtn.addEventListener('click', autoFetchAll);
    const autoInput = $('autoUrl'); if(autoInput) autoInput.addEventListener('keydown', e=>{ if(e.key === 'Enter') autoFetchAll(); });
    const autoCancelBtn = $('autoCancelBtn');
    if(autoCancelBtn) autoCancelBtn.addEventListener('click', ()=>{ if(api && api.sourceCancel) api.sourceCancel(); setAutoLog(PT('已请求取消…', 'Cancelling…')); });
    /* 🆕 V4.3.85：「高级」折叠 —— 默认收起。只切 DOM 的 hidden，**不记状态**
       （见 panel.html 那段注释：持久化会让用户上次展开后忘了关，又变回"一屏选择器"）。 */
    const advBtn = $('advToggle');
    if(advBtn){
      const syncAdv = (open)=>{
        const body = $('advBody');
        if(body) body.hidden = !open;
        advBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      };
      advBtn.addEventListener('click', ()=> syncAdv(!!($('advBody') && $('advBody').hidden)));
      syncAdv(false);
    } else {
      /* 结构缺失必须出声：否则手动配置（规则/搜索/逐章抓取）永远摸不到，且没有任何提示 */
      reportPanelError('advToggle missing — 高级配置无法展开');
    }
    // 🆕 V4.3.24：试抓 / 从书库填搜索URL / 候选值（历史值）初始化
    const tBtn = $('sourceTestBtn'); if(tBtn) tBtn.addEventListener('click', testRulePanel);
    const libBtn = $('sourceFromLibBtn'); if(libBtn) libBtn.addEventListener('click', fillSearchUrlFromLib);
    fillSourceDatalists();
    fillLibSitesSelect();
    loadSourceRules();
  }
  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /* ===================== 📑 V4.3.29 书源搜索：翻页 / 去重 / 进度 / 取消 / 失败引导 =====================
     结果跨页累积在 srcSearch.results：
       · 主进程已做**页内**去重（main.js:normalizeBookUrl），这里按同一把尺子再做**跨页**去重
         —— 翻页时站点常把上一页的重复一遍，不去重用户会看到一堆同名条目；
       · 模板里没有 {page} 就不给「下一页」：不给点不动的假按钮，并说明原因；
       · 搜索是单次请求，**没有真实百分比**，所以进度按「第几页 + 已用几秒 + 当前多少条」如实呈现，
         不编造假数字；
       · 取消是**软取消**：请求已在路上拦不回来，等它返回后丢弃结果，并如实说明（不假装已中断）。 */
  const srcSearch = { q:'', page:0, hasPage:false, results:[], seen:new Set(), busy:false, cancelled:false, timer:null, startedAt:0, lastGot:0 };
  const SRC_TRACKING_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','spm','ref','from'];
  function srcDedupeKey(rs){
    const u = String((rs && rs.url) || '');
    try{
      const o = new URL(u);
      o.hash = '';
      SRC_TRACKING_PARAMS.forEach(p=>{ try{ o.searchParams.delete(p); }catch(e){} });
      let s = o.href; if(s.endsWith('/')) s = s.slice(0,-1);
      return s.toLowerCase();
    }catch(e){ return u.trim().toLowerCase(); }
  }
  function srcMerge(list){
    let dupes = 0;
    (list||[]).forEach(rs=>{
      const k = srcDedupeKey(rs);
      if(!k) return;
      if(srcSearch.seen.has(k)){ dupes++; return; }
      srcSearch.seen.add(k);
      srcSearch.results.push(rs);
    });
    return dupes;
  }
  function srcUpdateCount(){
    const el = $('sourceSearchCount');
    if(el) el.textContent = srcSearch.results.length ? (PT('共 ', '')+srcSearch.results.length+PT(' 条 · 第 ', ' items · page ')+srcSearch.page+PT(' 页', '')) : '';
  }
  function srcSyncNextBtn(){
    const b = $('sourceNextPageBtn');
    if(!b) return;
    // 只在「模板支持翻页 + 上一页确实有结果 + 当前没在搜」时出现
    const show = srcSearch.hasPage && !srcSearch.busy && srcSearch.lastGot > 0;
    b.style.display = show ? '' : 'none';
    b.disabled = !show;
  }
  function srcBusy(on){
    srcSearch.busy = !!on;
    const btn=$('sourceSearchBtn'), cancel=$('sourceSearchCancelBtn'), bar=$('sourceSearchProgressBar');
    if(btn) btn.disabled = !!on;
    if(cancel){ cancel.style.display = on ? '' : 'none'; cancel.disabled = !on; }
    if(bar) bar.style.display = on ? '' : 'none';
    srcSyncNextBtn();
    if(on){
      srcSearch.startedAt = Date.now();
      if(srcSearch.timer) clearInterval(srcSearch.timer);
      const tick = ()=>setSearchLog('正在搜索「'+srcSearch.q+'」… 第 '+srcSearch.page+' 页（已用 '
        + Math.round((Date.now()-srcSearch.startedAt)/1000) + 's，当前 '+srcSearch.results.length+' 条）');
      tick();
      srcSearch.timer = setInterval(tick, 1000);
    } else if(srcSearch.timer){ clearInterval(srcSearch.timer); srcSearch.timer = null; }
  }
  /* 🆘 失败引导：把「一句看不懂的报错」翻成「下一步该干嘛」。
     用户要的是能动的建议，不是把 err.message 再念一遍。 */
  function srcAdvise(err){
    const e = String(err || '未知错误');
    let tip = '';
    if(/超时|timed\s*out|ETIMEDOUT/i.test(e)) tip = '连不上或太慢：先看网络，再看这个站是不是需要代理；别把规则里的「请求间隔」调到 0。';
    else if(/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(e)) tip = '域名解析失败：网址多半写错了，或者这个站已经换域名了。';
    else if(/HTTP 40[13]|HTTP 429/.test(e)) tip = '站点拒绝访问（403/429 常见于反爬）：换一个书源，或过一会儿再试。';
    else if(/HTTP 404/.test(e)) tip = '页面不存在（404）：检查「搜索URL」模板，确认 {kw} 放对了位置。';
    else if(/HTTP 5\d\d/.test(e)) tip = '站点自己报错（5xx）：不是你的问题，稍后再试。';
    else if(/ECONNRESET|ECONNREFUSED|socket hang/i.test(e)) tip = '连接被掐断：换个网络或稍后再来。';
    else if(/响应过大/.test(e)) tip = '页面太大被中止了：多半被跳去下载页/图片页了，检查「搜索URL」模板。';
    else if(/编码|解码|乱码|iconv|encoding/i.test(e)) tip = '编码不对：把规则里的「编码」改成站点实际用的（中文站常见 gb18030 / utf-8）。';
    else if(/未匹配到搜索结果|选择器/.test(e)) tip = '选择器没匹配上：点上面的「🧪 试抓（验证选择器）」去校准「结果选择器 / 标题选择器」。';
    else if(/证书|certificate|SSL/i.test(e)) tip = '证书校验失败：站点证书有问题，试试把 https 换成 http，或换个书源。';
    else tip = '先照原错误排查；搞不清就点「🧪 试抓（验证选择器）」，它会把抓到的页面结构摊开给你看。';
    return '搜索失败：' + e + (tip ? ('\n👉 ' + tip) : '');
  }
  async function searchSourcePanel(page){
    const pageNo = Math.max(1, Number(page) || 1);
    if(srcSearch.busy) return;
    if(pageNo === 1){
      const q = (($('sourceSearchInput') && $('sourceSearchInput').value) || '').trim();
      if(!q){ setSearchLog('请输入搜索关键词'); return; }
      srcSearch.q = q; srcSearch.page = 0; srcSearch.results = []; srcSearch.seen = new Set();
      srcSearch.hasPage = false; srcSearch.cancelled = false; srcSearch.lastGot = 0;
      srcUpdateCount();
    }
    const rule = selectedRule();
    if(!rule || !rule.search || !rule.search.urlTemplate){ setSearchLog('当前规则缺少搜索模板（搜索URL）'); return; }
    srcSearch.page = pageNo;
    srcBusy(true);
    const box=$('sourceSearchResults');
    if(pageNo === 1) box.innerHTML='<div class="empty">搜索中…</div>';
    let r=null;
    try{ r = api && api.sourceSearch ? await api.sourceSearch({ query:srcSearch.q, rule, page:pageNo }) : null; }catch(e){ r={ok:false,error:String(e&&e.message||e)}; }
    srcBusy(false);
    if(srcSearch.cancelled){
      srcSearch.cancelled = false;
      srcSearch.page = Math.max(1, pageNo - 1);
      srcSearch.lastGot = 0;
      renderSearchResults(srcSearch.results);
      srcUpdateCount(); srcSyncNextBtn();
      setSearchLog('已取消：请求已在途中拦不回来，返回的结果已丢弃 · 当前保留 '+srcSearch.results.length+' 条');
      return;
    }
    if(r && r.ok){
      const got = (r.results||[]).length;
      srcSearch.lastGot = got;
      const crossDupes = srcMerge(r.results||[]);
      srcSearch.hasPage = !!r.hasPage;
      renderSearchResults(srcSearch.results);
      srcUpdateCount(); srcSyncNextBtn();
      let msg = '第 '+pageNo+' 页：拿到 '+got+' 条';
      if(r.dupes) msg += '（页内去掉重复 '+r.dupes+' 条）';
      if(crossDupes) msg += '，与前面重复 '+crossDupes+' 条已合并';
      msg += ' · 累计 '+srcSearch.results.length+' 条';
      if(!srcSearch.hasPage) msg += ' ｜ 这个规则的「搜索URL」没写 {page}，所以只有一页';
      else if(got === 0) msg += ' ｜ 这一页没有结果，应该没有更多了';
      setSearchLog(msg);
      if(srcSearch.results.length) libRecordSearch(rule, srcSearch.results);
    } else {
      if(pageNo === 1){
        box.innerHTML='<div class="empty">'+escapeHtml((r&&r.error)||'搜索失败')+'</div>';
        srcSearch.results = []; srcSearch.seen = new Set(); srcUpdateCount();
      }
      setSearchLog(srcAdvise((r&&r.error)||'未知错误'));
      srcSyncNextBtn();
    }
  }

  function renderSearchResults(results){
    const box=$('sourceSearchResults'); box.innerHTML='';
    if(!results.length){ box.innerHTML='<div class="empty">无结果</div>'; return; }
    results.forEach(rs=>{
      const d=document.createElement('div'); d.className='item';
      const t=document.createElement('div'); t.className='t'; t.textContent=rs.title||PT('未命名', 'Untitled');
      const s=document.createElement('div'); s.className='s'; s.textContent=(rs.author?(PT('作者：', 'Author: ')+rs.author+' · '):'')+(rs.url||'');
      d.appendChild(t); d.appendChild(s);
      d.addEventListener('click', ()=>openSearchResult(rs));
      box.appendChild(d);
    });
  }

  async function openSearchResult(rs){
    /* 🟥 V4.3.44（R3-2）：令牌在**发起时**取（解析要等网络，几十毫秒到几秒不等），
       返回后复检：期间用户又点了别的结果，本次作废，绝不覆盖新结果。 */
    const token = ++sourceOpenToken;
    const rule = selectedRule();
    if(!rule){ setFetchLog('缺少规则，请先在规则区填写并保存'); return; }
    $('sourceBookUrl').value = rs.url || '';
    setFetchLog('正在解析该书章节…');
    let r=null;
    try{ r = api && api.sourceChapters ? await api.sourceChapters({ url: rs.url, rule }) : null; }catch(e){ r={ok:false,error:String(e&&e.message||e)}; }
    if(token !== sourceOpenToken) return;
    if(r && r.ok){
      sourceChapters = r.chapters || [];
      sourceTitle = r.title || rs.title || '';
      renderSourceList();
      setFetchLog('解析到 '+sourceChapters.length+' 章，可点击「抓取正文并载入」');
    } else {
      setFetchLog('章节解析失败：'+((r&&r.error)||'未知错误'));
    }
  }

  let shelfBooks = [];
  /* 🆕 V4.3.57（需求三批 1）：书架排序口径 —— 最近在读 / 按进度 / 按添加时间。
     排序是**显示层**的事：主窗只负责把字段送齐（lastReadAt / addedAt / currentIndex / chapterCount），
     这里按用户选的列重排，不改任何落盘数据。 */
  let shelfSortMode = 'recent';
  const jumpIdx = {};   // 多来源 ↗ 轮询指针（bookId -> 下一次要打开的序号）
  let selectedShelf = new Set();
  /* 🛡 V4.3.83：删书两段式确认的状态（面板不许弹 confirm，见删书按钮处注释） */
  let pendingDelId = null, pendingDelTimer = null;

  function shelfProgress(b){
    const ci = Number(b && b.currentIndex), cc = Number(b && b.chapterCount);
    if(!cc || !Number.isFinite(cc)) return 0;
    const v = Math.round(((Number.isFinite(ci) ? ci : 0) + 1) / cc * 100);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
  }
  function shelfStamp(b){ return String((b && (b.lastReadAt || b.updatedAt)) || ''); }
  function sortedShelf(){
    const list = shelfBooks.slice();
    if(shelfSortMode === 'progress') list.sort((a,b)=> shelfProgress(b) - shelfProgress(a));
    else if(shelfSortMode === 'added') list.sort((a,b)=> String((b && b.addedAt) || '').localeCompare(String((a && a.addedAt) || '')));
    else list.sort((a,b)=> shelfStamp(b).localeCompare(shelfStamp(a)));
    return list;
  }

  /* 🆕 V4.3.57：顶部「继续阅读」卡片 —— 关掉应用再打开，一键回到上次那本书。
     选的是 lastReadAt 最新的那本（缺失时退回 updatedAt）；没有书就整块不渲染，不占地方。 */
  function renderShelfContinue(){
    const box = $('shelfContinue'); if(!box) return;
    box.innerHTML = '';
    if(!shelfBooks.length) return;
    const recent = shelfBooks.slice().sort((a,b)=> shelfStamp(b).localeCompare(shelfStamp(a)))[0];
    if(!recent) return;
    const card = document.createElement('div'); card.className = 'shelf-continue';
    if(recent.cover){ const im = document.createElement('img'); im.className = 'cv'; im.src = recent.cover; im.alt = ''; card.appendChild(im); }
    const info = document.createElement('div'); info.className = 'info';
    const t = document.createElement('div'); t.className = 't'; t.textContent = recent.title || PT('未命名', 'Untitled');
    const s = document.createElement('div'); s.className = 's';
    const pct = shelfProgress(recent);
    s.textContent = PT('上次读到 ', 'Last read ') + pct + '% · ' + (recent.chapterCount || 0) + PT(' 章', ' ch');
    const btn = document.createElement('button'); btn.className = 'go'; btn.textContent = PT('继续阅读', 'Continue');
    btn.title = PT('回到上次读到的位置', 'Jump back to where you left off');
    btn.addEventListener('click', ()=> send('open', { id: recent.id }));
    info.appendChild(t); info.appendChild(s);
    card.appendChild(info); card.appendChild(btn);
    box.appendChild(card);
  }

  function renderShelf(books){
    shelfBooks = books || [];
    const box=$('shelfList'); if(!box) return;
    box.innerHTML='';
    renderShelfContinue();
    /* 🟥 V4.3.96（清待办时的视觉复核发现）：空书架时「全选/全不选」「导出选中」还亮着，
       点下去什么都不发生 —— 典型的**死控件**。这里跟着空/非空切 disabled，
       并且**只禁用这两个**（「导入书架」在空书架时恰恰最该能点）。
       ⚠️ 改的是分片源 panel-src/40-…，scripts/panel.js 是生成物，手改会被下次 build 冲掉。 */
    const shelfEmpty = !shelfBooks.length;
    /* 🟥 V4.3.97（代码审查 R-15）：V4.3.96 只禁了两个，漏了「检查更新」——
       空书架上点它 → `checkUpdate {ids:[]}` → 面板显示"没有发现新章节"，看着像真检查过。 */
    ['shelfSelectAllBtn', 'shelfExportBtn', 'shelfUpdateBtn'].forEach(function(id){
      const b = $(id); if (!b) return;
      b.disabled = shelfEmpty;      /* 只切可用性，不新增文案（i18n 真源在 i18n-literals.js） */
    });
    /* 🟥 V4.3.97（代码审查 R-9）：`selectedShelf` 是纯累加集合，从不清洗已消失的 id。
       删掉一本已勾选的书后，`size` 永远大于当前列表长度 ——
       于是「全选/全不选」判 `size === length` 永远不成立，再也切不回"全不选"，
       而「导出选中」还会把已删 id 一起带去（提示"正在导出 4 本"实际 3 本）。
       每次渲染按当前列表过滤一次，成本 O(n)，n 是书架本数。 */
    if(selectedShelf && selectedShelf.size){
      const alive = new Set(shelfBooks.map(function(b){ return b.id; }));
      Array.from(selectedShelf).forEach(function(id){ if(!alive.has(id)) selectedShelf.delete(id); });
    }
    if(shelfEmpty){ box.innerHTML='<div class="empty">书架为空。从书源抓取或打开本地文件后会自动加入书架。</div>'; return; }
    sortedShelf().forEach(b=>{
      const div=document.createElement('div'); div.className='item shelf-item has-check';
      /* V4.3.33 修：原来只防了 chapterCount 为 0，没防 currentIndex 缺失 ——
         Number(undefined) 是 NaN，整式算出 NaN，卡片上直接显示「NaN%」。
         这里补上有限性判断，并夹到 0~100（currentIndex 可能大于 chapterCount）。 */
      const ci = Number(b.currentIndex);
      const pctRaw = b.chapterCount ? Math.round(((Number.isFinite(ci) ? ci : 0) + 1) / b.chapterCount * 100) : 0;
      const progress = Number.isFinite(pctRaw) ? Math.max(0, Math.min(100, pctRaw)) : 0;
      const t=document.createElement('div'); t.className='t'; t.textContent=(b.isActive?'▶ ':'')+(b.title||PT('未命名', 'Untitled'));
      /* 🆕 V4.3.57：副标题带上**来源类型与格式** —— 本地书以前和书源书长得一模一样，
         用户分不出"这本是我硬盘上的"还是"这本是抓来的"。 */
      const kindLabel = (b.kind === 'local') ? PT('本地', 'Local') : (b.sourceName || PT('书源', 'Source'));
      const fmtLabel = b.format ? (' · ' + String(b.format).toUpperCase()) : '';
      const s=document.createElement('div'); s.className='s'; s.textContent=kindLabel+fmtLabel+' · '+(b.chapterCount||0)+PT(' 章 · ', ' ch · ')+progress+'%';
      const check=document.createElement('input'); check.type='checkbox'; check.className='shelf-check'; check.checked=selectedShelf.has(b.id);
      check.addEventListener('click', e=>{ e.stopPropagation(); if(check.checked) selectedShelf.add(b.id); else selectedShelf.delete(b.id); });
      /* 🆕 V4.3.57：卡片头 = 封面 + 标题/副标题（横向），动作区仍在下方 —— 布局仍是 column，
         smoke3 的「三张动作卡等宽不重叠」判据不受影响。 */
      const head=document.createElement('div'); head.className='shelf-head';
      if(b.cover){ const im=document.createElement('img'); im.className='shelf-cv'; im.src=b.cover; im.alt=''; head.appendChild(im); }
      const txt=document.createElement('div'); txt.className='shelf-txt';
      txt.appendChild(t); txt.appendChild(s);
      head.appendChild(txt);
      div.appendChild(head);
      div.appendChild(check);
      // 🛠 换源 / 补录来源（V4.3.9）：⇄ 弹窗填新网址，保存为主源并加进多源列表
      /* 🟥 V4.3.21 修复「书架按钮重叠」：换源 ⇄ / 打开来源 ↗ / 删除 ✕ 原先都挂 .shelf-del，
         而该 class 是 position:absolute; right:8px —— 三个全被钉在同一个点上叠成一团。
         🟥 V4.3.23（用户要求）：三张按钮**一律都在**，做成卡片（图标 + 文字，各占等宽），
         不再"有时有、有时没有"（原来 ↗ 只在书有来源网址时才渲染，看起来就像按钮丢了）。
         没有来源网址时那张卡置灰，并把原因写在悬停说明里 —— 看得见、点得着、说清为什么。 */
      const acts=document.createElement('div'); acts.className='shelf-acts';
      const mkAct=(icon,label,title,onClick)=>{
        const b=document.createElement('span'); b.className='shelf-actcard';
        /* 🎨 V4.3.63：`icon` 从"emoji 字符"改成"图标名"—— 由 `ico()` 渲染成和静态按钮
           同一套线条 SVG（`<svg class="ico ic" data-ico="…">`）。
           ⚠️ 传入的是图标**名**，不是字符；调用点见下面四个 mkAct。 */
        const ic=document.createElement('span'); ic.className='ic'; ic.innerHTML=ico(icon);
        const lb=document.createElement('span'); lb.className='tx'; lb.textContent=label;
        b.appendChild(ic); b.appendChild(lb);
        if(title) b.title=title;
        if(!onClick){ b.classList.add('off'); }
        else b.addEventListener('click', e=>{ e.stopPropagation(); onClick(e); });
        acts.appendChild(b);
        return b;
      };
      mkAct('rss', PT('换源','Re-source'), PT('换源 / 补录来源网页','Re-source / record the source page'), ()=>send('setSource', {id:b.id}));
      const urls=(b.sourceUrls && b.sourceUrls.length)?b.sourceUrls:(b.sourceUrl?[b.sourceUrl]:[]);
      if(!jumpIdx[b.id]) jumpIdx[b.id]=0;
      /* 🆕 V4.3.67（批 1 收尾·方案 2）：本地书没有来源网址时，第 2 张卡原本是**永远置灰的「来源」**
         —— 一个点了没用的死按钮。换成「重绑」：重新选一次本地文件，用新内容替换这本书，
         **进度与书签保留**（文件更新后不用删掉重加）。不多出第 5 张卡，布局与 smoke3 的
         "4 张等宽"判据都不受影响；本地书**确实补录过来源网址**时仍显示「来源」，不藏能用的功能。 */
      const canRebind=(b.kind==='local') && !urls.length;
      if(canRebind){
        mkAct('folder-open', PT('重绑','Rebind'),
          PT('重新选择本地文件：用新文件的内容替换这本书，进度与书签都会保留（文件更新后不用删掉重加）',
             'Pick the local file again: replaces this book\'s content, keeping progress and bookmarks (no need to delete and re-add)'),
          ()=>send('rebind', {id:b.id}));
      }
      const srcBtn=canRebind ? null : mkAct('window', PT('来源','Source'),
        urls.length ? ('打开来源网页'+(urls.length>1?'（共 '+urls.length+' 个，每点一次换下一个）：\n'+urls.join('\n'):'')) : '这本书没有记录来源网址（本地文件 / 手动导入的书籍没有来源页）',
        urls.length ? (()=>{
          const i=jumpIdx[b.id]%urls.length;
          send('openSource', {id:b.id, url:urls[i]});
          jumpIdx[b.id]=i+1;
          srcBtn.querySelector('.tx').textContent=PT('来源 ', 'Source ')+(jumpIdx[b.id]%urls.length+1)+'/'+urls.length;
        }) : null);
      if(srcBtn && urls.length>1) srcBtn.querySelector('.tx').textContent=PT('来源 1/', 'Source 1/')+urls.length;
      /* 🛡 V4.3.83 审查修复：删书原先**点击即发 delete、零确认** —— 而 delete 会连正文一起删
         （不可撤销，只有自动备份能救）。这是面板上唯一没有二次确认的破坏性操作。
         ⚠️ 用**两段式点击**而不是阻塞式确认弹窗：项目铁律「面板不许弹确认框」（smoke3 有断言盯着
         面板脚本里出现该函数调用），删书签走的就是内联撤销/二次确认这条路。 */
      const delBtn = mkAct('trash', PT('删除','Remove'), PT('删除这本书（含正文，不可撤销）','Delete this book (text included, cannot be undone)'), ()=>{
        const name = String(b.title || b.name || '').trim() || PT('这本书','this book');
        const lb = delBtn && delBtn.querySelector('.tx');
        if(pendingDelId === b.id){                    // 第二段：真删
          clearTimeout(pendingDelTimer);
          pendingDelId = null; pendingDelTimer = null;
          if(lb) lb.textContent = PT('删除','Remove');
          send('delete', {id:b.id});
          return;
        }
        pendingDelId = b.id;                           // 第一段：进入待确认（3 秒自动复位）
        if(lb) lb.textContent = PT('再点一次','Click again');
        setShelfLog(PT('再点一次「删除」确认删除《' + name + '》（正文与进度会一并删除，不可撤销）',
                       'Click "Delete" again to confirm removing "' + name + '" (text and progress will be deleted)'));
        clearTimeout(pendingDelTimer);
        pendingDelTimer = setTimeout(()=>{
          pendingDelId = null; pendingDelTimer = null;
          if(lb) lb.textContent = PT('删除','Remove');
        }, 3000);
      });
      // 🆕 目录：打开这本书并弹出目录面板（位于卡片右侧动作区最末）；先 open 确保章节已载入，再开 toc 面板
      mkAct('list', PT('目录','Contents'), PT('打开这本书的目录','Open this book\'s table of contents'), ()=>{ send('open', {id:b.id}); if(window.readerAPI && window.readerAPI.openPanel) window.readerAPI.openPanel('toc'); });
      div.appendChild(acts);
      div.addEventListener('click', ()=>send('open', {id:b.id}));
      box.appendChild(div);
    });
  }
  function setShelfLog(msg){
    const el=$('shelfLog'); if(el) el.textContent = msg || '';
    // 同步写进主进程日志：书架窗口的提示以前在日志里完全看不到，
    // 出问题时无法判断流程走到哪一步（正常也留痕，量很小）
    try{ if(api && api.logError) api.logError('shelf: ' + (msg || '(清空)')); }catch(e){}
  }

  async function downloadShelfExport(data){
    if(!data) return;
    const text = JSON.stringify(data, null, 2);
    const fileName = '浅水鲸书架_' + Util.localDateKey() + '.json';
    if(api && api.saveTextFile){
      const r = await api.saveTextFile({ title:'导出书架', defaultPath:fileName, filters:[{ name:'JSON', extensions:['json'] }], content:text });
      if(r && r.canceled){ setShelfLog('已取消导出'); return; }
      if(!r || r.error){ setShelfLog('导出失败：'+((r && r.error) || '未知错误')); return; }
      setShelfLog('已导出 ' + (data.count || 0) + ' 本到 ' + r.path);
      return;
    }
    const blob = new Blob([text], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  function initShelf(){
    const allBtn=$('shelfSelectAllBtn');
    const exportBtn=$('shelfExportBtn');
    const importBtn=$('shelfImportBtn');
    /* 🆕 V4.3.57：排序下拉 —— 只重排当前已收到的列表，不重新拉数据（切排序不该有网络/DB 往返） */
    const sortSel=$('shelfSort');
    if(sortSel){
      sortSel.value = shelfSortMode;
      sortSel.addEventListener('change', ()=>{ shelfSortMode = sortSel.value || 'recent'; renderShelf(shelfBooks); });
    }
    if(allBtn) allBtn.addEventListener('click', ()=>{
      if(selectedShelf.size && selectedShelf.size === shelfBooks.length){ selectedShelf.clear(); }
      else { shelfBooks.forEach(b=>selectedShelf.add(b.id)); }
      renderShelf(shelfBooks);
    });
    if(exportBtn) exportBtn.addEventListener('click', ()=>{
      const ids = Array.from(selectedShelf);
      send('export', { ids });
      setShelfLog(ids.length ? ('正在导出 '+ids.length+' 本…') : '正在导出全部书架…');
    });
    const updateBtn=$('shelfUpdateBtn');
    if(updateBtn) updateBtn.addEventListener('click', ()=>{
      const ids = Array.from(selectedShelf);
      send('checkUpdate', { ids });
      setShelfLog(ids.length ? ('正在检查 '+ids.length+' 本的更新…') : '正在检查全部书籍的更新…');
    });
    if(importBtn) importBtn.addEventListener('click', async ()=>{
      // 整段都包在 try 里：以前 await openTextFile() 一旦抛异常就没人接，
      // 表现是「选完文件之后书架一点反应都没有」，连一句提示都不给，完全没法排查。
      reportPanelError('导入按钮被点击');
      try{
        if(!api || !api.openTextFile){ setShelfLog('当前环境不支持文件导入'); return; }
        setShelfLog('正在打开文件…');
        const f = await api.openTextFile({ title:'导入书架', filters:[{ name:'JSON', extensions:['json'] }] });
        if(!f){ setShelfLog('导入失败：读取文件没有返回结果（可能文件过大或没有读取权限）'); return; }
        if(f.canceled){ setShelfLog('已取消导入'); return; }
        if(f.error){ setShelfLog('导入失败：'+f.error); return; }
        if(!f.content){ setShelfLog('导入失败：文件内容是空的'); return; }
        setShelfLog('正在解析 ' + (f.name || '文件') + '…');
        let data;
        try{ data = JSON.parse(f.content); }
        catch(err){ setShelfLog('导入失败：不是有效的 JSON（'+(err && err.message || err)+'）'); return; }
        const n = (data && Array.isArray(data.books)) ? data.books.length : 0;
        /* 🟥 V4.3.72：n 为 0 时原先照样先打一句「正在导入 0 本书，请稍候…」，紧接着又报失败 ——
           两行互相矛盾，用户会以为软件数错了。这里只在真有书时才说"正在导入"；
           0 本仍照常交给主窗判定（它会给「这是阅读数据备份，请去设置里导入」这类**具体**指引，
           在这里提前 return 会把那条最有用的提示吃掉）。 */
        if(n) setShelfLog('正在导入 ' + n + ' 本书，请稍候…');
        send('import', { data });
      }catch(e){
        setShelfLog('导入失败：'+(e && (e.message || String(e))));
      }
    });
  }

  function onUpdate(p){
    if(!p) return;
    if(p.theme) applyTheme(p.theme);
    if(type==='toolbar') updateToolbar(p);
    else if(type==='settings') updateSettings(p);
    else if(type==='toc'){ if(p.chapters !== undefined) renderTOC(p.chapters, p.current); else if(p.current !== undefined) renderTOC(currentChapters, p.current); }
    else if(type==='search'){ renderSearch(p); if(p.sourceEvent==='loaded') libLog('已载入《' + (p.title||'') + '》：' + (p.chapterCount||0) + ' 章，可在阅读器里看'); else if(p.sourceEvent==='loadAborted') libLog(PT('已作废这次载入：抓取期间阅读器里清空过内容或换过书，为免把过期的那本装回来，本次未载入（可重新点一次）','Load cancelled: the reader was cleared or another book was opened while fetching, so this outdated book was not installed (click again to retry)'), true); }
    // 📑 V4.3.29 书签列表：bookmarks 到位就重画（首帧靠主窗 onPanelReady 补发）
    else if(type==='bookmarks'){ if(p.bookmarks !== undefined) renderBookmarkList(p); }
    /* 🖍 V4.3.71 批注列表：annotations 到位就重画（首帧靠主窗 onPanelReady 补发） */
    else if(type==='annot'){ if(p.annotations !== undefined) renderAnnotList(p); }
    else if(type==='shelf'){
      if(p.books) renderShelf(p.books);
      if(p.shelfExport) downloadShelfExport(p.shelfExport);
      /* V4.3.37：把「跳过 / 失败」也说出来。上轮给 importShelfBooks 加了这两个计数，
         但两个调用方都没显示 —— 用户看不到，甚至会被"导入成功，共 0 本"误导。 */
      if(p.shelfImport){
        const si = p.shelfImport;
        if(!si.ok) setShelfLog('导入失败：' + (si.error || '未知错误'));
        else if(si.count === 0 && (si.failed || si.skipped)) setShelfLog('没有新增：跳过 ' + (si.skipped||0) + ' 本，失败 ' + (si.failed||0) + ' 本');
        else setShelfLog('导入成功，共 ' + si.count + ' 本' + ((si.skipped||si.failed) ? ('（跳过 ' + (si.skipped||0) + '，失败 ' + (si.failed||0) + '）') : ''));
      }
      if(p.shelfUpdate) setShelfLog(describeUpdate(p.shelfUpdate));
    }
    else if(type==='source' && p && p.sourceEvent==='loaded'){
      setSourceProgressText('载入完成：'+(p.chapterCount||0)+' 章已加入阅读器');
      setFetchLog('已载入书架，可继续搜索或点 ✕ 关闭');
    }
    else if(type==='source' && p && p.sourceEvent==='loadAborted'){
      setSourceProgress(0, 0);
      setSourceProgressText(PT('已作废这次载入','Load cancelled'));
      setFetchLog(PT('抓取期间阅读器里清空过内容或换过书，为免把过期的那本装回来，本次未载入（可重新点一次「抓取正文并载入」）','The reader was cleared or another book was opened while fetching, so this outdated book was not installed (click again to retry)'), true);
    }
  }

  function describeUpdate(res){
    if(!res) return '';
    if(res.busy) return '正在检查更新…';
    const lines = [];
    lines.push(res.totalNew ? ('共更新 '+res.totalNew+' 章') : '没有发现新章节');
    (res.report || []).forEach(item => {
      if(item.skipped) lines.push('· ' + item.title + '：缺少书源信息，跳过（书架里点 ↗ 可直达来源网页）');
      else if(item.error) lines.push('· ' + item.title + '：' + item.error);
      else if(item.added) lines.push('· ' + item.title + '：新增 ' + item.added + ' 章');
      else lines.push('· ' + item.title + '：已是最新');
    });
    return lines.join('\n');
  }

  let currentChapters = [];

  // 初始化
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
  const view = $('view-'+type);
  if(view) view.classList.add('on');

  // 通用：关闭按钮
  document.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click', ()=>send('close')));

  /* 🟥 V4.3.17 根因修复：伪装皮肤下拉的 change 绑定**不能挂在按 type 分派的 init* 里**。
     V4.2.6 把下拉从「设置」搬进「工具栏」时只搬了 DOM、没搬事件注册，change 一直留在
     initSettings() 里；而打开工具栏面板时走的是 initToolbar()、initSettings() 根本不执行
     → 下拉看着能选（select 自己会变），但事件无人接收 → 主窗 state.disguiseSkin 不变
     → 1.5s 后定时器 syncToolbarPanel() 把 'word' 推回面板，表现为
     「切换皮肤后一两秒自己变回办公文档」。这里放在与 type 无关的通用区，以后视图再搬也不会断。
     （panel.html 所有 view 在同一个文件里，#disguiseSkinSelect 始终存在于 DOM，故此处可安全绑定。） */
  /* 🧹 V4.3.86（用户：“设置里很多功能都有更便捷的打开方式，看看是否需要统一收缩优化精简”）
     设置面板有 10 个分组，一屏拉下来很长，而其中一半一年也点不到一次（修改快捷键、导入导出数据、看日志…）。
     这里把“维护/一次性”分组默认收起，常用的（外观 / 朗读）保持展开。
     🛥 只加 class、不动 DOM：收起只是 display:none，所有控件仍在（门禁与探针照样能找到它们）。 */
  /* 📚 V4.3.86（用户：“将书源跟全文搜索合并进书架”）：
     书架 / 搜索 / 书源 三个视图共用**同一个面板窗**，顶部用 tab 切。
     🛥 只切 `.view.on`，不搬 DOM 也不删视图 —— 所有控件与已有绑定原封不动；
     切过去时要通知主窗补数据（否则搜索 tab 会是空的）。 */
  (function setupViewTabs(){
    const bars = document.querySelectorAll('.vtab-bar');
    if(!bars.length) return;
    /* 🛥 V4.3.86：**不能**多占一行。面板窗高度固定，
       第一版把 tab 放在 head 下面→书架列表少一行→
       smoke3 报「第3本书有动作卡点不到（被遮挡）」。
       现在直接把 tab 栏搬进已有的标题栏（隐藏原标题文字），高度为 0。 */
    bars.forEach(function(bar){
      const view = bar.closest ? bar.closest('.view') : null;
      const head = view && view.querySelector('.head');
      if(!head) return;
      const hm = head.querySelector('.head-main');
      if(hm) hm.style.display = 'none';
      const x = head.querySelector('.x');
      head.insertBefore(bar, x || null);
    });
    function apply(name){
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));
      const v = $('view-'+name); if(v) v.classList.add('on');
      document.querySelectorAll('.vtab').forEach(b=>b.classList.toggle('on', b.getAttribute('data-vtab')===name));
      send('viewTab', name);            // 让主窗把该视图的数据补上
    }
    document.querySelectorAll('.vtab').forEach(function(b){
      b.addEventListener('click', function(){ apply(b.getAttribute('data-vtab')); });
    });
    const init = (type==='search' || type==='source' || type==='shelf') ? type : 'shelf';
    document.querySelectorAll('.vtab').forEach(b=>b.classList.toggle('on', b.getAttribute('data-vtab')===init));
  })();

  (function setupSettingsFolds(){
    const FOLD = ['快捷键', '主题', '数据', '日志', '更新', '文件关联', '语言', '反馈'];
    document.querySelectorAll('#view-settings .body > .section').forEach(function(sec){
      const h = sec.querySelector('h3');
      if(!h) return;
      const key = h.getAttribute('data-i18n') || (h.textContent || '').trim();
      if(FOLD.indexOf(key) < 0) return;
      sec.classList.add('foldable');
      sec.classList.add('collapsed');            // 默认收起
      h.addEventListener('click', function(){ sec.classList.toggle('collapsed'); });
    });
  })();

  (function bindDisguiseSkinSelect(){
    const el = $('disguiseSkinSelect');
    if(el) el.addEventListener('change', e=>send('disguiseSkin', e.target.value));
  })();

  /* 🖍 V4.3.71：批注面板的按钮/过滤框。同样放在与 type 无关的通用区 ——
     这类"只在某个视图里出现"的控件，绑到按 type 分派的 init* 里最容易在搬视图时漏掉。 */
  (function bindAnnotControls(){
    const exp = $('annExportBtn');
    if(exp) exp.addEventListener('click', ()=>send('annotExport'));
    const f = $('annFilter');
    if(f) f.addEventListener('input', ()=>renderAnnotList({}));
    const c = $('annFilterClear');
    if(c) c.addEventListener('click', ()=>{ if(f){ f.value = ''; renderAnnotList({}); } });
  })();

  /* ================= 🆕 V4.3.23 书库 =================
