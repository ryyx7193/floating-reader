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
