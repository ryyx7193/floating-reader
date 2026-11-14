#!/usr/bin/env node
/**
 * 浅水鲸 · 安全静态扫描（SAST）
 *
 * 对应「安全约束①：引入自动化安全工具链」。由 release.js / _release_run.sh 在封包前强制调用，
 * 命中高危模式直接失败（进程退出码非 0），阻断发布。
 *
 * 用法：
 *   node tests/security-scan.js           # 扫描本仓库自研代码
 *   node tests/security-scan.js --json    # 输出 JSON 报告
 *
 * 🟥 V4.3.43 修了四个"能溜过去"的口子（第二轮审查 I 项）：
 *   ① 只认 `eval(` / `new Function(` —— `(0,eval)("…")`、裸 `Function("…")()` 全放行；
 *   ② 逐行 test，把 `eval` 与 `(` 拆两行就绕过；
 *   ③ 只 readdirSync('scripts') 一层，**子目录里的 .js 完全不扫**；
 *   ④ 只看 .js，页面 `<script>` 内联块不在范围内。
 *   现在：整文判定（跨行拼接也命中）+ 行级定位；scripts 递归；页面内联脚本也扫；
 *   纯注释行的命中降级为 INFO（避免告警疲劳，但不静默丢弃）。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');   /* 本脚本位于 <repo>/tests/ */

