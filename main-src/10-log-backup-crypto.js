patchConsole();   /* 早于一切业务代码：之后的 console 输出都会落盘 */

function safeSend(target, channel) {
  try {
    if (!target) return false;
    if (target.isDestroyed && target.isDestroyed()) return false;
    const wc = target.webContents || target;
    if (!wc || (wc.isDestroyed && wc.isDestroyed())) return false;
    const args = Array.prototype.slice.call(arguments, 2);
    wc.send.apply(wc, [channel].concat(args));
    return true;
  } catch (err) {
    if (!err || err.code !== 'EPIPE') {
      try { logToFile('error', 'safeSend failed: ' + ((err && err.stack) || err)); } catch (e) {}
    }
    return false;
  }
}

process.on('uncaughtException', function (err) {
  try {
    const code = err && err.code;
    const msg = err && (err.message || err.stack || String(err));
    if (code === 'EPIPE' || /broken pipe/i.test(String(msg))) {
      logToFile('suppressed', 'suppressed EPIPE/broken-pipe exception');
      return;
    }
    logToFile('uncaught', err && err.stack ? err.stack : String(err));
  } catch (e) {}
});
process.on('unhandledRejection', function (reason) {
  try {
    const msg = reason && (reason.message || reason.stack || safeStringify(reason));
    // V4.3.33：补括号。原写法靠 && 优先级「碰巧」能用，但意图不清，容易被后人改错
    if ((reason && reason.code === 'EPIPE') || /broken pipe/i.test(String(msg))) {
      logToFile('suppressed', 'suppressed EPIPE/broken-pipe rejection');
      return;
    }
    logToFile('unhandled', reason && reason.stack ? reason.stack : safeStringify(reason));
  } catch (e) {}
});

function backupDir() {
  return path.join(app.getPath('userData'), 'backup');
}

function listBackups() {
  try {
    return fs.readdirSync(backupDir()).filter(function (f) { return /^backup-.*\.json$/.test(f); }).sort().reverse();
  } catch (e) {
    return [];
  }
}

function cryptoKeyFile() {
  return path.join(app.getPath('userData'), 'keystore.dat');
}

function getOrCreateCryptoKey() {
  try {
    /* V4.3.33 修（H3）：把「本机不支持加密」与「密钥文件解不开」分成两件事。
       原先两者都 return null —— 前者是对的（降级明文并提示），后者是错的：
       文件在、加密可用、却解不开（换 Windows 账户 / 重装 / 文件损坏），
       这时函数**永远**返回 null，之后所有新正文都静默以明文落库，而且再也不会恢复。
       注意：这种情况下它保护的旧密文**本来就已经解不开了**（密钥拿不到），
       所以「重建密钥」不会额外损失任何数据。 */
    if (!safeStorage.isEncryptionAvailable()) return null;
    const fp = cryptoKeyFile();
    if (fs.existsSync(fp)) {
      try {
        const dec = safeStorage.decryptString(fs.readFileSync(fp));
        if (dec) return dec;
        throw new Error(TT('keystore 解密结果为空','keystore decryption returned empty'));
      } catch (decErr) {
        /* 改名留档后再重建 —— 旧密钥**不销毁**（万一以后 DPAPI 环境恢复还能抢救），
           同时加密能力立刻恢复，不再无限期静默降级成明文。
           旧正文打不开这件事，渲染层已有 chaptersLocked 提示兜着（app.js 的 noteChaptersLocked）。 */
        const bak = fp + '.broken-' + new Date().toISOString().replace(/[:.]/g, '-');
        try {
          fs.renameSync(fp, bak);
          logToFile('error', 'keystore 解不开，已留档为 ' + bak + ' 并重建新密钥（旧正文将不可解密）：' + (decErr && decErr.message));
        } catch (e2) {
          logToFile('error', 'keystore 解不开、且改名留档失败，保持只读不动：' + (e2 && e2.message));
          return null;
        }
      }
    }
    const key = crypto.randomBytes(32).toString('base64');
    fs.writeFileSync(fp, safeStorage.encryptString(key));
    return key;
  } catch (err) {
    logToFile('error', 'crypto key init failed: ' + (err && err.message ? err.message : err));
    return null;
  }
}

function exportLogsFile() {
  const src = path.join(app.getPath('userData'), 'logs', 'app.log');
  if (!fs.existsSync(src)) return Promise.resolve({ ok: false, error: 'no-log' });
  const defaultName = '浅水鲸日志-' + localDateKey() + '.log';
  return dialog.showSaveDialog({
    title: TT('导出日志','Export logs'),
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: TT('日志文件','Log files'), extensions: ['log', 'txt'] }]
  }).then(function (r) {
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.copyFileSync(src, r.filePath);
    return { ok: true, path: r.filePath };
  });
}

function trayIcon() {
  try {
    const img = nativeImage.createFromBuffer(fs.readFileSync(path.join(__dirname, 'assets', 'tray.png')));
    // macOS 托盘使用模板图，跟随系统深浅色
    if (process.platform === 'darwin') {
      try { img.setTemplateImage(true); } catch (e) {}
    }
    return img;
  } catch (e) {
    console.error('加载托盘图标失败', e);
    return nativeImage.createEmpty();
  }
}

function toAccelerator(s) {
  return String(s || '').split('+').map(p => {
    if (p === 'Ctrl') return 'CommandOrControl';
    if (p === 'Meta') return 'Super';
    if (p === '←') return 'Left';
    if (p === '→') return 'Right';
    if (p === '↑') return 'Up';
    if (p === '↓') return 'Down';
    return p;
  }).join('+');
}

function notifyMainWindow(channel, payload) {
  safeSend(mainWindow, channel, payload);
}

// ---------- 内容保护（防截屏 / 防录屏）----------
