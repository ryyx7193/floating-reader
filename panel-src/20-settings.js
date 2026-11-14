  function initSettings(){
    $('closeDelaySlider').addEventListener('input', e=>{ $('closeDelayValue').textContent=e.target.value+'ms'; send('closeDelay', +e.target.value); });
    // 🟥 V4.3.17：伪装皮肤下拉的 change 已上移到「与 type 无关的通用初始化区」（见文件末尾初始化段），
    // 这里不再绑定 —— 它住在 #view-toolbar，挂在 initSettings() 里根本执行不到（本版修的就是这个）。
    $('fgWatchSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('fgWatch'); });
    /* 🆕 V4.4.0：后台朗读开关（状态由主窗回写，这里只发动作 + 立刻翻转视觉） */
    $('ttsBgSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('ttsBg'); });
    if($('autoUpdateSwitch')){ $('autoUpdateSwitch').classList.toggle('active', !!window.__autoUpdateOn); $('autoUpdateSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('autoUpdate'); }); }
    if($('autoUpdateMinSelect')) $('autoUpdateMinSelect').addEventListener('change', e=>send('autoUpdateMin', +e.target.value));
    $('fgWatchInput').addEventListener('change', e=>{ send('fgWatchList', e.target.value); });
    /* 🆕 V4.3.53（R12-2）伴随模式的四个控件（开关 / 目标程序 / 陪显示时机 / 贴边位置）。
       「贴回去」按钮走 #view-settings 的 [data-a] 通用委托（文件末尾那段），不用单独绑。 */
    if($('companionSwitch')) $('companionSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('companion'); });
    if($('companionInput')) $('companionInput').addEventListener('change', e=>{ send('companionTarget', e.target.value); });
    if($('companionModeSelect')) $('companionModeSelect').addEventListener('change', e=>{ send('companionMode', e.target.value); });
    if($('companionEdgeSelect')) $('companionEdgeSelect').addEventListener('change', e=>{ send('companionEdge', e.target.value); });
    /* 🆕 V4.3.54（吸色联动）：开关只发动作，状态回显走 settingsPayload 的 companionTint。
       🎯 检测按钮不用绑 —— 走 #view-settings [data-a] 通用委托（companionRedock 同款）。
       🆕 V4.3.55：生命周期联动两开关同套路（发动作、回显走 payload）。 */
    if($('companionTintSwitch')) $('companionTintSwitch').addEventListener('click', ()=>{ send('companionTint'); });
    if($('companionLinkCloseSwitch')) $('companionLinkCloseSwitch').addEventListener('click', ()=>{ send('companionLinkClose'); });
    if($('companionLinkMinSwitch')) $('companionLinkMinSwitch').addEventListener('click', ()=>{ send('companionLinkMin'); });
    /* 🆕 V4.3.53（建议 1）目标程序历史候选：与主窗共用同源 localStorage 的 fct 键（数组，
       主窗 setCompanionTarget 单一收口维护）。这里只读，记录不在这边做 ——
       面板改目标会经桥转发回主窗，自然会记进历史。
       ⚠️ 面板窗口是**常驻复用**的（createPanel 对已存在的直接返回），光在启动时灌一次
       会滞后（浮层里新加的目标，面板里要重开才见）——所以挂在 focus 上，每次点到
       面板都重灌一遍（量级 = 5 条 option，可忽略）。
       键名与主窗 CONFIG.KEYS.COMPANION_TGT_HIST 同源（'fct'），用常量传递 ——
       与上面 SRC_HIST_KEY 同款（键登记审计只查字面量直呼 localStorage 的形态）。 */
    const COMPANION_TGT_HIST_KEY = 'fct';
    function fillCompanionTargetDatalist(){
        const dl = document.getElementById('dlCompanionTarget'); if(!dl) return;
        let arr = [];
        try{ const o = JSON.parse(localStorage.getItem(COMPANION_TGT_HIST_KEY) || '[]'); if(Array.isArray(o)) arr = o; }catch(e){}
        dl.innerHTML = '';
        arr.filter(Boolean).slice(0, 5).forEach(function(name){
            const o = document.createElement('option'); o.value = String(name); dl.appendChild(o);
        });
    }
    fillCompanionTargetDatalist();
    window.addEventListener('focus', fillCompanionTargetDatalist);
    $('autoContrastSwitch').addEventListener('click', function(){ this.classList.toggle('active'); send('autoContrast'); });
    [['shortcutPrev','prev'],['shortcutNext','next'],['shortcutHide','hide'],['shortcutFocus','focus'],
     ['shortcutSearch','search'],['shortcutGlobalSearch','globalSearch'],['shortcutAutoScroll','autoScroll'],
     ['shortcutPickPoint','pickPoint'],['shortcutToolbar','toolbar'],['shortcutToc','toc'],
     ['shortcutContentProtect','contentProtect'],['shortcutBookmark','bookmark']].forEach(([id,key])=>{
      const el=$(id); if(!el) return;
      el.addEventListener('keydown', e=>{ e.preventDefault(); e.stopPropagation(); const ks=formatShortcut(e); if(ks){ el.value=ks; send('shortcut', {key, value:ks}); } });
    });
    const ttsRate=$('ttsRateSlider');
    if(ttsRate) ttsRate.addEventListener('input', e=>{ $('ttsRateValue').textContent=(+e.target.value).toFixed(1)+'x'; send('ttsRate', +e.target.value); });
    const ttsVoice=$('ttsVoiceSelect');
    if(ttsVoice) ttsVoice.addEventListener('change', e=>send('ttsVoice', e.target.value));
    const updInput=$('updateUrlInput');
    if(updInput) updInput.addEventListener('change', e=>send('updateUrl', e.target.value.trim()));
    const fbInput=$('feedbackUrlInput');
    if(fbInput) fbInput.addEventListener('change', e=>send('feedbackUrl', e.target.value.trim()));
    const exportLogsBtn=$('exportLogsBtn');
    if(exportLogsBtn) exportLogsBtn.addEventListener('click', async ()=>{ const old=exportLogsBtn.textContent; exportLogsBtn.textContent=PT('导出中...', 'Exporting...'); try{ const r = api && api.exportLogs ? await api.exportLogs() : null; exportLogsBtn.textContent = (r && r.ok) ? PT('已导出', 'Exported') : ((r && r.canceled) ? PT('已取消', 'Cancelled') : PT('无日志', 'No logs')); }catch(e){ exportLogsBtn.textContent=PT('失败', 'Failed'); } setTimeout(()=>{ exportLogsBtn.textContent=PT('导出日志', 'Export logs'); }, 1500); });
    const viewLogsBtn=$('viewLogsBtn');
    if(viewLogsBtn) viewLogsBtn.addEventListener('click', async ()=>{
      const box=$('logBox');
      if(box.style.display !== 'none'){ box.style.display='none'; return; }
      viewLogsBtn.textContent=PT('读取中…', 'Reading…');
      try{
        const r = api && api.tailLog ? await api.tailLog(200) : null;
        if(r && r.ok){
          const lines = (r.lines || []).slice().reverse();
          $('logPathHint').textContent = r.path + PT('（最新在前）', '(newest first)');
          $('logContent').textContent = lines.length ? lines.join('\n') : PT('（日志为空）', '(log is empty)');
          box.style.display = '';
          viewLogsBtn.textContent=PT('收起日志', 'Collapse log');
          return;
        }
        $('logPathHint').textContent = (r && r.error) || PT('读取日志失败', 'Failed to read logs');
        $('logContent').textContent = '';
        box.style.display = '';
      }catch(e){ $('logPathHint').textContent = PT('读取日志失败：', 'Failed to read logs: ')+(e && e.message || e); }
      viewLogsBtn.textContent=PT('查看日志', 'View log');
    });
    const openLogsBtn=$('openLogsBtn');
    if(openLogsBtn) openLogsBtn.addEventListener('click', async ()=>{ try{ await (api && api.openLogFolder && api.openLogFolder()); }catch(e){} });
    document.querySelectorAll('#view-settings [data-a], #disguiseQuick [data-a]').forEach(el=>{
      el.addEventListener('click', ()=>{
        const a = el.getAttribute('data-a');
        let v = el.getAttribute('data-v');
        if(a === 'themeApply' || a === 'themeExport' || a === 'themeDelete'){ const sel=$('themeSelect'); v = sel ? sel.value : ''; }
        if(a === 'openUpdateUrl'){ v = lastUpdateUrl; }
        send(a, v === null ? undefined : v);
      });
    });
  }

  /* 🔊 V4.3.29 语音名 → 人话标签。
     键是系统语音的**完整原名**（不同 Windows 版本可能略有差异，命中不了就退回通用清洗）。
     🟥 V4.3.45（R4-3）：值从"单个中文串"改成 `[中文, 英文]` 对 —— 原先英文界面下
     整个下拉仍然是中文（探针 payload 只带 theme.lang，走到这一步的分支它测不到）。 */
  const VOICE_LABELS = {
    'Microsoft Huihui - Chinese (Simplified, PRC)': ['慧慧（中文·女）', 'Huihui (Chinese, female)'],
    'Microsoft Yaoyao - Chinese (Simplified, PRC)': ['瑶瑶（中文·女）', 'Yaoyao (Chinese, female)'],
    'Microsoft Kangkang - Chinese (Simplified, PRC)': ['康康（中文·男）', 'Kangkang (Chinese, male)'],
    'Microsoft Xiaoxiao - Chinese (Simplified, PRC)': ['晓晓（中文·女·自然）', 'Xiaoxiao (Chinese, female, natural)'],
    'Microsoft Yunxi - Chinese (Simplified, PRC)': ['云希（中文·男·自然）', 'Yunxi (Chinese, male, natural)'],
    'Microsoft Yunyang - Chinese (Simplified, PRC)': ['云扬（中文·男·自然）', 'Yunyang (Chinese, male, natural)'],
    'Microsoft Yunye - Chinese (Simplified, PRC)': ['云野（中文·男·自然）', 'Yunye (Chinese, male, natural)'],
    'Microsoft Xiaoyi - Chinese (Simplified, PRC)': ['晓伊（中文·女·自然）', 'Xiaoyi (Chinese, female, natural)'],
    'Microsoft David - English (United States)': ['David（英语·男）', 'David (English, male)'],
    'Microsoft Zira - English (United States)': ['Zira（英语·女）', 'Zira (English, female)'],
    'Microsoft Mark - English (United States)': ['Mark（英语·男）', 'Mark (English, male)'],
    'Microsoft Aria - English (United States)': ['Aria（英语·女·自然）', 'Aria (English, female, natural)'],
    'Microsoft Jenny - English (United States)': ['Jenny（英语·女·自然）', 'Jenny (English, female, natural)'],
    'Microsoft Guy - English (United States)': ['Guy（英语·男·自然）', 'Guy (English, male, natural)']
  };
  function voiceLabel(v){
    if(!v) return '';
    const hit = VOICE_LABELS[v.name];
    if(hit) return PT(hit[0], hit[1]);
    // 兜底：去掉 "Microsoft " 前缀和尾巴上的语言括注，再补一个语言标签
    let s = String(v.name || '').replace(/^Microsoft\s+/i, '').replace(/\s*[-–]\s*[A-Za-z][^)]*$/, '').trim();
    const lang = String(v.lang || '').toLowerCase();
    const tag = lang.indexOf('zh') === 0 ? PT('中文', 'Chinese') : (lang.indexOf('en') === 0 ? PT('英语', 'English') : lang);
    return tag ? (panelLang === 'en' ? (s + ' (' + tag + ')') : (s + '（' + tag + '）')) : s;
  }
  // 排序：当前界面语言的语音排前面，其次中文，再次按名字
  function voiceScore(v){
    const lang = String((v && v.lang) || '').toLowerCase();
    let sc = 0;
    if(panelLang === 'en'){ if(lang.indexOf('en') === 0) sc += 20; else if(lang.indexOf('zh') === 0) sc += 10; }
    else { if(lang.indexOf('zh') === 0) sc += 20; else if(lang.indexOf('en') === 0) sc += 10; }
    if(/自然|Natural|Neural/i.test(String((v && v.name) || ''))) sc += 5;
    return sc;
  }

  /* 🟥 V4.3.52（R11-2）：下拉重建前的脏检查。
     updateSettings() 每 1.5 秒被主窗的 syncSettingsPanel() 推一次；原先两个下拉都无条件
     `sel.innerHTML=''` 再逐个 appendChild —— 于是：
       ① 用户正展开下拉挑语音 / 挑主题时，整个 <option> 列表被就地销毁，下拉当场收起；
       ② 系统语音常有几十项，等于每 1.5 秒造一批新节点再扔掉，纯属白烧。
     改成先比一遍"这次渲染出来会不会和现在一样"，一样就只校正选中项、不动 DOM。
     want 形如 [[value, text], ...]。 */
  function optionsMatch(sel, want){
    const os = sel.querySelectorAll('option');
    if(os.length !== want.length) return false;
    for(let i=0;i<want.length;i++){
      if(String(os[i].value) !== String(want[i][0])) return false;
      if(String(os[i].textContent) !== String(want[i][1])) return false;
    }
    return true;
  }
  function fillOptions(sel, want){
    sel.innerHTML='';
    want.forEach(function(pair){ const o=document.createElement('option'); o.value=pair[0]; o.textContent=pair[1]; sel.appendChild(o); });
  }

  function updateSettings(p){
    if(p.closeDelay !== undefined){ $('closeDelaySlider').value=p.closeDelay; $('closeDelayValue').textContent=p.closeDelay+'ms'; }
    if(p.disguiseSkin !== undefined){ const s=$('disguiseSkinSelect'); if(s) s.value = p.disguiseSkin; }
    if(p.isDisguised !== undefined){
      const b=$('disguiseToggleBtn'); if(b) b.textContent = p.isDisguised ? (panelLang==='en'?'Exit disguise':'退出伪装') : (panelLang==='en'?'Enter disguise':'进入伪装');
    }
    if(p.fgWatchEnabled !== undefined) $('fgWatchSwitch').classList.toggle('active', p.fgWatchEnabled);
    if(p.ttsBg !== undefined) $('ttsBgSwitch').classList.toggle('active', p.ttsBg);
    /* 🟥 V4.3.52（R11-1）：回写前先看一眼"用户是不是正敲着它"。
       #fgWatchInput 用 `change` 上报（失焦 / 回车才提交），而主窗每 1.5 秒
       `syncSettingsPanel()` 把 `state.fgWatchList` 推回来 —— 中间这 1.5 秒里
       用户输入的内容还没提交，一次回写就把它抹回旧值：打字稍作停顿（想一下进程名、
       切一下输入法）内容就没了，看上去像"这功能坏了"。
       **同一个函数里**紧邻的 #updateUrlInput / #feedbackUrlInput 早已写了
       `document.activeElement !== el` 保护，唯独漏了这一个 ——
       与 R7-1「ms-settings 只修了一个入口」、R9-2「书源规则导入漏了返回值」同族：
       不是不知道有这个坑，是只补了一部分。 */
    if(p.fgWatchList !== undefined){ const el=$('fgWatchInput'); if(el && document.activeElement !== el) el.value = p.fgWatchList; }
    /* 🟥 V4.3.49（R8-1）：开关状态是"用户想要的"，这一条是"实际发生了什么"。
       观察器起不来 / 自己退出时，主进程回传到这里就地说明 —— 同 shortcutError 的口径。 */
    if(p.fgWatchError !== undefined){
      const fh = $('fgWatchHint');
      if(fh){ fh.textContent = p.fgWatchError || ''; fh.style.display = p.fgWatchError ? 'block' : 'none'; }
    }
    /* 🆕 V4.3.53（R12-2）伴随模式：开关 / 目标程序 / 陪显示时机 / 贴边位置 / 失败说明 */
    if(p.companionEnabled !== undefined){ const s=$('companionSwitch'); if(s) s.classList.toggle('active', p.companionEnabled); }
    /* 目标程序也是文本框 —— 同样带上"用户正敲着它"的保护（R11-1 的教训：紧邻的输入框要一视同仁）。 */
    if(p.companionTarget !== undefined){ const el=$('companionInput'); if(el && document.activeElement !== el) el.value = p.companionTarget; }
    if(p.companionMode !== undefined){ const el=$('companionModeSelect'); if(el) el.value = p.companionMode; }
    if(p.companionEdge !== undefined){ const el=$('companionEdgeSelect'); if(el) el.value = p.companionEdge; }
    /* 🆕 V4.3.54（吸色联动）开关回显 */
    if(p.companionTint !== undefined){ const s=$('companionTintSwitch'); if(s) s.classList.toggle('active', !!p.companionTint); }
    /* 🆕 V4.3.55：生命周期联动开关回显 */
    if(p.companionLinkClose !== undefined){ const s=$('companionLinkCloseSwitch'); if(s) s.classList.toggle('active', !!p.companionLinkClose); }
    if(p.companionLinkMin !== undefined){ const s=$('companionLinkMinSwitch'); if(s) s.classList.toggle('active', !!p.companionLinkMin); }
    if(p.companionError !== undefined){
      const fh = $('companionHint');
      if(fh){ fh.textContent = p.companionError || ''; fh.style.display = p.companionError ? 'block' : 'none'; }
    }
    /* 「嵌入暂停」是运行时的真实状态，不是设置值 —— 就地写清楚为什么它不跟着目标跑了 */
    if(p.companionDockPaused !== undefined){
      const d = $('companionDockState');
      if(d) d.textContent = p.companionDockPaused
        ? PT(' 已暂停嵌入（你挪走了窗口），点「贴回去」恢复', ' Embed paused (you moved it) - click "Dock again"')
        : '';
    }
    if(p.companionDockReady === false){
      const d2 = $('companionDockState');
      if(d2) d2.textContent = PT(' 先把「嵌入位置」选一个再点', ' Pick an embed area first');
    }
    if(p.autoContrast !== undefined) $('autoContrastSwitch').classList.toggle('active', p.autoContrast);    if(p.autoUpdate !== undefined){ const au=$('autoUpdateSwitch'); if(au) au.classList.toggle('active', p.autoUpdate); }
    if(p.autoUpdateMin !== undefined){ const m=$('autoUpdateMinSelect'); if(m) m.value = String(p.autoUpdateMin); }
    if(p.shortcuts){ $('shortcutPrev').value=p.shortcuts.prev; $('shortcutNext').value=p.shortcuts.next; $('shortcutHide').value=p.shortcuts.hide; $('shortcutFocus').value=p.shortcuts.focus; }
    if(p.shortcuts){
      const sc = p.shortcuts;
      // 🟥 V4.3.37：补 shortcutToc —— 原来漏了这一项，「目录」一栏永远是空的（改键后也不回填），
      //           用户会以为目录没有快捷键，或看到 UI 与实际不一致。
      const map = { shortcutPrev:'prev', shortcutNext:'next', shortcutHide:'hide', shortcutFocus:'focus', shortcutSearch:'search', shortcutGlobalSearch:'globalSearch', shortcutAutoScroll:'autoScroll', shortcutPickPoint:'pickPoint', shortcutToolbar:'toolbar', shortcutContentProtect:'contentProtect', shortcutBookmark:'bookmark', shortcutToc:'toc' };
      Object.keys(map).forEach(id => { const el=$(id); if(el && sc[map[id]] !== undefined) el.value = sc[map[id]]; });
    }
    /* 🆘 V4.3.28：改键冲突就地显示（主窗 push 过来的 shortcutError；成功时清空） */
    if(p.shortcutError !== undefined){
      const h = $('shortcutHint');
      if(h){ h.textContent = p.shortcutError || ''; h.style.display = p.shortcutError ? 'block' : 'none'; }
    }
    if(p.ttsRate !== undefined){ const s=$('ttsRateSlider'); if(s){ s.value=p.ttsRate; $('ttsRateValue').textContent=(+p.ttsRate).toFixed(1)+'x'; } }
    /* 🔊 V4.3.29：语音下拉改说人话。
       原来直接把 "Microsoft Huihui - Chinese (Simplified, PRC)" 原样摆出来，
       用户根本分不清哪个是中文、哪个是男声 —— 于是大多数人一直用着默认的机械音还不知道能换。 */
    if(p.voices){
      const sel=$('ttsVoiceSelect');
      if(sel){
        const cur = p.ttsVoice || sel.value || '';
        const sorted = (p.voices||[]).slice().sort((a,b)=>voiceScore(b)-voiceScore(a));
        /* R11-2：只在"渲染出来会不一样"时才重建（清单变了 / 语言切了 / 语音增减）。 */
        const want = [['', PT('系统默认','System default')]].concat(sorted.map(v=>[v.name, voiceLabel(v)]));
        if(!optionsMatch(sel, want)) fillOptions(sel, want);
        sel.value = cur;
      }
      const hint=$('ttsVoiceHint');
      if(hint){
        const all=(p.voices||[]); const zh=all.filter(v=>/^zh/i.test(v.lang||'')).length;
        hint.textContent = !all.length
          ? (panelLang==='en' ? 'No speech voices detected on this system.' : '这台机器上没检测到可用语音。')
          : (panelLang==='en'
            ? ('Detected ' + all.length + ' system voices (' + zh + ' Chinese). These are offline voices; for more natural sound, add "natural voices" in Windows Settings ▸ Time & language ▸ Speech.')
            : ('已检测到 ' + all.length + ' 个系统语音（中文 ' + zh + ' 个），离线可用。想要更自然的声音：点上面按钮去系统里加装「自然语音」，装完重开本软件就会自动出现在这里。'));
      }
    }
    /* R11-2：同语音下拉 —— 主题清单没变就不动 DOM。 */
    if(p.themes){
      const sel=$('themeSelect');
      if(sel){
        const want=(p.themes.length? p.themes : ['（暂无主题）']).map(n=>[String(n), String(n)]);
        if(!optionsMatch(sel, want)) fillOptions(sel, want);
        if(p.activeTheme) sel.value = p.activeTheme;
      }
    }
    if(p.updateUrl !== undefined){ const el=$('updateUrlInput'); if(el && document.activeElement !== el) el.value = p.updateUrl; }
    if(p.feedbackUrl !== undefined){ const el=$('feedbackUrlInput'); if(el && document.activeElement !== el) el.value = p.feedbackUrl; }
    if(p.updateResult !== undefined){ const el=$('updateResult'); if(el) el.textContent = p.updateResult; }
    if(p.updateDownloadUrl !== undefined){
      lastUpdateUrl = p.updateDownloadUrl || '';
      const btn=$('updateOpenBtn');
      if(btn) btn.style.display = lastUpdateUrl ? 'inline-block' : 'none';
    }
    if(p.associateResult !== undefined){ const el=$('associateResult'); if(el) el.textContent = p.associateResult; }
  }

  // ---------- 目录 ----------
