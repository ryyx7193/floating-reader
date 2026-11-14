/* 静态文案的「中文原文 → 英文」对照表（自动生成 + 手工校订，见 work/_i18n_gen.js）
 *
 * 为什么要有这张表：面板与小窗里有 190 多处静态文案，多数没有 id/class，
 * 只能靠位置型选择器定位 —— panel.html 一插行就整片串位。改用
 * `<span data-i18n="正文选择器">` 这种**跟着元素走**的标记后，插行不再影响翻译；
 * 而门禁可以直接查「每个含中文的可见元素是否都带了 data-i18n」，
 * 从结构上挡住"新加了一行中文却忘了翻译"（这正是 V4.3.43 那轮发现 R3-4 的成因）。
 *
 * 键 = 中文原文（gettext 风格）。改中文文案时，这里和 HTML 两边一起改。
 *
 * 用法：由 index.html / panel.html 通过 <script src="./scripts/i18n-literals.js"> 加载，
 *       各自的语言切换函数里调 window.applyI18nLiterals(root, lang)。
 */
(function(){
  const LITERALS = {
      "🛠 工具栏": "🛠 Toolbar",
      "缩小": "Smaller",
      "放大": "Larger",
      "单行": "Single line",
      "分页": "Paged",
      "皮肤": "Theme",
      "默认等宽": "Default mono",
      "微软雅黑": "Microsoft YaHei",
      "宋体": "SimSun",
      "黑体": "SimHei",
      "楷体": "KaiTi",
      "华文楷体": "STKaiti",
      "楷体 GB2312": "KaiTi GB2312",
      "方正楷体": "FZKai",
      "汉仪楷体": "HYKaishu",
      "华文行楷": "STXingkai",
      "仿宋": "FangSong",
      "幼圆": "YouYuan",
      "等线": "DengXian",
      "思源黑体": "Source Han Sans",
      "思源宋体": "Source Han Serif",
      "华文中宋": "STZhongsong",
      "霞鹜文楷": "LXGW WenKai",
      "苹方": "PingFang",
      "鸿蒙黑体": "HarmonyOS Sans",
      "小米 MiSans": "MiSans",
      "阿里普惠体": "Alibaba PuHuiTi",
      "得意黑": "Smiley Sans",
      "更纱黑体": "Sarasa Gothic",
      "微软正黑": "Microsoft JhengHei",
      "Noto 黑体": "Noto Sans SC",
      "衬线英文": "Serif",
      "无衬线": "Sans-serif",
      "文字颜色": "Text color",
      "重置颜色": "Reset color",
      "文字透明度": "Text opacity",
      "窗口透明度": "Window opacity",
      "阴影+线条": "Border+shadow",
      "行距": "Line height",
      /* 📖 V4.3.70：页边距。面板里那一行的 label 带 data-i18n，C5 会核对每个 data-i18n
         都能解析出英文 —— 漏在这里就是"切英文后这一格还是中文"。 */
      "页边距": "Page margin",
      /* 🖍 V4.3.71：批注面板（data-i18n 的每个值都必须能解析出英文，_i18n_gate C5 会核对） */
      "批注": "Annotations",
      "导出 Markdown": "Export Markdown",
      "还没有批注": "No annotations yet",
      "过滤原文 / 笔记": "Filter text / note",
      "自动滚动速度（单行）": "Auto-scroll (single line)",
      "关": "Off",
      "吸色": "Pick color",
      "变灰": "Fade",
      "朗读": "Read aloud",
      "书签列表": "Bookmarks",
      "全文": "Search",
      "书源": "Sources",
      "书架": "Shelf",
      /* 🆕 V4.3.57（需求三批 1）：书架排序 + 继续阅读 */
      "最近在读": "Recently read",
      "按进度": "By progress",
      "按添加时间": "By date added",
      "排序方式": "Sort by",
      "脱监": "Privacy",
      "伪装皮肤": "Disguise skin",
      "办公文档": "Office document",
      "代码 / 终端": "Code / terminal",
      "数据表格": "Spreadsheet",
      "进入伪装": "Enter disguise",
      "伪装外观常驻": "Keep disguise look while reading",
      "开启": "On",
      "阅读统计": "Reading stats",
      "今日": "Today",
      "累计": "Total",
      "0 分钟": "0 min",
      "连续天数": "Day streak",
      "设置": "Settings",
      "外观": "Appearance",
      "移出延迟关闭": "Auto-close delay",
      "自动对比度": "Auto contrast",
      "快捷键": "Shortcuts",
      "上一章": "Previous chapter",
      "下一章": "Next chapter",
      "隐藏/显示": "Hide / show",
      "专注模式": "Focus mode",
      "全屏": "Full screen",
      "最小化": "Minimize",
      "当前章搜索": "Search in chapter",
      "全文搜索": "Full-text search",
      "自动滚动": "Auto-scroll",
      "取色点": "Pick point",
      "工具栏": "Toolbar",
      "脱离监控": "Privacy guard",
      "目录": "Contents",
      "书签": "Bookmark",
      "恢复默认快捷键": "Reset shortcuts",
      "朗读当前章": "Read current chapter",
      "开始/暂停": "Play / pause",
      "停止": "Stop",
      "语速": "Speed",
      "语音": "Voice",
      "后台朗读": "Background playback",
      "去系统装更多语音…": "Install more voices in Windows…",
      "主题": "Themes",
      "排版预设": "Layout presets",
      "护眼": "Eye-care",
      "夜间": "Night",
      "纸质": "Paper",
      "已保存主题": "Saved themes",
      "应用": "Apply",
      "导出": "Export",
      "删除": "Delete",
      "导入主题": "Import theme",
      "清除主题": "Clear theme",
      "更新": "Updates",
      "清单地址": "Manifest URL",
      "检查更新": "Check for updates",
      "打开下载页": "Open download page",
      "文件关联": "File association",
      "打开方式": "Open with",
      "登记文件类型": "Register file types",
      "系统默认应用": "Default apps",
      "数据": "Data",
      "数据管理": "Data",
      "导入": "Import",
      "自定义CSS": "Custom CSS",
      "清除": "Clear",
      "日志": "Logs",
      "导出日志": "Export logs",
      "查看日志": "View logs",
      "日志目录": "Log folder",
      "语言": "Language",
      "中文": "中文",
      "反馈": "Feedback",
      "诊断": "Diagnostics",
      "脱监自检": "Privacy test",
      "复制诊断": "Copy diagnostics",
      "导出反馈包": "Export feedback bundle",
      "反馈地址": "Feedback URL",
      "https://（可留空）": "https:// (optional)",
      "打开反馈地址": "Open feedback URL",
      "支持开发": "Support this project",
      "自动追更": "Auto-update",
      "检查间隔": "Check interval",
      "30 分钟": "30 min",
      "1 小时": "1 hour",
      "3 小时": "3 hours",
      "6 小时": "6 hours",
      "前台监听": "Foreground watch",
      "监听程序": "Watch processes",
      "如 Weixin.exe,DingTalk.exe": "e.g. Weixin.exe,DingTalk.exe",
      "恢复默认设置": "Reset all settings",
      "📚 目录": "📚 Contents",
      "暂无目录": "No contents",
      "🔍 全文搜索": "🔍 Full-text search",
      "输入关键词，回车/输入即搜": "Type a keyword — search as you type",
      "关闭": "Close",
      "关闭搜索": "Close search",
      "上一个": "Previous",
      "下一个": "Next",
      "加载": "Load",
      "输入内容后自动搜索": "Type to search",
      "书库": "Site library",
      "书源搜索过的站会自动存进来。填书名后点某站的「搜本站」，就用那座站再搜一次。": "Sites you have searched are stored automatically. Type a title, then hit \"Search here\" on a site.",
      "书名 / 作者": "Title / author",
      "站点域名或主页 URL": "Site domain or home page URL",
      "切换书籍": "Switch book",
      "跟随": "Follow",
      "联动": "Link actions",
      "操作": "Actions",
      "当前配色": "Current color",
      "重置": "Reset",
      "当前吸到的目标配色": "Color sampled from the target",
      "＋ 加入书库": "＋ Add to library",
      "还没有站点。用「书源」搜一次书，站点会自动入库。": "No sites yet. Search once in Sources and the site is added automatically.",
      "📡 书源": "📡 Sources",
      "请遵守目标网站条款与版权规定。本软件不内置任何书源，仅在您主动点击时抓取。": "Follow the target site terms and copyright rules. This app ships no built-in source and only fetches when you click.",
      /* 🆕 V4.3.85 自动抓取（书源页主入口）+ 「高级」折叠 */
      "自动抓取": "Auto fetch",
      "粘贴目录页或详情页的 URL，剩下的交给它：自动识别章节与正文、抓完整本并直接打开。": "Paste the index or detail page URL and let it do the rest: it finds the chapters and the content automatically, fetches the whole book and opens it.",
      "自动抓取并载入": "Auto fetch and load",
      "高级": "Advanced",
      "这里是给特殊站点准备的手动配置：自己写选择器、按关键词搜索、逐章核对。一般用不到。": "Manual setup for unusual sites: write your own selectors, search by keyword, check chapter by chapter. Most people never need this.",
      "规则": "Rules",
      "当前规则": "Current rule",
      "名称": "Name",
      "书源名称": "Source name",
      "编码": "Encoding",
      "utf-8（可手输，如 shift_jis）": "utf-8 (free text, e.g. shift_jis)",
      "章节选择器": "Chapter selector",
      "如 .list a 或 dd a": "e.g. .list a or dd a",
      "链接属性": "Link attribute",
      "标题属性": "Title attribute",
      "留空=取元素文字": "Empty = element text",
      "正文选择器": "Content selector",
      "如 #content 或 .read-content": "e.g. #content or .read-content",
      "移除选择器": "Remove selector",
      "如 script,style,.ad": "e.g. script,style,.ad",
      "并发抓取": "Concurrency",
      "请求间隔": "Request delay",
      "搜索URL": "Search URL",
      "书库站点": "Library site",
      "填入搜索URL": "Fill search URL",
      "结果选择器": "Result selector",
      "如 .result-item": "e.g. .result-item",
      "标题选择器": "Title selector",
      "如 h3 a": "e.g. h3 a",
      "作者选择器": "Author selector",
      "如 .author（可留空）": "e.g. .author (optional)",
      "链接选择器": "Link selector",
      "结果链接属性": "Result link attribute",
      "href（原先是写死的）": "href (was hard-coded)",
      "章节倒序": "Reverse chapter list",
      "正文自动分页": "Auto-paginate content",
      "保存规则": "Save rule",
      "导入JSON": "Import JSON",
      "🧪 试抓（验证选择器）": "🧪 Test fetch (validate selectors)",
      "搜索": "Search",
      "我的书架": "My books",
      "重置吸色": "Reset color picking",
      "输入书名/作者": "Title or author",
      "下一页": "Next page",
      "取消": "Cancel",
      "抓取": "Fetch",
      "粘贴目录/详情页 URL": "Paste the index/detail page URL",
      "抓章节": "Fetch chapters",
      "抓取正文并载入": "Fetch content and load",
      "重试失败章节": "Retry failed chapters",
      "📚 书架": "📚 Bookshelf",
      "全选/全不选": "Select all / none",
      "导出选中": "Export selected",
      "导入书架": "Import shelf",
      "加载中…": "Loading…",
      "📑 书签列表": "📑 Bookmark list",
      "过滤标题（输入即筛）": "Filter by title (as you type)",
      "还没有书签": "No bookmarks yet",
      "📖 阅读器": "📖 Reader",
      "隐藏窗口": "Hide window",
      "点击「加载」选择文件": "Click \"Load\" to select file",
      "正在解析…": "Parsing…",
      "重新抓取本章": "Refetch this chapter",
      "搜索...": "Search...",
      "📌 请加载文件": "📌 No file loaded",
      "📖 阅读": "📖 Reading",
      "拖动调整窗口大小": "Drag to resize window",
      "确定": "OK",
      "📄 松开导入文件": "📄 Drop files to import",
      "列表反序（站点把章节倒着排时打开，载入后即按正序读）": "Reversed list (turn on when the site lists chapters newest-first; reading order is fixed after loading)",
      "抓取时分批续抓，不全量一次性拉（适合几千章的大书）": "Fetch content in batches instead of all at once (better for books with thousands of chapters)",
      "（选一个站点）": "(Pick a site)",
      "（书库还是空的）": "(Library is empty)",
      "（无规则，请先保存一条）": "(No rule — save one first)",
      "输入口令": "Enter password",
      /* 🆕 V4.3.53（R12-2）伴随模式（panel.html 新分区 + 说明行） */
      "伴随模式": "Companion mode",
      "跟随目标程序": "Follow target app",
      "目标程序": "Target app",
      "如 Weixin.exe": "e.g. Weixin.exe",
      "陪显示时机": "Show while",
      "目标在前台时": "Target is in front",
      "目标窗口可见时": "Target window visible",
      "目标一开着就陪": "Whenever the target runs",
      /* 🆕 V4.3.55：贴边语义改嵌入叠加 —— 标签与选项全换新文案（zh/en 同加，规则 20） */
      "嵌入位置": "Embed area",
      "不嵌入": "No embed",
      "自由跟随": "Follow freely",
      "嵌入·右侧": "Embed right",
      "嵌入·左侧": "Embed left",
      "嵌入·上方": "Embed top",
      "嵌入·下方": "Embed bottom",
      "嵌入·居中": "Embed center",
      /* 🆕 V4.3.55（生命周期联动） */
      "关闭联动": "Close link",
      "最小化联动": "Minimize link",
      "融入目标配色": "Match target color",
      "重新贴边": "Re-dock",
      "贴回去": "Dock again",
      "目标关掉后阅读器会收进托盘待命（不退出），目标再打开时自动回来。": "When the target closes, the reader waits in the tray (it does not quit) and returns automatically when the target reopens.",
      /* 🐋 V4.3.53（R12-4）伴随模式顶栏快捷入口的三条新文案（主人 2026-10-13 追加需求 C）。
         ⚠️ zh/en 必须同加 —— t(k) 缺 key 是**静默失败**（规则 20）。 */
      "伴随模式（点开就近调整 · 右键直接开关）": "Companion mode (click to adjust here · right-click to toggle)",
      "跟随已暂停": "Following paused",
      "换个位置": "Change area",
      "检测阅读器所在位置的应用": "Detect the app under the reader",
      "关掉": "Turn off"
  };

  /* 只处理带标记的元素；没标记的一律不碰（运行期由 JS 改文案的元素故意不标记）。
   *
   * `data-i18n` 的值有两种形态，都要支持：
   *   ① 中文原文（"正文选择器"）—— 本表自己的键，gettext 风格，用于新增的静态文案；
   *   ② 语义键（"fontDefault"）—— index.html 里**原有**的写法，值在同窗口的 I18N 表里。
   * 传入 extra（= 主窗的 I18N 表）即可解析第 ② 种；面板窗口没有这套老表，不传。
   *
   * 🟥 调用时机很关键：必须在**本函数会写、而别的 JS 也会写**的元素被别处赋值**之前**调用。
   *    有些元素（状态栏 #statusText、模式指示 #modeIndicator、书签按钮 #bmToggleBtn）
   *    平时由 JS 按运行状态改文案，它们同样带了 data-i18n —— 让"后写者"（JS 按状态算出的值）
   *    覆盖"先写者"（静态翻译），才不会被固定文案顶掉。所以两个 applyXxxLang 里
   *    这一句都放在最前面。 */
  function applyI18nLiterals(root, lang, extra){
    const en = (lang === 'en');
    const pick = zh => {
      if (typeof LITERALS[zh] === 'string') return en ? LITERALS[zh] : zh;
      if (extra && extra[lang] && typeof extra[lang][zh] === 'string') return extra[lang][zh];
      return undefined;
    };
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach(el => {
      /* 🟥 V4.3.68：带 data-runtime 的元素**内容归 JS 管**（例如正文容器 #novelContent），
         静态文案只用于首屏。跳过它们，否则一次 applyLanguage 就把正文换成占位文案 ——
         这是 V4.3.67 及更早的真实 bug（切阅读模式正文直接消失）。 */
      if (el.hasAttribute('data-runtime')) return;
      const v = pick(el.getAttribute('data-i18n'));
      if (v !== undefined && el.textContent !== v) el.textContent = v;
    });
    r.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const v = pick(el.getAttribute('data-i18n-ph'));
      if (v !== undefined) el.placeholder = v;
    });
    r.querySelectorAll('[data-i18n-title]').forEach(el => {
      const v = pick(el.getAttribute('data-i18n-title'));
      if (v !== undefined) el.setAttribute('title', v);
    });
  }

  window.READER_I18N_LITERALS = LITERALS;
  window.applyI18nLiterals = applyI18nLiterals;
})();
