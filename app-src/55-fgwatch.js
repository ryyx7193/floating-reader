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
