/* 浅水鲸 · 核心单元测试（V4.3.32）
   用法：node tests/core.test.js        （不需要 Electron，不需要联网）
   退出码：0 = 全绿；1 = 有失败（可直接接进 CI / 发布门禁）

   为什么只测这三个模块：
     scripts/util.js      —— 快捷键格式化 / 版本比较 / HTML 转义 / 数值夹取
     scripts/encoding.js  —— 文本编码判定（错=全书乱码）
     scripts/exts.js      —— 本地文档扩展名白名单（错=文件打不开 / 关联不上）
   这三个是纯函数「单点真源」，不依赖 DOM、不依赖主进程，出错代价最高、最适合单测。
   窗口 / IPC / 抓取 / 渲染等端到端行为由 smoke2~6 冒烟覆盖，这里不重复。 */
'use strict';

const path = require('path');
const assert = require('assert');

/* ---------- 极简测试运行器 ---------- */
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failed++; failures.push({ name: name, msg: e.message }); console.log('  \u2717 ' + name + '\n      ' + String(e.message).split('\n')[0]); }
}
function group(title) { console.log('\n' + title); }

/* ---------- 载入被测模块 ---------- */
const SRC = path.join(__dirname, '..', 'scripts');

// util.js 是 (function(global){...})(window) 形态，Node 下先补一个 window
if (typeof global.window === 'undefined') global.window = global;
require(path.join(SRC, 'util.js'));
const U = global.window.ReaderUtil;

const enc = require(path.join(SRC, 'encoding.js'));
const exts = require(path.join(SRC, 'exts.js'));

/* =========================================================
   1. scripts/util.js · ReaderUtil
   ========================================================= */
group('[1] scripts/util.js · ReaderUtil');

test('导出面完整（9 个函数，缺一个都是回归）', () => {
  const want = ['hexToRgb', 'rgbToHex', 'formatShortcut', 'versionNewer',
                'bytesToB64', 'b64ToBytes', 'escapeHtml', 'clampNumber', 'formatBytes'];
  for (const k of want) assert.strictEqual(typeof U[k], 'function', '缺少 ' + k);
});

test('hexToRgb：6 位十六进制（带/不带 #）', () => {
  assert.deepStrictEqual(U.hexToRgb('#ff8000'), { r: 255, g: 128, b: 0 });
  assert.deepStrictEqual(U.hexToRgb('a1b2c3'), { r: 161, g: 178, b: 195 });
  assert.strictEqual(U.hexToRgb('#gggggg'), null, '非法字符应返回 null');
  assert.strictEqual(U.hexToRgb('#fff'), null, '3 位缩写不支持，应返回 null');
});

test('rgbToHex：越界值夹回 0~255、小数四舍五入', () => {
  assert.strictEqual(U.rgbToHex({ r: 255, g: 128, b: 0 }), '#ff8000');
  assert.strictEqual(U.rgbToHex({ r: -20, g: 300, b: 127.6 }), '#00ff80');
  assert.strictEqual(U.rgbToHex(null), '', 'null 应返回空串');
});

test('formatShortcut：修饰键顺序恒为 Ctrl+Shift+Alt+Meta', () => {
  assert.strictEqual(U.formatShortcut({ ctrlKey: true, shiftKey: true, key: 'h' }), 'Ctrl+Shift+H');
  assert.strictEqual(U.formatShortcut({ shiftKey: true, ctrlKey: true, key: 'H' }), 'Ctrl+Shift+H');
  assert.strictEqual(U.formatShortcut({ altKey: true, key: 'p' }), 'Alt+P');
});

test('formatShortcut：方向键/空格/单字母映射', () => {
  assert.strictEqual(U.formatShortcut({ key: 'ArrowLeft' }), '\u2190');
  assert.strictEqual(U.formatShortcut({ key: 'ArrowRight' }), '\u2192');
  assert.strictEqual(U.formatShortcut({ key: ' ' }), 'Space');
  assert.strictEqual(U.formatShortcut({ key: 'f' }), 'F');
});

