'use strict';
/* =========================================================
   Świat gry (serwer / tryb offline): wyspy, porty, gracze,
   okręty, pociski, beczki, miny, łupy, zdarzenia, kraken,
   zlecenia portowe, stocznia.
   Klientom wysyła migawki stanu i zdarzenia do efektów.
   ========================================================= */
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const b255 = f => Math.round(clamp(f, 0, 1) * 255);
const LINGER = 15, LINGER_COMBAT = 40;
const BARREL_T = [
  { name: 'beczka', hp: 18, gold: [6, 14], item: [0.08, 0.14, 0.22] },
  { name: 'beczka prochu', hp: 10, gold: [3, 6], item: [0, 0, 0] },
  { name: 'skrzynia', hp: 45, gold: [28, 55], item: [0.45, 0.55, 0.7] },
  { name: 'mina', hp: 8, gold: [0, 0], item: [0, 0, 0] }
];
// zdarzenia świata: waga losowania, odstęp między powtórkami (s) i grupa
// (z jednej grupy naraz trwa najwyżej jedno zdarzenie)
const WEV = {
  ghost: { w: 1, cd: 900, grp: 'foe' },
  kraken: { w: 1, cd: 900, grp: 'foe' },
  raid: { w: 1.3, cd: 600, grp: 'foe' },
  merchant: { w: 1.6, cd: 360, grp: 'foe' },
  regatta: { w: 1.2, cd: 720 },
  treasure: { w: 1.5, cd: 300 },
  storm: { w: 1.3, cd: 420, grp: 'sky' },
  fog: { w: 1.1, cd: 420, grp: 'sky' },
  whirl: { w: 1, cd: 540, grp: 'sky' }
};
const BOSS_NAMES = ['Krwawa Broda', 'Czarny Wąs', 'Jednooki Bartek', 'Morska Wiedźma', 'Hak', 'Zgniły Ząb', 'Rudy Rekin'];
const LOOT_GOOD = ['mast', 'cannon', 'longgun', 'mortar', 'carp', 'swivel', 'firegun', 'bombard', 'rocket', 'harpoon', 'steam', 'armory'];
const DIR_NAMES = ['na północy', 'na północnym wschodzie', 'na wschodzie', 'na południowym wschodzie', 'na południu', 'na południowym zachodzie', 'na zachodzie', 'na północnym zachodzie'];
function dirName(x, y) {
  if (Math.hypot(x - WCX, y - WCY) < 500) return 'w samym środku morza';
  const a = Math.atan2(x - WCX, -(y - WCY));
  return DIR_NAMES[((Math.round(a / (TAU / 8)) % 8) + 8) % 8];
}
function npcName(s) {
  return s.kind === 'ghost' ? 'Statek Widmo' : s.kind === 'merchant' ? 'Złoty Galeon' : s.kind === 'boss' ? s.name : 'Piraci';
}

