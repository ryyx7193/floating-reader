'use strict';
/*
 * lib/net.js —— 出网守卫与统一 GET（从 main.js 抽出，V4.3.79 F5/S3 模块化第三刀）
 *
 * 为什么是工厂：这三个函数要用主进程的**双语 TT** 与 **logToFile**，而 TT 依赖运行时可变语言。
 * 用 createNet({ tt, log }) 注入引用（TT 是函数引用，内部读当前语言，切语言后依然正确）。
 *
 * 血泪规则（别删）：
 *   · SSRF 字面量校验 + **DNS 重绑定防护**必须同一次调用（guardedLookup 挂在 http.request 的 lookup 上，
 *     真正用于连接的 IP 就是被检查的 IP，不存在"先解析后连接"的窗口）
 *   · 拒绝文案里**不回传解析出的内网 IP**（否则等于给不可信规则开了探测内网的旁路信道），IP 只写日志
 *   · httpGet 是**循环 + 跳转上限 + 已访问去重**（旧实现递归无上限，自循环站点会拖死进程）
 *   · 响应体有大小上限，超限必须**显式 reject**（只靠 req.destroy 在部分 Node 版本不落地，Promise 永不 settle）
 */
const http = require('http');
const https = require('https');
const dns = require('dns');
const net = require('net');
const zlib = require('zlib');

/* V4.3.35：把 IPv6 字面量展开成 8 组 16 位整数；解析不了返回 null。（isBlockedHost 的辅助） */
function expandV6Groups(v6) {
  const s = String(v6 || '').split('%')[0].toLowerCase();   // 去掉 zone id（fe80::1%eth0）
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = (parts.length === 2 && parts[1]) ? parts[1].split(':') : [];
  if (parts.length === 1 && head.length !== 8) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = head.concat(new Array(missing).fill('0')).concat(tail);
  const out = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out.length === 8 ? out : null;
}

