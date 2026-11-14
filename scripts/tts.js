// 浅水鲸 · 朗读控制器（系统语音合成）
// 通过 ctx 注入宿主依赖：取文本、语言、语速、语音、状态回调
(function (global) {
  'use strict';

  const CHUNK_LIMIT = 200;

  function supported() {
    return typeof global.speechSynthesis !== 'undefined' && typeof global.SpeechSynthesisUtterance !== 'undefined';
  }

  function listVoices() {
    try { return global.speechSynthesis.getVoices() || []; } catch (e) { return []; }
  }

  // 按句末标点切分，过长再硬切，避免单条过长导致朗读中断
  function buildQueue(text) {
    const clean = String(text || '').replace(/\r/g, '').trim();
    if (!clean) return [];
    const parts = clean.split(/(?<=[。！？!?；;：:\n])/);
    const out = [];
    let buf = '';
    for (const p of parts) {
      if (p.length > CHUNK_LIMIT) {
        if (buf) { out.push(buf); buf = ''; }
        for (let i = 0; i < p.length; i += CHUNK_LIMIT) out.push(p.slice(i, i + CHUNK_LIMIT));
        continue;
      }
      if ((buf + p).length > CHUNK_LIMIT && buf) { out.push(buf); buf = p; }
      else buf += p;
    }
    if (buf) out.push(buf);
    return out;
  }

  function create(ctx) {
    const state = { queue: [], idx: 0, state: 'idle' };
    /* V4.3.33 修（会话令牌）：Chromium 里 cancel() 会让**被取消的那条 utterance**
       异步派发 onerror，而新播放是同步开始的 ——
         · 迟到的 onerror 会把刚置好的 'playing' 翻回 'idle'，
           于是新那句播完时 onend 看到 state !== 'playing' 就不再续读
           （用户表现：「播完一段就停了」）；
         · 迟到的 onend 还会多调一次 speakNext()，造成「跳段」。
       做法：每次 play / stop 递增令牌，回调先比对自己那一轮，不是就当没发生。 */
    let session = 0;

    function notify() {
      if (ctx.onStateChange) ctx.onStateChange(state.state);
    }
    function hint(msg) {
      if (ctx.onHint) ctx.onHint(msg);
    }
    function stop() {
      session++;   // V4.3.33：作废上一轮遗留的 onend/onerror
      try { global.speechSynthesis.cancel(); } catch (e) {}
      state.queue = []; state.idx = 0; state.state = 'idle';
      notify();
    }
    function speakNext() {
      if (state.idx >= state.queue.length) { state.state = 'idle'; notify(); return; }
      if (!supported()) { state.state = 'idle'; notify(); return; }
      const u = new global.SpeechSynthesisUtterance(state.queue[state.idx++]);
      u.lang = (ctx.getLang && ctx.getLang()) === 'zh' ? 'zh-CN' : 'en-US';
      u.rate = Math.max(0.5, Math.min(2, Number(ctx.getRate && ctx.getRate()) || 1));
      const want = ctx.getVoice && ctx.getVoice();
      if (want) {
        const v = listVoices().find(x => x.name === want);
        if (v) u.voice = v;
      }
      // V4.3.33：每条 utterance 认准自己那一轮会话，迟到的回调直接忽略（见 session 处注释）
      const my = session;
      u.onend = () => { if (my !== session) return; if (state.state === 'playing') speakNext(); };
      u.onerror = () => { if (my !== session) return; state.state = 'idle'; notify(); };
      try { global.speechSynthesis.speak(u); }
      catch (e) { state.state = 'idle'; notify(); }
    }
    function play() {
      if (!supported()) { hint(ctx.t('ttsUnsupported')); return; }
      if (state.state === 'paused') {
        try { global.speechSynthesis.resume(); } catch (e) {}
        state.state = 'playing'; notify(); return;
      }
      const text = (ctx.getText && ctx.getText()) || '';
      state.queue = buildQueue(text);
      if (!state.queue.length) { hint(ctx.t('ttsEmpty')); return; }
      try { global.speechSynthesis.cancel(); } catch (e) {}
      session++;   // V4.3.33：cancel 会引发迟到回调，这里把上一轮整体作废
      state.idx = 0; state.state = 'playing';
      speakNext(); notify();
    }
    function pause() {
      if (state.state !== 'playing') return;
      try { global.speechSynthesis.pause(); } catch (e) {}
      state.state = 'paused'; notify();
    }

    return {
      play,
      pause,
      toggle() { if (state.state === 'playing') pause(); else play(); },
      stop,
      get state() { return state.state; },
      supported,
      listVoices
    };
  }

  global.ReaderTTS = { supported, listVoices, buildQueue, create };
})(window);