test('formatShortcut：纯修饰键 / Escape / Tab 返回 null（不可登记）', () => {
  assert.strictEqual(U.formatShortcut({ ctrlKey: true, key: 'Control' }), null);
  assert.strictEqual(U.formatShortcut({ key: 'Shift' }), null);
  assert.strictEqual(U.formatShortcut({ key: 'Escape' }), null);
  assert.strictEqual(U.formatShortcut({ key: 'Tab' }), null);
  /* V4.3.33b：这三种都不是真实可绑定的按键 —— 放过去会录出一个永远匹配不上的快捷键 */
  assert.strictEqual(U.formatShortcut({ key: 'Dead' }), null, '死键不可登记');
  assert.strictEqual(U.formatShortcut({ key: 'Unidentified' }), null, '识别不出的键不可登记');
  assert.strictEqual(U.formatShortcut({ key: 'Process' }), null, 'IME 处理中的键不可登记');
});

test('versionNewer：逐段数值比较（不是字符串比较）', () => {
  assert.strictEqual(U.versionNewer('4.3.32', '4.3.31'), true);
  assert.strictEqual(U.versionNewer('4.3.9', '4.3.10'), false, '9 不比 10 新（字符串比较会错）');
  assert.strictEqual(U.versionNewer('4.4.0', '4.3.99'), true);
  assert.strictEqual(U.versionNewer('4.3.32', '4.3.32'), false, '同版不算更新');
  assert.strictEqual(U.versionNewer('', '4.3.32'), false, '空值不应误报更新');
});

test('🔒 回归锁：versionNewer 要剥掉 v 前缀与预发布 / 构建后缀（V4.3.35 修复）', () => {
  // 原先 `4.3.34-beta` 里 parseInt('34-beta') 仍得 34 → 预发布版被当成同版本（少报一次更新）；
  // 而 `v4.3.34` 的首段 parseInt('v4') 恒为 0 → 大版本差异被整个抹平。
  assert.strictEqual(U.versionNewer('v4.3.35', '4.3.34'), true, 'v 前缀不能吃掉大版本号');
  assert.strictEqual(U.versionNewer('4.3.35-beta', '4.3.34'), true, '预发布版仍应被识别为更新');
  assert.strictEqual(U.versionNewer('4.3.35-beta', '4.3.35'), false, '同版本号的预发布不算更新');
  assert.strictEqual(U.versionNewer('4.3.35+build.7', '4.3.34'), true, '构建元数据不影响数值比较');
  assert.strictEqual(U.versionNewer(' 4.3.35 ', '4.3.34'), true, '首尾空白应被容忍');
  assert.strictEqual(U.versionNewer('5.0.0-rc.1', '4.9.9'), true);
});

test('escapeHtml：五个危险字符全转义（XSS 防线）', () => {
  assert.strictEqual(U.escapeHtml('<img src=x onerror=alert(1)>'),
    '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(U.escapeHtml('a&b"c\'d'), 'a&amp;b&quot;c&#39;d');
  assert.strictEqual(U.escapeHtml(null), '', 'null 应返回空串而不是 "null"');
  assert.strictEqual(U.escapeHtml(undefined), '');
});

test('clampNumber：夹取 + 非法值走 fallback', () => {
  assert.strictEqual(U.clampNumber(150, 10, 100, 50), 100);
  assert.strictEqual(U.clampNumber(-5, 10, 100, 50), 10);
  assert.strictEqual(U.clampNumber(42, 10, 100, 50), 42);
  assert.strictEqual(U.clampNumber('abc', 10, 100, 50), 50, '非数字应回退');
  assert.strictEqual(U.clampNumber(NaN, 10, 100, 50), 50);
  /* V4.3.33b：空串 / null 的语义是「没填」，应回落 fallback。
     旧行为是 Number('')===0 被当成合法值钳到 min —— 设置项会被静默改成最小值。 */
  assert.strictEqual(U.clampNumber('', 0, 1, 0.8), 0.8, '空串应回落 fallback');
  assert.strictEqual(U.clampNumber(null, 0, 10, 9), 9, 'null 应回落 fallback');
  assert.strictEqual(U.clampNumber(undefined, 0, 10, 9), 9, 'undefined 应回落 fallback');
});

test('formatBytes：B / KB / MB 三档', () => {
  assert.strictEqual(U.formatBytes(512), '512 B');
  assert.strictEqual(U.formatBytes(2048), '2.0 KB');
  assert.strictEqual(U.formatBytes(3 * 1024 * 1024), '3.0 MB');
  assert.strictEqual(U.formatBytes(null), '0 B');
});

test('bytesToB64 / b64ToBytes：往返一致（含 0x00 与 0xFF 边界）', () => {
  const src = new Uint8Array([0, 1, 127, 128, 255, 66, 67]);
  const back = U.b64ToBytes(U.bytesToB64(src));
  assert.deepStrictEqual(Array.from(back), Array.from(src));
  assert.strictEqual(U.b64ToBytes(U.bytesToB64(new Uint8Array([]))).length, 0, '空数组往返仍为空');
});

/* =========================================================
   2. scripts/encoding.js · 文本编码判定
   ========================================================= */
group('[2] scripts/encoding.js · 文本编码判定');

const iconv = require(path.join(__dirname, '..', 'node_modules', 'iconv-lite'));
const SAMPLE = '这是一本中文小说的测试文本，用来验证编码判定是否正确。';

test('导出面完整', () => {
  for (const k of ['decodeBuffer', 'looksUtf16', 'utf16LegitRatio', 'isLegitCp', 'strictUtf8', 'countHits',
                   'decodeUtf16be', 'legacyFitsBetter'])
    assert.strictEqual(typeof enc[k], 'function', '缺少 ' + k);
});

test('UTF-8 BOM：正确剥离 BOM 并解码', () => {
  const buf = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(SAMPLE, 'utf8')]);
  const out = enc.decodeBuffer(buf);
  assert.strictEqual(out, SAMPLE);
  assert.strictEqual(out.charCodeAt(0) === 0xFEFF, false, 'BOM 必须被剥掉');
});

