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
    /* 🆕 V4.3.86（用户反馈「透明底降低后按钮不跟随」）：与主窗用**同一条**映射。
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
  // 悬停说明：小窗按钮是「图标 + 两字标签」，只看图标认不出功能
  // 吸色语义与主窗口保持一致：左键取色点，右键自动吸色
  const TOOLBAR_TIPS = {
    zh: {
      fontDec: '缩小字号', fontInc: '放大字号', fontReset: '字号恢复默认',
      modeToggle: '切换单行 / 多行阅读', pagedToggle: '切换分页 / 滚动阅读',
      skin: '切换皮肤（浅色 / 深色）', resetColor: '恢复默认文字颜色',
      picker: '吸色：左键取色点，右键自动吸色', gray: '变灰：鼠标移出窗口时整窗淡出防窥',
      disguise: '伪装：一键把界面换成办公文档 / 代码 / 表格（Ctrl+Shift+B）',
      ttsToggle: '朗读 / 暂停',
      /* 📑 V4.3.29：工具条上不再有独立的「书签」按钮（功能收进下面的「书签列表」面板）。
         书签本身也可在设置→快捷键里改键，默认 Ctrl+Shift+M。 */
      bookmarks: '书签列表：加 / 移除书签、按标题过滤、点击直达章节',
      toc: '目录', search: '全文搜索', source: '书源', shelf: '书架', settings: '设置',
      contentProtect: '脱离监控：开启后截屏 / 录屏抓不到内容，投屏与外接远控时自动隐身（快捷键 Ctrl+Shift+S）',
      /* 🆘 V4.3.24：SOS = 隐藏/显示键（默认 Ctrl+Shift+H，可在设置改键）的语义升级版 ——
         收起**全部**界面（阅读主窗 + 工具栏等所有小窗）并**停掉朗读**；再按一次原样恢复。
         和「只藏阅读窗口、工具栏还在」的 hide 不是一回事。
         🛠 V4.3.28：en 表里 sos 连写三遍 + 键名错写成 Ctrl+Shift+S，已去重改正。 */
      sos: 'SOS：一键收起全部界面并停止朗读（含工具栏小窗），再按一次恢复（快捷键与「隐藏/显示」相同，默认 Ctrl+Shift+H）'
    },
    en: {
      fontDec: 'Decrease font size', fontInc: 'Increase font size', fontReset: 'Reset font size',
      modeToggle: 'Toggle single / multi-line mode', pagedToggle: 'Toggle paged / scrolling mode',
      skin: 'Switch theme (light / dark)', resetColor: 'Reset text color',
      picker: 'Pick color: left = pick point, right = auto pick', gray: 'Fade out when the mouse leaves the window',
      disguise: 'Disguise: swap the UI for an office doc / code / spreadsheet (Ctrl+Shift+B)',
      ttsToggle: 'Read aloud / pause',
      /* 📑 V4.3.29：见 zh 表同名注释 */
      bookmarks: 'Bookmark list: add / remove, filter by title, jump to chapter',
      toc: 'Contents', search: 'Full-text search', source: 'Sources', shelf: 'Bookshelf', settings: 'Settings',
      contentProtect: 'Privacy guard: screen capture & recording see nothing; auto-hide on projection / remote control (Ctrl+Shift+S)',
      sos: 'SOS: hide everything (main window + all panels) and stop reading aloud; press again to restore (same key as Hide/Show, default Ctrl+Shift+H)'
    }
  };
  const SLIDER_TIPS = {
    zh: {
      textOpacitySlider: '文字不透明度：只影响正文，不影响窗口',
      windowOpacitySlider: '窗口透明度：整个窗口一起变淡',
      shadowIntensitySlider: '阴影 + 描边强度：越大文字越清晰，也越显眼',
      lineHeightSlider: '行距',
      autoScrollSpeed: '自动滚动速度（仅单行模式，0 为关）'
    },
    en: {
      textOpacitySlider: 'Text opacity: affects text only, not the window',
      windowOpacitySlider: 'Window opacity: fades the whole window',
      shadowIntensitySlider: 'Shadow + outline: higher is clearer but more visible',
      lineHeightSlider: 'Line height',
      autoScrollSpeed: 'Auto-scroll speed (single-line mode only, 0 = off)'
    }
  };
  function applyToolbarTips(){
    const dict = TOOLBAR_TIPS[panelLang] || TOOLBAR_TIPS.zh;
    document.querySelectorAll('#view-toolbar .btn[data-a], #disguiseQuick [data-a]').forEach(el=>{
      const tip = dict[el.getAttribute('data-a')];
      if(tip) el.title = tip;
    });
    const sd = SLIDER_TIPS[panelLang] || SLIDER_TIPS.zh;
    Object.keys(sd).forEach(id=>{ const el=$(id); if(el) el.title = sd[id]; });
    refreshProtectTip();
  }

  /* 🛡 脱监按钮的悬停说明要拼上「本机防截屏能力」——主进程探测后随同步下发（V4.3.19）。
     单独一个保护（protectNoteCache）是因为 applyToolbarTips 与 updateToolbar 都会刷这个 title，
     谁后跑都不能把对方的内容顶掉。 */
  let protectNoteCache = '';
  /* 🟥 V4.3.23：警示分两档 —— warn（红，**确实**没生效）/ note（黄，只是测不出来，不确定）。
     用户要求把「真失效」和「只是弹个警告」区分开，所以这里不能再一律标红。 */
  let protectWarnCache = '';
  let protectWarnKindCache = '';
  function refreshProtectTip(){
    const b = $('protectBtn'); if(!b) return;
    const base = (TOOLBAR_TIPS[panelLang] || TOOLBAR_TIPS.zh).contentProtect || '';
    const parts = [base];
    if(protectNoteCache) parts.push((panelLang==='en'?'This machine: ':'本机：') + protectNoteCache);
    if(protectWarnCache) parts.push((protectWarnKindCache==='warn' ? '❌ ' : '⚠️ ') + protectWarnCache);
    b.title = parts.filter(Boolean).join('｜');
    b.classList.toggle('warn', protectWarnKindCache === 'warn');
    b.classList.toggle('note', protectWarnKindCache === 'note');
  }

  function initToolbar(){
    document.querySelectorAll('#view-toolbar .btn[data-a], #disguiseQuick [data-a]').forEach(el=>{
      el.addEventListener('click', ()=>send(el.getAttribute('data-a')));
    });
    // 吸色：左键取色点，右键自动吸色（与提示文案一致）
    const pickerEl = document.querySelector('#view-toolbar .btn[data-a="picker"]');
    if(pickerEl) pickerEl.addEventListener('contextmenu', e=>{ e.preventDefault(); send('autoPick'); });
    applyToolbarTips();
    $('fontSelect').addEventListener('change', e=>send('fontFamily', e.target.value));
    $('textColorPicker').addEventListener('input', e=>send('textColor', e.target.value));
    /* 🛥 V4.3.86：滑块表示「透明度」（右移更透），发给主窗的是 opacity = 100 - 位置值 */
    $('textOpacitySlider').addEventListener('input', e=>{ $('textOpacityValue').textContent=(+e.target.value)+'%'; send('textOpacity', 100-(+e.target.value)); });
    $('windowOpacitySlider').addEventListener('input', e=>{ $('windowOpacityValue').textContent=(+e.target.value)+'%'; send('windowOpacity', 100-(+e.target.value)); });
    $('shadowIntensitySlider').addEventListener('input', e=>{ $('shadowIntensityValue').textContent=e.target.value+'%'; send('shadow', +e.target.value); });
    $('lineHeightSlider').addEventListener('input', e=>{ $('lineHeightValue').textContent=(+e.target.value).toFixed(1); send('lineHeight', +e.target.value); });
    /* 📖 V4.3.70：页边距。显示带 px 单位 —— 用户要的是"留多少白"，不是无量纲数字。 */
    $('pageMarginSlider').addEventListener('input', e=>{ $('pageMarginValue').textContent=(+e.target.value)+'px'; send('pageMargin', +e.target.value); });
    $('autoScrollSpeed').addEventListener('input', e=>{ $('autoScrollSpeedValue').textContent=+e.target.value>0?e.target.value+'%':PT('关','Off'); send('autoScroll', +e.target.value); });
    /* 🆕 V4.3.79：三个伪装皮肤（办公文档/代码终端/数据表格）**无条件常驻** ——
       移除任何可能残留在 DOM 上的 disabled/selected 限制，保证任何情况下都能直接选用。 */
    const dsel = $('disguiseSkinSelect');
    if (dsel) dsel.querySelectorAll('option').forEach(o => { o.disabled = false; o.hidden = false; });
    /* 🆕 V4.3.86：伪装外观常驻按钮**不需要**单独绑监听 —— 它带 data-a 且在 #disguiseQuick 内，
       已被上面那句 `#disguiseQuick [data-a]` 的委托绑定覆盖。
       🟥 这里踩过一次坑：最初又显式 addEventListener 一遍，于是**一次点击触发两次 send**，
       'disguiseRead' 是翻转语义 → 翻两次回到原点，表现和"死控件"一模一样。
       新增按钮前先确认它是否已被委托覆盖，别重复绑。 */
  }

  function updateToolbar(p){
    if(p.readMode !== undefined){
      $('modeToggleBtn').classList.toggle('on', p.readMode==='single');
      /* 🆕 V4.3.97：分页从「单行」按钮的三档循环里拆出来，独立一个按钮/一盏灯 */
      const pagedBtn = $('pagedToggleBtn');
      if(pagedBtn) pagedBtn.classList.toggle('on', p.readMode==='paged');
      $('autoScrollRow').classList.toggle('disabled', p.readMode!=='single'); if(p.readMode!=='single'){ $('autoScrollSpeed').value=0; $('autoScrollSpeedValue').textContent=PT('关','Off'); } }
    if(p.gray !== undefined) $('grayToggleBtn').classList.toggle('on', p.gray);
    // 「吸色」按钮要同时反映两个开关：自动吸色(autoPick) 与 取色点(pickPointMode)。
    // 以前只判断 autoPick，所以点左键进取色点模式时按钮根本不亮，看不出开关状态。
    if(p.autoPick !== undefined || p.pickPointMode !== undefined){
      const pickOn = !!(p.autoPick || p.pickPointMode);
      $('pickerBtn').classList.toggle('on', pickOn);
      /* 🎨 V4.3.86（用户：优化吸色跟吸色重置按钮的联动性）：
         两个吸色模式都没开时，「重置吸色」点了没有任何效果 —— 置灰比让人白点一次更诚实。 */
      const rb = $('pickResetBtn');
      if(rb) rb.disabled = !pickOn;
    }
    if(p.ttsState !== undefined){ const b=$('ttsBtn'); if(b) b.classList.toggle('on', p.ttsState==='playing'); }
    if(p.textColor !== undefined) $('textColorPicker').value = p.textColor;
    if(p.font !== undefined) $('fontSelect').value = p.font;
    /* 🛥 V4.3.86：显示透明度 = 100-opacity，滑块位置同步反转 */
    if(p.windowOpacity !== undefined){ $('windowOpacitySlider').value=100-p.windowOpacity; $('windowOpacityValue').textContent=(100-p.windowOpacity)+'%'; }
    if(p.textOpacity !== undefined){ $('textOpacitySlider').value=100-p.textOpacity; $('textOpacityValue').textContent=(100-p.textOpacity)+'%'; }
    if(p.shadow !== undefined){ $('shadowIntensitySlider').value=p.shadow; $('shadowIntensityValue').textContent=p.shadow+'%'; }
    if(p.lineHeight !== undefined){ $('lineHeightSlider').value=p.lineHeight; $('lineHeightValue').textContent=(+p.lineHeight).toFixed(1); }
    if(p.pageMargin !== undefined){ $('pageMarginSlider').value=p.pageMargin; $('pageMarginValue').textContent=(+p.pageMargin)+'px'; }
    if(p.autoScrollSpeed !== undefined && p.readMode==='single'){ $('autoScrollSpeed').value=p.autoScrollSpeed; $('autoScrollSpeedValue').textContent=p.autoScrollSpeed>0?p.autoScrollSpeed+'%':PT('关','Off'); }
    // 🟥 V4.3.15：伪装皮肤下拉从设置搬进工具栏后，syncToolbarPanel/updateToolbar 漏接 disguiseSkin，
    // 导致改成代码/表格后关掉工具栏再开，下拉又变回默认办公文档。
    if(p.disguiseSkin !== undefined){ const s=$('disguiseSkinSelect'); if(s) s.value = p.disguiseSkin; }
    if(p.isDisguised !== undefined){
      const b=$('disguiseToggleBtn'); if(b) b.textContent = p.isDisguised ? (panelLang==='en'?'Exit disguise':'退出伪装') : (panelLang==='en'?'Enter disguise':'进入伪装');
    }
    /* 🆕 V4.3.86：常驻伪装皮肤的状态回显。文案走 PT（运行时状态），不能用 data-i18n。 */
    if(p.disguiseRead !== undefined){
      const b=$('disguiseReadBtn');
      if(b){ b.textContent = p.disguiseRead ? PT('已开启','On') : PT('开启','Off'); b.classList.toggle('on', !!p.disguiseRead); }
    }
    // 🛡 V4.3.19 脱离监控：按钮亮起 = 已开启（默认关闭，所以默认是灭的）
    if(p.contentProtect !== undefined){ const b=$('protectBtn'); if(b) b.classList.toggle('on', !!p.contentProtect); }
    // 🟥 V4.3.22：脱监开着但「没生效 / 不确定」时按钮加红色警示（用户要求：没起效要红着说）。
    // 说明文案与红色标记都交给 refreshProtectTip 统一组装，避免多处各拼一遍导致重复叠加。
    if(p.protectNote !== undefined){ protectNoteCache = p.protectNote || ''; refreshProtectTip(); }
    if(p.protectWarn !== undefined){ protectWarnCache = p.protectWarn || ''; refreshProtectTip(); }
    if(p.protectWarnKind !== undefined){ protectWarnKindCache = p.protectWarnKind || ''; refreshProtectTip(); }
    /* 📑 V4.3.29：原「工具条书签按钮 ★/☆ 高亮」整块删除 —— 那个按钮已经并入书签列表面板，
       当前章是否加过书签改由 renderBookmarkList 里的 #bmToggleBtn 显示（数据来自 bookmarkPayload）。 */
  }

  // ---------- 设置 ----------
  function initSettings(){
    $('closeDelaySlider').addEventListener('input', e=>{ $('closeDelayValue').textContent=e.target.value+'ms'; send('closeDelay', +e.target.value); });
    // 🟥 V4.3.17：伪装皮肤下拉的 change 已上移到「与 type 无关的通用初始化区」（见文件末尾初始化段），
    // 这里不再绑定 —— 它住在 #view-toolbar，挂在 initSettings() 里根本执行不到（本版修的就是这个）。
    $('fgWatchSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('fgWatch'); });
    /* 🆕 V4.4.0：后台朗读开关（状态由主窗回写，这里只发动作 + 立刻翻转视觉） */
    $('ttsBgSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('ttsBg'); });
    if($('autoUpdateSwitch')){ $('autoUpdateSwitch').classList.toggle('active', !!window.__autoUpdateOn); $('autoUpdateSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('autoUpdate'); }); }
    if($('autoUpdateMinSelect')) $('autoUpdateMinSelect').addEventListener('change', e=>send('autoUpdateMin', +e.target.value));
    $('fgWatchInput').addEventListener('change', e=>{ send('fgWatchList', e.target.value); });
    /* 🆕 V4.3.53（R12-2）伴随模式的四个控件（开关 / 目标程序 / 陪显示时机 / 贴边位置）。
       「贴回去」按钮走 #view-settings 的 [data-a] 通用委托（文件末尾那段），不用单独绑。 */
    if($('companionSwitch')) $('companionSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('companion'); });
    if($('companionInput')) $('companionInput').addEventListener('change', e=>{ send('companionTarget', e.target.value); });
    if($('companionModeSelect')) $('companionModeSelect').addEventListener('change', e=>{ send('companionMode', e.target.value); });
    if($('companionEdgeSelect')) $('companionEdgeSelect').addEventListener('change', e=>{ send('companionEdge', e.target.value); });
    /* 🆕 V4.3.54（吸色联动）：开关只发动作，状态回显走 settingsPayload 的 companionTint。
       🎯 检测按钮不用绑 —— 走 #view-settings [data-a] 通用委托（companionRedock 同款）。
       🆕 V4.3.55：生命周期联动两开关同套路（发动作、回显走 payload）。 */
    if($('companionTintSwitch')) $('companionTintSwitch').addEventListener('click', ()=>{ send('companionTint'); });
    if($('companionLinkCloseSwitch')) $('companionLinkCloseSwitch').addEventListener('click', ()=>{ send('companionLinkClose'); });
    if($('companionLinkMinSwitch')) $('companionLinkMinSwitch').addEventListener('click', ()=>{ send('companionLinkMin'); });
    /* 🆕 V4.3.53（建议 1）目标程序历史候选：与主窗共用同源 localStorage 的 fct 键（数组，
       主窗 setCompanionTarget 单一收口维护）。这里只读，记录不在这边做 ——
       面板改目标会经桥转发回主窗，自然会记进历史。
       ⚠️ 面板窗口是**常驻复用**的（createPanel 对已存在的直接返回），光在启动时灌一次
       会滞后（浮层里新加的目标，面板里要重开才见）——所以挂在 focus 上，每次点到
       面板都重灌一遍（量级 = 5 条 option，可忽略）。
       键名与主窗 CONFIG.KEYS.COMPANION_TGT_HIST 同源（'fct'），用常量传递 ——
       与上面 SRC_HIST_KEY 同款（键登记审计只查字面量直呼 localStorage 的形态）。 */
    const COMPANION_TGT_HIST_KEY = 'fct';
    function fillCompanionTargetDatalist(){
        const dl = document.getElementById('dlCompanionTarget'); if(!dl) return;
        let arr = [];
        try{ const o = JSON.parse(localStorage.getItem(COMPANION_TGT_HIST_KEY) || '[]'); if(Array.isArray(o)) arr = o; }catch(e){}
        dl.innerHTML = '';
        arr.filter(Boolean).slice(0, 5).forEach(function(name){
            const o = document.createElement('option'); o.value = String(name); dl.appendChild(o);
        });
    }
    fillCompanionTargetDatalist();
    window.addEventListener('focus', fillCompanionTargetDatalist);
    $('autoContrastSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('autoContrast'); });
    [['shortcutPrev','prev'],['shortcutNext','next'],['shortcutHide','hide'],['shortcutFocus','focus'],
     ['shortcutSearch','search'],['shortcutGlobalSearch','globalSearch'],['shortcutAutoScroll','autoScroll'],
     ['shortcutPickPoint','pickPoint'],['shortcutToolbar','toolbar'],['shortcutToc','toc'],
     ['shortcutContentProtect','contentProtect'],['shortcutBookmark','bookmark']].forEach(([id,key])=>{
      const el=$(id); if(!el) return;
      el.addEventListener('keydown', e=>{ e.preventDefault(); e.stopPropagation(); const ks=formatShortcut(e); if(ks){ el.value=ks; send('shortcut', {key, value:ks}); } });
    });
    const ttsRate=$('ttsRateSlider');
    if(ttsRate) ttsRate.addEventListener('input', e=>{ $('ttsRateValue').textContent=(+e.target.value).toFixed(1)+'x'; send('ttsRate', +e.target.value); });
    const ttsVoice=$('ttsVoiceSelect');
    if(ttsVoice) ttsVoice.addEventListener('change', e=>send('ttsVoice', e.target.value));
    const updInput=$('updateUrlInput');
    if(updInput) updInput.addEventListener('change', e=>send('updateUrl', e.target.value.trim()));
    const fbInput=$('feedbackUrlInput');
    if(fbInput) fbInput.addEventListener('change', e=>send('feedbackUrl', e.target.value.trim()));
    const exportLogsBtn=$('exportLogsBtn');
    if(exportLogsBtn) exportLogsBtn.addEventListener('click', async ()=>{ const old=exportLogsBtn.textContent; exportLogsBtn.textContent=PT('导出中...', 'Exporting...'); try{ const r = api && api.exportLogs ? await api.exportLogs() : null; exportLogsBtn.textContent = (r && r.ok) ? PT('已导出', 'Exported') : ((r && r.canceled) ? PT('已取消', 'Cancelled') : PT('无日志', 'No logs')); }catch(e){ exportLogsBtn.textContent=PT('失败', 'Failed'); } setTimeout(()=>{ exportLogsBtn.textContent=PT('导出日志', 'Export logs'); }, 1500); });
    const viewLogsBtn=$('viewLogsBtn');
    if(viewLogsBtn) viewLogsBtn.addEventListener('click', async ()=>{
      const box=$('logBox');
      if(box.style.display !== 'none'){ box.style.display='none'; return; }
      viewLogsBtn.textContent=PT('读取中…', 'Reading…');
      try{
        const r = api && api.tailLog ? await api.tailLog(200) : null;
        if(r && r.ok){
          const lines = (r.lines || []).slice().reverse();
          $('logPathHint').textContent = r.path + PT('（最新在前）', '(newest first)');
          $('logContent').textContent = lines.length ? lines.join('\n') : PT('（日志为空）', '(log is empty)');
          box.style.display = '';
          viewLogsBtn.textContent=PT('收起日志', 'Collapse log');
          return;
        }
        $('logPathHint').textContent = (r && r.error) || PT('读取日志失败', 'Failed to read logs');
        $('logContent').textContent = '';
        box.style.display = '';
      }catch(e){ $('logPathHint').textContent = PT('读取日志失败：', 'Failed to read logs: ')+(e && e.message || e); }
      viewLogsBtn.textContent=PT('查看日志', 'View log');
    });
    const openLogsBtn=$('openLogsBtn');
    if(openLogsBtn) openLogsBtn.addEventListener('click', async ()=>{ try{ await (api && api.openLogFolder && api.openLogFolder()); }catch(e){} });
    document.querySelectorAll('#view-settings [data-a], #disguiseQuick [data-a]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const a = el.getAttribute('data-a');
        let v = el.getAttribute('data-v');
        if(a === 'themeApply' || a === 'themeExport' || a === 'themeDelete'){ const sel=$('themeSelect'); v = sel ? sel.value : ''; }
        if(a === 'openUpdateUrl'){ v = lastUpdateUrl; }
        send(a, v === null ? undefined : v);
      });
    });
  }

  /* 🔊 V4.3.29 语音名 → 人话标签。
     键是系统语音的**完整原名**（不同 Windows 版本可能略有差异，命中不了就退回通用清洗）。
     🟥 V4.3.45（R4-3）：值从"单个中文串"改成 `[中文, 英文]` 对 —— 原先英文界面下
     整个下拉仍然是中文（探针 payload 只带 theme.lang，走到这一步的分支它测不到）。 */
  const VOICE_LABELS = {
    'Microsoft Huihui - Chinese (Simplified, PRC)': ['慧慧（中文·女）', 'Huihui (Chinese, female)'],
    'Microsoft Yaoyao - Chinese (Simplified, PRC)': ['瑶瑶（中文·女）', 'Yaoyao (Chinese, female)'],
    'Microsoft Kangkang - Chinese (Simplified, PRC)': ['康康（中文·男）', 'Kangkang (Chinese, male)'],
    'Microsoft Xiaoxiao - Chinese (Simplified, PRC)': ['晓晓（中文·女·自然）', 'Xiaoxiao (Chinese, female, natural)'],
    'Microsoft Yunxi - Chinese (Simplified, PRC)': ['云希（中文·男·自然）', 'Yunxi (Chinese, male, natural)'],
    'Microsoft Yunyang - Chinese (Simplified, PRC)': ['云扬（中文·男·自然）', 'Yunyang (Chinese, male, natural)'],
    'Microsoft Yunye - Chinese (Simplified, PRC)': ['云野（中文·男·自然）', 'Yunye (Chinese, male, natural)'],
    'Microsoft Xiaoyi - Chinese (Simplified, PRC)': ['晓伊（中文·女·自然）', 'Xiaoyi (Chinese, female, natural)'],
    'Microsoft David - English (United States)': ['David（英语·男）', 'David (English, male)'],
    'Microsoft Zira - English (United States)': ['Zira（英语·女）', 'Zira (English, female)'],
    'Microsoft Mark - English (United States)': ['Mark（英语·男）', 'Mark (English, male)'],
    'Microsoft Aria - English (United States)': ['Aria（英语·女·自然）', 'Aria (English, female, natural)'],
    'Microsoft Jenny - English (United States)': ['Jenny（英语·女·自然）', 'Jenny (English, female, natural)'],
    'Microsoft Guy - English (United States)': ['Guy（英语·男·自然）', 'Guy (English, male, natural)']
  };
  function voiceLabel(v){
    if(!v) return '';
    const hit = VOICE_LABELS[v.name];
    if(hit) return PT(hit[0], hit[1]);
    // 兜底：去掉 "Microsoft " 前缀和尾巴上的语言括注，再补一个语言标签
    let s = String(v.name || '').replace(/^Microsoft\s+/i, '').replace(/\s*[-–]\s*[A-Za-z][^)]*$/, '').trim();
    const lang = String(v.lang || '').toLowerCase();
    const tag = lang.indexOf('zh') === 0 ? PT('中文', 'Chinese') : (lang.indexOf('en') === 0 ? PT('英语', 'English') : lang);
    return tag ? (panelLang === 'en' ? (s + ' (' + tag + ')') : (s + '（' + tag + '）')) : s;
  }
  // 排序：当前界面语言的语音排前面，其次中文，再次按名字
  function voiceScore(v){
    const lang = String((v && v.lang) || '').toLowerCase();
    let sc = 0;
    if(panelLang === 'en'){ if(lang.indexOf('en') === 0) sc += 20; else if(lang.indexOf('zh') === 0) sc += 10; }
    else { if(lang.indexOf('zh') === 0) sc += 20; else if(lang.indexOf('en') === 0) sc += 10; }
    if(/自然|Natural|Neural/i.test(String((v && v.name) || ''))) sc += 5;
    return sc;
  }

  /* 🟥 V4.3.52（R11-2）：下拉重建前的脏检查。
     updateSettings() 每 1.5 秒被主窗的 syncSettingsPanel() 推一次；原先两个下拉都无条件
     `sel.innerHTML=''` 再逐个 appendChild —— 于是：
       ① 用户正展开下拉挑语音 / 挑主题时，整个 <option> 列表被就地销毁，下拉当场收起；
       ② 系统语音常有几十项，等于每 1.5 秒造一批新节点再扔掉，纯属白烧。
     改成先比一遍"这次渲染出来会不会和现在一样"，一样就只校正选中项、不动 DOM。
     want 形如 [[value, text], ...]。 */
  function optionsMatch(sel, want){
    const os = sel.querySelectorAll('option');
    if(os.length !== want.length) return false;
    for(let i=0;i<want.length;i++){
      if(String(os[i].value) !== String(want[i][0])) return false;
      if(String(os[i].textContent) !== String(want[i][1])) return false;
    }
    return true;
  }
  function fillOptions(sel, want){
    sel.innerHTML='';
    want.forEach(function(pair){ const o=document.createElement('option'); o.value=pair[0]; o.textContent=pair[1]; sel.appendChild(o); });
  }

  function updateSettings(p){
    if(p.closeDelay !== undefined){ $('closeDelaySlider').value=p.closeDelay; $('closeDelayValue').textContent=p.closeDelay+'ms'; }
    if(p.disguiseSkin !== undefined){ const s=$('disguiseSkinSelect'); if(s) s.value = p.disguiseSkin; }
    if(p.isDisguised !== undefined){
      const b=$('disguiseToggleBtn'); if(b) b.textContent = p.isDisguised ? (panelLang==='en'?'Exit disguise':'退出伪装') : (panelLang==='en'?'Enter disguise':'进入伪装');
    }
    if(p.fgWatchEnabled !== undefined) $('fgWatchSwitch').classList.toggle('active', p.fgWatchEnabled);
    if(p.ttsBg !== undefined) $('ttsBgSwitch').classList.toggle('active', p.ttsBg);
    /* 🟥 V4.3.52（R11-1）：回写前先看一眼"用户是不是正敲着它"。
       #fgWatchInput 用 `change` 上报（失焦 / 回车才提交），而主窗每 1.5 秒
       `syncSettingsPanel()` 把 `state.fgWatchList` 推回来 —— 中间这 1.5 秒里
       用户输入的内容还没提交，一次回写就把它抹回旧值：打字稍作停顿（想一下进程名、
       切一下输入法）内容就没了，看上去像"这功能坏了"。
       **同一个函数里**紧邻的 #updateUrlInput / #feedbackUrlInput 早已写了
       `document.activeElement !== el` 保护，唯独漏了这一个 ——
       与 R7-1「ms-settings 只修了一个入口」、R9-2「书源规则导入漏了返回值」同族：
       不是不知道有这个坑，是只补了一部分。 */
    if(p.fgWatchList !== undefined){ const el=$('fgWatchInput'); if(el && document.activeElement !== el) el.value = p.fgWatchList; }
    /* 🟥 V4.3.49（R8-1）：开关状态是"用户想要的"，这一条是"实际发生了什么"。
       观察器起不来 / 自己退出时，主进程回传到这里就地说明 —— 同 shortcutError 的口径。 */
    if(p.fgWatchError !== undefined){
      const fh = $('fgWatchHint');
      if(fh){ fh.textContent = p.fgWatchError || ''; fh.style.display = p.fgWatchError ? 'block' : 'none'; }
    }
    /* 🆕 V4.3.53（R12-2）伴随模式：开关 / 目标程序 / 陪显示时机 / 贴边位置 / 失败说明 */
    if(p.companionEnabled !== undefined){ const s=$('companionSwitch'); if(s) s.classList.toggle('active', p.companionEnabled); }
    /* 目标程序也是文本框 —— 同样带上"用户正敲着它"的保护（R11-1 的教训：紧邻的输入框要一视同仁）。 */
    if(p.companionTarget !== undefined){ const el=$('companionInput'); if(el && document.activeElement !== el) el.value = p.companionTarget; }
    if(p.companionMode !== undefined){ const el=$('companionModeSelect'); if(el) el.value = p.companionMode; }
    if(p.companionEdge !== undefined){ const el=$('companionEdgeSelect'); if(el) el.value = p.companionEdge; }
    /* 🆕 V4.3.54（吸色联动）开关回显 */
    if(p.companionTint !== undefined){ const s=$('companionTintSwitch'); if(s) s.classList.toggle('active', !!p.companionTint); }
    /* 🆕 V4.3.55：生命周期联动开关回显 */
    if(p.companionLinkClose !== undefined){ const s=$('companionLinkCloseSwitch'); if(s) s.classList.toggle('active', !!p.companionLinkClose); }
    if(p.companionLinkMin !== undefined){ const s=$('companionLinkMinSwitch'); if(s) s.classList.toggle('active', !!p.companionLinkMin); }
    if(p.companionError !== undefined){
      const fh = $('companionHint');
      if(fh){ fh.textContent = p.companionError || ''; fh.style.display = p.companionError ? 'block' : 'none'; }
    }
    /* 「嵌入暂停」是运行时的真实状态，不是设置值 —— 就地写清楚为什么它不跟着目标跑了 */
    if(p.companionDockPaused !== undefined){
      const d = $('companionDockState');
      if(d) d.textContent = p.companionDockPaused
        ? PT(' 已暂停嵌入（你挪走了窗口），点「贴回去」恢复', ' Embed paused (you moved it) - click "Dock again"')
        : '';
    }
    if(p.companionDockReady === false){
      const d2 = $('companionDockState');
      if(d2) d2.textContent = PT(' 先把「嵌入位置」选一个再点', ' Pick an embed area first');
    }
    if(p.autoContrast !== undefined) $('autoContrastSwitch').classList.toggle('active', p.autoContrast);    if(p.autoUpdate !== undefined){ const au=$('autoUpdateSwitch'); if(au) au.classList.toggle('active', p.autoUpdate); }
    if(p.autoUpdateMin !== undefined){ const m=$('autoUpdateMinSelect'); if(m) m.value = String(p.autoUpdateMin); }
    if(p.shortcuts){ $('shortcutPrev').value=p.shortcuts.prev; $('shortcutNext').value=p.shortcuts.next; $('shortcutHide').value=p.shortcuts.hide; $('shortcutFocus').value=p.shortcuts.focus; }
    if(p.shortcuts){
      const sc = p.shortcuts;
      // 🟥 V4.3.37：补 shortcutToc —— 原来漏了这一项，「目录」一栏永远是空的（改键后也不回填），
      //           用户会以为目录没有快捷键，或看到 UI 与实际不一致。
      const map = { shortcutPrev:'prev', shortcutNext:'next', shortcutHide:'hide', shortcutFocus:'focus', shortcutSearch:'search', shortcutGlobalSearch:'globalSearch', shortcutAutoScroll:'autoScroll', shortcutPickPoint:'pickPoint', shortcutToolbar:'toolbar', shortcutContentProtect:'contentProtect', shortcutBookmark:'bookmark', shortcutToc:'toc' };
      Object.keys(map).forEach(id => { const el=$(id); if(el && sc[map[id]] !== undefined) el.value = sc[map[id]]; });
    }
    /* 🆘 V4.3.28：改键冲突就地显示（主窗 push 过来的 shortcutError；成功时清空） */
    if(p.shortcutError !== undefined){
      const h = $('shortcutHint');
      if(h){ h.textContent = p.shortcutError || ''; h.style.display = p.shortcutError ? 'block' : 'none'; }
    }
    if(p.ttsRate !== undefined){ const s=$('ttsRateSlider'); if(s){ s.value=p.ttsRate; $('ttsRateValue').textContent=(+p.ttsRate).toFixed(1)+'x'; } }
    /* 🔊 V4.3.29：语音下拉改说人话。
       原来直接把 "Microsoft Huihui - Chinese (Simplified, PRC)" 原样摆出来，
       用户根本分不清哪个是中文、哪个是男声 —— 于是大多数人一直用着默认的机械音还不知道能换。 */
    if(p.voices){
      const sel=$('ttsVoiceSelect');
      if(sel){
        const cur = p.ttsVoice || sel.value || '';
        const sorted = (p.voices||[]).slice().sort((a,b)=>voiceScore(b)-voiceScore(a));
        /* R11-2：只在"渲染出来会不一样"时才重建（清单变了 / 语言切了 / 语音增减）。 */
        const want = [['', PT('系统默认','System default')]].concat(sorted.map(v=>[v.name, voiceLabel(v)]));
        if(!optionsMatch(sel, want)) fillOptions(sel, want);
        sel.value = cur;
      }
      const hint=$('ttsVoiceHint');
      if(hint){
        const all=(p.voices||[]); const zh=all.filter(v=>/^zh/i.test(v.lang||'')).length;
        hint.textContent = !all.length
          ? (panelLang==='en' ? 'No speech voices detected on this system.' : '这台机器上没检测到可用语音。')
          : (panelLang==='en'
            ? ('Detected ' + all.length + ' system voices (' + zh + ' Chinese). These are offline voices; for more natural sound, add "natural voices" in Windows Settings ▸ Time & language ▸ Speech.')
            : ('已检测到 ' + all.length + ' 个系统语音（中文 ' + zh + ' 个），离线可用。想要更自然的声音：点上面按钮去系统里加装「自然语音」，装完重开本软件就会自动出现在这里。'));
      }
    }
    /* R11-2：同语音下拉 —— 主题清单没变就不动 DOM。 */
    if(p.themes){
      const sel=$('themeSelect');
      if(sel){
        const want=(p.themes.length? p.themes : ['（暂无主题）']).map(n=>[String(n), String(n)]);
        if(!optionsMatch(sel, want)) fillOptions(sel, want);
        if(p.activeTheme) sel.value = p.activeTheme;
      }
    }
    if(p.updateUrl !== undefined){ const el=$('updateUrlInput'); if(el && document.activeElement !== el) el.value = p.updateUrl; }
    if(p.feedbackUrl !== undefined){ const el=$('feedbackUrlInput'); if(el && document.activeElement !== el) el.value = p.feedbackUrl; }
    if(p.updateResult !== undefined){ const el=$('updateResult'); if(el) el.textContent = p.updateResult; }
    if(p.updateDownloadUrl !== undefined){
      lastUpdateUrl = p.updateDownloadUrl || '';
      const btn=$('updateOpenBtn');
      if(btn) btn.style.display = lastUpdateUrl ? 'inline-block' : 'none';
    }
    if(p.associateResult !== undefined){ const el=$('associateResult'); if(el) el.textContent = p.associateResult; }
  }

  // ---------- 目录 ----------
  function renderTOC(chapters, current){
    const box = $('tocList');
    box.innerHTML='';
    if(!chapters || !chapters.length){ box.innerHTML='<div class="empty"></div>'; box.firstChild.textContent=PT('暂无目录','No contents'); return; }
    chapters.forEach(ch=>{
      const div=document.createElement('div');
      div.className='item';
      div.textContent=ch.title || PT('第'+(ch.idx+1)+'章', 'Chapter '+(ch.idx+1));
      if(ch.level) div.style.paddingLeft=(9+ch.level*14)+'px';   /* 📑 V4.3.74 层级缩进（与主窗 renderTOC 同步距） */
      if(ch.idx===current) div.classList.add('active');
      div.addEventListener('click', ()=>send('goto', ch.idx));
      box.appendChild(div);
    });
  }

  // ---------- 搜索 ----------
  function renderSearch(p){
    const box=$('searchResults');
    const hint=$('searchHint');
    if(p && p.results !== undefined){
      if(!p.results.length){ box.innerHTML='<div class="empty"></div>'; box.firstChild.textContent=PT('未找到结果','No results'); hint.textContent=PT('共 0 条结果','0 result'); return; }
      box.innerHTML='';
      p.results.forEach(r=>{
        const div=document.createElement('div');
        div.className='item';
        const t=document.createElement('div'); t.className='t'; t.textContent=r.title || (PT('第', '')+(r.idx+1)+PT('章', ' ch'));
        const s=document.createElement('div'); s.className='s'; s.textContent='…'+(r.snippet||'')+'…';
        div.appendChild(t); div.appendChild(s);
        div.addEventListener('click', ()=>send('goto', { idx:r.idx, query:r.query }));
        box.appendChild(div);
      });
      hint.textContent=PT('共 ', '')+p.results.length+PT(' 条结果，点击跳转', ' results — click to jump');
    }
    if(p && p.focus){ const inp=$('searchInput'); if(inp){ inp.focus(); inp.select(); } }
  }

  /* ===================== 📑 V4.3.29 书签列表 =====================
     工具条上那个独立的「书签」按钮撤销后，三件事在这里收口：
       · 在当前位置加书签（按钮显示当前章已有几条；快捷键默认 Ctrl+Shift+M，可在设置里改）
       · 按标题 / 备注过滤
       · 点击直达章节 / ✕ 删除（V4.3.30 起删除**立刻生效**，原地留 5 秒「撤销」，不再弹确认）
     数据由主窗 bookmarkPayload() 下发：{ bookmarks:[{id,idx,title,pos,mode,note,at}], current, canBookmark, currentCount }
     🟥 渲染必须是**幂等重画**：主窗每 1.5s 会重推一次数据，所以本地的过滤词要存在面板自己的缓存里，
        不然一刷新就被冲掉（过滤纯属本面板视角，不回传主窗）。 */
  /* 📑 V4.3.29：currentBookmarked（布尔）已换成 currentCount（当前章有几条）——
     一章可以有多条书签之后，布尔值会骗人（显示"已加"却看不出加了几个）。 */
  let bmCache = { bookmarks:[], current:-1, canBookmark:false, currentCount:0 };
  /* 📑 V4.3.30（#24）：删书签不再弹 confirm —— 弹确认对「删一条书签」这种小事太重，
     而且打断了正在看列表的视线。改成：立刻删掉，同时在原位留一条灰行「已删除 · 撤销」，
     5 秒内点「撤销」把整条原样塞回去；超时这条才真正消失。
     被删的对象存在 bmUndo（它是上一帧数据的引用，主窗删的是它自己那份，不会变成空对象）。 */
  let bmUndo = null, bmUndoTimer = null;
  const BM_UNDO_MS = 5000;
  function clearBmUndo(){
    if(bmUndoTimer){ clearTimeout(bmUndoTimer); bmUndoTimer = null; }
    bmUndo = null;
  }
  function startBmUndo(bm){
    clearBmUndo();
    bmUndo = bm;
    bmUndoTimer = setTimeout(()=>{ clearBmUndo(); renderBookmarkList({}); }, BM_UNDO_MS);
  }
  /* ═════════════ 🖍 V4.3.71 批注列表 ═════════════
     设计取舍：**不按书分组，按章分组** —— 这个面板永远是"当前这本书"的批注
     （跟书签同一个口径：批注存在书 meta 里，跟着书走），所以"按书"没有意义。
     排序固定为「章 → 章内偏移」，与正文顺序一致，用户从列表能反推书里的位置。 */
  let annCache = { annotations: [], current: 0, canAnnot: false, bookTitle: '' };
  function renderAnnotList(p){
    if(!p) return;
    if(p.annotations !== undefined) annCache.annotations = p.annotations || [];
    if(p.current !== undefined) annCache.current = p.current;
    if(p.canAnnot !== undefined) annCache.canAnnot = !!p.canAnnot;
    if(p.bookTitle !== undefined) annCache.bookTitle = p.bookTitle || '';
    const en = panelLang === 'en';
    const box = $('annotList');
    if(!box) return;
    const cnt = $('annCount');
    if(cnt) cnt.textContent = annCache.annotations.length ? (annCache.annotations.length + (en ? ' items' : ' 条')) : '';
    const exp = $('annExportBtn');
    if(exp) exp.disabled = !annCache.annotations.length;
    const q = (($('annFilter') && $('annFilter').value) || '').trim().toLowerCase();
    const all = annCache.annotations.slice().sort((a,b)=> ((a.idx||0)-(b.idx||0)) || ((a.start||0)-(b.start||0)));
    const hit = q ? all.filter(a=>{
      const hay = ((a.text||'') + ' ' + (a.note||'') + ' ' + (a.title||'')).toLowerCase();
      return hay.indexOf(q) >= 0;
    }) : all;
    box.innerHTML = '';
    if(!all.length){
      const e = document.createElement('div'); e.className = 'empty';
      e.textContent = en ? 'No annotations yet — select text in the reader to highlight it' : '还没有批注。在正文里选中一段文字就会弹出高亮浮层';
      box.appendChild(e); return;
    }
    if(!hit.length){
      const e = document.createElement('div'); e.className = 'empty';
      e.textContent = en ? 'No match' : '没有匹配'; box.appendChild(e); return;
    }
    let lastIdx = -1;
    hit.forEach(a=>{
      if(a.idx !== lastIdx){
        lastIdx = a.idx;
        const h = document.createElement('div'); h.className = 'ann-chap';
        h.textContent = a.title || ((en ? 'Chapter ' : '第') + (a.idx + 1) + (en ? '' : '章'));
        if(a.idx === annCache.current) h.classList.add('cur');
        box.appendChild(h);
      }
      const it = document.createElement('div'); it.className = 'ann-item';
      const dot = document.createElement('span'); dot.className = 'ann-dot dot-' + (a.color || 'yellow');
      const body = document.createElement('div'); body.className = 'ann-body';
      const tx = document.createElement('div'); tx.className = 'ann-text'; tx.textContent = a.text || '';
      body.appendChild(tx);
      if(a.note){
        const nt = document.createElement('div'); nt.className = 'ann-note'; nt.textContent = a.note;
        body.appendChild(nt);
      }
      const del = document.createElement('button'); del.className = 'ann-del';
      /* 🎨 与静态按钮同一套线条图标（不写 ✕ 字符 —— 图标门禁禁止字形按钮） */
      del.innerHTML = ico('close', 'ic');
      del.title = en ? 'Delete this annotation' : '删除这条批注';
      del.addEventListener('click', e=>{ e.stopPropagation(); send('annotDelete', a.id); });
      it.appendChild(dot); it.appendChild(body); it.appendChild(del);
      it.title = en ? 'Jump back to the text' : '跳回原文';
      it.addEventListener('click', ()=>send('annotGo', a.id));
      box.appendChild(it);
    });
  }

  function renderBookmarkList(p){
    if(!p) return;
    if(p.bookmarks !== undefined) bmCache.bookmarks = p.bookmarks || [];
    if(p.current !== undefined) bmCache.current = p.current;
    if(p.canBookmark !== undefined) bmCache.canBookmark = !!p.canBookmark;
    if(p.currentCount !== undefined) bmCache.currentCount = Number(p.currentCount) || 0;
    const en = panelLang === 'en';
    /* 「加书签」按钮（📑 V4.3.29：不再兼任「移除」——一章可以有多条之后，
       点一下到底是加还是删就说不清了；删除统一走列表里每条的 ✕）。
       按钮上如实写出当前章已有几条，用户一眼知道自己加没加过。 */
    const tb = $('bmToggleBtn');
    if(tb){
      const n = bmCache.currentCount;
      tb.classList.toggle('on', n > 0);
      tb.textContent = n > 0 ? ('★ ' + (en ? 'Add another' : '再加一个') + '（' + n + '）')
                             : ('☆ ' + (en ? 'Add bookmark' : '加书签'));
      tb.disabled = !bmCache.canBookmark;
      tb.title = bmCache.canBookmark
        ? (en ? 'Bookmark the current position (a chapter can hold several)' : '在当前位置加一条书签（同一章可以加多条）')
        : (en ? 'Open a book first' : '先打开一本书才能加书签');
    }
    const fEl = $('bmFilter');
    const q = ((fEl && fEl.value) || '').trim().toLowerCase();
    /* 📑 V4.3.29：一章可以有多条 → 排序要先按章、再按章内位置，否则同一章的几条顺序会乱跳。 */
    const all = bmCache.bookmarks.slice().sort((a,b)=>(a.idx-b.idx) || ((Number(a.pos)||0)-(Number(b.pos)||0)));
    /* 📑 V4.3.30（#24）：刚删掉的那条按**同一套排序规则**混回原处，用户能一眼看出它原本在第几章。
       它不再是书签了，所以计数不计它（否则会出现「明明删了还显示 1 条」的假象）。 */
    let rows = all, ghostId = null;
    if(bmUndo && !all.some(b => b.id === bmUndo.id)){
      ghostId = bmUndo.id;
      rows = all.concat([bmUndo]).sort((a,b)=>(a.idx-b.idx) || ((Number(a.pos)||0)-(Number(b.pos)||0)));
    }
    // 过滤同时匹配标题和备注（写了「伏笔」也能搜到）
    const list = q ? rows.filter(b=>(String(b.title||'')+' '+String(b.note||'')).toLowerCase().indexOf(q)!==-1) : rows;
    const realN = ghostId ? list.filter(b => b.id !== ghostId).length : list.length;
    const box = $('bookmarkListPanel');
    if(!box) return;
    box.innerHTML = '';
    const cnt = $('bmCount'), hint = $('bmHint');
    /* 🟥 判空必须用 rows 而不是 all：把最后一条书签删掉时 all 已经是空的，
       但此时**恰恰最需要**那行「已删除 · 撤销」留在屏幕上（用 all.length 判断就会把它吃掉）。 */
    if(!rows.length){
      box.innerHTML = '<div class="empty">'+(en?'No bookmarks yet':'还没有书签')+'</div>';
      if(cnt) cnt.textContent = '';
      if(hint) hint.textContent = en
        ? 'Tip: Ctrl+Shift+M bookmarks the current chapter (change it in Settings ▸ Shortcuts)'
        : '提示：Ctrl+Shift+M 给当前章加书签（可在「设置 ▸ 快捷键」里改键）';
      return;
    }
    if(!list.length){
      box.innerHTML = '<div class="empty">'+(en?'No bookmark matches':'没有匹配的书签')+'</div>';
      if(cnt) cnt.textContent = '0 / '+all.length;
      if(hint) hint.textContent = en ? 'Clear the filter to see all' : '清空过滤词看全部';
      return;
    }
    list.forEach(b=>{
      /* 📑 V4.3.30（#24）：幽灵行 —— 数据里已经没了，只是留个位置给「撤销」。 */
      if(ghostId && b.id === ghostId){
        const gd = document.createElement('div');
        gd.className = 'item bm-item bm-ghost';
        const gl = document.createElement('div');
        gl.className = 'bm-main';
        const gt = document.createElement('div');
        gt.className = 'bm-title';
        gt.textContent = b.title || (PT('第', '')+(b.idx+1)+PT('章', ' ch'));
        const gm = document.createElement('div');
        gm.className = 'bm-meta';
        gm.textContent = en ? 'deleted' : '已删除';
        gl.appendChild(gt); gl.appendChild(gm);
        const ub = document.createElement('span');
        ub.className = 'bm-undo';
        ub.textContent = en ? 'Undo' : '撤销';
        ub.title = en ? 'Put it back' : '放回去';
        ub.addEventListener('click', e=>{ e.stopPropagation(); clearBmUndo(); send('bookmarkUndo', { bm: b }); });
        gd.appendChild(gl); gd.appendChild(ub);
        box.appendChild(gd);
        return;
      }
      const div = document.createElement('div');
      div.className = 'item bm-item' + (b.idx === bmCache.current ? ' active' : '');
      const title = b.title || ('第'+(b.idx+1)+'章');
      // 左半：标题 + 章内位置 + 备注
      const left = document.createElement('div');
      left.className = 'bm-main';
      const tEl = document.createElement('div');
      tEl.className = 'bm-title';
      tEl.textContent = title;
      const pct = Math.round((Number(b.pos) || 0) * 100);
      const meta = document.createElement('div');
      meta.className = 'bm-meta';
      meta.textContent = pct > 0 ? (en ? ('at ' + pct + '% of the chapter') : ('读到这章 ' + pct + '%')) : (en ? 'at the beginning' : '章节开头');
      left.appendChild(tEl);
      left.appendChild(meta);
      if(b.note){
        const nt = document.createElement('div');
        nt.className = 'bm-note';
        /* 🎨 V4.3.63：备注前缀 📝 → 铅笔线条图标（edit），与其它按钮同一套 */
        nt.innerHTML = ico('edit', 'ic') + '<span class="bm-note-tx"></span>';
        nt.lastChild.textContent = b.note;
        left.appendChild(nt);
      }
      // 右半：改备注 + 删除（都是**按 id**操作，一章多书签才删得准）
      const acts = document.createElement('div');
      acts.className = 'bm-acts';
      const edit = document.createElement('span');
      edit.className = 'bm-edit';
      edit.textContent = '✎';
      edit.title = en ? 'Edit the note' : '写/改备注';
      edit.addEventListener('click', e=>{
        e.stopPropagation();
        const cur = window.prompt(en ? 'Note for this bookmark' : '给这条书签写点备注（可留空）', b.note || '');
        if(cur === null) return;
        send('bookmarkNote', { id: b.id, note: cur });
      });
      const del = document.createElement('span');
      del.className = 'bm-del';
      /* 🎨 V4.3.63：✕ 字符 → 与静态按钮同一套线条图标（close） */
      del.innerHTML = ico('close', 'ic');
      del.title = en ? 'Delete this bookmark' : '删除这个书签';
      /* 📑 V4.3.30（#24）：删除不再弹确认 —— 弹框对「删一条书签」这种小事太重，还会把视线从列表拽走。
         改成立刻删 + 原位留一手「撤销」（见 startBmUndo），破坏性操作的手感从「先问」变成「删了能反悔」。 */
      del.addEventListener('click', e=>{
        e.stopPropagation();
        startBmUndo(b);
        send('bookmarkDel', { id: b.id });
      });
      acts.appendChild(edit);
      acts.appendChild(del);
      div.appendChild(left);
      div.appendChild(acts);
      div.addEventListener('click', ()=>send('bookmarkGoto', { id: b.id }));
      box.appendChild(div);
    });
    if(cnt) cnt.textContent = realN + ' / ' + all.length + (en ? '' : ' 条');
    if(hint) hint.textContent = ghostId ? (en ? 'Deleted — press Undo to put it back' : '已删除，点「撤销」放回去')
                                        : (en ? 'Click a bookmark to jump; ✕ to delete' : '点击书签直达章节，✕ 删除');
  }
  function initBookmark(){
    const tf = $('bmToggleBtn');
    if(tf) tf.addEventListener('click', ()=>send('bookmark'));
    const f = $('bmFilter');
    // 只按本地缓存重画，不去主窗要数据：过滤是纯本地视角，回传反而会和 1.5s 同步打架
    if(f) f.addEventListener('input', ()=>renderBookmarkList({}));
    const c = $('bmFilterClear');
    if(c) c.addEventListener('click', ()=>{ if(f){ f.value=''; renderBookmarkList({}); } });
    const fEnter = $('bmFilter');
    if(fEnter) fEnter.addEventListener('keydown', e=>{ if(e.key==='Escape') send('close'); });
  }

  // ---------- 书源 ----------
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
        /* 🔍 V4.3.86（用户：把重复的功能统一）：原来面板里有**两个**搜索框（顶部 #searchInput
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
