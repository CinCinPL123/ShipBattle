'use strict';
/* =========================================================
   Symulacja okrętu (serwer / tryb offline):
   fizyka, ostrzał, uszkodzenia, pożary. Bez rysowania -
   efekty idą do świata jako zdarzenia dla klientów.
   ========================================================= */
const DIR_LOCAL = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const NEIGH_BROKEN = [[0, -1, 2], [0, 1, 1], [-1, 0, 8], [1, 0, 4]];
// stan bloku do wysłania: ubytek (0-3) + flagi pożaru + odłamane krawędzie
function blockSig(b) {
  const f = b.hp / b.max, d = !b.alive ? 3 : f >= 0.72 ? 0 : f >= 0.42 ? 1 : 2;
  return d | (b.burn > 0 ? 4 : 0) | (b.burnt ? 8 : 0) | (b.broken << 4);
}
function blockNet(k, b) { return [k, Math.round(clamp(b.hp / b.max, 0, 1) * 255), (b.burn > 0 ? 1 : 0) | (b.burnt ? 2 : 0) | (b.alive ? 0 : 4), b.broken]; }

class SimShip {
  constructor(world, id, design, o) {
    this.world = world; this.id = id;
    this.kind = o.kind || 'player'; this.name = o.name || 'Okręt'; this.col = o.col || 0; this.owner = o.owner || null;
    this.design = Design.clone(design);
    this.x = o.x || 0; this.y = o.y || 0; this.ang = o.ang || 0; this.vx = 0; this.vy = 0; this.w = 0;
    this.throttle = 0; this.turn = 0; this.speed = 0;
    this.alive = true; this.sinking = 0; this.dead = false;
    this.queue = []; this.buff = { powder: 0, wind: 0 };
    this.st = { shots: 0, hits: 0, dmg: 0, kills: 0, rams: 0 };
    this.hitCd = 0; this.ver = 1; this.bd = new Set(); this.safe = false; this.port = -1;
    this.lastHit = null; this.lastHitT = -99; this.combatT = 0; this.swivT = 0; this.ghost = this.kind === 'ghost';
    this.comX = SW / 2; this.comY = SH / 2; this.blocks = []; this.grid = new Int16Array(COLS * ROWS).fill(-1);
    this.build(null);
    this.structure(true);
  }
  // bloki z projektu; prev - stare bloki, których stan zachowujemy
  build(prev) {
    const old = new Map();
    if (prev) for (const b of prev) old.set(b.r * COLS + b.c, b);
    this.blocks = [];
    this.design.forEach((x, i) => {
      if (!x) return;
      const c = i % COLS, r = (i / COLS) | 0, o = old.get(i), max = partHp(x.p, x.q);
      const b = { p: x.p, q: x.q, c, r, hp: max, max, alive: true, broken: 0, burnt: false, burn: 0, rl: 0, keg: false, fc: null, sw: 'L', sig: 0 };
      if (o && o.p === x.p && o.q === x.q) { b.hp = o.hp; b.alive = o.alive; b.broken = o.broken; b.burnt = o.burnt; b.burn = o.burn; b.rl = o.rl; }
      else if (WEAPONS[PARTS[x.p].w] && WEAPONS[PARTS[x.p].w].mortar) b.rl = WEAPONS.mortar.reload * 0.5;
      b.sig = blockSig(b);
      this.blocks.push(b);
    });
    this.core = this.blocks.find(b => b.p === 'core');
    this.maxHp = 0;
    for (const b of this.blocks) this.maxHp += b.max;
    this.value = Design.value(this.design);
    this.power = shipPower(this.value);
  }
  applyDesign(design) {
    this.design = Design.clone(design);
    this.build(this.blocks);
    this.structure(false);
    this.ver++; this.bd.clear();
  }
  cell(c, r) { return (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? -1 : this.grid[r * COLS + c]; }
  structure(initial) {
    this.grid.fill(-1);
    this.blocks.forEach((b, k) => { if (b.alive) this.grid[b.r * COLS + b.c] = k; });
    const list = [];
    for (const b of this.blocks) if (b.alive) list.push({ p: b.p, q: b.q, c: b.c, r: b.r, f: b.hp / b.max, hp: b.hp });
    if (!list.length) return;
    this.ph = shipPhys(list);
    const ncx = PAD + this.ph.comC * TILE + 4, ncy = PAD + this.ph.comR * TILE + 4;
    if (!initial) {
      const dx = ncx - this.comX, dy = ncy - this.comY, c = Math.cos(this.ang), s = Math.sin(this.ang);
      this.x += dx * c - dy * s; this.y += dx * s + dy * c;
    }
    this.comX = ncx; this.comY = ncy;
    let R = 0, hw = 0, nest = 0;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      const lx = PAD + b.c * TILE + 4 - ncx, ly = PAD + b.r * TILE + 4 - ncy;
      R = Math.max(R, Math.hypot(lx, ly)); hw = Math.max(hw, Math.abs(lx));
      if (b.p === 'nest') nest++;
    }
    this.radius = R + 7; this.halfW = hw + 4;
    this.rngK = 1 + Math.min(2, nest) * 0.12;
    const open = (c, r) => this.cell(c, r) < 0;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      const Wd = WEAPONS[PARTS[b.p].w];
      b.fc = Wd && Wd.side ? Design.facing(open, b.c, b.r) : null;
      b.keg = false;
      if (Wd) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const k = this.cell(b.c + dc, b.r + dr);
        if (k >= 0 && this.blocks[k].p === 'keg') b.keg = true;
      }
    }
  }
  touch(k) { const b = this.blocks[k], s = blockSig(b); if (s !== b.sig) { b.sig = s; this.bd.add(k); } }
  netBlocks() { return this.blocks.map((b, k) => blockNet(k, b)); }
  toWorld(sx, sy) {
    const lx = sx - this.comX, ly = sy - this.comY, c = Math.cos(this.ang), s = Math.sin(this.ang);
    return [this.x + lx * c - ly * s, this.y + lx * s + ly * c];
  }
  toLocal(wx, wy) {
    const dx = wx - this.x, dy = wy - this.y, c = Math.cos(this.ang), s = Math.sin(this.ang);
    return [dx * c + dy * s + this.comX, -dx * s + dy * c + this.comY];
  }
  blockAt(wx, wy) {
    const q = this.toLocal(wx, wy);
    return this.cell(Math.floor((q[0] - PAD) / TILE), Math.floor((q[1] - PAD) / TILE));
  }
  blockWorld(b) { return this.toWorld(PAD + b.c * TILE + 4, PAD + b.r * TILE + 4); }
  dirWorld(dx, dy) { const c = Math.cos(this.ang), s = Math.sin(this.ang); return [dx * c - dy * s, dx * s + dy * c]; }
  integrity() { let h = 0; for (const b of this.blocks) if (b.alive) h += Math.max(0, b.hp); return h / this.maxHp; }
  coreFrac() { return this.core.alive ? Math.max(0, this.core.hp) / this.core.max : 0; }
  hasRam() { return this.blocks.some(b => b.alive && b.p === 'ram'); }
  reloadTime(b) { return WEAPONS[PARTS[b.p].w].reload * QUAL[b.q].rl; }
  // paski przeładowania do HUD: 0-10 dla każdego działa
  armament() {
    const r = { L: [], R: [], S: [] };
    for (const b of this.blocks) {
      if (!b.alive) continue;
      const Wd = WEAPONS[PARTS[b.p].w]; if (!Wd || Wd.auto) continue;
      const f = Math.round(clamp(1 - b.rl / this.reloadTime(b), 0, 1) * 10);
      if (Wd.mortar) { r.S.push(f); continue; }
      if (b.fc === 'L' || b.fc === 'LR') r.L.push(f);
      if (b.fc === 'R' || b.fc === 'LR') r.R.push(f);
      if (b.fc === 'U' || b.fc === 'D') r.S.push(f);
    }
    return r;
  }
  // ---------- ruch ----------
  update(dt) {
    const Wd = this.world;
    if (this.hitCd > 0) this.hitCd -= dt;
    if (this.combatT > 0) this.combatT -= dt;
    if (this.buff.powder > 0) this.buff.powder -= dt;
    if (this.buff.wind > 0) this.buff.wind -= dt;
    if (!this.alive) {
      this.sinking += dt / SINK_TIME;
      const k = Math.exp(-1.2 * dt); this.vx *= k; this.vy *= k; this.w *= Math.exp(-0.5 * dt);
      this.ang = angNorm(this.ang + (this.w + 0.12) * dt); this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.sinking >= 1) this.dead = true;
      return;
    }
    const fx = Math.sin(this.ang), fy = -Math.cos(this.ang), rx = Math.cos(this.ang), ry = Math.sin(this.ang);
    let u = this.vx * fx + this.vy * fy, s = this.vx * rx + this.vy * ry;
    const wind = Wd.windAt(this.x, this.y);
    const wf = windFactor(this.ang, wind.ang) * wind.str;
    const vmax = physSpeed(this.ph, wf) * (this.buff.wind > 0 ? 1.45 : 1);
    const acc = physAccel(this.ph, wf) * (this.buff.wind > 0 ? 1.4 : 1);
    const target = this.throttle >= 0 ? vmax * this.throttle / 3 : -vmax * 0.32;
    u += (target - u) * (1 - Math.exp(-acc * dt));
    s *= Math.exp(-3.2 * dt);
    const tw = this.turn * physTurn(this.ph, Math.abs(u) / 40);
    this.w += (tw - this.w) * (1 - Math.exp(-5 * dt));
    this.ang = angNorm(this.ang + this.w * dt);
    this.vx = fx * u + rx * s; this.vy = fy * u + ry * s;
    this.x += this.vx * dt; this.y += this.vy * dt;
    // miękkie granice świata
    const m = 60;
    if (this.x < m) this.vx += (m - this.x) * 3 * dt;
    if (this.x > WORLD - m) this.vx -= (this.x - WORLD + m) * 3 * dt;
    if (this.y < m) this.vy += (m - this.y) * 3 * dt;
    if (this.y > WORLD - m) this.vy -= (this.y - WORLD + m) * 3 * dt;
    this.x = clamp(this.x, 4, WORLD - 4); this.y = clamp(this.y, 4, WORLD - 4);
    this.speed = u;
    // przeładowanie
    const rate = this.buff.powder > 0 ? 2 : 1;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      if (b.rl > 0) b.rl = Math.max(0, b.rl - dt * rate * (b.keg ? 1 / 0.6 : 1));
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i]; q.t -= dt;
      if (q.t <= 0) { this.queue.splice(i, 1); this.shoot(q.b, q.side); }
    }
    this.swivT -= dt;
    if (this.swivT <= 0) { this.swivT = 0.2; this.autoSwivels(); }
    this.updateFire(dt);
  }
  // ---------- ostrzał ----------
  matches(b, side) {
    const Wd = WEAPONS[PARTS[b.p].w];
    if (!Wd || Wd.auto) return false;
    if (Wd.mortar) return side === 'S';
    if (!b.fc) return false;
    if (side === 'L') return b.fc === 'L' || b.fc === 'LR';
    if (side === 'R') return b.fc === 'R' || b.fc === 'LR';
    return b.fc === 'U' || b.fc === 'D';
  }
  loadedCount(side) { let n = 0, t = 0; for (const b of this.blocks) if (b.alive && this.matches(b, side)) { t++; if (b.rl <= 0) n++; } return [n, t]; }
  fire(side) {
    if (!this.alive) return 0;
    if (this.safe) { this.world.notify(this, 'W porcie nie wolno strzelać!'); return 0; }
    const list = this.blocks.filter(b => b.alive && b.rl <= 0 && this.matches(b, side));
    if (!list.length) return 0;
    list.sort((a, b) => a.r - b.r);
    list.forEach((b, i) => {
      b.rl = this.reloadTime(b);
      this.queue.push({ b, side, t: i * 0.075 + rand(0, 0.035) });
    });
    this.combatT = Math.max(this.combatT, 6);
    return list.length;
  }
  shoot(b, side) {
    if (!b.alive || !this.alive || this.safe) return;
    const Wd = WEAPONS[PARTS[b.p].w], Q = QUAL[b.q];
    if (Wd.mortar) { this.world.fireMortar(this, b); return; }
    let dir = b.fc; if (!dir) return;
    if (dir === 'LR') { dir = side === 'R' ? 'R' : 'L'; b.sw = dir; }
    const v = DIR_LOCAL[dir];
    const mp = this.toWorld(PAD + b.c * TILE + 4 + v[0] * 8, PAD + b.r * TILE + 4 + v[1] * 8);
    const d = this.dirWorld(v[0], v[1]);
    this.launch(b, mp, Math.atan2(d[1], d[0]), Wd, Q);
  }
  // wystrzał w kierunku a (radiany, układ ekranu)
  launch(b, mp, a, Wd, Q) {
    const n = Wd.pel || 1, k = this.blocks.indexOf(b), spd = Wd.spd * Q.rng * this.rngK;
    for (let i = 0; i < n; i++) {
      const sp = (Wd.spread ? (n > 1 ? (i / (n - 1) - 0.5) * 2 * Wd.spread : 0) : 0) + rand(-0.045, 0.045) + (n > 1 ? rand(-0.04, 0.04) : 0);
      const ddx = Math.cos(a + sp), ddy = Math.sin(a + sp), sv = spd * (n > 1 ? rand(0.9, 1.05) : 1);
      this.world.spawnBall(this, k, i === 0, mp[0], mp[1], ddx * sv + this.vx * 0.8, ddy * sv + this.vy * 0.8, Wd.vz, Wd, Q);
    }
    this.st.shots++;
    const ca = Math.cos(a), sa = Math.sin(a), kick = Wd.ball === 2 ? 2 : Wd.ball === 5 ? 0.4 : 1.2;
    this.vx -= ca * kick; this.vy -= sa * kick;
  }
  autoSwivels() {
    if (!this.alive || this.safe) return;
    for (const b of this.blocks) {
      if (!b.alive || b.p !== 'swivel' || b.rl > 0) continue;
      const Wd = WEAPONS.swivel, Q = QUAL[b.q];
      const p = this.blockWorld(b), range = Wd.range * Q.rng * this.rngK;
      const tg = this.world.autoTarget(this, p[0], p[1], range);
      if (!tg) continue;
      const d = Math.hypot(tg.x - p[0], tg.y - p[1]), tt = d / (Wd.spd * Q.rng);
      const ax = tg.x + tg.vx * tt - this.vx * tt * 0.8, ay = tg.y + tg.vy * tt - this.vy * tt * 0.8;
      b.rl = this.reloadTime(b);
      this.launch(b, p, Math.atan2(ay - p[1], ax - p[0]), Wd, Q);
      this.combatT = Math.max(this.combatT, 4);
    }
  }
  // ---------- uszkodzenia ----------
  ignite(b, src) {
    if (b.burn > 0 || !b.alive || PARTS[b.p].mat !== 'wood') return;
    b.burn = 5; b.burnSrc = src; b.burnt = true;
    this.touch(this.blocks.indexOf(b));
    const w = this.blockWorld(b);
    this.world.ev('ig', w[0], w[1], this.id);
  }
  damageBlock(k, dmg, src, o) {
    const b = this.blocks[k];
    if (!b || !b.alive || !this.alive || this.safe) return 0;
    o = o || {};
    const before = b.hp;
    b.hp -= dmg;
    if (src && src !== this) {
      src.st.dmg += Math.min(dmg, Math.max(0, before));
      this.lastHit = src; this.lastHitT = this.world.T; src.combatT = Math.max(src.combatT, 10);
    }
    this.combatT = Math.max(this.combatT, 10);
    if (b.hp <= 0) { const left = -b.hp; this.destroyBlock(k, src); return left; }
    const P = PARTS[b.p];
    let fc = o.fireChance === undefined ? 0.12 : o.fireChance;
    if (P.fireRes) fc *= 1 - P.fireRes;
    if (P.mat === 'wood' && chance(fc)) this.ignite(b, src);
    this.touch(k);
    return 0;
  }
  killer(src) { return src && src !== this ? src : (this.lastHit && this.world.T - this.lastHitT < 25 ? this.lastHit : null); }
  destroyBlock(k, src) {
    const b = this.blocks[k];
    if (!b.alive) return;
    b.alive = false; b.hp = 0; b.burn = 0;
    const w = this.blockWorld(b);
    this.world.ev('kb', w[0], w[1], this.id, k, PARTS[b.p].mat === 'metal' ? 1 : 0);
    if (src && src !== this) src.st.kills++;
    for (const n of NEIGH_BROKEN) {
      const j = this.cell(b.c + n[0], b.r + n[1]);
      if (j >= 0) { this.blocks[j].broken |= n[2]; this.touch(j); }
    }
    this.grid[b.r * COLS + b.c] = -1;
    this.touch(k);
    if (b.p === 'keg') { const self = this, s = src; this.world.later(0.12, () => self.world.kegBlast(self, w[0], w[1], s)); }
    if (b.p === 'core') { this.structure(false); this.sink(this.killer(src)); return; }
    this.checkDetach();
    this.structure(false);
  }
  checkDetach() {
    if (!this.core.alive) return;
    const seen = new Set(), start = this.blocks.indexOf(this.core), q = [start];
    seen.add(start);
    while (q.length) {
      const b = this.blocks[q.pop()];
      for (const d of DIRS4) {
        const j = this.cell(b.c + d[0], b.r + d[1]);
        if (j >= 0 && this.blocks[j].alive && !seen.has(j)) { seen.add(j); q.push(j); }
      }
    }
    const lost = [];
    this.blocks.forEach((b, k) => { if (b.alive && !seen.has(k)) lost.push(k); });
    if (!lost.length) return;
    this.world.ev('wr', this.x, this.y, this.id, lost);
    for (const k of lost) { const b = this.blocks[k]; b.alive = false; b.burn = 0; this.grid[b.r * COLS + b.c] = -1; }
    for (const k of lost) {
      const b = this.blocks[k];
      for (const n of NEIGH_BROKEN) {
        const j = this.cell(b.c + n[0], b.r + n[1]);
        if (j >= 0 && this.blocks[j].alive) { this.blocks[j].broken |= n[2]; this.touch(j); }
      }
      this.touch(k);
    }
  }
  sink(src) {
    if (!this.alive) return;
    this.alive = false; this.sinking = 0; this.queue.length = 0;
    this.world.ev('sk', this.x, this.y, this.id);
    this.world.onSink(this, src);
  }
  // naprawa wszystkiego (port)
  repairAll() {
    for (let k = 0; k < this.blocks.length; k++) {
      const b = this.blocks[k];
      b.alive = true; b.hp = b.max; b.burn = 0; b.burnt = false; b.broken = 0;
      this.touch(k);
    }
    this.structure(false);
  }
  heal(frac) {
    for (let k = 0; k < this.blocks.length; k++) {
      const b = this.blocks[k];
      if (!b.alive) continue;
      if (b.burn > 0) b.burn = 0;
      if (b.hp < b.max) b.hp = Math.min(b.max, b.hp + b.max * frac);
      if (b.hp >= b.max && b.burnt) b.burnt = false;
      this.touch(k);
    }
  }
  updateFire(dt) {
    for (let k = 0; k < this.blocks.length; k++) {
      const b = this.blocks[k];
      if (!b.alive) continue;
      if (b.p === 'carp') {
        const rate = 3 * QUAL[b.q].pow;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const j = this.cell(b.c + dc, b.r + dr); if (j < 0) continue;
          const n = this.blocks[j];
          if (n.burn > 0.6) n.burn = 0.6;
          if (n.hp < n.max) { n.hp = Math.min(n.max, n.hp + rate * dt); this.touch(j); }
        }
      }
      if (b.burn > 0) {
        b.burn -= dt; b.hp -= 4 * dt;
        if (chance(dt * 0.18)) {
          const d = pick(DIRS4), j = this.cell(b.c + d[0], b.r + d[1]);
          if (j >= 0) this.ignite(this.blocks[j], b.burnSrc);
        }
        if (b.hp <= 0) { this.destroyBlock(k, b.burnSrc); if (!this.alive) return; }
        else this.touch(k);
      }
    }
  }
}
