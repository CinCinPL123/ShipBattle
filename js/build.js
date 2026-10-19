'use strict';
/* =========================================================
   Stocznia: budowa okrętu w 60 sekund
   ========================================================= */
const PART_TAG = {
  hull: 'Wypór +6', armor: '70 wytrzymałości', cannon: 'Przy wodzie', mortar: 'Sam celuje', mast: 'Napęd z wiatrem',
  oars: 'Tylko burta', rudder: 'Tylko rufa', ram: 'Tylko dziób', keg: 'Szybsze działa', carp: 'Naprawy'
};
class Builder {
  constructor(scene, idx, o) {
    this.scene = scene; this.idx = idx; this.team = idx;
    this.bind = o.bind; this.mouse = o.mouse; this.L = o.layout; this.budget = o.budget;
    this.cells = o.cells ? o.cells.slice() : Design.create();
    this.gold = this.budget - Design.cost(this.cells);
    if (this.gold < 0) { this.cells = Design.create(); this.gold = this.budget; }
    this.sel = 'hull'; this.mirror = true; this.cur = { c: CORE_C, r: CORE_R - 1 }; this.kb = !o.mouse;
    this.ready = false; this.undo = []; this.pending = null; this.paint = null; this.lastCell = null;
    this.pops = []; this.msg = null; this.msgT = 0; this.repeat = {}; this.hoverKey = null; this.ghost = null; this.confirmT = 0;
    this.overGrid = false; this.hoverPart = null;
    this.refresh();
  }
  refresh() {
    this.blocks = Design.list(this.cells);
    this.spr = renderShip(this.blocks, this.team);
    this.stats = Design.stats(this.cells);
    this.blockedSet = new Set(Design.blocked(this.cells));
    this.valid = new Set();
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i]) continue;
      if (Design.canPlace(this.cells, i % COLS, (i / COLS) | 0, this.sel, this.gold).ok) this.valid.add(i);
    }
    this.hoverKey = null;
  }
  cellScreen(c, r) { return [this.L.gx + c * 16, this.L.gy + r * 16]; }
  cellAt(mx, my) {
    const c = Math.floor((mx - this.L.gx) / 16), r = Math.floor((my - this.L.gy) / 16);
    return Design.inb(c, r) ? { c, r } : null;
  }
  ownsMouse() { const m = Input.mouse; return this.mouse && m.active && m.x >= this.L.x0 && m.x < this.L.x1; }
  say(text, bad) { this.msg = text; this.msgT = 2.4; this.msgBad = !!bad; if (bad) SFX.play('error'); }
  select(p) { if (this.sel === p) return; this.sel = p; this.refresh(); SFX.play('click'); }
  cycle(d) { const i = PART_ORDER.indexOf(this.sel); this.select(PART_ORDER[(i + d + PART_ORDER.length) % PART_ORDER.length]); }
  toggleMirror() { this.mirror = !this.mirror; this.say(this.mirror ? 'Lustro WŁĄCZONE - części stawiasz parami' : 'Lustro WYŁĄCZONE', false); SFX.play('click'); this.hoverKey = null; }
  begin() { this.pending = { cells: this.cells.slice(), gold: this.gold }; }
  commit() { if (this.pending) { this.undo.push(this.pending); if (this.undo.length > 80) this.undo.shift(); this.pending = null; } }
  doUndo() {
    const s = this.undo.pop();
    if (!s) { this.say('Nie ma czego cofnąć', true); return; }
    this.cells = s.cells; this.gold = s.gold; this.refresh(); SFX.play('remove');
  }
  clearAll() {
    if (Design.count(this.cells) <= 1) return;
    this.begin(); this.commit();
    this.cells = Design.create(); this.gold = this.budget; this.refresh();
    SFX.play('breakWood'); this.say('Stocznia wyczyszczona (Z cofa)', false);
  }
  placeAt(c, r, drag) {
    const res = Design.canPlace(this.cells, c, r, this.sel, this.gold, drag);
    if (!res.ok) { if (!drag && res.reason) this.say(res.reason, true); return false; }
    this.commit();
    this.applyPlace(c, r, res);
    if (this.mirror) {
      const mc = COLS - 1 - c;
      if (mc !== c) { const r2 = Design.canPlace(this.cells, mc, r, this.sel, this.gold, drag); if (r2.ok) this.applyPlace(mc, r, r2); }
    }
    this.refresh();
    this.scene.onChange(this);
    return true;
  }
  applyPlace(c, r, res) {
    this.cells[r * COLS + c] = this.sel; this.gold -= res.delta;
    const s = this.cellScreen(c, r);
    this.pops.push({ c, r, t: 0 });
    FX.dust(this.scene.fx, s[0] + 8, s[1] + 8);
    if (res.delta) FX.text(this.scene.fx, s[0] + 8, s[1] - 2, (res.delta > 0 ? '-' : '+') + Math.abs(res.delta), res.delta > 0 ? PAL.gold : PAL.green);
    SFX.play('place', { pitch: PARTS[this.sel].pitch * rand(0.94, 1.06) });
    if (res.delta) SFX.play('coin');
  }
  removeAt(c, r, drag) {
    const p = Design.get(this.cells, c, r);
    if (!p) return false;
    if (p === 'core') { if (!drag) this.say('Kajuta kapitana musi zostać na pokładzie!', true); return false; }
    this.commit();
    const one = cc => {
      const res = Design.removeAt(this.cells, cc, r); if (!res) return;
      this.gold += res.refund;
      for (const q of res.removed) {
        const s = this.cellScreen(q.c, q.r);
        for (let k = 0; k < 6; k++) this.scene.fx.add({ type: 'px', x: s[0] + 8, y: s[1] + 8, z: 2, vx: rand(-50, 50), vy: rand(-50, 50), vz: rand(30, 70), g: 160, drag: 1, life: 0.8, cols: [pick([PAL.woodL, PAL.wood, PAL.sand])], size: 2, onLand: 'die' });
      }
      const s = this.cellScreen(cc, r);
      FX.text(this.scene.fx, s[0] + 8, s[1] - 2, '+' + res.refund, PAL.green);
      if (res.removed.length > 1) this.say('Odpadło ' + (res.removed.length - 1) + ' niepołączonych części', false);
    };
    one(c);
    if (this.mirror) { const mc = COLS - 1 - c; if (mc !== c && Design.get(this.cells, mc, r) === p) one(mc); }
    SFX.play('remove');
    this.refresh(); this.scene.onChange(this);
    return true;
  }
  toggleReady() {
    if (this.scene.done) return;
    if (!this.ready && this.scene.mode !== 'pvp') {
      if (this.gold > this.budget * 0.35 && this.scene.time > 15 && this.confirmT <= 0) {
        this.confirmT = 3; this.say('Zostało ' + this.gold + ' złota! Naciśnij GOTOWE jeszcze raz', true); return;
      }
    }
    this.ready = !this.ready; this.confirmT = 0;
    SFX.play(this.ready ? 'ready' : 'click');
    if (this.ready) this.say('Gotowy do wodowania!', false);
    this.scene.checkReady();
  }
  keyRepeat(a, dt) {
    const down = Act.down(this.bind, a), r = this.repeat[a];
    if (!down) { this.repeat[a] = null; return false; }
    if (!r) { this.repeat[a] = { t: 0.22 }; return true; }
    r.t -= dt; if (r.t <= 0) { r.t = 0.075; return true; }
    return false;
  }
  update(dt) {
    this.msgT -= dt; this.confirmT -= dt;
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < 0.35);
    if (this.scene.done) return;
    const b = this.bind;
    const mv = (a, dc, dr) => {
      if (this.keyRepeat(a, dt)) {
        if (!this.kb) { this.kb = true; return; }
        this.cur.c = clamp(this.cur.c + dc, 0, COLS - 1); this.cur.r = clamp(this.cur.r + dr, 0, ROWS - 1);
        SFX.play('hover');
      }
    };
    mv('up', 0, -1); mv('down', 0, 1); mv('left', -1, 0); mv('right', 1, 0);
    if (Act.hit(b, 'prev')) this.cycle(-1);
    if (Act.hit(b, 'next')) this.cycle(1);
    if (Act.hit(b, 'place')) { this.kb = true; this.begin(); this.placeAt(this.cur.c, this.cur.r, false); this.pending = null; }
    if (Act.hit(b, 'remove')) { this.kb = true; this.begin(); this.removeAt(this.cur.c, this.cur.r, false); this.pending = null; }
    if (Act.hit(b, 'mirror')) this.toggleMirror();
    if (Act.hit(b, 'undo')) this.doUndo();
    if (Act.hit(b, 'ready')) this.toggleReady();
    this.overGrid = false; this.hoverPart = null;
    if (this.ownsMouse()) {
      const m = Input.mouse;
      if (this.scene.mode !== 'pvp') for (let k = 0; k < 10; k++) if (Input.hit('Digit' + ((k + 1) % 10)) || Input.hit('Numpad' + ((k + 1) % 10))) this.select(PART_ORDER[k]);
      if (m.wheel) this.cycle(m.wheel > 0 ? 1 : -1);
      // paleta
      for (const pr of this.L.palRects || []) if (Input.inRect(pr.x, pr.y, pr.w, pr.h)) { this.hoverPart = pr.p; if (m.pressed[0]) this.select(pr.p); }
      const cell = this.cellAt(m.x, m.y);
      if (cell) {
        this.overGrid = true;
        if (m.moved || m.pressed[0] || m.pressed[2]) { this.kb = false; this.cur = { c: cell.c, r: cell.r }; }
        const key = cell.c + ',' + cell.r;
        if (m.pressed[0]) { this.begin(); this.paint = 'place'; this.placeAt(cell.c, cell.r, false); this.lastCell = key; }
        else if (m.pressed[2]) { this.begin(); this.paint = 'remove'; this.removeAt(cell.c, cell.r, false); this.lastCell = key; }
        else if (this.paint && key !== this.lastCell && (m.down[0] || m.down[2])) {
          this.lastCell = key;
          if (this.paint === 'place') this.placeAt(cell.c, cell.r, true); else this.removeAt(cell.c, cell.r, true);
        }
      }
    }
    if (!Input.mouse.down[0] && !Input.mouse.down[2]) { if (this.paint) this.pending = null; this.paint = null; }
    this.updateGhost();
  }
  hoverCell() { return (this.kb || this.overGrid) ? this.cur : null; }
  updateGhost() {
    const h = this.hoverCell();
    const key = h ? h.c + ',' + h.r + ',' + this.sel + ',' + this.mirror + ',' + this.gold : null;
    if (key === this.hoverKey) return;
    this.hoverKey = key; this.ghost = null;
    if (!h) return;
    const res = Design.canPlace(this.cells, h.c, h.r, this.sel, this.gold);
    const cells = [];
    if (res.ok) {
      const a = this.cells.slice(); a[h.r * COLS + h.c] = this.sel; cells.push([h.c, h.r]);
      let g = this.gold - res.delta;
      if (this.mirror) {
        const mc = COLS - 1 - h.c;
        if (mc !== h.c) { const r2 = Design.canPlace(a, mc, h.r, this.sel, g); if (r2.ok) { a[h.r * COLS + mc] = this.sel; g -= r2.delta; cells.push([mc, h.r]); } }
      }
      const blockedNow = Design.blocked(a).filter(i => !this.blockedSet.has(i));
      this.ghost = { ok: true, cells, stats: Design.stats(a), cost: this.gold - g, newlyBlocked: blockedNow };
    } else if (!res.same) this.ghost = { ok: false, cells: [[h.c, h.r]], reason: res.reason };
    else this.ghost = { ok: false, same: true, cells: [[h.c, h.r]] };
  }
  // ---------- rysowanie siatki i okrętu ----------
  drawGrid(ctx, t) {
    const gx = this.L.gx, gy = this.L.gy;
    // siatka - kropki w narożnikach
    ctx.fillStyle = 'rgba(220,240,255,0.16)';
    for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= COLS; c++) ctx.fillRect(gx + c * 16 - (c === COLS ? 1 : 0), gy + r * 16 - (r === ROWS ? 1 : 0), 1, 1);
    if (this.mirror) { // oś lustra
      ctx.fillStyle = 'rgba(254,174,52,0.28)';
      for (let y = gy - 6; y < gy + ROWS * 16 + 6; y += 4) ctx.fillRect(gx + CORE_C * 16 + 7, y, 2, 2);
    }
    // dozwolone pola
    const pulse = 0.35 + 0.25 * Math.sin(t * 5);
    ctx.fillStyle = 'rgba(190,250,170,' + pulse.toFixed(2) + ')';
    for (const i of this.valid) {
      const x = gx + (i % COLS) * 16, y = gy + ((i / COLS) | 0) * 16;
      ctx.fillRect(x + 2, y + 2, 3, 1); ctx.fillRect(x + 2, y + 2, 1, 3);
      ctx.fillRect(x + 11, y + 2, 3, 1); ctx.fillRect(x + 13, y + 2, 1, 3);
      ctx.fillRect(x + 2, y + 13, 3, 1); ctx.fillRect(x + 2, y + 11, 1, 3);
      ctx.fillRect(x + 11, y + 13, 3, 1); ctx.fillRect(x + 13, y + 11, 1, 3);
    }
    // okręt (powiększony x2)
    ctx.save();
    ctx.translate(gx - PAD * 2 + 3, gy - PAD * 2 + 4); ctx.scale(2, 2);
    ctx.globalAlpha = 0.3; ctx.drawImage(this.spr.sil, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(gx - PAD * 2, gy - PAD * 2); ctx.scale(2, 2);
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 2.5); ctx.drawImage(this.spr.foam, 0, 0);
    ctx.globalAlpha = 1; ctx.drawImage(this.spr.img, 0, 0);
    drawShipDyn(ctx, this.blocks, { t, row: 0.25, rudder: Math.sin(t * 1.3) * 0.6 });
    ctx.globalAlpha = 0.5; drawSails(ctx, this.blocks, { team: this.team, sail: 2, yaw: Math.sin(t * 0.7) * 0.15 });
    ctx.globalAlpha = 1;
    const fb = this.blocks.find(b => b.p === 'mast') || this.blocks.find(b => b.p === 'core');
    if (fb) drawFlag(ctx, PAD + fb.c * TILE + 4, PAD + fb.r * TILE + (fb.p === 'mast' ? 4 : 2), 2.4 + Math.sin(t) * 0.3, this.team, t);
    ctx.restore();
    // animacja wstawienia
    for (const p of this.pops) {
      const k = p.t / 0.35, s = this.cellScreen(p.c, p.r), ins = Math.round(k * 6);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * (1 - k)).toFixed(2) + ')';
      ctx.fillRect(s[0] - 4 + ins, s[1] - 4 + ins, 24 - ins * 2, 24 - ins * 2);
    }
    // synergie: działa przy prochowni
    for (const b of this.blocks) {
      if ((b.p === 'cannon' || b.p === 'mortar') && Design.kegNear(this.cells, b.c, b.r)) {
        const s = this.cellScreen(b.c, b.r);
        ctx.drawImage(Icons.lightning, s[0] + 11, s[1] + 1);
      }
    }
    // zasłonięte części
    if (Math.floor(t * 3) & 1) for (const i of this.blockedSet) {
      const s = this.cellScreen(i % COLS, (i / COLS) | 0);
      ctx.fillStyle = PAL.black; ctx.fillRect(s[0] + 5, s[1] + 2, 6, 12);
      ctx.fillStyle = PAL.red2; ctx.fillRect(s[0] + 6, s[1] + 3, 4, 6); ctx.fillRect(s[0] + 6, s[1] + 10, 4, 3);
    }
    this.drawGhost(ctx, t);
  }
  drawGhost(ctx, t) {
    const h = this.hoverCell();
    if (!h || this.scene.done) return;
    const g = this.ghost, blink = Math.floor(t * 6) & 1;
    if (Input.mouse.down[2] && this.paint === 'remove' && !this.kb) {
      const s = this.cellScreen(h.c, h.r);
      ctx.fillStyle = PAL.red2;
      for (let k = 2; k < 14; k++) { ctx.fillRect(s[0] + k, s[1] + k, 2, 2); ctx.fillRect(s[0] + 15 - k, s[1] + k, 2, 2); }
      return;
    }
    if (g && g.ok) {
      ctx.globalAlpha = 0.65;
      for (const q of g.cells) { const s = this.cellScreen(q[0], q[1]); ctx.save(); ctx.translate(s[0] - 8, s[1] - 8); ctx.scale(2, 2); ctx.drawImage(PartIcons.get(this.sel, this.team), 0, 0); ctx.restore(); }
      ctx.globalAlpha = 1;
      // wpływ prochowni / cieśli
      if (this.sel === 'keg' || this.sel === 'carp') {
        for (const q of g.cells) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const p = Design.get(this.cells, q[0] + dc, q[1] + dr);
          if (!p) continue;
          if (this.sel === 'keg' && p !== 'cannon' && p !== 'mortar') continue;
          const s = this.cellScreen(q[0] + dc, q[1] + dr);
          ctx.fillStyle = this.sel === 'keg' ? 'rgba(254,231,97,0.35)' : 'rgba(99,199,77,0.35)';
          ctx.fillRect(s[0] + 1, s[1] + 1, 14, 14);
        }
      }
      for (const i of g.newlyBlocked) {
        const s = this.cellScreen(i % COLS, (i / COLS) | 0);
        ctx.fillStyle = 'rgba(228,59,68,0.55)'; ctx.fillRect(s[0], s[1], 16, 16);
      }
    }
    for (const q of (g ? g.cells : [[h.c, h.r]])) {
      const s = this.cellScreen(q[0], q[1]);
      const col = !g ? PAL.white : g.ok ? (blink ? PAL.green : '#a5f08f') : g.same ? PAL.silver : (blink ? PAL.red2 : PAL.salmon);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(s[0] - 1, s[1] - 1, 18, 1); ctx.fillRect(s[0] - 1, s[1] + 16, 18, 1); ctx.fillRect(s[0] - 1, s[1] - 1, 1, 18); ctx.fillRect(s[0] + 16, s[1] - 1, 1, 18);
      ctx.fillStyle = col;
      ctx.fillRect(s[0], s[1], 16, 1); ctx.fillRect(s[0], s[1] + 15, 16, 1); ctx.fillRect(s[0], s[1], 1, 16); ctx.fillRect(s[0] + 15, s[1], 1, 16);
    }
    if (g && g.ok && g.cost) {
      const s = this.cellScreen(h.c, h.r);
      Font.draw(ctx, '-' + g.cost, s[0] + 8, s[1] - 10, { align: 'center', color: PAL.gold, outline: PAL.black });
    }
  }
}

