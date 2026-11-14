const { app, BrowserWindow, Tray, Menu, ipcMain, globalShortcut, nativeImage, desktopCapturer, screen, safeStorage, dialog, shell, clipboard, crashReporter, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { execFileSync, spawn } = require('child_process');
const net = require('net');   // V4.3.33b：isBlockedHost 判 IPv6 形态用（Node 内置，不是新依赖）
const dns = require('dns');   // V4.3.35：httpGet 连接前解析用（防 DNS 重绑定），Node 内置
let cheerio = null;
try { cheerio = require('cheerio'); } catch (e) {}
let iconv = null;
try { iconv = require('iconv-lite'); } catch (e) {}
// 受支持的文档扩展名：与渲染层共用同一份（scripts/exts.js），避免多处白名单走偏
const READER_EXTS = require('./scripts/exts.js');
/* 🧩 V4.3.79（F5/S3 模块化第一刀）：日志三件套搬到 lib/log.js —— 零外部状态，行为逐字一致 */
const { safeStringify, logToFile, patchConsole } = require('./lib/log.js');
// 文本解码的唯一真源（BOM / UTF-16 / 严格 UTF-8 / GB18030 vs Big5 投票），本地文件与书源页共用
const { decodeBuffer } = require('./scripts/encoding.js');
/* 🟥 V4.3.45（R4-4）：导出文件名里的日期必须是**本地日期**，唯一真源是 scripts/util.js
   （渲染层同一个文件挂成 window.ReaderUtil，主进程这里 require 到的是**同一份实现**）。
   原先主进程两处导出用 `toISOString()`（UTC），北京时间 00:00–08:00 会差一天。 */
const { localDateKey } = require('./scripts/util.js');
/* 🟥 V4.3.45（R4-3）：主进程界面语言的**唯一开关**。
   渲染层启动与每次切语言都会通过 preload 的 setLang 把当前语言发过来（IPC `app:lang`），
   这里用 TT(zh,en) 就地取词 —— 与渲染层 panel.js 的 PT(zh,en) 同一形态，不另立一套词表。
   覆盖范围：托盘菜单 / 系统对话框标题与过滤器名 / 回传给渲染层显示的 error 串 /
   防截屏能力说明（note）/ 站点判定证据 / 诊断文本 / 投屏与远控提示。
   注：**日志文件仍用中文**（logToFile 的内容面向售后检索，口径不跟着界面语言漂）；
   网页匹配用的中文关键词表（SITE_BOOK_MARKERS、CN_DIGITS）也不是界面文案，同样不动。
   ⚠️ 这两行必须留在模块最顶部：下面有模块级立即调用 `detectProtectSupport()` 就要用 TT，
   把 `let` 放到文件后半部分会踩 TDZ，程序直接起不来。 */
let APP_LANG = 'zh';
function TT(zh, en) { return APP_LANG === 'en' ? en : zh; }

// ===== 🛡 安全加固（V4.3.13 全局安全审查）=====
