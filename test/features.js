'use strict';
// Test mechanik: budowa warstwowa, kształt kadłuba, szablony, zdarzenia, bronie, nowe elementy, relikwie, zlecenia.
const assert = require('assert');
require('../server/load-shared')();

const dt = 1 / TICK_HZ;
const run = (w, sec) => { for (let i = 0; i < sec * TICK_HZ; i++) w.tick(dt); };
const mkWorld = o => new SimWorld(Object.assign({ seed: 777, npc: 0, firstEvent: 1e9 }, o));
const join = (w, name) => { const box = []; const p = w.join(m => box.push(m), { name: name || 'Test', ship: 'Łajba', col: 1 }); p.box = box; return p; };
// stawia element (albo kadłub) w kaflu projektu; element dostaje kadłub, który już tam jest
const put = (a, c, r, p, q) => {
  const i = r * COLS + c;
  a[i] = PARTS[p].cat === 'hull' ? { p, q: 0 } : { p, q: hasQ(p) ? (q || 0) : 0, h: a[i] ? baseOf(a[i]) : 'hull' };
  return a;
};
const starter = q => Design.fromRows(STARTER_ROWS, q || 0);
// ustawia okręt gracza na otwartej wodzie z podanym projektem
function rig(w, p, design) {
  const pt = w.openWaterPoint(1, 150, 150) || w.randomWaterPoint(1);
  p.ship.applyDesign(design);
  p.ship.x = pt.x; p.ship.y = pt.y; p.ship.vx = p.ship.vy = 0; p.ship.ang = 0;
  w.tick(dt);
  return p.ship;
}
const lootOf = (w, part) => w.loot.filter(l => l.kind === 1 && l.item.p === part);
const sinkCore = (s, src) => { const k = s.blocks.indexOf(s.core); s.damageBlock(k, 1e6, src); };
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };
const near = (a, b, msg) => ok(Math.abs(a - b) < 1e-6, msg + ': ' + a + ' != ' + b);

// ---------- definicje ----------
for (const p of Object.keys(PARTS)) {
  ok(itemValue(p, 0) >= 0 && partHp(p, 0) > 0, 'zła część ' + p);
  if (PARTS[p].w) ok(WEAPONS[PARTS[p].w], 'brak broni dla ' + p);
  ok(['core', 'hull', 'weapon', 'special', 'drive', 'gear', 'relic'].includes(PARTS[p].cat), 'zła kategoria ' + p);
}
for (const r of RELICS) ok(isRelic(r) && PARTS[r].noShop && isMount(r), 'relikwia ' + r);
const inShop = new Set();
for (const c of CATS) for (const p of c.parts) { ok(PARTS[p], 'kategoria ' + c.id + ': ' + p); ok(PARTS[p].cat === 'hull' ? c.id === 'hull' : c.id !== 'hull', 'zła zakładka dla ' + p); inShop.add(p); }
for (const p of Object.keys(PARTS)) if (!PARTS[p].noShop) ok(inShop.has(p), 'brak w sklepie: ' + p);
ok(CATS.every(c => c.parts.filter(p => !PARTS[p].noShop).length <= 9), 'za dużo pozycji w zakładce stoczni');
for (const k of Object.keys(TPL_KEY)) ok(PARTS[TPL_KEY[k]], 'zła litera szablonu ' + k);
ok(HULL_OK[CORE_R * COLS + CORE_C] === 1 && Design.create()[CORE_R * COLS + CORE_C].p === 'core', 'kajuta poza kadłubem');
ok(WORLD >= 6000 && COLS * ROWS >= 400, 'świat albo siatka za małe');

// ---------- kształt kadłuba ----------
{
  let cells = 0, prev = -1;
  for (let r = 0; r < ROWS; r++) {
    const row = []; for (let c = 0; c < COLS; c++) if (Design.inb(c, r)) row.push(c);
    ok(row.length === HULL_HW[r] * 2 + 1 && row[0] === CORE_C - HULL_HW[r], 'zły rząd obrysu ' + r);
    cells += row.length; prev = row.length;
  }
  ok(HULL_HW[0] === 0 && HULL_HW[13] === 7 && cells > 250, 'obrys nie jest statkiem (dziób zwężony, śródokręcie szerokie)');
  ok(!Design.inb(0, 0) && !Design.inb(CORE_C, -1) && !Design.inb(COLS, 5) && Design.inb(CORE_C, 0), 'granice siatki');
  const a = starter();
  ok(!Design.canPlace(a, 0, 20, { p: 'hull', q: 0 }, 999, 5).ok, 'poza obrysem nie wolno budować');
}

