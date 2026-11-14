const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// 用独立 userData，避免测试数据写进正式版书架
app.setPath('userData', path.join(__dirname, '..', '_smoke_userdata'));

// 🟥 V4.3.18：本 smoke 是**独立主进程，不加载 main.js**（它自己开窗），所以这里按真实主进程的
// 同名约定注册「内容保护」IPC 桩，用来验证渲染层**发出去的值**与读回的值是否自洽。
// 真·系统级防截屏（SetWindowDisplayAffinity / WDA_EXCLUDEFROMCAPTURE）没法在无头冒烟里断言，
// 由 work/asar-src/_protect_probe.js 单独实测（本机结果：关保护 aff=0、开保护 aff=17、
// 截屏里该窗口品红像素 249273 -> 0，且可逆）。这部分能力边界写进了 CHANGELOG。
let smokeProtectState = false;                // 与 main.js 一致：V4.3.19 起**默认关闭**
ipcMain.on('content:protect', (e, on) => { smokeProtectState = !!on; });
ipcMain.handle('content:protect-get', () => smokeProtectState);
// 🛡 脱监自检：真实自检要抓两次整屏（重操作、且依赖真主进程），冒烟里用桩验证渲染层链路即可。
// 真·端到端自检由 work/asar-src/_uiprobe5.js 实测（本机 verdict=ok，offCount 29161 → onCount 0）。
ipcMain.handle('content:selftest', () => ({ verdict: 'ok', offCount: 1, onCount: 0, level: 'full', note: 'stub' }));
/* 🆕 V4.3.24：备份桩 —— 自动备份里的章节**必须是明文**（不能再用机器绑定的密钥加密），
   否则换机/重装后这个"保命"备份恰恰解不开。这里把收到的数据留下，供断言检查。 */
let smokeBackupSeen = null;
ipcMain.handle('backup:save', async (e, data) => { smokeBackupSeen = data; return { ok: true, name: 'stub-backup' }; });