test('UTF-16LE BOM：正确解码', () => {
  const buf = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(SAMPLE, 'utf16le')]);
  assert.strictEqual(enc.decodeBuffer(buf), SAMPLE);
});

test('无 BOM 的 UTF-8：走严格校验分支', () => {
  assert.strictEqual(enc.decodeBuffer(Buffer.from(SAMPLE, 'utf8')), SAMPLE);
});

test('GB18030（简体老文本）：投票应选中 GB18030 而非 Big5', () => {
  const buf = iconv.encode(SAMPLE, 'gb18030');
  const out = enc.decodeBuffer(buf);
  assert.strictEqual(out, SAMPLE, 'GB18030 文本必须解对，否则会全书乱码');
});

test('Big5（繁体老文本）：投票应选中 Big5', () => {
  const tw = '這是一本繁體中文小說的測試文本，用來驗證編碼判定是否正確。';
  const buf = iconv.encode(tw, 'big5');
  assert.strictEqual(enc.decodeBuffer(buf), tw);
});

test('无 BOM 的 UTF-16LE：不能漏判成 GBK（中文码位高字节非 0 的坑）', () => {
  const buf = Buffer.from(SAMPLE, 'utf16le');
  assert.strictEqual(enc.looksUtf16(buf, true), true, '应被识别为 UTF-16LE');
  assert.strictEqual(enc.decodeBuffer(buf), SAMPLE, '中文 UTF-16 常被漏判，这是回归点');
});

test('无 BOM 的 UTF-16BE：中文也要认出来（「中文反证」不能把修的方向修反）', () => {
  assert.strictEqual(enc.decodeBuffer(iconv.encode(SAMPLE, 'utf16be')), SAMPLE);
  assert.strictEqual(enc.decodeBuffer(Buffer.concat([Buffer.from([0xFE, 0xFF]), iconv.encode(SAMPLE, 'utf16be')])), SAMPLE);
});

test('真 UTF-16 英文：不能被我加的「中文反证」误伤', () => {
  const s = 'Hello, this is a plain ASCII sentence encoded in UTF-16.';
  assert.strictEqual(enc.decodeBuffer(Buffer.from(s, 'utf16le')), s, 'UTF-16LE 英文');
  assert.strictEqual(enc.decodeBuffer(iconv.encode(s, 'utf16be')), s, 'UTF-16BE 英文');
});