// ---------- szablony okrętów ----------
for (const k of Object.keys(TEMPLATES)) {
  const T = TEMPLATES[k], a = Design.fromRows(T.rows, 0, T.base), st = Design.stats(a);
  const letters = T.rows.join('').replace(/[.@]/g, '').length;
  ok(Design.count(a) === letters + 1, 'szablon ' + k + ' wychodzi poza obrys');
  ok(Design.blocked(a).length === 0, 'szablon ' + k + ' ma zablokowane elementy');
  ok(Design.connected(a).size === Design.count(a), 'szablon ' + k + ' nie jest spójny');
  ok(st.load < 1 && st.speed > 25 && st.turn >= 0.25, 'szablon ' + k + ': load ' + st.load.toFixed(2) + ' speed ' + st.speed.toFixed(0) + ' turn ' + st.turn.toFixed(2));
  ok(a.every(x => !x || !x.h || PARTS[x.h].cat === 'hull'), 'szablon ' + k + ': element na elemencie');
}
{
  const st = Design.stats(starter());
  ok(st.speed > 48 && st.speed < 80 && st.turn > 1 && st.load < 0.8 && st.value < START_GOLD + 50, 'łódź startowa: ' + JSON.stringify([st.speed, st.turn, st.load, st.value]));
  const st2 = Design.stats(Design.fromRows(TEMPLATES.flagowiec.rows, 2, 'oak'));
  ok(st2.load < 1 && st2.fire > 0 && st2.nG > 0, 'flagowiec ma złe statystyki');
}

// ---------- model warstwowy: kadłub + element ----------
{
  const a = starter();
  // element nie jest podłogą: bez kadłuba nie da się go postawić
  let r = Design.canPlace(a, 6, 13, { p: 'cannon', q: 0 }, 999, 18);
  ok(!r.ok && r.reason === NEED_HULL_MSG, 'armata na pustej wodzie');
  // kadłub przy okręcie
  r = Design.canPlace(a, 5, 13, { p: 'hull', q: 0 }, 999, 5);
  ok(!r.ok && r.reason, 'kadłub bez połączenia');
  r = Design.canPlace(a, 7, 12, { p: 'oak', q: 0 }, 999, 10);
  ok(r.ok && r.cell.p === 'oak' && !r.cell.h && r.displaced.length === 0, 'kadłub przy dziobie');
  a[12 * COLS + 7] = r.cell;
  // element na kadłubie (dowolnego materiału, także metalowego)
  for (const hull of ['hull', 'oak', 'iron', 'steel', 'thorn', 'bamboo']) {
    const b = Design.clone(a); put(b, 7, 14, hull);
    r = Design.canPlace(b, 7, 14, { p: 'mast', q: 1 }, 999, 40);
    ok(r.ok && r.cell.p === 'mast' && r.cell.h === hull && r.displaced.length === 0, 'maszt na ' + hull);
  }
  // wymiana elementu: stary wraca do ładowni, kadłub zostaje
  const b = Design.clone(a);
  r = Design.canPlace(b, 5, 16, { p: 'longgun', q: 0 }, 999, 34);
  ok(r.ok && r.cell.h === 'hull' && r.displaced.length === 1 && r.displaced[0].p === 'cannon', 'wymiana armaty na długie działo');
  // wymiana kadłuba pod elementem: element zostaje, stary kadłub wraca do ładowni
  r = Design.canPlace(b, 5, 16, { p: 'steel', q: 0 }, 999, 30);
  ok(r.ok && r.cell.p === 'cannon' && r.cell.h === 'steel' && r.displaced.length === 1 && r.displaced[0].p === 'hull', 'stal pod armatą');
  ok(cellValue(r.cell) === itemValue('cannon', 0) + itemValue('steel', 0) && cellHp(r.cell) === partHp('cannon', 0) + partHp('steel', 0), 'wartość i wytrzymałość kafla to suma warstw');
  // ten sam przedmiot nie zastępuje samego siebie
  ok(Design.canPlace(b, 5, 16, { p: 'cannon', q: 0 }, 999, 18).same, 'to samo działo');
  ok(Design.canPlace(b, 6, 16, { p: 'hull', q: 0 }, 999, 5).same, 'ten sam kadłub');
  // kajuta
  ok(!Design.canPlace(b, CORE_C, CORE_R, { p: 'cannon', q: 0 }, 999, 18).ok && !Design.canPlace(b, CORE_C, CORE_R, { p: 'iron', q: 0 }, 999, 14).ok, 'kajuty nie ruszamy');
  // zasady: działo burtowe potrzebuje wody obok, ster rufy, taran dziobu, wiosła burty
  ok(!Design.canPlace(b, 6, 16, { p: 'cannon', q: 0 }, 999, 18).ok, 'armata w środku okrętu');
  ok(Design.canPlace(b, 6, 16, { p: 'turret', q: 0 }, 999, 56).ok, 'wieża może stać w środku okrętu');
  ok(Design.canPlace(b, 6, 16, { p: 'tesla', q: 0 }, 999, 60).ok, 'cewka Tesli w środku');
  ok(!Design.canPlace(b, 6, 16, { p: 'ram', q: 0 }, 999, 18).ok && Design.canPlace(b, 7, 12, { p: 'ram', q: 0 }, 999, 18).ok, 'taran tylko na dziobie');
  ok(!Design.canPlace(b, 7, 17, { p: 'rudder', q: 0 }, 999, 12).ok, 'ster nie na kajucie');
  ok(Design.canPlace(b, 7, 19, { p: 'mines', q: 0 }, 999, 36).ok && !Design.canPlace(b, 7, 18, { p: 'mines', q: 0 }, 999, 36).ok, 'miny tylko na rufie');
  ok(!Design.canPlace(b, 7, 14, { p: 'cannon', q: 0 }, 5, 18).ok && Design.canPlace(b, 7, 14, { p: 'cannon', q: 0 }, 5, 18).gold, 'brak złota');
  // zdejmowanie: najpierw element, potem kadłub
  const c = Design.clone(b);
  let rm = Design.removeTop(c, 5, 16);
  ok(rm.removed.length === 1 && rm.removed[0].p === 'cannon' && c[16 * COLS + 5].p === 'hull' && !c[16 * COLS + 5].h, 'zdjęcie elementu zostawia kadłub');
  rm = Design.removeTop(c, 5, 16);
  ok(rm.removed.length === 1 && rm.removed[0].p === 'hull' && !c[16 * COLS + 5], 'zdjęcie gołego kadłuba');
  // zdjęcie kadłuba odcina to, co od niego zależało (element i kadłub z osobna do ładowni)
  const d = starter(); put(d, 7, 13, 'hull'); put(d, 7, 12, 'hull'); put(d, 7, 12, 'ballista');
  rm = Design.removeTop(d, 7, 13);
  ok(rm.removed.some(x => x.p === 'ballista') && rm.removed.filter(x => x.p === 'hull').length === 2 && !d[12 * COLS + 7], 'odcięte kafle wracają razem z elementami');
  ok(Design.removeTop(d, CORE_C, CORE_R) === null, 'kajuty nie zdejmiemy');
  // zapis sieciowy
  const e = Design.clone(b); put(e, 7, 14, 'jib', 2); put(e, 5, 17, 'oars', 1); put(e, 6, 18, 'thorn');
  const dec = Design.decode(JSON.parse(JSON.stringify(Design.encode(e))));
  ok(JSON.stringify(dec) === JSON.stringify(e), 'kodowanie projektu z warstwami');
  ok(cellParse('cannon:3@iron').h === 'iron' && cellParse('cannon:3@ghost') === null || cellParse('cannon@nic').h === 'hull', 'cellParse');
}

