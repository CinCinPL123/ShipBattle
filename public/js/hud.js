'use strict';
/* =========================================================
   HUD: panel okrętu, kompas, minimapa z siłą graczy,
   ranking, kronika zdarzeń, czat, ogłoszenia, duża mapa
   ========================================================= */
class Hud {
  constructor(cw) {
    this.cw = cw; this.feedList = []; this.banners = []; this.toasts = []; this.t = 0; this.bigMap = null;
  }
  feed(m) { this.feedList.push(Object.assign({}, m, { age: 0 })); if (this.feedList.length > 7) this.feedList.shift(); }
  banner(m) { this.banners.push({ text: m.x, sub: m.s, col: m.c || PAL.gold, t: 0, dur: 4.2 }); SFX.play('horn'); }
  note(m) {
    const s = this.cw.myShip;
    if (m.f && s && s.alive) FX.text(this.cw.fx, s.x, s.y - s.radius - 14, m.x, m.c || PAL.yellow, 1, 1.8);
    else { this.toasts.push({ x: m.x, c: m.c || PAL.salmon, t: 0 }); if (this.toasts.length > 3) this.toasts.shift(); SFX.play('error'); }
  }
  update(dt) {
    this.t += dt;
    for (const f of this.feedList) f.age += dt;
    this.feedList = this.feedList.filter(f => f.age < 14);
    for (const b of this.banners) b.t += dt;
    if (this.banners.length && this.banners[0].t > this.banners[0].dur) this.banners.shift();
    for (const n of this.toasts) n.t += dt;
    this.toasts = this.toasts.filter(n => n.t < 2.6);
  }
  draw(ctx, o) {
    const cw = this.cw, s = cw.myShip;
    if (s && !s.dead) this.drawShipPanel(ctx, s);
    this.drawCompass(ctx);
    this.drawMinimap(ctx, W - 110, 6, 104);
    this.drawBoard(ctx, W - 110, 116);
    this.drawFeed(ctx, o.chat);
    this.drawPrompts(ctx, s, o);
    this.drawBanner(ctx);
    this.toasts.forEach((n, i) => {
      const a = clamp(2.6 - n.t, 0, 1), w = Font.measure(n.x) + 12, y = H - 70 - i * 14;
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(24,20,37,0.85)'; ctx.fillRect(W / 2 - w / 2, y - 3, w, 13);
      Font.draw(ctx, n.x, W / 2, y, { align: 'center', color: n.c }); ctx.globalAlpha = 1;
    });
    if (Net.mode === 'online') {
      const ms = Math.round(Net.rtt);
      Font.draw(ctx, (Net.state === 'open' ? ms + ' ms' : 'brak połączenia') + ' · ' + cw.map.n + ' ' + plural(cw.map.n, 'gracz', 'graczy', 'graczy'), W - 6, H - 11, { align: 'right', color: Net.state === 'open' ? PAL.steel : PAL.red2, shadow: PAL.black });
    } else Font.draw(ctx, 'OFFLINE', W - 6, H - 11, { align: 'right', color: PAL.steel, shadow: PAL.black });
  }
  // ---------- panel okrętu ----------
  drawShipPanel(ctx, s) {
    const me = this.cw.me, pw = 180, ph = 38, X = 4 + (this.cw.hitT > 0 ? Math.round(rand(-1, 1)) : 0), y = 4;
    UI.panel(ctx, X, y, pw, ph, s.col);
    Font.draw(ctx, s.name, X + 8, y + 7, { color: PAL.white, shadow: PAL.black });
    const tier = powerTier(me.pw), tl = '★' + me.pw;
    Font.draw(ctx, tl, X + pw - 8, y + 7, { color: POWER_TIERS[tier].col, shadow: PAL.black, align: 'right' });
    if (s.fl & 32) ctx.drawImage(Icons.crown, X + pw - 18 - Font.measure(tl), y + 7);
    const integ = s.alive ? s.integ : 0;
    UI.bar(ctx, X + 8, y + 18, 98, 4, integ, integ > 0.6 ? PAL.green : integ > 0.3 ? PAL.gold : PAL.red2);
    ctx.drawImage(Icons.heart, X + 110, y + 16);
    UI.bar(ctx, X + 120, y + 18, 52, 4, s.alive ? s.coreF : 0, PAL.red2);
    const lab = ['Q', 'E', 'SPC'];
    let xx = X + 8; const yy = y + 27;
    me.rl.forEach((list, gi) => {
      Font.draw(ctx, lab[gi], xx, yy, { color: list.length ? PAL.silver : PAL.steel });
      xx += Font.measure(lab[gi]) + 3;
      const n = Math.min(list.length, 7);
      if (!n) { ctx.fillStyle = PAL.slate; ctx.fillRect(xx, yy + 3, 4, 1); xx += 7; }
      for (let q = 0; q < n; q++) {
        const f = clamp(list[q] / 10, 0, 1), ready = f >= 1;
        ctx.fillStyle = PAL.black; ctx.fillRect(xx, yy, 4, 7);
        ctx.fillStyle = PAL.navy; ctx.fillRect(xx + 1, yy + 1, 2, 5);
        const fh = Math.round(5 * f);
        ctx.fillStyle = ready ? (s.fl & 4 ? PAL.yellow : PAL.gold) : PAL.steel;
        ctx.fillRect(xx + 1, yy + 6 - fh, 2, fh);
        xx += 4;
      }
      if (list.length > 7) { Font.draw(ctx, '+', xx + 1, yy, { color: PAL.silver }); xx += 6; }
      xx += 6;
    });
    // żagle
    const gx = X + pw - 34, thr = me.thr;
    for (let q = 0; q < 4; q++) {
      const hh = 2 + q;
      ctx.fillStyle = PAL.black; ctx.fillRect(gx + q * 5, yy + 7 - hh - 1, 4, hh + 1);
      ctx.fillStyle = q === 0 ? (thr === 0 ? PAL.silver : PAL.slate) : (thr >= q ? PAL.cyan : PAL.slate);
      ctx.fillRect(gx + q * 5 + 1, yy + 7 - hh, 2, hh);
    }
    ctx.fillStyle = thr < 0 ? PAL.red2 : PAL.slate; ctx.fillRect(gx + 21, yy + 2, 4, 4);
    if (s.fl & 4 && (Math.floor(this.t * 6) & 1)) ctx.drawImage(Icons.lightning, X + pw - 12, y + 16);
    // złoto i ładownia
    const gy = y + ph + 3;
    UI.panel(ctx, X, gy, 92, 16, 'dark');
    ctx.drawImage(Icons.coin, X + 5, gy + 5);
    const gf = me.goldFlash > 0;
    Font.draw(ctx, String(me.gold), X + 14, gy + 5, { color: gf && (Math.floor(this.t * 12) & 1) ? PAL.white : PAL.yellow, shadow: PAL.black });
    if (me.goldFlash > 0) me.goldFlash -= 1 / 60;
    ctx.drawImage(Icons.chest, X + 62, gy + 5);
    Font.draw(ctx, String(me.n), X + 72, gy + 5, { color: me.n >= MAX_HOLD ? PAL.red2 : PAL.silver, shadow: PAL.black });
  }
  drawCompass(ctx) {
    const cw = this.cw, cx = W / 2, cy = 17, a = cw.wind.ang, dx = Math.sin(a), dy = -Math.cos(a);
    drawDisc(ctx, cx, cy, 10, PAL.black); drawDisc(ctx, cx, cy, 9, PAL.navy);
    ctx.fillStyle = PAL.slate; ctx.fillRect(cx, cy - 9, 1, 2); ctx.fillRect(cx, cy + 8, 1, 2); ctx.fillRect(cx - 9, cy, 2, 1); ctx.fillRect(cx + 8, cy, 2, 1);
    Font.draw(ctx, 'N', cx, cy - 20 + 2, { align: 'center', color: PAL.red2, shadow: PAL.black });
    pline(ctx, cx - dx * 6, cy - dy * 6, cx + dx * 6, cy + dy * 6, PAL.silver);
    ctx.fillStyle = PAL.cyan; ctx.fillRect(Math.round(cx + dx * 6) - 1, Math.round(cy + dy * 6) - 1, 3, 3);
    const s = cw.myShip, me = cw.me;
    let txt, col;
    if (me.port >= 0 && cw.ports[me.port]) { txt = cw.ports[me.port].name.toUpperCase() + ' · BEZPIECZNIE'; col = PAL.green; }
    else { const z = zoneOf(cw.cam.x, cw.cam.y); txt = ZONES[z].name; col = ZONES[z].col; }
    Font.draw(ctx, txt, cx, cy + 15, { align: 'center', color: col, outline: PAL.black });
    if (s && s.fl & 64) Font.draw(ctx, 'W STOCZNI', cx, cy + 26, { align: 'center', color: PAL.gold, outline: PAL.black });
  }
  // ---------- minimapa ----------
  drawMinimap(ctx, x, y, S) {
    const cw = this.cw, k = S / WORLD, t = this.t;
    ctx.fillStyle = PAL.black; ctx.fillRect(x - 2, y - 2, S + 4, S + 4);
    ctx.fillStyle = PAL.woodD; ctx.fillRect(x - 1, y - 1, S + 2, S + 2);
    ctx.drawImage(cw.miniBase, x, y);
    for (const pt of cw.ports) { ctx.fillStyle = PAL.gold; ctx.fillRect(Math.round(x + pt.x * k) - 1, Math.round(y + pt.y * k) - 1, 3, 3); ctx.fillStyle = PAL.woodDD; ctx.fillRect(Math.round(x + pt.x * k), Math.round(y + pt.y * k), 1, 1); }
    this.drawMapEvents(ctx, x, y, k, false);
    this.drawMapPlayers(ctx, x, y, k, false);
    // widok kamery
    ctx.globalAlpha = 0.5; ctx.fillStyle = PAL.white;
    const vx = Math.round(x + (cw.cam.x - W / 2) * k), vy = Math.round(y + (cw.cam.y - H / 2) * k), vw = Math.round(W * k), vh = Math.round(H * k);
    ctx.fillRect(vx, vy, vw, 1); ctx.fillRect(vx, vy + vh, vw, 1); ctx.fillRect(vx, vy, 1, vh); ctx.fillRect(vx + vw, vy, 1, vh + 1);
    ctx.globalAlpha = 1;
    Font.draw(ctx, 'M - mapa', x + S, y + S + 3, { align: 'right', color: PAL.steel, shadow: PAL.black });
  }
  drawMapEvents(ctx, x, y, k, big) {
    const t = this.t;
    for (const e of this.cw.map.ev) {
      const X = Math.round(x + e[1] * k), Y = Math.round(y + e[2] * k);
      if (e[0] === 'storm') {
        const r = Math.max(2, Math.round(e[3] * k));
        ctx.globalAlpha = 0.5; drawDisc(ctx, X, Y, r, '#3a4466'); ctx.globalAlpha = 0.8; drawRing(ctx, X, Y, r, PAL.cyan); ctx.globalAlpha = 1;
        ctx.drawImage(Icons.storm, X - 4, Y - 4);
      } else {
        const ic = e[0] === 'ghost' ? Icons.ghost : e[0] === 'merchant' ? Icons.merchant : Icons.treasure;
        if ((Math.floor(t * 3) & 1) || big) ctx.drawImage(ic, X - (ic.width >> 1), Y - (ic.height >> 1));
        else { ctx.globalAlpha = 0.6; drawRing(ctx, X, Y, 6, e[0] === 'ghost' ? PAL.ghost : PAL.gold); ctx.globalAlpha = 1; }
      }
      if (big) {
        const label = { ghost: 'STATEK WIDMO', merchant: 'ZŁOTY GALEON', storm: 'SZTORM', treasure: 'SKARB' }[e[0]];
        Font.draw(ctx, label, X, Y + 8, { align: 'center', color: e[0] === 'ghost' ? PAL.ghost : e[0] === 'storm' ? PAL.cyan : PAL.gold, outline: PAL.black });
      }
    }
  }
  drawMapPlayers(ctx, x, y, k, big) {
    const cw = this.cw, me = cw.myShip;
    for (const p of cw.map.pl) {
      if (p[7] === cw.me.shipId) continue;
      const X = Math.round(x + p[2] * k), Y = Math.round(y + p[3] * k), tier = powerTier(p[4]), r = 1 + Math.floor(tier / 2) + (big ? 1 : 0);
      ctx.fillStyle = PAL.black; ctx.fillRect(X - r - 1, Y - r - 1, r * 2 + 3, r * 2 + 3);
      ctx.fillStyle = POWER_TIERS[tier].col; ctx.fillRect(X - r, Y - r, r * 2 + 1, r * 2 + 1);
      if (p[0] === cw.map.top) ctx.drawImage(Icons.crown, X - 3, Y - r - 8);
      if (big) Font.draw(ctx, p[1] + ' ★' + p[4], X + r + 3, Y - 3, { color: POWER_TIERS[tier].col, outline: PAL.black });
    }
    if (me && !me.dead) {
      const X = Math.round(x + me.x * k), Y = Math.round(y + me.y * k), a = me.ang, blink = Math.floor(this.t * 4) & 1;
      ctx.fillStyle = PAL.black; ctx.fillRect(X - 2, Y - 2, 5, 5);
      ctx.fillStyle = blink ? PAL.white : PAL.yellow; ctx.fillRect(X - 1, Y - 1, 3, 3);
      pline(ctx, X, Y, X + Math.sin(a) * (big ? 9 : 5), Y - Math.cos(a) * (big ? 9 : 5), PAL.white);
      if (cw.map.top === cw.myId) ctx.drawImage(Icons.crown, X - 3, Y - 10);
      if (big) Font.draw(ctx, 'TY', X + 5, Y - 3, { color: PAL.yellow, outline: PAL.black });
    }
  }
  // ---------- ranking ----------
  drawBoard(ctx, x, y) {
    const cw = this.cw, list = cw.map.pl.slice().sort((a, b) => b[4] - a[4] || b[5] - a[5]).slice(0, 5);
    if (!list.length) return;
    UI.panel(ctx, x - 2, y, 108, 12 + list.length * 10, 'dark');
    Font.draw(ctx, 'NAJSILNIEJSI', x + 3, y + 3, { color: PAL.gold });
    list.forEach((p, i) => {
      const yy = y + 13 + i * 10, mine = p[7] === cw.me.shipId, tier = powerTier(p[4]);
      if (mine) { ctx.fillStyle = 'rgba(254,231,97,0.15)'; ctx.fillRect(x, yy - 2, 104, 10); }
      if (p[0] === cw.map.top) ctx.drawImage(Icons.crown, x + 2, yy);
      else Font.draw(ctx, String(i + 1), x + 3, yy, { color: PAL.steel });
      const nm = p[1].length > 12 ? p[1].slice(0, 11) + '…' : p[1];
      Font.draw(ctx, nm, x + 12, yy, { color: mine ? PAL.yellow : SHIP_COLORS[p[6]].l });
      Font.draw(ctx, '★' + p[4], x + 102, yy, { align: 'right', color: POWER_TIERS[tier].col });
    });
  }
  // ---------- kronika i czat ----------
  // wpis kroniki -> linie, każda to lista [tekst, kolor]; długie teksty się zawijają
  feedLines(f) {
    const FW = 236;
    if (f.k === 'kill') return [f.a ? [[f.a, f.ac], ['zatapia', PAL.grey], [f.b, f.bc]] : [[f.b, f.bc], ['idzie na dno', PAL.grey]]];
    const head = f.k === 'chat' ? f.n + ': ' : '', col = f.k === 'chat' ? PAL.white : f.c || (f.k === 'info' ? PAL.grey : PAL.silver);
    const lines = Font.wrap(head + f.x, FW);
    return lines.map((l, i) => i === 0 && head ? [[l.slice(0, head.length - 1), f.c || PAL.gold], [l.slice(head.length), col]] : [[l, col]]);
  }
  drawFeed(ctx, chat) {
    let y = H - 24 - (chat ? 14 : 0);
    for (let i = this.feedList.length - 1; i >= 0 && y > H - 150; i--) {
      const f = this.feedList[i], a = clamp(14 - f.age, 0, 1), lines = this.feedLines(f);
      ctx.globalAlpha = a;
      for (let j = lines.length - 1; j >= 0; j--) {
        const parts = lines[j];
        let w = 0; for (const p of parts) w += Font.measure(p[0]) + 4;
        ctx.fillStyle = 'rgba(24,20,37,0.6)'; ctx.fillRect(4, y - 2, w + 6, 11);
        let x = 7;
        for (const p of parts) { Font.draw(ctx, p[0], x, y, { color: p[1], shadow: PAL.black }); x += Font.measure(p[0]) + 4; }
        y -= 11;
      }
      y -= 2;
    }
    ctx.globalAlpha = 1;
    if (chat) {
      ctx.fillStyle = 'rgba(24,20,37,0.85)'; ctx.fillRect(4, H - 26, 380, 13);
      Font.draw(ctx, 'CZAT: ' + chat.value + ((Math.floor(this.t * 3) & 1) ? '_' : ''), 8, H - 23, { color: PAL.white });
    }
  }
  drawPrompts(ctx, s, o) {
    const me = this.cw.me;
    if (!s || s.dead || o.yard) return;
    if (me.port >= 0 && s.alive && !(s.fl & 64)) {
      const a = 0.65 + 0.35 * Math.sin(this.t * 4), w = 210;
      ctx.globalAlpha = a;
      UI.panel(ctx, W / 2 - w / 2, H - 44, w, 18, 'dark');
      Font.draw(ctx, 'B  -  STOCZNIA: kup części i ulepsz okręt', W / 2, H - 39, { align: 'center', color: PAL.gold });
      ctx.globalAlpha = 1;
    }
    if (o.hintT > 0) {
      const a = clamp(o.hintT, 0, 1);
      ctx.globalAlpha = a;
      const rows = [['STER', 'W/S żagle   A/D skręt   (też strzałki)'], ['OGIEŃ', 'Q lewa burta   E prawa burta   SPACJA moździerz i dziób'], ['INNE', 'B stocznia w porcie   M mapa   TAB gracze   ENTER czat']];
      const h = rows.length * 11 + 8, w = 340, x = W / 2 - w / 2, y = 48;
      UI.panel(ctx, x, y, w, h, 'dark');
      rows.forEach((r, i) => { Font.draw(ctx, r[0], x + 8, y + 5 + i * 11, { color: PAL.gold }); Font.draw(ctx, r[1], x + 52, y + 5 + i * 11, { color: PAL.silver }); });
      ctx.globalAlpha = 1;
    }
  }
  drawBanner(ctx) {
    const b = this.banners[0]; if (!b) return;
    const f = b.t / b.dur, pop = b.t < 0.2 ? ease.outBack(b.t / 0.2) : 1, a = f > 0.8 ? (1 - f) / 0.2 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.translate(W / 2, 128); ctx.scale(Math.max(0.05, pop), Math.max(0.05, pop));
    Font.draw(ctx, b.text, 0, -14, { align: 'center', scale: 3, color: b.col, outline: PAL.black });
    if (b.sub) Font.drawWrapped(ctx, b.sub, 0, 12, 300, { align: 'center', color: PAL.white, outline: PAL.black });
    ctx.restore();
  }
  // ---------- duża mapa i lista graczy ----------
  drawBigMap(ctx) {
    const cw = this.cw, S = 300, x = W / 2 - S / 2, y = H / 2 - S / 2 + 4, k = S / WORLD;
    if (!this.bigBase) this.bigBase = cw.buildMiniBase(S);
    ctx.fillStyle = 'rgba(24,20,37,0.7)'; ctx.fillRect(0, 0, W, H);
    UI.panel(ctx, x - 8, y - 18, S + 16, S + 26, 'wood');
    Font.draw(ctx, 'MAPA MÓRZ', x, y - 12, { color: PAL.gold, shadow: PAL.black });
    Font.draw(ctx, 'M - zamknij', x + S, y - 12, { align: 'right', color: PAL.grey });
    ctx.drawImage(this.bigBase, x, y);
    ZONES.forEach((z, i) => { if (i < 2) { ctx.globalAlpha = 0.35; drawRing(ctx, x + S / 2, y + S / 2, Math.round(z.r * k), z.col); ctx.globalAlpha = 1; } });
    for (const pt of cw.ports) {
      const X = Math.round(x + pt.x * k), Y = Math.round(y + pt.y * k);
      ctx.drawImage(Icons.port, X - 2, Y - 3);
      Font.draw(ctx, pt.name, X, Y + 5, { align: 'center', color: PAL.sand, outline: PAL.black });
    }
    this.drawMapEvents(ctx, x, y, k, true);
    this.drawMapPlayers(ctx, x, y, k, true);
    Font.draw(ctx, ZONES[0].name, x + S / 2, y + S / 2 - 4, { align: 'center', color: ZONES[0].col, outline: PAL.black });
    Font.draw(ctx, ZONES[2].name, x + 6, y + S - 12, { color: ZONES[2].col, outline: PAL.black });
  }
  drawPlayers(ctx) {
    const cw = this.cw, list = cw.map.pl.slice().sort((a, b) => b[4] - a[4] || b[5] - a[5]);
    const w = 360, rows = Math.min(list.length, 18), h = 34 + rows * 12, x = W / 2 - w / 2, y = 40;
    ctx.fillStyle = 'rgba(24,20,37,0.6)'; ctx.fillRect(0, 0, W, H);
    UI.panel(ctx, x, y, w, h, 'wood');
    Font.draw(ctx, 'KAPITANOWIE NA MORZU', x + 10, y + 8, { color: PAL.gold, shadow: PAL.black });
    Font.draw(ctx, 'SIŁA', x + 250, y + 20, { align: 'right', color: PAL.grey });
    Font.draw(ctx, 'ZATOPIENI', x + 344, y + 20, { align: 'right', color: PAL.grey });
    list.slice(0, rows).forEach((p, i) => {
      const yy = y + 32 + i * 12, tier = powerTier(p[4]), mine = p[7] === cw.me.shipId;
      if (mine) { ctx.fillStyle = 'rgba(254,231,97,0.12)'; ctx.fillRect(x + 6, yy - 2, w - 12, 11); }
      if (p[0] === cw.map.top) ctx.drawImage(Icons.crown, x + 10, yy);
      else Font.draw(ctx, String(i + 1) + '.', x + 10, yy, { color: PAL.steel });
      Font.draw(ctx, p[1], x + 26, yy, { color: SHIP_COLORS[p[6]].l });
      Font.draw(ctx, p[8], x + 112, yy, { color: PAL.grey });
      Font.draw(ctx, '★' + p[4] + ' ' + POWER_TIERS[tier].name, x + 250, yy, { align: 'right', color: POWER_TIERS[tier].col });
      Font.draw(ctx, String(p[5]), x + 344, yy, { align: 'right', color: PAL.white });
    });
  }
}
