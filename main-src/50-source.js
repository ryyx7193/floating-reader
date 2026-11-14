const SOURCE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let sourceFetchCancelled = false;

function sourceRulesFile() {
  return path.join(app.getPath('userData'), 'sources.json');
}

function loadSourceRules() {
  try {
    if (fs.existsSync(sourceRulesFile())) {
      const arr = JSON.parse(fs.readFileSync(sourceRulesFile(), 'utf8'));
      if (Array.isArray(arr)) return arr;
    }
  } catch (e) { logToFile('error', 'load source rules failed: ' + e.message); }
  return [];
}

function saveSourceRules(rules) {
  try { fs.writeFileSync(sourceRulesFile(), JSON.stringify(rules, null, 2), 'utf8'); return true; }
  catch (e) { logToFile('error', 'save source rules failed: ' + e.message); return false; }
}

function validateSourceRule(rule) {
  if (!rule || typeof rule !== 'object') return TT('规则必须是对象','Rule must be an object');
  if (!rule.name || typeof rule.name !== 'string') return TT('缺少名称','Missing name');
  if (!rule.chapterList || typeof rule.chapterList !== 'object' || !rule.chapterList.item) return TT('缺少章节列表选择器 chapterList.item','Missing chapter-list selector: chapterList.item');
  if (!rule.content || typeof rule.content !== 'object' || !rule.content.content) return TT('缺少正文选择器 content.content','Missing content selector: content.content');
  return null;
}

/* 🛡 V4.3.33（SSRF 收口）：书源规则是**可导入的第三方数据**，它的 URL 模板由规则作者决定，
   而这些 URL 会被主进程真去请求、响应正文还会回传给渲染层 ——
   等于把「读内网」开放给了任何一条导入的规则。
   这里只拦「本机 / 内网 / 链路本地」三类地址，**公网站点一律照放**（书源本来就该能访问任意小说站，
   不做公网白名单，否则正常书源全废）。重定向每一跳都会重新过这道校验，因为 step() 每次都重算。
   已知局限：拦不住「域名解析到内网」的 DNS 重绑定 —— 那需要在 connect 前解析 IP 再判，
   属于加固级别；当前能挡住的是「直接写内网 IP / localhost / 元数据地址」这类直球。 */

/* 🧩 V4.3.79（F5/S3 模块化第三刀）：出网守卫与统一 GET 搬到 lib/net.js。
   注入 TT / logToFile —— TT 是函数引用，切语言后内部读到的仍是当前语言。 */
const { createNet } = require('./lib/net.js');
const { isBlockedHost, guardedLookup, httpGet } = createNet({ tt: TT, log: logToFile, ua: SOURCE_UA });

// 保留旧名字做薄包装，调用点无需改动
function sourceFetch(urlStr, timeout) {
  return httpGet(urlStr, { timeout: timeout || 15000 });
}

