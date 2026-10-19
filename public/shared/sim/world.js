'use strict';
/* =========================================================
   Świat gry (serwer / tryb offline): wyspy, porty, gracze,
   okręty, pociski, beczki, łupy, zdarzenia, stocznia.
   Klientom wysyła migawki stanu i zdarzenia do efektów.
   ========================================================= */
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const b255 = f => Math.round(clamp(f, 0, 1) * 255);
const LINGER = 15, LINGER_COMBAT = 40;
const BARREL_T = [
  { name: 'beczka', hp: 18, gold: [6, 14], item: [0.08, 0.14, 0.22] },
  { name: 'beczka prochu', hp: 10, gold: [3, 6], item: [0, 0, 0] },
  { name: 'skrzynia', hp: 45, gold: [28, 55], item: [0.45, 0.55, 0.7] }
];
const DIR_NAMES = ['na północy', 'na północnym wschodzie', 'na wschodzie', 'na południowym wschodzie', 'na południu', 'na południowym zachodzie', 'na zachodzie', 'na północnym zachodzie'];
function dirName(x, y) {
  if (Math.hypot(x - WCX, y - WCY) < 500) return 'w samym środku morza';
  const a = Math.atan2(x - WCX, -(y - WCY));
  return DIR_NAMES[((Math.round(a / (TAU / 8)) % 8) + 8) % 8];
}

class SimWorld {
  constructor(o) {
    o = o || {};
    this.o = o;
    this.seed = o.seed || randi(1, 1e9);
    this.T = 0; this.tickN = 0; this._id = 1;
    this.players = new Map();
    this.ships = []; this.balls = []; this.shells = []; this.barrels = []; this.loot = []; this.timers = [];
    this.evq = []; this.wevents = []; this.weT = o.firstEvent || rand(50, 80); this.npcT = 1; this.barT = 0; this.mapT = 0;
    this.npcMax = o.npc === undefined ? 9 : o.npc;
    this.maxPlayers = o.maxPlayers || 40;
    this.hof = o.hof || [];
    this.topId = 0; this.topShip = 0;
    const wa = rand(0, TAU);
    this.wind = { ang: wa, target: wa, str: 1, changeT: rand(20, 40) };
    this.genWorld();
    for (let i = 0; i < 90; i++) this.spawnBarrel();
  }
  nid() { return this._id++; }
  later(t, fn) { this.timers.push({ t, fn }); }
  // zdarzenie dla klientów: [typ, czas, x, y, ...dane]
  ev(type, x, y, ...rest) { this.evq.push({ x, y, a: [type, r3(this.T), r1(x), r1(y)].concat(rest) }); }

