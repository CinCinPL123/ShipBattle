'use strict';
// Szybki test symulacji: świat z botami i graczami-atrapami przez kilka minut czasu gry.
const assert = require('assert');
require('../server/load-shared')();

const world = new SimWorld({ seed: 12345, npc: 10, firstEvent: 5 });
const inbox = [];
const players = [];
for (let i = 0; i < 4; i++) {
  const box = { msgs: [], bytes: 0 };
  const p = world.join(m => { box.msgs.push(m.t); box.bytes += JSON.stringify(m).length; }, { name: 'Test' + i, ship: 'Łajba ' + i, col: i });
  players.push({ p, box });
}
assert.strictEqual(world.ports.length, 8, 'powinno być 8 portów');
assert.ok(world.islands.length > 40, 'za mało wysp: ' + world.islands.length);

const dt = 1 / TICK_HZ;
let events = new Set();
const t0 = Date.now();
for (let n = 0; n < TICK_HZ * 240; n++) {
  // gracze-atrapy: płyną, skręcają i strzelają
  for (const { p } of players) {
    if (p.dead) { world.handle(p, { t: 'respawn' }); continue; }
    if (n % 30 === 0) world.handle(p, { t: 'in', thr: 3, turn: Math.sin(n / 200 + p.id) });
    if (n % 45 === 0) world.handle(p, { t: 'fire', s: pick(['L', 'R', 'S']) });
  }
  world.tick(dt);
  for (const e of world.wevents) events.add(e.type);
}
const ms = Date.now() - t0;
const npc = world.ships.filter(s => s.kind === 'pirate').length;
console.log('czas symulacji 240 s:', ms, 'ms; statki:', world.ships.length, 'piraci:', npc, 'beczki:', world.barrels.length, 'łupy:', world.loot.length, 'zdarzenia:', [...events].join(','));
for (const { p, box } of players) console.log(p.name, 'wiadomości:', box.msgs.length, 'kB/s:', (box.bytes / 1024 / 240).toFixed(1), 'złoto:', p.gold, 'martwy:', p.dead);
assert.ok(npc >= 4, 'za mało piratów');
assert.ok(ms < 20000, 'symulacja za wolna');

// stocznia: kupno i usunięcie części
const P = players[0].p;
if (P.dead) world.handle(P, { t: 'respawn' });
const s = P.ship;
s.x = world.ports[0].x + world.ports[0].r + 40; s.y = world.ports[0].y; s.vx = s.vy = 0;
world.tick(dt);
assert.ok(s.port >= 0, 'okręt powinien być w porcie');
P.gold = 1000;
const last = [];
P.send = m => last.push(m);
world.handle(P, { t: 'yard', op: 'open' });
assert.strictEqual(last.pop().t, 'yard');
const v0 = s.value;
world.handle(P, { t: 'build', ops: [['place', 5, 4, 'hull', 0, 'shop'], ['place', 5, 3, 'mast', 2, 'shop'], ['place', 4, 7, 'longgun', 1, 'shop']] });
let y = last.pop();
assert.ok(!y.err, 'błąd stoczni: ' + y.err);
assert.ok(s.value > v0, 'wartość okrętu nie wzrosła');
assert.strictEqual(P.gold, 1000 - itemValue('hull', 0) - itemValue('mast', 2) - itemValue('longgun', 1));
world.handle(P, { t: 'build', ops: [['rm', 5, 4]] });
y = last.pop();
assert.ok(y.h.some(e => e[0] === 'mast' && e[1] === 2), 'maszt powinien trafić do ładowni');
world.handle(P, { t: 'build', ops: [['place', 5, 4, 'mast', 2, 'hold']] });
y = last.pop();
assert.ok(!y.err, 'nie da się postawić z ładowni: ' + y.err);
world.handle(P, { t: 'build', ops: [['place', 5, 3, 'ghostw', 0, 'shop']] });
assert.ok(last.pop().err, 'upiorne drewno nie powinno być w sklepie');
console.log('OK');