// ---------- piraci wracają z opóźnieniem ----------
{
  const w = mkWorld({ npc: 3 });
  run(w, 20);
  const pirates = () => w.ships.filter(s => s.kind === 'pirate' && s.alive && !s.evTag);
  ok(pirates().length === 3, 'powinno być 3 piratów, jest ' + pirates().length);
  sinkCore(pirates()[0], null);
  run(w, 30);
  ok(pirates().length === 2, 'zatopiony pirat nie powinien wrócić od razu');
  ok(w.npcCd.length === 1, 'brak odliczania do powrotu pirata');
  run(w, 140);
  ok(pirates().length === 3, 'pirat powinien wrócić po odliczaniu');
  // piraci ze wszystkich stref mają poprawne okręty
  for (let i = 0; i < 40; i++) {
    const z = i % 3, pt = w.randomWaterPoint(z), s = w.spawnNpc('pirate', pt.x, pt.y);
    ok(Design.blocked(s.design).length === 0 && s.alive && s.ph.load < 1.05 && s.blocks.length > 5, 'pirat strefy ' + z + ' ma zły okręt (load ' + s.ph.load.toFixed(2) + ')');
  }
}

// ---------- większy świat ----------
{
  const w = mkWorld();
  ok(w.ports.length === 11 && w.islands.length > 90, 'świat: porty ' + w.ports.length + ', wyspy ' + w.islands.length);
  for (const z of [0, 1, 2]) ok(w.ports.filter(q => q.zone === z).length >= 3, 'za mało portów w strefie ' + z);
  ok(w.ports.every(q => q.x > 150 && q.y > 150 && q.x < WORLD - 150 && q.y < WORLD - 150), 'port poza światem');
  ok(w.barrels.length >= 200, 'za mało beczek na dużym morzu');
}

