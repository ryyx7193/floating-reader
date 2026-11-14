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
