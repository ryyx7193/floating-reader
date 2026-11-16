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
                SUPPORT_URL:'https://afdian.com/a/Audrey111',
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
                             /* 🆕 V4.4.0：后台朗读 —— 窗口不可见时是否继续朗读。
                                默认 false = 现状（不可见就停）；开启后用户主动隐藏（托盘 /
                                Ctrl+Shift+H）继续出声，被动隐藏（前台监听 / 伴随自动收起）仍强制停。 */
                             TTS_BG:'fttbg',
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
                   默认值在 state 侧给 true（用户要求的联动语义），存储里没有时按默认走。 */
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
            ttsBg: Storage.get(S.TTS_BG,false),
            /* 🆕 V4.3.53（R12-2）伴随模式：开关 / 目标程序 / 陪显示时机 / 贴边位置。
               默认全关 —— 动窗口位置这种事必须由用户明确打开（形态2 已获用户确认）。 */
            companionEnabled: Storage.get(S.COMPANION,false), companionTarget: Storage.get(S.COMPANION_TARGET,''),
            companionMode: Storage.get(S.COMPANION_MODE,'foreground'), companionEdge: Storage.get(S.COMPANION_EDGE,'free'),
            /* 🆕 V4.3.54：吸色联动。null＝用户从没表态过 —— 开伴随时**联动开一次**（用户原话：
               「选择跟随模式后，应联动开启对应的吸色模式」）；用户显式关过就一直是关。 */
            companionTint: Storage.get(S.COMPANION_TINT,null),
            /* 🆕 V4.3.55（生命周期联动）：关闭联动 / 最小化联动，默认**开**（用户要求的联动语义）。 */
            companionLinkClose: Storage.get(S.COMPANION_LINK_CLOSE,true),
            companionLinkMin: Storage.get(S.COMPANION_LINK_MIN,true),
                shortcuts: Object.assign({}, DEFAULT_SHORTCUTS, Storage.get(S.SHORTCUTS,{})),
                ttsRate: Storage.get(S.TTS_RATE, 1),
                ttsVoice: Storage.get(S.TTS_VOICE, '')
            };
            let hintTimer=null;

            /* ===================== 📑 V4.3.29 书签模型升级（#22） =====================
               旧模型是 [{idx, title}]：**一章只能有一个书签**，且没有位置、没有备注——
               在一章很长的小说里等于「只能记住这一章，记不住读到哪」。
               新模型：{ id, idx, title, pos, mode, note, at }
                 · id   唯一标识（删/改备注都按 id，不再按章节号 —— 这是「一章多书签」的前提）
                 · pos  章内位置，记的是**滚动比例 0~1**而不是像素：换窗口大小/换机器还原时才对得上
                 · mode 记录当时是多行还是单行（单行是 CSS 动画驱动的流式滚动，位置概念弱，如实记下来）
                 · note 备注（想写「这里伏笔」就写）
                 · at   添加时间
               旧数据自动迁移：没有 id 的条目按新模型补齐，老用户不用手动整理。 */
            function genBookmarkId(){ return 'bm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
            /* 🖍 V4.3.71：批注（高亮/划线 + 笔记）。
               位置用**章内字符偏移**（start/end），不用像素、不用 DOM 节点：
               字号、行距、窗口宽度、分页/双栏都会改像素与节点结构，只有字符偏移不变。
               渲染时按偏移把文本节点切开再包 <mark>（见 paintOne），所以偏移必须与
               「chapters[idx].content」严格对齐 —— renderContent 是 textContent 直写，
               分块拼接后与原文逐字符相同，这一点是整套方案的地基。 */
            const ANN_COLORS = ['yellow','green','blue','pink'];
            function genAnnotId(){ return 'an' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
            function normalizeAnnotations(list){
                if(!Array.isArray(list)) return [];
                const out = [];
                list.forEach(a=>{
                    if(!a || typeof a !== 'object') return;
                    const idx = Number(a.idx), start = Number(a.start), end = Number(a.end);
                    if(!Number.isFinite(idx) || idx < 0) return;
                    if(!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
                    out.push({
                        id: (typeof a.id === 'string' && a.id) ? a.id : genAnnotId(),
                        idx: idx,
                        start: Math.max(0, Math.floor(start)),
                        end: Math.max(0, Math.floor(end)),
                        text: String(a.text || ''),
                        note: String(a.note || ''),
                        color: ANN_COLORS.indexOf(a.color) >= 0 ? a.color : 'yellow',
                        at: a.at || new Date().toISOString()
                    });
                });
                return out.sort((x,y)=> (x.idx - y.idx) || (x.start - y.start));
            }
            function normalizeBookmarks(list){
                if(!Array.isArray(list)) return [];
                const out = [];
                list.forEach(b=>{
                    if(!b || typeof b !== 'object') return;
                    const idx = Number(b.idx);
                    if(!Number.isFinite(idx) || idx < 0) return;
                    out.push({
                        id: (typeof b.id === 'string' && b.id) ? b.id : genBookmarkId(),
                        idx: idx,
                        title: String(b.title || ('第' + (idx + 1) + '章')),
                        pos: Number.isFinite(Number(b.pos)) ? Math.max(0, Math.min(1, Number(b.pos))) : 0,
                        mode: (b.mode === 'single') ? 'single' : 'multi',
                        note: String(b.note || ''),
                        at: b.at || new Date().toISOString()
                    });
                });
                return out;
            }
            // 当前读到了这一章的百分之几（0~1）
            function captureBookmarkPos(){
                let ratio = 0;
                /* 📖 V4.3.70：书签存的是**比例**，所以必须按当前轴算 ——
                   双栏下用 scrollTop 算出来的比例恒为 0，书签会全部落在书首。 */
                try{ ratio = pagePosRatio(); }catch(e){}
                return { pos: ratio, mode: (state.readMode === 'single') ? 'single' : 'multi' };
            }

            // DOM 引用
            const dom = {
                mainContent:$('mainContent'),
                contentWrapper:$('contentWrapper'), novelContent:$('novelContent'),
                statusText:$('statusText'), progressBar:$('progressBar'), progressFill:$('progressFill'),
                /* 📑 V4.3.29：bookmarkList / bookmarkBtn / showBookmarksBtn 三个 V4.0 遗留引用已删除 ——
                   bookmarkList 浮层废弃（改书签列表面板），两个按钮的 DOM 也一并从 index.html 移除。 */
                modeIndicator:$('modeIndicator'), dropZone:$('dropZone'),
                closeBtn:$('closeBtn'),
                loadBtn:$('loadBtn'), skinBtn:$('skinBtn'), fontInc:$('fontInc'), fontDec:$('fontDec'),
                prevBtn:$('prevBtn'), nextBtn:$('nextBtn'), textColorPicker:$('textColorPicker'),
                resetColorBtn:$('resetColorBtn'), pickerBtn:$('pickerBtn'),
                shadowIntensitySlider:$('shadowIntensitySlider'), textOpacitySlider:$('textOpacitySlider'), windowOpacitySlider:$('windowOpacitySlider'),
                modeToggleBtn:$('modeToggleBtn'), toggleToolbarBtn:$('toggleToolbarBtn'),
                clearBtn:$('clearBtn'), focusBtn:$('focusBtn'), fullscreenBtn:$('fullscreenBtn'), grayToggleBtn:$('grayToggleBtn'),
                minimizeBtn:$('minimizeBtn'),
                textOpacityValue:$('textOpacityValue'), shadowIntensityValue:$('shadowIntensityValue'), windowOpacityValue:$('windowOpacityValue'), resizeGrip:$('resizeGrip'),
                settingsBtn:$('settingsBtn'), closeDelaySlider:$('closeDelaySlider'),
                closeDelayValue:$('closeDelayValue'), autoContrastSwitch:$('autoContrastSwitch'),
                lineHeightSlider:$('lineHeightSlider'), lineHeightValue:$('lineHeightValue'),
                resetAllBtn:$('resetAllBtn'), exportDataBtn:$('exportDataBtn'), importDataBtn:$('importDataBtn'),
                importCssBtn:$('importCssBtn'), clearCssBtn:$('clearCssBtn'), langZhBtn:$('langZhBtn'), langEnBtn:$('langEnBtn'),
                shortcutHelp:$('shortcutHelp'), searchBar:$('searchBar'), searchInput:$('searchInput'),
                shortcutHelpRows:$('shortcutHelpRows'),
                searchCount:$('searchCount'), searchPrev:$('searchPrev'), searchNext:$('searchNext'), searchClose:$('searchClose'),
                loadingOverlay:$('loadingOverlay'), tocPanel:$('tocPanel'), tocBtn:$('tocBtn'),
                globalSearchBtn:$('globalSearchBtn'),
                fontSelect:$('fontSelect'), autoScrollSpeed:$('autoScrollSpeed'), autoScrollSpeedValue:$('autoScrollSpeedValue'),
                shortcutPrev:$('shortcutPrev'), shortcutNext:$('shortcutNext'), shortcutHide:$('shortcutHide'), shortcutFocus:$('shortcutFocus'),
                settingsCloseBtn:$('settingsCloseBtn'),
                failedBar:$('failedBar'), failedText:$('failedText'), failedRetryBtn:$('failedRetryBtn'),
                pickPreview:$('pickPreview'), tabBar:$('tabBar'), tabPeekBtn:$('tabPeekBtn'),
                /* 🐋 V4.3.53（R12-4）伴随模式顶栏入口的三件：按钮 / 就地浮层 / 贴边暂停动作条 */
                companionBtn:$('companionBtn'), companionPop:$('companionPop'), companionBar:$('companionBar'),
                companionPopSwitch:$('companionPopSwitch'), companionPopInput:$('companionPopInput'),
                companionPopMode:$('companionPopMode'), companionPopEdge:$('companionPopEdge'),
                companionPopRedock:$('companionPopRedock'),
                companionPopDetect:$('companionPopDetect'), companionPopTint:$('companionPopTint'),
                companionPopLinkClose:$('companionPopLinkClose'), companionPopLinkMin:$('companionPopLinkMin'),
                companionBarRedock:$('companionBarRedock'), companionBarEdge:$('companionBarEdge'),
                companionBarOff:$('companionBarOff')
            };

            // ---------- 摘除 V4.0 分窗遗留的「影子 UI」 ----------
            /* 🧹 V4.3.86（用户：“死代码清理做”）：
               index.html 里那三块内嵌抽屉（#toolbarPanel / .settings-panel / #tocPanel）
               已从 HTML 里**真删掉**，不再靠运行时 removeChild。
               但 dom 缓存里还有 ~40 个引用指向它们（pickerBtn / textOpacitySlider / closeDelaySlider…），
               那些代码靠“脱离文档的元素仍可赋值/绑事件”工作 —— 直接删 HTML 会让它们变 null。
               所以这里给**所有拿不到的 dom 项**补一个脱离文档的 <div> 占位：
               语义与之前完全一致（那些元素本来就不在文档里），但 HTML 真的少了 200+ 行。
               🛥 只补 `null`，不覆盖已存在的引用；不进文档，所以不会多渲染任何东西。 */
            (function fillDetachedDomStubs(){
                Object.keys(dom).forEach(function(k){
                    if(dom[k]) return;
                    try{ dom[k] = document.createElement('div'); }catch(e){}
                });
            })();

            // ---------- 数据版本迁移 ----------
            const SCHEMA_VERSION = 1;
            const SCHEMA_KEY = 'schemaVersion';
            const MIGRATIONS = {
                // 示例：1: () => { ... }
            };
            function runMigrations(){
                let cur = Storage.get(SCHEMA_KEY, 0);
                if(cur >= SCHEMA_VERSION) return;
                /* 🟥 V4.3.34：只有**全部成功**才推进版本号。
                   原先无论成败都写 SCHEMA_KEY = SCHEMA_VERSION —— 某个迁移一抛异常就被永久跳过
                   （下次启动 cur >= SCHEMA_VERSION 直接 return），用户数据停在"半迁移"状态且毫无提示。 */
                let ok = true, failedAt = 0;
                for(let v=cur+1; v<=SCHEMA_VERSION; v++){
                    const fn = MIGRATIONS[v];
                    if(!fn) continue;
                    try{ fn(); }catch(e){ ok = false; failedAt = v; logRenderError('migration v'+v+' failed: '+(e&&e.message||e)); break; }
                }
                if(!ok){
                    try{ showHint(TT('⚠️ 数据升级（v'+failedAt+'）失败，已停在当前版本，下次启动会重试', '⚠️ Data migration (v'+failedAt+') failed; staying on the current version and will retry next launch'), 'warn'); }catch(e){}
                    return;
                }
                Storage.set(SCHEMA_KEY, SCHEMA_VERSION);
            }

            // ---------- 渲染进程错误日志 ----------
            function logRenderError(msg){
                try{ if(window.readerAPI && window.readerAPI.logError) window.readerAPI.logError(String(msg)); }catch(e){}
            }
            window.addEventListener('error', function(e){
                logRenderError((e.message||'window error')+' @ '+(e.filename||'')+':'+(e.lineno||0));
            });
            window.addEventListener('unhandledrejection', function(e){
                const r=e.reason;
                logRenderError('unhandledrejection: '+(r && r.stack ? r.stack : String(r)));
            });

            // ---------- 数据备份与恢复 ----------
            // 🟥 阅读统计（frs / frsl）**绝不进「设置」快照**（V4.3.14 修）：
            // 这两个键是「累计出来的计量数据」，不是设置。V4.3.14 之前它跟着设置一起被
            // 自动备份 / 恢复 / 导出 / 导入，于是每次开机自动恢复或导入数据，当日时长都会被
            // 写回快照里的旧值 —— 用户报的「关掉（重开）后还是会重新计时 / 计时倒退」就是这个。
            // 本机 leveldb 里的铁证：总时长在 14988~15011ms 之间反复跳动、甚至倒退。
            const STAT_KEYS = [];   /* 🗑 V4.3.79：阅读统计已移除，保留排除机制防旧备份把计量键混进设置快照 */
/* 🗑 V4.3.79：阅读统计已移除 —— 历史数据（时长/日锚点）按用户要求连数据清掉（每次启动兜底清一次） */
try{ localStorage.removeItem('frs'); localStorage.removeItem('frsl'); }catch(e){}
            const isStatKey = k => STAT_KEYS.indexOf(k) >= 0;
            /* 🟥 V4.3.23：把「用户数据」和「只在本机有效的缓存」从设置里分出来 ——
               起因：`resetAllSettings` 是「遍历 CONFIG.KEYS 逐个 removeItem」，
               而书库（fsites）作为新增键登记进了 CONFIG.KEYS，于是点一次「恢复默认设置」
               会把用户攒的书库整座删掉，且确认文案只写了「章节/书签/进度」——
               用户完全不知情的数据丢失。计量数据（frs/frsl）当年就是为同类问题单列成 STAT_KEYS 的。
               三类键的语义从此明确：
                 · STAT_KEYS      计量：不进快照、不被恢复/导入覆盖
                 · USER_DATA_KEYS 用户数据（书库）：**可以随备份走**（换机不丢），但恢复默认**不能删**
                 · MACHINE_KEYS   只对本机有意义的缓存（防截屏实测结论）：不进备份，避免跨机器"继承"结论 */
            const USER_DATA_KEYS = ['fsites'];
            const MACHINE_KEYS = ['fpv'];
            const isMachineKey = k => MACHINE_KEYS.indexOf(k) >= 0;
            /* 🛡 V4.3.33：设置键的**权威白名单** = `CONFIG.KEYS` 登记表。
               导出与导入两端统一按它走，做到「导出什么就一定能导入什么」。 */
            const KNOWN_SETTING_KEYS = new Set(Object.keys(CONFIG.KEYS).map(k => CONFIG.KEYS[k]).filter(Boolean));
            const isKnownSettingKey = k => KNOWN_SETTING_KEYS.has(k);
            /* 设置快照：**枚举 CONFIG.KEYS**（不再按「f 开头」隐式收集），并排除计量/机器键。
               V4.3.33 改动原因：'f' 前缀口径意味着任何新增键只要以 f 开头就自动进备份 ——
               若它是计量类却忘了登记 STAT_KEYS，就会重演「导入旧备份把当日时长写回旧值」那类
               静默数据回退（frs 当年正是这么踩的）。枚举之后，「是不是设置」由**类型表**决定，
               而不是由命名习惯决定。 */
            function collectSettingsSnapshot(){
                const settings={};
                Object.keys(CONFIG.KEYS).forEach(function(k){
                    const key = CONFIG.KEYS[k];
                    if(!key || isStatKey(key) || isMachineKey(key)) return;
                    try{
                        const raw = localStorage.getItem(key);
                        if(raw === null) return;
                        try{ settings[key]=JSON.parse(raw); }catch(e){ settings[key]=raw; }
                    }catch(e){}
                });
                return settings;
            }
            async function collectBackupData(){
                const settings=collectSettingsSnapshot();
                /* 🟥 V4.3.24：自动备份里的章节**故意不加密**。
                   原先走 `Crypto.encryptString`，那把钥匙是 `safeStorage`（Windows = DPAPI，**绑当前 Windows 账户**）
                   存在 `userData/keystore.dat` 里的 —— 于是换机 / 重装 / 换账户后，这个"保命"的自动备份
                   **恰恰解不开**：用户最需要备份的那一次灾难，恰恰是它救不了的那一次。
                   备份文件与 IndexedDB 同在本机用户目录、权限同级，改明文**不降低实际安全性**，
                   却让「把 backup-*.json 拷到新机器也能恢复」成立。旧版的 `chaptersEnc` 读取兼容保留。 */
                /* 🛡 V4.3.38：补上"当前书的身份"。原先自动备份只有正文，没有书名、没有书源 ——
                   「清库后自动恢复」恢复出来的是**一段无来源、无题目的裸正文**：
                   书架里查不到、书源追更说「缺少书源规则」、重抓本章也没入口。
                   用户以为"备份救回来了"，其实只救回半本书。 */
                /* 🛡 V4.3.39：书架镜像 —— 只在书架「签名」（id+updatedAt+章数）变化时才写入。
                   每 5 分钟全量写书架正文会让备份文件暴涨；签名不变就跳过。
                   数据库整体丢失（磁盘坏 / userData 被清 / 卸载重装）时，自动备份是唯一救星 ——
                   V4.3.38 只救回了"当前正在读的半本书"，书架整列救不回。 */
                let shelf = null;
                try{
                    const books = await DB.listBooks({lite:true});
                    const sig = books.map(b => (b.id||'')+'|'+(b.updatedAt||'')+'|'+(b.chapterCount||0)).join(';');
                    if(sig !== Storage.get('fshelfsig','')){
                        const exp = await exportShelfBooks();
                        if(exp && Array.isArray(exp.books) && exp.books.length) shelf = { count: exp.books.length, books: exp.books };
                        try{ Storage.set('fshelfsig', sig); }catch(e){}
                    }
                }catch(e){}
                return { schemaVersion:SCHEMA_VERSION, savedAt:new Date().toISOString(), settings, bookmarks:state.bookmarks, annotations:state.annotations, scrollPositions:state.scrollPositions, currentIndex:state.currentIndex, chapters: state.chapters, chaptersPlain: true,
                         bookTitle: state.bookTitle || '', sourceName: state.sourceName || '', sourceRule: state.sourceRule || null, sourceUrl: state.sourceUrl || '', sourceUrls: Array.isArray(state.sourceUrls) ? state.sourceUrls : [],
                         ...(shelf ? { shelf: shelf } : {}) };
            }
            let backupInFlight = false;   /* 🛡 V4.3.78：watchdog nudge 与 5 分钟定时可能撞车 —— 重叠时收集阶段交错会写出中间态备份 */
            async function saveBackup(){
                if(!window.readerAPI || !window.readerAPI.saveBackup) return;
                if(backupInFlight) return;   /* 上一次还没写完：跳过这一次（下一次定时/nudge 会再来） */
                backupInFlight = true;
                try{
                    await persistActiveBook();
                    const data=await collectBackupData();
                    /* 🟥 V4.3.24：主进程返回 {ok:false} 时（磁盘满 / 权限 / 路径异常）**必须让用户知道**。
                       原先把返回值丢掉，用户会一直以为"有自动备份兜着"。 */
                    const res = await window.readerAPI.saveBackup(data);
                    if(res && res.ok === false) noteBackupFailed((res && res.error) || '');
                }catch(e){ noteBackupFailed((e && e.message) || e); }
                finally{ backupInFlight = false; }
            }
            let backupTimer=null;
            function scheduleBackups(){
                if(backupTimer) return;
                saveBackup();
                backupTimer=setInterval(saveBackup, 5*60*1000);
            }
            /* 🛡 V4.3.75 S2：主进程 watchdog 的补备推送。渲染层 setInterval 会被后台节流，
               主进程发现备份超龄（>15 分钟）就推 backup:nudge —— 收到立即补备一次。
               saveBackup 自身全兜底（noteBackupFailed 出声），这里不再包第二层。 */
            if(window.readerAPI && window.readerAPI.onBackupNudge){
                window.readerAPI.onBackupNudge(function(){ saveBackup(); });
            }
            /* 🟥 V4.3.43（真缺陷 B）：自动恢复改为**逐份往下试**。
               主进程保留 3 份备份，而原先这里只 loadBackup(null)（= 最新一份）——
               最新那份若是在写入中途被打断（崩溃 / 被强杀 / 磁盘满），JSON 就残缺，
               主进程解析失败返回 null，这里便当成"没有备份"直接放弃恢复：
               明明更旧的备份是完好的。这正是"最需要备份的时候备份失效"。 */
            /* 🟥 V4.3.50（R9-4）：返回值从 `data | null` 改成 `{ data, files }`。
               原先只有一个 null，于是「一份备份都没有」（正常情况）和
               「备份文件都在、但没有一份读得出来」（磁盘坏 / 文件被截断 / 权限）**不可分辨** ——
               两者都走到同一个「📌 请加载文件」，用户会以为自己从来没备份过。
               与 V4.3.43 缺陷 B 同族：那一次修的是"只试最新一份"，没修"试完都失败时怎么说"。 */
            async function loadNewestUsableBackup(){
                let files = 0;
                try{
                    const names=await window.readerAPI.listBackups();
                    if(Array.isArray(names)) files = names.length;
                    for(const nm of (Array.isArray(names)?names:[])){
                        try{ const d=await window.readerAPI.loadBackup(nm); if(d)return { data:d, files }; }catch(e){}
                    }
                }catch(e){}
                // 兜底：listBackups 不可用 / 全部失败时，仍按老路径要一次「最新一份」
                try{ const d = await window.readerAPI.loadBackup(null); return { data: d || null, files }; }
                catch(e){ return { data: null, files }; }
            }
            async function restoreFromBackup(){
                if(!window.readerAPI || !window.readerAPI.loadBackup) return false;
                try{
                    /* 🟥 V4.3.50（R9-4）：{data, files} 三态 —— 别再让"没有备份"与"备份都坏了"合并 */
                    const probe = await loadNewestUsableBackup();
                    const data = probe && probe.data;
                    const backupFiles = (probe && probe.files) || 0;
                    if(!data && backupFiles > 0){
                        showHint(TT('⚠️ 找到 ' + backupFiles + ' 份备份文件，但没有一份能读出来（可能已损坏或被截断）—— 请看日志，必要时改从「导入数据」恢复。',
                            '⚠️ Found ' + backupFiles + ' backup file(s) but none could be read (corrupt or truncated). Check the log; try "Import data" instead.'), 'warn');
                    }
                    let chapters=data && data.chapters;
                    /* 兼容旧版备份：旧备份里的 chaptersEnc 是用**机器密钥**加的，
                       这台机器上解不开时要**明说**，不能当成"没有备份"一声不吭。 */
                    let encLocked = false;
                    if((!chapters || !chapters.length) && data && data.chaptersEnc){
                        try{ const plain=await Crypto.decryptString(data.chaptersEnc); if(plain) chapters=JSON.parse(plain); else encLocked=true; }catch(e){ encLocked=true; }
                    }
                    if(encLocked){
                        showHint(TT('⚠️ 这份旧备份是用本机密钥加密的，这台电脑上解不开（换机/重装/换账户后会出现）。新备份已改为明文段，不受影响。','⚠️ This old backup is encrypted with a machine-bound key and cannot be opened here.'), 'warn');
                        return false;
                    }
                    /* 🛡 V4.3.40：书架镜像恢复**提前到「无正文即返回」之前** ——
                       V4.3.39 把它放在了 return false 之后，而备份里有没有正文取决于
                       备份那一刻**是否开着书**：只用书架、没开书的用户，备份里 chapters 是
                       空数组 → 这里直接 return false，书架镜像**永远走不到**（探针推演抓到）。
                       书架里已有书时绝不碰（避免覆盖）；importShelfBooks 自带逐本兜错与去重。 */
                    let shelfRestored = false;
                    if(data && data.shelf && Array.isArray(data.shelf.books) && data.shelf.books.length){
                        try{
                            const existingBooks = await DB.listBooks({lite:true});
                            if(!existingBooks.length){
                                const r = await importShelfBooks({ books: data.shelf.books });
                                if(r && r.ok && r.count){
                                    shelfRestored = true;
                                    showHint((TT('📚 已从备份恢复书架 ','📚 Shelf restored: ')) + r.count + (TT(' 本',' books')));
                                }
                            }
                        }catch(e){ logRenderError('shelf restore failed: '+((e&&e.message)||e)); }
                    }
                    if(!data || !Array.isArray(chapters) || !chapters.length){
                        /* 没有正文可恢复：书架救回来了也算这次恢复有成果 */
                        if(shelfRestored){ try{ dom.statusText.textContent = TT('🛟 已从备份恢复书架（这份备份没有正文）', '🛟 Shelf restored from backup (no chapter text in it)'); }catch(e){} }
                        return shelfRestored;
                    }
                    /* 🟥 V4.3.37：恢复出来的正文不属于书架里任何一本 —— 把「当前书」身份清干净，
                       否则重启后 restoreSession 会拿 localStorage 里的旧 fbid 把这份正文挂到旧书上。 */
                    state.bookId = null; state.bookTitle = '';
                    try{ Storage.set(S.BOOK_ID, null); Storage.set(S.BOOK_TITLE, ''); }catch(e){}
                    invalidateInFlightLoads();          // 🟥 V4.3.47（R6-1）：内容要被换掉了，作废在途载入
                    state.chapters=chapters;
                    /* 🛡 V4.3.38：与 collectBackupData 对称 —— 把书源身份一并恢复。
                       没有这一步，"自动恢复"出来的书永远追不了更、也重抓不了本章。 */
                    if(typeof data.bookTitle==='string') state.bookTitle=data.bookTitle;
                    if(typeof data.sourceName==='string') state.sourceName=data.sourceName;
                    state.sourceRule = (data.sourceRule && typeof data.sourceRule==='object') ? data.sourceRule : null;
                    state.sourceUrl = (typeof data.sourceUrl==='string') ? data.sourceUrl : '';
                    state.sourceUrls = Array.isArray(data.sourceUrls) ? data.sourceUrls.slice(0, 50) : [];
                    state.currentIndex=Number(data.currentIndex)||0;
                    if(state.currentIndex>=state.chapters.length) state.currentIndex=0;
                    if(data.scrollPositions && typeof data.scrollPositions==='object'){
                        state.scrollPositions=data.scrollPositions;
                        // V4.3.37：立刻落盘 —— 原来只在内存，恢复完没滚动就关程序会丢这次进度
                        try{ localStorage.setItem('fsp', JSON.stringify(state.scrollPositions)); }catch(e){}
                    }
                    // 📑 V4.3.29：旧备份里的书签是老模型（无 id / 无位置 / 无备注），恢复时统一升级
                    if(Array.isArray(data.bookmarks)){ state.bookmarks=normalizeBookmarks(data.bookmarks); Storage.set(S.BOOKMARKS, state.bookmarks); }
                    if(data.settings && typeof data.settings==='object'){
                        let setFail = 0;
                        Object.entries(data.settings).forEach(function(kv){
                            if(isStatKey(kv[0])) return;         // 🟥 旧版备份里带的计量数据一律不还原（会把当日时长写回旧值）
                            if(isMachineKey(kv[0])) return;      // 🟥 V4.3.23：防截屏实测结论只对本机有效，不跟着备份跨机器
                            /* 🛡 V4.3.33：只接受**已登记**的键。原先只排两类，其余键名一律照写 ——
                               于是一个被篡改过的备份就能往 localStorage 塞任意键，包括
                               fcss（自定义 CSS，可 @import 外联 / 全屏伪装钓鱼）、
                               fupd（更新清单地址 → 可被指向攻击者的页面）、
                               ffb（反馈地址）、fsc（快捷键）。代价是旧版本无法导入新版本新增的键。 */
                            if(!isKnownSettingKey(kv[0])) return;
                            // 🟥 V4.3.34：'fbid'/'fbt' 是"本机现场"，不跟着备份跨机器还原（同导入路径口径）
                            if(kv[0] === S.BOOK_ID || kv[0] === S.BOOK_TITLE) return;
                            // 🟥 V4.3.37：外部地址（更新清单 / 反馈）同理 —— 防"被篡改的备份把更新源指向攻击者"
                            if(kv[0] === S.UPDATE_URL || kv[0] === S.FEEDBACK_URL) return;
                            // 🟥 V4.3.34：走 Storage.set —— 裸 setItem + 空 catch 会把配额超限静默吞掉
                            // 🟥 V4.3.45（R4-2）：键名登记过 ≠ 值合法。数值型设置项在这里过一遍值域
                            if(!Storage.set(kv[0], normalizeSettingValue(kv[0], kv[1]))) setFail++;
                        });
                        if(setFail) showHint((TT('⚠️ 有 ','⚠️ ')) + setFail + (TT(' 项设置因存储空间不足未能写入',' settings could not be written (storage full)')), 'warn');
                        /* 🛡 V4.3.19（全局扫描补漏）：这里只把设置写进 localStorage、**不刷新 state**，
                           所以恢复备份后大部分设置要重启才生效。对「脱离监控」这种安全相关项不能这样 ——
                           换台电脑恢复备份时，用户以为已经开了防护、其实没有，风险很实在。
                           只对 fcp 一项做立即生效（其余设置的既有行为不在本次范围内改动）。 */
                        if(data.settings[S.CONTENT_PROTECT] !== undefined){
                            state.contentProtectOn = !!data.settings[S.CONTENT_PROTECT];
                            pushContentProtect();
                            syncToolbarPanel();
                        }
                    }
                    /* 🟥 V4.3.50（R9-1）：正文落盘失败**必须出声**。
                       原先这一句裸 await —— 异常直接跳到外层 catch，只写一行日志、返回 false，
                       调用方紧接着把状态栏刷成「📌 请加载文件」。于是
                       「备份完好、正文也读出来了、只是写不进本地库（配额满 / 事务 abort）」
                       在用户眼里变成了「**没有备份**」：他最需要备份的那一次，界面告诉他没备份过。
                       与 V4.3.38 已修的导入路径明确 warn + 中止**口径不一致** ——
                       同一个语义两个入口，上一次只修了一个。
                       这里**不中止**：内存里的正文对用户仍有价值（能读、能另存、能立刻重新导出），
                       但必须说明"重启后不会保留"，并让状态栏如实标出这一状态。 */
                    let bodySaved = true;
                    try{ await DB.saveChapters(state.chapters); }
                    catch(e){
                        bodySaved = false;
                        logRenderError('restore saveChapters failed: '+((e&&e.message)||e));
                        showHint(TT('⚠️ 备份正文已读入，但写入本地库失败（存储空间可能不足）—— 现在可以阅读，重启后不会保留；请先把它重新导出。','⚠️ Backup text loaded but could not be written to the local store (storage may be full). Readable now, but it will not survive a restart — please re-export it.'), 'warn');
                    }
                    renderChapter(); renderTOC();
                    dom.statusText.textContent = bodySaved
                        ? ('🛟 已从备份恢复 ('+state.chapters.length+' 章)')
                        : ('⚠️ 已从备份恢复 ('+state.chapters.length+' 章，未能保存)');
                    return true;
                }catch(e){
                    logRenderError('restore failed: '+(e&&e.message||e));
                    /* 🟥 V4.3.50（R9-1）：外层 catch 同样不许静默 —— 它是"有备份但恢复流程崩了"的最后一道口子 */
                    showHint((TT('⚠️ 从备份恢复失败：','⚠️ Restore from backup failed: ')) + ((e&&e.message)||e), 'warn');
                    return false;
                }
            }

            // ---------- 书架 ----------
            // 🛠 来源网页多源记录（V4.3.8）：同一本书可以有多个来源页（换站抓取/手动补源都会追加），
            // 书架 ↗ 按钮轮询打开。sourceUrl 仍是「最近一次」的来源（兼容旧数据）。
            function rememberSourceUrl(u){
                state.sourceUrl = u || '';
                if(!u) return;
                if(!Array.isArray(state.sourceUrls)) state.sourceUrls=[];
                if(!state.sourceUrls.includes(u)) state.sourceUrls.push(u);
            }

            function currentBookMeta(){
                const title = state.bookTitle || (state.chapters[0] && state.chapters[0].title) || '未命名';
                /* 🆕 V4.3.57：封面在**落盘时**才生成（此刻书名与首行都定了）。
                   `state.bookCover` 一旦生成就复用 —— 否则每次 persist 都要重画一次 canvas。 */
                const cover = ensureBookCover(title, (state.chapters[0] && state.chapters[0].title) || '');
                return { id: state.bookId,
                             title,
                             sourceName: state.sourceName || '',
                             currentIndex: state.currentIndex,
                             scrollPositions: state.scrollPositions,
                             bookmarks: state.bookmarks,
                             annotations: state.annotations,
                             chapterCount: state.chapters.length,
                             sourceRule: state.sourceRule || null,
                             sourceUrl: state.sourceUrl || '',
                             sourceUrls: (Array.isArray(state.sourceUrls) && state.sourceUrls.length) ? state.sourceUrls : (state.sourceUrl ? [state.sourceUrl] : []),
                             addedAt: state.bookAddedAt || new Date().toISOString(),
                             updatedAt: new Date().toISOString(),
                    /* 🆕 V4.3.57（需求三批 1）：书架要用的三件事 —— 来源类型 / 格式 / 最近阅读时间 / 封面 */
                    kind: state.bookKind || (state.sourceUrl ? 'source' : 'local'),
                    format: state.bookFormat || '',
                    lastReadAt: new Date().toISOString(),
                    cover: cover || '' };
            }

            async function persistActiveBook(){
                if(!state.chapters.length) return;
                if(!state.bookId){ state.bookId = 'book_' + Date.now(); state.bookAddedAt = new Date().toISOString(); Storage.set(S.BOOK_ID, state.bookId); Storage.set(S.BOOK_TITLE, state.bookTitle || ''); }
                try{ await DB.saveBook(currentBookMeta(), state.chapters); }catch(e){ logRenderError('save book failed: '+(e&&e.message||e)); }
                try{ await refreshTabs(); }catch(e){}
            }

            /* 🆕 V4.3.57（需求三批 1）：书籍身份多记三件事 —— 来源类型 / 格式 / 封面。
               `kind` 决定书架上怎么标、以及「继续阅读」能不能直接回到原处；
               `cover` 是**离线生成**的占位封面（书名 + 首行），不联网、不依赖 epub/pdf 解析。 */
            async function assignBookIdentity(title, sourceName, kind, format){
                state.bookId = 'book_' + Date.now();
                state.bookAddedAt = new Date().toISOString();
                state.bookTitle = title || '';
                state.sourceName = sourceName || '';
                state.bookKind = (kind === 'local') ? 'local' : 'source';
                state.bookFormat = format || '';
                state.bookCover = '';                 // 新书重新生成封面
                state.bookLastReadAt = new Date().toISOString();
                Storage.set(S.BOOK_ID, state.bookId);
                Storage.set(S.BOOK_TITLE, state.bookTitle);
            }

            /* 🎨 V4.3.57：离线占位封面 —— canvas 画一块带书名与首行的色卡。
               为什么不取 EPUB/PDF 的内置封面：那要在**加载路径**上再挂 epub.js/pdf.js 的解析，
               属于批 1 的后半段；先把"书架上看得见、认得出"这件事做掉，封面来源后续可替换
               （meta.cover 是一个 dataURL，换成真封面只是换数据，不动 UI）。
               色相由书名散列决定 —— 同一本书永远同一个颜色，换设备/重开也不变。 */
            function bookCoverDataUrl(title, sub){
                try{
                    const W=96, H=128, cv=document.createElement('canvas');
                    cv.width=W; cv.height=H;
                    const g=cv.getContext('2d');
                    if(!g) return '';
                    const name=String(title||'未命名');
                    let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0;
                    g.fillStyle='hsl('+(h%360)+',38%,34%)'; g.fillRect(0,0,W,H);
                    g.fillStyle='rgba(255,255,255,0.10)'; g.fillRect(0,0,6,H);   // 书脊
                    g.fillStyle='#ffffff'; g.textBaseline='top';
                    g.font='bold 12px "Microsoft YaHei",sans-serif';
                    const line=[]; let cur='';
                    for(const ch of name){ if(g.measureText(cur+ch).width>W-20){ line.push(cur); cur=ch; if(line.length>=3) break; } else cur+=ch; }
                    if(line.length<3 && cur) line.push(cur);
                    line.slice(0,3).forEach((s,i)=> g.fillText(s, 12, 14+i*15));
                    if(sub){
                        g.fillStyle='rgba(255,255,255,0.62)';
                        g.font='10px "Microsoft YaHei",sans-serif';
                        g.fillText(String(sub).slice(0,9), 12, H-20);
                    }
                    return cv.toDataURL('image/png');
                }catch(e){ logRenderError('cover render failed: '+((e&&e.message)||e)); return ''; }
            }
            function ensureBookCover(title, sub){
                if(state.bookCover) return state.bookCover;
                state.bookCover = bookCoverDataUrl(title, sub);
                return state.bookCover;
            }

            /* 🖼 V4.3.66（批 1 收尾）：**真封面** —— EPUB 取内置封面图，PDF 取首页缩略。
               与占位封面的关系：meta.cover 一直是个 dataURL，这里只是**换了数据来源**，UI 一行没动。
               提取只发生在**导入那一刻**（一次性）；之后打开这本书读的是存储里的 dataURL，
               不会重新解析 —— 所以旧注释担心的"加载路径上挂解析"并不成立。
               尺寸仍是 96×128（与占位封面同尺寸）：书架按 36×48 CSS 渲染，2× DPR 下仍清晰，
               存 JPEG 后单张 2~4KB，50 本书全带封面也只有 ~150KB。 */
            function drawCoverToDataUrl(src){
                try{
                    const W=96, H=128, cv=document.createElement('canvas');
                    cv.width=W; cv.height=H;
                    const g=cv.getContext('2d'); if(!g) return '';
                    const iw=src.width||src.naturalWidth||0, ih=src.height||src.naturalHeight||0;
                    if(!iw || !ih) return '';
                    /* 铺满 or 装下，按源图长宽比自动选：
                       书封 / 竖版页 ≈3:4，cover（铺满）裁掉的很少、观感最好；
                       但**横版页**（扫描件、横向排版的 PDF）用 cover 会把左右文字裁掉 ——
                       实测 鲸鱼测试本.pdf 首页就丢了一截。极端比例改用 contain（整页装下、留白），
                       宁可留白也不裁掉正文。 */
                    const ratio = (iw/ih) / (W/H);
                    const s = (ratio > 1.45 || ratio < 0.69) ? Math.min(W/iw, H/ih) : Math.max(W/iw, H/ih);
                    const dw=iw*s, dh=ih*s;
                    g.fillStyle='#ffffff'; g.fillRect(0,0,W,H);        // 透明底垫白，否则 JPEG 会把透明处变黑
                    g.drawImage(src, (W-dw)/2, (H-dh)/2, dw, dh);
                    return cv.toDataURL('image/jpeg', 0.86);
                }catch(e){ logRenderError('cover draw failed: '+((e&&e.message)||e)); return ''; }
            }
            async function coverDataUrlFromBlob(blob){
                try{
                    if(typeof createImageBitmap === 'function'){
                        const bmp = await createImageBitmap(blob);
                        const out = drawCoverToDataUrl(bmp);
                        try{ if(bmp.close) bmp.close(); }catch(e){}
                        return out;
                    }
                    const url = URL.createObjectURL(blob);
                    try{
                        const img = await new Promise(function(res, rej){ const i=new Image(); i.onload=function(){res(i);}; i.onerror=rej; i.src=url; });
                        return drawCoverToDataUrl(img);
                    } finally { try{ URL.revokeObjectURL(url); }catch(e){} }
                }catch(e){ return ''; }   // 取不到封面不是错误 —— 回落占位封面
            }
            /* zip 内查文件：先精确，再 URL 解码，最后不分大小写扫一遍
               （epub 里的 href 常带 %20 之类编码，且大小写不规范）。 */
            function zipFind(zip, path){
                if(!zip || !path) return null;
                let f = zip.file(path);
                if(f) return f;
                let dec = path;
                try{ dec = decodeURIComponent(path); }catch(e){}
                f = zip.file(dec); if(f) return f;
                const want = dec.toLowerCase();
                const names = Object.keys(zip.files || {});
                for(let i=0;i<names.length;i++){ if(names[i].toLowerCase() === want) return zip.file(names[i]); }
                return null;
            }
            /* EPUB 封面：只读 3 个条目，不走 epub.js 全量解析。 */
            async function extractEpubCover(buf){
                try{
                    if(typeof JSZip === 'undefined') return '';
                    const zip = await JSZip.loadAsync(buf);
                    const cont = zipFind(zip, 'META-INF/container.xml');
                    if(!cont) return '';
                    const contDoc = new DOMParser().parseFromString(await cont.async('string'), 'application/xml');
                    const rf = contDoc.querySelector('rootfile');
                    const opfPath = rf && (rf.getAttribute('full-path') || '');
                    if(!opfPath) return '';
                    const opfFile = zipFind(zip, opfPath);
                    if(!opfFile) return '';
                    const opf = new DOMParser().parseFromString(await opfFile.async('string'), 'application/xml');
                    const items = Array.prototype.slice.call(opf.querySelectorAll('manifest > item'));
                    let href = '';
                    // ① EPUB3：properties="cover-image"
                    const byProp = items.filter(function(it){ return /\bcover-image\b/.test(it.getAttribute('properties') || ''); })[0];
                    if(byProp) href = byProp.getAttribute('href') || '';
                    // ② EPUB2：<meta name="cover" content="id"> → manifest 里同 id 的项
                    if(!href){
                        const metas = Array.prototype.slice.call(opf.querySelectorAll('metadata > meta'));
                        const m = metas.filter(function(x){ return String(x.getAttribute('name')||'').toLowerCase() === 'cover'; })[0];
                        const id = m && m.getAttribute('content');
                        if(id){
                            const it = items.filter(function(x){ return x.getAttribute('id') === id; })[0];
                            if(it) href = it.getAttribute('href') || '';
                        }
                    }
                    // ③ 兜底：media-type 是图片且 id/href 里带 cover
                    if(!href){
                        const guess = items.filter(function(it){
                            return /^image\//.test(it.getAttribute('media-type') || '') &&
                                   /cover/i.test((it.getAttribute('id') || '') + ' ' + (it.getAttribute('href') || ''));
                        })[0];
                        if(guess) href = guess.getAttribute('href') || '';
                    }
                    if(!href) return '';
                    // href 是相对 OPF 所在目录的
                    const dir = opfPath.indexOf('/') >= 0 ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
                    const rel = href.split('#')[0];
                    const full = rel.charAt(0) === '/' ? rel.slice(1) : dir + rel;
                    const img = zipFind(zip, full);
                    if(!img) return '';
                    return await coverDataUrlFromBlob(await img.async('blob'));
                }catch(e){ return ''; }
            }


            /* 🟥 V4.3.44（R3-2）：切书代次令牌。
               项目里本来就有两套令牌 —— renderToken 只管**分块 DOM 渲染**，TTS 的 session 只管**朗读**；
               「切书」这条主路径恰好没被任何一个罩住。 */
            let bookSwitchToken = 0;
            /* 🟥 V4.3.47（R6-1）：书源 / 书库载入的「发起记录」，按面板类型分开记
               （书源面板与全文搜索面板里的书库可能同时在抓，共用一个槽会互相冲掉）。
               gen = 面板侧的请求序号（配对用）；epoch = 主窗在**该请求发起那一刻**的代次快照。 */
            let srcLoadPending = {};
            /* 🟥 V4.3.47（R6-1）：「用户主动替换了阅读器内容」的统一作废入口。
               凡是把 `state.chapters` 换成另一份内容的动作都必须调它 —— 否则在此之前已发起、
               之后才落地的那次载入（书源/书库抓正文可达几十秒）会把用户刚换上的内容覆盖掉。
               清空 / 恢复默认 / 书架删书本来就是这么做的；本轮把漏掉的
               **导入数据 / 恢复备份 / 打开本地文件** 三处补齐，让这一类入口覆盖完整
               （枚举方法：`grep -n "state.chapters *=" scripts/app.js` 逐个对照）。 */
            function invalidateInFlightLoads(){ bookSwitchToken++; }
            async function loadBookIntoReader(book, token){
                /* 🟥 V4.3.44（R3-2）：令牌复检。两个检查点 ——
                   ① 入口：挡住"已经过期才开始加载"；
                   ② await persistActiveBook() 之后：挡住"加载途中又被新点击取代"。
                   token 省略时不校验（导入/去重打开等非连点路径），行为与旧版一致。 */
                if(token !== undefined && token !== bookSwitchToken) return false;
                /* 🟥 V4.3.24：书架里这本书的正文**解不开**（换机/重装/换账户）时，必须出声 ——
                   原代码只是 `return false`，用户点开书看到空白，会以为这本书没了。 */
                if(book && book.chaptersLocked){
                    noteChaptersLocked();
                    dom.statusText.textContent = TT('🔒 这本书的正文在本机解不开（详见提示）','🔒 Chapters locked');
                    return false;
                }
                if(!book || !Array.isArray(book.chapters) || !book.chapters.length) return false;
                if(state.bookId && state.bookId !== book.id){ await persistActiveBook(); }
                if(token !== undefined && token !== bookSwitchToken) return false;
                state.chapters = book.chapters;
                state.bookId = book.id;
                state.bookTitle = book.title || '';
                state.sourceName = book.sourceName || '';
                state.bookAddedAt = book.addedAt || new Date().toISOString();
                state.currentIndex = Number(book.currentIndex) || 0;
                if(state.currentIndex >= state.chapters.length) state.currentIndex = 0;
                state.scrollPositions = (book.scrollPositions && typeof book.scrollPositions === 'object') ? book.scrollPositions : {};
                // V4.3.34：旧 meta 里可能是老模型书签（无 id/位置/备注），与其它入口统一升级
                state.bookmarks = Array.isArray(book.bookmarks) ? normalizeBookmarks(book.bookmarks) : [];
                /* 🖍 V4.3.71：批注与书签同一条路 —— 跟着书走，不跟着"当前会话"走。 */
                state.annotations = Array.isArray(book.annotations) ? normalizeAnnotations(book.annotations) : [];
                state.sourceRule = book.sourceRule || null;
                state.sourceUrl = book.sourceUrl || '';
                state.sourceUrls = (Array.isArray(book.sourceUrls) && book.sourceUrls.length) ? book.sourceUrls.slice() : (book.sourceUrl ? [book.sourceUrl] : []);
                /* 🆕 V4.3.57：从书架载入时**必须把 kind / format / cover 一起还原**。
                   否则"关掉再开接着读"这条路上，本地书会退化成按 sourceUrl 猜类型
                   （本地书若被补录过来源网址，就会被误判成书源书），封面也会白重画一张。 */
                state.bookKind = book.kind || (book.sourceUrl ? 'source' : 'local');
                state.bookFormat = book.format || '';
                state.bookCover = book.cover || '';
                Storage.set(S.BOOKMARKS, state.bookmarks);
                Storage.set(S.ANNOTATIONS, state.annotations);
                Storage.set(S.BOOK_ID, state.bookId);
                Storage.set(S.BOOK_TITLE, state.bookTitle);
                Storage.set(S.READER_IDX, state.currentIndex);
                try{ localStorage.setItem('fsp', JSON.stringify(state.scrollPositions)); }catch(e){}
                renderChapter();
                renderTOC();
                updateBookmarkStar();
                dom.statusText.textContent = '📚 '+ (state.bookTitle || TT('书','Book')) + ' · ' + state.chapters.length + TT(' 章',' ch');
                try{ await DB.saveChapters(state.chapters); }catch(e){ logRenderError('saveChapters failed: '+((e&&e.message)||e)); }
                try{ await refreshTabs(); }catch(e){}
                return true;
            }

            /* 🟥 V4.3.44（R3-2）：从书架/搜索结果切书的**唯一入口** —— 开书的两步（读库 + 装载）必须共用同一个令牌。
               原写法在点击处直接 `await DB.getBook(id)` 再 `await loadBookIntoReader(full)`，两步都没有令牌：
               两本书体量悬殊（或网络/解密快慢不同）时，**后点的那本先读完、先点的那本随后回来把正文覆盖掉**，
               于是正文与目录显示成上一本、标签高亮却停在后点的那本。
               关键：令牌必须在**点下去的那一刻**取号。等到 loadBookIntoReader 里再取就晚了 ——
               那时"谁先被点"这个信息已经丢了（先点的那本反而是后调用的那个）。 */
            async function openBookFromShelf(id){
                const token = ++bookSwitchToken;
                let full = null;
                try{ full = await DB.getBook(id); }
                catch(e){ logRenderError('getBook failed: '+((e&&e.message)||e)); return false; }
                if(token !== bookSwitchToken) return false;   // 期间又点了别的书 → 本次结果作废
                if(!full) return false;
                return await loadBookIntoReader(full, token);
            }

            // 🛠 自动书名清洗（V4.3.7）：网文抓来的文件名常是「XXX最新章节列表_XXX最新章节目录」这类页面垃圾。
            // 按分隔符切段 → 段内剔除垃圾词 → 去重（互相包含也算重复）→ 取第一个有效段当书名
            /* 🟥 V4.3.92（逐窗视觉复核抓到）：**副标题被砍掉**。
               这个函数的本职是清掉**书源标题里的站点垃圾**（「书名_最新章节_笔趣阁」那种），
               但它按分隔符切分后只取第一段 —— 于是用户自己的书名只要带 `·` / `：` / `，` / `-`，
               后半截就没了（「测试用的超长书名·副标题」→「测试用的超长书名」），
               而书架展示又直接用它（refreshShelfPanel 的 `title:cleanBookTitle(b.title)`）。
               修法：**没命中站点垃圾词就原样返回**，一点都不切。只有真的含垃圾才走切分清洗。
               ⚠️ 原正则带 g，`test()` 会被 lastIndex 状态污染（同一串连测两次结果不同），
               所以拆成两个正则：junk 只用于 replace，junkTest 不带 g 只用于判定。 */
            const BOOK_TITLE_JUNK = '(最新章节列表|最新章节目录|最新章节|章节目录|章节列表|全文阅读|全文免费|无弹窗|无错|笔趣阁|顶点小说|顶点|小说网|TXT下载|txt下载|全集下载|免费阅读|免费下载|正文卷|完本|连载|目录|章节|全集|下载|阅读)';
            function cleanBookTitle(t){
                if(!t) return t;
                const s0=String(t).trim();
                const junkTest=new RegExp(BOOK_TITLE_JUNK);
                if(!junkTest.test(s0)) return s0;      // 没有站点垃圾 → 原样（副标题、系列名都不许砍）
                const junk=new RegExp(BOOK_TITLE_JUNK,'g');
                const segs=s0.split(/[_|｜·・\-—–:：,，\s]+/).map(s=>s.trim())
                    .map(s=>s.replace(junk,'').replace(/[（(【\[]\s*[）)】\]]/g,'').trim())
                    .filter(s=>s.length>=2);
                const uniq=[];
                for(const s of segs){ if(!uniq.some(u=>u===s||u.includes(s)||s.includes(u))) uniq.push(s); }
                return uniq.length?uniq[0]:String(t).trim();
            }

            // 多书标签栏：把书架里最近打开的几本列成标签，点一下就切换
            async function refreshTabs(){
                const bar = dom.tabBar;
                if(!bar) return;
                let books = [];
                try{ books = await DB.listBooks({lite:true}); }catch(e){}
                books.sort((a,b)=> String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
                // 🛠 单本书也要能点出标签（V4.3.5）：只有书架空时才不渲染；书目不再截断 8 本
                if(!books.length){ bar.classList.remove('on'); bar.innerHTML=''; if(dom.tabPeekBtn) dom.tabPeekBtn.hidden=true; return; }
                bar.innerHTML='';
                books.forEach(b=>{
                    const tab = document.createElement('div');
                    tab.className = 'tab' + (b.id === state.bookId ? ' active' : '');
                    tab.title = b.title || '';
                    const name = document.createElement('span');
                    name.className = 't';
                    name.textContent = cleanBookTitle(b.title) || (TT('未命名','Untitled'));
                    const close = document.createElement('span');
                    close.className = 'x';
                    /* 🎨 V4.3.63：标签页关闭的 ✕ 字符 → 线条图标（close）。
                       主窗没有加载 icons-browser.js，这里直接用同一套规格的内联 SVG
                       （由 work/_ico_gen.js 从 scripts/icons.js 生成后粘贴，改图标请跑生成器同步）。 */
                    close.innerHTML = '<svg class="ico" data-ico="close" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
                    close.addEventListener('click', async e=>{
                        e.stopPropagation();
                        const ask = (TT('从书架移除「','Remove "')) + (b.title||'') + (TT('」？','"?'));
                        if(!confirm(ask)) return;
                        try{ await DB.deleteBook(b.id); }catch(e){ logRenderError('deleteBook failed: '+((e&&e.message)||e)); }
                        if(state.bookId === b.id){
                            /* 🟥 V4.3.44（R3-2）：作废在途的切书请求 —— 否则"点开这本书"的加载还没回来，
                               用户已经把它删了，迟到的加载又会把它的正文装回阅读器。 */
                            bookSwitchToken++;
                            state.bookId = null; state.bookTitle = ''; state.sourceName = '';
                            Storage.set(S.BOOK_ID, null); Storage.set(S.BOOK_TITLE, '');
                            // 🛠 叉掉的是当前书：正文一并清空（旧实现只清 bookId，已删书的正文残留在屏幕上）
                            state.chapters = []; state.currentIndex = 0; state.scrollPositions = {}; state.bookmarks = [];
                            state.originalContent = ''; state.sourceRule = null; state.sourceUrl = ''; state.sourceUrls = [];
                            try{ localStorage.removeItem('fsp'); }catch(e2){}
                            Storage.set(S.BOOKMARKS, []);
                            /* 🟥 V4.3.34：'chapters' 主存储（"最后打开那本书"的正文快照）也要清。
                               deleteBook 只删 books / bookchapters 两个 store，快照还在 —— restoreSession
                               却是**无条件**读它的，于是"已经删掉的书"重启后又回来了（还能被朗读念出来）。
                               清空按钮那条路径本来就调了 clearChapters，两条删除路径口径必须一致。 */
                            try{ await DB.clearChapters(); }catch(e2){ logRenderError('clearChapters after delete failed: '+((e2&&e2.message)||e2)); }
                            renderChapter(); renderTOC(); updateBookmarkStar();
                        }
                        refreshTabs();
                    });
                    tab.appendChild(name); tab.appendChild(close);
                    tab.addEventListener('click', async ()=>{
                        if(b.id === state.bookId) return;
                        /* 🟥 V4.3.44（R3-2）：走带令牌的唯一入口，别再在这里手写「getBook → 装载」两步 */
                        await openBookFromShelf(b.id);
                        refreshTabs();
                    });
                    bar.appendChild(tab);
                });
                const add = document.createElement('button');
                add.className = 'tab-add';
                add.textContent = '+';
                add.title = TT('打开文件','Open file');
                add.addEventListener('click', ()=>{ dom.loadBtn.click(); });
                bar.appendChild(add);
                bar.classList.add('on');
                /* 🆕 V4.3.92：≥2 本才显示入口 —— 只有一本时"切书"没有意义，箭头只会占地方。 */
                if(dom.tabPeekBtn) dom.tabPeekBtn.hidden = books.length < 2;
            }

            // 🛠 书架标签栏不常显（V4.3.7 定案）：点击标题「📖 阅读器」滑出；**1.5 秒内不点标签栏就自动收起**
            // （用户要求的隐蔽策略），点标签 / ✕ / + 都会重新计时；再点标题立即收起。
            (function(){
                const tt=document.getElementById('titleText');
                const pb=document.getElementById('tabPeekBtn');
                let peekTimer=null;
                /* 🆕 V4.3.92：入口有了可见按钮，箭头方向必须跟着实际状态走 ——
                   否则自动收起后箭头还朝上，点一下"没反应"（其实是收起了）。 */
                const syncBtn=()=>{ if(!pb) return; pb.classList.toggle('up', !!(dom.tabBar && dom.tabBar.classList.contains('peek'))); };
                const armPeek=()=>{ if(peekTimer) clearTimeout(peekTimer); peekTimer=setTimeout(()=>{ peekTimer=null; if(dom.tabBar) dom.tabBar.classList.remove('peek'); syncBtn(); }, 3000); };
                const disarm=()=>{ if(peekTimer){ clearTimeout(peekTimer); peekTimer=null; } };
                const togglePeek=()=>{
                    const bar=dom.tabBar; if(!bar || !bar.classList.contains('on')) return;
                    bar.classList.toggle('peek');
                    if(bar.classList.contains('peek')) armPeek(); else disarm();
                    syncBtn();
                };
                if(tt) tt.addEventListener('click', togglePeek);
                if(pb) pb.addEventListener('click', (e)=>{ e.stopPropagation(); togglePeek(); });
                if(dom.tabBar) dom.tabBar.addEventListener('click', ()=>{
                    if(dom.tabBar.classList.contains('peek')) armPeek();   // 点标签/✕/+ 都算「在点」，重新计时
                }, true);
            })();

            async function refreshShelfPanel(){
                let books = [];
                /* 🟥 V4.3.61：**这里必须是全量**（要 cover 画封面）。其余 7 个 listBooks 调用点
                   都不需要封面，已改成 `{lite:true}` —— 别"顺手统一"掉这一处。 */
                /* 🟥 V4.3.97（审查 R-10）：DB 读失败原来被空 catch 吞掉，随后把空数组推给面板 ——
                   面板会显示"书架为空，去导入一本书"，而真相是"库打不开/读失败"。
                   V4.3.96 的空书架逻辑（置灰导出按钮）还会把这个假象放大。
                   现在如实上报，让面板显示读取失败。 */
                let shelfReadError = '';
                try{ books = await DB.listBooks(); }
                catch(e){ shelfReadError = String((e && e.message) || e); try{ logRenderError('书架读取失败: ' + shelfReadError); }catch(e2){} }
                /* 🆕 V4.3.57（需求三批 1）：默认按**最近阅读**排（lastReadAt 缺失时退回 updatedAt），
                   面板那边还可以再按「进度 / 添加时间」重排 —— 排序是显示层的事，主窗只保证数据齐。 */
                const stamp = b => b.lastReadAt || b.updatedAt || '';
                books.sort((a,b)=> stamp(b).localeCompare(stamp(a)));
                const list = books.map(b => ({ id:b.id,
                             title:cleanBookTitle(b.title)||b.title,
                             sourceName:b.sourceName||'',
                             chapterCount:b.chapterCount||0,
                             currentIndex:b.currentIndex||0,
                             updatedAt:b.updatedAt||'',
                             sourceUrl:b.sourceUrl||'',
                             sourceUrls:(Array.isArray(b.sourceUrls)&&b.sourceUrls.length)?b.sourceUrls.slice():(b.sourceUrl?[b.sourceUrl]:[]),
                             isActive: b.id===state.bookId,
                    /* 🆕 V4.3.57：书架卡片要显示的四件 —— 来源类型 / 格式 / 最近阅读 / 封面 */
                    kind: b.kind || (b.sourceUrl ? 'source' : 'local'),
                    format: b.format || '',
                    lastReadAt: b.lastReadAt || '',
                    addedAt: b.addedAt || '',
                    cover: b.cover || '' }));
                sendPanelData('shelf', { books: list });
            }

            // 章节增量更新：重新解析目录页，只抓取书里还没有的新章节
            /* 🟥 V4.3.33b：加「进行中」互斥。原先自动追更定时器与面板手动「检查更新」能同时进来，
               两者各自 DB.getBook → 抓取 → concat(added) → saveBook，基于同一份旧快照，
               后写者覆盖先写者 —— **一次追更结果会凭空消失**，而用户完全看不出来。 */
            let bookUpdateRunning = false;
            async function checkBookUpdates(ids){
                const report = [];
                let totalNew = 0;
                if(!window.readerAPI || !window.readerAPI.sourceChapters){
                    return { totalNew:0, report:[{ title:'当前环境不支持', skipped:'unsupported' }] };
                }
                if(bookUpdateRunning) return { totalNew:0, busy:true, report:[{ title:'已有追更任务在进行中', skipped:'busy' }] };
                bookUpdateRunning = true;
                try {
                const books = await DB.listBooks({lite:true});
                const targets = (ids && ids.length) ? books.filter(b => ids.includes(b.id)) : books;
                for(const b of targets){
                    const full = await DB.getBook(b.id);
                    if(!full || !full.sourceRule || !full.sourceUrl){ report.push({ title:(full&&full.title)||b.title||'未命名', skipped:'no-source' }); continue; }
                    /* 🟥 V4.3.44（R3-1）：同 retryCurrentChapter —— 追更要连抓两轮网络，
                       期间用户可能已经「清空所有内容」或删掉这本书；不记代次的话，
                       抓完仍会 saveBook 把删掉的书**重新建回来**。 */
                    const gen = DB._gen;
                    let r = null;
                    try{ r = await window.readerAPI.sourceChapters({ url: full.sourceUrl, rule: full.sourceRule }); }
                    catch(e){ report.push({ title: full.title || '未命名', error: String((e&&e.message)||e) }); continue; }
                    if(!r || !r.ok){ report.push({ title: full.title || '未命名', error: (r && r.error) || '目录解析失败' }); continue; }
                    const norm = s => String(s || '').replace(/\s+/g, '');
                    const known = new Set((full.chapters || []).map(c => norm(c.title)));
                    /* V4.3.33b：除了「不在旧列表里」，还要**彼此去重** ——
                       源站目录偶尔把同一章列两次，原先只做新旧差集，重复项会一起入库。 */
                    const seenFresh = new Set();
                    const fresh = (r.chapters || []).filter(c => {
                        const k = norm(c.title);
                        if(known.has(k) || seenFresh.has(k)) return false;
                        seenFresh.add(k);
                        return true;
                    });
                    if(!fresh.length){ report.push({ title: full.title || '未命名', added:0 }); continue; }
                    let cr = null;
                    try{ cr = await window.readerAPI.sourceContents({ chapters: fresh, rule: full.sourceRule }); }
                    catch(e){ report.push({ title: full.title || '未命名', error: String((e&&e.message)||e) }); continue; }
                    const added = (cr && cr.contents) || [];
                    if(DB.stale(gen)){ report.push({ title: full.title || '未命名', skipped:'cleared' }); continue; }
                    if(!added.length){ report.push({ title: full.title || '未命名', error:'新章节抓取失败' }); continue; }
                    full.chapters = (full.chapters || []).concat(added);
                    /* V4.3.33b：覆盖前先合并。用户在等待抓取的这段时间里可能点过「重抓当前章」
                       （retryCurrentChapter 会就地修正 state.chapters[idx] 的 content/failed），
                       而 `full` 是**抓取之前**的快照 —— 直接整段替换会把那次修正冲掉，
                       表现是「刚抓好的那一章又变回失败状态」。 */
                    if(state.bookId === full.id){
                        full.chapters = full.chapters.map((c, i) => {
                            const cur = state.chapters[i];
                            return (cur && cur.failed === false && c && c.failed === true) ? cur : c;
                        });
                    }
                    full.chapterCount = full.chapters.length;
                    full.updatedAt = new Date().toISOString();
                    try{ await DB.saveBook(full, full.chapters); }catch(e){ logRenderError('update saveBook failed: '+((e&&e.message)||e)); report.push({ title: full.title || '未命名', added: 0, error: (TT('保存失败','save failed')) }); continue; }
                    if(state.bookId === full.id){
                        state.chapters = full.chapters;
                        renderChapter(); renderTOC();
                        try{ await DB.saveChapters(state.chapters); }catch(e){ logRenderError('update saveChapters failed: '+((e&&e.message)||e)); }
                    }
                    totalNew += added.length;
                    report.push({ title: full.title || '未命名', added: added.length });
                }
                if(totalNew){ await refreshShelfPanel(); showHint((TT('已更新 ','Updated '))+totalNew+(TT(' 章',' chapters'))); }
                return { totalNew, report };
                } finally { bookUpdateRunning = false; }
            }

            async function exportShelfBooks(ids){
                const books = await DB.listBooks({lite:true});
                const selected = (ids && ids.length) ? books.filter(b => ids.includes(b.id)) : books;
                const payload = [];
                for(const b of selected){
                    const full = await DB.getBook(b.id);
                    if(!full || !Array.isArray(full.chapters) || !full.chapters.length) continue;
                    payload.push({
                        /* V4.3.33b：补上 sourceRule / sourceUrl / sourceUrls ——
                           原先导出与导入两端都没带，导出再导入后所有书架书**全部失去书源**：
                           自动追更判 no-source 跳过、单章重抓报「缺少书源规则」、↗ 来源按钮失效，且全程静默。
                           （对比 currentBookMeta() 是带的，这两处口径原本就不一致。） */
                        /* 🟥 V4.3.72：必须带上 annotations —— V4.3.71 加了批注却漏了这条导出路径，
                           表现是「导出书架 → 换机导入」之后批注全没了（书签在、批注不在，很难察觉）。 */
                        meta: { title: full.title || b.title || '未命名',
                                     sourceName: full.sourceName || '',
                                     currentIndex: Number(full.currentIndex) || 0,
                                     scrollPositions: full.scrollPositions || {},
                                     bookmarks: full.bookmarks || [],
                                     annotations: full.annotations || [],
                                     chapterCount: full.chapters.length,
                                     addedAt: full.addedAt || '',
                                     updatedAt: full.updatedAt || '',
                                     sourceRule: full.sourceRule || null,
                                     sourceUrl: full.sourceUrl || '',
                                     sourceUrls: (Array.isArray(full.sourceUrls) && full.sourceUrls.length) ? full.sourceUrls : (full.sourceUrl ? [full.sourceUrl] : []) },
                        chapters: full.chapters
                    });
                }
                return { app:'浅水鲸书架', version:APP_VERSION, exportedAt:new Date().toISOString(), count:payload.length, books:payload };
            }

            /* 🛡 V4.3.43（低危 F）：导入进来的 chapters 里，`img` 只允许 PDF 自产的
               `data:image/...;base64,` 形态，其余（http/https/file/相对路径/其他 scheme）一律剔除。
               这是"入口"那一层；renderChapter 的消费点还有一层兜底（双保险）。
               剔除（而不是报错中断）是刻意的：不含图片的书照样能正常导入阅读。 */
            function sanitizeChapterImgs(chapters){
                if(!Array.isArray(chapters)) return chapters;
                for(const c of chapters){
                    if(c && c.img != null && !(typeof c.img==='string' && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(c.img))) delete c.img;
                }
                return chapters;
            }
            async function importShelfBooks(data){
                if(!data || typeof data !== 'object') return { ok:false, error:'文件为空或不是有效的 JSON' };
                if(!Array.isArray(data.books)){
                    // 常见误用：把「阅读数据备份」拿去书架导入。明确指引，避免用户以为软件坏了
                    if(data.kind === 'reader-data') return { ok:false, error:'这是「阅读数据备份」，请在主窗口「设置 → 数据管理」里导入，不要在这里导入书架' };
                    return { ok:false, error:'文件格式不正确（缺少书籍列表 books）' };
                }
                /* 🟥 V4.3.36：两处加固 ——
                   ① 逐本 try/catch：saveBook 现在会真 reject（配额满 / 事务 abort），原先任一本失败就中断
                      整个循环，已入库的书留在书架里，用户却只看到"导入失败"；
                   ② 按「书名 + 章节数」跳过已存在的书：本函数给每本都重新生成 id（与拖文件导入的去重口径
                      不一致），重复导入同一个文件会让书架翻倍。 */
                let count = 0, failed = 0, skipped = 0;
                const existing = new Set();
                /* V4.3.37：口径统一 + 加 sourceUrl ——
                   原先 seed 用 (b.title||'')、比较用 '未命名'，无题书的 key 对不上（去重形同虚设）；
                   只用「书名+章数」又会把同名同章数的**不同书**误杀。 */
                try{ (await DB.listBooks({lite:true})).forEach(b => existing.add((b.title || '未命名') + '|' + (b.chapterCount || 0) + '|' + (b.sourceUrl || ''))); }catch(e){}
                for(const item of data.books){
                    if(!item || !item.meta || !Array.isArray(item.chapters) || !item.chapters.length) continue;
                    const dedupKey = (item.meta.title || '未命名') + '|' + item.chapters.length + '|' + (item.meta.sourceUrl || '');
                    if(existing.has(dedupKey)){ skipped++; continue; }
                    const now = new Date().toISOString();
                    const meta = {
                        id: 'book_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
                        title: item.meta.title || '未命名',
                        sourceName: item.meta.sourceName || '导入',
                        currentIndex: Number(item.meta.currentIndex) || 0,
                        scrollPositions: item.meta.scrollPositions || {},
                        // V4.3.34：旧版本导出的书架文件里书签是老模型（无 id/位置/备注），统一升级
                        bookmarks: Array.isArray(item.meta.bookmarks) ? normalizeBookmarks(item.meta.bookmarks) : [],
                        /* 🖍 V4.3.72：与导出端对称（老文件没有这个字段 → 空数组，不影响兼容）。 */
                        annotations: Array.isArray(item.meta.annotations) ? normalizeAnnotations(item.meta.annotations) : [],
                        chapterCount: item.chapters.length,
                        addedAt: item.meta.addedAt || now,
                        updatedAt: item.meta.updatedAt || now,
                        // V4.3.33b：与导出端对称 —— 带上书源，否则导入后所有书都变成"无来源"
                        sourceRule: item.meta.sourceRule || null,
                        sourceUrl: item.meta.sourceUrl || '',
                        sourceUrls: (Array.isArray(item.meta.sourceUrls) && item.meta.sourceUrls.length) ? item.meta.sourceUrls : (item.meta.sourceUrl ? [item.meta.sourceUrl] : [])
                    };
                    try{ await DB.saveBook(meta, sanitizeChapterImgs(item.chapters)); count++; existing.add(dedupKey); }
                    catch(e){ failed++; logRenderError('import shelf book failed: '+((e&&e.message)||e)); }
                }
                /* V4.3.37：一本都没进且确有跳过/失败时，别报"导入成功" —— 会掩盖真实原因。 */
                /* 🟥 V4.3.72：三种"零新增"要分开说。
                   原先一律 ok:false + error='没有新增：跳过 N，失败 M'，于是
                   「重复导入同一份书架（全被去重跳过）」在日志和提示里都显示成**导入失败**：
                   「[renderer] shelf: 导入失败：没有新增：跳过 1 本，失败 0 本」。
                   用户会以为文件坏了 —— 而面板里明明早就有"没有新增"那条分支（只是永远走不到）。
                   现在：有跳过/失败 → ok:true + 计数（面板显示"没有新增：跳过 N，失败 M"）；
                   一条都没进来、也没跳过没失败（条目全残缺）→ 这才是真失败。 */
                if(count === 0 && !failed && !skipped){
                    return { ok:false, error: (TT('文件里没有可导入的书籍（每本都缺少书名或章节）','Nothing importable in this file (every entry lacks a title or chapters)')), count, failed, skipped };
                }
                return { ok:true, count, failed, skipped };
            }

            // 渲染章节（分块渲染，避免大文件卡顿）
            let renderToken=0;
            /* ═══ 📖 V4.3.68（批 2 第一刀）：分页引擎 ═══
               设计取舍见 CHANGELOG：沿用同一个滚动容器，把"翻页"实现成"按页高跳 scrollTop"。
               好处是位置记忆（scrollPositions 存的就是 scrollTop）三档共用，切模式不丢位置**天然成立**；
               代价是整页跳会把行切一半，所以页边界要**吸附到行盒顶端**（getClientRects 拿行盒）。
               超长章节（行盒 > PAGE_SNAP_LIMIT）放弃吸附、退化为整页跳 —— 宁可切行也不能卡死。 */
            const PAGE_SNAP_LIMIT = 20000;
            const READ_MODES = ['multi', 'paged', 'single'];
            let pageOffsetsCache = null;      // { key, offsets }
            let pendingPageAnchor = null;     // 'first' | 'last' | null —— 换章后落到哪一页

            function pagedActive(){ return state.readMode === 'paged'; }
            /* 📖 V4.3.70：宽屏双栏。
               为什么**按宽度自动**而不是给个开关：这是浮动阅读器，窗口宽度本身就是"我想要多宽"的表达；
               而且"双栏"只有够宽才有意义 —— 400px 里塞两栏每行不到 20 字，比单栏更差。
               所以规则简单：分页模式下视口宽 ≥ TWO_COL_MIN 就两栏，窄回去自动单栏。
               阈值 640px：14px 字号下约 45 字/行，正好是"再宽就该分栏"的边界（默认窗口 620 不触发）。
               🟥 代价：双栏时翻页轴从纵向 scrollTop 换成横向 scrollLeft ——
               所以下面所有位置读写**必须**过 pagePos()/setPagePos()，不能再直接摸 scrollTop。
               否则会出现"双栏下翻页没反应"（写的是 scrollTop，而实际滚动的是 scrollLeft）。 */
            const TWO_COL_MIN = 640;
            const TWO_COL_GAP_FALLBACK = 28;
            let twoColOn = false;
            let twoColSwitchRatio = null;
            function pagedTwoCol(){ return pagedActive() && twoColOn; }
            /* 当前分页轴上的可视长度（单栏 = 高，双栏 = 宽） */
            function pageViewport(){
                return Math.max(1, pagedTwoCol() ? dom.novelContent.clientWidth : dom.novelContent.clientHeight);
            }
            function pagePos(){
                return pagedTwoCol() ? (dom.novelContent.scrollLeft || 0) : (dom.novelContent.scrollTop || 0);
            }
            function setPagePos(v){
                if(pagedTwoCol()) dom.novelContent.scrollLeft = v;
                else dom.novelContent.scrollTop = v;
            }
            function pageMax(){
                const b = dom.novelContent;
                return Math.max(0, pagedTwoCol() ? (b.scrollWidth - b.clientWidth) : (b.scrollHeight - b.clientHeight));
            }
            function pagePosRatio(){
                const m = pageMax();
                if(m <= 0) return 0;
                return Math.max(0, Math.min(1, pagePos() / m));
            }
            function dropTwoCol(){
                if(!twoColOn && !dom.contentWrapper.classList.contains('two-col')) return;
                twoColOn = false; twoColSwitchRatio = null;
                dom.contentWrapper.classList.remove('two-col');
            }
            /* 栏数是否需要变。返回 true 表示"刚切过" —— 调用方必须强制重量页边界，
               因为两根轴的像素坐标没有可比性，位置只能**按比例**搬过去。 */
            function syncTwoCol(){
                /* PDF 原样页是整页位图：分两栏只会把它挤成半宽，没有意义 → 强制单栏。 */
                const isPdfPage = !!dom.novelContent.querySelector('.pdf-page');
                const want = pagedActive() && !isPdfPage && dom.novelContent.clientWidth >= TWO_COL_MIN;
                if(want === twoColOn) return false;
                const ratio = pagePosRatio();          // ← 必须用**旧**轴量，所以放在切之前
                twoColOn = want;
                dom.contentWrapper.classList.toggle('two-col', want);
                twoColSwitchRatio = ratio;
                return true;
            }
            /* 缓存键：任一影响排版的因素变了就必须重量。clientWidth 也进来 —— 宽度变了会重排。 */
            function pagerKey(){
                return [state.currentIndex, pagedTwoCol() ? 'x' : 'y', pageViewport(), state.fontSize, state.lineHeight,
                        state.readingFont, dom.novelContent.clientWidth, state.pageMargin].join('|');
            }
            /* 行盒顶端（内容坐标）。
               🟥 V4.3.69 修正：原先用 Element.getClientRects() —— 对**块级元素**它只返回 1 个
               边框盒（实测 400 行文本 rectsPerKid=[1]），所以吸附从来没生效过，页边界一直是
               页高的整数倍（250/500/750…）。行盒必须用 Range.getClientRects()（同一段文本 9 个）。
               超长章节（行盒 > PAGE_SNAP_LIMIT）仍放弃吸附，退化为整页跳。 */
            function collectLineTops(){
                const box = dom.novelContent;
                const boxRect = box.getBoundingClientRect();
                const base = boxRect.top - box.scrollTop;
                const tops = [];
                const kids = box.children;
                for(let i=0;i<kids.length;i++){
                    const el = kids[i];
                    let walker = null;
                    try{ walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null); }catch(e){ continue; }
                    let node = null, guard = 0;
                    while((node = walker.nextNode()) && guard++ < 20000){
                        const val = node.nodeValue || '';
                        if(!val.length) continue;
                        const rg = document.createRange();
                        try{ rg.selectNodeContents(node); }catch(e){ continue; }
                        const rects = rg.getClientRects();
                        for(let j=0;j<rects.length;j++){
                            const t = rects[j].top - base;
                            if(t > 0.5) tops.push(t);
                        }
                        if(tops.length > PAGE_SNAP_LIMIT) return null;
                    }
                }
                tops.sort(function(a,b){ return a-b; });
                /* 同一行可能因内联元素被拆成多个 rect —— 按 0.5px 去重，避免二分时同一行被算两次。 */
                const uniq = [];
                for(let i=0;i<tops.length;i++){
                    if(!uniq.length || tops[i] - uniq[uniq.length-1] > 0.5) uniq.push(tops[i]);
                }
                return uniq;
            }
            /* 双栏页边界：纯算术，不需要行盒吸附。
               几何推导：容器内容宽 cw、栏距 g ⇒ 栏宽 = (cw−g)/2；第 i 栏左边 = i·(cw+g)/2；
               一页两栏（第 2k、2k+1 栏）⇒ 页步长 = cw + g，且每页正好覆盖 cw 宽。
               栏距从**计算样式**读，不在 JS 里另存常量 —— 否则 CSS 改了 JS 不知道，步长会错位。 */
            function computeTwoColOffsets(){
                const box = dom.novelContent;
                const cw = box.clientWidth;
                const gap = parseFloat(getComputedStyle(box).columnGap) || TWO_COL_GAP_FALLBACK;
                const stride = cw + gap;
                const max = Math.max(0, box.scrollWidth - cw);
                if(max <= 1 || stride <= 1) return [0];
                const offs = [0];
                let cur = 0, guard = 0;
                while(cur < max - 1 && guard++ < 5000){
                    const next = Math.min(Math.round(cur + stride), max);
                    if(next <= cur) break;
                    offs.push(next);
                    cur = next;
                }
                return offs;
            }
            function computePageOffsets(){
                const box = dom.novelContent;
                if(pagedTwoCol()) return computeTwoColOffsets();
                const H = pageViewport();
                const max = Math.max(0, box.scrollHeight - H);   // 读 scrollHeight 顺带强制一次布局
                if(max <= 1) return [0];
                const tops = collectLineTops();
                const offsets = [0];
                let cur = 0, guard = 0;
                while(cur < max - 1 && guard++ < 5000){
                    const target = cur + H;
                    if(target >= max) break;
                    let next = target;
                    if(tops && tops.length){
                        let lo = 0, hi = tops.length - 1, hit = -1;
                        while(lo <= hi){
                            const mid = (lo + hi) >> 1;
                            if(tops[mid] <= target + 0.5){ hit = mid; lo = mid + 1; } else hi = mid - 1;
                        }
                        if(hit >= 0 && tops[hit] > cur + 1) next = tops[hit];
                    }
                    next = Math.min(Math.round(next), max);
                    if(next <= cur) break;
                    offsets.push(next);
                    cur = next;
                }
                return offsets;
            }
            function refreshPager(force){
                if(!pagedActive()) return null;
                /* 栏数切换会让"页边界"整套换坐标系 —— 必须重量，并按比例把位置搬过去。 */
                if(syncTwoCol()) force = true;
                const key = pagerKey();
                if(!force && pageOffsetsCache && pageOffsetsCache.key === key) return pageOffsetsCache.offsets;
                const offsets = computePageOffsets();
                pageOffsetsCache = { key: key, offsets: offsets };
                if(twoColSwitchRatio !== null){
                    const r = twoColSwitchRatio; twoColSwitchRatio = null;
                    setPagePos(Math.round(r * pageMax()));
                    snapToCurrentPage();          // 落到新轴上的合法页边界
                }
                return offsets;
            }
            function currentPageIndex(offsets){
                const offs = offsets || (pageOffsetsCache && pageOffsetsCache.offsets) || [0];
                const t = pagePos();
                let lo = 0, hi = offs.length - 1, hit = 0;
                while(lo <= hi){
                    const mid = (lo + hi) >> 1;
                    if(offs[mid] <= t + 2){ hit = mid; lo = mid + 1; } else hi = mid - 1;
                }
                return hit;
            }
            function gotoPage(i){
                if(!pagedActive()) return;
                const offs = refreshPager(false) || [0];
                const idx = Math.max(0, Math.min(offs.length - 1, i|0));
                setPagePos(offs[idx]);
                saveScrollPosition();
                refreshModeIndicator();
            }
            /* 把 scrollTop 吸到当前页边界（切模式 / 改字号 / 改窗口后调用）。 */
            function snapToCurrentPage(){
                if(!pagedActive()) return;
                const offs = refreshPager(false) || [0];
                setPagePos(offs[currentPageIndex(offs)]);
                refreshModeIndicator();
            }
            /* 翻页**唯一入口**：页内翻，翻到头才换章。
               ←/→、空格、滚轮、点左右半屏四入口都走它（硬规则：同一动作多入口必须收口）。 */
            function pagedTurn(dir){
                if(!pagedActive()) return false;
                const offs = refreshPager(false) || [0];
                const cur = currentPageIndex(offs);
                if(dir > 0){
                    if(cur < offs.length - 1){ gotoPage(cur + 1); return true; }
                    if(state.currentIndex < state.chapters.length - 1){ pendingPageAnchor = 'first'; nextChapter(); return true; }
                    return false;
                }
                if(cur > 0){ gotoPage(cur - 1); return true; }
                if(state.currentIndex > 0){ pendingPageAnchor = 'last'; prevChapter(); return true; }
                return false;
            }
            /* 模式指示器（三档 + 分页时带页码）。页码**现算**不缓存索引 ——
               否则字体/窗口一变，缓存索引就漂了。 */
            function refreshModeIndicator(){
                if(!dom.modeIndicator) return;
                if(state.readMode === 'single'){
                    dom.modeIndicator.textContent = TT('📜 滚动', '📜 Scrolling');
                } else if(state.readMode === 'paged'){
                    const offs = refreshPager(false) || [0];
                    const i = currentPageIndex(offs);
                    /* 双栏时补一个后缀 —— 否则用户只看到"页数变少了"，不知道为什么。 */
                    const colTag = pagedTwoCol() ? TT(' · 双栏', ' · 2-col') : '';
                    dom.modeIndicator.textContent = TT('📖 第' + (i+1) + '/' + offs.length + ' 页', '📖 Page ' + (i+1) + '/' + offs.length) + colTag;
                } else {
                    dom.modeIndicator.textContent = TT('📖 阅读', '📖 Reading');
                }
            }

            function renderChapter(){
                clearSearchHighlights();
                if(TTS.state !== 'idle') ttsStop();
                if(dom.searchBar.classList.contains('active')) dom.searchInput.value='';
                if(!state.chapters.length){
                    dom.novelContent.textContent = t('loadPrompt');
                    dom.statusText.textContent = t('noFile');
                    dom.progressFill.style.width='0%';
                    /* 📑 V4.3.29：原先这里要把遗留 #bookmarkBtn 的图标重置成 ☆。那个按钮已从 index.html
                       移除，dom.bookmarkBtn 不复存在；书签的 ★/☆ 状态改由书签列表面板显示，此处无需处理。 */
                    return;
                }
                const ch = state.chapters[state.currentIndex];
                /* 🛡 V4.3.43（低危 F）：`ch.img` 会被直接当 `<img src>` 用，而 chapters 可能来自
                   「导入书架 / 导入阅读数据」的外部 JSON。它的合法形态只有 PDF 自产的那一种
                   （`data:image/jpeg;base64,…`）。放任任意字符串意味着：一次导入就能让应用
                   向攻击者地址发信标、甚至对渲染进程可达的本机 http 端口做 GET 探测
                   （V4.3.97：index.html 的 CSP `img-src` 已收紧为 `'self' data: blob:`；
                   实测书源封面 cover 从未进 `img.src`，无消费点，故入口+消费点双重白名单仍保留为纵深防御）。 */
                const pdfImg = (typeof ch.img==='string' && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(ch.img)) ? ch.img : '';
                if(pdfImg){
                    // 🖼 PDF 原样页：整页位图直接展示，不走文字渲染管线（字号/分块对位图无意义）
                    state.originalContent = '';
                    dom.statusText.textContent = '📌 '+ch.title;
                    dom.progressFill.style.width = ((state.currentIndex+1)/state.chapters.length*100)+'%';
                    Storage.set(S.READER_IDX, state.currentIndex);
                    Storage.set(S.READER_TOTAL, state.chapters.length);
                    dom.novelContent.innerHTML='';
                    const im=document.createElement('img');
                    im.className='pdf-page'; im.src=pdfImg; im.alt=ch.title; im.draggable=false;
                    dom.novelContent.appendChild(im);
                    dropTwoCol();
                    setPagePos(state.scrollPositions[state.currentIndex] || 0);
                    updateBookmarkStar();
                    updateTOCActive();
                    refreshFailedBar();
                    return;
                }
                state.originalContent = ch.content || '';
                dom.statusText.textContent = `📌 ${ch.title}${ch.failed ? (TT('（抓取失败）',' (failed)')) : ''}`;
                dom.progressFill.style.width = ((state.currentIndex+1)/state.chapters.length*100)+'%';
                Storage.set(S.READER_IDX, state.currentIndex);
                Storage.set(S.READER_TOTAL, state.chapters.length);
                const fallback = ch.failed ? t('failedChapter') : (TT('（本章无内容）','(empty chapter)'));
                renderContent(state.originalContent || fallback, ()=>{
                    /* 📖 V4.3.68：分页模式下内容刚落地必须**重新量页边界**，并按 pendingPageAnchor
                       落到首页/末页（换章时设置）；否则落到该章上次的位置再吸附到页边界。 */
                    if(pagedActive()){
                        refreshPager(true);
                        const offs = (pageOffsetsCache && pageOffsetsCache.offsets) || [0];
                        if(pendingPageAnchor){
                            setPagePos(pendingPageAnchor === 'last' ? offs[offs.length - 1] : offs[0]);
                            pendingPageAnchor = null;
                            saveScrollPosition();
                            refreshModeIndicator();
                        } else {
                            setPagePos(state.scrollPositions[state.currentIndex] || 0);
                            snapToCurrentPage();
                        }
                    } else {
                        setPagePos(state.scrollPositions[state.currentIndex] || 0);
                    }
                    /* 🖍 V4.3.71：必须等 chunk **全部** append 完再上色 ——
                       分块是逐帧 append 的，早一步算出来的字符偏移只覆盖半截文本。 */
                    paintAnnotations();
                });
                updateBookmarkStar();
                if(state.autoContrast) applyAutoContrast();
                updateSelectionStyle();
                updateTOCActive();
                refreshFailedBar();
            }
            function currentChapterFailed(){
                const ch = state.chapters[state.currentIndex];
                return !!(ch && ch.failed);
            }
            function refreshFailedBar(){
                if(!dom.failedBar) return;
                const on = currentChapterFailed();
                dom.failedBar.classList.toggle('on', on);
                if(on && dom.failedText) dom.failedText.textContent = t('failedChapter');
                if(dom.failedRetryBtn) dom.failedRetryBtn.textContent = t('retryChapter');
            }
            async function retryCurrentChapter(){
                const ch = state.chapters[state.currentIndex];
                if(!ch || !ch.failed) return;
                if(!state.sourceRule || !ch.url || !window.readerAPI || !window.readerAPI.sourceFetchOne){ showHint(t('retryNoRule')); return; }
                if(dom.failedRetryBtn) dom.failedRetryBtn.disabled = true;
                showHint(t('retrying'));
                /* 🟥 V4.3.44（R3-1）：发起时记下内容代次，网络回来后复检 ——
                   等待期间用户若点了「清空所有内容」或删掉这本书，DB._gen 会变，
                   本次抓取结果必须整段丢弃，否则会把刚清掉的内容写回库里（重启后复活）。 */
                const gen = DB._gen;
                try{
                    const r = await window.readerAPI.sourceFetchOne({ url: ch.url, rule: state.sourceRule });
                    if(DB.stale(gen)) return;
                    if(r && r.ok){
                        /* 🛡 V4.3.83 审查修复：重抓会**整段替换本章正文**，而批注锚的是「章内字符偏移」
                           （{idx,start,end}）—— 原文一变，旧偏移就指向完全不同的字，高亮/笔记会错位。
                           做法：清掉**本章**批注（其它章不动），并**出声**告知（不许静默丢数据）。
                           保守选择：宁可清掉也不让用户看到错位高亮 —— 错位的高亮比没有更误导。 */
                        const dropped = dropAnnotationsOfChapter(state.currentIndex);
                        ch.content = r.content;
                        ch.failed = false;
                        await DB.saveChapters(state.chapters);
                        await persistActiveBook();
                        renderChapter();
                        showHint(dropped > 0
                            ? TT('✅ 已重抓本章｜⚠️ 本章 ' + dropped + ' 条批注因正文变化已清除', '✅ Chapter reloaded | ⚠️ ' + dropped + ' annotation(s) cleared because the text changed')
                            : t('retryOk'));
                    } else {
                        showHint(t('retryFail') + ((r && r.error) || ''));
                    }
                }catch(e){ showHint(t('retryFail') + (e && e.message || e)); }
                finally { if(dom.failedRetryBtn) dom.failedRetryBtn.disabled = false; refreshFailedBar(); }
            }
            /* 🛡 V4.3.83：清掉指定章的全部批注，返回清掉的条数。
               批注锚的是章内字符偏移，正文一变（重抓/换源）偏移就失效 —— 调用方负责出声。 */
            function dropAnnotationsOfChapter(chIdx){
                try{
                    const list = Array.isArray(state.annotations) ? state.annotations : [];
                    const keep = list.filter(a => !a || a.idx !== chIdx);
                    const dropped = list.length - keep.length;
                    if(dropped > 0){
                        state.annotations = keep;
                        Storage.set(S.ANNOTATIONS, keep);
                    }
                    return dropped;
                }catch(e){ return 0; }
            }
            /* ── 批注渲染 ──
               做法：按章内字符偏移把文本节点切开、包 <mark>。
               🟥 顺序很重要：先收集**快照**，再**倒序**处理命中节点。
               splitText 会改节点树，正序处理会让后面节点的偏移全部失效。 */
            function collectTextNodes(){
                const box = dom.novelContent;
                const out = [];
                let acc = 0;
                let walker = null;
                try{ walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null); }catch(e){ return out; }
                let n = null;
                while((n = walker.nextNode())){
                    const len = n.nodeValue ? n.nodeValue.length : 0;
                    if(!len) continue;
                    out.push({ node: n, start: acc, end: acc + len });
                    acc += len;
                }
                return out;
            }
            function paintOne(ann){
                const hits = collectTextNodes().filter(x => x.end > ann.start && x.start < ann.end);
                for(let i = hits.length - 1; i >= 0; i--){
                    const h = hits[i];
                    const s = Math.max(0, ann.start - h.start);
                    const e = Math.min(h.end, ann.end) - h.start;
                    if(e <= s) continue;
                    let node = h.node;
                    try{
                        if(s > 0) node = node.splitText(s);
                        if(e - s < node.nodeValue.length) node.splitText(e - s);
                    }catch(err){ continue; }
                    const mk = document.createElement('mark');
                    mk.className = 'ann ann-' + ann.color;
                    mk.setAttribute('data-ann-id', ann.id);
                    if(ann.note) mk.title = ann.note;
                    node.parentNode.insertBefore(mk, node);
                    mk.appendChild(node);
                }
            }
            function clearAnnotMarks(){
                const box = dom.novelContent;
                const marks = box.querySelectorAll('mark.ann');
                for(let i=0;i<marks.length;i++){
                    const m = marks[i];
                    const parent = m.parentNode;
                    if(!parent) continue;
                    while(m.firstChild) parent.insertBefore(m.firstChild, m);
                    parent.removeChild(m);
                }
                /* 拆开之后相邻文本节点会变碎，normalize 合回去，否则下一次的偏移会算错 */
                if(marks.length){ try{ box.normalize(); }catch(e){} }
            }
            function paintAnnotations(){
                clearAnnotMarks();
                const idx = state.currentIndex;
                state.annotations.forEach(a=>{ if(a.idx === idx) paintOne(a); });
            }
            function chapterTextLen(){
                const ch = state.chapters[state.currentIndex];
                return (ch && typeof ch.content === 'string') ? ch.content.length : 0;
            }
            /* 选区 → 章内字符偏移。用 Range.toString().length 量前缀长度 ——
               内容区是 textContent 直写 + white-space:pre-wrap，range 文本与原文逐字符一致。 */
            function selectionOffsets(){
                let sel = null;
                try{ sel = window.getSelection(); }catch(e){ return null; }
                if(!sel || !sel.rangeCount || sel.isCollapsed) return null;
                const range = sel.getRangeAt(0);
                if(!dom.novelContent.contains(range.commonAncestorContainer)) return null;
                const pre = range.cloneRange();
                pre.selectNodeContents(dom.novelContent);
                try{ pre.setEnd(range.startContainer, range.startOffset); }catch(e){ return null; }
                const start = pre.toString().length;
                const text = range.toString();
                if(!text) return null;
                return { start: start, end: start + text.length, text: text };
            }
            function overlapsExisting(idx, start, end){
                return state.annotations.some(a => a.idx === idx && start < a.end && end > a.start);
            }
            function addAnnotation(sel, color, note){
                if(!state.chapters.length || !sel) return null;
                const idx = state.currentIndex;
                /* 重叠一律拒绝：允许嵌套会让 <mark> 互相包、删除时无法可靠还原文本节点。 */
                if(overlapsExisting(idx, sel.start, sel.end)){
                    showHint(TT('这段和已有批注重叠了，先删掉旧的再加', 'This range overlaps an existing annotation — remove that one first'));
                    return null;
                }
                const ann = {
                    id: genAnnotId(), idx: idx,
                    start: Math.max(0, Math.floor(sel.start)), end: Math.max(0, Math.floor(sel.end)),
                    text: String(sel.text || ''), note: String(note || ''),
                    color: ANN_COLORS.indexOf(color) >= 0 ? color : 'yellow',
                    at: new Date().toISOString()
                };
                state.annotations.push(ann);
                state.annotations.sort((x,y)=> (x.idx - y.idx) || (x.start - y.start));
                saveAnnotations();
                paintAnnotations();
                return ann;
            }
            function updateAnnotation(id, patchData){
                const a = state.annotations.find(x=>x.id === id);
                if(!a) return false;
                if(patchData && patchData.note !== undefined) a.note = String(patchData.note);
                if(patchData && ANN_COLORS.indexOf(patchData.color) >= 0) a.color = patchData.color;
                saveAnnotations();
                paintAnnotations();
                return true;
            }
            function removeAnnotation(id){
                const i = state.annotations.findIndex(x=>x.id === id);
                if(i < 0) return false;
                state.annotations.splice(i, 1);
                saveAnnotations();
                paintAnnotations();
                return true;
            }
            function findAnnotation(id){ return state.annotations.find(x=>x.id === id) || null; }
            /* 跳回原文：切章是**异步分块渲染**，所以定位要重试 ——
               一次不够（章节刚换、chunk 还没落地），600ms 那次兜底。 */
            function goToAnnotation(id){
                const a = findAnnotation(id);
                if(!a) return false;
                if(a.idx !== state.currentIndex) goTo(a.idx);
                const locate = ()=>{
                    const mk = dom.novelContent.querySelector('mark.ann[data-ann-id="' + a.id + '"]');
                    if(!mk) return false;
                    try{ mk.scrollIntoView({ block:'center', inline:'center' }); }catch(e){}
                    if(pagedActive()) snapToCurrentPage();
                    mk.classList.add('ann-flash');
                    setTimeout(()=>{ try{ mk.classList.remove('ann-flash'); }catch(e){} }, 1400);
                    return true;
                };
                if(!locate()) setTimeout(locate, 200);
                setTimeout(locate, 600);
                return true;
            }
            /* 导出 Markdown：按章分组，引用原文 + 笔记。
               🟥 V4.3.71：生成与保存分开 —— 生成是**纯函数**，探针才能在不弹对话框的前提下核对内容
               （「导出文件可读」这条验收，靠"点了不报错"是证明不了的）。 */
            function buildAnnotationsMarkdown(){
                const list = state.annotations.slice().sort((x,y)=> (x.idx - y.idx) || (x.start - y.start));
                if(!list.length) return '';
                const title = state.bookTitle || (state.chapters[0] && state.chapters[0].title) || TT('未命名', 'Untitled');
                const lines = ['# ' + title + ' · ' + TT('批注', 'Annotations'), '',
                               '> ' + TT('导出时间：', 'Exported: ') + new Date().toLocaleString(), ''];
                let lastIdx = -1;
                list.forEach(a=>{
                    if(a.idx !== lastIdx){
                        lastIdx = a.idx;
                        const ch = state.chapters[a.idx];
                        lines.push('', '## ' + ((ch && ch.title) || ('第' + (a.idx + 1) + '章')), '');
                    }
                    const quote = String(a.text || '').replace(/\s*\n\s*/g, ' ').trim();
                    lines.push('- > ' + quote);
                    if(a.note) lines.push('  - **' + TT('笔记', 'Note') + '**：' + String(a.note).replace(/\s*\n\s*/g, ' '));
                });
                lines.push('');
                return lines.join('\n');
            }
            async function exportAnnotationsMarkdown(){
                const content = buildAnnotationsMarkdown();
                if(!content){ showHint(TT('还没有批注', 'No annotations yet')); return false; }
                const title = state.bookTitle || (state.chapters[0] && state.chapters[0].title) || TT('未命名', 'Untitled');
                const safe = String(title).replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
                let r = null;
                try{
                    r = await window.readerAPI.saveTextFile({
                        title: TT('导出批注', 'Export annotations'),
                        defaultPath: safe + '-' + TT('批注', 'annotations') + '.md',
                        filters: [{ name: 'Markdown', extensions: ['md'] }],
                        content: content
                    });
                }catch(e){
                    logRenderError('exportAnnotationsMarkdown failed: ' + ((e && e.message) || e));
                    showHint(TT('导出失败', 'Export failed'));
                    return false;
                }
                showHint(r && r.canceled ? TT('已取消', 'Cancelled')
                    : (r && r.error ? (TT('导出失败：', 'Export failed: ') + r.error) : TT('批注已导出', 'Annotations exported')));
                return !!(r && !r.canceled && !r.error);
            }
            function renderContent(text, onDone){
                const token=++renderToken;
                dom.novelContent.innerHTML='';
                const lines=text.split('\n');
                const PER=1200;
                if(lines.length<=PER && text.length<=150000){
                    const div=document.createElement('div'); div.className='chunk'; div.textContent=text;
                    dom.novelContent.appendChild(div); if(onDone) onDone(); return;
                }
                if(lines.length>PER){
                    let start=0;
                    const step=()=>{
                        if(token!==renderToken) return;
                        const end=Math.min(start+PER, lines.length);
                        const div=document.createElement('div'); div.className='chunk';
                        div.textContent=lines.slice(start,end).join('\n')+(end<lines.length?'\n':'');
                        dom.novelContent.appendChild(div);
                        start=end;
                        if(start<lines.length) requestAnimationFrame(step); else if(onDone) onDone();
                    };
                    step();
                } else {
                    const PERC=60000; let pos=0;
                    const stepC=()=>{
                        if(token!==renderToken) return;
                        const end=Math.min(pos+PERC, text.length);
                        const div=document.createElement('div'); div.className='chunk'; div.textContent=text.slice(pos,end);
                        dom.novelContent.appendChild(div);
                        pos=end;
                        if(pos<text.length) requestAnimationFrame(stepC); else if(onDone) onDone();
                    };
                    stepC();
                }
            }
            let scrollSaveTimer;
            function saveScrollPosition(){
                if(state.chapters.length && state.currentIndex<state.chapters.length){
                    /* 📖 V4.3.70：存"当前轴上的偏移"。readMode 与栏数都由宽度决定，
                       恢复时轴是确定的，所以同一个字段够用，不需要再加一个 scrollLeft 表。 */
                    state.scrollPositions[state.currentIndex] = pagePos();
                    /* 🛡 V4.3.83 审查补：位置表原先**无上限累积** —— 每读一章记一条，
                       一本 3000 章的书就是 3000 条；书架里每本书的 meta 也各带一份，
                       多本大书就能把 localStorage 顶到配额，之后 Storage.set 静默失败 →
                       阅读进度丢失且没有任何提示。超过 300 条时只保留当前章 ±150 范围内的
                       （远处的章跳回去重读时只是"没记住位置"，可接受；配额爆掉的代价大得多）。 */
                    try{
                        const keys = Object.keys(state.scrollPositions);
                        if(keys.length > 300){
                            const lo = state.currentIndex - 150, hi = state.currentIndex + 150;
                            const kept = {};
                            keys.forEach(k => { const n = Number(k); if(n >= lo && n <= hi) kept[k] = state.scrollPositions[k]; });
                            state.scrollPositions = kept;
                        }
                    }catch(e){}
                    clearTimeout(scrollSaveTimer);
                    scrollSaveTimer = setTimeout(()=>{ try{localStorage.setItem('fsp', JSON.stringify(state.scrollPositions));}catch{} }, 300);
                }
            }
            dom.novelContent.addEventListener('scroll', saveScrollPosition);
            /* 📖 V4.3.68：滚轮翻页。累加到阈值再翻 —— 触控板一次轻扫会连发几十个 wheel，
               逐个翻会把 10 页一口气翻过去。400ms 内视为同一次滑动。 */
            let pageWheelAcc = 0, pageWheelAt = 0;
            dom.novelContent.addEventListener('wheel', function(e){
                if(!pagedActive()) return;
                e.preventDefault();
                const now = Date.now();
                if(now - pageWheelAt > 400) pageWheelAcc = 0;
                pageWheelAt = now;
                pageWheelAcc += e.deltaY;
                if(Math.abs(pageWheelAcc) >= 40){ pagedTurn(pageWheelAcc > 0 ? 1 : -1); pageWheelAcc = 0; }
            }, { passive: false });
            /* 📖 V4.3.68：点左右半屏翻页。**有选中文本时不翻** —— 否则复制完一点就跳页；
               点在链接/高亮/按钮上也不翻，避免抢掉它们自己的点击语义。 */
            dom.contentWrapper.addEventListener('click', function(e){
                if(!pagedActive()) return;
                try{ const sel = window.getSelection(); if(sel && String(sel).length) return; }catch(err){}
                if(e.target && e.target.closest && e.target.closest('mark, a, button, input, select')) return;
                const r = dom.novelContent.getBoundingClientRect();
                if(!r.width) return;
                const x = e.clientX - r.left;
                if(x < 0 || x > r.width) return;
                pagedTurn(x > r.width / 2 ? 1 : -1);
            });
            function goTo(idx){ if(idx<0||idx>=state.chapters.length||!state.chapters.length) return; state.currentIndex=idx; renderChapter(); }
            const prevChapter = () => goTo(state.currentIndex-1);
            const nextChapter = () => goTo(state.currentIndex+1);
            dom.progressBar.addEventListener('click', e=>{
                if(!state.chapters.length) return;
                const rect = dom.progressBar.getBoundingClientRect();
                const ratio = (e.clientX-rect.left)/rect.width;
                const idx = Math.floor(ratio*state.chapters.length);
                goTo(idx);
            });

            // 书签
            /* 📑 V4.3.29 书签重构：工具条上那个独立的「书签」按钮取消，
               「加/移除书签」这条功能收进「书签列表」面板，并做成一个可改键的快捷键。
               主窗 index.html 里的 #bookmarkList 浮层（V4.0 遗留）随之废弃 —— 列表改由独立面板承载。 */
            function bookmarkPayload(){
                return {
                    /* 📑 V4.3.29：把 id / 章内位置 / 备注 / 时间一起下发，面板才能显示「读到这章 32%」
                       并支持一章多条、按条删除与改备注。 */
                    bookmarks: (state.bookmarks||[]).map(b=>({
                        id:b.id, idx:b.idx, title:b.title || ('第'+(b.idx+1)+'章'),
                        pos:b.pos, mode:b.mode, note:b.note, at:b.at
                    })),
                    current: state.currentIndex,
                    canBookmark: !!state.chapters.length,
                    /* 一章可以有多条书签之后，「当前章是否已加书签」这个布尔不再有意义 ——
                       改成告诉面板「当前章有几条」，让它显示得更准。 */
                    currentCount: state.bookmarks.filter(b=>b.idx===state.currentIndex).length
                };
            }
            function syncBookmarkPanel(){ sendPanelData('bookmarks', bookmarkPayload()); }
            /* 旧实现更新主窗那个已被摘除的影子按钮（等于没改）+ 无条件发一次 syncToolbarPanel。
               现在书签状态唯一去处是书签列表面板；它每次渲染章节都会被调用，所以这里只在**面板开着**
               时才推数据（不推白搭一笔 IPC）—— 加/删书签的正反馈不靠它，由 saveBookmarks 无条件推。 */
            function updateBookmarkStar(){ if(typeof openPanelTypes!=='undefined' && openPanelTypes && openPanelTypes.has('bookmarks')) syncBookmarkPanel(); }
            function saveBookmarks(){ Storage.set(S.BOOKMARKS,state.bookmarks); persistActiveBook(); syncBookmarkPanel(); }
            function saveAnnotations(){ Storage.set(S.ANNOTATIONS,state.annotations); persistActiveBook(); syncAnnotPanel(); }
            function annotPayload(){
                return {
                    annotations: state.annotations.map(a=>({
                        id:a.id, idx:a.idx, start:a.start, end:a.end, text:a.text, note:a.note, color:a.color, at:a.at,
                        title: (state.chapters[a.idx] && state.chapters[a.idx].title) || ('第' + (a.idx + 1) + '章')
                    })),
                    current: state.currentIndex,
                    canAnnot: !!state.chapters.length,
                    bookTitle: state.bookTitle || ''
                };
            }
            function syncAnnotPanel(){ sendPanelData('annot', annotPayload()); }
            /* 📑 V4.3.29：加书签 —— **一章可以加多个**（旧版一章只允许一个，长章根本不够用）。
               同一章 + 几乎同一位置（比例差 < 1%）不再重复添加，避免手抖连点刷出一堆一样的东西。 */
            function addBookmark(note){
                if(!state.chapters.length) return null;
                const idx = state.currentIndex;
                const p = captureBookmarkPos();
                const dup = state.bookmarks.find(b => b.idx === idx && Math.abs((b.pos || 0) - p.pos) < 0.01);
                if(dup){
                    showHint(TT('这个位置已经有书签了','A bookmark already exists here'));
                    return null;
                }
                const bm = { id: genBookmarkId(), idx, title: (state.chapters[idx] && state.chapters[idx].title) || ('第' + (idx + 1) + '章'), pos: p.pos, mode: p.mode, note: String(note || ''), at: new Date().toISOString() };
                state.bookmarks.push(bm);
                saveBookmarks();
                return bm;
            }
            function findBookmark(id){ return state.bookmarks.find(b => b.id === id) || null; }
            /* 📑 V4.3.29：删除**指定某一条**（按 id，不是按章节号）—— 一章多书签之后只能这么删。
               确认弹窗由面板侧负责（在用户点击的那个窗口里弹，比弹到主窗更顺手）。 */
            function removeBookmark(id){
                const i = state.bookmarks.findIndex(b => b.id === id);
                if(i === -1) return false;
                state.bookmarks.splice(i, 1);
                saveBookmarks();
                return true;
            }
            /* 📑 V4.3.30（#24）：删书签由「先弹确认」改成「删了就地给一次撤销」，
               所以要把面板传回来的那条**原样塞回去** —— id、章内位置、备注都不能漂。
               字段清洗复用 normalizeBookmarks（脏数据在这里就被挡掉），id 已存在说明别处已经加回来了。 */
            function restoreBookmark(bm){
                const one = normalizeBookmarks([bm])[0];
                if(!one) return false;
                if(state.bookmarks.some(b => b.id === one.id)) return false;
                state.bookmarks.push(one);
                saveBookmarks();
                return true;
            }
            function setBookmarkNote(id, note){
                const b = findBookmark(id);
                if(!b) return false;
                b.note = String(note || '');
                saveBookmarks();
                return true;
            }
            /* 跳到某条书签：先切章，再把位置滚回当时那个比例。
               位置按**比例**还原，所以窗口大小不一样也能落在差不多的地方。 */
            function goToBookmark(id){
                const b = findBookmark(id);
                if(!b) return false;
                goTo(b.idx);
                const ratio = Number(b.pos) || 0;
                const apply = ()=>{
                    setPagePos(ratio * pageMax());
                    state.scrollPositions[b.idx] = pagePos();
                };
                apply();
                setTimeout(apply, 120);   // 大章是分块渲染的，等一帧再滚一次才稳
                return true;
            }
            /* 📑 V4.3.29：原 renderBookmarkList（渲染主窗遗留 #bookmarkList 浮层）已删除 ——
               列表渲染搬到 panel.js 的 renderBookmarkList(p)，数据由 bookmarkPayload() 下发。 */

            // 样式应用
            /* V4.3.97：写状态 + 落盘后交给统一收口（吸色 > 伪装 > 用户），
               不再直接写内联 color —— 那会覆盖伪装皮肤/吸色的字色（审查 R-1）。 */
            function applyTextColor(c){ state.textColor=c; Storage.set(S.TEXT_COLOR,c); try{ applyReadingColor(); }catch(e){ dom.novelContent.style.color = CONFIG.SKINS[state.skinIndex]==='dark' ? '#e8e8e8' : c; } }
            function applyBgColorRGB(rgb, persist){ if(!rgb) return;
                         state.bgRgb=rgb;
                         dom.mainContent.style.setProperty('--bg-r',rgb.r);
                         dom.mainContent.style.setProperty('--bg-g',rgb.g);
                         dom.mainContent.style.setProperty('--bg-b',rgb.b);
                         if(persist!==false) Storage.set(S.BG_RGB,rgb);
                         if(state.autoContrast) applyAutoContrast();
                        }
            /* 🆕 V4.3.54（吸色优化）：把采样色融进背景。两条调用路：
               · 自动吸色循环（persist=false）→ 只改 CSS 变量**不落盘** —— 背景跟着环境走，
                 环境变了不该把中间态固化进用户设置；落盘只属于用户显式应用（取色点单击）。
               · 取色点单击应用（persist 默认 true）→ 照旧落盘。
               修闪烁根因②「像素噪声直通」：先对采样色做**量化去抖** ——
               GetPixel 对抗锯齿/动效/驱动的 ±1~3 抖动毫无免疫，原来每次都无条件
               55% 靠拢写背景（还联动对比度重算+localStorage 落盘），背景就跟着
               噪声反复微跳。现在各通道差 ≤5（≈2% 满量程，肉眼不可辨）视为同色直接跳过。 */
            let lastPickApplied = null;
            function applyAutoPickColor(hex, persist){
                const rgb=hexToRgb(hex); if(!rgb) return;
                if(lastPickApplied &&
                   Math.abs(rgb.r-lastPickApplied.r)<=5 &&
                   Math.abs(rgb.g-lastPickApplied.g)<=5 &&
                   Math.abs(rgb.b-lastPickApplied.b)<=5) return;
                lastPickApplied={r:rgb.r,g:rgb.g,b:rgb.b};
                const cur=state.bgRgb||CONFIG.DEF_BG_RGB; const k=0.55;
                applyBgColorRGB({r:Math.round(cur.r+(rgb.r-cur.r)*k),g:Math.round(cur.g+(rgb.g-cur.g)*k),b:Math.round(cur.b+(rgb.b-cur.b)*k)}, persist);
            }
            /* ⬜ V4.3.60：投影的**几何**必须收在窗口内衬能容纳的范围内。
               透明无边框窗口里投影画不进窗口外 —— 原先 blur 最大 50px、下偏移 26px，
               而内衬只有 10px，强度调高时投影被窗口边界切掉一大截（越调强越难看）。
               现在把 blur/offset 的上限压到 24/8（= `--win-shadow-*` 令牌值，内衬 20px 正好容纳），
               滑杆的"变强"改由**透明度 + 描边宽度**承担 —— 视觉上仍是"越强越厚重"，
               但不会再有被裁的硬边。 */
            function applyShadow(val){
                state.shadowIntensity=val; const i=val/100;
                const oy = 4+Math.round(i*4);            // 4 → 8
                const bl = 10+Math.round(i*14);          // 10 → 24（上限 = --win-shadow-blur）
                dom.mainContent.style.boxShadow=`0 ${oy}px ${bl}px rgba(0,0,0,${(0.05+i*0.35).toFixed(2)})`;
                dom.mainContent.style.borderColor=`rgba(90,100,115,${(0.12+i*0.7).toFixed(2)})`;
                dom.mainContent.style.borderWidth=(1+Math.round(i*3))+'px';
                Storage.set(S.SHADOW,val);
                if(dom.shadowIntensityValue) dom.shadowIntensityValue.textContent=val+'%';
            }
            /* 🆕 V4.3.86：滑块语义改成**透明度**（右移更透明）。内部仍存 opacity（100=不透明），
               只在显示与滑块位置上做 100-val 换算 —— 这样旧备份/旧设置的含义完全不变，
               不会出现"老用户升级后界面突然全透明"。 */
            function applyTextOpacity(val){ state.textOpacity=val; dom.novelContent.style.opacity=val/100; Storage.set(S.TEXT_OPACITY,val); if(dom.textOpacityValue) dom.textOpacityValue.textContent=(100-val)+'%'; if(dom.textOpacitySlider) dom.textOpacitySlider.value=String(100-val); }
            function applyWindowOpacity(val){
                state.windowOpacity=val;
                const alpha=Math.max(0.2, Math.min(1, val/100));
                dom.mainContent.style.setProperty('--bg-alpha',alpha.toFixed(2));
                /* 🆕 V4.3.86（用户反馈「透明底降低后按钮不跟随」）：
                   原来 --ui-alpha = 0.55 + 0.38*alpha —— 窗口透到 20% 时它还有 0.63，
                   而背景只有 0.20，于是按钮/抽屉"浮"在半透明背景上，质感完全脱节。
                   现在让它**贴着背景走**：0.08 + 0.88*alpha（100% → 0.96，20% → 0.26），
                   按钮与背景始终是同一层玻璃。smoke2 的下界断言（<0.82 @35%）仍然成立。
                   🟥 必须同时写到 <html> 上：`#toolbarPanel` / `.settings-panel` 是 #mainContent
                   **的兄弟节点**，只写在 mainContent 上它们继承不到（这也是"按钮不跟随"的另一半原因）。 */
                const ui=(0.08+0.88*alpha).toFixed(2);
                dom.mainContent.style.setProperty('--ui-alpha',ui);
                try{ document.documentElement.style.setProperty('--ui-alpha',ui); }catch(e){}
                /* 🔍 V4.3.88（用户：“大部分比较小的字体都很糊”）：
                   阴影模糊半径是**固定 1px**，字号越小，1px 相对笔画就越粗 —— 12px 正文叠上去就是一团模糊。
                   按字号打折：≥18px 全力 / 15~17px 一半 / <15px 不要（小字靠对比度，不靠阴影）。 */
                const fsNow = Number(state.fontSize) || 14;
                const fsFactor = fsNow >= 18 ? 1 : (fsNow >= 15 ? 0.5 : 0);
                const strength=Math.max(0, Math.min(1, (100-val)/60)) * fsFactor;
                dom.mainContent.style.setProperty('--text-shadow-strength',strength.toFixed(2));
                Storage.set(S.WINDOW_OPACITY,val);
                /* 🆕 V4.3.86：滑块现在表示**透明度**（右移更透明），所以显示与位置都要反过来。
                   见 applyTextOpacity / 面板 updateToolbar 的同一处换算。 */
                if(dom.windowOpacityValue) dom.windowOpacityValue.textContent=(100-val)+'%';
                if(dom.windowOpacitySlider) dom.windowOpacitySlider.value=String(100-val);
                /* 🆕 V4.3.86：把新透明度**推给所有面板小窗** —— 按钮都住在那里，
                   不推的话面板永远停在打开时的不透明度（这就是"按钮不跟随"的根因）。 */
                try{ broadcastTheme(); }catch(e){}
            }
            /* 📖 V4.3.70：页边距。走 CSS 变量而不是内联 padding ——
               wrapper 的 padding 已经是 calc(6px + var(--page-margin))，内联会把它整条顶掉。
               留白一变，可视宽/高都变 ⇒ 页边界整套失效，分页时要立刻重量并吸附回当前页。 */
            function applyPageMargin(val){
                const v = Math.max(0, Math.min(48, Math.round(Number(val) || 0)));
                state.pageMargin = v;
                Storage.set(S.PAGE_MARGIN, v);
                document.documentElement.style.setProperty('--page-margin', v + 'px');
                if(dom.pageMarginValue) dom.pageMarginValue.textContent = v + 'px';
                if(pagedActive()){ refreshPager(true); snapToCurrentPage(); }
            }
            function applyLineHeight(val){ val=Math.max(CONFIG.MIN_LINE_HEIGHT, parseFloat(val)||CONFIG.DEF_LINE_HEIGHT); state.lineHeight=val; dom.novelContent.style.lineHeight=val; Storage.set(S.LINE_HEIGHT,val); if(dom.lineHeightValue) dom.lineHeightValue.textContent=val.toFixed(1); }
            /* V4.3.33 修：state.bgRgb 可能是 null（例如导入的 fbr 恰好是 null），
               原先直接解构会抛 TypeError，把这条渲染路径整个打断。补默认值兜底。 */
            function applyAutoContrast(){ if(CONFIG.SKINS[state.skinIndex]==='dark'){ dom.novelContent.style.color='#e8e8e8'; return; } const {r,g,b}=state.bgRgb||CONFIG.DEF_BG_RGB; const brightness=(r*299+g*587+b*114)/1000; dom.novelContent.style.color = brightness>128?'#1a1a1a':'#f0f0f0'; }
            function updateSelectionStyle(){ dom.novelContent.style.userSelect=state.allowSelect?'text':'none'; dom.novelContent.style.cursor=state.allowSelect?'text':'default'; Storage.set(S.ALLOW_SELECT,state.allowSelect); }
            /* 🟥 脱离监控的键位已并入快捷键系统（DEFAULT_SHORTCUTS.contentProtect，默认 Ctrl+Shift+S）。
               好处：自动出现在「快捷键说明」浮层里、可在设置里改键、参与冲突检测、被「恢复默认」还原。
               🔓 为什么用组合键而不是单键 T：T 只切「能不能选中文本」，是无害动作；而脱监切的是
               **防截屏保护**，属「降低防护」，不该被手滑触发。Ctrl+Shift+S 的 S 可记作 Screenshot，
               也与本项目既有的 Ctrl+Shift 功能键族一致（H 隐藏 / D 专注 / F 全文 / P 取色点 / T 工具栏 / L 朗读）。 */
            /* ---------- 脱离监控（V4.3.19）----------
               **一个总开关**，管两件事（用户定案「做一个默认开关」）：
                 · 防截屏：主进程 setContentProtection → Windows WDA_EXCLUDEFROMCAPTURE，
                   截屏 / 录屏 / 远程协助看到的这块区域是黑的（窗口本身还在）
                 · 投屏 / 远控自动隐身：运行中新增显示器、或有远控程序在跑时，自动把窗口藏起来
               **默认关闭**（用户定案），状态持久化（键 fcp）。两种操作方式：
               工具栏「🛡 脱监」按钮卡 + 快捷键 Ctrl+Shift+S，两者走同一个 toggle，状态永远一致。
               🟥 与「能否选中文本」**完全解耦**：后者是独立的 T 键开关（用户已把 T 要回去）。
               刻意不联动 —— 否则「关了脱监，文本突然能选了」会让人不知道哪个开关在起作用。
               关闭时的提示会顺带提醒按 T 复制文本，弥补不联动带来的可发现性问题。 */
            function pushContentProtect(){
                try{ if(window.readerAPI && window.readerAPI.setContentProtection) window.readerAPI.setContentProtection(!!state.contentProtectOn); }catch(e){}
            }
            /* 🟥 V4.3.23：**谁才算「确实没生效」**（用户要求把"真失效"和"随便弹个警告"区分开）。
               判定只认三条硬证据，其余一律静默：
                 ① 本机**实测**过（真截屏对比）且结论 failed  → 红：确认失效
                 ② 平台**明确不支持**（Linux / 无能力上报）   → 红：系统层面就不可能
                 ③ 实测过但本机截屏能力不可用 → 黄：无法判定（**不是**失效，不报红）
               没测过的机器 → 不报警。这样"只是警告"和"真没生效"不会再混在一起。 */
            function verdictForThisMachine(){
                const v = state.protectVerdict;
                if(!v || !v.st || !v.fp) return null;
                return (v.fp === state.protectFp) ? v : null;   // 换机器/换系统 → 旧结论作废
            }
            function refreshProtectWarn(){
                if(!state.contentProtectOn){ state.protectWarn=''; state.protectWarnKind=''; return; }
                const zh = currentLang==='zh';
                const v = verdictForThisMachine();
                if(v && v.st === 'failed'){
                    state.protectWarn = zh ? '已实测确认没生效：截屏仍能看到内容' : 'Verified FAILED: capture still works';
                    state.protectWarnKind = 'warn'; return;
                }
                if(state.protectLevel === 'none'){
                    state.protectWarn = zh ? ('系统层面不支持防截屏' + (state.protectNote ? '（' + state.protectNote + '）' : '')) : 'Not supported by this OS';
                    state.protectWarnKind = 'warn'; return;
                }
                if(v && v.st === 'unavailable'){
                    state.protectWarn = zh ? '本机无法实测（截屏接口不可用），无法确认是否生效' : 'Cannot verify on this machine';
                    state.protectWarnKind = 'note'; return;   // 黄：不确定 ≠ 失效
                }
                state.protectWarn = ''; state.protectWarnKind = '';
            }
            /* 实测一次并落盘（结论只对当前设备指纹有效）。interactive=true 把过程与结果都说给用户；
               启动时的静默复测只在「测出不生效」时才吭声，避免每次开机都刷一条提示。 */
            let protectVerifying = false;
            async function ensureProtectVerdict(interactive){
                const known = verdictForThisMachine();
                if(known && (known.st === 'passed' || known.st === 'failed')) return known;
                if(protectVerifying) return null;
                if(!window.readerAPI || !window.readerAPI.runProtectSelfTest) return null;
                protectVerifying = true;
                let r = null;
                try{ r = await runProtectSelfTest(interactive); }catch(e){ r = null; }
                protectVerifying = false;
                return r;
            }
            function setContentProtect(on){
                state.contentProtectOn = !!on;
                Storage.set(S.CONTENT_PROTECT, state.contentProtectOn);
                pushContentProtect();
                const zh = currentLang==='zh';
                if(!state.contentProtectOn){
                    state.protectWarn=''; state.protectWarnKind='';
                    showHint(zh ? '🔓 脱离监控已关闭：可正常截图｜要复制文本按 T' : '🔓 Privacy guard OFF: screenshot OK / press T to copy');
                    syncToolbarPanel();
                    return;
                }
                refreshProtectWarn();
                syncToolbarPanel();
                if(state.protectWarn){
                    showHint('⚠️ ' + state.protectWarn, state.protectWarnKind || 'warn');
                }else if(verdictForThisMachine()){
                    showHint(zh ? '🛡 脱离监控已开启：截屏 / 录屏抓不到内容（本机已实测通过）' : '🛡 Privacy guard ON (verified on this machine)');
                }else{
                    showHint(zh ? '🛡 脱离监控已开启：正在本机实测确认…' : '🛡 Privacy guard ON: verifying on this machine…');
                }
                ensureProtectVerdict(true);   // 开了就**测一次**，别让人猜到底管不管用
            }
            function toggleContentProtect(){ setContentProtect(!state.contentProtectOn); }
            /* 🛡 脱监自检（V4.3.20）：真截两次屏对比，给出「生效 / 未生效 / 无法判定」的结论。
               这是回答「怎么知道脱监到底有没有起效」的正面答案 —— 按钮亮只证明开了，证明不了管用。 */
            async function runProtectSelfTest(interactive){
                const zh = currentLang==='zh';
                if(!window.readerAPI || !window.readerAPI.runProtectSelfTest){
                    if(interactive) showHint(zh ? '当前版本不支持自检' : 'Self-test unsupported');
                    return null;
                }
                if(interactive) showHint(zh ? '🔍 正在自检防截屏…（约 2 秒，屏幕右上会闪一个小色块）' : '🔍 Self-testing…');
                let r = null;
                try{ r = await window.readerAPI.runProtectSelfTest(); }
                catch(e){ r = { verdict:'unknown', note:String((e && e.message) || e) }; }
                const v = (r && r.verdict) || 'unknown';
                /* 🟥 V4.3.23：把结论落盘（带设备指纹）—— 这是「确实没生效」的唯一硬证据来源。
                   passed / failed 都算已验证；unavailable（本机截屏接口都不可用）只是「测不了」。 */
                const st = (v === 'ok') ? 'passed' : (v === 'ineffective' ? 'failed' : 'unavailable');
                state.protectVerdict = { st: st, at: Date.now(), fp: state.protectFp, level: (r && r.level) || state.protectLevel };
                try{ Storage.set(S.PROTECT_VERDICT, state.protectVerdict); }catch(e){}
                refreshProtectWarn();
                let msg = '', kind = '';
                if(v === 'ok'){
                    msg = zh ? '✅ 自检通过：防截屏确实生效（截屏 / 录屏抓不到内容）' : '✅ Passed: capture is blocked';
                }else if(v === 'ineffective'){
                    kind = 'warn';
                    msg = zh ? ('❌ 脱离监控**确实**没生效：自检时截屏仍能看到内容｜' + state.protectWarn) : '❌ Verified NOT effective: capture still works';
                }else if(v === 'unavailable'){
                    kind = 'note';
                    msg = zh ? '⚠️ 测不出来：本机截屏接口不可用（可能被权限 / 显卡驱动限制），无法确认是否生效（≠ 没生效）' : '⚠️ Cannot tell: screen capture unavailable here';
                }else{
                    kind = 'note';
                    msg = zh ? ('⚠️ 自检结果不确定' + (r && r.note ? '：' + r.note : '')) : '⚠️ Inconclusive';
                }
                // 静默复测（启动时）只在"确实失效"时吭声，别拿通过/测不了去打扰人
                if(interactive || v === 'ineffective') showHint(msg, kind);
                syncToolbarPanel();
                try{ if(window.readerAPI.logError) window.readerAPI.logError('脱监自检结果 ' + JSON.stringify(r)); }catch(e){}
                return r;
            }
            // 跨系统能力自检：问主进程要本机防截屏的支撑度（不持久化，每次启动重探）
            /* 🟥 V4.3.45（R4-3）：`skipSelftest` —— 切语言时也要重新拉一次能力说明
               （note 是主进程按当前语言生成的），但**绝不能**顺带再排一次自检
               （自检会弹品红小窗闪屏，切语言时莫名其妙地闪一下是明显的倒退）。 */
            async function syncCapabilities(skipSelftest){
                try{
                    if(!window.readerAPI || !window.readerAPI.getCapabilities) return;
                    const c = await window.readerAPI.getCapabilities();
                    state.protectLevel = (c && c.protect && c.protect.level) || 'unknown';
                    state.protectNote  = (c && c.protect && c.protect.note) || '';
                    state.protectFp    = (c && c.protectFp) || '';
                    /* 🟥 V4.3.23：启动时不再"看系统版本就报警"。只用硬证据判：
                       · 平台明确不支持 → 红（这是确定，不是猜）
                       · 有本机实测结论（同指纹）→ 按结论 passed/failed 说话
                       · 没测过 → **静默**，然后补测一次（换电脑后最容易出现"以为开着其实没防护"） */
                    refreshProtectWarn();
                    if(state.contentProtectOn && state.protectWarn){
                        showHint('⚠️ ' + state.protectWarn, state.protectWarnKind || 'warn');
                    }
                    syncToolbarPanel();
                    if(!skipSelftest && state.contentProtectOn && !verdictForThisMachine()){
                        /* 本机还没实测过 → 补测一次（换电脑后最容易出现"以为开着其实没防护"）。
                           必须**先说一声**：自检会弹一个品红小窗闪一下，静默闪窗会让人莫名其妙。 */
                        setTimeout(()=>{
                            showHint(TT('🔍 首次在本机实测防截屏（屏幕会闪一下小色块）…','🔍 Verifying capture protection on this machine…'));
                            /* 🟥 V4.3.48（R7-3）：`ensureProtectVerdict` 是 async，同步 try/catch 是死的。
                               改用 .catch 接住 —— 防截屏自检失败必须留下痕迹（这是隐私功能的结论来源）。 */
                            ensureProtectVerdict(false).catch(function(e){
                                logRenderError('ensureProtectVerdict(启动补测) failed: ' + ((e && e.message) || e));
                            });
                        }, 3000);
                    }
                }catch(e){}
            }
            /* 🖋 V4.3.87（用户：“楷体有点模糊，看能不能优化一下”）：
               楷体/行楷的笔画本来就细，而本项目在窗口越透明时会**加强文字阴影**
               （`--text-shadow-strength`，见 applyWindowOpacity）。阴影叠在细笔画上 = 模糊的主要来源。
               所以给它们挂一个 `.font-kai`：关掉阴影 + 字距微松（笔画不粘连）。
               判定用**字体名关键字**，不依赖下拉项的位置（以后再加楷体也不用改这里）。 */
            const KAI_RE = /kaiti|kaishu|kai\b|xingkai|\u6977|\u884c\u6977/i;
            function applyReadingFont(f){ state.readingFont=f; dom.novelContent.style.fontFamily=f;
                try{ dom.novelContent.classList.toggle('font-kai', KAI_RE.test(String(f||''))); }catch(e){}
                Storage.set(S.READING_FONT,f); }

            /* 🎨 V4.3.69（批 2 第二刀）：排版预设
               三个内置组合，一次把「皮肤 / 底色 / 字色 / 行距 / 字号 / 字体」调成一套。
               ⚠️ 是**动作**不是状态：点完预设用户还会继续拖滑块微调，一旦把"当前预设=护眼"
               存下来并显示，那个标签立刻就是假的。所以只做一键套用、不记当前预设。
               ⚠️ 页边距本轮不做：它要新增持久化键 + 同步恢复默认/备份快照/reset-state 探针计数，
               留给双栏那一版一起动，避免同一批文件改两遍。 */
            const TYPE_PRESETS = {
                eye:   { zh:'护眼', en:'Eye-care', skin:0, bg:{r:199,g:237,b:204}, text:'#2f3b32', lineHeight:1.8,  font:14,
                         family:"'Microsoft YaHei','PingFang SC',sans-serif" },
                /* 夜间不改 state.textColor：深色皮肤下字色由 applySkin 强制为 #e8e8e8，
                   若这里写死浅色，用户切回浅色皮肤就会得到一身浅灰字（白底上看不见）。 */
                night: { zh:'夜间', en:'Night',    skin:1, bg:{r:24,g:26,b:30},     text:null,      lineHeight:1.75, font:14,
                         family:"'Microsoft YaHei','PingFang SC',sans-serif" },
                paper: { zh:'纸质', en:'Paper',    skin:0, bg:{r:250,g:246,b:236}, text:'#3a3226', lineHeight:1.7,  font:15,
                         family:"Georgia,'Songti SC','SimSun',serif" }
            };
            function applyTypePreset(key){
                const p = TYPE_PRESETS[key];
                if(!p) return false;
                /* 顺序不能换：applySkin() 内部会 removeProperty('--bg-r/g/b')，
                   必须**先切皮肤、再写底色**，否则底色刚写上就被皮肤清掉。 */
                state.skinIndex = p.skin;
                applySkin();
                applyBgColorRGB(p.bg);
                if(p.text) applyTextColor(p.text);
                applyLineHeight(p.lineHeight);
                state.fontSize = Math.min(CONFIG.MAX_FONT, Math.max(CONFIG.MIN_FONT, p.font));
                dom.novelContent.style.fontSize = state.fontSize + 'px';
                Storage.set(S.FONT, state.fontSize);
                applyReadingFont(p.family);
                if(dom.fontSelect) dom.fontSelect.value = p.family;
                if(dom.lineHeightSlider) dom.lineHeightSlider.value = p.lineHeight;
                if(dom.lineHeightValue) dom.lineHeightValue.textContent = Number(p.lineHeight).toFixed(1);
                /* 字号/行距变了 ⇒ 页高与行盒全变 ⇒ 分页必须重量，并留在当前阅读位置附近 */
                if(pagedActive()){ refreshPager(true); snapToCurrentPage(); }
                showHint(TT('已套用「' + p.zh + '」排版', 'Applied the "' + p.en + '" layout'));
                return true;
            }

            // 自动滚动（仅单行模式，速度映射为跑马灯时长）
            function refreshAutoScrollLabel(){ dom.autoScrollSpeedValue.textContent = state.autoScrollSpeed>0 ? state.autoScrollSpeed+'%' : (TT('关','Off')); }
            function setAutoScrollSpeed(speed){ state.autoScrollSpeed=speed; Storage.set(S.AUTO_SCROLL_SPEED,speed); applyAutoScrollSpeed(); }
            function applyAutoScrollSpeed(){ if(state.readMode!=='single') return;
                         if(state.autoScrollSpeed<=0){ dom.novelContent.style.animationPlayState='paused';
                         } else { dom.novelContent.style.animationDuration=Math.max(3,150/state.autoScrollSpeed).toFixed(1)+'s';
                         dom.novelContent.style.animationPlayState='running';
                         } refreshAutoScrollLabel();
                        }
            /* 🟥 V4.3.36：速度是 0（标签显示"关"）时不能靠快捷键把它"滚起来" ——
               原实现只看 playState、不看速度，于是用户以为关着的，一按空格内容就开始跑。 */
            function toggleAutoScroll(){ if(state.readMode!=='single') return;
                         if(state.autoScrollSpeed<=0){ showHint(TT('先把自动滚动速度调大于 0','Set a scroll speed above 0 first'));
                         return;
                         } const c=dom.novelContent;
                         c.style.animationPlayState = c.style.animationPlayState==='paused'?'running':'paused';
                         refreshAutoScrollLabel();
                        }
            function updateAutoScrollAvailability(){ const row=dom.autoScrollSpeed.closest('.slider-row');
                         const disabled=state.readMode!=='single';
                         if(row) row.classList.toggle('disabled',disabled);
                         if(disabled){ dom.autoScrollSpeed.value=0;
                         dom.autoScrollSpeedValue.textContent=(TT('关','Off'));
                         dom.novelContent.style.animationPlayState='paused';
                         } else { dom.autoScrollSpeed.value=state.autoScrollSpeed;
                         applyAutoScrollSpeed();
                        } }
            /* 🟥 V4.3.22：提示条支持「警告态」（红色）—— 用在「脱监没生效」这种必须让人看见的场合。
               警告多停 6 秒（普通提示 1.8 秒）：防护失效的信息一闪而过等于没说。 */
            /* 🟥 V4.3.50（R9-3）：hintToast **只有一个槽位** —— 后一条把前一条原地盖掉
               （`textContent=` 直接改写 + `clearTimeout` 重排）。于是"先发 ⚠️ 警告、
               收尾再发一句普通提示"的流程里，**警告从来没人看见过**。
               实测（`asar-src/_r9_rescue.js`）：导入阅读数据时先发出
               「⚠️ 有 N 项设置因存储空间不足未能写入」(warn)，紧接着两条普通提示
               （「已导入 N 条书源规则」「智能数据 · 导入完成」）把它盖掉 ——
               最终界面上只剩最后那条，用户以为一切正常、重启后才发现设置丢了。
               这正是 R9-1 / R9-2 长期没被发现的**直接原因**：报告失败的那条提示本身就看不见。
               规则：**普通 / note 级提示不得抢占正在展示的 warn**。
               ⚠️ 这**不是**"静默取消不重排"（硬规则 6）：被挡下的那条提示根本没被安排过，
                   warn 自己的定时器照常跑、到点照常收，之后一切恢复正常。

               🟥 让位窗必须是**有界的**（V4.3.50 第二次跑链时发现，差点拿新缺陷换旧缺陷）：
               初版写成"警告整个展示期（6 秒）内低级别一律让位"，结果 smoke2 的
               `vwEnableNotRed` 直接红了 —— 上一步 `failedBarOn`（「本章抓取失败」）的红字还在，
               紧接着"开启脱监"本该弹的那句普通提示被吞掉，屏上只剩上一条红字。
               真实的用户场景更糟：警告挂 6 秒期间用户去点任何别的按钮，
               那些动作**自己的反馈**（「已复制」「已开启」）会一起消失。
               所以窗口收到 **800ms**：同一次流程里的收尾提示是**亚秒级**紧跟的，
               800ms 足够覆盖它；而用户在秒级之后的主动操作不受影响。
               （已知的两处"收尾盖警告"另有 `importWarned` 守卫兜底，不依赖这个时间窗。） */
            const HINT_WARN_GUARD_MS = 800;
            let hintKindNow = null, hintWarnAt = 0;
            function showHint(text, kind){
                const t=document.getElementById('hintToast'); if(!t) return;
                const lvl = kind==='warn' ? 2 : (kind==='note' ? 1 : 0);
                /* 警告刚落下的这 800ms 内，低级别提示让位，等它自己收 */
                if(hintKindNow === 'warn' && lvl < 2 && (Date.now() - hintWarnAt) < HINT_WARN_GUARD_MS) return;
                hintKindNow = lvl===2 ? 'warn' : (lvl===1 ? 'note' : 'plain');
                if(lvl===2) hintWarnAt = Date.now();
                t.textContent=text;
                t.classList.toggle('warn', kind==='warn');
                t.classList.toggle('note', kind==='note');
                t.classList.add('show');
                clearTimeout(hintTimer);
                hintTimer=setTimeout(()=>{
                    t.classList.remove('show'); t.classList.remove('warn'); t.classList.remove('note');
                    hintKindNow = null;
                }, kind==='warn' ? 6000 : (kind==='note' ? 4200 : 1800));
            }

            // 目录
            function renderTOC(){ dom.tocPanel.innerHTML='';
                         if(!state.chapters.length){ syncTOCPanel();
                         return;
                         } state.chapters.forEach((ch,i)=>{ const div=document.createElement('div');
                                      div.className='toc-item';
                                      div.textContent=ch.title;
                                      const lv=ch.tocLevel||0;
                                      if(lv) div.style.paddingLeft=(9+lv*14)+'px';
                                        /* 📑 V4.3.74 层级缩进 */ div.onclick=()=>{ goTo(i);
                                      dom.tocPanel.classList.remove('open');
                                      };
                                      dom.tocPanel.appendChild(div);
                                      });
                         syncTOCPanel();
                        }
            function updateTOCActive(){ const items=dom.tocPanel.querySelectorAll('.toc-item'); items.forEach((el,i)=>el.classList.toggle('active',i===state.currentIndex)); sendPanelData('toc',{current:state.currentIndex}); updateAnnotCurrent(); }
            /* 🖍 V4.3.71：批注面板里的"当前章"标记要跟着换章走。仿 updateBookmarkStar ——
               每渲染一章都会被调到，所以只在**面板开着**时才推（不推白搭一笔 IPC）。 */
            function updateAnnotCurrent(){ if(typeof openPanelTypes!=='undefined' && openPanelTypes && openPanelTypes.has('annot')) syncAnnotPanel(); }


            // 重置
            async function resetAllSettings(){
                /* 🟥 V4.3.44（R3-2）：恢复默认会清掉当前书 —— 作废在途切书，别让残留的加载把书装回来 */
                bookSwitchToken++;
                const warnText = TT('确定要恢复默认设置吗？\n\n这会清空全部书籍章节、书签与阅读进度，不可撤销（执行前会自动备份一次）。\n书库（收藏的站点）与书源规则会保留。\n界面语言也会恢复为中文。',
                    'Reset all settings?\n\nThis clears all chapters, bookmarks and reading progress. A backup is taken automatically before resetting.\nYour site library and source rules are kept.\nThe interface language will also be reset to Chinese.');
                if(!confirm(warnText))return;
                // 清空前先备份，避免误点导致书籍正文永久丢失
                /* 🟥 V4.3.58：这里原先是个**空 catch**。saveBackup 自己已经兜住并出声（noteBackupFailed），
                   所以这条 catch 正常情况下永远不触发 —— 但正因如此，它一旦真触发就是没人知道的异常，
                   等于把将来的回归静默吞掉。补上日志，让它至少留下痕迹。 */
                try{ await saveBackup(); }catch(e){ logRenderError('pre-reset backup threw: '+((e&&e.message)||e)); }
                /* 🟥 V4.3.36：显式停朗读。原先只靠 renderChapter() 的"副作用"停（切章会停 TTS），
                   属隐式依赖 —— 万一哪天 renderChapter 不再停 TTS，重置后朗读会继续念出**已被清空的正文**。 */
                try{ ttsStop(); }catch(e){}
                // 🟥 V4.3.23：书库是**用户数据**，不是设置 —— 恢复默认不能删它（详见 USER_DATA_KEYS 处注释）
                /* V4.3.33b：DB.clearChapters 现在会真 reject（事务失败不再永久挂起），必须 await + 兜住，
   否则会变成未处理的 rejection，而且后续的重置逻辑会照跑、留下"半重置"状态。 */
                /* 🟥 V4.3.34：把**计量键**也排除掉。'frs'（累计阅读时长 / 连续天数）虽然登记在设置键表里，
                   但它属于"统计计量"，与 STAT_KEYS 同类 —— 恢复默认设置不该把用户的累计时长一起清零
                   （确认文案里也从来没提过会清它）。 */
                Object.keys(S).forEach(k=>{ if(USER_DATA_KEYS.indexOf(S[k]) >= 0) return; if(isStatKey(S[k])) return; localStorage.removeItem(S[k]); });
                // 🟥 'fsp'（滚动位置）不在 CONFIG.KEYS 里，得单独清，否则下次开机旧进度又被读回来
                /* 🟥 V4.3.45（R5-1）：下面这轮复位里**故意不再手写 modeIndicator / autoScrollSpeedValue**
                   两处文案（修前是硬编码中文 '📖 阅读' / '关'）——
                   ① 它们由收尾的 setLanguage()（→ applyLanguage() → refreshAutoScrollLabel()）
                      与 updateAutoScrollAvailability() 按当前语言写出来，再抄一遍就是第二份实现；
                   ② 硬编码在英文界面下会**露出中文**：实测「英文界面 → 恢复默认」后
                      modeIndicator 变成『📖 阅读』而其余控件仍是英文（由 _r5_lang_import.js 的 F 段抓到）。 */
                try{ localStorage.removeItem('fsp');
                             }catch(e){} try{ await DB.clearChapters();
                             }catch(e){ logRenderError('clearChapters failed: '+((e&&e.message)||e));
                             } state.fontSize=CONFIG.DEF_FONT;
                             state.textColor=CONFIG.DEF_TEXT_COLOR;
                             state.bgRgb=CONFIG.DEF_BG_RGB;
                             state.shadowIntensity=CONFIG.DEF_SHADOW;
                             state.windowOpacity=100;
                             state.textOpacity=100;
                             state.closeDelay=CONFIG.DEF_DELAY;
                             state.lineHeight=CONFIG.DEF_LINE_HEIGHT;
                             state.pageMargin=0;
                             state.autoContrast=false;
                             state.readMode='multi';
                             state.isFocusMode=false;
                             state.isGrayEnabled=true;
                             state.skinIndex=0;
                             state.bookmarks=[];
                             state.readingFont="'Consolas', 'Microsoft YaHei', monospace";
                             state.autoScrollSpeed=0;
                             state.allowSelect=false;
                             state.contentProtectOn=false;
                             state.protectWarn='';
                             state.protectWarnKind='';
                             state.protectVerdict=null;
                             state.shortcuts=Object.assign({}, DEFAULT_SHORTCUTS);
                             state.disguiseSkin='word';
                             /* 🆕 V4.3.86：恢复默认必须把**常驻伪装皮肤**也收掉。
                                否则用户点了"恢复默认设置"，存储键清了、外观却还伪装着 ——
                                窗口标题仍是「工作周报.docx」，人会以为软件坏了。 */
                             state.disguiseRead=false;
                             try{ applyDisguiseRead('word', true); }catch(e){}
                             dom.novelContent.style.fontSize=state.fontSize+'px';
                             applyTextColor(state.textColor);
                             applySkin();
                             applyShadow(state.shadowIntensity);
                             applyWindowOpacity(100);
                             applyLineHeight(state.lineHeight);
                             applyPageMargin(0);
                             dom.fontSelect.value=state.readingFont;
                             applyReadingFont(state.readingFont);
                             dom.autoScrollSpeed.value=0;
                             dom.autoContrastSwitch.classList.remove('active');
                             dom.contentWrapper.classList.remove('single-line');
                             dom.contentWrapper.classList.remove('paged');
                             dom.contentWrapper.classList.remove('two-col');
                             twoColOn=false;
                             twoColSwitchRatio=null;
                             dom.modeToggleBtn.classList.remove('active-btn');
                             dom.mainContent.classList.remove('focus-mode');
                             dom.grayToggleBtn.classList.add('toggle-on');
                             dom.grayToggleBtn.classList.remove('toggle-off');
                             setWindowOpacity(1);
                             updateSelectionStyle();
                             pushContentProtect();
                             setAutoScrollSpeed(0);
                             updateAutoScrollAvailability();
                             state.chapters=[];
                             state.currentIndex=0;
                             state.scrollPositions={};
                            state.annotations=[];
                /* 🟥 V4.3.33b：内存态必须跟着存储层一起复位。原先只 removeItem 了 localStorage 的
                   fbid/fbt，内存里的 bookId / sourceRule / originalContent 还指着旧书 ——
                   残留 originalContent 会让朗读（Ctrl+Shift+L）念出已经"重置"掉的正文（隐私泄露），
                   残留 bookId 会让 refreshTabs 继续把旧书标成当前标签。 */
                state.bookmarks=[]; state.bookId=null; state.bookTitle=''; state.sourceName='';
                /* 🟥 V4.3.45（R5-3，低危）：`bookAddedAt` 原先漏了。同一族字段在另一条路径
                   （reloadSettingsFromStorage · 导入数据，见下面的 state.bookAddedAt=null）里
                   是**显式复位**的，两条路径口径应当一致 —— 本仓已经因为"两条路径口径不一致"
                   栽过好几次（备份/清空、恢复默认/导入都是同款）。
                   影响面：本字段不直接驱动界面，残留只是"已经清空所有书"的状态下仍留着
                   "这本书何时加入"的时间戳（状态不自洽）；且下次落盘会被书元数据写入覆盖，
                   所以用户看不到错东西 —— 如实记作低危，不夸大。
                   抓它的判据不是人工清点，而是 _r5_reset_state.js 的
                   「两次不同起点必须收敛到同一终态」。 */
                state.bookAddedAt=null;
                state.sourceRule=null; state.sourceUrl=''; state.sourceUrls=[]; state.originalContent='';
                /* 🟥 V4.3.43（真缺陷 C）：下面这些字段原先**只清了 localStorage、没复位内存**，
                   在下次重启之前继续按旧值生效 —— 用户看到的就是「恢复默认没生效」：
                     · autoUpdate / autoUpdateMin → 自动追更定时器照跑
                     · fgWatchEnabled / fgWatchList → **前台监听观察器照跑、监听名单还留在内存里**（隐私相关）
                     · ttsRate / ttsVoice        → 朗读语速与音色不变
                     · autoPick / pickPointMode  → 工具栏取色开关仍显示「开」
                   收尾处还会把这些运行时按新值重新装配一遍（否则存储默认了、行为还是旧的）。 */
                state.autoPick=false; state.pickPointMode=false;
                state.autoUpdate=false; state.autoUpdateMin=60;
                state.fgWatchEnabled=false; state.fgWatchList='';
                /* 🆕 V4.3.53（R12-2）伴随模式也一并复位（关闭 / 空目标 / 前台判定 / 不贴边）——
                   它们在 CONFIG.KEYS 里登记过，存储层上面那轮 removeItem 已经清了，
                   这里补的正是**内存层**（V4.3.43 那批"只清存储不复位内存"的老坑）。 */
                state.companionEnabled=false; state.companionTarget='';
                state.companionMode='foreground'; state.companionEdge='off';
                state.companionTint=null;   // 🆕 V4.3.54：吸色联动回到"没表态"，下次开伴随重新联动
                /* 🆕 V4.3.55：生命周期联动复位回默认（开） */
                state.companionLinkClose=true; state.companionLinkMin=true;
                try{ applyCompanionTint(null); }catch(e){}   // 立刻褪色，别等 syncCompanionUI
                companionDockPaused=false; lastCompanionError='';
                state.ttsRate=1; state.ttsVoice='';
                try{ Storage.set(S.BOOKMARKS, []); }catch(e){}
                renderChapter(); renderTOC();
                /* 🟥 V4.3.43：内存复位之后必须把**依赖它们的运行时重新装配**，
                   否则就是"存储已恢复默认、行为还按旧的跑"（自动追更定时器 / 前台监听 /
                   工具栏与设置面板的回显都还指着旧值）。 */
                try{ setupAutoUpdate(); }catch(e){ logRenderError('reset autoUpdate failed: '+((e&&e.message)||e)); }
                try{ applyFgWatch(); }catch(e){ logRenderError('reset fgWatch failed: '+((e&&e.message)||e)); }
                try{ applyCompanion(); }catch(e){ logRenderError('reset companion failed: '+((e&&e.message)||e)); }
                try{ syncToolbarPanel(); }catch(e){}
                try{ syncSettingsPanel(); }catch(e){}
                /* 🐋 V4.3.53（R12-4）：顶栏 🐋 的两态与"贴边暂停"动作条也必须跟着复位
                   —— 它们读的正是上面刚清掉的那几个字段（规则 18：复位末尾要重新装配依赖它们的运行时）。 */
                try{ syncCompanionUI(); }catch(e){}
                /* 🆕 V4.3.54 修审查发现 2：'fct' 已被上面那轮 removeItem 清掉，但两窗 datalist
                   不重灌的话旧候选还挂在下拉里，选中一个还会把刚清掉的目标写回历史。 */
                try{ fillCompanionTargetDatalist(); }catch(e){}
                /* 🟥 V4.3.45（R5-1 真缺陷）：**语言也必须跟着复位**。
                   'flang' 登记在 CONFIG.KEYS 里，也不在 USER_DATA_KEYS / STAT_KEYS 任何排除名单中，
                   所以上面那轮 removeItem **已经把它删掉了**；可 currentLang 是个**内存变量**，
                   不在这里复位就变成「存储已回默认、界面还按旧语言跑」——
                   英文用户点完「恢复默认」界面仍是英文（看起来像没生效），直到**下次重启**才突然变中文。
                   为什么走 setLanguage(DEFAULT_LANG) 而不是手写 currentLang=… + applyLanguage()：
                   后者会多出一份与 setLanguage 平行的实现（它还要重拉主进程能力文案 + 同步两个独立小窗），
                   两份必然漂移 —— 这正是 V4.3.43 那批"只清存储不复位内存"缺陷的同款成因。
                   （它内部也会 sync 两个面板，与上面两句重复，但两处都是幂等重画，无害。） */
                try{ setLanguage(DEFAULT_LANG); }catch(e){ logRenderError('reset language failed: '+((e&&e.message)||e)); }
                /* 状态栏提示必须放在 setLanguage **之后**：applyLanguage() 会按当前状态重写 statusText
                   （此时 chapters 已清空 → t('noFile')），先写就会被顶掉、用户根本看不到「已重置」。
                   走 t('resetDone') 而不是硬编码：英文界面下原先会闪出一句中文「已重置」。 */
                dom.statusText.textContent=t('resetDone'); setTimeout(()=>dom.statusText.textContent=t('noFile'),1500); closeSettings(); syncHideShortcut(); }

            // 数据备份
            async function exportData(){
                await persistActiveBook();
                /* V4.3.33b：改用可分辨三态的 loadChaptersEx。
                   原先 `loadChapters()` 把「读取事务出错」与「本来就没有书」都返回 null，
                   导出时会静默写出 `chapters: null` —— 用户以为备份了整本书，其实里面是空的。 */
                const chRec = await DB.loadChaptersEx();
                const ch = (chRec.state === 'ok') ? chRec.chapters : [];
                if(chRec.state === 'locked') showHint(TT('⚠️ 本机密钥解不开这本书的正文，这份备份里将不含章节内容（书签与设置照常导出）','⚠️ Chapter text cannot be decrypted on this machine; this export will not contain it.'), 'warn');
                const data = { version:APP_VERSION, kind:'reader-data', settings:collectSettingsSnapshot(), bookmarks:state.bookmarks, scrollPositions:state.scrollPositions, chapters:ch, currentIndex:state.currentIndex, sources:[] };
                // 书源规则随数据一起导出，换机 / 重装不再丢书源
                try{ if(window.readerAPI && window.readerAPI.sourceListRules){ data.sources = (await window.readerAPI.sourceListRules()) || []; } }catch(e){ data.sources = []; }
                const text = JSON.stringify(data, null, 2);
                const fileName = '浅水鲸备份_' + Util.localDateKey() + '.json';
                const pwd = await askPassword(
                    TT('导出加密（可留空）','Encrypt export (optional)'),
                    TT('设置口令后，导入时需要输入相同口令；留空则导出明文','Set a password to encrypt this export. Leave empty for plain JSON.'),
                    TT('留空则不加密','Password (optional)')
                );
                if(pwd === null) return;
                let payload = data;
                if(pwd){
                    try { payload = await encryptExport(data, pwd); showHint(TT('已按口令加密','Encrypted with password')); }
                    catch(e){ showHint((TT('加密失败：','Encrypt failed: ')) + (e && e.message || e)); return; }
                }
                const outText = JSON.stringify(payload, null, 2);
                if(window.readerAPI && window.readerAPI.saveTextFile){
                    const r = await window.readerAPI.saveTextFile({ title: TT('导出阅读数据','Export reading data'), defaultPath:fileName, filters:[{name:'JSON', extensions:['json']}], content:outText });
                    showHint(r && r.canceled ? t('exportCanceled') : (r && r.error ? (t('importError')+r.error) : t('exportDone')));
                    return;
                }
                const blob = new Blob([outText], { type:'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href=url; a.download=fileName; a.click();
                URL.revokeObjectURL(url);
            }

            // 识别本软件自己的导出文件（书架 / 阅读数据），避免被当普通文档读成乱码
            async function applyImportedData(data){
                if(!data || typeof data !== 'object') return false;
                if(data.app === '浅水鲸书架' || Array.isArray(data.books)){
                    showHint(t('smartShelf') + ' · ' + t('smartImporting'));
                    const res = await importShelfBooks(data);
                    await refreshShelfPanel();
                    /* V4.3.37：把「跳过 / 失败」也说出来（上轮加了计数却没显示） */
                    if(!res || !res.ok){
                        showHint(t('smartShelf') + ' · ' + ((res && res.error) || 'failed'));
                    } else {
                        const extra = (res.skipped || res.failed) ? TT('（跳过 ' + (res.skipped||0) + '，失败 ' + (res.failed||0) + '）', ' (skipped ' + (res.skipped||0) + ', failed ' + (res.failed||0) + ')') : '';
                        showHint(t('smartShelf') + ' · ' + t('importDone') + ' ' + res.count + extra);
                    }
                    return true;
                }
                if(data.settings || data.bookmarks || data.chapters || data.chaptersEnc || data.kind === 'reader-data'){
                    showHint(t('smartData') + ' · ' + t('smartImporting'));
                    let needReload = false;
                    /* 🟥 V4.3.50（R9-3）：本流程里出现过的警告。收尾那句无条件的「导入完成」
                       会把警告**原地盖掉**，所以有警告时不再补发。 */
                    let importWarned = false;
                    // 📑 V4.3.29：同 restoreFromBackup —— 导入的旧模型书签统一升级成新模型
                    if(Array.isArray(data.bookmarks)) state.bookmarks = normalizeBookmarks(data.bookmarks);
                    if(data.scrollPositions && typeof data.scrollPositions === 'object') state.scrollPositions = data.scrollPositions;
                    /* 🛡 V4.3.38：旧版 chaptersEnc 用**机器密钥**加密，换机后解不开。
                       原先这里空 catch 静默跳过 —— 用户看不到任何说明，函数继续往下走并返回 true，
                       表现是「导入完成」但正文没变（与 restoreFromBackup 的 encLocked 口径不一致）。 */
                    let chapters = data.chapters;
                    let encLocked = false;
                    if((!chapters || !chapters.length) && data.chaptersEnc){
                        try{ const plain = await Crypto.decryptString(data.chaptersEnc); if(plain) chapters = JSON.parse(plain); else encLocked = true; }catch(e){ encLocked = true; }
                    }
                    if(encLocked){
                        showHint(TT('⚠️ 这份旧数据正文用本机密钥加密，这台电脑上解不开（换机/重装/换账户后会出现）。新导出已改为明文段，不受影响。','⚠️ This old export encrypts its chapters with a machine-bound key and cannot be opened here.'), 'warn');
                        return false;
                    }
                    /* 🛡 V4.3.43：导入的正文若带 `img` 字段（正常只有 PDF 备份才有），
                       在**入口**就按白名单剔一遍 —— 避免脏数据进了内存，又被 5 分钟一次的
                       自动备份写回磁盘、再被"恢复"回来。 */
                    chapters = sanitizeChapterImgs(chapters);
                    /* 🟥 V4.3.33b：导入阅读数据等于"换了一本书"，必须同时换掉 bookId。
                       原先只替换 state.chapters，bookId 还指着书架里那一本 ——
                       之后任何 persistActiveBook（保存书签 / 5 分钟自动备份 / 关标签）
                       都会拿导入的正文去覆盖书架里那本书，用户正在读的书被无提示换掉。
                       注意：`state.bookmarks` 是 1306 行刚从导入数据里装好的，**不要清**。 */
                    if(Array.isArray(chapters) && chapters.length){
                        if(state.bookId){ try{ await persistActiveBook(); }catch(e){} }
                        /* 🛡 V4.3.38：顺序改成「**先写正文、成功后再清身份**」。
                           原先先清 fbid/fbt 并落盘、再写正文（失败还被吞）——
                           正文写不进去时留下"身份已清、正文还是旧的"半状态：
                           一重启 restoreSession 就把**旧正文**挂到一个空 id 上。
                           现在正文失败即中止返回 false，此时唯一的持久化副作用是
                           persistActiveBook（保存的本就是**当前这本**，本来就该保存）。 */
                        invalidateInFlightLoads();   // 🟥 V4.3.47（R6-1）：导入是"用户主动换内容"，作废在途载入
                        state.chapters = chapters;
                        /* 🛡 V4.3.38：正文落盘失败必须**中止并如实报错**。
                           saveChapters 现在会真 reject，而原先只 log、函数继续走到最后返回 true ——
                           用户看到「导入完成」，正文其实根本没写进去（配额满 / 事务 abort 时）。 */
                        try{ await DB.saveChapters(chapters); }
                        catch(e){
                            logRenderError('import saveChapters failed: '+((e&&e.message)||e));
                            showHint(TT('⚠️ 正文写入失败（存储空间可能不足），本次导入已中止；设置与书架身份均未被改动。','⚠️ Failed to save chapters (storage may be full); import aborted.'), 'warn');
                            return false;
                        }
                        state.bookId = null; state.bookTitle = ''; state.sourceName = ''; state.bookAddedAt = null;
                        state.sourceRule = null; state.sourceUrl = ''; state.sourceUrls = []; state.originalContent = '';
                        /* 🟥 V4.3.34：内存复位必须**同步落盘**，否则等于没换。
                           只改 state 在本会话内看不出问题，一重启 restoreSession 就从 Storage.get(S.BOOK_ID)
                           把旧 id 拿回来，而 'chapters' 主存储里已经是导入的正文 ——
                           之后任何 persistActiveBook（保存书签 / 5 分钟自动备份 / 关标签）都会拿导入的正文
                           去覆盖 id 指向的那本旧书，跟这次修复想要的效果正好相反。 */
                        Storage.set(S.BOOK_ID, null); Storage.set(S.BOOK_TITLE, '');
                    }
                    if(typeof data.currentIndex === 'number' && data.currentIndex >= 0 && data.currentIndex < state.chapters.length) state.currentIndex = data.currentIndex;
                    else state.currentIndex = 0;
                    /* 🛡 V4.3.38：设置写入**下沉到正文之后**。
                       原先设置先写、正文后写：正文失败时用户看到的是
                       「设置已经换了、正文还是旧的」，而且函数照样返回成功。 */
                    if(data.settings && typeof data.settings === 'object'){
                        // 🟥 同 restoreFromBackup：不覆盖计量数据与「只对本机有效」的缓存；V4.3.33 起还要求键必须已登记
                        /* 🟥 V4.3.34：两处口径统一 ——
                           ① 'fbid'/'fbt'（"当前正在读哪一本"）描述的是**本机现场**，不是作品数据：
                              跟着导入写进来会让 bookId 指向源机器的书架条目，而正文已经是导入的这一份，
                              下次启动 restoreSession 就会拿导入的正文去覆盖 id 指向的那本书。
                           ② 改走 Storage.set —— 裸 setItem + 空 catch 会把配额超限静默吞掉，
                              用户看到"导入完成"其实一项都没写进去。 */
                        let setFail = 0;
                        Object.entries(data.settings).forEach(([k,v])=>{
                            if(isStatKey(k) || isMachineKey(k) || !isKnownSettingKey(k)) return;
                            if(k === S.BOOK_ID || k === S.BOOK_TITLE) return;
                            /* 🟥 V4.3.37：'fupd'（更新清单地址）/ 'ffb'（反馈地址）是**指向外部的地址**，
                               属本机配置。跟着备份导入 = 一份被篡改的备份就能把更新源指向攻击者
                               （用户点「检查更新」看到伪造的版本号与恶意下载链接）。不值得为跨机方便冒这个险。 */
                            if(k === S.UPDATE_URL || k === S.FEEDBACK_URL) return;
                            // 🟥 V4.3.45（R4-2）：同恢复备份 —— 键名白名单之外再过一遍**值域**
                            if(!Storage.set(k, normalizeSettingValue(k, v))) setFail++;
                        });
                        if(setFail){ importWarned = true; showHint((TT('⚠️ 有 ','⚠️ ')) + setFail + (TT(' 项设置因存储空间不足未能写入',' settings could not be written (storage full)')), 'warn'); }
                        needReload = true;
                    }
                    /* 书源规则随数据一起导入（同名规则跳过，不覆盖本机已有配置）
                       🟥 V4.3.50（R9-2）：**返回值原先被整个丢掉**、`added` 无条件 ++、
                       整段还包在空 catch 里。主进程 `source:add-rule` 早在 V4.3.33 就会在
                       写盘失败（磁盘满 / 目录不可写）时返回 `{ok:false, error}`，也会在校验不过时返回
                       `{ok:false}` —— 渲染层全不看，于是用户看到「已导入 N 条书源规则」，
                       实际一条都没进去（重启后书源面板还是空的）。
                       与 `importShelfBooks`（V4.3.36/37 的 count/failed/skipped 三态）**同族不同命**：
                       同一类"批量导入"，那头做全了，这头漏了 —— 与 R7-1「ms-settings 两个入口只修了一个」同型。 */
                    if(Array.isArray(data.sources) && data.sources.length && window.readerAPI && window.readerAPI.sourceAddRule){
                        let added = 0, addFailed = 0;
                        try{
                            const exist = (window.readerAPI.sourceListRules ? (await window.readerAPI.sourceListRules()) : null) || [];
                            const names = new Set(exist.map(r=>r && r.name));
                            for(const rule of data.sources){
                                if(!rule || !rule.name || names.has(rule.name)) continue;
                                try{
                                    const rr = await window.readerAPI.sourceAddRule(rule);
                                    if(rr && rr.ok === true){ added++; names.add(rule.name); }
                                    else { addFailed++; logRenderError('sourceAddRule rejected: '+((rr && rr.error) || 'unknown')); }
                                }catch(e){ addFailed++; logRenderError('sourceAddRule threw: '+((e&&e.message)||e)); }
                            }
                        }catch(e){ logRenderError('import source rules failed: '+((e&&e.message)||e)); }
                        if(added && addFailed){ importWarned = true;
                                     showHint(TT('⚠️ 已导入 ', '⚠️ Imported ') + added + TT(' 条书源规则，另有 ' + addFailed + ' 条写入失败（磁盘空间或权限问题，详见日志）', ' source rules; ' + addFailed + ' failed to write (disk space or permissions; see the log)'), 'warn');
                                    }
                        else if(addFailed){ importWarned = true; showHint(TT('⚠️ ' + addFailed + ' 条书源规则导入失败（磁盘空间或权限问题，详见日志）', '⚠️ ' + addFailed + ' source rules failed to import (disk space or permissions; see the log)'), 'warn'); }
                        else if(added) showHint((TT('已导入 ','Imported ')) + added + (TT(' 条书源规则',' source rules')));
                    }
                    if(needReload) reloadSettingsFromStorage();
                    /* 🟥 V4.3.34：书签的单一真源是顶层 data.bookmarks，不是 settings 里的 'fb'。
                       reloadSettingsFromStorage() 会执行 state.bookmarks = Storage.get(S.BOOKMARKS, ...)，
                       把上面已 normalize 好的新模型又覆盖回 localStorage 里的原始值（未升级的老模型）。 */
                    if(Array.isArray(data.bookmarks)){ state.bookmarks = normalizeBookmarks(data.bookmarks); Storage.set(S.BOOKMARKS, state.bookmarks); }
                    renderChapter(); renderTOC();
                    /* 🟥 V4.3.50（R9-3）：有警告时**不再补发**这句 ——
                       它是无条件的普通提示，会把上面好不容易发出的 ⚠️ 原地盖掉
                       （`showHint` 是单槽位覆盖式），而且"导入完成"在有失败项时本身就是误导。
                       警告展示期内 showHint 已经会自动让位，这里再补一道"根本不发"，
                       两道一起才能同时挡住"自己被盖"和"将来新增的普通提示把它盖掉"。 */
                    if(!importWarned) showHint(t('smartData') + ' · ' + t('importDone'));
                    return true;
                }
                return false;
            }

            // 导入设置后原地重新应用，避免整页重载
            function reloadSettingsFromStorage(){
                state.fontSize = Storage.get(S.FONT, CONFIG.DEF_FONT);
                state.textColor = Storage.get(S.TEXT_COLOR, CONFIG.DEF_TEXT_COLOR);
                state.bgRgb = Storage.get(S.BG_RGB, CONFIG.DEF_BG_RGB);
                state.shadowIntensity = Storage.get(S.SHADOW, CONFIG.DEF_SHADOW);
                state.windowOpacity = Storage.get(S.WINDOW_OPACITY, 100);
                state.textOpacity = Storage.get(S.TEXT_OPACITY, 100);
                state.readMode = Storage.get(S.READ_MODE, 'multi');
                state.closeDelay = normalizeSettingValue(S.DELAY, Storage.get(S.DELAY, CONFIG.DEF_DELAY));
                state.autoContrast = Storage.get(S.AUTO_CONTRAST, false);
                state.lineHeight = Math.max(CONFIG.MIN_LINE_HEIGHT, Storage.get(S.LINE_HEIGHT, CONFIG.DEF_LINE_HEIGHT));
                state.pageMargin = normalizeSettingValue(S.PAGE_MARGIN, Storage.get(S.PAGE_MARGIN, 0));
                state.readingFont = Storage.get(S.READING_FONT, "'Consolas', 'Microsoft YaHei', monospace");
                state.autoScrollSpeed = Storage.get(S.AUTO_SCROLL_SPEED, 0);
                state.allowSelect = Storage.get(S.ALLOW_SELECT, false);
                state.contentProtectOn = Storage.get(S.CONTENT_PROTECT, false);   // 🛡 默认关闭
                state.autoPick = Storage.get(S.AUTO_PICK, false);
                state.skinIndex = Storage.get(S.SKIN, 0);
                /* V4.3.37：与默认表合并后再用 —— 一份被篡改/残缺的 fsc 不至于让
                   后面所有 `ks===sc.xxx` 判断全部失效（改键失效且无从察觉）。 */
                /* 🛡 V4.3.38：归一只"补缺失键"是不够的。`{prev:null}` 这种**键在、值为空**的残缺 fsc
                   （fsc 是已登记键，可随导入数据写进来）会原样覆盖默认值：
                     · 所有 `ks===sc.xxx` 判断全部失效 → 页面内快捷键集体失灵；
                     · syncHideShortcut 把空键位交给主进程 → 先是 unregister 掉**好用**的全局热键，
                       再 register('') 失败 → 本会话彻底没有全局 SOS 键。
                   只接受**非空字符串**。 */
                state.shortcuts = (function(base, saved){
                    const out = Object.assign({}, base);
                    if(saved && typeof saved === 'object'){
                        Object.keys(base).forEach(function(k){
                            const v = saved[k];
                            if(typeof v === 'string' && v) out[k] = v;
                        });
                    }
                    return out;
                })(DEFAULT_SHORTCUTS, Storage.get(S.SHORTCUTS, {}));
                state.bookmarks = Storage.get(S.BOOKMARKS, state.bookmarks);
                currentLang = Storage.get('flang', currentLang);
                normalizeSkinIndex();
                loadCustomCss();
                dom.novelContent.style.fontSize = state.fontSize + 'px';
                applySkin();
                applyTextColor(state.textColor);
                applyShadow(state.shadowIntensity);
                applyWindowOpacity(state.windowOpacity);
                applyLineHeight(state.lineHeight);
                applyPageMargin(state.pageMargin);
                applyTextOpacity(state.textOpacity);
                applyReadingFont(state.readingFont);
                dom.contentWrapper.classList.toggle('single-line', state.readMode === 'single');
                dom.contentWrapper.classList.toggle('paged', state.readMode === 'paged');
                if(state.readMode !== 'paged') dropTwoCol();
                dom.modeToggleBtn.classList.toggle('active-btn', state.readMode !== 'multi');
                dom.fontSelect.value = state.readingFont;
                /* 🛥 V4.3.86：滑块表示透明度，位置要取 100-opacity */
                dom.windowOpacitySlider.value = String(100 - state.windowOpacity);
                dom.textOpacitySlider.value = String(100 - state.textOpacity);
                dom.shadowIntensitySlider.value = state.shadowIntensity;
                dom.lineHeightSlider.value = state.lineHeight;
                dom.autoContrastSwitch.classList.toggle('active', state.autoContrast);
                dom.grayToggleBtn.classList.toggle('toggle-on', state.isGrayEnabled);
                dom.grayToggleBtn.classList.toggle('toggle-off', !state.isGrayEnabled);
                dom.pickerBtn.classList.toggle('toggle-on', state.pickPointMode);
                applyLanguage();
                updateAutoScrollAvailability();
                syncHideShortcut();
                pushContentProtect();   // V4.3.18：把持久化的脱离监控状态交给主进程（V4.3.19 起默认关闭）
                syncCapabilities();     // V4.3.19：问主进程要本机防截屏能力，供如实提示
            }

            async function importData(){
                if(!window.readerAPI || !window.readerAPI.openTextFile){ showHint(t('importError') + 'unsupported'); return; }
                const f = await window.readerAPI.openTextFile({ title: TT('导入阅读数据','Import reading data'), filters:[{name:'JSON', extensions:['json']}] });
                if(!f || f.canceled) return;
                if(f.error){ showHint(t('importError') + f.error); return; }
                try{
                    const parsed = JSON.parse(f.content);
                    const dec = await maybeDecryptImport(parsed, TT('阅读数据','reading data'));
                    if(dec.canceled) return;
                    if(dec.error){ showHint(dec.error); return; }
                    const ok = await applyImportedData(dec.data);
                    if(!ok) showHint(t('importError') + 'unrecognized');
                }catch(err){ showHint(t('importError') + (err && err.message || err)); }
            }

            // 自定义CSS
            async function importCustomCss(){
                if(!window.readerAPI || !window.readerAPI.openTextFile){ showHint(t('importError') + 'unsupported'); return; }
                const f = await window.readerAPI.openTextFile({ title: TT('导入自定义 CSS','Import custom CSS'), filters:[{name:'CSS', extensions:['css']}] });
                if(!f || f.canceled) return;
                if(f.error){ showHint(t('importError') + f.error); return; }
                applyCustomCss(f.content);
                showHint(TT('自定义 CSS 已应用','Custom CSS applied'));
            }
            /* 🛡 V4.3.38：自定义 CSS 是**可被外部数据写到的第二个注入点**。
               `fcss`（CUSTOM_CSS）是**已登记**键，会随「导入数据 / 恢复备份」原样写进来，
               而 V4.3.36 的 stripRemoteCss 只在主题那条路径上用 —— 这条完全不过滤。
               一份被篡改的备份塞 `@import url(https://attacker/x.css)` 即可外联追踪 / 覆盖整页外观。
               这里单点收口：任何来源的自定义 CSS 在注入前都剥掉远程引用。 */
            function applyCustomCss(css){
                let out = String(css == null ? '' : css), removed = 0;
                try{
                    const strip = window.ReaderThemes && window.ReaderThemes.stripRemoteCss;
                    if(strip){ const r = strip(out); out = r.css; removed = (r.removed | 0); }
                }catch(e){}
                document.getElementById('customStyleContainer').textContent = out;
                Storage.set(S.CUSTOM_CSS, out);
                if(removed){ try{ showHint((TT('已移除自定义 CSS 中的 ','Removed ')) + removed + (TT(' 处远程引用（不允许外链）',' remote reference(s)')), 'warn'); }catch(e){} }
            }
            function clearCustomCss(){document.getElementById('customStyleContainer').textContent='';localStorage.removeItem(S.CUSTOM_CSS);}
            function loadCustomCss(){const css=Storage.get(S.CUSTOM_CSS,'');if(css)applyCustomCss(css);}

            // 皮肤
            // 旧版有 5 套皮肤，现在只保留黑 / 白两种：索引 4 视为深色，其余归为浅色
            function normalizeSkinIndex(){ const v = Number(state.skinIndex) || 0; state.skinIndex = (v === 4) ? 1 : 0; }
            function nextSkin(){
                state.skinIndex=(state.skinIndex+1)%CONFIG.SKINS.length;
                applySkin();
                showHint(CONFIG.SKINS[state.skinIndex]==='dark'
                    ? (TT('已切换到深色皮肤','Dark theme applied'))
                    : (TT('已切换到浅色皮肤','Light theme applied')));
            }
            function applySkin(){
                const skin=CONFIG.SKINS[state.skinIndex] || 'light';
                dom.mainContent.style.removeProperty('--bg-r');
                dom.mainContent.style.removeProperty('--bg-g');
                dom.mainContent.style.removeProperty('--bg-b');
                document.body.className=document.body.className.split(' ').filter(c=>!c.startsWith('skin-')).join(' ');
                document.body.classList.add('skin-'+skin);
                Storage.set(S.SKIN,state.skinIndex);
                dom.novelContent.style.color = skin==='dark' ? '#e8e8e8' : state.textColor;
                if(state.autoContrast) applyAutoContrast();
            }

            // 工具栏（独立子窗口）
            /* 🖍 V4.3.71：批注交互。
               浮层（annot-pop）**用 JS 建、不进 index.html** —— 它带用户笔记文本，
               走 innerHTML 就要自己转义；全程 createElement + textContent 更省心，
               也避免往静态 HTML 里塞一坨只有运行时才用的结构。 */
            let annPending = null;    // 待创建的选区 {start,end,text}
            let annEditingId = null;  // 正在编辑的批注 id（null = 新建模式）
            function buildAnnotPop(){
                if(dom.annotPop) return dom.annotPop;
                const pop = document.createElement('div');
                pop.id = 'annotPop'; pop.className = 'annot-pop';
                const row = document.createElement('div'); row.className = 'row';
                ANN_COLORS.forEach(c=>{
                    const b = document.createElement('button');
                    b.className = 'dot dot-' + c; b.type = 'button';
                    b.setAttribute('data-color', c);
                    b.title = c;
                    b.addEventListener('click', ()=>commitAnnotPop(c));
                    row.appendChild(b);
                });
                const ta = document.createElement('textarea');
                ta.className = 'note'; ta.rows = 2;
                ta.placeholder = TT('笔记（可留空）', 'Note (optional)');
                const btns = document.createElement('div'); btns.className = 'btns';
                const del = document.createElement('button');
                del.type = 'button'; del.className = 'danger';
                del.textContent = TT('删除', 'Delete');
                del.addEventListener('click', ()=>{
                    if(annEditingId && removeAnnotation(annEditingId)) showHint(TT('已删除', 'Deleted'));
                    hideAnnotPop();
                });
                const cancel = document.createElement('button');
                cancel.type = 'button';
                cancel.textContent = TT('取消', 'Cancel');
                cancel.addEventListener('click', hideAnnotPop);
                btns.appendChild(del); btns.appendChild(cancel);
                pop.appendChild(row); pop.appendChild(ta); pop.appendChild(btns);
                dom.mainContent.appendChild(pop);
                dom.annotPop = pop;
                return pop;
            }
            function positionAnnotPop(rect){
                const pop = buildAnnotPop();
                pop.classList.add('show');
                const base = dom.mainContent.getBoundingClientRect();
                const w = pop.offsetWidth || 250, h = pop.offsetHeight || 110;
                let left = rect.left + rect.width / 2 - w / 2 - base.left;
                let top = rect.top - h - 10 - base.top;
                if(top < 6) top = rect.bottom + 10 - base.top;
                const maxL = dom.mainContent.clientWidth - w - 6;
                const maxT = dom.mainContent.clientHeight - h - 6;
                pop.style.left = Math.round(Math.max(6, Math.min(maxL, left))) + 'px';
                pop.style.top = Math.round(Math.max(6, Math.min(maxT, top))) + 'px';
            }
            function hideAnnotPop(){
                if(dom.annotPop) dom.annotPop.classList.remove('show');
                annPending = null; annEditingId = null;
                try{ const s = window.getSelection(); if(s) s.removeAllRanges(); }catch(e){}
            }
            function openAnnotPopForSelection(sel){
                buildAnnotPop();
                annPending = sel; annEditingId = null;
                const ta = dom.annotPop.querySelector('textarea');
                if(ta) ta.value = '';
                const del = dom.annotPop.querySelector('.btns .danger');
                if(del) del.style.display = 'none';
                let rect = null;
                try{ const s = window.getSelection(); if(s && s.rangeCount) rect = s.getRangeAt(0).getBoundingClientRect(); }catch(e){}
                if(!rect || (!rect.width && !rect.height)) rect = { left: 40, top: 60, width: 0, height: 0, bottom: 60 };
                positionAnnotPop(rect);
            }
            function openAnnotPopForAnnotation(ann, rect){
                buildAnnotPop();
                annPending = null; annEditingId = ann.id;
                const ta = dom.annotPop.querySelector('textarea');
                if(ta) ta.value = ann.note || '';
                const del = dom.annotPop.querySelector('.btns .danger');
                if(del) del.style.display = '';
                if(!rect) rect = { left: 40, top: 60, width: 0, height: 0, bottom: 60 };
                positionAnnotPop(rect);
            }
            function commitAnnotPop(color){
                const ta = dom.annotPop && dom.annotPop.querySelector('textarea');
                const note = ta ? ta.value : '';
                if(annEditingId){
                    if(updateAnnotation(annEditingId, { note: note, color: color })) showHint(TT('批注已更新', 'Annotation updated'));
                } else if(annPending){
                    const a = addAnnotation(annPending, color, note);
                    if(a) showHint(TT('已加批注', 'Annotation added'));
                }
                hideAnnotPop();
            }
            function setupAnnotations(){
                /* 选完就弹浮层。setTimeout 0：等浏览器把 selection 落定（mouseup 时偶发还没更新）。 */
                dom.novelContent.addEventListener('mouseup', function(){
                    setTimeout(function(){
                        const sel = selectionOffsets();
                        if(!sel || sel.end - sel.start < 1) return;
                        openAnnotPopForSelection(sel);
                    }, 0);
                });
                /* 点已有批注 → 编辑。
                   🟥 必须用**捕获阶段** + stopPropagation：分页模式下内容区自己有个 click
                   （点左右半屏翻页），冒泡阶段抢不过它 —— 点批注会顺手翻一页。 */
                document.addEventListener('click', function(e){
                    const t = e.target;
                    const mk = (t && t.closest) ? t.closest('mark.ann') : null;
                    if(!mk || !dom.novelContent.contains(mk)) return;
                    e.stopPropagation();
                    e.preventDefault();
                    const ann = findAnnotation(mk.getAttribute('data-ann-id'));
                    if(!ann) return;
                    openAnnotPopForAnnotation(ann, mk.getBoundingClientRect());
                }, true);
                document.addEventListener('mousedown', function(e){
                    if(!dom.annotPop || !dom.annotPop.classList.contains('show')) return;
                    if(dom.annotPop.contains(e.target)) return;
                    hideAnnotPop();
                });
                window.addEventListener('keydown', function(e){
                    if(e.key === 'Escape' && dom.annotPop && dom.annotPop.classList.contains('show')) hideAnnotPop();
                });
            }
            function setupToolbar(){ dom.toggleToolbarBtn.addEventListener('click',()=>togglePanel('toolbar')); }

            // 设置面板（独立子窗口）
            function closeSettings(){ closePanelType('settings'); }
            function setupSettings(){ dom.settingsBtn.addEventListener('click',()=>togglePanel('settings')); }

            // 搜索
            let searchResults=[],searchIndex=-1;
            function clearSearchHighlights(){const content=dom.novelContent;if(!content)return;content.querySelectorAll('mark.search-highlight').forEach(node=>{const parent=node.parentNode;const text=document.createTextNode(node.textContent);parent.replaceChild(text,node);parent.normalize();});}
            /* 🟥 V4.3.45（R4-1）：大小写无关查找**不能**拿"折叠后的下标"去切"原文"。
               `'İ'(U+0130).toLowerCase()` 是两个码元（'i' + U+0307），`'ẞ'`、连字 `'ﬀ'` 同理：
               只要命中位置**之前**出现过这类字符，折叠串里的下标就比原文下标大 →
               `splitText` 抛 IndexSizeError → 整段高亮循环中断，章内搜索**一次都命中不了**（计数停在 0/0）。
               这里建一张「折叠下标 → 原文下标」映射表，命中区间一律换算回原文再切。
               注：Final_Sigma 那种"整串转换才不同"的情况只改内容不改长度，逐字符长度之和恒等于
               `s.toLowerCase().length`，所以这张表的下标对齐是可靠的。 */
            function foldIndexMap(s){
                const f=s.toLowerCase(); const map=[];
                for(let i=0;i<s.length;i++){ const n=s.charAt(i).toLowerCase().length; for(let k=0;k<n;k++) map.push(i); }
                map.push(s.length);
                if(map.length!==f.length+1){
                    /* 理论上不可达。真到了就退回恒等映射 —— 宁可高亮位置略偏，也不能让下标越界
                       把整段搜索打断（那正是 R4-1 的表现）。 */
                    for(let i=0;i<=f.length;i++) map[i]=Math.min(i,s.length);
                    map.length=f.length+1;
                }
                return {f:f, map:map};
            }
            function ciFindAll(text, lowerQ, limit){
                const out=[]; if(!text||!lowerQ) return out;
                const m=foldIndexMap(text); let from=0;
                for(;;){
                    const at=m.f.indexOf(lowerQ, from);
                    if(at===-1) break;
                    const last=m.map[at+lowerQ.length-1];
                    out.push([m.map[at], (last===undefined ? text.length : last+1)]);
                    if(limit && out.length>=limit) break;
                    from=at+lowerQ.length;
                }
                return out;
            }
            function highlightTextNodes(q){searchResults=[];searchIndex=-1;const lower=q.toLowerCase();if(!lower){dom.searchCount.textContent='0/0';return;}const walker=document.createTreeWalker(dom.novelContent,
                         NodeFilter.SHOW_TEXT);const nodes=[];let n;while((n=walker.nextNode()))nodes.push(n);for(const node of nodes){const hits=ciFindAll(node.nodeValue||'',
                         lower);if(!hits.length)continue;
                        /* 🟥 从右往左切：靠左的命中区间不会被后面的 splitText 改动下标 */let cur=node;
                                    for(let i=hits.length-1;i>=0;i--){cur.splitText(hits[i][1]);
                                    const mid=cur.splitText(hits[i][0]);
                                    const mark=document.createElement('mark');
                                    mark.className='search-highlight';
                                    mark.textContent=mid.textContent;
                                    mid.parentNode.replaceChild(mark,mid);
                                    searchResults.unshift(mark);
                                    }}if(searchResults.length){searchIndex=0;
                                    dom.searchCount.textContent=`1/${searchResults.length}`;
                                    searchResults[0].scrollIntoView({block:'center'});
                                    }else{dom.searchCount.textContent='0/0';
                                    }}
            function performSearch(query){clearSearchHighlights();dom.searchCount.textContent='0/0';if(!query.trim()||!state.chapters.length)return;highlightTextNodes(query.trim());}
            function navigateSearch(dir){if(!searchResults.length)return;
                        searchIndex=(searchIndex+dir+searchResults.length)%searchResults.length;
                        dom.searchCount.textContent=`${searchIndex+1}/${searchResults.length}`;
                        const m=searchResults[searchIndex];
                        if(m){m.scrollIntoView({block:'center'});
                        m.style.background='#fbbf24';
                        setTimeout(()=>{m.style.background='';
                        },300);
                        }}
            function toggleSearch(){const bar=dom.searchBar,input=dom.searchInput;
                        if(bar.classList.contains('active')){bar.classList.remove('active');
                        clearSearchHighlights();
                        searchResults=[];
                        searchIndex=-1;
                        dom.searchCount.textContent='0/0';
                        input.value='';
                        return;
                        }bar.classList.add('active');
                        input.focus();
                        input.select();
                        }
            function setupSearch(){dom.searchInput.addEventListener('input',e=>performSearch(e.target.value));
                        dom.searchPrev.addEventListener('click',()=>navigateSearch(-1));
                        dom.searchNext.addEventListener('click',()=>navigateSearch(1));
                        dom.searchClose.addEventListener('click',toggleSearch);
                        document.addEventListener('keydown',e=>{if(e.key==='Escape'&&dom.searchBar.classList.contains('active'))toggleSearch();
                        });
                        }

            // 文件加载
            /* 📚 真源在 scripts/exts.js（主进程与渲染层共用）。这里兜底用的短清单只在
               exts.js 没加载到的极端情况下生效，避免直接白屏。 */
            const SUPPORTED_EXTS=(window.READER_EXTS&&window.READER_EXTS.length)?window.READER_EXTS:['.txt','.md','.docx','.epub','.pdf'];
            /* 🟥 V4.3.43：文本类清单也从 exts.js 的**分类视图**取，这里不再抄第三份。
               原先 loadFiles 内联了一份 19 项清单，与 exts.js 之间没有任何门禁对齐 ——
               改 exts.js 加了新文本扩展名，它会「能被选中、打开后空白」。 */
            const TEXT_EXTS=(window.READER_EXTS&&window.READER_EXTS.text)?window.READER_EXTS.text:['.txt','.md','.log','.json','.js','.py','.css','.html','.xml','.yaml','.yml','.csv','.ts','.jsx','.tsx','.vue','.sh','.bat','.ps1'];
            function isSupported(fn){const e=fn.toLowerCase();return SUPPORTED_EXTS.some(ext=>e.endsWith(ext));}
            /* 🛡 V4.3.43 修复（真缺陷 A）：原先这里是一段自造的 ['UTF-8','GBK','big5'] 解码循环 ——
               没有 BOM 判定、没有无 BOM UTF-16 判定、没有「中文反证」投票。实测 Big5 繁体与
               UTF-16 中文（含带 BOM）的 txt 打开即乱码，而同一批字节交主进程真源全部解对
               （对照证据：work/_v443_decode_gap.js）。V4.3.31 已把编码判定单点化到
               scripts/encoding.js，但它是 CommonJS、只被主进程 require，渲染层够不到，
               所以走 IPC 借真源。兜底保留 UTF-8 尽力解，守住「永不抛」。 */
            async function decodeLocalText(buf){
                try{
                    const r=await window.readerAPI.decodeText(new Uint8Array(buf));
                    if(r&&r.ok&&typeof r.text==='string')return r.text;
                }catch(e){ logRenderError('decodeText failed: '+((e&&e.message)||e)); }
                return new TextDecoder('UTF-8',{fatal:false}).decode(buf);
            }
            /* 🆕 V4.3.67（批 1 收尾·方案 2）：本地书「重新绑定文件」。
               用途：本地文件被更新（下了新版 / 重新导出）后，用新内容替换这本书，
               **bookId / 书名 / 书签 / 进度全保留** —— 这是"删掉重加"做不到的（后者会换 id、丢书签）。
               第二个参数 preselected 是给探针用的注入点：给了就不弹系统文件对话框，
               探针才能走完整数据流（否则只能测到"点了会弹窗"）。
               取消选择时**什么都不做**：现代 Chromium 对 input[type=file] 会发 cancel 事件，
               老版本只发 change（files 为空），两条都兜住。 */
            async function startRebindLocalFile(bookId, preselected){
                let meta = null;
                try{ meta = await DB.getBook(bookId); }catch(e){ logRenderError('rebind: getBook failed: '+((e&&e.message)||e)); }
                if(!meta){ showHint(TT('这本书已不在书架里','This book is no longer on the shelf')); return false; }
                let file = preselected || null;
                if(!file){
                    if(!dom.rebindInput){
                        const inp = document.createElement('input');
                        inp.type='file'; inp.style.display='none';
                        inp.accept = SUPPORTED_EXTS.join(',');
                        document.body.appendChild(inp);
                        dom.rebindInput = inp;
                    }
                    const inp = dom.rebindInput;
                    inp.value='';                       // 允许重复选同一个文件（否则 change 不触发）
                    file = await new Promise(function(res){
                        const done = function(f){ inp.removeEventListener('change', onCh); inp.removeEventListener('cancel', onCancel); res(f || null); };
                        const onCh = function(){ done(inp.files && inp.files[0]); };
                        const onCancel = function(){ done(null); };
                        inp.addEventListener('change', onCh);
                        inp.addEventListener('cancel', onCancel);
                        inp.click();
                    });
                    if(!file) return false;             // 用户取消 —— 什么都不做
                }
                await loadFiles([file], { rebind: {
                    id: meta.id, title: meta.title, kind: meta.kind || 'local',
                    sourceName: meta.sourceName, format: meta.format,
                    sourceUrl: meta.sourceUrl, sourceUrls: meta.sourceUrls,
                    bookmarks: meta.bookmarks, currentIndex: meta.currentIndex,
                    addedAt: meta.addedAt
                }});
                return true;
            }
            async function loadFiles(fileList,
                         opts){const rebind=(opts&&opts.rebind)||null;
                                     if(!fileList.length)return;
                                     dom.loadingOverlay.classList.add('active');
                                     const loaded=[];
                                     let firstFileName='';
                                     let firstFormat='';
                                     let firstCover='';
                                     for(const file of fileList){if(!isSupported(file.name))continue;
                                     try{const buf=await file.arrayBuffer();
                                     const ext=file.name.split('.').pop().toLowerCase();
                                     let name=file.name.replace(/\.[^.]+$/,''),content='';
                                     if(!firstFileName){firstFileName=cleanBookTitle(name)||name;
                                     firstFormat=ext;
                                     }if(TEXT_EXTS.indexOf('.'+ext)>=0){content=await decodeLocalText(buf);
                                     loaded.push({title:name,content});
                                     }else if(ext==='docx'){const r=await mammoth.extractRawText({arrayBuffer:buf});
                                     loaded.push({title:name,content:r.value});
                                     }else if(ext==='epub'){
  /* 📚 EPUB（V4.3.27 重写）：旧实现有四处错，导致「导入 EPUB 必然失败」——
     ① epub.js 依赖 JSZip 解容器，vendor 里没带 → Archive 抛 "JSZip lib not loaded"（已在 index.html 补引入）
     ② ePub(buf) 只构造不解包，必须显式 book.open(buf,'binary')，否则 await book.ready 永远挂住（既不成功也不报错）
     ③ spine.map / book.get 这两个方法在 epub.js 里根本不存在 → 正确写法是 spine.spineItems + book.load(href)
     ④ 章节名以前写死「第N章」，现改从导航文件取真实标题（拿不到才退回第N章）
     以上四条均由 _epub_api_probe.js 实测确认，勿凭印象改回。 */
  const u8 = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  if(!firstCover){ try{ firstCover = await extractEpubCover(buf); }catch(e){} }   // 🖼 V4.3.66
  const book = ePub(u8);
  await book.open(u8, 'binary');
  await book.ready;
  /* 📑 V4.3.74：目录层级。旧实现把 nav.toc 压平成一张 href→标题表（同 href 后写覆盖），
     嵌套 nav（部/节、卷/章）的层级信息全丢，目录一律平铺。现按文档顺序递归展开
     （epub.js 树形：item.subitems），给每条记录 level；同一文件被多条引用时取
     **层级最浅**的一条当章名（通常是章/部标题，而不是被小节覆盖）。
     tocLevel 挂在章节对象上随渲染走（主窗 + 面板同步缩进）；TXT/DOCX/PDF 无此字段不受影响。 */
  const tocEntries = [];
  try{
    const nav = await Promise.resolve(book.loaded.navigation);
    (function walk(list, level){
      (list || []).forEach(function(it){
        const h = String((it && it.href) || '').split('#')[0];
        const label = it && it.label ? String(it.label).trim() : '';
        /* 只收带 href 的条目（纯分组节点不对应任何文件，进不了章节，但它的子项层级照记） */
        if(h && label) tocEntries.push({ href: h, label: label, level: Math.min(level, 3) });
        if(it && Array.isArray(it.subitems) && it.subitems.length) walk(it.subitems, level + 1);
      });
    })((nav && nav.toc) || [], 0);
  }catch(e){}
  const items = (book.spine && book.spine.spineItems) || [];
  const out = [];
  for(let i=0;i<items.length;i++){
    const raw = String(items[i].href||'');
    const relPath = raw.split('#')[0];
    const base = relPath.split('/').pop();
    let doc = null;
    try{ doc = await book.load(relPath); }catch(e){}
    let text = '';
    if(doc && doc.documentElement){
      const nodes = doc.querySelectorAll('p,h1,h2,h3,h4,blockquote,li');
      text = nodes.length ? Array.from(nodes).map(function(n){ return n.textContent.trim(); }).filter(Boolean).join('\n') : (doc.documentElement.textContent||'');
    }
    /* 🛡 V4.3.78：匹配四级回退，防跨目录同名文件张冠李戴 —— 旧逻辑只按文件名匹配，
       `text/ch1.xhtml` 的 nav 条目会同时命中 `other/ch1.xhtml` 的 spine 项（都endsWith('/ch1.xhtml')），
       章名/层级可能挂到别的文件头上。顺序：完整路径全等 → 路径尾缀 → 文件名全等 → 文件名尾缀。 */
    let best = null;
    for(let k=0;k<tocEntries.length;k++){
      const e = tocEntries[k];
      const tier = (e.href === relPath) ? 0 : (e.href.endsWith('/'+relPath)) ? 1 : (e.href === base) ? 2 : (e.href.endsWith('/'+base)) ? 3 : 9;
      if(tier === 9) continue;
      if(!best || tier < best.tier || (tier === best.tier && e.level < best.level)) best = { e: e, tier: tier };
    }
    const hit = best ? best.e : null;
    out.push({ title: hit ? hit.label : ('第'+(i+1)+'章'), tocLevel: hit ? hit.level : 0, content: String(text).trim() });
  }
  const filtered = out.filter(function(c){ return (c.content||'').length > 10; });
  loaded.push(...filtered);   /* 📑 V4.3.74：整对象透传（旧写法 map 只挑 title/content，会把 tocLevel 丢掉） */
}else if(ext==='pdf'){
  // 🖼 PDF 原样加载（V4.3.3，按用户要求）：不再抽取/重排文字 —— 重排会打乱原版式。
  // 每页用 pdf.js 渲染成高清位图，原版字体/排版/插图原样保留；一章 = 一页。
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  for(let pi=1;pi<=pdf.numPages;pi++){
    const page=await pdf.getPage(pi);
    const vp0=page.getViewport({scale:1});
    const scale=Math.min(2, Math.max(1.25, 1200/vp0.width));   // 目标宽≈1200px，钳在 1.25~2 倍
    const vp=page.getViewport({scale});
    const canvas=document.createElement('canvas');
    canvas.width=Math.floor(vp.width); canvas.height=Math.floor(vp.height);
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,canvas.width,canvas.height);   // PDF 画布透明，JPEG 需垫白底
    await page.render({canvasContext:ctx, viewport:vp}).promise;
    if(pi===1 && !firstCover){ try{ firstCover = drawCoverToDataUrl(canvas); }catch(e){} }   // 🖼 V4.3.66：首页即封面
    loaded.push({title:'第'+pi+'/'+pdf.numPages+'页', img:canvas.toDataURL('image/jpeg',0.82), content:''});
  }
}}catch(e){console.error('解析失败',file.name,e);loaded.push({title:file.name+' (解析失败)',content:'错误: '+e.message});}}dom.loadingOverlay.classList.remove('active');if(!loaded.length){alert(t('noSupport'));return;}
// 🛠 重复导入去重（V4.3.3）：同名字+同章节数的书已在书架 → 不再重复入库，直接切到已有记录。
// batchTitle 与入库时的书名同源（首个文件名 / 文件名 等N章），保证查重口径一致。
const batchTitle = firstFileName ? (loaded.length>1 ? (firstFileName+' 等'+loaded.length+'章') : firstFileName) : (loaded[0]?loaded[0].title:'本地文件');
let dupBook=null;
/* 🆕 V4.3.67：重新绑定模式下**必须跳过查重** —— 否则会"找到"这本书自己（同名同章数），
   直接打开旧内容，新选的文件白选了。 */
if(!rebind){ try{ dupBook=(await DB.listBooks({lite:true})).find(b=>(b.title||'')===batchTitle&&(b.chapterCount||0)===loaded.length); }catch(e){} }
if(dupBook){ try{ const full=await DB.getBook(dupBook.id); if(full){ await loadBookIntoReader(full); showHint(TT('「'+batchTitle+'」已在书架，已直接打开（不重复添加）', '"'+batchTitle+'" is already on the shelf — opened it directly')); return; } }catch(e){} }
/* 🟥 V4.3.33b：加载本地文件同样是"换书"，必须**先把上一本落盘、再清掉跟书走的运行时状态**。
   原先这里直接覆盖 state.chapters，后果有两个：
     ① 旧书自上次落盘以来的进度（currentIndex / scrollPositions）随内存丢掉（最多丢 5 分钟）；
     ② 旧书的 sourceRule / sourceUrl / bookmarks 全串到这本**本地书**身上 ——
        最恶劣的一条是自动追更会拿本地书的 id + 上一本的 sourceRule 去抓网络章节并 concat 进来，
        把网络正文混进本地文件内容里（跨源污染，且用户看不出）。
   注意 loadBookIntoReader 本来就做对了，这里是漏的两处入口之一。 */
try{ await persistActiveBook(); }catch(e){ logRenderError('pre-switch persist failed: '+((e&&e.message)||e)); }
state.bookmarks=[]; state.sourceRule=null; state.sourceUrl=''; state.sourceUrls=[]; state.originalContent='';
try{ Storage.set(S.BOOKMARKS, []); }catch(e){}
invalidateInFlightLoads();   // 🟥 V4.3.47（R6-1）：打开本地文件同样是"用户主动换内容"，作废在途载入
/* 🟥 V4.3.71：换书必须把书签与批注一起清空 —— V4.3.70 及更早只清了 scrollPositions，
   于是"打开 B 书"会把 A 书的书签/批注写进 B 的 meta（assignBookIdentity 换了 id，数据却是旧的）。
   rebind 分支随后会把它们按原书重新赋回来，所以这里先清是安全的。 */
state.chapters=loaded;state.currentIndex=0;state.scrollPositions={};state.bookmarks=[];state.annotations=[];
try{ Storage.set(S.BOOKMARKS, []); Storage.set(S.ANNOTATIONS, []); }catch(e){}renderChapter();renderTOC();dom.statusText.textContent=`${t('loaded')} ${loaded.length} ${t('chapters')}`;
if(rebind){
  /* 🆕 V4.3.67：重新绑定 —— 内容换成新的，**身份与阅读进度不许丢** */
  state.bookId=rebind.id; state.bookTitle=rebind.title||batchTitle;
  state.bookKind=rebind.kind||'local'; state.bookFormat=firstFormat||rebind.format||'';
  state.sourceName=rebind.sourceName||'本地';
  state.bookAddedAt=rebind.addedAt||new Date().toISOString();
  state.bookmarks=Array.isArray(rebind.bookmarks)?rebind.bookmarks.slice():[];
  state.sourceUrl=rebind.sourceUrl||'';
  state.sourceUrls=Array.isArray(rebind.sourceUrls)?rebind.sourceUrls.slice():[];
  state.bookCover=firstCover||'';                    /* 新封面；取不到就按新书名重画 */
  state.currentIndex=Math.min(Math.max(0,Number(rebind.currentIndex)||0),Math.max(0,loaded.length-1));
  state.scrollPositions={};                          /* 章节可能变了，旧滚动位置不再可信 */
  state.annotations = Array.isArray(rebind.annotations) ? normalizeAnnotations(rebind.annotations) : [];
  try{ Storage.set(S.BOOKMARKS, state.bookmarks); Storage.set(S.ANNOTATIONS, state.annotations); }catch(e){}
  renderChapter(); renderTOC();
  showHint(TT('已重新绑定：'+loaded.length+' 章，进度与书签已保留','Rebound: '+loaded.length+' chapters, progress and bookmarks kept'));
}else{
  await assignBookIdentity(batchTitle,'本地','local',firstFormat); /* 🖼 V4.3.66：真封面优先（块注释，不能用 // —— 这行后面还有语句） */ if(firstCover) state.bookCover=firstCover;
} try{ await DB.saveChapters(loaded); }catch(e){ logRenderError('saveChapters failed: '+((e&&e.message)||e)); } await persistActiveBook(); saveBackup();}
            // 拖入 / 打开文件时先识别本软件自己的导出文件，避免被当成普通文档显示成乱码
            async function sniffOwnExport(file){
                if(!/\.json$/i.test(file.name || '')) return false;
                try{
                    const text = await file.text();
                    const parsed = JSON.parse(text);
                    if(isEncryptedExport(parsed)){
                        const dec = await maybeDecryptImport(parsed, file.name);
                        if(dec.canceled) return true;
                        if(dec.error){ showHint(dec.error); return true; }
                        return (await applyImportedData(dec.data)) === true;
                    }
                    return (await applyImportedData(parsed)) === true;
                }catch(e){ return false; }
            }
            async function handleIncomingFiles(fileList){
                const files = Array.from(fileList || []);
                if(!files.length) return;
                const rest = [];
                for(const f of files){
                    const handled = await sniffOwnExport(f);
                    if(!handled) rest.push(f);
                }
                if(rest.length) await loadFiles(rest);
            }
            async function restoreSession(){
                /* 🟥 V4.3.24：先分辨「没有书」和「有书但打不开」。后者以前会一路静默到
                   显示「还没有打开文件」，用户以为书丢了 —— 其实数据还在 IndexedDB 里。 */
                const r = await DB.loadChaptersEx();
                if(r.state === 'locked'){ noteChaptersLocked(); dom.statusText.textContent = TT('🔒 本机有书籍正文，但解不开（详见提示）','🔒 Chapters locked'); return false; }
                if(r.state === 'error'){ try{ logRenderError('local chapters corrupt'); }catch(e){} showHint(TT('⚠️ 本地书籍数据损坏，可尝试用「导入数据」恢复','⚠️ Local chapter data is corrupt; try Import data'), 'warn'); }
                const saved = (r.state === 'ok') ? r.chapters : null;
                if(saved&&Array.isArray(saved)&&saved.length){
                    state.chapters=saved;
                    state.bookId=Storage.get(S.BOOK_ID,null);
                    state.bookTitle=Storage.get(S.BOOK_TITLE,'');
                    /* 🟥 V4.3.34：从书架 meta 补回书源字段。
                       原先这条入口只恢复了 chapters/进度，sourceRule/sourceUrl 留在 IndexedDB 的 books 里
                       没人取 —— 于是"开机自动恢复"的网络书变成"无来源"：点「重新抓取本章」只会得到
                       "没有书源规则"，自动追更也会跳过它。换书路径 loadBookIntoReader 本来就恢复了这几个
                       字段，只有"开机恢复"这一条漏了。 */
                    try{
                        const meta = state.bookId ? await DB.getBook(state.bookId) : null;
                        if(meta){
                            state.sourceRule = meta.sourceRule || null;
                            state.sourceUrl = meta.sourceUrl || '';
                            state.sourceUrls = (Array.isArray(meta.sourceUrls) && meta.sourceUrls.length) ? meta.sourceUrls.slice() : (meta.sourceUrl ? [meta.sourceUrl] : []);
                            if(!state.sourceName) state.sourceName = meta.sourceName || '';
                        }
                    }catch(e){ logRenderError('restore source meta failed: '+((e&&e.message)||e)); }
                    state.currentIndex=Storage.get(S.READER_IDX,0);
                    if(state.currentIndex>=saved.length)state.currentIndex=0;
                    try{const sp=localStorage.getItem('fsp');if(sp)state.scrollPositions=JSON.parse(sp);}catch{}
                    renderChapter(); renderTOC();
                    // 状态栏显示当前章节，恢复提示只作为短暂轻提示，不再覆盖章节信息
                    const ch = state.chapters[state.currentIndex];
                    dom.statusText.textContent = `📌 ${ch ? ch.title : ''} · ${state.currentIndex+1}/${state.chapters.length}`;
                    showHint(`${t('restoredToast')} · ${saved.length} ${t('chapters')}`);
                    return true;
                }
                return false;
            }

            // 吸色（主进程屏幕取样）：自动吸色 + 可见取色点
            let autoPickTimer=null, pickInFlight=false;
            let autoPickWasRunning=false;
            let pickPreviewHex='';   /* V4.3.97：拖动暂停吸色移除后遗留的 0 读 0 写声明已删 */
            async function pickColor(silent){
                if(state.isHidden || pickInFlight) return;
                // 专注模式下取色提示一律静默：提示条会破坏沉浸、也暴露窗口正在做什么（隐蔽第一）。
                // 🟥 必须声明在 try 外：catch 是独立块作用域，写进 try 里会 ReferenceError（V4.2.2 冒烟抓到过一次）
                const quiet = !!silent || !!state.isFocusMode;
                if(!window.readerAPI || !window.readerAPI.pickColor){ if(!quiet) showHint(t('pickUnsupported')); return; }
                pickInFlight=true;
                try{
                    /* 🎨 V4.3.86：把圆点的**屏幕 x** 传给主进程 —— 采样点就落在圆点正下方，
                       不再像一前那样永远采窗口中线（那是“圆点指着 A、实际采 B”的根因）。 */
                    const anc = pickAnchorXY();
                    const hex=await window.readerAPI.pickColor({ x: Math.round(window.screenX + anc.x) });
                    if(hex){
                        pickPreviewHex = hex; applyAutoPickColor(hex, !silent); showPickAnchor(hex);
                        // 后台定时取色不再弹提示，否则提示条会一直压在取样点上
                        // persist=!silent：循环路径(silent=true)只刷界面不落盘；手动单发才落盘
                        if(!quiet) showHint((TT('已吸取 ','Picked '))+hex);
                    }
                    else if(!state.autoPick && !quiet){ showHint(t('pickNoColor')); }
                }catch(err){ if(!state.autoPick && !quiet) showHint(t('pickFail')+(err && err.message || err)); }
                finally{ pickInFlight=false; }
            }

            // 取样点：窗口内可见的一个小胶囊，标明当前（或即将）吸取的颜色。
            // 位置固定在窗口下沿正中——也正是主进程实际取样的位置。
            // 刻意不跟随鼠标移动：跟着鼠标跑会让人觉得这个点在自己乱动。
            /* 🆕 V4.3.54：pickPaused 已随「拖动暂停吸色」逻辑一起删除（desktopCapturer 遗留，
               理由见拖动 mousedown 处注释）。V4.3.34 修的「失焦后循环停摆」因此整块消失。 */
            let pickAnchorCache = null;   // 非专注模式下算好的锚点；进专注模式后沿用，位置不跳
            function pickAnchorXY(){
                // 专注模式布局全变，.btn-group 的位置会跟着变。
                // 用户要求：「进入专注模式后，取色点位置不要移动，透明化就好」——
                // 所以专注模式沿用进入前算好的位置，只做边界收敛防止点跑到窗外。
                if(state.isFocusMode && pickAnchorCache){
                    return { x: Math.max(14, Math.min(window.innerWidth - 14, pickAnchorCache.x)),
                             y: Math.max(14, Math.min(window.innerHeight - 14, pickAnchorCache.y)) };
                }
                // 取样点与主窗底部「上一章 / 下一章」那一行平行（用户要求上移，别贴在窗口最下沿）。
                // 取那一行的垂直中心；取不到就退回原来的窗口下沿。
                /* 🎨 V4.3.86：默认贴在窗口**下沿**居中 ——
                   主进程采样点在窗口下沿再往下 12px，圆点放在下沿时两者只隔一个边框，
                   视觉上才是同一个点；旧实现圆点在底部按钮行中心、采样在窗外，对不上。
                   拖动过的位置存成比例，这里换回像素并夹在窗内。 */
                let x = window.innerWidth / 2;
                let y = window.innerHeight - 14;
                const pos = state.pickDotPos;
                if(pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)){
                    x = pos.x * window.innerWidth;
                    y = pos.y * window.innerHeight;
                } else {
                    try{
                        const row = document.querySelector('.btn-group');
                        if(row){
                            const r = row.getBoundingClientRect();
                            if(r && r.height) y = Math.min(window.innerHeight - 14, r.top + r.height / 2);
                        }
                    }catch(e){}
                }
                const p = { x: Math.max(14, Math.min(window.innerWidth - 14, x)),
                            y: Math.max(14, Math.min(window.innerHeight - 14, y)) };
                if(!state.isFocusMode) pickAnchorCache = p;
                return p;
            }
            function placePickPreview(x, y){
                const el = dom.pickPreview;
                if(!el) return;
                const cx = Math.max(14, Math.min(window.innerWidth - 14, x || 0));
                const cy = Math.max(14, Math.min(window.innerHeight - 14, y || 0));
                el.style.left = cx + 'px';
                el.style.top = cy + 'px';
            }
            function setPickPreview(hex, x, y, tag){
                const el = dom.pickPreview;
                if(!el) return;
                const toast = document.getElementById('hintToast');
                if(!hex){
                    el.classList.remove('on');
                    if(toast) toast.classList.remove('lifted');
                    return;
                }
                const sw = el.querySelector('.swatch');
                const hx = el.querySelector('.hex');
                const tg = el.querySelector('.tag');
                if(sw) sw.style.background = hex;
                if(hx) hx.textContent = hex;
                if(tg) tg.textContent = tag || '';
                placePickPreview(x, y);
                el.classList.add('on');
                // 专注模式下取色点淡一些，别抢视线（用户要求「透明化就好」）
                el.style.opacity = state.isFocusMode ? '0.45' : '';
                if(toast) toast.classList.add('lifted');
            }
            // 把点摆在固定的下沿锚点：手动取色点与自动吸色共用同一处，位置恒定不变
            function showPickAnchor(hex){
                if(!hex || state.pickDotHidden){ setPickPreview(null); return; }
                const p = pickAnchorXY();
                setPickPreview(hex, p.x, p.y, (TT('取样点','sample')));
            }
            // 取色点与自动吸色共用同一条取样循环：取的都是「窗口下沿正下方」那块桌面背景色
            // （主进程 pickScreenColor() — 窗口下沿正下方 12px 的中点）。
            // 刻意不再用 pickColorAt(鼠标坐标)：那取的是鼠标指哪儿的颜色，跟窗口所在的背景无关。
            /* 🆕 V4.3.54（吸色优化）轮询间隔 1500ms → 300ms —— 这就是用户感知的「两次吸色之间
               缓冲很长」的元凶。依据：GetPixel 侧车服务单次实测 48ms、主进程最大阻塞 11ms
               （见 main.js 取色服务注释，实测数据 _pickperf.js），300ms 节奏下主进程占用率 ~4%，
               完全可承受；pickInFlight 防重入保证慢请求（≤500ms 超时）时下一个 tick 自动让位，
               不会堆积。拖动时颜色每 300ms 跟一拍，视觉上即「实时跟随」。 */
            const PICK_INTERVAL_MS = 300;
            function startPickLoop(){
                stopPickLoop();
                pickColor(true);
                if(pickPreviewHex) showPickAnchor(pickPreviewHex);
                autoPickTimer = setInterval(()=>pickColor(true), PICK_INTERVAL_MS);
            }
            function stopPickLoop(){
                if(autoPickTimer){ clearInterval(autoPickTimer); autoPickTimer = null; }
            }
            function togglePickPoint(){
                state.pickPointMode = !state.pickPointMode;
                dom.pickerBtn.classList.toggle('toggle-on', state.pickPointMode);
                if(state.pickPointMode){
                    /* 🎨 V4.3.86：用户显式打开模式就一定要看得见圆点 */
                    state.pickDotHidden = false;
                    showHint(t('pickPointOn'));
                    showPickAnchor(pickPreviewHex || '#888888');   // 先占位，下一次取样立刻换成真实背景色
                    startPickLoop();
                }
                else {
                    setPickPreview(null);
                    showHint(t('pickPointOff'));
                    if(state.autoPick) startPickLoop(); else stopPickLoop();
                }
                syncToolbarPanel();   // 让工具栏小窗的「吸色」按钮立刻反映开/关状态
            }
            /* 🎨 V4.3.86：取色圆点的**隐藏/显现**。
               为什么要单独一个：原来只能用快捷键把整个“取色点模式”关掉，
               而开着**自动吸色**时关掉模式会立刻重开循环 → 圆点又被画回来，
               表现就是“快捷键藏不住这个点”。现在隐藏是独立状态，
               只管“看得见/看不见”，不动两个模式的开关。 */
            function togglePickDot(){
                state.pickDotHidden = !state.pickDotHidden;
                if(state.pickDotHidden){
                    setPickPreview(null);
                    showHint(t('pickDotHidden'));
                } else {
                    if(!state.pickPointMode && !state.autoPick) togglePickPoint();   // 两个都关着，显示就意味着开启
                    else showPickAnchor(pickPreviewHex || '#888888');
                    showHint(t('pickDotShown'));
                }
                syncToolbarPanel();
            }
            /* 🎨 V4.3.86：圆点可拖动。拖完把位置存成**窗口比例**（不存像素），
               这样拉伸/全屏/进专注模式都不会让它跑到窗外。
               拖完立即按新位置采一次，用户能马上看到“这个点下面是什么颜色”。 */
            function setupPickDotDrag(){
                const el = dom.pickPreview;
                if(!el) return;
                let dragging = false, offX = 0, offY = 0;
                el.addEventListener('mousedown', function(e){
                    if(!state.pickPointMode && !state.autoPick) return;
                    if(e.button !== 0) return;
                    const r = el.getBoundingClientRect();
                    offX = e.clientX - (r.left + r.width / 2);
                    offY = e.clientY - (r.top + r.height / 2);
                    dragging = true;
                    el.classList.add('dragging');
                    e.preventDefault(); e.stopPropagation();
                }, true);
                window.addEventListener('mousemove', function(e){
                    if(!dragging) return;
                    const x = Math.max(14, Math.min(window.innerWidth - 14, e.clientX - offX));
                    const y = Math.max(14, Math.min(window.innerHeight - 14, e.clientY - offY));
                    placePickPreview(x, y);
                    e.preventDefault();
                }, true);
                window.addEventListener('mouseup', function(e){
                    if(!dragging) return;
                    dragging = false;
                    el.classList.remove('dragging');
                    const r = el.getBoundingClientRect();
                    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                    state.pickDotPos = { x: +(cx / Math.max(1, window.innerWidth)).toFixed(4),
                                         y: +(cy / Math.max(1, window.innerHeight)).toFixed(4) };
                    try{ Storage.set(S.PICK_DOT_POS, state.pickDotPos); }catch(e2){}
                    pickAnchorCache = { x: cx, y: cy };
                    pickColor(true);
                    e.preventDefault(); e.stopPropagation();
                }, true);
            }

            function setupPickPoint(){
                // 取色点模式：点一下应用颜色。
                // 🔴 以前在 mousedown 的 capture 阶段 preventDefault + stopPropagation，
                //    把「专注模式按住左键拖动窗口」的手势整个吃掉了 —— 用户实测：
                //    「开了吸色/取色点，专注模式的窗口移动不了」。
                // 修法：拖动手势优先 —— 拖动条件的 mousedown 一律放行；
                //       改在 mouseup 时判断屏幕坐标几乎没动（=单击）再应用颜色。
                let downScreen = null;
                // 🟥 V4.3.22：Ctrl+左键拖动已删除，所以「是否算拖动」不再看 ctrlKey
                const isDragStart = e => (state.isFocusMode && !state.allowSelect);
                document.addEventListener('mousedown', e=>{
                    if(!state.pickPointMode || e.button !== 0){ downScreen=null; return; }
                    // 点在按钮/输入框上：既不拖动也不应用颜色，让控件正常工作
                    if(e.target && e.target.closest && e.target.closest('button,input,select,textarea,a')){ downScreen=null; return; }
                    /* 🎨 V4.3.86：点在取色圆点上不能当“应用颜色”——那是拖动手势的起点 */
                    if(e.target && e.target.closest && e.target.closest('#pickPreview')){ downScreen=null; return; }
                    downScreen = { x: e.screenX, y: e.screenY };
                    if(isDragStart(e)) return;   // 让位给拖动，不拦截
                    downScreen = null;            // 非拖动路径直接在按下时应用
                    e.preventDefault();
                    if(pickPreviewHex){
                        applyAutoPickColor(pickPreviewHex);
                        showHint((TT('已应用 ','Applied '))+pickPreviewHex);
                    }
                }, true);
                document.addEventListener('mouseup', e=>{
                    if(!state.pickPointMode || e.button !== 0 || !downScreen) return;
                    const moved = Math.abs(e.screenX - downScreen.x) + Math.abs(e.screenY - downScreen.y);
                    downScreen = null;
                    if(moved > 6) return;         // 拖动过的 mouseup 不算单击
                    if(pickPreviewHex){
                        applyAutoPickColor(pickPreviewHex);
                        showHint((TT('已应用 ','Applied '))+pickPreviewHex);
                    }
                }, true);
            }
            function toggleAutoPick(){
                state.autoPick=!state.autoPick;
                dom.pickerBtn.classList.toggle('toggle-on',state.autoPick);
                Storage.set(S.AUTO_PICK,state.autoPick);
                if(state.autoPick){
                    showHint(TT('自动吸色已开启，将持续融入背景','Auto color pick enabled'));
                    startPickLoop();
                } else {
                    // 取色点还开着的话循环要继续 —— 两者共用同一个取样定时器
                    if(state.pickPointMode) startPickLoop(); else stopPickLoop();
                    setPickPreview(null);
                    showHint(TT('自动吸色已关闭','Auto color pick disabled'));
                }
                syncToolbarPanel();   // 让工具栏小窗的「吸色」按钮立刻反映开/关状态
            }

            // ===== 独立子窗口（品字型面板）桥接 =====
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
            // 开关与名单存在本地，真正干活的是主进程里那个常驻 PowerShell 观察器
            // （main.js setForegroundWatch）：命中的程序成为前台就把主窗藏起来，离开再恢复。
            function applyFgWatch(){
                if(window.readerAPI && window.readerAPI.setFgWatch){
                    window.readerAPI.setFgWatch({ enabled: state.fgWatchEnabled, list: state.fgWatchList });
                }
            }
            function toggleFgWatch(){
                state.fgWatchEnabled = !state.fgWatchEnabled;
                Storage.set(S.FG_WATCH, state.fgWatchEnabled);
                applyFgWatch();
            }
            function setFgWatchList(v){
                state.fgWatchList = String(v || '');
                Storage.set(S.FG_WATCH_LIST, state.fgWatchList);
                applyFgWatch();
            }
            /* 🟥 V4.3.49（R8-1）：观察器的**真实状态**回传处理。
               主进程原先在"拿不到观察器"时只写一行日志（且实测落盘成 `{}`），
               渲染层的 `ffw` 仍是 true、设置面板开关照样点亮 ——
               自动隐身 / 远控检测静默失效，用户以为自己在受保护。
               现在：失败出声（主窗提示 + 设置面板内联），恢复时自动清掉。 */
            function applyFgWatchStatus(st){
                if(!st || typeof st !== 'object') return;
                if(st.ok){ lastFgWatchError = ''; }
                else {
                    const why = {
                        'spawn-failed': t('fgFailSpawn'),
                        'child-error': t('fgFailChild'),
                        'exited': t('fgFailExited'),
                        'empty-list': t('fgFailEmpty'),
                        'unsupported-platform': t('fgFailPlatform')
                    }[String(st.reason || '')] || t('fgFailGeneric');
                    const tail = (st.detail && /spawn-failed|child-error|build-script/.test(String(st.reason || '')))
                        ? ('（' + String(st.detail).slice(0, 120) + '）') : '';
                    lastFgWatchError = t('fgFailTitle') + why + tail;
                    /* 隐藏态（前台监听的典型场景）下主窗提示看不见，面板那条才是兜底 —— 两条都发 */
                    showHint(lastFgWatchError, 'warn');
                }
                /* 这条回传可能在 init() 走完之前到达（订阅与 applyFgWatch 都在脚本解析期），
                   面板同步失败不能连累主流程。 */
                try{ syncSettingsPanel(); }catch(e){ logRenderError('fg status sync failed: ' + ((e && e.message) || e)); }
            }
            // 先订阅再 apply —— 否则主进程对本次 setFgWatch 的首个回传会丢
            if(window.readerAPI && window.readerAPI.onFgWatchStatus) window.readerAPI.onFgWatchStatus(applyFgWatchStatus);
            applyFgWatch();

            // ===== 伴随模式（V4.3.53 R12-2）：跟着目标程序一起出现 / 一起收起 + 贴边跟随 =====
            /* 定案的形态（2026-10-12）：**形态2 + 拖走即暂停**
               —— 阅读器贴到目标窗口边上跟着走；你把它拖走后就停在原地（设置里「贴回去」恢复）；
               目标关掉 → 收托盘待命（不退出），目标再打开 → 自动回来。
               🚫 形态3（真塞进别的进程内部）不做：那会牺牲防截屏/透明/取色，正是点名要保的。
               真正干活的是主进程里那个常驻 PowerShell 观察器（main.js startCompanionWatch）。 */
            function applyCompanion(){
                if(window.readerAPI && window.readerAPI.setCompanion){
                    window.readerAPI.setCompanion({
                        enabled: state.companionEnabled,
                        list: state.companionTarget,
                        mode: state.companionMode,
                        edge: state.companionEdge,
                        tint: state.companionTint === true,   // 🆕 V4.3.54：null/false 都算关（null 只是"没表态"）
                        /* 🆕 V4.3.55（生命周期联动）：关/最小化联动开关随配置下发 */
                        linkClose: state.companionLinkClose === true,
                        linkMin: state.companionLinkMin === true
                    });
                }
            }
            function toggleCompanion(){
                state.companionEnabled = !state.companionEnabled;
                Storage.set(S.COMPANION, state.companionEnabled);
                /* 🆕 V4.3.54（吸色联动）：开跟随时若用户从没表态过吸色（null），联动开一次并落账
                   —— 用户原话「选择跟随模式后，应联动开启对应的吸色模式」。
                   显式 false（用户关过）绝不擅自重开。 */
                if(state.companionEnabled && state.companionTint === null){
                    state.companionTint = true;
                    Storage.set(S.COMPANION_TINT, true);
                }
                if(!state.companionEnabled){ try{ applyCompanionTint(null); }catch(e){} }   // 关伴随立刻褪色
                applyCompanion();
                if(state.companionEnabled && !String(state.companionTarget || '').trim()){
                    showHint(t('companionNeedTarget'), 'warn');   // 开了却没填目标 → 观察器起不来，必须说破
                } else {
                    showHint(state.companionEnabled ? t('companionOn') : t('companionOff'));
                }
                try{ syncCompanionUI(); }catch(e){}
            }
            /* 🆕 V4.3.53（建议 1）「最近用过的目标程序」历史（fct，上限 5）。
               与面板的 fsrchist 同一套思路：主窗与面板是同源 localStorage（跨窗口共用），
               所以两个窗口各自的 <datalist id="dlCompanionTarget"> 都从这份键灌。
               记录点**单一收口**在 setCompanionTarget —— 浮层直接改与面板经桥转发都汇到这里。 */
            const COMPANION_TGT_HIST_MAX = 5;
            function companionTgtHistLoad(){
                try{
                    const o = JSON.parse(localStorage.getItem(S.COMPANION_TGT_HIST) || '[]');
                    return Array.isArray(o) ? o.map(String).filter(Boolean) : [];
                }catch(e){ return []; }
            }
            function companionTgtHistRecord(v){
                const name = String(v == null ? '' : v).trim();
                if(!name) return;
                const arr = companionTgtHistLoad();
                const next = [name].concat(arr.filter(x => x !== name)).slice(0, COMPANION_TGT_HIST_MAX);
                try{ localStorage.setItem(S.COMPANION_TGT_HIST, JSON.stringify(next)); }catch(e){}
            }
            function fillCompanionTargetDatalist(){
                const dl = document.getElementById('dlCompanionTarget');
                if(!dl) return;
                dl.innerHTML = '';
                companionTgtHistLoad().forEach(function(name){
                    const o = document.createElement('option'); o.value = name; dl.appendChild(o);
                });
            }
            function setCompanionTarget(v){
                state.companionTarget = String(v || '');
                Storage.set(S.COMPANION_TARGET, state.companionTarget);
                /* 建议 1：非空目标记进历史并刷新候选（面板经桥转发也会走到这里） */
                if(state.companionTarget){ companionTgtHistRecord(state.companionTarget); fillCompanionTargetDatalist(); }
                applyCompanion();
            }
            function setCompanionMode(v){
                state.companionMode = (v === 'visible' || v === 'process') ? v : 'foreground';
                Storage.set(S.COMPANION_MODE, state.companionMode);
                applyCompanion();
            }
            function setCompanionEdge(v){
                /* 🆕 V4.3.55：嵌入语义 —— left/right/top/bottom 是**客户区内部**锚点，center 居中。
                   V4.3.92c：新增 free（自由跟随）—— 拖到哪就嵌在哪，主进程按"相对目标的偏移"跟。 */
                state.companionEdge = (v === 'left' || v === 'right' || v === 'top' || v === 'bottom' || v === 'center' || v === 'free') ? v : 'off';
                Storage.set(S.COMPANION_EDGE, state.companionEdge);
                applyCompanion();
            }
            /* 🆕 V4.3.55（生命周期联动）两个开关的唯一收口（规则 34）：浮层开关与面板经桥都汇到这里。 */
            function setCompanionLinkClose(v){
                state.companionLinkClose = !!v;
                Storage.set(S.COMPANION_LINK_CLOSE, state.companionLinkClose);
                applyCompanion();
                showHint(state.companionLinkClose ? t('companionLinkCloseOn') : t('companionLinkCloseOff'));
                try{ syncCompanionUI(); }catch(e){}
            }
            function setCompanionLinkMin(v){
                state.companionLinkMin = !!v;
                Storage.set(S.COMPANION_LINK_MIN, state.companionLinkMin);
                applyCompanion();
                showHint(state.companionLinkMin ? t('companionLinkMinOn') : t('companionLinkMinOff'));
                try{ syncCompanionUI(); }catch(e){}
            }
            /* 🆕 V4.3.54（吸色联动）「融入目标配色」开关的唯一收口（规则 34）。
               浮层开关与面板经桥的开关都汇到这里。 */
            function setCompanionTint(v){
                state.companionTint = !!v;
                Storage.set(S.COMPANION_TINT, state.companionTint);
                if(!state.companionTint){ try{ applyCompanionTint(null); }catch(e){} }   // 关掉立刻褪色，别等下一拍
                applyCompanion();
                showHint(state.companionTint ? t('companionTintOn') : t('companionTintOff'));
                try{ syncCompanionUI(); }catch(e){}
            }
            /* 主进程推来目标框架主色 → 着在标题栏上（CSS: body.companion-tint .title-bar）。
               rgb 为 null = 明确褪色（伴随关闭 / 吸色关闭）。 */
            /* 🟥 V4.3.93（用户：「自动吸色不准，目标程序是黑色的，阅读器却没变黑」）
               原来吸到的颜色**只刷标题栏**（CSS: body.companion-tint .title-bar，26% 透明）——
               正文区一点都没变，所以"目标黑、阅读器还是白的"完全符合旧实现。
               现在：目标色按亮度决定混合强度，真正压到 #mainContent 的底色上；
               底色一变暗，正文字色必须自动反色（否则黑底黑字），退出时还给用户自己的设置。 */
            /* 🆕 V4.3.94：把"这次到底吸到了什么颜色"摊给用户看 ——
               用户上轮说吸色不准，光看效果很难判断是"没吸到"还是"吸错了"，有个色块就能一眼分辨。 */
            function setTintSwatch(rgb){
                const sw = document.getElementById('companionTintSwatch'); if(!sw) return;
                if(rgb){ sw.style.background = 'rgb(' + Number(rgb.r) + ',' + Number(rgb.g) + ',' + Number(rgb.b) + ')';
                         sw.title = 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')'; }
                else { sw.style.background = ''; sw.title = ''; }
            }
            /* 🆕 V4.3.94（用户：「然后的话要有重置按钮」）：**只重置吸色** ——
               清掉已吸到的颜色、恢复用户自己的配色，让主进程下一拍重新采一次；
               跟随目标 / 时机 / 嵌入位 / 其它开关一律不动。
               ⚠️ 必须同时清主进程的 companionTintLast：否则下一拍采到同一个颜色时
               量化去抖会认为"没变"而不重发，用户点了重置却什么都没发生。 */
            function resetCompanionTint(){
                try{ applyCompanionTint(null); }catch(e){}
                try{ if(window.readerAPI && window.readerAPI.resetCompanionTint) window.readerAPI.resetCompanionTint(); }catch(e){}
                try{ showHint(t('companionTintReset')); }catch(e){}
            }
            function applyCompanionTint(rgb){
                const mc = dom.mainContent; if(!mc) return;
                if(rgb && state.companionEnabled && state.companionTint === true){
                    setTintSwatch(rgb);
                    mc.style.setProperty('--cmp-tint-r', rgb.r);
                    mc.style.setProperty('--cmp-tint-g', rgb.g);
                    mc.style.setProperty('--cmp-tint-b', rgb.b);
                    /* 亮度 0~255：越暗压得越狠。浅色目标只轻轻带一点，深色目标明显压暗 ——
                       固定一个比例做不到"既融进浅色目标、又真的变黑"。 */
                    const lum = (Number(rgb.r) * 299 + Number(rgb.g) * 587 + Number(rgb.b) * 114) / 1000;
                    const mix = lum < 96 ? 88 : (lum < 150 ? 70 : 45);
                    mc.style.setProperty('--cmp-tint-mix', mix + '%');
                    document.body.classList.add('companion-tint');
                    /* 🟥 V4.3.93：底色压暗之后，**标题栏的字**也得跟着反色 ——
                       否则标题栏是 26% 的深色、字还是深色主题的 #1b1b1b，截图里就是一团黑。
                       用类名区分明暗，CSS 那边只认一个开关。 */
                    document.body.classList.toggle('companion-tint-dark', lum < 128);
                    if(dom.novelContent) dom.novelContent.style.color = lum < 128 ? '#f0f0f0' : '#1a1a1a';
                } else {
                    setTintSwatch(null);
                    document.body.classList.remove('companion-tint');
                    document.body.classList.remove('companion-tint-dark');
                    /* V4.3.97（审查 R-1）：撤销时**不能**直接 applyTextColor ——
                       伪装皮肤还开着时它会把皮肤字色覆盖成用户色（深底深字）。
                       交给统一收口，由优先级决定该回到"皮肤字色"还是"用户字色"。 */
                    try{ applyReadingColor(); }catch(e){}
                }
            }
            /* 🆕 V4.3.54（目标自动检测）「检测当前所在应用」的唯一收口（规则 34）：
               主窗浮层的 🎯 按钮直接调；设置面板经桥发 companionDetect 动作也汇到这里。
               检出的名字回填浮层输入框 + 走 setCompanionTarget 单一收口（自动进历史、驱动观察器）。 */
            function detectCurrentCompanion(){
                if(!window.readerAPI || !window.readerAPI.detectCompanion){ showHint(t('pickUnsupported'), 'warn'); return; }
                showHint(t('companionDetecting'));
                window.readerAPI.detectCompanion().then(function(r){
                    if(r && r.ok && r.name){
                        const el = document.getElementById('companionPopInput');
                        if(el) el.value = r.name;
                        setCompanionTarget(r.name);
                        showHint(t('companionDetectOk') + r.name);
                    } else {
                        showHint(t('companionDetectNone'), 'warn');
                    }
                }).catch(function(e){
                    logRenderError('companion detect failed: ' + ((e && e.message) || e));
                    showHint(t('companionDetectFail') + ((e && e.message) || e), 'warn');
                });
            }
            /* 「贴回去」：主进程如实回 `resumed` —— 贴边位置选的是「关闭」时没有贴边可恢复，
               这时**不能假装成功**（"界面在骗你"是老毛病），要引导用户先去选一个位置。 */
            function redockCompanion(){
                if(!window.readerAPI || !window.readerAPI.redockCompanion) return;
                window.readerAPI.redockCompanion().then(function(r){
                    companionDockPaused = false;
                    if(r && r.resumed) showHint(t('companionRedocked'));
                    else showHint(t('companionNeedEdge'), 'warn');
                    try{ syncSettingsPanel(); }catch(e){}
                    try{ syncCompanionUI(); }catch(e){}
                }).catch(function(e){ logRenderError('companion redock failed: ' + ((e && e.message) || e)); });
            }

            /* ===== 🐋 V4.3.53（R12-4）伴随模式的「就地」入口 =====
               用户 2026-10-13 原话：「我们嵌入的时候要怎么点进设置里面设置呢？调整设置呢？
               应该是在首页或者说顶页，有没有更快捷一点的设置方法？而不是点进应用设置里面」。
               体检出来的老路径确实绕：主窗顶栏**连「设置」按钮都没有**（只有 ☰工具栏/专注/全屏/?/✕）
               → 得先点 ☰ 打开工具栏面板 → 再点面板里的 ⚙️设置 → 打开**另一个窗口** →
               滚到「伴随模式」小节；而"设置"连快捷键都没有。最别扭的是「拖走即暂停」那一刻：
               只弹一条 4 秒就消失的 showHint，内容还是「设置里点『贴回去』可恢复」——
               发生在眼前的事，却当场把人支到另一个窗口去。
               三条新入口（顶栏按钮 / 就地浮层 / 顶部动作条）**全部复用**上面已有的
               toggleCompanion / setCompanionTarget / setCompanionMode / setCompanionEdge / redockCompanion，
               不新增第二条数据通路（规则 34：同一动作多个入口 ⇒ 收口成单一 helper）。 */
            function companionPopIsOpen(){
                return !!(dom.companionPop && dom.companionPop.classList.contains('open'));
            }
            /* 定位：按**当次**按钮矩形现算（规则 63 —— 坐标不许跨状态复用。
               全屏按钮探针那次就是复用了退出全屏前的坐标，一处失误带红三条判据）。
               用 fixed 而不是 absolute：躲开 #app 的 10px 内衬与 #mainContent 的 overflow:hidden+圆角。
               下方放不下（窗口很矮）就翻到按钮上方。 */
            function placeCompanionPop(){
                const pop = dom.companionPop, btn = dom.companionBtn;
                if(!pop || !btn) return;
                /* 每次重新定位都先清掉上次的限高，否则窗口变大后浮层还是被压着 */
                pop.style.maxHeight = '';
                pop.style.overflowY = '';
                const r = btn.getBoundingClientRect();
                const w = pop.offsetWidth || 238;
                const h = pop.offsetHeight || 0;
                const vw = window.innerWidth, vh = window.innerHeight;
                let left = Math.round(r.right - w);
                if(left + w > vw - 6) left = vw - 6 - w;
                if(left < 6) left = 6;
                let top = Math.round(r.bottom + 6);
                const below = vh - 6 - top;
                if(h && h > below){
                    const above = Math.round(r.top) - 12;          // 上方可用高度（留 6px 边距）
                    if(h <= above){
                        top = Math.round(r.top - 6 - h);           // 上方放得下才翻上去
                    } else {
                        /* ⬜ V4.3.60：**两边都放不下**时不许翻上去盖住按钮。
                           原先无条件翻到上方再把 top 夹到 6 —— 窗口一矮（或内衬变厚），
                           浮层就直接压在 🐋 按钮上，用户点不到开关（门禁 R12C_UI_POP_OPENS 抓到）。
                           现在留在按钮下方、限高内部滚动：按钮永远点得到。 */
                        pop.style.maxHeight = Math.max(140, below) + 'px';
                        pop.style.overflowY = 'auto';
                    }
                }
                if(top < 6) top = 6;
                pop.style.left = left + 'px';
                pop.style.top = top + 'px';
            }
            /* 打开时**一次性**把当前状态灌进控件。
               ⚠️ 打开之后 syncCompanionUI 绝不再回写这些输入框 —— 否则就是 V4.3.52（R11）
               那条「面板周期回写打断用户正在做的操作」的翻版（光标被踢走、打到一半的字被抹掉）。 */
            function fillCompanionPop(){
                if(dom.companionPopSwitch) dom.companionPopSwitch.classList.toggle('active', !!state.companionEnabled);
                if(dom.companionPopInput) dom.companionPopInput.value = String(state.companionTarget || '');
                if(dom.companionPopMode) dom.companionPopMode.value = state.companionMode || 'foreground';
                if(dom.companionPopEdge) dom.companionPopEdge.value = state.companionEdge || 'off';
            }
            function openCompanionPop(){ if(!dom.companionPop) return; fillCompanionPop(); dom.companionPop.classList.add('open'); placeCompanionPop(); syncCompanionUI(); }
            function closeCompanionPop(){ if(dom.companionPop) dom.companionPop.classList.remove('open'); }
            function toggleCompanionPop(){ if(companionPopIsOpen()) closeCompanionPop(); else openCompanionPop(); }
            /* 按钮两态 + 动作条显隐。**只读状态写外观**，不碰浮层里的输入框（理由见上）。
               动作条要同时满足三条才出现：开着 / 贴边位置不是「关闭」/ 已被用户拖走暂停 ——
               缺任何一条，「贴回去」都是无意义的。 */
            function syncCompanionUI(){
                const on = !!state.companionEnabled;
                if(dom.companionBtn){
                    dom.companionBtn.classList.toggle('on', on);
                    dom.companionBtn.classList.toggle('paused', on && !!companionDockPaused);
                }
                /* 🆕 V4.3.54：吸色联动开关的两态回显 + 伴随关闭时立刻褪色 */
                const popTint = document.getElementById('companionPopTint');
                if(popTint) popTint.classList.toggle('active', state.companionTint === true);
                /* 🆕 V4.3.55：生命周期联动开关的两态回显 */
                const popLinkClose = document.getElementById('companionPopLinkClose');
                if(popLinkClose) popLinkClose.classList.toggle('active', state.companionLinkClose === true);
                const popLinkMin = document.getElementById('companionPopLinkMin');
                if(popLinkMin) popLinkMin.classList.toggle('active', state.companionLinkMin === true);
                if(!on || state.companionTint !== true){ try{ applyCompanionTint(null); }catch(e){} }
                const wantBar = on && state.companionEdge !== 'off' && !!companionDockPaused;
                if(dom.companionBar) dom.companionBar.classList.toggle('show', wantBar);
                /* 建议 2：暂停提示带上目标名，一眼知道在等谁。走 t() 查表（规则 21），
                   1.5s 轮询会不断重写，语言切换后最迟一拍半收敛回正确语言。 */
                if(dom.companionBarText){
                    dom.companionBarText.textContent = t('跟随已暂停') +
                        (state.companionTarget ? ' · ' + state.companionTarget : '');
                }
                if(wantBar && dom.companionBarEdge) dom.companionBarEdge.value = state.companionEdge || 'off';
            }
            /* 唯一绑定点：规则 2 —— 与面板 type 无关的通用初始化区（init() 里调 setupCompanionEntry）。 */
            function setupCompanionEntry(){
                if(dom.companionBtn){
                    dom.companionBtn.addEventListener('click', toggleCompanionPop);
                    /* 右键＝快捷道：直接开/关，省掉"先开浮层再点开关"这一步。
                       必须 preventDefault，否则冒出来的右键菜单会盖住刚开的浮层。 */
                    dom.companionBtn.addEventListener('contextmenu', function(e){ e.preventDefault(); toggleCompanion(); });
                }
                if(dom.companionPopSwitch) dom.companionPopSwitch.addEventListener('click', function(){ toggleCompanion(); fillCompanionPop(); });
                /* 🆕 V4.3.54：浮层「🎯 检测」按钮 —— 检出即走 setCompanionTarget 单一收口 */
                if(dom.companionPopDetect) dom.companionPopDetect.addEventListener('click', function(){ detectCurrentCompanion(); });
                /* 🆕 V4.3.54：浮层「融入目标配色」开关 */
                if(dom.companionPopTint) dom.companionPopTint.addEventListener('click', function(){ setCompanionTint(state.companionTint !== true); });
                /* 🆕 V4.3.94：跟随设置里的「重置」—— 只重置吸色 */
                const tintResetBtn = document.getElementById('companionTintReset');
                if(tintResetBtn) tintResetBtn.addEventListener('click', function(e){
                    e.preventDefault(); e.stopPropagation(); resetCompanionTint();
                });
                /* 🆕 V4.3.55：浮层「关闭联动 / 最小化联动」开关 */
                if(dom.companionPopLinkClose) dom.companionPopLinkClose.addEventListener('click', function(){ setCompanionLinkClose(!state.companionLinkClose); });
                if(dom.companionPopLinkMin) dom.companionPopLinkMin.addEventListener('click', function(){ setCompanionLinkMin(!state.companionLinkMin); });
                /* 🆕 V4.3.54 修审查发现 1：浮层输入从 input 改 change（与面板同一口径）。
                    input 会逐键触发 —— 每个键击都把打字前缀记进目标历史（"W"/"We"/"Wei"…占满
                    5 条候选）、伴随开着时每键杀/拉一次观察器（list 变了 same 判等必不命中）。
                    change 只在回车/失焦/从候选里选中时触发一次；datalist 选取两个事件都会发。 */
                if(dom.companionPopInput) dom.companionPopInput.addEventListener('change', function(){ setCompanionTarget(dom.companionPopInput.value); });
                if(dom.companionPopMode) dom.companionPopMode.addEventListener('change', function(){ setCompanionMode(dom.companionPopMode.value); });
                if(dom.companionPopEdge) dom.companionPopEdge.addEventListener('change', function(){ setCompanionEdge(dom.companionPopEdge.value); syncCompanionUI(); });
                if(dom.companionPopRedock) dom.companionPopRedock.addEventListener('click', function(){ redockCompanion(); closeCompanionPop(); });
                if(dom.companionBarRedock) dom.companionBarRedock.addEventListener('click', function(){ redockCompanion(); });
                if(dom.companionBarEdge) dom.companionBarEdge.addEventListener('change', function(){ setCompanionEdge(dom.companionBarEdge.value); syncCompanionUI(); });
                if(dom.companionBarOff) dom.companionBarOff.addEventListener('click', function(){ if(state.companionEnabled) toggleCompanion(); syncCompanionUI(); });
                /* 点浮层外面 / Esc / 窗口尺寸变化：关掉或重新定位。
                   ⚠️ 用 mousedown 而不是 click —— 拖选文字后松手也会在 document 上冒一次 click，
                   那会把用户刚点开的浮层立刻关掉。 */
                document.addEventListener('mousedown', function(e){
                    if(!companionPopIsOpen()) return;
                    if((dom.companionPop && dom.companionPop.contains(e.target)) || (dom.companionBtn && dom.companionBtn.contains(e.target))) return;
                    closeCompanionPop();
                });
                document.addEventListener('keydown', function(e){
                    if(e.key === 'Escape' && companionPopIsOpen()) closeCompanionPop();
                });
                window.addEventListener('resize', function(){ if(companionPopIsOpen()) placeCompanionPop(); });
                fillCompanionTargetDatalist();   /* 建议 1：开机先灌一次候选（之后 setCompanionTarget 会维护） */
                syncCompanionUI();
            }
            /* 🟥 规则 41：观察器起不来必须让用户看见（同前台监听的口径）。
               原先这类"开关亮着、实际没跑"的静默失效，用户是永远不会知道的。 */
            function applyCompanionStatus(st){
                if(!st || typeof st !== 'object') return;
                if(st.ok){ lastCompanionError = ''; }
                else {
                    const why = {
                        'spawn-failed': t('fgFailSpawn'),
                        'child-error': t('fgFailChild'),
                        'exited': t('fgFailExited'),
                        'empty-list': t('companionFailEmpty'),
                        'unsupported-platform': t('fgFailPlatform')
                    }[String(st.reason || '')] || t('fgFailGeneric');
                    lastCompanionError = t('companionFail') + why + (st.detail ? ('（' + st.detail + '）') : '');
                    showHint(lastCompanionError, 'warn');
                }
                try{ syncSettingsPanel(); }catch(e){}
                try{ syncCompanionUI(); }catch(e){}
            }
            // 先订阅再 apply —— 否则主进程对本次 setCompanion 的首个回传会丢（同前台监听）
            if(window.readerAPI && window.readerAPI.onCompanionStatus) window.readerAPI.onCompanionStatus(applyCompanionStatus);
            if(window.readerAPI && window.readerAPI.onCompanionStandby) window.readerAPI.onCompanionStandby(function(p){
                /* 目标关掉 → 已收进托盘待命：把朗读停掉（窗口藏了声音还在是最糟的体验）。
                   阅读计时**不用管** —— 它本来就按 `document.visibilityState` 停
                   （hide 会推 visibilitychange，（该判据随 V4.3.79 统计移除而删））。 */
                if(p && p.standby){ try{ ttsPause(); }catch(e){} }
            });
            if(window.readerAPI && window.readerAPI.onCompanionDock) window.readerAPI.onCompanionDock(function(p){
                /* V4.3.92c：主进程会因为「用户拖窗口」自动转成自由跟随（或「贴回去」时还原固定位）。
                   不把这件事同步回渲染层，下拉框就会一直显示旧的嵌入位 —— 界面在骗人。
                   ⚠️ 只同步状态与 UI，**不要**再调 setCompanionEdge（那会再发一次 IPC 触发重启观察器）。 */
                if(p && p.edge){
                    const e = (p.edge === 'left' || p.edge === 'right' || p.edge === 'top' ||
                               p.edge === 'bottom' || p.edge === 'center' || p.edge === 'free') ? p.edge : 'off';
                    if(state.companionEdge !== e){
                        state.companionEdge = e;
                        Storage.set(S.COMPANION_EDGE, e);
                        if(p.switched){
                            try{ showHint(t('companionFreeDock'), 'info'); }catch(e2){}
                        }
                        try{ syncCompanionUI(); }catch(e2){}
                        try{ syncSettingsPanel(); }catch(e2){}
                    }
                }
                if(p && p.paused){
                    companionDockPaused = true;
                    /* 🐋 V4.3.53（R12-4）：文案改了 —— 原来是「设置里点『贴回去』可恢复」，
                       等于当场把用户支到另一个窗口去。现在焦点在标题栏的 🐋 和它下方那条动作条上。 */
                    showHint(t('companionDockPaused'), 'warn');
                    try{ syncSettingsPanel(); }catch(e){}
                    try{ syncCompanionUI(); }catch(e){}   // 动作条立刻出现，别等 1.5s 那一拍
                }
            });
            /* 🆕 V4.3.54（吸色联动）：主进程采到目标框架主色就着上来（内部已量化去抖+节流 600ms） */
            if(window.readerAPI && window.readerAPI.onCompanionTint) window.readerAPI.onCompanionTint(function(rgb){
                try{ applyCompanionTint(rgb); }catch(e){}
            });
            applyCompanion();

            /* 🖥 V4.3.53（第十二轮）：双击标题栏切全屏。
               🟥 标题栏主体是 `-webkit-app-region:drag` 的系统拖拽区 —— 双击事件根本不下发到
               渲染层，那半条路由主进程的 WM_NCLBUTTONDBLCLK 钩子兜住（main.js createWindow）。
               这里只管 DOM 真能收到双击的部分：标题栏里 no-drag 的元素（如 📖 阅读器 文字）
               与按钮之间的空隙。双击按钮＝两次点击（各自动作照常），不切全屏。 */
            (function setupTitleDblClick(){
                const bar = document.querySelector('.title-bar');
                if(!bar) return;
                bar.addEventListener('dblclick', e=>{
                    if(e.target && e.target.closest && e.target.closest('button, input, select, textarea')) return;
                    toggleFullScreenFromUI();   // 🖥 收口：与右上角按钮同一个入口（规则 34）
                });
            })();
            if(window.readerAPI && window.readerAPI.onFullscreenChange){
                window.readerAPI.onFullscreenChange(function(on){
                    /* 🖥 真·铺满：全屏时去掉 #app 的 10px 内衬与卡片圆角/描边/投影
                       （见 styles/main.css 的 body.fs 段）—— 否则窗口虽已占满整屏，
                       视觉上还是"一块浮在桌面上的卡片"，只能算"像全屏"。
                       （用户 2026-10-12 的反馈原话：并没有真正的全屏。） */
                    try{ document.body.classList.toggle('fs', !!on); }catch(e){}
                    showHint(on ? t('fullscreenOn') : t('fullscreenOff'));
                });
            }
            /* 🟥 规则 41：主进程切换全屏失败会回传 —— 别让"点了没反应"重演 */
            if(window.readerAPI && window.readerAPI.onFullscreenFailed){
                window.readerAPI.onFullscreenFailed(function(detail){ showHint(t('fullscreenFail') + String(detail || '').slice(0, 120), 'warn'); });
            }
            function toggleGray(){ state.isGrayEnabled=!state.isGrayEnabled;
                         dom.grayToggleBtn.classList.toggle('toggle-on',state.isGrayEnabled);
                         dom.grayToggleBtn.classList.toggle('toggle-off',!state.isGrayEnabled);
                         Storage.set(S.GRAY,state.isGrayEnabled);
                         if(!state.isGrayEnabled){ setWindowOpacity(1);
                         state.isGrayed=false;
                        } }
            function setupGrayMode(){
                if(window.readerAPI && window.readerAPI.onAppHover){
                    let grayTimer=null;
                    window.readerAPI.onAppHover(hovered=>{
                        if(hovered){ clearTimeout(grayTimer); if(state.isGrayed){ state.isGrayed=false; setWindowOpacity(1); } }
                        /* 🟥 V4.3.51（R10-2）：这里的延迟原先**硬编码 250ms**，
                           而设置面板上那个「移出延迟关闭」滑块（#closeDelaySlider，0~3000ms，
                           默认 1500ms）读得到、存得进、回显得出，却**从来没有一个消费点读它**
                           —— 标准死控件：用户拖到 3000ms 期望"移出 3 秒后才变灰"，
                           实际 0.25 秒就变灰，拖了等于没拖。
                           （本项目第三次遇到死控件：V4.2.4 伪装按钮、V4.3.28 SOS 按钮，
                             前两次是"发了 action 没人接"，这次是"线接上了但消费点没读值"，
                             形态更隐蔽 —— 按 id 查引用、按 action 查分派都抓不到它。）
                           改读 state.closeDelay；它已在 SETTING_RANGES 登记（0~3000），
                           所以导入脏数据也灌不进负值。 */
                        else { clearTimeout(grayTimer); grayTimer=setTimeout(()=>{ if(!state.isHidden && state.isGrayEnabled && !state.isGrayed){ state.isGrayed=true; setWindowOpacity(GRAY_OPACITY); } }, state.closeDelay); }
                    });
                } else {
                    const root=document.documentElement;
                    root.addEventListener('mouseleave',()=>{ if(!state.isHidden && state.isGrayEnabled){ state.isGrayed=true; setWindowOpacity(GRAY_OPACITY); } });
                    root.addEventListener('mouseenter',()=>{ if(state.isGrayed){ state.isGrayed=false; setWindowOpacity(1); } });
                }
            }
            function applyFocusWindow(){
                if(!window.readerAPI) return;
                if(window.readerAPI.setAlwaysOnTop) window.readerAPI.setAlwaysOnTop(!!state.isFocusMode);
                if(window.readerAPI.setMinSize) window.readerAPI.setMinSize(state.isFocusMode ? 200 : 360, state.isFocusMode ? 90 : 260);
            }
            function toggleFocus(){
                state.isFocusMode=!state.isFocusMode;
                dom.mainContent.classList.toggle('focus-mode',state.isFocusMode);
                Storage.set(S.FOCUS,state.isFocusMode);
                applyFocusWindow();
                showHint(state.isFocusMode ? t('focusOn') : t('focusOff'));
            }
            function toggleHide(){ if(window.readerAPI && window.readerAPI.hideWindow && window.readerAPI.showWindow){ if(!state.isHidden){ state.isHidden=true;
                         window.readerAPI.hideWindow();
                         } else { state.isHidden=false;
                         window.readerAPI.showWindow();
                         } } else { state.isHidden=!state.isHidden;
                         dom.mainContent.style.display=state.isHidden?'none':'flex';
                        } }
            /* 🆘 V4.3.24 SOS：一键收起**全部**界面并停掉朗读；再按一次原样恢复。
               与 Ctrl+Shift+H（hide）的区别要说清楚：
                 · hide 只藏阅读主窗 —— 工具栏等小窗还在，朗读还在响；
                 · SOS 连所有小窗一起关掉，并**立刻停掉朗读**（项目里的 TTS 没有音量接口，
                   所以「静音」就是马上 cancel；恢复时**不自动续读**，免得突然出声吓人）。
               🛠 V4.3.28：这里原来还有一版旧的 triggerSOS 实现与新 enterSOS/exitSOS 并存，
                   触发链只接了新版，旧版是死代码 —— 正是这种重复导致后来接线时漏掉了
                   按钮与全局键两条链。已删除死版本，只留 toggleSOS 一条真源。 */
            /* 🟥 V4.3.36：`TTS.state` 本身**已经是字符串**（getter 转发 tts.js 的 state.state），
               再取一次 `.state` 得到 undefined —— 于是本函数**恒返回 false**：
               SOS 的现场快照永远把"正在朗读"记成没在朗读，恢复时也就永远不提示"朗读已暂停"。 */
            function ttsIsPlaying(){ try{ return !!(TTS && TTS.state === 'playing'); }catch(e){ return false; } }
            let ttsPausedByHide = false;   // V4.3.37：因"窗口被隐藏"而停的朗读（恢复时提示一次）
            let ttsHideWasPlaying = false; // V4.3.38：隐藏前是「正在播」还是「已暂停」，用于区分提示文案
            function enterSOS(){
                if(state.sosActive) return;
                state.sosActive = true;
                state.sosSnapshot = { hidden: !!state.isHidden, panels: Array.from(openPanelTypes || []), ttsPlaying: ttsIsPlaying() };
                try{ ttsStop(); }catch(e){}
                try{ closeAllPanels(); }catch(e){}
                if(!state.isHidden){ state.isHidden = true; try{ if(window.readerAPI && window.readerAPI.hideWindow) window.readerAPI.hideWindow(); }catch(e){} }
                // V4.3.37：用**用户实际设置的**键位，别硬编码 SOS_KEY（改键后提示会对不上）
                const sosShown = (state.shortcuts && state.shortcuts.hide) || SOS_KEY;
                showHint(TT('🆘 已收起全部界面并停止朗读（再按一次 ' + sosShown + ' 恢复）', '🆘 All hidden, TTS stopped (press ' + sosShown + ' again to restore)'), 'note');
                syncUiState();
            }
            function exitSOS(){
                if(!state.sosActive) return;
                state.sosActive = false;
                const snap = state.sosSnapshot || { hidden:false, panels:[], ttsPlaying:false };
                state.sosSnapshot = null;
                // 只恢复"按下 SOS 之前本来是显示着"的主窗；原本就隐藏的保持隐藏
                if(!snap.hidden){ state.isHidden = false; try{ if(window.readerAPI && window.readerAPI.showWindow) window.readerAPI.showWindow(); }catch(e){} }
                (snap.panels || []).forEach(t=>{ try{ openPanel(t); }catch(e){} });
                showHint(snap.ttsPlaying
                    ? (TT('✅ 已恢复（朗读已暂停，需要再手动开）','✅ Restored (TTS paused)'))
                    : (TT('✅ 已恢复','✅ Restored')));
                syncUiState();
            }
            function toggleSOS(){ if(state.sosActive) exitSOS(); else enterSOS(); }
            /* 🛡 V4.3.39：把「隐蔽态」（SOS/伪装）同步给主进程 —— 二次启动时据此决定
               要不要把窗口拉出来（SOS/伪装中不拉，防穿帮）。四个进出函数末尾都要调用。 */
            function syncUiState(){
                try{
                    if(window.readerAPI && window.readerAPI.setUiState)
                        window.readerAPI.setUiState({ sos: !!state.sosActive, disguised: !!state.isDisguised });
                }catch(e){}
            }
            /* ⬜ V4.3.60：原先 resize 事件**直接**改 documentElement 上的 CSS 变量 ——
               拖边框改大小时逐帧触发整棵树样式重算 + 重排（叠加透明窗合成就是掉帧）。
               现在：① 用 rAF 合并成"每帧最多一次"；② 只在比例真的变了（≥0.005）才写变量，
               避免同一档比例反复写同一个值。 */
            function setupResponsive(){
                let lastScale = 0, pending = 0;
                const compute = () => Math.max(0.82, Math.min(1.3, window.innerWidth / 720));
                const apply = () => {
                    pending = 0;
                    const s = compute();
                    if (Math.abs(s - lastScale) < 0.005) return;
                    lastScale = s;
                    document.documentElement.style.setProperty('--ui-scale', s.toFixed(3));
                };
                const schedule = () => { if(!pending) pending = requestAnimationFrame(apply); };
                apply();
                window.addEventListener('resize', schedule);
            }
            function setupTooltips(){
                /* 🗑 V4.3.79：阅读统计计时功能已整体移除（用户要求不再记录/显示阅读时长）——
                   计时心跳、可见性/输入监听、日锚点落盘与实时推送均随之删除；
                   历史数据在启动时清除，排除机制保留空壳防旧备份混入。 */

                const tips = {
                    fontDec:'缩小字号', fontInc:'放大字号', modeToggleBtn:'切换单行/多行模式', skinBtn:'切换皮肤（浅色 / 深色）',
                    resetColorBtn:'恢复默认文字颜色', pickerBtn:'取色点：移动鼠标预览颜色，单击应用（右键开启自动吸色）',
                    grayToggleBtn:'变灰：鼠标移出窗口时整窗淡出防窥',
                    tocBtn:'目录', globalSearchBtn:'全文搜索', settingsBtn:'设置', focusBtn:'专注模式（窗口置顶）',
                    helpBtn:'快捷键说明', closeBtn:'隐藏到托盘', toggleToolbarBtn:'工具栏',
                    titleText:'书架标签：点击滑出 / 收起'
                };
                // 🛠 自绘提示框（V4.3.3）：原生 title 的提示框由系统按光标位置绘制，位置不受控，
                // 用户反馈「提示框与按钮中心不重合」。改为自绘：水平居中于按钮正下方；
                // 并清掉原生 title 避免双重提示。
                const tipEl=(function(){ let el=document.getElementById('titleTip'); if(!el){ el=document.createElement('div'); el.id='titleTip'; el.setAttribute('role','tooltip'); document.body.appendChild(el); } return el; })();
                let tipTimer=null, tipFor=null;
                function hideTitleTip(){ if(tipTimer){ clearTimeout(tipTimer); tipTimer=null; } tipFor=null; tipEl.classList.remove('show'); }
                function showTitleTip(el){
                    tipEl.textContent = el.__tip || '';
                    if(!tipEl.textContent) return;
                    tipEl.classList.add('show');                       // 先显示才能量出尺寸
                    const r=el.getBoundingClientRect();
                    const cx=r.left + r.width/2;
                    // 🛠 严格居中优先（用户二次反馈「边缘对齐仍不算对齐」）：贴边按钮把提示框限宽、
                    //    让文字换行成窄条，从几何上真正做到中心重合；可用宽度不足 72px 时放弃限宽，
                    //    退回单行 + 贴边收进窗内
                    const avail = 2*Math.min(cx-6, window.innerWidth-6-cx);
                    tipEl.style.maxWidth = avail>=72 ? Math.floor(avail)+'px' : '';
                    const t=tipEl.getBoundingClientRect();             // 限宽重排后再量
                    let left=cx - t.width/2;
                    left=Math.max(6, Math.min(left, window.innerWidth - t.width - 6));
                    tipEl.style.left=Math.round(left)+'px';
                    tipEl.style.top=Math.round(r.bottom + 7)+'px';
                }
                Object.keys(tips).forEach(id=>{
                    const el=document.getElementById(id); if(!el) return;
                    el.__tip=tips[id]; el.removeAttribute('title');
                    el.addEventListener('mouseenter', ()=>{ hideTitleTip(); tipFor=id; tipTimer=setTimeout(()=>{ if(tipFor===id) showTitleTip(el); }, 350); });
                    el.addEventListener('mouseleave', ()=>{ if(tipFor===id) hideTitleTip(); });
                    el.addEventListener('mousedown', hideTitleTip);
                });
                // 冒烟钩子：量「提示框中心 vs 按钮中心」的水平偏移与上下关系（附原始几何供定位分析）
                window.__titleTipGeom = function(){
                    const el=document.getElementById('toggleToolbarBtn'); if(!el) return {shown:false, below:false, off:999};
                    showTitleTip(el);
                    const r=el.getBoundingClientRect(), t=tipEl.getBoundingClientRect();
                    const res={ shown: tipEl.classList.contains('show'), below: t.top >= r.bottom - 1, off: Math.round((t.left+t.width/2)-(r.left+r.width/2)),
                        bl:Math.round(r.left), br:Math.round(r.right), tl:Math.round(t.left), tr:Math.round(t.right), tw:Math.round(t.width), iw:window.innerWidth };
                    hideTitleTip();
                    return res;
                };
            }
            // 快捷键浮层按当前配置生成，避免写死的列表和实际按键脱节
            function renderShortcutHelp(){
                const box = dom.shortcutHelpRows;
                if(!box) return;
                const sc = Object.assign({}, DEFAULT_SHORTCUTS, state.shortcuts || {});
                const rows = [
                    ['helpPrevNext', sc.prev + ' / ' + sc.next],
                    ['helpSearch', sc.search], ['helpGlobalSearch', sc.globalSearch],
                    ['helpAutoScroll', sc.autoScroll], ['helpPickPoint', sc.pickPoint],
                    ['helpToolbar', sc.toolbar], ['helpToc', sc.toc], ['helpFocus', sc.focus], ['helpHide', sc.hide],
                    ['helpContentProtect', sc.contentProtect],   // 🛡 V4.3.19 脱监也进说明（键位跟设置里改的一起变）
                    ['helpBookmark', sc.bookmark],   // 📑 V4.3.29 书签（可改键，说明与实际按键同源）
                    ['helpOpacity', 'Ctrl+' + (TT('滚轮','wheel'))],
                    ['helpSelect', 'T'],
                    ['helpDoubleClick', t('helpFocus')], ['helpTripleClick', t('helpHide')],
                    /* 🟥 V4.3.22：「Ctrl+鼠标左键 = 移动窗口」这一行已删除 —— 该功能按用户要求移除。
                       改成指着**真正顺滑的那条路**：原生拖动区（普通模式拖标题栏 / 专注模式拖顶部细条）。 */
                    ['helpDragNative', TT('拖标题栏 / 顶部细条','Title bar / top strip')]
                ];
                box.innerHTML = rows.filter(r => r[1]).map(r =>
                    /* 🛡 V4.3.32：键位值来自 state.shortcuts，可随备份 / 导入数据带进来
                       （非纯本地输入），拼进 innerHTML 前先转义。 */
                    `<div class="row"><span>${t(r[0])}</span><span class="key">${ReaderUtil.escapeHtml(r[1])}</span></div>`
                ).join('');
            }
            // ===== 书架自动追更：按间隔对所有书源书静默执行增量检查 =====
            let autoUpdateTimer=null;
            function setupAutoUpdate(){
                if(autoUpdateTimer){ clearInterval(autoUpdateTimer); autoUpdateTimer=null; }
                if(!state.autoUpdate) return;
                /* 🟥 V4.3.45（R4-2）：这里是**最后一道闸**。不管 state 里的值从哪来
                   （localStorage 里被写脏的 faum / 被篡改的备份 / 将来的新入口），
                   交给 setInterval 之前一律再归一化一次：上界 10080 分钟换算成 604800000ms，
                   离 int32 上限（2147483647）还有 3.5 倍余量，绝不触发延迟溢出。 */
                const ms=normalizeSettingValue(S.AUTO_UPDATE_MIN, state.autoUpdateMin||60)*60000;
                autoUpdateTimer=setInterval(function(){ checkBookUpdates().catch(function(){}); }, ms);
            }
            function setupGestures(){
                let clickTimer=null, clickCount=0, focusBeforeTriple=null;
                dom.novelContent.addEventListener('click', e=>{
                    if(state.allowSelect || e.ctrlKey) return;
                    /* 📖 V4.3.68：分页模式下**点击就是翻页**，不能再参与双击/三击手势 ——
                       否则连续点两下翻两页会被当成"双击"切专注模式（实测：点左半屏回退时
                       位置被专注模式重置回去，看起来像"左点没反应"）。 */
                    if(pagedActive()) return;
                    clickCount++; clearTimeout(clickTimer);
                    if(clickCount===2){ focusBeforeTriple=state.isFocusMode; toggleFocus(); }
                    else if(clickCount>=3){
                        if(focusBeforeTriple!==null && state.isFocusMode!==focusBeforeTriple) toggleFocus();
                        clickCount=0; focusBeforeTriple=null; toggleHide(); return;
                    }
                    clickTimer=setTimeout(()=>{ clickCount=0; focusBeforeTriple=null; }, 280);
                });
                let dragging=false, resizing=false, resizeStart=null, resizeDir='se';
                // 起手阶段（mousedown 后 ~520ms）渲染层让位：主进程在 16ms 轮询光标直接驱动窗口
                //（跳过 mousemove 的帧对齐等待，起手延迟约减半）；之后恢复 mousemove 驱动保证丝滑。
                let dragStartupPhase=false;
                // 拖动期间给 <body> 挂标记：CSS 会临时关掉 backdrop-filter / 大面积阴影 / 过渡。
                // 半透明无边框窗口移动时这些最费合成，是「重影」的主因。
                const setDraggingFlag = on => { try{ document.body.classList.toggle('dragging', !!on); }catch(err){} };
                document.addEventListener('mousedown', e=>{
                    if(e.button!==0) return;
                    /* V4.3.99：八向热区统一走 [data-rz]，方向传给主进程（原来只认 #resizeGrip = 右下角） */
                    const rzEl = e.target && e.target.closest && e.target.closest('[data-rz]');
                    if(rzEl){ resizing=true; resizeDir=rzEl.getAttribute('data-rz')||'se'; resizeStart={x:e.screenX,y:e.screenY}; if(window.readerAPI&&window.readerAPI.startResize) window.readerAPI.startResize(resizeDir); e.preventDefault(); return; }
                    if(e.target && e.target.closest && e.target.closest('button,input,select,textarea,a')) return;
                    /* 🟥 V4.3.22：「Ctrl + 左键拖动窗口」**已按用户要求删除**。
                       理由（用户原话）：左键本身已经能拖动，Ctrl 那套是多余的，还容易误触。
                       现在移动窗口只有两条路：
                         · 普通模式 → 拖标题栏（原生 -webkit-app-region:drag，最顺）
                         · 专注模式 → 拖顶部那条 14px 细条（同样原生），或直接在正文按住左键拖（JS 驱动）
                       按下时的屏幕坐标一起送给主进程当基准，省掉「主进程再取一次光标」的那点延迟。 */
                    if(state.isFocusMode && !state.allowSelect){ dragging=true; setDraggingFlag(true); if(window.readerAPI&&window.readerAPI.startDrag) window.readerAPI.startDrag(e.screenX, e.screenY); e.preventDefault();
                        // 起手阶段让位给主进程轮询；520ms 后本层 mousemove 接管
                        dragStartupPhase=true; setTimeout(()=>{ dragStartupPhase=false; }, 520);
                        /* 🆕 V4.3.54（吸色优化）拖动期间**不再停吸色循环** —— 那是
                           desktopCapturer 时代（抓屏 540ms 卡死主进程）的遗留逻辑；
                           现在 GetPixel 侧车单次 48ms/主进程 11ms，且用户明确要求
                           「拖动时颜色实时跟随」。body.dragging 会临时关掉 CSS 过渡，
                           颜色硬切跟手；松手后 transition 恢复，微差平滑收敛。 */
                    }
                });
                // 拖动跟手：鼠标事件直接发，不再等 rAF。
                // Chrome 派发的 mousemove 已经与显示帧对齐并做过合并，额外等一次
                // requestAnimationFrame 等于凭空多等一整帧（≈16.7ms）——就是「起手滞后」的来源。
                document.addEventListener('mousemove', e=>{
                    if(resizing){ if(window.readerAPI&&window.readerAPI.resizeMove) window.readerAPI.resizeMove(e.screenX-resizeStart.x, e.screenY-resizeStart.y); return; }
                    if(!dragging) return;
                    if(dragStartupPhase) return;   // 起手阶段：主进程轮询在驱动，避免两路同时推窗口
                    if(window.readerAPI && window.readerAPI.dragMove) window.readerAPI.dragMove(e.screenX, e.screenY);
                });
                document.addEventListener('mouseup', ()=>{ if(dragging && window.readerAPI && window.readerAPI.endDrag) window.readerAPI.endDrag(); if(dragging) setDraggingFlag(false); dragging=false; resizing=false; resizeStart=null; dragStartupPhase=false;
                    /* 吸色循环拖动中不再暂停（V4.3.54），这里无需恢复逻辑。 */
                });
                // 兜底：拖到窗口外松手或窗口失焦时收不到 mouseup，别让标记卡在 body 上
                window.addEventListener('blur', ()=>{ setDraggingFlag(false); dragging=false; dragStartupPhase=false; });
            }

            // ===== 口令弹窗（导出加密 / 导入解密共用） =====
            /* V4.3.97：加第 4 个参数 `masked`。默认 true（口令场景照旧显示圆点）；
               换源地址这类**非密文**输入要传 false，否则用户看不到自己粘的 URL。 */
            function askPassword(title, hint, placeholder, masked){
                return new Promise(resolve => {
                    const modal = document.getElementById('pwdModal');
                    const input = document.getElementById('pwdInput');
                    if(!modal || !input){ resolve(null); return; }
                    input.type = (masked === false) ? 'text' : 'password';
                    document.getElementById('pwdTitle').textContent = title || '';
                    document.getElementById('pwdHint').textContent = hint || '';
                    input.value = '';
                    input.placeholder = placeholder || '';
                    modal.classList.add('open');
                    setTimeout(()=>{ try{ input.focus(); }catch(e){} }, 30);
                    const finish = val => {
                        modal.classList.remove('open');
                        document.getElementById('pwdOk').onclick = null;
                        document.getElementById('pwdCancel').onclick = null;
                        input.onkeydown = null;
                        resolve(val);
                    };
                    document.getElementById('pwdOk').onclick = () => finish(input.value);
                    document.getElementById('pwdCancel').onclick = () => finish(null);
                    input.onkeydown = e => {
                        if(e.key==='Enter'){ e.preventDefault(); finish(input.value); }
                        else if(e.key==='Escape'){ e.preventDefault(); finish(null); }
                    };
                });
            }

            // 解密入口：识别加密导出并弹出口令（加解密实现见 scripts/crypto-export.js）
            async function maybeDecryptImport(obj, what){
                if(!isEncryptedExport(obj)) return { data: obj };
                const pwd = await askPassword(
                    (TT('解密','Unlock')) + (what ? (' · ' + what) : ''),
                    TT('这是加密导出文件，请输入导出时设置的口令','Encrypted export. Enter the password used when exporting.'),
                    TT('口令','Password')
                );
                if(pwd === null) return { canceled:true };
                try { return { data: await decryptExport(obj, pwd) }; }
                catch(e){ return { error: TT('口令错误或文件已损坏','Wrong password or corrupted file') }; }
            }

            // ===== 朗读（实现见 scripts/tts.js） =====
            const tts = window.ReaderTTS.create({
                t: k => t(k),
                getLang: () => currentLang,
                getRate: () => state.ttsRate,
                getVoice: () => state.ttsVoice,
                getText: () => {
                    const ch = state.chapters[state.currentIndex];
                    return (ch && ch.content) || state.originalContent || '';
                },
                onHint: msg => showHint(msg),
                onStateChange: () => syncTTSPanels()
            });
            const TTS = { get state(){ return tts.state; } };
            function ttsSupported(){ return tts.supported(); }
            function ttsVoices(){ return tts.listVoices(); }
            function ttsPlay(){ tts.play(); }
            function ttsPause(){ tts.pause(); }
            function ttsToggle(){ tts.toggle(); }
            function ttsStop(){ tts.stop(); }
            function syncTTSPanels(){
                const st = tts.state;
                sendPanelData('toolbar', { ttsState: st });
                sendPanelData('settings', { ttsState: st, ttsRate: state.ttsRate, ttsVoice: state.ttsVoice, voices: ttsVoices().map(v => ({ name: v.name, lang: v.lang || '', local: !!v.localService })) });
            }

            // ===== 主题管理（实现见 scripts/themes.js） =====
            function syncThemePanels(){
                sendPanelData('settings', { themes: themes.names(), activeTheme: Storage.get(S.ACTIVE_THEME, '') });
            }
            const themes = window.ReaderThemes.create({
                t: k => t(k),
                load: () => Storage.get(S.THEMES, []),
                save: list => Storage.set(S.THEMES, list),
                getActive: () => Storage.get(S.ACTIVE_THEME, ''),
                setActive: name => Storage.set(S.ACTIVE_THEME, name),
                applyCss: css => applyCustomCss(css),
                clearCss: () => clearCustomCss(),
                hint: msg => showHint(msg),
                onChanged: () => syncThemePanels(),
                openFile: opts => window.readerAPI.openTextFile(opts),
                saveFile: opts => window.readerAPI.saveTextFile(opts)
            });
            function listThemes(){ return themes.list(); }
            function applySavedTheme(name){ return themes.apply(name); }
            function importTheme(){ return themes.importTheme(); }
            function exportTheme(name){ return themes.exportTheme(name); }
            function deleteTheme(name){ themes.remove(name); }
            function clearThemeSelection(){ themes.clear(); }

            // ===== 更新检查（读取版本清单） =====
            async function checkUpdate(){
                const url = Storage.get(S.UPDATE_URL, '');
                if(!window.readerAPI || !window.readerAPI.checkUpdate){ showHint(TT('当前环境不支持检查更新','Update check unavailable')); return; }
                if(!url){ showHint(TT('请先填写更新清单地址','Set the update manifest URL first')); return; }
                showHint(TT('正在检查更新…','Checking for updates…'));
                const r = await window.readerAPI.checkUpdate(url);
                if(!r || !r.ok){
                    sendPanelData('settings', { updateResult: (TT('检查失败：','Check failed: ')) + ((r && r.error) || '') });
                    showHint(TT('检查更新失败','Update check failed'));
                    return;
                }
                const newer = versionNewer(r.latest, r.current);
                const text = newer
                    ? TT(`发现新版本 ${r.latest}（当前 ${r.current}）`, `New version ${r.latest} (current ${r.current})`) + (r.notes ? ('\n' + r.notes) : '')
                    : TT(`已是最新版本（${r.current}）`, `Up to date (${r.current})`);
                sendPanelData('settings', { updateResult: text, updateDownloadUrl: r.url || '' });
                showHint(newer ? (TT('发现新版本','Update available')) : (TT('已是最新版本','Up to date')));
            }

            // ===== 文件关联 / 诊断 =====
            async function associateFiles(){
                if(!window.readerAPI || !window.readerAPI.associateFiles){ showHint(TT('当前环境不支持','Unsupported')); return; }
                const r = await window.readerAPI.associateFiles();
                if(r && r.ok){
                    sendPanelData('settings', { associateResult: (TT('已登记：','Registered: ')) + (r.exts || []).join(' ') });
                    showHint(TT('已加入「打开方式」列表','Added to "Open with"'));
                } else {
                    sendPanelData('settings', { associateResult: (TT('登记失败：','Failed: ')) + ((r && r.error) || '') });
                }
            }
            async function copyDiagnostics(){
                if(!window.readerAPI || !window.readerAPI.copyDiagnostics){ showHint(TT('当前环境不支持','Unsupported')); return; }
                const r = await window.readerAPI.copyDiagnostics();
                showHint(r && r.ok ? (TT('诊断信息已复制到剪贴板','Diagnostics copied')) : (TT('复制失败','Copy failed')));
            }
            async function exportFeedback(){
                if(!window.readerAPI || !window.readerAPI.exportFeedback){ showHint(TT('当前环境不支持','Unsupported')); return; }
                const r = await window.readerAPI.exportFeedback();
                if(r && r.ok) showHint((TT('反馈包已导出：','Feedback bundle saved: ')) + r.path);
                else if(r && r.canceled) showHint(TT('已取消','Canceled'));
                else showHint((TT('导出失败：','Export failed: ')) + ((r && r.error) || ''));
            }

            // ===== 快捷键 =====
            function shortcutOwner(value){
                const keys = Object.keys(state.shortcuts);
                for(const k of keys){ if(state.shortcuts[k] === value) return k; }
                return null;
            }
            function setShortcut(key, value){
                const owner = shortcutOwner(value);
                const reserved = RESERVED_COMBOS[value];
                if(owner && owner !== key){
                    lastShortcutError = TT('「'+value+'」已被「'+(SHORTCUT_LABELS[owner]||owner)+'」占用，请换一个', '"'+value+'" is already used by "'+(SHORTCUT_LABELS[owner]||owner)+'", pick another');
                    showHint(lastShortcutError);
                    syncSettingsPanel();
                    return false;
                }
                if(reserved){
                    /* 🆘 V4.3.28：与 keydown 硬编码保留键撞车 → 拒绝并**在设置面板内联提示**。
                       以前只 showHint 弹在主窗，用户盯着设置面板改键根本看不到。 */
                    lastShortcutError = TT('「'+value+'」是保留键（'+reserved.zh+'），请换一个',
                        '"'+value+'" is reserved ('+reserved.en+'), pick another');
                    showHint(lastShortcutError);
                    syncSettingsPanel();
                    return false;
                }
                state.shortcuts[key] = value;
                lastShortcutError = '';
                Storage.set(S.SHORTCUTS, state.shortcuts);
                if(key === 'hide') syncHideShortcut();
                renderShortcutHelp();
                syncSettingsPanel();
                return true;
            }
            function resetShortcuts(){
                state.shortcuts = Object.assign({}, DEFAULT_SHORTCUTS);
                lastShortcutError = '';
                Storage.set(S.SHORTCUTS, state.shortcuts);
                syncHideShortcut();
                renderShortcutHelp();
                syncSettingsPanel();
                showHint(TT('快捷键已恢复默认','Shortcuts reset'));
            }

            window.__reader = { get APP_VERSION(){ return APP_VERSION;
                        },
                                     state,
                                     dom,
                                     renderChapter,
                                     renderTOC,
                                     loadFiles,
                                     handleIncomingFiles,
                                     toggleHide,
                                     toggleGray,
                                     toggleFocus,
                                     toggleDisguise,
                                     exitDisguise,
                                     /* 🆕 V4.3.86：伪装外观常驻（可阅读的皮肤）—— 挂出来供端到端探针真跑
                                        （AGENTS.md 规矩：新增能力顺手挂进 __reader，冒烟靠它断言） */
                                     setDisguiseRead,
                                     toggleDisguiseRead,
                                     applyDisguiseRead,
                                     /* 🆕 V4.3.93：吸色上色（底色混合 + 字色反色）—— 供端到端探针真跑 */
                                     applyCompanionTint,
                                     /* 🎨 V4.3.86：取色圆点的隐藏/显现与坐标（供端到端探针真跑） */
                                     togglePickDot,
                                     pickAnchorXY,
                                     toggleFgWatch,
                                     setFgWatchList,
                                     setupGrayMode,
                                     setAutoScrollSpeed,
                                     toggleAutoScroll,
                                     toggleAutoPick,
                                     togglePickPoint,
                                     setWindowOpacity,
                                     applyWindowOpacity,
                                     performSearch,
                                     clearSearchHighlights,
                                     openPanel,
                                     closeAllPanels,
                                     runGlobalSearch,
                                     syncTOCPanel,
                                     handlePanelAction,
                                     setLanguage,
                                     applyImportedData,
                                     normalizeSkinIndex,
                                     refreshFailedBar,
                                     retryCurrentChapter,
                                     applySkin,
                                     checkBookUpdates,
                                     exportShelfBooks,
                                     importShelfBooks,
                                     askPassword,
                                     encryptExport,
                                     decryptExport,
                                     isEncryptedExport,
                                     maybeDecryptImport,
                                     ttsToggle,
                                     ttsStop,
                                     ttsPlay,
                                     ttsPause,
                                     checkUpdate,
                                     versionNewer,
                                     listThemes,
                                     applySavedTheme,
                                     importTheme,
                                     exportTheme,
                                     deleteTheme,
                                     associateFiles,
                                     copyDiagnostics,
                                     exportFeedback,
                                     setShortcut,
                                     resetShortcuts,
                                     resetAllSettings,
                                     refreshTabs,
                                     collectSettingsSnapshot,
                                     isStatKey,
                                     DEFAULT_SHORTCUTS,
                                     SHORTCUT_LABELS,
                                     TTS,
                                     CONFIG,
                /* V4.3.18/19 可测试能力（AGENTS.md: 新增能力顺手挂进 __reader，冒烟靠它断言） */
                setContentProtect, toggleContentProtect, pushContentProtect, syncCapabilities, runProtectSelfTest,
                /* V4.3.24：把 DB 也挂出来 —— 冒烟要直接造「有密文但解不开」的记录来验证 locked 分支 */
                refreshProtectWarn, verdictForThisMachine, ensureProtectVerdict, DB, restoreSession,
                noteChaptersLocked, noteCryptoDegraded, noteBackupFailed, saveBackup,
                /* 🛡 V4.3.40：书架镜像备份/恢复是新能力，挂出来供端到端探针真跑断言（AGENTS.md 规矩） */
                collectBackupData, restoreFromBackup,
                /* 📑 V4.3.29 新书签模型（#22）：挂出来供冒烟断言「一章多书签 / 按 id 删 / 备注 / 位置」
                   —— AGENTS.md 的规矩：新增能力顺手挂进 __reader，冒烟靠它断言。 */
                addBookmark, removeBookmark, restoreBookmark, setBookmarkNote, goToBookmark, findBookmark,
                normalizeBookmarks, captureBookmarkPos, bookmarkPayload,
                /* 🖼 V4.3.66：真封面三件套挂出来供端到端探针真跑（AGENTS.md 规矩：新增能力挂进 __reader） */
                extractEpubCover, drawCoverToDataUrl, coverDataUrlFromBlob,
                /* 🆕 V4.3.67：重新绑定（第二个参数可注入文件，供探针走完整数据流） */
                startRebindLocalFile,
                /* 📖 V4.3.68：分页引擎挂出来供端到端探针真跑（页边界、翻页四入口、位置保持） */
                setReadMode, toggleReadMode, pagedTurn, gotoPage, refreshPager, currentPageIndex, computePageOffsets,
                /* 🎨 V4.3.69：排版预设（探针真跑三套预设并核对落到的值） */
                applyTypePreset, TYPE_PRESETS,
                /* 📖 V4.3.70：双栏与页边距（探针真跑：切宽窄、量栏数、量页步长、量留白） */
                applyPageMargin, pagedTwoCol, pagePos, pageMax, pagePosRatio, syncTwoCol, computeTwoColOffsets,
                /* 🖍 V4.3.71：批注（探针真跑：选区偏移 → 落盘 → 重开还在 → 跳回原文 → 导出文本） */
                addAnnotation, updateAnnotation, removeAnnotation, findAnnotation, goToAnnotation,
                paintAnnotations, clearAnnotMarks, collectTextNodes, selectionOffsets, chapterTextLen,
                annotPayload, normalizeAnnotations, exportAnnotationsMarkdown, buildAnnotationsMarkdown, ANN_COLORS,
                currentBookMeta,
                /* 📚 V4.3.74：多书进度隔离要真走「从书架切回 A 书」的完整路径（探针用） */
                loadBookIntoReader, persistActiveBook,
                get TWO_COL_MIN(){ return TWO_COL_MIN; }, get twoColOn(){ return twoColOn; } };

            if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
        })();
