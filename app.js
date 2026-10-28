(() => {
  'use strict';

  // ---------- pad definitions ----------
  // f/type/dur: synth stab used until you load a real clip. say: robot-voice fallback.
  const KEYS = '1234567890QWERTYUIOPASDFGHJKL;'.split('');
  const C = { red: '#ff2a2a', gold: '#e0b25a', ember: '#ff6a3d', rose: '#ff3d6e', cream: '#f1e4dc' };
  // [label, song, color, freq, wave, dur, robot-voice text]
  const RAW = [
    ['LOOK AT CHA', 'Runaway', C.red, 330, 'triangle', 1.2, 'look at cha'],
    ['PIANO 1', 'Runaway', C.cream, 330, 'triangle', 1.6, ''],
    ['PIANO 2', 'Runaway', C.cream, 370, 'triangle', 1.6, ''],
    ['PIANO 3', 'Runaway', C.cream, 415, 'triangle', 1.6, ''],
    ['PIANO 4', 'Runaway', C.cream, 494, 'triangle', 1.6, ''],
    ['PIANO 5', 'Runaway', C.cream, 554, 'triangle', 1.6, ''],
    ['PIANO 6', 'Runaway', C.cream, 659, 'triangle', 1.6, ''],
    ['PIANO 7', 'Runaway', C.cream, 740, 'triangle', 1.6, ''],
    ['PIANO 8', 'Runaway', C.cream, 831, 'triangle', 1.6, ''],
    ['BEAT', 'Runaway', C.red, 80, 'square', 0.25, ''],
    ['BEAUTIFUL STARS', 'Runaway', C.emberld, 880, 'sine', 1.4, ''],
    ['HEY!', 'Runaway', C.ember, 185, 'sawtooth', 0.2, 'hey'],
    ['LADIES & GENTS', 'Runaway', C.rose, 262, 'sawtooth', 0.4, 'ladies and gentlemen'],
    ['WORK IT', 'Stronger', C.red, 392, 'square', 0.25, 'work it'],
    ['MAKE IT', 'Stronger', C.red, 440, 'square', 0.25, 'make it'],
    ['DO IT', 'Stronger', C.gold, 494, 'square', 0.25, 'do it'],
    ['MAKES US', 'Stronger', C.gold, 523, 'square', 0.25, 'makes us'],
    ['HARDER', 'Stronger', C.ember, 294, 'sawtooth', 0.3, 'harder'],
    ['BETTER', 'Stronger', C.ember, 349, 'sawtooth', 0.3, 'better'],
    ['FASTER', 'Stronger', C.rose, 415, 'sawtooth', 0.3, 'faster'],
    ['STRONGER', 'Stronger', C.rose, 220, 'sawtooth', 0.5, 'stronger'],
    ['MORE THAN', 'Stronger', C.red, 311, 'square', 0.3, 'more than'],
    ['HOUR', 'Stronger', C.red, 330, 'square', 0.25, 'hour'],
    ['OUR', 'Stronger', C.gold, 370, 'square', 0.25, 'our'],
    ['NEVER', 'Stronger', C.gold, 392, 'square', 0.25, 'never'],
    ['EVER', 'Stronger', C.ember, 415, 'square', 0.25, 'ever'],
    ['AFTER', 'Stronger', C.ember, 440, 'square', 0.25, 'after'],
    ['WORK IS', 'Stronger', C.rose, 466, 'square', 0.25, 'work is'],
    ['OVER', 'Stronger', C.rose, 494, 'square', 0.25, 'over'],
    ['CANCEL', 'Stop sounds', C.red, 0, 'sine', 0, '', 0, true],
  ];
  const PADS = RAW.map(([label, sub, color, f, type, dur, say, loop, cancel], i) => ({ key: KEYS[i], label, sub, color, f, type, dur, say, loop: !!loop, cancel: !!cancel }));

  const $ = (id) => document.getElementById(id);

  // ---------- storage (IndexedDB for audio blobs, localStorage for names) ----------
  const idb = {
    db: null,
    open() {
      return new Promise((res) => {
        try {
          const r = indexedDB.open('kanye-soundboard', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('files');
          r.onsuccess = () => { idb.db = r.result; res(); };
          r.onerror = () => res();
        } catch { res(); }
      });
    },
    tx(mode, fn) {
      return new Promise((res) => {
        if (!idb.db) return res(undefined);
        const t = idb.db.transaction('files', mode);
        const req = fn(t.objectStore('files'));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => res(undefined);
      });
    },
    get: (k) => idb.tx('readonly', (s) => s.get(k)),
    put: (k, v) => idb.tx('readwrite', (s) => s.put(v, k)),
    del: (k) => idb.tx('readwrite', (s) => s.delete(k)),
  };

  const names = (() => {
    try { return JSON.parse(localStorage.getItem('ks-names') || '{}'); } catch { return {}; }
  })();
  const saveNames = () => { try { localStorage.setItem('ks-names', JSON.stringify(names)); } catch {} };

  // ---------- audio graph ----------
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const master = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 128;
  master.connect(analyser);
  analyser.connect(ctx.destination);
  master.gain.value = +$('master').value;

  const padBus = ctx.createGain();
  padBus.connect(master);

  const deckEl = new Audio();
  deckEl.preload = 'auto';
  deckEl.crossOrigin = 'anonymous';
  const deckGain = ctx.createGain();
  deckGain.gain.value = +$('deckVol').value;
  ctx.createMediaElementSource(deckEl).connect(deckGain);
  deckGain.connect(master);

  const resume = () => { if (ctx.state !== 'running') ctx.resume(); };

  // ---------- pads ----------
  const buffers = new Array(PADS.length).fill(null);
  const active = new Array(PADS.length).fill(null); // currently playing source per pad
  const els = [];

  async function decode(blob) {
    const ab = await blob.arrayBuffer();
    return new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej));
  }

  function setLoaded(i, name) {
    if (PADS[i].cancel) { els[i].sub.textContent = PADS[i].sub; return; }
    const loaded = !!buffers[i];
    els[i].pad.classList.toggle('loaded', loaded);
    els[i].sub.textContent = loaded ? (name || 'CLIP') : PADS[i].sub + ' · synth';
  }

  async function loadPadFile(i, file) {
    if (!file) return;
    try {
      const buf = await decode(file);
      buffers[i] = buf;
      await idb.put('pad-' + i, { blob: file, name: file.name });
      setLoaded(i, file.name.replace(/\.[^.]+$/, ''));
    } catch {
      els[i].sub.textContent = 'BAD AUDIO FILE';
    }
  }

  async function clearPad(i) {
    buffers[i] = null;
    await idb.del('pad-' + i);
    setLoaded(i);
  }

  function synthHit(i, t0) {
    const p = PADS[i];
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    o.type = p.type;
    o.frequency.setValueAtTime(p.f, t0);
    filt.type = 'lowpass';
    filt.frequency.value = p.type === 'triangle' ? 3000 : 1800;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.dur);
    o.connect(filt).connect(g).connect(padBus);
    o.start(t0);
    o.stop(t0 + p.dur + 0.05);
    return { stop: () => { try { o.stop(); } catch {} }, dur: p.dur };
  }

  function speak(text) {
    if (!text || !$('tts').checked || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 0.5; u.rate = 0.85; u.volume = Math.min(1, +$('master').value);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function flash(i, ms) {
    const el = els[i].pad;
    el.classList.add('hit');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('hit'), Math.max(90, Math.min(ms, 1500)));
  }

  function trigger(i) {
    resume();
    if (PADS[i].cancel) { killAll(); flash(i, 200); return; }
    if (active[i]) { active[i].stop(); active[i] = null; }
    const t0 = ctx.currentTime;
    if (buffers[i]) {
      const s = ctx.createBufferSource();
      s.buffer = buffers[i];
      s.loop = PADS[i].loop;
      s.connect(padBus);
      s.start(t0);
      s.onended = () => { if (active[i] && active[i].src === s) active[i] = null; };
      active[i] = { src: s, stop: () => { try { s.stop(); } catch {} } };
      flash(i, PADS[i].loop ? 400 : buffers[i].duration * 1000);
    } else {
      const h = synthHit(i, t0);
      active[i] = { src: null, stop: h.stop };
      speak(PADS[i].say);
      flash(i, h.dur * 1000);
    }
  }

  function killAll() {
    active.forEach((a, i) => { if (a) a.stop(); active[i] = null; });
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  function buildPads() {
    const grid = $('pads');
    PADS.forEach((p, i) => {
      const pad = document.createElement('div');
      pad.className = 'pad';
      pad.tabIndex = 0;
      pad.style.setProperty('--glow', p.color);
      pad.innerHTML =
        '<i class="led"></i><span class="key">' + p.key + '</span>' +
        '<div class="label"></div><div class="sub"></div>' +
        '<div class="tools"><button class="ld" title="Load your own clip">⏏</button>' +
        '<button class="tr" title="Trim from the full song">\u2702</button>' +
        '<button class="cl" title="Clear clip">✕</button></div>' +
        '<input type="file" accept="audio/*" hidden>';
      const label = pad.querySelector('.label');
      const sub = pad.querySelector('.sub');
      const file = pad.querySelector('input');
      label.textContent = names[i] || p.label;
      els.push({ pad, label, sub });

      pad.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.tools')) return;
        e.preventDefault();
        trigger(i);
      });
      label.addEventListener('dblclick', () => {
        const n = prompt('Rename pad', label.textContent);
        if (n && n.trim()) { label.textContent = n.trim().toUpperCase(); names[i] = label.textContent; saveNames(); }
      });
      if (p.cancel) pad.querySelector('.tools').remove();
      else {
      pad.querySelector('.ld').addEventListener('click', () => file.click());
      pad.querySelector('.cl').addEventListener('click', () => clearPad(i));
      pad.querySelector('.tr').addEventListener('click', () => openTrim(i));
      file.addEventListener('change', () => { loadPadFile(i, file.files[0]); file.value = ''; });
      }

      pad.addEventListener('dragover', (e) => { e.preventDefault(); pad.classList.add('drag'); });
      pad.addEventListener('dragleave', () => pad.classList.remove('drag'));
      pad.addEventListener('drop', (e) => {
        e.preventDefault(); pad.classList.remove('drag');
        if (!p.cancel) loadPadFile(i, e.dataTransfer.files[0]);
      });

      grid.appendChild(pad);
      setLoaded(i);
    });
  }

  async function restorePads() {
    await Promise.all(PADS.map(async (_, i) => {
      const rec = await idb.get('pad-' + i);
      if (!rec) return;
      try { buffers[i] = await decode(rec.blob); setLoaded(i, rec.name.replace(/\.[^.]+$/, '')); } catch {}
    }));
  }

  // ---------- deck ----------
  const fmt = (s) => {
    if (!isFinite(s)) s = 0;
    const m = Math.floor(s / 60);
    return m + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };
  let deckUrl = null;
  let seeking = false;

  function loadTrack(blob, name) {
    if (deckUrl) URL.revokeObjectURL(deckUrl);
    deckUrl = URL.createObjectURL(blob);
    deckEl.src = deckUrl;
    $('trackName').textContent = (name || 'TRACK').toUpperCase();
    $('seek').disabled = false;
    $('seek').value = 0;
    $('timeNow').textContent = '0:00';
  }

  const SONGS = { runaway: 'Runaway instrumental', stronger: 'Stronger instrumental' };
  let song = 'runaway';
  try { if (SONGS[localStorage.getItem('ks-song')]) song = localStorage.getItem('ks-song'); } catch {}

  function markSong() {
    document.querySelectorAll('#songSel button').forEach((b) => b.classList.toggle('on', b.dataset.song === song));
  }

  // your loaded track for this song, else the bundled clips/<song>-instrumental.mp3
  async function selectSong(next, keepPlaying) {
    const wasPlaying = keepPlaying && !deckEl.paused;
    song = next;
    try { localStorage.setItem('ks-song', song); } catch {}
    markSong();
    deckEl.pause();
    let rec = await idb.get('track-' + song);
    if (!rec && song === 'runaway') rec = await idb.get('track');
    if (rec) loadTrack(rec.blob, rec.name);
    else {
      try {
        const r = await fetch('clips/' + song + '-instrumental.mp3');
        if (!r.ok) throw new Error('missing');
        loadTrack(await r.blob(), SONGS[song]);
      } catch {
        deckEl.removeAttribute('src');
        $('trackName').textContent = 'NO ' + song.toUpperCase() + ' INSTRUMENTAL';
        $('seek').disabled = true;
        $('timeTotal').textContent = '0:00';
        return;
      }
    }
    if (wasPlaying) { try { await deckEl.play(); } catch {} }
  }

  async function togglePlay() {
    resume();
    if (!deckEl.src) { $('trackFile').click(); return; }
    if (deckEl.paused) { try { await deckEl.play(); } catch {} } else deckEl.pause();
  }

  deckEl.addEventListener('play', () => { $('play').classList.add('on'); $('play').innerHTML = '&#10074;&#10074; PAUSE'; });
  deckEl.addEventListener('pause', () => { $('play').classList.remove('on'); $('play').innerHTML = '&#9654; PLAY'; });
  deckEl.addEventListener('loadedmetadata', () => { $('timeTotal').textContent = fmt(deckEl.duration); });
  deckEl.addEventListener('timeupdate', () => {
    $('timeNow').textContent = fmt(deckEl.currentTime);
    if (!seeking && deckEl.duration) $('seek').value = (deckEl.currentTime / deckEl.duration) * 1000;
  });

  $('play').addEventListener('click', togglePlay);
  $('stop').addEventListener('click', () => { deckEl.pause(); deckEl.currentTime = 0; });
  $('rew').addEventListener('click', () => { deckEl.currentTime = Math.max(0, deckEl.currentTime - 5); });
  $('loop').addEventListener('click', () => { deckEl.loop = !deckEl.loop; $('loop').classList.toggle('on', deckEl.loop); });
  $('seek').addEventListener('input', () => {
    seeking = true;
    if (deckEl.duration) deckEl.currentTime = ($('seek').value / 1000) * deckEl.duration;
  });
  $('seek').addEventListener('change', () => { seeking = false; });
  $('deckVol').addEventListener('input', (e) => { deckGain.gain.value = +e.target.value; });
  $('master').addEventListener('input', (e) => { master.gain.value = +e.target.value; });
  $('panic').addEventListener('click', killAll);

  $('trackFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    loadTrack(f, f.name.replace(/\.[^.]+$/, ''));
    await idb.put('track-' + song, { blob: f, name: f.name.replace(/\.[^.]+$/, '') });
    e.target.value = '';
  });

  // drop a track anywhere outside the pads
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f || !f.type.startsWith('audio')) return;
    loadTrack(f, f.name.replace(/\.[^.]+$/, ''));
    await idb.put('track-' + song, { blob: f, name: f.name.replace(/\.[^.]+$/, '') });
  });
  document.querySelectorAll('#songSel button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.song !== song) selectSong(b.dataset.song, true);
  }));

  // ---------- keyboard ----------
  const keyMap = Object.fromEntries(PADS.map((p, i) => [p.key.toLowerCase(), i]));
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!$('trim').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); return; }
    const i = keyMap[e.key.toLowerCase()];
    if (i !== undefined) { e.preventDefault(); trigger(i); }
  });

  // ---------- meter ----------
  const cv = $('meter');
  const g2 = cv.getContext('2d');
  const bins = new Uint8Array(analyser.frequencyBinCount);
  const BARS = 16, SEGS = 8;
  function draw() {
    analyser.getByteFrequencyData(bins);
    g2.clearRect(0, 0, cv.width, cv.height);
    const bw = cv.width / BARS, sh = cv.height / SEGS;
    for (let b = 0; b < BARS; b++) {
      const v = bins[Math.floor((b / BARS) * bins.length * 0.75)] / 255;
      const lit = Math.round(v * SEGS);
      for (let s = 0; s < SEGS; s++) {
        const on = s < lit;
        const hue = s > 6 ? '#ffd98a' : s > 4 ? '#ff4433' : '#b3121b';
        g2.fillStyle = on ? hue : '#160c0c';
        g2.fillRect(b * bw + 2, cv.height - (s + 1) * sh + 2, bw - 4, sh - 3);
      }
    }
    requestAnimationFrame(draw);
  }

  // ---------- trim tool: pick the exact region of a full song for a pad ----------
  const SOURCES = {
    Stronger: 'Kanye West - Stronger.mp3',
    Runaway: 'Kanye West - Runaway (Video Version) ft. Pusha T.mp3',
  };
  const DEFAULTS = {
    'LOOK AT CHA': ['Runaway', 11.10, 12.90],
    'WORK IT': ['Stronger', 0.88, 1.47], 'MAKE IT': ['Stronger', 1.48, 2.06],
    'DO IT': ['Stronger', 2.08, 2.62], 'MAKES US': ['Stronger', 2.64, 3.21],
    'HARDER': ['Stronger', 3.23, 3.82], 'BETTER': ['Stronger', 3.83, 4.58],
    'FASTER': ['Stronger', 4.66, 4.97], 'STRONGER': ['Stronger', 4.99, 5.50],
  };
  const srcBufs = {};
  const T = { i: 0, src: 'Stronger', buf: null, start: 0, end: 1, view: 0, node: null };
  const wave = $('wave'), wg = wave.getContext('2d');

  function getSource(name) {
    if (!srcBufs[name]) {
      srcBufs[name] = fetch(encodeURI(SOURCES[name])).then((r) => {
        if (!r.ok) throw new Error('missing');
        return r.arrayBuffer();
      }).then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)));
    }
    return srcBufs[name];
  }

  const span = () => +$('trimZoom').value;
  function drawWave() {
    const W = wave.width, H = wave.height;
    wg.clearRect(0, 0, W, H);
    if (!T.buf) return;
    const sr = T.buf.sampleRate, data = T.buf.getChannelData(0);
    const t0 = T.view, t1 = t0 + span();
    const x = (t) => ((t - t0) / span()) * W;
    // selected region
    wg.fillStyle = 'rgba(255,68,51,.18)';
    wg.fillRect(x(T.start), 0, Math.max(1, x(T.end) - x(T.start)), H);
    // peaks
    wg.fillStyle = '#ff4433';
    for (let px = 0; px < W; px++) {
      const a = Math.floor((t0 + (px / W) * span()) * sr);
      const b = Math.floor((t0 + ((px + 1) / W) * span()) * sr);
      let mn = 0, mx = 0;
      for (let k = a; k < b && k < data.length; k++) { const v = data[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
      wg.fillRect(px, H / 2 - mx * H / 2, 1, Math.max(1, (mx - mn) * H / 2));
    }
    // second ticks
    wg.fillStyle = '#7a4a46';
    wg.font = '10px monospace';
    for (let s = Math.ceil(t0); s <= t1; s++) { wg.fillRect(x(s), 0, 1, 8); wg.fillText(s + 's', x(s) + 3, 18); }
    // handles
    wg.fillStyle = '#e0b25a'; wg.fillRect(x(T.start) - 1, 0, 3, H);
    wg.fillStyle = '#f1e4dc'; wg.fillRect(x(T.end) - 1, 0, 3, H);
  }

  function syncInputs() {
    $('trimStart').value = T.start.toFixed(2);
    $('trimEnd').value = T.end.toFixed(2);
    drawWave();
  }
  function setView(t) {
    const max = Math.max(0, (T.buf ? T.buf.duration : 0) - span());
    T.view = Math.min(max, Math.max(0, t));
    $('trimView').value = max ? (T.view / max) * 1000 : 0;
    drawWave();
  }
  function centerOn(t) { setView(t - span() / 2); }

  async function loadTrimSource(name, region) {
    T.src = name; T.buf = null; drawWave();
    $('trimStatus').textContent = 'loading ' + name + '…';
    try {
      T.buf = await getSource(name);
      $('trimStatus').textContent = fmt(T.buf.duration) + ' long';
    } catch {
      $('trimStatus').textContent = 'Could not load ' + SOURCES[name] + ' (run via start.command)';
      return;
    }
    if (region) { T.start = region[0]; T.end = region[1]; }
    T.end = Math.min(T.end, T.buf.duration);
    syncInputs();
    centerOn((T.start + T.end) / 2);
  }

  function openTrim(i) {
    T.i = i;
    $('trimTitle').textContent = 'TRIM — ' + els[i].label.textContent;
    const d = DEFAULTS[PADS[i].label] || ['Stronger', 0, 1];
    $('trimSrc').value = d[0];
    $('trim').hidden = false;
    loadTrimSource(d[0], [d[1], d[2]]);
  }

  function stopPreview() { if (T.node) { try { T.node.stop(); } catch {} T.node = null; } }
  function playRegion() {
    if (!T.buf) return;
    resume(); stopPreview();
    const s = ctx.createBufferSource();
    s.buffer = T.buf; s.connect(padBus);
    s.start(0, T.start, Math.max(0.02, T.end - T.start));
    T.node = s;
  }

  function encodeWav(buf, s, e) {
    const sr = buf.sampleRate, ch = Math.min(2, buf.numberOfChannels);
    const a = Math.floor(s * sr), n = Math.max(1, Math.floor(e * sr) - a);
    const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
    const w = (o, str) => [...str].forEach((c, k) => out.setUint8(o + k, c.charCodeAt(0)));
    w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt ');
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
    out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true);
    out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * ch * 2, true);
    const fade = Math.min(Math.floor(0.004 * sr), n >> 1), tail = Math.min(Math.floor(0.015 * sr), n >> 1);
    for (let c = 0; c < ch; c++) {
      const d = buf.getChannelData(c);
      for (let k = 0; k < n; k++) {
        let v = d[a + k] || 0;
        if (k < fade) v *= k / fade;
        if (k > n - tail) v *= (n - k) / tail;
        out.setInt16(44 + (k * ch + c) * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
      }
    }
    return new Blob([out.buffer], { type: 'audio/wav' });
  }

  async function saveTrim() {
    if (!T.buf || T.end <= T.start) return;
    const file = new File([encodeWav(T.buf, T.start, T.end)], PADS[T.i].label.toLowerCase() + '.wav', { type: 'audio/wav' });
    await loadPadFile(T.i, file);
    stopPreview();
    $('trim').hidden = true;
  }

  $('trimSrc').innerHTML = Object.keys(SOURCES).map((n) => '<option>' + n + '</option>').join('');
  $('trimSrc').addEventListener('change', (e) => loadTrimSource(e.target.value, [0, 1]));
  $('trimZoom').addEventListener('change', () => centerOn((T.start + T.end) / 2));
  $('trimView').addEventListener('input', (e) => {
    const max = Math.max(0, (T.buf ? T.buf.duration : 0) - span());
    setView((e.target.value / 1000) * max);
  });
  $('trimStart').addEventListener('change', (e) => { T.start = Math.max(0, +e.target.value); syncInputs(); });
  $('trimEnd').addEventListener('change', (e) => { T.end = Math.max(T.start + 0.02, +e.target.value); syncInputs(); });
  document.querySelectorAll('.nudge button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.t === 'start' ? 'start' : 'end';
    T[k] = Math.max(0, +(T[k] + +b.dataset.d).toFixed(3));
    if (T.end <= T.start) { if (k === 'start') T.end = T.start + 0.02; else T.start = Math.max(0, T.end - 0.02); }
    syncInputs();
    playRegion();
  }));
  wave.addEventListener('click', (e) => {
    if (!T.buf) return;
    const r = wave.getBoundingClientRect();
    const t = T.view + ((e.clientX - r.left) / r.width) * span();
    if (e.shiftKey) T.end = Math.max(t, T.start + 0.02); else { T.start = t; if (T.end <= t) T.end = t + 0.3; }
    syncInputs();
  });
  $('trimPlay').addEventListener('click', playRegion);
  $('trimStop').addEventListener('click', stopPreview);
  $('trimReset').addEventListener('click', () => {
    const d = DEFAULTS[PADS[T.i].label] || ['Stronger', 0, 1];
    $('trimSrc').value = d[0];
    loadTrimSource(d[0], [d[1], d[2]]);
  });
  $('trimSave').addEventListener('click', saveTrim);
  $('trimClose').addEventListener('click', () => { stopPreview(); $('trim').hidden = true; });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('trim').hidden) { stopPreview(); $('trim').hidden = true; } }, true);

  // ---------- bundled clips (clips/<pad-label>.mp3), used when you haven't loaded your own ----------
  const slug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  async function loadBundled() {
    await Promise.all(PADS.map(async (p, i) => {
      if (buffers[i] || p.cancel) return;
      try {
        const r = await fetch('clips/' + slug(p.label) + '.mp3');
        if (!r.ok) return;
        buffers[i] = await decode(await r.blob());
        setLoaded(i, 'clip');
      } catch {}
    }));
  }

  // ---------- init ----------
  (async () => {
    buildPads();
    draw();
    await idb.open();
    await restorePads();
    await loadBundled();
    await selectSong(song, false);
  })();
})();
