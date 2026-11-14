  function renderTOC(chapters, current){
    const box = $('tocList');
    box.innerHTML='';
    if(!chapters || !chapters.length){ box.innerHTML='<div class="empty"></div>'; box.firstChild.textContent=PT('暂无目录','No contents'); return; }
    chapters.forEach(ch=>{
      const div=document.createElement('div');
      div.className='item';
      div.textContent=ch.title || PT('第'+(ch.idx+1)+'章', 'Chapter '+(ch.idx+1));
      if(ch.level) div.style.paddingLeft=(9+ch.level*14)+'px';   /* 📑 V4.3.74 层级缩进（与主窗 renderTOC 同步距） */
      if(ch.idx===current) div.classList.add('active');
      div.addEventListener('click', ()=>send('goto', ch.idx));
      box.appendChild(div);
    });
  }

  // ---------- 搜索 ----------
  function renderSearch(p){
    const box=$('searchResults');
    const hint=$('searchHint');
    if(p && p.results !== undefined){
      if(!p.results.length){ box.innerHTML='<div class="empty"></div>'; box.firstChild.textContent=PT('未找到结果','No results'); hint.textContent=PT('共 0 条结果','0 result'); return; }
      box.innerHTML='';
      p.results.forEach(r=>{
        const div=document.createElement('div');
        div.className='item';
        const t=document.createElement('div'); t.className='t'; t.textContent=r.title || (PT('第', '')+(r.idx+1)+PT('章', ' ch'));
        const s=document.createElement('div'); s.className='s'; s.textContent='…'+(r.snippet||'')+'…';
        div.appendChild(t); div.appendChild(s);
        div.addEventListener('click', ()=>send('goto', { idx:r.idx, query:r.query }));
        box.appendChild(div);
      });
      hint.textContent=PT('共 ', '')+p.results.length+PT(' 条结果，点击跳转', ' results — click to jump');
    }
    if(p && p.focus){ const inp=$('searchInput'); if(inp){ inp.focus(); inp.select(); } }
  }

  /* ===================== 📑 V4.3.29 书签列表 =====================
     工具条上那个独立的「书签」按钮撤销后，三件事在这里收口：
       · 在当前位置加书签（按钮显示当前章已有几条；快捷键默认 Ctrl+Shift+M，可在设置里改）
       · 按标题 / 备注过滤
       · 点击直达章节 / ✕ 删除（V4.3.30 起删除**立刻生效**，原地留 5 秒「撤销」，不再弹确认）
     数据由主窗 bookmarkPayload() 下发：{ bookmarks:[{id,idx,title,pos,mode,note,at}], current, canBookmark, currentCount }
     🟥 渲染必须是**幂等重画**：主窗每 1.5s 会重推一次数据，所以本地的过滤词要存在面板自己的缓存里，
        不然一刷新就被冲掉（过滤纯属本面板视角，不回传主窗）。 */
  /* 📑 V4.3.29：currentBookmarked（布尔）已换成 currentCount（当前章有几条）——
     一章可以有多条书签之后，布尔值会骗人（显示"已加"却看不出加了几个）。 */
  let bmCache = { bookmarks:[], current:-1, canBookmark:false, currentCount:0 };
  /* 📑 V4.3.30（#24）：删书签不再弹 confirm —— 弹确认对「删一条书签」这种小事太重，
     而且打断了正在看列表的视线。改成：立刻删掉，同时在原位留一条灰行「已删除 · 撤销」，
     5 秒内点「撤销」把整条原样塞回去；超时这条才真正消失。
     被删的对象存在 bmUndo（它是上一帧数据的引用，主窗删的是它自己那份，不会变成空对象）。 */
  let bmUndo = null, bmUndoTimer = null;
  const BM_UNDO_MS = 5000;
  function clearBmUndo(){
    if(bmUndoTimer){ clearTimeout(bmUndoTimer); bmUndoTimer = null; }
    bmUndo = null;
  }
  function startBmUndo(bm){
    clearBmUndo();
    bmUndo = bm;
    bmUndoTimer = setTimeout(()=>{ clearBmUndo(); renderBookmarkList({}); }, BM_UNDO_MS);
  }
  /* ═════════════ 🖍 V4.3.71 批注列表 ═════════════
     设计取舍：**不按书分组，按章分组** —— 这个面板永远是"当前这本书"的批注
     （跟书签同一个口径：批注存在书 meta 里，跟着书走），所以"按书"没有意义。
     排序固定为「章 → 章内偏移」，与正文顺序一致，用户从列表能反推书里的位置。 */
  let annCache = { annotations: [], current: 0, canAnnot: false, bookTitle: '' };
  function renderAnnotList(p){
    if(!p) return;
    if(p.annotations !== undefined) annCache.annotations = p.annotations || [];
    if(p.current !== undefined) annCache.current = p.current;
    if(p.canAnnot !== undefined) annCache.canAnnot = !!p.canAnnot;
    if(p.bookTitle !== undefined) annCache.bookTitle = p.bookTitle || '';
    const en = panelLang === 'en';
    const box = $('annotList');
    if(!box) return;
    const cnt = $('annCount');
    if(cnt) cnt.textContent = annCache.annotations.length ? (annCache.annotations.length + (en ? ' items' : ' 条')) : '';
    const exp = $('annExportBtn');
    if(exp) exp.disabled = !annCache.annotations.length;
    const q = (($('annFilter') && $('annFilter').value) || '').trim().toLowerCase();
    const all = annCache.annotations.slice().sort((a,b)=> ((a.idx||0)-(b.idx||0)) || ((a.start||0)-(b.start||0)));
    const hit = q ? all.filter(a=>{
      const hay = ((a.text||'') + ' ' + (a.note||'') + ' ' + (a.title||'')).toLowerCase();
      return hay.indexOf(q) >= 0;
    }) : all;
    box.innerHTML = '';
    if(!all.length){
      const e = document.createElement('div'); e.className = 'empty';
      e.textContent = en ? 'No annotations yet — select text in the reader to highlight it' : '还没有批注。在正文里选中一段文字就会弹出高亮浮层';
      box.appendChild(e); return;
    }
    if(!hit.length){
      const e = document.createElement('div'); e.className = 'empty';
      e.textContent = en ? 'No match' : '没有匹配'; box.appendChild(e); return;
    }
    let lastIdx = -1;
    hit.forEach(a=>{
      if(a.idx !== lastIdx){
        lastIdx = a.idx;
        const h = document.createElement('div'); h.className = 'ann-chap';
        h.textContent = a.title || ((en ? 'Chapter ' : '第') + (a.idx + 1) + (en ? '' : '章'));
        if(a.idx === annCache.current) h.classList.add('cur');
        box.appendChild(h);
      }
      const it = document.createElement('div'); it.className = 'ann-item';
      const dot = document.createElement('span'); dot.className = 'ann-dot dot-' + (a.color || 'yellow');
      const body = document.createElement('div'); body.className = 'ann-body';
      const tx = document.createElement('div'); tx.className = 'ann-text'; tx.textContent = a.text || '';
      body.appendChild(tx);
      if(a.note){
        const nt = document.createElement('div'); nt.className = 'ann-note'; nt.textContent = a.note;
        body.appendChild(nt);
      }
      const del = document.createElement('button'); del.className = 'ann-del';
      /* 🎨 与静态按钮同一套线条图标（不写 ✕ 字符 —— 图标门禁禁止字形按钮） */
      del.innerHTML = ico('close', 'ic');
      del.title = en ? 'Delete this annotation' : '删除这条批注';
      del.addEventListener('click', e=>{ e.stopPropagation(); send('annotDelete', a.id); });
      it.appendChild(dot); it.appendChild(body); it.appendChild(del);
      it.title = en ? 'Jump back to the text' : '跳回原文';
      it.addEventListener('click', ()=>send('annotGo', a.id));
      box.appendChild(it);
    });
  }

  function renderBookmarkList(p){
    if(!p) return;
    if(p.bookmarks !== undefined) bmCache.bookmarks = p.bookmarks || [];
    if(p.current !== undefined) bmCache.current = p.current;
    if(p.canBookmark !== undefined) bmCache.canBookmark = !!p.canBookmark;
    if(p.currentCount !== undefined) bmCache.currentCount = Number(p.currentCount) || 0;
    const en = panelLang === 'en';
    /* 「加书签」按钮（📑 V4.3.29：不再兼任「移除」——一章可以有多条之后，
       点一下到底是加还是删就说不清了；删除统一走列表里每条的 ✕）。
       按钮上如实写出当前章已有几条，用户一眼知道自己加没加过。 */
    const tb = $('bmToggleBtn');
    if(tb){
      const n = bmCache.currentCount;
      tb.classList.toggle('on', n > 0);
      tb.textContent = n > 0 ? ('★ ' + (en ? 'Add another' : '再加一个') + '（' + n + '）')
                             : ('☆ ' + (en ? 'Add bookmark' : '加书签'));
      tb.disabled = !bmCache.canBookmark;
      tb.title = bmCache.canBookmark
        ? (en ? 'Bookmark the current position (a chapter can hold several)' : '在当前位置加一条书签（同一章可以加多条）')
        : (en ? 'Open a book first' : '先打开一本书才能加书签');
    }
    const fEl = $('bmFilter');
    const q = ((fEl && fEl.value) || '').trim().toLowerCase();
    /* 📑 V4.3.29：一章可以有多条 → 排序要先按章、再按章内位置，否则同一章的几条顺序会乱跳。 */
    const all = bmCache.bookmarks.slice().sort((a,b)=>(a.idx-b.idx) || ((Number(a.pos)||0)-(Number(b.pos)||0)));
    /* 📑 V4.3.30（#24）：刚删掉的那条按**同一套排序规则**混回原处，用户能一眼看出它原本在第几章。
       它不再是书签了，所以计数不计它（否则会出现「明明删了还显示 1 条」的假象）。 */
    let rows = all, ghostId = null;
    if(bmUndo && !all.some(b => b.id === bmUndo.id)){
      ghostId = bmUndo.id;
      rows = all.concat([bmUndo]).sort((a,b)=>(a.idx-b.idx) || ((Number(a.pos)||0)-(Number(b.pos)||0)));
    }
    // 过滤同时匹配标题和备注（写了「伏笔」也能搜到）
    const list = q ? rows.filter(b=>(String(b.title||'')+' '+String(b.note||'')).toLowerCase().indexOf(q)!==-1) : rows;
    const realN = ghostId ? list.filter(b => b.id !== ghostId).length : list.length;
    const box = $('bookmarkListPanel');
    if(!box) return;
    box.innerHTML = '';
    const cnt = $('bmCount'), hint = $('bmHint');
    /* 🟥 判空必须用 rows 而不是 all：把最后一条书签删掉时 all 已经是空的，
       但此时**恰恰最需要**那行「已删除 · 撤销」留在屏幕上（用 all.length 判断就会把它吃掉）。 */
    if(!rows.length){
      box.innerHTML = '<div class="empty">'+(en?'No bookmarks yet':'还没有书签')+'</div>';
      if(cnt) cnt.textContent = '';
      if(hint) hint.textContent = en
        ? 'Tip: Ctrl+Shift+M bookmarks the current chapter (change it in Settings ▸ Shortcuts)'
        : '提示：Ctrl+Shift+M 给当前章加书签（可在「设置 ▸ 快捷键」里改键）';
      return;
    }
    if(!list.length){
      box.innerHTML = '<div class="empty">'+(en?'No bookmark matches':'没有匹配的书签')+'</div>';
      if(cnt) cnt.textContent = '0 / '+all.length;
      if(hint) hint.textContent = en ? 'Clear the filter to see all' : '清空过滤词看全部';
      return;
    }
    list.forEach(b=>{
      /* 📑 V4.3.30（#24）：幽灵行 —— 数据里已经没了，只是留个位置给「撤销」。 */
      if(ghostId && b.id === ghostId){
        const gd = document.createElement('div');
        gd.className = 'item bm-item bm-ghost';
        const gl = document.createElement('div');
        gl.className = 'bm-main';
        const gt = document.createElement('div');
        gt.className = 'bm-title';
        gt.textContent = b.title || (PT('第', '')+(b.idx+1)+PT('章', ' ch'));
        const gm = document.createElement('div');
        gm.className = 'bm-meta';
        gm.textContent = en ? 'deleted' : '已删除';
        gl.appendChild(gt); gl.appendChild(gm);
        const ub = document.createElement('span');
        ub.className = 'bm-undo';
        ub.textContent = en ? 'Undo' : '撤销';
        ub.title = en ? 'Put it back' : '放回去';
        ub.addEventListener('click', e=>{ e.stopPropagation(); clearBmUndo(); send('bookmarkUndo', { bm: b }); });
        gd.appendChild(gl); gd.appendChild(ub);
        box.appendChild(gd);
        return;
      }
      const div = document.createElement('div');
      div.className = 'item bm-item' + (b.idx === bmCache.current ? ' active' : '');
      const title = b.title || ('第'+(b.idx+1)+'章');
      // 左半：标题 + 章内位置 + 备注
      const left = document.createElement('div');
      left.className = 'bm-main';
      const tEl = document.createElement('div');
      tEl.className = 'bm-title';
      tEl.textContent = title;
      const pct = Math.round((Number(b.pos) || 0) * 100);
      const meta = document.createElement('div');
      meta.className = 'bm-meta';
      meta.textContent = pct > 0 ? (en ? ('at ' + pct + '% of the chapter') : ('读到这章 ' + pct + '%')) : (en ? 'at the beginning' : '章节开头');
      left.appendChild(tEl);
      left.appendChild(meta);
      if(b.note){
        const nt = document.createElement('div');
        nt.className = 'bm-note';
        /* 🎨 V4.3.63：备注前缀 📝 → 铅笔线条图标（edit），与其它按钮同一套 */
        nt.innerHTML = ico('edit', 'ic') + '<span class="bm-note-tx"></span>';
        nt.lastChild.textContent = b.note;
        left.appendChild(nt);
      }
      // 右半：改备注 + 删除（都是**按 id**操作，一章多书签才删得准）
      const acts = document.createElement('div');
      acts.className = 'bm-acts';
      const edit = document.createElement('span');
      edit.className = 'bm-edit';
      edit.textContent = '✎';
      edit.title = en ? 'Edit the note' : '写/改备注';
      edit.addEventListener('click', e=>{
        e.stopPropagation();
        const cur = window.prompt(en ? 'Note for this bookmark' : '给这条书签写点备注（可留空）', b.note || '');
        if(cur === null) return;
        send('bookmarkNote', { id: b.id, note: cur });
      });
      const del = document.createElement('span');
      del.className = 'bm-del';
      /* 🎨 V4.3.63：✕ 字符 → 与静态按钮同一套线条图标（close） */
      del.innerHTML = ico('close', 'ic');
      del.title = en ? 'Delete this bookmark' : '删除这个书签';
      /* 📑 V4.3.30（#24）：删除不再弹确认 —— 弹框对「删一条书签」这种小事太重，还会把视线从列表拽走。
         改成立刻删 + 原位留一手「撤销」（见 startBmUndo），破坏性操作的手感从「先问」变成「删了能反悔」。 */
      del.addEventListener('click', e=>{
        e.stopPropagation();
        startBmUndo(b);
        send('bookmarkDel', { id: b.id });
      });
      acts.appendChild(edit);
      acts.appendChild(del);
      div.appendChild(left);
      div.appendChild(acts);
      div.addEventListener('click', ()=>send('bookmarkGoto', { id: b.id }));
      box.appendChild(div);
    });
    if(cnt) cnt.textContent = realN + ' / ' + all.length + (en ? '' : ' 条');
    if(hint) hint.textContent = ghostId ? (en ? 'Deleted — press Undo to put it back' : '已删除，点「撤销」放回去')
                                        : (en ? 'Click a bookmark to jump; ✕ to delete' : '点击书签直达章节，✕ 删除');
  }
  function initBookmark(){
    const tf = $('bmToggleBtn');
    if(tf) tf.addEventListener('click', ()=>send('bookmark'));
    const f = $('bmFilter');
    // 只按本地缓存重画，不去主窗要数据：过滤是纯本地视角，回传反而会和 1.5s 同步打架
    if(f) f.addEventListener('input', ()=>renderBookmarkList({}));
    const c = $('bmFilterClear');
    if(c) c.addEventListener('click', ()=>{ if(f){ f.value=''; renderBookmarkList({}); } });
    const fEnter = $('bmFilter');
    if(fEnter) fEnter.addEventListener('keydown', e=>{ if(e.key==='Escape') send('close'); });
  }

  // ---------- 书源 ----------