  // ---------- generowanie świata ----------
  genWorld() {
    const rng = mulberry32(this.seed);
    this.islands = []; this.ports = [];
    const ok = (x, y, r, pad) => {
      if (x < r + 120 || x > WORLD - r - 120 || y < r + 120 || y > WORLD - r - 120) return false;
      for (const i of this.islands) if (Math.hypot(x - i.x, y - i.y) < r + i.r + pad) return false;
      for (const p of this.ports) if (Math.hypot(x - p.x, y - p.y) < r + p.safe + 30) return false;
      return true;
    };
    // porty: 3 w spokojnych wodach, 3 na szerokim morzu, 2 w głębinach
    const plan = [[0, 3, 420, 820], [1, 3, 1200, 1550], [2, 2, 1950, 2150]];
    const names = shuffle(PORT_NAMES.slice());
    for (const [zone, n, d0, d1] of plan) {
      // porty w głębinach tylko po przekątnych - przy osiach nie zmieściłyby się w świecie
      const a0 = zone === 2 ? TAU / 8 + Math.floor(rng() * 4) * TAU / 4 : rng() * TAU;
      for (let k = 0; k < n; k++) {
        for (let t = 0; t < 200; t++) {
          const a = a0 + k * TAU / n + (rng() - 0.5) * (zone === 2 ? 0.4 : 0.6 + t * 0.01), d = d0 + rng() * (d1 - d0);
          const x = WCX + Math.sin(a) * d, y = WCY - Math.cos(a) * d, r = 30 + rng() * 10;
          if (!ok(x, y, r + SAFE_PAD, 120)) continue;
          const port = { idx: this.ports.length, name: names[this.ports.length % names.length], x: Math.round(x), y: Math.round(y), r, safe: r + SAFE_PAD, zone };
          this.ports.push(port);
          this.islands.push({ x: port.x, y: port.y, r, cr: r * 0.92, kind: 'port', seed: Math.floor(rng() * 1e6), port: port.idx });
          break;
        }
      }
    }
    // zwykłe wyspy
    let tries = 0;
    while (this.islands.length < 64 && tries++ < 3000) {
      const x = 150 + rng() * (WORLD - 300), y = 150 + rng() * (WORLD - 300), zone = zoneOf(x, y);
      const roll = rng();
      let kind = roll < 0.45 ? 'palm' : roll < 0.75 ? 'rock' : 'sand';
      if (zone === 2 && rng() < 0.4) kind = 'rock';
      const big = rng() < 0.18;
      let r = kind === 'palm' ? 16 + rng() * 14 : kind === 'rock' ? 8 + rng() * 9 : 10 + rng() * 8;
      if (big && kind !== 'sand') r += 18 + rng() * 22;
      if (!ok(x, y, r, 80)) continue;
      this.islands.push({ x: Math.round(x), y: Math.round(y), r, cr: r * 0.92, kind, seed: Math.floor(rng() * 1e6), port: -1 });
      // rafa: kilka skałek obok
      if (zone === 2 && kind === 'rock' && rng() < 0.5) {
        for (let k = 0; k < 3; k++) {
          const a = rng() * TAU, d = r + 26 + rng() * 30, rr = 5 + rng() * 5, xx = x + Math.cos(a) * d, yy = y + Math.sin(a) * d;
          if (ok(xx, yy, rr, 14)) this.islands.push({ x: Math.round(xx), y: Math.round(yy), r: rr, cr: rr * 0.92, kind: 'rock', seed: Math.floor(rng() * 1e6), port: -1 });
        }
      }
    }
    // siatka do szybkiego wyszukiwania wysp
    this.igrid = new Map(); this.IG = 250;
    for (const isl of this.islands) {
      const x0 = Math.floor((isl.x - isl.r) / this.IG), x1 = Math.floor((isl.x + isl.r) / this.IG);
      const y0 = Math.floor((isl.y - isl.r) / this.IG), y1 = Math.floor((isl.y + isl.r) / this.IG);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const k = gx + ',' + gy; if (!this.igrid.has(k)) this.igrid.set(k, []); this.igrid.get(k).push(isl);
      }
    }
  }
  islandsNear(x, y, r) {
    const out = new Set(), G = this.IG;
    for (let gy = Math.floor((y - r) / G); gy <= Math.floor((y + r) / G); gy++)
      for (let gx = Math.floor((x - r) / G); gx <= Math.floor((x + r) / G); gx++) {
        const l = this.igrid.get(gx + ',' + gy); if (l) for (const i of l) out.add(i);
      }
    return out;
  }
  portAt(x, y) { for (const p of this.ports) if (Math.hypot(x - p.x, y - p.y) < p.safe) return p.idx; return -1; }
  isWater(x, y, pad) {
    if (x < 100 || y < 100 || x > WORLD - 100 || y > WORLD - 100) return false;
    for (const i of this.islandsNear(x, y, pad + 80)) if (Math.hypot(x - i.x, y - i.y) < i.r + pad) return false;
    return true;
  }
  randomWaterPoint(zone, avoidPorts) {
    for (let t = 0; t < 80; t++) {
      let x, y;
      if (zone === undefined || zone < 0) { x = rand(150, WORLD - 150); y = rand(150, WORLD - 150); }
      else {
        const d0 = zone === 0 ? 120 : ZONES[zone - 1].r + 40, d1 = zone === 2 ? 2700 : ZONES[zone].r - 40, a = rand(0, TAU), d = rand(d0, d1);
        x = WCX + Math.sin(a) * d; y = WCY - Math.cos(a) * d;
      }
      if (!this.isWater(x, y, 40)) continue;
      if (avoidPorts !== false && this.portAt(x, y) >= 0) continue;
      return { x, y };
    }
    return { x: WCX + rand(-300, 300), y: WCY + rand(-300, 300) };
  }
  // ---------- wiatr i sztormy ----------
  windAt(x, y) {
    for (const e of this.wevents) if (e.type === 'storm' && Math.hypot(x - e.x, y - e.y) < e.r) return { ang: e.wang, str: 1.35 };
    return this.wind;
  }
  // ---------- gracze ----------
  join(send, msg) {
    msg = msg || {};
    if (typeof msg.token === 'string') {
      for (const p of this.players.values()) if (p.token === msg.token && p.discT !== null) {
        p.send = send; p.discT = null; p.known.clear();
        this.welcome(p);
        if (p.dead) p.send({ t: 'dead', st: p.lastLife, by: p.killedBy });
        return p;
      }
    }
    let n = 0; for (const p of this.players.values()) if (p.discT === null) n++;
    if (n >= this.maxPlayers) { send({ t: 'full' }); return null; }
    const p = {
      id: this.nid(), send, token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      name: cleanName(msg.name, 16) || 'Kapitan', shipName: cleanName(msg.ship, 20) || SHIP_NAMES.random(),
      col: clamp(msg.col | 0, 0, N_PLAYER_COLORS - 1), ship: null, gold: 0, hold: new Map(), life: null,
      known: new Map(), yard: false, dead: false, discT: null, chatT: -99, noteT: {}, camX: WCX, camY: WCY, killedBy: null, lastLife: null
    };
    this.players.set(p.id, p);
    this.spawnPlayer(p);
    this.welcome(p);
    this.feed({ k: 'info', x: p.name + ' wypływa na morze' }, p);
    return p;
  }
  welcome(p) {
    p.send({
      t: 'welcome', id: p.id, token: p.token, T: r3(this.T), seed: this.seed, ver: VERSION, offline: !!this.o.offline,
      isl: this.islands.map(i => [i.x, i.y, r1(i.r), i.kind, i.seed, i.port]),
      ports: this.ports.map(q => [q.name, q.x, q.y, r1(q.r), r1(q.safe), q.zone]),
      you: { ship: p.ship ? p.ship.id : 0, gold: p.gold, name: p.name, shipName: p.shipName, col: p.col }, hof: this.hof
    });
    if (p.ship) p.send(this.yardMsg(p, true));
    this.sendMap(p);
  }
  spawnPlayer(p) {
    const inner = this.ports.filter(q => q.zone === 0), port = pick(inner.length ? inner : this.ports);
    let x = port.x, y = port.y, a = 0;
    for (let t = 0; t < 40; t++) {
      a = rand(0, TAU); const d = port.r + rand(45, 75);
      x = port.x + Math.sin(a) * d; y = port.y - Math.cos(a) * d;
      if (this.isWater(x, y, 30)) break;
    }
    const ship = new SimShip(this, this.nid(), Design.fromRows(STARTER_ROWS, 0), { kind: 'player', name: p.shipName, col: p.col, owner: p, x, y, ang: a });
    this.ships.push(ship);
    p.ship = ship; p.gold = START_GOLD; p.hold.clear(); p.dead = false; p.yard = false; p.killedBy = null;
    p.life = { t0: this.T, kills: 0, npc: 0, barrels: 0, gold: 0, maxPower: ship.power };
    return ship;
  }
  leave(p) {
    if (!p || !this.players.has(p.id)) return;
    p.send = null; p.discT = this.T; p.yard = false;
  }
  removePlayer(p) {
    if (p.ship && !p.dead) { this.endLife(p, null); this.removeShip(p.ship); }
    this.players.delete(p.id);
  }
  removeShip(s) { const i = this.ships.indexOf(s); if (i >= 0) this.ships.splice(i, 1); s.dead = true; }
  feed(m, except) { for (const p of this.players.values()) if (p.send && p !== except) p.send(Object.assign({ t: 'feed' }, m)); }
  banner(x, s, c) { for (const p of this.players.values()) if (p.send) p.send({ t: 'ban', x, s, c }); }
  notify(ship, text, col) {
    const p = ship && ship.owner; if (!p || !p.send) return;
    if (p.noteT[text] && this.T - p.noteT[text] < 2) return;
    p.noteT[text] = this.T;
    p.send({ t: 'note', x: text, c: col || PAL.salmon });
  }
  // ---------- wiadomości od klienta ----------
  handle(p, m) {
    if (!p || !m || typeof m.t !== 'string') return;
    const s = p.ship;
    switch (m.t) {
      case 'in':
        if (s && s.alive && !p.yard) {
          s.throttle = clamp(Math.round(Number(m.thr) || 0), -1, 3);
          s.turn = clamp(Number(m.turn) || 0, -1, 1);
        }
        break;
      case 'fire':
        if (s && s.alive && !p.yard && (m.s === 'L' || m.s === 'R' || m.s === 'S')) s.fire(m.s);
        break;
      case 'yard':
        if (m.op === 'open') {
          if (!s || !s.alive || s.port < 0) { this.notify(s, 'Stocznia jest tylko w porcie'); break; }
          p.yard = true; s.throttle = 0; s.turn = 0;
          p.send(this.yardMsg(p));
        } else { p.yard = false; p.send({ t: 'yard', closed: true }); }
        break;
      case 'build': if (p.yard && s && s.alive && Array.isArray(m.ops)) this.applyBuild(p, m.ops); break;
      case 'repair': if (p.yard && s && s.alive) this.repair(p); break;
      case 'sell': if (p.yard && s && s.alive) this.sell(p, m); break;
      case 'chat': {
        const x = cleanName(m.x, 80);
        if (!x || this.T - p.chatT < 0.8) break;
        p.chatT = this.T;
        this.feed({ k: 'chat', n: p.name, c: SHIP_COLORS[p.col].l, x });
        break;
      }
      case 'respawn':
        if (p.dead) { this.spawnPlayer(p); p.known.clear(); p.send({ t: 'life', ship: p.ship.id, gold: p.gold }); p.send(this.yardMsg(p, true)); }
        break;
      case 'ping': p.send({ t: 'pong', c: m.c, T: r3(this.T) }); break;
    }
  }
  // ---------- ładownia i stocznia ----------
  holdCount(p) { let n = 0; for (const v of p.hold.values()) n += v.n; return n; }
  holdAdd(p, it, n) {
    n = n || 1;
    for (let i = 0; i < n; i++) {
      if (this.holdCount(p) >= MAX_HOLD) {
        const g = sellValue(it.p, it.q); p.gold += g;
        this.notify(p.ship, 'Ładownia pełna - sprzedano: ' + itemName(it.p, it.q) + ' (+' + g + ')', PAL.gold);
        continue;
      }
      const k = itemKey(it.p, it.q), e = p.hold.get(k);
      if (e) e.n++; else p.hold.set(k, { p: it.p, q: it.q, n: 1 });
    }
  }
  holdTake(p, pp, q) {
    const k = itemKey(pp, q), e = p.hold.get(k);
    if (!e || e.n < 1) return false;
    e.n--; if (!e.n) p.hold.delete(k);
    return true;
  }
  deadCells(s) { const o = []; for (const b of s.blocks) if (!b.alive) o.push(b.r * COLS + b.c); return o; }
  repairCost(s) { let c = 0; for (const b of s.blocks) if (!b.alive) c += Math.ceil(itemValue(b.p, b.q) * 0.25); return c; }
  yardMsg(p, quiet) {
    const s = p.ship;
    return {
      t: 'yard', quiet: !!quiet, g: p.gold, h: [...p.hold.values()].map(e => [e.p, e.q, e.n]),
      d: s ? Design.encode(s.design) : [], x: s ? this.deadCells(s) : [], rc: s ? this.repairCost(s) : 0, port: s && s.port >= 0 ? this.ports[s.port].name : ''
    };
  }
  applyBuild(p, ops) {
    const s = p.ship, a = Design.clone(s.design), alive = new Map();
    for (const b of s.blocks) alive.set(b.r * COLS + b.c, b.alive);
    let err = null, changed = false;
    for (const op of ops.slice(0, 40)) {
      if (!Array.isArray(op)) continue;
      const c = op[1] | 0, r = op[2] | 0;
      if (!Design.inb(c, r)) continue;
      const i = r * COLS + c;
      if (op[0] === 'place') {
        const pp = op[3];
        if (typeof pp !== 'string' || !Object.prototype.hasOwnProperty.call(PARTS, pp) || pp === 'core') continue;
        const q = hasQ(pp) ? clamp(op[4] | 0, 0, QUAL.length - 1) : 0, src = op[5] === 'hold' ? 'hold' : 'shop';
        let price = 0;
        if (src === 'shop') {
          if (PARTS[pp].noShop || q > SHOP_MAXQ) { err = 'Tego nie kupisz w porcie'; continue; }
          price = itemValue(pp, q);
        } else if (!p.hold.has(itemKey(pp, q))) { err = 'Nie masz tego w ładowni'; continue; }
        const res = Design.canPlace(a, c, r, { p: pp, q }, p.gold, price);
        if (!res.ok) { if (res.reason) err = res.reason; continue; }
        if (src === 'hold') this.holdTake(p, pp, q);
        if (res.replace && alive.get(i) !== false) this.holdAdd(p, res.replace);
        a[i] = { p: pp, q }; alive.set(i, true);
        p.gold -= price; changed = true;
      } else if (op[0] === 'rm') {
        const res = Design.removeAt(a, c, r);
        if (!res) continue;
        for (const x of res.removed) { if (alive.get(x.i) !== false) this.holdAdd(p, x); alive.delete(x.i); }
        changed = true;
      }
    }
    if (changed) {
      s.applyDesign(a);
      p.life.maxPower = Math.max(p.life.maxPower, s.power);
    }
    const msg = this.yardMsg(p);
    if (err) msg.err = err;
    p.send(msg);
  }
  repair(p) {
    const s = p.ship, cost = this.repairCost(s);
    if (cost > p.gold) { const msg = this.yardMsg(p); msg.err = 'Naprawa kosztuje ' + cost + ' złota'; p.send(msg); return; }
    p.gold -= cost; s.repairAll(); s.ver++;
    p.send(this.yardMsg(p));
  }
  sell(p, m) {
    const pp = m.p, q = m.q | 0, n = clamp(m.n | 0, 1, 99);
    if (typeof pp !== 'string' || !Object.prototype.hasOwnProperty.call(PARTS, pp)) return;
    let got = 0;
    for (let i = 0; i < n; i++) { if (!this.holdTake(p, pp, q)) break; got += sellValue(pp, q); }
    p.gold += got;
    p.send(this.yardMsg(p));
  }
  // ---------- NPC ----------
  spawnNpc(kind, x, y, o) {
    o = o || {};
    let design, ctrl, name, col;
    const zone = zoneOf(x, y);
    if (kind === 'ghost') {
      design = Design.fromRows(TEMPLATES.widmo.rows, 2);
      ctrl = new BotCtrl(2, 'broad', 'ghost'); name = 'Statek Widmo'; col = COL_GHOST;
    } else if (kind === 'merchant') {
      design = Design.fromRows(TEMPLATES.kupiec.rows, 1);
      ctrl = new BotCtrl(1, 'raider', 'merchant'); name = 'Złoty Galeon'; col = COL_MERCHANT;
    } else {
      const B = [[140, 260], [320, 600], [650, 1200]][zone], q = zone === 0 ? 0 : zone === 1 ? (chance(0.5) ? 1 : 0) : (chance(0.5) ? 2 : 1);
      const mat = zone === 0 ? null : zone === 1 ? 'oak' : pick(['mahog', 'iron', 'oak']);
      const built = AIBuild.make(rand(B[0], B[1]), zone, { q, mat });
      design = built.cells; ctrl = new BotCtrl(zone, built.arche, 'pirate'); name = SHIP_NAMES.random(); col = COL_PIRATE;
    }
    const ship = new SimShip(this, this.nid(), design, { kind, name, col, x, y, ang: rand(0, TAU) });
    ship.ctrl = ctrl; ship.zone = zone;
    this.ships.push(ship);
    return ship;
  }
  maintainNpc() {
    let nPl = 0, nNpc = 0;
    for (const p of this.players.values()) if (p.discT === null) nPl++;
    for (const s of this.ships) if (s.kind === 'pirate' && s.alive) nNpc++;
    const target = clamp(this.npcMax - Math.floor(nPl / 3), Math.min(4, this.npcMax), this.npcMax);
    if (nNpc >= target) return;
    const r = Math.random(), zone = r < 0.34 ? 0 : r < 0.7 ? 1 : 2;
    for (let t = 0; t < 10; t++) {
      const pt = this.randomWaterPoint(zone);
      if (this.ships.some(s => s.kind === 'player' && Math.hypot(s.x - pt.x, s.y - pt.y) < 650)) continue;
      this.spawnNpc('pirate', pt.x, pt.y);
      return;
    }
  }
  // cel dla bota: najbliższy okręt gracza poza portem
  findPrey(me, r) {
    let best = null, bd = r;
    for (const s of this.ships) {
      if (s.kind !== 'player' || !s.alive || s.safe) continue;
      const d = Math.hypot(s.x - me.x, s.y - me.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  hostile(a, b) { return a !== b && b.alive && !b.safe && (a.kind === 'player' || b.kind === 'player'); }
  // cel dla krętlic: najbliższy wrogi okręt albo beczka
  autoTarget(me, x, y, range) {
    let best = null, bd = range;
    for (const s of this.ships) {
      if (!this.hostile(me, s)) continue;
      const d = Math.hypot(s.x - x, s.y - y) - s.radius * 0.5;
      if (d < bd) { bd = d; best = s; }
    }
    if (me.kind === 'player') for (const b of this.barrels) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { x: best.x, y: best.y, vx: best.vx || 0, vy: best.vy || 0 } : null;
  }
  // ---------- pociski ----------
  spawnBall(owner, k, muzzle, x, y, vx, vy, vz, Wd, Q) {
    const id = this.nid();
    this.balls.push({ id, x, y, z: BALL_Z0, vx, vy, vz, owner, dmg: Wd.dmg * Q.dmg, kind: Wd.ball, fire: Wd.fire || 0, rig: Wd.rig || 1, hit: false });
    this.ev('b', x, y, id, r1(vx), r1(vy), r2(vz), Wd.ball, owner.id, k, muzzle ? 1 : 0);
  }
  fireMortar(ship, b) {
    const p = ship.blockWorld(b), Q = QUAL[b.q], range = WEAPONS.mortar.range * Q.rng * ship.rngK;
    let foe = null, bd = range;
    for (const s of this.ships) {
      if (!this.hostile(ship, s)) continue;
      const d = Math.hypot(s.x - p[0], s.y - p[1]);
      if (d < bd) { bd = d; foe = s; }
    }
    let tx, ty;
    if (foe) {
      const d = Math.hypot(foe.x - p[0], foe.y - p[1]), T = 0.9 + d / 240;
      const alive = foe.blocks.filter(q => q.alive), tb = alive.length ? pick(alive) : null;
      const tp = tb ? foe.blockWorld(tb) : [foe.x, foe.y];
      tx = tp[0] + foe.vx * T * 0.85; ty = tp[1] + foe.vy * T * 0.85;
      const err = 8 + d * 0.085, a = rand(0, TAU), e = Math.sqrt(rand(0, 1)) * err;
      tx += Math.cos(a) * e; ty += Math.sin(a) * e;
    } else { tx = p[0] + Math.sin(ship.ang) * 120; ty = p[1] - Math.cos(ship.ang) * 120; }
    const d = Math.hypot(tx - p[0], ty - p[1]), T = 0.9 + d / 240, H = 26 + d * 0.2;
    this.shells.push({ x0: p[0], y0: p[1], x1: tx, y1: ty, t: 0, T, owner: ship, dmg: WEAPONS.mortar.dmg * Q.dmg });
    this.ev('m', p[0], p[1], r1(tx), r1(ty), r2(T), r1(H), ship.id, ship.blocks.indexOf(b));
    ship.st.shots++;
  }
  areaDamage(x, y, r, dmg, src, fall) {
    fall = fall === undefined ? 0.85 : fall;
    let hit = false;
    for (const s of this.ships) {
      if (!s.alive || s.safe) continue;
      if (Math.hypot(s.x - x, s.y - y) > s.radius + r) continue;
      const targets = [];
      s.blocks.forEach((b, k) => { if (!b.alive) return; const w = s.blockWorld(b), d = Math.hypot(w[0] - x, w[1] - y); if (d < r) targets.push([k, d]); });
      for (const tg of targets) { const core = s.blocks[tg[0]].p === 'core'; s.damageBlock(tg[0], dmg * (1 - fall * tg[1] / r) * (core ? 0.5 : 1), src, { fireChance: 0.3 }); hit = true; }
      if (targets.length && src && src !== s) src.st.hits++;
    }
    for (const b of this.barrels.slice()) if (Math.hypot(b.x - x, b.y - y) < r + 5) this.damageBarrel(b, dmg, src);
    return hit;
  }
  kegBlast(ship, x, y, src) {
    this.ev('ex', x, y, 14);
    this.areaDamage(x, y, 15, 40, src);
  }
  updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      let gone = false;
      const end = (how) => { this.ev('bx', b.x, b.y, b.id, how); this.balls.splice(i, 1); gone = true; };
      for (let sub = 0; sub < 2 && !gone; sub++) {
        const h = dt / 2;
        b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h; b.vz -= BALL_G * h;
        for (const s of this.ships) {
          if (s === b.owner || !s.alive) continue;
          const dx = s.x - b.x, dy = s.y - b.y;
          if (dx * dx + dy * dy > (s.radius + 3) * (s.radius + 3)) continue;
          const k = s.blockAt(b.x, b.y);
          if (k < 0) continue;
          if (s.safe) { end(5); break; }
          const blk = s.blocks[k], metal = PARTS[blk.p].mat !== 'wood';
          if (!b.hit) { b.owner.st.hits++; b.hit = true; }
          const dmg = b.dmg * (RIGGING.has(blk.p) ? b.rig : 1);
          const left = s.damageBlock(k, dmg, b.owner, b.fire ? { fireChance: b.fire } : undefined);
          if (left > 5 && b.kind !== 2) { b.dmg = left; b.vx *= 0.7; b.vy *= 0.7; this.ev('bh', b.x, b.y, metal ? 1 : 0); }
          else end(metal ? 2 : 1);
          break;
        }
        if (gone) break;
        if (b.z < 7) for (const bar of this.barrels) {
          if (Math.abs(bar.x - b.x) < 7 && Math.abs(bar.y - b.y) < 7) { this.damageBarrel(bar, b.dmg, b.owner); end(4); break; }
        }
        if (gone) break;
        if (b.z < 6) for (const isl of this.islandsNear(b.x, b.y, 10)) {
          if (Math.hypot(b.x - isl.x, b.y - isl.y) < isl.cr * 0.95) { end(3); break; }
        }
        if (gone) break;
        if (b.z <= 0) end(0);
        else if (b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD) { this.balls.splice(i, 1); gone = true; }
      }
    }
  }
  updateShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.t += dt;
      if (s.t < s.T) continue;
      this.shells.splice(i, 1);
      if (this.portAt(s.x1, s.y1) >= 0) { this.ev('mx', s.x1, s.y1, 0); continue; }
      let onIsl = false;
      for (const isl of this.islandsNear(s.x1, s.y1, 10)) if (Math.hypot(s.x1 - isl.x, s.y1 - isl.y) < isl.cr) onIsl = true;
      const hit = this.areaDamage(s.x1, s.y1, 12, s.dmg, s.owner);
      this.ev('mx', s.x1, s.y1, hit || onIsl ? 1 : 0);
    }
  }
  // ---------- zderzenia ----------
  collidePair(A, B) {
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
    if (imp > 12 && A.hitCd <= 0 && B.hitCd <= 0) {
      A.hitCd = B.hitCd = 0.35;
      const ba = A.blocks[best[0]], bb = B.blocks[best[1]], base = imp * 0.75;
      const ramK = b => b.p === 'ram' ? 3 * QUAL[b.q].dmg : 1, takeK = b => b.p === 'ram' ? 0.25 : PARTS[b.p].mat === 'metal' ? 0.6 : 1;
      const dA = base * ramK(bb) * takeK(ba), dB = base * ramK(ba) * takeK(bb);
      if (ba.p === 'ram') A.st.rams++;
      if (bb.p === 'ram') B.st.rams++;
      A.damageBlock(best[0], dA, B, { fireChance: 0 });
      B.damageBlock(best[1], dB, A, { fireChance: 0 });
      // taran miażdży też sąsiednie części
      if (ba.p === 'ram' || bb.p === 'ram') {
        const victim = ba.p === 'ram' ? B : A, attacker = victim === A ? B : A;
        victim.blocks.forEach((b, k) => {
          if (!b.alive) return;
          const w = victim.blockWorld(b);
          if (Math.hypot(w[0] - cpx, w[1] - cpy) < 12) victim.damageBlock(k, base * 1.2, attacker, { fireChance: 0 });
        });
      }
      this.ev('rm', cpx, cpy, ba.p === 'ram' || bb.p === 'ram' ? 1 : 0, r2(clamp(imp / 70, 0.2, 0.8)));
    } else if (imp > 4 && chance(0.15)) this.ev('sc', cpx, cpy);
  }
  collideIslands(s) {
    if (!s.alive || s.ghost) return;
    for (const isl of this.islandsNear(s.x, s.y, s.radius + 4)) {
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
          this.ev('sc', cpx, cpy, 1);
        }
      }
    }
  }
  // ---------- beczki i łupy ----------
  spawnBarrel(x, y, type) {
    if (x === undefined) { const pt = this.randomWaterPoint(-1); x = pt.x; y = pt.y; }
    const zone = zoneOf(x, y);
    if (type === undefined) { const r = Math.random(); type = r < (zone === 2 ? 0.25 : 0.14) ? 2 : r < 0.32 ? 1 : 0; }
    const B = BARREL_T[type];
    const bar = { id: this.nid(), x, y, type, hp: B.hp, max: B.hp, vx: 0, vy: 0, t: 0, life: rand(260, 420), zone, ph: rand(0, TAU) };
    this.barrels.push(bar);
    return bar;
  }
  damageBarrel(bar, dmg, src) {
    if (bar.hp <= 0) return;
    bar.hp -= dmg;
    if (bar.hp <= 0) this.breakBarrel(bar, src);
  }
  breakBarrel(bar, src) {
    const i = this.barrels.indexOf(bar); if (i < 0) return;
    this.barrels.splice(i, 1); bar.hp = 0;
    const B = BARREL_T[bar.type], m = ZONES[bar.zone].mult;
    this.ev('bb', bar.x, bar.y, bar.id, bar.type);
    if (bar.type === 1) { this.ev('ex', bar.x, bar.y, 12); this.areaDamage(bar.x, bar.y, 22, 32, src); }
    if (src && src.owner && src.owner.life) src.owner.life.barrels++;
    const g = Math.round(rand(B.gold[0], B.gold[1]) * m);
    this.dropGold(bar.x, bar.y, g, 1);
    if (chance(B.item[bar.zone])) this.dropLoot(bar.x + rand(-5, 5), bar.y + rand(-5, 5), { kind: 1, item: this.rollItem(bar.zone, bar.type === 2) });
  }
  // losowy przedmiot z beczki/skrzyni - lepszy na dalszych wodach
  rollItem(zone, chest) {
    const W = [[0.5, 0.4, 0.1, 0, 0], [0.1, 0.45, 0.35, 0.1, 0], [0, 0.25, 0.45, 0.28, 0.02]][zone];
    let r = Math.random() - (chest ? 0.15 : 0), q = 0;
    for (let k = 0; k < W.length; k++) { r -= W[k]; if (r < 0) { q = k; break; } q = k; }
    if (chest && q < 4 && chance(0.3)) q++;
    const pool = ['mast', 'mast', 'mast', 'cannon', 'cannon', 'cannon', 'longgun', 'carro', 'firegun', 'chain', 'swivel', 'swivel', 'mortar', 'oars', 'rudder', 'keg', 'carp', 'nest', 'ram'];
    if (chance(0.15)) return { p: pick(['oak', 'mahog', 'iron', 'steel']), q: 0 };
    return { p: pick(pool), q: Math.min(q, 4) };
  }
  dropGold(x, y, total, piles) {
    total = Math.round(total);
    if (total <= 0) return;
    piles = Math.max(1, Math.min(piles || 1, total));
    for (let i = 0; i < piles; i++) {
      const g = i === piles - 1 ? total - Math.floor(total / piles) * (piles - 1) : Math.floor(total / piles);
      const a = rand(0, TAU), d = piles > 1 ? rand(6, 22) : rand(0, 4);
      this.dropLoot(x + Math.cos(a) * d, y + Math.sin(a) * d, { kind: 0, gold: g });
    }
  }
  dropLoot(x, y, o) {
    const l = Object.assign({ id: this.nid(), x, y, t: 0, life: 150, vx: rand(-4, 4), vy: rand(-4, 4) }, o);
    this.loot.push(l);
    return l;
  }
  updateBarrels(dt) {
    const wd = this.wind;
    for (let i = this.barrels.length - 1; i >= 0; i--) {
      const b = this.barrels[i];
      if (!b) continue; // wybuch beczki prochu mógł usunąć sąsiednie
      b.t += dt;
      if (b.t > b.life) { this.ev('sp', b.x, b.y); this.barrels.splice(i, 1); continue; }
      b.vx = Math.sin(wd.ang) * 2.2 + Math.sin(b.t * 0.13 + b.ph) * 1.5; b.vy = -Math.cos(wd.ang) * 2.2 + Math.cos(b.t * 0.11 + b.ph) * 1.5;
      b.x += b.vx * dt; b.y += b.vy * dt;
      for (const isl of this.islandsNear(b.x, b.y, 8)) {
        const dx = b.x - isl.x, dy = b.y - isl.y, d = Math.hypot(dx, dy) || 1;
        if (d < isl.r + 5) { b.x = isl.x + dx / d * (isl.r + 5); b.y = isl.y + dy / d * (isl.r + 5); }
      }
      if (b.x < 80 || b.y < 80 || b.x > WORLD - 80 || b.y > WORLD - 80) { this.barrels.splice(i, 1); continue; }
      // taranowanie beczek
      for (const s of this.ships) {
        if (!s.alive || Math.hypot(s.x - b.x, s.y - b.y) > s.radius + 6) continue;
        let hit = false;
        for (const blk of s.blocks) { if (!blk.alive) continue; const w = s.blockWorld(blk); if (Math.hypot(w[0] - b.x, w[1] - b.y) < 8) { hit = true; break; } }
        if (hit) { this.breakBarrel(b, s); break; }
      }
    }
    this.barT -= dt;
    if (this.barT <= 0) { this.barT = 1.5; if (this.barrels.length < 110) this.spawnBarrel(); }
  }
  updateLoot(dt) {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.t += dt; l.vx *= Math.exp(-0.6 * dt); l.vy *= Math.exp(-0.6 * dt);
      l.x += (l.vx + Math.sin(this.wind.ang) * 1.5) * dt; l.y += (l.vy - Math.cos(this.wind.ang) * 1.5) * dt;
      if (l.t > l.life) { this.loot.splice(i, 1); continue; }
      for (const s of this.ships) {
        if (s.kind !== 'player' || !s.alive || !s.owner || Math.hypot(s.x - l.x, s.y - l.y) > s.radius + 8) continue;
        let got = false;
        for (const blk of s.blocks) { if (!blk.alive) continue; const w = s.blockWorld(blk); if (Math.hypot(w[0] - l.x, w[1] - l.y) < 11) { got = true; break; } }
        if (!got) continue;
        this.collect(s.owner, l);
        this.loot.splice(i, 1);
        break;
      }
    }
  }
  collect(p, l) {
    this.ev('pk', l.x, l.y, l.id, p.ship.id, l.kind);
    if (l.kind === 0) {
      p.gold += l.gold; p.life.gold += l.gold;
      p.send && p.send({ t: 'note', x: '+' + l.gold + ' złota', c: PAL.yellow, f: 1 });
    } else {
      this.holdAdd(p, l.item);
      p.send && p.send({ t: 'note', x: itemName(l.item.p, l.item.q), c: QUAL[l.item.q].col, f: 1, it: [l.item.p, l.item.q] });
      if (l.item.q >= 3) this.feed({ k: 'loot', x: p.name + ' zdobywa: ' + itemName(l.item.p, l.item.q), c: QUAL[l.item.q].col });
    }
  }
  // ---------- zatonięcie ----------
  onSink(ship, src) {
    const x = ship.x, y = ship.y, val = ship.value, killer = src && src !== ship ? src : null;
    // łupy z wraku
    if (ship.kind === 'player') {
      const p = ship.owner;
      this.dropGold(x, y, p.gold * 0.5, 3);
      const items = shuffle([...p.hold.values()].flatMap(e => Array(e.n).fill(e))).slice(0, 3);
      const parts = shuffle(ship.blocks.filter(b => b.p !== 'core' && b.p !== 'hull')).slice(0, 2);
      for (const it of items.concat(parts)) this.dropLoot(x + rand(-20, 20), y + rand(-20, 20), { kind: 1, item: { p: it.p, q: it.q } });
    } else if (ship.kind === 'ghost') {
      this.dropGold(x, y, rand(500, 800), 6);
      for (let i = 0; i < 3; i++) this.dropLoot(x + rand(-26, 26), y + rand(-26, 26), { kind: 1, item: { p: pick(['mast', 'cannon', 'longgun', 'mortar', 'carp', 'swivel', 'firegun']), q: chance(0.5) ? 4 : 3 } });
      for (let i = 0; i < 2; i++) this.dropLoot(x + rand(-26, 26), y + rand(-26, 26), { kind: 1, item: { p: 'ghostw', q: 0 } });
    } else if (ship.kind === 'merchant') {
      this.dropGold(x, y, rand(400, 700), 6);
      this.dropLoot(x + rand(-15, 15), y + rand(-15, 15), { kind: 1, item: this.rollItem(2, true) });
    } else {
      this.dropGold(x, y, 12 + val * 0.12, 2);
      for (const b of shuffle(ship.blocks.filter(b => b.p !== 'core' && b.p !== 'hull')).slice(0, 2))
        if (chance(0.45)) this.dropLoot(x + rand(-16, 16), y + rand(-16, 16), { kind: 1, item: { p: b.p, q: b.q } });
    }
    // nagroda dla zwycięzcy
    const kp = killer && killer.kind === 'player' ? killer.owner : null;
    const victimP = ship.kind === 'player' ? ship.owner : null;
    if (kp && kp.life) {
      let bounty = Math.round(10 + val * 0.18);
      if (victimP && victimP.id === this.topId && this.topId !== kp.id) bounty += 150;
      if (ship.kind === 'ghost') bounty += 200;
      kp.gold += bounty; kp.life.gold += bounty;
      if (victimP) kp.life.kills++; else kp.life.npc++;
      kp.send && kp.send({ t: 'note', x: 'Łup za zatopienie: +' + bounty + ' złota', c: PAL.yellow, f: 1 });
    }
    const vname = victimP ? victimP.name : ship.kind === 'ghost' ? 'Statek Widmo' : ship.kind === 'merchant' ? 'Złoty Galeon' : 'Piraci (' + ship.name + ')';
    const kname = kp ? kp.name : killer ? (killer.kind === 'ghost' ? 'Statek Widmo' : killer.kind === 'merchant' ? 'Złoty Galeon' : 'Piraci') : null;
    if (victimP || ship.kind === 'ghost' || ship.kind === 'merchant' || kp) {
      this.feed({ k: 'kill', a: kname, b: vname, ac: kp ? SHIP_COLORS[kp.col].l : PAL.salmon, bc: victimP ? SHIP_COLORS[victimP.col].l : ship.kind === 'ghost' ? PAL.ghost : PAL.grey });
    }
    if (ship.kind === 'ghost') this.banner('WIDMO ZATOPIONE!', (kname || 'Morze') + ' rozbija klątwę. Łupy dryfują!', PAL.ghost);
    if (victimP) { this.endLife(victimP, kname); victimP.dead = true; victimP.yard = false; }
  }
  endLife(p, by) {
    const L = p.life; if (!L) return;
    const st = { time: Math.round(this.T - L.t0), kills: L.kills, npc: L.npc, barrels: L.barrels, gold: L.gold, maxPower: L.maxPower, ship: p.shipName };
    p.lastLife = st; p.killedBy = by; p.life = null;
    p.send && p.send({ t: 'dead', st, by });
    const e = { n: p.name, s: p.shipName, pw: st.maxPower, k: st.kills, npc: st.npc, g: st.gold, t: st.time };
    if (e.pw >= 15 || e.k > 0) {
      this.hof.push(e);
      this.hof.sort((a, b) => b.pw - a.pw || b.k - a.k || b.g - a.g);
      this.hof.length = Math.min(this.hof.length, 10);
      if (this.o.onHof) this.o.onHof(this.hof);
    }
  }
  // ---------- zdarzenia świata ----------
  startEvent(type) {
    const mark = (e) => { this.wevents.push(e); return e; };
    if (type === 'ghost') {
      const pt = this.randomWaterPoint(chance(0.5) ? 1 : 2);
      const s = this.spawnNpc('ghost', pt.x, pt.y);
      mark({ type, ship: s, t: 0, life: 300, x: pt.x, y: pt.y });
      this.ev('gh', pt.x, pt.y, s.id);
      this.banner('STATEK WIDMO!', 'Wynurzył się ' + dirName(pt.x, pt.y) + '. Kto go zatopi, zgarnie upiorne łupy!', PAL.ghost);
    } else if (type === 'merchant') {
      const pt = this.randomWaterPoint(chance(0.6) ? 1 : 0);
      const s = this.spawnNpc('merchant', pt.x, pt.y);
      mark({ type, ship: s, t: 0, life: 260, x: pt.x, y: pt.y });
      this.banner('ZŁOTY GALEON!', 'Kupiec z ładownią złota płynie ' + dirName(pt.x, pt.y) + '. Nie daj mu uciec!', PAL.gold);
    } else if (type === 'storm') {
      const pt = this.randomWaterPoint(-1, false), a = rand(0, TAU);
      mark({ type, t: 0, life: 200, x: pt.x, y: pt.y, r: 0, R: rand(280, 360), vx: Math.sin(a) * 9, vy: -Math.cos(a) * 9, wang: rand(0, TAU), lt: 2 });
      this.banner('SZTORM!', 'Nadciąga burza ' + dirName(pt.x, pt.y) + '. Pioruny nie wybierają.', PAL.cyan);
    } else if (type === 'treasure') {
      const pt = this.randomWaterPoint(chance(0.5) ? 1 : 2);
      for (let i = 0; i < 16; i++) {
        const a = rand(0, TAU), d = rand(10, 90), x = pt.x + Math.cos(a) * d, y = pt.y + Math.sin(a) * d;
        if (this.isWater(x, y, 8)) this.spawnBarrel(x, y, i < 6 ? 2 : i < 8 ? 1 : 0);
      }
      mark({ type, t: 0, life: 180, x: pt.x, y: pt.y });
      this.banner('DRYFUJĄCY SKARB!', 'Wrak kupca rozsypał skrzynie ' + dirName(pt.x, pt.y) + '.', PAL.yellow);
    }
  }
  updateEvents(dt) {
    this.weT -= dt;
    if (this.weT <= 0) {
      this.weT = rand(120, 200);
      if (this.wevents.length < 2) {
        const have = new Set(this.wevents.map(e => e.type));
        const opts = ['ghost', 'ghost', 'merchant', 'storm', 'treasure'].filter(t => !have.has(t));
        if (opts.length) this.startEvent(pick(opts));
      }
    }
    for (let i = this.wevents.length - 1; i >= 0; i--) {
      const e = this.wevents[i];
      e.t += dt;
      if (e.ship) {
        e.x = e.ship.x; e.y = e.ship.y;
        if (!e.ship.alive) { this.wevents.splice(i, 1); continue; }
        if (e.t > e.life) {
          if (e.type === 'ghost') this.ev('gh', e.ship.x, e.ship.y, e.ship.id);
          this.removeShip(e.ship); this.wevents.splice(i, 1);
          this.feed({ k: 'event', x: e.type === 'ghost' ? 'Statek Widmo znika pod falami...' : 'Złoty Galeon odpłynął z łupem.', c: PAL.grey });
          continue;
        }
      }
      if (e.type === 'storm') {
        e.r = e.t < 8 ? e.R * e.t / 8 : e.t > e.life - 10 ? e.R * Math.max(0, e.life - e.t) / 10 : e.R;
        e.x += e.vx * dt; e.y += e.vy * dt; e.wang += dt * 0.35;
        if (e.x < 300 || e.x > WORLD - 300) e.vx = -e.vx;
        if (e.y < 300 || e.y > WORLD - 300) e.vy = -e.vy;
        e.lt -= dt;
        if (e.lt <= 0 && e.r > 60) {
          e.lt = rand(1.2, 2.6);
          const inside = this.ships.filter(s => s.alive && !s.safe && Math.hypot(s.x - e.x, s.y - e.y) < e.r);
          if (inside.length && chance(0.6)) {
            const s = pick(inside), al = s.blocks.map((b, k) => b.alive ? k : -1).filter(k => k >= 0), k = pick(al), w = s.blockWorld(s.blocks[k]);
            this.ev('lt', w[0], w[1], 1);
            s.damageBlock(k, 30, null, { fireChance: 0.7 });
          } else {
            const a = rand(0, TAU), d = rand(0, e.r);
            this.ev('lt', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 0);
          }
        }
        if (e.t > e.life) { this.wevents.splice(i, 1); continue; }
      } else if (e.type === 'treasure' && e.t > e.life) this.wevents.splice(i, 1);
    }
  }
  // ---------- krok symulacji ----------
  tick(dt) {
    this.T += dt; this.tickN++;
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    const wd = this.wind;
    wd.changeT -= dt;
    if (wd.changeT <= 0) { wd.target = wd.ang + rand(-1.2, 1.2); wd.changeT = rand(25, 45); wd.str = rand(0.9, 1.1); }
    wd.ang = angNorm(wd.ang + angDiff(wd.ang, wd.target) * Math.min(1, dt * 0.15));
    // gracze, którzy się rozłączyli
    for (const p of this.players.values()) {
      if (p.discT === null) continue;
      const s = p.ship;
      if (s && s.alive) { s.throttle = 0; s.turn = 0; }
      const lim = s && s.alive && s.combatT > 0 ? LINGER_COMBAT : LINGER;
      if (this.T - p.discT > lim) this.removePlayer(p);
    }
    // sterowanie i ruch
    for (const s of this.ships) {
      if (s.alive && s.ctrl) s.ctrl.update(s, this, dt);
      s.update(dt);
      const port = s.alive ? this.portAt(s.x, s.y) : -1;
      s.port = port; s.safe = port >= 0 && s.kind === 'player';
    }
    for (let i = 0; i < this.ships.length; i++) {
      const A = this.ships[i]; if (!A.alive) continue;
      for (let j = i + 1; j < this.ships.length; j++) { const B = this.ships[j]; if (B.alive) this.collidePair(A, B); }
    }
    for (const s of this.ships) this.collideIslands(s);
    this.updateBalls(dt); this.updateShells(dt);
    this.updateBarrels(dt); this.updateLoot(dt);
    this.updateEvents(dt);
    // naprawa w porcie
    if (this.tickN % 8 === 0) for (const s of this.ships) if (s.safe && s.alive && s.integrity() < 1) s.heal(0.02);
    // okręty, które poszły na dno
    for (let i = this.ships.length - 1; i >= 0; i--) {
      const s = this.ships[i];
      if (!s.dead) continue;
      this.ships.splice(i, 1);
      if (s.owner && s.owner.ship === s) {
        s.owner.ship = null;
        if (s.owner.discT !== null) this.players.delete(s.owner.id);
      }
    }
    for (const p of this.players.values()) {
      if (p.ship) { p.camX = p.ship.x; p.camY = p.ship.y; }
      if (p.yard && (!p.ship || !p.ship.alive || p.ship.port < 0)) { p.yard = false; p.send && p.send({ t: 'yard', closed: true }); }
    }
    this.npcT -= dt;
    if (this.npcT <= 0) { this.npcT = 4; this.maintainNpc(); }
    if (this.tickN % SNAP_EVERY === 0) this.snapshot();
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 1; this.updateTop(); this.sendMap(); }
  }
  // ---------- ranking ----------
  updateTop() {
    let best = null, nOn = 0;
    for (const p of this.players.values()) {
      if (p.discT === null) nOn++;
      if (!p.ship || !p.ship.alive) continue;
      if (!best || p.ship.power > best.ship.power || (p.ship.power === best.ship.power && (p.life ? p.life.kills : 0) > (best.life ? best.life.kills : 0))) best = p;
    }
    const id = best ? best.id : 0;
    if (id !== this.topId && best && nOn > 1) {
      this.feed({ k: 'event', x: best.name + ' zostaje Postrachem Mórz! Za zatopienie: +150 złota', c: PAL.gold });
      best.send && best.send({ t: 'ban', x: 'POSTRACH MÓRZ!', s: 'Jesteś najsilniejszy na morzu. Wszyscy na Ciebie polują.', c: PAL.gold });
    }
    this.topId = id; this.topShip = best ? best.ship.id : 0;
  }
  sendMap(only) {
    const pl = [];
    for (const p of this.players.values()) {
      if (!p.ship || !p.ship.alive) continue;
      pl.push([p.id, p.name, Math.round(p.ship.x), Math.round(p.ship.y), p.ship.power, p.life ? p.life.kills : 0, p.col, p.ship.id, p.ship.name]);
    }
    const ev = this.wevents.map(e => [e.type, Math.round(e.x), Math.round(e.y), Math.round(e.r || 0), e.ship ? e.ship.id : 0]);
    let n = 0; for (const p of this.players.values()) if (p.discT === null) n++;
    const msg = { t: 'map', pl, top: this.topId, ev, n };
    if (only) { only.send && only.send(msg); return; }
    for (const p of this.players.values()) if (p.send) p.send(msg);
  }
  // ---------- migawki dla klientów ----------
  shipLayout(s) {
    return { t: 'ship', id: s.id, ver: s.ver, n: s.name, k: s.kind, c: s.col, pw: s.power, d: Design.encode(s.design), b: s.netBlocks(), own: s.owner ? s.owner.id : 0 };
  }
  shipNet(s) {
    const f = (s.alive ? 1 : 0) | (s.safe ? 2 : 0) | (s.buff.powder > 0 ? 4 : 0) | (s.buff.wind > 0 ? 8 : 0) | (s.id === this.topShip ? 32 : 0) | (s.owner && s.owner.yard ? 64 : 0);
    return [s.id, r1(s.x), r1(s.y), r3(s.ang), r1(s.vx), r1(s.vy), r2(s.w), s.throttle, r2(s.turn), b255(s.integrity()), b255(s.coreFrac()), f, b255(s.sinking)];
  }
  snapshot() {
    for (const s of this.ships) { s.bdOut = s.bd.size ? [...s.bd].map(k => blockNet(k, s.blocks[k])) : null; s.bd.clear(); }
    const A2 = AOI * AOI;
    for (const p of this.players.values()) {
      if (!p.send) continue;
      const cx = p.camX, cy = p.camY, seen = new Set(), sh = [], bd = [];
      for (const s of this.ships) {
        const dx = s.x - cx, dy = s.y - cy;
        if (dx * dx + dy * dy > A2 && s !== p.ship) continue;
        if (p.known.get(s.id) !== s.ver) { p.send(this.shipLayout(s)); p.known.set(s.id, s.ver); }
        else if (s.bdOut) bd.push([s.id].concat(s.bdOut));
        seen.add(s.id); sh.push(this.shipNet(s));
      }
      let gone = null;
      for (const id of p.known.keys()) if (!seen.has(id)) { (gone || (gone = [])).push(id); p.known.delete(id); }
      const bar = [], lo = [], ev = [], R2 = (AOI + 150) * (AOI + 150);
      for (const b of this.barrels) { const dx = b.x - cx, dy = b.y - cy; if (dx * dx + dy * dy < A2) bar.push([b.id, r1(b.x), r1(b.y), b.type, b255(b.hp / b.max)]); }
      for (const l of this.loot) { const dx = l.x - cx, dy = l.y - cy; if (dx * dx + dy * dy < A2) lo.push([l.id, r1(l.x), r1(l.y), l.kind, l.kind ? l.item.q : (l.gold >= 60 ? 1 : 0)]); }
      for (const e of this.evq) { const dx = e.x - cx, dy = e.y - cy; if (dx * dx + dy * dy < R2) ev.push(e.a); }
      const w = this.windAt(cx, cy), s = p.ship;
      const msg = { t: 's', T: r3(this.T), sh, bar, lo, ev, wd: [r3(w.ang), r2(w.str)] };
      if (gone) msg.gone = gone;
      if (bd.length) msg.bd = bd;
      if (s) {
        const arm = s.alive ? s.armament() : { L: [], R: [], S: [] };
        msg.me = { g: p.gold, pw: s.power, port: s.port, rl: [arm.L, arm.R, arm.S], n: this.holdCount(p), yard: p.yard ? 1 : 0, cmb: s.combatT > 0 ? 1 : 0, thr: s.throttle };
      }
      p.send(msg);
    }
    this.evq.length = 0;
  }
}
