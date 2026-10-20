'use strict';
/* =========================================================
   Stocznia w porcie: sklep z częściami różnej jakości,
   ładownia z łupami, naprawa wraku i sprzedaż.

   Budujesz na obrysie kadłucha: najpierw stawiasz kadłub (poszycie),
   a dopiero na nim działa, maszty i sprzęt - element nie jest
   podłogą, więc bez kadłuba pod spodem nie da się go postawić.
   Zmiany idą na serwer jako operacje; klient od razu pokazuje
   wynik, a odpowiedź serwera go potwierdza.
   ========================================================= */
const YTABS = CATS.map(c => ({ id: c.id, name: c.name })).concat([{ id: 'hold', name: 'ŁADOWNIA' }]);
const YC = 12, YZ = YC / TILE;   // kafel w stoczni: 12 pikseli ekranu (przybliżenie 1,5x)
const YROWS = 9, YROW_H = 19;    // ile pozycji na liście i jak wysoka jest jedna
let YARD_BG = null;
function buildYardBg() {
  const [c, x] = makeCanvas(W, H);
  const img = x.createImageData(W, H), d = img.data;
  const tones = ['#5a332d', '#633831', '#6c3d35', '#58302b'].map(hexRgb), seam = hexRgb('#2e1d24'), hi = hexRgb('#7c4a3e');
  for (let y = 0; y < H; y++) {
    const row = (y / 7) | 0, ly = y - row * 7, off = Math.floor(hash2(row, 5) * 50);
    for (let xx = 0; xx < W; xx++) {
      const seg = Math.floor((xx + off) / 58), lx = (xx + off) - seg * 58;
      let col = tones[Math.floor(hash2(row, seg) * 4)];
      if (Noise.v(xx * 0.08 + row * 13, y * 0.6) > 0.72) col = hi;
      if (ly === 6 || lx === 0) col = seam;
      if (ly === 0) col = hi;
      const o = (y * W + xx) * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const b = YardUI.BASIN;
  x.fillStyle = PAL.black; x.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
  x.fillStyle = PAL.woodDD; x.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  for (const p of [[b.x - 2, b.y - 2], [b.x + b.w - 3, b.y - 2], [b.x - 2, b.y + b.h - 3], [b.x + b.w - 3, b.y + b.h - 3]]) {
    x.drawImage(Disc.get(3, PAL.black), p[0] - 2, p[1] - 2); x.drawImage(Disc.get(2, PAL.slate), p[0] - 1, p[1] - 1);
  }
  x.fillStyle = 'rgba(24,20,37,0.55)'; x.fillRect(0, 0, W, 26);
  x.fillStyle = PAL.black; x.fillRect(0, 26, W, 1);
  YARD_BG = c;
}

class YardUI {
  constructor(cw) {
    this.cw = cw; this.t = 0; this.fx = new Particles();
    this.st = null; this.pending = 0; this.tab = 1; this.q = 0; this.sel = { src: 'shop', p: 'cannon', q: 0 };
    this.mirror = true; this.hover = null; this.hoverItem = null; this.outside = false;
    this.paint = null; this.lastCell = null; this.msg = null; this.msgT = 0; this.msgBad = false; this.ghost = null; this.ghostKey = null;
    this.holdScroll = 0; this.pops = [];
    this.btnClose = { x: 548, y: 4, w: 88, h: 18, label: 'WYPŁYŃ!', primary: true };
    this.btnMirror = { x: 474, y: 226, w: 50, h: 15, label: 'LUSTRO' };
    this.btnRepair = { x: 528, y: 226, w: 104, h: 15, label: 'NAPRAW' };
    this.btnSell = { x: 474, y: 246, w: 158, h: 15, label: 'SPRZEDAJ' };
    this.tabBtns = YTABS.map((tb, i) => ({ x: 8 + (i % 3) * 54, y: i < 3 ? 32 : 47, w: 52, h: 13, label: tb.name, i }));
    this.qBtns = [0, 1, 2].map(q => ({ x: 52 + q * 40, y: 241, w: 38, h: 12, label: QUAL[q].name.slice(0, 5).toUpperCase(), q }));
    if (!YARD_BG) buildYardBg();
  }
  get L() { return YardUI.BASIN; }
  get isHold() { return YTABS[this.tab].id === 'hold'; }
  setState(m) {
    if (m.err) this.say(m.err, true);
    this.pending = Math.max(0, this.pending - (m.quiet ? 0 : 1));
    if (this.pending > 0 && !m.err) return;
    this.st = { gold: m.g, hold: m.h, cap: m.cap || MAX_HOLD, cells: Design.decode(m.d), dead: new Set(m.x), rc: m.rc, port: m.port };
    this.refresh();
  }
  refresh() {
    const st = this.st; if (!st) return;
    st.blocks = Design.list(st.cells).map(b => Object.assign(b, { alive: true }));
    st.spr = renderShip(st.blocks, SHIP_COLORS[this.cw.me.col] || SHIP_COLORS[0]);
    st.stats = Design.stats(st.cells);
    st.blocked = new Set(Design.blocked(st.cells));
    if (this.sel.src === 'hold' && !this.holdCount(this.sel.p, this.sel.q)) this.sel = { src: 'shop', p: this.sel.p, q: Math.min(this.sel.q, SHOP_MAXQ) };
    if (this.sel.src === 'shop' && PARTS[this.sel.p].noShop) this.sel = { src: 'shop', p: 'hull', q: 0 };
    this.ghostKey = null;
  }
  holdCount(p, q) { const e = this.st && this.st.hold.find(h => h[0] === p && h[1] === q); return e ? e[2] : 0; }
  price(it) { return it.src === 'shop' ? itemValue(it.p, it.q) : 0; }
  say(text, bad) { this.msg = text; this.msgT = 2.6; this.msgBad = !!bad; if (bad) SFX.play('error'); }
  cellScreen(c, r) { return [this.L.gx + c * YC, this.L.gy + r * YC]; }
  // kafel pod kursorem (tylko wewnątrz obrysu kadłuba); inCell - czy kursor jest w ogóle nad siatką
  cellAt(mx, my) {
    const c = Math.floor((mx - this.L.gx) / YC), r = Math.floor((my - this.L.gy) / YC);
    return Design.inb(c, r) ? { c, r } : null;
  }
  select(it) {
    if (this.sel.src === it.src && this.sel.p === it.p && this.sel.q === it.q) return;
    this.sel = it; this.ghostKey = null; SFX.play('click');
  }
  // ---------- operacje ----------
  send(ops) { if (!ops.length) return; this.pending++; Net.send({ t: 'build', ops }); }
  placeAt(c, r, drag) {
    const st = this.st, it = this.sel, ops = [];
    const tryOne = cc => {
      if (it.src === 'hold' && this.holdCount(it.p, it.q) < 1) return false;
      const i = r * COLS + cc, dead = st.dead.has(i);
      const res = Design.canPlace(st.cells, cc, r, it, st.gold, this.price(it), drag, dead);
      if (!res.ok) { if (!drag && res.reason && !ops.length) this.say(res.reason, true); return false; }
      if (!dead) for (const d of res.displaced) this.holdAdd(d.p, d.q, 1);
      st.dead.delete(i);
      st.cells[i] = res.cell; st.gold -= res.price;
      if (it.src === 'hold') this.holdAdd(it.p, it.q, -1);
      ops.push(['place', cc, r, it.p, it.q, it.src]);
      const s = this.cellScreen(cc, r);
      this.pops.push({ c: cc, r, t: 0 }); FX.dust(this.fx, s[0] + YC / 2, s[1] + YC / 2);
      if (res.price) FX.text(this.fx, s[0] + YC / 2, s[1] - 2, '-' + res.price, PAL.gold);
      return true;
    };
    if (!tryOne(c)) return;
    if (this.mirror && COLS - 1 - c !== c) tryOne(COLS - 1 - c);
    SFX.play('place', { pitch: (PARTS[it.p].pitch || 1) * rand(0.94, 1.06) });
    if (this.price(it)) SFX.play('coin');
    this.send(ops); this.refresh();
  }
  // PPM zdejmuje wierzchni przedmiot: element (kadłub zostaje), a gdy go nie ma - sam kadłub
  removeAt(c, r, drag) {
    const st = this.st, cl = Design.get(st.cells, c, r);
    if (!cl) return;
    if (cl.p === 'core') { if (!drag) this.say('Kajuta kapitana musi zostać na pokładzie!', true); return; }
    const ops = [];
    const one = cc => {
      const i = r * COLS + cc, x = Design.get(st.cells, cc, r); if (!x || x.p === 'core') return;
      const res = Design.removeTop(st.cells, cc, r, st.dead.has(i)); if (!res) return;
      for (const q of res.removed) if (!st.dead.has(q.i)) this.holdAdd(q.p, q.q, 1);
      const gone = new Set();
      for (const q of res.removed) if (!st.cells[q.i]) { st.dead.delete(q.i); gone.add(q.i); }
      for (const k of gone) {
        const s = this.cellScreen(k % COLS, (k / COLS) | 0);
        for (let n = 0; n < 6; n++) this.fx.add({ type: 'px', x: s[0] + YC / 2, y: s[1] + YC / 2, z: 2, vx: rand(-50, 50), vy: rand(-50, 50), vz: rand(30, 70), g: 160, drag: 1, life: 0.8, cols: [pick([PAL.woodL, PAL.wood, PAL.sand])], size: 2, onLand: 'die' });
      }
      if (gone.size > 1) this.say('Odpadło ' + (gone.size - 1) + ' niepołączonych kafli - trafiły do ładowni', false);
      ops.push(['rm', cc, r]);
    };
    one(c);
    if (this.mirror) { const mc = COLS - 1 - c; if (mc !== c && Design.kind(st.cells, mc, r) === cl.p) one(mc); }
    SFX.play('remove');
    this.send(ops); this.refresh();
  }
  holdAdd(p, q, n) {
    const h = this.st.hold, e = h.find(x => x[0] === p && x[1] === q);
    if (e) { e[2] += n; if (e[2] <= 0) h.splice(h.indexOf(e), 1); } else if (n > 0) h.push([p, q, n]);
  }
  // ---------- aktualizacja ----------
  update(dt) {
    this.t += dt; this.msgT -= dt; this.fx.update(dt, null);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < 0.35);
    if (!this.st) return;
    const m = Input.mouse, st = this.st;
    if (Input.hit('Tab')) { this.tab = (this.tab + 1) % YTABS.length; this.holdScroll = 0; SFX.play('click'); }
    if (Input.hit('KeyR')) this.toggleMirror();
    for (let k = 0; k < YROWS; k++) if (Input.hit('Digit' + (k + 1))) { const it = this.items()[k]; if (it) this.select(it); }
    // przyciski
    this.btnMirror.active = this.mirror;
    this.btnRepair.label = st.rc ? 'NAPRAW ' + st.rc : 'CAŁY';
    this.btnRepair.disabled = !st.rc;
    const hs = this.sel.src === 'hold';
    this.btnSell.hidden = !hs;
    if (hs) this.btnSell.label = 'SPRZEDAJ  +' + sellValue(this.sel.p, this.sel.q);
    this.qBtns.forEach(b => { b.active = this.sel.src === 'shop' && this.sel.q === b.q; b.hidden = this.isHold || (this.sel.src === 'shop' && !hasQ(this.sel.p)); });
    this.tabBtns.forEach(b => { b.active = b.i === this.tab; });
    const c = UI.updateButtons([this.btnClose, this.btnMirror, this.btnRepair, this.btnSell].concat(this.tabBtns, this.qBtns).filter(b => !b.hidden));
    if (c === this.btnClose) return 'close';
    if (c === this.btnMirror) this.toggleMirror();
    if (c === this.btnRepair) { this.pending++; Net.send({ t: 'repair' }); SFX.play('repair'); }
    if (c === this.btnSell) { this.pending++; Net.send({ t: 'sell', p: this.sel.p, q: this.sel.q, n: 1 }); this.holdAdd(this.sel.p, this.sel.q, -1); st.gold += sellValue(this.sel.p, this.sel.q); SFX.play('coin'); this.refresh(); }
    if (c && c.i !== undefined) { this.tab = c.i; this.holdScroll = 0; }
    if (c && c.q !== undefined) { this.q = c.q; this.select({ src: 'shop', p: this.sel.p, q: c.q }); }
    // lista części
    this.hoverItem = null;
    const rects = this.itemRects();
    for (const r of rects) if (Input.inRect(r.x, r.y, r.w, r.h)) { this.hoverItem = r.it; if (m.pressed[0]) this.select(r.it); }
    if (this.isHold && m.wheel && Input.inRect(4, 60, 168, 180)) this.holdScroll = clamp(this.holdScroll + m.wheel, 0, Math.max(0, st.hold.length - YROWS));
    // siatka
    const cell = this.cellAt(m.x, m.y);
    this.hover = m.active ? cell : null;
    const gx = (m.x - this.L.gx) / YC, gy = (m.y - this.L.gy) / YC;
    this.outside = !!(m.active && !cell && gx >= 0 && gy >= 0 && gx < COLS && gy < ROWS);
    if (cell) {
      const key = cell.c + ',' + cell.r;
      if (m.pressed[0]) { this.paint = 'place'; this.placeAt(cell.c, cell.r, false); this.lastCell = key; }
      else if (m.pressed[2]) { this.paint = 'remove'; this.removeAt(cell.c, cell.r, false); this.lastCell = key; }
      else if (this.paint && key !== this.lastCell && (m.down[0] || m.down[2])) {
        this.lastCell = key;
        if (this.paint === 'place') this.placeAt(cell.c, cell.r, true); else this.removeAt(cell.c, cell.r, true);
      }
    } else if (this.outside && m.pressed[0]) this.say('Poza obrysem kadłuba - okręt musi mieć kształt statku', true);
    if (!m.down[0] && !m.down[2]) this.paint = null;
    this.updateGhost();
    return null;
  }
  toggleMirror() { this.mirror = !this.mirror; this.say(this.mirror ? 'Lustro WŁĄCZONE - części stawiasz parami' : 'Lustro WYŁĄCZONE', false); SFX.play('click'); this.ghostKey = null; }
  items() {
    if (this.isHold) return this.st.hold.slice(this.holdScroll, this.holdScroll + YROWS).map(h => ({ src: 'hold', p: h[0], q: h[1], n: h[2] }));
    const cat = CATS[this.tab];
    return cat.parts.filter(p => !PARTS[p].noShop).map(p => ({ src: 'shop', p, q: hasQ(p) ? (this.sel.src === 'shop' && hasQ(this.sel.p) ? this.sel.q : this.q) : 0 }));
  }
  itemRects() { return this.items().map((it, k) => ({ it, x: 8, y: 64 + k * YROW_H, w: 160, h: YROW_H - 1 })); }
  updateGhost() {
    const h = this.hover, st = this.st;
    const key = h ? h.c + ',' + h.r + ',' + this.sel.src + this.sel.p + this.sel.q + ',' + this.mirror + ',' + st.gold : null;
    if (key === this.ghostKey) return;
    this.ghostKey = key; this.ghost = null;
    if (!h) return;
    const it = this.sel, has = it.src === 'shop' || this.holdCount(it.p, it.q) > 0, i = h.r * COLS + h.c;
    const res = has ? Design.canPlace(st.cells, h.c, h.r, it, st.gold, this.price(it), false, st.dead.has(i)) : { ok: false, reason: 'Nie masz tego w ładowni' };
    if (res.ok) {
      const a = Design.clone(st.cells), cells = [[h.c, h.r]];
      a[i] = res.cell;
      let g = st.gold - res.price;
      const n = this.holdCount(it.p, it.q) - (it.src === 'hold' ? 1 : 0), mc = COLS - 1 - h.c, mi = h.r * COLS + mc;
      if (this.mirror && mc !== h.c && (it.src === 'shop' || n > 0)) {
        const r2 = Design.canPlace(a, mc, h.r, it, g, this.price(it), false, st.dead.has(mi));
        if (r2.ok) { a[mi] = r2.cell; g -= r2.price; cells.push([mc, h.r]); }
      }
      this.ghost = { ok: true, cells, arr: a, stats: Design.stats(a), cost: st.gold - g };
    } else this.ghost = { ok: false, same: res.same, cells: [[h.c, h.r]], reason: res.reason };
  }
  // ---------- rysowanie ----------
  draw(ctx) {
    const st = this.st, t = this.t, L = this.L;
    ctx.drawImage(YARD_BG, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.rect(L.x, L.y, L.w, L.h); ctx.clip();
    Water.draw(ctx, t * 6, t * 2, t);
    ctx.fillStyle = 'rgba(8,16,40,0.35)'; ctx.fillRect(L.x, L.y, L.w, 3); ctx.fillRect(L.x, L.y, 3, L.h);
    ctx.restore();
    Font.draw(ctx, 'STOCZNIA', 8, 6, { scale: 2, color: PAL.gold, outline: PAL.woodDD });
    if (!st) { Font.draw(ctx, 'Ładowanie...', W / 2, H / 2, { align: 'center', color: PAL.white }); return; }
    Font.draw(ctx, st.port, 112, 10, { color: PAL.sand, shadow: PAL.black });
    Font.draw(ctx, 'LPM stawiaj · PPM zdejmij · R lustro · TAB karta', 288, 10, { color: PAL.silver, shadow: PAL.black });
    UI.button(ctx, this.btnClose);
    this.drawGrid(ctx, t);
    this.fx.draw(ctx, 'under'); this.fx.draw(ctx, 'over');
    this.drawLeft(ctx);
    this.drawRight(ctx);
    if (this.msgT > 0 && this.msg) {
      const a = clamp(this.msgT, 0, 1), w = Font.measure(this.msg) + 12;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(24,20,37,0.85)'; ctx.fillRect(320 - w / 2, 32, w, 13);
      Font.draw(ctx, this.msg, 320, 35, { align: 'center', color: this.msgBad ? PAL.salmon : PAL.yellow });
      ctx.globalAlpha = 1;
    }
  }
  // podpis kafla pod kursorem: "Armata (solidna) na poszyciu dębowym"
  cellLabel(c, r) {
    const cl = Design.get(this.st.cells, c, r);
    if (!cl) return this.ghost && !this.ghost.ok && this.ghost.reason ? this.ghost.reason : 'Wolne miejsce w obrysie kadłuba';
    if (cl.p === 'core') return PARTS.core.name;
    return mounted(cl) ? itemName(cl.p, cl.q) + ' na kadłubie: ' + PARTS[cl.h].name.toLowerCase() : PARTS[cl.p].name + ' (goły kadłub)';
  }
  drawGrid(ctx, t) {
    const st = this.st, gx = this.L.gx, gy = this.L.gy;
    // obrys kadłuba: tu wolno budować
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (!HULL_OK[r * COLS + c]) continue;
      const X = gx + c * YC, Y = gy + r * YC;
      ctx.fillStyle = 'rgba(220,240,255,0.075)'; ctx.fillRect(X, Y, YC, YC);
      ctx.fillStyle = 'rgba(220,240,255,0.2)'; ctx.fillRect(X, Y, 1, 1);
      ctx.fillStyle = 'rgba(254,231,97,0.38)';
      if (!Design.inb(c, r - 1)) ctx.fillRect(X, Y, YC, 1);
      if (!Design.inb(c, r + 1)) ctx.fillRect(X, Y + YC - 1, YC, 1);
      if (!Design.inb(c - 1, r)) ctx.fillRect(X, Y, 1, YC);
      if (!Design.inb(c + 1, r)) ctx.fillRect(X + YC - 1, Y, 1, YC);
    }
    if (this.mirror) { ctx.fillStyle = 'rgba(254,174,52,0.3)'; for (let y = gy - 4; y < gy + ROWS * YC + 4; y += 4) ctx.fillRect(gx + CORE_C * YC + YC / 2 - 1, y, 2, 2); }
    const col = SHIP_COLORS[this.cw.me.col] || SHIP_COLORS[0];
    ctx.save(); ctx.translate(gx - PAD * YZ + 3, gy - PAD * YZ + 4); ctx.scale(YZ, YZ); ctx.globalAlpha = 0.3; ctx.drawImage(st.spr.sil, 0, 0); ctx.restore();
    ctx.save();
    ctx.translate(gx - PAD * YZ, gy - PAD * YZ); ctx.scale(YZ, YZ);
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 2.5); ctx.drawImage(st.spr.foam, 0, 0);
    ctx.globalAlpha = 1; ctx.drawImage(st.spr.img, 0, 0);
    drawShipDyn(ctx, st.blocks, { t, row: 0.25, rudder: Math.sin(t * 1.3) * 0.6 });
    ctx.globalAlpha = 0.55; drawSails(ctx, st.blocks, { col, sail: 2, yaw: Math.sin(t * 0.7) * 0.15 });
    ctx.globalAlpha = 1;
    ctx.restore();
    for (const p of this.pops) {
      const k = p.t / 0.35, s = this.cellScreen(p.c, p.r), ins = Math.round(k * 5);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * (1 - k)).toFixed(2) + ')';
      ctx.fillRect(s[0] - 3 + ins, s[1] - 3 + ins, YC + 6 - ins * 2, YC + 6 - ins * 2);
    }
    // zniszczone kafle (do naprawy)
    for (const i of st.dead) {
      const s = this.cellScreen(i % COLS, (i / COLS) | 0);
      ctx.fillStyle = 'rgba(24,20,37,0.6)'; ctx.fillRect(s[0], s[1], YC, YC);
      ctx.fillStyle = PAL.red2;
      for (let k = 2; k < YC - 2; k++) { ctx.fillRect(s[0] + k, s[1] + k, 1, 1); ctx.fillRect(s[0] + YC - 1 - k, s[1] + k, 1, 1); }
    }
    if (Math.floor(t * 3) & 1) for (const i of st.blocked) {
      const s = this.cellScreen(i % COLS, (i / COLS) | 0);
      ctx.fillStyle = PAL.black; ctx.fillRect(s[0] + 4, s[1] + 1, 5, 10);
      ctx.fillStyle = PAL.red2; ctx.fillRect(s[0] + 5, s[1] + 2, 3, 5); ctx.fillRect(s[0] + 5, s[1] + 8, 3, 2);
    }
    // błyskawica: działo przyspieszone prochownią albo bębnem
    for (const b of st.blocks) if (WEAPONS[PARTS[b.p].w] && Design.rateK(st.cells, b.c, b.r) > 1) { const s = this.cellScreen(b.c, b.r); ctx.drawImage(Icons.lightning, s[0] + YC - 4, s[1]); }
    // podgląd
    const h = this.hover, g = this.ghost, blink = Math.floor(t * 6) & 1;
    if (!h) return;
    if (Input.mouse.down[2] && this.paint === 'remove') {
      const s = this.cellScreen(h.c, h.r);
      ctx.fillStyle = PAL.red2;
      for (let k = 1; k < YC - 1; k++) { ctx.fillRect(s[0] + k, s[1] + k, 2, 2); ctx.fillRect(s[0] + YC - 2 - k, s[1] + k, 2, 2); }
      return;
    }
    if (g && g.ok) {
      ctx.globalAlpha = 0.7;
      for (const q of g.cells) {
        const s = this.cellScreen(q[0], q[1]), cl = g.arr[q[1] * COLS + q[0]];
        ctx.save(); ctx.translate(s[0] - 4 * YZ, s[1] - 4 * YZ); ctx.scale(YZ, YZ);
        ctx.drawImage(PartIcons.get(this.sel.p, this.sel.q, col, mounted(cl) ? cl.h : undefined), 0, 0); ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    for (const q of (g ? g.cells : [[h.c, h.r]])) {
      const s = this.cellScreen(q[0], q[1]);
      const cc = !g ? PAL.white : g.ok ? (blink ? PAL.green : '#a5f08f') : g.same ? PAL.silver : (blink ? PAL.red2 : PAL.salmon);
      ctx.fillStyle = PAL.black;
      ctx.fillRect(s[0] - 1, s[1] - 1, YC + 2, 1); ctx.fillRect(s[0] - 1, s[1] + YC, YC + 2, 1); ctx.fillRect(s[0] - 1, s[1] - 1, 1, YC + 2); ctx.fillRect(s[0] + YC, s[1] - 1, 1, YC + 2);
      ctx.fillStyle = cc;
      ctx.fillRect(s[0], s[1], YC, 1); ctx.fillRect(s[0], s[1] + YC - 1, YC, 1); ctx.fillRect(s[0], s[1], 1, YC); ctx.fillRect(s[0] + YC - 1, s[1], 1, YC);
    }
    if (g && g.ok && g.cost) { const s = this.cellScreen(h.c, h.r); Font.draw(ctx, '-' + g.cost, s[0] + YC / 2, s[1] - 10, { align: 'center', color: PAL.gold, outline: PAL.black }); }
    // co leży pod kursorem
    const lab = this.cellLabel(h.c, h.r), lw = Font.measure(lab) + 10;
    ctx.fillStyle = 'rgba(24,20,37,0.85)'; ctx.fillRect(this.L.x + (this.L.w - lw) / 2, this.L.y + this.L.h - 16, lw, 12);
    Font.draw(ctx, lab, this.L.x + this.L.w / 2, this.L.y + this.L.h - 13, { align: 'center', color: g && !g.ok && !g.same ? PAL.salmon : PAL.silver });
  }
  drawItemCard(ctx, r, col) {
    const it = r.it, P = PARTS[it.p], sel = this.sel.src === it.src && this.sel.p === it.p && this.sel.q === it.q, hov = this.hoverItem === it;
    const price = this.price(it), afford = price <= this.st.gold, x = r.x, y = r.y, w = r.w, h = r.h;
    ctx.fillStyle = PAL.black; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = sel ? '#4a3a2e' : hov ? '#3a3046' : '#262238'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    if (sel) { ctx.fillStyle = Math.floor(this.t * 6) & 1 ? PAL.yellow : PAL.gold; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h); }
    const qc = hasQ(it.p) ? QUAL[it.q].col : PAL.silver;
    ctx.fillStyle = it.q ? QUAL[it.q].col : '#124e89'; ctx.fillRect(x + 1, y + 1, 16, 16);
    ctx.fillStyle = sel ? '#1d74b4' : '#124e89'; ctx.fillRect(x + 2, y + 2, 14, 14);
    ctx.drawImage(PartIcons.get(it.p, it.q, col), x + 1, y + 1 + (sel ? Math.round(Math.sin(this.t * 6)) : 0));
    if (!afford) { ctx.fillStyle = 'rgba(24,20,37,0.55)'; ctx.fillRect(x + 1, y + 1, 18, h - 2); }
    const nm = P.name.length > 17 ? P.name.slice(0, 16) + '…' : P.name;
    Font.draw(ctx, nm, x + 21, y + 2, { color: afford ? (it.q ? qc : PAL.white) : PAL.grey, shadow: PAL.black });
    const kind = hasQ(it.p) ? QUAL[it.q].name : P.relic ? 'Relikwia' : P.cat === 'hull' ? 'materiał' : 'część';
    Font.draw(ctx, it.src === 'hold' ? kind : (P.tag || ''), x + 21, y + 10, { color: it.src === 'hold' ? (P.relic ? PAL.gold : qc) : PAL.grey });
    if (it.src === 'hold') Font.draw(ctx, '×' + it.n, x + w - 4, y + 2, { color: PAL.white, align: 'right', shadow: PAL.black });
    else {
      ctx.drawImage(Icons.coin, x + w - 4 - Font.measure(String(price)) - 9, y + 3);
      Font.draw(ctx, String(price), x + w - 4, y + 2, { color: afford ? PAL.gold : PAL.red2, align: 'right', shadow: PAL.black });
    }
  }
  drawLeft(ctx) {
    const col = SHIP_COLORS[this.cw.me.col] || SHIP_COLORS[0];
    UI.panel(ctx, 4, 28, 168, 328, 'wood');
    for (const b of this.tabBtns) UI.button(ctx, b);
    const rects = this.itemRects();
    for (const r of rects) this.drawItemCard(ctx, r, col);
    if (this.isHold) {
      if (!this.st.hold.length) Font.drawWrapped(ctx, 'Ładownia jest pusta. Rozbijaj beczki i zatapiaj okręty - łupy pływają po wodzie, wystarczy po nie podpłynąć.', 12, 70, 152, { color: PAL.grey, lh: 10 });
      else Font.draw(ctx, this.st.hold.reduce((s, h) => s + h[2], 0) + ' / ' + this.st.cap + '  (kółko - przewiń)', 12, 236, { color: PAL.grey });
    } else {
      const hq = hasQ(this.sel.p) && this.sel.src === 'shop';
      if (hq) { Font.draw(ctx, 'JAKOŚĆ', 12, 243, { color: PAL.sand }); for (const b of this.qBtns) { UI.button(ctx, b); ctx.fillStyle = QUAL[b.q].col; ctx.fillRect(b.x + 2, b.y + b.h - 3, b.w - 4, 1); } }
      else Font.draw(ctx, PARTS[this.sel.p] && PARTS[this.sel.p].cat === 'hull' ? 'Kadłub: na nim stawiasz resztę' : 'Lepsze jakości tylko z łupów!', 12, 243, { color: PAL.grey });
    }
    this.drawInfo(ctx, 8, 258, 160, 94);
  }
  drawInfo(ctx, x, y, w, h) {
    const it = this.hoverItem || this.sel, P = PARTS[it.p], q = it.q || 0;
    UI.panel(ctx, x, y, w, h, 'paper');
    Font.draw(ctx, P.name.toUpperCase(), x + 6, y + 5, { color: PAL.woodDD });
    if (hasQ(it.p)) Font.draw(ctx, QUAL[q].name, x + 6, y + 15, { color: q ? mixHex(QUAL[q].col, '#000000', 0.25) : PAL.woodD });
    if (P.rule) Font.draw(ctx, RULE_TAG[P.rule], x + w - 6, y + 5, { color: PAL.red, align: 'right' });
    else if (P.cat !== 'hull') Font.draw(ctx, 'NA KADŁUBIE', x + w - 6, y + 5, { color: PAL.rust, align: 'right' });
    Font.drawWrapped(ctx, P.desc, x + 6, y + 26, w - 12, { color: PAL.woodD, lh: 9 });
    const hp = ' · Wytrz. ' + partHp(it.p, q), pw = QUAL[q].pow;
    let line = 'Masa ' + P.mass + ' · Wypór ' + P.buoy + hp;
    const Wd = WEAPONS[P.w];
    if (Wd) line = (Wd.mine ? 'Mina ' : 'Obr. ') + Math.round(Wd.dmg * (Wd.pel || 1) * QUAL[q].dmg) + ' · Ład. ' + (Wd.reload * QUAL[q].rl).toFixed(1) + 's' + hp;
    if (it.p === 'mast') line = 'Siła żagla ' + Math.round(32 * pw) + hp;
    if (it.p === 'jib') line = 'Żagiel ' + Math.round(14 * pw) + ' · Zwrot +' + Math.round(30 * pw) + '%' + hp;
    if (it.p === 'lateen') line = 'Żagiel ' + Math.round(24 * pw) + ' · pod wiatr ok' + hp;
    if (it.p === 'paddle') line = 'Ciąg ' + Math.round(14 * pw) + ' · Zwrot +' + Math.round(35 * pw) + '%' + hp;
    if (it.p === 'oars') line = 'Ciąg ' + Math.round(11 * pw) + hp;
    if (it.p === 'steam') line = 'Ciąg ' + Math.round(24 * pw) + ' · Masa ' + P.mass + hp;
    if (it.p === 'armory') line = 'Obrażenia +' + Math.round(25 * pw) + '%' + hp;
    if (it.p === 'drum') line = 'Ładowanie +' + Math.round(drumK(q) * 100) + '%' + hp;
    if (it.p === 'shield') line = 'Osłona -' + Math.round(shieldK(q) * 100) + '%' + hp;
    if (it.p === 'pump') line = 'Zasięg 2 kafle' + hp;
    if (it.p === 'magnet') line = 'Zasięg ' + Math.round(magnetRange(q)) + hp;
    if (it.p === 'crane') line = 'Ładownia +' + CRANE_HOLD + hp;
    if (P.relic) line = 'Relikwia' + hp;
    Font.draw(ctx, line, x + 6, y + h - 11, { color: PAL.rust });
  }
  statRows() {
    const s = this.st.stats, g = this.ghost && this.ghost.ok ? this.ghost.stats : null;
    return [
      ['PRĘDKOŚĆ', Math.round(s.speed / 4) + ' ' + plural(s.speed / 4, 'węzeł', 'węzły', 'węzłów'), s.speed / 90, g && g.speed / 90, PAL.cyan],
      ['ZWROTNOŚĆ', Math.round(s.turn * 57) + '°/s', s.turn / 2.2, g && g.turn / 2.2, PAL.green],
      ['SIŁA OGNIA', s.nG + ' ' + plural(s.nG, 'działo', 'działa', 'dział') + (s.nM ? ' + ' + s.nM + ' moźdz.' : ''), s.fire / 450, g && g.fire / 450, PAL.orange],
      ['ZASIĘG', s.range ? Math.round(s.range) + ' m' : '-', s.range / 320, g && g.range / 320, PAL.yellow],
      ['WYTRZYMAŁOŚĆ', String(Math.round(s.hp)), s.hp / 12000, g && g.hp / 12000, PAL.red2],
      ['ŁADOWNOŚĆ', Math.round(s.load * 100) + '%', s.load, g && g.load, s.load > 1 ? PAL.red2 : s.load > 0.85 ? PAL.gold : PAL.silver]
    ];
  }
  drawRight(ctx) {
    const st = this.st, me = this.cw.me, s = st.stats;
    UI.panel(ctx, 468, 28, 168, 328, 'wood');
    const s0 = this.cw.myShip;
    Font.draw(ctx, s0 ? s0.name : me.shipName, 474, 34, { color: PAL.white, shadow: PAL.black });
    const tier = powerTier(s.power);
    Font.draw(ctx, '★' + s.power + '  ' + POWER_TIERS[tier].name, 474, 45, { color: POWER_TIERS[tier].col, shadow: PAL.black });
    ctx.drawImage(Icons.coinBig, 474, 57);
    Font.draw(ctx, String(st.gold), 486, 56, { scale: 2, color: st.gold > 0 ? PAL.yellow : PAL.grey, outline: PAL.woodDD });
    Font.draw(ctx, 'złota', 486 + Font.measure(String(st.gold)) * 2 + 5, 61, { color: PAL.grey });
    let y = 76;
    for (const r of this.statRows()) {
      Font.draw(ctx, r[0], 474, y, { color: PAL.silver, shadow: PAL.black });
      Font.draw(ctx, r[1], 630, y, { color: PAL.white, align: 'right', shadow: PAL.black });
      UI.bar(ctx, 474, y + 10, 156, 3, r[2], r[4], { ghost: r[3] === null || r[3] === undefined ? undefined : r[3] });
      y += 21;
    }
    const wr = [];
    if (s.load > 1) wr.push(['PRZECIĄŻENIE! Dodaj poszycie', PAL.red2]);
    if (s.ph.sail + (s.ph.lat || 0) + s.ph.oar + (s.ph.steam || 0) === 0 && s.n > 1) wr.push(['Brak napędu: maszt lub wiosła', PAL.gold]);
    if (st.blocked.size) wr.push(['Zasłonięte części: ' + st.blocked.size, PAL.red2]);
    if (st.dead.size) wr.push(['Zniszczone części: ' + st.dead.size, PAL.salmon]);
    if (st.hold.some(h => isRelic(h[0]))) wr.push(['Masz relikwię w ładowni!', PAL.gold]);
    else if (s.relic && s.relic.size) wr.push(['Relikwie: ' + s.relic.size, PAL.gold]);
    wr.slice(0, 1).forEach((w, i) => Font.draw(ctx, w[0], 474, 205 + i * 10, { color: w[1], shadow: PAL.black }));
    for (const b of [this.btnMirror, this.btnRepair, this.btnSell]) if (!b.hidden) UI.button(ctx, b);
    UI.panel(ctx, 472, 266, 160, 86, 'dark');
    Font.drawWrapped(ctx, 'Jedno życie! Gdy okręt pójdzie na dno, tracisz wszystko i zaczynasz od łodzi. Wydawaj złoto mądrze. Kafli: ' + s.n + '.', 478, 272, 150, { color: PAL.grey, lh: 9 });
    Font.draw(ctx, 'Wartość okrętu: ' + s.value, 478, 338, { color: PAL.gold });
  }
}
// siatka wyśrodkowana w basenie (15 x 27 kafli po 12 px)
YardUI.BASIN = { x: 178, y: 30, w: 284, h: 326, gx: 178 + ((284 - COLS * YC) >> 1), gy: 30 + ((326 - ROWS * YC) >> 1) };