// ---------- harmonogram zdarzeń ----------
{
  const w = mkWorld({ npc: 0, firstEvent: 1 });
  join(w);
  const seen = {}, starts = [];
  let prev = new Set();
  for (let i = 0; i < 3600 * 2 * TICK_HZ / 4; i++) {
    w.tick(dt * 4);
    const cur = new Set(w.wevents.map(e => e.type));
    for (const t of cur) if (!prev.has(t)) { starts.push([t, w.T]); seen[t] = (seen[t] || 0) + 1; }
    const foes = w.wevents.filter(e => WEV[e.type].grp === 'foe').length;
    ok(foes <= 1, 'dwa wrogie zdarzenia naraz');
    ok(w.wevents.length <= 2, 'za dużo zdarzeń naraz');
    prev = cur;
  }
  const ghosts = starts.filter(s => s[0] === 'ghost').map(s => s[1]);
  for (let i = 1; i < ghosts.length; i++) ok(ghosts[i] - ghosts[i - 1] >= WEV.ghost.cd - 1, 'statek widmo za często');
  console.log('zdarzenia w 2 h:', JSON.stringify(seen), 'razem', starts.length);
  ok(starts.length >= 20 && starts.length <= 60, 'dziwna liczba zdarzeń: ' + starts.length);
}

// ---------- każde zdarzenie startuje i kończy się bez błędów ----------
for (const type of Object.keys(WEV)) {
  const w = mkWorld();
  join(w);
  ok(w.startEvent(type) !== false, 'nie wystartowało: ' + type);
  run(w, 330);
  ok(!w.wevents.some(e => e.type === type), 'zdarzenie się nie skończyło: ' + type);
}

// ---------- najazd piratów ----------
{
  const w = mkWorld();
  const p = join(w);
  w.startEvent('raid');
  const e = w.wevents[0], boss = e.ship;
  ok(boss.kind === 'boss' && e.ships.length === 3 && boss.power === shipPower(2600), 'zła flota');
  ok(e.ships.slice(1).every(s => s.evTag === 'raid'), 'eskorta bez znacznika');
  sinkCore(boss, p.ship);
  run(w, 1);
  ok(lootOf(w, 'dread').length === 1, 'brak Czarnej Bandery');
  ok(e.ships.slice(1).every(s => s.despawn), 'eskorta powinna odpłynąć');
}

// ---------- kraken ----------
{
  const w = mkWorld();
  const p = join(w);
  w.startEvent('kraken');
  const m = w.mons[0];
  ok(m && m.alive, 'brak krakena');
  run(w, 4);
  const s = p.ship;
  s.x = m.x + 50; s.y = m.y; s.vx = s.vy = 0;
  const hp0 = s.integrity();
  run(w, 14);
  ok(s.integrity() < hp0 || !s.alive, 'macki nie atakują');
  const ball0 = m.hp;
  w.spawnBall(s, 0, false, m.x - 10, m.y, 60, 0, 1, WEAPONS.cannon, QUAL[0]);
  run(w, 0.5);
  ok(m.hp < ball0, 'kula nie rani krakena');
  w.monDamage(m, 1e6, s);
  ok(!m.alive && lootOf(w, 'kraken').length === 1, 'brak Zęba Krakena');
  run(w, 5);
  ok(!w.mons.length && !w.wevents.length, 'kraken nie zniknął');
}

// ---------- wir ----------
{
  const w = mkWorld();
  const p = join(w);
  w.startEvent('whirl');
  const e = w.wevents[0];
  ok(e.pearl && e.pearl.pin, 'brak perły');
  run(w, 8);
  const s = p.ship;
  s.x = e.x + 120; s.y = e.y; s.vx = s.vy = 0; s.throttle = 0;
  const d0 = Math.hypot(s.x - e.x, s.y - e.y);
  run(w, 3);
  ok(Math.hypot(s.x - e.x, s.y - e.y) < d0 - 5, 'wir nie wciąga');
  ok(Math.hypot(e.pearl.x - e.x, e.pearl.y - e.y) < 1, 'perła odpłynęła');
}

// ---------- mgła ----------
{
  const w = mkWorld();
  const p = join(w);
  w.startEvent('fog');
  run(w, 15);
  const e = w.wevents[0];
  p.ship.x = e.x; p.ship.y = e.y;
  ok(w.inFog(e.x, e.y), 'mgła nie działa');
  p.box.length = 0; w.sendMap();
  const map = p.box.find(m => m.t === 'map');
  ok(map.pl[0][9] === 1, 'gracz w mgle powinien być ukryty');
}

