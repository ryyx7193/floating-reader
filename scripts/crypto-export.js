// 浅水鲸 · 导出加密（PBKDF2-SHA256 + AES-GCM-256）
(function (global) {
  'use strict';

  const U = global.ReaderUtil;
  const MAGIC = '浅水鲸加密导出';
  const DEFAULT_ITERATIONS = 200000;

  async function deriveExportKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptExport(obj, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const iterations = DEFAULT_ITERATIONS;
    const key = await deriveExportKey(password, salt, iterations);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return {
      app: MAGIC,
      enc: 'AES-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations,
      salt: U.bytesToB64(salt),
      iv: U.bytesToB64(iv),
      data: U.bytesToB64(new Uint8Array(ct)),
      exportedAt: new Date().toISOString()
    };
  }

  /* 🛡 V4.3.38：iterations 来自**外部文件**，必须夹取。
     原先直接 `Number(env.iterations) || DEFAULT` 透传给 PBKDF2 ——
     一份构造的 JSON 写 `iterations: 500000000` 就能让导入长时间冻结 UI（同步等待几十亿次派生）。
     负数 / NaN 会静默回落到默认值，与真实加密参数不符时还会误导成「口令错误」。 */
  const MIN_ITERATIONS = 10000, MAX_ITERATIONS = 2000000;
  function safeIterations(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return DEFAULT_ITERATIONS;
    return Math.max(MIN_ITERATIONS, Math.min(MAX_ITERATIONS, Math.floor(n)));
  }

  async function decryptExport(env, password) {
    const key = await deriveExportKey(password, U.b64ToBytes(env.salt), safeIterations(env.iterations));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: U.b64ToBytes(env.iv) }, key, U.b64ToBytes(env.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function isEncryptedExport(obj) {
    return !!(obj && obj.app === MAGIC && obj.data && obj.salt && obj.iv);
  }

  global.ReaderCrypto = {
    MAGIC,
    DEFAULT_ITERATIONS,
    safeIterations,
    deriveExportKey,
    encryptExport,
    decryptExport,
    isEncryptedExport
  };
})(window);