test('🔒 回归锁：纯中文（无 ASCII）的 GBK 文本不得解成韩文（V4.3.33 修复）', () => {
  // 高字节 0xAC~0xDF 的 GBK 汉字被当 UTF-16BE 解，码位落进谚文区/代理对区，
  // 而 isLegitCp 把这两段都算「合法」→ BE 合法率假性超标（实测 0.926），
  // 只有「中文反证」能否决它。这条锁的是反证，不是那个 0.90 阈值 —— 阈值对这种情况天然无能为力。
  const gb = iconv.encode(SAMPLE, 'gb18030');
  assert.ok(!/[\x00-\x7F]/.test(SAMPLE), '前提：样本不含 ASCII，否则不会触发 BE 假阳性');
  assert.ok(enc.utf16LegitRatio(gb, false) > 0.9, '前提：BE 合法率确实假性超标（>0.9），本条锁才有意义');
  assert.strictEqual(enc.decodeBuffer(gb), SAMPLE, '应被中文反证否决 UTF-16，回到 GB18030 投票解出正确中文');
  assert.strictEqual(enc.legacyFitsBetter(gb, iconv.decode(gb, 'utf16be')), true, '反证应判定老编码更贴合');
});

test('🔒 回归锁：纯中文（无 ASCII）的 Big5 繁体文本同样不受影响', () => {
  const tw = '這是一本中文小說的測試文本，用來驗證編碼判定是否正確。';
  assert.strictEqual(enc.decodeBuffer(iconv.encode(tw, 'big5')), tw);
});

test('空的 / 非 Buffer 入参：永不抛异常，返回字符串', () => {
  assert.strictEqual(enc.decodeBuffer(Buffer.alloc(0)), '');
  assert.strictEqual(enc.decodeBuffer(null), '');
  assert.strictEqual(typeof enc.decodeBuffer('plain'), 'string');
});

test('严格 UTF-8 校验：GBK 字节应判为「不是合法 UTF-8」', () => {
  const gbk = iconv.encode(SAMPLE, 'gb18030');
  assert.strictEqual(enc.strictUtf8(gbk), null, 'GBK 文本被当 UTF-8 解会产出别的字，必须 fatal 拦截');
  assert.strictEqual(enc.strictUtf8(Buffer.from(SAMPLE, 'utf8')), SAMPLE);
});

test('isLegitCp：合法码位表（ASCII/汉字/标点/换行）', () => {
  for (const cp of [0x09, 0x0A, 0x0D, 0x41, 0x7E, 0x4E2D, 0x3002, 0xFF01]) 
    assert.strictEqual(enc.isLegitCp(cp), true, '0x' + cp.toString(16) + ' 应为合法');
  for (const cp of [0x0001, 0xE000, 0xF8FF, 0x10FFFF])
    assert.strictEqual(enc.isLegitCp(cp), false, '0x' + cp.toString(16) + ' 应为非法');
});

test('countHits：常见字命中计数单调（越多常见字命中越高）', () => {
  assert.ok(enc.countHits('的一是不了在人有') > 0);
  assert.strictEqual(enc.countHits('zzzzzz'), 0);
});

/* =========================================================
   3. scripts/exts.js · 扩展名白名单（唯一真源）
   ========================================================= */
group('[3] scripts/exts.js · 扩展名白名单');

test('是数组且非空', () => {
  assert.ok(Array.isArray(exts), 'exts 应为数组');
  assert.ok(exts.length > 0);
});

test('每项都以 . 开头且全小写（口径统一，否则关联/匹配会漏）', () => {
  for (const e of exts) {
    assert.ok(e.startsWith('.'), '缺少前导点：' + e);
    assert.strictEqual(e, e.toLowerCase(), '应全小写：' + e);
  }
});

test('无重复项', () => {
  const dup = exts.filter((e, i) => exts.indexOf(e) !== i);
  assert.deepStrictEqual(dup, [], '存在重复扩展名：' + dup.join(', '));
});

test('必须包含三类本地文档（V4.3.27 单点化的直接原因）', () => {
  for (const e of ['.txt', '.docx', '.epub', '.pdf'])
    assert.ok(exts.indexOf(e) >= 0, '缺少关键扩展名 ' + e);
});

test('不得包含可执行/脚本类（打开它们等于执行代码）', () => {
  for (const e of ['.exe', '.dll', '.msi', '.scr', '.com', '.cpl'])
    assert.ok(exts.indexOf(e) < 0, '危险扩展名不应进白名单：' + e);
});

/* =========================================================
   汇总
   ========================================================= */
console.log('\n' + '-'.repeat(56));
console.log('core.test.js：通过 ' + passed + ' 项，失败 ' + failed + ' 项');
if (failed) {
  console.log('失败明细：');
  for (const f of failures) console.log('  · ' + f.name + ' → ' + f.msg);
  process.exit(1);
}
console.log('CORE UNIT TEST PASS');
