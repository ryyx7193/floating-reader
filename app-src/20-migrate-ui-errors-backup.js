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
