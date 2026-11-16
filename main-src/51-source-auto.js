/* ===================== 🤖 自动抓取（V4.3.85）=====================
 *
 * 目标：用户只给一个 URL，剩下的全自动 —— 自动识别章节目录、自动识别正文容器、抓完全书并载入，
 * 全程不需要填任何选择器。
 *
 * 🟥 设计要点（别改坏）：
 *   ① **识别只做一次**（目录页 + 第 1 章），产出的仍是一条**普通 rule**（只是 content/chapterList
 *      是自动填的）。之后整条链（fetchSourceContents / 阅读器内单章重抓 / 高级里再改再存）
 *      全部复用原有实现 —— 不新增第二条抓取通路（规则 34：同一动作多个入口 ⇒ 收口成单一 helper）。
 *   ② 识别靠**结构信号**（链接形状一致性 / 容器里链接文字的占比 / 章节关键词 / class 语义），
 *      不依赖任何站点白名单，也不联网查规则。判不准时**如实报错**并指路「高级」，
 *      绝不硬塞一个"大概是正文"的结果（宁可失败，也不给一本乱码书）。
 *   ③ 正文选择器一旦识别出来就固定下来（同一站的章节页结构一致）；万一某章用选择器抓不到，
 *      parseContent 会**退回逐页启发式**（rule.auto 标记）再试一次 —— 既稳又不至于整本失败。
 *
 * 已知取舍：识别时抓了第 1 章，随后 fetchSourceContents 会**再抓一次**第 1 章。
 * 多一次请求换来的是「进度总数准确 + 复用现成抓取链」，比省这一次请求更划算。
 */

const AUTO_CHAPTER_WORD_RE = /第\s*[0-9零一二两三四五六七八九十百千万]+\s*[章节節回卷集话話篇]|^\s*(序章|楔子|引子|前言|序言|后记|後記|尾声|尾聲|番外)/;
/* 容器语义：这些词出现在 id/class 里 ⇒ 多半是导航/页脚/推荐位，不是目录也不是正文 */
const AUTO_JUNK_RE = /(^|[-_\s])(nav|navbar|menu|footer|foot|header|topbar|top-nav|breadcrumb|crumb|sidebar|side|rank|ranking|hot|recommend|related|tuijian|tag|tags|comment|comments|ad|ads|advert|gg|share|search|pager|pagination|paging|page-nav|logo|banner|copyright|friendlink)([-_\s]|$)/i;
/* 容器语义：这些词 ⇒ 更像正文/目录 */
const AUTO_GOOD_RE = /(content|chapter|article|read|txt|text|novel|book|main|body|detail|show|entry|post|list)/i;
/* 自动模式下去掉的导航行（**整行完全等于**这些词才删，不做包含匹配，避免误删正文） */
/* 🧹 V4.3.88（用户：“正文界面偶尔会出现『章节错误，点此报送…』这种与小说无关的东西”）
 * 站点常往正文里塞一句套话（报送错章 / 请记住本站 / 手机用户请…）。
 * 它不是选择器能解决的 —— 文字就在正文容器里，所以只能在文本层过滤。
 * 🛥 两道安全闸：
 *   ① 必须**以它开头**（套话总是从行首起手；正文里“提到”这些词不算）；
 *   ② 行长 ≤ 60 字 —— 防止正文段落里恰好提到这些词被连带删掉。
 * 两条都满足才删；宁可漏一句广告，也不能吃正文。 */
const AUTO_BOILER_LINE_RE = /^(章节(内容)?(错误|有误|缺失|乱了)|点此报送|报送(本章|错误)|报送后.*(校正|修正)|请耐心等待|本章未完|点击?下一页继续|请记住本站|手机用户请|最新网址|首发(域名|网址)|一秒记住|免费阅读.*最新章节)/;
const AUTO_BOILER_MAXLEN = 60;

const AUTO_NAV_LINE_RE = /^(上一[章页節节]|下一[章页節节]|返回目录|回目录|目\s*录|章节目录|加入书签|添加书签|推荐本书|投推荐票|返回书架|上一页|下一页|手机阅读|电脑阅读|字体[大小]*[:：]?.*)$/;

