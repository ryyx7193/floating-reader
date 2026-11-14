'use strict';
/*
 * _build_app.js —— 渲染层「源分片 → 拼接生成」构建器（V4.3.82 F5/S3 收口）
 *
 * 为什么不是「去闭包全局化」：app.js 是 IIFE + `__reader` 全局，几十个门禁/探针/i18n 提取
 * 都从 `scripts/app.js` 的**文本形态**抠代码。改成真模块会让这些门禁大面积假红、且改一次
 * 门禁就要重验一次行为 —— 风险与收益不成比例。
 *
 * 采用的方案：**分片源 + 拼接生成**。
 *   · 真源在 `scripts/app/*.js`（按功能切，命名 00- 10- 20- … 决定拼接顺序）
 *   · `scripts/app.js` 变成**生成物**（内容与分片拼接结果逐字一致）
 *   · 门禁、探针、i18n 提取全部照旧读 scripts/app.js —— 零改动
 *   · 发布链加 `--check`：生成结果与现有 app.js 不一致就 FAIL（防止有人直接改生成物）
 *
 * 用法：
 *   node _build_app.js            # 生成 scripts/app.js
 *   node _build_app.js --check    # 只校验（不一致则退出码 1）
 *
 * panel.js 同构：分片在 `scripts/panel/*.js`。
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'scripts');
/* 分片目录放在**顶层** app-src/ 与 panel-src/ —— 刻意不放 scripts/ 下：
   sync_app 对 scripts 做 robocopy /MIR，放里面会把源分片一起打进绿色版（体积+混淆）。 */
const PART_DIR = __dirname;

/* 分片清单：顺序即拼接顺序。新增分片必须同时登记到这里（否则 build 报错提醒）。 */
const MANIFESTS = [
  /* 主进程也用分片生成（V4.3.82）：面板管理/伴随/IPC 这些块与 mainWindow、panels 等状态
     深度共享，强行拆成 require 模块要注入十几个依赖、且面板/伴随刚出过事故 ——
     分片生成零风险（产物逐字不变、门禁零改动），可维护性收益一样。 */
  { out: 'main.js', outDir: __dirname, dir: 'main-src', parts: [
    '00-head.js',
    '05-security.js',
    '10-log-backup-crypto.js',
    '15-protect.js',
    '20-panels.js',
    '25-drag-show.js',
    '30-window-tray.js',
    '35-fgwatch.js',
    '40-companion.js',
    '45-picker.js',
    '50-source.js',
    '51-source-auto.js',
    '52-site-detect.js',
    '55-ipc.js',
    '60-update-assoc-open.js',
    '65-diag-tail.js',
  ] },
  { out: 'app.js', outDir: SRC_DIR, dir: 'app-src', parts: [
    '00-core.js',
    '10-bookmarks.js',
    '20-migrate-ui-errors-backup.js',
    '30-shelf.js',
    '40-panels-bridge.js',
    '50-disguise.js',
    '55-fgwatch.js',
    '60-companion.js',
    '70-autoupdate-password-tts-theme-update.js',
    '80-diag-shortcuts.js',
  ] },
  { out: 'panel.js', outDir: SRC_DIR, dir: 'panel-src', parts: [
    '00-core.js',
    '10-toolbar.js',
    '20-settings.js',
    '30-toc-search-bookmarks.js',
    '40-source-shelf-init.js',
    '50-library-bookmarks-tail.js',
  ] },
];

function buildOne(m) {
  const dir = path.join(PART_DIR, m.dir);
  if (!fs.existsSync(dir)) return { skipped: true, out: m.out };
  const missing = m.parts.filter(p => !fs.existsSync(path.join(dir, p)));
  if (missing.length) throw new Error('分片缺失: ' + m.dir + '/ 下缺 ' + missing.join(', '));
  /* 目录里若有未登记的分片也报错 —— 防止"加了片却忘了拼" */
  const onDisk = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  const extra = onDisk.filter(f => m.parts.indexOf(f) < 0);
  if (extra.length) throw new Error('分片未登记到 MANIFESTS: ' + m.dir + '/ 下 ' + extra.join(', '));
  const text = m.parts.map(p => fs.readFileSync(path.join(dir, p), 'utf8')).join('');
  return { text: text, out: m.out, parts: m.parts.length };
}

let failed = 0;
const checkOnly = process.argv.indexOf('--check') >= 0;
for (const m of MANIFESTS) {
  let r;
  try { r = buildOne(m); } catch (e) { console.log('✗ ' + m.out + ': ' + e.message); failed++; continue; }
  if (r.skipped) { console.log('· ' + m.out + '：无分片目录，跳过'); continue; }
  const outPath = path.join(m.outDir || SRC_DIR, m.out);
  const cur = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
  if (checkOnly) {
    if (cur !== r.text) { console.log('✗ ' + m.out + '：生成物与分片不一致（有人直接改了生成物？请改 ' + m.dir + '/ 下的分片后重新 build）'); failed++; }
    else console.log('✓ ' + m.out + '：与 ' + r.parts + ' 个分片逐字一致');
  } else {
    if (cur === r.text) console.log('· ' + m.out + '：无变化');
    else { fs.writeFileSync(outPath, r.text, 'utf8'); console.log('✓ ' + m.out + '：已由 ' + r.parts + ' 个分片生成'); }
  }
}
if (failed) { console.log('BUILD_APP FAIL (' + failed + ')'); process.exit(1); }
console.log(checkOnly ? 'BUILD_APP CHECK PASS' : 'BUILD_APP OK');
