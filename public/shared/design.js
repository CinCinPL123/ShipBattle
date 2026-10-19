'use strict';
/* =========================================================
   Projekt okrętu: zasady stoczni i fizyka konstrukcji
   Komórka siatki: null albo { p: rodzaj części, q: jakość }
   ========================================================= */
const Design = {
  inb: (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS,
  create() { const a = new Array(COLS * ROWS).fill(null); a[CORE_R * COLS + CORE_C] = { p: 'core', q: 0 }; return a; },
  clone(a) { return a.map(x => x ? { p: x.p, q: x.q } : null); },
  get(a, c, r) { return Design.inb(c, r) ? a[r * COLS + c] : null; },
  kind(a, c, r) { const x = Design.get(a, c, r); return x ? x.p : null; },
  open(a, c, r) { return !Design.get(a, c, r); },
  value(a) { let s = 0; for (const x of a) if (x) s += itemValue(x.p, x.q); return s; },
  count(a) { let n = 0; for (const x of a) if (x) n++; return n; },
  list(a) { const o = []; a.forEach((x, i) => { if (x) o.push({ p: x.p, q: x.q, c: i % COLS, r: (i / COLS) | 0 }); }); return o; },
  encode(a) { const o = []; a.forEach((x, i) => { if (x) o.push(i, cellStr(x)); }); return o; },
  decode(list) {
    const a = new Array(COLS * ROWS).fill(null);
    if (!Array.isArray(list)) return Design.create();
    for (let k = 0; k + 1 < list.length; k += 2) {
      const i = list[k] | 0, cl = cellParse(list[k + 1]);
      if (i >= 0 && i < a.length && cl) a[i] = cl;
    }
    a[CORE_R * COLS + CORE_C] = { p: 'core', q: 0 };
    return a;
  },
  // wiersze znaków -> projekt (szablony botów i tratwa startowa)
  fromRows(rows, q) {
    const a = Design.create();
    rows.forEach((row, r) => {
      for (let c = 0; c < COLS && c < row.length; c++) {
        const p = TPL_KEY[row[c]];
        if (p && p !== 'core') a[r * COLS + c] = { p, q: hasQ(p) ? (q || 0) : 0 };
      }
    });
    return a;
  },
  ruleOK(a, c, r, p) {
    const R = PARTS[p].rule; if (!R) return true;
    const o = (dc, dr) => Design.open(a, c + dc, r + dr);
    if (R === 'edge') return o(-1, 0) || o(1, 0) || o(0, -1) || o(0, 1);
    if (R === 'side') return o(-1, 0) || o(1, 0);
    if (R === 'stern') return o(0, 1);
    if (R === 'bow') return o(0, -1);
    return true;
  },
  // dokąd strzela działo burtowe stojące w (c, r)
  facing(open, c, r) {
    const L = open(c - 1, r), R = open(c + 1, r);
    if (L && R) return 'LR'; if (L) return 'L'; if (R) return 'R';
    if (open(c, r - 1)) return 'U'; if (open(c, r + 1)) return 'D';
    return null;
  },
  connected(a) {
    const seen = new Set(), q = [CORE_R * COLS + CORE_C];
    seen.add(q[0]);
    while (q.length) {
      const i = q.pop(), c = i % COLS, r = (i / COLS) | 0;
      for (const d of DIRS4) {
        const nc = c + d[0], nr = r + d[1];
        if (!Design.inb(nc, nr)) continue;
        const j = nr * COLS + nc;
        if (a[j] && !seen.has(j)) { seen.add(j); q.push(j); }
      }
    }
    return seen;
  },
  // price: ile kosztuje postawienie (sklep) - z ładowni 0
  canPlace(a, c, r, it, gold, price, noReplace) {
    if (!Design.inb(c, r)) return { ok: false, reason: '' };
    const cur = a[r * COLS + c];
    if (cur && cur.p === 'core') return { ok: false, reason: 'Kajuty kapitana nie da się wymienić' };
    if (cur && cur.p === it.p && cur.q === it.q) return { ok: false, reason: '', same: true };
    if (cur && noReplace) return { ok: false, reason: '', same: true };
    if (!cur && !DIRS4.some(d => Design.get(a, c + d[0], r + d[1]))) return { ok: false, reason: 'Część musi łączyć się z okrętem' };
    if (price > gold) return { ok: false, reason: 'Brakuje złota: potrzeba ' + price, gold: true };
    if (!Design.ruleOK(a, c, r, it.p)) return { ok: false, reason: RULE_MSG[PARTS[it.p].rule] };
    return { ok: true, price, replace: cur };
  },
  // usuwa część i wszystko, co straciło połączenie z kajutą
  removeAt(a, c, r) {
    const i = r * COLS + c, x = a[i];
    if (!x || x.p === 'core') return null;
    a[i] = null;
    const conn = Design.connected(a), removed = [{ c, r, p: x.p, q: x.q, i }];
    for (let k = 0; k < a.length; k++) if (a[k] && !conn.has(k)) {
      removed.push({ c: k % COLS, r: (k / COLS) | 0, p: a[k].p, q: a[k].q, i: k }); a[k] = null;
    }
    return { removed };
  },
  blocked(a) { const o = []; a.forEach((x, i) => { if (x && !Design.ruleOK(a, i % COLS, (i / COLS) | 0, x.p)) o.push(i); }); return o; },
  kegNear(a, c, r) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dc || dr) && Design.kind(a, c + dc, r + dr) === 'keg') return true;
    return false;
  },
  stats(a) {
    const list = Design.list(a), ph = shipPhys(list);
    const open = (c, r) => Design.open(a, c, r);
    let fire = 0, nG = 0, nM = 0, nS = 0, nest = 0;
    for (const b of list) if (b.p === 'nest') nest++;
    const rngK = 1 + Math.min(2, nest) * 0.12;
    let range = 0;
    for (const b of list) {
      const P = PARTS[b.p]; if (!P.w) continue;
      const Wd = WEAPONS[P.w], Q = QUAL[b.q], keg = Design.kegNear(a, b.c, b.r) ? 0.6 : 1;
      if (Wd.side && !Design.facing(open, b.c, b.r)) continue;
      const dmg = Wd.dmg * (Wd.pel || 1) * Q.dmg;
      fire += dmg / (Wd.reload * Q.rl * keg);
      if (Wd.mortar) nM++; else nG++;
      if (Wd.spd) range = Math.max(range, ballRange(Wd.spd * Q.rng * rngK, Wd.vz));
    }
    for (const b of list) if (b.p === 'mast') nS++;
    const value = Design.value(a);
    return { ph, speed: physSpeed(ph, 0.8), turn: physTurn(ph, 1), fire, hp: ph.hp, load: ph.load, nG, nM, nS, n: list.length, value, power: shipPower(value), range };
  }
};
const TPL_KEY = {
  H: 'hull', D: 'oak', Y: 'mahog', A: 'iron', Z: 'steel', G: 'ghostw', C: 'cannon', L: 'longgun', X: 'carro', F: 'firegun', N: 'chain',
  V: 'swivel', M: 'mortar', T: 'ram', S: 'mast', O: 'oars', R: 'rudder', K: 'keg', W: 'carp', B: 'nest', '@': 'core'
};
const STARTER_ROWS = ['...........', '...........', '...........', '...........', '...........', '.....H.....', '....CSC....', '....H@H....', '....OHO....', '.....R.....',
  '...........', '...........', '...........', '...........', '...........'];
