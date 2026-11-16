/* Pirano Tiles — jeu solo pour le hub ChadGangGames
   Mélodies : morceaux du domaine public, notes synthétisées avec WebAudio. */
(() => {
  'use strict';

  const COLS = 4;
  const $ = (s) => document.querySelector(s);
  const store = (k, v) => {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* ignore */ }
    return null;
  };

  /* ---------- Mélodies (numéros MIDI) ---------- */
  const SONGS = {
    ode: { nom: 'Ode à la joie', notes: [64,64,65,67,67,65,64,62,60,60,62,64,64,62,62, 64,64,65,67,67,65,64,62,60,60,62,64,62,60,60, 62,62,64,60,62,64,65,64,60,62,64,65,64,62,60,62,55, 64,64,65,67,67,65,64,62,60,60,62,64,62,60,60] },
    elise: { nom: 'Für Elise', notes: [76,75,76,75,76,71,74,72,69, 60,64,69,71, 64,68,71,72, 64,76,75,76,75,76,71,74,72,69, 60,64,69,71, 64,72,71,69] },
    jacques: { nom: 'Frère Jacques', notes: [60,62,64,60,60,62,64,60,64,65,67,64,65,67,67,69,67,65,64,60,67,69,67,65,64,60,60,55,60,60,55,60] },
    lune: { nom: 'Au clair de la lune', notes: [60,60,60,62,64,62,60,64,62,62,60, 60,60,60,62,64,62,60,64,62,62,60, 62,62,62,62,57,57,62,60,59,57,55, 60,60,60,62,64,62,60,64,62,62,60] },
    libre: { nom: 'Mode libre', notes: null }
  };
  const PENTA = [60, 62, 64, 67, 69, 72, 74, 76];
  const MIL = { 10: 'Pas mal !', 25: 'EN FEU 🔥', 50: 'ÉPIQUE !', 75: 'LÉGENDAIRE ⚡', 100: 'INHUMAIN !!!' };

  /* ---------- Etat ---------- */
  const cv = $('#c');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1, bw = 0, bx = 0, colW = 0, rowH = 0;
  let state = 'menu';            // menu | ready | play | dead
  let paused = false, pauseReason = '', countdownEnd = 0, rulesOpen = false, pendingStart = false;
  let rows = [], hits = 0, scroll = 0, time = 0, rps = 2.6, bgSpeed = 1, failInfo = null;
  let songId = SONGS[store('pt_song')] ? store('pt_song') : 'ode';
  let stars = [], particles = [], ripples = [], waves = [];
  let laneGlow = [0, 0, 0, 0], shake = 0, flash = 0, flashColor = '255,255,255', banner = null;
  let bestLocal = parseInt(store('pt_best') || '0', 10) || 0;
  let taps = [], tpsTimer = 0, emberAcc = 0;
  let muted = store('pt_muted') === '1';
  let me = { id: 'local', name: 'Joueur', avatar: null };

  /* ---------- Audio ---------- */
  let actx = null, master = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.5;
      const comp = actx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function note(m, vel = 1, delay = 0) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const f = 440 * Math.pow(2, (m - 69) / 12);
    const t = a.currentTime + delay;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.55 * vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    g.connect(master);
    [[1, 1], [2, 0.35], [3, 0.12], [4, 0.05]].forEach(([k, v], i) => {
      const o = a.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = f * k;
      const og = a.createGain();
      og.gain.value = v;
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + 1.15);
    });
  }
  function failSound() {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    [110, 82.4].forEach((f, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 2, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.55);
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(g); g.connect(master);
      o.start(t + i * 0.02); o.stop(t + 0.65);
    });
  }
  function arpeggio(big) {
    const seq = big ? [72, 76, 79, 84, 88] : [72, 76, 79];
    seq.forEach((m, i) => note(m, 0.7, i * 0.07));
  }
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignore */ } };

  /* ---------- Avatars ---------- */
  function colorFromName(n) {
    let h = 0;
    for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360;
    return `hsl(${h},65%,48%)`;
  }
  function fallbackEl(p) {
    const d = document.createElement('div');
    d.className = 'av av-fallback';
    d.textContent = ((p.name || '?').trim()[0] || '?').toUpperCase();
    d.style.background = colorFromName(p.name || '?');
    if (p.id) d.setAttribute('data-chadgang-id', p.id);
    return d;
  }
  function avatarEl(p) {
    if (!p.avatar) return fallbackEl(p);
    const img = new Image();
    img.className = 'av';
    img.alt = '';
    img.src = p.avatar;
    if (p.id) img.setAttribute('data-chadgang-id', p.id);
    img.onerror = () => img.replaceWith(fallbackEl(p));
    return img;
  }
  function renderMe() {
    const chip = $('#meChip');
    chip.innerHTML = '';
    chip.appendChild(avatarEl(me));
    const s = document.createElement('span');
    s.textContent = me.name;
    chip.appendChild(s);
  }
  async function initMe() {
    if (window.ChadGang && ChadGang.me) {
      try {
        const m = await ChadGang.me();
        if (m) me = { id: m.id, name: m.name || 'Joueur', avatar: m.avatar || null };
      } catch (e) { /* mode secours */ }
    }
    renderMe();
  }

  /* ---------- Classement du hub ---------- */
  async function loadBoard() {
    const box = $('#hubBox');
    if (!(window.ChadGang && ChadGang.classement)) { box.hidden = true; return null; }
    try {
      const c = await ChadGang.classement();
      const list = (c && c.rows) || [];
      const ol = $('#topList');
      ol.innerHTML = '';
      list.slice(0, 5).forEach((r, i) => {
        const li = document.createElement('li');
        if (r.you) li.className = 'you';
        const rk = document.createElement('span'); rk.className = 'rk'; rk.textContent = ['🥇', '🥈', '🥉'][i] || (i + 1);
        const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name || '?';
        const sc = document.createElement('b'); sc.textContent = r.best;
        li.append(rk, avatarEl({ id: r.id, name: r.name, avatar: r.avatar }), nm, sc);
        ol.appendChild(li);
      });
      box.hidden = list.length === 0;
      return c;
    } catch (e) { box.hidden = true; return null; }
  }

  /* ---------- Mise en page ---------- */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bw = Math.min(W, 560, Math.max(240, H * 0.85));
    bx = (W - bw) / 2; colW = bw / COLS; rowH = H / 4;
    stars = [];
    for (let i = 0; i < 90; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: Math.random() });
  }

  /* ---------- Tuiles ---------- */
  const noteFor = (i) => {
    const s = SONGS[songId];
    return s.notes ? s.notes[i % s.notes.length] : PENTA[Math.floor(Math.random() * PENTA.length)];
  };
  function ensureRows(n) {
    while (rows.length <= n) {
      const i = rows.length;
      let c = Math.floor(Math.random() * COLS);
      if (i >= 2 && rows[i - 1].col === c && rows[i - 2].col === c) c = (c + 1 + Math.floor(Math.random() * 3)) % COLS;
      rows.push({ col: c, done: false, t: 0, hue: 0, n: noteFor(i) });
    }
  }
  const rowTop = (i) => H - (i + 1) * rowH + scroll;
  const curHue = () => (210 + hits * 4) % 360;

  /* ---------- Effets ---------- */
  function addP(p) { if (particles.length < 700) { p.max = p.life; particles.push(p); } }
  function burst(x, y, n, hue, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random());
      addP({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 700, life: 0.5 + Math.random() * 0.5,
        size: 3 + Math.random() * 5, c: `hsl(${hue + Math.random() * 50 - 25},95%,56%)`,
        shape: Math.random() < 0.5 ? 's' : 'c', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
    }
  }
  function confetti(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, s = 300 + Math.random() * 600;
      addP({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 900, life: 1.2 + Math.random() * 1.2,
        size: 5 + Math.random() * 6, c: `hsl(${Math.random() * 360},95%,58%)`, shape: 's',
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16 });
    }
  }
  function wave(x, y, hue, big) {
    waves.push({ x, y, r: 10, vr: big ? 1100 : 600, life: big ? 0.9 : 0.6, max: big ? 0.9 : 0.6, hue, w: big ? 10 : 5 });
  }
  function epic(n) {
    const txt = MIL[n] || (n > 100 && n % 50 === 0 ? 'CHAD MODE 👑' : null);
    if (!txt) return;
    const big = n >= 25;
    banner = { text: txt, t0: time, big };
    wave(W / 2, H * 0.55, curHue(), big);
    if (big) wave(W / 2, H * 0.55, (curHue() + 120) % 360, true);
    flash = big ? 0.55 : 0.25; flashColor = big ? '255,212,38' : '255,255,255';
    shake = Math.max(shake, big ? 22 : 10);
    confetti(W / 2, H * 0.6, big ? 90 : 35);
    arpeggio(big);
    buzz(big ? 60 : 30);
  }

  /* ---------- Jeu ---------- */
  function setScore(n) {
    const el = $('#score');
    el.textContent = n;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  function press(col, idx) {
    ensureRows(hits + 10);
    if (idx == null) idx = hits;
    const r = rows[idx];
    if (!r) return;
    if (idx < hits) { if (r.col === col) return; fail('white', idx, col); return; }
    if (idx === hits && r.col === col) { success(idx, col); return; }
    fail('white', idx, col);
  }
  function success(idx, col) {
    const r = rows[idx];
    r.done = true; r.t = time; r.hue = curHue();
    hits++;
    const cx = bx + col * colW + colW / 2, cy = rowTop(idx) + rowH / 2;
    note(r.n);
    ripples.push({ x: cx, y: cy, r: 6, life: 0.5, max: 0.5, hue: r.hue });
    burst(cx, cy, 10 + Math.min(14, hits >> 3), r.hue, 260);
    laneGlow[col] = 1;
    if (hits >= 25) shake = Math.max(shake, Math.min(5, 1.5 + hits / 40));
    buzz(8);
    setScore(hits);
    taps.push(performance.now());
    if (state === 'ready') { state = 'play'; $('#hint').hidden = true; }
    if (hits % 10 === 0 && hits >= 20 && !MIL[hits]) wave(cx, cy, r.hue, false);
    epic(hits);
    ensureRows(hits + 10);
  }
  function fail(kind, idx, col) {
    if (state === 'dead') return;
    state = 'dead';
    failInfo = { kind, idx, col, expect: hits, t: time };
    $('#hint').hidden = true;
    failSound(); buzz(150);
    shake = 24; flash = 0.7; flashColor = '255,40,60';
    const cx = bx + col * colW + colW / 2, cy = rowTop(idx) + rowH / 2;
    for (let i = 0; i < 40; i++) {
      addP({ x: cx + (Math.random() - 0.5) * colW, y: cy + (Math.random() - 0.5) * rowH,
        vx: (Math.random() - 0.5) * 500, vy: -Math.random() * 400, g: 1400, life: 0.9 + Math.random() * 0.6,
        size: 6 + Math.random() * 10, c: Math.random() < 0.5 ? '#ff3b4e' : '#12102b', shape: 's',
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
    }
    const score = hits;
    const p = submit(score);
    setTimeout(() => showOver(score, p), 900);
  }
  async function submit(score) {
    if (score <= 0 || !(window.ChadGang && ChadGang.finPartie)) return {};
    try { return (await ChadGang.finPartie({ score })) || {}; } catch (e) { return {}; }
  }
  function showMenu() {
    state = 'menu'; paused = false; failInfo = null; rows = []; hits = 0; scroll = 0; banner = null;
    $('#hint').hidden = true; $('#over').hidden = true; $('#menu').hidden = false;
    $('#scoreBox').style.opacity = 0;
    loadBoard();
  }
  function startGame() {
    $('#menu').hidden = true; $('#over').hidden = true; $('#scoreBox').style.opacity = 1;
    state = 'ready'; paused = false; pauseReason = ''; failInfo = null;
    rows = []; hits = 0; scroll = 0; rps = 2.6; banner = null; taps = [];
    particles = []; ripples = []; waves = []; laneGlow = [0, 0, 0, 0]; flash = 0; shake = 0;
    setScore(0); $('#tps').textContent = '⚡ 0.0 /s';
    ensureRows(12);
    $('#hint').hidden = false;
  }
  async function showOver(score, promise) {
    $('#over').hidden = false;
    const mEl = $('#overMe'); mEl.innerHTML = '';
    mEl.appendChild(avatarEl(me));
    const nm = document.createElement('span'); nm.textContent = me.name; mEl.appendChild(nm);
    $('#overScore').textContent = score;
    $('#overMsg').textContent = score < 10 ? 'Allez, on se reprend !' : score < 25 ? 'Pas mal du tout !' :
      score < 50 ? 'Du solide ! 💪' : score < 100 ? 'Tu gères 🔥' : 'LÉGENDE 👑';
    const rec = $('#overRec'); rec.hidden = true;
    let line = '';
    if (score > bestLocal) { bestLocal = score; store('pt_best', String(score)); line = '✨ Nouveau record perso !'; }
    else line = 'Ton record perso : ' + bestLocal;
    $('#overBest').textContent = line;
    const res = await promise;
    if (res && res.record) {
      rec.hidden = false;
      confetti(W / 2, H * 0.5, 120); arpeggio(true);
    }
    if (window.ChadGang) loadBoard();
  }

  /* ---------- Règles / pause ---------- */
  function startCountdown() { paused = true; countdownEnd = performance.now() + 1800; }
  function openRules(thenStart) {
    rulesOpen = true; pendingStart = !!thenStart;
    if (state === 'play' && !paused) { paused = true; pauseReason = 'rules'; countdownEnd = 0; }
    $('#rules').hidden = false;
  }
  function closeRules() {
    rulesOpen = false; $('#rules').hidden = true; store('pt_rules', '1');
    if (pendingStart) { pendingStart = false; startGame(); }
    else if (pauseReason === 'rules') startCountdown();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (state === 'play' && !paused) { paused = true; pauseReason = 'hidden'; countdownEnd = 0; } }
    else if (pauseReason === 'hidden' && !rulesOpen) startCountdown();
  });

  /* ---------- Entrées ---------- */
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if ((state !== 'ready' && state !== 'play') || paused) return;
    const x = e.clientX, y = e.clientY;
    if (x < bx || x >= bx + bw || y < 0 || y >= H) return;
    const col = Math.min(COLS - 1, Math.floor((x - bx) / colW));
    press(col, Math.floor((H - y + scroll) / rowH));
  });
  // Rangée de chiffres du haut : & é " ' (AZERTY) = Digit1 à Digit4, quelle que soit la disposition
  const KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (rulesOpen) { if (k === 'escape' || k === 'enter') closeRules(); return; }
    if (e.code in KEYS) { if ((state === 'ready' || state === 'play') && !paused) press(KEYS[e.code], null); return; }
    if (k === 'enter' || k === ' ') {
      if (state === 'menu') $('#btnPlay').click();
      else if (!$('#over').hidden) startGame();
    }
  });

  $('#btnPlay').addEventListener('click', () => { audio(); if (!store('pt_rules')) openRules(true); else startGame(); });
  $('#btnAgain').addEventListener('click', () => { audio(); startGame(); });
  $('#btnMenu').addEventListener('click', showMenu);
  $('#btnRules').addEventListener('click', () => openRules(false));
  $('#btnRulesClose').addEventListener('click', closeRules);
  const soundBtn = $('#btnSound');
  const syncSound = () => { soundBtn.textContent = muted ? '🔇' : '🔊'; };
  soundBtn.addEventListener('click', () => { muted = !muted; store('pt_muted', muted ? '1' : '0'); syncSound(); if (!muted) audio(); });
  syncSound();

  const songsEl = $('#songs');
  Object.keys(SONGS).forEach((id) => {
    const b = document.createElement('button');
    b.className = 'sg' + (id === songId ? ' on' : '');
    b.textContent = SONGS[id].nom;
    b.addEventListener('click', () => {
      songId = id; store('pt_song', id);
      songsEl.querySelectorAll('.sg').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      rows = [];
    });
    songsEl.appendChild(b);
  });

  /* ---------- Mise à jour ---------- */
  function update(dt) {
    time += dt;
    if (paused && countdownEnd && performance.now() >= countdownEnd) { paused = false; countdownEnd = 0; pauseReason = ''; }
    const active = state === 'play' && !paused;
    if (active) {
      const target = 2.6 + 7 * (1 - Math.exp(-hits / 90));
      rps += (target - rps) * Math.min(1, dt * 3);
      scroll += rps * rowH * dt;
      ensureRows(Math.ceil((H + scroll) / rowH) + 2);
      const top = rowTop(hits);
      if (top >= H) { scroll -= top - (H - rowH); fail('miss', hits, rows[hits].col); }
    } else if (state === 'menu') {
      scroll += rowH * 0.8 * dt;
      ensureRows(Math.ceil((H + scroll) / rowH) + 2);
    }
    bgSpeed += ((state === 'play' && !paused ? rps : state === 'menu' ? 0.8 : 0.5) - bgSpeed) * Math.min(1, dt * 4);

    shake *= Math.exp(-dt * 7);
    flash = Math.max(0, flash - dt * 2.5);
    for (let c = 0; c < COLS; c++) laneGlow[c] = Math.max(0, laneGlow[c] - dt * 2.5);

    const sp = bgSpeed * rowH * 0.35;
    stars.forEach((s) => { s.y += (30 + sp * s.z) * dt; if (s.y > H) { s.y = -10; s.x = Math.random() * W; } });

    if (active && hits >= 25) {
      emberAcc += dt * (hits >= 50 ? 55 : 30);
      while (emberAcc >= 1) {
        emberAcc -= 1;
        const h = hits >= 50 ? (time * 120) % 360 : 30 + Math.random() * 20;
        addP({ x: bx + Math.random() * bw, y: H + 4, vx: (Math.random() - 0.5) * 60, vy: -150 - Math.random() * 200,
          g: -20, life: 0.8 + Math.random() * 0.8, size: 2 + Math.random() * 4, c: `hsl(${h},100%,55%)`, shape: 'c', rot: 0, vr: 0 });
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i]; r.life -= dt; r.r += 320 * dt;
      if (r.life <= 0) ripples.splice(i, 1);
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]; w.life -= dt; w.r += w.vr * dt;
      if (w.life <= 0) waves.splice(i, 1);
    }

    tpsTimer += dt;
    if (tpsTimer > 0.25) {
      tpsTimer = 0;
      const now = performance.now();
      taps = taps.filter((t) => now - t < 2000);
      const v = state === 'play' ? taps.length / 2 : 0;
      $('#tps').textContent = '⚡ ' + v.toFixed(1) + ' /s';
    }
  }

  /* ---------- Rendu ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawBlack(x, y, w, h, emph, hue) {
    const p = Math.max(2, colW * 0.03), r = Math.min(14, w * 0.1);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#2d2a57'); g.addColorStop(0.5, '#161433'); g.addColorStop(1, '#0a091c');
    rr(x + p, y + p, w - 2 * p, h - 2 * p, r); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    rr(x + p + 3, y + p + 3, w - 2 * p - 6, (h - 2 * p) * 0.4, r * 0.7); ctx.fill();
    if (emph) {
      ctx.save();
      ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 14 + 8 * Math.sin(time * 8);
      ctx.strokeStyle = `hsl(${hue},100%,65%)`; ctx.lineWidth = 2.5;
      rr(x + p, y + p, w - 2 * p, h - 2 * p, r); ctx.stroke();
      ctx.restore();
    }
  }
  function drawCellRect(x, y, fill, stroke) {
    const p = Math.max(2, colW * 0.03);
    rr(x + p, y + p, colW - 2 * p, rowH - 2 * p, Math.min(14, colW * 0.1));
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.stroke(); }
  }
  const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  function render() {
    const hue = curHue();
    // fond
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `hsl(${hue},65%,16%)`); bg.addColorStop(1, `hsl(${(hue + 50) % 360},75%,7%)`);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // étoiles / traînées de vitesse
    const spd = bgSpeed * rowH;
    ctx.lineCap = 'round';
    stars.forEach((s) => {
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.5 * s.z})`; ctx.lineWidth = 1 + s.z * 1.5;
      const len = Math.min(70, spd * 0.03 * s.z) + 1;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - len); ctx.stroke();
    });

    ctx.save();
    if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // plateau + halo
    ctx.save();
    ctx.shadowColor = `hsl(${hue},100%,60%)`; ctx.shadowBlur = 14 + Math.min(46, hits * 0.5);
    ctx.fillStyle = '#f7f6ff'; ctx.fillRect(bx, 0, bw, H);
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(bx, 0, bw, H); ctx.clip();
    for (let c = 0; c < COLS; c++) {
      if (laneGlow[c] > 0.02) {
        const g = ctx.createLinearGradient(0, H, 0, 0);
        g.addColorStop(0, `hsla(${hue},100%,60%,${laneGlow[c] * 0.45})`); g.addColorStop(1, `hsla(${hue},100%,60%,0)`);
        ctx.fillStyle = g; ctx.fillRect(bx + c * colW, 0, colW, H);
      }
    }
    ctx.fillStyle = 'rgba(18,16,43,.14)';
    for (let c = 1; c < COLS; c++) ctx.fillRect(bx + c * colW - 0.5, 0, 1, H);

    const i0 = Math.max(0, Math.floor(scroll / rowH) - 1), i1 = Math.ceil((H + scroll) / rowH);
    for (let i = i0; i <= i1; i++) {
      const r = rows[i];
      if (!r) continue;
      const y = rowTop(i), x = bx + r.col * colW;
      ctx.fillStyle = 'rgba(18,16,43,.14)'; ctx.fillRect(bx, y - 0.5, bw, 1);
      if (r.done) {
        const f = Math.max(0, 1 - (time - r.t) * 1.6);
        drawCellRect(x, y, `hsla(${r.hue},95%,${60 + f * 10}%,${0.18 + 0.7 * f})`);
      } else if (failInfo && failInfo.kind === 'miss' && i === failInfo.idx) {
        drawBlack(x, y, colW, rowH, false, hue);
        drawCellRect(x, y, 'rgba(255,40,60,.75)', '#fff');
      } else {
        const emph = (state === 'play' || state === 'ready') && !paused && i === hits;
        drawBlack(x, y, colW, rowH, emph, hue);
        if (i === 0 && state === 'ready') {
          ctx.fillStyle = '#ffd426'; ctx.font = `900 ${Math.round(colW * 0.2)}px "Arial Black",system-ui,sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('DÉPART', x + colW / 2, y + rowH / 2);
        }
      }
    }
    if (failInfo && failInfo.kind !== 'miss') {
      const blink = 0.55 + 0.35 * Math.sin((time - failInfo.t) * 30);
      const fy = rowTop(failInfo.idx), fr = rows[failInfo.idx];
      drawCellRect(bx + failInfo.col * colW, fy, `rgba(255,40,60,${blink})`);
      const er = rows[failInfo.expect];
      if (er && !(failInfo.expect === failInfo.idx && er.col === failInfo.col)) {
        drawCellRect(bx + er.col * colW, rowTop(failInfo.expect), null, `rgba(255,212,38,${blink + 0.2})`);
      }
    }
    if (paused && state === 'play') { ctx.fillStyle = 'rgba(18,16,43,.55)'; ctx.fillRect(bx, 0, bw, H); }
    ctx.restore();

    // bordure arc-en-ciel à partir de 50
    if (hits >= 50 && state !== 'menu') {
      const g = ctx.createLinearGradient(bx, 0, bx + bw, H);
      for (let k = 0; k <= 4; k++) g.addColorStop(k / 4, `hsl(${(time * 160 + k * 70) % 360},100%,60%)`);
      ctx.strokeStyle = g; ctx.lineWidth = 5; ctx.strokeRect(bx, -4, bw, H + 8);
    }

    // effets
    ripples.forEach((r) => {
      ctx.strokeStyle = `hsla(${r.hue},100%,55%,${r.life / r.max})`; ctx.lineWidth = 4 * (r.life / r.max) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    });
    waves.forEach((w) => {
      ctx.strokeStyle = `hsla(${w.hue},100%,60%,${w.life / w.max})`; ctx.lineWidth = w.w * (w.life / w.max) + 1;
      ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
    });
    particles.forEach((p) => {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.4));
      ctx.fillStyle = p.c;
      if (p.shape === 'c') { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7); ctx.restore(); }
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // bannière de palier
    if (banner) {
      const t = time - banner.t0, d = 1.7;
      if (t > d) banner = null;
      else {
        const k = t < 0.25 ? easeOutBack(t / 0.25) : 1, a = t > d - 0.4 ? (d - t) / 0.4 : 1;
        ctx.save();
        ctx.translate(W / 2, H * 0.36); ctx.scale(k, k); ctx.globalAlpha = a;
        ctx.font = `900 ${Math.round(Math.min(64, bw * 0.14))}px "Arial Black",system-ui,sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = '#12102b'; ctx.strokeText(banner.text, 0, 0);
        ctx.fillStyle = banner.big ? `hsl(${(time * 300) % 360},100%,60%)` : '#ffd426'; ctx.fillText(banner.text, 0, 0);
        ctx.restore();
      }
    }
    // compte à rebours
    if (paused && countdownEnd) {
      const n = Math.max(1, Math.ceil((countdownEnd - performance.now()) / 600));
      ctx.save();
      ctx.font = `900 ${Math.round(Math.min(120, bw * 0.3))}px "Arial Black",system-ui,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 10; ctx.strokeStyle = '#12102b';
      ctx.strokeText(String(n), W / 2, H / 2); ctx.fillStyle = '#ffd426'; ctx.fillText(String(n), W / 2, H / 2);
      ctx.restore();
    }
    if (flash > 0.01) { ctx.fillStyle = `rgba(${flashColor},${flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
  }

  /* ---------- Boucle ---------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.__piranoDebug = () => ({ state, hits, paused, next: rows[hits] ? rows[hits].col : null, bx, bw, colW, rowH, H, scroll });
  resize();
  renderMe();
  initMe();
  showMenu();
  requestAnimationFrame(frame);
})();
