// 浅水鲸 · 通用工具函数（全局可用，需在 app.js 之前加载）
(function (global) {
  'use strict';

  function hexToRgb(hex) {
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return r ? { r: parseInt(r[1], 16), g: parseInt(r[2], 16), b: parseInt(r[3], 16) } : null;
  }

  function rgbToHex(rgb) {
    if (!rgb) return '';
    return '#' + [rgb.r, rgb.g, rgb.b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }

  // 把键盘事件格式化成统一的快捷键字符串，例如 Ctrl+Shift+H、←、Space
  function formatShortcut(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (e.metaKey) parts.push('Meta');
    let key = e.key;
    if (key === 'ArrowLeft') key = '←';
    if (key === 'ArrowRight') key = '→';
    if (key === 'ArrowUp') key = '↑';
    if (key === 'ArrowDown') key = '↓';
    if (key === ' ') key = 'Space';
    /* 🛡 V4.3.78：key 可能是 undefined（实机日志出现过一次 Uncaught —— 非标准 keydown 合成事件）。
       判空必须放在 key.length 之前 —— 原来的 !key 检查在 29 行，晚了。 */
    if (!key) return null;
    if (key.length === 1) key = key.toUpperCase();
    if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return null;
    if (key === 'Escape' || key === 'Tab') return null;
    /* V4.3.33b：`Dead`（死键 / 组合输入中间态）、`Unidentified`（浏览器认不出的键）、
       `Process`（输入法正在处理）都不是真实可绑定的按键 —— 原样放过去会录出一个
       永远匹配不上的快捷键，把用户原本的绑定冲掉。 */
    if (key === 'Dead' || key === 'Unidentified' || key === 'Process') return null;
    parts.push(key);
    return parts.join('+');
  }

  // 语义化版本比较：latest 是否比 current 新
  function versionNewer(latest, current) {
    /* V4.3.35：先剥掉 `v` 前缀与预发布 / 构建元数据后缀。
       原先 `4.3.34-beta` 里 parseInt('34-beta') 仍得 34，会被当成与 `4.3.34` 同版本（少报一次更新）；
       `4.3.34+build.7` 同理；而 `v4.3.34` 的首段 parseInt('v4') 恒为 0，会把大版本差异整个抹平。 */
    const norm = v => String(v == null ? '' : v).trim().replace(/^v/i, '').split(/[-+]/)[0];
    const a = norm(latest).split('.').map(n => parseInt(n, 10) || 0);
    const b = norm(current).split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x > y) return true;
      if (x < y) return false;
    }
    return false;
  }

  function bytesToB64(bytes) {
    /* 分块 String.fromCharCode.apply：逐字节 s+= 在大导出（几 MB）时是 O(n²) 级别的字符串重拷贝；
       每块 0x8000（apply 参数个数上限以内），行为与旧实现完全一致。 */
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function clampNumber(value, min, max, fallback) {
    /* V4.3.33b：`Number(null)` 和 `Number('')` 都等于 0（属于有限值），会被当成合法输入钳到 min ——
       而这两个值的真实语义是「没填」，应当回落 fallback（设置项被静默改成最小值就是这个原因）。 */
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function formatBytes(n) {
    const v = Number(n) || 0;
    if (v < 1024) return v + ' B';
    if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB';
    return (v / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* 🟥 V4.3.45（R4-4）：用户可见文件名里的日期必须是**本地日期**。
     四处导出（备份 / 书架 / 日志 / 反馈包）原先都用 `new Date().toISOString().slice(0,10)`，
     那是 **UTC** 日期 —— 北京时间 00:00–08:00（一天中 1/3 的时间）导出的文件名会比用户
     日历上的日期**早一天**，用户在"今天"里找不到刚导出的文件。
     这里与 main.js 的主进程共用同一份实现（见文件末尾的 module.exports 分支）。 */
  function localDateKey(d) {
    const t = d || new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }

  global.ReaderUtil = {
    hexToRgb,
    rgbToHex,
    formatShortcut,
    versionNewer,
    bytesToB64,
    b64ToBytes,
    escapeHtml,
    clampNumber,
    formatBytes,
    localDateKey
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* 🟥 V4.3.45：主进程 `require('./scripts/util.js')` 拿到的就是上面**同一份**实现
   —— 导出文件名的时间语义不允许渲染层与主进程各写一份（口径一漂就又是一天之差）。
   渲染层走 <script> 挂 window.ReaderUtil，主进程走这里。 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).ReaderUtil;
}