function shipPower(value) { return Math.round(value / 10); }
// zasięg kuli wystrzelonej z wysokości BALL_Z0
function ballRange(spd, vz) { return spd * (vz + Math.sqrt(vz * vz + 2 * BALL_G * BALL_Z0)) / BALL_G; }

// ---------- fizyka konstrukcji ----------
// lista: [{p, q, c, r, f (ułamek hp), hp}]
function shipPhys(list) {
  let mass = 0, buoy = 0, mx = 0, my = 0, hp = 0, sail = 0, oar = 0, oarTurn = 0, nOar = 0, nMast = 0;
  const rud = [];
  for (const b of list) {
    const P = PARTS[b.p], f = b.f === undefined ? 1 : b.f, pw = hasQ(b.p) ? QUAL[b.q || 0].pow : 1;
    mass += P.mass; buoy += P.buoy; mx += P.mass * b.c; my += P.mass * b.r;
    hp += b.hp === undefined ? partHp(b.p, b.q) : b.hp;
    if (b.p === 'mast') { sail += 26 * pw * (0.45 + 0.55 * f); nMast++; }
    if (b.p === 'oars') { oar += 9 * pw * (0.5 + 0.5 * f); oarTurn += 0.45 * pw * (0.5 + 0.5 * f); nOar++; }
    if (b.p === 'rudder') rud.push(pw * (0.5 + 0.5 * f));
  }
  if (!mass) mass = 1;
  const comC = mx / mass, comR = my / mass;
  let I = mass * 0.6;
  for (const b of list) { const dx = b.c - comC, dy = b.r - comR; I += PARTS[b.p].mass * (dx * dx + dy * dy); }
  rud.sort((a, b) => b - a);
  let rudder = 0; rud.forEach((f, i) => { rudder += 1.7 * Math.pow(0.5, i) * f; });
  const load = mass / Math.max(1, buoy);
  const over = load <= 1 ? 1 : Math.max(0.3, 1 - (load - 1) * 1.6);
  return { mass, buoy, load, over, comC, comR, I, sail, oar, oarTurn, nOar, nMast, rudder, hp, coreT: 5 };
}
function physThrust(ph, windF) { return ph.coreT + ph.sail * windF + ph.oar; }
function physSpeed(ph, windF) { return Math.min(90, 8.6 * physThrust(ph, windF) / Math.sqrt(ph.mass) * ph.over); }
function physAccel(ph, windF) { return clamp(physThrust(ph, windF) / ph.mass * 1.3, 0.3, 2.0); }
function physTurn(ph, speedFrac) {
  return clamp((0.7 + ph.oarTurn + ph.rudder * clamp(speedFrac * 1.2, 0.25, 1)) * 7.5 / Math.sqrt(ph.I), 0.22, 2.6);
}
// współczynnik wiatru dla żagli: 1 = z wiatrem, 0.45 = pod wiatr
function windFactor(heading, windAng) { return 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(angDiff(heading, windAng))); }
