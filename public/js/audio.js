'use strict';
/* =========================================================
   Dźwięk: efekty syntezowane w WebAudio + prosty sekwencer
   ========================================================= */
const SFX = {
  ctx: null, master: null, sfx: null, mus: null, noise: null, last: {},
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { }); return; }
    try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.connect(this.master);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.volumes();
    Ambience.start();
    Music.onUnlock();
  },
  volumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = Settings.sfx;
    this.mus.gain.value = Settings.music * 0.42;
    Ambience.volume();
  },
  lx: 0, ly: 0, _g: 1,
  // słuchacz = środek kamery; dźwięki w świecie cichną z odległością
  listen(x, y) { this.lx = x; this.ly = y; },
  out(pan) {
    let dest = this.sfx;
    if (this._g < 0.999) { const g = this.ctx.createGain(); g.gain.value = this._g; g.connect(dest); dest = g; }
    if (pan === undefined || !this.ctx.createStereoPanner) return dest;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(dest); return p;
  },
  // szum przez filtr z opadającą obwiednią
  nz(o) {
    const c = this.ctx, t = c.currentTime + (o.at || 0);
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter(); f.type = o.type || 'lowpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f1), t + o.dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.5, t + (o.att || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfx);
    src.start(t, Math.random() * 1.5); src.stop(t + o.dur + 0.05);
  },
  tone(o) {
    const c = this.ctx, t = c.currentTime + (o.at || 0);
    const os = c.createOscillator(); os.type = o.wave || 'sine';
    os.frequency.setValueAtTime(o.f0, t);
    if (o.f1) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.slide || o.dur));
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.3, t + (o.att || 0.004));
    if (o.hold) g.gain.setValueAtTime(o.vol || 0.3, t + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    os.connect(g); g.connect(o.dest || this.sfx);
    os.start(t); os.stop(t + o.dur + 0.05);
  },
  play(name, o) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted) return;
    o = o || {};
    let g = 1;
    if (o.x !== undefined && o.y !== undefined) {
      const d = Math.hypot(o.x - this.lx, o.y - this.ly);
      if (d > 640) return;
      g = Math.pow(1 - d / 640, 1.6);
      if (g < 0.03) return;
    }
    const now = this.ctx.currentTime, lim = LIMITS[name] || 0.03;
    if (this.last[name] && now - this.last[name] < lim) return;
    this.last[name] = now;
    const fn = SOUNDS[name];
    this._g = g;
    if (fn) { try { fn(this, o); } catch (e) { /* ignoruj */ } }
    this._g = 1;
  }
};
const LIMITS = { hover: 0.05, hit: 0.035, metal: 0.04, splash: 0.04, cannon: 0.03, tick: 0.2, place: 0.03, crackle: 0.08, swivel: 0.05, coins: 0.06, barrel: 0.05 };
const panX = x => x === undefined ? undefined : clamp((x - SFX.lx) / 320, -1, 1) * 0.75;