class SimWorld {
  constructor(o) {
    o = o || {};
    this.o = o;
    this.seed = o.seed || randi(1, 1e9);
    this.T = 0; this.tickN = 0; this._id = 1;
    this.players = new Map();
    this.ships = []; this.balls = []; this.shells = []; this.barrels = []; this.loot = []; this.timers = []; this.tethers = []; this.mons = [];
    this.evq = []; this.wevents = []; this.weT = o.firstEvent || rand(60, 100); this.evLast = {};
    this.npcT = 1; this.npcCd = []; this.barT = 0; this.mapT = 0;
    this.npcMax = o.npc === undefined ? 5 : o.npc;
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
  onlineCount() { let n = 0; for (const p of this.players.values()) if (p.discT === null) n++; return n; }

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
  nearPort(x, y, pad) { return this.ports.some(p => Math.hypot(x - p.x, y - p.y) < p.safe + pad); }
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
  // otwarta woda z dala od wysp i portów (na duże zdarzenia)
  openWaterPoint(zone, pad, portPad) {
    for (let t = 0; t < 40; t++) {
      const q = this.randomWaterPoint(zone);
      if (this.isWater(q.x, q.y, pad) && !this.nearPort(q.x, q.y, portPad || 120)) return q;
    }
    return null;
  }
  // ---------- wiatr, sztormy i mgła ----------
  windAt(x, y) {
    for (const e of this.wevents) if (e.type === 'storm' && Math.hypot(x - e.x, y - e.y) < e.r) return { ang: e.wang, str: 1.35 };
    return this.wind;
  }
  inFog(x, y) {
    for (const e of this.wevents) if (e.type === 'fog' && Math.hypot(x - e.x, y - e.y) < e.r * 0.9) return true;
    return false;
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
    if (this.onlineCount() >= this.maxPlayers) { send({ t: 'full' }); return null; }
    const p = {
      id: this.nid(), send, token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      name: cleanName(msg.name, 16) || 'Kapitan', shipName: cleanName(msg.ship, 20) || SHIP_NAMES.random(),
      col: clamp(msg.col | 0, 0, N_PLAYER_COLORS - 1), ship: null, gold: 0, hold: new Map(), life: null,
      known: new Map(), yard: false, dead: false, discT: null, chatT: -99, noteT: {}, camX: WCX, camY: WCY, killedBy: null, lastLife: null,
      ct: null, ctT: -99
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
    p.ship = ship; p.gold = START_GOLD; p.hold.clear(); p.dead = false; p.yard = false; p.killedBy = null; p.ct = null; p.ctT = -99;
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
  holdCap(p) { return MAX_HOLD + (p.ship && p.ship.alive ? p.ship.crane * CRANE_HOLD : 0); }
  holdAdd(p, it, n) {
    n = n || 1;
    for (let i = 0; i < n; i++) {
      // relikwii nigdy nie sprzedajemy automatycznie
      if (this.holdCount(p) >= this.holdCap(p) && !isRelic(it.p)) {
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
      t: 'yard', quiet: !!quiet, g: p.gold, h: [...p.hold.values()].map(e => [e.p, e.q, e.n]), cap: this.holdCap(p),
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
  // ---------- zlecenia portowe ----------
  updateContracts() {
    for (const p of this.players.values()) {
      const s = p.ship;
      if (!s || !s.alive || p.dead || p.discT !== null || s.port < 0) continue;
      if (p.ct && p.ct.type === 'port' && s.port === p.ct.to) { this.ctProgress(p, 'port', 1); continue; }
      if (!p.ct && this.T - p.ctT > 15) this.offerContract(p, s.port);
    }
  }
  offerContract(p, pi) {
    const port = this.ports[pi], z = port.zone, m = [1, 1.5, 2.2][z];
    const others = this.ports.filter(q => q.idx !== pi && Math.abs(q.zone - z) <= 1);
    const type = pick(others.length ? ['npc', 'bar', 'bar', 'gold', 'port', 'port'] : ['npc', 'bar', 'gold']);
    let need = 1, reward = 0, to = -1;
    if (type === 'npc') { need = z === 0 ? 1 : 2; reward = (60 + need * 50) * m; }
    else if (type === 'bar') { need = randi(5, 9); reward = (20 + need * 7) * m; }
    else if (type === 'gold') { need = randi(12, 25) * 10; reward = need * 0.3 * m; }
    else { const dst = pick(others); to = dst.idx; reward = (40 + Math.hypot(dst.x - port.x, dst.y - port.y) / 9) * (1 + dst.zone * 0.3); }
    p.ct = { type, need, have: 0, reward: Math.max(10, Math.round(reward / 5) * 5), to };
    p.send && p.send({ t: 'note', x: 'Nowe zlecenie od kapitanatu portu!', c: PAL.gold, f: 1 });
  }
  ctProgress(p, type, n) {
    const c = p && p.ct;
    if (!c || c.type !== type || !p.life) return;
    c.have = Math.min(c.need, c.have + n);
    if (c.have < c.need) return;
    p.gold += c.reward; p.life.gold += c.reward;
    p.send && p.send({ t: 'ban', x: 'ZLECENIE WYKONANE!', s: 'Kapitanat płaci ' + c.reward + ' złota. Nowe zlecenie czeka w porcie.', c: PAL.gold });
    p.ct = null; p.ctT = this.T;
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
    } else if (kind === 'boss') {
      design = Design.fromRows(TEMPLATES.flagowiec.rows, o.q || 2);
      ctrl = new BotCtrl(2, 'broad', 'pirate'); name = o.name || 'Okręt Flagowy'; col = COL_PIRATE;
    } else {
      const B = [[140, 260], [320, 600], [650, 1200]][zone], q = zone === 0 ? 0 : zone === 1 ? (chance(0.5) ? 1 : 0) : (chance(0.5) ? 2 : 1);
      const mat = zone === 0 ? null : zone === 1 ? 'oak' : pick(['mahog', 'iron', 'oak']);
      const built = AIBuild.make(rand(B[0], B[1]), zone, { q, mat });
      design = built.cells; ctrl = new BotCtrl(zone, built.arche, 'pirate'); name = SHIP_NAMES.random(); col = COL_PIRATE;
    }
    const ship = new SimShip(this, this.nid(), design, { kind, name, col, x, y, ang: rand(0, TAU), evTag: o.evTag });
    ship.ctrl = ctrl; ship.zone = zone;
    this.ships.push(ship);
    return ship;
  }
  playerNear(x, y, r) { return this.ships.some(s => s.kind === 'player' && s.alive && Math.hypot(s.x - x, s.y - y) < r); }
  maintainNpc() {
    // okręty po skończonych zdarzeniach odpływają, gdy nikt na nie nie patrzy
    for (const s of this.ships.slice()) if (s.despawn && s.alive && s.combatT <= 0 && !this.playerNear(s.x, s.y, 700)) this.removeShip(s);
    let nNpc = 0;
    for (const s of this.ships) if (s.kind === 'pirate' && s.alive && !s.evTag) nNpc++;
    // zatopiony pirat wraca na morze dopiero po dłuższej chwili
    this.npcCd = this.npcCd.filter(t => t > this.T);
    const target = clamp(this.npcMax - Math.floor(this.onlineCount() / 4), Math.min(2, this.npcMax), this.npcMax);
    if (nNpc + this.npcCd.length >= target) return;
    const r = Math.random(), zone = r < 0.15 ? 0 : r < 0.55 ? 1 : 2;
    for (let t = 0; t < 10; t++) {
      const pt = this.randomWaterPoint(zone);
      if (this.playerNear(pt.x, pt.y, 650)) continue;
      this.spawnNpc('pirate', pt.x, pt.y);
      return;
    }
  }
  // cel dla bota: najbliższy okręt gracza poza portem
  findPrey(me, r) {
    let best = null, bd = r;
    const pirate = me.kind === 'pirate' || me.kind === 'boss';
    for (const s of this.ships) {
      if (s.kind !== 'player' || !s.alive || s.safe) continue;
      // Czarna Bandera: piraci nie zaczepiają swoich
      if (pirate && s.relic.dread && me.lastHit !== s) continue;
      const d = Math.hypot(s.x - me.x, s.y - me.y);
      if (d > 150 && this.inFog(s.x, s.y)) continue;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  hostile(a, b) { return a !== b && b.alive && !b.safe && (a.kind === 'player' || b.kind === 'player'); }
  // cel dla krętlic: najbliższy wrogi okręt, kraken albo beczka
  autoTarget(me, x, y, range) {
    let best = null, bd = range;
    for (const s of this.ships) {
      if (!this.hostile(me, s)) continue;
      const d = Math.hypot(s.x - x, s.y - y) - s.radius * 0.5;
      if (d < bd) { bd = d; best = s; }
    }
    if (me.kind === 'player') {
      for (const m of this.mons) {
        if (!m.alive || m.rise < 0.5) continue;
        const d = Math.hypot(m.x - x, m.y - y) - 14;
        if (d < bd) { bd = d; best = m; }
      }
      for (const b of this.barrels) {
        if (b.owner === me) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < bd) { bd = d; best = b; }
      }
    }
    return best ? { x: best.x, y: best.y, vx: best.vx || 0, vy: best.vy || 0 } : null;
  }
  // ---------- pociski ----------
  spawnBall(owner, k, muzzle, x, y, vx, vy, vz, Wd, Q, mul) {
    const id = this.nid();
    this.balls.push({
      id, x, y, z: BALL_Z0, vx, vy, vz, owner, dmg: Wd.dmg * Q.dmg * (mul || 1), kind: Wd.ball, fire: Wd.fire || 0, rig: Wd.rig || 1, hit: false,
      pen: !Wd.pel && !Wd.blast && !Wd.tether, blast: Wd.blast || 0, teth: Wd.tether || 0
    });
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
    let mon = null;
    if (ship.kind === 'player') for (const m of this.mons) {
      if (!m.alive || m.rise < 0.5) continue;
      const d = Math.hypot(m.x - p[0], m.y - p[1]);
      if (d < bd) { bd = d; mon = m; foe = null; }
    }
    let tx, ty;
    if (foe) {
      const d = Math.hypot(foe.x - p[0], foe.y - p[1]), T = 0.9 + d / 240;
      const alive = foe.blocks.filter(q => q.alive), tb = alive.length ? pick(alive) : null;
      const tp = tb ? foe.blockWorld(tb) : [foe.x, foe.y];
      tx = tp[0] + foe.vx * T * 0.85; ty = tp[1] + foe.vy * T * 0.85;
      const err = 8 + d * 0.085, a = rand(0, TAU), e = Math.sqrt(rand(0, 1)) * err;
      tx += Math.cos(a) * e; ty += Math.sin(a) * e;
    } else if (mon) { tx = mon.x + rand(-8, 8); ty = mon.y + rand(-8, 8); }
    else { tx = p[0] + Math.sin(ship.ang) * 120; ty = p[1] - Math.cos(ship.ang) * 120; }
    const d = Math.hypot(tx - p[0], ty - p[1]), T = 0.9 + d / 240, H = 26 + d * 0.2;
    this.shells.push({ x0: p[0], y0: p[1], x1: tx, y1: ty, t: 0, T, owner: ship, dmg: WEAPONS.mortar.dmg * Q.dmg * (b.armK || 1) * ship.dmgK });
    this.ev('m', p[0], p[1], r1(tx), r1(ty), r2(T), r1(H), ship.id, ship.blocks.indexOf(b));
    ship.st.shots++;
  }
  // mina morska za rufą
  layMine(ship, b) {
    const p = ship.toWorld(PAD + b.c * TILE + 4, PAD + b.r * TILE + 4 + 12);
    if (!this.isWater(p[0], p[1], 4) || this.portAt(p[0], p[1]) >= 0) return;
    const mine = this.barrels.filter(x => x.type === 3 && x.owner === ship);
    if (mine.length >= MAX_MINES) { const old = mine[0]; this.barrels.splice(this.barrels.indexOf(old), 1); this.ev('sp', old.x, old.y); }
    const bar = this.spawnBarrel(p[0], p[1], 3);
    bar.owner = ship; bar.arm = 1.2; bar.life = 90;
    bar.dmg = WEAPONS.mine.dmg * QUAL[b.q].dmg * (b.armK || 1) * ship.dmgK;
    this.ev('ml', p[0], p[1]);
    ship.st.shots++;
  }
  // harpun: lina między okrętami
  tether(a, s, dur) {
    if (!a || !a.alive || !s.alive || s.safe || a === s) return;
    for (let i = this.tethers.length - 1; i >= 0; i--) {
      const o = this.tethers[i];
      if (o.a === a) { this.ev('tx', (a.x + o.b.x) / 2, (a.y + o.b.y) / 2, a.id, o.b.id); this.tethers.splice(i, 1); }
    }
    const d = Math.hypot(s.x - a.x, s.y - a.y);
    this.tethers.push({ a, b: s, t: dur, len: Math.max(40, d) });
    this.ev('th', (a.x + s.x) / 2, (a.y + s.y) / 2, a.id, s.id, r1(dur));
  }
  updateTethers(dt) {
    for (let i = this.tethers.length - 1; i >= 0; i--) {
      const th = this.tethers[i], A = th.a, B = th.b;
      th.t -= dt;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
      if (th.t <= 0 || !A.alive || !B.alive || A.dead || B.dead || A.safe || B.safe || d > 300) {
        this.ev('tx', (A.x + B.x) / 2, (A.y + B.y) / 2, A.id, B.id); this.tethers.splice(i, 1); continue;
      }
      th.len = Math.max(36, th.len - 16 * dt); // lina się zwija
      if (d <= th.len) continue;
      const nx = dx / d, ny = dy / d, mA = A.ph.mass, mB = B.ph.mass, tot = mA + mB, ex = d - th.len;
      const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rv > 0) { A.vx += nx * rv * mB / tot; A.vy += ny * rv * mB / tot; B.vx -= nx * rv * mA / tot; B.vy -= ny * rv * mA / tot; }
      const c = Math.min(ex, 60 * dt);
      A.x += nx * c * mB / tot; A.y += ny * c * mB / tot; B.x -= nx * c * mA / tot; B.y -= ny * c * mA / tot;
    }
  }
  areaDamage(x, y, r, dmg, src, fall, noMon, fire) {
    fall = fall === undefined ? 0.85 : fall;
    let hit = false;
    for (const s of this.ships) {
      if (!s.alive || s.safe) continue;
      if (Math.hypot(s.x - x, s.y - y) > s.radius + r) continue;
      const targets = [];
      s.blocks.forEach((b, k) => { if (!b.alive) return; const w = s.blockWorld(b), d = Math.hypot(w[0] - x, w[1] - y); if (d < r) targets.push([k, d]); });
      for (const tg of targets) { const core = s.blocks[tg[0]].p === 'core'; s.damageBlock(tg[0], dmg * (1 - fall * tg[1] / r) * (core ? 0.5 : 1), src, { fireChance: fire === undefined ? 0.3 : fire }); hit = true; }
      if (targets.length && src && src !== s) src.st.hits++;
    }
    if (!noMon) for (const m of this.mons) if (m.alive && m.rise >= 0.5 && Math.hypot(m.x - x, m.y - y) < r + 18) { this.monDamage(m, dmg * 0.8, src); hit = true; }
    for (const b of this.barrels.slice()) if (Math.hypot(b.x - x, b.y - y) < r + 5) this.damageBarrel(b, dmg, src);
    return hit;
  }
  kegBlast(ship, x, y, src, big) {
    this.ev('ex', x, y, big ? 18 : 14);
    this.areaDamage(x, y, big ? 19 : 15, big ? 55 : 40, src);
  }
  updateBalls(dt) {
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      let gone = false;
      const end = (how) => {
        this.ev('bx', b.x, b.y, b.id, how); this.balls.splice(i, 1); gone = true;
        // bombarda: kula wybucha przy trafieniu
        if (b.blast && how !== 0 && how !== 5) { this.ev('ex', b.x, b.y, 9); this.areaDamage(b.x, b.y, b.blast, b.dmg * 0.45, b.owner, 0.5); }
      };
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
          // Latarnia Widma: część kul przelatuje przez okręt
          if (s.relic.lantern && b.lr !== s.id) { b.lr = s.id; if (chance(0.15)) { b.skip = s.id; this.ev('gp', b.x, b.y); } }
          if (b.skip === s.id) continue;
          const blk = s.blocks[k], metal = PARTS[blk.p].mat !== 'wood';
          if (!b.hit) { b.owner.st.hits++; b.hit = true; }
          const dmg = b.dmg * (RIGGING.has(blk.p) ? b.rig : 1);
          if (b.teth) this.tether(b.owner, s, b.teth);
          const left = s.damageBlock(k, dmg, b.owner, b.fire ? { fireChance: b.fire } : undefined);
          if (left > 5 && b.pen) { b.dmg = left; b.vx *= 0.7; b.vy *= 0.7; this.ev('bh', b.x, b.y, metal ? 1 : 0); }
          else end(metal ? 2 : 1);
          break;
        }
        if (gone) break;
        if (b.z < 9) for (const m of this.mons) {
          if (this.monHit(m, b.x, b.y)) { this.monDamage(m, b.dmg, b.owner); if (!b.hit) { b.owner.st.hits++; b.hit = true; } end(6); break; }
        }
        if (gone) break;
        if (b.z < 7) for (const bar of this.barrels) {
          if (bar.owner && bar.owner === b.owner) continue;
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
      // Ząb Krakena: zderzenia ranią mocniej, a właściciel dostaje mniej
      const krA = A.relic.kraken, krB = B.relic.kraken;
      const dA = base * ramK(bb) * takeK(ba) * (krB ? 1.6 : 1) * (krA ? 0.7 : 1), dB = base * ramK(ba) * takeK(bb) * (krA ? 1.6 : 1) * (krB ? 0.7 : 1);
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
          if (Math.hypot(w[0] - cpx, w[1] - cpy) < 12) victim.damageBlock(k, base * 1.2 * (attacker.relic.kraken ? 1.6 : 1), attacker, { fireChance: 0 });
        });
      }
      this.ev('rm', cpx, cpy, ba.p === 'ram' || bb.p === 'ram' ? 1 : 0, r2(clamp(imp / 70, 0.2, 0.8)));
    } else if (imp > 4 && chance(0.15)) this.ev('sc', cpx, cpy);
  }
  collideIslands(s) {
    if (!s.alive || s.ghost) return;
    for (const isl of this.islandsNear(s.x, s.y, s.radius + 4)) this.collideCircle(s, isl.x, isl.y, isl.r, isl.cr + 3.5);
  }
  // odpycha okręt od okrągłej przeszkody; zwraca [blok, siła uderzenia] (siła > 0 tylko gdy zadano obrażenia)
  collideCircle(s, x, y, r, rr) {
    const dx = s.x - x, dy = s.y - y;
    if (dx * dx + dy * dy > (s.radius + r + 4) * (s.radius + r + 4)) return null;
    let maxPen = 0, hitK = -1, px = 0, py = 0, cpx = 0, cpy = 0;
    s.blocks.forEach((b, k) => {
      if (!b.alive) return;
      const w = s.blockWorld(b), ddx = w[0] - x, ddy = w[1] - y, d = Math.hypot(ddx, ddy) || 0.01;
      if (d < rr && rr - d > maxPen) { maxPen = rr - d; hitK = k; px = ddx / d; py = ddy / d; cpx = w[0]; cpy = w[1]; }
    });
    if (hitK < 0) return null;
    s.x += px * maxPen; s.y += py * maxPen;
    const vn = s.vx * px + s.vy * py;
    let imp = 0;
    if (vn < 0) {
      s.vx -= px * vn * 1.3; s.vy -= py * vn * 1.3;
      const rX = cpx - s.x, rY = cpy - s.y;
      s.w = clamp(s.w + (rX * py - rY * px) * (-vn) / (s.ph.I * 64) * 2, -3, 3);
      if (-vn > 14 && s.hitCd <= 0) {
        s.hitCd = 0.4; imp = -vn;
        s.damageBlock(hitK, (-vn - 8) * 0.6 * (s.relic.kraken ? 0.7 : 1), null, { fireChance: 0 });
        this.ev('sc', cpx, cpy, 1);
      }
    }
    return [hitK, imp];
  }
  touchesBlock(s, x, y, r) {
    for (const blk of s.blocks) { if (!blk.alive) continue; const w = s.blockWorld(blk); if (Math.hypot(w[0] - x, w[1] - y) < r) return true; }
    return false;
  }
  // ---------- kraken ----------
  spawnKraken(x, y) {
    const max = Math.min(4800, 1600 + 400 * Math.max(0, this.onlineCount() - 1));
    const m = { id: this.nid(), x, y, hp: max, max, t: 0, rise: 0, alive: true, life: 300, tent: [] };
    for (let i = 0; i < 6; i++) m.tent.push({ a: i / 6 * TAU + rand(-0.3, 0.3), d: rand(36, 56), st: 0, t: rand(1, 3), tx: 0, ty: 0 });
    this.mons.push(m);
    return m;
  }
  tentPos(m, tn) { return [m.x + Math.cos(tn.a) * tn.d, m.y + Math.sin(tn.a) * tn.d]; }
  monHit(m, x, y) {
    if (!m.alive || m.rise < 0.5) return false;
    if (Math.hypot(x - m.x, y - m.y) < 20) return true;
    for (const tn of m.tent) if (tn.st) { const p = this.tentPos(m, tn); if (Math.hypot(x - p[0], y - p[1]) < 9) return true; }
    return false;
  }
  monDamage(m, dmg, src) {
    if (!m.alive || m.rise < 0.5 || !(dmg > 0)) return;
    m.hp -= dmg;
    if (src && src.st) { src.st.dmg += dmg; src.combatT = Math.max(src.combatT, 10); }
    if (m.hp <= 0) this.killMon(m, src);
  }
  killMon(m, src) {
    m.alive = false; m.hp = 0;
    this.ev('kd', m.x, m.y, m.id);
    this.dropGold(m.x, m.y, rand(600, 900), 8);
    this.dropLoot(m.x, m.y, { kind: 1, item: { p: 'kraken', q: 0 }, life: 240, vx: 0, vy: 0 });
    for (let i = 0; i < 2; i++) this.dropLoot(m.x + rand(-30, 30), m.y + rand(-30, 30), { kind: 1, item: { p: pick(LOOT_GOOD), q: chance(0.4) ? 4 : 3 } });
    const kp = src && src.kind === 'player' ? src.owner : null;
    if (kp && kp.life) {
      kp.gold += 250; kp.life.gold += 250; kp.life.npc++; this.ctProgress(kp, 'npc', 1);
      kp.send && kp.send({ t: 'note', x: 'Łup za Krakena: +250 złota', c: PAL.yellow, f: 1 });
    }
    this.feed({ k: 'kill', a: kp ? kp.name : null, b: 'Kraken', ac: kp ? SHIP_COLORS[kp.col].l : PAL.salmon, bc: PAL.mag });
    this.banner('KRAKEN POKONANY!', (kp ? kp.name : 'Morze') + ' zabija potwora. Ząb Krakena dryfuje na wodzie!', PAL.mag);
  }
  updateMons(dt) {
    for (let i = this.mons.length - 1; i >= 0; i--) {
      const m = this.mons[i];
      m.t += dt;
      if (!m.alive) { m.rise -= dt / 2.5; if (m.rise <= 0) this.mons.splice(i, 1); continue; }
      const leaving = m.t > m.life;
      m.rise = clamp(m.rise + (leaving ? -dt / 3 : dt / 3), 0, 1);
      if (leaving && m.rise <= 0) { this.mons.splice(i, 1); this.feed({ k: 'event', x: 'Kraken odpłynął w głębiny...', c: PAL.grey }); continue; }
      // powoli płynie za najbliższym okrętem
      let tg = null, bd = 460;
      for (const s of this.ships) { if (!s.alive || s.safe) continue; const d = Math.hypot(s.x - m.x, s.y - m.y); if (d < bd) { bd = d; tg = s; } }
      if (tg && bd > 70) {
        const nx = m.x + (tg.x - m.x) / bd * 8 * dt, ny = m.y + (tg.y - m.y) / bd * 8 * dt;
        if (this.isWater(nx, ny, 50) && !this.nearPort(nx, ny, 60)) { m.x = nx; m.y = ny; }
      }
      // macki: wynurzenie -> wypatrywanie -> zamach -> uderzenie
      m.tent.forEach((tn, idx) => {
        tn.t -= dt;
        if (tn.t > 0) return;
        if (tn.st === 0) {
          if (leaving || m.rise < 1) { tn.t = 0.5; return; }
          tn.a = rand(0, TAU); tn.d = rand(36, 58); tn.st = 1; tn.t = rand(0.8, 1.6);
        } else if (tn.st === 1) {
          if (leaving) { tn.st = 0; tn.t = 1; return; }
          const p = this.tentPos(m, tn);
          let foe = null, fd = 85;
          if (m.tent.filter(o => o.st >= 2).length < 2) for (const s of this.ships) { if (!s.alive || s.safe) continue; const d = Math.hypot(s.x - p[0], s.y - p[1]) - s.radius * 0.5; if (d < fd) { fd = d; foe = s; } }
          if (foe) {
            // macka bije w losową część okrętu (kajuta tylko wtedy, gdy nic innego nie zostało)
            const al = foe.blocks.filter(b => b.alive && b.p !== 'core'), tb = al.length ? pick(al) : foe.core, w = foe.blockWorld(tb);
            tn.st = 2; tn.t = 0.9; tn.tx = w[0] + foe.vx * 0.6; tn.ty = w[1] + foe.vy * 0.6; this.ev('kt', tn.tx, tn.ty, m.id, idx);
          }
          else if (chance(0.35)) { tn.st = 0; tn.t = rand(0.8, 2); }
          else tn.t = rand(0.6, 1.4);
        } else if (tn.st === 2) {
          tn.st = 3; tn.t = 0.45;
          this.ev('ks', tn.tx, tn.ty, m.id, idx);
          for (const s of this.ships) if (s.alive && Math.hypot(s.x - tn.tx, s.y - tn.ty) < s.radius + 14) s.envHit = { n: 'Kraken', T: this.T };
          this.areaDamage(tn.tx, tn.ty, 11, 18, null, 0.5, true, 0);
        } else { tn.st = 1; tn.t = rand(2.5, 4.5); }
      });
      // zderzenia z cielskiem - taran rani potwora
      if (m.rise > 0.5) for (const s of this.ships) {
        if (!s.alive) continue;
        const res = this.collideCircle(s, m.x, m.y, 16, 17);
        if (res && res[1] > 0) { const blk = s.blocks[res[0]]; this.monDamage(m, res[1] * (blk.p === 'ram' ? 3 * QUAL[blk.q].dmg : 0.6) * (s.relic.kraken ? 1.6 : 1), s); }
      }
    }
  }
  // ---------- beczki, miny i łupy ----------
  spawnBarrel(x, y, type) {
    if (x === undefined) { const pt = this.randomWaterPoint(-1); x = pt.x; y = pt.y; }
    const zone = zoneOf(x, y);
    if (type === undefined) { const r = Math.random(); type = r < (zone === 2 ? 0.25 : 0.14) ? 2 : r < 0.32 ? 1 : 0; }
    const B = BARREL_T[type];
    const bar = { id: this.nid(), x, y, type, hp: B.hp, max: B.hp, vx: 0, vy: 0, t: 0, life: rand(260, 420), zone, ph: rand(0, TAU), owner: null };
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
    this.ev('bb', bar.x, bar.y, bar.id, bar.type);
    if (bar.type === 3) { this.ev('ex', bar.x, bar.y, 13); this.areaDamage(bar.x, bar.y, 20, bar.dmg || WEAPONS.mine.dmg, bar.owner || src); return; }
    const B = BARREL_T[bar.type], m = ZONES[bar.zone].mult;
    if (bar.type === 1) { this.ev('ex', bar.x, bar.y, 12); this.areaDamage(bar.x, bar.y, 22, 32, src); }
    if (src && src.owner && src.owner.life) { src.owner.life.barrels++; this.ctProgress(src.owner, 'bar', 1); }
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
    const pool = ['mast', 'mast', 'mast', 'cannon', 'cannon', 'cannon', 'longgun', 'carro', 'firegun', 'chain', 'swivel', 'swivel', 'mortar', 'oars', 'rudder', 'keg', 'carp', 'nest', 'ram',
      'bombard', 'rocket', 'flame', 'harpoon', 'mines', 'jib', 'jib', 'steam', 'armory'];
    if (chance(0.15)) return { p: pick(['oak', 'mahog', 'iron', 'steel', 'crane']), q: 0 };
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
      // mina stoi w miejscu i czeka na wroga
      if (b.type === 3) {
        if (b.arm > 0) { b.arm -= dt; continue; }
        for (const s of this.ships) {
          if (s === b.owner || !b.owner || !this.hostile(b.owner, s) || Math.hypot(s.x - b.x, s.y - b.y) > s.radius + 6) continue;
          if (this.touchesBlock(s, b.x, b.y, 8)) { this.breakBarrel(b, b.owner); break; }
        }
        continue;
      }
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
        if (this.touchesBlock(s, b.x, b.y, 8)) { this.breakBarrel(b, s); break; }
      }
    }
    this.barT -= dt;
    if (this.barT <= 0) { this.barT = 1.5; if (this.barrels.length < 110) this.spawnBarrel(); }
  }
  updateLoot(dt) {
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.t += dt;
      if (!l.pin) {
        l.vx *= Math.exp(-0.6 * dt); l.vy *= Math.exp(-0.6 * dt);
        l.x += (l.vx + Math.sin(this.wind.ang) * 1.5) * dt; l.y += (l.vy - Math.cos(this.wind.ang) * 1.5) * dt;
      }
      if (l.t > l.life) { this.loot.splice(i, 1); continue; }
      for (const s of this.ships) {
        if (s.kind !== 'player' || !s.alive || !s.owner) continue;
        const reach = s.crane * 6;
        if (Math.hypot(s.x - l.x, s.y - l.y) > s.radius + 8 + reach) continue;
        if (!this.touchesBlock(s, l.x, l.y, 11 + reach)) continue;
        this.collect(s.owner, l);
        this.loot.splice(i, 1);
        break;
      }
    }
  }
  collect(p, l) {
    this.ev('pk', l.x, l.y, l.id, p.ship.id, l.kind);
    if (l.kind === 0) {
      const g = Math.round(l.gold * (p.ship && p.ship.relic.figure ? 1.25 : 1));
      p.gold += g; p.life.gold += g; this.ctProgress(p, 'gold', g);
      p.send && p.send({ t: 'note', x: '+' + g + ' złota', c: PAL.yellow, f: 1 });
    } else {
      this.holdAdd(p, l.item);
      const relic = isRelic(l.item.p);
      p.send && p.send({ t: 'note', x: itemName(l.item.p, l.item.q), c: relic ? PAL.gold : QUAL[l.item.q].col, f: 1, it: [l.item.p, l.item.q] });
      if (relic) this.banner('RELIKWIA!', p.name + ' zdobywa: ' + PARTS[l.item.p].name + '. Zamontuj ją w stoczni!', PAL.gold);
      else if (l.item.q >= 3) this.feed({ k: 'loot', x: p.name + ' zdobywa: ' + itemName(l.item.p, l.item.q), c: QUAL[l.item.q].col });
    }
  }
  // ---------- zatonięcie ----------
  onSink(ship, src) {
    const x = ship.x, y = ship.y, val = ship.value, killer = src && src !== ship ? src : null;
    const drop = (it, spread, life) => this.dropLoot(x + rand(-spread, spread), y + rand(-spread, spread), { kind: 1, item: { p: it.p, q: it.q }, life: life || 150 });
    // łupy z wraku
    if (ship.kind === 'player') {
      const p = ship.owner, hold = [...p.hold.values()];
      this.dropGold(x, y, p.gold * 0.5, 3);
      const items = shuffle(hold.filter(e => !isRelic(e.p)).flatMap(e => Array(e.n).fill(e))).slice(0, 3);
      const parts = shuffle(ship.blocks.filter(b => b.p !== 'core' && b.p !== 'hull' && !isRelic(b.p))).slice(0, 2);
      // relikwie zawsze idą do wody - kto pierwszy, ten lepszy
      const relics = ship.blocks.filter(b => isRelic(b.p)).concat(hold.filter(e => isRelic(e.p)).flatMap(e => Array(e.n).fill(e)));
      for (const it of items.concat(parts)) drop(it, 20);
      for (const it of relics) drop(it, 14, 240);
      if (relics.length) this.feed({ k: 'event', x: 'Relikwie kapitana ' + p.name + ' dryfują ' + dirName(x, y) + '!', c: PAL.gold });
    } else if (ship.kind === 'ghost') {
      this.dropGold(x, y, rand(500, 800), 6);
      for (let i = 0; i < 3; i++) drop({ p: pick(LOOT_GOOD), q: chance(0.5) ? 4 : 3 }, 26);
      for (let i = 0; i < 2; i++) drop({ p: 'ghostw', q: 0 }, 26);
      if (chance(0.5)) drop({ p: 'lantern', q: 0 }, 10, 240);
    } else if (ship.kind === 'merchant') {
      this.dropGold(x, y, rand(400, 700), 6);
      this.dropLoot(x + rand(-15, 15), y + rand(-15, 15), { kind: 1, item: this.rollItem(2, true) });
    } else if (ship.kind === 'boss') {
      this.dropGold(x, y, rand(400, 600), 6);
      drop({ p: 'dread', q: 0 }, 10, 240);
      this.dropLoot(x + rand(-15, 15), y + rand(-15, 15), { kind: 1, item: this.rollItem(2, true) });
    } else {
      this.dropGold(x, y, 12 + val * 0.12, 2);
      for (const b of shuffle(ship.blocks.filter(b => b.p !== 'core' && b.p !== 'hull')).slice(0, 2)) if (chance(0.45)) drop(b, 16);
      if (!ship.evTag) this.npcCd.push(this.T + rand(90, 160));
    }
    // nagroda dla zwycięzcy
    const kp = killer && killer.kind === 'player' ? killer.owner : null;
    const victimP = ship.kind === 'player' ? ship.owner : null;
    if (kp && kp.life) {
      let bounty = Math.round(10 + val * 0.18);
      if (victimP && victimP.id === this.topId && this.topId !== kp.id) bounty += 150;
      // list gończy: kapitan z serią zatopień ma nagrodę za głowę
      if (victimP && victimP.life && victimP.life.kills >= 2) bounty += 40 * victimP.life.kills;
      if (ship.kind === 'ghost' || ship.kind === 'boss') bounty += 200;
      kp.gold += bounty; kp.life.gold += bounty;
      if (victimP) {
        kp.life.kills++;
        const k = kp.life.kills;
        if (k === 3 || k === 5 || k >= 8) this.feed({ k: 'event', x: kp.name + ' jest poszukiwany listem gończym! Nagroda za głowę: ' + 40 * k + ' złota', c: PAL.salmon });
      } else { kp.life.npc++; this.ctProgress(kp, 'npc', 1); }
      kp.send && kp.send({ t: 'note', x: 'Łup za zatopienie: +' + bounty + ' złota', c: PAL.yellow, f: 1 });
    }
    const vname = victimP ? victimP.name : ship.kind === 'pirate' ? 'Piraci (' + ship.name + ')' : npcName(ship);
    // bez sprawcy: może to kraken, wir albo piorun
    const kname = kp ? kp.name : killer ? npcName(killer) : ship.envHit && this.T - ship.envHit.T < 15 ? ship.envHit.n : null;
    if (victimP || ship.kind === 'ghost' || ship.kind === 'merchant' || ship.kind === 'boss' || kp) {
      this.feed({ k: 'kill', a: kname, b: vname, ac: kp ? SHIP_COLORS[kp.col].l : PAL.salmon, bc: victimP ? SHIP_COLORS[victimP.col].l : ship.kind === 'ghost' ? PAL.ghost : PAL.grey });
    }
    if (ship.kind === 'ghost') this.banner('WIDMO ZATOPIONE!', (kname || 'Morze') + ' rozbija klątwę. Łupy dryfują!', PAL.ghost);
    if (ship.kind === 'boss') this.banner('FLAGOWIEC ZATOPIONY!', (kname || 'Morze') + ' rozbija flotę - ' + ship.name + ' idzie na dno. Czarna Bandera dryfuje!', PAL.red2);
    if (victimP) { this.endLife(victimP, kname); victimP.dead = true; victimP.yard = false; }
  }
  endLife(p, by) {
    const L = p.life; if (!L) return;
    const st = { time: Math.round(this.T - L.t0), kills: L.kills, npc: L.npc, barrels: L.barrels, gold: L.gold, maxPower: L.maxPower, ship: p.shipName };
    p.lastLife = st; p.killedBy = by; p.life = null; p.ct = null;
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
  // losuje zdarzenie z uwzględnieniem wag, odstępów i grup
  pickEvent() {
    if (this.wevents.length >= 2) return;
    const busy = new Set(this.wevents.map(e => e.type)), grp = new Set(this.wevents.map(e => WEV[e.type].grp).filter(Boolean));
    const opts = Object.keys(WEV).filter(k => !busy.has(k) && !(WEV[k].grp && grp.has(WEV[k].grp)) && this.T - (this.evLast[k] === undefined ? -1e9 : this.evLast[k]) >= WEV[k].cd);
    while (opts.length) {
      let tot = 0; for (const k of opts) tot += WEV[k].w;
      let r = Math.random() * tot, k = opts[opts.length - 1];
      for (const o of opts) { r -= WEV[o].w; if (r <= 0) { k = o; break; } }
      if (this.startEvent(k) !== false) { this.evLast[k] = this.T; return; }
      opts.splice(opts.indexOf(k), 1);
    }
  }
  startEvent(type) {
    const mark = (e) => { this.wevents.push(e); return e; };
    if (type === 'ghost') {
      const pt = this.randomWaterPoint(chance(0.5) ? 1 : 2);
      const s = this.spawnNpc('ghost', pt.x, pt.y);
      mark({ type, ship: s, t: 0, life: 240, x: pt.x, y: pt.y });
      this.ev('gh', pt.x, pt.y, s.id);
      this.banner('STATEK WIDMO!', 'Wynurzył się ' + dirName(pt.x, pt.y) + '. Kto go zatopi, zgarnie upiorne łupy - może nawet Latarnię Widma!', PAL.ghost);
    } else if (type === 'merchant') {
      const pt = this.randomWaterPoint(chance(0.6) ? 1 : 0);
      const s = this.spawnNpc('merchant', pt.x, pt.y);
      mark({ type, ship: s, t: 0, life: 260, x: pt.x, y: pt.y });
      this.banner('ZŁOTY GALEON!', 'Kupiec z ładownią złota płynie ' + dirName(pt.x, pt.y) + '. Nie daj mu uciec!', PAL.gold);
    } else if (type === 'storm') {
      const pt = this.randomWaterPoint(-1, false), a = rand(0, TAU);
      mark({ type, t: 0, life: 200, x: pt.x, y: pt.y, r: 0, R: rand(280, 360), vx: Math.sin(a) * 9, vy: -Math.cos(a) * 9, wang: rand(0, TAU), lt: 2, bottle: false });
      this.banner('SZTORM!', 'Nadciąga burza ' + dirName(pt.x, pt.y) + '. Pioruny nie wybierają - ale w oku cyklonu coś błyszczy.', PAL.cyan);
    } else if (type === 'treasure') {
      const pt = this.randomWaterPoint(chance(0.5) ? 1 : 2);
      for (let i = 0; i < 16; i++) {
        const a = rand(0, TAU), d = rand(10, 90), x = pt.x + Math.cos(a) * d, y = pt.y + Math.sin(a) * d;
        if (this.isWater(x, y, 8)) this.spawnBarrel(x, y, i < 6 ? 2 : i < 8 ? 1 : 0);
      }
      mark({ type, t: 0, life: 180, x: pt.x, y: pt.y });
      this.banner('DRYFUJĄCY SKARB!', 'Wrak kupca rozsypał skrzynie ' + dirName(pt.x, pt.y) + '.', PAL.yellow);
    } else if (type === 'raid') {
      const pt = this.randomWaterPoint(chance(0.5) ? 1 : 2), z = zoneOf(pt.x, pt.y), name = pick(BOSS_NAMES);
      const boss = this.spawnNpc('boss', pt.x, pt.y, { name: 'Kpt. ' + name, q: z === 2 ? 3 : 2 });
      const ships = [boss];
      for (let k = 0; k < 2; k++) {
        const a = rand(0, TAU), x = pt.x + Math.cos(a) * 80, y = pt.y + Math.sin(a) * 80;
        const ok = this.isWater(x, y, 40);
        ships.push(this.spawnNpc('pirate', ok ? x : pt.x + (k ? 40 : -40), ok ? y : pt.y, { evTag: 'raid' }));
      }
      mark({ type, ship: boss, ships, t: 0, life: 300, x: pt.x, y: pt.y });
      this.banner('NAJAZD PIRATÓW!', 'Flota kapitana ' + name + ' grasuje ' + dirName(pt.x, pt.y) + '. Zatop flagowiec, a zdobędziesz Czarną Banderę!', PAL.red2);
    } else if (type === 'kraken') {
      const pt = this.openWaterPoint(chance(0.5) ? 1 : 2, 110, 200);
      if (!pt) return false;
      const m = this.spawnKraken(pt.x, pt.y);
      mark({ type, mon: m, t: 0, life: m.life + 10, x: pt.x, y: pt.y });
      this.ev('kr', pt.x, pt.y, m.id);
      this.banner('KRAKEN!', 'Potwór z głębin wynurzył się ' + dirName(pt.x, pt.y) + '. Kto go pokona, zdobędzie Ząb Krakena!', PAL.mag);
    } else if (type === 'whirl') {
      const pt = this.openWaterPoint(chance(0.5) ? 1 : 2, 70, 260);
      if (!pt) return false;
      const e = mark({ type, t: 0, life: 210, x: pt.x, y: pt.y, r: 0, R: rand(210, 250) });
      e.pearl = this.dropLoot(pt.x, pt.y, { kind: 1, item: { p: 'pearl', q: 0 }, life: 215, pin: true, vx: 0, vy: 0 });
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * TAU + rand(-0.3, 0.3), x = pt.x + Math.cos(a) * 130, y = pt.y + Math.sin(a) * 130;
        if (this.isWater(x, y, 8)) this.spawnBarrel(x, y, 2);
      }
      this.banner('WIR!', 'Wielki wir kręci się ' + dirName(pt.x, pt.y) + '. W jego oku błyszczy Perła Głębin - jeśli się odważysz...', PAL.blue2);
    } else if (type === 'fog') {
      const pt = this.randomWaterPoint(-1), a = rand(0, TAU);
      const e = mark({ type, t: 0, life: 240, x: pt.x, y: pt.y, r: 0, R: rand(340, 420), vx: Math.sin(a) * 5, vy: -Math.cos(a) * 5 });
      for (let i = 0; i < 8; i++) {
        const b = rand(0, TAU), d = rand(30, e.R * 0.6), x = pt.x + Math.cos(b) * d, y = pt.y + Math.sin(b) * d;
        if (this.isWater(x, y, 8)) this.spawnBarrel(x, y, i < 2 ? 2 : 0);
      }
      this.banner('MGŁA!', 'Gęsta mgła spowiła morze ' + dirName(pt.x, pt.y) + '. Kto w niej płynie, znika z map - wrogowie też.', PAL.silver);
    } else if (type === 'regatta') {
      for (let t = 0; t < 30; t++) {
        const a = rand(0, TAU), d = rand(420, 780), cx = WCX + Math.sin(a) * d, cy = WCY - Math.cos(a) * d, a0 = rand(0, TAU), R = 260;
        const buoys = [];
        for (let k = 0; k < 4; k++) {
          const b = a0 + k * TAU / 4, x = cx + Math.cos(b) * R, y = cy + Math.sin(b) * R;
          if (!this.isWater(x, y, 35) || this.nearPort(x, y, 20)) break;
          buoys.push([Math.round(x), Math.round(y)]);
        }
        if (buoys.length < 4) continue;
        mark({ type, t: 0, life: 300, x: cx, y: cy, r: R, buoys, prog: new Map(), ranks: [] });
        this.banner('REGATY!', 'Wyścig ' + dirName(cx, cy) + ': opłyń 4 boje po kolei. Zwycięzca zgarnia Złotą Syrenę!', PAL.yellow);
        return true;
      }
      return false;
    } else return false;
    return true;
  }
  regattaPrize(p, place) {
    const gold = [250, 180, 110][place - 1] || 0;
    p.gold += gold; if (p.life) p.life.gold += gold;
    p.send && p.send({ t: 'note', x: 'Meta! ' + place + '. miejsce (+' + gold + ' złota)', c: PAL.yellow, f: 1 });
    if (place === 1) {
      this.holdAdd(p, { p: 'figure', q: 0 });
      this.banner('REGATY WYGRANE!', p.name + ' zgarnia Złotą Syrenę i ' + gold + ' złota!', PAL.yellow);
    } else {
      if (place === 2) { const it = this.rollItem(2, true); it.q = Math.max(it.q, hasQ(it.p) ? 3 : 0); this.holdAdd(p, it); }
      this.feed({ k: 'event', x: p.name + ' kończy regaty na ' + place + '. miejscu (+' + gold + ' złota)', c: PAL.yellow });
    }
  }
  updateEvents(dt) {
    this.weT -= dt;
    if (this.weT <= 0) { this.weT = rand(150, 240); this.pickEvent(); }
    for (let i = this.wevents.length - 1; i >= 0; i--) {
      const e = this.wevents[i];
      e.t += dt;
      if (e.ship) {
        e.x = e.ship.x; e.y = e.ship.y;
        if (!e.ship.alive) {
          if (e.ships) for (const s of e.ships) s.despawn = true;
          this.wevents.splice(i, 1); continue;
        }
        if (e.t > e.life) {
          if (e.type === 'raid') {
            for (const s of e.ships) s.despawn = true;
            this.feed({ k: 'event', x: 'Piracka flota odpływa w siną dal.', c: PAL.grey });
          } else {
            if (e.type === 'ghost') this.ev('gh', e.ship.x, e.ship.y, e.ship.id);
            this.removeShip(e.ship);
            this.feed({ k: 'event', x: e.type === 'ghost' ? 'Statek Widmo znika pod falami...' : 'Złoty Galeon odpłynął z łupem.', c: PAL.grey });
          }
          this.wevents.splice(i, 1);
          continue;
        }
      }
      if (e.mon) {
        e.x = e.mon.x; e.y = e.mon.y;
        if (!this.mons.includes(e.mon) || !e.mon.alive) { this.wevents.splice(i, 1); continue; }
      }
      if (e.type === 'storm') {
        e.r = e.t < 8 ? e.R * e.t / 8 : e.t > e.life - 10 ? e.R * Math.max(0, e.life - e.t) / 10 : e.R;
        e.x += e.vx * dt; e.y += e.vy * dt; e.wang += dt * 0.35;
        if (e.x < 300 || e.x > WORLD - 300) e.vx = -e.vx;
        if (e.y < 300 || e.y > WORLD - 300) e.vy = -e.vy;
        // w połowie sztormu piorun odsłania Butelkę Burzy
        if (!e.bottle && e.t > e.life * 0.45 && this.isWater(e.x, e.y, 10)) {
          e.bottle = true;
          this.dropLoot(e.x, e.y, { kind: 1, item: { p: 'storm', q: 0 }, life: 150, vx: 0, vy: 0 });
          this.ev('lt', e.x, e.y, 0);
          this.feed({ k: 'event', x: 'Piorun trafił w dryfującą butelkę - Butelka Burzy pływa w oku sztormu!', c: PAL.cyan });
        }
        e.lt -= dt;
        if (e.lt <= 0 && e.r > 60) {
          e.lt = rand(1.2, 2.6);
          const inside = this.ships.filter(s => s.alive && !s.safe && !s.relic.storm && Math.hypot(s.x - e.x, s.y - e.y) < e.r);
          if (inside.length && chance(0.6)) {
            const s = pick(inside), al = s.blocks.map((b, k) => b.alive ? k : -1).filter(k => k >= 0), k = pick(al), w = s.blockWorld(s.blocks[k]);
            this.ev('lt', w[0], w[1], 1);
            s.envHit = { n: 'Piorun', T: this.T };
            s.damageBlock(k, 30, null, { fireChance: 0.7 });
          } else {
            const a = rand(0, TAU), d = rand(0, e.r);
            this.ev('lt', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 0);
          }
        }
        if (e.t > e.life) { this.wevents.splice(i, 1); continue; }
      } else if (e.type === 'whirl') {
        e.r = e.t < 6 ? e.R * e.t / 6 : e.t > e.life - 8 ? e.R * Math.max(0, e.life - e.t) / 8 : e.R;
        if (e.r > 10) this.whirlPull(e, dt);
        if (e.t > e.life) {
          const k = this.loot.indexOf(e.pearl);
          if (k >= 0) { this.loot.splice(k, 1); this.ev('sp', e.x, e.y); this.feed({ k: 'event', x: 'Wir ucichł, a Perła Głębin opadła na dno...', c: PAL.grey }); }
          this.wevents.splice(i, 1); continue;
        }
      } else if (e.type === 'fog') {
        e.r = e.t < 10 ? e.R * e.t / 10 : e.t > e.life - 12 ? e.R * Math.max(0, e.life - e.t) / 12 : e.R;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (e.x < 400 || e.x > WORLD - 400) e.vx = -e.vx;
        if (e.y < 400 || e.y > WORLD - 400) e.vy = -e.vy;
        if (e.t > e.life) { this.wevents.splice(i, 1); continue; }
      } else if (e.type === 'regatta') {
        this.updateRegatta(e);
        if (e.ranks.length >= 3 || e.t > e.life) {
          if (!e.ranks.length) this.feed({ k: 'event', x: 'Regaty zakończone - nikt nie dopłynął do mety.', c: PAL.grey });
          this.wevents.splice(i, 1); continue;
        }
      } else if (e.type === 'treasure' && e.t > e.life) this.wevents.splice(i, 1);
    }
  }
  // wir: okręty, beczki i łupy krążą i są wciągane do środka
  whirlPull(e, dt) {
    const R = e.r, push = (o, k) => {
      const dx = o.x - e.x, dy = o.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      o.x += (-uy * 34 - ux * 14) * k * dt; o.y += (ux * 34 - uy * 14) * k * dt;
    };
    for (const s of this.ships) {
      if (!s.alive || s.safe) continue;
      const d = Math.hypot(s.x - e.x, s.y - e.y);
      if (d > R) continue;
      const k = 1 - d / R;
      push(s, k);
      s.ang = angNorm(s.ang + 0.5 * k * dt);
      if (d < 34) {
        s.whirlT = (s.whirlT || 0) - dt;
        if (s.whirlT <= 0) {
          s.whirlT = 0.8;
          const al = s.blocks.map((b, j) => b.alive ? j : -1).filter(j => j >= 0);
          if (al.length) { const j = pick(al), w = s.blockWorld(s.blocks[j]); s.envHit = { n: 'Wir', T: this.T }; s.damageBlock(j, 14, null, { fireChance: 0 }); this.ev('sc', w[0], w[1], 1); }
        }
      }
    }
    for (const b of this.barrels) { if (b.type === 3) continue; const d = Math.hypot(b.x - e.x, b.y - e.y); if (d < R && d > 6) push(b, 1 - d / R); }
    for (const l of this.loot) { if (l.pin) continue; const d = Math.hypot(l.x - e.x, l.y - e.y); if (d < R && d > 6) push(l, 1 - d / R); }
  }
  updateRegatta(e) {
    for (const p of this.players.values()) {
      const s = p.ship; if (!s || !s.alive || p.dead) continue;
      let pr = e.prog.get(p.id);
      if (!pr || pr.sid !== s.id) { pr = { sid: s.id, n: 0 }; e.prog.set(p.id, pr); }
      if (pr.n >= 4) continue;
      const bu = e.buoys[pr.n];
      if (Math.hypot(s.x - bu[0], s.y - bu[1]) > 44) continue;
      pr.n++;
      this.ev('rb', bu[0], bu[1], s.id);
      if (pr.n < 4) { p.send && p.send({ t: 'note', x: 'Boja ' + pr.n + '/4!', c: PAL.yellow, f: 1 }); continue; }
      this.regattaPrize(p, e.ranks.push(p.id));
      if (e.ranks.length >= 3) break;
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
    this.updateTethers(dt);
    for (let i = 0; i < this.ships.length; i++) {
      const A = this.ships[i]; if (!A.alive) continue;
      for (let j = i + 1; j < this.ships.length; j++) { const B = this.ships[j]; if (B.alive) this.collidePair(A, B); }
    }
    for (const s of this.ships) this.collideIslands(s);
    this.updateMons(dt);
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
    if (this.mapT <= 0) { this.mapT = 1; this.updateTop(); this.updateContracts(); this.sendMap(); }
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
      const s = p.ship;
      pl.push([p.id, p.name, Math.round(s.x), Math.round(s.y), s.power, p.life ? p.life.kills : 0, p.col, s.id, s.name, this.inFog(s.x, s.y) ? 1 : 0]);
    }
    const ev = this.wevents.map(e => {
      const row = [e.type, Math.round(e.x), Math.round(e.y), Math.round(e.r || 0), e.ship ? e.ship.id : 0];
      if (e.type === 'regatta') row.push([].concat(...e.buoys));
      if (e.type === 'kraken') row.push(b255(e.mon.hp / e.mon.max));
      return row;
    });
    const msg = { t: 'map', pl, top: this.topId, ev, n: this.onlineCount() };
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
  monNet(m) {
    const a = [m.id, r1(m.x), r1(m.y), b255(m.hp / m.max), b255(m.rise)];
    for (const tn of m.tent) a.push(Math.round(Math.cos(tn.a) * tn.d), Math.round(Math.sin(tn.a) * tn.d), tn.st);
    return a;
  }
  meNet(p) {
    const s = p.ship, arm = s.alive ? s.armament() : { L: [], R: [], S: [] };
    const me = { g: p.gold, pw: s.power, port: s.port, rl: [arm.L, arm.R, arm.S], n: this.holdCount(p), cap: this.holdCap(p), yard: p.yard ? 1 : 0, cmb: s.combatT > 0 ? 1 : 0, thr: s.throttle };
    if (p.ct) me.ct = [CT_TYPES.indexOf(p.ct.type), p.ct.have, p.ct.need, p.ct.reward, p.ct.to];
    const rg = this.wevents.find(e => e.type === 'regatta');
    if (rg) { const pr = rg.prog.get(p.id); me.rg = [pr && pr.sid === s.id ? pr.n : 0, rg.ranks.indexOf(p.id) + 1]; }
    return me;
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
      const bar = [], lo = [], ev = [], mn = [], R2 = (AOI + 150) * (AOI + 150);
      for (const b of this.barrels) { const dx = b.x - cx, dy = b.y - cy; if (dx * dx + dy * dy < A2) bar.push([b.id, r1(b.x), r1(b.y), b.type, b255(b.hp / b.max)]); }
      for (const l of this.loot) {
        const dx = l.x - cx, dy = l.y - cy; if (dx * dx + dy * dy >= A2) continue;
        const relic = l.kind && isRelic(l.item.p);
        lo.push([l.id, r1(l.x), r1(l.y), relic ? 2 : l.kind, relic ? RELICS.indexOf(l.item.p) : l.kind ? l.item.q : (l.gold >= 60 ? 1 : 0)]);
      }
      for (const m of this.mons) { const dx = m.x - cx, dy = m.y - cy; if (dx * dx + dy * dy < R2) mn.push(this.monNet(m)); }
      for (const e of this.evq) { const dx = e.x - cx, dy = e.y - cy; if (dx * dx + dy * dy < R2) ev.push(e.a); }
      const w = this.windAt(cx, cy), s = p.ship;
      const msg = { t: 's', T: r3(this.T), sh, bar, lo, ev, wd: [r3(w.ang), r2(w.str)] };
      if (mn.length) msg.mn = mn;
      if (gone) msg.gone = gone;
      if (bd.length) msg.bd = bd;
      if (s) msg.me = this.meNet(p);
      p.send(msg);
    }
    this.evq.length = 0;
  }
}