// ---------- regaty ----------
{
  const w = mkWorld();
  const p = join(w);
  ok(w.startEvent('regatta') !== false, 'regaty nie wystartowały');
  const e = w.wevents[0];
  for (const b of e.buoys) { p.ship.x = b[0]; p.ship.y = b[1]; p.ship.vx = p.ship.vy = 0; run(w, 0.2); }
  ok(e.ranks[0] === p.id, 'brak zwycięzcy');
  ok(p.hold.has(itemKey('figure', 0)), 'brak Złotej Syreny w ładowni');
}

// ---------- sztorm: Butelka Burzy ----------
{
  const w = mkWorld();
  join(w);
  w.startEvent('storm');
  run(w, 100);
  ok(lootOf(w, 'storm').length + (w.wevents[0] && w.wevents[0].bottle ? 1 : 0) >= 1, 'brak Butelki Burzy');
}

// ---------- bronie ----------
{
  const w = mkWorld();
  const p = join(w), q = join(w, 'Cel');
  const a = starter(1);
  put(a, 5, 16, 'rocket', 1); put(a, 9, 16, 'bombard', 1); put(a, 5, 17, 'flame', 1); put(a, 9, 17, 'harpoon', 1); put(a, 7, 19, 'mines', 1);
  const s = rig(w, p, a), t = q.ship;
  t.applyDesign(Design.fromRows(TEMPLATES.bryg.rows, 0));
  t.x = s.x + 74; t.y = s.y; t.ang = 0; t.vx = t.vy = 0;
  w.tick(dt);
  const arm = s.armament();
  ok(arm.L.length === 2 && arm.R.length === 2 && arm.S.length === 1, 'złe uzbrojenie: ' + JSON.stringify(arm));
  w.balls.length = 0;
  const shots = [];
  const old = w.ev.bind(w);
  w.ev = (type, ...args) => { if (type === 'b') shots.push(args[6]); return old(type, ...args); };
  s.blocks.forEach(b => { b.rl = 0; });
  s.fire('L'); s.fire('R'); s.fire('S');
  run(w, 1);
  ok(shots.filter(k => k === 6).length === 3, 'rakiety: ' + shots);
  ok(shots.filter(k => k === 7).length === 6, 'ogień: ' + shots);
  ok(shots.includes(8) && shots.includes(9), 'bombarda/harpun: ' + shots);
  ok(w.barrels.some(b => b.type === 3 && b.owner === s), 'brak miny');
  run(w, 2);
  ok(w.tethers.length === 1 && w.tethers[0].b === t, 'harpun nie przywiązał celu');
  ok(t.integrity() < 1, 'cel nie oberwał');
  w.ev = old;
  const mine = w.barrels.find(b => b.type === 3);
  t.x = mine.x; t.y = mine.y + 2; t.vx = t.vy = 0;
  const i0 = t.integrity();
  run(w, 0.5);
  ok(!w.barrels.includes(mine) && t.integrity() < i0, 'mina nie wybuchła');
  for (let i = 0; i < 8; i++) { s.blocks.forEach(b => { b.rl = 0; }); w.layMine(s, s.blocks.find(b => b.p === 'mines')); }
  ok(w.barrels.filter(b => b.type === 3 && b.owner === s).length === MAX_MINES, 'limit min nie działa');
}

// ---------- balista przebija kilka części ----------
{
  const w = mkWorld();
  const p = join(w), q = join(w, 'Cel');
  const s = rig(w, p, starter()), t = q.ship;
  t.applyDesign(Design.fromRows(TEMPLATES.galeon.rows, 0));
  t.x = s.x + 400; t.y = s.y; t.ang = 0; t.vx = t.vy = 0;
  w.tick(dt);
  const hurt = () => t.blocks.filter(b => b.alive && b.hp < b.max - 0.01).length;
  const row = Math.round(t.y);
  w.spawnBall(s, 0, false, t.x - 90, row, 300, 0, 3, WEAPONS.ballista, QUAL[0], 1);
  run(w, 0.7);
  const h1 = hurt();
  ok(h1 >= 3 && h1 <= 6, 'bełt powinien przebić 3-4 części, przebił ' + h1);
  for (const b of t.blocks) { b.hp = b.max; }
  w.spawnBall(s, 0, false, t.x - 90, row, 170, 0, 5.5, WEAPONS.cannon, QUAL[0], 1);
  run(w, 1);
  ok(hurt() <= 2, 'kula armatnia powinna trafić najwyżej 1-2 części, trafiła ' + hurt());
}