const SOUNDS = {
  cannon(S, o) {
    const d = S.out(panX(o.x)), v = o.vol || 1, p = rand(0.9, 1.1);
    S.nz({ type: 'lowpass', f0: 2600 * p, f1: 140, dur: 0.75, vol: 0.85 * v, dest: d });
    S.nz({ type: 'highpass', f0: 2500, dur: 0.07, vol: 0.4 * v, dest: d });
    S.tone({ wave: 'sine', f0: 110 * p, f1: 32, dur: 0.42, vol: 0.9 * v, dest: d });
    S.tone({ wave: 'triangle', f0: 70 * p, f1: 40, dur: 0.6, vol: 0.4 * v, at: 0.02, dest: d });
  },
  hit(S, o) {
    const d = S.out(panX(o.x)), p = rand(0.85, 1.2);
    S.nz({ type: 'bandpass', f0: 1500 * p, f1: 500, q: 1.4, dur: 0.22, vol: 0.7, dest: d });
    S.nz({ type: 'highpass', f0: 3500, dur: 0.04, vol: 0.4, dest: d });
    S.nz({ type: 'highpass', f0: 2800, dur: 0.03, vol: 0.3, at: 0.05, dest: d });
    S.tone({ wave: 'triangle', f0: 220 * p, f1: 80, dur: 0.16, vol: 0.5, dest: d });
  },
  breakWood(S, o) {
    const d = S.out(panX(o.x));
    S.nz({ type: 'lowpass', f0: 1800, f1: 200, dur: 0.45, vol: 0.8, dest: d });
    for (let i = 0; i < 4; i++) S.nz({ type: 'highpass', f0: 2000 + i * 500, dur: 0.03, vol: 0.35, at: i * 0.045 + rand(0, 0.02), dest: d });
    S.tone({ wave: 'triangle', f0: 140, f1: 55, dur: 0.3, vol: 0.5, dest: d });
  },
  metal(S, o) {
    const d = S.out(panX(o.x)), p = rand(0.9, 1.15);
    S.tone({ wave: 'square', f0: 880 * p, f1: 620 * p, dur: 0.2, vol: 0.12, dest: d });
    S.tone({ wave: 'sine', f0: 1320 * p, f1: 1250 * p, dur: 0.35, vol: 0.22, dest: d });
    S.tone({ wave: 'sine', f0: 2210 * p, dur: 0.18, vol: 0.12, dest: d });
    S.nz({ type: 'highpass', f0: 3000, dur: 0.06, vol: 0.4, dest: d });
  },
  splash(S, o) {
    const d = S.out(panX(o.x)), big = o.big;
    S.nz({ type: 'bandpass', f0: 1100, f1: 350, q: 0.7, dur: big ? 0.7 : 0.42, vol: big ? 0.6 : 0.4, dest: d });
    S.nz({ type: 'highpass', f0: 3500, f1: 6000, dur: 0.28, vol: 0.22, att: 0.03, dest: d });
  },
  explosion(S, o) {
    const d = S.out(panX(o.x));
    S.nz({ type: 'lowpass', f0: 1400, f1: 60, dur: 1.5, vol: 1.0, dest: d });
    S.tone({ wave: 'sine', f0: 75, f1: 24, dur: 1.0, vol: 1.0, dest: d });
    for (let i = 0; i < 6; i++) S.nz({ type: 'highpass', f0: 1800, dur: 0.05, vol: 0.3, at: 0.1 + i * rand(0.05, 0.12), dest: d });
  },
  mortar(S, o) {
    const d = S.out(panX(o.x));
    S.tone({ wave: 'sine', f0: 90, f1: 40, dur: 0.35, vol: 0.9, dest: d });
    S.nz({ type: 'lowpass', f0: 900, f1: 120, dur: 0.5, vol: 0.6, dest: d });
  },
  whistle(S, o) {
    const d = S.out(panX(o.x)), dur = o.dur || 0.7;
    S.tone({ wave: 'sine', f0: 1900, f1: 650, slide: dur, dur, vol: 0.09, att: 0.05, hold: dur * 0.8, dest: d });
  },
  ram(S, o) {
    const d = S.out(panX(o.x));
    S.nz({ type: 'lowpass', f0: 1200, f1: 90, dur: 0.6, vol: 1.0, dest: d });
    S.tone({ wave: 'sine', f0: 60, f1: 30, dur: 0.5, vol: 1.0, dest: d });
    for (let i = 0; i < 5; i++) S.nz({ type: 'bandpass', f0: 1800 + i * 300, q: 2, dur: 0.05, vol: 0.4, at: i * 0.04, dest: d });
  },
  scrape(S, o) { S.nz({ type: 'bandpass', f0: 600, f1: 300, q: 3, dur: 0.3, vol: 0.35, dest: S.out(panX(o.x)) }); },
  ignite(S, o) { for (let i = 0; i < 5; i++) S.nz({ type: 'highpass', f0: 3000 + Math.random() * 2000, dur: 0.025, vol: 0.18, at: i * 0.05, dest: S.out(panX(o.x)) }); },
  crackle(S, o) { S.nz({ type: 'highpass', f0: 4000, dur: 0.02, vol: 0.08, dest: S.out(panX(o.x)) }); },
  sail(S, o) { S.nz({ type: 'bandpass', f0: o.up ? 400 : 1500, f1: o.up ? 1600 : 400, q: 1.2, dur: 0.32, vol: 0.22, att: 0.08, dest: S.out(panX(o.x)) }); },
  click(S) { S.tone({ wave: 'square', f0: 660, dur: 0.05, vol: 0.08 }); S.tone({ wave: 'square', f0: 990, dur: 0.04, vol: 0.06, at: 0.035 }); },
  hover(S) { S.tone({ wave: 'square', f0: 1320, dur: 0.02, vol: 0.035 }); },
  place(S, o) {
    const p = o.pitch || 1;
    S.tone({ wave: 'triangle', f0: 340 * p, f1: 180 * p, dur: 0.08, vol: 0.45 });
    S.nz({ type: 'bandpass', f0: 2400, q: 2, dur: 0.04, vol: 0.4 });
    S.tone({ wave: 'triangle', f0: 380 * p, f1: 200 * p, dur: 0.07, vol: 0.35, at: 0.075 });
    S.nz({ type: 'bandpass', f0: 2600, q: 2, dur: 0.035, vol: 0.3, at: 0.075 });
  },
  coin(S) { S.tone({ wave: 'square', f0: 1319, dur: 0.06, vol: 0.06 }); S.tone({ wave: 'square', f0: 1760, dur: 0.14, vol: 0.06, at: 0.055 }); },
  remove(S) { S.tone({ wave: 'square', f0: 520, f1: 180, dur: 0.12, vol: 0.07 }); S.nz({ type: 'lowpass', f0: 700, dur: 0.12, vol: 0.4 }); },
  error(S) { S.tone({ wave: 'square', f0: 150, dur: 0.08, vol: 0.12 }); S.tone({ wave: 'square', f0: 120, dur: 0.1, vol: 0.12, at: 0.09 }); },
  tick(S, o) { S.tone({ wave: 'square', f0: o.hi ? 1760 : 1100, dur: 0.035, vol: o.hi ? 0.12 : 0.07 }); S.nz({ type: 'highpass', f0: 5000, dur: 0.02, vol: 0.2 }); },
  bell(S) { [1046, 2093, 2637, 3136].forEach((f, i) => S.tone({ wave: 'sine', f0: f, dur: 1.6 - i * 0.3, vol: [0.3, 0.12, 0.08, 0.05][i] })); },
  horn(S) {
    S.tone({ wave: 'sawtooth', f0: 98, dur: 1.5, vol: 0.12, att: 0.12, hold: 1.1 });
    S.tone({ wave: 'sawtooth', f0: 147, dur: 1.5, vol: 0.08, att: 0.12, hold: 1.1 });
    S.tone({ wave: 'sine', f0: 49, dur: 1.5, vol: 0.25, att: 0.12, hold: 1.1 });
  },
  pickup(S) { [660, 880, 1100, 1320, 1760].forEach((f, i) => S.tone({ wave: 'square', f0: f, dur: 0.09, vol: 0.07, at: i * 0.05 })); },
  empty(S) { S.nz({ type: 'highpass', f0: 2500, dur: 0.03, vol: 0.25 }); S.tone({ wave: 'square', f0: 300, dur: 0.03, vol: 0.05 }); },
  sink(S, o) {
    const d = S.out(panX(o.x));
    S.nz({ type: 'lowpass', f0: 400, f1: 80, dur: 2.5, vol: 0.7, att: 0.2, dest: d });
    for (let i = 0; i < 10; i++) S.tone({ wave: 'sine', f0: rand(250, 500), f1: rand(700, 1100), dur: 0.08, vol: 0.1, at: rand(0.1, 2.2), dest: d });
  },
  gull(S) {
    const t0 = rand(0, 0.1);
    for (let i = 0; i < 3; i++) S.tone({ wave: 'sine', f0: 1700, f1: 2400, slide: 0.08, dur: 0.16, vol: 0.05, at: t0 + i * 0.2 });
  },
  whoosh(S) { S.nz({ type: 'bandpass', f0: 300, f1: 2400, q: 0.9, dur: 0.38, vol: 0.18, att: 0.15 }); },
  thunder(S) {
    S.nz({ type: 'lowpass', f0: 600, f1: 50, dur: 2.8, vol: 0.9, att: 0.05 });
    S.nz({ type: 'lowpass', f0: 300, f1: 40, dur: 2.0, vol: 0.6, at: 0.4 });
  },
  repair(S) { S.tone({ wave: 'triangle', f0: 900, dur: 0.05, vol: 0.12 }); S.tone({ wave: 'triangle', f0: 1200, dur: 0.05, vol: 0.1, at: 0.06 }); },
  swivel(S, o) {
    const d = S.out(panX(o.x)), p = rand(0.9, 1.15);
    S.nz({ type: 'bandpass', f0: 2200 * p, f1: 500, q: 1.2, dur: 0.18, vol: 0.45, dest: d });
    S.tone({ wave: 'sine', f0: 240 * p, f1: 90, dur: 0.14, vol: 0.4, dest: d });
  },
  fireball(S, o) {
    const d = S.out(panX(o.x));
    S.nz({ type: 'lowpass', f0: 1800, f1: 160, dur: 0.6, vol: 0.7, dest: d });
    S.nz({ type: 'bandpass', f0: 500, f1: 1400, q: 0.8, dur: 0.5, vol: 0.35, att: 0.05, dest: d });
    S.tone({ wave: 'sine', f0: 95, f1: 40, dur: 0.4, vol: 0.7, dest: d });
  },
  chain(S, o) {
    const d = S.out(panX(o.x));
    for (let i = 0; i < 4; i++) S.tone({ wave: 'square', f0: 1400 + i * 120, dur: 0.03, vol: 0.05, at: 0.05 + i * 0.05, dest: d });
  },
  coins(S) { [1319, 1568, 2093].forEach((f, i) => S.tone({ wave: 'square', f0: f, dur: 0.07, vol: 0.055, at: i * 0.045 })); },
  item(S) { [784, 988, 1175, 1568, 1976].forEach((f, i) => S.tone({ wave: 'triangle', f0: f, dur: 0.16, vol: 0.12, at: i * 0.06 })); },
  ghost(S, o) {
    const d = S.out(panX(o.x));
    [220, 233, 330, 349].forEach((f, i) => S.tone({ wave: 'sine', f0: f, f1: f * 0.96, dur: 2.6, vol: 0.09, att: 0.6, hold: 1.6, at: i * 0.12, dest: d }));
    S.nz({ type: 'bandpass', f0: 600, f1: 300, q: 4, dur: 2.4, vol: 0.2, att: 0.5, dest: d });
  },
  lightning(S, o) {
    const d = S.out(panX(o.x));
    S.nz({ type: 'highpass', f0: 1500, dur: 0.12, vol: 0.9, dest: d });
    S.nz({ type: 'lowpass', f0: 900, f1: 50, dur: 2.2, vol: 0.9, at: 0.05, dest: d });
  },
  barrel(S, o) {
    const d = S.out(panX(o.x));
    S.nz({ type: 'bandpass', f0: 900, f1: 300, q: 1.1, dur: 0.3, vol: 0.6, dest: d });
    for (let i = 0; i < 3; i++) S.nz({ type: 'highpass', f0: 2600, dur: 0.03, vol: 0.3, at: i * 0.04, dest: d });
  },
  shield(S, o) { S.tone({ wave: 'sine', f0: 1760, f1: 1320, dur: 0.25, vol: 0.12, dest: S.out(panX(o.x)) }); },
  ready(S) { [523, 659, 784, 1047].forEach((f, i) => S.tone({ wave: 'square', f0: f, dur: 0.12, vol: 0.07, at: i * 0.06 })); }
};

