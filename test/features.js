'use strict';
// Test nowych mechanik: zdarzenia, kraken, bronie specjalne, relikwie, zlecenia i rzadsi piraci.
const assert = require('assert');
require('../server/load-shared')();

const dt = 1 / TICK_HZ;
const run = (w, sec) => { for (let i = 0; i < sec * TICK_HZ; i++) w.tick(dt); };
const mkWorld = o => new SimWorld(Object.assign({ seed: 777, npc: 0, firstEvent: 1e9 }, o));
const join = (w, name) => { const box = []; const p = w.join(m => box.push(m), { name: name || 'Test', ship: 'Łajba', col: 1 }); p.box = box; return p; };
// okręt gracza z podanego projektu, postawiony na otwartej wodzie
function rig(w, p, rows, q) {
  const pt = w.openWaterPoint(1, 80, 150) || w.randomWaterPoint(1);
  p.ship.applyDesign(Design.fromRows(rows, q || 0));
  p.ship.x = pt.x; p.ship.y = pt.y; p.ship.vx = p.ship.vy = 0; p.ship.ang = 0;
  w.tick(dt);
  return p.ship;
}
const lootOf = (w, part) => w.loot.filter(l => l.kind === 1 && l.item.p === part);
const sinkCore = (s, src) => { const k = s.blocks.indexOf(s.core); s.damageBlock(k, 1e6, src); };
let checks = 0;
const ok = (v, msg) => { assert.ok(v, msg); checks++; };

// ---------- definicje ----------
for (const p of Object.keys(PARTS)) {
  ok(itemValue(p, 0) >= 0 && partHp(p, 0) > 0, 'zła część ' + p);
  if (PARTS[p].w) ok(WEAPONS[PARTS[p].w], 'brak broni dla ' + p);
}
for (const r of RELICS) ok(isRelic(r) && PARTS[r].noShop, 'relikwia ' + r);
for (const c of CATS) for (const p of c.parts) ok(PARTS[p] && !PARTS[p].noShop || p === 'ghostw', 'kategoria ' + c.id + ': ' + p);
const st = Design.stats(Design.fromRows(TEMPLATES.flagowiec.rows, 2));
ok(st.load < 1 && st.fire > 0 && st.nG > 0, 'flagowiec ma złe statystyki');

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
  const p = join(w);
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
  ok(boss.kind === 'boss' && e.ships.length === 3, 'zła flota');
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
  run(w, 12);
  ok(s.integrity() < hp0 || !s.alive, 'macki nie atakują');
  // kula trafia potwora
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

// ---------- nowe bronie ----------
{
  const w = mkWorld();
  const p = join(w), q = join(w, 'Cel');
  // dwa okręty burta w burtę
  const rows = ['...........', '...........', '...........', '...........', '.....H.....', '...QHSHU...', '...EHHHJ...', '....H@H....', '....HHH....', '....HIH....',
    '...........', '...........', '...........', '...........', '...........'];
  const s = rig(w, p, rows, 1), t = q.ship;
  t.applyDesign(Design.fromRows(TEMPLATES.galeon.rows, 0));
  t.x = s.x + 70; t.y = s.y; t.ang = 0; t.vx = t.vy = 0;
  w.tick(dt);
  const arm = s.armament();
  ok(arm.L.length === 2 && arm.R.length === 2 && arm.S.length === 1, 'złe uzbrojenie: ' + JSON.stringify(arm));
  w.balls.length = 0;
  const shots = [];
  const old = w.ev.bind(w);
  w.ev = (type, ...a) => { if (type === 'b') shots.push(a[6]); return old(type, ...a); };
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
  // mina wybucha pod wrogiem
  const mine = w.barrels.find(b => b.type === 3);
  t.x = mine.x; t.y = mine.y + 2; t.vx = t.vy = 0;
  const i0 = t.integrity();
  run(w, 0.5);
  ok(!w.barrels.includes(mine) && t.integrity() < i0, 'mina nie wybuchła');
  // limit min
  for (let i = 0; i < 8; i++) { s.blocks.forEach(b => { b.rl = 0; }); w.layMine(s, s.blocks.find(b => b.p === 'mines')); }
  ok(w.barrels.filter(b => b.type === 3 && b.owner === s).length === MAX_MINES, 'limit min nie działa');
}