// ---------- wieża i cewka Tesli strzelają same ----------
{
  const w = mkWorld();
  const p = join(w), q = join(w, 'Cel');
  const a = starter(1);
  put(a, 6, 16, 'turret', 1); put(a, 8, 16, 'tesla', 1);
  const s = rig(w, p, a), t = q.ship;
  t.applyDesign(Design.fromRows(TEMPLATES.bryg.rows, 0));
  t.x = s.x + 80; t.y = s.y; t.ang = 0; t.vx = t.vy = 0;
  const evs = [], old = w.ev.bind(w);
  w.ev = (type, ...args) => { evs.push(type + (type === 'b' ? args[6] : '')); return old(type, ...args); };
  w.tick(dt);
  run(w, 3);
  ok(evs.includes('b0'), 'wieża nie strzela sama');
  ok(evs.includes('tz'), 'cewka Tesli nie razi piorunem');
  ok(t.integrity() < 1, 'cel nie oberwał od wieży i Tesli');
  w.ev = old;
  // bez wrogów w zasięgu nic się nie dzieje
  t.x = s.x + 900;
  const n0 = evs.length; evs.length = 0;
  run(w, 2);
  ok(!evs.includes('tz') && !evs.includes('b0'), 'strzela do nikogo');
}

// ---------- napęd i sprzęt ----------
{
  const base = starter();
  const s0 = Design.stats(base);
  const withSteam = Design.clone(base); put(withSteam, 6, 16, 'steam');
  ok(shipPhys(Design.list(withSteam)).steam > 0 && physSpeed(Design.stats(withSteam).ph, 0.45) > physSpeed(s0.ph, 0.45), 'kocioł nie pomaga');
  const withJib = Design.clone(base); put(withJib, 7, 14, 'jib');
  const s2 = Design.stats(withJib);
  ok(s2.turn > s0.turn && s2.speed > s0.speed, 'bukszpryt nic nie daje');
  // żagiel łaciński prawie nie traci mocy pod wiatr, maszt traci
  const lat = Design.clone(base); put(lat, 7, 15, 'lateen');
  const mast = Design.clone(base);
  const sl = Design.stats(lat), sm = Design.stats(mast);
  ok(physSpeed(sl.ph, 0.45) / physSpeed(sl.ph, 1) > physSpeed(sm.ph, 0.45) / physSpeed(sm.ph, 1), 'łaciński pod wiatr');
  // koło łopatkowe: napęd bez wiatru i lepszy skręt
  const pad = Design.clone(base); put(pad, 5, 17, 'paddle');
  ok(physSpeed(Design.stats(pad).ph, 0.45) > physSpeed(Design.stats(base).ph, 0.45) && Design.stats(pad).ph.oar > s0.ph.oar, 'koło łopatkowe');
  // zbrojownia i bęben zwiększają siłę ognia, żuraw ładownię
  const noArm = Design.clone(base);
  const arm = Design.clone(base); put(arm, 6, 16, 'armory');
  const drum = Design.clone(base); put(drum, 7, 16, 'drum');
  ok(Design.stats(arm).fire > Design.stats(noArm).fire * 1.08, 'zbrojownia nie zwiększa obrażeń');
  ok(Design.stats(drum).fire > Design.stats(noArm).fire * 1.1, 'bęben nie przyspiesza ładowania');
  ok(Design.rateK(drum, 5, 16) > 1 && Design.rateK(drum, 9, 16) > 1 && Design.rateK(noArm, 5, 16) === 1, 'rateK');
  const w = mkWorld();
  const p = join(w);
  const cr = Design.clone(base); put(cr, 6, 16, 'crane');
  p.ship.applyDesign(cr);
  ok(w.holdCap(p) === MAX_HOLD + CRANE_HOLD, 'żuraw nie powiększa ładowni');
  // bęben i prochownia w symulacji ładują szybciej
  const dr = Design.clone(base); put(dr, 6, 16, 'drum'); put(dr, 6, 17, 'keg');
  p.ship.applyDesign(dr);
  const gun = p.ship.blocks.find(b => b.p === 'cannon');
  near(gun.rate, (1 / 0.6) * (1 + drumK(0)), 'tempo ładowania w symulacji');
}

