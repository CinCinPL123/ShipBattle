'use strict';
/* =========================================================
   Okręt w bitwie: fizyka, ostrzał, uszkodzenia, rysowanie
   ========================================================= */
const DIR_LOCAL = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
class Ship {
  constructor(cells, team, name, world) {
    this.team = team; this.name = name; this.world = world;
    this.blocks = [];
    cells.forEach((p, i) => {
      if (!p) return;
      const P = PARTS[p];
      this.blocks.push({ p, c: i % COLS, r: (i / COLS) | 0, hp: P.hp, max: P.hp, alive: true, broken: 0, burnt: false, burn: 0, flash: 0, rl: 0, recoil: 0, sw: 'L', fc: null, os: null, keg: false });
    });
    this.grid = new Int16Array(COLS * ROWS).fill(-1);
    this.x = 0; this.y = 0; this.ang = 0; this.vx = 0; this.vy = 0; this.w = 0;
    this.throttle = 0; this.turn = 0; this.rudVis = 0; this.sailVis = 0; this.yawVis = 0; this.t = rand(0, 10); this.speed = 0;
    this.alive = true; this.sinking = 0; this.dead = false; this.dirty = false;
    this.queue = []; this.buff = { powder: 0, wind: 0 };
    this.st = { shots: 0, hits: 0, dmg: 0, kills: 0, rams: 0 };
    this.hitCd = 0; this.wakeAcc = 0; this.maxHp = 0; this.comX = SW / 2; this.comY = SH / 2;
    for (const b of this.blocks) this.maxHp += b.max;
    this.core = this.blocks.find(b => b.p === 'core');
    for (const b of this.blocks) if (b.p === 'mortar') b.rl = MORTAR_RELOAD * 0.6;
    this.structure(true);
  }
  cell(c, r) { return (c < 0 || c >= COLS || r < 0 || r >= ROWS) ? -1 : this.grid[r * COLS + c]; }
  structure(initial) {
    this.grid.fill(-1);
    this.blocks.forEach((b, k) => { if (b.alive) this.grid[b.r * COLS + b.c] = k; });
    const list = [];
    for (const b of this.blocks) if (b.alive) list.push({ p: b.p, c: b.c, r: b.r, f: b.hp / b.max, hp: b.hp });
    if (!list.length) return;
    this.ph = shipPhys(list);
    const ncx = PAD + this.ph.comC * TILE + 4, ncy = PAD + this.ph.comR * TILE + 4;
    if (!initial) {
      const dx = ncx - this.comX, dy = ncy - this.comY, c = Math.cos(this.ang), s = Math.sin(this.ang);
      this.x += dx * c - dy * s; this.y += dx * s + dy * c;
    }
    this.comX = ncx; this.comY = ncy;
    let R = 0, minR = 99, maxR = -1, hw = 0;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      const lx = PAD + b.c * TILE + 4 - ncx, ly = PAD + b.r * TILE + 4 - ncy;
      R = Math.max(R, Math.hypot(lx, ly)); minR = Math.min(minR, b.r); maxR = Math.max(maxR, b.r); hw = Math.max(hw, Math.abs(lx));
    }
    this.radius = R + 7; this.halfW = hw + 4;
    this.bowS = [ncx, PAD + minR * TILE]; this.sternS = [ncx, PAD + maxR * TILE + 8];
    this.redraw();
    for (const b of this.blocks) {
      if (!b.alive) continue;
      b.keg = false;
      if (b.p === 'cannon' || b.p === 'mortar') {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const k = this.cell(b.c + dc, b.r + dr);
          if (k >= 0 && this.blocks[k].p === 'keg') b.keg = true;
        }
      }
    }
  }
  redraw() { this.spr = renderShip(this.blocks, this.team); }
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
  armament() {
    const r = { L: [], R: [], S: [] };
    for (const b of this.blocks) {
      if (!b.alive) continue;
      if (b.p === 'cannon' && b.fc) {
        const f = 1 - b.rl / CANNON_RELOAD;
        if (b.fc === 'L' || b.fc === 'LR') r.L.push(f);
        if (b.fc === 'R' || b.fc === 'LR') r.R.push(f);
        if (b.fc === 'U' || b.fc === 'D') r.S.push(f);
      }
      if (b.p === 'mortar') r.S.push(1 - b.rl / MORTAR_RELOAD);
    }
    return r;
  }
  hasRam() { return this.blocks.some(b => b.alive && b.p === 'ram'); }
  // ---------- ruch ----------
  update(dt) {
    const Wd = this.world;
    this.t += dt;
    if (this.hitCd > 0) this.hitCd -= dt;
    if (this.buff.powder > 0) this.buff.powder -= dt;
    if (this.buff.wind > 0) this.buff.wind -= dt;
    if (!this.alive) {
      this.sinking += dt / 3.4;
      const k = Math.exp(-1.2 * dt); this.vx *= k; this.vy *= k; this.w *= Math.exp(-0.5 * dt);
      this.ang += (this.w + 0.12) * dt; this.x += this.vx * dt; this.y += this.vy * dt;
      if (chance(dt * 30)) FX.bubbles(Wd.fx, this.x + rand(-this.halfW, this.halfW), this.y + rand(-this.halfW, this.halfW));
      if (this.sinking >= 1) this.dead = true;
      return;
    }
    const fx = Math.sin(this.ang), fy = -Math.cos(this.ang), rx = Math.cos(this.ang), ry = Math.sin(this.ang);
    let u = this.vx * fx + this.vy * fy, s = this.vx * rx + this.vy * ry;
    const wf = windFactor(this.ang, Wd.wind.ang) * Wd.wind.str;
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
    // miękkie granice areny
    const m = 16;
    if (this.x < ARENA.x0 + m) this.vx += (ARENA.x0 + m - this.x) * 7 * dt;
    if (this.x > ARENA.x1 - m) this.vx -= (this.x - ARENA.x1 + m) * 7 * dt;
    if (this.y < ARENA.y0 + m) this.vy += (ARENA.y0 + m - this.y) * 7 * dt;
    if (this.y > ARENA.y1 - m) this.vy -= (this.y - ARENA.y1 + m) * 7 * dt;
    this.x = clamp(this.x, ARENA.x0 - 6, ARENA.x1 + 6); this.y = clamp(this.y, ARENA.y0 - 6, ARENA.y1 + 6);
    this.speed = u;
    this.rudVis += (this.turn - this.rudVis) * Math.min(1, dt * 6);
    this.sailVis += (Math.max(0, this.throttle) - this.sailVis) * Math.min(1, dt * 3);
    const rel = angDiff(this.ang, Wd.wind.ang);
    this.yawVis += (clamp(rel * 0.3, -0.5, 0.5) - this.yawVis) * Math.min(1, dt * 2);
    // przeładowanie
    const rate = this.buff.powder > 0 ? 2 : 1;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      if (b.rl > 0) b.rl = Math.max(0, b.rl - dt * rate * (b.keg ? 1 / 0.6 : 1));
      if (b.recoil > 0) b.recoil = Math.max(0, b.recoil - dt * 4);
      if (b.flash > 0) b.flash -= dt;
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i]; q.t -= dt;
      if (q.t <= 0) { this.queue.splice(i, 1); this.shoot(q.b, q.side); }
    }
    this.updateFire(dt);
    this.wake(dt, u);
    if (this.dirty) { this.dirty = false; this.redraw(); }
  }
  wake(dt, u) {
    const sp = Math.abs(u); if (sp < 4) return;
    this.wakeAcc += dt * sp * 0.8;
    const P = this.world.fx;
    while (this.wakeAcc > 1) {
      this.wakeAcc -= 1;
      const side = chance(0.5) ? -1 : 1;
      const bw = this.toWorld(this.bowS[0] + side * rand(1, this.halfW * 0.6), this.bowS[1] + rand(3, 10));
      const ov = this.dirWorld(side * rand(10, 18), rand(2, 8));
      FX.foam(P, bw[0], bw[1], ov[0], ov[1], chance(0.25));
      const st = this.toWorld(this.sternS[0] + rand(-3, 3), this.sternS[1] - 1);
      FX.foam(P, st[0], st[1], rand(-3, 3), rand(-3, 3), chance(0.5));
    }
  }
  // ---------- ostrzał ----------
  matches(b, side) {
    if (b.p === 'cannon') {
      if (!b.fc) return false;
      if (side === 'L') return b.fc === 'L' || b.fc === 'LR';
      if (side === 'R') return b.fc === 'R' || b.fc === 'LR';
      return b.fc === 'U' || b.fc === 'D';
    }
    return b.p === 'mortar' && side === 'S';
  }
  loadedCount(side) { let n = 0, t = 0; for (const b of this.blocks) if (b.alive && this.matches(b, side)) { t++; if (b.rl <= 0) n++; } return [n, t]; }
  fire(side) {
    if (!this.alive) return 0;
    const list = this.blocks.filter(b => b.alive && b.rl <= 0 && this.matches(b, side));
    if (!list.length) { if (this.human) SFX.play('empty'); return 0; }
    list.sort((a, b) => a.r - b.r);
    list.forEach((b, i) => {
      b.rl = b.p === 'mortar' ? MORTAR_RELOAD : CANNON_RELOAD;
      this.queue.push({ b, side, t: i * 0.075 + rand(0, 0.035) });
    });
    return list.length;
  }
  shoot(b, side) {
    if (!b.alive || !this.alive) return;
    const Wd = this.world;
    if (b.p === 'mortar') { Wd.fireMortar(this, b); return; }
    let dir = b.fc; if (!dir) return;
    if (dir === 'LR') { dir = side === 'R' ? 'R' : 'L'; b.sw = dir; }
    const v = DIR_LOCAL[dir];
    const mp = this.toWorld(PAD + b.c * TILE + 4 + v[0] * 8, PAD + b.r * TILE + 4 + v[1] * 8);
    const d = this.dirWorld(v[0], v[1]);
    const sp = rand(-0.045, 0.045), cs = Math.cos(sp), sn = Math.sin(sp);
    const ddx = d[0] * cs - d[1] * sn, ddy = d[0] * sn + d[1] * cs;
    Wd.spawnBall(this, mp[0], mp[1], ddx * BALL_SPEED + this.vx * 0.8, ddy * BALL_SPEED + this.vy * 0.8);
    b.recoil = 1; this.st.shots++;
    FX.muzzle(Wd.fx, mp[0], mp[1], ddx, ddy);
    SFX.play('cannon', { x: mp[0], vol: 0.85 });
    Shake.add(0.05);
    this.vx -= ddx * 1.2; this.vy -= ddy * 1.2;
    Wd.flash(mp[0], mp[1], 26);
    Wd.scareBirds(mp[0], mp[1]);
  }
  // ---------- uszkodzenia ----------
  ignite(b, src) {
    if (b.burn > 0 || !b.alive || PARTS[b.p].mat !== 'wood') return;
    b.burn = 5; b.burnSrc = src; if (!b.burnt) { b.burnt = true; this.dirty = true; }
    const w = this.blockWorld(b);
    SFX.play('ignite', { x: w[0] });
  }
  damageBlock(k, dmg, src, o) {
    const b = this.blocks[k];
    if (!b || !b.alive || !this.alive) return 0;
    o = o || {};
    const before = b.hp;
    b.hp -= dmg; b.flash = 0.09;
    if (src && src !== this) src.st.dmg += Math.min(dmg, Math.max(0, before));
    const f0 = before / b.max, f1 = b.hp / b.max;
    if ((f0 >= 0.72 && f1 < 0.72) || (f0 >= 0.42 && f1 < 0.42)) this.dirty = true;
    if (b.hp <= 0) { const left = -b.hp; this.destroyBlock(k, src); return left; }
    if (PARTS[b.p].mat === 'wood' && chance(o.fireChance === undefined ? 0.12 : o.fireChance)) this.ignite(b, src);
    if (b.p === 'core' && src && src !== this) this.world.coreHit(this);
    return 0;
  }
  destroyBlock(k, src) {
    const b = this.blocks[k];
    if (!b.alive) return;
    b.alive = false; b.hp = 0; b.burn = 0;
    const w = this.blockWorld(b), P = this.world.fx, metal = PARTS[b.p].mat === 'metal';
    if (metal) { FX.metal(P, w[0], w[1], 12); SFX.play('metal', { x: w[0] }); }
    FX.splinters(P, w[0], w[1], metal ? 6 : 16, 0, 0, 55);
    FX.smoke(P, w[0], w[1], 3, { alpha: 0.6 });
    SFX.play('breakWood', { x: w[0] });
    if (src && src !== this) src.st.kills++;
    for (const n of [[0, -1, 2], [0, 1, 1], [-1, 0, 8], [1, 0, 4]]) {
      const j = this.cell(b.c + n[0], b.r + n[1]);
      if (j >= 0) this.blocks[j].broken |= n[2];
    }
    this.grid[b.r * COLS + b.c] = -1;
    if (b.p === 'keg') { const self = this; this.world.later(0.12, () => self.world.kegBlast(self, w[0], w[1], src)); }
    if (b.p === 'core') { this.structure(false); this.sink(src); return; }
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
    this.blocks.forEach((b, k) => { if (b.alive && !seen.has(k)) lost.push(b); });
    if (!lost.length) return;
    this.world.addWreck(this, lost);
    for (const b of lost) { b.alive = false; this.grid[b.r * COLS + b.c] = -1; }
    for (const b of lost) for (const n of [[0, -1, 2], [0, 1, 1], [-1, 0, 8], [1, 0, 4]]) {
      const j = this.cell(b.c + n[0], b.r + n[1]);
      if (j >= 0 && this.blocks[j].alive) this.blocks[j].broken |= n[2];
    }
    SFX.play('breakWood', { x: this.x });
    Shake.add(0.2);
  }
  sink(src) {
    if (!this.alive) return;
    this.alive = false; this.sinking = 0; this.queue.length = 0;
    const P = this.world.fx;
    FX.explosion(P, this.x, this.y, 1.6);
    for (const b of this.blocks) if (b.alive) { const w = this.blockWorld(b); if (chance(0.5)) FX.splinters(P, w[0], w[1], 4, 0, 0, 40); }
    Shake.add(0.85);
    SFX.play('explosion', { x: this.x }); SFX.play('sink', { x: this.x });
    this.sinkSpr = tintSprite(this.spr.img, '#0b2c56', 0.8);
    this.world.onSink(this, src);
  }
  updateFire(dt) {
    const P = this.world.fx;
    for (let k = 0; k < this.blocks.length; k++) {
      const b = this.blocks[k];
      if (!b.alive) continue;
      if (b.p === 'carp') {
        let healed = false;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const j = this.cell(b.c + dc, b.r + dr); if (j < 0) continue;
          const n = this.blocks[j];
          if (n.burn > 0.6) n.burn = 0.6;
          if (n.hp < n.max) { n.hp = Math.min(n.max, n.hp + 3 * dt); healed = true; }
        }
        if (healed && chance(dt * 4)) { const w = this.blockWorld(b); FX.sparkle(P, w[0] + rand(-8, 8), w[1] + rand(-8, 8), PAL.green); }
      }
      if (b.burn > 0) {
        b.burn -= dt; b.hp -= 4 * dt;
        if (chance(dt * 16)) { const w = this.blockWorld(b); FX.fire(P, w[0], w[1]); }
        if (chance(dt * 1.5)) { const w = this.blockWorld(b); SFX.play('crackle', { x: w[0] }); }
        if (chance(dt * 0.18)) {
          const d = pick(DIRS4), j = this.cell(b.c + d[0], b.r + d[1]);
          if (j >= 0) this.ignite(this.blocks[j], b.burnSrc);
        }
        if (b.hp <= 0) this.destroyBlock(k, b.burnSrc);
      }
    }
  }
  // ---------- rysowanie ----------
  drawShadow(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.globalAlpha = 0.3 * (1 - this.sinking);
    ctx.translate(Math.round(this.x) + 3, Math.round(this.y) + 4); ctx.rotate(this.ang);
    ctx.drawImage(this.spr.sil, -this.comX, -this.comY);
    ctx.restore();
  }
  draw(ctx) {
    if (this.dead) return;
    const s = this.alive ? 0 : this.sinking;
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.ang);
    if (s) { const k = 1 - s * 0.14; ctx.scale(k, k); }
    ctx.translate(-this.comX, -this.comY);
    ctx.globalAlpha = (0.5 + 0.25 * Math.sin(this.t * 3)) * (1 - s);
    ctx.drawImage(this.spr.foam, 0, 0);
    ctx.globalAlpha = 1 - s * 0.85;
    ctx.drawImage(this.spr.img, 0, 0);
    if (s && this.sinkSpr) { ctx.globalAlpha = Math.min(1, s * 1.6) * (1 - s * 0.6); ctx.drawImage(this.sinkSpr, 0, 0); }
    ctx.globalAlpha = 1 - s;
    drawShipDyn(ctx, this.blocks, { t: this.t, row: this.alive ? clamp(Math.abs(this.speed) / 40 + Math.abs(this.w) * 0.6, 0, 1) : 0, rudder: this.rudVis });
    for (const b of this.blocks) if (b.alive && b.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(PAD + b.c * TILE, PAD + b.r * TILE, TILE, TILE); }
    ctx.restore();
  }
  drawSailLayer(ctx, shadow) {
    if (this.dead || (!this.alive && this.sinking > 0.3)) return;
    const lvl = Math.round(this.sailVis);
    ctx.save();
    if (shadow) { ctx.globalAlpha = 0.22; ctx.translate(Math.round(this.x) + 7, Math.round(this.y) + 9); }
    else { ctx.globalAlpha = 1 - this.sinking * 2; ctx.translate(this.x, this.y); }
    ctx.rotate(this.ang); ctx.translate(-this.comX, -this.comY);
    drawSails(ctx, this.blocks, { team: this.team, sail: lvl, yaw: this.yawVis, shadow });
    if (!shadow) {
      const fb = this.blocks.find(b => b.alive && b.p === 'mast') || (this.core.alive ? this.core : null);
      if (fb) drawFlag(ctx, PAD + fb.c * TILE + 4, PAD + fb.r * TILE + (fb.p === 'mast' ? 4 : 2), angDiff(this.ang, this.world.wind.ang), this.team, this.t);
    }
    ctx.restore();
  }
}

