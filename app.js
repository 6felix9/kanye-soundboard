(() => {
  'use strict';

  // ---------- pad definitions ----------
  // f/type/dur: synth stab used if a pad's clip fails to load. say: robot-voice fallback.
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
    ['BEAUTIFUL STARS', 'Runaway', C.gold, 880, 'sine', 1.4, ''],
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
    const maxTapDuration = 350;
    const moveTolerance = 12;
    PADS.forEach((p, i) => {
      const pad = document.createElement('div');
      pad.className = 'pad';
      pad.tabIndex = 0;
      pad.style.setProperty('--glow', p.color);
      pad.innerHTML = '<span class="key">' + p.key + '</span><div class="label"></div>';
      pad.querySelector('.label').textContent = p.label;
      els.push({ pad });

      pad.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary || e.button !== 0) return;
        pad._press = { id: e.pointerId, x: e.clientX, y: e.clientY, started: performance.now(), moved: false };
        pad.setPointerCapture(e.pointerId);
      });
      pad.addEventListener('pointermove', (e) => {
        const press = pad._press;
        if (!press || press.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > moveTolerance) press.moved = true;
      });
      pad.addEventListener('pointerup', (e) => {
        const press = pad._press;
        pad._press = null;
        if (!press || press.id !== e.pointerId || press.moved || performance.now() - press.started > maxTapDuration) return;
        if (document.elementFromPoint(e.clientX, e.clientY)?.closest('.pad') === pad) trigger(i);
      });
      pad.addEventListener('pointercancel', () => { pad._press = null; });

      grid.appendChild(pad);
    });
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

  // Load the bundled clips/<song>-instrumental.mp3 deck track.
  async function selectSong(next, keepPlaying) {
    const wasPlaying = keepPlaying && !deckEl.paused;
    song = next;
    try { localStorage.setItem('ks-song', song); } catch {}
    markSong();
    deckEl.pause();
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
    if (wasPlaying) { try { await deckEl.play(); } catch {} }
  }

  async function togglePlay() {
    resume();
    if (!deckEl.src) return;
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

  document.querySelectorAll('#songSel button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.song !== song) selectSong(b.dataset.song, true);
  }));

  // ---------- keyboard ----------
  const keyMap = Object.fromEntries(PADS.map((p, i) => [p.key.toLowerCase(), i]));
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
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

  // ---------- bundled clips (clips/<pad-label>.mp3), fixed per pad ----------
  const slug = (str) => str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  async function loadBundled() {
    await Promise.all(PADS.map(async (p, i) => {
      if (p.cancel) return;
      try {
        const r = await fetch('clips/' + slug(p.label) + '.mp3');
        if (!r.ok) return;
        buffers[i] = await decode(await r.blob());
      } catch {}
    }));
  }

  // ---------- init ----------
  (async () => {
    buildPads();
    draw();
    await loadBundled();
    await selectSong(song, false);
  })();
})();