// ---------- tarcza, pompa, magnes ----------
{
  const w = mkWorld();
  const p = join(w), s = p.ship;
  const a = starter(); put(a, 6, 16, 'shield', 2); put(a, 8, 18, 'pump', 1); put(a, 6, 18, 'magnet', 0);
  s.applyDesign(a);
  const at = (c, r) => s.blocks.find(b => b.c === c && b.r === r);
  const guarded = at(6, 15), bare = at(8, 15), wetB = at(7, 18), dryB = at(7, 14);
  near(guarded.guard, 1 - shieldK(2), 'osłona tarczy');
  ok(bare.guard === 1, 'tarcza chroni tylko sąsiadów');
  const g0 = guarded.hp, b0 = bare.hp;
  s.damageBlock(s.blocks.indexOf(guarded), 10, null); s.damageBlock(s.blocks.indexOf(bare), 10, null);
  ok(Math.abs((g0 - guarded.hp) - 10 * (1 - shieldK(2))) < 1e-6 && Math.abs(b0 - bare.hp - 10) < 1e-6, 'tarcza zmniejsza obrażenia');
  ok(wetB.wet && !dryB.wet, 'pompa chroni tylko w promieniu 2');
  s.ignite(wetB, null); s.ignite(dryB, null);
  ok(wetB.burn === 0 && dryB.burn > 0, 'pompa nie gasi pożaru');
  ok(s.magnet === magnetRange(0), 'zasięg magnesu');
  // magnes wciąga łupy
  s.safe = false; s.x = 2000; s.y = 2000; s.vx = s.vy = 0;
  const g1 = p.gold;
  w.dropLoot(s.x + 66, s.y + 20, { kind: 0, gold: 40, vx: 0, vy: 0 });
  run(w, 3);
  ok(p.gold >= g1 + 40, 'magnes nie przyciągnął łupu');
  // bez magnesu ten sam łup leży
  const b = starter(); s.applyDesign(b);
  w.loot.length = 0; w.dropLoot(s.x + 66, s.y + 20, { kind: 0, gold: 40, vx: 0, vy: 0 });
  const g2 = p.gold;
  run(w, 3);
  ok(p.gold === g2, 'łup sam podpłynął do okrętu bez magnesu');
}

// ---------- kolce: pancerz kolczasty ranią taranującego ----------
{
  const mk = hull => { const a = starter(); for (let r = 14; r <= 19; r++) for (let c = 0; c < COLS; c++) { const x = a[r * COLS + c]; if (!x || x.p === 'core') continue; a[r * COLS + c] = x.h ? { p: x.p, q: x.q, h: hull } : { p: hull, q: 0 }; } return a; };
  const dmgTo = hull => {
    const w = mkWorld(), p = join(w), q = join(w, 'Cel');
    const s = rig(w, p, mk('hull')), t = q.ship; t.applyDesign(mk(hull));
    t.x = s.x + 34; t.y = s.y; t.ang = 0; t.vx = t.vy = 0; s.vx = 60; s.vy = 0; s.ang = Math.PI / 2;
    let dmg = 0; const dmgBlock = s.damageBlock.bind(s);
    s.damageBlock = (k, d, src, o) => { dmg += d; return dmgBlock(k, d, src, o); };
    w.tick(dt); w.tick(dt);
    return dmg;
  };
  const dIron = dmgTo('iron'), dThorn = dmgTo('thorn');
  ok(dIron > 0 && dThorn > dIron * 1.2, 'kolce nie ranią: ' + dIron + ' vs ' + dThorn);
}

// ---------- relikwie ----------
{
  const w = mkWorld();
  const p = join(w), s = p.ship;
  const a = starter();
  put(a, 7, 18, 'dread'); put(a, 6, 15, 'lantern'); put(a, 8, 15, 'pearl'); put(a, 6, 18, 'storm');
  s.applyDesign(a);
  ok(s.relic.dread && s.dmgK === 1.2, 'Czarna Bandera nie działa');
  const pir = w.spawnNpc('pirate', s.x + 80, s.y);
  s.safe = false; s.port = -1;
  ok(w.findPrey(pir, 500) === null, 'pirat atakuje właściciela Czarnej Bandery');
  pir.lastHit = s;
  ok(w.findPrey(pir, 500) === s, 'pirat powinien się bronić');
  const hb = s.blocks.find(b => b.p === 'hull');
  s.ignite(hb, null);
  ok(hb.burn === 0, 'Latarnia Widma nie chroni przed ogniem');
  const blk = s.blocks.find(b => b.p === 'hull' && b.alive);
  blk.hp = blk.max * 0.3; s.combatT = 0;
  for (let i = 0; i < 60; i++) s.update(dt);
  ok(blk.hp > blk.max * 0.3 + 0.01 * blk.max, 'Perła nie naprawia');
  ok(s.relic.storm && s.relic.pearl && s.relic.lantern, 'relikwie nie działają');
  w.loot.length = 0;
  sinkCore(s, null);
  ok(['dread', 'lantern', 'pearl', 'storm'].every(r => lootOf(w, r).length === 1), 'relikwie nie wypadły');
}

// ---------- łupy z wraku: elementy i drogie materiały osobno ----------
{
  const w = mkWorld();
  const p = join(w), s = p.ship;
  const a = starter(); put(a, 6, 15, 'steel'); put(a, 8, 15, 'iron'); put(a, 8, 15, 'cannon');
  s.applyDesign(a);
  const sal = w.salvage(s);
  ok(sal.some(x => x.p === 'steel') && sal.some(x => x.p === 'iron') && sal.some(x => x.p === 'cannon') && !sal.some(x => x.p === 'hull'), 'wrak: ' + JSON.stringify(sal));
}

