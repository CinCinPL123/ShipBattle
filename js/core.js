'use strict';
/* =========================================================
   DRZAZGI — rdzeń: stałe, narzędzia, ekran, wejście, sceny
   ========================================================= */

const W = 640, H = 360, TAU = Math.PI * 2;
const TILE = 8;                 // kafel okrętu w bitwie (piksele grafiki)
const COLS = 9, ROWS = 13;      // siatka stoczni
const CORE_C = 4, CORE_R = 6;   // kajuta kapitana
const PAD = 8;                  // margines sprite'a okrętu
const ARENA = { x0: 10, y0: 44, x1: 630, y1: 352 };

// Paleta (Endesga 32 + kilka odcieni pomocniczych)
const PAL = {
  black: '#181425', navy: '#262b44', slate: '#3a4466', steel: '#5a6988', grey: '#8b9bb4', silver: '#c0cbdc', white: '#ffffff',
  woodDD: '#3e2731', woodD: '#733e39', wood: '#b86f50', woodL: '#e4a672', sand: '#ead4aa', skin: '#e8b796', skinD: '#c28569',
  rust: '#be4a2f', orange2: '#d77643', red: '#a22633', red2: '#e43b44', orange: '#f77622', gold: '#feae34', yellow: '#fee761',
  green: '#63c74d', greenD: '#3e8948', greenDD: '#265c42', teal: '#193c3e',
  blue: '#124e89', blue2: '#0099db', cyan: '#2ce8f5', pink: '#ff0044', purple: '#68386c', mag: '#b55088', salmon: '#f6757a'
};
const TEAM = [
  { name: 'Czerwoni', c: '#e43b44', d: '#a22633', l: '#f6757a', dd: '#5c1624' },
  { name: 'Niebiescy', c: '#2a9df0', d: '#1a5a9c', l: '#8fd3ff', dd: '#10305a' }
];

// ---------- narzędzia ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function angNorm(a) { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }
const angDiff = (a, b) => angNorm(b - a);
// polska odmiana liczebnikow: 1 wezel, 2 wezly, 5 wezlow
function plural(n, one, few, many) {
  n = Math.abs(Math.round(n));
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) ? few : many;
}
// kąt kursowy: 0 = w górę ekranu, rośnie zgodnie z ruchem wskazówek
const headingTo = (dx, dy) => Math.atan2(dx, -dy);
const fwdX = a => Math.sin(a), fwdY = a => -Math.cos(a);
const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  outBack: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1
};
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

const _rgbCache = new Map();
function hexRgb(h) {
  let v = _rgbCache.get(h);
  if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _rgbCache.set(h, v); }
  return v;
}
function rgba(h, a) { const c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  const c = i => Math.round(lerp(A[i], B[i], t)).toString(16).padStart(2, '0');
  return '#' + c(0) + c(1) + c(2);
}

// ---------- szum ----------
const Noise = (() => {
  const N = 256, M = 255, lat = new Float32Array(N * N), r = mulberry32(1337);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  function v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const x0 = xi & M, y0 = yi & M, x1 = (xi + 1) & M, y1 = (yi + 1) & M;
    const a = lat[y0 * N + x0], b = lat[y0 * N + x1], c = lat[y1 * N + x0], d = lat[y1 * N + x1];
    const top = a + (b - a) * u, bot = c + (d - c) * u;
    return top + (bot - top) * w;
  }
  function fbm(x, y, o = 3) {
    let s = 0, a = .5, f = 1, n = 0;
    for (let i = 0; i < o; i++) { s += a * v(x * f + i * 31.7, y * f + i * 17.3); n += a; a *= .5; f *= 2; }
    return s / n;
  }
  return { v, fbm };
})();

