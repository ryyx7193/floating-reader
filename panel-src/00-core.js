(function(){
  const type = new URLSearchParams(location.search).get('type') || 'toolbar';
  /* 🎨 V4.3.63：动态按钮的图标助手。
     形状来自 `scripts/icons.js`（唯一真源），由 `_ico_gen.js` 生成 `scripts/icons-browser.js`
     注入 `window.ReaderIcons`。以前这些按钮只能写 emoji —— 静态按钮是线条 SVG、
     动态按钮是 emoji，同一屏两套视觉语言（V4.3.56 图标统一漏掉的一块）。
     🟥 拿不到 ReaderIcons 时**退回字符**而不是抛错：面板还要能用，不能因为图标挂了整片列表崩掉。 */
  const ico = (name, cls) => {
    try {
      if (window.ReaderIcons && window.ReaderIcons.svg) return window.ReaderIcons.svg(name, '', cls || 'ic');
    } catch (e) {}
    return '';
  };
  const api = window.readerAPI;
  const Util = window.ReaderUtil;   // 🟥 V4.3.45：本地面板也加载 util.js，本地日期等工具共用同一份
  const $ = id => document.getElementById(id);
  /* 🛡 V4.3.78：api 缺失不再静默 —— V4.3.62~76 绿色版缺 preload-panel.js 时这行判 false
     把一切面板动作无声丢弃，排查花了三轮。至少在 console 留一次响（每窗只喊一次）。 */
  let sendWarned = false;
  function send(action, value){
    if(api && api.panelAction) return api.panelAction({ type, action, value });
    if(!sendWarned){ sendWarned = true; console.error('[panel:'+type+'] readerAPI.panelAction 不可用 —— preload-panel.js 未加载？按钮动作将全部无效'); }
  }

  // ---------- 面板错误上报 ----------
  // 面板窗口原先没有任何错误监听：这里抛的异常只会躺在控制台里，
  // 用户看到的就是「点了没反应」。统一写进主进程日志，方便定位。
  function reportPanelError(msg){
    try{ if(api && api.logError) api.logError('panel[' + type + '] ' + msg); }catch(e){}
  }
  window.addEventListener('error', function(e){
    reportPanelError((e.message || 'error') + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function(e){
    const r = e.reason;
    reportPanelError('unhandledrejection: ' + (r && r.stack ? r.stack : String(r)));
  });

  // ---------- 面板多语言 ----------
  const PANEL_TEXT = {
    zh: {
      /* 🎨 V4.3.56：标题里的 emoji 全部去掉 —— 图标改由 `styles/icons.css` 的线条 SVG 承担
         （emoji 在 Windows 上是彩色位图字体，粗细/颜色都不受控，与描边图标并排就是两套语言）。
         图标是 `.title` 的**兄弟节点**，所以这里照旧只写文字，不会把图标冲掉。 */
      '#view-toolbar .head .title': '工具栏', '#view-settings .head .title': '设置',
      '#view-toc .head .title': '目录', '#view-search .head .title': '全文搜索',
      '#view-source .head .title': '书源', '#view-shelf .head .title': '书架',
      /* 📑 V4.3.29 新增书签列表面板 */
      '#view-bookmarks .head .title': '书签列表',
      '#view-toolbar [data-a="fontDec"] .label': '缩小', '#view-toolbar [data-a="fontInc"] .label': '放大',
      '#view-toolbar [data-a="fontReset"] .label': '重置',
      '#view-toolbar [data-a="modeToggle"] .label': '单行',
      '#view-toolbar [data-a="pagedToggle"] .label': '分页', '#view-toolbar [data-a="skin"] .label': '皮肤',
      '#view-toolbar [data-a="resetColor"] .label': '重置颜色', '#view-toolbar [data-a="picker"] .label': '吸色',
      '#view-toolbar [data-a="gray"] .label': '变灰',
      /* 📑 V4.3.29：工具条上那个独立的「书签」按钮已并入「书签列表」面板（不再有 data-a="bookmark" 按钮）。
         加书签改名并升级成面板；列表不再只有两字——用户要求显示全称「书签列表」。 */
      '#view-toolbar [data-a="bookmarks"] .label': '书签列表',
      '#view-toolbar [data-a="search"] .label': '全文', '#view-toolbar [data-a="source"] .label': '书源',
      '#view-toolbar [data-a="shelf"] .label': '书架', '#view-toolbar [data-a="settings"] .label': '设置',
      '#view-toolbar [data-a="contentProtect"] .label': '脱监',
      '#view-toolbar [data-a="sos"] .label': 'SOS',
      '#view-toolbar .row .lab': null,
      '#view-settings .section h3': null,
      '#view-search #searchHint': '输入内容后自动搜索',
      // 🆕 V4.3.23 书库（併进全文搜索面板）：静态文案走 i18n 表，动态生成的走下面的 LIB_T
      /* V4.3.33：只指向标题文字那个 span。原来指向 h3 本身，applyPanelLang 用 textContent
         赋值会把里面的 <span id="libCount"> 一起抹掉（书库计数从此不显示）。 */
      '#libSection #libTitle': '书库', '#libSection > .hint': '书源搜索过的站会自动存进来。填书名后点某站的「搜本站」，就用那座站再搜一次。',
      '#view-shelf #shelfSelectAllBtn': '全选/全不选', '#view-shelf #shelfExportBtn': '导出选中',
      '#view-shelf #shelfImportBtn': '导入书架',
      '#view-settings #exportLogsBtn': '导出日志', '#view-settings #viewLogsBtn': '查看日志',
      '#view-settings #openLogsBtn': '日志目录',
      '#view-settings #protectTestBtn': '脱监自检',
      '#disguiseSkinSelect option[value="word"]': '办公文档',
      '#disguiseSkinSelect option[value="code"]': '代码 / 终端',
      '#disguiseSkinSelect option[value="sheet"]': '数据表格'
    },
    en: {
      '#view-toolbar .head .title': 'Toolbar', '#view-settings .head .title': 'Settings',
      '#view-toc .head .title': 'Contents', '#view-search .head .title': 'Full-text search',
      '#view-source .head .title': 'Sources', '#view-shelf .head .title': 'Bookshelf',
      /* 📑 V4.3.29 新增书签列表面板 */
      '#view-bookmarks .head .title': 'Bookmark list',
      '#view-toolbar [data-a="fontDec"] .label': 'Smaller', '#view-toolbar [data-a="fontInc"] .label': 'Larger',
      '#view-toolbar [data-a="fontReset"] .label': 'Reset',
      '#view-toolbar [data-a="modeToggle"] .label': 'Single line',
      '#view-toolbar [data-a="pagedToggle"] .label': 'Paged', '#view-toolbar [data-a="skin"] .label': 'Theme',
      '#view-toolbar [data-a="resetColor"] .label': 'Reset color', '#view-toolbar [data-a="picker"] .label': 'Pick color',
      '#view-toolbar [data-a="gray"] .label': 'Fade',
      /* 📑 V4.3.29：见 zh 表同名注释 —— 独立书签按钮并入面板，列表改名全称 */
      '#view-toolbar [data-a="bookmarks"] .label': 'Bookmarks',
      '#view-toolbar [data-a="search"] .label': 'Search', '#view-toolbar [data-a="source"] .label': 'Sources',
      '#view-toolbar [data-a="shelf"] .label': 'Shelf', '#view-toolbar [data-a="settings"] .label': 'Settings',
      '#view-toolbar [data-a="contentProtect"] .label': 'Privacy',
      '#view-toolbar [data-a="sos"] .label': 'SOS',
      '#view-search #searchHint': 'Type to search',
      '#libSection #libTitle': 'Site library', '#libSection > .hint': 'Sites you have searched are stored automatically. Type a title, then hit "Search here" on a site.',
      '#view-shelf #shelfSelectAllBtn': 'Select all / none', '#view-shelf #shelfExportBtn': 'Export selected',
      '#view-shelf #shelfImportBtn': 'Import shelf',
      '#view-settings #exportLogsBtn': 'Export logs', '#view-settings #viewLogsBtn': 'View logs',
      '#view-settings #openLogsBtn': 'Log folder',
      '#view-settings #protectTestBtn': 'Privacy test',
      '#disguiseSkinSelect option[value="word"]': 'Office document',
      '#disguiseSkinSelect option[value="code"]': 'Code / terminal',
      '#disguiseSkinSelect option[value="sheet"]': 'Spreadsheet'
    }
  };
  // 注意：这张表按「文档里的出现顺序」逐条对齐，改 panel.html 的行序必须同步改这里
  const PANEL_LIST_TEXT = {
    zh: [
      /* ⚠️ 这张表按 panel.html 的 DOM 顺序逐条对齐：加一行必须同步这里，否则其后所有标签整体串位。 */
      ['#view-toolbar .row .lab', ['文字透明度', '窗口透明度', '阴影+线条', '行距', '页边距', '自动滚动速度（单行）']],
      /* V4.3.33 修：顺序必须严格对齐 panel.html 里 #view-settings 的 DOM 先后。
         原来第 8/9 项写成了「书架, 反馈」，而 DOM 里是 反馈(141) → 书架(147)，
         于是这两个分区的标题被**整体调换**（内容不变，只有标题串了）。 */
      ['#view-settings .section h3', ['外观', '快捷键', '朗读', '主题', '更新', '文件关联', '数据', '反馈', '书架', '前台监听', '伴随模式']],
      ['#view-settings .srow > span:first-child', [
        '移出延迟关闭', '自动对比度',
        /* 📑 V4.3.29：新增「书签」一行 —— 这张表**严格按 panel.html 的文档顺序**逐条对齐，
           加行不同步改这里，后面所有行的标签会整体串位一位（smoke3 的 fg-watch 断言专守此事）。 */
        '上一章', '下一章', '隐藏/显示', '专注模式', '当前章搜索', '全文搜索', '自动滚动', '取色点', '工具栏', '脱离监控', '目录', '书签', '',
        '朗读当前章', '语速', '语音', '后台朗读', '',
        /* 🎨 V4.3.69：主题段最前面多了「排版预设」一行（panel.html 里 3 个按钮那行），
           这张表严格按 DOM 顺序对齐，漏补 = 后面所有行整体串位一位。 */
        '排版预设', '已保存主题', '', '',
        '清单地址', '',
        '打开方式',
        '数据管理', '自定义CSS', '日志', '语言',
        '诊断', '反馈地址', '',
        '自动追更', '检查间隔',
        '前台监听', '监听程序',
        /* 🆕 V4.3.53（R12-2）伴随模式那一节的行（顺序 = panel.html 的 DOM 顺序）；
           V4.3.54 在「贴边位置」后面插了「融入目标配色」一行（吸色联动开关）。
           V4.3.55：贴边语义改「嵌入位置」（客户区内部叠加），并插入「关闭联动 / 最小化联动」两行。 */
        '跟随目标程序', '目标程序', '陪显示时机', '嵌入位置', '关闭联动', '最小化联动', '融入目标配色', '重新贴边'
      ]],
      ['#view-settings #resetAllBtn', ['恢复默认设置']],
      ['#view-source .hint', ['请遵守目标网站条款与版权规定。本软件不内置任何书源，仅在您主动点击时抓取。']]
    ],
    en: [
      ['#view-toolbar .row .lab', ['Text opacity', 'Window opacity', 'Border+shadow', 'Line height', 'Page margin', 'Auto-scroll (single line)']],
      ['#view-settings .section h3', ['Appearance', 'Shortcuts', 'Read aloud', 'Themes', 'Updates', 'File association', 'Data', 'Feedback', 'Bookshelf', 'Foreground watch', 'Companion mode']],   // V4.3.33：与 DOM 顺序对齐，见上面 zh 表注释
      ['#view-settings .srow > span:first-child', [
        'Auto-close delay', 'Auto contrast',
        /* 📑 V4.3.29：见 zh 表同名注释（顺序必须与 panel.html 的 DOM 行序一致） */
        'Previous chapter', 'Next chapter', 'Hide / show', 'Focus mode', 'Search in chapter', 'Full-text search', 'Auto-scroll', 'Pick point', 'Toolbar', 'Privacy guard', 'Directory', 'Bookmark', '',
        'Read current chapter', 'Speed', 'Voice', 'Background playback', '',
        'Layout presets', 'Saved themes', '', '',
        'Manifest URL', '',
        'Open with',
        'Data', 'Custom CSS', 'Logs', 'Language',
        'Diagnostics', 'Feedback URL', '',
        'Auto-update', 'Check interval',
        'Watch foreground', 'Watch processes',
        /* 🆕 V4.3.53（R12-2）见 zh 表同名注释（顺序 = panel.html 的 DOM 顺序）；V4.3.55 嵌入+联动 8 行 */
        'Follow target app', 'Target app', 'Show while', 'Embed area', 'Close link', 'Minimize link', 'Match target color', 'Re-dock'
      ]],
      ['#view-settings #resetAllBtn', ['Reset all settings']],
      ['#view-source .hint', ['Follow the target site terms and copyright rules. This app ships no built-in source and only fetches when you click.']]
    ]
  };
  let panelLang = 'zh';
  /* 🟥 V4.3.44（R3-4）：**代码里拼出来的**文案走这个 helper。
     静态文案（HTML 里写死的）走 panel.html 上的 data-i18n + scripts/i18n-literals.js；
     但下拉占位、空态提示、状态行这些是在 JS 里生成的，标记法覆盖不到，只能就地分支。 */
  const PT = (zh, en) => (panelLang === 'en' ? en : zh);
  let lastUpdateUrl = '';
  function applyPanelLang(lang){
    panelLang = (lang === 'en') ? 'en' : 'zh';
    /* 🟥 V4.3.44（R3-4）：静态文案统一走这一句（scripts/i18n-literals.js 里的对照表 +
       panel.html 上的 data-i18n / data-i18n-ph / data-i18n-title 标记）。
       **必须放在最前面** —— 下面几步里 libRender / renderBookmarkList / applyToolbarTips
       会按运行状态重写同一批元素（书库空态、书签按钮、悬停说明），
       让"状态值后写"才能覆盖"静态值"，否则固定文案会把实时内容顶掉。 */
    try{ if(window.applyI18nLiterals) window.applyI18nLiterals(document, panelLang); }catch(e){ reportPanelError('applyI18nLiterals failed: ' + ((e && e.message) || e)); }
    const dict = PANEL_TEXT[panelLang];
    Object.keys(dict).forEach(sel => {
      if(!dict[sel]) return;
      const el = document.querySelector(sel);
      if(el) el.textContent = dict[sel];
    });
    (PANEL_LIST_TEXT[panelLang] || []).forEach(([groupSel, texts]) => {
      const nodes = document.querySelectorAll(groupSel);
      nodes.forEach((el, i) => { if(texts[i] !== undefined) el.textContent = texts[i]; });
    });
    const ph = panelLang === 'en'
      ? { sourceSearchInput:'Title or author', sourceBookUrl:'Paste the index/detail page URL', srcName:'Source name', libQuery:'Title / author',
          srcEncoding:'utf-8 / gb18030 / big5 (free text)', srcSearchBookUrlAttr:'href (free text, e.g. data-src)',
          bmFilter:'Filter by title (as you type)' }    // 📑 V4.3.29 书签列表过滤框
      : { sourceSearchInput:'输入书名/作者', sourceBookUrl:'粘贴目录/详情页 URL', srcName:'书源名称', libQuery:'书名 / 作者',
          srcEncoding:'utf-8 / gb18030 / big5（可手输）', srcSearchBookUrlAttr:'href（可手输，如 data-src）',
          bmFilter:'过滤标题（输入即筛）' };    // 📑 V4.3.29 书签列表过滤框
    Object.keys(ph).forEach(id => { const el = $(id); if(el) el.placeholder = ph[id]; });
    applyToolbarTips();   // 工具栏悬停说明也要跟着切语言
    /* 🟥 V4.3.44（R3-4）：`#srcLibSites` 这个下拉是**按当时的 panelLang 拼出来的**
       （站点名 + 有无搜索入口的后缀），切语言后必须重画，否则英文模式下留着一串中文后缀。
       只重画这一个下拉 —— 不动 refreshSourceRules（它会顺带 fillSourceForm，把用户没保存的规则输入冲掉）。 */
    try{ fillLibSitesSelect(); }catch(e){}
    libRender();          // 🆕 V4.3.23 书库卡片是 JS 生成的，语言切换后要重画才会跟着变（无卡片时是空操作）
    if(type === 'bookmarks') renderBookmarkList({});   // 📑 V4.3.29 书签列表同样是 JS 生成的，切语言要重画
    if(type === 'annot') renderAnnotList({});          // 🖍 V4.3.71 批注列表同理
  }

  function applyTheme(theme){
    if(!theme) return;
    document.body.classList.toggle('skin-dark', theme.skin === 'dark');
    if(theme.lang) applyPanelLang(theme.lang);
    const rgb = theme.bgRgb || {r:240,g:242,b:245};
    const op = (theme.windowOpacity == null ? 100 : theme.windowOpacity) / 100;
    const r = document.documentElement.style;
    r.setProperty('--bg-r', rgb.r);
    r.setProperty('--bg-g', rgb.g);
    r.setProperty('--bg-b', rgb.b);
    const alpha = isFinite(op) ? Math.max(0.2, Math.min(1, op)) : 1;
    r.setProperty('--bg-alpha', alpha.toFixed(2));
    /* 🆕 V4.3.86（主人反馈「透明底降低后按钮不跟随」）：与主窗用**同一条**映射。
       原来 0.55 + 0.38*alpha —— 窗口透到 20% 时按钮还有 0.63，而面板背景只有 0.20，
       按钮明显"浮"在透明底上，两个窗口的质感也各走各的。
       现在贴着背景走：0.08 + 0.88*alpha（100% → 0.96，20% → 0.26）。 */
    r.setProperty('--ui-alpha', (0.08 + 0.88 * alpha).toFixed(2));
  }

  function formatShortcut(e){
    const parts = [];
    if(e.ctrlKey) parts.push('Ctrl');
    if(e.shiftKey) parts.push('Shift');
    if(e.altKey) parts.push('Alt');
    if(e.metaKey) parts.push('Meta');
    let key = e.key;
    if(key==='ArrowLeft') key='←';
    if(key==='ArrowRight') key='→';
    if(key==='ArrowUp') key='↑';
    if(key==='ArrowDown') key='↓';
    if(key===' ') key='Space';
    /* 🛡 V4.3.78：与 util.js 同步 —— key 判空提前（实机出现过 undefined.key 的 keydown） */
    if(!key) return null;
    if(key.length===1) key=key.toUpperCase();
    if(key==='Control'||key==='Shift'||key==='Alt'||key==='Meta') return null;
    if(key==='Escape' || key==='Tab') return null;
    /* V4.3.33b：与 util.js 的 ReaderUtil.formatShortcut 保持同一口径。
       这里之所以有一份重复实现，是因为 panel.html 只加载 panel.js、不加载 util.js；
       但两边判断必须同步 —— 否则面板录出来的键主窗匹配不上（改键"不生效"）。 */
    if(key==='Dead' || key==='Unidentified' || key==='Process') return null;
    parts.push(key);
    return parts.join('+');
  }

  // ---------- 工具栏 ----------