// 高危模式：命中即失败
const HIGH = [
  { id: 'eval',            re: /\beval\s*\(/,                              why: '任意代码执行面，本项目零例外禁用' },
  { id: 'newFunction',     re: /\bnew\s+Function\s*\(/,                    why: '等价于 eval，禁用' },
  /* 🟥 V4.3.43 补：上面两条都被下面这些写法绕开 */
  { id: 'indirectEval',    re: /\(\s*0\s*,\s*eval\s*\)|\(\s*(?:window|self|globalThis|global)\s*\.\s*eval\s*\)|\beval\s*\)\s*\(/, why: '间接 eval（`(0,eval)(…)`）：同样是任意代码执行面' },
  { id: 'bareFunction',    re: /(?<![.\w$])Function\s*\(/,                 why: '裸 Function(…) 调用等价于 eval（新式写法常省掉 new）' },
  { id: 'nodeIntegration', re: /nodeIntegration\s*:\s*true/,               why: '渲染进程可直接 require，越权' },
  { id: 'contextIsolation',re: /contextIsolation\s*:\s*false/,             why: '网页与 Node 上下文打通，XSS→RCE' },
  { id: 'insecureContent', re: /allowRunningInsecureContent\s*:\s*true/,   why: '允许混合内容，可被降级攻击' },
  { id: 'webSecurity',     re: /webSecurity\s*:\s*false/,                  why: '关闭同源策略，拆除护栏' },
  { id: 'remoteModule',    re: /enableRemoteModule\s*:\s*true/,            why: '已废弃且危险的远程模块' },
  { id: 'permAlwaysAllow', re: /setPermissionRequestHandler\s*\([^)]*\)\s*=>\s*[^;]*callback\s*\(\s*true\s*\)|setPermissionRequestHandler[\s\S]{0,120}?cb\s*\(\s*true\s*\)/, why: '权限兜底放行：与「拒绝一切权限」的基线相悖' }
];

// 中危模式：仅告警，不阻断（留给人工 Code Review 判断）
const MEDIUM = [
  /* 🟥 V4.3.34：原 /\bexec\s*\(/ 把正则的 `.exec(` 全部误报（实测 4 处 100% 误报，已造成告警疲劳）。
     改为负向后顾：前面不能是 `.` 或词字符 —— `.exec(` 与 `execSync(` 都不会再命中。 */
  { id: 'exec',        re: /(?<![.\w])exec\s*\(/,               why: '命令执行面，应改用 spawnSync 参数数组（告警）' },
  { id: 'shellTrue',   re: /shell\s*:\s*true/,                  why: 'shell:true 会把参数交给 shell 解释，存在命令注入面（告警）' },
  { id: 'openExternal',re: /openExternal\s*\(/,                 why: '外部协议拉起：scheme 必须走白名单校验（告警）' },
  { id: 'innerHTML',   re: /\.innerHTML\s*=\s*[^;]*(\$\{|location|url|external)/, why: 'innerHTML 拼接外部内容需先转义（告警）' },
  { id: 'disableSecurity', re: /--disable-web-security|--allow-running-insecure-content/, why: '关闭浏览器安全开关（告警）' }
];

/* 纯注释行（// 或块注释续行）—— 这里出现 eval/Function 多半是在**解释为什么不许用**，
   降级为 INFO 而不是当高危拦发布，但绝不静默（写进报告，人工可核）。 */
function isCommentLine(ln) {
  const t = ln.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function collectTargets() {
  const out = [];
  const addFile = (p) => {
    try { out.push({ display: path.relative(SRC, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf8') }); } catch (e) {}
  };
  ['main.js', 'preload.js'].forEach(f => { const p = path.join(SRC, f); if (fs.existsSync(p)) addFile(p); });
  /* 🟥 V4.3.43：原实现只 readdirSync('scripts') 一层 —— 子目录里的 .js 一个都不扫。
     现在递归到底（min.js 跳过：第三方压缩产物，行号与可读性都没意义）。 */
  (function rec(d, depth) {
    if (depth > 12) return;
    let e; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const x of e) {
      if (x.isSymbolicLink()) continue;
      const p = path.join(d, x.name);
      if (x.isDirectory()) rec(p, depth + 1);
      else if (/\.js$/.test(x.name) && !/\.min\.js$/.test(x.name)) addFile(p);
    }
  })(path.join(SRC, 'scripts'), 0);
  /* 🟥 V4.3.43：页面里的 `<script>` 内联块原先完全不在扫描范围（只扫 .js）。
     写成 `<html>:inline#n` 这样的伪文件名，命中时能直接指出处。 */
  ['index.html', 'panel.html'].forEach(h => {
    const p = path.join(SRC, h);
    if (!fs.existsSync(p)) return;
    let html = '';
    try { html = fs.readFileSync(p, 'utf8'); } catch (e) { return; }
    let n = 0;
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      n++;
      out.push({ display: h + ':inline#' + n, text: m[1] });
    }
  });
  return out;
}

function scanText(text, patterns) {
  const hits = [];
  const lines = text.split('\n');
  patterns.forEach(({ id, re, why }) => {
    // ① 先整文判定 —— 把 `eval` 与 `(` 拆到两行的写法，行级 test 看不见，整文能看见
    if (!re.test(text)) return;
    let located = false;
    lines.forEach((ln, i) => {
      if (!re.test(ln)) return;
      located = true;
      hits.push({ id, line: i + 1, why, comment: isCommentLine(ln), text: ln.trim().slice(0, 120) });
    });
    // ② 只有跨行才命中的写法，本身就是可疑特征 —— 必须记一条，不能因为定位不到就丢掉
    if (!located) {
      const idx = text.search(re);
      const line = text.slice(0, idx).split('\n').length;
      hits.push({
        id, line, why, comment: false,
        text: '(跨行拼接命中) ' + text.slice(Math.max(0, idx - 30), idx + 70).replace(/\s*\n\s*/g, '⏎').slice(0, 140)
      });
    }
  });
  return hits;
}

function main() {
  const targets = collectTargets();
  const json = process.argv.includes('--json');
  let highTotal = 0, medTotal = 0, commentHits = 0;
  const report = [];

  targets.forEach(t => {
    const high = scanText(t.text, HIGH);
    const med = scanText(t.text, MEDIUM);
    const highReal = high.filter(h => !h.comment);
    commentHits += high.length - highReal.length;
    highTotal += highReal.length; medTotal += med.length;
    if (highReal.length || med.length) {
      report.push({
        file: t.display, high: highReal.length, medium: med.length,
        details: highReal.map(h => ({ ...h, severity: 'HIGH' }))
          .concat(med.map(h => ({ ...h, severity: 'MEDIUM' })))
      });
    }
  });

  if (json) console.log(JSON.stringify({ files: targets.length, high: highTotal, medium: medTotal, commentOnly: commentHits, report }, null, 2));

  if (highTotal === 0) {
    console.log('SECURITY SCAN PASS');
    console.log('  扫描目标: ' + targets.length + ' 个（main/preload + scripts 递归 + 页面内联脚本）');
    console.log('  高危命中: 0  中危命中: ' + medTotal + (medTotal ? '（仅告警，不阻断）' : '')
      + (commentHits ? '  注释内命中(INFO): ' + commentHits : ''));
    process.exit(0);
  } else {
    console.log('SECURITY SCAN FAIL');
    console.log('  扫描目标: ' + targets.length + ' 个');
    console.log('  高危命中: ' + highTotal + '  中危命中: ' + medTotal);
    report.forEach(r => {
      if (!r.high) return;
      console.log('\n  ✗ ' + r.file + '  (HIGH=' + r.high + ', MED=' + r.medium + ')');
      r.details.filter(d => d.severity === 'HIGH').forEach(d => {
        console.log('    [HIGH] ' + d.id + ' @L' + d.line + ' — ' + d.why);
        console.log('           ' + d.text);
      });
    });
    process.exit(1);
  }
}

main();
