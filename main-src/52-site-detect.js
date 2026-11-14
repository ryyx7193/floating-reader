// 用户的问题原话：「回退两三个页面可能是全站，但是你怎么确定它是全站？我们需要有这个会自行判断。」
// 所以这里**不用"砍路径猜"**，而是三件有证据的事：
//   ① 真实请求站点根（跟随重定向）→ 拿**最终落点**，这是它的真实主页，不是我们猜的；
//   ② 判它是不是"首页"而不是"某本书的详情页"（详情页特征明显：章节列表 / 作者 / 加入书架 / 最新章节…）；
//   ③ 在首页里**找搜索入口**（表单 action + 关键词参数名，或带 search 的链接），据此派生出搜索模板。
// 结论分级（由强到弱）：tpl（书源规则自带模板，最硬）> form（首页找到搜索入口，派生模板）> home（只找到主页，不可站内搜）
//   > unknown（连主页都没取到）。实测搜索成功过还会由渲染层把置信度升到 search（见 app.js/panel.js）。
const SITE_BOOK_MARKERS = ['章节列表', '目录', '最新章节', '加入书架', '作者：', '作者:', '字数：', '连载', '完本', '内容简介', '小说简介', '开始阅读', '投票推荐'];

function siteUpOneLevel(u) {
  try {
    const o = new URL(u);
    const seg = o.pathname.split('/').filter(Boolean);
    if (seg.length <= 1) return o.origin + '/';
    seg.pop();
    return o.origin + '/' + seg.join('/') + '/';
  } catch (e) { return ''; }
}

function siteSearchTemplateFromHtml($, baseUrl) {
  // ① 表单：最常见的搜索入口
  const forms = $('form').toArray();
  const nameCand = /^(q|wd|kw|keyword|key|keys|s|searchkey|searchword|search|word|query|k|text|name|bookname)$/i;
  for (const f of forms) {
    const $f = $(f);
    const inputs = $f.find('input,select').toArray();
    let kwName = '', kwId = '';
    for (const el of inputs) {
      const it = $(el);
      const t = String(it.attr('type') || 'text').toLowerCase();
      if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'image' || t === 'checkbox') continue;
      const n = it.attr('name') || it.attr('id') || '';
      if (n && nameCand.test(n)) { kwName = it.attr('name') || ''; kwId = it.attr('id') || ''; break; }
    }
    if (!kwName && !kwId) {
      for (const el of inputs) {
        const it = $(el);
        const t = String(it.attr('type') || 'text').toLowerCase();
        if (t !== 'text' && t !== 'search') continue;
        if (it.attr('name')) { kwName = it.attr('name'); break; }
      }
    }
    const param = kwName || kwId;
    if (!param) continue;
    const act0 = $f.attr('action') || baseUrl;
    let act; try { act = new URL(act0, baseUrl).href; } catch (e) { continue; }
    if (!/^https?:/i.test(act)) continue;
    // 参数名尽量原样（大多数站是 ASCII），非 ASCII 才编码
    const p = /^[A-Za-z0-9_\-]+$/.test(param) ? param : encodeURIComponent(param);
    return act + (act.indexOf('?') >= 0 ? '&' : '?') + p + '={kw}';
  }
  // ② 没有表单时的退路：找 href 里带 search 且带查询参数的链接，把参数值换成 {kw}
  const anchors = $('a[href]').toArray();
  for (const a of anchors) {
    let href = $(a).attr('href') || '';
    if (!/search|sou|so\?|=s\b|query/i.test(href)) continue;
    if (href.indexOf('=') < 0) continue;
    let abs; try { abs = new URL(href, baseUrl).href; } catch (e) { continue; }
    const qs = abs.split('?')[1];
    if (!qs) continue;
    const parts = qs.split('&');
    for (let i = 0; i < parts.length; i++) {
      const kv = parts[i].split('=');
      if (kv.length !== 2) continue;
      if (!/^(q|wd|kw|keyword|key|s|searchkey|word|query|k)$/i.test(kv[0])) continue;
      if (!kv[1]) continue;
      parts[i] = kv[0] + '={kw}';
      return abs.split('?')[0] + '?' + parts.join('&');
    }
  }
  return '';
}

