'use strict';
/* =========================================================
   Okręt po stronie klienta: interpolacja pozycji z migawek,
   stan bloków, efekty (kilwater, pożary) i rysowanie
   ========================================================= */
class ShipView {
  constructor(cw, m) {
    this.cw = cw; this.id = m.id; this.buf = [];
    this.x = 0; this.y = 0; this.ang = 0; this.vx = 0; this.vy = 0; this.w = 0; this.thr = 0; this.turn = 0;
    this.integ = 1; this.coreF = 1; this.fl = 1; this.alive = true; this.sinkT = null; this.sinking = 0; this.dead = false;
    this.t = rand(0, 10); this.sailVis = 1; this.yawVis = 0; this.rudVis = 0; this.wakeAcc = 0; this.goneT = null; this.seen = false; this.relics = new Set(); this.skin = '';
    this.layout(m);
  }
  layout(m) {
    this.ver = m.ver; this.name = m.n; this.kind = m.k; this.colIdx = m.c; this.col = SHIP_COLORS[m.c] || SHIP_COLORS[0]; this.pw = m.pw; this.own = m.own;
    const design = Design.decode(m.d), old = this.blocks;
    this.blocks = [];
    design.forEach((x, i) => {
      if (!x) return;
      const max = cellHp(x), c = i % COLS, r = (i / COLS) | 0;
      const prev = old && old.find(b => b.c === c && b.r === r && b.p === x.p);
      this.blocks.push({ p: x.p, q: x.q, h: baseOf(x), c, r, hp: max, max, alive: true, broken: 0, burnt: false, burn: 0, flash: 0, recoil: 0, sw: prev ? prev.sw : 'L', fc: null, os: null, aim: prev ? prev.aim : undefined });
    });
    for (const e of m.b) this.applyBlock(e);
    this.core = this.blocks.find(b => b.p === 'core');
    this.structure();
    this.dirty = false; this.structDirty = false;
  }
  applyBlock(e) {
    const b = this.blocks[e[0]]; if (!b) return;
    const alive = !(e[2] & 4);
    const fr0 = b.hp / b.max;
    b.hp = e[1] / 255 * b.max; b.burn = e[2] & 1; b.burnt = !!(e[2] & 2); b.broken = e[3] | 0;
    if (alive !== b.alive) { b.alive = alive; this.structDirty = true; }
    else this.dirty = true;
    if (b.hp < fr0 * b.max - 0.5) b.flash = 0.09;
  }
  structure() {
    const list = [];
    for (const b of this.blocks) if (b.alive) list.push({ p: b.p, q: b.q, h: b.h, c: b.c, r: b.r });
    if (!list.length) { this.redraw(); return; }
    const ph = shipPhys(list);
    this.comX = PAD + ph.comC * TILE + 4; this.comY = PAD + ph.comR * TILE + 4;
    let R = 0, minR = 99, maxR = -1, hw = 0;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      const lx = PAD + b.c * TILE + 4 - this.comX, ly = PAD + b.r * TILE + 4 - this.comY;
      R = Math.max(R, Math.hypot(lx, ly)); minR = Math.min(minR, b.r); maxR = Math.max(maxR, b.r); hw = Math.max(hw, Math.abs(lx));
    }
    this.radius = R + 7; this.halfW = hw + 4;
    this.bowS = [this.comX, PAD + minR * TILE]; this.sternS = [this.comX, PAD + maxR * TILE + 8];
    this.relics = relicsOf(this.blocks); this.skin = sailSkin(this.relics);
    this.redraw();
  }
  redraw() { this.spr = renderShip(this.blocks, this.col); }
  push(T, a) {
    const s = { T, x: a[1], y: a[2], ang: a[3], vx: a[4], vy: a[5], w: a[6], thr: a[7], turn: a[8], integ: a[9] / 255, core: a[10] / 255, fl: a[11], sink: a[12] / 255 };
    const B = this.buf;
    if (B.length && T <= B[B.length - 1].T) return;
    B.push(s);
    if (B.length > 24) B.shift();
    if (!this.seen) { this.seen = true; Object.assign(this, { x: s.x, y: s.y, ang: s.ang }); }
  }
  sample(rt) {
    const B = this.buf; if (!B.length) return;
    let a = B[0], b = null;
    for (let i = B.length - 1; i >= 0; i--) if (B[i].T <= rt) { a = B[i]; b = B[i + 1] || null; break; }
    if (b) {
      const k = clamp((rt - a.T) / (b.T - a.T), 0, 1);
      this.x = lerp(a.x, b.x, k); this.y = lerp(a.y, b.y, k); this.ang = lerpAng(a.ang, b.ang, k);
    } else {
      const e = clamp(rt - a.T, 0, 0.3);
      this.x = a.x + a.vx * e; this.y = a.y + a.vy * e; this.ang = a.ang + a.w * e;
    }
    this.vx = a.vx; this.vy = a.vy; this.w = a.w; this.thr = a.thr; this.turn = a.turn;
    this.integ = a.integ; this.coreF = a.core; this.fl = a.fl;
    if (!(a.fl & 1) && this.alive) this.sink(a.T - a.sink * SINK_TIME, true);
  }
  sink(T, quiet) {
    if (!this.alive) return;
    this.alive = false; this.sinkT = T;
    this.sinkSpr = tintSprite(this.spr.img, '#0b2c56', 0.8);
    if (quiet) return;
    const P = this.cw.fx;
    FX.explosion(P, this.x, this.y, 1.6);
    for (const b of this.blocks) if (b.alive) { const w = this.blockWorld(b); if (chance(0.5)) FX.splinters(P, w[0], w[1], 4, 0, 0, 40); }
    SFX.play('explosion', { x: this.x, y: this.y }); SFX.play('sink', { x: this.x, y: this.y });
  }
  toWorld(sx, sy) {
    const lx = sx - this.comX, ly = sy - this.comY, c = Math.cos(this.ang), s = Math.sin(this.ang);
    return [this.x + lx * c - ly * s, this.y + lx * s + ly * c];
  }
  blockWorld(b) { return this.toWorld(PAD + b.c * TILE + 4, PAD + b.r * TILE + 4); }
  toLocalDir(dx, dy) { const c = Math.cos(this.ang), s = Math.sin(this.ang); return [dx * c + dy * s, -dx * s + dy * c]; }
  update(dt, rt) {
    this.t += dt;
    this.sample(rt);
    if (this.structDirty) { this.structDirty = false; this.dirty = false; this.structure(); }
    else if (this.dirty) { this.dirty = false; this.redraw(); }
    if (!this.alive) {
      this.sinking = clamp((rt - this.sinkT) / SINK_TIME, 0, 1);
      if (chance(dt * 30) && this.sinking < 1) FX.bubbles(this.cw.fx, this.x + rand(-this.halfW, this.halfW), this.y + rand(-this.halfW, this.halfW));
      if (this.sinking >= 1) this.dead = true;
      return;
    }
    const wind = this.cw.wind;
    this.rudVis += (this.turn - this.rudVis) * Math.min(1, dt * 6);
    this.sailVis += (Math.max(0, this.thr) - this.sailVis) * Math.min(1, dt * 3);
    const rel = angDiff(this.ang, wind.ang);
    this.yawVis += (clamp(rel * 0.3, -0.5, 0.5) - this.yawVis) * Math.min(1, dt * 2);
    const P = this.cw.fx;
    for (const b of this.blocks) {
      if (!b.alive) continue;
      if (b.recoil > 0) b.recoil = Math.max(0, b.recoil - dt * 4);
      if (b.flash > 0) b.flash -= dt;
      if (b.burn && chance(dt * 16)) { const w = this.blockWorld(b); FX.fire(P, w[0], w[1]); if (chance(dt * 1.5)) SFX.play('crackle', { x: w[0], y: w[1] }); }
    }
    if (this.kind === 'ghost' && chance(dt * 10)) { const b = pick(this.blocks); if (b.alive) { const w = this.blockWorld(b); P.add({ type: 'disc', x: w[0], y: w[1], r: 1, grow: 4, vx: rand(-4, 4), vy: rand(-4, 4), life: 1.2, cols: ['#d8fff0', PAL.ghost, PAL.ghostD], alpha: 0.35, wind: 0.5 }); } }
    if (this.inView(this.cw.cam, 20)) this.relicFx(dt, P);
    if (this.fl & 2 && this.integ < 1 && chance(dt * 3)) { const b = pick(this.blocks); if (b.alive) { const w = this.blockWorld(b); FX.sparkle(P, w[0] + rand(-4, 4), w[1] + rand(-4, 4), PAL.green); } }
    const fx = Math.sin(this.ang), fy = -Math.cos(this.ang);
    this.wake(dt, this.vx * fx + this.vy * fy);
  }
  // dym z kotłów i blask relikwii
  relicFx(dt, P) {
    for (const b of this.blocks) {
      if (b.alive && b.p === 'steam' && this.thr > 0 && chance(dt * 7)) { const w = this.blockWorld(b); FX.smoke(P, w[0], w[1] - 2, 1, { dark: true, alpha: 0.55 }); }
    }
    const R = this.relics;
    if (!R || !R.size || !chance(dt * 5)) return;
    const b = pick(this.blocks); if (!b.alive) return;
    const w = this.blockWorld(b), x = w[0] + rand(-4, 4), y = w[1] + rand(-4, 4);
    if (R.has('lantern') && chance(0.6)) P.add({ type: 'disc', x, y, r: 1, grow: 3, vx: rand(-3, 3), vy: rand(-3, 3), life: 1, cols: ['#d8fff0', PAL.ghost, PAL.ghostD], alpha: 0.3, wind: 0.5 });
    if (R.has('storm') && chance(0.5)) FX.sparkle(P, x, y, chance(0.5) ? PAL.cyan : PAL.yellow);
    if (R.has('pearl') && chance(0.5)) FX.sparkle(P, x, y, chance(0.5) ? PAL.white : '#e98bc4');
    if (R.has('figure') && chance(0.35)) FX.sparkle(P, x, y, PAL.gold);
    if (R.has('kraken') && chance(0.4)) FX.bubbles(P, x, y);
    if (R.has('dread') && chance(0.25)) FX.smoke(P, x, y, 1, { dark: true, alpha: 0.3 });
  }
  wake(dt, u) {
    const sp = Math.abs(u); if (sp < 4) return;
    if (Math.abs(this.x - this.cw.cam.x) > W * 0.7 || Math.abs(this.y - this.cw.cam.y) > H * 0.8) return;
    this.wakeAcc += dt * sp * 0.8;
    const P = this.cw.fx;
    while (this.wakeAcc > 1) {
      this.wakeAcc -= 1;
      const side = chance(0.5) ? -1 : 1;
      const bw = this.toWorld(this.bowS[0] + side * rand(1, this.halfW * 0.6), this.bowS[1] + rand(3, 10));
      const c = Math.cos(this.ang), s = Math.sin(this.ang), ox = side * rand(10, 18), oy = rand(2, 8);
      FX.foam(P, bw[0], bw[1], ox * c - oy * s, ox * s + oy * c, chance(0.25));
      const st = this.toWorld(this.sternS[0] + rand(-3, 3), this.sternS[1] - 1);
      FX.foam(P, st[0], st[1], rand(-3, 3), rand(-3, 3), chance(0.5));
    }
  }
  // ---------- rysowanie ----------
  inView(cam, m) { return Math.abs(this.x - cam.x) < W / 2 + this.radius + (m || 0) && Math.abs(this.y - cam.y) < H / 2 + this.radius + (m || 0); }
  drawShadow(ctx) {
    if (this.dead) return;
    ctx.save();
    ctx.globalAlpha = 0.3 * (1 - this.sinking) * (this.kind === 'ghost' ? 0.4 : 1);
    ctx.translate(Math.round(this.x) + 3, Math.round(this.y) + 4); ctx.rotate(this.ang);
    ctx.drawImage(this.spr.sil, -this.comX, -this.comY);
    ctx.restore();
  }
  draw(ctx) {
    if (this.dead) return;
    const s = this.alive ? 0 : this.sinking, ghost = this.kind === 'ghost';
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.ang);
    if (s) { const k = 1 - s * 0.14; ctx.scale(k, k); }
    ctx.translate(-this.comX, -this.comY);
    ctx.globalAlpha = (0.5 + 0.25 * Math.sin(this.t * 3)) * (1 - s);
    ctx.drawImage(this.spr.foam, 0, 0);
    ctx.globalAlpha = (1 - s * 0.85) * (ghost ? 0.72 + 0.12 * Math.sin(this.t * 2) : 1);
    ctx.drawImage(this.spr.img, 0, 0);
    if (s && this.sinkSpr) { ctx.globalAlpha = Math.min(1, s * 1.6) * (1 - s * 0.6); ctx.drawImage(this.sinkSpr, 0, 0); }
    ctx.globalAlpha = 1 - s;
    drawShipDyn(ctx, this.blocks, { t: this.t, row: this.alive ? clamp(Math.hypot(this.vx, this.vy) / 40 + Math.abs(this.w) * 0.6, 0, 1) : 0, rudder: this.rudVis });
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
    drawSails(ctx, this.blocks, { col: this.col, sail: lvl, yaw: this.yawVis, shadow, skin: this.skin });
    if (!shadow) {
      const fb = this.blocks.find(b => b.alive && b.p === 'mast') || (this.core.alive ? this.core : null);
      if (fb) drawFlag(ctx, PAD + fb.c * TILE + 4, PAD + fb.r * TILE + (fb.p === 'mast' ? 4 : 2), angDiff(this.ang, this.cw.wind.ang), this.col, this.t, this.relics.has('dread') ? 'dread' : null);
    }
    ctx.restore();
  }
}

// odłamany fragment okrętu - dryfuje i tonie
class Wreck {
  constructor(ship, blocks) {
    this.blocks = blocks.map(b => Object.assign({}, b, { alive: true, flash: 0, recoil: 0 }));
    this.spr = renderShip(this.blocks, ship.col);
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
