            // 一键把主窗整体盖成一屏「看起来在工作」的画面，再按一次切回来。
            // 三种皮肤（办公文档 / 代码编辑器 / 数据表格）由 scripts/disguise.js 负责画。
            /* 🛡 V4.3.37：伪装时的窗口标题与托盘名。
               伪装层 z-index:700 能盖住窗内一切，但**盖不住操作系统级的标题文本** ——
               悬停任务栏 / Alt-Tab 仍会看到「浅水鲸 · Vx.y.z 正式版」。
               同时**停掉朗读**：伪装是为了隐蔽，出声就全露了（与 SOS 同一口径）。 */
            const DISGUISE_META = {
                word:  { title: '工作周报.docx - 写字板',                tray: '工作文档' },
                code:  { title: 'main.js - Visual Studio Code',          tray: '代码编辑器' },
                sheet: { title: '2026年第三季度统计表.xlsx - Excel',     tray: '数据表格' }
            };
            let titleBeforeDisguise = '';
            /* 🆕 V4.3.86：「要不要伪装标题/托盘名」不再只看全遮罩，还要看**常驻阅读皮肤**。
               两者任一开着都必须伪装元信息 —— 否则任务栏还写着「浅水鲸」，皮肤白做了。 */
            function disguiseMetaOn(){ return !!(state.isDisguised || state.disguiseRead); }
            function applyDisguiseMeta(skin){
                if(disguiseMetaOn()){
                    const meta = DISGUISE_META[skin] || DISGUISE_META.word;
                    /* 🛡 V4.3.38：只在**首次**进入时抓"原标题"。伪装中切皮肤会再调一次，
                       若无条件抓取，就把伪装标题存成了"原标题"，退出后还原不回去。 */
                    if(!titleBeforeDisguise) titleBeforeDisguise = document.title;
                    try{ document.title = meta.title; }catch(e){}
                    try{ if(window.readerAPI && window.readerAPI.setDisguiseTitle) window.readerAPI.setDisguiseTitle({ title: meta.title, tray: meta.tray, skin: skin }); }catch(e){}
                } else {
                    /* 🛡 V4.3.38：只让主进程回落（它会带上版本号）。原先这里先设 document.title，
                       紧接着主进程 setTitle('浅水鲸') 又把它覆盖掉 —— 退出伪装后标题丢版本号。 */
                    titleBeforeDisguise = '';
                    try{ if(window.readerAPI && window.readerAPI.setDisguiseTitle) window.readerAPI.setDisguiseTitle({ title: '', tray: '' }); }catch(e){}
                }
            }
            /* ══════════ 🆕 V4.3.86：伪装皮肤 → 可阅读的常驻皮肤 ══════════
             *
             * 与 enterDisguise 的全窗遮罩**完全不同**：这里不遮、不拦、不吞按键，
             * 只是给 <body> 挂上 dsg-read + dsg-<skin>，由 styles/disguise.css 把
             * **正文本身**渲染成「办公文档 / 代码 / 表格」的样子 —— 于是可以照常看书。
             *
             * 🟥 为什么不能复用遮罩：遮罩是一整层假内容（假周报/假代码），盖住真正文，
             * 而且 keydown 里对非 SOS 键一律 stopPropagation。用户要的是"在伪装外观里看书"，
             * 不是"看着假文档、按 Esc 才能回来"。
             * 🟥 字体跟随皮肤（用户定的）：办公文档=宋体、代码=等宽、表格=等线，
             * 都由 CSS 按 body.dsg-<skin> 指定，不覆盖用户设的字号（只换字族与配色）。
             */
            /* 🎨 V4.3.90（用户：“另外两个皮肤也要做适应性优化”）：正文字色必须**跟皮肤走**。
               为什么 CSS 管不了：`applyTextColor` 把颜色写成 **内联 style**（为了能跟随用户自定义），
               内联优先级高于任何类选择器 —— code 皮肤就是这么变成“深底深字、几乎看不见”的。
               所以和字族一样，由 JS 接管，退出时调 applyTextColor 还原用户自己的。 */
            const DSG_READ_COLOR = {
                word:  '#1b1b1b',
                code:  '#d4d4d4',
                sheet: '#1f1f1f'
            };

            /* 🟥 V4.3.97（代码审查 R-1）正文字色有**三个来源**：伪装皮肤 / 跟随吸色 / 用户设置。
               以前三处各自直接写 `novelContent.style.color`（内联），谁最后写谁赢 ——
               "伪装 code 皮肤（浅字深底）+ 跟随开着 + 吸色关掉"时，`syncCompanionUI` 每 1.5s
               调一次 `applyCompanionTint(null)`，其 else 分支里的 `applyTextColor` 把伪装字色
               （#d4d4d4）覆盖成用户色（#1b1b1b）→ 深底深字，1.5 秒后突然看不清。
               收口成一个带优先级的 setter：**吸色 > 伪装 > 用户**。
               ⚠️ 定义在这里（50 分片）而不是 30-shelf：`DSG_READ_COLOR` 是 const，
               放在 30 里会在初始化阶段撞 TDZ；函数声明会提升，30 那边照样能调。 */
            function applyReadingColor(){
                if(!dom || !dom.novelContent) return;
                /* ① 吸色生效中：字色由 applyCompanionTint 按目标亮度算，这里不许插手 */
                if(state.companionEnabled && state.companionTint === true &&
                   document.body && document.body.classList.contains('companion-tint')) return;
                /* ② 伪装常驻：用皮肤字色 */
                if(state.disguiseRead && DSG_READ_COLOR[state.disguiseSkin]){
                    dom.novelContent.style.color = DSG_READ_COLOR[state.disguiseSkin];
                    return;
                }
                /* ③ 用户设置（深色皮肤统一 #e8e8e8，与 applyTextColor 原规则一致） */
                dom.novelContent.style.color = (CONFIG.SKINS[state.skinIndex] === 'dark') ? '#e8e8e8' : state.textColor;
            }
            const DSG_READ_FONT = {
                word: '"SimSun","宋体","Microsoft YaHei",serif',
                code: '"Consolas","Cascadia Mono","Courier New",monospace',
                sheet: '"DengXian","等线","Calibri","Microsoft YaHei",sans-serif'
            };
            /* 🛥 V4.3.90：把标题栏的**实测高度**写进 --dsg-shell-top。
               为什么要量而不是写死：标题栏高度 = 内边距 + 按钮尺寸，
               而按钮尺寸跟 --ui-scale 走（用户可以调界面缩放）。
               写死 46px 在默认比例下对，一调缩放就会错位（要么盖住标题栏，要么留条缝）。 */
            function applyDisguiseShellTop(){
                if(!document || !document.body) return;
                const tb = document.querySelector('.title-bar');
                if(!tb) return;
                /* 🛥 必须用 **bottom** 而不是 height：标题栏不一定从 y=0 开始
                   （窗口本身有内边距）。用 height 会把外壳顶部提上去、
                   盖住标题栏的下半截 —— 门禁 U2 就是这么抓到的（shell.y=42 vs 底边 65）。 */
                const r = tb.getBoundingClientRect();
                /* 🛥 必须**允许 0**：标题栏在常驻伪装里是藏掉的，
                   此时外壳就应该从窗口顶部开始（top:0）。
                   旧写法 `if(top > 0)` 会把上一次的值留着 ⇒ 顶上多出一条空白。 */
                document.body.style.setProperty('--dsg-shell-top', Math.max(0, Math.round(r.bottom)) + 'px');
            }
            /* 窗口改大小 / 改缩放后标题栏高度会变 —— 开着常驻时跟着重量。
               没开就直接跳过，不给平时的 resize 太多开销。 */
            try{
                window.addEventListener('resize', function(){
                    if(state.disguiseRead){ try{ applyDisguiseShellTop(); }catch(e){} }
                });
            }catch(e){}
            /* 🚪 V4.3.90b：外壳里那个小退出按钮发来的事件。
               两层解耦：disguise.js 不知道 state，它只发事件；这里才知道怎么关。 */
            try{
                document.addEventListener('dsg:exit', function(){
                    if(!state.disguiseRead) return;
                    state.disguiseRead = false;
                    Storage.set(S.DISGUISE_READ, false);
                    try{ applyDisguiseRead(state.disguiseSkin); }catch(e){}
                    try{ showHint(TT('已退出伪装', 'Disguise off')); }catch(e){}
                });
            }catch(e){}

            function applyDisguiseRead(skin, silent){
                const s = (skin === 'code' || skin === 'sheet') ? skin : 'word';
                state.disguiseSkin = s;
                Storage.set(S.DISGUISE_SKIN, s);
                const on = !!state.disguiseRead;
                const b = document.body;
                if(b){
                    b.classList.toggle('dsg-read', on);
                    b.classList.remove('dsg-word', 'dsg-code', 'dsg-sheet');
                    if(on) b.classList.add('dsg-' + s);
                }
                /* 🛥 V4.3.90：先量标题栏高度写进 --dsg-shell-top ——
                   外壳要**从标题栏下沿开始**，否则铺满整窗就把所有按钮盖住了。
                   不能写死像素：标题栏高度跟 --ui-scale 走，写死会错位。 */
                try{ applyDisguiseShellTop(); }catch(e){}
                /* 🖋 V4.3.87：常驻时**真的把假外壳画出来**（只画壳、不画假正文）。
                   之前只换配色与字族，所以看起来像“套了一层”而不是“变成了 Word”。 */
                try{
                    if(on && window.ReaderDisguise && window.ReaderDisguise.showShell) window.ReaderDisguise.showShell(s);
                    else if(!on && window.ReaderDisguise && window.ReaderDisguise.hide) window.ReaderDisguise.hide();
                }catch(e){
                    /* 🟥 V4.3.97（审查 R-17）：外壳画失败原来被空 catch 吞掉 ——
                       此时 dsg-read 类已经加上（标题栏/按钮被 CSS 藏了），却没有外壳，
                       用户看到的是"只剩正文、没有任何控件"，还不知道为什么。
                       这里至少留痕 + 出声，让人知道是外壳构建失败。 */
                    try{ logRenderError('伪装外壳构建失败: ' + ((e && e.message) || e)); }catch(e2){}
                    try{ showHint(TT('⚠️ 伪装外壳没画出来，已保留阅读界面','⚠️ Disguise shell failed to render; kept the reading view'), 'warn'); }catch(e2){}
                }
                /* 🟥 字体必须在这里改：applyReadingFont 把 font-family 写成 **内联 style**，
                   CSS 里再高的优先级也压不过内联。所以皮肤字体由 JS 接管，退出时还原用户自己的。 */
                try{
                    if(dom && dom.novelContent){
                        dom.novelContent.style.fontFamily = on ? DSG_READ_FONT[s] : state.readingFont;
                        /* 🛥 V4.3.90：字色同理。退出时**调 applyTextColor**而不是直接写 state.textColor ——
                           它里面还有“深色皮肤用 #e8e8e8”的规则，自己写会漏掉那一条。 */
                        /* V4.3.97：进出伪装都走收口，避免和吸色/用户色互相覆盖（R-1） */
                        try{ applyReadingColor(); }catch(e2){}
                    }
                }catch(e){}
                applyDisguiseMeta(s);
                /* 🟥 V4.3.92b：伪装阅读态把 #app 的 --win-pad、卡片边框、wrapper 内衬全部归零了
                   （为了"纸与蓝条/状态栏同宽"），滚动容器的**宽度因此变了**。
                   分页的页步长按滚动容器实测宽度算 —— 宽度变了不重量，页边界就停在旧坐标上
                   （表现为"进了伪装模式翻页错位/最后一页被切"）。这里跟其它改布局的路径口径一致：
                   强制重量 + 吸附到当前页。 */
                try{ if(typeof pagedActive === 'function' && pagedActive()){ refreshPager(true); snapToCurrentPage(); } }catch(e){}
                try{ syncSettingsPanel(); }catch(e){}
                try{ syncUiState(); }catch(e){}
                if(!silent) logRenderError('disguise-read skin ' + (on ? 'ON' : 'OFF') + ' (' + s + ')');
                return on;
            }
            function setDisguiseRead(on){
                state.disguiseRead = !!on;
                Storage.set(S.DISGUISE_READ, state.disguiseRead);
                return applyDisguiseRead(state.disguiseSkin);
            }
            function toggleDisguiseRead(){ return setDisguiseRead(!state.disguiseRead); }
            /* 启动恢复：常驻皮肤是"一直伪装着看"，重启后必须自己回来（否则用户以为设置丢了）。
               🟥 与"全遮罩不自动恢复"是刻意不同的：遮罩是临时遮挡，重启后自己盖上来会把人吓一跳；
               常驻皮肤是用户明确选择的**外观**，和护眼/夜间同性质，理应记住。 */
            function restoreDisguiseRead(){
                if(!state.disguiseRead) return;
                applyDisguiseRead(state.disguiseSkin, true);
            }
            if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreDisguiseRead);
            else restoreDisguiseRead();

            function enterDisguise(){
                if(!window.ReaderDisguise || state.isDisguised) return;
                // 进伪装前先把会露在外面的东西收掉：小窗、取色点、提示条
                if(state.pickPointMode) togglePickPoint();
                if(state.autoPick) toggleAutoPick();
                if(window.readerAPI && window.readerAPI.closeAllPanels) window.readerAPI.closeAllPanels();
                const toast = document.getElementById('hintToast');
                if(toast) toast.classList.remove('show');
                try{ ttsStop(); }catch(e){}   // 朗读会出声，伪装时必须停
                /* 🛡 V4.3.38：先置 flag 再画层。show() 内部是"先加 .on 再 innerHTML"，
                   若 BUILDERS 抛异常，遮罩已经盖住整窗（z-index 700）而 isDisguised 仍为 false ——
                   此时伪装键盘处理器 `if(!state.isDisguised) return` 直接放行，
                   Escape / Ctrl+Shift+B 都进不了退出分支 → 卡在退不出的遮罩里。 */
                state.isDisguised = true;
                try{ window.ReaderDisguise.show(state.disguiseSkin); }
                catch(e){ state.isDisguised = false; try{ window.ReaderDisguise.hide(); }catch(err){} throw e; }
                applyDisguiseMeta(state.disguiseSkin);
                syncSettingsPanel();
                syncUiState();
            }
            function exitDisguise(){
                if(!window.ReaderDisguise || !state.isDisguised) return;
                window.ReaderDisguise.hide();
                state.isDisguised = false;
                /* 🟥 V4.3.97（审查 R-2）：`hide()` 会把 #disguiseLayer 整个清空。
                   若此刻**常驻皮肤还开着**，`body.dsg-read` 仍然把标题栏/按钮组/底栏 CSS 隐藏着，
                   于是界面上既没有外壳也没有任何控件 —— 只剩正文，且 Ctrl+Shift+B 之外退不出去。
                   必须立刻按常驻皮肤重画外壳。 */
                if(state.disguiseRead){ try{ applyDisguiseRead(state.disguiseSkin, true); }catch(e){} }
                /* 🆕 V4.3.86：常驻皮肤还开着时，退出全遮罩**不能**把标题还原成真名 ——
                   否则「退出临时遮挡」会把常驻伪装一起拆穿。 */
                applyDisguiseMeta(state.disguiseRead ? state.disguiseSkin : '');
                syncSettingsPanel();
                syncUiState();
            }
            function toggleDisguise(){ if(state.isDisguised) exitDisguise(); else enterDisguise(); }
            // 本地快捷键 Ctrl+Shift+B 开关；伪装期间吞掉所有按键，
            // 免得 Space / ←→ 之类的阅读动作在伪装画面上乱跑（全局快捷键由主进程转发）
            document.addEventListener('keydown', e=>{
                const hot = e.ctrlKey && e.shiftKey && (e.key === 'B' || e.key === 'b');
                if(!state.isDisguised){ if(hot){ e.preventDefault(); toggleDisguise(); } return; }
                /* 🟥 V4.3.37：放行 SOS 键。原先这里无条件 stopPropagation，页面级的 Ctrl+Shift+H
                   被吞掉、永远走不到 SOS 分支；可主进程的全局热键**仍然**会转发 app:sos ——
                   同一个键"有时灵有时不灵"，取决于焦点在不在窗口上。 */
                const ks = formatShortcut(e);
                if(ks && state.shortcuts && ks === state.shortcuts.hide) return;
                e.stopPropagation();
                if(e.key === 'Escape' || hot){ e.preventDefault(); exitDisguise(); }
            }, true);
            // 伪装按钮在工具栏小窗里（panel.html 的 data-a="disguise"），主窗只留快捷键通道
            if(window.readerAPI && window.readerAPI.onDisguiseToggle) window.readerAPI.onDisguiseToggle(toggleDisguise);

            // ===== 前台窗口监听（自动隐身）=====
