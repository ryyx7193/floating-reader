/* 受支持的本地文档扩展名 —— 全项目**唯一真源**（V4.3.27）。
   主进程 require 它、渲染层用 <script> 挂成全局 READER_EXTS，两边共用同一份数组。
   之所以要单点化：以前 app.js 的 SUPPORTED_EXTS（22 项）、main.js 的 OPENABLE_EXTS（8 项）、
   ASSOC_EXTS（4 项）三个口径各抄一遍又没人对齐 —— .docx 明明能加载却注册不进「打开方式」，
   .log / .csv 能加载却不在关联里，用户只能靠猜。改这里，三处一起生效。

   🟥 V4.3.43 再收一层：数组上挂 `.text` / `.rich` 两个**分类视图**。
   起因：app.js 的 loadFiles 里还藏着第三份「文本类」清单，改 exts.js 时它不会跟着变，
   而它决定「要不要按编码解码」—— 漏一个扩展名的表现是「文件能被选中，打开后却空白」。
   注意 `module.exports = list` 必须仍是**数组**（main.js 直接当数组用），分类只作附加属性。 */
(function (root, factory) {
  var list = factory();
  if (typeof module === 'object' && module.exports) module.exports = list;
  else root.READER_EXTS = list;
})(typeof self !== 'undefined' ? self : this, function () {
  // 纯文本：读进来要判编码再解成字符串 → 交给 scripts/encoding.js 的 decodeBuffer（经主进程）
  var TEXT = [
    '.txt', '.md', '.log', '.json', '.js', '.py', '.css', '.html', '.xml', '.yaml', '.yml',
    '.csv', '.ts', '.jsx', '.tsx', '.vue', '.sh', '.bat', '.ps1'
  ];
  // 富文档 / 二进制：交给 docx / epub.js / pdf.js 各自的解析器，**绝不走文本解码**
  var RICH = ['.docx', '.epub', '.pdf'];
  var list = TEXT.concat(RICH);
  list.text = TEXT;
  list.rich = RICH;
  return list;
});
