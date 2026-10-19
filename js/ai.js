'use strict';
/* =========================================================
   Bot: budowa okrętu i sterowanie w bitwie
   ========================================================= */
const TPL_KEY = { H: 'hull', A: 'armor', C: 'cannon', M: 'mortar', S: 'mast', O: 'oars', R: 'rudder', T: 'ram', K: 'keg', W: 'carp', '@': 'core' };
const TEMPLATES = {
  bryg: { arche: 'broad', rows: ['.........', '.........', '....H....', '...HHH...', '..CHSHC..', '..HHHHH..', '..CH@HC..', '..CHHHC..', '..CKSKC..', '..OHHHO..', '...HRH...', '.........', '.........'] },
  galeon: { arche: 'broad', rows: ['.........', '....H....', '...HHH...', '..CHSHC..', '.CHHHHHC.', '.HKHHHKH.', '.CHH@HHC.', '.HKHHHKH.', '.CHHSHHC.', '..OHHHO..', '..OHHHO..', '...HRH...', '.........'] },
  tratwa: { arche: 'broad', rows: ['.........', '.........', '.........', '.........', '.........', '...HHH...', '..CH@HC..', '..HHSHH..', '..OHHHO..', '...HRH...', '.........', '.........', '.........'] },
  taran: { arche: 'ram', rows: ['.........', '.........', '....T....', '...AHA...', '..OHSHO..', '...HHH...', '..OH@HO..', '...HHH...', '..CHHHC..', '...HRH...', '.........', '.........', '.........'] },
  mozdz: { arche: 'mortar', rows: ['.........', '.........', '....A....', '...AHA...', '..AHMHA..', '..HHSHH..', '..CW@WC..', '..HHMHH..', '..OHHHO..', '...HRH...', '.........', '.........', '.........'] },
  kliper: { arche: 'raider', rows: ['.........', '....H....', '...HSH...', '...CHC...', '..OHHHO..', '...HSH...', '...C@C...', '..OHHHO..', '...HSH...', '...CHC...', '....R....', '.........', '.........'] }
};
const ARCH_W = {
  broad: { cannon: 10, mast: 7, oars: 3, armor: 1.5, keg: 6, carp: 2.5, mortar: 2, rudder: 9, ram: 0, ext: 4 },
  ram: { cannon: 3, mast: 7, oars: 6, armor: 7, keg: 0, carp: 3, mortar: 1, rudder: 9, ram: 12, ext: 3 },
  mortar: { cannon: 4, mast: 5, oars: 3, armor: 6, keg: 3, carp: 6, mortar: 9, rudder: 9, ram: 0, ext: 3 },
  raider: { cannon: 7, mast: 9, oars: 7, armor: 0.5, keg: 4, carp: 1.5, mortar: 1, rudder: 9, ram: 1, ext: 3 }
};
const ARCH_NAME = { broad: 'Burtowiec', ram: 'Taranowiec', mortar: 'Moździerzowiec', raider: 'Kliper' };
const AIBuild = {
  fromRows(rows) {
    const a = Design.create();
    rows.forEach((row, r) => { for (let c = 0; c < COLS; c++) { const p = TPL_KEY[row[c]]; if (p && p !== 'core') a[r * COLS + c] = p; } });
    return a;
  },
  mirrorIdx(i) { const c = i % COLS, r = (i / COLS) | 0; return r * COLS + (COLS - 1 - c); },
  setPair(a, i, p) { a[i] = p; const m = this.mirrorIdx(i); if (m !== i) a[m] = p; },
  pairCost(i) { return this.mirrorIdx(i) === i ? 1 : 2; },
  fixRules(a) {
    let changed = true, g = 0;
    while (changed && g++ < 10) { changed = false; for (const i of Design.blocked(a)) { a[i] = 'hull'; changed = true; } }
  },
  trim(a, budget, W, rng) {
    let guard = 0;
    while (Design.cost(a) > budget && guard++ < 300) {
      let best = null;
      a.forEach((p, i) => {
        if (!p || p === 'core') return;
        const c = i % COLS, r = (i / COLS) | 0;
        if (c > 4) return;
        const dist = Math.abs(c - CORE_C) + Math.abs(r - CORE_R);
        let sc, type;
        if (p !== 'hull') { type = 'down'; sc = (W[p] || 4) + rng() * 2; }
        else {
          const b = a.slice(); b[i] = null; const m = this.mirrorIdx(i); if (m !== i) b[m] = null;
          if (Design.connected(b).size !== Design.count(b)) return;
          type = 'rm'; sc = 7 - dist * 0.6 + rng() * 1.5;
        }
        if (!best || sc < best.sc) best = { i, type, sc };
      });
      if (!best) break;
      this.setPair(a, best.i, best.type === 'down' ? 'hull' : null);
    }
    this.fixRules(a);
  },
  upgrades(a, W, gold) {
    const out = [];
    const cnt = p => a.filter(x => x === p).length;
    const nMast = cnt('mast'), nOar = cnt('oars'), nMort = cnt('mortar'), nRud = cnt('rudder'), nRam = cnt('ram'), nKeg = cnt('keg'), nCarp = cnt('carp'), nArm = cnt('armor');
    const st = Design.stats(a);
    const add = (i, p, v) => {
      const cur = a[i], k = this.pairCost(i), cost = (PARTS[p].cost - (cur ? PARTS[cur].cost : 0)) * k;
      if (cost > gold || cost <= 0 && cur) return;
      const b = a.slice(); this.setPair(b, i, p);
      if (Design.blocked(b).length > Design.blocked(a).length) return;
      if (!Design.ruleOK(b, i % COLS, (i / COLS) | 0, p)) return;
      const s2 = Design.stats(b);
      if (s2.load > 0.93 && p !== 'hull') v -= 8;
      out.push({ i, p, v: v / Math.max(1, k * 0.6), cost });
    };
    for (let i = 0; i < a.length; i++) {
      const c = i % COLS, r = (i / COLS) | 0;
      if (c > 4) continue;
      const p = a[i];
      const open = (dc, dr) => Design.open(a, c + dc, r + dr);
      const nearCore = Math.max(Math.abs(c - CORE_C), Math.abs(r - CORE_R)) <= 1;
      if (p === 'hull') {
        const side = open(-1, 0) || open(1, 0), any = side || open(0, -1) || open(0, 1);
        if (side) add(i, 'cannon', W.cannon - Math.max(0, st.nC - 8) * 1.5);
        if (side) add(i, 'oars', W.oars - nOar * 1.2);
        if (c === 4 && !a.some((q, j) => q === 'mast' && Math.abs(((j / COLS) | 0) - r) <= 1)) add(i, 'mast', W.mast - nMast * 3 + (st.speed < 35 ? 4 : 0));
        if (r <= CORE_R - 2) add(i, 'armor', W.armor - nArm * 0.4);
        if (!any && !nearCore) {
          let can = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (Design.get(a, c + dc, r + dr) === 'cannon') can++;
          if (can) add(i, 'keg', W.keg + can - nKeg * 2);
        }
        if (nearCore) add(i, 'carp', W.carp - nCarp * 3);
        if (!any && c >= 3) add(i, 'mortar', W.mortar - nMort * 4);
        if (c === 4 && open(0, 1) && !nRud) add(i, 'rudder', W.rudder);
        if (c === 4 && open(0, -1) && !nRam) add(i, 'ram', W.ram);
      } else if (!p) {
        if (r < 1 || r > 11 || c < 1) continue;
        let nb = 0;
        for (const d of DIRS4) if (Design.get(a, c + d[0], r + d[1])) nb++;
        if (!nb) continue;
        add(i, 'hull', W.ext + nb * 0.8 - Math.abs(r - CORE_R) * 0.3 + (st.load > 0.85 ? 4 : 0));
      }
    }
    return out;
  },
  spend(a, budget, W, rng, level) {
    for (let g = 0; g < 90; g++) {
      const gold = budget - Design.cost(a);
      if (gold < 5) break;
      const opts = this.upgrades(a, W, gold);
      if (!opts.length) break;
      opts.sort((x, y) => y.v - x.v);
      const k = level >= 2 ? 0 : level === 1 ? Math.floor(rng() * Math.min(3, opts.length)) : Math.floor(rng() * opts.length);
      const o = opts[k];
      if (o.v < 0 && level >= 1) break;
      this.setPair(a, o.i, o.p);
    }
    this.fixRules(a);
  },
  make(budget, level, arche) {
    const rng = Math.random;
    const pool = Object.keys(TEMPLATES).filter(k => !arche || TEMPLATES[k].arche === arche);
    const cands = pool.map(k => ({ k, cost: Design.cost(this.fromRows(TEMPLATES[k].rows)) }));
    cands.sort((x, y) => y.cost - x.cost);
    let choice = cands.find(c => c.cost <= budget * (1.05 + rng() * 0.15)) || cands[cands.length - 1];
    if (!arche && rng() < 0.4) choice = pick(cands);
    const T = TEMPLATES[choice.k], W = ARCH_W[T.arche];
    const a = this.fromRows(T.rows);
    this.trim(a, budget, W, rng);
    this.spend(a, budget, W, rng, level);
    return { cells: a, arche: T.arche, tpl: choice.k };
  },
  // kolejność odsłaniania budowy (od kajuty na zewnątrz)
  order(a) {
    const res = [], seen = new Set(), start = CORE_R * COLS + CORE_C, q = [start];
    seen.add(start);
    while (q.length) {
      const i = q.shift(); res.push(i);
      const c = i % COLS, r = (i / COLS) | 0;
      for (const d of DIRS4) {
        const nc = c + d[0], nr = r + d[1];
        if (!Design.inb(nc, nr)) continue;
        const j = nr * COLS + nc;
        if (a[j] && !seen.has(j)) { seen.add(j); q.push(j); }
      }
    }
    return res;
  }
};