const problems = [];
app.on('render-process-gone', (e, wc, d) => {
  console.log('RENDER_GONE', d && d.reason, d && d.exitCode);
  problems.push('RENDER_GONE ' + (d && d.reason));
});
app.on('child-process-gone', (e, d) => { console.log('CHILD_GONE', JSON.stringify(d)); });

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  /* V4.3.35：本文件末尾会**故意**注入一段内联脚本，自检「CSP 是否真的拦得住内联脚本」——
     那次违规是预期的自检结果，不是问题。只在自检窗口期内放行，窗口期之外照常上报。 */
  let cspSelfTestWindow = false;
  win.webContents.on('console-message', (e, level, message) => {
    if (level < 2) return;
    // 开发环境专用的 CSP 安全提示，打包后不再出现，忽略
    if (String(message).includes('Electron Security Warning')) return;
    if (cspSelfTestWindow && String(message).includes('Content Security Policy')) return;
    problems.push('CONSOLE: ' + message);
  });
  win.webContents.on('did-fail-load', (e, code, desc) => problems.push('DID_FAIL_LOAD ' + code + ' ' + desc));

  await win.loadFile('index.html');
  await new Promise(r => setTimeout(r, 1500));

  /* 🟥 V4.3.23：本 smoke 与其它 smoke 共用 `_smoke_userdata`，上一次运行留下的设置会跨次残留
     （典型：脱监开关 fcp / 实测结论 fpv）→ 「默认应为关闭」这类断言会被上一次的残留顶掉，
     变成偶发失败。这里先把与本次断言的默认值有关的键清干净再重载，让断言真正确定。 */
  try {
    await win.webContents.executeJavaScript(`(function(){
      try{ localStorage.removeItem('fcp'); localStorage.removeItem('fpv'); }catch(e){}
      return 'cleared';
    })()`);
    await win.webContents.reload();
    await new Promise(r => setTimeout(r, 1200));
  } catch (e) { console.log('PREP_CLEAN_FAILED', String((e && e.message) || e)); }

  let result = '';
  try {
    result = await win.webContents.executeJavaScript(`(async function(){
    const R = window.__reader;
    const out = {};
    out.hasReader = !!R;
    if(!R) return JSON.stringify(out);

    out.skins = R.CONFIG.SKINS.join(',');
    // 主窗的字体下拉属于已摘除的影子 UI；字体列表(14 项)真源在工具栏小窗，由 smoke3 校验
    out.fontSelectRemoved = !document.getElementById('fontSelect');

    // 多语言：切换英文后主界面按钮应随之变化
    R.state.chapters = [];
    const prevBtn = document.getElementById('prevBtn');
    R.setLanguage ? R.setLanguage('en') : null;
    out.prevBtnEn = prevBtn ? prevBtn.textContent.trim() : '';
    const helpTitle = document.querySelector('.shortcut-help .title');
    out.helpEn = helpTitle ? helpTitle.textContent.trim() : '';
    R.setLanguage ? R.setLanguage('zh') : null;
    out.prevBtnZh = prevBtn ? prevBtn.textContent.trim() : '';

    /* 窗口透明度 -> 控件透明度 + 文字对比
       🔍 V4.3.88：阴影强度现在**跟字号挂钩**（<15px 不加阴影，小字叠阴影会糊）。
       所以这里必须先把字号拉大再测 —— 这条断言的本意是“越透明文字越醒目”，
       那个规则对大字依然成立；在 12px 下取不到阴影是新设计，不是缺陷。 */
    R.state.fontSize = 22;
    R.applyWindowOpacity(35);
    const mc = document.getElementById('mainContent');
    out.uiAlpha = mc.style.getPropertyValue('--ui-alpha');
    out.textShadow = mc.style.getPropertyValue('--text-shadow-strength');
    R.applyWindowOpacity(100);

    // 皮肤归一化（旧索引 4 = 深色 -> 新索引 1）
    const hadNormalize = typeof R.normalizeSkinIndex === 'function';
    out.hasNormalize = hadNormalize;

    // 失败章节占位 + 重抓入口
    R.state.chapters = [{ title:'第1章 失败', content:'', failed:true, url:'https://example.com/1' }];
    R.state.currentIndex = 0;
    R.renderChapter();
    const bar = document.getElementById('failedBar');
    out.failedBarOn = !!(bar && bar.classList.contains('on'));
    out.failedText = document.getElementById('failedText') ? document.getElementById('failedText').textContent.trim() : '';

    // 上下键滚动
    R.state.chapters = [{ title:'长文', content: Array.from({length:200},(_,i)=>'第'+i+'行内容').join('\\n') }];
    R.state.currentIndex = 0;
    R.renderChapter();
    await new Promise(r=>setTimeout(r,250));
    const box = document.getElementById('novelContent');
    box.scrollTop = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key:'ArrowDown', bubbles:true }));
    out.scrolled = box.scrollTop;

    // 识别自家导出文件
    const shelf = { app:'浅水鲸书架', version:'3.11.0', count:1, books:[{ meta:{ title:'测试书', sourceName:'书源', chapterCount:1 }, chapters:[{ title:'第1章', content:'正文' }] }] };
    out.smartShelf = await R.applyImportedData(shelf);
    const data = { version:'3.11.0', kind:'reader-data', settings:{ flang:'zh' }, bookmarks:[], chapters:[{ title:'备份章', content:'abc' }], currentIndex:0 };
    out.smartData = await R.applyImportedData(data);
    out.notMine = await R.applyImportedData({ hello:'world' });

    /* 📑 V4.3.29 #25：书库（fsites）到底有没有真的随备份走？——以前只"看起来"是设置的一部分，
       没有任何一处验证过。这里做**正/负对照**：
         · 正：fsites（用户数据）必须出现在快照里，且真的被 saveBackup 写进备份桩；
         · 负：fpv（只对本机有效的防截屏结论）必须**不**进备份，否则换机会"继承"别台的结论。 */
    localStorage.setItem('fsites', JSON.stringify([{ host:'lib.example', name:'测试站' }]));
    localStorage.setItem('fpv', JSON.stringify({ st:'passed', at:1, fp:'probe-fingerprint' }));
    try { await R.saveBackup(); } catch (e) { out.backupThrew = String(e && e.message || e); }
    const snap = R.collectSettingsSnapshot();
    out.sitesInSnapshot = Array.isArray(snap.fsites) && snap.fsites.length === 1;
    out.fpvInSnapshot = Object.prototype.hasOwnProperty.call(snap, 'fpv');

    /* 📑 V4.3.29 #22 新书签模型：
         ① 一章可以加多条；② 位置记成比例 0~1；③ 同一位置重复添加要被挡住；
         ④ 按 id 删一条时**同章其它条必须还在**（旧模型按章节号删，一删就是一整章）；
         ⑤ 备注可读回；⑥ 旧模型（无 id）自动迁移且不丢；⑦ 脏数据（idx 不是数字）要被丢掉。 */
    /* 🟥 这段脚本本身写在模板字符串里，换行必须写成 '\\n'（写成 '\n' 会被外层提前解释成真换行，
       生成的代码直接语法错误 —— 上面那行 200 行的夹具就是这么写的）。 */
    R.state.chapters = [{ title: '书签章', content: Array.from({ length: 1200 }, (_, i) => '第' + i + '行内容').join('\\n') }];
    R.state.currentIndex = 0;
    R.renderChapter();
    const nb = document.getElementById('novelContent');
    await new Promise(r => setTimeout(r, 500));        // 分块渲染要一会儿内容才够高
    out.bmScrollable = nb.scrollHeight > nb.clientHeight + 50;
    R.state.bookmarks = [];
    nb.scrollTop = 0;
    const bm1 = R.addBookmark('第一个');
    nb.scrollTop = Math.floor(nb.scrollHeight / 2);
    await new Promise(r => setTimeout(r, 80));
    const bm2 = R.addBookmark('第二个');
    out.bmTwoInOneChapter = R.state.bookmarks.length === 2 && !!bm1 && !!bm2 && bm1.id !== bm2.id;
    out.bmHasPos = R.state.bookmarks.every(b => typeof b.pos === 'number' && b.pos >= 0 && b.pos <= 1);
    out.bmPosDiffer = bm1 && bm2 ? Math.abs((bm1.pos || 0) - (bm2.pos || 0)) > 0.01 : false;
    const bmDup = R.addBookmark('重复');               // 同一位置再来一次应被挡住
    out.bmDupRejected = (bmDup === null) && R.state.bookmarks.length === 2;
    out.bmDeleteById = R.removeBookmark(bm1.id) === true && R.state.bookmarks.length === 1 && R.state.bookmarks[0].id === bm2.id;
    out.bmNote = R.setBookmarkNote(bm2.id, '改过的备注') === true && R.state.bookmarks[0].note === '改过的备注';
    /* 📑 V4.3.30 #24：删除改成「内联撤销」之后，被删的那条要能**原样**塞回去。
       三条断言分别锁：回去的是同一条（id / 章内位置都不许漂）、重复撤销不许产生第二条、脏数据塞不进来。 */
    const bmBack = bm2 ? Object.assign({}, (R.findBookmark(bm2.id) || {})) : null;
    R.removeBookmark(bm2.id);
    const bmGone = bmBack ? R.findBookmark(bmBack.id) : {};          // 删完之后不能还在
    out.bmUndoGone = !!bmBack && bmGone === null;
    const bmRestored = bmBack ? R.restoreBookmark(bmBack) : false;
    const bmAfter = bmBack ? R.findBookmark(bmBack.id) : null;
    out.bmUndoRestore = bmRestored === true && !!bmAfter && bmAfter.idx === bmBack.idx && bmAfter.title === bmBack.title
      && Math.abs((bmAfter.pos || 0) - (bmBack.pos || 0)) < 1e-9 && R.state.bookmarks.length === 1;
    out.bmUndoOnce = !!bmBack && R.restoreBookmark(bmBack) === false && R.state.bookmarks.length === 1;
    out.bmUndoDirty = R.restoreBookmark({ idx: 'x', title: '脏数据' }) === false && R.restoreBookmark(null) === false
      && R.restoreBookmark(undefined) === false && R.state.bookmarks.length === 1;
    R.state.bookmarks = [];
    const migrated = R.normalizeBookmarks([{ idx: 3, title: '老书签' }]);
    out.bmMigrate = migrated.length === 1 && typeof migrated[0].id === 'string' && migrated[0].idx === 3 && migrated[0].pos === 0;
    out.bmMigrateDirty = R.normalizeBookmarks([{ idx: 'x' }, null, { idx: 0 }]).length === 1;
    R.state.bookmarks = [];

    // 取色点开关
    try { R.togglePickPoint(); out.pickPoint = R.state.pickPointMode; R.togglePickPoint(); } catch(e) { out.pickPointError = String(e && e.message || e); }

    // 书架导出结构 + 增量更新入口（无书源信息的书应被跳过而不是报错）
    const exp = await R.exportShelfBooks([]);
    out.exportApp = exp && exp.app;
    out.exportCount = exp && exp.count;
    const upd = await R.checkBookUpdates([]);
    out.updateTotal = upd && upd.totalNew;
    out.updateReportIsArray = Array.isArray(upd && upd.report);
    out.updateSkipped = (upd && upd.report && upd.report.length) ? upd.report[0].skipped : null;

    // 加密导出往返（口令正确可还原，口令错误应抛错）
    const env = await R.encryptExport({ hello:'世界', n:42 }, 'p@ss123');
    out.encEnv = R.isEncryptedExport(env);
    const back = await R.decryptExport(env, 'p@ss123');
    out.decRoundTrip = !!(back && back.hello === '世界' && back.n === 42);
    out.wrongPwd = 'no-error';
    try { await R.decryptExport(env, 'bad'); } catch(e) { out.wrongPwd = 'threw'; }
    out.plainNotEnc = R.isEncryptedExport({ app:'浅水鲸书架', books:[] }) === false;
    out.envHasKdf = env && env.kdf === 'PBKDF2-SHA256' && env.iterations >= 100000;

    // 版本比较
    out.newer1 = R.versionNewer('3.12.0', '3.11.0');
    out.newer2 = R.versionNewer('3.11.0', '3.11.0');
    out.newer3 = R.versionNewer('3.9.9', '3.11.0');

    // 快捷键：默认 9 项、冲突被拒、可自定义、可恢复默认
    R.resetShortcuts();
    out.shortcutCount = Object.keys(R.state.shortcuts).length;
    const conflicted = R.setShortcut('search', R.state.shortcuts.prev);
    out.conflictRejected = (conflicted === false) && (R.state.shortcuts.search === 'Ctrl+F');
    R.setShortcut('search', 'Ctrl+Alt+9');
    out.customShortcut = R.state.shortcuts.search === 'Ctrl+Alt+9';
    R.resetShortcuts();
    out.shortcutReset = R.state.shortcuts.search === 'Ctrl+F';

    // 主题管理
    out.themesArray = Array.isArray(R.listThemes());
    out.applyMissingTheme = R.applySavedTheme('不存在的主题') === false;

    // 朗读接口
    out.ttsApi = typeof R.ttsToggle === 'function' && typeof R.ttsStop === 'function' && !!R.TTS && R.TTS.state === 'idle';

    // 取样点元素（窗口内的可见取色点）
    const dot = document.getElementById('pickPreview');
    out.pickDot = !!(dot && dot.querySelector('.swatch') && dot.querySelector('.hex') && dot.querySelector('.tag'));

    // 多书标签栏 + 反馈接口
    out.tabBar = !!document.getElementById('tabBar');
    // 影子 UI：V4.0 分窗遗留的内嵌面板（toolbarPanel / settingsPanel / tocPanel）
    // 应由 app.js 在启动时从主窗 DOM 摘除，不再残留
    out.shadowUiRemoved = !document.getElementById('toolbarPanel')
      && !document.getElementById('settingsPanel')
      && !document.getElementById('tocPanel');
    out.tabsApi = (typeof R.refreshTabs === 'function') && (typeof R.exportFeedback === 'function');
    out.feedbackIpc = !!(window.readerAPI && typeof window.readerAPI.exportFeedback === 'function');
    // 模块化：工具与加密来自独立脚本
    out.modules = !!(window.ReaderUtil && window.ReaderCrypto && window.ReaderTTS && window.ReaderThemes);
    out.utilOk = window.ReaderUtil.versionNewer('4.0.0', '3.12.1') === true;
    await R.refreshTabs();
    out.tabsRendered = true;

    // 老板模式（伪装层）：三种皮肤都要能画出来，退出要擦干净
    out.disguiseModule = !!window.ReaderDisguise;
    out.disguiseSkins = window.ReaderDisguise ? window.ReaderDisguise.SKINS.join(',') : '';
    const dg = {};
    if (window.ReaderDisguise) {
      ['word', 'code', 'sheet'].forEach(sk => {
        window.ReaderDisguise.show(sk);
        const el = document.getElementById('disguiseLayer');
        dg[sk] = !!(el && el.classList.contains('on') && el.getAttribute('data-skin') === sk && el.innerHTML.length > 400);
      });
      window.ReaderDisguise.hide();
      const el2 = document.getElementById('disguiseLayer');
      dg.cleaned = !!(el2 && !el2.classList.contains('on') && el2.innerHTML === '');
    }
    out.disguiseSkinsOk = !!(dg.word && dg.code && dg.sheet && dg.cleaned);
    R.toggleDisguise();
    out.disguiseEntered = !!(R.state.isDisguised && window.ReaderDisguise.isActive());
    R.toggleDisguise();
    out.disguiseExited = !(R.state.isDisguised || window.ReaderDisguise.isActive());

    // 前台监听（自动隐身）：IPC 通道、状态与持久化
    // （界面元素在独立小窗 panel.html 里，由 smoke3 校验）
    out.fgWatchApi = !!(window.readerAPI && typeof window.readerAPI.setFgWatch === 'function');
    const fgBefore = !!R.state.fgWatchEnabled;
    R.setFgWatchList('wechat.exe, dingtalk.exe');
    out.fgWatchListSaved = R.state.fgWatchList === 'wechat.exe, dingtalk.exe';
    R.toggleFgWatch();
    out.fgWatchToggled = R.state.fgWatchEnabled === !fgBefore;
    R.toggleFgWatch();
    out.fgWatchRestored = R.state.fgWatchEnabled === fgBefore;

    // 标题栏图标：全部换成线条 SVG（⊞/❓ 这类字形图标在不同字体下粗细颜色都不一致），
    // 伪装按钮已从标题栏移进工具栏小窗（由 smoke3 校验按钮本体）
    // 🖥 V4.3.53：加了右上角全屏按钮 → 5 个；🐋 加了伴随模式入口 → 6 个
    //    （toggleToolbarBtn + companion/focus/fullscreen/help/close）。
    // 🟥 以后**加减标题栏按钮都要同步这条期望值** —— 它与 PANEL_LIST_TEXT 一样属于
    //    "按 DOM 顺序的清单"（硬规则 6 的同族），漏改就是这里第一个转红。
    //    ⚠️ 这条断言的**真实语义**是"每个标题栏按钮里都有线条 SVG"（不是"有几个按钮"）：
    //    新加的 🐋 最初用的是 emoji 字形（一个 span），就是被它逼着改成 SVG 的 —— 正合 main.css
    //    顶部"标题栏图标统一用同规格描边图标，不用 ⊞❓ 这类字形图标"那条约定。别把期望值改成 '0'。
    //    🟥 写这条注释时踩了**第六次**同一个坑：这段代码整体在 executeJavaScript 的模板串里，
    //       注释里出现反引号会把模板串当场截断 —— 症状是 EVAL ERROR span is not defined
    //       （反引号里的 span 变成了变量）。语法门禁**抓不到**（截断后仍是合法 JS），只有冒烟能抓。
    out.titleIcons = Array.from(document.querySelectorAll('.title-bar button')).map(b => (b.querySelector('svg') ? '1' : '0')).join('');
    out.disguiseBtnMoved = !document.getElementById('disguiseBtn');

    /* 🗑 V4.3.79：阅读统计（bumpReadingStats / frs 写入断言）已随功能整体移除。 */

    // 🟥 V4.3.19 脱离监控：**默认关闭**（用户定案）；setContentProtect(true) 后开启，再 toggle 关闭。
    // 断言的是【主进程侧真实状态】（走 IPC 读回 contentProtectOn），不是渲染层的自说自话 ——
    // 本机实测：关保护 aff=0、开保护 aff=17(WDA_EXCLUDEFROMCAPTURE)、截屏品红像素 249273 -> 0。
    try {
      out.protectApi = !!(window.readerAPI && typeof window.readerAPI.getContentProtection === 'function'
        && typeof window.readerAPI.setContentProtection === 'function'
        && typeof window.readerAPI.getCapabilities === 'function');
      out.protectDefaultOff = (await window.readerAPI.getContentProtection()) === false;
      R.setContentProtect(true);
      await new Promise(r=>setTimeout(r,300));
      out.protectAfterOn = await window.readerAPI.getContentProtection();
      R.toggleContentProtect();
      await new Promise(r=>setTimeout(r,300));
      out.protectAfterToggleOff = await window.readerAPI.getContentProtection();
      out.shortcutContentProtect = R.state.shortcuts.contentProtect;
      // 🟥 脱监与「选中文本」必须互不影响：按 T 只能改 allowSelect，不能动防截屏
      const guardBefore = await window.readerAPI.getContentProtection();
      const selBefore = !!R.state.allowSelect;
      document.dispatchEvent(new KeyboardEvent('keydown', { key:'t', code:'KeyT', bubbles:true }));
      await new Promise(r=>setTimeout(r,250));
      out.tKeyDoesNotTouchProtect = (await window.readerAPI.getContentProtection()) === guardBefore;
      out.tKeyTogglesSelect = (!!R.state.allowSelect) !== selBefore;
      R.setContentProtect(false);
      // 脱监自检：渲染层封装要能把结论拿回来（真实抓屏对比由 _uiprobe5.js 实测）
      out.selftestApi = (typeof window.readerAPI.runProtectSelfTest === 'function');
      const st = await R.runProtectSelfTest();
      out.selftestVerdict = (st && st.verdict) || 'none';

      /* 🟥 V4.3.22：「Ctrl+左键拖动窗口」已删除。判据用 body 的 .dragging 标记
         （拖动成立时 app.js 会挂它、松手摘掉），渲染层就能直接观测，不必去主进程数 IPC。
         ① 普通模式下 Ctrl+左键 → 不得进拖动
         ② 专注模式下普通左键 → 应该进拖动（这条顺滑路径要保住） */
      const c = document.getElementById('novelContent');
      const md = (opts) => c.dispatchEvent(new MouseEvent('mousedown',
        Object.assign({ button:0, bubbles:true, cancelable:true }, opts)));
      const mu = () => document.dispatchEvent(new MouseEvent('mouseup', { bubbles:true }));
      const wasFocus = !!R.state.isFocusMode;
      const wasSelect = !!R.state.allowSelect;
      R.state.allowSelect = false;                    // 专注模式拖动要求未处于「可选中文本」态
      if (R.state.isFocusMode) R.toggleFocus();       // 先回普通模式
      md({ ctrlKey:true }); mu();
      out.ctrlDragRemoved = !document.body.classList.contains('dragging');
      if (!R.state.isFocusMode) R.toggleFocus();      // 进专注模式
      md({}); 
      out.focusPlainDragAlive = document.body.classList.contains('dragging');
      mu();
      if (!!R.state.isFocusMode !== wasFocus) R.toggleFocus();   // 复原
      R.state.allowSelect = wasSelect;

      /* 🟥 V4.3.23（用户要求）：把「**确实**没能脱离监控」和「只是弹个警告」分开 ——
         只有确认失效才报警。判定表逐格验（用固定指纹，避免借别的机器的结论）：
           未验证 → 静默；实测 failed → 红；实测 passed → 静默；
           测不出来 → 黄(note，不是"失效")；换机器(指纹不符) → 旧结论作废、静默；平台不支持 → 红；关闭 → 静默 */
      const keepFp = R.state.protectFp, keepLevel = R.state.protectLevel;
      R.state.protectFp = 'unit|1';
      R.state.protectLevel = 'full';
      R.state.contentProtectOn = true;
      R.state.protectVerdict = null; R.refreshProtectWarn();
      out.vwUnverified = (R.state.protectWarn === '' && R.state.protectWarnKind === '');
      R.state.protectVerdict = { st:'failed', at:Date.now(), fp:'unit|1' }; R.refreshProtectWarn();
      out.vwFailedRed = (!!R.state.protectWarn && R.state.protectWarnKind === 'warn');
      R.state.protectVerdict = { st:'passed', at:Date.now(), fp:'unit|1' }; R.refreshProtectWarn();
      out.vwPassedSilent = (R.state.protectWarn === '' && R.state.protectWarnKind === '');
      R.state.protectVerdict = { st:'unavailable', at:Date.now(), fp:'unit|1' }; R.refreshProtectWarn();
      out.vwUnavailableAmber = (!!R.state.protectWarn && R.state.protectWarnKind === 'note');
      R.state.protectVerdict = { st:'failed', at:Date.now(), fp:'another-machine|9' }; R.refreshProtectWarn();
      out.vwOtherMachineIgnored = (R.state.protectWarn === '' && R.state.protectWarnKind === '');
      R.state.protectVerdict = null; R.state.protectLevel = 'none'; R.state.protectNote = 'unit-test';
      R.refreshProtectWarn();
      out.vwUnsupportedRed = (!!R.state.protectWarn && R.state.protectWarnKind === 'warn');
      R.state.contentProtectOn = false; R.refreshProtectWarn();
      out.vwOffSilent = (R.state.protectWarn === '' && R.state.protectWarnKind === '');
      // 走真实链路：未验证时开启 → 不该弹红；自检（桩返回 ok）跑完后结论应为 passed 且保持静默
      /* 🟥 V4.3.50：加两道**测试隔离**（不是放宽断言）——
         ① 等过 HINT_WARN_GUARD_MS（800ms）的让位窗：本用例前面刚把 verdict 设成 failed/none
            走过 warn 态，若上一条警告还在让位窗内，这句正常的普通提示会被挡掉；
         ② 清掉提示条**残留**的 class：共享页面跨用例残留，不清就分不清
            "这一次弹了红"还是"上一步的红还挂在屏上"。
         断言同时**收紧**：要求提示条确实显示出来（show）且不红 ——
         比原来只查"没有 warn"更强（原来"什么都不弹"也能过）。
         ⚠️ 这段注释在 executeJavaScript 的模板串里，**绝不能出现反引号**
            （本项目已踩五次：会截断外层模板字面量，报错位置还伪装成"页面错误"）。
            V4.3.50 这次就是语法门禁当场拦下的。 */
      await new Promise(r=>setTimeout(r,900));
      { const t0 = document.getElementById('hintToast'); if(t0) t0.className = 'hint-toast'; }
      R.state.protectLevel = 'full'; R.state.protectVerdict = null; R.state.protectFp = 'unit|1';
      R.setContentProtect(true);
      const t2 = document.getElementById('hintToast');
      out.vwEnableNotRed = !!(t2 && t2.classList.contains('show') && !t2.classList.contains('warn'));
      await new Promise(r=>setTimeout(r,400));
      out.vwVerdictAfterSelftest = (R.state.protectVerdict && R.state.protectVerdict.st) || 'none';
      out.vwSilentAfterSelftest = (R.state.protectWarn === '');
      R.setContentProtect(false);
      R.state.protectFp = keepFp; R.state.protectLevel = keepLevel;
      await new Promise(r=>setTimeout(r,150));
      // 「真失效」时提示条必须是红的（用红/黄两态的算样式区分，防止只改文案不改颜色）
      const toast2 = document.getElementById('hintToast');
      if(toast2){
        toast2.className = 'hint-toast show warn';
        out.vwToastWarnBg = getComputedStyle(toast2).backgroundColor;
        toast2.className = 'hint-toast show note';
        out.vwToastNoteBg = getComputedStyle(toast2).backgroundColor;
        toast2.className = 'hint-toast';
      }

      // 说明浮层里不该再有「Ctrl+鼠标左键」那一行，且应有「移动窗口」的替代表述
      const helpTxt = (document.getElementById('shortcutHelpRows') || {}).textContent || '';
      out.helpNoCtrlDragRow = !/Ctrl\+鼠标左键|Ctrl \+ left drag/.test(helpTxt);
      out.helpHasMoveWindow = /移动窗口|Move window/.test(helpTxt);
    } catch (e) { out.protectApi = 'throw:' + e.message; }

    // 标题栏自绘提示：居中于按钮正下方；贴边按钮中心对齐会顶出窗外，改为与按钮边缘齐平（二满足其一即过）
    try {
      if (typeof window.__titleTipGeom !== 'function') out.titleTipOk = 'no-hook';
      else { const g = window.__titleTipGeom(); out.titleTipOk = (g.shown && g.below && (Math.abs(g.off) <= 2 || Math.abs(g.tl - g.bl) <= 2)) ? true : ('off=' + g.off + ' tl=' + g.tl + ' bl=' + g.bl); }
    } catch (e) { out.titleTipOk = 'throw:' + e.message; }

    // 书架标签栏不常显（V4.3.4）：点击标题「阅读器」切换滑出（peek），再点收起
    try {
      const tb = document.getElementById('tabBar'), tt = document.getElementById('titleText');
      if (!tb || !tt) out.tabPeek = 'missing';
      else {
        tb.classList.add('on'); tt.click(); out.tabPeek = tb.classList.contains('peek');
        /* 🆕 V4.3.92：可见入口按钮 —— 点它要能开关标签栏，且箭头方向要跟着实际状态翻。
           原来只有"点标题文字"这一条路，标题上没有任何提示，等于隐藏功能。 */
        const pb = document.getElementById('tabPeekBtn');
        out.tabPeekBtnExists = !!pb;
        if (pb) {
          out.tabPeekBtnArrowUpWhenOpen = pb.classList.contains('up');
          pb.click();                                  // 从"开"点成"关"
          out.tabPeekBtnCloses = !tb.classList.contains('peek');
          out.tabPeekBtnArrowDownWhenClosed = !pb.classList.contains('up');
          pb.click();                                  // 再点回"开"
          out.tabPeekBtnReopens = tb.classList.contains('peek');
        }
        tt.click(); out.tabPeekOff = !tb.classList.contains('peek'); tb.classList.remove('on'); tb.classList.remove('peek');
      }
    } catch (e) { out.tabPeek = 'throw:' + e.message; }

    return JSON.stringify(out);
  })()`);
  } catch (e) {
    console.log('EVAL ERROR', (e && e.message) || String(e));
    console.log('EVAL STACK', (e && e.stack) || '');
    app.exit(3);
    return;
  }

  console.log('RESULT', result);
  const parsed = JSON.parse(result || '{}');
  const expect = {
    hasReader: true,
    skins: 'light,dark',
    failedBarOn: true,
    smartShelf: true,
    smartData: true,
    notMine: false,
    pickPoint: true,
    exportApp: '浅水鲸书架',
    updateTotal: 0,
    updateReportIsArray: true,
    updateSkipped: 'no-source',
    encEnv: true,
    decRoundTrip: true,
    wrongPwd: 'threw',
    plainNotEnc: true,
    envHasKdf: true,
    newer1: true,
    newer2: false,
    newer3: false,
    shortcutCount: 12,   // V4.3.19：脱监加入（9→10）；V4.3.25 又加「目录」（10→11）；V4.3.29 加「书签」（11→12）
    conflictRejected: true,
    customShortcut: true,
    shortcutReset: true,
    themesArray: true,
    applyMissingTheme: true,
    ttsApi: true,
    pickDot: true,
    tabBar: true,
    shadowUiRemoved: true,
    tabsApi: true,
    feedbackIpc: true,
    modules: true,
    utilOk: true,
    tabsRendered: true,
    disguiseModule: true,
    disguiseSkins: 'word,code,sheet',
    disguiseSkinsOk: true,
    disguiseEntered: true,
    disguiseExited: true,
    fgWatchApi: true,
    fgWatchListSaved: true,
    fgWatchToggled: true,
    fgWatchRestored: true,
    /* V4.3.92：标题栏多了一个「切换书籍」箭头（≥2 本才显示），按钮数 7 → 8 */
    titleIcons: '11111111',
    disguiseBtnMoved: true,
    protectApi: true,
    protectDefaultOff: true,
    protectAfterOn: true,
    protectAfterToggleOff: false,
    shortcutContentProtect: 'Ctrl+Shift+S',
    tKeyDoesNotTouchProtect: true,
    tKeyTogglesSelect: true,
    selftestApi: true,
    selftestVerdict: 'ok',
    ctrlDragRemoved: true,
    focusPlainDragAlive: true,
    // 🟥 V4.3.23 脱监警告判定表：「确实没生效」才报红，没验证过一律静默
    vwUnverified: true,
    vwFailedRed: true,
    vwPassedSilent: true,
    vwUnavailableAmber: true,
    vwOtherMachineIgnored: true,
    vwUnsupportedRed: true,
    vwOffSilent: true,
    vwEnableNotRed: true,
    vwVerdictAfterSelftest: 'passed',
    vwSilentAfterSelftest: true,
    helpNoCtrlDragRow: true,
    helpHasMoveWindow: true,
    titleTipOk: true,
    tabPeek: true,
    tabPeekOff: true,
    /* 🆕 V4.3.92：标签栏的可见入口（箭头）—— 存在 / 能开 / 能关 / 箭头方向跟着翻 */
    tabPeekBtnExists: true,
    tabPeekBtnArrowUpWhenOpen: true,
    tabPeekBtnCloses: true,
    tabPeekBtnArrowDownWhenClosed: true,
    tabPeekBtnReopens: true
  };
  Object.keys(expect).forEach(k => {
    if (parsed[k] !== expect[k]) problems.push('MISMATCH ' + k + ' expected=' + expect[k] + ' got=' + parsed[k]);
  });
  if (parsed.fontSelectRemoved !== true) problems.push('主窗 fontSelect 未被摘除（影子 UI 清理失效）');
  // 🟥 V4.3.23：红（确实失效）与黄（测不出来）必须是两种颜色，否则等于没区分
  if (String(parsed.vwToastWarnBg) === String(parsed.vwToastNoteBg)) problems.push('警告态与提醒态同色，红/黄未区分: ' + parsed.vwToastWarnBg);
  if (!(Number(parsed.uiAlpha) > 0 && Number(parsed.uiAlpha) < 0.82)) problems.push('uiAlpha not blending: ' + parsed.uiAlpha);
  if (!(Number(parsed.textShadow) > 0.5)) problems.push('textShadow strength missing: ' + parsed.textShadow);
  if (!(String(parsed.prevBtnEn).includes('Prev'))) problems.push('i18n en not applied: ' + parsed.prevBtnEn);
  if (!(String(parsed.prevBtnZh).includes('上一章'))) problems.push('i18n zh not restored: ' + parsed.prevBtnZh);
  if (!(Number(parsed.scrolled) > 0)) problems.push('arrow key scroll failed: ' + parsed.scrolled);
  /* 📑 V4.3.29 #25（书库进备份）：渲染层那侧只证明"快照里有没有"，这里用备份桩证明
     **真的写进了备份文件** —— 快照对 ≠ 备份对，中间还隔着 collectBackupData 一层。 */
  const seenSettings = (smokeBackupSeen && smokeBackupSeen.settings) || {};
  const seenSites = seenSettings.fsites;
  if (!(Array.isArray(seenSites) && seenSites.length === 1 && seenSites[0].host === 'lib.example')) {
    problems.push('书库(fsites) 没真的写进自动备份: ' + JSON.stringify(seenSites));
  }
  // 负对照：只对本机有效的防截屏结论绝不能跟着备份跨机器
  if (Object.prototype.hasOwnProperty.call(seenSettings, 'fpv')) {
    problems.push('fpv（本机专用）不该进备份，却出现了');
  }
  if (parsed.sitesInSnapshot !== true) problems.push('书库(fsites) 不在设置快照里: ' + parsed.sitesInSnapshot);
  if (parsed.fpvInSnapshot !== false) problems.push('fpv 不该出现在设置快照里: ' + parsed.fpvInSnapshot);
  /* 📑 V4.3.29 #22 新书签模型回归锁。bmScrollable 只是环境体检（不够高就没法验证位置），
     不作为失败项——真正要守的是下面这些行为。 */
  if (parsed.bmTwoInOneChapter !== true) problems.push('一章不能加多条书签（#22 核心）: ' + parsed.bmTwoInOneChapter + ' scrollable=' + parsed.bmScrollable);
  if (parsed.bmHasPos !== true) problems.push('书签位置不是 0~1 的比例: ' + parsed.bmHasPos);
  if (parsed.bmPosDiffer !== true) problems.push('同一章两条书签位置没区分开: ' + parsed.bmPosDiffer + ' scrollable=' + parsed.bmScrollable);
  if (parsed.bmDupRejected !== true) problems.push('同一位置重复加书签没被挡住: ' + parsed.bmDupRejected);
  if (parsed.bmDeleteById !== true) problems.push('按 id 删书签失败或误删同章其它条: ' + parsed.bmDeleteById);
  if (parsed.bmNote !== true) problems.push('书签备注写不进去 / 读不回来: ' + parsed.bmNote);
  if (parsed.bmMigrate !== true) problems.push('旧书签模型迁移失败（老用户数据会丢）: ' + parsed.bmMigrate);
  if (parsed.bmMigrateDirty !== true) problems.push('脏书签数据没被过滤: ' + parsed.bmMigrateDirty);
  /* 📑 V4.3.30 #24「删了能撤销」的回归锁 */
  if (parsed.bmUndoGone !== true) problems.push('删掉的书签还在列表里: ' + parsed.bmUndoGone);
  if (parsed.bmUndoRestore !== true) problems.push('撤销删除失败 / 放回去的位置漂了: ' + parsed.bmUndoRestore);
  if (parsed.bmUndoOnce !== true) problems.push('重复撤销塞进了两条一样的书签: ' + parsed.bmUndoOnce);
  if (parsed.bmUndoDirty !== true) problems.push('撤销通道收下了脏书签数据: ' + parsed.bmUndoDirty);

  /* 🛡 V4.3.35：CSP 必须真的生效 —— 而且要确认它没把 vendor 库一起挡掉。 */
  let cspResult = null;
  try {
    cspSelfTestWindow = true;   // 打开窗口期：这次自检**必然**产生一条 CSP 违规 console，属预期结果
    cspResult = await win.webContents.executeJavaScript(`(function(){
      var r = { meta: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]') };
      try { var s = document.createElement('script'); s.textContent = 'window.__cspInlineRan = 1;'; document.head.appendChild(s); } catch (e) {}
      r.inlineBlocked = (window.__cspInlineRan !== 1);
      r.vendors = [typeof window.mammoth, typeof window.JSZip, typeof window.ePub, typeof window.pdfjsLib].every(function (t) { return t === 'object' || t === 'function'; });
      return r;
    })()`);
    await new Promise(r => setTimeout(r, 250));   // 等那条违规 console 飞过来
  } catch (e) { problems.push('CSP 断言执行失败: ' + (e && e.message)); }
  cspSelfTestWindow = false;
  if (cspResult) {
    if (!cspResult.meta) problems.push('index.html 缺少 CSP meta');
    if (!cspResult.inlineBlocked) problems.push('CSP 没拦住内联脚本 —— 策略未生效（等于没加）');
    if (!cspResult.vendors) problems.push('CSP 误伤了 vendor（epub/pdf/mammoth/jszip 有未加载的）');
  }

  if (problems.length) {
    console.log('PROBLEMS:\n' + problems.join('\n'));
    app.exit(1);
  } else {
    console.log('SMOKE2 PASS');
    app.exit(0);
  }
});

setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 30000);
