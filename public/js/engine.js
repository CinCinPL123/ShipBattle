'use strict';
/* =========================================================
   DRZAZGI — silnik klienta: ekran, wejście, ustawienia, sceny
   ========================================================= */
const W = 640, H = 360;

// ---------- zapis ----------
const Store = {
  get(k, def) { try { const v = localStorage.getItem('drzazgi.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('drzazgi.' + k, JSON.stringify(v)); } catch (e) { /* brak dostępu */ } }
};
const Settings = Object.assign({ music: 0.5, sfx: 0.8, shake: true, crt: false, name: '', ship: '', col: -1 }, Store.get('settings', {}));
function saveSettings() { Store.set('settings', Settings); }

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
  // pole tekstowe przechwytujące klawiaturę: { value, max, onEnter, onEsc }
  field: null,
  init(canvas) {
    // ukryte pole: przyjmuje tekst z każdej klawiatury (też IME i ekranowej)
    const ta = document.createElement('input');
    ta.type = 'text'; ta.autocomplete = 'off'; ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;left:-200px;top:0;width:10px;height:10px;opacity:0;';
    document.body.appendChild(ta);
    ta.addEventListener('input', () => {
      const f = this.field, v = ta.value; ta.value = '';
      if (!f) return;
      for (const ch of v) {
        if (f.value.length >= f.max) break;
        if (ch === ' ') { if (f.value && !f.value.endsWith(' ')) f.value += ' '; }
        else f.value += cleanName(ch, 1);
      }
    });
    this.ta = ta; this.canvas = canvas;
    addEventListener('keydown', e => {
      SFX.unlock();
      if (this.field) { this.typeKey(e); return; }
      if (BLOCK_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) { this.down.add(e.code); this.pressed.add(e.code); this.any = true; }
      this.lastDevice = 'key';
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
      this.any = true; this.lastDevice = 'mouse'; SFX.unlock(); if (!this.field) canvas.focus(); e.preventDefault();
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
  // otwiera / zamyka wpisywanie tekstu
  setField(f) {
    this.field = f || null;
    this.down.clear();
    try { if (f) { this.ta.value = ''; this.ta.focus({ preventScroll: true }); } else if (document.activeElement === this.ta) this.canvas.focus(); } catch (e) { /* bez fokusu */ }
  },
  typeKey(e) {
    const f = this.field;
    if (e.key === 'Enter') { e.preventDefault(); const fn = f.onEnter; if (fn) fn(f.value); return; }
    if (e.key === 'Escape') { e.preventDefault(); const fn = f.onEsc; if (fn) fn(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); f.value = f.value.slice(0, -1); return; }
    if (e.key === 'Tab') { e.preventDefault(); return; }
    // zwykłe znaki trafią przez zdarzenie input ukrytego pola
    if (document.activeElement !== this.ta) { this.ta.focus({ preventScroll: true }); }
  },
  pollPads() {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]; if (!p || !p.connected) continue;
      const b = k => !!(p.buttons[k] && p.buttons[k].pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const st = {
        A: b(0), B: b(1), X: b(2), Y: b(3), LB: b(4) || b(6), RB: b(5) || b(7), BACK: b(8), START: b(9),
        UP: b(12) || ay < -0.55, DOWN: b(13) || ay > 0.55, LEFT: b(14) || ax < -0.55, RIGHT: b(15) || ax > 0.55
      };
      for (const k of GP_KEYS) {
        const code = 'GP_' + k, was = this.down.has(code);
        if (st[k] && !was) { this.down.add(code); this.pressed.add(code); this.lastDevice = 'pad'; this.any = true; SFX.unlock(); }
        else if (!st[k] && was) { this.down.delete(code); this.released.add(code); }
      }
      break;
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

// Przypisania klawiszy (KeyboardEvent.code + wirtualne kody pada)
const BIND = {
  play: {
    up: ['KeyW', 'ArrowUp', 'GP_UP'], down: ['KeyS', 'ArrowDown', 'GP_DOWN'], left: ['KeyA', 'ArrowLeft', 'GP_LEFT'], right: ['KeyD', 'ArrowRight', 'GP_RIGHT'],
    fireL: ['KeyQ', 'Comma', 'GP_LB', 'GP_X'], fireR: ['KeyE', 'Period', 'GP_RB', 'GP_B'], special: ['Space', 'KeyF', 'Slash', 'GP_A'],
    yard: ['KeyB', 'GP_Y'], map: ['KeyM', 'GP_BACK'], board: ['Tab'], chat: ['Enter', 'KeyT']
  },
  menu: {
    up: ['ArrowUp', 'KeyW', 'GP_UP'], down: ['ArrowDown', 'KeyS', 'GP_DOWN'],
    left: ['ArrowLeft', 'KeyA', 'GP_LEFT'], right: ['ArrowRight', 'KeyD', 'GP_RIGHT'],
    ok: ['Enter', 'Space', 'GP_A', 'GP_START'], back: ['Escape', 'Backspace', 'GP_B']
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
      if (this.scene && this.scene.background) this.scene.background(dt);
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