function sourceDecode(buf, encoding) {
  const enc = String(encoding || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  let text = null;
  if (enc === 'gbk' || enc === 'gb2312' || enc === 'gb18030') {
    if (iconv) text = iconv.decode(buf, 'gb18030');
  } else if (enc === 'big5') {
    if (iconv) text = iconv.decode(buf, 'big5');
  } else if (enc && enc !== 'utf-8' && enc !== 'utf8') {
    if (iconv) { try { text = iconv.decode(buf, enc); } catch (e) {} }
  }
  /* 🟥 V4.3.37：数字实体清洗必须**所有分支**都过 —— 原先只有"未声明编码"的兜底路径会 sanitize，
     于是规则里一写 encoding=gbk，含超范围实体（如 &#1332990;）的页面就原样进 cheerio 并抛
     Invalid code point，整章被标 failed，用户还以为是自己的选择器写错了。 */
  if (text !== null) return sanitizeNumericEntities(text);
  /* 没声明编码时才猜。旧实现是「UTF-8 解出替换符就换 GB18030」，只能覆盖 GBK 系：
     Big5 页面被 GB18030 解是**不会**产生替换符的（GB18030 字节面很宽），
     结果是满屏看不懂的汉字而且换不回来 —— 所以改交 decodeBuffer 统一判（含 BOM / UTF-16 / 简繁投票）。 */
  return sanitizeNumericEntities(decodeBuffer(buf));
}

// 部分站点会写出超范围的数字实体（如 &#1332990;），解析时会抛 Invalid code point
function sanitizeNumericEntities(html) {
  const fix = function (n) {
    if (!Number.isFinite(n) || n < 0 || n > 0x10FFFF) return '';
    if (n >= 0xD800 && n <= 0xDFFF) return '';
    try { return String.fromCodePoint(n); } catch (e) { return ''; }
  };
  return String(html)
    .replace(/&#x([0-9a-f]{1,8});/gi, function (m, h) { return fix(parseInt(h, 16)); })
    .replace(/&#(\d{1,10});/g, function (m, d) { return fix(parseInt(d, 10)); });
}

function htmlToText($el) {
  if (!$el || !$el.length) return '';
  const clone = $el.clone();
  try { clone.find('script,style').remove(); } catch (e) {}
  let html = clone.html() || '';
  html = html.replace(/<\s*br\s*\/?\s*>/gi, '\n')
             .replace(/<\s*\/\s*p\s*>/gi, '\n')
             .replace(/<\s*\/\s*div\s*>/gi, '\n')
             .replace(/<\s*\/\s*li\s*>/gi, '\n');
  const text = cheerio.load('<div>' + html + '</div>').text();
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function parseChapterList(html, pageUrl, rule) {
  if (!cheerio) return { error: TT('解析组件未加载','Parser component not loaded') };
  const $ = cheerio.load(html);
  const cl = rule.chapterList;
  const items = $(cl.item).toArray();
  if (!items.length) return { error: TT('未匹配到章节，请检查选择器','No chapters matched — check the selectors') };
  const chapters = [];
  let anchorSkipped = 0;   // V4.3.38：因「与目录页同路径、只有 #锚点不同」而被丢弃的条目数
  for (const el of items) {
    const $el = $(el);
    let title = $el.text().trim();
    if (cl.titleAttr) { const tv = $el.attr(cl.titleAttr); if (tv && tv.trim()) title = tv.trim(); }
    const linkAttr = cl.linkAttr || 'href';
    let link = $el.attr(linkAttr);
    if (!link) { const child = $el.find('a').first(); if (child.length) link = child.attr('href'); }
    if (!link) continue;
    /* 🟥 V4.3.37：先看**原始链接的协议**，再谈拼接。
       原先的顺序是"先 new URL、再拼 linkPrefix、最后才判 http" —— 而
       `new URL('javascript:void(0)', pageUrl)` 会**成功**返回 `javascript:void(0)`，
       拼上前缀后恰好以 http 开头，于是混过最终校验，给书架塞进一堆永远抓不到的垃圾章节。 */
    const rawLink = String(link).trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(rawLink) && !/^https?:/i.test(rawLink)) continue;   // javascript: / mailto: / data: … 一律丢
    let url = rawLink;
    try { url = new URL(rawLink, pageUrl).href; } catch (e) {}
    if (cl.linkPrefix && !/^https?:\/\//i.test(url)) url = cl.linkPrefix + url;
    if (!/^https?:\/\//i.test(url)) continue;
    // V4.3.37：同页锚点（解析后与当前页只差 #fragment）不是新章节
    if (url.split('#')[0] === String(pageUrl).split('#')[0]) { anchorSkipped++; continue; }
    chapters.push({ title: title || ('第' + (chapters.length + 1) + '章'), url });
  }
  /* 🛡 V4.3.38：用 normalizeChapters **去重并排序后**的数组。
     原先把统计量（duplicates / sortedByNumber）拼在**原始数组**上返回 ——
     于是面板打印「已自动去重 N 章 / 已按章节序号排序」，用户看到的却是带重复、顺序错乱的目录。
     这是"假承诺"：算了但没用。现在把 sorted 真正交出去。 */
  /* 🛡 V4.3.38：整本在**单页**、目录靠 #锚点跳章的站点，会把所有条目都判成"同页锚点"而丢光 ——
     原先这时的报错是「未匹配到章节，请检查选择器」，把站点兼容性问题误导成"用户选择器写错了"。
     这种情况下给出准确的成因。 */
  if (!chapters.length && anchorSkipped) {
    return { error: TT('该站目录为单页锚点模式（' + anchorSkipped + ' 条目录全部指向当前页），暂不支持自动抓取', 'This site uses a single-page anchor index (' + anchorSkipped + ' entries all point to the current page); automatic fetching is not supported yet') };
  }
  const norm = normalizeChapters(chapters);
  return Object.assign({}, norm, { chapters: norm.chapters, anchorSkipped });
}

// 章节名里的序号：阿拉伯数字优先，其次中文数字
const CN_DIGITS = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
function cnToNumber(s) {
  let total = 0;
  let num = 0;
  for (const ch of String(s || '')) {
    if (CN_DIGITS[ch] !== undefined) num = CN_DIGITS[ch];
    else if (ch === '十') { total += (num || 1) * 10; num = 0; }
    else if (ch === '百') { total += (num || 1) * 100; num = 0; }
    else if (ch === '千') { total += (num || 1) * 1000; num = 0; }
  }
  return total + num;
}

function chapterNumber(title) {
  const s = String(title || '');
  /* 🆕 V4.3.85：**优先认「第 N 章 / 节 / 回 / 卷 …」里的那个 N**。
     原实现直接取标题里第一个数字串，于是副标题里的年份/序号被当成章节号：
       「第五十一章 第五纪·1068年」→ 1068（真值 51）
       「第五百六十二章 大城玩家1853」→ 1853（真值 562）
     真站实测（玄幻阁《呢喃诗章》4652 章）：这样量出 55 处"逆序"，
     normalizeChapters 据此认定目录是乱序并重排 —— 结果把「第一卷卷末语」从卷末挪到第二章前面。
     只有紧跟在「第」后面、贴着「章节回卷集话篇」的数字才是章节号；副标题里的数字一概不算。 */
  const ar = s.match(/第\s*(\d{1,5})\s*[章节節回卷集话話篇]/);
  if (ar) return parseInt(ar[1], 10);
  const cnFirst = s.match(/第\s*([零一二两三四五六七八九十百千]{1,8})\s*[章节節回卷集话話篇]/);
  if (cnFirst) {
    const v = cnToNumber(cnFirst[1]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  /* 兜底：没有「第N章」形态时（如 "Chapter 12" / 纯数字标题），再退回原来的"第一个数字串" */
  const m = s.match(/(\d{1,5})/);
  if (m) return parseInt(m[1], 10);
  const cn = s.match(/[零一二两三四五六七八九十百千]{1,6}/);
  if (cn) {
    const v = cnToNumber(cn[0]);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return NaN;
}

// 去重 + 按章节序号自然排序 + 缺章检测
function normalizeChapters(chapters) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const unique = [];
  let duplicates = 0;
  for (const ch of chapters) {
    const tkey = String(ch.title || '').replace(/\s+/g, '');
    if (seenUrl.has(ch.url) || (tkey && seenTitle.has(tkey))) { duplicates++; continue; }
    seenUrl.add(ch.url);
    if (tkey) seenTitle.add(tkey);
    unique.push(ch);
  }

  const nums = unique.map(c => chapterNumber(c.title));
  const numberedCount = nums.filter(n => Number.isFinite(n)).length;
  const enoughNumbered = unique.length >= 5 && numberedCount >= unique.length * 0.6;
  let sorted = unique;
  let sortedByNumber = false;
  if (enoughNumbered) {
    /* 🆕 V4.3.85：**站点自己已经排好序时不要重排**。
       真实案例（玄幻阁《呢喃诗章》，4652 章）：DOM 顺序本来完全正确
       （第一章 → 第二章 → …），但 chapterNumber('第一卷卷末语') 会从「第一卷」里抠出 1 ——
       一排序就把这句"卷末语"从第一卷末尾**挪到了第二章前面**；同理「上架感言」「不是没更啊」
       这类无号章节全被甩到书尾。用户看到的目录是乱的，而排序本来是为了修"倒序/乱序"站点。
       判据：只看**相邻两个已编号章节**，逆序对少于 2% ⇒ 站点自己排好了，原样保留。
       （倒序站点首尾就全是逆序，乱序站点也远超 2%，两者仍会被排序修正，行为不变。）
       🟥 用比例而不是"必须零逆序"：站点自己也会写错章节号（实测有「第一百零三十九章」
       其实是第 1039 章这类笔误），要求零逆序等于永远触发重排，等于没修。 */
    let inversions = 0, pairs = 0, prevNum = null;
    for (const n of nums) {
      if (!Number.isFinite(n)) continue;
      if (prevNum !== null) { pairs++; if (n < prevNum) inversions++; }
      prevNum = n;
    }
    const alreadyOrdered = pairs > 0 && (inversions / pairs) < 0.02;
    if (!alreadyOrdered) {
      sorted = unique
        .map((c, i) => ({ c, n: nums[i], i }))
        .sort((a, b) => {
          const an = Number.isFinite(a.n) ? a.n : Number.MAX_SAFE_INTEGER;
          const bn = Number.isFinite(b.n) ? b.n : Number.MAX_SAFE_INTEGER;
          if (an !== bn) return an - bn;
          return a.i - b.i;
        })
        .map(x => x.c);
      sortedByNumber = true;
    }
  }

  const missing = [];
  /* 🆕 V4.3.85：缺号统计不该依赖"有没有真的排过序"—— 已经有序的站点同样能算缺号。
     原先用 sortedByNumber 当闸门，站点排好了就永远报"无缺号"，等于少一个可见信号。 */
  if (enoughNumbered) {
    const order = sorted.map(c => chapterNumber(c.title)).filter(n => Number.isFinite(n));
    if (order.length >= 5) {
      const min = Math.min.apply(null, order);
      const max = Math.max.apply(null, order);
      if (max - min <= 5000) {
        const set = new Set(order);
        for (let n = min; n <= max; n++) if (!set.has(n)) missing.push(n);
      }
    }
  }

  return { chapters: sorted, duplicates, missing, sortedByNumber, rawCount: chapters.length };
}

function parseContent(html, pageUrl, rule) {
  if (!cheerio) return { error: TT('解析组件未加载','Parser component not loaded') };
  const $ = cheerio.load(html);
  const cc = rule.content || {};
  let $el = cc.content ? $(cc.content).first() : null;
  /* 🆕 V4.3.85（自动抓取）：自动识别出的规则，个别章节页模板不一样（多一层广告包装 / 换了容器 id）时
     选择器会落空 —— 这里退回**逐页启发式**再认一次，而不是把整章判成失败。
     🟥 只对 rule.auto 生效：手动规则的语义必须保持原样（用户填错了就该如实报"未匹配到正文"，
     不许被自动逻辑悄悄"修好"，否则他永远不知道自己的选择器是错的）。 */
  if ((!$el || !$el.length) && rule.auto) {
    const autoNode = autoPickContentNode($);
    if (autoNode) $el = $(autoNode);
  }
  if (!$el || !$el.length) return { error: TT('未匹配到正文','No content matched') };
  if (cc.remove) { try { $el.find(cc.remove).remove(); } catch (e) {} }
  /* 🆕 V4.3.85：自动模式下剥掉正文开头那一串"链接农场"（推荐位/导航）。
     实测站点把 8 条推荐书链接直接塞进 #content 的第一个孩子，不剥的话**每章**开头都顶着别人的书名。
     只对 rule.auto 生效 —— 手动规则按用户填的 remove 选择器办，不替他改。 */
  if (rule.auto) { try { autoStripLeadingLinkFarm($, $el); } catch (e) {} }
  let text = htmlToText($el);
  /* 🆕 V4.3.85：自动模式下顺手清掉正文里"上一章 / 返回目录"这类整行导航（只删整行完全相等的）。 */
  if (rule.auto) text = autoCleanChapterText(text);
  /* 🛡 V4.3.38：命中选择器但取到空内容 → 当**失败**。
     原先把空串当成功存进书架：用户读到一整本空白章，failed 标记不置位、
     面板也不会给重抓入口（`removeSel` 把正文父容器一起删掉、或站点对未登录返回空壳页时常见）。 */
  if (!text || !String(text).replace(/\s+/g, '')) return { error: TT('正文为空（选择器命中了，但取到的是空内容）','Content is empty (the selector matched, but the result was blank)') };
  return { content: text };
}

async function fetchSourceChapters(urlStr, rule) {
  try {
    const buf = await sourceFetch(urlStr);
    const html = sourceDecode(buf, rule.encoding);
    const $ = cheerio.load(html);
    const title = ($('title').text().trim()) || ($('h1').first().text().trim()) || (new URL(urlStr).hostname);
    const res = parseChapterList(html, urlStr, rule);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true, title, chapters: res.chapters, duplicates: res.duplicates, missing: res.missing, sortedByNumber: res.sortedByNumber, rawCount: res.rawCount };
  } catch (err) {
    logToFile('error', 'fetch source chapters failed: ' + (err && err.message || err));
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

async function fetchSourceOne(url, rule) {
  if (!url || !rule) return { ok: false, error: TT('缺少参数','Missing parameter') };
  try {
    const buf = await sourceFetch(url);
    const html = sourceDecode(buf, rule.encoding);
    const r = parseContent(html, url, rule);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, content: r.content };
  } catch (err) {
    logToFile('error', 'fetch single chapter failed: ' + ((err && err.message) || err));
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

async function fetchSourceContents(chapters, rule, sender) {
  const results = new Array(chapters.length);
  const failedChapters = [];
  sourceFetchCancelled = false;
  const interval = Math.max(0, Number.isFinite(Number(rule.requestInterval)) ? Number(rule.requestInterval) : 250);
  const concurrency = Math.max(1, Math.min(8, Number.isFinite(Number(rule.concurrent)) ? Number(rule.concurrent) : 3));
  let next = 0;
  let done = 0;

  async function worker() {
    while (!sourceFetchCancelled && next < chapters.length) {
      const i = next++;
      const ch = chapters[i];
      const origIndex = Number.isFinite(ch && ch.index) ? ch.index : i;
      try {
        const buf = await sourceFetch(ch.url);
        const html = sourceDecode(buf, rule.encoding);
        const r = parseContent(html, ch.url, rule);
        if (r.error) {
          failedChapters.push({ title: ch.title, url: ch.url, index: origIndex });
          // 保留占位章节，保证书源顺序与章节位置不错位，可在阅读器内单独重抓
          results[i] = { title: ch.title, content: '', failed: true, url: ch.url, idx: i };
        } else {
          /* 🆕 V4.3.85：**必须带上 url**。原先成功章节只存 { title, content, idx }，
             于是阅读器里「重抓本章」（app-src/30-shelf.js）拿 `ch.url` 判空后直接
             showHint('retryNoRule') —— 每本书的单章重抓都失效，而且提示还错说成"没有书源规则"。
             失败章节本来就有 url（占位重抓要用），成功章节没有，两边口径也不一致。 */
          results[i] = { title: ch.title, content: r.content, idx: i, url: ch.url };
        }
      } catch (e) {
        failedChapters.push({ title: ch.title, url: ch.url, index: origIndex });
        results[i] = { title: ch.title, content: '', failed: true, url: ch.url, idx: i };
      }
      done++;
      safeSend(sender, 'source:progress', { done, total: chapters.length, title: ch.title });
      if (interval > 0 && !sourceFetchCancelled && next < chapters.length) {
        await new Promise(r => setTimeout(r, interval));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, chapters.length) }, () => worker()));
  return { ok: true, contents: results.filter(Boolean), failed: failedChapters.map(f => f.title), failedChapters, cancelled: sourceFetchCancelled };
}
/* 📑 V4.3.29：把同一本书的两种写法归一，用于**搜索结果去重**。
   同一个搜索页常把同一本书列多次（列表 + 推荐位），翻页时又会把上一页的重复一遍，
   不去重用户会看到一堆同名条目，还得自己猜哪个是真的。
   只删「纯跟踪参数」（utm 系列、spm、ref、from 等），**保留站点自己的 id 参数**——那常常就是书的标识。 */
const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'spm', 'ref', 'from'];
function normalizeBookUrl(u) {
  try {
    const o = new URL(u);
    o.hash = '';
    TRACKING_PARAMS.forEach(p => { try { o.searchParams.delete(p); } catch (e) {} });
    let s = o.href;
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch (e) { return String(u || '').trim().toLowerCase(); }
}
/* 📑 V4.3.29：搜索支持翻页 —— 模板里写 {page}（页码）就会翻页，没写就只有一页。
   page 从 1 开始；翻到空页时返回 ok + 空结果，让面板知道「没有更多了」而不是当成报错。 */
async function searchSource(query, rule, page) {
  if (!cheerio) return { ok: false, error: TT('解析组件未加载','Parser component not loaded') };
  const s = rule.search;
  if (!s || !s.urlTemplate) return { ok: false, error: TT('规则缺少搜索模板 search.urlTemplate','Rule is missing the search template: search.urlTemplate') };
  const pageNo = Math.max(1, Number(page) || 1);
  const hasPage = /\{page\}/.test(String(s.urlTemplate));
  /* 🟥 V4.3.27：String.replace 用字符串模式只替换**第一处** {kw}，
     模板里出现两次关键词（常见于「搜索页 + 页码参数」）时第二个会原样留下变成字面 {kw}。
     split/join 是唯一不引入正则转义坑的全量替换写法。 */
  let url = String(s.urlTemplate).split('{kw}').join(encodeURIComponent(query));
  if (hasPage) url = url.split('{page}').join(String(pageNo));
  try {
    const buf = await sourceFetch(url);
    const html = sourceDecode(buf, rule.encoding);
    const $ = cheerio.load(html);
    const items = $(s.resultItem || 'a').toArray();
    if (!items.length) {
      // 翻页翻到空页 = 没有更多了（不是错误）；只有**第一页**就空才算选择器没配好
      if (pageNo > 1) return { ok: true, results: [], dupes: 0, page: pageNo, hasPage };
      return { ok: false, error: TT('未匹配到搜索结果，请检查选择器','No search results matched — check the selectors'), page: pageNo, hasPage };
    }
    const results = [];
    // 📑 V4.3.29 页内去重：seen 记已收过的规范化 URL，dupes 记本页丢掉多少条（面板会如实汇报）
    const seen = new Set();
    let dupes = 0;
    const getVal = function ($el, sel, attr) {
      if (!sel) return '';
      const node = sel === '__self__' ? $el : $el.find(sel).first();
      if (!node.length) return '';
      return attr ? (node.attr(attr) || '') : node.text().trim();
    };
    for (const el of items) {
      const $el = $(el);
      let title = getVal($el, s.title || '__self__', s.titleAttr || null);
      if (!title) title = $el.text().trim();
      const author = getVal($el, s.author || null, s.authorAttr || null);
      let bookUrl = getVal($el, s.bookUrl || '__self__', s.bookUrlAttr || 'href');
      if (!bookUrl) { const a = $el.is('a') ? $el : $el.find('a').first(); if (a.length) bookUrl = a.attr('href') || ''; }
      if (!bookUrl) continue;
      try { bookUrl = new URL(bookUrl, url).href; } catch (e) {}
      if (!/^https?:\/\//i.test(bookUrl)) continue;
      // 📑 V4.3.29 页内去重：同一页里重复的书只留第一次出现的那条
      const key = normalizeBookUrl(bookUrl);
      if (key && seen.has(key)) { dupes++; continue; }
      if (key) seen.add(key);
      const cover = getVal($el, s.cover || null, s.coverAttr || 'src');
      let coverUrl = '';
      if (cover) { try { coverUrl = new URL(cover, url).href; } catch (e) {} }
      results.push({ title: title || ('结果' + (results.length + 1)), author, url: bookUrl, cover: coverUrl });
    }
    return { ok: true, results, dupes, page: pageNo, hasPage };
  } catch (err) {
    logToFile('error', 'search source failed: ' + (err && err.message || err));
    return { ok: false, error: (err && err.message) || String(err), page: pageNo, hasPage };
  }
}

// ---------- 站点判定（V4.3.23「书库」的地基）----------
