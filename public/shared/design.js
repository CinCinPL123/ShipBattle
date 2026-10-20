'use strict';
/* =========================================================
   Projekt okrętu: zasady stoczni i fizyka konstrukcji
   Komórka siatki: null, { p, q } (sam kadłub albo kajuta)
   albo { p, q, h } - element p (jakość q) postawiony na kadłubie h.
   ========================================================= */
const Design = {
  inb: (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS && HULL_OK[r * COLS + c] === 1,
  create() { const a = new Array(COLS * ROWS).fill(null); a[CORE_R * COLS + CORE_C] = { p: 'core', q: 0 }; return a; },
  clone(a) { return a.map(x => x ? (x.h ? { p: x.p, q: x.q, h: x.h } : { p: x.p, q: x.q }) : null); },
  get(a, c, r) { return Design.inb(c, r) ? a[r * COLS + c] : null; },
  kind(a, c, r) { const x = Design.get(a, c, r); return x ? x.p : null; },
  open(a, c, r) { return !Design.get(a, c, r); },
  value(a) { let s = 0; for (const x of a) if (x) s += cellValue(x); return s; },
  count(a) { let n = 0; for (const x of a) if (x) n++; return n; },
  list(a) { const o = []; a.forEach((x, i) => { if (x) o.push({ p: x.p, q: x.q, h: baseOf(x), c: i % COLS, r: (i / COLS) | 0 }); }); return o; },
  encode(a) { const o = []; a.forEach((x, i) => { if (x) o.push(i, cellStr(x)); }); return o; },
  decode(list) {
    const a = new Array(COLS * ROWS).fill(null);
    if (!Array.isArray(list)) return Design.create();
    for (let k = 0; k + 1 < list.length; k += 2) {
      const i = list[k] | 0, cl = cellParse(list[k + 1]);
      if (i >= 0 && i < a.length && HULL_OK[i] && cl) a[i] = cl;
    }
    a[CORE_R * COLS + CORE_C] = { p: 'core', q: 0 };
    return a;
  },
  // wiersze znaków -> projekt (szablony botów i łódź startowa); elementy dostają kadłub `base` (domyślnie sosnowy)
  fromRows(rows, q, base) {
    const a = Design.create();
    rows.forEach((row, r) => {
      for (let c = 0; c < COLS && c < row.length; c++) {
        const p = TPL_KEY[row[c]];
        if (!p || p === 'core' || !Design.inb(c, r)) continue;
        a[r * COLS + c] = PARTS[p].cat === 'hull'
          ? { p: base && p === 'hull' ? base : p, q: 0 }
          : { p, q: hasQ(p) ? (q || 0) : 0, h: base || 'hull' };
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
  // Stawianie przedmiotu it = { p, q } w (c, r). Kadłub (materiał) stawia się na pustym kaflu przy okręcie albo
  // zastępuje kadłub pod spodem (element zostaje). Element (działo, maszt, sprzęt) wymaga kadłuba pod spodem.
  // price: ile kosztuje (sklep) - z ładowni 0; dead: kafel jest zniszczony (czeka na naprawę).
  // Zwraca { ok, price, cell (nowy kafel), displaced (przedmioty wracające do ładowni) } albo { ok:false, reason }.
  canPlace(a, c, r, it, gold, price, noReplace, dead) {
    if (!Design.inb(c, r)) return { ok: false, reason: '' };
    const cur = a[r * COLS + c], P = PARTS[it.p];
    if (cur && cur.p === 'core') return { ok: false, reason: P.cat === 'hull' ? 'Kajuty kapitana nie da się wymienić' : 'Na kajucie nic nie postawisz' };
    let cell, displaced = [];
    if (P.cat === 'hull') {
      if (cur && baseOf(cur) === it.p && !dead) return { ok: false, reason: '', same: true };
      if (cur && noReplace) return { ok: false, reason: '', same: true };
      if (!cur && !DIRS4.some(d => Design.get(a, c + d[0], r + d[1]))) return { ok: false, reason: 'Część musi łączyć się z okrętem' };
      cell = cur && mounted(cur) && !dead ? { p: cur.p, q: cur.q, h: it.p } : { p: it.p, q: 0 };
      if (cur && !dead) displaced.push({ p: baseOf(cur), q: 0 });
    } else {
      if (!cur) return { ok: false, reason: NEED_HULL_MSG };
      if (dead) return { ok: false, reason: 'Ta część jest zniszczona - napraw okręt albo zdejmij ją' };
      if (mounted(cur) && cur.p === it.p && cur.q === it.q) return { ok: false, reason: '', same: true };
      if (mounted(cur) && noReplace) return { ok: false, reason: '', same: true };
      cell = { p: it.p, q: it.q, h: baseOf(cur) };
      if (mounted(cur)) displaced.push({ p: cur.p, q: cur.q });
    }
    if (price > gold) return { ok: false, reason: 'Brakuje złota: potrzeba ' + price, gold: true };
    const b = a.slice(); b[r * COLS + c] = cell;
    if (!Design.ruleOK(b, c, r, cell.p)) return { ok: false, reason: RULE_MSG[PARTS[cell.p].rule] };
    return { ok: true, price, cell, displaced };
  },
  // Zdejmuje wierzchni przedmiot: element (kadłub zostaje) albo - gdy kafel jest goły lub zniszczony (whole) - cały kafel
  // razem ze wszystkim, co straciło połączenie z kajutą. Zwraca { removed: [{ c, r, p, q, i }] } albo null.
  removeTop(a, c, r, whole) {
    const i = r * COLS + c, x = a[i];
    if (!x || x.p === 'core') return null;
    const removed = [], push = (k, cl) => {
      const cc = k % COLS, rr = (k / COLS) | 0;
      removed.push({ c: cc, r: rr, p: cl.p, q: cl.q, i: k });
      if (mounted(cl)) removed.push({ c: cc, r: rr, p: cl.h, q: 0, i: k });
    };
    if (mounted(x) && !whole) { a[i] = { p: x.h, q: 0 }; removed.push({ c, r, p: x.p, q: x.q, i }); return { removed }; }
    a[i] = null; push(i, x);
    const conn = Design.connected(a);
    for (let k = 0; k < a.length; k++) if (a[k] && !conn.has(k)) { push(k, a[k]); a[k] = null; }
    return { removed };
  },
  blocked(a) { const o = []; a.forEach((x, i) => { if (x && !Design.ruleOK(a, i % COLS, (i / COLS) | 0, x.p)) o.push(i); }); return o; },
  // mnożnik tempa ładowania działa: prochownia obok (x1,67) i bębny w promieniu dwóch kafli (najlepszy się liczy)
  rateK(a, c, r) {
    let keg = false, drum = 0;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const x = (dc || dr) ? Design.get(a, c + dc, r + dr) : null;
      if (!x) continue;
      if (x.p === 'keg' && Math.abs(dc) <= 1 && Math.abs(dr) <= 1) keg = true;
      if (x.p === 'drum') drum = Math.max(drum, drumK(x.q));
    }
    return (keg ? 1 / 0.6 : 1) * (1 + drum);
  },
  // mnożnik obrażeń od sąsiedniej zbrojowni (najlepsza się liczy)
  armK(a, c, r) {
    let k = 1;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const x = (dc || dr) ? Design.get(a, c + dc, r + dr) : null;
      if (x && x.p === 'armory') k = Math.max(k, armoryK(x.q));
    }
    return k;
  },
  stats(a) {
    const list = Design.list(a), ph = shipPhys(list);
    const open = (c, r) => Design.open(a, c, r);
    let fire = 0, nG = 0, nM = 0, nS = 0, nest = 0;
    for (const b of list) if (b.p === 'nest') nest++;
    const rngK = 1 + Math.min(2, nest) * 0.12;
    const relic = new Set(list.filter(b => isRelic(b.p)).map(b => b.p));
    let range = 0;
    for (const b of list) {
      const P = PARTS[b.p]; if (!P.w) continue;
      const Wd = WEAPONS[P.w], Q = QUAL[b.q];
      if (Wd.side && !Design.facing(open, b.c, b.r)) continue;
      const dmg = Wd.dmg * (Wd.pel || 1) * (Wd.arc ? 1.6 : 1) * Q.dmg * Design.armK(a, b.c, b.r) * (relic.has('dread') ? 1.2 : 1);
      fire += dmg * Design.rateK(a, b.c, b.r) / (Wd.reload * Q.rl);
      if (Wd.mortar) nM++; else if (!Wd.mine) nG++;
      if (Wd.spd) range = Math.max(range, ballRange(Wd.spd * Q.rng * rngK, Wd.vz));
      else if (Wd.range && !Wd.mortar) range = Math.max(range, Wd.range * Q.rng * rngK);
    }
    for (const b of list) if (b.p === 'mast' || b.p === 'lateen') nS++;
    const value = Design.value(a), speed = physSpeed(ph, relic.has('storm') ? 0.85 : 0.8) * (relic.has('figure') ? 1.12 : 1);
    return { ph, speed, turn: physTurn(ph, 1), fire, hp: ph.hp, load: ph.load, nG, nM, nS, n: list.length, value, power: shipPower(value), range, relic };
  }
};
const TPL_KEY = {
  H: 'hull', b: 'bamboo', D: 'oak', Y: 'mahog', A: 'iron', n: 'thorn', Z: 'steel', G: 'ghostw',
  C: 'cannon', L: 'longgun', X: 'carro', F: 'firegun', N: 'chain', U: 'bombard', x: 'ballista',
  V: 'swivel', v: 'turret', k: 'tesla', Q: 'rocket', E: 'flame', J: 'harpoon', M: 'mortar', I: 'mines', T: 'ram',
  S: 'mast', P: 'jib', l: 'lateen', O: 'oars', w: 'paddle', R: 'rudder', p: 'steam',
  K: 'keg', a: 'armory', d: 'drum', W: 'carp', u: 'pump', h: 'shield', B: 'nest', z: 'crane', g: 'magnet', '@': 'core'
};
// Szkielet kadłuba do szablonów: hw[i] = pół-szerokość rzędu r0 + i (dziób u góry); items = [litera, rząd, przesunięcie od osi].
// Przesunięcie: liczba (0 = oś, >0 = para burtowa), 'e' = skrajny kafel rzędu, 'e-1' = jeden kafel w głąb.
function mkRows(r0, hw, items, hullCh) {
  const g = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  hw.forEach((w, i) => { const r = r0 + i; if (r >= 0 && r < ROWS) for (let c = CORE_C - w; c <= CORE_C + w; c++) g[r][c] = hullCh || 'H'; });
  g[CORE_R][CORE_C] = '@';
  for (const [ch, r, off] of items) {
    const w = hw[r - r0];
    if (w === undefined) continue;
    let o = off;
    if (typeof o === 'string') { const m = /^e(?:-(\d+))?$/.exec(o); o = w - (m && m[1] ? +m[1] : 0); }
    for (const c of o === 0 ? [CORE_C] : [CORE_C - o, CORE_C + o]) if (c >= 0 && c < COLS && g[r][c] !== '.' && g[r][c] !== '@') g[r][c] = ch;
  }
  return g.map(row => row.join(''));
}
// łódź startowa: spiczasty dziób, tępa rufa, maszt, dwie armaty, dwa wiosła i ster
const STARTER_ROWS = mkRows(13, [0, 1, 1, 2, 2, 2, 1], [['S', 15, 0], ['C', 16, 'e'], ['O', 17, 'e'], ['R', 19, 0]]);
function shipPower(value) { return Math.round(value / 10); }
function armoryK(q) { return 1 + 0.25 * QUAL[q || 0].pow; }
function drumK(q) { return 0.12 * QUAL[q || 0].pow; }
function shieldK(q) { return Math.min(0.4, 0.2 * QUAL[q || 0].pow); }
function magnetRange(q) { return 55 * QUAL[q || 0].pow; }
// zasięg kuli wystrzelonej z wysokości BALL_Z0
function ballRange(spd, vz) { return spd * (vz + Math.sqrt(vz * vz + 2 * BALL_G * BALL_Z0)) / BALL_G; }

// ---------- fizyka konstrukcji ----------
// lista: [{p, q, h, c, r, f (ułamek hp), hp}] - masa i wypór to suma kadłuba i elementu na nim
function shipPhys(list) {
  let mass = 0, buoy = 0, mx = 0, my = 0, hp = 0, sail = 0, lat = 0, oar = 0, oarTurn = 0, nOar = 0, nMast = 0, steam = 0;
  const rud = [], cm = [];
  for (const b of list) {
    const P = PARTS[b.p], Hh = b.h && b.h !== b.p ? PARTS[b.h] : null, f = b.f === undefined ? 1 : b.f, pw = hasQ(b.p) ? QUAL[b.q || 0].pow : 1;
    const m = P.mass + (Hh ? Hh.mass : 0);
    cm.push(m);
    mass += m; buoy += P.buoy + (Hh ? Hh.buoy : 0); mx += m * b.c; my += m * b.r;
    hp += b.hp === undefined ? (Hh ? partHp(b.h, 0) : 0) + partHp(b.p, b.q) : b.hp;
    const fk = 0.5 + 0.5 * f;
    if (b.p === 'mast') { sail += 32 * pw * (0.45 + 0.55 * f); nMast++; }
    if (b.p === 'lateen') lat += 24 * pw * (0.45 + 0.55 * f);
    if (b.p === 'oars') { oar += 11 * pw * fk; oarTurn += 0.45 * pw * fk; nOar++; }
    if (b.p === 'paddle') { oar += 14 * pw * fk; oarTurn += 0.35 * pw * fk; nOar++; }
    if (b.p === 'rudder') rud.push(pw * fk);
    if (b.p === 'jib') { sail += 14 * pw * (0.45 + 0.55 * f); oarTurn += 0.3 * pw * fk; }
    if (b.p === 'steam') steam += 24 * pw * fk;
  }
  if (!mass) mass = 1;
  const comC = mx / mass, comR = my / mass;
  let I = mass * 0.6;
  list.forEach((b, k) => { const dx = b.c - comC, dy = b.r - comR; I += cm[k] * (dx * dx + dy * dy); });
  rud.sort((a, b) => b - a);
  let rudder = 0; rud.forEach((f, i) => { rudder += 1.7 * Math.pow(0.5, i) * f; });
  const load = mass / Math.max(1, buoy);
  const over = load <= 1 ? 1 : Math.max(0.3, 1 - (load - 1) * 1.6);
  return { mass, buoy, load, over, comC, comR, I, sail, lat, oar, oarTurn, nOar, nMast, rudder, hp, steam, coreT: 5 };
}
// żagiel łaciński prawie nie traci mocy pod wiatr
function physThrust(ph, windF) { return ph.coreT + ph.sail * windF + (ph.lat || 0) * (0.75 + 0.25 * windF) + ph.oar + (ph.steam || 0); }
function physSpeed(ph, windF) { return Math.min(90, 8.6 * physThrust(ph, windF) / Math.sqrt(ph.mass) * ph.over); }
function physAccel(ph, windF) { return clamp(physThrust(ph, windF) / ph.mass * 1.3, 0.3, 2.0); }
// duże okręty skręcają wolniej, ale nie jak barki: moment bezwładności liczy się z wykładnikiem 0,35
function physTurn(ph, speedFrac) {
  return clamp((0.7 + ph.oarTurn + ph.rudder * clamp(speedFrac * 1.2, 0.25, 1)) * 3.28 / Math.pow(ph.I, 0.35), 0.25, 2.6);
}
// współczynnik wiatru dla żagli: 1 = z wiatrem, 0.45 = pod wiatr
function windFactor(heading, windAng) { return 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(angDiff(heading, windAng))); }