// ---------- zlecenia portowe ----------
{
  const w = mkWorld();
  const p = join(w), s = p.ship;
  const port = w.ports[0];
  s.x = port.x + port.r + 40; s.y = port.y; s.vx = s.vy = 0;
  run(w, 2);
  ok(p.ct, 'brak zlecenia w porcie');
  p.ct = { type: 'bar', need: 2, have: 0, reward: 50, to: -1 };
  const g0 = p.gold;
  for (let i = 0; i < 2; i++) { const b = w.spawnBarrel(s.x + 300, s.y, 0); w.breakBarrel(b, s); }
  ok(!p.ct && p.gold >= g0 + 50, 'zlecenie się nie zaliczyło');
  const snap = []; p.send = m => snap.push(m);
  run(w, 1.2);
  const me = snap.filter(m => m.t === 's').pop().me;
  ok(me.cap === MAX_HOLD, 'brak pojemności ładowni w migawce');
}

// ---------- stocznia na serwerze: warstwy, zniszczone kafle, relikwie ----------
{
  const w = mkWorld();
  const p = join(w), s = p.ship;
  const port = w.ports[0];
  s.x = port.x + port.r + 40; s.y = port.y; s.vx = s.vy = 0;
  w.tick(dt);
  p.gold = 5000;
  const last = []; p.send = m => last.push(m);
  w.handle(p, { t: 'yard', op: 'open' }); last.pop();
  const build = ops => { w.handle(p, { t: 'build', ops }); return last.pop(); };
  let y = build([['place', 6, 13, 'cannon', 0, 'shop']]);
  ok(y.err === NEED_HULL_MSG, 'serwer pozwolił postawić działo na wodzie');
  y = build([['place', 7, 12, 'hull', 0, 'shop'], ['place', 7, 12, 'turret', 1, 'shop']]);
  ok(!y.err && s.design[12 * COLS + 7].p === 'turret' && s.design[12 * COLS + 7].h === 'hull', 'wieża na kadłubie');
  ok(p.gold === 5000 - itemValue('hull', 0) - itemValue('turret', 1), 'cena = kadłub + wieża');
  // wymiana kadłuba pod wieżą: stary kadłub do ładowni, wieża zostaje
  y = build([['place', 7, 12, 'steel', 0, 'shop']]);
  ok(!y.err && s.design[12 * COLS + 7].p === 'turret' && s.design[12 * COLS + 7].h === 'steel' && y.h.some(e => e[0] === 'hull'), 'stal pod wieżą');
  // zdejmowanie: wieża, potem kadłub
  y = build([['rm', 7, 12]]);
  ok(s.design[12 * COLS + 7].p === 'steel' && y.h.some(e => e[0] === 'turret'), 'zdjęcie wieży');
  y = build([['rm', 7, 12]]);
  ok(!s.design[12 * COLS + 7] && y.h.some(e => e[0] === 'steel'), 'zdjęcie kadłuba');
  // zniszczony kafel nie wraca za darmo ani nie pozwala postawić elementu
  s.safe = false; // w porcie nikt nie rani - na potrzeby testu wyłączamy ochronę na chwilę
  s.damageBlock(s.blocks.indexOf(s.blocks.find(b => b.c === 5 && b.r === 16)), 1e5, null);
  w.tick(dt);
  const dead = s.blocks.find(b => b.c === 5 && b.r === 16);
  ok(!dead.alive, 'kafel powinien być zniszczony');
  const h0 = w.holdCount(p);
  y = build([['place', 5, 16, 'longgun', 0, 'shop']]);
  ok(y.err && s.blocks.find(b => b.c === 5 && b.r === 16).p === 'cannon', 'element na zniszczonym kaflu: ' + y.err);
  y = build([['rm', 5, 16]]);
  ok(!s.design[16 * COLS + 5] && w.holdCount(p) === h0, 'zniszczony kafel nie zwraca przedmiotów');
  // relikwię można zamontować tylko na kadłubie i tylko z ładowni
  y = build([['place', 7, 14, 'kraken', 0, 'shop']]);
  ok(y.err, 'relikwii nie kupisz');
  p.hold.set(itemKey('kraken', 0), { p: 'kraken', q: 0, n: 1 });
  y = build([['place', 7, 14, 'kraken', 0, 'hold']]);
  ok(!y.err && s.relic.kraken, 'relikwia z ładowni');
  y = build([['place', 0, 0, 'hull', 0, 'shop'], ['place', 0, 25, 'hull', 0, 'shop']]);
  ok(!s.design[0] && !s.design[25 * COLS], 'budowa poza obrysem');
}
console.log('OK - sprawdzeń:', checks);