// szum morza w tle
const Ambience = {
  g: null, lg: null, level: 1,
  start() {
    const c = SFX.ctx; if (!c || this.g) return;
    const src = c.createBufferSource(); src.buffer = SFX.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.11;
    const lg = c.createGain(); lg.gain.value = 0;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(f); f.connect(g); g.connect(SFX.sfx);
    src.start(); lfo.start();
    this.g = g; this.lg = lg; this.volume();
  },
  set(level) { this.level = level; this.volume(); },
  volume() {
    if (!this.g) return;
    const t = SFX.ctx.currentTime;
    this.g.gain.setTargetAtTime(0.05 * this.level, t, 0.6);
    this.lg.gain.setTargetAtTime(0.03 * this.level, t, 0.6);
  }
};

// ---------- muzyka ----------
const NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteFreq(n) {
  const m = /^([A-G])(#?)(-?\d)$/.exec(n);
  if (!m) return 0;
  const midi = 12 * (parseInt(m[3], 10) + 1) + NOTE_SEMI[m[1]] + (m[2] ? 1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}
const seq = s => s.trim().split(/\s+/);
const rep = (s, n) => Array(n).fill(s).join(' ');
const Music = {
  cur: null, want: null, song: null, step: 0, next: 0, timer: null, tempoMul: 1, duck: 1,
  songs: {},
  onUnlock() { if (this.want) this.play(this.want, true); },
  play(name, force) {
    this.want = name;
    if (!SFX.ctx) return;
    if (this.cur === name && !force) return;
    this.stop(); this.want = name;
    const s = this.songs[name]; if (!s) return;
    this.cur = name; this.song = s; this.step = 0; this.tempoMul = 1;
    this.next = SFX.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.tick(), 25);
  },
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.cur = null; this.want = null; },
  tick() {
    const c = SFX.ctx, s = this.song;
    if (!c || !s) return;
    if (this.next < c.currentTime - 0.3) this.next = c.currentTime + 0.05;
    const sd = 60 / (s.bpm * this.tempoMul) / s.div;
    while (this.next < c.currentTime + 0.14) {
      for (const tr of s.tracks) this.playStep(tr, this.step, this.next, sd);
      this.next += sd; this.step++;
    }
  },
  playStep(tr, i, t, sd) {
    const n = tr.seq.length, k = i % n, tok = tr.seq[k];
    if (!tok || tok === '-' || tok === '.') return;
    if (tr.inst === 'drum') { for (const ch of tok) this.drum(ch, t, tr.vol || 1); return; }
    let len = 1; while (tr.seq[(k + len) % n] === '-' && len < n) len++;
    this.note(tr, noteFreq(tok), t, len * sd);
  },
  note(tr, f, t, dur) {
    if (!f) return;
    const c = SFX.ctx, os = c.createOscillator(), g = c.createGain();
    const v = (tr.vol || 0.1) * this.duck;
    os.type = tr.wave || 'square';
    os.frequency.setValueAtTime(f, t);
    if (tr.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = f * 0.006; l.connect(lg); lg.connect(os.frequency); l.start(t); l.stop(t + dur + 0.1); }
    const rel = Math.min(0.08, dur * 0.3), d = dur * (tr.legato || 0.85);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.setValueAtTime(v * (tr.sus || 0.75), t + Math.min(d, 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + rel);
    os.connect(g); g.connect(SFX.mus);
    os.start(t); os.stop(t + d + rel + 0.02);
  },
  drum(ch, t, vol) {
    const c = SFX.ctx;
    if (ch === 'K') {
      const os = c.createOscillator(), g = c.createGain();
      os.frequency.setValueAtTime(140, t); os.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55 * vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      os.connect(g); g.connect(SFX.mus); os.start(t); os.stop(t + 0.22);
    } else if (ch === 'S' || ch === 'H' || ch === 'O') {
      const src = c.createBufferSource(); src.buffer = SFX.noise;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = ch === 'S' ? 1300 : 6500;
      const g = c.createGain(), dur = ch === 'S' ? 0.14 : ch === 'O' ? 0.12 : 0.035, v = (ch === 'S' ? 0.3 : 0.09) * vol;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(SFX.mus); src.start(t, Math.random()); src.stop(t + dur + 0.02);
    }
  },
  sting(name) {
    if (!SFX.ctx) return;
    const t0 = SFX.ctx.currentTime + 0.05, tr = { wave: 'square', vol: 0.11, legato: 0.9 }, tb = { wave: 'triangle', vol: 0.25, legato: 0.95 };
    const S = {
      win: [['C5', 0, .1], ['E5', .1, .1], ['G5', .2, .1], ['C6', .3, .25], ['G5', .55, .1], ['C6', .65, .7]],
      lose: [['G4', 0, .3], ['F#4', .3, .3], ['F4', .6, .3], ['E4', .9, .9]],
      round: [['D5', 0, .12], ['A5', .12, .3]],
      start: [['A4', 0, .1], ['D5', .1, .1], ['F5', .2, .1], ['A5', .3, .45]]
    }[name];
    if (!S) return;
    for (const n of S) { this.note(tr, noteFreq(n[0]), t0 + n[1], n[2]); this.note(tb, noteFreq(n[0]) / 2, t0 + n[1], n[2]); }
  }
};

// --- utwory ---
(() => {
  // Stocznia: tradycyjna szanta (Drunken Sailor), domena publiczna
  const v1 = 'A4 - A4 A4 A4 - A4 A4 A4 - D4 - F4 - A4 -', v2 = 'G4 - G4 G4 G4 - G4 G4 G4 - C4 - E4 - G4 -';
  const v3 = 'A4 - A4 A4 A4 - A4 A4 A4 - B4 - C5 - D5 -', v4 = 'C5 - A4 - G4 - E4 - D4 - - - D4 - - -';
  const c1 = 'A4 - - - A4 - - - A4 - D4 - F4 - A4 -', c2 = 'G4 - - - G4 - - - G4 - C4 - E4 - G4 -';
  const c3 = 'A4 - - - A4 - - - A4 - B4 - C5 - D5 -';
  const Dm = 'D2 . A2 . D3 . A2 .', Cc = 'C2 . G2 . C3 . G2 .';
  const bassLine = [Dm, Dm, Cc, Cc, Dm, Dm, Cc, Dm].join(' ');
  const hDm = 'F4 . A4 . F4 . A4 .', hC = 'E4 . G4 . E4 . G4 .';
  const harm = [hDm, hDm, hC, hC, hDm, hDm, hC, hDm].join(' ');
  Music.songs.build = {
    bpm: 128, div: 2,
    tracks: [
      { inst: 'lead', wave: 'square', vol: 0.065, seq: seq([v1, v2, v3, v4, c1, c2, c3, v4].join(' ')), legato: 0.8 },
      { inst: 'bass', wave: 'triangle', vol: 0.24, seq: seq(bassLine + ' ' + bassLine), legato: 0.7 },
      { inst: 'harm', wave: 'square', vol: 0.022, seq: seq(harm + ' ' + harm), legato: 0.5 },
      { inst: 'drum', seq: seq('KH H SH H KH H SH H'), vol: 0.8 }
    ]
  };
  // Bitwa
  const bDm = 'D2 D2 A2 D2 D3 D2 A2 C3', bBb = 'A#1 A#1 F2 A#1 A#2 A#1 F2 A2', bC = 'C2 C2 G2 C2 C3 C2 G2 A#2', bA = 'A1 A1 E2 A1 A2 A1 C#2 E2';
  const bl = [bDm, bBb, bC, bA].join(' ');
  const mel = ['D5 - - A4 F4 - A4 -', 'D5 - - F5 E5 - D5 -', 'C5 - - G4 E4 - G4 -', 'A4 - C#5 - E5 - - -',
    'F5 - E5 - D5 - A4 -', 'A#4 - A4 - G4 - F4 -', 'E4 - G4 - C5 - A#4 A4', 'A4 - - - C#5 - E5 -'].join(' ');
  Music.songs.battle = {
    bpm: 148, div: 2,
    tracks: [
      { inst: 'lead', wave: 'square', vol: 0.055, vib: true, seq: seq(rep('.', 64) + ' ' + mel), legato: 0.9 },
      { inst: 'bass', wave: 'triangle', vol: 0.26, seq: seq(bl), legato: 0.6 },
      { inst: 'bass2', wave: 'square', vol: 0.018, seq: seq(bl), legato: 0.4 },
      { inst: 'drum', seq: seq('KH H SH KH KH H SH H KH H SH KH KH SH SH SO'), vol: 0.9 }
    ]
  };
  // Menu
  const aDm = 'D3 A3 D4 A3 F3 A3 D4 A3', aBb = 'A#2 F3 A#3 F3 D3 F3 A#3 F3', aF = 'F2 C3 F3 C3 A2 C3 F3 C3', aC = 'C3 G3 C4 G3 E3 G3 C4 G3';
  const ml = ['F4 - - - E4 - D4 -', 'D4 - - - C4 - A#3 -', 'A3 - - - C4 - F4 -', 'E4 - - - - - - -',
    'F4 - - - G4 - A4 -', 'A#4 - - - A4 - G4 -', 'A4 - - - G4 - F4 -', 'E4 - - - C4 - - -'].join(' ');
  Music.songs.menu = {
    bpm: 84, div: 2,
    tracks: [
      { inst: 'lead', wave: 'triangle', vol: 0.2, vib: true, seq: seq(ml), legato: 0.95, sus: 0.9 },
      { inst: 'arp', wave: 'square', vol: 0.028, seq: seq([aDm, aBb, aF, aC].join(' ')), legato: 0.5 },
      { inst: 'bassm', wave: 'triangle', vol: 0.16, seq: seq('D2 - - - - - - - A#1 - - - - - - - F2 - - - - - - - C2 - - - - - - -'), legato: 0.95 },
      { inst: 'drum', seq: seq('. . H . . . H . . . H . . . H O'), vol: 0.6 }
    ]
  };
  // Żegluga: spokojna szanta w D-dorian
  const sl = ['D4 - - F4 A4 - - G4', 'F4 - E4 - D4 - - -', 'C4 - - E4 G4 - - F4', 'E4 - D4 - C4 - - -',
    'D4 - - F4 A4 - - C5', 'D5 - C5 - A4 - - G4', 'F4 - - E4 D4 - C4 -', 'D4 - - - - - - -'].join(' ');
  const sb = 'D2 - A2 - D3 - A2 - D2 - A2 - D3 - A2 - C2 - G2 - C3 - G2 - C2 - G2 - C3 - G2 -';
  Music.songs.sea = {
    bpm: 96, div: 2,
    tracks: [
      { inst: 'lead', wave: 'triangle', vol: 0.18, vib: true, seq: seq(rep('.', 64) + ' ' + sl), legato: 0.92, sus: 0.85 },
      { inst: 'bass', wave: 'triangle', vol: 0.15, seq: seq(sb), legato: 0.8 },
      { inst: 'arp', wave: 'square', vol: 0.02, seq: seq('D4 F4 A4 F4 D4 F4 A4 F4 D4 F4 A4 F4 D4 F4 A4 F4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4 C4 E4 G4 E4'), legato: 0.5 },
      { inst: 'drum', seq: seq('K . . . H . . . K . . . H . . O'), vol: 0.45 }
    ]
  };
  // Zwycięstwo
  Music.songs.victory = {
    bpm: 120, div: 2,
    tracks: [
      { inst: 'lead', wave: 'square', vol: 0.06, seq: seq('D5 - F5 - A5 - - - G5 - E5 - C5 - - - F5 - A5 - C6 - - - A#5 - A5 - G5 - E5 -'), legato: 0.85 },
      { inst: 'bass', wave: 'triangle', vol: 0.22, seq: seq('D3 . A2 . D3 . A2 . C3 . G2 . C3 . G2 . F2 . C3 . F2 . C3 . A#2 . F2 . A2 . E2 .'), legato: 0.7 },
      { inst: 'drum', seq: seq('KH H SH H KH KH SH H'), vol: 0.7 }
    ]
  };
})();