function siteLooksLikeBookPage($, html) {
  let hits = 0;
  const t = ($('title').text() || '') + ' ' + String(html).slice(0, 200000);
  for (const m of SITE_BOOK_MARKERS) { if (t.indexOf(m) >= 0) hits++; }
  // 章节链接密集（第123章 / 第123节）也是详情页特征
  let chapLinks = 0;
  const as = $('a').toArray();
  for (const a of as) { if (/第\s*[0-9一二三四五六七八九十百千]+\s*[章节回]/.test($(a).text() || '')) { chapLinks++; if (chapLinks > 20) break; } }
  return { hits: hits, chapLinks: chapLinks, isBook: (hits >= 3 && chapLinks >= 8) || chapLinks >= 20 };
}

function hostOfUrl(u){ try { return new URL(u).host; } catch (e) { return ''; } }

/* 🆕 V4.3.24：判定站点时顺手**读出它叫什么名字**（用户要求：「也要自动读取它的名字，知道这是什么网站」）。
   取值优先级：og:site_name / application-name → <title> 里像站点名的那段 → 退回域名。
   title 常写成「页面名 - 站点名」或「站点名 | 页面名」，所以按分隔符切段后取**最后一段**更像站点名。 */
function siteNameFromHtml($, fallback) {
  const metaOf = sel => { try { return String(($(sel).first().attr('content')) || '').trim(); } catch (e) { return ''; } };
  let n = metaOf('meta[property="og:site_name"]') || metaOf('meta[name="og:site_name"]')
       || metaOf('meta[name="application-name"]') || metaOf('meta[name="apple-mobile-web-app-title"]');
  if (!n) {
    const t = String(($('title').text()) || '').trim();
    if (t) {
      const seg = t.split(/\s*[|\-–—_·]\s*/).map(s => s.trim()).filter(Boolean);
      n = (seg.length > 1 ? seg[seg.length - 1] : seg[0]) || '';
    }
  }
  n = String(n || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return n || fallback || '';
}

async function judgeSite(input) {
  const out = { ok: false, home: '', kind: 'unknown', searchTpl: '', name: '', title: '', evidence: [], note: '' };
  let origin = String((input && (input.origin || input.url)) || '').trim();
  if (!origin) return { ok: false, error: TT('缺少站点地址','Missing site address') };
  try { origin = new URL(origin).origin; } catch (e) { return { ok: false, error: TT('站点地址无效','Invalid site address') }; }
  out.home = origin + '/';
  const ruleTpl = String((input && input.searchTpl) || '').trim();

  // 从「书页」入手时先退到上一级，再从根开始试；最多 3 个候选
  const cands = [];
  const hintUrl = String((input && input.url) || '').trim();
  if (hintUrl) {
    let up = hintUrl;
    for (let i = 0; i < 2 && up; i++) { up = siteUpOneLevel(up); if (up && cands.indexOf(up) < 0) cands.push(up); }
  }
  if (cands.indexOf(origin + '/') < 0) cands.push(origin + '/');

  let html = '', finalUrl = '', got = false, lastErr = '';
  for (const c of cands) {
    try {
      const r = await httpGet(c, { timeout: 12000, withUrl: true });
      html = sourceDecode(r.buf, '');
      finalUrl = r.url || c;
      got = true;
      out.evidence.push(TT('已实际请求 ' + c + (finalUrl !== c ? ' → 跳转到 ' + finalUrl : '（无跳转）'), 'Actually requested ' + c + (finalUrl !== c ? ' → redirected to ' + finalUrl : ' (no redirect)')));
      break;
    } catch (e) { lastErr = String((e && e.message) || e); }
  }
  if (!got) {
    out.note = TT('站点根页取不到：' + lastErr, 'Could not fetch the site root: ' + lastErr);
    out.evidence.push(TT('站点根页请求失败：' + lastErr, 'Site root request failed: ' + lastErr));
    // 取不到页面时，只有「书源规则自带模板」这一条硬证据可用
    if (ruleTpl) { out.kind = 'tpl'; out.searchTpl = ruleTpl; out.ok = true; out.evidence.push(TT('采用书源规则里的搜索模板（未联网验证）','Using the search template from the source rule (not verified online)')); }
    return out;
  }
  out.home = finalUrl;
  let $ = cheerio.load(html);
  out.title = ($('title').text() || '').trim().slice(0, 60);

  // 主页 vs 书页
  let look = siteLooksLikeBookPage($, html);
  if (look.isBook) {
    out.evidence.push(TT('当前页面是「书籍详情页」特征（关键词命中 ' + look.hits + '、章节链接 ' + look.chapLinks + '）→ 退一级再看', 'This page looks like a book detail page (' + look.hits + ' keyword hits, ' + look.chapLinks + ' chapter links) → go up one level and retry'));
    const up = siteUpOneLevel(finalUrl);
    if (up && up !== finalUrl) {
      try {
        const r2 = await httpGet(up, { timeout: 12000, withUrl: true });
        const h2 = sourceDecode(r2.buf, '');
        const $2 = cheerio.load(h2);
        const l2 = siteLooksLikeBookPage($2, h2);
        out.evidence.push(TT('退到 ' + up + '：' + (l2.isBook ? '仍像书页' : '已是站点首页特征'), 'Went up to ' + up + ': ' + (l2.isBook ? 'still looks like a book page' : 'now looks like a site home page')));
        if (!l2.isBook) { $ = $2; html = h2; out.home = r2.url || up; look = l2; }
      } catch (e) { out.evidence.push(TT('退级请求失败：' + String((e && e.message) || e), 'Request after going up one level failed: ' + String((e && e.message) || e))); }
    }
  } else {
    out.evidence.push(TT('页面是「站点首页」特征（书页关键词仅 ' + look.hits + '、章节链接 ' + look.chapLinks + '）', 'This page looks like a site home page (only ' + look.hits + ' book keyword hits, ' + look.chapLinks + ' chapter links)'));
  }

  // 同域内链数量：首页通常导航密集
  let internal = 0;
  try {
    const host = new URL(out.home).host;
    for (const a of $('a[href]').toArray()) {
      const h = $(a).attr('href') || '';
      if (h.indexOf('http') === 0) { try { if (new URL(h).host === host) internal++; } catch (e) {} }
      else if (h && h[0] !== '#') internal++;
    }
  } catch (e) {}
  out.evidence.push(TT('站内链接 ' + internal + ' 个' + (internal >= 15 ? '（导航密集，符合站点首页）' : ''), internal + ' internal links' + (internal >= 15 ? ' (dense navigation, typical of a site home page)' : '')));

  // 🆕 V4.3.24：站点名字 —— 退级后要用**最终那张页面**的名字，所以在这里重新取一次
  out.siteName = siteNameFromHtml($, hostOfUrl(out.home));
  if (out.siteName) out.evidence.push(TT('站点名：' + out.siteName + '（自动读取，书库里能认出这是哪座站）', 'Site name: ' + out.siteName + ' (read automatically, so the library can tell which site it is)'));

  // 搜索入口
  const derived = siteSearchTemplateFromHtml($, out.home);
  if (ruleTpl) {
    out.kind = 'tpl'; out.searchTpl = ruleTpl;
    out.evidence.push(TT('书源规则自带搜索模板（最强证据）','The source rule ships its own search template (strongest evidence)'));
    if (derived && derived !== ruleTpl) out.evidence.push(TT('首页另有一个搜索入口：' + derived, 'The home page has another search entry: ' + derived));
  } else if (derived) {
    out.kind = 'form'; out.searchTpl = derived;
    out.evidence.push(TT('在首页找到搜索入口，派生模板：' + derived + '（尚未实测出结果）', 'Found a search entry on the home page, derived template: ' + derived + ' (not yet verified with a real query)'));
  } else {
    out.kind = 'home';
    out.evidence.push(TT('首页未找到可用的搜索入口 → 只能打开主页，不能在应用内直接搜这座站','No usable search entry found on the home page → this site can only be opened, not searched in-app'));
  }
  out.ok = true;
  return out;
}

// ---------- IPC ----------
