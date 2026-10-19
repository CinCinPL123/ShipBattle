'use strict';
/* =========================================================
   Części okrętu, zasady stoczni i fizyka konstrukcji
   ========================================================= */
const PARTS = {
  hull:   { name: 'Poszycie', cost: 5, mass: 2, buoy: 6, hp: 20, mat: 'wood', rule: null, pitch: 1.0,
    desc: 'Podstawa każdego okrętu. Tanie, lekkie i świetnie trzyma się wody.' },
  armor:  { name: 'Pancerz', cost: 14, mass: 7, buoy: 1, hp: 70, mat: 'metal', rule: null, pitch: 0.7,
    desc: 'Żelazna płyta. Ciężka, ale wytrzyma kilka kul. Nie płonie.' },
  cannon: { name: 'Armata', cost: 18, mass: 5, buoy: 2, hp: 28, mat: 'wood', rule: 'edge', pitch: 0.8,
    desc: 'Strzela w stronę otwartej wody. Lewa burta: Q, prawa: E. Działa na dziobie i rufie: SPACJA.' },
  mortar: { name: 'Moździerz', cost: 30, mass: 7, buoy: 2, hp: 34, mat: 'metal', rule: null, pitch: 0.6,
    desc: 'Ciska pocisk łukiem prosto w rywala i sam celuje. Długo się ładuje. SPACJA.' },
  mast:   { name: 'Maszt', cost: 20, mass: 3, buoy: 2, hp: 26, mat: 'wood', rule: null, pitch: 1.2,
    desc: 'Żagiel daje dużą prędkość. Najszybciej płyniesz z wiatrem.' },
  oars:   { name: 'Wiosła', cost: 10, mass: 2, buoy: 3, hp: 22, mat: 'wood', rule: 'side', pitch: 1.1,
    desc: 'Napęd niezależny od wiatru i lepsza zwrotność. Tylko na lewej lub prawej burcie.' },
  rudder: { name: 'Ster', cost: 12, mass: 2, buoy: 3, hp: 30, mat: 'wood', rule: 'stern', pitch: 1.0,
    desc: 'Mocno poprawia skręcanie w ruchu. Tylko na rufie - za nim musi być woda.' },
  ram:    { name: 'Taran', cost: 16, mass: 5, buoy: 1, hp: 80, mat: 'metal', rule: 'bow', pitch: 0.5,
    desc: 'Okuty dziób. Zderzenie taranem zadaje potrójne obrażenia. Tylko na dziobie.' },
  keg:    { name: 'Prochownia', cost: 12, mass: 3, buoy: 2, hp: 16, mat: 'wood', rule: null, pitch: 0.9,
    desc: 'Pobliskie działa ładują się o 40% szybciej. Uwaga: wybucha, gdy zostanie trafiona!' },
  carp:   { name: 'Cieśla', cost: 16, mass: 2, buoy: 3, hp: 28, mat: 'wood', rule: null, pitch: 1.3,
    desc: 'Naprawia sąsiednie części i gasi pożary na pokładzie.' },
  core:   { name: 'Kajuta kapitana', cost: 0, mass: 6, buoy: 8, hp: 90, mat: 'wood', rule: null, pitch: 1,
    desc: 'Serce okrętu. Gdy zostanie zniszczona, okręt idzie na dno.' }
};
const PART_ORDER = ['hull', 'armor', 'cannon', 'mortar', 'mast', 'oars', 'rudder', 'ram', 'keg', 'carp'];
const RULE_MSG = {
  edge: 'Armata potrzebuje otwartej wody obok',
  side: 'Wiosła tylko na lewej lub prawej burcie',
  stern: 'Ster tylko na rufie - z tyłu musi być woda',
  bow: 'Taran tylko na dziobie - z przodu musi być woda'
};
const RULE_TAG = { edge: 'PRZY WODZIE', side: 'BURTA', stern: 'RUFA', bow: 'DZIÓB' };
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const Design = {
  inb: (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS,
  create() { const a = new Array(COLS * ROWS).fill(null); a[CORE_R * COLS + CORE_C] = 'core'; return a; },
  get(a, c, r) { return Design.inb(c, r) ? a[r * COLS + c] : null; },
  open(a, c, r) { return !Design.get(a, c, r); },
  cost(a) { let s = 0; for (const p of a) if (p) s += PARTS[p].cost; return s; },
  count(a) { let n = 0; for (const p of a) if (p) n++; return n; },
  list(a) { const o = []; a.forEach((p, i) => { if (p) o.push({ p, c: i % COLS, r: (i / COLS) | 0 }); }); return o; },
  ruleOK(a, c, r, p) {
    const R = PARTS[p].rule; if (!R) return true;
    const o = (dc, dr) => Design.open(a, c + dc, r + dr);
    if (R === 'edge') return o(-1, 0) || o(1, 0) || o(0, -1) || o(0, 1);
    if (R === 'side') return o(-1, 0) || o(1, 0);
    if (R === 'stern') return o(0, 1);
    if (R === 'bow') return o(0, -1);
    return true;
  },
  facing(a, c, r) {
    const o = (dc, dr) => Design.open(a, c + dc, r + dr);
    const L = o(-1, 0), R = o(1, 0);
    if (L && R) return 'LR'; if (L) return 'L'; if (R) return 'R';
    if (o(0, -1)) return 'U'; if (o(0, 1)) return 'D';
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
  canPlace(a, c, r, p, gold, noReplace) {
    if (!Design.inb(c, r)) return { ok: false, reason: '' };
    const cur = a[r * COLS + c];
    if (cur === 'core') return { ok: false, reason: 'Kajuty kapitana nie da się wymienić' };
    if (cur === p) return { ok: false, reason: '', same: true };
    if (cur && noReplace) return { ok: false, reason: '', same: true };
    if (!cur && !DIRS4.some(d => Design.get(a, c + d[0], r + d[1]))) return { ok: false, reason: 'Część musi łączyć się z okrętem' };
    const delta = PARTS[p].cost - (cur ? PARTS[cur].cost : 0);
    if (delta > gold) return { ok: false, reason: 'Brakuje złota: potrzeba ' + delta, gold: true };
    if (!Design.ruleOK(a, c, r, p)) return { ok: false, reason: RULE_MSG[PARTS[p].rule] };
    return { ok: true, delta, replace: cur };
  },
  removeAt(a, c, r) {
    const i = r * COLS + c, p = a[i];
    if (!p || p === 'core') return null;
    a[i] = null;
    const conn = Design.connected(a), removed = [{ c, r, p }];
    let refund = PARTS[p].cost;
    for (let k = 0; k < a.length; k++) if (a[k] && !conn.has(k)) {
      removed.push({ c: k % COLS, r: (k / COLS) | 0, p: a[k] }); refund += PARTS[a[k]].cost; a[k] = null;
    }
    return { removed, refund };
  },
  blocked(a) { const o = []; a.forEach((p, i) => { if (p && !Design.ruleOK(a, i % COLS, (i / COLS) | 0, p)) o.push(i); }); return o; },
  kegNear(a, c, r) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dc || dr) && Design.get(a, c + dc, r + dr) === 'keg') return true;
    return false;
  },
  stats(a) {
    const list = Design.list(a), ph = shipPhys(list);
    let fire = 0, nC = 0, nM = 0, nS = 0;
    for (const b of list) {
      const keg = Design.kegNear(a, b.c, b.r) ? 0.6 : 1;
      if (b.p === 'cannon' && Design.facing(a, b.c, b.r)) { nC++; fire += 22 / (CANNON_RELOAD * keg); }
      if (b.p === 'mortar') { nM++; fire += 42 / (MORTAR_RELOAD * keg); }
      if (b.p === 'mast') nS++;
    }
    return { ph, speed: physSpeed(ph, 0.8), turn: physTurn(ph, 1), fire, hp: ph.hp, load: ph.load, nC, nM, nS, n: list.length };
  }
};

