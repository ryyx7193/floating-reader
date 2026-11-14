'use strict';
/*
 * lib/log.js —— 主进程日志（从 main.js 抽出，V4.3.79 F5/S3 模块化第一刀）
 *
 * 抽出的理由：这三个函数**零外部状态**（只依赖 electron app 的 userData 路径 + path/fs），
 * 是 main.js 里最安全的第一刀。行为与抽前逐字一致：
 *   · 单条日志必须是一行（V4.3.72 修过：消息带换行会产生没有时间戳的孤儿行）
 *   · 2MB 轮转 app.log → app.old.log
 *   · patchConsole 给 log/warn/error 补落盘（幂等，重复调用不会重复包）
 */
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function safeStringify(v) {
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

/* 🟥 V4.3.97（代码审查 S-1）：日志会被打进诊断包/反馈包，而 URL 的 query 里常带 token、
   会话参数、私有资源 id（书源地址、更新清单地址、来源网页）。逐个调用点脱敏迟早漏，
   所以在**写盘入口**统一处理 —— 渲染层上报的日志也走这里，一处收口全覆盖。 */
/* 🟥 V4.3.97 第 3 轮（P1，实测复现）：上一版 `([\w.+-]+:\/\/[^\s?#"'<>]+)\?…`
   对**无分隔的长 \w 串**呈 O(n²) 回溯 —— 本机实测 2k=8ms / 10k=239ms /
   20k=715ms / 40k=3507ms。而 `log:error` 没有长度上限、preload 又把 logError
   暴露给所有面板 ⇒ 被攻陷的面板反复发 4 万字符就能把主进程按死（界面持续假死）。
   修法：① 先按空白切 token（`\S+` 是线性的），逐 token 跑正则；
   ② token 超过 2048 字符直接截断，不喂给正则（畸形串不可能是合法 URL）；
   ③ token 内不含 `?` 时跳过 URL 正则。整体 O(n)，且不会漏掉真正的 URL query。 */
const LOG_TOKEN_MAX = 2048;
const LOG_URL_QUERY_RE = /([\w.+-]+:\/\/[^\s?#"'<>]{1,1024})\?[^\s"'<>\u3000-\u303F，。、；：！？（）【】《》]{0,1024}/gi;
/* 第 3 轮补：Bearer / Authorization / Cookie 是常见凭据形态，`auth\s*[=:]` 匹配不到
   "Authorization: Bearer eyJ…"（auth 后面跟的是 orization），单独一条规则盖住。 */
const LOG_SECRET_KV_RE = /((?:token|key|secret|auth|sig|session|passwd|pwd|password|access[_-]?token|api[_-]?key)\s*[=:]\s*)([^\s&"',;<>\u3000-\u303F，。、；：！？（）【】《》]+)/gi;
/* ⚠️ 不能写成跨空白的正则：token 化之后 "Authorization:" / "Bearer" / "eyJ…"
   是三个独立 token，跨 token 的正则永远匹配不到（实测踩过）。
   🟥 V4.3.97 第 4 轮：状态机扩展成两类前驱 ——
     ① 上一个 token 是 Bearer ⇒ 下一个凭据形态 token 打码；
     ② 上一个 token 是「凭据键名 + 分隔符」(如 `token:` / `key=`) ⇒ 下一个 token 打码，
        覆盖 `token: SECRET`、`password = xxxx` 这类**空格分隔**的键值写法
        （逐 token 后 KV 正则的 `\s*[=:]\s*` 跨不过 token 边界，第 3 轮实测漏过）。
   两类都只在"前驱紧邻"时生效，不会误伤普通日志文本。 */
/* ⚠️ 不含 `authorization`：`Authorization: Bearer eyJ…` 里 Bearer 是**认证方案名**，
   把它当值打码会输出 `Authorization: <已脱敏> <已脱敏>`（门禁 L1_REDACT_2 抓到）——
   既没多保护什么，又抹掉了诊断要用的 scheme。Bearer 分支已单独处理真正的凭据。 */
const LOG_SECRET_KEY_TOKEN_RE = /^(?:token|key|secret|auth|sig|session|passwd|pwd|password|access[_-]?token|api[_-]?key)\s*[=:]$/i;
function redactLogText(text) {
  try {
    let prevBearer = false, prevSecretKey = false;
    return String(text).replace(/\S+/g, function (tok) {
      if (tok.length > LOG_TOKEN_MAX) {
        prevBearer = prevSecretKey = false;
        return tok.slice(0, 256) + '…<超长片段已截断>';
      }
      let out;
      if ((prevBearer || prevSecretKey) && /^[A-Za-z0-9._~+/=-]{1,}$/.test(tok)) {
        out = '<已脱敏>';
      } else {
        out = tok.indexOf('?') >= 0 ? tok.replace(LOG_URL_QUERY_RE, '$1?<已脱敏>') : tok;
        out = out.replace(LOG_SECRET_KV_RE, '$1<已脱敏>');
      }
      prevBearer = /^Bearer$/i.test(tok);
      prevSecretKey = LOG_SECRET_KEY_TOKEN_RE.test(tok);
      return out;
    });
  } catch (e) { return String(text); }
}

function logToFile(level, msg) {
  try {
    const base = app.getPath('userData');
    const dir = path.join(base, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, 'app.log');
    try {
      const st = fs.statSync(fp);
      if (st.size > 2 * 1024 * 1024) {
        fs.renameSync(fp, path.join(dir, 'app.old.log'));
      }
    } catch (e) {}
    /* 🟥 V4.3.72：一条日志必须是**一行**。msg 里带换行时给后续行补同样前缀 + ↳，
       而不是压成空格（会丢结构）——按行读日志的工具才不会把它们当垃圾。 */
    const head = new Date().toISOString() + ' [' + level + '] ';
    const body = redactLogText(String(msg === undefined || msg === null ? '' : msg))
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(function (line, i) { return i === 0 ? line : head + '↳ ' + line; })
      .join('\n');
    fs.appendFileSync(fp, head + body + '\n', 'utf8');
  } catch (e) {}
}

function patchConsole() {
  ['log', 'warn', 'error'].forEach(function (m) {
    if (console[m].__patched) return;
    const orig = console[m];
    const wrapped = function () {
      try {
        const args = Array.prototype.slice.call(arguments);
        logToFile(m, args.map(function (a) { return typeof a === 'string' ? a : safeStringify(a); }).join(' '));
      } catch (e) {}
      try {
        orig.apply(console, arguments);
      } catch (e) {
        if (!e || e.code !== 'EPIPE') {
          try { logToFile('console-error', (e && e.stack) || String(e)); } catch (e2) {}
        }
      }
    };
    wrapped.__patched = true;
    console[m] = wrapped;
  });
}

module.exports = { safeStringify, logToFile, patchConsole };