// ---------- zapis ----------
const Store = {
  get(k, def) { try { const v = localStorage.getItem('drzazgi.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('drzazgi.' + k, JSON.stringify(v)); } catch (e) { /* brak dostępu */ } }
};
const Settings = Object.assign({ music: 0.55, sfx: 0.8, shake: true, crt: false, buildTime: 60 }, Store.get('settings', {}));
function saveSettings() { Store.set('settings', Settings); }
const Career = Object.assign({ wins: [0, 0, 0], losses: [0, 0, 0], pvp: 0, sunk: 0 }, Store.get('career', {}));
function saveCareer() { Store.set('career', Career); }

// ---------- ekran ----------
const Screen = {
  canvas: null, ctx: null, scale: 1, dpr: 1,
  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    addEventListener('resize', () => this.resize());
    document.addEventListener('fullscreenchange', () => setTimeout(() => this.resize(), 50));
    this.resize();
  },
  resize() {
    const wrap = document.getElementById('wrap') || document.body;
    const cs = getComputedStyle(wrap);
    const aw = Math.max(200, wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    const ah = Math.max(120, wrap.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
    const dpr = window.devicePixelRatio || 1;
    let s = Math.min(aw * dpr / W, ah * dpr / H);
    const si = Math.floor(s);
    if (si >= 1 && si / s >= 0.84) s = si;
    s = Math.max(0.5, s);
    this.scale = s; this.dpr = dpr;
    const cw = Math.round(W * s), ch = Math.round(H * s);
    this.canvas.width = cw; this.canvas.height = ch;
    this.canvas.style.width = (cw / dpr) + 'px';
    this.canvas.style.height = (ch / dpr) + 'px';
    this.ctx.imageSmoothingEnabled = false;
    this._scan = null;
  },
  begin() {
    const c = this.ctx;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  },
  toggleFullscreen() {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
      else document.exitFullscreen().catch(() => { });
    } catch (e) { /* niedostępne */ }
  },
  // filtr CRT (linie skanowania) w przestrzeni ekranu
  drawCRT() {
    const c = this.ctx, s = this.scale;
    if (!this._scan) {
      const h = Math.max(2, Math.round(s));
      const pc = document.createElement('canvas'); pc.width = 4; pc.height = h;
      const x = pc.getContext('2d');
      const lh = Math.max(1, Math.floor(h / 3));
      x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, h - lh, 4, lh);
      this._scan = c.createPattern(pc, 'repeat');
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = this._scan; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(s, 0, 0, s, 0, 0);
  }
};

// ---------- wejście ----------
const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Slash', 'Quote', 'Backspace', 'Enter']);
const GP_KEYS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'BACK', 'START', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
const Input = {
  down: new Set(), pressed: new Set(), released: new Set(),
  mouse: { x: -100, y: -100, down: [false, false, false], pressed: [false, false, false], released: [false, false, false], wheel: 0, moved: false, active: false },
  lastDevice: 'mouse', any: false,
  init(canvas) {
    addEventListener('keydown', e => {
      if (BLOCK_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) { this.down.add(e.code); this.pressed.add(e.code); this.any = true; }
      this.lastDevice = 'key';
      SFX.unlock();
    });
    addEventListener('keyup', e => { this.down.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.down.clear(); this.mouse.down = [false, false, false]; });
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = (e.clientX - r.left) / r.width * W;
      this.mouse.y = (e.clientY - r.top) / r.height * H;
      this.mouse.active = true;
    };
    canvas.addEventListener('mousemove', e => { pos(e); this.mouse.moved = true; this.lastDevice = 'mouse'; });
    canvas.addEventListener('mousedown', e => {
      pos(e); const b = e.button;
      if (b < 3) { this.mouse.down[b] = true; this.mouse.pressed[b] = true; }
      this.any = true; this.lastDevice = 'mouse'; SFX.unlock(); canvas.focus(); e.preventDefault();
    });
    addEventListener('mouseup', e => { const b = e.button; if (b < 3) { this.mouse.down[b] = false; this.mouse.released[b] = true; } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('mouseleave', () => { this.mouse.active = false; });
    // dotyk -> mysz (menu i stocznia)
    const tpos = t => pos({ clientX: t.clientX, clientY: t.clientY });
    canvas.addEventListener('touchstart', e => { const t = e.changedTouches[0]; tpos(t); this.mouse.down[0] = true; this.mouse.pressed[0] = true; this.any = true; this.lastDevice = 'mouse'; SFX.unlock(); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchmove', e => { tpos(e.changedTouches[0]); this.mouse.moved = true; e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', e => { tpos(e.changedTouches[0]); this.mouse.down[0] = false; this.mouse.released[0] = true; e.preventDefault(); }, { passive: false });
  },
  pollPads() {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    let n = 0;
    for (let i = 0; i < pads.length && n < 2; i++) {
      const p = pads[i]; if (!p || !p.connected) continue;
      const slot = n++;
      const b = k => !!(p.buttons[k] && p.buttons[k].pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const st = {
        A: b(0), B: b(1), X: b(2), Y: b(3), LB: b(4) || b(6), RB: b(5) || b(7), BACK: b(8), START: b(9),
        UP: b(12) || ay < -0.55, DOWN: b(13) || ay > 0.55, LEFT: b(14) || ax < -0.55, RIGHT: b(15) || ax > 0.55
      };
      for (const k of GP_KEYS) {
        const code = 'GP' + slot + '_' + k, was = this.down.has(code);
        if (st[k] && !was) { this.down.add(code); this.pressed.add(code); this.lastDevice = 'pad'; this.any = true; SFX.unlock(); }
        else if (!st[k] && was) { this.down.delete(code); this.released.add(code); }
      }
    }
  },
  isDown(c) { return this.down.has(c); },
  hit(c) { return this.pressed.has(c); },
  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.mouse.pressed = [false, false, false]; this.mouse.released = [false, false, false];
    this.mouse.wheel = 0; this.mouse.moved = false; this.any = false;
  },
  inRect(x, y, w, h) { const m = this.mouse; return m.active && m.x >= x && m.x < x + w && m.y >= y && m.y < y + h; }
};

// Przypisania klawiszy (KeyboardEvent.code + wirtualne kody padów)
const BIND = {
  p1: {
    up: ['KeyW', 'GP0_UP'], down: ['KeyS', 'GP0_DOWN'], left: ['KeyA', 'GP0_LEFT'], right: ['KeyD', 'GP0_RIGHT'],
    fireL: ['KeyQ', 'GP0_LB', 'GP0_X'], fireR: ['KeyE', 'GP0_RB', 'GP0_B'], special: ['Space', 'KeyF', 'GP0_A', 'GP0_Y'],
    place: ['Space', 'GP0_A'], remove: ['KeyX', 'KeyC', 'GP0_B'], prev: ['KeyQ', 'GP0_LB'], next: ['KeyE', 'GP0_RB'],
    mirror: ['KeyR', 'GP0_Y'], ready: ['KeyG', 'Tab', 'GP0_START'], undo: ['KeyZ', 'GP0_X']
  },
  p2: {
    up: ['ArrowUp', 'KeyI', 'GP1_UP'], down: ['ArrowDown', 'KeyK', 'GP1_DOWN'], left: ['ArrowLeft', 'KeyJ', 'GP1_LEFT'], right: ['ArrowRight', 'KeyL', 'GP1_RIGHT'],
    fireL: ['Comma', 'KeyU', 'GP1_LB', 'GP1_X'], fireR: ['Period', 'KeyO', 'GP1_RB', 'GP1_B'], special: ['Slash', 'KeyP', 'GP1_A', 'GP1_Y'],
    place: ['Slash', 'KeyP', 'GP1_A'], remove: ['KeyM', 'Semicolon', 'GP1_B'], prev: ['Comma', 'KeyU', 'GP1_LB'], next: ['Period', 'KeyO', 'GP1_RB'],
    mirror: ['KeyN', 'GP1_Y'], ready: ['Enter', 'GP1_START'], undo: ['Backspace', 'GP1_X']
  },
  // gracz solo (przeciw botowi): łączy oba zestawy
  solo: {
    up: ['KeyW', 'ArrowUp', 'GP0_UP'], down: ['KeyS', 'ArrowDown', 'GP0_DOWN'], left: ['KeyA', 'ArrowLeft', 'GP0_LEFT'], right: ['KeyD', 'ArrowRight', 'GP0_RIGHT'],
    fireL: ['KeyQ', 'Comma', 'GP0_LB', 'GP0_X'], fireR: ['KeyE', 'Period', 'GP0_RB', 'GP0_B'], special: ['Space', 'KeyF', 'Slash', 'GP0_A', 'GP0_Y'],
    place: ['Space', 'GP0_A'], remove: ['KeyX', 'KeyC', 'Delete', 'GP0_B'], prev: ['KeyQ', 'GP0_LB'], next: ['KeyE', 'GP0_RB'],
    mirror: ['KeyR', 'KeyM', 'GP0_Y'], ready: ['Enter', 'GP0_START'], undo: ['KeyZ', 'GP0_X']
  },
  menu: {
    up: ['ArrowUp', 'KeyW', 'GP0_UP', 'GP1_UP'], down: ['ArrowDown', 'KeyS', 'GP0_DOWN', 'GP1_DOWN'],
    left: ['ArrowLeft', 'KeyA', 'GP0_LEFT', 'GP1_LEFT'], right: ['ArrowRight', 'KeyD', 'GP0_RIGHT', 'GP1_RIGHT'],
    ok: ['Enter', 'Space', 'GP0_A', 'GP1_A', 'GP0_START', 'GP1_START'], back: ['Escape', 'Backspace', 'GP0_B', 'GP1_B']
  }
};
const Act = {
  down(b, a) { const ks = b[a]; if (!ks) return false; for (const k of ks) if (Input.down.has(k)) return true; return false; },
  hit(b, a) { const ks = b[a]; if (!ks) return false; for (const k of ks) if (Input.pressed.has(k)) return true; return false; }
};

// ---------- wstrząsy ----------
const Shake = {
  trauma: 0, x: 0, y: 0,
  add(a) { if (!Settings.shake) return; this.trauma = Math.min(1, this.trauma + a); },
  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const s = this.trauma * this.trauma * 7;
    this.x = Math.round((Math.random() * 2 - 1) * s);
    this.y = Math.round((Math.random() * 2 - 1) * s);
  }
};

// ---------- menedżer scen + przejścia ----------
const Game = {
  scene: null, pending: null, t: 0,
  trans: { state: 'none', p: 0, dur: 0.38 },
  go(make) {
    if (this.trans.state === 'out') return;
    this.pending = make; this.trans.state = 'out'; this.trans.p = 0;
    SFX.play('whoosh');
  },
  set(sc) { if (this.scene && this.scene.exit) this.scene.exit(); this.scene = sc; if (sc.enter) sc.enter(); },
  busy() { return this.trans.state === 'out'; },
  update(dt) {
    this.t += dt;
    const tr = this.trans;
    if (tr.state === 'out') {
      tr.p += dt / tr.dur;
      if (tr.p >= 1) { tr.p = 1; const mk = this.pending; this.pending = null; this.set(mk()); tr.state = 'in'; }
      return;
    }
    if (tr.state === 'in') { tr.p -= dt / tr.dur; if (tr.p <= 0) { tr.p = 0; tr.state = 'none'; } }
    if (this.scene) this.scene.update(dt);
  },
  draw(ctx) {
    if (this.scene) this.scene.draw(ctx);
    drawTransition(ctx, this.trans.p, this.trans.state);
  }
};

function drawTransition(ctx, p, state) {
  if (p <= 0) return;
  ctx.fillStyle = PAL.black;
  if (p >= 1) { ctx.fillRect(0, 0, W, H); return; }
  const S = 20;
  ctx.beginPath();
  for (let y = 0; y <= H + S; y += S) {
    for (let x = 0; x <= W + S; x += S) {
      const k = state === 'in' ? 1 - (x / W * 0.55 + y / H * 0.45) : (x / W * 0.55 + y / H * 0.45);
      const l = clamp(p * 1.6 - k * 0.6, 0, 1);
      if (l <= 0) continue;
      const r = l * S * 1.02;
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    }
  }
  ctx.fill();
}