// ---------- fizyka konstrukcji ----------
const CANNON_RELOAD = 2.7, MORTAR_RELOAD = 7.5, CANNON_DMG = 22, MORTAR_DMG = 45;
const BALL_SPEED = 170, BALL_VZ = 5.5, BALL_G = 16;
// lista: [{p, c, r, f (ułamek hp)}]
function shipPhys(list) {
  let mass = 0, buoy = 0, mx = 0, my = 0, hp = 0, sail = 0, oar = 0, oarTurn = 0, nOar = 0, nMast = 0;
  const rud = [];
  for (const b of list) {
    const P = PARTS[b.p], f = b.f === undefined ? 1 : b.f;
    mass += P.mass; buoy += P.buoy; mx += P.mass * b.c; my += P.mass * b.r;
    hp += b.hp === undefined ? P.hp : b.hp;
    if (b.p === 'mast') { sail += 26 * (0.45 + 0.55 * f); nMast++; }
    if (b.p === 'oars') { oar += 9 * (0.5 + 0.5 * f); oarTurn += 0.45 * (0.5 + 0.5 * f); nOar++; }
    if (b.p === 'rudder') rud.push(f);
  }
  if (!mass) mass = 1;
  const comC = mx / mass, comR = my / mass;
  let I = mass * 0.6;
  for (const b of list) { const dx = b.c - comC, dy = b.r - comR; I += PARTS[b.p].mass * (dx * dx + dy * dy); }
  rud.sort((a, b) => b - a);
  let rudder = 0; rud.forEach((f, i) => { rudder += 1.7 * Math.pow(0.5, i) * (0.5 + 0.5 * f); });
  const load = mass / Math.max(1, buoy);
  const over = load <= 1 ? 1 : Math.max(0.3, 1 - (load - 1) * 1.6);
  return { mass, buoy, load, over, comC, comR, I, sail, oar, oarTurn, nOar, nMast, rudder, hp, coreT: 5 };
}
function physThrust(ph, windF) { return ph.coreT + ph.sail * windF + ph.oar; }
function physSpeed(ph, windF) { return Math.min(80, 8.6 * physThrust(ph, windF) / Math.sqrt(ph.mass) * ph.over); }
function physAccel(ph, windF) { return clamp(physThrust(ph, windF) / ph.mass * 1.3, 0.3, 2.0); }
function physTurn(ph, speedFrac) {
  return clamp((0.7 + ph.oarTurn + ph.rudder * clamp(speedFrac * 1.2, 0.25, 1)) * 7.5 / Math.sqrt(ph.I), 0.25, 2.6);
}
// współczynnik wiatru dla żagli: 1 = z wiatrem, 0.45 = pod wiatr
function windFactor(heading, windAng) { return 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(angDiff(heading, windAng))); }

