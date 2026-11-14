// 浅水鲸 · 主题仓库（多主题保存 / 应用 / 导入 / 导出 / 删除）
// 通过 ctx 注入存储与提示能力，便于测试与替换
(function (global) {
  'use strict';

  /* 🛡 V4.3.35：主题是一份可导入的第三方 JSON/CSS，会被**原样**注入 <style>。
     保留 @import 与 url(http…)，等于一份"主题"就能把整个页面指向任意远端
     （外联追踪、伪装钓鱼，甚至用 @import 覆盖掉整页外观）。
     这里剥掉远程引用，但**不静默** —— 数量如实回报：用户自己写的主题若用了网络字体，
     会因此失效，必须让他知道原因。 */
  /* 🟥 V4.3.43 重写：旧实现是「找 url( / @import 字样」式的正则，实测三类写法都能溜过去 ——
       · `@import"https://evil/x.css";`   CSS 里 at-keyword 与字符串之间**不需要空白**（旧正则要求 \s+）
       · `\75 rl(https://evil/t)`         `\75 rl` 就是 `url` 的十六进制转义写法
       · `url(https\3a //evil/t)`         `url()` 里用转义写冒号
     改成两步，不再"猜危险字样"，而是"只放行已知安全形态"：
       ① `decodeCssEscapes()` 先把 CSS 转义序列**规范化**（任何写法都还原成明文 token，语义等价）；
       ② 白名单判定 —— `url()` 只放行 `data:` / `#` / 相对路径，其余替换成 `none`；
          `@import` 只放行相对路径，其余整条删除（用 `[^;\n]*` 严格不跨行，
          避免 V4.3.36 那种「把后续规则一起吞掉」的越界删除复发）。
     仍**不静默**：数量如实回报，用户自己写的网络字体主题会因此失效，必须让他知道原因。 */
  function decodeCssEscapes(css) {
    // \ + 1~6 位十六进制 +（可选）一个空白；或 \ + 单个字符（转义其本身）
    return String(css).replace(/\\([0-9a-fA-F]{1,6})[ \t\r\n\f]?|\\([\s\S])/g, function (m, hex, ch) {
      if (hex) { const cp = parseInt(hex, 16); return cp ? String.fromCodePoint(cp) : ''; }
      if (ch === '\n' || ch === '\r' || ch === '\f') return '';   // 续行符
      return ch;
    });
  }

  // 判定一个 CSS 引用是不是"远程"（= 会发起网络请求）。放行 data: / #片段 / 相对路径。
  function isRemoteRef(u) {
    const s = String(u == null ? '' : u).trim();
    if (!s) return false;
    if (/^data:/i.test(s)) return false;          // 内联数据
    if (s.charAt(0) === '#') return false;        // 颜色 / SVG 片段
    if (/^(?:[a-z][a-z0-9+.\-]*:)?\/\//i.test(s)) return true;   // 带 scheme 或协议相对 //host
    if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return true;            // 其它 scheme（http/javascript/file/ms-*…）
    return false;                                  // 相对路径放行（受 CSP style-src 'self' 约束）
  }

  function stripRemoteCss(css) {
    let removed = 0;
    let out = decodeCssEscapes(String(css == null ? '' : css));
    // ① @import：整条判断。宽松地切出 "@import … 到分号/行尾" 这一段（不跨行），再看它的引用是否远程。
    out = out.replace(/@import[^;\n]*;?/gi, function (m) {
      const um = /url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/i.exec(m);
      const sm = /(['"])([^'"]*)\1/.exec(m);
      const ref = um ? um[2] : (sm ? sm[2] : '');
      if (!ref || !isRemoteRef(ref)) return m;   // 相对路径 / 没引用的畸形写法都原样留着（浏览器自己会忽略畸形）
      removed++;
      return '';
    });
    // ② url()：远程的一律替换成 none —— 保持这条声明本身合法，不牵连同一规则里的其它值
    out = out.replace(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi, function (m, q, ref) {
      if (!isRemoteRef(ref)) return m;
      removed++;
      return 'none';
    });
    return { css: out, removed: removed };
  }

  function create(ctx) {
    const read = () => {
      const list = ctx.load();
      return Array.isArray(list) ? list : [];
    };
    const write = list => ctx.save(list);

    function list() { return read(); }
    function names() { return read().map(t => t.name); }
    function find(name) { return read().find(t => t.name === name) || null; }

    function apply(name) {
      const th = find(name);
      if (!th) return false;
      // 🛡 V4.3.35：应用时再过滤一次 —— 存储里可能还留着导入前就存在、带外链的旧主题
      ctx.applyCss(stripRemoteCss(th.css).css);
      ctx.setActive(name);
      ctx.hint((ctx.t('themeApplied') || '') + name);
      return true;
    }

    async function importTheme() {
      const f = await ctx.openFile({ title: ctx.t('themeImportTitle'), filters: [{ name: 'Theme', extensions: ['json', 'css'] }] });
      if (!f || f.canceled) return false;
      if (f.error) { ctx.hint(ctx.t('importError') + f.error); return false; }
      let name = String(f.name || 'theme').replace(/\.[^.]+$/, '');
      let css = f.content;
      try {
        const j = JSON.parse(f.content);
        if (j && typeof j.css === 'string') { name = j.name || name; css = j.css; }
      } catch (e) {}
      // 🛡 V4.3.35：存之前剥掉远程引用（@import / url(http…)）
      const clean = stripRemoteCss(css);
      css = clean.css;
      const next = read().filter(x => x.name !== name);
      next.push({ name, css, savedAt: new Date().toISOString() });
      /* V4.3.33b：`write` 底层是 localStorage.setItem，配额超限时会失败 ——
         原先无论成没成都会继续 apply 并提示"已导入"，用户刷新后主题凭空消失。
         现在 app.js 的 Storage.set 会返回布尔，这里据此如实报错，不再假报成功。 */
      if (write(next) === false) { ctx.hint(ctx.t('importError') + '（存储空间不足，主题未保存）'); return false; }
      apply(name);
      if (clean.removed) ctx.hint((ctx.t('themeRemoteStripped') || '') + clean.removed);
      ctx.onChanged();
      return true;
    }

    async function exportTheme(name) {
      const th = find(name);
      if (!th) { ctx.hint(ctx.t('themePickFirst')); return false; }
      const text = JSON.stringify({ app: '浅水鲸主题', name: th.name, css: th.css, savedAt: th.savedAt }, null, 2);
      const r = await ctx.saveFile({ title: ctx.t('themeExportTitle'), defaultPath: '浅水鲸主题_' + th.name + '.json', filters: [{ name: 'JSON', extensions: ['json'] }], content: text });
      if (r && r.canceled) { ctx.hint(ctx.t('exportCanceled')); return false; }
      if (!r || r.error) { ctx.hint(ctx.t('importError') + ((r && r.error) || '')); return false; }
      ctx.hint(ctx.t('exportDone'));
      return true;
    }

    function remove(name) {
      write(read().filter(t => t.name !== name));
      if (ctx.getActive() === name) {
        ctx.clearCss();
        ctx.setActive('');
      }
      ctx.onChanged();
      ctx.hint(ctx.t('themeRemoved'));
    }

    function clear() {
      ctx.clearCss();
      ctx.setActive('');
      ctx.onChanged();
      ctx.hint(ctx.t('themeCleared'));
    }

    return { list, names, find, apply, importTheme, exportTheme, remove, clear };
  }

  /* 🛡 V4.3.38：把 stripRemoteCss 暴露出去 —— 自定义 CSS（fcss）走的是**另一条**注入通道
     （app.js 的 applyCustomCss），原先完全不过滤，一份被篡改的备份塞 @import 即可外联。 */
  global.ReaderThemes = { create, stripRemoteCss };
})(window);
