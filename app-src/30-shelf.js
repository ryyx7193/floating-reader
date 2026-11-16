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