// ---------- nazwy okrętów ----------
const SHIP_NAMES = (() => {
  const adj = [['Pijany', 'Pijana'], ['Słony', 'Słona'], ['Krwawy', 'Krwawa'], ['Wściekły', 'Wściekła'], ['Zgniły', 'Zgniła'],
    ['Dziurawy', 'Dziurawa'], ['Czarny', 'Czarna'], ['Szalony', 'Szalona'], ['Złoty', 'Złota'], ['Ponury', 'Ponura'],
    ['Rdzawy', 'Rdzawa'], ['Żelazny', 'Żelazna'], ['Mokry', 'Mokra'], ['Chytry', 'Chytra'], ['Wesoły', 'Wesoła'],
    ['Głodny', 'Głodna'], ['Hardy', 'Harda'], ['Łysy', 'Łysa'], ['Dumny', 'Dumna'], ['Sprytny', 'Sprytna']];
  const nounM = ['Śledź', 'Dorsz', 'Rekin', 'Sztorm', 'Kraken', 'Wieloryb', 'Okoń', 'Albatros', 'Krab', 'Pelikan', 'Szkwał', 'Bosman'];
  const nounF = ['Mewa', 'Flądra', 'Syrena', 'Kaczka', 'Łajba', 'Szprotka', 'Ośmiornica', 'Krewetka', 'Burza', 'Kotwica', 'Barakuda', 'Fala'];
  return {
    random(except) {
      for (let k = 0; k < 20; k++) {
        const a = pick(adj), f = chance(0.5);
        const n = (f ? a[1] + ' ' + pick(nounF) : a[0] + ' ' + pick(nounM));
        if (n !== except) return n;
      }
      return 'Pijana Mewa';
    }
  };
})();