// ---------- ulepszenia ----------
{
  const base = Design.fromRows(['...........', '...........', '...........', '...........', '.....H.....', '....HSH....', '....HHH....', '....H@H....', '....HHH....',
    '.....R.....', '...........', '...........', '...........', '...........', '...........'], 0);
  const withSteam = Design.clone(base); withSteam[8 * COLS + 5] = { p: 'steam', q: 0 };
  const withJib = Design.clone(base); withJib[3 * COLS + 5] = { p: 'jib', q: 0 };
  const s0 = Design.stats(base), s1 = Design.stats(withSteam), s2 = Design.stats(withJib);
  ok(shipPhys(Design.list(withSteam)).steam > 0, 'kocioł nie daje ciągu');
  ok(physSpeed(s1.ph, 0.45) > physSpeed(s0.ph, 0.45), 'kocioł nie pomaga pod wiatr');
  ok(s2.turn > s0.turn && s2.speed > s0.speed, 'bukszpryt nic nie daje');
  const withArm = Design.clone(base); withArm[7 * COLS + 3] = { p: 'cannon', q: 0 }; withArm[6 * COLS + 3] = { p: 'armory', q: 0 };
  const withArm0 = Design.clone(withArm); withArm0[6 * COLS + 3] = { p: 'hull', q: 0 };
  ok(Design.stats(withArm).fire > Design.stats(withArm0).fire * 1.2, 'zbrojownia nie zwiększa obrażeń');
  const w = mkWorld();
  const p = join(w);
  const cr = Design.clone(base); cr[8 * COLS + 5] = { p: 'crane', q: 0 };
  p.ship.applyDesign(cr);
  ok(w.holdCap(p) === MAX_HOLD + CRANE_HOLD, 'żuraw nie powiększa ładowni');
}

// ---------- relikwie ----------
{
  const w = mkWorld();
  const p = join(w), s = p.ship;
  const put = (part, r, c) => { const d = Design.clone(s.design); d[r * COLS + c] = { p: part, q: 0 }; s.applyDesign(d); };
  put('dread', 8, 5);
  ok(s.relic.dread && s.dmgK === 1.2, 'Czarna Bandera nie działa');
  const pir = w.spawnNpc('pirate', s.x + 80, s.y);
  s.safe = false; s.port = -1;
  ok(w.findPrey(pir, 500) === null, 'pirat atakuje właściciela Czarnej Bandery');
  pir.lastHit = s;
  ok(w.findPrey(pir, 500) === s, 'pirat powinien się bronić');
  put('lantern', 6, 4);
  const hb = s.blocks.find(b => b.p === 'hull');
  s.ignite(hb, null);
  ok(hb.burn === 0, 'Latarnia Widma nie chroni przed ogniem');
  put('pearl', 6, 6);
  const blk = s.blocks.find(b => b.p === 'hull' && b.alive);
  blk.hp = blk.max * 0.3; s.combatT = 0;
  for (let i = 0; i < 60; i++) s.update(dt);
  ok(blk.hp > blk.max * 0.3 + 0.01 * blk.max, 'Perła nie naprawia');
  put('storm', 4, 4);
  ok(s.relic.storm, 'Butelka Burzy nie działa');
  // relikwie wypadają przy zatonięciu
  w.loot.length = 0;
  sinkCore(s, null);
  ok(['dread', 'lantern', 'pearl', 'storm'].every(r => lootOf(w, r).length === 1), 'relikwie nie wypadły');
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
console.log('OK - sprawdzeń:', checks);
