/* 🎨 由 work/_ico_gen.js 从 scripts/icons.js 生成（V4.3.63）—— **不要手改**。
   改图标 → 改 scripts/icons.js → 跑 node work/_ico_gen.js --write → 门禁 [3.30]/[3.36] 核对。
   存在意义：让 panel.js 里动态拼出来的按钮也能用同一套图标（此前只能写 emoji）。 */
(function () {
  var GRID = 24;
  var SHAPES = {
    "menu": "<path d=\"M4 7h16M4 12h16M4 17h16\"/>",
    "panels": "<rect x=\"3\" y=\"4.5\" width=\"11\" height=\"15\" rx=\"2\"/><rect x=\"14\" y=\"7.5\" width=\"7\" height=\"9\" rx=\"1.5\"/>",
    "focus": "<rect x=\"3.5\" y=\"3.5\" width=\"17\" height=\"17\" rx=\"2.5\"/><path d=\"M12 3.5v17M3.5 12h17\"/>",
    "maximize": "<path d=\"M9.5 4H4v5.5M14.5 4H20v5.5M20 14.5V20h-5.5M9.5 20H4v-5.5\"/>",
    "minimize": "<path d=\"M4 9.5h5.5V4M20 9.5h-5.5V4M20 14.5h-5.5V20M4 14.5h5.5V20\"/>",
    "win-minimize": "<path d=\"M6 12h12\"/>",
    "help": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9.2 9.4a2.9 2.9 0 1 1 3.9 2.8c-.7.3-1.1.8-1.1 1.6v.4\"/><circle cx=\"12\" cy=\"17.4\" r=\"1.05\" fill=\"currentColor\" stroke=\"none\"/>",
    "close": "<path d=\"M6 6l12 12M18 6L6 18\"/>",
    "chevron-left": "<path d=\"M14.5 6L8.5 12l6 6\"/>",
    "chevron-right": "<path d=\"M9.5 6l6 6-6 6\"/>",
    "chevron-down": "<path d=\"M6 9.5l6 6 6-6\"/>",
    "arrow-up": "<path d=\"M12 19V5M6 11l6-6 6 6\"/>",
    "arrow-down": "<path d=\"M12 5v14M6 13l6 6 6-6\"/>",
    "crosshair": "<circle cx=\"12\" cy=\"12\" r=\"7.5\"/><circle cx=\"12\" cy=\"12\" r=\"1.4\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M12 2v4M12 18v4M2 12h4M18 12h4\"/>",
    "search": "<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\"/><path d=\"M15.5 15.5L21 21\"/>",
    "settings": "<path d=\"M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
    "book": "<path d=\"M4 4.5h6.2A2.8 2.8 0 0 1 13 7.3v12a2.2 2.2 0 0 0-2.2-2.2H4z\"/><path d=\"M20 4.5h-6.2A2.8 2.8 0 0 0 11 7.3v12a2.2 2.2 0 0 1 2.2-2.2H20z\"/>",
    "rss": "<path d=\"M5 11a8 8 0 0 1 8 8M5 4.5A14.5 14.5 0 0 1 19.5 19\"/><circle cx=\"6\" cy=\"18\" r=\"1.6\" fill=\"currentColor\" stroke=\"none\"/>",
    "list": "<path d=\"M9 6.5h11M9 12h11M9 17.5h11\"/><circle cx=\"5\" cy=\"6.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"5\" cy=\"12\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"5\" cy=\"17.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/>",
    "bookmark": "<path d=\"M7 4.5h10v16l-5-3.6-5 3.6z\"/>",
    "sliders": "<path d=\"M4 7h9M17 7h3M4 17h4M12 17h8\"/><circle cx=\"15\" cy=\"7\" r=\"2\"/><circle cx=\"10\" cy=\"17\" r=\"2\"/>",
    "trash": "<path d=\"M4.5 7h15M9.5 7V4.6h5V7M6.5 7l1 13h9l1-13\"/><path d=\"M10.5 11v5M13.5 11v5\"/>",
    "folder-open": "<path d=\"M3.5 9V6.2A1.7 1.7 0 0 1 5.2 4.5h4l2 2.4h7.1A1.7 1.7 0 0 1 20 8.6V9\"/><path d=\"M3.5 9.5h17l-2 8.3a1.7 1.7 0 0 1-1.7 1.2H6.2a1.7 1.7 0 0 1-1.7-1.3z\"/>",
    "reset": "<path d=\"M4.5 12a7.5 7.5 0 1 1 2.6 5.7\"/><path d=\"M4 8v4.5h4.5\"/>",
    "palette": "<path d=\"M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.9 0-1.5-1.3-1.7-1.3-2.9 0-.9.8-1.6 1.8-1.6h1.8a3.7 3.7 0 0 0 3.7-3.7c0-3.8-3.6-6.9-8-6.9z\"/><circle cx=\"8.2\" cy=\"10\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"12\" cy=\"7.6\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/><circle cx=\"15.9\" cy=\"10.2\" r=\"1.1\" fill=\"currentColor\" stroke=\"none\"/>",
    "eyedropper": "<path d=\"M15.5 3.9a2.3 2.3 0 0 1 3.3 0l1.3 1.3a2.3 2.3 0 0 1 0 3.3l-8.6 8.6-4.9 1.3 1.3-4.9z\"/><path d=\"M13.5 5.9l4.6 4.6\"/>",
    "bolt": "<path d=\"M13 2.5L5 13.5h5.5L10 21.5l8-11h-5.5z\"/>",
    "shield": "<path d=\"M12 3.2l7 2.6v5.4c0 4.3-2.9 7.5-7 9.2-4.1-1.7-7-4.9-7-9.2V5.8z\"/>",
    "lifebuoy": "<circle cx=\"12\" cy=\"12\" r=\"8.6\"/><circle cx=\"12\" cy=\"12\" r=\"3.4\"/><path d=\"M6 6l3.4 3.4M18 6l-3.4 3.4M18 18l-3.4-3.4M6 18l3.4-3.4\"/>",
    "volume": "<path d=\"M4 9.5h3.2L12 5.5v13L7.2 14.5H4z\"/><path d=\"M15.5 9a4.2 4.2 0 0 1 0 6\"/><path d=\"M18 6.5a7.8 7.8 0 0 1 0 11\"/>",
    "type-minus": "<path d=\"M3.2 18.5L8.6 6l5.4 12.5M5.2 14.2h6.8\"/><path d=\"M16.5 12h5\"/>",
    "type-plus": "<path d=\"M3.2 18.5L8.6 6l5.4 12.5M5.2 14.2h6.8\"/><path d=\"M16.5 12h5M19 9.5v5\"/>",
    "text-lines": "<path d=\"M4 6.5h16M4 12h11M4 17.5h7\"/>",
    "droplet": "<path d=\"M12 3.5c3.2 4 5.5 6.4 5.5 9.2a5.5 5.5 0 0 1-11 0c0-2.8 2.3-5.2 5.5-9.2z\"/>",
    "window": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"2\"/><path d=\"M3.5 9h17\"/>",
    "contrast": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 3.5a8.5 8.5 0 0 0 0 17z\" fill=\"currentColor\" stroke=\"none\"/>",
    "ruler": "<rect x=\"3.5\" y=\"8.5\" width=\"17\" height=\"7\" rx=\"1.2\"/><path d=\"M7.5 8.5v3M11 8.5v4.5M14.5 8.5v3M18 8.5v4.5\"/>",
    "gauge": "<path d=\"M4 18a9 9 0 1 1 16 0\"/><path d=\"M12 18l4.5-5\"/>",
    "home": "<path d=\"M4 11.5L12 4.5l8 7\"/><path d=\"M6.5 10.5v9h11v-9\"/>",
    "edit": "<path d=\"M4.5 19.5h4l10-10-4-4-10 10z\"/><path d=\"M14.5 5.5l4 4\"/>",
    "columns": "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"2\"/><path d=\"M8 4.5v15M16 4.5v15\"/>"
  };
  function svg(name, state, extra) {
    var parts = [];
    if (extra) parts.push(extra);
    parts.push(state || 'ico');
    var body = SHAPES[name];
    if (!body) throw new Error('unknown icon: ' + name);
    return '<svg class="' + parts.join(' ') + '" data-ico="' + name + '"' +
      (state ? ' data-state="' + state + '"' : '') +
      ' viewBox="0 0 ' + GRID + ' ' + GRID + '" aria-hidden="true">' + body + '</svg>';
  }
  window.ReaderIcons = { GRID: GRID, SHAPES: SHAPES, names: Object.keys(SHAPES), svg: svg };
})();