const lerpAng = (a, b, t) => a + angDiff(a, b) * t;
const BOT_LV = [
  { react: 0.7, aim: 0.8, lead: 0.15, minVolley: 99, trig: 0.8, crate: 0.2, wobble: 1.0, orbit: 125 },
  { react: 0.3, aim: 0.34, lead: 0.8, minVolley: 2, trig: 0.25, crate: 0.6, wobble: 0.25, orbit: 100 },
  { react: 0.1, aim: 0.12, lead: 1.0, minVolley: 1, trig: 0.04, crate: 0.95, wobble: 0, orbit: 92 }
];
class BotCtrl {
  constructor(level, arche) {
    this.lv = level; this.arche = arche || 'broad'; this.p = BOT_LV[level];
    this.t = 0; this.side = 1; this.sideT = 0; this.hd = 0; this.thr = 2; this.backT = 0; this.stuckT = 0; this.fireCd = 0;
    this.labels = ['L', 'P', 'S']; this.human = false;
  }
  update(me, world, dt) {
    const foe = world.enemyOf(me);
    this.t -= dt; this.fireCd -= dt; this.sideT -= dt;
    if (this.t <= 0) { this.t = this.p.react * rand(0.7, 1.3); this.think(me, foe, world); }
    const diff = angDiff(me.ang, this.hd);
    me.turn = Math.abs(diff) < 0.06 ? 0 : clamp(diff * 3, -1, 1);
    me.throttle = this.thr;
    this.shoot(me, foe);
  }
  think(me, foe, world) {
    if (!foe || !foe.alive) { this.thr = 1; this.hd = me.ang + 0.3; return; }
    const dx = foe.x - me.x, dy = foe.y - me.y, d = Math.hypot(dx, dy), toFoe = headingTo(dx, dy);
    const arm = me.armament();
    const ldL = arm.L.filter(f => f >= 1).length, ldR = arm.R.filter(f => f >= 1).length;
    const hasC = arm.L.length + arm.R.length > 0, hasM = me.blocks.some(b => b.alive && b.p === 'mortar');
    // trzymaj się jednej burty; zmień tylko gdy na tej nie ma dział albo druga ma wyraźną przewagę
    const cur = this.side > 0 ? arm.R.length : arm.L.length, oth = this.side > 0 ? arm.L.length : arm.R.length;
    if (!this.sidePicked || (cur === 0 && oth > 0) || (oth >= cur + 3)) { this.side = arm.R.length >= arm.L.length ? 1 : -1; this.sidePicked = true; }
    const mode = ((this.arche === 'ram' && me.hasRam()) || (!hasC && !hasM)) ? 'ram' : (this.arche === 'mortar' && hasM) ? 'mortar' : 'broad';
    let hd, thr = 3;
    if (mode === 'ram') {
      if (this.backT > 0) { hd = toFoe + Math.PI * 0.8; thr = -1; this.backT -= this.p.react; }
      else {
        const lead = d / Math.max(30, Math.abs(me.speed) + 20) * this.p.lead;
        hd = headingTo(foe.x + foe.vx * lead - me.x, foe.y + foe.vy * lead - me.y);
        if (d < me.radius + foe.radius - 4) this.backT = 0.9;
      }
    } else {
      const Rp = mode === 'mortar' ? 170 : this.p.orbit;
      if (d > Rp + 90) { hd = toFoe - this.side * 0.35; thr = 3; }
      else {
        // orbita: styczna do okręgu wokół rywala z korektą odległości
        const off = clamp((d - Rp) / 55, -0.9, 0.9);
        hd = toFoe - this.side * (Math.PI / 2 - off);
        thr = Math.abs(off) < 0.4 && this.lv >= 1 ? 2 : 3;
      }
    }
    if (world.crates.length && rand(0, 1) < this.p.crate) {
      let best = null, bd = 1e9;
      for (const c of world.crates) { const q = Math.hypot(c.x - me.x, c.y - me.y); if (q < bd) { bd = q; best = c; } }
      if (best && bd < d * 0.75 && bd < 170) { hd = headingTo(best.x - me.x, best.y - me.y); thr = 3; }
    }
    if (world.whirl.on) {
      const cx = W / 2, cy = (ARENA.y0 + ARENA.y1) / 2, dw = Math.hypot(me.x - cx, me.y - cy);
      if (dw < world.whirl.r + 34) { hd = headingTo(me.x - cx, me.y - cy) + 0.5; thr = 3; }
    }
    if (Math.abs(me.speed) < 4 && thr > 0) { this.stuckT += this.p.react; if (this.stuckT > 1.6) { this.backT = 1; this.stuckT = 0; } }
    else this.stuckT = 0;
    if (this.backT > 0 && mode !== 'ram') { thr = -1; this.backT -= this.p.react; hd = me.ang + 0.9; }
    else hd = this.avoid(me, world, hd);
    if (this.p.wobble && chance(0.12)) hd += rand(-1, 1) * this.p.wobble;
    this.hd = hd; this.thr = thr;
  }
  avoid(me, world, hd) {
    const look = 24 + Math.abs(me.speed) * 1.3;
    for (let k = 1; k <= 3; k++) {
      const px = me.x + Math.sin(hd) * look * k * 0.5, py = me.y - Math.cos(hd) * look * k * 0.5;
      for (const isl of world.islands) {
        if (Math.hypot(px - isl.x, py - isl.y) < isl.r + me.halfW + 8) {
          const cross = Math.sin(hd) * (isl.y - me.y) + Math.cos(hd) * (isl.x - me.x);
          return hd + (cross > 0 ? -1 : 1) * 1.0;
        }
      }
      const m = 34;
      if (px < ARENA.x0 + m || px > ARENA.x1 - m || py < ARENA.y0 + m || py > ARENA.y1 - m)
        return lerpAng(hd, headingTo(W / 2 - me.x, (ARENA.y0 + ARENA.y1) / 2 - me.y), 0.75);
    }
    return hd;
  }
  shoot(me, foe) {
    if (!foe || !foe.alive || this.fireCd > 0) return;
    this.fireCd = this.p.trig;
    const d = Math.hypot(foe.x - me.x, foe.y - me.y);
    for (const side of ['L', 'R']) {
      const lc = me.loadedCount(side), n = lc[0], tot = lc[1];
      if (!n || n < Math.min(tot, this.p.minVolley)) continue;
      const nrm = me.ang + (side === 'L' ? -Math.PI / 2 : Math.PI / 2);
      const tt = d / BALL_SPEED * this.p.lead;
      const px = foe.x + foe.vx * tt - me.vx * tt * 0.8, py = foe.y + foe.vy * tt - me.vy * tt * 0.8;
      const dd = Math.hypot(px - me.x, py - me.y);
      const tol = this.p.aim * 0.5 + Math.atan2(foe.halfW * 0.75, Math.max(20, dd));
      if (Math.abs(angDiff(nrm, headingTo(px - me.x, py - me.y))) < tol && dd < 178) { me.fire(side); this.fireCd = Math.max(this.p.trig, 0.2); return; }
    }
    if (me.loadedCount('S')[0]) {
      const mort = me.blocks.some(b => b.alive && b.p === 'mortar' && b.rl <= 0);
      const h = headingTo(foe.x - me.x, foe.y - me.y);
      const ahead = Math.abs(angDiff(me.ang, h)) < 0.25 || Math.abs(angDiff(me.ang + Math.PI, h)) < 0.25;
      if ((mort && d < 270 && d > 40) || (ahead && d < 170)) { me.fire('S'); this.fireCd = 0.35; }
    }
  }
}
