'use strict';
/* =========================================================
   Boty: projekty okrętów NPC i sterowanie na otwartym morzu
   ========================================================= */
// Szablony: mkRows(rząd dziobu, pół-szerokości kolejnych rzędów, [[element, rząd, przesunięcie od osi]...], litera kadłuba).
// Kajuta zawsze stoi w rzędzie CORE_R, więc kadłub musi go obejmować.
const TEMPLATES = {
  barka: { arche: 'broad', rows: mkRows(14, [0, 1, 1, 1, 1, 0], [['S', 15, 0], ['C', 16, 'e'], ['O', 18, 'e'], ['R', 19, 0]]) },
  bryg: {
    arche: 'broad', rows: mkRows(11, [0, 1, 1, 2, 3, 3, 3, 3, 3, 2, 1], [
      ['P', 11, 0], ['B', 14, 0], ['S', 15, 0], ['S', 19, 0], ['C', 15, 'e'], ['C', 16, 'e'], ['C', 17, 'e'], ['C', 18, 'e'], ['K', 16, 'e-1'], ['K', 18, 'e-1'], ['W', 17, 1], ['O', 20, 'e'], ['R', 21, 0]])
  },
  kliper: {
    arche: 'raider', rows: mkRows(4, [0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1], [
      ['P', 4, 0], ['S', 10, 0], ['S', 15, 0], ['S', 20, 0], ['C', 12, 'e'], ['C', 15, 'e'], ['C', 18, 'e'], ['C', 21, 'e'], ['K', 15, 1], ['W', 17, 1],
      ['O', 13, 'e'], ['O', 17, 'e'], ['O', 22, 'e'], ['R', 26, 0]])
  },
  taran: {
    arche: 'ram', rows: mkRows(8, [0, 1, 1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 2], [
      ['T', 8, 0], ['A', 9, 0], ['A', 10, 1], ['A', 11, 1], ['A', 12, 2], ['S', 14, 0], ['S', 19, 0], ['O', 15, 'e'], ['O', 17, 'e'], ['O', 20, 'e'],
      ['C', 16, 'e'], ['C', 21, 'e'], ['W', 18, 1], ['R', 25, 0]])
  },
  mozdz: {
    arche: 'mortar', rows: mkRows(9, [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 3], [
      ['A', 10, 1], ['S', 13, 0], ['S', 19, 0], ['C', 14, 'e'], ['C', 21, 'e'], ['M', 15, 1], ['M', 17, 2], ['M', 20, 2], ['W', 16, 1], ['O', 16, 'e'], ['O', 22, 'e'], ['R', 24, 0]])
  },
  galeon: {
    arche: 'broad', rows: mkRows(5, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4], [
      ['P', 5, 0], ['B', 9, 0], ['S', 11, 0], ['S', 15, 0], ['S', 20, 0],
      ['C', 12, 'e'], ['C', 13, 'e'], ['C', 14, 'e'], ['C', 15, 'e'], ['C', 16, 'e'], ['C', 17, 'e'], ['C', 18, 'e'], ['C', 19, 'e'],
      ['K', 13, 'e-1'], ['K', 15, 'e-1'], ['K', 17, 'e-1'], ['K', 19, 'e-1'], ['W', 17, 1], ['O', 21, 'e'], ['R', 26, 0]])
  },
  fregata: {
    arche: 'broad', rows: mkRows(2, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 4], [
      ['P', 2, 0], ['B', 7, 0], ['S', 9, 0], ['S', 13, 0], ['S', 17, 0], ['S', 22, 0],
      ['L', 11, 'e'], ['C', 12, 'e'], ['C', 13, 'e'], ['L', 14, 'e'], ['C', 15, 'e'], ['C', 16, 'e'], ['L', 17, 'e'], ['C', 18, 'e'], ['C', 19, 'e'], ['L', 20, 'e'], ['C', 21, 'e'],
      ['K', 13, 'e-1'], ['K', 16, 'e-1'], ['K', 19, 'e-1'], ['W', 17, 1], ['W', 16, 2], ['M', 12, 3], ['M', 20, 3], ['O', 23, 'e'], ['R', 26, 0]])
  },
  // okręty zdarzeń
  widmo: {
    arche: 'broad', base: 'ghostw', rows: mkRows(4, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6, 5, 5, 4], [
      ['P', 4, 0], ['S', 10, 0], ['S', 15, 0], ['S', 20, 0], ['C', 13, 'e'], ['C', 15, 'e'], ['C', 18, 'e'], ['C', 20, 'e'], ['O', 14, 'e'], ['O', 16, 'e'], ['O', 19, 'e'],
      ['K', 14, 'e-1'], ['K', 18, 'e-1'], ['W', 17, 1], ['M', 17, 3], ['R', 24, 0]], 'G')
  },
  kupiec: {
    arche: 'raider', base: 'oak', rows: mkRows(8, [0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 2], [
      ['P', 8, 0], ['S', 11, 0], ['S', 15, 0], ['S', 20, 0], ['V', 13, 'e'], ['V', 18, 'e'], ['z', 16, 2], ['z', 18, 2], ['O', 16, 'e'], ['O', 21, 'e'], ['R', 25, 0]], 'D')
  },
  flagowiec: {
    arche: 'broad', base: 'oak', rows: mkRows(2, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 6, 6, 5], [
      ['T', 2, 0], ['A', 3, 0], ['A', 4, 0], ['A', 4, 1], ['A', 5, 1], ['A', 6, 2], ['S', 10, 0], ['S', 14, 0], ['S', 19, 0], ['S', 23, 0], ['B', 8, 0],
      ['Q', 11, 'e'], ['C', 12, 'e'], ['C', 13, 'e'], ['U', 14, 'e'], ['C', 15, 'e'], ['C', 16, 'e'], ['U', 18, 'e'], ['C', 19, 'e'], ['Q', 20, 'e'], ['C', 21, 'e'],
      ['O', 22, 'e'], ['O', 17, 'e'], ['K', 13, 'e-1'], ['K', 16, 'e-1'], ['K', 19, 'e-1'], ['W', 17, 1], ['W', 18, 2], ['v', 15, 3], ['v', 19, 3], ['R', 25, 0]], 'D')
  }
};
const NPC_ONLY = ['widmo', 'kupiec', 'flagowiec'];
const ARCH_W = {
  broad: { cannon: 10, mast: 7, oars: 3, iron: 1.5, keg: 6, carp: 2.5, mortar: 2, rudder: 9, ram: 0, ext: 4 },
  ram: { cannon: 3, mast: 7, oars: 6, iron: 7, keg: 0, carp: 3, mortar: 1, rudder: 9, ram: 12, ext: 3 },
  mortar: { cannon: 4, mast: 5, oars: 3, iron: 6, keg: 3, carp: 6, mortar: 9, rudder: 9, ram: 0, ext: 3 },
  raider: { cannon: 7, mast: 9, oars: 7, iron: 0.5, keg: 4, carp: 1.5, mortar: 1, rudder: 9, ram: 1, ext: 3 }
};
const AIBuild = {
  mirrorIdx(i) { const c = i % COLS, r = (i / COLS) | 0; return r * COLS + (COLS - 1 - c); },
  setPair(a, i, cell) {
    a[i] = cell ? Object.assign({}, cell) : null;
    const m = this.mirrorIdx(i);
    if (m !== i) a[m] = cell ? Object.assign({}, cell) : null;
  },
  pairCost(i) { return this.mirrorIdx(i) === i ? 1 : 2; },
  // elementy, którym zabrakło miejsca albo wody (np. po zdjęciu kadłuba), schodzą z pokładu
  fixRules(a) {
    for (let g = 0; g < 10; g++) {
      const bad = Design.blocked(a);
      if (!bad.length) break;
      for (const i of bad) a[i] = { p: baseOf(a[i]), q: 0 };
    }
  },
  trim(a, budget, W, rng) {
    let guard = 0;
    while (Design.value(a) > budget && guard++ < 500) {
      let best = null;
      a.forEach((x, i) => {
        if (!x || x.p === 'core') return;
        const c = i % COLS, r = (i / COLS) | 0;
        if (c > CORE_C) return;
        const dist = Math.abs(c - CORE_C) + Math.abs(r - CORE_R);
        let sc, type;
        // najpierw schodzą drogie elementy; kadłub ujmujemy dopiero na końcu i od końców okrętu, żeby kształt został statkiem
        if (mounted(x)) { type = 'down'; sc = (W[x.p] || 4) + rng() * 2; }
        else {
          const b = a.slice(); b[i] = null; const m = this.mirrorIdx(i); if (m !== i) b[m] = null;
          if (Design.connected(b).size !== Design.count(b)) return;
          type = 'rm'; sc = 60 - dist + rng() * 1.5;
        }
        if (!best || sc < best.sc) best = { i, type, sc };
      });
      if (!best) break;
      this.setPair(a, best.i, best.type === 'down' ? { p: a[best.i].h, q: 0 } : null);
    }
    this.fixRules(a);
  },
  upgrades(a, W, gold, q) {
    const out = [];
    const cnt = p => a.filter(x => x && x.p === p).length;
    const nMast = cnt('mast'), nOar = cnt('oars'), nMort = cnt('mortar'), nRud = cnt('rudder'), nRam = cnt('ram'), nKeg = cnt('keg'), nCarp = cnt('carp');
    const nArm = a.filter(x => x && baseOf(x) === 'iron').length;
    const st = Design.stats(a), ph = st.ph;
    const around = i => {
      const c = i % COLS, r = (i / COLS) | 0, s = [i];
      for (const d of DIRS4) if (Design.inb(c + d[0], r + d[1])) s.push((r + d[1]) * COLS + c + d[0]);
      return s;
    };
    const bad = (arr, idx) => { let n = 0; for (const j of idx) { const x = arr[j]; if (x && !Design.ruleOK(arr, j % COLS, (j / COLS) | 0, x.p)) n++; } return n; };
    const cellMass = cl => PARTS[cl.p].mass + (mounted(cl) ? PARTS[cl.h].mass : 0), cellBuoy = cl => PARTS[cl.p].buoy + (mounted(cl) ? PARTS[cl.h].buoy : 0);
    const add = (i, cell, v) => {
      const cur = a[i], k = this.pairCost(i), cost = (cellValue(cell) - (cur ? cellValue(cur) : 0)) * k;
      if (cost > gold || (cost <= 0 && cur)) return;
      const b = a.slice(), m = this.mirrorIdx(i), idx = around(i).concat(m !== i ? around(m) : []);
      this.setPair(b, i, cell);
      if (bad(b, idx) > bad(a, idx)) return;
      if (!Design.ruleOK(b, i % COLS, (i / COLS) | 0, cell.p)) return;
      const load2 = (ph.mass + (cellMass(cell) - (cur ? cellMass(cur) : 0)) * k) / Math.max(1, ph.buoy + (cellBuoy(cell) - (cur ? cellBuoy(cur) : 0)) * k);
      if (load2 > 1) return; // nie przeciążamy okrętu
      if (load2 > 0.93 && cell.p !== 'hull') v -= 8;
      out.push({ i, cell, v: v / Math.max(1, k * 0.6), cost });
    };
    for (let i = 0; i < a.length; i++) {
      const c = i % COLS, r = (i / COLS) | 0;
      if (c > CORE_C) continue;
      const x = a[i];
      if (!x) {
        if (r < 2 || r > ROWS - 3 || c < 1 || !Design.inb(c, r)) continue;
        // kadłub tylko uzupełniamy: nowy kafel musi mieć sąsiada od strony osi i podparcie w rzędzie obok - inaczej wyrastają dziwne ramiona
        if (!Design.get(a, c + 1, r) || !(Design.get(a, c, r - 1) || Design.get(a, c, r + 1))) continue;
        let nb = 0;
        for (const d of DIRS4) if (Design.get(a, c + d[0], r + d[1])) nb++;
        if (!nb) continue;
        add(i, { p: 'hull', q: 0 }, W.ext + nb * 0.8 - Math.abs(r - CORE_R) * 0.15 + (st.load > 0.85 ? 4 : 0));
        continue;
      }
      if (x.p !== 'hull') continue; // elementy stawia się tylko na zwykłym sosnowym kadłubie
      const open = (dc, dr) => Design.open(a, c + dc, r + dr);
      const mount = p => ({ p, q: hasQ(p) ? q : 0, h: 'hull' });
      const side = open(-1, 0) || open(1, 0), any = side || open(0, -1) || open(0, 1);
      const nearCore = Math.max(Math.abs(c - CORE_C), Math.abs(r - CORE_R)) <= 1;
      if (side) add(i, mount('cannon'), W.cannon - Math.max(0, st.nG - 14) * 1.5);
      if (side) add(i, mount('oars'), W.oars - nOar * 1.2);
      if (c === CORE_C && !a.some((y, j) => y && y.p === 'mast' && Math.abs(((j / COLS) | 0) - r) <= 2)) add(i, mount('mast'), W.mast - nMast * 3 + (st.speed < 35 ? 4 : 0));
      if (r <= CORE_R - 2) add(i, { p: 'iron', q: 0 }, W.iron - nArm * 0.15);
      if (!any && !nearCore) {
        let can = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (Design.kind(a, c + dc, r + dr) === 'cannon') can++;
        if (can) add(i, mount('keg'), W.keg + can - nKeg * 1.5);
      }
      if (nearCore) add(i, mount('carp'), W.carp - nCarp * 3);
      if (!any && c >= CORE_C - 1) add(i, mount('mortar'), W.mortar - nMort * 4);
      if (c === CORE_C && open(0, 1) && !nRud) add(i, mount('rudder'), W.rudder);
      if (c === CORE_C && open(0, -1) && !nRam) add(i, mount('ram'), W.ram);
    }
    return out;
  },
  spend(a, budget, W, rng, level, q) {
    for (let g = 0; g < 120; g++) {
      const gold = budget - Design.value(a);
      if (gold < 5) break;
      const opts = this.upgrades(a, W, gold, q);
      if (!opts.length) break;
      opts.sort((x, y) => y.v - x.v);
      const k = level >= 2 ? 0 : level === 1 ? Math.floor(rng() * Math.min(3, opts.length)) : Math.floor(rng() * opts.length);
      const o = opts[k];
      if (o.v < 0 && level >= 1) break;
      this.setPair(a, o.i, o.cell);
    }
    this.fixRules(a);
  },
  // zamiana poszycia na lepszy materiał, póki starcza budżetu
  harden(a, budget, mat) {
    if (!mat || mat === 'hull') return;
    const idx = [];
    a.forEach((x, i) => { if (x && x.p !== 'core' && baseOf(x) === 'hull' && i % COLS <= CORE_C) idx.push(i); });
    const d = i => Math.abs((i % COLS) - CORE_C) + Math.abs(((i / COLS) | 0) - CORE_R);
    idx.sort((i, j) => d(i) - d(j));
    // ciężki pancerz nie może zatopić własnego okrętu: pilnujemy przeciążenia
    const ph = Design.stats(a).ph;
    let mass = ph.mass, buoy = ph.buoy;
    for (const i of idx) {
      const k = this.pairCost(i), extra = (itemValue(mat, 0) - itemValue('hull', 0)) * k;
      if (Design.value(a) + extra > budget) break;
      mass += (PARTS[mat].mass - PARTS.hull.mass) * k; buoy += (PARTS[mat].buoy - PARTS.hull.buoy) * k;
      if (mass / Math.max(1, buoy) > 0.8) break;
      const x = a[i];
      this.setPair(a, i, mounted(x) ? { p: x.p, q: x.q, h: mat } : { p: mat, q: 0 });
    }
  },
  // pirat bez dział byłby tylko pływającą kłodą - dajemy mu przynajmniej parę armat przy burcie
  ensureGuns(a, q) {
    const guns = () => a.filter(x => x && WEAPONS[PARTS[x.p].w] && !WEAPONS[PARTS[x.p].w].mine).length;
    if (guns() >= 2) return;
    const cand = [];
    a.forEach((x, i) => {
      const c = i % COLS, r = (i / COLS) | 0;
      if (!x || x.p !== 'hull' || c >= CORE_C || (!Design.open(a, c - 1, r) && !Design.open(a, c + 1, r))) return;
      cand.push([Math.abs(r - CORE_R), i]);
    });
    cand.sort((x, y) => x[0] - y[0]);
    if (cand.length) this.setPair(a, cand[0][1], { p: 'cannon', q: hasQ('cannon') ? q : 0, h: 'hull' });
  },
  make(budget, level, o) {
    o = o || {};
    const rng = Math.random, q = o.q || 0;
    const pool = Object.keys(TEMPLATES).filter(k => !NPC_ONLY.includes(k) && (!o.arche || TEMPLATES[k].arche === o.arche));
    const cands = pool.map(k => ({ k, cost: Design.value(Design.fromRows(TEMPLATES[k].rows, q)) }));
    cands.sort((x, y) => y.cost - x.cost);
    let choice = cands.find(c => c.cost <= budget * (1.05 + rng() * 0.15)) || cands[cands.length - 1];
    if (!o.arche && rng() < 0.4) { const near = cands.filter(c => c.cost <= budget * 1.5); if (near.length) choice = pick(near); }
    const T = TEMPLATES[choice.k], W = ARCH_W[T.arche];
    const a = Design.fromRows(T.rows, q);
    this.trim(a, budget, W, rng);
    this.spend(a, budget * (o.mat ? 0.8 : 1), W, rng, level, q);
    this.harden(a, budget, o.mat);
    this.ensureGuns(a, q);
    return { cells: a, arche: T.arche, tpl: choice.k };
  }
};

