        (function() {
            // 工具函数
            const $ = id => document.getElementById(id);
            const Storage = {
                get(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
                // V4.3.33b：返回布尔，让调用方（如 themes.js 导入主题）能知道配额超限导致的失败 ——
                //           原先空 catch 吞掉，用户看到"导入成功"但刷新后主题消失。
                set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
            };
            // 通用工具来自 scripts/util.js
            const Util = window.ReaderUtil;
            const hexToRgb = Util.hexToRgb;
            const formatShortcut = Util.formatShortcut;
            const versionNewer = Util.versionNewer;
            // 导出加密来自 scripts/crypto-export.js
            const encryptExport = window.ReaderCrypto.encryptExport;
            const decryptExport = window.ReaderCrypto.decryptExport;
            const isEncryptedExport = window.ReaderCrypto.isEncryptedExport;

            // 多语言
            const I18N = {
                zh: {
                    noFile:'📌 请加载文件', loadPrompt:'点击「加载」选择文件', loading:'正在解析…', loaded:'✅ 已加载', chapters:'个章节',
                    restored:'📂 已恢复上次阅读', noResult:'未找到结果', noBookmark:'暂无书签', resetConfirm:'确定要重置所有设置吗？',
                    clearConfirm:'确定要清空所有内容？', noSupport:'未找到支持的文档', importError:'导入失败：',
                    prevChapter:'上一章', nextChapter:'下一章', load:'加载', clearTitle:'清空所有内容',
                    tipFocus:'专注模式', tipHelp:'快捷键', tipClose:'隐藏到托盘',
                    helpTitle:'⌨️ 快捷键', helpPrevNext:'上一章/下一章', helpAutoScroll:'自动滚动', helpSearch:'搜索',
                    helpGlobalSearch:'全文搜索', helpFocus:'专注模式', helpHide:'隐藏窗口', helpOpacity:'窗口透明度', helpSelect:'切换文本选择',
                    helpPickPoint:'取色点', helpToolbar:'工具栏', helpToc:'目录', helpContentProtect:'脱离监控（防截屏）', helpDoubleClick:'双击文本区', helpTripleClick:'三击文本区',
                    helpBookmark:'添加/移除书签', helpDragNative:'移动窗口',
                    dropZone:'📄 松开导入文件',
                    fontDefault:'默认等宽', fontYahei:'微软雅黑', fontSimSun:'宋体', fontSimHei:'黑体', fontKaiTi:'楷体',
                    fontFangSong:'仿宋', fontYouYuan:'幼圆', fontDengXian:'等线', fontSourceHan:'思源黑体', fontSourceHanSerif:'思源宋体',
                    fontSTZhongsong:'华文中宋', fontWenKai:'霞鹜文楷', fontSerif:'衬线英文', fontSans:'无衬线',
                    autoScrollHint:'自动滚动速度仅在单行模式可用，请先点击「📜 单行」',
                    pickUnsupported:'当前环境不支持吸色', pickNoColor:'未取到屏幕颜色，请重试', pickFail:'吸色失败：',
                    pickOn:'自动吸色已开启，将持续融入背景', pickOff:'自动吸色已关闭',
                    pickPointOn:'取色点已开启：移动鼠标预览颜色，点击应用', pickPointOff:'取色点已关闭',
                    pickDotHidden:'取色点已隐藏（同一快捷键可再显示）', pickDotShown:'取色点已显示（可拖动位置）',
                    restoredToast:'已恢复上次阅读', focusOn:'专注模式已开启（窗口已置顶）', focusOff:'专注模式已关闭',
                    fullscreenOn:'🖥 已进入全屏 · 再次双击标题栏（或点右上角按钮）退出', fullscreenOff:'已退出全屏',
                    fullscreenFail:'⚠️ 切换全屏失败：',
                    failedChapter:'本章抓取失败，内容为空', retryChapter:'重新抓取本章', retrying:'正在重新抓取…',
                    retryOk:'已重新抓取并替换本章', retryFail:'重新抓取失败：', retryNoRule:'缺少书源规则，无法重抓',
                    smartShelf:'已识别为书架导出文件', smartData:'已识别为阅读数据备份', smartImporting:'正在导入…',
                    importDone:'导入完成', exportDone:'导出完成', exportCanceled:'已取消导出', resetDone:'已重置',
                    /* 🟥 V4.3.49（R8）：主进程失败回传的两组文案（前台监听 / 全局快捷键）。
                       两侧必须同时加 —— `t(k)` 缺 key 是静默失败（原样显示 key 名）。 */
                    fgFailTitle:'⚠️ 自动隐身 / 远控检测未生效：',
                    fgFailSpawn:'系统未允许启动监听进程（PowerShell 可能被安全软件拦截）',
                    fgFailChild:'监听进程出错', fgFailExited:'监听进程意外退出',
                    fgFailEmpty:'监听名单为空，没有任何程序受监控', fgFailPlatform:'当前系统不支持这种监听方式',
                    fgFailGeneric:'监听器未能启动',
                    shortcutFailTitle:'⚠️ 这个键位没能生效，已保留：', shortcutFailKept:'（可能被其它程序占用）',
                    ttsUnsupported:'当前环境不支持朗读', ttsEmpty:'本章没有可朗读的内容',
                    themeApplied:'已应用主题：', themeImportTitle:'导入主题', themeExportTitle:'导出主题',
                    themePickFirst:'请先选择主题', themeRemoved:'已删除主题', themeCleared:'已清除自定义主题', themeRemoteStripped:'主题中的外部资源引用已移除，数量 ',
                    /* 🆕 V4.3.53（R12-2）伴随模式。zh/en 必须同时加 —— 缺一个就是静默失败（规则 20）。 */
                    companionOn:'🐋 伴随模式已开启：目标程序一开我就陪，它关掉我就收进托盘待命',
                    companionOff:'伴随模式已关闭',
                    companionNeedTarget:'⚠️ 还没填目标程序名，伴随模式不会生效（例如 Weixin.exe）',
                    companionNeedEdge:'⚠️ 嵌入位置还是「不嵌入」—— 先在设置里选一个区域，再点「贴回去」',
                    companionRedocked:'已恢复嵌入跟随',
                    companionDockPaused:'📌 你挪动了窗口，嵌入跟随已暂停 —— 点标题栏的 🐋，或用下面那条「贴回去」即可恢复',
                    companionFreeDock:'🧲 已转为「自由跟随」—— 你把它放在哪，它就贴着那儿跟着动',
                    companionTintReset:'🎨 已重置配色 —— 恢复你自己的底色，正在重新吸取目标颜色',
                    companionFail:'⚠️ 伴随模式未生效：',
                    companionFailEmpty:'目标程序名为空，没有可跟随的对象',
                    companionDetecting:'🎯 正在检测阅读器所在位置的应用…',
                    companionDetectOk:'🎯 已检测到：',
                    companionDetectNone:'⚠️ 没检测到目标窗口 —— 把阅读器挪到目标程序上再点一次「检测」，或直接手动填写',
                    companionDetectFail:'⚠️ 检测失败：',
                    companionTintOn:'🎨 融入目标配色已开启：跟随目标程序时自动吸取它的界面主色',
                    companionTintOff:'🎨 融入目标配色已关闭',
                    /* 🆕 V4.3.55（生命周期联动） */
                    companionLinkCloseOn:'🔗 关闭联动已开启：关闭阅读器时目标窗口会一起关闭',
                    companionLinkCloseOff:'🔗 关闭联动已关闭：关闭阅读器只收进托盘，不动目标窗口',
                    companionLinkMinOn:'🔗 最小化联动已开启：阅读器最小化/恢复时目标窗口一起最小化/恢复',
                    companionLinkMinOff:'🔗 最小化联动已关闭'
                },
                en: {
                    noFile:'📌 No file loaded', loadPrompt:'Click "Load" to select file', loading:'Parsing…', loaded:'✅ Loaded', chapters:' chapters',
                    restored:'📂 Restored last session', noResult:'No results', noBookmark:'No bookmarks', resetConfirm:'Reset all settings?',
                    clearConfirm:'Clear all content?', noSupport:'No supported files found', importError:'Import failed: ',
                    prevChapter:'Prev', nextChapter:'Next', load:'Load', clearTitle:'Clear all content',
                    tipFocus:'Focus mode', tipHelp:'Shortcuts', tipClose:'Hide to tray',
                    helpTitle:'⌨️ Shortcuts', helpPrevNext:'Prev / next chapter', helpAutoScroll:'Auto scroll', helpSearch:'Search',
                    helpGlobalSearch:'Full-text search', helpFocus:'Focus mode', helpHide:'Hide window', helpOpacity:'Window opacity', helpSelect:'Toggle text selection',
                    helpPickPoint:'Color point', helpToolbar:'Toolbar', helpToc:'Contents', helpContentProtect:'Privacy guard (anti-capture)', helpDoubleClick:'Double-click text', helpTripleClick:'Triple-click text',
                    helpBookmark:'Add / remove bookmark', helpDragNative:'Move window',
                    dropZone:'📄 Drop files to import',
                    fontDefault:'Default mono', fontYahei:'Microsoft YaHei', fontSimSun:'SimSun', fontSimHei:'SimHei', fontKaiTi:'KaiTi',
                    fontFangSong:'FangSong', fontYouYuan:'YouYuan', fontDengXian:'DengXian', fontSourceHan:'Source Han Sans', fontSourceHanSerif:'Source Han Serif',
                    fontSTZhongsong:'STZhongsong', fontWenKai:'LXGW WenKai', fontSerif:'Serif', fontSans:'Sans-serif',
                    autoScrollHint:'Auto-scroll speed works in single-line mode only. Click "Single line" first.',
                    pickUnsupported:'Color picking is not available here', pickNoColor:'No color captured, try again', pickFail:'Color pick failed: ',
                    pickOn:'Auto color pick enabled, blending continuously', pickOff:'Auto color pick disabled',
                    pickPointOn:'Color point on: move to preview, click to apply', pickPointOff:'Color point off',
                    pickDotHidden:'Color point hidden (same hotkey to show)', pickDotShown:'Color point shown (drag to move)',
                    restoredToast:'Restored last session', focusOn:'Focus mode on (window pinned on top)', focusOff:'Focus mode off',
                    fullscreenOn:'🖥 Full screen — double-click the title bar (or use the top-right button) to exit', fullscreenOff:'Exited full screen',
                    fullscreenFail:'⚠️ Could not toggle full screen: ',
                    failedChapter:'This chapter failed to fetch and is empty', retryChapter:'Refetch this chapter', retrying:'Refetching…',
                    retryOk:'Chapter refetched and replaced', retryFail:'Refetch failed: ', retryNoRule:'No source rule, cannot refetch',
                    smartShelf:'Detected a bookshelf export', smartData:'Detected a reading-data backup', smartImporting:'Importing…',
                    importDone:'Import complete', exportDone:'Export complete', exportCanceled:'Export canceled', resetDone:'Reset done',
                    fgFailTitle:'⚠️ Auto-hide / remote-control detection is not active: ',
                    fgFailSpawn:'the system would not start the watcher (PowerShell may be blocked by security software)',
                    fgFailChild:'the watcher process raised an error', fgFailExited:'the watcher process exited unexpectedly',
                    fgFailEmpty:'the watch list is empty, so nothing is being watched', fgFailPlatform:'this OS does not support this watch method',
                    fgFailGeneric:'the watcher could not be started',
                    shortcutFailTitle:'⚠️ That key could not be registered, kept: ', shortcutFailKept:' (it may be taken by another app)',
                    ttsUnsupported:'Speech synthesis unavailable', ttsEmpty:'Nothing to read',
                    themeApplied:'Theme applied: ', themeImportTitle:'Import theme', themeExportTitle:'Export theme',
                    themePickFirst:'Pick a theme first', themeRemoved:'Theme removed', themeCleared:'Custom theme cleared', themeRemoteStripped:'Remote resource refs removed: ',
                    /* 🆕 V4.3.53（R12-2）companion mode (see the zh table above — both sides must have every key) */
                    companionOn:'🐋 Companion mode on: I show up with the target app and wait in the tray when it closes',
                    companionOff:'Companion mode off',
                    companionNeedTarget:'⚠️ No target process yet — companion mode will not work (e.g. Weixin.exe)',
                    companionNeedEdge:'⚠️ Embed area is still "No embed" — pick an area first, then click "Dock again"',
                    companionRedocked:'Embed-following resumed',
                    companionDockPaused:'📌 You moved the window, so embed-following is paused — use the 🐋 in the title bar, or "Dock again" on the bar below',
                    companionFreeDock:'🧲 Switched to Free follow — it now stays right where you put it, and moves with the target',
                    companionTintReset:'🎨 Color reset — back to your own theme, re-sampling the target now',
                    companionFail:'⚠️ Companion mode is not active: ',
                    companionFailEmpty:'the target process name is empty, so there is nothing to follow',
                    companionDetecting:'🎯 Detecting the app under the reader…',
                    companionDetectOk:'🎯 Detected: ',
                    companionDetectNone:'⚠️ No target window found — move the reader over the target app and press Detect again, or type the name manually',
                    companionDetectFail:'⚠️ Detect failed: ',
                    companionTintOn:'🎨 Match-target-color enabled: samples the target UI color while following',
                    companionTintOff:'🎨 Match-target-color disabled',
                    /* 🆕 V4.3.55 (lifecycle link) */
                    companionLinkCloseOn:'🔗 Close-link enabled: closing the reader also closes the target window',
                    companionLinkCloseOff:'🔗 Close-link disabled: closing the reader only hides to tray',
                    companionLinkMinOn:'🔗 Minimize-link enabled: minimizing/restoring the reader does the same to the target',
                    companionLinkMinOff:'🔗 Minimize-link disabled'
                }
            };
            /* 🟥 V4.3.45（R5-1）：默认语言提成常量 —— 「启动时的兜底」与「恢复默认设置时的复位」
               必须取自同一个来源。修前 resetAllSettings 压根不复位语言（只在存储层删掉了 flang），
               两者一旦各写各的就会漂移。 */
            const DEFAULT_LANG = 'zh';
            let currentLang = Storage.get('flang', DEFAULT_LANG);
            const t = k => I18N[currentLang][k] || k;
            /* 🆕 V4.3.59（R6-2 第一刀）：**按句给译文**，不再逐点拼中文。
               为什么不用查表（LITERALS）：showHint 的消息大量是「片段 + 变量」拼出来的
               （例如「 章」「 条书源规则导入失败（…）」），单看片段根本无法翻译 ——
               必须在**调用点**就把整句的双语形态定下来。这与 main.js 的 TT、panel.js 的 PT 同一套做法。 */
            const TT = (zh, en) => (currentLang === 'en' ? en : zh);
            /* 🎨 V4.3.56：第三列是"只写文字的那个子元素"。
               这三个按钮里现在有图标 SVG，直接 `el.textContent = ...` 会把图标一起冲掉
               （表现为切一次语言、按钮上的箭头/文件夹就没了）—— 所以文字只落到 `.lbl` 上。 */
            const I18N_SELECTORS = [
                ['#prevBtn', 'prevChapter', '.lbl'], ['#nextBtn', 'nextChapter', '.lbl'], ['#loadBtn', 'load', '.lbl'],
                ['#dropZone', 'dropZone']
            ];
            function applyLanguage(){
                /* 🟥 V4.3.45（R4-3）：先把语言同步给**主进程**。
                   托盘菜单、系统对话框标题、主进程回传的 error 串/能力说明/诊断文本
                   都在主进程里生成，它们不在这份 DOM 里 —— 不告诉主进程，英文模式下
                   就会出现"前半句英文、后半句中文"（例如「Update check failed：更新清单必须使用 https」）。 */
                try{ if(window.readerAPI && window.readerAPI.setLang) window.readerAPI.setLang(currentLang); }catch(e){ logRenderError('setLang failed: '+((e&&e.message)||e)); }
                /* 🟥 V4.3.44（R3-4）：静态文案统一走这一句 —— 它同时认两种 data-i18n 写法：
                   ① 中文原文（新增的静态文案，表在 scripts/i18n-literals.js）
                   ② 语义键（index.html 里原有的 data-i18n="fontDefault"），值从 I18N 里取
                   **必须是本函数的第一步**：后面几步（状态栏、模式指示、悬停提示）会按运行状态
                   覆盖同一批元素，先写静态值、再让状态值赢，才不会被固定文案顶掉。 */
                try{ if(window.applyI18nLiterals) window.applyI18nLiterals(document, currentLang, I18N); }catch(e){ logRenderError('applyI18nLiterals failed: '+((e&&e.message)||e)); }
                I18N_SELECTORS.forEach(([sel, key, inner]) => {
                    if (!key) return;
                    const el = document.querySelector(sel);
                    if (!el) return;
                    /* 🎨 V4.3.56：带图标的按钮只替换 `.lbl` 的文字，别把 <svg> 冲掉 */
                    const host = inner ? el.querySelector(inner) : el;
                    if (host) host.textContent = t(key);
                });
                [['focusBtn','tipFocus'], ['helpBtn','tipHelp'], ['closeBtn','tipClose'], ['clearBtn','clearTitle']].forEach(([id, key]) => {
                    const el = $(id);
                    if(!el) return;
                    if(el.__tip !== undefined){ el.__tip = t(key); el.removeAttribute('title'); }   // 自绘提示接管后不再回流原生 title
                    else el.title = t(key);
                });
                renderShortcutHelp();
                $('searchInput').placeholder = TT('搜索...','Search...');
                if (state.chapters.length) {
                    /* V4.3.33 修：原先只判 length>0，没判 currentIndex 在界内 ——
                       切语言 / 导入数据后会走到这里，越界即抛 TypeError 打断后续本地化。
                       其它路径（goTo、恢复备份）都有钳制，只有这处漏了。 */
                    const cur = state.chapters[state.currentIndex] || state.chapters[0];
                    dom.statusText.textContent = `📌 ${cur.title}`;
                } else {
                    dom.statusText.textContent = t('noFile');
                }
                /* 📖 V4.3.68：空书状态下的占位文案也按语言走。
                   ⚠️ 只在**没有章节**时写 —— 有章节时这里绝不能碰 textContent，
                   否则一次切语言/切模式就把正文换掉了（V4.3.67 及更早的真实 bug）。 */
                if(!state.chapters.length && dom.novelContent) dom.novelContent.textContent = t('loadPrompt');
                refreshModeIndicator();
                refreshAutoScrollLabel();
            }
            function setLanguage(lang) {
                currentLang = lang;
                Storage.set('flang', lang);
                applyLanguage();
                /* 🟥 V4.3.45（R4-3）：主进程侧的用户可见文案（能力说明 / 诊断 / 错误串）
                   是按当前语言即时生成的，切语言后必须重新拉一次，否则设置→诊断里
                   那句说明会停在切换前的语言（skipSelftest=true：只刷新文案，不排自检）。 */
                /* 🟥 V4.3.48（R7-3）：`syncCapabilities` 是 async —— 同步 try/catch 抓不到它的拒绝
                   （`_r7_await_scan.py` 全仓扫出 7 处，这是其中之一）。改成显式接住并留痕。 */
                syncCapabilities(true).catch(function(e){ logRenderError('syncCapabilities failed: '+((e&&e.message)||e)); });
                // 同步给独立小窗，保证面板语言一起切换
                try{ syncToolbarPanel(); syncSettingsPanel(); }catch(e){}
            }

            // IndexedDB
            const Crypto = {
                _key:null, _promise:null, degraded:false,
                b64ToBytes(b64){ const bin=atob(b64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); return u; },
                bytesToB64(u){ /* 分块 apply，消除逐字节 s+= 的 O(n²) 重拷贝（同 util.js） */ let s=''; for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null, u.subarray(i, i+0x8000)); return btoa(s); },
                async getKey(){
                    if(this._promise) return this._promise;
                    this._promise=(async()=>{
                        if(this._key) return this._key;
                        try{
                            if(window.readerAPI && window.readerAPI.getCryptoKey){
                                const b64=await window.readerAPI.getCryptoKey();
                                if(b64){ const raw=this.b64ToBytes(b64); this._key=await crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']); }
                            }
                        }catch(e){}
                        /* 🆕 V4.3.24：拿不到密钥＝本机加密不可用，标记出来当"降级"处理，别再静默写明文 */
                        if(!this._key) this.degraded = true;
                        return this._key || null;
                    })();
                    return this._promise;
                },
                async encryptString(str){ const key=await this.getKey();
                             if(!key) return null;
                             const iv=crypto.getRandomValues(new Uint8Array(12));
                             const buf=new TextEncoder().encode(str);
                             const ct=await crypto.subtle.encrypt({name:'AES-GCM', iv:iv}, key, buf);
                             return { iv:this.bytesToB64(new Uint8Array(iv)), data:this.bytesToB64(new Uint8Array(ct)) };
                            },
                async decryptString(pack){ if(!pack || !pack.iv || !pack.data) return null;
                             const key=await this.getKey();
                             if(!key) return null;
                             try{ const iv=this.b64ToBytes(pack.iv);
                             const ct=this.b64ToBytes(pack.data);
                             const buf=await crypto.subtle.decrypt({name:'AES-GCM', iv:iv}, key, ct);
                             return new TextDecoder().decode(buf);
                             }catch(e){ return null;
                            } }
            };

            const DB = {
                _db:null, _name:'ReaderDB', _store:'chapters', _books:'books', _bookChapters:'bookchapters',
                /* 🟥 V4.3.44（R3-1）：写入按「**调用顺序**」串行化 —— 谁先发起谁先落盘。
                   问题：IndexedDB 的 readwrite 事务按**创建顺序**串行，而各写方法在建事务前所需的
                   await 次数并不相同 —— clearChapters / deleteBook 只 await 一次 open()，
                   saveChapters / saveBook 还多一次 await Crypto.encryptString。于是"先发起的写入"
                   反而排在 clear 之后提交：用户点了「清空所有内容」/ 删掉一本书 / 恢复默认设置，
                   界面已经显示清干净了，在途的写入才落盘 —— 重启后那本书、那章又回来了。
                   实测（work/_r3_race_1.js）·A2 在途 save 撞 clear → 内容复活；B2 saveBook 撞 deleteBook
                   → 删掉的书复活；而顺序执行的负对照干净。
                   做法：写方法在**第一行**（任何 await 之前）同步取号进队列，调用点一个都不用改。
                   只串行「写」；读（loadChaptersEx / getBook / listBooks）仍旧并发，互不阻塞。
                   注意：队列自身吞掉 rejection（否则一次失败会卡死后面所有写入），错误依然交给调用方。 */
                _wq: Promise.resolve(),
                _wseq(fn){
                    const run = () => fn();
                    const p = this._wq.then(run, run);   // 前一个失败也照常轮到下一个
                    this._wq = p.then(()=>{}, ()=>{});   // 队列只负责"排到下一个"，错误不外溢
                    return p;
                },
                /* 🟥 V4.3.44（R3-1 下半）：内容代次。
                   「串行队列」只解决"同一时刻两个写谁先提交"，解决不了**清空之后晚到的写入**：
                   重抓本章 / 自动追更 会先 await 网络（几十毫秒到几秒），拿到结果才写盘。
                   用户在这段时间里点了「清空所有内容」—— 清空早就提交完了，迟到的写入才落盘，
                   重启后内容又回来了（work/_r3_race_1.js ·E 用例，清空是最后动作却仍被顶回）。
                   所以：清空/删除时**同步**自增代次（不能放进队列里自增 —— 队列可能被前面的大写入
                   堵住，自增一旦迟到，跨等待的流程就会以为自己还"新鲜"）；跨等待的流程在**发起时**
                   记下代次，落盘前用 stale() 复检，变了就整段作废。 */
                _gen: 0,
                stale(g){ return g !== this._gen; },
                /* V4.3.33b：补 onblocked —— 版本升级被其它实例阻塞时，Promise 既不 resolve 也不 reject，
                   之后所有 DB 操作集体挂起（界面像"卡死"但没有任何报错）。 */
                open(){ return new Promise((res,rej)=>{ if(this._db) return res(this._db);
                             const req=indexedDB.open(this._name,2);
                             req.onupgradeneeded=e=>{ const db=e.target.result;
                             if(!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters',{keyPath:'id'});
                             if(!db.objectStoreNames.contains('books')) db.createObjectStore('books',{keyPath:'id'});
                             if(!db.objectStoreNames.contains('bookchapters')) db.createObjectStore('bookchapters',{keyPath:'id'});
                             };
                             req.onsuccess=e=>{this._db=e.target.result;res(this._db)};
                             req.onerror=rej;
                             req.onblocked=()=>rej(new Error('数据库被另一个实例占用，无法升级'));
                             });
                            },
                /* V4.3.33b：两处修正 ——
                   ① `JSON.stringify` 单独 try：它抛错（超大章节 / 内存不足）时，原先会被笼统当成
                      「本机加密不可用」，给用户完全错误的成因提示；
                   ② 事务必须监听 onerror / onabort 并 **reject**：原先只等 oncomplete，
                      事务被中止（配额满 / 结构化克隆失败）时 Promise **永不结算** ——
                      表现为整个流程静默卡死：清空内容、加载文件之后的代码全都不执行，界面也不报错。 */
                async saveChapters(ch){ return this._wseq(async()=>{
                        const db=await this.open();
                        let json; try{ json=JSON.stringify(ch); }catch(e){ throw new Error('章节内容过大，无法序列化：'+((e&&e.message)||e)); }
                        /* 🛡 V4.3.38：降级（本机加密不可用）时存**数组**，与 saveBook 口径一致。
                           原先 `data = json`（JSON.stringify 得到的**字符串**），而 loadChaptersEx
                           只认「数组」或「{__enc}」对象 —— 字符串一律判 'error'。
                           于是"加密不可用"的机器上（换账户 / keystore 坏 / 无 keyring）保存的书，
                           重启后必定显示「本地书籍数据损坏」：数据就在库里，却恰恰在
                           最需要本机副本兜底的场景下读不回来。 */
                        let data=ch;
                        try{ const pack=await Crypto.encryptString(json); if(pack) data={__enc:pack}; else noteCryptoDegraded(); }catch(e){ noteCryptoDegraded(); }
                        const tx=db.transaction(this._store,'readwrite');
                        tx.objectStore(this._store).put({id:'main',data:data});
                        await new Promise((res,rej)=>{ tx.oncomplete=res; tx.onerror=()=>rej(tx.error||new Error('保存章节事务失败')); tx.onabort=()=>rej(tx.error||new Error('保存章节事务被中止（体量过大或配额不足）')); });
                }); },
                /* 🟥 V4.3.24：把「读取」拆成**可分辨三态**的结果。
                   原来只有一个 null：分不清「本来就没有书」和「**有书但本机解不开**」（换机/重装/换 Windows 账户后
                   密钥变了就会这样）。后者用户看到的是空阅读器，会以为书丢了 —— 而数据其实还在 IndexedDB 里。
                   现在 state: 'ok' | 'empty' | 'locked'（有密文但解不开） | 'error'（解开了但格式不对）。 */
                async loadChaptersEx(){
                    const db=await this.open();
                    const rec=await new Promise(res=>{ const req=db.transaction(this._store,'readonly').objectStore(this._store).get('main'); req.onsuccess=()=>res(req.result||null); req.onerror=()=>res(null); });
                    if(!rec || rec.data===undefined || rec.data===null) return { state:'empty', chapters:[] };
                    const raw=rec.data;
                    if(raw && raw.__enc){
                        const plain = await Crypto.decryptString(raw.__enc);
                        if(!plain) return { state:'locked', chapters:[] };
                        try{ const arr=JSON.parse(plain); return Array.isArray(arr) ? { state: (arr.length?'ok':'empty'), chapters: arr } : { state:'error', chapters:[] }; }
                        catch(e){ return { state:'error', chapters:[] }; }
                    }
                    /* 🛡 V4.3.38：兼容"降级明文"的**历史**形态 —— 旧版 saveChapters 落的是 JSON 字符串。
                       这里原先只认数组，于是这些库里的数据被判成「损坏」。字符串先尝试解析回去。 */
                    if(typeof raw === 'string'){
                        try{ const arr=JSON.parse(raw); return Array.isArray(arr) ? { state:(arr.length?'ok':'empty'), chapters:arr } : { state:'error', chapters:[] }; }
                        catch(e){ return { state:'error', chapters:[] }; }
                    }
                    return Array.isArray(raw) ? { state:(raw.length?'ok':'empty'), chapters:raw } : { state:'error', chapters:[] };
                },
                async loadChapters(){ const r=await this.loadChaptersEx(); return (r.state==='ok') ? r.chapters : null; },
                // V4.3.33b：同 saveChapters —— 只等 oncomplete 会让失败路径永久挂起
                async clearChapters(){ this._gen++;
                             return this._wseq(async()=>{ const db=await this.open();
                                          const tx=db.transaction(this._store,'readwrite');
                                          tx.objectStore(this._store).delete('main');
                                          await new Promise((res,rej)=>{ tx.oncomplete=res;
                                          tx.onerror=()=>rej(tx.error||new Error('清空章节事务失败'));
                                          tx.onabort=()=>rej(tx.error||new Error('清空章节事务被中止'));
                                          });
                                          });
                            },
                /* V4.3.35：`chapters === undefined` 表示「本次只更新元数据，不要碰正文」。
                   换源那条路径就是靠它 —— 原写法 `(b0 && b0.chapters) || []` 在"读失败"或
                   "正文锁定（换机后解不开，getBook 返回 chapters=[]）"时会拿**空数组**覆盖 bookchapters，
                   把「解不开但数据还在」变成「数据没了」。 */
                async saveBook(meta, chapters){ return this._wseq(async()=>{
                    const db=await this.open();
                    /* V4.3.36：只有"非空数组"才算要写正文。传 null / [] / 非数组一律按"只更元数据"处理 ——
                       避免将来某个调用点顺手传个空值就把整本正文覆盖掉（那是"静默清空用户正文"级别的坑）。 */
                    const hasBody = (chapters !== undefined && chapters !== null && Array.isArray(chapters) && chapters.length > 0);
                    let data=chapters;
                    if(hasBody){ try{ const pack=await Crypto.encryptString(JSON.stringify(chapters)); if(pack) data={__enc:pack}; else noteCryptoDegraded(); }catch(e){ noteCryptoDegraded(); } }
                    /* 🟥 V4.3.24：元数据与正文放进**同一个事务**。原先各开一个事务再 Promise.all，
                       两者互不原子 —— 极端情况（写盘中断/配额满）会留下「书架里有这本书、正文却是空的」。
                       同事务后要么都写入、要么都不写。 */
                    /* V4.3.33 修（单点收口）：`books` 存储只该放**元数据**，正文归 `bookchapters`。
                       但好几处调用点是拿 `DB.getBook()` 的返回值直接回写的 —— 那个对象带 `chapters`，
                       于是**整本正文被塞进 books**：逐本膨胀，`listBooks()`（getAll）每次都要搬运全书正文。
                       在这里统一剥掉，所有调用点（自动追更 / 换源 / 导入）自动安全，
                       顺带把历史脏数据在下次保存时洗掉。 */
                    const cleanMeta = Object.assign({}, meta);
                    delete cleanMeta.chapters;
                    delete cleanMeta.chaptersLocked;
                    const tx = db.transaction([this._books, this._bookChapters], 'readwrite');
                    tx.objectStore(this._books).put(cleanMeta);
                    // V4.3.35：chapters === undefined 时只更元数据，绝不触碰正文
                    if(hasBody) tx.objectStore(this._bookChapters).put({ id: cleanMeta.id, data: data });
                    /* 🟥 V4.3.33b 修：原先三态共用同一个 resolve —— 事务因配额超限 / 结构化克隆失败
                       abort 时，Promise 会被**成功** resolve，错误被彻底吞掉：
                       persistActiveBook / checkBookUpdates / 换源 全都以为"已保存"，
                       refreshTabs 还渲染出标签，用户以为书入库了，其实没落盘。 */
                    await new Promise((res, rej) => {
                        tx.oncomplete = res;
                        tx.onerror = () => rej(tx.error || new Error('保存书籍事务失败'));
                        tx.onabort = () => rej(tx.error || new Error('保存书籍事务被中止（体量过大或配额不足）'));
                    });
                }); },
                /* 🆕 V4.3.61：`opts.lite` 会剥掉**重字段**（目前只有 `cover`，单张实测 3.3~3.7KB base64）。
                   背景：V4.3.57 给每本书加了封面，于是 `listBooks()` 的返回体从"纯元数据"变成
                   "元数据 + 每本 3.5KB 的 dataURL"。而 8 个调用点里**只有书架面板**真的要用封面，
                   其余 7 处（标签页刷新 / 重复导入去重 / 追更判等）都只是拿 id 和标题 ——
                   它们每调一次就白搬 N×3.5KB 的字符串，还要过一次结构化克隆。
                   默认仍返回全量（保持兼容），需要的调用点显式传 `{lite:true}`。 */
                async listBooks(opts){
                    const db=await this.open();
                    const rows = await new Promise(res=>{ const req=db.transaction(this._books,'readonly').objectStore(this._books).getAll(); req.onsuccess=()=>res(req.result||[]); req.onerror=()=>res([]); });
                    if(!opts || !opts.lite) return rows;
                    return rows.map(b => { const o=Object.assign({}, b); delete o.cover; return o; });
                },
                async getBook(id){ const db=await this.open();
                             const meta=await new Promise(res=>{ const req=db.transaction(this._books,'readonly').objectStore(this._books).get(id); req.onsuccess=()=>res(req.result||null); req.onerror=()=>res(null); });
                             if(!meta) return null;
                             const chRec=await new Promise(res=>{ const req=db.transaction(this._bookChapters,'readonly').objectStore(this._bookChapters).get(id); req.onsuccess=()=>res(req.result||null); req.onerror=()=>res(null); });
                             let chapters=null, locked=false;
                             if(chRec && chRec.data){ try{ if(chRec.data.__enc){ const plain=await Crypto.decryptString(chRec.data.__enc);
                             if(plain) chapters=JSON.parse(plain);
                             else locked=true;
                             } else { chapters=chRec.data;
                             } }catch(e){ chapters=null;
                             } } if(!Array.isArray(chapters)) chapters=[];
                             return Object.assign({}, meta, { chapters, chaptersLocked: locked });
                            },
                // V4.3.33b：同 saveChapters —— 只等 oncomplete 会让失败路径永久挂起（标签点了 ✕ 不消失）
                async deleteBook(id){ this._gen++;
                             return this._wseq(async()=>{ const db=await this.open();
                                          const done=t=>new Promise((res,rej)=>{ t.oncomplete=res;
                                          t.onerror=()=>rej(t.error||new Error('删除事务失败'));
                                          t.onabort=()=>rej(t.error||new Error('删除事务被中止'));
                                          });
                                          const t1=db.transaction(this._books,'readwrite');
                                          t1.objectStore(this._books).delete(id);
                                          const p1=done(t1);
                                          const t2=db.transaction(this._bookChapters,'readwrite');
                                          t2.objectStore(this._bookChapters).delete(id);
                                          await Promise.all([p1,done(t2)]);
                                          });
                            }
            };

            /* 🟥 V4.3.24：三件「以前静默、现在必须出声」的数据事件。共同原则：
               用户不能靠猜 —— 「有数据但打不开」「备份没写成功」「其实没加密」这三种情况，
               界面上看不出来，但都会让用户**误判自己的数据安全**。都只提示一次，不刷屏。 */
            let cryptoDegradedNoted = false;
            function noteCryptoDegraded(){
                if(cryptoDegradedNoted) return;
                cryptoDegradedNoted = true;
                try{ logRenderError('crypto degraded: 本机加密不可用，正文将以明文保存'); }catch(e){}
                if(state.chapters && state.chapters.length) showHint(TT('⚠️ 本机加密不可用（换机/重装/换账户后会出现），正文将以**明文**保存','⚠️ Local encryption unavailable; content will be stored unencrypted'), 'warn');
            }
            let chaptersLockedNoted = false;
            function noteChaptersLocked(){
                if(chaptersLockedNoted) return;
                chaptersLockedNoted = true;
                try{ logRenderError('chapters locked: 有正文但本机密钥解不开'); }catch(e){}
                showHint(TT('⚠️ 本机存着书籍正文，但**这把钥匙解不开它**（换机/重装/换 Windows 账户后会出现）。数据还在本机，请用「导入数据」恢复。','⚠️ Local chapters exist but cannot be decrypted on this machine. Data is still there — use "Import data" to restore.'), 'warn');
            }
            let backupFailedNoted = false;
            function noteBackupFailed(err){
                try{ logRenderError('backup failed: ' + (err || '')); }catch(e){}
                if(backupFailedNoted) return;
                backupFailedNoted = true;
                showHint(TT('⚠️ 自动备份写入失败，本次改动可能没有被备份下来（失败原因已写日志）','⚠️ Auto backup failed to write; recent changes may not be backed up (see logs)'), 'warn');
            }

            // 配置
            const CONFIG = {
                MIN_FONT:10, MAX_FONT:22, DEF_FONT:13, MIN_LINE_HEIGHT:1.5,
                DEF_TEXT_COLOR:'#24292e', DEF_BG_RGB:{r:240,g:242,b:245},
                DEF_SHADOW:50, DEF_DELAY:1500, DEF_LINE_HEIGHT:1.6,
                SKINS:['light','dark'],
                /* 🆕 V4.3.98（开源）：对外入口集中在这里 —— 换仓库或换赞助页只改这两行。
                   FEEDBACK_DEFAULT 是「打开反馈地址」的默认值，用户可在设置里覆盖；
                   SUPPORT_URL 留空时点「支持开发」会提示暂未设置（不弹死链）。 */
                FEEDBACK_DEFAULT:'https://github.com/ryyx7193/floating-reader/issues',
                SUPPORT_URL:'',
                KEYS:{ BOOKMARKS:'fb',
                             SKIN:'fs',
                             FONT:'ff',
                             READER_IDX:'fi',
                             READER_TOTAL:'ft',
                             TEXT_COLOR:'ftc',
                             BG_RGB:'fbr',
                             SHADOW:'fsh',
                             WINDOW_OPACITY:'fwo',
                             TEXT_OPACITY:'fto',
                             READ_MODE:'frm',
                             FOCUS:'ffm',
                             GRAY:'fge',
                             DELAY:'fd',
                             AUTO_CONTRAST:'fac',
                             LINE_HEIGHT:'flh',
                             READING_FONT:'frf',
                             AUTO_SCROLL_SPEED:'fss',
                             ALLOW_SELECT:'fal',
                             CUSTOM_CSS:'fcss',
                             LANGUAGE:'flang',
                             SHORTCUTS:'fsc',
                             AUTO_PICK:'fap',
                             BOOK_ID:'fbid',
                             BOOK_TITLE:'fbt',
                             THEMES:'fthm',
                             ACTIVE_THEME:'fath',
                             UPDATE_URL:'fupd',
                             FEEDBACK_URL:'ffb',
                             TTS_RATE:'fttr',
                             TTS_VOICE:'fttv',
                             DISGUISE_SKIN:'fdg',
                             /* 🆕 V4.3.86 伪装外观常驻（fdgr）：把伪装皮肤当成**可阅读的皮肤**用 ——
                                正文按假文档外观渲染，能正常滚动/翻页/选中/用快捷键，且重启后保持。
                                🟥 与 isDisguised（全窗遮罩、临时遮挡）是**两件不同的事**，不要合并：
                                遮罩是"立刻挡住"，常驻皮肤是"一直伪装着看"。 */
                             DISGUISE_READ:'fdgr',
                             /* 🎨 V4.3.86 取色点位置（fpdp）：存屏幕比例 {x,y}，
                                不存像素 —— 窗口尺寸/缩放变了也不会跑到窗外。 */
                             PICK_DOT_POS:'fpdp',
                             FG_WATCH:'ffw',
                             FG_WATCH_LIST:'ffwl',
                             READING_STATS:'frs',
                             AUTO_UPDATE:'fau',
                             AUTO_UPDATE_MIN:'faum',
                             CONTENT_PROTECT:'fcp',
                             PROTECT_VERDICT:'fpv',
                /* 🆕 V4.3.53（R12-2）伴随模式：开关 / 目标程序 / 陪显示时机 / 贴边位置。
                   这四个都是**普通设置**（进备份、恢复默认会清）—— 没有任何一个是用户资产，
                   所以既不用登记 USER_DATA_KEYS 也不用进 STAT_KEYS。 */
                COMPANION:'fcmp', COMPANION_TARGET:'fcmpt', COMPANION_MODE:'fcmpm', COMPANION_EDGE:'fcmpe',
                /* 🆕 V4.3.54（吸色联动）「融入目标配色」开关。普通设置：进备份、恢复默认会清。 */
                COMPANION_TINT:'fcmt',
                /* 🆕 V4.3.55（生命周期联动）关闭联动 / 最小化联动。普通设置：进备份、恢复默认会清。
                   默认值在 state 侧给 true（主人要求的联动语义），存储里没有时按默认走。 */
                COMPANION_LINK_CLOSE:'fcmplc', COMPANION_LINK_MIN:'fcmplm',
                /* 🆕 V4.3.70 页边距（fpm）。普通设置：进备份、恢复默认会清。 */
                PAGE_MARGIN:'fpm',
                /* 🆕 V4.3.71 批注（fann）。和书签同性质：是**用户资产**，进备份、跟着书走。 */
                ANNOTATIONS:'fann',
                /* 🆕 V4.3.23 书库：站点清单（fsites）。它是**用户数据**不是设置，登记在这里只是为了
                   让「恢复默认设置」的遍历能识别到它 —— 见 USER_DATA_KEYS 处的排除逻辑。 */
                SITES:'fsites',
                /* 🆕 V4.3.53（建议 1）伴随模式「最近用过的目标程序」（fct）。同 fsrchist：
                   便捷缓存不是用户资产，恢复默认清掉可以接受；登记进键表即自动进备份白名单
                   （KNOWN_SETTING_KEYS，导出什么就能导入什么）。
                   ⚠️ 必须排在书源历史那条之前 —— _v433_regress.js 的键表解析拿最后那个
                   键当表尾锚（正则截断），排在锚之后会被当成"未登记键"误报。 */
                COMPANION_TGT_HIST:'fct',
                /* 🆕 V4.3.24 书源表单「历史填过的值」（fsrchist）。它是便捷缓存，不是用户资产，
                   被「恢复默认设置」清掉可以接受，所以只登记到这里即可。 */
                SRC_HISTORY:'fsrchist' }
            };
            const S = CONFIG.KEYS;
            /* 🟥 V4.3.45（R4-2）：光有**键名**白名单不够，数值型设置项还必须有**值域**。
               原先 autoUpdateMin 只夹了下界（`Math.max(15,+v)`），上界没有 ——
               而 `faum` 是已登记键，恢复备份 / 导入数据两条路径**只查键名不查值**，
               于是备份里写 `{"fau":true,"faum":36000}` 就能把 36000 分钟（= 2160000000ms）
               交给 setInterval。该值**超过 int32 上限**，在 Chromium 里被折叠成几十毫秒，
               定时器退化成忙循环（实测 1.2 秒触发 303 次）并持续高频抓书源。
               注意不是"值大就炸"：100000 分钟因 `ms % 2³²` 恰好落回正区间，实测一次都不触发 ——
               所以这里卡的是**明确的上下界**，不是靠"感觉够大就行"。
               新增数值型设置项时，必须在这里登记一行（上界换算成毫秒不得接近 2³¹）。
               ⚠️ 这张表必须定义在 `state` 字面量**之前**：它是 const，后面才用会踩 TDZ。 */
            const SETTING_RANGES = {
                [S.AUTO_UPDATE_MIN]: { min: 15, max: 10080, def: 60 },   // 15 分钟 ~ 7 天（7 天 = 604800000ms，安全）
                /* 🆕 V4.3.70：页边距 0~48px。SETTING_RANGES 是唯一的钳制点 ——
                   不登记 = 面板滑块有 min/max 兜着，但「导入数据」那条路会原样放行任意值。 */
                [S.PAGE_MARGIN]: { min: 0, max: 48, def: 0 },
                /* 🟥 V4.3.51（R10-2）：'fd'（移出延迟关闭）原先**没登记**在这张表里，
                   于是三个入口全都拿不到钳制：
                     ① 面板滑块（有 min/max 兜着，UI 上越不了界）；
                     ② 读取（state 初始化 / 导入重载）—— 存储里是什么就是什么；
                     ③ **导入数据** —— 走 normalizeSettingValue 时因为没这条规则而原样放行，
                        一份被改过的备份就能把延迟灌成负数或 999999。
                   它与 AUTO_UPDATE_MIN 是同一类"数值型设置"，没有理由只登记一个。
                   上界取 3000 与 panel.html 里滑块的 max 对齐（同一个真源的两种表达）。 */
                [S.DELAY]: { min: 0, max: 3000, def: CONFIG.DEF_DELAY },
                /* 🟥 V4.3.82 审查补：其余数值型设置也登记 —— 与面板滑块的 min/max 对齐（同一真源的两种表达）。
                   之前只有上面三条，其余数值键走「导入数据」时原样放行；应用点虽然各自有钳制
                   （opacity 主进程夹 0~1、字号 Math.min/max、语速夹 0.5~2），但**行距只有下界没有上界**
                   —— 一份被改过的备份能把行距灌成 999，一屏一个字。这里统一兜住，不依赖各应用点自觉。 */
                [S.LINE_HEIGHT]: { min: 1.5, max: 4.5, def: CONFIG.DEF_LINE_HEIGHT },
                [S.TEXT_OPACITY]: { min: 10, max: 100, def: 100 },
                [S.WINDOW_OPACITY]: { min: 20, max: 100, def: 100 },
                [S.SHADOW]: { min: 0, max: 100, def: CONFIG.DEF_SHADOW },
                [S.AUTO_SCROLL_SPEED]: { min: 0, max: 100, def: 0 },
                [S.FONT]: { min: CONFIG.MIN_FONT, max: CONFIG.MAX_FONT, def: CONFIG.DEF_FONT },
                [S.TTS_RATE]: { min: 0.5, max: 2, def: 1 }
            };
            function normalizeSettingValue(k, v){
                const r = SETTING_RANGES[k];
                if(!r) return v;
                const n = +v;
                if(!isFinite(n)) return r.def;
                return Math.min(r.max, Math.max(r.min, n));
            }
            // 版本号唯一真源在 package.json，由 preload 同步读出（渲染层拿不到 fs），
            // 标题 / 书架导出 / 数据导出 / 启动日志共用这一个值，升版只改 package.json。
            let APP_VERSION = (window.readerAPI && window.readerAPI.appVersion) || '0.0.0';
            /* 🆘 V4.3.24 SOS 的键位定案：
               用户先指定 Ctrl+Shift+S，但那已经是「脱离监控」的键（用户上一轮刚确认过）。
               同一个键绑两个动作，按下去干哪个不确定 —— 所以按用户给的第二个选项：
               **SOS 用 Ctrl+Shift+H**（原来「只藏阅读窗口」那个键，语义升级为全隐藏），
               脱监继续用 Ctrl+Shift+S 不动。这样两边都不用迁移老用户的持久化键位。 */
            /* 📑 V4.3.29：书签做成可配置快捷键（第 12 项），默认 Ctrl+Shift+M。
               选它的原因：避开 RESERVED_COMBOS（Ctrl+Shift+0/L/B、T）与已有 11 项的键位，
               避免「按下去不确定触发谁」。改键也走同一套冲突检测（shortcutOwner + RESERVED_COMBOS）。
               改这里必须同步 panel.html 的 #shortcutBookmark 行 + SHORTCUT_LABELS +
               PANEL_LIST_TEXT 顺序数组 + smoke2/smoke3 的项数断言。 */
            const DEFAULT_SHORTCUTS = { prev:'←', next:'→', hide:'Ctrl+Shift+H', focus:'Ctrl+Shift+D', search:'Ctrl+F', globalSearch:'Ctrl+Shift+F', autoScroll:'Space', pickPoint:'Ctrl+Shift+P', toolbar:'Ctrl+Shift+T', contentProtect:'Ctrl+Shift+S', toc:'Ctrl+Shift+G', bookmark:'Ctrl+Shift+M' };
            /* 🆘 V4.3.24：SOS = 隐藏/显示键（Ctrl+Shift+H）的语义升级版，所以 SOS 的提示键位 = 隐藏键本身。
               用户可改键，但这里用默认值给出提示即可（按下时走的是 sc.hide 那条分支）。 */
            const SOS_KEY = DEFAULT_SHORTCUTS.hide;
            // 🟥 V4.3.19：脱监（脱离监控）加入快捷键系统 —— 这样它自动出现在「快捷键说明」浮层里，
            // 也能在设置里改键、参与冲突检测、被「恢复默认」还原。改这里必须同步 panel.html 的
            // #shortcutContentProtect 行 + PANEL_LIST_TEXT 的顺序数组 + smoke2/smoke3 的项数断言。
            const SHORTCUT_LABELS = { prev:'上一章', next:'下一章', hide:'隐藏/显示', focus:'专注模式', search:'当前章搜索', globalSearch:'全文搜索', autoScroll:'自动滚动', pickPoint:'取色点', toolbar:'工具栏', contentProtect:'脱离监控', toc:'目录', bookmark:'书签' };
            /* 🆘 V4.3.28：keydown 里**硬编码**、不走 state.shortcuts 的保留键。
               以前 setShortcut 只查 shortcutOwner（11 个可配置键互相之间），
               用户把某功能改成这些值会**静默撞车**——硬编码分支照样触发、被占功能失灵且无提示。
               改 keydown 硬编码区时必须同步这张表。 */
            const RESERVED_COMBOS = {
                'Ctrl+Shift+0': { zh:'重置阴影', en:'Reset shadow' },
                'Ctrl+Shift+L': { zh:'朗读/暂停', en:'Read aloud/pause' },
                'Ctrl+Shift+B': { zh:'伪装开关', en:'Disguise toggle' },
                'T':            { zh:'选中/复制文本', en:'Allow text selection' },
                /* 🛡 V4.3.38：keydown 里还有一批**硬编码**分支没登记，用户可以把某功能改到
                   这些键上 → 一次按键同时触发两件事（"按下去不确定触发谁"，本项目的老红线）。
                   `?` = 快捷键说明浮层；方向键 / PageUp / PageDown / Space = 滚动。 */
                '?':            { zh:'快捷键说明', en:'Shortcut help' },
                '↑':            { zh:'向上滚动', en:'Scroll up' },
                '↓':            { zh:'向下滚动', en:'Scroll down' },
                'PageUp':       { zh:'向上翻页', en:'Page up' },
                'PageDown':     { zh:'向下翻页', en:'Page down' },
                'Space':        { zh:'向下滚动 / 自动滚动', en:'Scroll down / auto scroll' }
            };
            let lastShortcutError = '';   // 最近一次改键冲突（推给设置面板内联显示）
            /* 🟥 V4.3.49（R8-1）：前台观察器的**真实状态**（主进程回传）。
               非空 = 开关虽然亮着，但监听没在跑 —— 必须让用户看见。 */
            let lastFgWatchError = '';
            /* 🆕 V4.3.53（R12-2）伴随模式的两条**运行期**状态（都不是设置值，不进存储）：
               lastCompanionError = 观察器起不来时主进程回传的原因；
               companionDockPaused = 用户把窗口拖走导致贴边暂停（面板上要显示、并给「贴回去」）。 */
            let lastCompanionError = '';
            let companionDockPaused = false;
            const state = {
                chapters:[], currentIndex:0, bookId:null, bookTitle:'', sourceName:'', bookAddedAt:null, originalContent:'', isGrayed:false, isHidden:false,
                /* 🆕 V4.3.24 SOS：是否处于「全收起」状态 + 收起前的现场快照（主窗原本是否隐藏、
                   哪些小窗开着、朗读是否在播），用于再按一次**原样**恢复。 */
                sosActive:false, sosSnapshot:null,
                isFocusMode: Storage.get(S.FOCUS,false), isGrayEnabled: Storage.get(S.GRAY,true),
                /* 📑 V4.3.29 书签模型升级（#22）：见下面 normalizeBookmarks 的说明 */
                fontSize: Storage.get(S.FONT,CONFIG.DEF_FONT), bookmarks: normalizeBookmarks(Storage.get(S.BOOKMARKS,[])),
                annotations: normalizeAnnotations(Storage.get(S.ANNOTATIONS,[])),
                skinIndex: Storage.get(S.SKIN,0), textColor: Storage.get(S.TEXT_COLOR,CONFIG.DEF_TEXT_COLOR),
                bgRgb: Storage.get(S.BG_RGB,CONFIG.DEF_BG_RGB), shadowIntensity: Storage.get(S.SHADOW,CONFIG.DEF_SHADOW),
                windowOpacity: Storage.get(S.WINDOW_OPACITY,100), textOpacity: Storage.get(S.TEXT_OPACITY,100),
                readMode: Storage.get(S.READ_MODE,'multi'), scrollPositions:{},
                closeDelay: normalizeSettingValue(S.DELAY, Storage.get(S.DELAY,CONFIG.DEF_DELAY)), autoContrast: Storage.get(S.AUTO_CONTRAST,false),
                lineHeight: Math.max(CONFIG.MIN_LINE_HEIGHT, Storage.get(S.LINE_HEIGHT,CONFIG.DEF_LINE_HEIGHT)),
                /* 📖 V4.3.70：页边距（px）。默认 0 = 与旧版逐像素一致，不改变任何既有观感。 */
                pageMargin: Math.max(0, Math.min(48, Number(Storage.get(S.PAGE_MARGIN,0))||0)),
                readingFont: Storage.get(S.READING_FONT,"'Consolas', 'Microsoft YaHei', monospace"),
                autoScrollSpeed: Storage.get(S.AUTO_SCROLL_SPEED,0),
                allowSelect: Storage.get(S.ALLOW_SELECT,false), autoPick: Storage.get(S.AUTO_PICK,false),
                // 🛡 脱离监控总开关（V4.3.19）：**默认关闭**（用户定案）。控制「防截屏」+「投屏/远控时自动隐身」两项。
                contentProtectOn: Storage.get(S.CONTENT_PROTECT,false),
                // 本机防截屏能力自检结果（主进程探测，不持久化）：用来如实提示「完整/部分/不支持」
                protectLevel:'unknown', protectNote:'', protectFp:'',
                /* 🟥 V4.3.23：区分「没生效」与「只是还没验」——
                   用户原话：「是确实没能脱离监控，还是单纯的警告，我们要区分开。只有确实是没能脱离监控，我们才会警告。」
                   所以警告不再靠"系统版本看起来行不行"来推，而只看两条**硬证据**：
                     · 平台/系统层面**明确不支持**（Linux / Win10 早于 2004 的降级路径）→ 红
                     · 本机**实测**过（真截屏对比）且结论是 failed → 红
                   没有证据（未验证）时**不报警**，只提示"可以自检"；实测通过则完全静默。
                   缓存 {fp,st,at}：结论只对同一台机器（同指纹）有效，换机器自动作废重测。 */
                protectVerdict: Storage.get(S.PROTECT_VERDICT,null),
                // 🟥 V4.3.22：脱监开着但「确实没生效/不确定」时的警告文案（空 = 无警告）。
                // 会随同步下发给工具栏，让「🛡 脱监」按钮也带上警示标记。
                protectWarn:'',
                pickPointMode:false, sourceRule:null, sourceUrl:'', sourceUrls:[],
                /* 🎨 V4.3.86：取色点位置（窗口比例，null=默认）+ 是否被快捷键隐藏。
                   用比例而不存像素：窗口会拉伸/全屏/进专注模式，存像素会跑到窗外。 */
                pickDotPos:Storage.get(S.PICK_DOT_POS,null), pickDotHidden:false,
                // 🆘 V4.3.24 SOS：`sosActive` / `sosSnapshot` 已在上面声明过，
                //           此处不再重复（对象字面量的重复键会互相覆盖，是纯粹的隐患）
            disguiseSkin: Storage.get(S.DISGUISE_SKIN,'word'), isDisguised:false,
            /* 🆕 V4.3.86：伪装外观**常驻**开关（可正常看书）。默认关 —— 改外观这种事必须用户明确打开。 */
            disguiseRead: Storage.get(S.DISGUISE_READ,false),
                    autoUpdate: Storage.get(S.AUTO_UPDATE,false), autoUpdateMin: normalizeSettingValue(S.AUTO_UPDATE_MIN, Storage.get(S.AUTO_UPDATE_MIN,60)),
            fgWatchEnabled: Storage.get(S.FG_WATCH,false), fgWatchList: Storage.get(S.FG_WATCH_LIST,''),
            /* 🆕 V4.3.53（R12-2）伴随模式：开关 / 目标程序 / 陪显示时机 / 贴边位置。
               默认全关 —— 动窗口位置这种事必须由用户明确打开（形态2 已获主人确认）。 */
            companionEnabled: Storage.get(S.COMPANION,false), companionTarget: Storage.get(S.COMPANION_TARGET,''),
            companionMode: Storage.get(S.COMPANION_MODE,'foreground'), companionEdge: Storage.get(S.COMPANION_EDGE,'free'),
            /* 🆕 V4.3.54：吸色联动。null＝用户从没表态过 —— 开伴随时**联动开一次**（主人原话：
               「选择跟随模式后，应联动开启对应的吸色模式」）；用户显式关过就一直是关。 */
            companionTint: Storage.get(S.COMPANION_TINT,null),
            /* 🆕 V4.3.55（生命周期联动）：关闭联动 / 最小化联动，默认**开**（主人要求的联动语义）。 */
            companionLinkClose: Storage.get(S.COMPANION_LINK_CLOSE,true),
            companionLinkMin: Storage.get(S.COMPANION_LINK_MIN,true),
                shortcuts: Object.assign({}, DEFAULT_SHORTCUTS, Storage.get(S.SHORTCUTS,{})),
                ttsRate: Storage.get(S.TTS_RATE, 1),
                ttsVoice: Storage.get(S.TTS_VOICE, '')
            };
            let hintTimer=null;

            /* ===================== 📑 V4.3.29 书签模型升级（#22） =====================