function createNet(deps) {
  const tt = (deps && deps.tt) || function (zh) { return zh; };
  const log = (deps && deps.log) || function () {};
  /* 🟥 V4.3.85 真缺陷修复（书源全功能不可用）：
     本文件是 `require('./lib/net.js')` 进来的**独立 CommonJS 模块**，它的作用域链里
     **看不到** main.js 里那个 `const SOURCE_UA`（那是 main.js 自己的函数作用域，不是全局）。
     原先第 167 行裸写 `SOURCE_UA` → 每次 httpGet 在发请求前就 ReferenceError:
     "SOURCE_UA is not defined" → 抓章节 / 抓正文 / 搜索 / 站点判定 / 自动追更**全部失效**。
     而它只在**真联网**时才暴露：所有门禁都注入假 fetch，于是常年假绿。
     现在默认 UA 写在文件内（模块自足），调用方仍可用 deps.ua 覆盖。 */
  const ua = (deps && deps.ua) ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  function isBlockedHost(hostname) {
    let h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!h) return true;
    // V4.3.33b：剥掉 FQDN 根点 —— `localhost.` 与 `localhost` 完全等价（实测解析到 127.0.0.1），
    //          上一版不剥点，`http://localhost./` 能直接绕过。
    h = h.replace(/\.$/, '');
    if (h === 'localhost' || h.endsWith('.localhost')) return true;
    if (h.endsWith('.local') || h.endsWith('.internal')) return true;
    if (h.indexOf(':') >= 0) {
      /* 🟥 V4.3.33b 修上一版的绕过：IPv6 必须**结构化**判定，靠几个正则穷举是漏的。
         实测 `http://[::ffff:127.0.0.1]/` 会被 new URL() 规范化成 `[::ffff:7f00:1]`，
         躲过全部旧规则，并且**真的能连上本机回环**；同理可打 169.254.169.254 云元数据与 10.x 内网。 */
      const v6 = h;
      if (!net.isIPv6(v6)) return true;             // 带冒号但不是合法 IPv6 字面量 → 一律拒
      if (v6 === '::1' || v6 === '::') return true; // 回环 / 未指定
      const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6);
      if (dotted) return isBlockedHost(dotted[1]);  // IPv4-mapped（点分写法）→ 归一到 IPv4 分支
      const hexMap = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
      if (hexMap) {                                 // IPv4-mapped（十六进制写法，就是那个绕过的形态）
        const hi = parseInt(hexMap[1], 16), lo = parseInt(hexMap[2], 16);
        return isBlockedHost([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.'));
      }
      /* V4.3.35：还有两类「IPv6 外壳、IPv4 内核」的地址没被上面几条覆盖：
         · IPv4-compatible `::7f00:1`（::/96，前 96 位全 0）—— new URL() 会把
           `http://[::127.0.0.1]/` 规范化成这个形态（**不是** `::ffff:` 那种），旧规则全部不命中；
         · NAT64 映射 `64:ff9b::7f00:1`（64:ff9b::/32 前缀）—— 经 NAT64 网关即可到达 IPv4 网络。
         两者都必须把**低 32 位**当 IPv4 再判一次。 */
      const g = expandV6Groups(v6);
      if (g) {
        const zero6 = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0;
        const nat64 = g[0] === 0x0064 && g[1] === 0xff9b;
        /* V4.3.36：第三类「IPv6 外壳 IPv4 内核」—— `::ffff:0:a.b.c.d`（RFC 6145 IPv4-*translated*）。
           注意它与 IPv4-mapped `::ffff:a.b.c.d` 不同：前 4 组为 0、第 5 组 0xffff、**第 6 组为 0**。 */
        const v4translated = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0xffff && g[5] === 0;
        if (zero6 || nat64 || v4translated) return isBlockedHost([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.'));
        /* 🟥 V4.3.43 补第四、第五类（实测原先均被放行）：
           · 6to4 `2002:7f00:0001::/48` —— 内嵌 IPv4 在 **第 2、3 组**；
           · Teredo `2001:0000:…` —— 内嵌 IPv4 在 **末 32 位且按位取反**（RFC 4380）。
           同样都是「IPv6 外壳、IPv4 内核」。字面量地址不经过 guardedLookup，
           这里的字面量判断是唯一一道门，所以补上（需本机有对应隧道才可能触达，故记低危）。 */
        if (g[0] === 0x2002) return isBlockedHost([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255].join('.'));
        if (g[0] === 0x2001 && g[1] === 0x0000) {
          const inv = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].map(function (n) { return (~n) & 255; });
          return isBlockedHost(inv.join('.'));
        }
      }
      if (/^f[cd]/.test(v6)) return true;           // 唯一本地 fc00::/7
      /* V4.3.34：原 /^fe[89ab]/ 只覆盖 fe80::/10，把夹在中间的 fec0::/10
         （已废弃的站点本地地址，仍属内网段）漏在了外面。放宽到 fe[89abcdef]。 */
      if (/^fe[89abcdef]/.test(v6)) return true;    // fe80::/10 链路本地 + fec0::/10 站点本地
      if (/^ff/.test(v6)) return true;              // 组播 ff00::/8
      return false;                                 // 其余公网 IPv6 放行
    }
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (m) {
      const a = Number(m[1]), b = Number(m[2]);
      if (a === 0 || a === 127) return true;                          // 0.0.0.0/8、回环
      if (a === 10) return true;                                      // 10/8
      if (a === 169 && b === 254) return true;                        // 链路本地（含云元数据 169.254.169.254）
      if (a === 172 && b >= 16 && b <= 31) return true;               // 172.16/12
      if (a === 192 && b === 168) return true;                        // 192.168/16
      /* 🟥 V4.3.43 补：这几段原先一律放行（实测 `http://100.64.0.1/`、`http://198.18.0.1/`、
         `http://192.0.2.1/` 都能过）。CGNAT 段在某些运营商/企业组网里是真内网；
         基准测试段与 TEST-NET 虽不可路由，但作为「不该被书源规则当目标」的地址应一并拒绝。 */
      if (a === 100 && b >= 64 && b <= 127) return true;              // 100.64/10 CGNAT（RFC 6598）
      if (a === 198 && (b === 18 || b === 19)) return true;           // 198.18/15 基准测试网段
      if (a === 192 && b === 0 && Number(m[3]) === 0) return true;    // 192.0.0/24 IETF 协议分配
      if (a === 192 && b === 0 && Number(m[3]) === 2) return true;    // 192.0.2/24 TEST-NET-1
      if (a === 198 && b === 51 && Number(m[3]) === 100) return true; // 198.51.100/24 TEST-NET-2
      if (a === 203 && b === 0 && Number(m[3]) === 113) return true;  // 203.0.113/24 TEST-NET-3
      if (a >= 224) return true;                                      // 组播 / 保留段
    }
    return false;
  }

  /* 🛡 V4.3.35 防 DNS 重绑定：只看 hostname 是不够的 —— 一条书源规则可以写 `http://evil.example/`，
     而该域名解析到 127.0.0.1 / 169.254.169.254，字面量校验对它完全无效。
     把校验挂到 http.request 的 lookup 上：**真正用于连接的那个 IP** 就是被检查的那个 IP，
     解析与使用是同一次调用，不存在"先解析、后连接"之间的可乘之机。 */
  function guardedLookup(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    dns.lookup(hostname, options, (err, address, family) => {
      if (err) return callback(err);
      const list = Array.isArray(address) ? address : [{ address: address, family: family }];
      for (const a of list) {
        if (isBlockedHost(a && a.address)) {
          /* V4.3.36：文案里**不回传解析出的内网 IP**。这段文本最终会显示到渲染层，
             等于给一条不可信的书源规则开了个「探测本机/内网 DNS 解析结果」的旁路信道。IP 只写日志。 */
          try { log('error', 'ssrf blocked: ' + hostname + ' -> ' + ((a && a.address) || '')); } catch (e) {}
          return callback(new Error(tt('已拒绝：「' + hostname + '」解析到受保护的本机/内网地址（书源只允许访问公网站点）', 'Blocked: "' + hostname + '" resolves to a protected local/intranet address (source sites may only reach public hosts)')));
        }
      }
      return callback(null, address, family);
    });
  }

  // 统一的 http(s) GET：跟随有限次跳转，可选按 JSON 解析。
  // 历史坑：旧实现是两个几乎重复的递归函数，且递归没有深度上限，
  // 碰到自循环跳转的站点会一路递归下去把进程拖死。这里改成循环 + 跳转上限 + 已访问去重。
  function httpGet(urlStr, opts) {
    opts = opts || {};
    const timeout = opts.timeout || 15000;
    const asJson = !!opts.asJson;
    const maxRedirects = opts.maxRedirects || 5;
    const maxBytes = opts.maxBytes || 8 * 1024 * 1024;   // 🆕 V4.3.24 响应体上限，见下面 chunks 处注释
    const accept = opts.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
    return new Promise((resolve, reject) => {
      const visited = new Set();
      let current = String(urlStr || '');
      let redirects = 0;
      const step = () => {
        if (redirects > maxRedirects) return reject(new Error(tt('跳转次数过多（超过 ' + maxRedirects + ' 次）', 'Too many redirects (over ' + maxRedirects + ')')));
        if (visited.has(current)) return reject(new Error(tt('检测到循环跳转，已中止','Redirect loop detected, aborted')));
        visited.add(current);
        let u;
        try { u = new URL(current); } catch (e) { return reject(new Error(tt('无效URL','Invalid URL'))); }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return reject(new Error(tt('仅支持 http/https','Only http/https is supported')));
        /* V4.3.33：协议之外再判主机。注意 URL 会把 2130706433 / 0x7f.0.0.1 这类写法
           规范化成 127.0.0.1，所以这里拿到的 hostname 是可信的。 */
        if (isBlockedHost(u.hostname)) return reject(new Error(tt('已拒绝访问本机/内网地址「' + u.hostname + '」（书源只允许访问公网站点）', 'Blocked local/intranet address "' + u.hostname + '" (source sites may only reach public hosts)')));
        const mod = u.protocol === 'https:' ? https : http;
        const req = mod.get(u, {
          headers: {
            'User-Agent': ua,
            'Accept': accept,
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
          },
          lookup: guardedLookup   // 🛡 V4.3.35：连接前解析出的 IP 也要过一遍内网校验（防 DNS 重绑定）
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            let next;
            try { next = new URL(res.headers.location, u).href; }
            catch (e) { return reject(new Error(tt('跳转地址无效','Invalid redirect target'))); }
            redirects++;
            current = next;
            return step();
          }
          if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
          /* 🆕 V4.3.85：**必须解压**。我们不发 Accept-Encoding（Node 默认只接受 identity），
             但不少站点的 CDN / 反代**无视这一点**照样回 gzip —— 实测玄幻阁
             （xuanhuange.info）第一次回明文、之后连续回 gzip。
             不解压的话拿到的是二进制，cheerio 解析出来全是乱码，表现成
             「识别失败 / 未匹配到正文」，而用户完全看不出是压缩导致的。
             🟥 上限仍然按**解压后**的字节算（got 累加在解压流上）—— 否则压缩炸弹能绕过 maxBytes。 */
          const enc = String(res.headers['content-encoding'] || '').toLowerCase().trim();
          let stream = res;
          let dec = null;
          if (enc === 'gzip' || enc === 'x-gzip' || enc === 'deflate' || enc === 'br') {
            try {
              dec = enc === 'br' ? zlib.createBrotliDecompress()
                : (enc === 'deflate' ? zlib.createInflate() : zlib.createGunzip());
            } catch (e) { dec = null; }
            if (dec) {
              dec.on('error', (e) => {
                if (over) return;
                over = true;
                try { res.destroy(); } catch (e2) {}
                try { req.destroy(); } catch (e2) {}
                reject(new Error(tt('响应解压失败（站点声明了 ' + enc + ' 压缩）', 'Failed to decompress the response (site declared ' + enc + ')')));
              });
              res.pipe(dec);
              stream = dec;
            }
          }
          const chunks = [];
          let got = 0, over = false;
          /* 🆕 V4.3.24：加**响应体大小上限**。原先 chunks 无上限地堆，抓章节 / 站点判定碰到超大响应
             （或被引到下载地址）就会把整块内容吃进内存。超限直接中止并给可读的错误，不静默截断
             ——截断的 HTML 解析出来是"选择器没命中"，会把用户带偏。 */
          stream.on('data', c => {
            if (over) return;
            got += c.length;
            if (got > maxBytes) {
              over = true;
              /* 🟥 必须**显式 reject**：只靠 req.destroy(err) 触发 'error' 在部分 Node 版本下不落地，
                 于是这个 Promise 永远不 settle —— IPC handler 一直挂着，前端等到 "reply was never sent"。
                 （V4.3.24 探针实测到的就是这个。） */
              try { stream.destroy(); } catch (e) {}
              try { res.destroy(); } catch (e) {}
              try { req.destroy(); } catch (e) {}
              reject(new Error(tt('响应过大（超过 ' + Math.round(maxBytes / 1048576) + ' MB），已中止', 'Response too large (over ' + Math.round(maxBytes / 1048576) + ' MB), aborted')));
              return;
            }
            chunks.push(c);
          });
          stream.on('error', reject);
          stream.on('end', () => {
            if (over) return;
            const buf = Buffer.concat(chunks);
            // 🆕 V4.3.23：希望拿到**最终落点 URL**（跳转后的真实地址）时用 withUrl —— 站点判定要靠它，
            // 不能靠"把书页路径砍掉两级"去猜站点根。
            if (opts.withUrl) return resolve({ buf: buf, url: current });
            if (!asJson) return resolve(buf);
            try { resolve(JSON.parse(buf.toString('utf8'))); }
            catch (e) { reject(new Error('JSON_PARSE_FAILED')); }
          });
        });
        req.setTimeout(timeout, () => req.destroy(new Error(tt('请求超时','Request timed out'))));
        req.on('error', reject);
      };
      step();
    });
  }
  return { isBlockedHost: isBlockedHost, guardedLookup: guardedLookup, httpGet: httpGet };
}

module.exports = { createNet };
