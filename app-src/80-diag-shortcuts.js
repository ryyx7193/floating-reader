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