// ---------- sterowanie botem ----------
const BOT_LV = [
  { react: 0.7, aim: 0.8, lead: 0.15, minVolley: 99, trig: 0.8, wobble: 1.0, orbit: 125, aggro: 260 },
  { react: 0.3, aim: 0.34, lead: 0.8, minVolley: 2, trig: 0.25, wobble: 0.25, orbit: 100, aggro: 340 },
  { react: 0.12, aim: 0.14, lead: 1.0, minVolley: 1, trig: 0.05, wobble: 0, orbit: 95, aggro: 420 }
];
class BotCtrl {
  constructor(level, arche, mode) {
    this.lv = level; this.arche = arche || 'broad'; this.mode = mode || 'pirate'; this.p = BOT_LV[level];
    this.t = 0; this.side = 1; this.hd = 0; this.thr = 2; this.backT = 0; this.stuckT = 0; this.fireCd = 0;
    this.foe = null; this.wp = null; this.human = false;
  }
  update(me, world, dt) {
    this.t -= dt; this.fireCd -= dt;
    if (this.t <= 0) { this.t = this.p.react * rand(0.7, 1.3); this.think(me, world); }
    const diff = angDiff(me.ang, this.hd);
    me.turn = Math.abs(diff) < 0.06 ? 0 : clamp(diff * 3, -1, 1);
    me.throttle = this.thr;
    if (this.mode !== 'merchant') this.shoot(me, this.foe);
  }
  validFoe(me, f, leash) {
    return f && f.alive && !f.dead && !f.safe && Math.hypot(f.x - me.x, f.y - me.y) < leash;
  }
  think(me, world) {
    const aggro = this.mode === 'ghost' ? 650 : this.p.aggro;
    if (!this.validFoe(me, this.foe, aggro * 1.9)) this.foe = world.findPrey(me, aggro);
    const foe = this.foe;
    let hd, thr = 3;
    if (this.mode === 'merchant') {
      const threat = world.findPrey(me, 460);
      if (threat) { hd = headingTo(me.x - threat.x, me.y - threat.y); thr = 3; }
      else { const w = this.waypoint(me, world); hd = headingTo(w.x - me.x, w.y - me.y); thr = 2; }
    } else if (!foe) {
      const w = this.waypoint(me, world);
      hd = headingTo(w.x - me.x, w.y - me.y); thr = 2;
    } else {
      const dx = foe.x - me.x, dy = foe.y - me.y, d = Math.hypot(dx, dy), toFoe = headingTo(dx, dy);
      const arm = me.armament();
      const hasC = arm.L.length + arm.R.length > 0, hasM = me.blocks.some(b => b.alive && b.p === 'mortar');
      const cur = this.side > 0 ? arm.R.length : arm.L.length, oth = this.side > 0 ? arm.L.length : arm.R.length;
      if (!this.sidePicked || (cur === 0 && oth > 0) || (oth >= cur + 3)) { this.side = arm.R.length >= arm.L.length ? 1 : -1; this.sidePicked = true; }
      const mode = ((this.arche === 'ram' && me.hasRam()) || (!hasC && !hasM)) ? 'ram' : (this.arche === 'mortar' && hasM) ? 'mortar' : 'broad';
      if (mode === 'ram') {
        if (this.backT > 0) { hd = toFoe + Math.PI * 0.8; thr = -1; this.backT -= this.p.react; }
        else {
          const lead = d / Math.max(30, Math.abs(me.speed) + 20) * this.p.lead;
          hd = headingTo(foe.x + foe.vx * lead - me.x, foe.y + foe.vy * lead - me.y);
          if (d < me.radius + foe.radius - 4) this.backT = 0.9;
        }
      } else {
        // duże okręty krążą szerzej - inaczej wpadałyby na cel
        const Rp = (mode === 'mortar' ? 170 : this.p.orbit) + (me.radius + foe.radius) * 0.25;
        if (d > Rp + 90) { hd = toFoe - this.side * 0.35; thr = 3; }
        else {
          const off = clamp((d - Rp) / 55, -0.9, 0.9);
          hd = toFoe - this.side * (Math.PI / 2 - off);
          thr = Math.abs(off) < 0.4 && this.lv >= 1 ? 2 : 3;
        }
      }
    }
    if (Math.abs(me.speed) < 4 && thr > 0) { this.stuckT += this.p.react; if (this.stuckT > 1.6) { this.backT = 1; this.stuckT = 0; } }
    else this.stuckT = 0;
    if (this.backT > 0 && !(foe && this.arche === 'ram')) { thr = -1; this.backT -= this.p.react; hd = me.ang + 0.9; }
    else hd = this.avoid(me, world, hd);
    if (this.p.wobble && chance(0.12)) hd += rand(-1, 1) * this.p.wobble;
    this.hd = hd; this.thr = thr;
  }
  waypoint(me, world) {
    if (!this.wp || Math.hypot(this.wp.x - me.x, this.wp.y - me.y) < 90 || chance(0.004)) this.wp = world.randomWaterPoint(zoneOf(me.x, me.y));
    return this.wp;
  }
  avoid(me, world, hd) {
    const look = 26 + Math.abs(me.speed) * 1.3;
    for (let k = 1; k <= 3; k++) {
      const px = me.x + Math.sin(hd) * look * k * 0.5, py = me.y - Math.cos(hd) * look * k * 0.5;
      if (!me.ghost) for (const isl of world.islandsNear(px, py, 90)) {
        if (Math.hypot(px - isl.x, py - isl.y) < isl.r + me.halfW + 10) {
          const cross = Math.sin(hd) * (isl.y - me.y) + Math.cos(hd) * (isl.x - me.x);
          return hd + (cross > 0 ? -1 : 1) * 1.0;
        }
      }
      for (const pt of world.ports) {
        if (Math.hypot(px - pt.x, py - pt.y) < pt.safe + 20) return headingTo(me.x - pt.x, me.y - pt.y) + 0.4;
      }
      const m = 90;
      if (px < m || px > WORLD - m || py < m || py > WORLD - m) return lerpAng(hd, headingTo(WCX - me.x, WCY - me.y), 0.75);
    }
    return hd;
  }
  shoot(me, foe) {
    if (!foe || !foe.alive || foe.safe || this.fireCd > 0) return;
    this.fireCd = this.p.trig;
    const d = Math.hypot(foe.x - me.x, foe.y - me.y);
    for (const side of ['L', 'R']) {
      const lc = me.loadedCount(side), n = lc[0], tot = lc[1];
      if (!n || n < Math.min(tot, this.p.minVolley)) continue;
      const nrm = me.ang + (side === 'L' ? -Math.PI / 2 : Math.PI / 2);
      const tt = d / 170 * this.p.lead;
      const px = foe.x + foe.vx * tt - me.vx * tt * 0.8, py = foe.y + foe.vy * tt - me.vy * tt * 0.8;
      const dd = Math.hypot(px - me.x, py - me.y);
      const tol = this.p.aim * 0.5 + Math.atan2(foe.halfW * 0.75, Math.max(20, dd));
      if (Math.abs(angDiff(nrm, headingTo(px - me.x, py - me.y))) < tol && dd < 178 * me.rngK + me.halfW) { me.fire(side); this.fireCd = Math.max(this.p.trig, 0.2); return; }
    }
    if (me.loadedCount('S')[0]) {
      const mort = me.blocks.some(b => b.alive && b.p === 'mortar' && b.rl <= 0);
      const h = headingTo(foe.x - me.x, foe.y - me.y);
      const ahead = Math.abs(angDiff(me.ang, h)) < 0.25 || Math.abs(angDiff(me.ang + Math.PI, h)) < 0.25;
      if ((mort && d < 280 && d > 40) || (ahead && d < 170)) { me.fire('S'); this.fireCd = 0.35; }
    }
  }
}
