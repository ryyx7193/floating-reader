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
