'use strict';
/*
 * lib/portable.js —— 便携模式（从 main.js 抽出，V4.3.79 F5/S3 模块化第二刀）
 *
 * 行为与抽前逐字一致。**必须在 app ready / Chromium 打库之前执行**（main.js 顶层立即调用），
 * 因为 app.setPath('userData') 只有在那之前才有效。
 *
 * 规则回顾（血泪都在注释里，别删）：
 *   · 建目录成功 ≠ 可写（UAC 虚拟化 / 只读盘 / 公司管控盘）→ 先真写再删做写探针
 *   · 迁移门禁**不能**依赖 databases 目录（Electron 32+ 会主动删它，V4.3.36 踩过）
 *   · keystore.dat / sources.json 是**文件**，robocopy 拿文件当源语义不对 → 直接 copyFileSync，
 *     且**目标已存在必须跳过**（静默覆盖会让 DPAPI 加密正文永久解不开，V4.3.38）
 *   · 复制失败只记日志不 throw（throw 会跳出循环 → setPath 不执行 → 静默退回 %APPDATA%）
 *   · 迁移失败时**不要**补写 marker（否则"这次没迁"被永久固化）
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { app } = require('electron');
const { logToFile } = require('./log.js');

const PORTABLE_FLAG = (function () {
  try {
    const exeDir = path.dirname(app.getPath('exe'));
    const flag = path.join(exeDir, 'portable.flag');
    if (!fs.existsSync(flag)) return null;
    return { flag, dataDir: path.join(exeDir, 'Data') };
  } catch (e) { return null; }
})();

/* 返回 true = 便携**真的**生效（诊断信息据此如实上报）；false = 未启用或已退回默认目录 */
function initPortable() {
  if (!PORTABLE_FLAG) return false;
  try {
    const { dataDir } = PORTABLE_FLAG;
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const probeFile = path.join(dataDir, '.writetest');
    fs.writeFileSync(probeFile, '1');
    try { fs.unlinkSync(probeFile); } catch (e) {}

    const marker = path.join(dataDir, '.migrated');
    const appData = path.join(process.env.APPDATA || '', '悬浮阅读器');
    const DATA_ENTRIES = ['IndexedDB', 'Local Storage', 'databases', 'backup', 'logs', 'WebStorage', 'keystore.dat', 'sources.json'];
    const FILE_ENTRIES = ['keystore.dat', 'sources.json'];
    const hasAnyData = DATA_ENTRIES.some(n => fs.existsSync(path.join(appData, n)));
    if (!fs.existsSync(marker) && hasAnyData) {
      for (const name of DATA_ENTRIES) {
        const src = path.join(appData, name), dst = path.join(dataDir, name);
        if (!fs.existsSync(src)) continue;
        try {
          if (FILE_ENTRIES.indexOf(name) >= 0) {
            if (fs.existsSync(dst)) { try { logToFile('info', '便携迁移跳过已存在的文件: ' + name); } catch (e) {} continue; }
            try { fs.copyFileSync(src, dst); }
            catch (e) { try { logToFile('error', '便携迁移复制文件失败（跳过）: ' + name + ' · ' + ((e && e.message) || e)); } catch (err) {} }
          } else {
            const r = execFileSync('robocopy', [src, dst, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
            if (r.status >= 8) throw new Error('robocopy exit ' + r.status);
          }
        } catch (err) { if (err.status === undefined || err.status >= 8) throw err; }
      }
      fs.writeFileSync(marker, new Date().toISOString());
    } else if (!fs.existsSync(marker) && !hasAnyData) {
      try { fs.writeFileSync(marker, new Date().toISOString()); } catch (e) {}
    }
    app.setPath('userData', dataDir);
    return path.resolve(app.getPath('userData')) === path.resolve(dataDir);
  } catch (e) {
    try { logToFile('error', '便携模式初始化失败，已退回默认数据目录: ' + ((e && e.message) || e)); } catch (err) {}
    return false;
  }
}

module.exports = { PORTABLE_FLAG, initPortable };
