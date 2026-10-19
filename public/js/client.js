'use strict';
/* =========================================================
   Świat po stronie klienta: migawki z serwera, interpolacja,
   kolejka zdarzeń (efekty dokładnie w chwili, gdy zaszły),
   kamera i rysowanie morza
   ========================================================= */
const INTERP = 0.12;          // opóźnienie interpolacji (s)
const DAY_LEN = 900;          // pełna doba w sekundach
let GLOW = null, CLOUDS = [];
function buildWorldArt() {
  const [g, x] = makeCanvas(64, 64);
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,150,1)'); gr.addColorStop(0.35, 'rgba(255,170,80,0.45)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  GLOW = g;
  for (let k = 0; k < 3; k++) {
    const w = 150 + k * 30, h = 80 + k * 10;
    const [c, cx] = makeCanvas(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i - w / 2) / (w / 2), dy = (j - h / 2) / (h / 2);
      const v = 1 - Math.sqrt(dx * dx + dy * dy) + (Noise.fbm(i * 0.04 + k * 50, j * 0.05, 3) - 0.5) * 0.9;
      if (v > 0.25 || (v > 0.1 && bayer(i, j) < 0.5)) { cx.fillStyle = 'rgba(8,18,48,0.2)'; cx.fillRect(i, j, 1, 1); }
    }
    CLOUDS.push(c);
  }
}
// pozycja interpolowana z dwóch ostatnich próbek
class Mover {
  constructor(T, x, y) { this.T0 = T; this.T1 = T; this.x0 = x; this.y0 = y; this.x1 = x; this.y1 = y; this.x = x; this.y = y; this.goneT = null; }
  push(T, x, y) { if (T <= this.T1) return; this.T0 = this.T1; this.x0 = this.x1; this.y0 = this.y1; this.T1 = T; this.x1 = x; this.y1 = y; this.goneT = null; }
  at(rt) {
    const k = this.T1 > this.T0 ? clamp((rt - this.T0) / (this.T1 - this.T0), 0, 1.5) : 1;
    this.x = lerp(this.x0, this.x1, k); this.y = lerp(this.y0, this.y1, k);
  }
}
const BALL_SND = ['cannon', 'cannon', 'cannon', 'fireball', 'cannon', 'swivel'];

