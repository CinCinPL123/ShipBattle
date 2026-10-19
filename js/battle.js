'use strict';
/* =========================================================
   Bitwa: arena, pociski, zderzenia, pogoda, HUD
   ========================================================= */
const WHIRL_T = 95, TIME_LIMIT = 165;
const WEATHERS = ['day', 'sunset', 'night', 'storm'];
const WEATHER_NAME = { day: 'Słoneczny dzień', sunset: 'Zachód słońca', night: 'Bitwa nocą', storm: 'Sztorm' };
let GLOW = null, CLOUDS = [];
function buildBattleArt() {
  // miękka poświata
  const [g, x] = makeCanvas(64, 64);
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,150,1)'); gr.addColorStop(0.35, 'rgba(255,170,80,0.45)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  GLOW = g;
  // cienie chmur (ditheringiem)
  for (let k = 0; k < 3; k++) {
    const w = 150 + k * 30, h = 80 + k * 10;
    const [c, cx] = makeCanvas(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i - w / 2) / (w / 2), dy = (j - h / 2) / (h / 2);
      const v = 1 - Math.sqrt(dx * dx + dy * dy) + (Noise.fbm(i * 0.04 + k * 50, j * 0.05, 3) - 0.5) * 0.9;
      if (v > 0.25) { cx.fillStyle = 'rgba(8,18,48,0.2)'; cx.fillRect(i, j, 1, 1); }
      else if (v > 0.1 && bayer(i, j) < 0.5) { cx.fillStyle = 'rgba(8,18,48,0.2)'; cx.fillRect(i, j, 1, 1); }
    }
    CLOUDS.push(c);
  }
}
class HumanCtrl {
  constructor(bind, labels) { this.b = bind; this.labels = labels; this.human = true; }
  update(ship) {
    const b = this.b;
    if (Act.hit(b, 'up') && ship.throttle < 3) { ship.throttle++; SFX.play('sail', { up: true, x: ship.x }); }
    if (Act.hit(b, 'down') && ship.throttle > -1) { ship.throttle--; SFX.play('sail', { up: false, x: ship.x }); }
    ship.turn = (Act.down(b, 'right') ? 1 : 0) - (Act.down(b, 'left') ? 1 : 0);
    if (Act.hit(b, 'fireL')) ship.fire('L');
    if (Act.hit(b, 'fireR')) ship.fire('R');
    if (Act.hit(b, 'special')) ship.fire('S');
  }
}
class Battle {
  constructor(o) {
    this.o = o; this.attract = !!o.attract;
    this.fx = new Particles();
    this.t = 0; this.time = 0; this.state = 'intro'; this.stateT = 0; this.slow = 1; this.slowT = 0; this.hitStop = 0;
    this.timers = []; this.balls = []; this.shells = []; this.wrecks = []; this.crates = []; this.flashes = []; this.texts = [];
    this.weather = o.weather || 'day';
    const wa = rand(0, TAU);
    this.wind = { ang: wa, target: wa, str: this.weather === 'storm' ? 1.22 : rand(0.92, 1.08), x: 0, y: 0, changeT: rand(12, 20) };
    this.genArena(o.seed || randi(1, 1e9));
    this.ships = [0, 1].map(i => new Ship(o.designs[i], i, o.names[i], this));
    const cy = (ARENA.y0 + ARENA.y1) / 2;
    const s0 = this.ships[0], s1 = this.ships[1];
    s0.x = 34; s0.y = cy; s0.ang = Math.PI / 2; s0.throttle = 1;
    s1.x = W - 34; s1.y = cy; s1.ang = -Math.PI / 2; s1.throttle = 1;
    for (const s of this.ships) { const f = 25; s.vx = Math.sin(s.ang) * f; s.vy = -Math.cos(s.ang) * f; s.sailVis = 1; }
    this.ctrl = o.controllers;
    this.ships.forEach((s, i) => { s.human = !!(this.ctrl[i] && this.ctrl[i].human); });
    this.birds = [];
    for (let i = 0; i < 4; i++) this.birds.push(this.newBird(true));
    this.clouds = [];
    for (let i = 0; i < 3; i++) this.clouds.push({ img: CLOUDS[i % CLOUDS.length], x: rand(0, W), y: rand(0, H) });
    this.rain = [];
    if (this.weather === 'storm') for (let i = 0; i < 140; i++) this.rain.push({ x: rand(0, W), y: rand(0, H), s: rand(0.7, 1.3) });
    this.lightning = 0; this.lightT = rand(5, 10);
    this.whirl = { on: false, r: 0, acc: 0 };
    this.crateT = this.attract ? 9 : 14;
    this.banner = null; this.ramCd = 0; this.result = null; this.coreFlash = [0, 0]; this.lastHit = [0, 0];
    this.hintT = o.hints ? 9 : 0;
  }
  genArena(seed) {
    const rng = mulberry32(seed), cx = W / 2, cy = (ARENA.y0 + ARENA.y1) / 2;
    this.islands = [];
    const pairs = 1 + Math.floor(rng() * 2) + (rng() < 0.35 ? 1 : 0);
    const spawns = [[60, cy], [W - 60, cy]];
    const ok = (x, y, r) => {
      if (x < ARENA.x0 + r + 6 || x > ARENA.x1 - r - 6 || y < ARENA.y0 + r + 6 || y > ARENA.y1 - r - 6) return false;
      if (Math.hypot(x - cx, y - cy) < 72 + r) return false;
      for (const s of spawns) if (Math.hypot(x - s[0], y - s[1]) < 92 + r) return false;
      for (const i of this.islands) if (Math.hypot(x - i.x, y - i.y) < r + i.r + 34) return false;
      return true;
    };
    let tries = 0;
    while (this.islands.length < pairs * 2 && tries++ < 300) {
      const roll = rng(), kind = roll < 0.45 ? 'palm' : roll < 0.75 ? 'rock' : 'sand';
      const r = kind === 'palm' ? 15 + rng() * 11 : kind === 'rock' ? 7 + rng() * 7 : 9 + rng() * 6;
      const x = 100 + rng() * 230, y = ARENA.y0 + 20 + rng() * (ARENA.y1 - ARENA.y0 - 40);
      const mx = 2 * cx - x, my = 2 * cy - y;
      if (!ok(x, y, r)) continue;
      if (Math.hypot(mx - x, my - y) < 2 * r + 34) continue;
      const a = makeIsland(Math.floor(rng() * 1e6), r, kind); a.x = Math.round(x); a.y = Math.round(y); a.cr = r * 0.92;
      this.islands.push(a);
      if (!ok(mx, my, r)) { this.islands.pop(); continue; }
      const b = makeIsland(Math.floor(rng() * 1e6), r, kind); b.x = Math.round(mx); b.y = Math.round(my); b.cr = r * 0.92;
      this.islands.push(b);
    }
  }
  later(t, fn) { this.timers.push({ t, fn }); }
  newBird(init) {
    const ax = rand(80, W - 80), ay = rand(ARENA.y0 + 20, ARENA.y1 - 20);
    return { ax, ay, a: rand(0, TAU), rad: rand(20, 50), sp: rand(0.6, 1.1) * (chance(0.5) ? 1 : -1), x: init ? ax : (chance(0.5) ? -20 : W + 20), y: ay, scared: 0, ph: rand(0, 10), vx: 0, vy: 0, enter: init ? 0 : 1 };
  }
  scareBirds(x, y) { for (const b of this.birds) if (!b.scared && Math.hypot(b.x - x, b.y - y) < 110) { b.scared = 1; const d = Math.hypot(b.x - x, b.y - y) || 1; b.vx = (b.x - x) / d * 90; b.vy = (b.y - y) / d * 90 - 20; if (chance(0.3)) SFX.play('gull'); } }
  flash(x, y, r) { this.flashes.push({ x, y, r, t: 0, life: 0.14 }); }
  enemyOf(s) { return this.ships[1 - s.team]; }
  // ---------- pociski ----------
  spawnBall(owner, x, y, vx, vy) {
    this.balls.push({ x, y, z: 3, vx, vy, vz: BALL_VZ, owner, dmg: CANNON_DMG, hit: false, t: 0 });
  }
  fireMortar(ship, b) {
    const foe = this.enemyOf(ship);
    const p = ship.blockWorld(b);
    let tx, ty;
    if (foe && foe.alive) {
      const d = Math.hypot(foe.x - p[0], foe.y - p[1]);
      const T = 0.9 + d / 240;
      const alive = foe.blocks.filter(q => q.alive), tb = alive.length ? pick(alive) : null;
      const tp = tb ? foe.blockWorld(tb) : [foe.x, foe.y];
      tx = tp[0] + foe.vx * T * 0.85; ty = tp[1] + foe.vy * T * 0.85;
      const err = 8 + d * 0.085, a = rand(0, TAU), e = Math.sqrt(rand(0, 1)) * err;
      tx += Math.cos(a) * e; ty += Math.sin(a) * e;
    } else { tx = p[0] + Math.sin(ship.ang) * 120; ty = p[1] - Math.cos(ship.ang) * 120; }
    const d = Math.hypot(tx - p[0], ty - p[1]);
    this.shells.push({ x0: p[0], y0: p[1], x1: tx, y1: ty, t: 0, T: 0.9 + d / 240, H: 26 + d * 0.2, owner: ship, wh: false, x: p[0], y: p[1], z: 0 });
    FX.smoke(this.fx, p[0], p[1], 6, { big: true, alpha: 0.7 });
    FX.muzzle(this.fx, p[0], p[1], 0, 0);
    SFX.play('mortar', { x: p[0] });
    Shake.add(0.12); this.flash(p[0], p[1], 30);
    ship.st.shots++;
    this.scareBirds(p[0], p[1]);
  }
  areaDamage(x, y, r, dmg, src, fall) {
    fall = fall === undefined ? 0.85 : fall;
    let hit = false;
    for (const s of this.ships) {
      if (!s.alive) continue;
      if (Math.hypot(s.x - x, s.y - y) > s.radius + r) continue;
      const targets = [];
      s.blocks.forEach((b, k) => { if (!b.alive) return; const w = s.blockWorld(b), d = Math.hypot(w[0] - x, w[1] - y); if (d < r) targets.push([k, d]); });
      for (const tg of targets) { const core = s.blocks[tg[0]].p === 'core'; s.damageBlock(tg[0], dmg * (1 - fall * tg[1] / r) * (core ? 0.5 : 1), src, { fireChance: 0.3 }); hit = true; }
      if (targets.length && src && src !== s) src.st.hits++;
    }
    return hit;
  }
  kegBlast(ship, x, y, src) {
    FX.explosion(this.fx, x, y, 1.4);
    SFX.play('explosion', { x }); Shake.add(0.55); this.flash(x, y, 60); this.hitStop = Math.max(this.hitStop, 0.05);
    this.areaDamage(x, y, 15, 40, src);
    this.scareBirds(x, y);
  }
  coreHit(ship) { this.coreFlash[ship.team] = 0.6; }
  addWreck(ship, blocks) { this.wrecks.push(new Wreck(ship, blocks)); }
  onSink(ship, src) {
    if (!this.attract && ship.human) this.slow = 0.3;
    if (this.state === 'fight' || this.state === 'intro') {
      this.state = 'over'; this.stateT = 0; this.slow = 0.3; this.slowT = 1.3;
      this.banner = { text: 'ZATOPIONY!', sub: ship.name + ' idzie na dno', t: 0, dur: 3, col: TEAM[ship.team].l };
      if (!this.attract) { Music.duck = 0.4; }
    }
  }
  updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      let removed = false;
      for (let sub = 0; sub < 2 && !removed; sub++) {
        const h = dt / 2;
        b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.vz -= BALL_G * h; b.t += h;
        for (const s of this.ships) {
          if (s === b.owner || !s.alive) continue;
          const dx = s.x - b.x, dy = s.y - b.y;
          if (dx * dx + dy * dy > (s.radius + 3) * (s.radius + 3)) continue;
          const k = s.blockAt(b.x, b.y);
          if (k < 0) continue;
          const blk = s.blocks[k], metal = PARTS[blk.p].mat === 'metal';
          if (!b.hit) { b.owner.st.hits++; b.hit = true; }
          const left = s.damageBlock(k, b.dmg, b.owner);
          const l = Math.hypot(b.vx, b.vy) || 1;
          FX.splinters(this.fx, b.x, b.y, metal ? 3 : 8, b.vx / l, b.vy / l, 45);
          if (metal) { FX.metal(this.fx, b.x, b.y, 6); SFX.play('metal', { x: b.x }); } else SFX.play('hit', { x: b.x });
          FX.smoke(this.fx, b.x, b.y, 2, { alpha: 0.5 });
          Shake.add(s.human ? 0.12 : 0.06);
          this.lastHit[s.team] = 0.25;
          if (left > 5) { b.dmg = left; b.vx *= 0.7; b.vy *= 0.7; }
          else { this.balls.splice(i, 1); removed = true; }
          break;
        }
        if (removed) break;
        for (const isl of this.islands) {
          if (Math.hypot(b.x - isl.x, b.y - isl.y) < isl.cr * 0.95 && b.z < 6) {
            FX.smoke(this.fx, b.x, b.y, 4, { alpha: 0.6 });
            for (let q = 0; q < 6; q++) this.fx.add({ type: 'px', x: b.x, y: b.y, z: 1, vx: rand(-30, 30), vy: rand(-30, 30), vz: rand(20, 50), g: 150, life: 1, cols: [isl.kind === 'rock' ? PAL.grey : PAL.sand], onLand: 'die' });
            SFX.play('hit', { x: b.x });
            this.balls.splice(i, 1); removed = true; break;
          }
        }
        if (removed) break;
        if (b.z <= 0) { FX.splash(this.fx, b.x, b.y, false); SFX.play('splash', { x: b.x }); this.balls.splice(i, 1); removed = true; }
        else if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) { this.balls.splice(i, 1); removed = true; }
      }
    }
  }
  updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      const f = Math.min(1, s.t / s.T);
      s.x = lerp(s.x0, s.x1, f); s.y = lerp(s.y0, s.y1, f); s.z = 4 * s.H * f * (1 - f);
      if (!s.wh && f > 0.45) { s.wh = true; SFX.play('whistle', { x: s.x1, dur: s.T * 0.55 }); }
      if (chance(dt * 30)) this.fx.add({ type: 'disc', x: s.x, y: s.y, z: s.z, r: 1, grow: 2, life: 0.5, cols: SMOKE, alpha: 0.4 });
      if (f >= 1) {
        this.shells.splice(i, 1);
        const onIsl = this.islands.some(isl => Math.hypot(s.x1 - isl.x, s.y1 - isl.y) < isl.cr);
        const hit = this.areaDamage(s.x1, s.y1, 12, MORTAR_DMG, s.owner);
        if (hit || onIsl) { FX.explosion(this.fx, s.x1, s.y1, 1.1); SFX.play('explosion', { x: s.x1 }); Shake.add(0.35); this.flash(s.x1, s.y1, 50); }
        else { FX.splash(this.fx, s.x1, s.y1, true); FX.smoke(this.fx, s.x1, s.y1, 3, { alpha: 0.5 }); SFX.play('splash', { x: s.x1, big: true }); Shake.add(0.12); }
        this.scareBirds(s.x1, s.y1);
      }
    }
  }
  // ---------- zderzenia ----------
  collideShips() {
    const A = this.ships[0], B = this.ships[1];
    if (!A.alive || !B.alive) return;
    const dx = B.x - A.x, dy = B.y - A.y;
    if (dx * dx + dy * dy > (A.radius + B.radius) * (A.radius + B.radius)) return;
    const pa = A.blocks.map(b => b.alive ? A.blockWorld(b) : null), pb = B.blocks.map(b => b.alive ? B.blockWorld(b) : null);
    let nx = 0, ny = 0, cnt = 0, maxPen = 0, best = null;
    const R = 7.6;
    for (let i = 0; i < pa.length; i++) {
      const a = pa[i]; if (!a) continue;
      for (let j = 0; j < pb.length; j++) {
        const b = pb[j]; if (!b) continue;
        const ddx = a[0] - b[0], ddy = a[1] - b[1], d2 = ddx * ddx + ddy * ddy;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 0.01, pen = R - d;
        nx += ddx / d * pen; ny += ddy / d * pen; cnt++;
        if (pen > maxPen) { maxPen = pen; best = [i, j, a, b]; }
      }
    }
    if (!cnt) return;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const mA = A.ph.mass, mB = B.ph.mass, tot = mA + mB;
    A.x += nx * maxPen * mB / tot; A.y += ny * maxPen * mB / tot;
    B.x -= nx * maxPen * mA / tot; B.y -= ny * maxPen * mA / tot;
    const vn = (A.vx - B.vx) * nx + (A.vy - B.vy) * ny;
    if (vn >= 0) return;
    const j = -1.25 * vn / (1 / mA + 1 / mB);
    A.vx += nx * j / mA; A.vy += ny * j / mA; B.vx -= nx * j / mB; B.vy -= ny * j / mB;
    const cpx = (best[2][0] + best[3][0]) / 2, cpy = (best[2][1] + best[3][1]) / 2;
    const raX = cpx - A.x, raY = cpy - A.y, rbX = cpx - B.x, rbY = cpy - B.y;
    A.w = clamp(A.w + (raX * ny - raY * nx) * j / (A.ph.I * 64) * 0.6, -3, 3);
    B.w = clamp(B.w - (rbX * ny - rbY * nx) * j / (B.ph.I * 64) * 0.6, -3, 3);
    const imp = -vn;
    if (imp > 12 && this.ramCd <= 0) {
      this.ramCd = 0.35;
      const ba = A.blocks[best[0]], bb = B.blocks[best[1]], base = imp * 0.75;
      const dA = base * (bb.p === 'ram' ? 3 : 1) * (ba.p === 'ram' ? 0.25 : ba.p === 'armor' ? 0.6 : 1);
      const dB = base * (ba.p === 'ram' ? 3 : 1) * (bb.p === 'ram' ? 0.25 : bb.p === 'armor' ? 0.6 : 1);
      if (ba.p === 'ram') A.st.rams++;
      if (bb.p === 'ram') B.st.rams++;
      A.damageBlock(best[0], dA, B, { fireChance: 0 });
      B.damageBlock(best[1], dB, A, { fireChance: 0 });
      // taran miaĹĽdĹĽy teĹĽ sÄ…siednie czÄ™Ĺ›ci
      if (ba.p === 'ram' || bb.p === 'ram') {
        const victim = ba.p === 'ram' ? B : A, attacker = victim === A ? B : A;
        victim.blocks.forEach((b, k) => {
          if (!b.alive) return;
          const w = victim.blockWorld(b);
          if (Math.hypot(w[0] - cpx, w[1] - cpy) < 12) victim.damageBlock(k, base * 1.2, attacker, { fireChance: 0 });
        });
      }
      FX.splinters(this.fx, cpx, cpy, 20, 0, 0, 75);
      SFX.play('ram', { x: cpx }); Shake.add(clamp(imp / 70, 0.2, 0.8)); this.hitStop = 0.07;
      if (ba.p === 'ram' || bb.p === 'ram') FX.text(this.fx, cpx, cpy - 12, 'TARAN!', PAL.gold, 1);
    } else if (imp > 4 && chance(0.15)) SFX.play('scrape', { x: cpx });
  }
  collideIslands(s) {
    if (!s.alive) return;
    for (const isl of this.islands) {
      const dx = s.x - isl.x, dy = s.y - isl.y;
      if (dx * dx + dy * dy > (s.radius + isl.r + 4) * (s.radius + isl.r + 4)) continue;
      let maxPen = 0, hitK = -1, px = 0, py = 0, cpx = 0, cpy = 0;
      const rr = isl.cr + 3.5;
      s.blocks.forEach((b, k) => {
        if (!b.alive) return;
        const w = s.blockWorld(b), ddx = w[0] - isl.x, ddy = w[1] - isl.y, d = Math.hypot(ddx, ddy) || 0.01;
        if (d < rr && rr - d > maxPen) { maxPen = rr - d; hitK = k; px = ddx / d; py = ddy / d; cpx = w[0]; cpy = w[1]; }
      });
      if (hitK < 0) continue;
      s.x += px * maxPen; s.y += py * maxPen;
      const vn = s.vx * px + s.vy * py;
      if (vn < 0) {
        s.vx -= px * vn * 1.3; s.vy -= py * vn * 1.3;
        const rX = cpx - s.x, rY = cpy - s.y;
        s.w = clamp(s.w + (rX * py - rY * px) * (-vn) / (s.ph.I * 64) * 2, -3, 3);
        if (-vn > 14 && s.hitCd <= 0) {
          s.hitCd = 0.4;
          s.damageBlock(hitK, (-vn - 8) * 0.6, null, { fireChance: 0 });
          FX.splinters(this.fx, cpx, cpy, 8, px, py, 40);
          SFX.play('scrape', { x: cpx }); SFX.play('hit', { x: cpx }); Shake.add(0.2);
        }
      }
    }
  }
  // ---------- skrzynie ----------
  spawnCrate() {
    for (let k = 0; k < 40; k++) {
      const x = rand(90, W - 90), y = rand(ARENA.y0 + 30, ARENA.y1 - 30);
      if (this.islands.some(i => Math.hypot(x - i.x, y - i.y) < i.r + 22)) continue;
      if (this.ships.some(s => Math.hypot(x - s.x, y - s.y) < 70)) continue;
      const type = pick(['repair', 'powder', 'wind']);
      this.crates.push({ x, y, type, t: 0, life: 24 });
      FX.splash(this.fx, x, y, false);
      return;
    }
  }
  collectCrate(s, c) {
    const P = this.fx;
    SFX.play('pickup');
    let txt = '';
    if (c.type === 'repair') {
      for (const b of s.blocks) if (b.alive) { b.hp = Math.min(b.max, b.hp + b.max * 0.4); b.burn = 0; }
      s.dirty = true; s.structure(false); txt = 'NAPRAWA!';
      for (let i = 0; i < 12; i++) FX.sparkle(P, s.x + rand(-20, 20), s.y + rand(-20, 20), PAL.green);
    } else if (c.type === 'powder') { s.buff.powder = 10; txt = 'SZYBKIE ŁADOWANIE!'; }
    else { s.buff.wind = 10; txt = 'POMYŚLNY WIATR!'; }
    FX.text(P, s.x, s.y - 26, txt, c.type === 'repair' ? PAL.green : c.type === 'powder' ? PAL.gold : PAL.cyan, 1, 1.6);
    FX.splash(P, c.x, c.y, false);
  }
  updateCrates(dt) {
    this.crateT -= dt;
    if (this.crateT <= 0 && this.crates.length < 2 && this.state === 'fight') { this.spawnCrate(); this.crateT = rand(16, 22); }
    for (let i = this.crates.length - 1; i >= 0; i--) {
      const c = this.crates[i];
      c.t += dt; c.x += this.wind.x * 0.08 * dt; c.y += this.wind.y * 0.08 * dt;
      if (c.t > c.life) { FX.bubbles(this.fx, c.x, c.y); this.crates.splice(i, 1); continue; }
      let got = null;
      for (const s of this.ships) {
        if (!s.alive || Math.hypot(s.x - c.x, s.y - c.y) > s.radius + 6) continue;
        for (const b of s.blocks) { if (!b.alive) continue; const w = s.blockWorld(b); if (Math.hypot(w[0] - c.x, w[1] - c.y) < 9) { got = s; break; } }
        if (got) break;
      }
      if (got) { this.collectCrate(got, c); this.crates.splice(i, 1); }
    }
  }
  // ---------- aktualizacja ----------
  update(dt) {
    if (this.hitStop > 0) { this.hitStop -= dt; return; }
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 1; }
    dt *= this.slow;
    this.t += dt; this.stateT += dt;
    if (this.state === 'fight') this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    // wiatr
    const wd = this.wind;
    wd.changeT -= dt;
    if (wd.changeT <= 0) { wd.target = wd.ang + rand(-1.2, 1.2) * (this.weather === 'storm' ? 1.6 : 1); wd.changeT = rand(12, 22); }
    wd.ang = angNorm(wd.ang + angDiff(wd.ang, wd.target) * Math.min(1, dt * 0.25));
    const ws = 6 * wd.str; wd.x = Math.sin(wd.ang) * ws; wd.y = -Math.cos(wd.ang) * ws;
    // odliczanie
    if (this.state === 'intro') {
      if (this.attract) { this.state = 'fight'; this.stateT = 0; }
      else {
        for (const mk of [[0.5, '3'], [1.3, '2'], [2.1, '1'], [2.9, 'OGNIA!']]) {
          if (this.stateT - dt < mk[0] && this.stateT >= mk[0]) {
            const go = mk[1].length > 1;
            this.banner = { text: mk[1], t: 0, dur: go ? 1.3 : 0.75, col: go ? PAL.gold : PAL.white, big: true };
            if (go) { SFX.play('horn'); this.state = 'fight'; this.stateT = 0; }
            else SFX.play('tick', { hi: true });
          }
        }
      }
    }
    if (this.state === 'fight') this.ships.forEach((s, i) => { if (s.alive && this.ctrl[i]) this.ctrl[i].update(s, this, dt); });
    else if (this.state === 'over') for (const s of this.ships) s.turn *= 0.9;
    for (const s of this.ships) s.update(dt);
    this.collideShips();
    for (const s of this.ships) this.collideIslands(s);
    if (this.ramCd > 0) this.ramCd -= dt;
    this.updateBalls(dt); this.updateShells(dt);
    for (let i = this.wrecks.length - 1; i >= 0; i--) { this.wrecks[i].update(dt, this.fx); if (this.wrecks[i].dead) this.wrecks.splice(i, 1); }
    this.updateCrates(dt);
    this.updateWhirl(dt);
    this.updateBirds(dt);
    for (const c of this.clouds) {
      c.x += wd.x * 1.2 * dt; c.y += wd.y * 1.2 * dt;
      if (c.x > W + 10) c.x = -c.img.width; if (c.x < -c.img.width - 10) c.x = W;
      if (c.y > H + 10) c.y = -c.img.height; if (c.y < -c.img.height - 10) c.y = H;
    }
    if (this.weather === 'storm') {
      for (const r of this.rain) { r.x += (wd.x * 8 + 40) * dt * r.s; r.y += 260 * dt * r.s; if (r.y > H) { r.y -= H + 10; r.x = rand(-40, W); } if (r.x > W) r.x -= W; }
      this.lightT -= dt;
      if (this.lightT <= 0) { this.lightning = 1; this.lightT = rand(7, 15); this.later(rand(0.3, 1.2), () => SFX.play('thunder')); }
    }
    this.lightning = Math.max(0, this.lightning - dt * 4);
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t > f.life) this.flashes.splice(i, 1); }
    this.fx.update(dt, wd);
    for (let i = 0; i < 2; i++) { this.coreFlash[i] = Math.max(0, this.coreFlash[i] - dt); this.lastHit[i] = Math.max(0, this.lastHit[i] - dt); }
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = null; }
    if (this.hintT > 0 && this.state === 'fight') this.hintT -= dt;
    // koniec rundy
    if (this.state === 'fight' && !this.attract && this.time > TIME_LIMIT) {
      this.state = 'over'; this.stateT = 0; this.timeUp = true;
      this.banner = { text: 'KONIEC CZASU!', sub: 'Wygrywa mniej zniszczony okręt', t: 0, dur: 3, col: PAL.gold, big: true };
      SFX.play('horn');
    }
    if (this.state === 'over' && !this.result && this.stateT > (this.attract ? 4 : 3.2)) {
      const a0 = this.ships[0].alive, a1 = this.ships[1].alive;
      let winner = a0 && !a1 ? 0 : a1 && !a0 ? 1 : -1;
      if (this.timeUp && a0 && a1) { const i0 = this.ships[0].integrity(), i1 = this.ships[1].integrity(); winner = Math.abs(i0 - i1) < 0.005 ? -1 : (i0 > i1 ? 0 : 1); }
      this.result = { winner, time: this.time, stats: this.ships.map(s => s.st), integ: this.ships.map(s => s.integrity()) };
      Music.duck = 1;
      if (this.o.onEnd) this.o.onEnd(this.result);
    }
  }
  updateWhirl(dt) {
    if (this.attract) return;
    const w = this.whirl;
    if (!w.on && this.time > WHIRL_T) {
      w.on = true;
      this.banner = { text: 'WIR!', sub: 'Morze wciąga okręty do środka', t: 0, dur: 2.4, col: PAL.cyan, big: true };
      SFX.play('horn');
    }
    if (!w.on) return;
    w.r = Math.min(80, w.r + dt * 8);
    const cx = W / 2, cy = (ARENA.y0 + ARENA.y1) / 2, k = w.r / 80;
    for (const s of this.ships) {
      if (!s.alive) continue;
      const dx = cx - s.x, dy = cy - s.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
      const acc = (14 + 22 * clamp(1 - d / 320, 0, 1)) * k;
      s.vx += (nx * acc - ny * acc * 0.6) * dt; s.vy += (ny * acc + nx * acc * 0.6) * dt;
      if (d < w.r * 0.4) {
        s.w += 0.9 * dt; w.acc += dt * 12;
        while (w.acc > 4) {
          w.acc -= 4;
          const al = []; s.blocks.forEach((b, i) => { if (b.alive && b.p !== 'core') al.push(i); });
          if (al.length) s.damageBlock(pick(al), 4, null, { fireChance: 0 });
          else s.damageBlock(s.blocks.indexOf(s.core), 4, null, { fireChance: 0 });
        }
      }
    }
    if (chance(dt * 25)) { const a = rand(0, TAU), r = rand(5, w.r); FX.foam(this.fx, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, -Math.sin(a) * 25, Math.cos(a) * 25, chance(0.3)); }
  }
  updateBirds(dt) {
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.ph += dt * (b.scared ? 16 : 7);
      if (b.scared) {
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < -30 || b.x > W + 30 || b.y < -30 || b.y > H + 30) { if (chance(dt * 0.3)) this.birds[i] = this.newBird(false); }
      } else {
        b.a += b.sp * dt * 0.8;
        const tx = b.ax + Math.cos(b.a) * b.rad, ty = b.ay + Math.sin(b.a) * b.rad * 0.6, k = Math.min(1, dt * (b.enter ? 0.7 : 3));
        b.x += (tx - b.x) * k; b.y += (ty - b.y) * k;
        if (b.enter && Math.hypot(tx - b.x, ty - b.y) < 12) b.enter = 0;
      }
    }
  }
  // ---------- rysowanie ----------
  draw(ctx) {
    if (Shake.x || Shake.y) { ctx.fillStyle = Water.tones[1]; ctx.fillRect(0, 0, W, H); }
    ctx.save();
    ctx.translate(Shake.x, Shake.y);
    Water.draw(ctx, this.t);
    for (const isl of this.islands) { ctx.drawImage(isl.canvas, Math.round(isl.x - isl.S / 2), Math.round(isl.y - isl.S / 2)); drawIslandFoam(ctx, isl, this.t); }
    if (this.whirl.on) this.drawWhirl(ctx);
    this.fx.draw(ctx, 'under');
    for (const w of this.wrecks) w.draw(ctx);
    this.drawCrates(ctx);
    for (const sh of this.shells) {
      const k = 0.5 + 0.5 * Math.sin(this.t * 14);
      ctx.globalAlpha = 0.5 + 0.4 * k; drawRing(ctx, sh.x1, sh.y1, 5 + Math.round(k * 2), PAL.red2); ctx.globalAlpha = 1;
      ctx.fillStyle = PAL.red2; ctx.fillRect(Math.round(sh.x1), Math.round(sh.y1), 1, 1);
    }
    for (const s of this.ships) s.drawShadow(ctx);
    for (const s of this.ships) s.draw(ctx);
    for (const s of this.ships) s.drawSailLayer(ctx, true);
    for (const s of this.ships) s.drawSailLayer(ctx, false);
    if (!this.attract && (this.state === 'intro' || this.time < 3)) this.drawShipTags(ctx);
    for (const b of this.balls) {
      const X = Math.round(b.x), Y = Math.round(b.y);
      ctx.fillStyle = 'rgba(8,16,40,0.4)'; ctx.fillRect(X - 1, Y, 2, 2);
      const Z = Math.round(b.y - b.z);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(Math.round(X - b.vx * 0.02), Math.round(Z - b.vy * 0.02), 2, 2);
      ctx.fillStyle = PAL.black; ctx.fillRect(X - 1, Z - 1, 3, 3);
      ctx.fillStyle = PAL.steel; ctx.fillRect(X - 1, Z - 1, 1, 1);
    }
    for (const sh of this.shells) {
      const r = Math.round(1.5 + sh.z / 20);
      ctx.globalAlpha = 0.35; drawDisc(ctx, sh.x, sh.y, Math.max(1, 3 - Math.round(sh.z / 25)), PAL.black); ctx.globalAlpha = 1;
      drawDisc(ctx, sh.x, sh.y - sh.z, r, PAL.black);
      ctx.fillStyle = PAL.grey; ctx.fillRect(Math.round(sh.x) - r + 1, Math.round(sh.y - sh.z) - r + 1, 1, 1);
    }
    this.fx.draw(ctx, 'over');
    this.drawBirds(ctx);
    for (const c of this.clouds) ctx.drawImage(c.img, Math.round(c.x), Math.round(c.y));
    ctx.restore();
    this.drawWeather(ctx);
    if (!this.attract) this.drawHUD(ctx);
    this.drawBanner(ctx);
  }
  drawShipTags(ctx) {
    const a = this.state === 'intro' ? 1 : clamp(3 - this.time, 0, 1);
    this.ships.forEach((s, i) => {
      const c = this.ctrl[i], tag = c && c.human ? (this.o.mode === 'pvp' ? 'GRACZ ' + (i + 1) : 'TY') : 'RYWAL';
      const y = Math.round(s.y - s.radius - 10 + Math.sin(this.t * 6) * 2);
      ctx.globalAlpha = a;
      Font.draw(ctx, tag, s.x, y - 8, { align: 'center', color: TEAM[i].l, outline: PAL.black });
      ctx.fillStyle = PAL.black; ctx.fillRect(Math.round(s.x) - 3, y + 1, 7, 1); ctx.fillRect(Math.round(s.x) - 2, y + 2, 5, 1); ctx.fillRect(Math.round(s.x) - 1, y + 3, 3, 1);
      ctx.fillStyle = TEAM[i].c; ctx.fillRect(Math.round(s.x) - 2, y + 1, 5, 1); ctx.fillRect(Math.round(s.x) - 1, y + 2, 3, 1);
      ctx.globalAlpha = 1;
    });
  }
  drawWhirl(ctx) {
    const cx = W / 2, cy = (ARENA.y0 + ARENA.y1) / 2, R = this.whirl.r;
    ctx.globalAlpha = 0.6; drawDisc(ctx, cx, cy, Math.round(R * 0.32), '#0b2c56'); drawDisc(ctx, cx, cy, Math.round(R * 0.16), '#06182f'); ctx.globalAlpha = 1;
    for (let arm = 0; arm < 4; arm++) for (let s = 0; s < 80; s++) {
      const f = s / 80, r = R * f, a = arm * TAU / 4 + f * 5.2 - this.t * 2.2;
      ctx.globalAlpha = f > 0.6 ? (1 - f) * 2.2 : 0.9;
      ctx.fillStyle = s & 1 ? '#b8e4ff' : '#eaf7ff';
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.92), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  drawCrates(ctx) {
    for (const c of this.crates) {
      if (c.life - c.t < 4 && (Math.floor(c.t * 8) & 1)) continue;
      const bob = Math.round(Math.sin(c.t * 3) * 1.2);
      const icon = c.type === 'repair' ? Icons.crateRepair : c.type === 'powder' ? Icons.cratePowder : Icons.crateWind;
      ctx.globalAlpha = 0.55; drawRing(ctx, c.x, c.y + 1, 6 + Math.round(Math.sin(c.t * 3)), '#b8e4ff'); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.15 * Math.sin(c.t * 5);
      ctx.drawImage(GLOW, c.x - 12, c.y - 12, 24, 24);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(8,16,40,0.35)'; ctx.fillRect(Math.round(c.x - 3), Math.round(c.y + 3), 8, 2);
      ctx.drawImage(icon, Math.round(c.x - 4), Math.round(c.y - 4 + bob));
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
  drawWeather(ctx) {
    const wt = this.weather;
    if (!this.grads) {
      const g1 = ctx.createLinearGradient(0, 0, 0, H); g1.addColorStop(0, '#ffcfa6'); g1.addColorStop(1, '#e6a9bd');
      const g2 = ctx.createRadialGradient(W * 0.86, -30, 10, W * 0.86, -30, 340); g2.addColorStop(0, 'rgba(255,170,90,0.55)'); g2.addColorStop(1, 'rgba(255,120,60,0)');
      const g3 = ctx.createRadialGradient(W * 0.15, -20, 10, W * 0.15, -20, 300); g3.addColorStop(0, 'rgba(150,180,255,0.35)'); g3.addColorStop(1, 'rgba(120,150,255,0)');
      this.grads = { sun: g1, glow: g2, moon: g3 };
    }
    if (wt === 'sunset') {
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = this.grads.sun; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = this.grads.glow; ctx.fillRect(0, 0, W, H);
    } else if (wt === 'night') {
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#5263a6'; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = this.grads.moon; ctx.fillRect(0, 0, W, H);
    } else if (wt === 'storm') {
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#93a0b8'; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 1;
    const k = wt === 'night' ? 1 : wt === 'storm' ? 0.65 : wt === 'sunset' ? 0.45 : 0.3;
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) { ctx.globalAlpha = (1 - f.t / f.life) * k; ctx.drawImage(GLOW, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); }
    if (wt === 'night' || wt === 'storm') {
      for (const s of this.ships) {
        if (s.dead) continue;
        if (s.core.alive) { const p = s.blockWorld(s.core); ctx.globalAlpha = (0.32 + 0.05 * Math.sin(this.t * 7)) * k * (1 - s.sinking); ctx.drawImage(GLOW, p[0] - 30, p[1] - 30, 60, 60); }
        for (const b of s.blocks) if (b.alive && b.burn > 0) { const p = s.blockWorld(b); ctx.globalAlpha = 0.4 * k; ctx.drawImage(GLOW, p[0] - 14, p[1] - 14, 28, 28); }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (wt === 'storm') {
      ctx.fillStyle = 'rgba(205,222,255,0.38)';
      for (const r of this.rain) { const X = Math.round(r.x), Y = Math.round(r.y); ctx.fillRect(X, Y, 1, 2); ctx.fillRect(X + 1, Y + 2, 1, 2); }
      if (this.lightning > 0) { ctx.fillStyle = 'rgba(235,240,255,' + (this.lightning * 0.55) + ')'; ctx.fillRect(0, 0, W, H); }
    }
    ctx.drawImage(UI.vignette, 0, 0);
  }
  // ---------- HUD ----------
  drawHUD(ctx) {
    this.drawShipPanel(ctx, 0); this.drawShipPanel(ctx, 1);
    this.drawCenterPanel(ctx);
    if (this.hintT > 0 && this.state !== 'over') this.drawHints(ctx);
  }
  drawShipPanel(ctx, i) {
    const s = this.ships[i], c = this.ctrl[i], pw = 176, ph = 36;
    const X = (i === 0 ? 4 : W - pw - 4) + (this.lastHit[i] > 0 ? Math.round(rand(-1, 1)) : 0), y = 4;
    UI.panel(ctx, X, y, pw, ph, 'team' + i);
    const tag = c && c.human ? (this.o.mode === 'pvp' ? 'GRACZ ' + (i + 1) : 'TY') : (this.o.botName || 'BOT');
    Font.draw(ctx, s.name, X + 8, y + 7, { color: PAL.white, shadow: PAL.black });
    Font.draw(ctx, tag, X + pw - 8, y + 7, { color: TEAM[i].l, shadow: PAL.black, align: 'right' });
    const integ = s.alive ? s.integrity() : 0;
    UI.bar(ctx, X + 8, y + 18, 98, 4, integ, integ > 0.6 ? PAL.green : integ > 0.3 ? PAL.gold : PAL.red2);
    const cf = this.coreFlash[i] > 0 && (Math.floor(this.t * 12) & 1);
    ctx.drawImage(cf ? Icons.skull : Icons.heart, X + 110, y + 16);
    UI.bar(ctx, X + 120, y + 18, 48, 4, s.coreFrac(), cf ? PAL.white : PAL.red2);
    const arm = s.armament(), lab = (c && c.labels) || ['L', 'P', 'S'];
    let xx = X + 8; const yy = y + 26;
    for (const g of [[arm.L, lab[0]], [arm.R, lab[1]], [arm.S, lab[2]]]) {
      const list = g[0];
      Font.draw(ctx, g[1], xx, yy, { color: list.length ? PAL.silver : PAL.steel });
      xx += Font.measure(g[1]) + 3;
      const n = Math.min(list.length, 6);
      if (!n) { ctx.fillStyle = PAL.slate; ctx.fillRect(xx, yy + 3, 4, 1); xx += 7; }
      for (let q = 0; q < n; q++) {
        const f = clamp(list[q], 0, 1), ready = f >= 1;
        ctx.fillStyle = PAL.black; ctx.fillRect(xx, yy, 4, 7);
        ctx.fillStyle = PAL.navy; ctx.fillRect(xx + 1, yy + 1, 2, 5);
        const fh = Math.round(5 * f);
        ctx.fillStyle = ready ? (s.buff.powder > 0 ? PAL.yellow : PAL.gold) : PAL.steel;
        ctx.fillRect(xx + 1, yy + 6 - fh, 2, fh);
        xx += 4;
      }
      if (list.length > 6) { Font.draw(ctx, '+', xx + 1, yy, { color: PAL.silver }); xx += 6; }
      xx += 6;
    }
    // biegi żagli
    const gx = X + pw - 34;
    for (let q = 0; q < 4; q++) {
      const hh = 2 + q, on = s.throttle >= q && s.throttle > 0 && q > 0 || (q === 0 && s.throttle === 0);
      ctx.fillStyle = PAL.black; ctx.fillRect(gx + q * 5, yy + 7 - hh - 1, 4, hh + 1);
      ctx.fillStyle = q === 0 ? (s.throttle === 0 ? PAL.silver : PAL.slate) : (s.throttle >= q ? PAL.cyan : PAL.slate);
      ctx.fillRect(gx + q * 5 + 1, yy + 7 - hh, 2, hh);
      if (on && q === 0) { }
    }
    ctx.fillStyle = s.throttle < 0 ? PAL.red2 : PAL.slate; ctx.fillRect(gx + 21, yy + 2, 4, 4);
    if (s.throttle < 0) Font.draw(ctx, 'W', gx + 27, yy, { color: PAL.red2 });
    if (s.buff.powder > 0 && (Math.floor(this.t * 6) & 1)) ctx.drawImage(Icons.lightning, X + pw - 12, y + 16);
    if (s.buff.wind > 0) ctx.drawImage(Icons.crateWind, X + pw - 46, y - 2);
  }
  drawCenterPanel(ctx) {
    const w = 96, h = 38, x = W / 2 - w / 2, y = 4;
    UI.panel(ctx, x, y, w, h, 'wood');
    Font.draw(ctx, 'RUNDA ' + (this.o.round || 1), W / 2, y + 6, { align: 'center', color: PAL.sand, shadow: PAL.black });
    const need = this.o.winsNeeded || 2, wins = this.o.wins || [0, 0];
    for (let i = 0; i < 2; i++) for (let k = 0; k < need; k++) {
      const filled = k < wins[i], px = i === 0 ? x + 8 + k * 8 : x + w - 13 - k * 8;
      Font.draw(ctx, '★', px, y + 22, { color: filled ? TEAM[i].c : PAL.slate, shadow: PAL.black });
    }
    const cx = W / 2, cy = y + 25, a = this.wind.ang, dx = Math.sin(a), dy = -Math.cos(a);
    drawDisc(ctx, cx, cy, 8, PAL.black); drawDisc(ctx, cx, cy, 7, PAL.navy);
    ctx.fillStyle = PAL.slate; ctx.fillRect(cx, cy - 7, 1, 2); ctx.fillRect(cx, cy + 6, 1, 2); ctx.fillRect(cx - 7, cy, 2, 1); ctx.fillRect(cx + 6, cy, 2, 1);
    pline(ctx, cx - dx * 5, cy - dy * 5, cx + dx * 5, cy + dy * 5, PAL.silver);
    ctx.fillStyle = PAL.cyan; ctx.fillRect(Math.round(cx + dx * 5) - 1, Math.round(cy + dy * 5) - 1, 3, 3);
    ctx.fillStyle = PAL.white; ctx.fillRect(Math.round(cx + dx * 5), Math.round(cy + dy * 5), 1, 1);
    let msg = null, col = PAL.cyan;
    if (this.state === 'intro' || (this.state === 'fight' && this.time < 3)) { msg = WEATHER_NAME[this.weather]; col = PAL.sand; }
    else if (!this.whirl.on && WHIRL_T - this.time < 20) msg = 'WIR ZA ' + Math.ceil(WHIRL_T - this.time);
    else if (this.whirl.on && TIME_LIMIT - this.time < 30 && this.state === 'fight') { msg = 'KONIEC ZA ' + Math.ceil(TIME_LIMIT - this.time); col = PAL.gold; }
    if (msg) Font.draw(ctx, msg, W / 2, y + h + 5, { align: 'center', color: col, shadow: PAL.black });
  }
  drawHints(ctx) {
    const a = clamp(this.hintT, 0, 1);
    ctx.save(); ctx.globalAlpha = a;
    const rows = this.o.mode === 'pvp'
      ? [['GRACZ 1', 'W/S żagle  A/D ster  Q/E salwa burtą  SPACJA moździerz'], ['GRACZ 2', '↑/↓ żagle  ←/→ ster  , . salwa burtą  / moździerz']]
      : [['STER', 'W/S rozwiń/zwiń żagle   A/D skręt'], ['OGIEŃ', 'Q lewa burta   E prawa burta   SPACJA moździerz i działa dziobowe']];
    const h = rows.length * 11 + 8, w = 330, x = W / 2 - w / 2, y = H - h - 8;
    UI.panel(ctx, x, y, w, h, 'dark');
    rows.forEach((r, i) => {
      Font.draw(ctx, r[0], x + 8, y + 5 + i * 11, { color: i === 0 ? TEAM[0].l : (this.o.mode === 'pvp' ? TEAM[1].l : PAL.gold) });
      Font.draw(ctx, r[1], x + 58, y + 5 + i * 11, { color: PAL.silver });
    });
    ctx.restore();
  }
  drawBanner(ctx) {
    const b = this.banner; if (!b) return;
    const f = b.t / b.dur, pop = b.t < 0.2 ? ease.outBack(b.t / 0.2) : 1, a = f > 0.8 ? (1 - f) / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(W / 2, H / 2 - 24); ctx.scale(Math.max(0.05, pop), Math.max(0.05, pop));
    const sc = b.text.length <= 2 ? 6 : 4;
    Font.draw(ctx, b.text, 0, -3.5 * sc, { align: 'center', scale: sc, color: b.col, outline: PAL.black });
    if (b.sub) Font.draw(ctx, b.sub, 0, 4 * sc + 2, { align: 'center', color: PAL.white, outline: PAL.black });
    ctx.restore();
  }
}