// odłamany fragment okrętu - dryfuje i tonie
class Wreck {
  constructor(ship, blocks) {
    this.blocks = blocks.map(b => Object.assign({}, b, { alive: true, flash: 0, recoil: 0 }));
    this.team = ship.team;
    this.spr = renderShip(this.blocks, ship.team);
    this.dark = tintSprite(this.spr.img, '#0b2c56', 0.8);
    let mx = 0, my = 0;
    for (const b of this.blocks) { mx += b.c; my += b.r; }
    mx /= this.blocks.length; my /= this.blocks.length;
    this.cx = PAD + mx * TILE + 4; this.cy = PAD + my * TILE + 4;
    const w = ship.toWorld(this.cx, this.cy);
    this.x = w[0]; this.y = w[1]; this.ang = ship.ang;
    const away = [this.x - ship.x, this.y - ship.y], l = Math.hypot(away[0], away[1]) || 1;
    this.vx = ship.vx * 0.6 + away[0] / l * rand(8, 16); this.vy = ship.vy * 0.6 + away[1] / l * rand(8, 16);
    this.w = rand(-0.8, 0.8); this.t = 0; this.life = rand(3.5, 5); this.dead = false;
  }
  update(dt, P) {
    this.t += dt;
    const k = Math.exp(-0.8 * dt); this.vx *= k; this.vy *= k; this.w *= Math.exp(-0.4 * dt);
    this.x += this.vx * dt; this.y += this.vy * dt; this.ang += this.w * dt;
    if (chance(dt * 8)) FX.bubbles(P, this.x, this.y);
    if (this.t > this.life) this.dead = true;
  }
  draw(ctx) {
    const f = this.t / this.life;
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.ang);
    const sc = 1 - f * 0.25; ctx.scale(sc, sc);
    ctx.translate(-this.cx, -this.cy);
    ctx.globalAlpha = (1 - f) * 0.9; ctx.drawImage(this.spr.img, 0, 0);
    ctx.globalAlpha = Math.min(1, f * 1.8) * (1 - f); ctx.drawImage(this.dark, 0, 0);
    ctx.restore();
  }
}