// ---------- tło stoczni ----------
const YARD = {};
function buildYardBg(kind, basins) {
  const [c, x] = makeCanvas(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const tones = ['#5a332d', '#633831', '#6c3d35', '#58302b'].map(hexRgb), seam = hexRgb('#2e1d24'), hi = hexRgb('#7c4a3e');
  for (let y = 0; y < H; y++) {
    const row = (y / 7) | 0, ly = y - row * 7, off = Math.floor(hash2(row, 5) * 50);
    for (let xx = 0; xx < W; xx++) {
      const seg = Math.floor((xx + off) / 58), lx = (xx + off) - seg * 58;
      let col = tones[Math.floor(hash2(row, seg) * 4)];
      const n = Noise.v(xx * 0.08 + row * 13, y * 0.6);
      if (n > 0.72) col = hi;
      if (ly === 6 || lx === 0) col = seam;
      if (ly === 0) col = hi;
      if ((lx === 3 || lx === 54) && (ly === 2 || ly === 4)) col = hexRgb(PAL.steel);
      const o = (y * W + xx) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  // zbiorniki dokowe
  for (const b of basins) {
    x.fillStyle = PAL.black; x.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    x.fillStyle = PAL.woodDD; x.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    x.fillStyle = PAL.woodD; x.fillRect(b.x - 3, b.y - 3, b.w + 6, 1); x.fillRect(b.x - 3, b.y - 3, 1, b.h + 6);
    for (let k = b.x + 10; k < b.x + b.w - 4; k += 36) { x.fillStyle = PAL.black; x.fillRect(k, b.y - 4, 4, 4); x.fillStyle = PAL.steel; x.fillRect(k + 1, b.y - 3, 2, 2); }
    // pachołki cumownicze
    for (const p of [[b.x - 2, b.y - 2], [b.x + b.w - 3, b.y - 2], [b.x - 2, b.y + b.h - 3], [b.x + b.w - 3, b.y + b.h - 3]]) {
      x.drawImage(Disc.get(3, PAL.black), p[0] - 2, p[1] - 2); x.drawImage(Disc.get(2, PAL.slate), p[0] - 1, p[1] - 1); x.fillStyle = PAL.grey; x.fillRect(p[0], p[1], 1, 1);
    }
  }
  // pasek górny
  x.fillStyle = 'rgba(24,20,37,0.55)'; x.fillRect(0, 0, W, 26);
  x.fillStyle = PAL.black; x.fillRect(0, 26, W, 1);
  // beczki i liny w wolnych miejscach
  const deco = (bx, by) => { x.drawImage(Disc.get(5, PAL.woodDD), bx - 5, by - 5); x.drawImage(Disc.get(4, PAL.woodD), bx - 4, by - 4); x.drawImage(Disc.get(3, PAL.wood), bx - 3, by - 3); x.drawImage(Ring.get(3, PAL.slate), bx - 3, by - 3); };
  if (kind === 'pvp') { deco(318, 290); deco(322, 302); }
  return c;
}

const BOT_MULT = [0.85, 1.0, 1.1];
function roundBudget(m, i) { return 240 + 70 * (m.round - 1) + (m.players[i].bonus || 0); }
class BuildScene {
  constructor(m) {
    this.m = m; this.mode = m.mode; this.fx = new Particles(); this.t = 0;
    this.time = Settings.buildTime; this.total = this.time; this.done = false; this.doneT = 0; this.leaving = false;
    this.lastTick = 999; this.paused = false;
    this.builders = [];
    if (this.mode === 'pvp') {
      this.basins = [{ x: 30, y: 30, w: 176, h: 236 }, { x: 350, y: 30, w: 176, h: 236 }];
      for (let i = 0; i < 2; i++) {
        const x0 = i * 320;
        const L = { x0, x1: x0 + 320, gx: x0 + 46, gy: 42, palRects: PART_ORDER.map((p, k) => ({ p, x: x0 + 4, y: 32 + k * 23, w: 22, h: 21 })) };
        this.builders.push(new Builder(this, i, { bind: i ? BIND.p2 : BIND.p1, mouse: true, layout: L, budget: roundBudget(m, i), cells: m.players[i].cells }));
      }
      this.bg = YARD.pvp || (YARD.pvp = buildYardBg('pvp', this.basins));
      this.readyBtns = [0, 1].map(i => ({ x: i * 320 + 214, y: 232, w: 98, h: 16, label: 'GOTOWE', primary: true, i }));
    } else {
      this.basins = [{ x: 178, y: 30, w: 284, h: 326 }];
      const L = { x0: 0, x1: W, gx: 248, gy: 84, palRects: PART_ORDER.map((p, k) => ({ p, x: 8, y: 46 + k * 22, w: 160, h: 20 })) };
      this.builders.push(new Builder(this, 0, { bind: BIND.solo, mouse: true, layout: L, budget: roundBudget(m, 0), cells: m.players[0].cells }));
      this.bg = YARD.solo || (YARD.solo = buildYardBg('solo', this.basins));
      const bb = Math.round(roundBudget(m, 1) * BOT_MULT[m.level]);
      const arche = m.players[1].arche && chance(0.6) ? m.players[1].arche : null;
      this.bot = AIBuild.make(bb, m.level, arche);
      m.players[1].arche = this.bot.arche;
      this.botOrder = AIBuild.order(this.bot.cells);
      this.botEnd = this.total * rand(0.5, 0.8);
      this.btnReady = { x: 546, y: 4, w: 88, h: 18, label: 'GOTOWE!', primary: true };
      this.btnMirror = { x: 474, y: 210, w: 52, h: 15, label: 'LUSTRO' };
      this.btnUndo = { x: 530, y: 210, w: 48, h: 15, label: 'COFNIJ' };
      this.btnClear = { x: 582, y: 210, w: 48, h: 15, label: 'ZBURZ' };
      this.btnName = { x: 606, y: 45, w: 24, h: 12, label: '?' };
    }
    this.pauseBtns = [
      { x: W / 2 - 60, y: 160, w: 120, h: 18, label: 'WZNÓW', primary: true, act: 'resume' },
      { x: W / 2 - 60, y: 184, w: 120, h: 18, label: 'WYJDŹ DO MENU', act: 'menu' }
    ];
    this.pauseFocus = 0;
  }
  enter() { Music.play('build'); Ambience.set(0.5); }
  exit() { Music.tempoMul = 1; }
  onChange() { }
  checkReady() {
    if (this.mode === 'pvp') { if (this.builders.every(b => b.ready)) this.finish('GOTOWE!'); }
    else if (this.builders[0].ready) this.finish('WODOWANIE!');
  }
  finish(text) {
    if (this.done) return;
    this.done = true; this.doneT = 0; this.doneText = text;
    SFX.play('bell'); Music.tempoMul = 1;
    this.builders.forEach((b, i) => { this.m.players[i].cells = b.cells.slice(); });
    if (this.mode !== 'pvp') this.m.players[1].cells = this.bot.cells.slice();
  }
  update(dt) {
    if (Input.hit('Escape') || (Input.hit('KeyP') && this.mode !== 'pvp')) { this.paused = !this.paused; SFX.play('click'); }
    if (this.paused) { this.updatePause(); return; }
    this.t += dt;
    this.fx.update(dt, null);
    if (this.done) {
      this.doneT += dt;
      if (this.doneT > 1.5 && !this.leaving) { this.leaving = true; const m = this.m; Game.go(() => new VSScene(m)); }
      return;
    }
    this.time -= dt;
    const sec = Math.ceil(this.time);
    if (sec !== this.lastTick && sec <= 10 && sec > 0) { SFX.play('tick', { hi: sec <= 3 }); Music.tempoMul = 1.22; }
    this.lastTick = sec;
    if (this.time <= 0) { this.time = 0; this.finish('CZAS MINĄŁ!'); return; }
    for (const b of this.builders) b.update(dt);
    if (this.mode === 'pvp') {
      const c = UI.updateButtons(this.readyBtns);
      if (c) this.builders[c.i].toggleReady();
      this.readyBtns.forEach((bt, i) => { bt.label = this.builders[i].ready ? 'GOTOWY!' : 'GOTOWE'; bt.primary = !this.builders[i].ready; bt.active = this.builders[i].ready; });
    } else {
      const b = this.builders[0];
      this.btnMirror.active = b.mirror;
      this.btnMirror.label = b.mirror ? 'LUSTRO' : 'LUSTRO';
      const c = UI.updateButtons([this.btnReady, this.btnMirror, this.btnUndo, this.btnClear, this.btnName]);
      if (c === this.btnReady) b.toggleReady();
      else if (c === this.btnMirror) b.toggleMirror();
      else if (c === this.btnUndo) b.doUndo();
      else if (c === this.btnClear) b.clearAll();
      else if (c === this.btnName) { this.m.players[0].name = SHIP_NAMES.random(this.m.players[0].name); }
    }
  }
  updatePause() {
    const c = UI.updateButtons(this.pauseBtns);
    if (Act.hit(BIND.menu, 'up') || Act.hit(BIND.menu, 'down')) { this.pauseFocus = 1 - this.pauseFocus; SFX.play('hover'); }
    this.pauseBtns.forEach((b, i) => b.focus = i === this.pauseFocus && Input.lastDevice !== 'mouse');
    let act = c ? c.act : null;
    if (!act && Input.hit('Enter')) act = this.pauseBtns[this.pauseFocus].act;
    if (act === 'resume') this.paused = false;
    if (act === 'menu') { Music.tempoMul = 1; Game.go(() => new MenuScene()); }
  }
  // ---------- rysowanie ----------
  draw(ctx) {
    const t = this.t;
    ctx.drawImage(this.bg, 0, 0);
    for (const bs of this.basins) {
      ctx.save(); ctx.beginPath(); ctx.rect(bs.x, bs.y, bs.w, bs.h); ctx.clip();
      Water.draw(ctx, t);
      ctx.fillStyle = 'rgba(8,16,40,0.35)'; ctx.fillRect(bs.x, bs.y, bs.w, 3); ctx.fillRect(bs.x, bs.y, 3, bs.h);
      ctx.restore();
    }
    for (const b of this.builders) b.drawGrid(ctx, t);
    this.fx.draw(ctx, 'under'); this.fx.draw(ctx, 'over');
    if (this.mode === 'pvp') this.drawPvp(ctx); else this.drawSolo(ctx);
    this.drawTimer(ctx);
    if (this.done) this.drawDone(ctx);
    if (this.time <= 10 && !this.done) {
      const a = (0.5 + 0.5 * Math.sin(t * 10)) * 0.5;
      ctx.fillStyle = 'rgba(228,59,68,' + a.toFixed(2) + ')';
      ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); ctx.fillRect(0, 0, 2, H); ctx.fillRect(W - 2, 0, 2, H);
    }
    if (this.paused) this.drawPause(ctx);
  }
  drawTimer(ctx) {
    const s = Math.max(0, Math.ceil(this.time)), txt = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const low = this.time <= 10, col = low ? (Math.floor(this.t * 4) & 1 ? PAL.red2 : PAL.white) : PAL.white;
    const sc = low ? 2 : 2;
    Font.draw(ctx, txt, W / 2, 3, { align: 'center', scale: sc, color: col, outline: PAL.black });
    const f = this.time / this.total, bw = 120;
    UI.bar(ctx, W / 2 - bw / 2, 20, bw, 3, f, f > 0.5 ? PAL.green : f > 0.2 ? PAL.gold : PAL.red2);
    if (low && !this.done && this.time > 0) {
      const k = this.time - Math.floor(this.time);
      ctx.save(); ctx.globalAlpha = 0.22 + 0.25 * k;
      const cx = this.mode === 'pvp' ? W / 2 : 320, cy = this.mode === 'pvp' ? 150 : 200;
      Font.draw(ctx, String(s), cx, cy - 21, { align: 'center', scale: 6, color: PAL.red2, outline: PAL.black });
      ctx.restore();
    }
  }
  drawDone(ctx) {
    const k = Math.min(1, this.doneT / 0.25);
    ctx.fillStyle = 'rgba(24,20,37,' + (0.45 * k).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W / 2, H / 2 - 16); const s = ease.outBack(k); ctx.scale(s, s);
    Font.draw(ctx, this.doneText, 0, -14, { align: 'center', scale: 4, color: PAL.gold, outline: PAL.black });
    Font.draw(ctx, 'Okręty schodzą na wodę...', 0, 22, { align: 'center', color: PAL.white, outline: PAL.black });
    ctx.restore();
  }
  drawPause(ctx) {
    ctx.fillStyle = 'rgba(24,20,37,0.78)'; ctx.fillRect(0, 0, W, H);
    UI.panel(ctx, W / 2 - 90, 110, 180, 110, 'wood');
    Font.draw(ctx, 'PAUZA', W / 2, 124, { align: 'center', scale: 2, color: PAL.gold, shadow: PAL.black });
    for (const b of this.pauseBtns) UI.button(ctx, b);
  }
  drawPartCard(ctx, b, pr, compact) {
    const p = pr.p, P = PARTS[p], sel = b.sel === p, hov = b.hoverPart === p, afford = P.cost <= b.gold;
    const x = pr.x, y = pr.y, w = pr.w, h = pr.h;
    ctx.fillStyle = PAL.black; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = sel ? '#4a3a2e' : hov ? '#3a3046' : '#262238'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    if (sel) {
      const g = Math.floor(this.t * 6) & 1 ? PAL.yellow : PAL.gold;
      ctx.fillStyle = g; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
    }
    const bob = sel ? Math.round(Math.sin(this.t * 6)) : 0, ix = x + (compact ? 3 : 2), iy = y + 2;
    ctx.fillStyle = sel ? '#1d74b4' : '#124e89'; ctx.fillRect(ix, iy, 16, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(ix, iy, 16, 1);
    ctx.drawImage(PartIcons.get(p, b.team), ix, iy + bob);
    if (!afford) { ctx.fillStyle = 'rgba(24,20,37,0.55)'; ctx.fillRect(x + 1, y + 1, compact ? w - 2 : 20, h - 2); }
    if (compact) return;
    Font.draw(ctx, P.name, x + 21, y + 3, { color: afford ? PAL.white : PAL.grey, shadow: PAL.black });
    Font.draw(ctx, PART_TAG[p], x + 21, y + 12, { color: afford ? PAL.grey : PAL.steel });
    ctx.drawImage(Icons.coin, x + w - 30, y + 4);
    Font.draw(ctx, String(P.cost), x + w - 4, y + 3, { color: afford ? PAL.gold : PAL.red2, align: 'right', shadow: PAL.black });
    const k = (PART_ORDER.indexOf(p) + 1) % 10;
    Font.draw(ctx, String(k), x + w - 4, y + 12, { color: PAL.steel, align: 'right' });
  }
  drawPartInfo(ctx, b, x, y, w, h) {
    const p = b.hoverPart || b.sel, P = PARTS[p];
    UI.panel(ctx, x, y, w, h, 'paper');
    Font.draw(ctx, P.name.toUpperCase(), x + 6, y + 5, { color: PAL.woodDD });
    if (P.rule) Font.draw(ctx, RULE_TAG[P.rule], x + w - 6, y + 5, { color: PAL.red, align: 'right' });
    Font.drawWrapped(ctx, P.desc, x + 6, y + 16, w - 12, { color: PAL.woodD, lh: 9 });
    const line = 'Masa ' + P.mass + ' · Wypór ' + P.buoy + ' · Wytrz. ' + P.hp;
    Font.draw(ctx, line, x + 6, y + h - 11, { color: PAL.rust });
  }
  statRows(b) {
    const s = b.stats, g = b.ghost && b.ghost.ok ? b.ghost.stats : null;
    return [
      ['PRĘDKOŚĆ', Math.round(s.speed / 4) + ' ' + plural(s.speed / 4, 'węzeł', 'węzły', 'węzłów'), s.speed / 80, g && g.speed / 80, PAL.cyan],
      ['ZWROTNOŚĆ', Math.round(s.turn * 57) + '°/s', s.turn / 2.2, g && g.turn / 2.2, PAL.green],
      ['SIŁA OGNIA', s.nC + ' ' + plural(s.nC, 'działo', 'działa', 'dział') + (s.nM ? ' + ' + s.nM + ' moźdz.' : ''), s.fire / 70, g && g.fire / 70, PAL.orange],
      ['WYTRZYMAŁOŚĆ', String(Math.round(s.hp)), s.hp / 1600, g && g.hp / 1600, PAL.red2],
      ['ŁADOWNOŚĆ', Math.round(s.load * 100) + '%', s.load, g && g.load, s.load > 1 ? PAL.red2 : s.load > 0.85 ? PAL.gold : PAL.silver]
    ];
  }
  warnings(b) {
    const s = b.stats, out = [];
    if (s.load > 1) out.push(['PRZECIĄŻENIE! Dodaj poszycie', PAL.red2]);
    if (s.ph.sail + s.ph.oar === 0 && s.n > 1) out.push(['Brak napędu: maszt lub wiosła', PAL.gold]);
    if (!s.nC && !s.nM && !b.cells.includes('ram') && s.n > 1) out.push(['Brak broni!', PAL.gold]);
    if (b.blockedSet.size) out.push(['Zasłonięte części: ' + b.blockedSet.size, PAL.red2]);
    if (!b.cells.includes('rudder') && s.n > 8) out.push(['Ster poprawi skręcanie', PAL.grey]);
    return out.slice(0, 2);
  }
  drawSolo(ctx) {
    const b = this.builders[0], m = this.m;
    // górny pasek
    Font.draw(ctx, 'STOCZNIA', 8, 6, { scale: 2, color: PAL.gold, outline: PAL.woodDD });
    Font.draw(ctx, 'RUNDA ' + m.round + '  ·  BUDŻET ' + b.budget + (m.players[0].bonus ? ' (+' + m.players[0].bonus + ' pociechy)' : ''), 112, 10, { color: PAL.sand, shadow: PAL.black });
    this.btnReady.label = b.confirmT > 0 ? 'NA PEWNO?' : 'GOTOWE!';
    UI.button(ctx, this.btnReady);
    // lewy panel: części
    UI.panel(ctx, 4, 30, 168, 326, 'wood');
    Font.draw(ctx, 'CZĘŚCI', 10, 36, { color: PAL.gold, shadow: PAL.black });
    Font.draw(ctx, '1-0 / kółko', 166, 36, { color: PAL.steel, align: 'right' });
    for (const pr of b.L.palRects) this.drawPartCard(ctx, b, pr, false);
    this.drawPartInfo(ctx, b, 8, 270, 160, 82);
    // prawy panel: statystyki
    UI.panel(ctx, 468, 30, 168, 326, 'wood');
    Font.draw(ctx, 'TWÓJ OKRĘT', 474, 36, { color: PAL.gold, shadow: PAL.black });
    Font.draw(ctx, m.players[0].name, 474, 47, { color: PAL.white, shadow: PAL.black });
    UI.button(ctx, this.btnName);
    ctx.drawImage(Icons.coinBig, 474, 61);
    Font.draw(ctx, String(b.gold), 486, 60, { scale: 2, color: b.gold > 0 ? PAL.yellow : PAL.grey, outline: PAL.woodDD });
    Font.draw(ctx, '/ ' + b.budget + ' złota', 486 + Font.measure(String(b.gold)) * 2 + 5, 65, { color: PAL.grey });
    let y = 80;
    for (const r of this.statRows(b)) {
      Font.draw(ctx, r[0], 474, y, { color: PAL.silver, shadow: PAL.black });
      Font.draw(ctx, r[1], 630, y, { color: PAL.white, align: 'right', shadow: PAL.black });
      UI.bar(ctx, 474, y + 10, 156, 3, r[2], r[4], { ghost: r[3] === null || r[3] === undefined ? undefined : r[3] });
      y += 21;
    }
    const wr = this.warnings(b);
    wr.forEach((w, i) => Font.draw(ctx, w[0], 474, 186 + i * 10, { color: w[1], shadow: PAL.black }));
    UI.button(ctx, this.btnMirror); UI.button(ctx, this.btnUndo); UI.button(ctx, this.btnClear);
    // rywal
    const bot = m.players[1];
    UI.panel(ctx, 472, 232, 160, 120, 'dark');
    Font.draw(ctx, 'RYWAL', 478, 238, { color: TEAM[1].l });
    Font.draw(ctx, bot.captain, 626, 238, { color: PAL.white, align: 'right' });
    const el = this.total - this.time, shown = Math.max(1, Math.floor(this.botOrder.length * clamp(el / this.botEnd, 0, 1)));
    const ox = 478, oy = 252;
    ctx.fillStyle = 'rgba(18,78,137,0.45)'; ctx.fillRect(ox, oy, COLS * 6 + 4, ROWS * 6 + 4);
    for (let k = 0; k < shown; k++) {
      const i = this.botOrder[k], c = i % COLS, r = (i / COLS) | 0;
      const fresh = k > shown - 3 && el < this.botEnd;
      ctx.fillStyle = fresh ? PAL.white : (k === 0 ? TEAM[1].c : PAL.slate);
      ctx.fillRect(ox + 2 + c * 6, oy + 2 + r * 6, 5, 5);
    }
    const bready = el >= this.botEnd;
    Font.draw(ctx, bready ? 'GOTOWY!' : 'Buduje' + '...'.slice(0, 1 + Math.floor(this.t * 3) % 3), 538, 262, { color: bready ? PAL.green : PAL.grey });
    Font.draw(ctx, shown + ' ' + plural(shown, 'część', 'części', 'części'), 538, 274, { color: PAL.silver });
    Font.draw(ctx, 'Plan: ???', 538, 286, { color: PAL.steel });
    Font.drawWrapped(ctx, 'Okręt rywala poznasz dopiero na wodzie.', 538, 302, 90, { color: PAL.steel, lh: 9 });
    // komunikat
    if (b.msgT > 0 && b.msg) {
      const a = clamp(b.msgT, 0, 1), w = Font.measure(b.msg) + 12;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(24,20,37,0.85)'; ctx.fillRect(320 - w / 2, 34, w, 13);
      Font.draw(ctx, b.msg, 320, 37, { align: 'center', color: b.msgBad ? PAL.salmon : PAL.yellow });
      ctx.globalAlpha = 1;
    }
    // podpowiedzi
    ctx.fillStyle = 'rgba(24,20,37,0.7)'; ctx.fillRect(178, 343, 284, 13);
    Font.draw(ctx, b.kb ? 'WSAD kursor · SPACJA stawiaj · X usuń · Q/E część' : 'LPM stawiaj (przeciągaj) · PPM usuń · Z cofnij', 320, 346, { align: 'center', color: PAL.silver });
  }
  drawPvp(ctx) {
    const m = this.m;
    for (let i = 0; i < 2; i++) {
      const b = this.builders[i], x0 = i * 320, T = TEAM[i];
      // nagłówek
      Font.draw(ctx, 'GRACZ ' + (i + 1), i ? W - 8 : 8, 4, { color: T.l, shadow: PAL.black, align: i ? 'right' : 'left' });
      Font.draw(ctx, m.players[i].name, i ? W - 8 : 8, 14, { color: PAL.white, shadow: PAL.black, align: i ? 'right' : 'left' });
      // paleta
      for (const pr of b.L.palRects) this.drawPartCard(ctx, b, pr, true);
      // statystyki
      UI.panel(ctx, x0 + 210, 30, 106, 220, i ? 'team1' : 'team0');
      ctx.drawImage(Icons.coinBig, x0 + 216, 37);
      Font.draw(ctx, String(b.gold), x0 + 228, 36, { scale: 2, color: b.gold > 0 ? PAL.yellow : PAL.grey, outline: PAL.woodDD });
      Font.draw(ctx, '/' + b.budget, x0 + 310, 41, { color: PAL.grey, align: 'right' });
      let y = 56;
      for (const r of this.statRows(b)) {
        Font.draw(ctx, r[0], x0 + 216, y, { color: PAL.silver });
        UI.bar(ctx, x0 + 216, y + 10, 94, 3, r[2], r[4], { ghost: r[3] === null || r[3] === undefined ? undefined : r[3] });
        y += 19;
      }
      Font.draw(ctx, b.mirror ? 'LUSTRO: WŁ' : 'LUSTRO: WYŁ', x0 + 216, 154, { color: b.mirror ? PAL.green : PAL.grey });
      const wr = this.warnings(b);
      wr.forEach((w, k) => Font.drawWrapped(ctx, w[0], x0 + 216, 166 + k * 20, 94, { color: w[1], lh: 9 }));
      UI.button(ctx, this.readyBtns[i]);
      // opis i sterowanie
      UI.panel(ctx, x0 + 4, 272, 312, 84, 'dark');
      const p = b.hoverPart || b.sel, P = PARTS[p];
      Font.draw(ctx, P.name.toUpperCase(), x0 + 10, 278, { color: PAL.gold });
      Font.draw(ctx, P.cost + ' zł', x0 + 310, 278, { color: P.cost <= b.gold ? PAL.yellow : PAL.red2, align: 'right' });
      Font.drawWrapped(ctx, P.desc, x0 + 10, 290, 300, { color: PAL.silver, lh: 9 });
      const keys = i ? '←↑→↓ kursor · , . część · / stawiaj · M usuń · N lustro · ENTER gotowe'
        : 'WSAD kursor · Q E część · SPACJA stawiaj · X usuń · R lustro · G gotowe';
      Font.drawWrapped(ctx, keys, x0 + 10, 330, 300, { color: T.l, lh: 9 });
      if (b.msgT > 0 && b.msg) {
        ctx.globalAlpha = clamp(b.msgT, 0, 1);
        const w = Math.min(170, Font.measure(b.msg) + 10);
        ctx.fillStyle = 'rgba(24,20,37,0.85)'; ctx.fillRect(x0 + 118 - w / 2, 252, w, 13);
        Font.draw(ctx, b.msg.length > 30 ? b.msg.slice(0, 29) + '…' : b.msg, x0 + 118, 255, { align: 'center', color: b.msgBad ? PAL.salmon : PAL.yellow });
        ctx.globalAlpha = 1;
      }
      // kursor klawiatury
      const c = b.cur, s = b.cellScreen(c.c, c.r);
      if (b.kb) {
        const o = Math.round(Math.sin(this.t * 8));
        ctx.fillStyle = T.l;
        for (const q of [[-2 - o, -2 - o], [13 + o, -2 - o], [-2 - o, 13 + o], [13 + o, 13 + o]]) { ctx.fillRect(s[0] + q[0], s[1] + q[1], 5, 1); ctx.fillRect(s[0] + q[0] + (q[0] > 5 ? 4 : 0), s[1] + q[1], 1, 5); }
      }
      if (b.ready) {
        ctx.fillStyle = 'rgba(24,20,37,0.45)'; ctx.fillRect(this.basins[i].x, this.basins[i].y, this.basins[i].w, this.basins[i].h);
        ctx.save(); ctx.translate(x0 + 118, 140); ctx.rotate(-0.2);
        Font.draw(ctx, 'GOTOWY!', 0, -7, { align: 'center', scale: 2, color: PAL.green, outline: PAL.black });
        ctx.restore();
      }
    }
    ctx.fillStyle = PAL.black; ctx.fillRect(319, 27, 2, H - 27);
  }
}
