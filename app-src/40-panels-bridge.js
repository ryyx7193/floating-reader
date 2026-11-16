            let lastSearchQuery='';
            const openPanelTypes = new Set();
            function openPanel(type){ if(window.readerAPI && window.readerAPI.openPanel) window.readerAPI.openPanel(type);
                         ensureNotGrayed();
                         if(type==='toolbar') syncToolbarPanel();
                         else if(type==='settings') syncSettingsPanel();
                         else if(type==='toc') syncTOCPanel();
                         else if(type==='search') sendPanelData('search',{results:[],theme:themePayload()});
                         else if(type==='bookmarks') syncBookmarkPanel();
                        }
            function closePanelType(type){ if(window.readerAPI && window.readerAPI.closePanel) window.readerAPI.closePanel(type); }
            function closeAllPanels(){ if(window.readerAPI && window.readerAPI.closeAllPanels) window.readerAPI.closeAllPanels(); }
            function closeTopPanel(){ if(window.readerAPI && window.readerAPI.closeTopPanel) window.readerAPI.closeTopPanel(); }
            function togglePanel(type){ if(window.readerAPI && window.readerAPI.togglePanel) window.readerAPI.togglePanel(type); else if(openPanelTypes.has(type)) closePanelType(type); else openPanel(type); }
            function sendPanelData(type,payload){ if(window.readerAPI && window.readerAPI.sendPanelData) window.readerAPI.sendPanelData(type,payload); }
            /* 🆕 V4.3.86（用户反馈「透明底降低后按钮不跟随」的真正根因）：
               透明度控件现在只在**面板小窗**里（主窗那两个内嵌抽屉启动时就被 migrate 掉了），
               而主窗改透明度后**从来没通知过面板** —— 面板的 --bg-alpha 一直停在打开时的值，
               于是主窗越透、面板（含所有按钮）越显得"浮"在上面。
               这里把最新 theme 推给所有面板；主进程侧对未打开的面板是 no-op，可以安全全发。 */
            function broadcastTheme(){
                const tp = themePayload();
                /* 🟥 除了 theme 还要带 windowOpacity / textOpacity：
                   theme 只负责把面板的 --bg-alpha / --ui-alpha 改掉（外观跟随），
                   而工具栏面板的**滑块位置与百分比**是 updateToolbar 按这两个字段刷的 ——
                   只发 theme 的话背景淡了、滑块却还停在原位，用户会以为滑块坏了。 */
                const payload = { theme: tp, windowOpacity: state.windowOpacity, textOpacity: state.textOpacity };
                ['toolbar','settings','toc','bookmarks','annot','search','shelf','source'].forEach(function(t){
                    try{ sendPanelData(t, payload); }catch(e){}
                });
            }
            function ensureNotGrayed(){ if(state.isGrayed){ state.isGrayed=false; setWindowOpacity(1); } }
            function themePayload(){ return { skin:CONFIG.SKINS[state.skinIndex]||'light', bgRgb:state.bgRgb, windowOpacity:state.windowOpacity, textColor:state.textColor, lang:currentLang }; }

            function syncToolbarPanel(){ sendPanelData('toolbar',
                         { windowOpacity:state.windowOpacity,
                         textOpacity:state.textOpacity,
                         shadow:state.shadowIntensity,
                         lineHeight:state.lineHeight,
                         pageMargin:state.pageMargin,
                         autoScrollSpeed:state.autoScrollSpeed,
                         readMode:state.readMode,
                         gray:state.isGrayEnabled,
                         autoPick:state.autoPick,
                         pickPointMode:state.pickPointMode,
                         textColor:state.textColor,
                         font:state.readingFont,
                         theme:themePayload(),
                         disguiseSkin:state.disguiseSkin,
                         isDisguised:state.isDisguised,
                         /* 🆕 V4.3.86：常驻伪装皮肤状态要下发，否则工具栏那个开关永远显示"关" */
                         disguiseRead:state.disguiseRead,
                         contentProtect:state.contentProtectOn,
                         protectNote:state.protectNote,
                         protectWarn:state.protectWarn,
                         protectWarnKind:state.protectWarnKind,
                    /* 📑 V4.3.29：currentBookmarked 不再推给工具条 —— 工具条那个「书签」按钮已取消，
                       当前章是否加过书签改为在「书签列表」面板里显示（由 bookmarkPayload 下发）。 */ }); }
            function syncSettingsPanel(){
                sendPanelData('settings', {
                    closeDelay: state.closeDelay,
                    autoContrast: state.autoContrast,
                    shortcuts: state.shortcuts,
                    shortcutLabels: SHORTCUT_LABELS,
                    /* 🆘 V4.3.28：改键冲突要在设置面板里就地看见（以前只弹主窗 hint） */
                    shortcutError: lastShortcutError,
                    lang: currentLang,
                    ttsState: TTS.state,
                    ttsRate: state.ttsRate,
                    ttsVoice: state.ttsVoice,
                    /* 🔊 V4.3.29：语音清单带上 lang / localService —— 面板要靠它排序（中文优先）
                       并给出友好名字（原样把 "Microsoft Huihui - Chinese (Simplified, PRC)" 摆出来没人看得懂）。 */
                    voices: ttsVoices().map(v => ({ name: v.name, lang: v.lang || '', local: !!v.localService })),
                    themes: listThemes().map(t => t.name),
                    activeTheme: Storage.get(S.ACTIVE_THEME, ''),
                    updateUrl: Storage.get(S.UPDATE_URL, ''),
                    feedbackUrl: Storage.get(S.FEEDBACK_URL, CONFIG.FEEDBACK_DEFAULT),
                    disguiseSkin: state.disguiseSkin,
                    autoUpdate: state.autoUpdate,
                    autoUpdateMin: state.autoUpdateMin,
                    isDisguised: state.isDisguised,
                    fgWatchEnabled: state.fgWatchEnabled,
                    ttsBg: state.ttsBg,
                    fgWatchList: state.fgWatchList,
                    /* 🟥 V4.3.49（R8-1）：开关亮着但监听没跑 — 面板要就地说明（同 shortcutError 口径） */
                    fgWatchError: lastFgWatchError,
                    /* 🆕 V4.3.53（R12-2）伴随模式：开关 / 目标 / 判定 / 贴边 + 失败说明 + 贴边暂停态 */
                    companionEnabled: state.companionEnabled,
                    companionTarget: state.companionTarget,
                    companionMode: state.companionMode,
                    companionEdge: state.companionEdge,
                    companionTint: state.companionTint === true,   // 🆕 V4.3.54：吸色联动开关回显（null 算关）
                    /* 🆕 V4.3.55：生命周期联动开关回显 */
                    companionLinkClose: state.companionLinkClose === true,
                    companionLinkMin: state.companionLinkMin === true,
                    companionError: lastCompanionError,
                    companionDockPaused: !!companionDockPaused,
                    theme: themePayload()
                });
            }
            function syncTOCPanel(){ sendPanelData('toc', { chapters: state.chapters.map((c,i)=>({idx:i,title:c.title||('第'+(i+1)+'章'),level:c.tocLevel||0})), current: state.currentIndex, theme:themePayload() }); }

            function runGlobalSearch(query){
                const q=(query||'').trim();
                if(!q || !state.chapters.length){ sendPanelData('search',{results:[],query:q,theme:themePayload()}); return; }
                const lower=q.toLowerCase(); const results=[];
                for(let idx=0; idx<state.chapters.length && results.length<100; idx++){
                    /* 🟥 V4.3.45（R4-1 次生）：原先这里也是拿 `lc.indexOf(lower)` 的**折叠下标**去
                       `content.substring` 切原文 —— 与章内高亮同一个根因（`İ`/`ẞ` 这类字符折叠后
                       长度变了，命中位置靠后的片段会被切歪，摘要里显示的是错位的文字）。
                       统一走 ciFindAll，摘要一律按**原文下标**取。 */
                    const ch=state.chapters[idx]; const content=ch.content||'';
                    const hits=ciFindAll(content, lower, 5);
                    for(let hi=0; hi<hits.length && results.length<100; hi++){
                        const pos=hits[hi][0];
                        results.push({ idx, query:q, title:ch.title||('第'+(idx+1)+'章'), snippet:content.substring(Math.max(0,pos-18), pos+60).replace(/\n/g,' ') });
                    }
                }
                sendPanelData('search',{results, query:q, theme:themePayload()});
            }

            /* 🆕 V4.3.23：把「书源载入」做成跨面板可用的动作。
               原来这段只写在 p.type==='source' 分支里，而书库住在「全文搜索」面板（type='search'），
               它的 send('load-book') 会被整段跳过 —— 点书库结果会毫无反应（同类坑本项目踩过多次：
               DOM/入口一搬家，就必须检查 type 分流）。 */
            async function loadSourceBookIntoReader(v, epoch){
                /* 🟥 V4.3.47（R6-1）：epoch = 面板在**用户点下「抓取正文并载入」那一刻**
                   报来的 bookSwitchToken 快照。两处复检：
                   ① 入口：抓取期间用户已经清空 / 恢复默认 / 从书架另开了一本 → 本次意图已过期，作废；
                   ② persistActiveBook 之后：载入途中又发生了同样的动作 → 同样作废。
                   🚫 令牌绝不能在这里取号 —— 这里的"现在"已经晚于用户的动作（中间隔着抓取耗时），
                   在此取号永远等于最新值，检查必然通过，等于没修。
                   实测证据 work/_r6_src_token.js：不加这段时，抓取途中点「清空」→ 清空后书自己又回来了
                   （state/DB 里都是那本迟到的书）；从书架另开一本 → 刚打开的新书被迟到的批次覆盖。 */
                if(epoch !== undefined && epoch !== bookSwitchToken) return false;
                /* 🟥 V4.3.33b：同 loadFiles —— 换书前必须先落盘旧书、再清掉跟书走的运行时状态。
                   原先只重置了 chapters / currentIndex / scrollPositions，于是：
                     · 上一本的书签会被写进这本新书的元数据（`currentBookMeta` 带 bookmarks）；
                     · `sourceUrls` 只 push 不重置，换几本书后来源列表越攒越乱。 */
                try{ await persistActiveBook(); }catch(e){ logRenderError('pre-switch persist failed: '+((e&&e.message)||e)); }
                if(epoch !== undefined && epoch !== bookSwitchToken) return false;
                state.bookmarks=[]; state.sourceUrls=[]; state.originalContent='';
                try{ Storage.set(S.BOOKMARKS, []); }catch(e){}
                await assignBookIdentity(v.title || '书源书籍', '书源', 'source', '');
                state.sourceRule = v.rule || null;
                rememberSourceUrl(v.url || '');
                state.chapters = v.chapters;
                state.currentIndex = 0;
                state.scrollPositions = {};
                renderChapter();
                renderTOC();
                const failedCount = v.chapters.filter(c=>c && c.failed).length;
                dom.statusText.textContent = '📡 '+ (v.title || TT('书源书籍','Source book')) + ' · ' + v.chapters.length + TT(' 章',' ch') + (failedCount ? (TT(' · 失败 ',' · failed ')+failedCount+TT(' 章',' ch')) : '');
                try{ await DB.saveChapters(v.chapters); }catch(e){ logRenderError('saveChapters failed: '+((e&&e.message)||e)); }
                await persistActiveBook();
                saveBackup();
                sendPanelData('source', { sourceEvent:'loaded', ok:true, title:v.title || '书源书籍', chapterCount:v.chapters.length, failedCount });
                sendPanelData('search', { sourceEvent:'loaded', ok:true, title:v.title || '书源书籍', chapterCount:v.chapters.length });
                /* 🟥 V4.3.47（R6-1）：显式返回结果。原先是裸的"跑到末尾返回 undefined" ——
                   与同族的 loadBookIntoReader（成功 return true / 被令牌丢弃 return false）口径不一致，
                   调用方与门禁都无法区分"载入了"和"被作废了"。 */
                return true;
            }
            /* 🟥 V4.3.48（R7-3）：「打开外部资源」的**统一出口**。
               原先散在 5 处，写法都是 `try{ window.readerAPI.openExternal(v) }catch(e){}` ——
               `openExternal` 走 IPC invoke、返回 **Promise**，同步 try/catch 抓不到拒绝；
               返回值也没人看，主进程回 `{ok:false,error:'…'}` 时界面上一片安静。
               实测（`asar-src/_r7_ext_open.js`）：设置面板「去系统装更多语音…」点了**完全没反应**，
               而且真拒绝时日志里只有一条 `[unhandled]`，那 5 个 catch 一个都没执行。
               统一成「await + 检查 ok + 失败出声」，并顺手把失败写进日志便于排障。 */
            async function openExternalSafe(url, what){
                const zh = currentLang === 'zh';
                const fail = (why) => showHint((zh ? '打开失败' : 'Failed to open') + (what ? (zh ? '（' + what + '）' : ' (' + what + ')') : '') + (zh ? '：' : ': ') + why, 'warn');
                try{
                    if(!window.readerAPI || !window.readerAPI.openExternal) return false;
                    const r = await window.readerAPI.openExternal(String(url || ''));
                    if(r && r.ok) return true;
                    const why = (r && r.error) || 'unknown';
                    logRenderError('openExternalSafe rejected: ' + String(url || '') + ' · ' + why);
                    fail(why);
                    return false;
                }catch(e){
                    const why = (e && e.message) || String(e);
                    logRenderError('openExternalSafe failed: ' + String(url || '') + ' · ' + why);
                    fail(why);
                    return false;
                }
            }
            async function handlePanelAction(p){
                if(!p) return;
                const action=p.action, v=p.value;
                if(action==='close'){ closePanelType(p.type); return; }
                // 跨面板通用动作（任何面板都能用）：外部打开网址 / 载入一本来源书
                /* 📚 V4.3.86：面板内部 tab 切换（书架 / 搜索 / 书源）。
                   三个视图共用一个窗，切过去时必须补数据 —— 否则搜索页会是空的。 */
                if(action==='viewTab' && v){
                    try{
                        if(v==='search') runGlobalSearch(lastSearchQuery || '');
                        else if(v==='shelf') refreshShelfPanel();
                        /* source 面板自己会 loadSourceRules()，不需要主窗推 */
                    }catch(e){ logRenderError('viewTab sync failed: ' + ((e&&e.message)||e)); }
                    return;
                }
                /* 🎨 V4.3.86（用户：“吸色功能加个重置按钮，重置后默认关闭吸色”）
                   重置 = 两个吸色模式全关 + 清掉圆点位置 + 颜色/阴影回到默认。
                   🛥 不动窗口透明度与排版 —— 那不是“吸色”吸来的，重置它们会让人以为设置被清空。 */
                if(action==='pickReset'){
                    state.autoPick = false; state.pickPointMode = false;
                    state.pickDotHidden = false; state.pickDotPos = null;
                    try{ Storage.set(S.AUTO_PICK, false); }catch(e){}
                    /* 🛥 必须 removeItem 而不是 set(null)：Storage.set 会 JSON.stringify，
                       null 写进去变成**字符串 "null"** —— 键还在，只是值变了，读回虽然也是 null，
                       但“重置”就应该把键真正清掉，否则以后查看存储会以为没重置。 */
                    try{ localStorage.removeItem(S.PICK_DOT_POS); }catch(e){}
                    try{ dom.pickerBtn.classList.remove('toggle-on'); }catch(e){}
                    try{ stopPickLoop(); setPickPreview(null); }catch(e){}
                    try{ applyTextColor(CONFIG.DEF_TEXT_COLOR); }catch(e){}
                    try{ applyBgColorRGB(CONFIG.DEF_BG_RGB, true); }catch(e){}
                    try{ applyShadow(CONFIG.DEF_SHADOW); }catch(e){}
                    try{ syncToolbarPanel(); }catch(e){}
                    showHint(TT('吸色已重置：已关闭吸色并恢复默认颜色', 'Color picking reset: turned off and colors restored'));
                    return;
                }
                if(action==='openUrl' && v){ openExternalSafe(String(v), TT('来源网页','source page')); return; }
                /* 🟥 V4.3.47（R6-1）：面板在用户**点下「抓取正文并载入」那一刻**发来的发起记录。
                   主窗在此刻记下 bookSwitchToken —— 这是唯一能真实反映「用户当时的意图代次」
                   的位置（抓取回来时再取号就晚了，见 loadSourceBookIntoReader 的说明）。
                   按面板类型分槽，两个面板同时抓取时互不干扰。 */
                if(action==='sourceLoadStart'){ srcLoadPending[p.type || 'source'] = { gen: (v && v.gen), epoch: bookSwitchToken }; return; }
                if(action==='load-book' && v && Array.isArray(v.chapters) && v.chapters.length){
                    /* 🟥 V4.3.47（R6-1）：带 loadGen 的载入要先核对发起记录。
                       抓正文可能几十秒，用户完全可能在此期间点了「清空」/「恢复默认」
                       或从书架另开了一本 —— 那三个动作都已经把 bookSwitchToken 加过，
                       于是这里 epoch 对不上，本次载入作废。
                       ⚠️ 作废必须**出声**：否则用户点的「抓取正文并载入」看起来就是没反应。 */
                    let epoch;
                    if(v.loadGen !== undefined){
                        const slot = p.type || 'source';
                        const rec = srcLoadPending[slot];
                        /* 🛡 V4.3.83 审查修复：发起记录**用后即焚**。原先读完不删，旧记录会一直留在槽里 ——
                           万一某次 load-book 带了 loadGen 却没先发 sourceLoadStart（异常路径），
                           就会拿到上一次的旧记录做代次比对，可能把本该作废的载入放过去。 */
                        delete srcLoadPending[slot];
                        if(!rec || rec.gen !== v.loadGen || rec.epoch !== bookSwitchToken){
                            sendPanelData(slot, { sourceEvent:'loadAborted', title: v.title || '' });
                            return;
                        }
                        epoch = rec.epoch;
                    }
                    await loadSourceBookIntoReader(v, epoch);
                    return;
                }
                /* 🆘 V4.3.28 修复：SOS 按钮此前无人处理（工具栏 sosBtn 点击发来的 action==='sos'
                   在下面所有分支都落空）→ 按了没反应。按硬规则放在跨面板通用区：
                   从任何小窗触发都说得通。 */
                if(action==='sos'){ toggleSOS(); return; }
                /* 📑 V4.3.29：书签两个动作提到**跨面板通用区**（原挂在 p.type==='toolbar' 下）。
                   原因：工具条那个独立「书签」按钮这次撤掉了，功能收进了书签列表面板（type='bookmarks'）；
                   若仍留在 toolbar 分支里，面板上的「加/移除书签」按钮会变成死控件 —— 正是本项目反复踩的
                   「DOM 搬家不同步 type 分流」坑。按硬规则放在通用区：从任何入口触发都说得通。 */
                if(action==='bookmark'){ addBookmark(); syncBookmarkPanel(); return; }
                if(action==='bookmarks'){ openPanel('bookmarks'); syncBookmarkPanel(); return; }
                if(p.type==='toolbar'){
                    if(action==='fontDec') setFontSize(-1);
                    else if(action==='fontInc') setFontSize(1);
                    else if(action==='fontReset') resetFontSize();
                    else if(action==='modeToggle') toggleReadMode();
                    else if(action==='pagedToggle') togglePagedMode();
                    else if(action==='skin') nextSkin();
                    else if(action==='disguise'){ toggleDisguise(); }
                    /* 🟥 伪装皮肤下拉已从设置面板移到工具栏（settings 按钮上方），它发出的
                       type 是 toolbar —— 这里不接的话下拉就是个死控件（V4.2.6 教训：
                       DOM 搬家后必须同步检查 type 分流与选择器） */
                    else if(action==='disguiseSkin' && v){ state.disguiseSkin = (v === 'code' || v === 'sheet') ? v : 'word';
                                 Storage.set(S.DISGUISE_SKIN, state.disguiseSkin);
                                 if(state.isDisguised){ window.ReaderDisguise && window.ReaderDisguise.show(state.disguiseSkin);
                                 applyDisguiseMeta(state.disguiseSkin);
                                }
                                 /* 🆕 V4.3.86：常驻皮肤开着时换皮肤要立刻换装，不能等下次开关 */
                                 else if(state.disguiseRead){ applyDisguiseRead(state.disguiseSkin); } }
                    /* 🆕 V4.3.86：伪装外观常驻开关（可正常看书）。与 'disguise'（全遮罩）是两件事。 */
                    else if(action==='disguiseRead'){ setDisguiseRead(v === undefined ? !state.disguiseRead : !!v); }
                    /* 🟥 右半边（进入/退出伪装）必须在这里处理：它从 V4.2.1 移进工具栏起就因为
                       只在 settings 分支里接了 action 而一直是死按钮——smoke 只查元素存在查不出来，
                       直到用户实测点不动才暴露（V4.2.4）。新加工具栏按钮必须同步在这里加分支！ */
                    else if(action==='picker') togglePickPoint();
                    else if(action==='autoPick') toggleAutoPick();
                    else if(action==='gray') toggleGray();
                    /* 🛡 脱离监控（V4.3.19）：工具栏「脱监」按钮卡发来的动作。
                       与快捷键 Ctrl+Shift+S 走同一个 toggleContentProtect，保证两条入口状态一致。 */
                    else if(action==='contentProtect'){ toggleContentProtect(); }
                    /* 📑 V4.3.29：原「书签 / 列表」两个分支已移出（书签=快捷键 + 并入书签列表面板；
                       列表改名为「书签列表」并升级为独立面板）。删掉的是对 V4.0 遗留 #bookmarkList 浮层的操作。 */
                    else if(action==='toc'){ openPanel('toc'); syncTOCPanel(); }
                    else if(action==='search'){ openPanel('search'); }
                    else if(action==='source'){ openPanel('source'); }
                    else if(action==='shelf'){ refreshShelfPanel(); openPanel('shelf'); }
                    else if(action==='settings'){ openPanel('settings'); syncSettingsPanel(); }
                    else if(action==='textColor'){ applyTextColor(v); if(state.autoContrast){ state.autoContrast=false; Storage.set(S.AUTO_CONTRAST,false); } }
                    else if(action==='resetColor'){ applyTextColor(CONFIG.DEF_TEXT_COLOR); }
                    else if(action==='textOpacity') applyTextOpacity(+v);
                    else if(action==='windowOpacity') applyWindowOpacity(+v);
                    else if(action==='shadow') applyShadow(+v);
                    else if(action==='lineHeight') applyLineHeight(parseFloat(v));
                    else if(action==='pageMargin') applyPageMargin(+v);
                    else if(action==='annotGo') goToAnnotation(v);
                    else if(action==='annotDelete'){ if(removeAnnotation(v)) showHint(TT('已删除', 'Deleted')); }
                    else if(action==='annotExport') exportAnnotationsMarkdown();
                    else if(action==='annotOpen') openPanel('annot');
                    else if(action==='fontFamily') applyReadingFont(v);
                    else if(action==='autoScroll'){ if(state.readMode!=='single'){ showHint(TT('自动滚动速度仅在单行模式可用，请先点击「📜 单行」', 'Auto-scroll speed only works in single-line mode — turn on "Single line" first')); } else { setAutoScrollSpeed(+v); } }
                    else if(action==='ttsToggle'){ ttsToggle(); return; }
                    syncToolbarPanel();
                } else if(p.type==='settings'){
                    /* 🟥 V4.3.51（R10-2）：改用 normalizeSettingValue 而不是裸 +v。
                       原先只有 `state.closeDelay=+v`：NaN 会直接存进去（`+undefined` = NaN），
                       负数 / 超大值也照收 —— 而紧邻的 autoUpdateMin 一直是走钳制的，
                       同族两条路径口径不一致。 */
                    if(action==='closeDelay'){ state.closeDelay=normalizeSettingValue(S.DELAY, v); Storage.set(S.DELAY,state.closeDelay); }
                    else if(action==='autoContrast'){ state.autoContrast=!state.autoContrast; Storage.set(S.AUTO_CONTRAST,state.autoContrast); if(state.autoContrast) applyAutoContrast(); else applyTextColor(state.textColor); }
                    else if(action==='shortcut' && v && v.key){ setShortcut(v.key, v.value); return; }
                    else if(action==='resetShortcuts'){ resetShortcuts(); return; }
                    /* 🛡 V4.3.20：脱监自检 —— 端到端实测，回答「怎么知道有没有起效」 */
                    else if(action==='protectTest'){ runProtectSelfTest(); return; }
                    else if(action==='export') exportData();
                    else if(action==='import') importData();
                    else if(action==='importCss') importCustomCss();
                    else if(action==='clearCss') clearCustomCss();
                    /* 🎨 V4.3.69：排版预设（data-a="typePreset" data-v="eye|night|paper"） */
                    else if(action==='typePreset' && v){ applyTypePreset(v); return; }
                    else if(action==='themeApply' && v){ applySavedTheme(v); return; }
                    else if(action==='themeImport'){ importTheme(); return; }
                    else if(action==='themeExport' && v){ exportTheme(v); return; }
                    else if(action==='themeDelete' && v){ deleteTheme(v); return; }
                    else if(action==='themeClear'){ clearThemeSelection(); return; }
                    else if(action==='ttsToggle'){ ttsToggle(); return; }
                    else if(action==='ttsStop'){ ttsStop(); return; }
                    /* 🟥 V4.3.51（R10-1）：这里**原先会重启朗读**，是错的，已删除。
                       原写法：`if(TTS.state!=='idle'){ ttsStop(); ttsPlay(); }`，代价有两个：
                         ① **播放中**调语速 → 从第 1 段重新念（整个朗读进度丢光，长章等于从头再来）；
                         ② **暂停中**调语速 → 用户从没要求播放，程序却自己从头出声
                            （这是隐私事故：人就在旁边，你只是想调慢一点）。
                       而 tts.js 的 speakNext() 每条分片都会重新读 ctx.getRate()，
                       语速**本来就会在下一段自然生效**（分片上限 200 字，体感几秒）——
                       这次重启既没必要又有害。
                       与紧邻的 ttsVoice 分支对照：它一直都是"只存设置、不重启"，
                       两条同族路径口径不一致，正是本项目反复踩的同型坑。
                       🟥 自检（work/_r10_selfcheck.py · S1）：加回重启 ⇒
                          R10_1_NO_RESTART_ON_RATE 与 R10_1_PAUSED_STAYS_QUIET 必须同时转红。 */
                    else if(action==='ttsRate'){ state.ttsRate=Math.max(0.5, Math.min(2, Number(v)||1)); Storage.set(S.TTS_RATE,state.ttsRate); return; }
                    else if(action==='ttsVoice'){ state.ttsVoice=String(v||''); Storage.set(S.TTS_VOICE,state.ttsVoice); return; }
                    /* 🔊 V4.3.29：一键跳到系统「语音」设置页去加装自然语音（Win10/11 通用协议）。
                       Edge 的在线神经语音直连被 401 拒了，而系统自带的「自然语音」是**离线、免费、合规**的，
                       装完 speechSynthesis 会触发 onvoiceschanged，这里的语音下拉会自己多出来 —— 不用改代码。 */
                    else if(action==='openSpeechSettings'){
                        /* 🔊 V4.3.48（R7-1）：这条**修前是坏的** —— `ms-settings:speech` 被主进程
                           http/https 白名单拒掉，而这里当时既不 await 也不看返回值，于是点了没反应。
                           现在走统一出口：主进程已放行 ms-settings:，失败也会出声。 */
                        openExternalSafe('ms-settings:speech', TT('系统语音设置','speech settings'));
                        return;
                    }
                    else if(action==='checkUpdate'){ checkUpdate(); return; }
                    else if(action==='updateUrl'){ Storage.set(S.UPDATE_URL, String(v||'')); return; }
                    else if(action==='openUpdateUrl' && v){ openExternalSafe(String(v), TT('更新地址','update URL')); return; }
                    else if(action==='associate'){ associateFiles(); return; }
                    /* 🟥 V4.3.48（R7-3）：`openDefaultApps` 同样是 invoke（返回 Promise），
                       原先裸调用不看返回值 —— 失败时同样是"点了没反应"。 */
                    else if(action==='openDefaultApps'){
                        (async () => {
                            try{
                                const r = await window.readerAPI.openDefaultApps();
                                if(!r || r.ok !== true) showHint((TT('打开系统设置失败：','Failed to open system settings: ')) + ((r && r.error) || 'unknown'), 'warn');
                            }catch(e){ showHint((TT('打开系统设置失败：','Failed to open system settings: ')) + ((e && e.message) || e), 'warn'); logRenderError('openDefaultApps failed: ' + ((e && e.message) || e)); }
                        })();
                        return;
                    }
                    else if(action==='diagnostics'){ copyDiagnostics(); return; }
                    else if(action==='feedbackExport'){ exportFeedback(); return; }
                    else if(action==='feedbackUrl'){ Storage.set(S.FEEDBACK_URL, String(v||'')); return; }
                    else if(action==='feedbackOpen'){
                        const url = Storage.get(S.FEEDBACK_URL, CONFIG.FEEDBACK_DEFAULT);
                        if(!url){ showHint(TT('请先填写反馈地址','Set the feedback URL first')); return; }
                        /* 🟥 V4.3.48（R7-3）：第 5 处 —— 静态回归锁 `_v448_regress.js` 扫出来的漏网。
                           原先也是裸调 invoke、不看返回值；反馈地址填错或协议不对时同样"点了没反应"。 */
                        openExternalSafe(url, TT('反馈地址','feedback URL'));
                        return;
                    }
                    /* 🆕 V4.3.98（开源）：赞助入口。与 feedbackOpen 同一收口 ——
                       裸调 invoke 不看返回值的老坑已经在 feedbackOpen 上踩过（V4.3.48 R7-3）。 */
                    else if(action==='supportOpen'){
                        const surl = String(CONFIG.SUPPORT_URL || '').trim();
                        if(!surl){ showHint(TT('暂未设置赞助地址','No sponsorship URL set')); return; }
                        openExternalSafe(surl, TT('赞助页','sponsorship page'));
                        return;
                    }
                    else if(action==='lang') setLanguage(v);
                    else if(action==='fgWatch'){ toggleFgWatch(); }
                    /* 🆕 V4.4.0：后台朗读开关。只影响「用户主动隐藏」是否停朗读，见 onVisibilityChange */
                    else if(action==='ttsBg'){
                        state.ttsBg = !state.ttsBg;
                        Storage.set(S.TTS_BG, state.ttsBg);
                        showHint(state.ttsBg ? TT('后台朗读已开启（收进托盘也继续）','Background playback on') : TT('后台朗读已关闭','Background playback off'));
                        return;
                    }
                    else if(action==='autoUpdate'){ state.autoUpdate=!state.autoUpdate; Storage.set(S.AUTO_UPDATE,state.autoUpdate); setupAutoUpdate(); showHint(state.autoUpdate?(TT('书架自动追更已开启','Auto-update on')):(TT('书架自动追更已关闭','Auto-update off'))); }
                    else if(action==='autoUpdateMin' && v){ state.autoUpdateMin=normalizeSettingValue(S.AUTO_UPDATE_MIN, v); Storage.set(S.AUTO_UPDATE_MIN,state.autoUpdateMin); setupAutoUpdate(); }
                    else if(action==='fgWatchList'){ setFgWatchList(v); }
                    /* 🆕 V4.3.53（R12-2）伴随模式：四个设置 + 一个「贴回去」按钮 */
                    else if(action==='companion'){ toggleCompanion(); }
                    else if(action==='companionTarget'){ setCompanionTarget(v); }
                    /* 🆕 V4.3.54：面板的 🎯 检测按钮与吸色开关经桥汇到同一收口（规则 34） */
                    else if(action==='companionDetect'){ detectCurrentCompanion(); }
                    else if(action==='companionTint'){ setCompanionTint(!state.companionTint); }
                    /* 🆕 V4.3.55：生命周期联动开关经桥汇到同一收口（规则 34） */
                    else if(action==='companionLinkClose'){ setCompanionLinkClose(!state.companionLinkClose); }
                    else if(action==='companionLinkMin'){ setCompanionLinkMin(!state.companionLinkMin); }
                    else if(action==='companionMode'){ setCompanionMode(v); }
                    else if(action==='companionEdge'){ setCompanionEdge(v); }
                    else if(action==='companionRedock'){ redockCompanion(); }
                    else if(action==='disguiseSkin' && v){ state.disguiseSkin = (v === 'code' || v === 'sheet') ? v : 'word';
                                 Storage.set(S.DISGUISE_SKIN, state.disguiseSkin);
                                 if(state.isDisguised){ window.ReaderDisguise && window.ReaderDisguise.show(state.disguiseSkin);
                                 applyDisguiseMeta(state.disguiseSkin);
                                }
                                 /* 🆕 V4.3.86：常驻皮肤开着时换皮肤要立刻换装，不能等下次开关 */
                                 else if(state.disguiseRead){ applyDisguiseRead(state.disguiseSkin); } }
                    /* 🆕 V4.3.86：伪装外观常驻开关（可正常看书）。与 'disguise'（全遮罩）是两件事。 */
                    else if(action==='disguiseRead'){ setDisguiseRead(v === undefined ? !state.disguiseRead : !!v); }
                    else if(action==='disguise'){ toggleDisguise(); return; }
                    else if(action==='reset') resetAllSettings();
                    syncSettingsPanel();
                } else if(p.type==='toc'){
                    if(action==='goto'){ goTo(+v); closePanelType('toc'); }
                } else if(p.type==='search'){
                    if(action==='query'){ lastSearchQuery=v; runGlobalSearch(v); }
                    else if(action==='goto' && v && typeof v.idx==='number'){
                        goTo(v.idx); closePanelType('search');
                        /* 🟥 V4.3.36：原来固定等 260ms 再重搜高亮 —— 但大章是**分块渲染**的
                           （>1200 行 / >150000 字符走 requestAnimationFrame 分批插入），260ms 常常没渲完：
                           高亮只覆盖前半段、首个命中定位偏上，用户以为"搜到了却跳错位置"。
                           改为轮询等正文文本量稳定（最多约 3 秒）再搜。 */
                        const q = v.query || '';
                        const wantIdx = state.currentIndex;   // V4.3.37：绑定到"本次跳转的目标章"
                        const myToken = renderToken;
                        let lastLen = -1, stable = 0, tries = 0;
                        const waitStable = () => {
                            const el = dom.novelContent;
                            if(!el){ try { performSearch(q); } catch (e) {} return; }
                            /* 🟥 V4.3.37：用户中途又切了章 / 重新渲染过 → 这次高亮作废。
                               原先没有取消机制，挂起的轮询会把**旧查询**打到新章节上
                               （搜索框都被 renderChapter 清空了，却冒出一片高亮）。 */
                            if(state.currentIndex !== wantIdx || renderToken !== myToken) return;
                            const len = el.textContent.length;
                            if (len === lastLen) stable++; else { stable = 0; lastLen = len; }
                            tries++;
                            if (stable >= 3 || tries > 60) { try { performSearch(q); } catch (e) {} return; }
                            setTimeout(waitStable, 60);
                        };
                        setTimeout(waitStable, 60);
                    }
                } else if(p.type==='bookmarks'){
                    /* 📑 V4.3.29：书签列表面板的两个回传动作 ——
                       点列表某条 → 跳过去并关掉面板（同「目录」的手感）；
                       点某条的 ✕ → 删除那一条（确认弹窗在面板侧已做过，这里直接删）。 */
                    /* 📑 V4.3.29：一章多书签后，所有操作都按 id 走（不再按章节号）
                       —— 点哪条跳哪条、点哪条删哪条、给哪条写备注。 */
                    if(action==='bookmarkGoto' && v && v.id){ goToBookmark(v.id); closePanelType('bookmarks'); }
                    else if(action==='bookmarkDel' && v && v.id){ removeBookmark(v.id); syncBookmarkPanel(); }
                    /* 📑 V4.3.30（#24）：撤销删除 —— 面板发回当初那条的完整对象。
                       restoreBookmark 内部已 saveBookmarks（含同步），这里不用再推一次。 */
                    else if(action==='bookmarkUndo' && v && v.bm){ restoreBookmark(v.bm); }
                    else if(action==='bookmarkNote' && v && v.id){ setBookmarkNote(v.id, v.note); syncBookmarkPanel(); }
                    else if(action==='goto' && typeof v==='number'){ goTo(v); closePanelType('bookmarks'); }   // 兼容旧调用
                } else if(p.type==='source'){
                    // 载入动作已提到函数开头统一处理（书库也会用），这里不再重复
                } else if(p.type==='shelf'){
                    if(action==='list'){ refreshShelfPanel(); }
                    else if(action==='rebind' && v && v.id){ if(await startRebindLocalFile(v.id)) refreshShelfPanel(); }
                    else if(action==='open' && v && v.id){ if(await openBookFromShelf(v.id)) refreshShelfPanel(); }
                    else if(action==='setSource' && v && v.id){
                        // 🛠 书架换源（V4.3.9）：换站抓取 / 手动补录来源网页 —— 新地址成为主源并加进多源列表（置顶）
                        const b0=await DB.getBook(v.id);
                        const cur=(b0 && b0.sourceUrl)||'';
                        /* 🟥 V4.3.97（代码审查 R-11）：Electron **没有实现 window.prompt**
                           （调用返回 undefined 且只在控制台报错）—— 于是这里恒为空、恒走"取消"分支，
                           用户点「换源」毫无反应，是典型的死按钮。
                           复用项目已有的 pwdModal 弹窗（第 4 个参数 false = 明文显示）。 */
                        const url=String((await askPassword('换源地址', '粘贴该书的新来源网页地址（留空取消）', cur || 'https://…', false))||'').trim();
                        if(!url){ /* 取消 */ }
                        else if(!/^https?:\/\//i.test(url)) showHint(TT('地址无效（需 http/https 开头）', 'Invalid address (must start with http/https)'));
                        else {
                            const meta=Object.assign({}, b0||{});
                            meta.id=v.id; meta.sourceUrl=url;
                            meta.sourceUrls=Array.isArray(meta.sourceUrls)?meta.sourceUrls.filter(u=>u!==url):[];
                            meta.sourceUrls.unshift(url);
                            meta.updatedAt=new Date().toISOString();
                            /* 🟥 V4.3.35：拿得到正文才写正文。
                               b0 为 null（读失败）或该书正文锁定（换机后解不开，getBook 返回 chapters=[]）时，
                               原写法 `(b0 && b0.chapters) || []` 会用空数组覆盖 bookchapters ——
                               「解不开但数据还在」就变成了「数据没了」，一次换源把仅存的密文也抹掉。 */
                            const hasBody = !!(b0 && Array.isArray(b0.chapters) && b0.chapters.length);
                            if(!hasBody) logRenderError('setSource: chapters unavailable, meta-only save');
                            await DB.saveBook(meta, hasBody ? b0.chapters : undefined);
                            if(state.bookId===v.id){ state.sourceUrl=url; state.sourceUrls=meta.sourceUrls.slice(); }
                            refreshShelfPanel(); refreshTabs(); showHint(TT('已换源：','Source changed: ')+url);
                        }
                    }
                    else if(action==='openSource' && v && v.id){
                        // 🛠 网页扒下来的书记得自己的来源（V4.3.8）：自动更新失败时，书架里点 ↗ 直达来源网页手动获取。
                        // 多源：书架 ↗ 轮询打开（每次点开下一个），v.url 由面板指定本次要开的那一条
                        const b0=await DB.getBook(v.id);
                        const url = v.url || (b0 && b0.sourceUrl) || '';
                        if(url){
                            try{ await window.readerAPI.openExternal(url); }
                            catch(e){ showHint(TT('打开来源网页失败：','Failed to open the source page: ')+(e&&e.message||e)); }
                        }else showHint(TT('这本书没有记录来源网页', 'No source page recorded for this book'));
                    }
                    else if(action==='delete' && v && v.id){ try{ await DB.deleteBook(v.id); }catch(e){ logRenderError('deleteBook failed: '+((e&&e.message)||e)); } if(state.bookId===v.id){ state.bookId=null; state.bookTitle=''; Storage.set(S.BOOK_ID,null); Storage.set(S.BOOK_TITLE,'');
                        // 🛠 删的是当前书：正文一并清空（与标签页 ✕ 同一病根，别让已删书的字留在屏幕上）
                        state.chapters=[]; state.currentIndex=0; state.scrollPositions={}; state.annotations=[]; state.bookmarks=[];
                        state.originalContent=''; state.sourceRule=null; state.sourceUrl=''; state.sourceUrls=[];
                        try{ localStorage.removeItem('fsp'); }catch(e2){}
                        Storage.set(S.BOOKMARKS, []);
                        // 🟥 V4.3.34：同标签页 ✕ —— 'chapters' 主存储不清，删掉的书重启会复活
                        try{ await DB.clearChapters(); }catch(e2){ logRenderError('clearChapters after delete failed: '+((e2&&e2.message)||e2)); }
                        renderChapter(); renderTOC(); updateBookmarkStar();
                    } refreshShelfPanel(); }
                    else if(action==='export'){
                        const data = await exportShelfBooks(v && v.ids);
                        if(!data.count){ sendPanelData('shelf', { shelfImport:{ ok:false, error: TT('没有可导出的书籍','nothing to export') } }); return; }
                        const pwd = await askPassword(
                            TT('导出加密（可留空）','Encrypt export (optional)'),
                            TT('设置口令后，导入时需要输入相同口令；留空则导出明文','Set a password to encrypt this export. Leave empty for plain JSON.'),
                            TT('留空则不加密','Password (optional)')
                        );
                        if(pwd === null) return;
                        let payload = data;
                        if(pwd){
                            try { payload = await encryptExport(data, pwd); }
                            catch(e){ sendPanelData('shelf', { shelfImport:{ ok:false, error:('加密失败：' + (e && e.message || e)) } }); return; }
                        }
                        sendPanelData('shelf', { shelfExport: payload });
                    }
                    else if(action==='import' && v && v.data){
                        // 整段包起来：任何一步抛异常都必须回一条明确错误，
                        // 否则书架窗口只会停在「正在导入…」，看起来就是没反应。
                        try{
                            const dec = await maybeDecryptImport(v.data, TT('书架','bookshelf'));
                            if(dec.canceled){ sendPanelData('shelf', { shelfImport:{ ok:false, error:(TT('已取消（未输入口令）','canceled')) } }); return; }
                            if(dec.error){ sendPanelData('shelf', { shelfImport:{ ok:false, error:dec.error } }); return; }
                            const res = await importShelfBooks(dec.data);
                            await refreshShelfPanel();
                            sendPanelData('shelf', { shelfImport:res });
                        }catch(e){
                            sendPanelData('shelf', { shelfImport:{ ok:false, error:(TT('导入出错：','import failed: '))+(e && e.message || e) } });
                        }
                    }
                    else if(action==='checkUpdate'){
                        sendPanelData('shelf', { shelfUpdate:{ busy:true } });
                        const res = await checkBookUpdates(v && v.ids);
                        sendPanelData('shelf', { shelfUpdate:res });
                    }
                }
            }

            function setupPanelBridge(){
                if(window.readerAPI){
                    if(window.readerAPI.onPanelAction) window.readerAPI.onPanelAction(handlePanelAction);
                    if(window.readerAPI.onPanelReady) window.readerAPI.onPanelReady(function(type){
                        if(type==='toolbar') syncToolbarPanel();
                        else if(type==='settings') syncSettingsPanel();
                        else if(type==='toc') syncTOCPanel();
                        else if(type==='search') runGlobalSearch(lastSearchQuery||'');
                        else if(type==='shelf') refreshShelfPanel();
                        /* 📑 V4.3.29：书签面板就绪后补一次数据。openPanel 里那次可能早于面板注册
                           onPanelUpdate（窗口刚建、页面还没跑完），这里才是稳拿初始数据的地方。 */
                        else if(type==='bookmarks') syncBookmarkPanel();
                        /* 🖍 V4.3.71：批注面板同理 —— openPanel 里那次可能早于面板注册 onPanelUpdate。 */
                        else if(type==='annot') syncAnnotPanel();
                    });
                    if(window.readerAPI.onPanelOpen) window.readerAPI.onPanelOpen(function(type){ openPanelTypes.add(type); });
                    if(window.readerAPI.onPanelClosed) window.readerAPI.onPanelClosed(function(type){ openPanelTypes.delete(type); });
                    if(window.readerAPI.onPanelsAllClosed) window.readerAPI.onPanelsAllClosed(function(){ openPanelTypes.clear(); });
                    /* 🆘 V4.3.28 修复：主进程全局快捷键（Ctrl+Shift+H 等，窗口失焦也生效）转发来的
                       app:sos 事件此前从未绑定 —— 这个键在最需要它的时候（阅读器不在前台）完全没反应。
                       这里补上；注意与页面 keydown 分支互补不重复：globalShortcut 注册成功时按键
                       会被系统吞掉、页面收不到 keydown；注册失败时才走页面分支（仅前台生效）。 */
                    if(window.readerAPI.onSos) window.readerAPI.onSos(function(){ toggleSOS(); });
                }
                document.addEventListener('mousedown', function(e){
                    if(e.button !== 0) return;
                    if(!(e.target && e.target.closest && e.target.closest('#novelContent'))) return;
                    closeTopPanel();
                });
                // 面板同步频率放慢，减少多窗口打开时的持续开销
                setInterval(function(){
                    /* 🐋 V4.3.53（R12-4）：顶栏 🐋 与"贴边暂停"动作条**必须放在 `if(openPanelTypes.size)` 之前** ——
                       它们是主窗自己的控件，跟有没有开着面板无关（原来那种"没开面板就不同步"的写法
                       会让暂停状态一直不显示）。syncCompanionUI 只写外观、不碰输入框，不违反 R11。 */
                    /* 🛡 V4.3.82 审查补：伴随关闭且浮层未打开时无需每 1.5s 重写顶栏外观（无状态可同步） */
                    if(state.companionEnabled || companionPopIsOpen()){ try{ syncCompanionUI(); }catch(e){} }
                    if(openPanelTypes.size){ if(openPanelTypes.has('toolbar')) syncToolbarPanel(); if(openPanelTypes.has('settings')) syncSettingsPanel(); if(openPanelTypes.has('bookmarks')) syncBookmarkPanel(); } }, 1500);
            }

            // 版本号由 preload 从 package.json 同步读出，这里只负责写标题与启动日志
            // 版本号由主进程经 IPC 读出（preload 的同步 appVersion 在部分 Electron 构建里
            // require('./package.json') 会被拦截，故以异步 getVersion 为准做一次校正）
            async function syncAppVersion(){
                try { if(window.readerAPI && window.readerAPI.getVersion){ const v = await window.readerAPI.getVersion(); if(v) APP_VERSION = v; } } catch(e){}
                document.title = '浅水鲸 · V' + APP_VERSION + ' 正式版';
                console.log('🐋 浅水鲸 V' + APP_VERSION + ' 正式版 已启动');
            }

            // 初始化
            async function init(){
                runMigrations();
                pdfjsLib.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.min.js';
                normalizeSkinIndex();
                applyLanguage(); loadCustomCss(); applySkin();
                dom.novelContent.style.fontSize=state.fontSize+'px';
                dom.textColorPicker.value=state.textColor; applySkin();
                applyTextOpacity(state.textOpacity);
                dom.shadowIntensitySlider.value=state.shadowIntensity; applyShadow(state.shadowIntensity);
                dom.lineHeightSlider.value=state.lineHeight; applyLineHeight(state.lineHeight);
                applyPageMargin(state.pageMargin);
                dom.closeDelaySlider.value=state.closeDelay; dom.closeDelayValue.textContent=state.closeDelay+'ms';
                dom.autoContrastSwitch.classList.toggle('active',state.autoContrast); if(state.autoContrast) applyAutoContrast();
                if(state.readMode==='single'){ dom.contentWrapper.classList.add('single-line'); dom.modeToggleBtn.classList.add('active-btn'); }
                if(state.readMode==='paged'){ dom.contentWrapper.classList.add('paged'); dom.modeToggleBtn.classList.add('active-btn'); }
                dom.grayToggleBtn.classList.toggle('toggle-on',state.isGrayEnabled); dom.grayToggleBtn.classList.toggle('toggle-off',!state.isGrayEnabled);
                if(state.isFocusMode) dom.mainContent.classList.add('focus-mode');
                applyFocusWindow();
                updateSelectionStyle();
                dom.fontSelect.value=state.readingFont; applyReadingFont(state.readingFont);
                dom.autoScrollSpeed.value=state.autoScrollSpeed; dom.autoScrollSpeedValue.textContent=state.autoScrollSpeed>0?state.autoScrollSpeed+'%':TT('关','Off');

                applyWindowOpacity(state.windowOpacity);
                setupResponsive(); setupTooltips(); updateAutoScrollAvailability();
                setupGrayMode(); setupToolbar(); setupSettings(); setupSearch(); setupAnnotations(); setupPanelBridge(); setupAutoUpdate();
                /* 🐋 V4.3.53（R12-4）：伴随模式顶栏入口（按钮 / 就地浮层 / 贴边暂停动作条）。
                   放这里而不是某个 initXxx() 里 —— 规则 2：与面板 type 无关的通用初始化区。 */
                setupCompanionEntry();
                setupPickPoint();
                setupPickDotDrag();   // 🎨 V4.3.86：取色圆点可拖动
                // 从系统「打开方式」/双击导入的文件
                if(window.readerAPI && window.readerAPI.onOpenFile){
                    window.readerAPI.onOpenFile(function(payload){
                        if(!payload || !payload.name || !payload.data) return;
                        try{
                            const bin = atob(payload.data);
                            const arr = new Uint8Array(bin.length);
                            for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
                            const file = new File([arr], payload.name);
                            /* 🟥 V4.3.48（R7-3）：`handleIncomingFiles` 是 async，同步 try/catch 抓不到它内部
                               的拒绝 —— 双击书籍文件失败时用户只会看到"没反应"。改成显式接住并出声。 */
                            handleIncomingFiles([file]).catch(function(e){
                                logRenderError('handleIncomingFiles(os-open) failed: ' + ((e && e.message) || e));
                                showHint((TT('打开文件失败：','Failed to open file: ')) + ((e && e.message) || e), 'warn');
                            });
                        }catch(e){ showHint(TT('打开文件失败：','Failed to open the file: ') + (e && e.message || e)); }
                    });
                }
                // 语音列表异步就绪
                if(ttsSupported()){
                    try{ window.speechSynthesis.onvoiceschanged = function(){ syncTTSPanels(); }; }catch(e){}
                    setTimeout(function(){ syncTTSPanels(); }, 800);
                }
                window.addEventListener('beforeunload', function(){ try{ window.speechSynthesis.cancel(); }catch(e){} });
                if(window.readerAPI && window.readerAPI.onVisibilityChange) window.readerAPI.onVisibilityChange((v, force)=>{
                    state.isHidden=!v;
                    if(v && state.isGrayEnabled) setWindowOpacity(1);
                    // 隐藏时停掉自动吸色与取样点，避免后台空转
                    if(!v){
                        if(autoPickTimer){ clearInterval(autoPickTimer); autoPickTimer=null; autoPickWasRunning=true; }
                        setPickPreview(null);
                        /* 🟥 V4.3.37：窗口被隐藏时停朗读（用户明确要求）。
                           这条通道是主进程 `mainWindow.on('hide')` 推过来的 —— 托盘 / 前台监听 /
                           closeBtn / SOS 全部隐藏途径都收口在那，所以这里一处即可全覆盖。
                           恢复时**不自动续读**（同 SOS 的做法：免得突然出声），只提示一次。 */
                        /* 🛡 V4.3.38：判定放宽到「非 idle」—— 用户主动**暂停**时
                           ttsIsPlaying() 为 false，但 ttsStop() 照样会把 paused 清成 idle，
                           而恢复时因为没置标志就不提示，用户不知道"我的暂停被程序结束了"。 */
                        /* 🆕 V4.4.0（用户要求「进入托盘继续朗读做成可选功能」）：
                           开关开着时，**用户主动**隐藏（托盘 / Ctrl+Shift+H）不再停朗读；
                           **被动**隐藏（前台监听「指定程序切到前台」/ 伴随模式自动收起）由主进程带
                           force=true 推过来，照样强制停 —— 自动躲起来还出声等于当场暴露。
                           🟥 force 必须由主进程在**隐藏前**单独发一次（见 35-fgwatch / 40-companion），
                              不能指望 on('hide') 知道是谁触发的 —— 它只是个统一出口。 */
                        if(force || !state.ttsBg){
                            try{
                                if(TTS && TTS.state && TTS.state !== 'idle'){ ttsPausedByHide = true; ttsHideWasPlaying = (TTS.state === 'playing'); }
                            }catch(e){}
                            try{ ttsStop(); }catch(e){}
                        }
                    } else {
                        /* 🛡 V4.3.38：**拆成两个独立的 if**。原先 TTS 提示与「取色循环恢复」
                           共用一条 else-if 链，TTS 分支会把事件吃掉 —— 于是
                           「开着朗读 + 开着取色点」隐藏再显示时，取色定时器永远不重启
                           （按钮还亮着、颜色却再也不更新，且 autoPickWasRunning 一直挂到下次隐藏）。
                        V4.3.33b：恢复条件要同时判 state.autoPick 与 state.pickPointMode ——
                           「取色点」与「自动吸色」共用同一个 autoPickTimer，只开取色点时
                           隐藏再显示，循环不会重启。 */
                        if(ttsPausedByHide){
                            ttsPausedByHide = false;
                            try{
                                showHint(ttsHideWasPlaying
                                    ? (TT('🔇 窗口隐藏时已停止朗读（要继续请重新开始）','🔇 Speech stopped while hidden (press play to resume)'))
                                    : (TT('🔇 暂停的朗读已结束（窗口隐藏时）','🔇 Paused speech was terminated while hidden')));
                            }catch(e){}
                            ttsHideWasPlaying = false;
                        }
                        if(autoPickWasRunning && (state.autoPick || state.pickPointMode)){
                            autoPickWasRunning=false;
                            autoPickTimer=setInterval(()=>pickColor(true),PICK_INTERVAL_MS);
                        }
                    }
                });
                syncHideShortcut();
                dom.prevBtn.addEventListener('click', prevChapter);
                dom.nextBtn.addEventListener('click', nextChapter);
                /* 📑 V4.3.29：原三行遗留绑定已删 —— #bookmarkBtn（加书签）/ #showBookmarksBtn（弹浮层）/
                   #bookmarkList（V4.0 浮层）都不存在了。书签现在是快捷键 + 「书签列表」面板两处入口。 */
                dom.fontInc.addEventListener('click', ()=>setFontSize(1));
                dom.fontDec.addEventListener('click', ()=>setFontSize(-1));
                dom.skinBtn.addEventListener('click', nextSkin);
                dom.textColorPicker.addEventListener('input', e=>{ applyTextColor(e.target.value); if(state.autoContrast){ state.autoContrast=false; dom.autoContrastSwitch.classList.remove('active'); Storage.set(S.AUTO_CONTRAST,false); } });
                dom.resetColorBtn.addEventListener('click', ()=>{ applyTextColor(CONFIG.DEF_TEXT_COLOR); dom.textColorPicker.value=CONFIG.DEF_TEXT_COLOR; });
                dom.pickerBtn.addEventListener('click', togglePickPoint);
                dom.pickerBtn.addEventListener('contextmenu', e=>{ e.preventDefault(); toggleAutoPick(); });
                if(dom.failedRetryBtn) dom.failedRetryBtn.addEventListener('click', retryCurrentChapter);
                dom.shadowIntensitySlider.addEventListener('input', e=>applyShadow(+e.target.value));
                /* 🛥 V4.3.86：滑块右移 = 透明度变大 = opacity 变小，所以要取 100-位置值 */
                dom.textOpacitySlider.addEventListener('input', e=>applyTextOpacity(100-(+e.target.value)));
                dom.windowOpacitySlider.addEventListener('input', e=>applyWindowOpacity(100-(+e.target.value)));
                dom.modeToggleBtn.addEventListener('click', toggleReadMode);
                /* 🟥 V4.3.33b：清空流程重排。原先的顺序有两个真问题：
   ① `saveBackup()` 放在清空**之后** —— 等于把最近一次自动备份覆盖成"零章节"，
      用户最后一根救命稻草也被抹掉（对比 resetAllSettings 反而是"先备份再清"，这两条路径口径不一致）；
   ② 只清了章节，没清 bookmarks / sourceRule / sourceUrl / sourceUrls / originalContent ——
      残留书签会挂到下一本书上，残留 originalContent 还会让朗读念出已经删掉的内容（隐私）。
   另外整段补 try/catch：DB 现在会真 reject，不能让它把后续清理整段打断、留下半清状态。 */
                dom.clearBtn.addEventListener('click', async ()=>{
                  if(!state.chapters.length) return;
                  if(!confirm(t('clearConfirm'))) return;
                  /* 🟥 V4.3.58：同「恢复默认」那处 —— 空 catch 改带日志（saveBackup 自身已兜底） */
                  try{ await saveBackup(); }catch(e){ logRenderError('pre-clear backup threw: '+((e&&e.message)||e)); }   // 先备份，再清
                  dom.statusText.textContent = TT('🗑️ 正在清空…','🗑️ Clearing…');
                  /* 🟥 V4.3.44（R3-2）：作废在途切书 —— 清空期间迟到的加载不该把书再装回来 */
                  bookSwitchToken++;
                  try{ await DB.clearChapters(); }catch(e){ logRenderError('clearChapters failed: '+((e&&e.message)||e)); }
                  if(state.bookId){ try{ await DB.deleteBook(state.bookId); }catch(e){} }
                  state.chapters=[]; state.currentIndex=0; state.scrollPositions={}; state.annotations=[];
                  state.bookmarks=[]; state.sourceRule=null; state.sourceUrl=''; state.sourceUrls=[]; state.originalContent='';
                  state.bookId=null; state.bookTitle=''; state.sourceName='';
                  try{ localStorage.removeItem('fsp'); }catch(e){}
                  Storage.set(S.BOOKMARKS,[]);
                  Storage.set(S.READER_IDX,0); Storage.set(S.READER_TOTAL,0); Storage.set(S.BOOK_ID,null); Storage.set(S.BOOK_TITLE,'');
                  renderChapter(); renderTOC();
                  dom.statusText.textContent=TT('🗑️ 已清空所有内容','🗑️ Everything cleared');
                });
                dom.grayToggleBtn.addEventListener('click', toggleGray);
                dom.focusBtn.addEventListener('click', toggleFocus);
                /* 🖥 V4.3.53：右上角全屏按钮（用户要求"放到叉附近、专注模式与快捷键旁边"）。
                   与双击标题栏共用 toggleFullScreenFromUI ⇒ 同一条 IPC 链。
                   按钮若在 DOM 里缺失，出声而不是让它静默成死控件（规则 33：不许静默空操作）。 */
                if(dom.fullscreenBtn) dom.fullscreenBtn.addEventListener('click', toggleFullScreenFromUI);
                else logRenderError('fullscreenBtn missing in DOM');
                /* 🆕 V4.3.84：最小化按钮（就在全屏/最大化按钮左边）。
                   两条都出声而不是静默成死控件：按钮缺失 / preload 没暴露 API ——
                   V4.3.62~76 的面板事故就是「条件不成立 → 静默丢弃」，排查花了好几轮。 */
                if(dom.minimizeBtn) dom.minimizeBtn.addEventListener('click', ()=>{
                    if(window.readerAPI && window.readerAPI.minimizeWindow) window.readerAPI.minimizeWindow();
                    else logRenderError('readerAPI.minimizeWindow missing — 最小化按钮无效');
                });
                else logRenderError('minimizeBtn missing in DOM');
                dom.closeBtn.addEventListener('click', ()=>{ window.close(); }); // 主进程会隐藏窗口
                setupGestures();
                dom.loadBtn.addEventListener('click', ()=>{ const input=document.createElement('input'); input.type='file'; input.multiple=true; input.accept=SUPPORTED_EXTS.join(','); input.onchange=e=>{ if(e.target.files.length) handleIncomingFiles(e.target.files); }; input.click(); });
                dom.tocBtn.addEventListener('click', ()=>{ openPanel('toc'); syncTOCPanel(); });
                dom.globalSearchBtn.addEventListener('click', ()=>openPanel('search'));
                dom.fontSelect.addEventListener('change', e=>applyReadingFont(e.target.value));
                dom.autoScrollSpeed.addEventListener('input', e=>{ if(state.readMode!=='single'){ showHint(TT('自动滚动速度仅在单行模式可用，请先点击「📜 单行」','Auto-scroll speed is only available in single-line mode')); return; } setAutoScrollSpeed(+e.target.value); });

                // 快捷键帮助
                // 悬停策略：悬停问号即显、移开即隐；点击后钉住（保底 3 秒，这期间移开不收）；
                // 3 秒到点时若鼠标已不在窗口上则自动收起；鼠标移到窗口上就一直保持，移开才收；再次点击立即关闭。
                const helpBtn=$('helpBtn');
                if(helpBtn && dom.shortcutHelp){
                    let helpPinned=false, helpHold=0, hoverWin=false, hoverBtn=false, leaveGuard=0;
                    const helpOpen = ()=> dom.shortcutHelp.classList.add('open');
                    const clearHold = ()=>{ clearTimeout(helpHold); helpHold=0; };
                    const helpClose = ()=>{ helpPinned=false; clearHold(); clearTimeout(leaveGuard); dom.shortcutHelp.classList.remove('open'); };
                    /* 🟥 V4.3.22「3 秒自动关闭」第二次修复 —— 上一版只改了判定条件，没抓到真正的元凶：
                       `dom.shortcutHelp.addEventListener('mouseenter', ...)` 里有一句 clearTimeout(helpHold)，
                       **把 3 秒定时器直接掐掉却不再重排**。而浮层就长在问号按钮旁边，
                       鼠标点/悬停按钮后几乎必然压到浮层上 → 定时器被取消 → 此后永远不会到点，
                       于是「3 秒自动关闭」彻底失效（移开鼠标也不收，因为没人再检查）。
                       🟥 铁律：**定时器可以被重排，绝不能被静默取消而不重排**。
                       现在的行为（简单可预期）：
                         · 悬停问号 → 显示；移开（不在浮层上）→ 立即收（未钉住时）
                         · 点击问号 / 按 ? → 钉住 **2 秒**（用户定案，原为 3 秒）；鼠标还压在浮层上就**再续 2 秒**
                           （让人能读完），鼠标一离开，下一次到点立刻收
                         · 再次点击 / Esc → 立即收 */
                    const HELP_HOLD_MS = 2000;   // 🟥 V4.3.22：3 秒 → 2 秒（用户定案，只改这一处）
                    const armHold = ()=>{ clearHold(); helpHold=setTimeout(()=>{
                        if(hoverWin){ armHold(); return; }   // 鼠标还在浮层上 → 续 2 秒，别把正在读的人赶走
                        helpClose();                         // 已离开 → 到点即收
                    }, HELP_HOLD_MS); };
                    // 30ms 宽容：鼠标从按钮移到窗口的途中会有一瞬「两边都不在」，直接关会闪断
                    const helpMaybeClose = ()=>{ clearTimeout(leaveGuard); leaveGuard=setTimeout(()=>{
                        if(hoverWin || hoverBtn) return;      // 鼠标还在按钮/浮层上 → 保持
                        if(helpPinned && helpHold) return;    // 钉住且保底计时还在 → 等它到点自己收
                        helpClose();
                    }, 30); };
                    const helpPin = ()=>{ helpPinned=true; helpOpen(); armHold(); };
                    helpBtn.addEventListener('mouseenter', ()=>{ hoverBtn=true; clearTimeout(leaveGuard); helpOpen(); });
                    helpBtn.addEventListener('mouseleave', ()=>{ hoverBtn=false; helpMaybeClose(); });
                    helpBtn.addEventListener('click', e=>{ e.preventDefault(); e.stopPropagation(); if(helpPinned) helpClose(); else helpPin(); });
                    // 🟥 V4.3.22：这里**只能标记 hoverWin**，绝不能 clearTimeout(helpHold) ——
                    // 浮层紧挨着问号按钮，鼠标过去必然压到浮层，一 cancel 定时器就再也回不来，3 秒关闭必失效。
                    // 鼠标在浮层上时不关是由 armHold 到点后「续 3 秒」实现的，不靠取消定时器。
                    dom.shortcutHelp.addEventListener('mouseenter', ()=>{ hoverWin=true; clearTimeout(leaveGuard); });
                    dom.shortcutHelp.addEventListener('mouseleave', ()=>{ hoverWin=false; helpMaybeClose(); });
                    // 给键盘入口用（? 键切换 / Esc 关闭），共用同一套状态，避免开关状态不同步
                    window.__helpToggle = ()=>{ if(dom.shortcutHelp.classList.contains('open')) helpClose(); else helpPin(); };
                    window.__helpClose = helpClose;
                }

                /* 🟥 V4.3.44（R3-3）：判断焦点是不是落在"用户正在输入/操作控件"的地方。
                   原先只写 `dom.searchInput === document.activeElement` —— 只认搜索框。而主窗可见的
                   输入控件还有**口令框 #pwdInput**（口令弹窗会主动 focus），它不在守卫内，于是：
                     · 在口令框里按 ←/→ 会切章节（默认 prev/next 就是这两个键）；
                     · 按空格命中 autoScroll（默认 Space）并 preventDefault → **带空格的口令根本打不出来**。
                   现在输入框（除按钮/勾选/文件这类非文本型）、文本域、下拉、contenteditable 一律算"打字中"。 */
                const NON_TEXT_INPUT_TYPES = ['button','checkbox','radio','submit','reset','file','image','hidden'];
                function isEditableTarget(el){
                    if(!el || el === document || el === document.body) return false;
                    const tag = String(el.tagName || '').toLowerCase();
                    if(tag === 'input') return NON_TEXT_INPUT_TYPES.indexOf(String(el.type || 'text').toLowerCase()) < 0;
                    return tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
                }

                // 全局快捷键
                document.addEventListener('keydown', e=>{
                    const typing = isEditableTarget(document.activeElement);
                    /* 🟥 V4.3.44（R3-3）：`?` 这条原先**完全没有守卫** —— 在搜索框里输入问号会弹出快捷键浮层、
                       而 `?` 本身被 preventDefault 吃掉（于是搜不了含问号的文本）。补上 !typing。 */
                    if(!typing && e.key==='?' && !e.ctrlKey && !e.altKey && !e.metaKey){ e.preventDefault(); if(window.__helpToggle) window.__helpToggle(); else dom.shortcutHelp.classList.toggle('open'); }
                    if(e.key==='Escape' && dom.shortcutHelp.classList.contains('open')){ if(window.__helpClose) window.__helpClose(); else dom.shortcutHelp.classList.remove('open'); }
                    const ks=formatShortcut(e);
                    const sc = state.shortcuts;
                    const plainKey = !e.ctrlKey && !e.altKey && !e.metaKey;
                    /* 📖 V4.3.68：这个标志表示"该键已经由翻页分支处理过"。
                       ⚠️ 没有它的话，→ 会先走 sc.next 翻一页、再走下面"其余翻页键"的通用分支翻第二页
                       —— 同一个按键在一个事件里走了两处，症状是"按一下翻两页"。 */
                    let pagedKeyHandled = false;
                    if(ks && (!typing || !plainKey)){
                        /* 📖 V4.3.68：分页模式下 ←/→ 是**翻页**（翻到章末才换章），与滚轮/点击一致。 */
                        if(ks===sc.prev){ e.preventDefault(); pagedKeyHandled = pagedActive(); if(!pagedTurn(-1)) prevChapter(); }
                        else if(ks===sc.next){ e.preventDefault(); pagedKeyHandled = pagedActive(); if(!pagedTurn(1)) nextChapter(); }
                        else if(ks===sc.focus){ e.preventDefault(); toggleFocus(); }
                        /* 🆘 V4.3.24：这个键（默认 Ctrl+Shift+H）由「只藏阅读窗口」升级为 **SOS** —
                           收起全部界面并停掉朗读；再按一次原样恢复。 */
                        else if(ks===sc.hide){ e.preventDefault(); toggleSOS(); }
                        else if(ks===sc.search){ e.preventDefault(); toggleSearch(); }
                        else if(ks===sc.globalSearch){ e.preventDefault(); openPanel('search'); }
                        else if(ks===sc.toc){ e.preventDefault(); openPanel('toc'); }
                        else if(ks===sc.autoScroll){ e.preventDefault(); if(pagedActive()){ pagedKeyHandled = true; pagedTurn(1); } else { toggleAutoScroll(); } }
                        /* 🎨 V4.3.86：快捷键改成“隐藏/显现圆点”。原来它关的是整个模式，而自动吸色开着时
                       关模式会立刻重开循环把圆点画回来 → 表现为“按了没用”。 */
                        else if(ks===sc.pickPoint){ e.preventDefault(); togglePickDot(); }
                        else if(ks===sc.toolbar){ e.preventDefault(); togglePanel('toolbar'); }
                        else if(ks==='Ctrl+Shift+0'){ e.preventDefault(); dom.shadowIntensitySlider.value=CONFIG.DEF_SHADOW; applyShadow(CONFIG.DEF_SHADOW); }
                        else if(ks==='Ctrl+Shift+L'){ e.preventDefault(); ttsToggle(); }
                        /* 🟥 V4.3.19：两个开关彻底分开，别再混在一起 ——
                           · T             = 只切「能否选中/复制文本」（原语义，无害动作，恢复回来）
                           · Ctrl+Shift+S  = 切「脱离监控」（防截屏 + 投屏/远控自动隐身），与工具栏「🛡 脱监」按钮同源
                           分开的原因：把「降低防护」和「方便复制」绑在一个键上，会让用户分不清
                           自己到底是关了保护还是只是开了选择。 */
                        else if(!typing && ks==='T'){ e.preventDefault(); state.allowSelect=!state.allowSelect; updateSelectionStyle(); }
                        else if(!typing && ks===sc.contentProtect){ e.preventDefault(); toggleContentProtect(); }
                        /* 📑 V4.3.29：书签入库/移除做成快捷键（可在设置里改键）。
                           与工具条上那个按钮彻底解耦——按钮这次撤了，功能收进「书签列表」面板里。 */
                        else if(ks===sc.bookmark){ e.preventDefault(); addBookmark(); }
                    }
                    /* 📖 V4.3.68：分页模式下这五个键一律翻页（不滚动）。
                       放在 sc.* 分支之后仍然必要 —— 用户可能把 prev/next 改成别的键，此时 ←/→ 走不到上面。 */
                    if(!typing && pagedActive() && !pagedKeyHandled && (e.key==='ArrowLeft' || e.key==='ArrowRight' || e.key==='ArrowUp' || e.key==='ArrowDown' || e.key==='PageUp' || e.key==='PageDown' || e.key===' ')){
                        const pdir = (e.key==='ArrowLeft' || e.key==='ArrowUp' || e.key==='PageUp') ? -1 : 1;
                        if(pagedTurn(pdir)) e.preventDefault();
                        return;
                    }
                    // 上下键滚动内容（在搜索框里输入时不拦截）
                    if(!typing && state.readMode!=='single' && (e.key==='ArrowUp' || e.key==='ArrowDown' || e.key==='PageUp' || e.key==='PageDown' || e.key===' ')){
                        const box = dom.novelContent;
                        const step = (e.key==='PageUp' || e.key==='PageDown' || e.key===' ') ? Math.max(120, box.clientHeight * 0.9) : 60;
                        const dir = (e.key==='ArrowUp' || e.key==='PageUp') ? -1 : 1;
                        box.scrollTop = box.scrollTop + dir * step;
                        e.preventDefault();
                    }
                });

                // 拖拽文件
                // 说明：#dropZone 在 CSS 里是 pointer-events:none，只做视觉提示、永不吞点击。
                // 这里用「看门狗」保证任何异常事件序列（拖出窗口、按 Esc、切窗口、拖内部元素）
                // 都不会让它残留，否则整窗会被遮罩层卡死。
                let dropZoneTimer = null, dropZoneLastOver = 0;
                function hideDropZone(){
                    if(dropZoneTimer){ clearInterval(dropZoneTimer); dropZoneTimer = null; }
                    dom.dropZone.classList.remove('active');
                }
                function showDropZone(){
                    dropZoneLastOver = Date.now();
                    dom.dropZone.classList.add('active');
                    if(dropZoneTimer) return;
                    dropZoneTimer = setInterval(()=>{
                        if(Date.now() - dropZoneLastOver > 800) hideDropZone();
                    }, 200);
                }
                function isFileDrag(e){
                    const dt = e.dataTransfer;
                    if(!dt || !dt.types) return false;
                    for(let i=0;i<dt.types.length;i++) if(dt.types[i]==='Files') return true;
                    return false;
                }
                document.addEventListener('dragover', e=>{
                    e.preventDefault();                                   // 阻止 Electron 直接导航到文件
                    if(isFileDrag(e)) showDropZone();                     // 只对外部文件提示，内部拖文字不弹
                });
                document.addEventListener('dragleave', e=>{
                    if(!e.relatedTarget) hideDropZone();                  // relatedTarget 为空 = 真正离开窗口
                });
                document.addEventListener('drop', e=>{
                    e.preventDefault();
                    hideDropZone();
                    if(e.dataTransfer && e.dataTransfer.files.length) handleIncomingFiles(e.dataTransfer.files);
                });
                document.addEventListener('dragend', hideDropZone);
                document.addEventListener('mousedown', hideDropZone);      // 兜底：能点到东西就说明拖拽已结束
                document.addEventListener('keydown', e=>{ if(e.key==='Escape') hideDropZone(); });
                window.addEventListener('blur', hideDropZone);

                document.addEventListener('wheel', e=>{ if(e.ctrlKey){ e.preventDefault(); const delta=e.deltaY>0?-5:5; const v=Math.min(100,Math.max(20,state.windowOpacity+delta)); applyWindowOpacity(v); } }, {passive:false});

                restoreSession().then(restored=>{
                    if(!restored){
                        restoreFromBackup().then(ok=>{
                            /* 🟥 V4.3.50（R9-1）：只在**确实没有内容**时才说「请加载文件」。
                               原先无条件写 noFile —— 而 restoreFromBackup 内部走完 renderChapter()
                               之后状态栏刚被设成章节名，这一句又把它改回「请加载文件」，
                               与内容区自相矛盾（"界面在骗你"）。renderChapter() 在 chapters 为空时
                               本来就写 noFile，这句只在"内存里其实有正文"时才是多余的。 */
                            if(!ok && !state.chapters.length){ renderChapter(); renderTOC(); dom.statusText.textContent=t('noFile'); }
                        }).catch(e=>{ logRenderError('restoreFromBackup rejected: '+((e&&e.message)||e)); });
                    }
                    scheduleBackups();
                    refreshTabs();
                }).catch(e=>{
                    /* 🟥 V4.3.50（R9-1）：启动恢复链若抛出，原先**没有任何人接住** ——
                       `scheduleBackups()` 与 `refreshTabs()` 会一起被跳过，
                       于是自动备份根本没启动。这又是"最需要备份的时候没有备份"的另一个副本。 */
                    logRenderError('restoreSession rejected: '+((e&&e.message)||e));
                    scheduleBackups();
                    refreshTabs();
                });
            syncAppVersion();
            }

            function setFontSize(delta){ state.fontSize=Math.min(CONFIG.MAX_FONT,Math.max(CONFIG.MIN_FONT,state.fontSize+delta)); dom.novelContent.style.fontSize=state.fontSize+'px'; Storage.set(S.FONT,state.fontSize);
                /* 🔍 V4.3.88：阴影强度现在跟字号挂钩，改字号必须重算，否则停在旧字号那一档 */
                try{ applyWindowOpacity(state.windowOpacity); }catch(e){} }
            /* 📖 V4.3.97（用户：「单行」不该是三档循环，分页要另起一个按钮）：
               原来一个叫「单行」的按钮点一下却进「分页」，标签只写「单行」——
               界面在骗人。现在拆成两个独立开关，各自只管自己的两态，
               当前档位仍由 modeIndicator 显示（📖 阅读 / 📖 第N页 / 📜 滚动）。 */
            function toggleReadMode(){ setReadMode(state.readMode === 'single' ? 'multi' : 'single'); }
            function togglePagedMode(){ setReadMode(state.readMode === 'paged' ? 'multi' : 'paged'); }
            /* 🔤 V4.3.97（用户：字号有放大缩小，再加一个重置按钮，按钮数就对齐了） */
            function resetFontSize(){
                state.fontSize = CONFIG.DEF_FONT;
                dom.novelContent.style.fontSize = state.fontSize + 'px';
                Storage.set(S.FONT, state.fontSize);
                /* 阴影强度跟字号挂钩（V4.3.88），重置后必须重算 */
                try{ applyWindowOpacity(state.windowOpacity); }catch(e){}
                showHint(TT('字号已恢复默认 ' + CONFIG.DEF_FONT + 'px', 'Font size reset to ' + CONFIG.DEF_FONT + 'px'));
            }
            function setReadMode(newMode){
                state.readMode = (READ_MODES.indexOf(newMode) >= 0) ? newMode : 'multi';
                dom.contentWrapper.classList.toggle('single-line', state.readMode==='single');
                dom.contentWrapper.classList.toggle('paged', state.readMode==='paged');
                /* 离开分页必须把双栏一起收掉：.two-col 留在 wrapper 上，
                   下次进分页会带着旧栏数直接算页边界（宽度已变，位置会跳）。 */
                if(state.readMode!=='paged') dropTwoCol();
                /* 🟥 V4.3.97 第 5 轮复审订正：主窗 dom 缓存里这些早已从 index.html 移除的控件，
                   由 fillDetachedDomStubs()（20-migrate-ui-errors-backup.js:9）补成**脱离文档的 <div>**，
                   所以 classList 一直可用 —— 原实现并不会抛 TypeError（上一版注释的"抛异常导致丢档"
                   是误判，已订正）。两态亮灯真正由面板侧 updateToolbar() 负责；
                   这里保留一行口径对齐（对 stub no-op），不再新增 dom 里根本没有的 pagedToggleBtn。 */
                if(dom.modeToggleBtn) dom.modeToggleBtn.classList.toggle('active-btn', state.readMode==='single');
                Storage.set(S.READ_MODE, state.readMode);
                updateAutoScrollAvailability();
                applyAutoScrollSpeed();
                applyLanguage();                       // 里面会调 refreshModeIndicator
                /* 三档共用同一个 scrollTop ⇒ 切模式不丢位置天然成立；
                   进分页时重量一次页边界并吸附，离开分页时丢掉缓存即可。 */
                if(state.readMode==='paged'){ refreshPager(true); snapToCurrentPage(); }
                else { pageOffsetsCache = null; }
            }
            /* 🖥 V4.3.53：切全屏的**唯一**渲染层入口 —— 右上角按钮与"双击标题栏空白"
               都走它。硬规则 34（同一动作多个入口 ⇒ 收口成单一 helper）：这个动作原有一处
               渲染层入口（双击），本次又加了按钮；两处各写一份 try/catch 的话，
               将来修一处漏一处几乎是必然。窗口消息那条路在主进程（WM_NCLBUTTONDBLCLK），
               与这里是同一个 IPC（win:fullscreen），不构成第二个实现。
               失败必须出声（规则 41/46）：主进程侧失败会回传 window:fullscreen-failed。 */
            function toggleFullScreenFromUI(){
                try{
                    if(window.readerAPI && window.readerAPI.toggleFullScreen) window.readerAPI.toggleFullScreen();
                    else logRenderError('toggleFullScreen unavailable');
                }catch(err){ logRenderError('toggleFullScreen failed: '+((err&&err.message)||err)); }
            }
            const GRAY_OPACITY=0.3;
            function setWindowOpacity(v){ if(window.readerAPI && window.readerAPI.setWindowOpacity) window.readerAPI.setWindowOpacity(v); else dom.mainContent.style.opacity=v; }
            /* 🟥 V4.3.49（R8-2）：改键的**结果是异步回来的**，而且会失败。
               V4.3.38 起主进程已经做到"新键被占用就回滚注册旧键"，但渲染层拿不到这件事：
               设置面板照样显示那个注册不上的新键，`fsc` 里存的也是它 ——
               用户每次开机都看到一个永远不生效的键位。现在把它如实回写并就地说明。 */
            async function syncHideShortcut(){
                if(!window.readerAPI || !window.readerAPI.setGlobalShortcut) return;
                let r = null;
                try{ r = await window.readerAPI.setGlobalShortcut(state.shortcuts.hide); }
                catch(e){
                    logRenderError('setGlobalShortcut failed: ' + ((e && e.message) || e));
                    lastShortcutError = t('shortcutFailTitle') + (TT('与系统通信失败','IPC failed'));
                    showHint(lastShortcutError, 'warn');
                    syncSettingsPanel();
                    return;
                }
                if(r && r.ok) return;
                /* 主进程没接受这个键（被别的程序占用 / 空键位 / 异常）。
                   把**真正生效**的键位写回内存与存储 —— 否则界面上显示的永远是假的。 */
                const eff = (r && r.effective) ? String(r.effective) : DEFAULT_SHORTCUTS.hide;
                lastShortcutError = t('shortcutFailTitle') + eff + t('shortcutFailKept');
                state.shortcuts.hide = eff;
                Storage.set(S.SHORTCUTS, state.shortcuts);
                showHint(lastShortcutError, 'warn');
                renderShortcutHelp();
                syncSettingsPanel();
            }

            // ===== 伪装外观 =====
