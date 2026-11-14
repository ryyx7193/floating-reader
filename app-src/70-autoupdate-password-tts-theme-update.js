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
                let dragging=false, resizing=false, resizeStart=null;
                // 起手阶段（mousedown 后 ~520ms）渲染层让位：主进程在 16ms 轮询光标直接驱动窗口
                //（跳过 mousemove 的帧对齐等待，起手延迟约减半）；之后恢复 mousemove 驱动保证丝滑。
                let dragStartupPhase=false;
                // 拖动期间给 <body> 挂标记：CSS 会临时关掉 backdrop-filter / 大面积阴影 / 过渡。
                // 半透明无边框窗口移动时这些最费合成，是「重影」的主因。
                const setDraggingFlag = on => { try{ document.body.classList.toggle('dragging', !!on); }catch(err){} };
                document.addEventListener('mousedown', e=>{
                    if(e.button!==0) return;
                    if(e.target && e.target.closest && e.target.closest('#resizeGrip')){ resizing=true; resizeStart={x:e.screenX,y:e.screenY}; if(window.readerAPI&&window.readerAPI.startResize) window.readerAPI.startResize(); e.preventDefault(); return; }
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