class ClientWorld {
  constructor(w) {
    this.myId = w.id; this.offline = !!w.offline; this.seed = w.seed;
    this.islands = w.isl.map(a => { const isl = makeIsland(a[4], a[2], a[3]); isl.x = a[0]; isl.y = a[1]; isl.cr = a[2] * 0.92; isl.port = a[5]; return isl; });
    this.ports = w.ports.map(a => ({ name: a[0], x: a[1], y: a[2], r: a[3], safe: a[4], zone: a[5] }));
    this.ships = new Map(); this.barrels = new Map(); this.loot = new Map(); this.balls = new Map();
    this.shells = []; this.wrecks = []; this.bolts = []; this.flashes = [];
    this.fx = new Particles(); this.evq = []; this.off = null; this.T = w.T || 0;
    this.me = { shipId: w.you.ship, gold: w.you.gold, name: w.you.name, shipName: w.you.shipName, col: w.you.col, pw: 0, port: -1, rl: [[], [], []], n: 0, yard: 0, cmb: 0, thr: 0 };
    this.map = { pl: [], top: 0, ev: [], n: 1 };
    this.hof = w.hof || [];
    this.wind = { ang: 0, str: 1 };
    this.t = 0; this.lightning = 0; this.hitT = 0;
    const p0 = this.ports[0] || { x: WCX, y: WCY };
    this.cam = { x: p0.x, y: p0.y, lx: 0, ly: 0 };
    this.birds = []; for (let i = 0; i < 5; i++) this.birds.push(this.newBird(true));
    this.clouds = []; for (let i = 0; i < 4; i++) this.clouds.push({ img: CLOUDS[i % CLOUDS.length], x: rand(0, 2000), y: rand(0, 2000) });
    this.rain = []; for (let i = 0; i < 150; i++) this.rain.push({ x: rand(0, W), y: rand(0, H), s: rand(0.7, 1.3) });
    this.miniBase = this.buildMiniBase(104);
  }
  get myShip() { return this.ships.get(this.me.shipId) || null; }
  serverNow() { return this.off === null ? this.T : performance.now() / 1000 + this.off; }
  renderT() { return this.serverNow() - INTERP; }
  // ---------- wiadomości ----------
  onMsg(m) {
    switch (m.t) {
      case 's': this.onSnap(m); break;
      case 'ship': {
        const v = this.ships.get(m.id);
        if (v) { v.layout(m); v.goneT = null; } else this.ships.set(m.id, new ShipView(this, m));
        break;
      }
      case 'map': this.map = m; break;
      case 'life': this.me.shipId = m.ship; this.me.gold = m.gold; break;
    }
  }
  onSnap(m) {
    const s = m.T - performance.now() / 1000;
    if (this.off === null || s > this.off) this.off = s; else this.off += (s - this.off) * 0.02;
    this.T = m.T;
    for (const a of m.sh) { const v = this.ships.get(a[0]); if (v) v.push(m.T, a); }
    if (m.gone) for (const id of m.gone) { const v = this.ships.get(id); if (v) v.goneT = m.T; }
    const seenB = new Set();
    for (const a of m.bar) {
      seenB.add(a[0]);
      let b = this.barrels.get(a[0]);
      if (!b) { b = new Mover(m.T, a[1], a[2]); b.id = a[0]; b.ph = rand(0, TAU); this.barrels.set(a[0], b); }
      else b.push(m.T, a[1], a[2]);
      b.type = a[3]; b.hp = a[4] / 255;
    }
    for (const b of this.barrels.values()) if (!seenB.has(b.id) && b.goneT === null) b.goneT = m.T;
    const seenL = new Set();
    for (const a of m.lo) {
      seenL.add(a[0]);
      let l = this.loot.get(a[0]);
      if (!l) { l = new Mover(m.T, a[1], a[2]); l.id = a[0]; l.ph = rand(0, TAU); l.born = m.T; this.loot.set(a[0], l); }
      else l.push(m.T, a[1], a[2]);
      l.kind = a[3]; l.q = a[4];
    }
    for (const l of this.loot.values()) if (!seenL.has(l.id) && l.goneT === null) l.goneT = m.T;
    for (const e of m.ev) this.evq.push(e);
    if (m.bd) this.evq.push(['_bd', m.T, 0, 0, m.bd]);
    if (m.me) {
      const me = this.me;
      if (m.me.g > me.gold && me.gold !== undefined) me.goldFlash = 0.6;
      me.gold = m.me.g; me.pw = m.me.pw; me.port = m.me.port; me.rl = m.me.rl; me.n = m.me.n; me.yard = m.me.yard; me.cmb = m.me.cmb; me.thr = m.me.thr;
    }
    if (m.wd) { this.wind.ang = m.wd[0]; this.wind.str = m.wd[1]; }
  }
  // ---------- zdarzenia ----------
  near(x, y, r) { return Math.abs(x - this.cam.x) < W / 2 + r && Math.abs(y - this.cam.y) < H / 2 + r; }
  shakeAt(x, y, amt, r) { const d = Math.hypot(x - this.cam.x, y - this.cam.y); Shake.add(amt * clamp(1 - d / (r || 300), 0, 1)); }
  flash(x, y, r) { if (this.near(x, y, r)) this.flashes.push({ x, y, r, t: 0, life: 0.14 }); }
  // zaległe zdarzenia (np. po powrocie do karty w tle) zmieniają tylko stan, bez efektów i dźwięków
  applyStale(e) {
    switch (e[0]) {
      case 'bx': this.balls.delete(e[4]); break;
      case 'kb': { const v = this.ships.get(e[4]); if (v && v.blocks[e[5]]) { v.blocks[e[5]].alive = false; v.structDirty = true; } break; }
      case 'wr': { const v = this.ships.get(e[4]); if (v) { for (const k of e[5]) if (v.blocks[k]) v.blocks[k].alive = false; v.structDirty = true; } break; }
      case 'sk': { const v = this.ships.get(e[4]); if (v) v.sink(e[1], true); break; }
      case 'bb': this.barrels.delete(e[4]); break;
      case 'pk': this.loot.delete(e[4]); break;
      case '_bd': this.apply(e); break;
    }
  }
  apply(e, rt) {
    const x = e[2], y = e[3], P = this.fx, so = { x, y }, mine = this.myShip;
    switch (e[0]) {
      case 'b': {
        const id = e[4], vx = e[5], vy = e[6], vz = e[7], kind = e[8], sid = e[9], k = e[10];
        this.balls.set(id, { x0: x, y0: y, vx, vy, vz, kind, T0: e[1], x, y, z: BALL_Z0 });
        const v = this.ships.get(sid), b = v && v.blocks[k];
        if (b) {
          b.recoil = 1;
          const l = v.toLocalDir(vx - v.vx * 0.8, vy - v.vy * 0.8);
          if (b.p === 'swivel') b.aim = Math.atan2(l[1], l[0]);
          else if (b.fc === 'LR') b.sw = l[0] > 0 ? 'R' : 'L';
        }
        if (e[11]) {
          const l = Math.hypot(vx, vy) || 1;
          if (this.near(x, y, 60)) FX.muzzle(P, x, y, vx / l, vy / l);
          SFX.play(BALL_SND[kind] || 'cannon', { x, y, vol: kind === 1 ? 1 : 0.85 });
          if (kind === 4) SFX.play('chain', so);
          this.flash(x, y, kind === 5 ? 14 : 26);
          if (mine && sid === mine.id) Shake.add(kind === 5 ? 0.01 : 0.05);
          this.scareBirds(x, y);
        }
        break;
      }
      case 'bx': {
        const how = e[5];
        this.balls.delete(e[4]);
        if (!this.near(x, y, 80)) break;
        if (how === 0) { FX.splash(P, x, y, false); SFX.play('splash', so); }
        else if (how === 1 || how === 2) {
          FX.splinters(P, x, y, how === 2 ? 3 : 8, 0, 0, 45);
          if (how === 2) { FX.metal(P, x, y, 6); SFX.play('metal', so); } else SFX.play('hit', so);
          FX.smoke(P, x, y, 2, { alpha: 0.5 });
          if (mine && mine.alive && Math.hypot(mine.x - x, mine.y - y) < mine.radius + 4) { Shake.add(0.12); this.hitT = 0.25; }
        } else if (how === 3) {
          FX.smoke(P, x, y, 4, { alpha: 0.6 });
          for (let q = 0; q < 6; q++) P.add({ type: 'px', x, y, z: 1, vx: rand(-30, 30), vy: rand(-30, 30), vz: rand(20, 50), g: 150, life: 1, cols: [pick([PAL.sand, PAL.grey])], onLand: 'die' });
          SFX.play('hit', so);
        } else if (how === 4) { FX.splinters(P, x, y, 5, 0, 0, 35); SFX.play('hit', so); }
        else if (how === 5) { P.add({ type: 'ring', x, y, r: 2, grow: 8, life: 0.4, cols: ['#d8fff0', PAL.cyan] }); SFX.play('shield', so); }
        break;
      }
      case 'bh': if (this.near(x, y, 60)) { FX.splinters(P, x, y, 6, 0, 0, 45); SFX.play(e[4] ? 'metal' : 'hit', so); } break;
      case 'm': {
        this.shells.push({ x0: x, y0: y, x1: e[4], y1: e[5], T0: e[1], Tf: e[6], H: e[7], wh: false, x, y, z: 0 });
        const v = this.ships.get(e[8]), b = v && v.blocks[e[9]];
        if (b) b.recoil = 1;
        if (this.near(x, y, 60)) { FX.smoke(P, x, y, 6, { big: true, alpha: 0.7 }); FX.muzzle(P, x, y, 0, 0); }
        SFX.play('mortar', so); this.flash(x, y, 30);
        if (mine && v === mine) Shake.add(0.12);
        break;
      }
      case 'mx': {
        if (e[4]) { if (this.near(x, y, 80)) FX.explosion(P, x, y, 1.1); SFX.play('explosion', so); this.shakeAt(x, y, 0.35); this.flash(x, y, 50); }
        else { if (this.near(x, y, 80)) { FX.splash(P, x, y, true); FX.smoke(P, x, y, 3, { alpha: 0.5 }); } SFX.play('splash', { x, y, big: true }); this.shakeAt(x, y, 0.1); }
        this.scareBirds(x, y);
        break;
      }
      case 'kb': {
        const v = this.ships.get(e[4]), metal = e[6];
        if (this.near(x, y, 80)) {
          if (metal) FX.metal(P, x, y, 12);
          FX.splinters(P, x, y, metal ? 6 : 16, 0, 0, 55);
          FX.smoke(P, x, y, 3, { alpha: 0.6 });
        }
        if (metal) SFX.play('metal', so);
        SFX.play('breakWood', so);
        if (v && v.blocks[e[5]]) { v.blocks[e[5]].alive = false; v.structDirty = true; }
        break;
      }
      case 'ig': SFX.play('ignite', so); break;
      case 'wr': {
        const v = this.ships.get(e[4]);
        if (v) {
          const list = e[5].map(k => v.blocks[k]).filter(b => b && b.alive);
          if (list.length) this.wrecks.push(new Wreck(v, list));
          for (const b of list) b.alive = false;
          v.structDirty = true;
        }
        SFX.play('breakWood', so); this.shakeAt(x, y, 0.2);
        break;
      }
      case 'sk': {
        const v = this.ships.get(e[4]);
        if (v) v.sink(e[1]);
        this.shakeAt(x, y, v && v === mine ? 0.9 : 0.6, 400);
        break;
      }
      case 'ex': {
        const sz = e[4] / 10;
        if (this.near(x, y, 80)) FX.explosion(P, x, y, sz);
        SFX.play('explosion', so); this.shakeAt(x, y, 0.55); this.flash(x, y, 60);
        this.scareBirds(x, y);
        break;
      }
      case 'rm':
        if (this.near(x, y, 60)) FX.splinters(P, x, y, 20, 0, 0, 75);
        SFX.play('ram', so);
        if (mine && Math.hypot(mine.x - x, mine.y - y) < mine.radius + 20) Shake.add(e[5]);
        if (e[4]) FX.text(P, x, y - 12, 'TARAN!', PAL.gold, 1);
        break;
      case 'sc': SFX.play('scrape', so); if (e[4] && this.near(x, y, 40)) FX.splinters(P, x, y, 8, 0, 0, 40); break;
      case 'bb': {
        const b = this.barrels.get(e[4]); if (b) this.barrels.delete(e[4]);
        if (this.near(x, y, 60)) {
          FX.splinters(P, x, y, e[5] === 2 ? 14 : 10, 0, 0, 50); FX.splash(P, x, y, false);
          if (e[5] === 2) for (let i = 0; i < 8; i++) FX.sparkle(P, x + rand(-8, 8), y + rand(-8, 8), PAL.gold);
        }
        SFX.play('barrel', so);
        break;
      }
      case 'pk': {
        this.loot.delete(e[4]);
        const own = mine && e[5] === mine.id;
        for (let i = 0; i < (own ? 10 : 5); i++) FX.sparkle(P, x + rand(-8, 8), y + rand(-8, 8), e[6] ? PAL.cyan : PAL.yellow);
        if (own) SFX.play(e[6] ? 'item' : 'coins');
        break;
      }
      case 'sp': if (this.near(x, y, 30)) FX.splash(P, x, y, false); break;
      case 'gh': {
        if (this.near(x, y, 120)) for (let i = 0; i < 30; i++) { const a = rand(0, TAU), d = rand(0, 40); P.add({ type: 'disc', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: 2, grow: 8, vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, life: rand(1.5, 3), cols: ['#d8fff0', PAL.ghost, PAL.ghostD], alpha: 0.4 }); }
        SFX.play('ghost', so);
        break;
      }
      case 'lt': {
        this.bolts.push({ x, y, t: 0, seed: randi(1, 1e6) });
        if (this.near(x, y, 200)) this.lightning = 1;
        SFX.play('lightning', so);
        if (e[4] && this.near(x, y, 60)) FX.explosion(P, x, y, 0.6);
        break;
      }
      case '_bd':
        for (const row of e[4]) { const v = this.ships.get(row[0]); if (v) for (let i = 1; i < row.length; i++) v.applyBlock(row[i]); }
        break;
    }
  }
  newBird(init) {
    const ax = this.cam.x + rand(-W / 2, W / 2), ay = this.cam.y + rand(-H / 2, H / 2);
    return { ax, ay, a: rand(0, TAU), rad: rand(20, 50), sp: rand(0.6, 1.1) * (chance(0.5) ? 1 : -1), x: init ? ax : this.cam.x + (chance(0.5) ? -1 : 1) * (W / 2 + 20), y: ay, scared: 0, ph: rand(0, 10), vx: 0, vy: 0, enter: init ? 0 : 1 };
  }
  scareBirds(x, y) {
    for (const b of this.birds) if (!b.scared && Math.hypot(b.x - x, b.y - y) < 110) {
      b.scared = 1; const d = Math.hypot(b.x - x, b.y - y) || 1; b.vx = (b.x - x) / d * 90; b.vy = (b.y - y) / d * 90 - 20;
      if (chance(0.3)) SFX.play('gull');
    }
  }
  // ---------- aktualizacja ----------
  update(dt) {
    this.t += dt;
    const rt = this.renderT();
    while (this.evq.length && this.evq[0][1] <= rt) {
      const e = this.evq.shift();
      if (e[1] < rt - 1) this.applyStale(e); else this.apply(e, rt);
    }
    for (const [id, v] of this.ships) {
      if (v.goneT !== null && rt >= v.goneT) { this.ships.delete(id); continue; }
      v.update(dt, rt);
    }
    for (const [id, b] of this.barrels) { if (b.goneT !== null && rt >= b.goneT) this.barrels.delete(id); else b.at(rt); }
    for (const [id, l] of this.loot) { if (l.goneT !== null && rt >= l.goneT) this.loot.delete(id); else l.at(rt); }
    for (const [id, b] of this.balls) {
      const t = rt - b.T0;
      if (t > 4) { this.balls.delete(id); continue; }
      b.x = b.x0 + b.vx * t; b.y = b.y0 + b.vy * t; b.z = BALL_Z0 + b.vz * t - 0.5 * BALL_G * t * t;
      if (b.kind === 3 && b.z > 0 && chance(dt * 40) && this.near(b.x, b.y, 20)) this.fx.add({ type: 'px', x: b.x, y: b.y - b.z, vx: rand(-4, 4), vy: rand(-4, 4), life: rand(0.2, 0.4), cols: FIRE.slice(1), wind: 0.5 });
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i], f = (rt - s.T0) / s.Tf;
      if (f >= 1) { this.shells.splice(i, 1); continue; }
      const k = Math.max(0, f);
      s.x = lerp(s.x0, s.x1, k); s.y = lerp(s.y0, s.y1, k); s.z = 4 * s.H * k * (1 - k);
      if (!s.wh && f > 0.45) { s.wh = true; SFX.play('whistle', { x: s.x1, y: s.y1, dur: s.Tf * 0.55 }); }
      if (chance(dt * 30) && this.near(s.x, s.y, 20)) this.fx.add({ type: 'disc', x: s.x, y: s.y, z: s.z, r: 1, grow: 2, life: 0.5, cols: SMOKE, alpha: 0.4 });
    }
    for (let i = this.wrecks.length - 1; i >= 0; i--) { this.wrecks[i].update(dt, this.fx); if (this.wrecks[i].dead) this.wrecks.splice(i, 1); }
    for (let i = this.bolts.length - 1; i >= 0; i--) { this.bolts[i].t += dt; if (this.bolts[i].t > 0.35) this.bolts.splice(i, 1); }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t > f.life) this.flashes.splice(i, 1); }
    this.lightning = Math.max(0, this.lightning - dt * 4);
    this.hitT = Math.max(0, this.hitT - dt);
    const wd = { x: Math.sin(this.wind.ang) * 6 * this.wind.str, y: -Math.cos(this.wind.ang) * 6 * this.wind.str };
    this.fx.update(dt, wd);
    for (const c of this.clouds) { c.x += wd.x * 1.2 * dt; c.y += wd.y * 1.2 * dt; }
    this.updateBirds(dt);
    this.updateCamera(dt);
    for (const r of this.rain) { r.x += (wd.x * 8 + 40) * dt * r.s; r.y += 260 * dt * r.s; if (r.y > H) { r.y -= H + 10; r.x = rand(-40, W); } if (r.x > W) r.x -= W; }
    SFX.listen(this.cam.x, this.cam.y);
  }
  updateCamera(dt) {
    const s = this.myShip;
    if (s && !s.dead) {
      const tx = s.x + s.vx * 0.45, ty = s.y + s.vy * 0.45;
      if (!this.camInit) { this.cam.x = tx; this.cam.y = ty; this.camInit = true; }
      const k = 1 - Math.exp(-4 * dt);
      this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    }
    this.cam.x = clamp(this.cam.x, W / 2 - 80, WORLD - W / 2 + 80); this.cam.y = clamp(this.cam.y, H / 2 - 80, WORLD - H / 2 + 80);
  }
  updateBirds(dt) {
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.ph += dt * (b.scared ? 16 : 7);
      if (b.scared) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (!this.near(b.x, b.y, 40) && chance(dt * 0.3)) this.birds[i] = this.newBird(false);
      } else {
        b.a += b.sp * dt * 0.8;
        const tx = b.ax + Math.cos(b.a) * b.rad, ty = b.ay + Math.sin(b.a) * b.rad * 0.6, k = Math.min(1, dt * (b.enter ? 0.7 : 3));
        b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
        if (b.enter && Math.hypot(tx - b.x, ty - b.y) < 12) b.enter = 0;
        if (!this.near(b.ax, b.ay, 300)) this.birds[i] = this.newBird(false);
      }
    }
  }
  // ---------- pora dnia i pogoda ----------
  dayTint() {
    const ph = ((this.renderT() / DAY_LEN) % 1 + 1) % 1;
    // dzień 0-0.48, zachód 0.48-0.58, noc 0.58-0.88, świt 0.88-1
    const K = [[0, '#ffffff'], [0.44, '#ffffff'], [0.52, '#ffd2ae'], [0.6, '#8e9ad4'], [0.86, '#8e9ad4'], [0.94, '#f0d0dc'], [1, '#ffffff']];
    for (let i = 0; i < K.length - 1; i++) if (ph >= K[i][0] && ph <= K[i + 1][0]) {
      const f = (ph - K[i][0]) / (K[i + 1][0] - K[i][0]);
      return { col: mixHex(K[i][1], K[i + 1][1], ease.inOut(f)), night: clamp(1 - Math.abs(ph - 0.73) / 0.17, 0, 1), dusk: clamp(1 - Math.abs(ph - 0.52) / 0.06, 0, 1) };
    }
    return { col: '#ffffff', night: 0, dusk: 0 };
  }
  stormAt(x, y) {
    let k = 0;
    for (const e of this.map.ev) if (e[0] === 'storm' && e[3] > 0) k = Math.max(k, clamp((e[3] + 120 - Math.hypot(x - e[1], y - e[2])) / 160, 0, 1));
    return k;
  }
  // ---------- rysowanie ----------
  draw(ctx) {
    const cam = this.cam, vx = Math.round(cam.x - W / 2), vy = Math.round(cam.y - H / 2), t = this.t;
    Water.draw(ctx, vx - Shake.x, vy - Shake.y, t);
    const dz = Math.hypot(cam.x - WCX, cam.y - WCY), deep = clamp((dz - 950) / 1700, 0, 1);
    if (deep > 0) { ctx.fillStyle = 'rgba(6,8,26,' + (deep * 0.3).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.save();
    ctx.translate(-vx + Shake.x, -vy + Shake.y);
    this.drawWorldEdge(ctx, vx, vy);
    for (const pt of this.ports) if (this.near(pt.x, pt.y, pt.safe)) this.drawSafeRing(ctx, pt);
    for (const isl of this.islands) {
      if (!this.near(isl.x, isl.y, isl.S / 2)) continue;
      ctx.drawImage(isl.canvas, Math.round(isl.x - isl.S / 2), Math.round(isl.y - isl.S / 2)); drawIslandFoam(ctx, isl, t);
    }
    this.fx.draw(ctx, 'under');
    for (const w of this.wrecks) w.draw(ctx);
    this.drawBarrels(ctx); this.drawLoot(ctx);
    for (const sh of this.shells) {
      const k = 0.5 + 0.5 * Math.sin(t * 14);
      ctx.globalAlpha = 0.5 + 0.4 * k; drawRing(ctx, sh.x1, sh.y1, 5 + Math.round(k * 2), PAL.red2); ctx.globalAlpha = 1;
      ctx.fillStyle = PAL.red2; ctx.fillRect(Math.round(sh.x1), Math.round(sh.y1), 1, 1);
    }
    const vis = [];
    for (const s of this.ships.values()) if (s.inView(cam, 30)) vis.push(s);
    for (const s of vis) s.drawShadow(ctx);
    for (const s of vis) s.draw(ctx);
    for (const s of vis) s.drawSailLayer(ctx, true);
    for (const s of vis) s.drawSailLayer(ctx, false);
    this.drawBalls(ctx);
    this.fx.draw(ctx, 'over');
    this.drawBirds(ctx);
    for (const b of this.bolts) this.drawBolt(ctx, b);
    for (const s of vis) this.drawTag(ctx, s);
    for (const pt of this.ports) if (this.near(pt.x, pt.y, 60)) Font.draw(ctx, pt.name, pt.x, pt.y - pt.r - 18, { align: 'center', color: PAL.sand, outline: PAL.black });
    for (const c of this.clouds) {
      const cw = c.img.width, ch = c.img.height, X = ((c.x - vx) % (W + cw) + (W + cw)) % (W + cw) - cw, Y = ((c.y - vy) % (H + ch) + (H + ch)) % (H + ch) - ch;
      ctx.drawImage(c.img, Math.round(X + vx), Math.round(Y + vy));
    }
    ctx.restore();
    this.drawWeather(ctx, vx, vy);
  }
  drawWorldEdge(ctx, vx, vy) {
    ctx.fillStyle = 'rgba(10,8,22,0.55)';
    if (vx < 0) ctx.fillRect(vx, vy, -vx, H);
    if (vy < 0) ctx.fillRect(vx, vy, W, -vy);
    if (vx + W > WORLD) ctx.fillRect(WORLD, vy, vx + W - WORLD, H);
    if (vy + H > WORLD) ctx.fillRect(vx, WORLD, W, vy + H - WORLD);
  }
  drawSafeRing(ctx, pt) {
    const n = Math.round(pt.safe * TAU / 10);
    ctx.fillStyle = 'rgba(234,247,255,0.6)';
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + this.t * 0.02;
      ctx.fillRect(Math.round(pt.x + Math.cos(a) * pt.safe), Math.round(pt.y + Math.sin(a) * pt.safe), 2, 2);
    }
  }
  drawBarrels(ctx) {
    for (const b of this.barrels.values()) {
      if (!this.near(b.x, b.y, 10)) continue;
      const bob = Math.round(Math.sin(this.t * 2.5 + b.ph) * 1.2), icon = b.type === 2 ? Icons.chest : b.type === 1 ? Icons.powder : Icons.barrel;
      ctx.globalAlpha = 0.45; drawRing(ctx, b.x, b.y + 1, 5 + Math.round(Math.sin(this.t * 2 + b.ph)), '#b8e4ff'); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(8,16,40,0.35)'; ctx.fillRect(Math.round(b.x - 3), Math.round(b.y + 3), icon.width, 2);
      ctx.drawImage(icon, Math.round(b.x - icon.width / 2), Math.round(b.y - icon.height / 2 + bob));
      if (b.hp < 1) { ctx.fillStyle = PAL.black; ctx.fillRect(Math.round(b.x - 4), Math.round(b.y - 7 + bob), 8, 2); ctx.fillStyle = PAL.gold; ctx.fillRect(Math.round(b.x - 4), Math.round(b.y - 7 + bob), Math.round(8 * b.hp), 1); }
    }
  }
  drawLoot(ctx) {
    for (const l of this.loot.values()) {
      if (!this.near(l.x, l.y, 10)) continue;
      const bob = Math.round(Math.sin(this.t * 3 + l.ph) * 1.2), X = Math.round(l.x), Y = Math.round(l.y);
      const col = l.kind ? QUAL[l.q].col : PAL.yellow;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 + 0.12 * Math.sin(this.t * 5 + l.ph);
      ctx.drawImage(GLOW, X - 10, Y - 10, 20, 20);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (l.kind) {
        ctx.drawImage(Icons.chest, X - 4, Y - 3 + bob);
        ctx.fillStyle = col; ctx.fillRect(X - 3, Y - 4 + bob, 6, 1);
        if (l.q >= 3 && chance(0.15)) FX.sparkle(this.fx, X + rand(-6, 6), Y + rand(-6, 6), col);
      } else {
        const ic = l.q ? Icons.goldBig : Icons.gold;
        ctx.drawImage(ic, X - (ic.width >> 1), Y - (ic.height >> 1) + bob);
      }
    }
  }
  drawBalls(ctx) {
    for (const b of this.balls.values()) {
      if (b.z < -0.5 || !this.near(b.x, b.y, 10)) continue;
      const X = Math.round(b.x), Y = Math.round(b.y), Z = Math.round(b.y - b.z);
      ctx.fillStyle = 'rgba(8,16,40,0.4)'; ctx.fillRect(X - 1, Y, 2, 2);
      if (b.kind === 3) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(GLOW, X - 6, Z - 6, 12, 12); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.fillStyle = PAL.orange; ctx.fillRect(X - 1, Z - 1, 3, 3); ctx.fillStyle = PAL.yellow; ctx.fillRect(X, Z - 1, 1, 1);
      } else if (b.kind === 4) {
        const a = this.t * 18 + b.T0 * 7, dx = Math.round(Math.cos(a) * 3), dy = Math.round(Math.sin(a) * 3);
        pline(ctx, X - dx, Z - dy, X + dx, Z + dy, PAL.grey);
        ctx.fillStyle = PAL.black; ctx.fillRect(X - dx - 1, Z - dy - 1, 2, 2); ctx.fillRect(X + dx - 1, Z + dy - 1, 2, 2);
      } else if (b.kind === 2 || b.kind === 5) {
        ctx.fillStyle = PAL.black; ctx.fillRect(X - 1, Z - 1, 2, 2);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(Math.round(X - b.vx * 0.02), Math.round(Z - b.vy * 0.02), 2, 2);
        ctx.fillStyle = PAL.black; ctx.fillRect(X - 1, Z - 1, 3, 3);
        ctx.fillStyle = PAL.steel; ctx.fillRect(X - 1, Z - 1, 1, 1);
      }
    }
    for (const sh of this.shells) {
      if (!this.near(sh.x, sh.y, 20)) continue;
      const r = Math.round(1.5 + sh.z / 20);
      ctx.globalAlpha = 0.35; drawDisc(ctx, sh.x, sh.y, Math.max(1, 3 - Math.round(sh.z / 25)), PAL.black); ctx.globalAlpha = 1;
      drawDisc(ctx, sh.x, sh.y - sh.z, r, PAL.black);
      ctx.fillStyle = PAL.grey; ctx.fillRect(Math.round(sh.x) - r + 1, Math.round(sh.y - sh.z) - r + 1, 1, 1);
    }
  }
  drawBirds(ctx) {
    for (const b of this.birds) {
      const up = Math.sin(b.ph) > 0, X = Math.round(b.x), Y = Math.round(b.y);
      ctx.fillStyle = 'rgba(8,16,40,0.22)'; ctx.fillRect(X + 14, Y + 18, 4, 1);
      ctx.fillStyle = PAL.white;
      const o = up ? -1 : 1;
      ctx.fillRect(X - 2, Y + o, 1, 1); ctx.fillRect(X - 1, Y, 3, 1); ctx.fillRect(X + 2, Y + o, 1, 1);
      ctx.fillStyle = PAL.grey; ctx.fillRect(X, Y + 1, 1, 1);
    }
  }
  drawBolt(ctx, b) {
    const rng = mulberry32(b.seed), a = 1 - b.t / 0.35;
    let x = b.x, y = b.y - 140;
    ctx.globalAlpha = a;
    while (y < b.y) {
      const nx = x + (rng() - 0.5) * 14, ny = Math.min(b.y, y + 6 + rng() * 10);
      pline(ctx, x, y, nx, ny, '#eaf2ff', 2); pline(ctx, x, y, nx, ny, PAL.white);
      x = nx; y = ny;
    }
    ctx.globalAlpha = 1;
  }
  drawTag(ctx, s) {
    if (s.dead || !s.alive) return;
    const mine = s.id === this.me.shipId, X = Math.round(s.x), y = Math.round(s.y - s.radius - 8);
    let name = s.name, col = s.col.l;
    if (s.kind === 'pirate') { name = 'PIRACI'; col = PAL.salmon; }
    else if (s.kind === 'ghost') { name = 'STATEK WIDMO'; col = PAL.ghost; }
    else if (s.kind === 'merchant') { name = 'ZŁOTY GALEON'; col = PAL.yellow; }
    if (!mine) {
      const tier = powerTier(s.pw), pw = '★' + s.pw, wN = Font.measure(name), wP = Font.measure(pw), tot = wN + wP + 5;
      Font.draw(ctx, name, X - tot / 2, y - 9, { color: col, outline: PAL.black });
      Font.draw(ctx, pw, X - tot / 2 + wN + 5, y - 9, { color: POWER_TIERS[tier].col, outline: PAL.black });
      if (s.fl & 32) ctx.drawImage(Icons.crown, X - 3, y - 18);
      if (s.integ < 0.999 || s.kind !== 'player') {
        ctx.fillStyle = PAL.black; ctx.fillRect(X - 13, y + 1, 26, 3);
        ctx.fillStyle = s.integ > 0.6 ? PAL.green : s.integ > 0.3 ? PAL.gold : PAL.red2; ctx.fillRect(X - 12, y + 2, Math.round(24 * s.integ), 1);
      }
    } else if (s.fl & 32) ctx.drawImage(Icons.crown, X - 3, y - 6);
  }
  drawWeather(ctx, vx, vy) {
    const day = this.dayTint(), storm = this.stormAt(this.cam.x, this.cam.y);
    if (day.col !== '#ffffff') { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = day.col; ctx.fillRect(0, 0, W, H); }
    if (storm > 0) { ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = storm * (1 - day.night * 0.5); ctx.fillStyle = '#9aa6c0'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = 'lighter';
    const k = 0.3 + day.night * 0.7 + storm * 0.3;
    for (const f of this.flashes) { ctx.globalAlpha = (1 - f.t / f.life) * k; ctx.drawImage(GLOW, f.x - f.r - vx, f.y - f.r - vy, f.r * 2, f.r * 2); }
    if (day.night > 0.05 || storm > 0.3) {
      const g = Math.max(day.night, storm * 0.6);
      for (const s of this.ships.values()) {
        if (s.dead || !s.inView(this.cam, 40)) continue;
        if (s.core && s.core.alive) { const p = s.blockWorld(s.core); ctx.globalAlpha = (0.32 + 0.05 * Math.sin(this.t * 7)) * g * (1 - s.sinking); ctx.drawImage(GLOW, p[0] - 30 - vx, p[1] - 30 - vy, 60, 60); }
        for (const b of s.blocks) if (b.alive && b.burn) { const p = s.blockWorld(b); ctx.globalAlpha = 0.4 * g; ctx.drawImage(GLOW, p[0] - 14 - vx, p[1] - 14 - vy, 28, 28); }
      }
      for (const pt of this.ports) if (this.near(pt.x, pt.y, 80)) { ctx.globalAlpha = 0.45 * g; ctx.drawImage(GLOW, pt.x - 50 - vx, pt.y - 50 - vy, 100, 100); }
      for (const b of this.balls.values()) if (b.kind === 3 && this.near(b.x, b.y, 10)) { ctx.globalAlpha = 0.5 * g; ctx.drawImage(GLOW, b.x - 10 - vx, b.y - b.z - 10 - vy, 20, 20); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (storm > 0.05) {
      ctx.fillStyle = 'rgba(205,222,255,' + (0.38 * storm).toFixed(2) + ')';
      const n = Math.round(this.rain.length * storm);
      for (let i = 0; i < n; i++) { const r = this.rain[i], X = Math.round(r.x), Y = Math.round(r.y); ctx.fillRect(X, Y, 1, 2); ctx.fillRect(X + 1, Y + 2, 1, 2); }
    }
    if (this.lightning > 0) { ctx.fillStyle = 'rgba(235,240,255,' + (this.lightning * 0.5).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(UI.vignette, 0, 0);
  }
  // ---------- mapa ----------
  buildMiniBase(S) {
    const [c, x] = makeCanvas(S, S), k = S / WORLD;
    x.fillStyle = '#0b2c56'; x.fillRect(0, 0, S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const d = Math.hypot(i + 0.5 - S / 2, j + 0.5 - S / 2) / k, z = d < ZONES[0].r ? 0 : d < ZONES[1].r ? 1 : 2;
      x.fillStyle = ['#17609f', '#124e89', '#0b2c56'][z];
      if (z < 2 || bayer(i, j) < 0.7) x.fillRect(i, j, 1, 1);
    }
    for (const isl of this.islands) {
      const r = Math.max(1, Math.round(isl.r * k)), X = Math.round(isl.x * k), Y = Math.round(isl.y * k);
      x.fillStyle = isl.kind === 'rock' ? PAL.grey : isl.kind === 'port' ? PAL.sand : PAL.green;
      if (r <= 1) x.fillRect(X, Y, 1, 1); else x.drawImage(Disc.get(r - 1, x.fillStyle), X - r + 1, Y - r + 1);
    }
    return c;
  }
}