function autoNormText(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function autoSigOf(el) {
  if (!el || !el.attribs) return '';
  return (String(el.attribs.id || '') + ' ' + String(el.attribs.class || '')).toLowerCase();
}

/* 往上 4 层找"坏味道"，命中越多越不可能是我们要的容器 */
function autoJunkPenalty(el) {
  let node = el, depth = 0, hit = 0;
  while (node && depth < 4) {
    if (AUTO_JUNK_RE.test(autoSigOf(node))) hit++;
    node = node.parent; depth++;
  }
  return Math.min(0.85, hit * 0.45);
}

function autoGoodBonus(el) {
  let node = el, depth = 0;
  while (node && depth < 4) {
    if (AUTO_GOOD_RE.test(autoSigOf(node))) return 0.3;
    node = node.parent; depth++;
  }
  return 0;
}

function autoIsDescendant(anc, node) {
  let n = node;
  while (n) { if (n === anc) return true; n = n.parent; }
  return false;
}

function autoDepthOf(el) {
  let d = 0, n = el;
  while (n && n.parent) { d++; n = n.parent; }
  return d;
}

/* 给一个 cheerio 元素生成**唯一**且能被 cheerio 再次解析的 CSS 选择器。
   优先级：id → tag.class → tag.class1.class2 → 结构路径（就近锚到带 id 的祖先）。
   🟥 每个候选都必须用 $(sel) 回验「只命中它自己」—— 不验证就返回，
   等于把"看起来对"当"真的对"，抓错容器时用户只会看到一本乱码书。 */
function autoSelectorFor($, el) {
  if (!el || !el.attribs || !el.name) return null;
  const tag = el.name;
  const isUnique = function (sel) {
    try { const found = $(sel); return found.length === 1 && found[0] === el; } catch (e) { return false; }
  };
  const id = String(el.attribs.id || '');
  if (/^[A-Za-z][\w-]*$/.test(id) && isUnique('#' + id)) return '#' + id;
  const classes = String(el.attribs.class || '').split(/\s+/).filter(function (c) { return /^[A-Za-z][\w-]*$/.test(c); });
  for (const c of classes) { if (isUnique(tag + '.' + c)) return tag + '.' + c; }
  if (classes.length >= 2) {
    const s2 = tag + '.' + classes.slice(0, 2).join('.');
    if (isUnique(s2)) return s2;
  }
  const segs = [];
  let node = el;
  while (node && node.name && node.name !== 'html') {
    const parent = node.parent;
    let seg = node.name;
    if (parent && parent.children) {
      const sibs = parent.children.filter(function (c) { return c.type === 'tag'; });
      if (sibs.length > 1) seg += ':nth-child(' + (sibs.indexOf(node) + 1) + ')';
    }
    segs.unshift(seg);
    const full = segs.join(' > ');
    if (isUnique(full)) return full;
    if (parent && parent.attribs && /^[A-Za-z][\w-]*$/.test(String(parent.attribs.id || ''))) {
      const anchored = '#' + parent.attribs.id + ' > ' + full;
      if (isUnique(anchored)) return anchored;
    }
    node = parent;
  }
  return null;
}

/* 章节列表识别：把每个链接挂到它最近 3 层祖先上分组，逐组打分取最高。
   打分信号（缺一不可地叠乘）：
     · 条数（开平方，避免"链接最多"就赢）
     · **链接形状一致性**：把 URL 里的数字抹成 # 后有多少条同形 —— 目录页几乎总是同形
     · **链接文字占容器文字的比**：目录容器几乎只有链接；body/正文段落会拉低它
     · 标题质量：非空、不太长
     · 章节关键词命中率（第N章/序章…）
     · class 语义（目录 vs 导航/页脚） */
function autoDetectChapterList($, pageUrl) {
  if (!cheerio || !$) return null;
  const pageKey = String(pageUrl).split('#')[0];
  let pageHost = '';
  try { pageHost = new URL(pageUrl).hostname; } catch (e) {}

  const groups = new Map();
  $('a[href]').each(function (i, a) {
    const raw = String((a.attribs && a.attribs.href) || '').trim();
    if (!raw || /^(javascript:|mailto:|tel:|data:|#)/i.test(raw)) return;
    let abs = '';
    try { abs = new URL(raw, pageUrl).href; } catch (e) { return; }
    if (!/^https?:/i.test(abs)) return;
    if (abs.split('#')[0] === pageKey) return;                 // 同页锚点不是新章节
    if (pageHost) {
      try { if (new URL(abs).hostname !== pageHost) return; } catch (e) { return; }   // 外链不算章节
    }
    const title = autoNormText($(a).text());
    let node = a.parent, depth = 0;
    while (node && node.attribs && depth < 3) {
      if (!groups.has(node)) groups.set(node, []);
      groups.get(node).push({ title: title, url: abs });
      node = node.parent; depth++;
    }
  });

  const shapeOf = function (u) {
    try { return new URL(u).pathname.replace(/\d+/g, '#'); } catch (e) { return ''; }
  };
  let best = null;
  groups.forEach(function (list, node) {
    if (list.length < 5) return;
    const good = list.filter(function (x) { return x.title && x.title.length <= 40; });
    const quality = good.length / list.length;
    if (quality < 0.7) return;
    const avgLen = good.reduce(function (s, x) { return s + x.title.length; }, 0) / Math.max(1, good.length);
    if (avgLen > 32) return;                                    // 平均太长 = 正文链接堆，不是目录
    const shapes = new Map();
    list.forEach(function (x) { const k = shapeOf(x.url); shapes.set(k, (shapes.get(k) || 0) + 1); });
    let maxShape = 0;
    shapes.forEach(function (v) { if (v > maxShape) maxShape = v; });
    const shapeRatio = maxShape / list.length;
    if (shapeRatio < 0.4) return;                               // 形状都不一致，基本不是目录
    const wordHits = good.filter(function (x) { return AUTO_CHAPTER_WORD_RE.test(x.title); }).length;
    const wordRatio = wordHits / Math.max(1, good.length);
    const containerLen = autoNormText($(node).text()).length;
    const linkLen = list.reduce(function (s, x) { return s + x.title.length; }, 0);
    const linkRatio = Math.min(1, linkLen / Math.max(1, containerLen));
    const junk = autoJunkPenalty(node);
    const bonus = autoGoodBonus(node);
    const score = Math.sqrt(list.length) * (0.3 + shapeRatio) * (0.2 + linkRatio) *
      quality * (1 + wordRatio * 0.8) * (1 + bonus) * (1 - junk);
    if (!best || score > best.score) {
      best = { node: node, list: list, score: score, shapeRatio: shapeRatio, wordRatio: wordRatio, linkRatio: linkRatio };
    }
  });
  if (!best) return null;
  /* 🟥 拿不到稳定选择器就别硬来 —— 交给上层报错并指路「高级」 */
  const sel = autoSelectorFor($, best.node);
  if (!sel) return null;
  return {
    item: sel + ' a',
    count: best.list.length,
    shapeRatio: Math.round(best.shapeRatio * 100) / 100,
    wordRatio: Math.round(best.wordRatio * 100) / 100,
    linkRatio: Math.round(best.linkRatio * 100) / 100
  };
}

/* 正文容器识别：按"文字量 ×（1-链接密度）× 语义加成"打分，再从最高分**往下钻**到最紧的包装层。
   不往下钻的话很容易停在 <body>/<main>（它也"包含正文"，但还裹着导航、推荐位、评论）。 */
function autoPickContentNode($) {
  if (!cheerio || !$) return null;
  const cands = [];
  $('div,article,section,main,td,pre').each(function (i, el) {
    const $el = $(el);
    const len = $el.text().replace(/\s+/g, '').length;
    if (len < 200) return;
    let linkLen = 0;
    $el.find('a').each(function (j, a) { linkLen += autoNormText($(a).text()).length; });
    const density = linkLen / Math.max(1, len);
    if (density > 0.4) return;                                   // 链接占四成以上 = 列表/导航
    const breaks = $el.find('p,br').length;
    const bonus = autoGoodBonus(el);
    const junk = autoJunkPenalty(el);
    const score = len * (1 - density) * (1 + bonus) * (1 - junk) * (1 + Math.min(1, breaks / 20) * 0.25);
    cands.push({ el: el, len: len, density: density, score: score });
  });
  if (!cands.length) return null;
  cands.sort(function (a, b) { return b.score - a.score; });
  let top = cands[0];
  for (let guard = 0; guard < 8; guard++) {
    let deeper = null;
    for (const c of cands) {
      if (c === top) continue;
      if (c.len < top.len * 0.75) continue;                      // 太小的后代是段落，不是容器
      if (!autoIsDescendant(top.el, c.el)) continue;
      if (!deeper || autoDepthOf(c.el) > autoDepthOf(deeper.el)) deeper = c;
    }
    if (!deeper) break;
    top = deeper;
  }
  return top.el;
}

function autoDetectContent($) {
  const node = autoPickContentNode($);
  if (!node) return null;
  const sel = autoSelectorFor($, node);
  if (!sel) return null;
  const chars = autoNormText($(node).text()).length;
  return { content: sel, remove: 'script,style,ins,iframe,.adsbygoogle', chars: chars };
}

/* 自动模式专用：只删**整行完全等于**导航词的行走，不做包含匹配（避免把正文里出现的
   "下一章"三个字连带删掉半句话）。 */
function autoCleanChapterText(text) {
  const lines = String(text == null ? '' : text).split('\n');
  const kept = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (t && AUTO_NAV_LINE_RE.test(t)) continue;
    /* 🧹 V4.3.88：站点套话（整行匹配 + 短行才删） */
    if (t && t.length <= AUTO_BOILER_MAXLEN && AUTO_BOILER_LINE_RE.test(t)) continue;
    kept.push(raw);
  }
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  while (kept.length && !kept[0].trim()) kept.shift();
  return kept.join('\n');
}

/* 正文容器开头那一串"链接农场"必须剥掉（V4.3.85）
 *
 * 真实案例（玄幻阁 xuanhuange.info）：每个章节页的 #content 第一个孩子就是
 *   「随机推荐：<a>书A</a>&nbsp;<a>书B</a>… ×8<br /><br />」然后才是正文。
 * 不剥的话**每一章**开头都会顶着 8 本别人的书名 —— 用户会以为抓到的是推荐页。
 *
 * 🟥 判据必须是**结构性的**，不能认站点、也不能认"推荐"这两个字：
 *   开头一小段（16 个节点内）里 ≥3 条链接，且链接文字占该段文字的 45% 以上 → 判为链接农场。
 *   正文段落一旦出现（>40 字的文本节点 / 块级元素）立刻停手，所以不会误删正文。
 *   两条都不满足就**一个字都不动**（宁可留一行广告，也不删正文）。
 *
 * 只对 rule.auto 生效：手动规则要保持原样，用户填了 remove 选择器就该按他说的办。 */
function autoStripLeadingLinkFarm($, $el) {
  if (!cheerio || !$ || !$el || !$el.length) return false;
  let removed = 0;
  /* 第一类：开头就是整块"几乎全是链接"的元素（推荐位常包一层 div） */
  for (let guard = 0; guard < 3; guard++) {
    const first = $el.contents().toArray().find(function (n) {
      return n.type === 'tag' || (n.type === 'text' && autoNormText(n.data || '') !== '');
    });
    if (!first || first.type !== 'tag') break;
    if (first.name === 'a' || first.name === 'br' || first.name === 'p') break;
    const $f = $(first);
    const fLinks = $f.find('a').length;
    if (fLinks < 3) break;
    const fText = autoNormText($f.text()).length;
    if (fText > 400) break;                              // 太长 ⇒ 是正文，不是推荐位
    let fLinkLen = 0;
    $f.find('a').each(function (j, a) { fLinkLen += autoNormText($(a).text()).length; });
    if (fLinkLen / Math.max(1, fText) < 0.5) break;
    try { $f.remove(); removed++; } catch (e) { break; }
  }
  /* 第二类：开头那"一行"（到第一个 <br> 为止）里链接占绝大多数 */
  const kids = $el.contents().toArray();
  const drop = [];
  let links = 0, linkLen = 0, otherLen = 0;
  for (let i = 0; i < kids.length && i < 16; i++) {
    const n = kids[i];
    if (n.type === 'tag' && n.name === 'a') {
      const t = autoNormText($(n).text());
      links++; linkLen += t.length; drop.push(n); continue;
    }
    if (n.type === 'text') {
      const t = autoNormText(n.data || '');
      if (t.length > 40) break;                          // 成段正文 → 停手
      otherLen += t.length; drop.push(n); continue;
    }
    if (n.type === 'tag' && n.name === 'br') {
      if (links >= 1) break;                             // 这一行结束了
      drop.push(n); continue;
    }
    if (n.type === 'tag' && n.name === 'span') {
      const t = autoNormText($(n).text());
      if (t.length > 40) break;
      otherLen += t.length; drop.push(n); continue;
    }
    break;
  }
  if (links >= 3 && linkLen / Math.max(1, linkLen + otherLen) >= 0.45) {
    drop.forEach(function (n) { try { $(n).remove(); removed++; } catch (e) {} });
  }
  if (removed) logToFile('info', 'auto source: stripped leading link farm (' + removed + ' nodes)');
  return removed > 0;
}

function autoHostOf(u) {
  try { return new URL(String(u || '')).hostname.replace(/^www\./i, ''); } catch (e) { return ''; }
}

/* ===== 详情页 → 目录页：跟一跳（V4.3.85）=====
 *
 * 为什么必须有：面板输入框的占位文案写的是「粘贴**目录/详情页** URL」——
 * 承诺了就得做到。很多站的书籍页（/book/123/）本身只有简介 + 一个「开始阅读」，
 * 目录在另一个页面（/book/123/index.html 或 /read/123/）。
 * 没有这一跳，用户粘详情页会被直接拒掉并要求自己去找目录页 —— 那就不是"无需任何手动操作"。
 *
 * 🟥 三条硬约束（别放宽）：
 *   ① **只跟一跳**。不递归 —— 递归跟链在坏站点上会变成爬虫，而且一旦跟错就再也回不来。
 *   ② **只跟同站**。跨站跳转是导航/广告，不是目录。
 *   ③ **必须换页**（去 # 后与原页不同），否则原地打转。
 * 跟丢就返回 null，让上层照旧报错并指路「高级」—— 不许硬塞一个"大概是目录"。
 */
const AUTO_TOC_ENTRY_RE = /^(查看目录|全部章节|章节目录|目录|章节列表|返回目录|目录页)$/;
const AUTO_START_ENTRY_RE = /^(开始阅读|立即阅读|在线阅读|免费阅读|从头阅读|点击阅读|正文|阅读)$/;

function autoFindReadEntry($, pageUrl) {
  if (!cheerio || !$) return null;
  const pageKey = String(pageUrl).split('#')[0];
  let pageHost = '';
  try { pageHost = new URL(pageUrl).hostname; } catch (e) { return null; }
  const tocHits = [], startHits = [];
  $('a[href]').each(function (i, a) {
    const raw = String((a.attribs && a.attribs.href) || '').trim();
    if (!raw || /^(javascript:|mailto:|tel:|data:|#)/i.test(raw)) return;
    const t = autoNormText($(a).text());
    if (!t || t.length > 12) return;                 // 入口按钮的文字很短；长句是正文链接
    const isToc = AUTO_TOC_ENTRY_RE.test(t);
    const isStart = AUTO_START_ENTRY_RE.test(t);
    if (!isToc && !isStart) return;
    let abs = '';
    try { abs = new URL(raw, pageUrl).href; } catch (e) { return; }
    if (!/^https?:/i.test(abs)) return;
    if (abs.split('#')[0] === pageKey) return;       // 原地打转
    try { if (new URL(abs).hostname !== pageHost) return; } catch (e) { return; }
    (isToc ? tocHits : startHits).push(abs);
  });
  /* 目录类入口优先：它直接就是目录页；「开始阅读」多半落到第 1 章，还得再认一次目录 */
  return tocHits[0] || startHits[0] || null;
}

/* 全自动主流程：一个 URL 进来，一本书出去。
   失败一律返回 { ok:false, error }，错误文案**要说人话并指路**（用户没有选择器可调，
   只说"未匹配"等于把他丢在原地）。 */
async function sourceAutoFetch(urlStr, sender) {
  const url = String(urlStr || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: TT('请粘贴一个 http(s) 开头的目录页或详情页 URL', 'Paste an http(s) index or detail page URL') };
  }
  if (!cheerio) return { ok: false, error: TT('解析组件未加载', 'Parser component not loaded') };
  const host = autoHostOf(url);
  const siteName = host || TT('书源站点', 'web source');

  /* ① 目录页 */
  let html = '';
  try {
    const buf = await sourceFetch(url);
    html = sourceDecode(buf, '');          // 空编码 = 交给 decodeBuffer 统一判（BOM / UTF-16 / 简繁投票）
  } catch (e) {
    logToFile('error', 'auto source: index fetch failed: ' + ((e && e.message) || e));
    return { ok: false, error: TT('打开这个页面失败：', 'Failed to open the page: ') + ((e && e.message) || e) };
  }
  const $ = cheerio.load(html);
  const pageTitle = autoNormText($('title').text()) || autoNormText($('h1').first().text()) || siteName;

  /* ② 章节列表（当前页认不出 → 跟一跳"查看目录/开始阅读"，再认一次）
     🟥 pageTitle 取的是**用户粘的那个页面**的标题：详情页的 title 通常就是书名，
     比跟过去之后的目录页 title（常带"最新章节列表"之类后缀）更干净。所以这里先算好，不随后续跳转改。 */
  let detList = autoDetectChapterList($, url);
  let entryUrl = '';
  if (!detList) {
    const entry = autoFindReadEntry($, url);
    if (entry) {
      try {
        const bufE = await sourceFetch(entry);
        const htmlE = sourceDecode(bufE, '');
        const $e = cheerio.load(htmlE);
        const detE = autoDetectChapterList($e, entry);
        if (detE) {
          detList = detE;
          html = htmlE;                     // 后续 parseChapterList 必须解析**目录页**的 HTML
          entryUrl = entry;
          logToFile('info', 'auto source: followed read entry ' + entry);
        }
      } catch (e) {
        logToFile('info', 'auto source: read entry fetch failed: ' + ((e && e.message) || e));
      }
    }
  }
  if (!detList) {
    return {
      ok: false,
      error: TT('没能自动识别出章节目录。这个地址既不是目录页，页面里也没找到「查看目录 / 开始阅读」这类入口 —— ' +
        '请换成「目录页」的 URL；也可以在「高级 → 规则」里手动填写选择器后走手动抓取。',
        'Could not auto-detect the chapter list. This is neither an index page nor does it link to one — ' +
        'paste the table-of-contents URL instead, or fill the selectors manually under Advanced → Rule.')
    };
  }
  const rule = {
    name: TT('自动', 'Auto') + ' · ' + siteName,
    auto: true,
    siteUrl: (function () { try { return new URL(url).origin; } catch (e) { return url; } })(),
    encoding: '',                          // 空 = 逐页自动判定编码（不同章节页编码可能不同）
    chapterList: { item: detList.item, linkAttr: 'href', titleAttr: null },
    content: { content: '', remove: '' },   // 第 ③ 步识别后填
    search: null,
    concurrent: 3,
    requestInterval: 250,
    chaptersReversed: false,
    contentAutoPaginate: false
  };
  const parsed = parseChapterList(html, url, rule);
  if (parsed.error) return { ok: false, error: parsed.error };
  const chapters = parsed.chapters || [];
  if (!chapters.length) {
    return { ok: false, error: TT('自动识别到了目录结构，但一个章节都没解析出来', 'Detected the index structure but parsed no chapters') };
  }

  /* ③ 正文容器：拿第 1 章来认（认不出就整单失败 —— 与其给一本乱码书，不如说清楚） */
  let detContent = null;
  try {
    const buf2 = await sourceFetch(chapters[0].url);
    detContent = autoDetectContent(cheerio.load(sourceDecode(buf2, '')));
  } catch (e) {
    logToFile('error', 'auto source: first chapter fetch failed: ' + ((e && e.message) || e));
  }
  if (!detContent) {
    return {
      ok: false,
      error: TT('目录已经识别好了（共 ' + chapters.length + ' 章），但第 1 章的正文容器认不出来。' +
        '可以在「高级 → 规则」里手动填「正文选择器」后走手动抓取。',
        'The index was detected (' + chapters.length + ' chapters), but the content container of chapter 1 could not be identified. ' +
        'Fill the content selector manually under Advanced → Rule and use the manual fetch.')
    };
  }
  rule.content = { content: detContent.content, remove: detContent.remove };

  /* ④ 抓正文（复用现成链路：并发 / 间隔 / 进度 / 取消 / 失败章节占位，全都不重复实现） */
  const res = await fetchSourceContents(chapters, rule, sender);
  if (res && res.cancelled) {
    return { ok: false, cancelled: true, error: TT('已取消，本次不载入', 'Cancelled — nothing was loaded') };
  }
  const contents = (res && res.contents) || [];
  const goodCount = contents.filter(function (c) { return c && !c.failed; }).length;
  if (!goodCount) {
    return { ok: false, error: TT('正文一章都没抓到（可能是站点需要登录 / 拦截了自动抓取）', 'No chapter content could be fetched (the site may require login or block automated access)') };
  }
  return {
    ok: true,
    title: pageTitle,
    chapters: contents,
    failed: (res && res.failed) || [],
    failedChapters: (res && res.failedChapters) || [],
    rule: rule,
    detected: {
      chapterSelector: detList.item,
      chapterCount: chapters.length,
      contentSelector: detContent.content,
      contentChars: detContent.chars,
      shapeRatio: detList.shapeRatio,
      wordRatio: detList.wordRatio,
      linkRatio: detList.linkRatio,
      duplicates: parsed.duplicates || 0,
      missing: (parsed.missing || []).length,
      sortedByNumber: !!parsed.sortedByNumber,
      followedEntry: entryUrl            // 非空 = 用户给的是详情页，自动跟到了目录页（面板会如实说）
    }
  };
}
