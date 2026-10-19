'use strict';
/* =========================================================
   Ekrany: ładowanie, tytuł, rozgrywka, poradnik, ustawienia
   ========================================================= */
let LOGO = null;
function buildLogo() {
  const txt = 'DRZAZGI', sc = 6, pad = 8;
  const w = Font.measure(txt) * sc + pad * 2, h = 7 * sc + pad * 2;
  const [mc, mx] = makeCanvas(w, h);
  Font.draw(mx, txt, pad, pad, { scale: sc, color: '#ffffff' });
  const md = mx.getImageData(0, 0, w, h).data;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && md[(y * w + x) * 4 + 3] > 128;
  const [c, x] = makeCanvas(w + 6, h + 6);
  const img = x.createImageData(w + 6, h + 6), d = img.data;
  const put = (X, Y, hex, a) => { const col = hexRgb(hex), o = (Y * (w + 6) + X) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = a === undefined ? 255 : a; };
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (inside(xx, y)) put(xx + 4, y + 5, PAL.black, 150);
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    if (inside(xx, y)) continue;
    let n = false;
    for (let dy = -2; dy <= 2 && !n; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && inside(xx + dx, y + dy)) { n = true; break; }
    if (n) put(xx, y, PAL.black);
  }
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    if (!inside(xx, y)) continue;
    const up = !inside(xx, y - 1), dn = !inside(xx, y + 1), lf = !inside(xx - 1, y), rt = !inside(xx + 1, y);
    const up2 = !inside(xx, y - 2), dn2 = !inside(xx, y + 2);
    const band = Math.floor((y - pad) / 3), gr = Noise.v(xx * 0.25 + band * 7, band * 3.1);
    let col = band % 2 ? '#b86f50' : '#c27a55';
    if (gr > 0.66) col = '#d08c63'; else if (gr < 0.3) col = '#a8644a';
    if ((y - pad) % 6 === 5) col = '#87493a';
    if (hash2(xx, y) > 0.985) col = '#733e39';
    if (up || up2 && !dn) col = up ? PAL.sand : PAL.woodL;
    if (dn) col = PAL.woodDD; else if (dn2) col = PAL.woodD;
    if (lf && !up && !dn) col = PAL.woodL;
    if (rt && !up && !dn) col = PAL.woodD;
    const cx = (xx - pad) % sc, cy = (y - pad) % sc;
    if (cx === 3 && cy === 2 && hash2(Math.floor((xx - pad) / sc), Math.floor((y - pad) / sc)) > 0.82) col = PAL.silver;
    put(xx, y, col);
  }
  x.putImageData(img, 0, 0);
  LOGO = c;
}
// ---------- nawigacja przyciskami z klawiatury ----------
function navButtons(list, scene) {
  const vis = list.filter(b => !b.hidden && !b.disabled);
  if (!vis.length) return null;
  if (scene.focus === undefined) scene.focus = 0;
  if (Act.hit(BIND.menu, 'down')) { scene.focus = (scene.focus + 1) % vis.length; SFX.play('hover'); scene.kbNav = true; }
  if (Act.hit(BIND.menu, 'up')) { scene.focus = (scene.focus - 1 + vis.length) % vis.length; SFX.play('hover'); scene.kbNav = true; }
  if (Input.mouse.moved) scene.kbNav = false;
  vis.forEach((b, i) => { b.focus = scene.kbNav && i === scene.focus; });
  const c = UI.updateButtons(list);
  if (c) return c;
  if (scene.kbNav && (Input.hit('Enter') || Input.hit('Space') || Input.hit('GP_A'))) { SFX.play('click'); return vis[scene.focus]; }
  return null;
}
function drawSeaBackdrop(ctx, t) {
  Water.draw(ctx, t * 14, t * 5, t);
  ctx.fillStyle = 'rgba(16,14,30,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(UI.vignette, 0, 0);
}
function fmtTime(s) { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60); return m >= 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m + ':' + String(s % 60).padStart(2, '0'); }
const Session = {
  get() { try { return sessionStorage.getItem('drzazgi.token') || ''; } catch (e) { return ''; } },
  set(v) { try { sessionStorage.setItem('drzazgi.token', v); } catch (e) { /* brak dostępu */ } }
};

// ---------- ładowanie ----------
const LOAD_QUIPS = ['Strugamy deski...', 'Smołujemy kadłuby...', 'Ładujemy armaty...', 'Szyjemy żagle...', 'Przekupujemy mewy...', 'Wypatrujemy widm...'];
class LoadScene {
  constructor() { this.t = 0; this.step = 0; this.done = false; }
  update(dt) {
    this.t += dt;
    if (!this.done && this.t > 0.05) {
      const steps = [() => Water.init(), () => buildWorldArt(), () => UI.buildVignette(), () => buildYardBg()];
      steps[this.step++]();
      if (this.step >= steps.length) this.done = true;
    }
    if (this.done && this.t > 0.6 && (Input.any || Input.mouse.pressed[0])) { SFX.unlock(); SFX.play('click'); Game.go(() => new TitleScene()); }
  }
  draw(ctx) {
    ctx.fillStyle = PAL.black; ctx.fillRect(0, 0, W, H);
    if (Water.base) { ctx.globalAlpha = 0.35; Water.draw(ctx, this.t * 10, 0, this.t); ctx.globalAlpha = 1; }
    const bob = Math.round(Math.sin(this.t * 1.6) * 2);
    ctx.drawImage(LOGO, Math.round(W / 2 - LOGO.width / 2), 104 + bob);
    Font.draw(ctx, 'OTWARTE MORZE  ·  JEDNO ŻYCIE  ·  POSTRACH MÓRZ', W / 2, 174, { align: 'center', color: PAL.gold, outline: PAL.black });
    if (!this.done) {
      UI.bar(ctx, W / 2 - 80, 214, 160, 4, this.step / 4, PAL.gold);
      Font.draw(ctx, LOAD_QUIPS[Math.floor(this.t * 1.6) % LOAD_QUIPS.length], W / 2, 226, { align: 'center', color: PAL.grey });
    } else if (Math.floor(this.t * 2.5) & 1) Font.draw(ctx, 'KLIKNIJ ALBO NACIŚNIJ KLAWISZ', W / 2, 218, { align: 'center', color: PAL.white, outline: PAL.black });
    Font.draw(ctx, 'Najlepiej z dźwiękiem', W / 2, 330, { align: 'center', color: PAL.steel });
    if (('ontouchstart' in window) && !matchMedia('(pointer: fine)').matches)
      Font.draw(ctx, 'Żegluga wymaga klawiatury albo pada - najlepiej grać na komputerze', W / 2, 342, { align: 'center', color: PAL.salmon });
  }
}

// ---------- ekran tytułowy ----------
class TitleScene {
  constructor() {
    this.t = 0; this.focus = 0; this.kbNav = false; this.status = null; this.field = null;
    if (Settings.col < 0) Settings.col = randi(0, N_PLAYER_COLORS - 1);
    if (!Settings.ship) Settings.ship = SHIP_NAMES.random();
    this.online = Net.canOnline();
    const bx = 30, by = 214, bw = 150, bh = 18;
    this.btns = [
      { x: bx, y: by, w: bw, h: bh, label: 'WYPŁYŃ NA MORZE', primary: true, act: 'online', hidden: !this.online },
      { x: bx, y: by + 23, w: bw, h: bh, label: this.online ? 'GRAJ OFFLINE' : 'GRAJ (OFFLINE)', act: 'offline', primary: !this.online },
      { x: bx, y: by + 46, w: 72, h: bh, label: 'JAK GRAĆ', act: 'how' },
      { x: bx + 78, y: by + 46, w: 72, h: bh, label: 'OPCJE', act: 'set' }
    ];
    this.fsBtn = { x: W - 92, y: 8, w: 84, h: 15, label: 'PEŁNY EKRAN', act: 'fs' };
    this.rndBtn = { x: 178, y: 155, w: 34, h: 13, label: 'LOS' };
    this.fields = [
      { key: 'name', label: 'Kapitan', x: 74, y: 140, w: 100, max: 16 },
      { key: 'ship', label: 'Okręt', x: 74, y: 159, w: 100, max: 20 }
    ];
    const demo = Design.fromRows(TEMPLATES.galeon.rows, 2); this.demo = Design.list(demo).map(b => Object.assign(b, { alive: true }));
    this.demoCol = -1;
    if (this.online) fetch('status').then(r => r.json()).then(s => { this.status = s; }).catch(() => { this.status = { ok: false }; });
  }
  enter() { Music.play('menu'); Ambience.set(0.8); }
  join() { return { name: cleanName(Settings.name, 16) || 'Kapitan', ship: cleanName(Settings.ship, 20) || SHIP_NAMES.random(), col: Settings.col, token: Session.get() }; }
  update(dt) {
    this.t += dt;
    if (Math.random() < dt * 0.06) SFX.play('gull');
    const m = Input.mouse;
    // pola tekstowe
    for (const f of this.fields) {
      if (m.pressed[0] && Input.inRect(f.x, f.y - 3, f.w, 13)) this.edit(f);
    }
    if (this.field && m.pressed[0] && !this.fields.some(f => Input.inRect(f.x, f.y - 3, f.w, 13))) this.stopEdit();
    // bandera
    for (let i = 0; i < N_PLAYER_COLORS; i++) if (m.pressed[0] && Input.inRect(74 + i * 13, 179, 11, 11)) { Settings.col = i; saveSettings(); SFX.play('click'); }
    if (this.field) return;
    const c = navButtons(this.btns, this) || UI.updateButtons([this.fsBtn, this.rndBtn]);
    if (!c) return;
    if (c === this.rndBtn) { Settings.ship = SHIP_NAMES.random(Settings.ship); saveSettings(); }
    else if (c.act === 'online') { saveSettings(); const j = this.join(); Game.go(() => new PlayScene({ mode: 'online', join: j })); }
    else if (c.act === 'offline') { saveSettings(); const j = this.join(); Game.go(() => new PlayScene({ mode: 'offline', join: j })); }
    else if (c.act === 'how') Game.go(() => new HowToScene());
    else if (c.act === 'set') Game.go(() => new SettingsScene());
    else if (c.act === 'fs') Screen.toggleFullscreen();
  }
  edit(f) {
    if (this.field === f) return;
    this.stopEdit();
    this.field = f; SFX.play('click');
    Input.setField({ value: Settings[f.key] || '', max: f.max, onEnter: () => this.stopEdit(), onEsc: () => this.stopEdit() });
  }
  stopEdit() {
    if (!this.field) return;
    Settings[this.field.key] = cleanName(Input.field.value, this.field.max);
    if (this.field.key === 'ship' && !Settings.ship) Settings.ship = SHIP_NAMES.random();
    saveSettings(); this.field = null; Input.setField(null);
  }
  exit() { this.stopEdit(); }
  draw(ctx) {
    const t = this.t;
    Water.draw(ctx, t * 14, t * 5, t);
    // okręt kręci się po zatoce
    if (this.demoCol !== Settings.col) { this.demoCol = Settings.col; this.demoSpr = renderShip(this.demo, SHIP_COLORS[Settings.col]); }
    const a = t * 0.25, cx = 420 + Math.cos(a) * 110, cy = 200 + Math.sin(a) * 70, ang = a + Math.PI;
    ctx.save(); ctx.translate(cx + 3, cy + 4); ctx.rotate(ang); ctx.globalAlpha = 0.3; ctx.drawImage(this.demoSpr.sil, -SW / 2, -SH / 2); ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.translate(-SW / 2, -SH / 2);
    ctx.drawImage(this.demoSpr.img, 0, 0); drawShipDyn(ctx, this.demo, { t, row: 0.6 }); drawSails(ctx, this.demo, { col: SHIP_COLORS[Settings.col], sail: 3, yaw: 0.2 });
    ctx.restore();
    ctx.drawImage(UI.vignette, 0, 0);
    ctx.fillStyle = 'rgba(16,14,30,0.86)'; ctx.fillRect(0, 0, 222, H);
    for (let x = 222; x < 300; x += 2) { ctx.fillStyle = 'rgba(16,14,30,' + (0.86 * (1 - (x - 222) / 78)).toFixed(3) + ')'; ctx.fillRect(x, 0, 2, H); }
    const bob = Math.round(Math.sin(t * 1.6) * 2);
    ctx.drawImage(LOGO, 22, 30 + bob);
    Font.draw(ctx, 'OTWARTE MORZE · JEDNO ŻYCIE', 28, 96, { color: PAL.gold, outline: PAL.black });
    Font.drawWrapped(ctx, 'Rozbudowuj okręt, zatapiaj rywali, siej strach. Giniesz raz.', 28, 110, 190, { color: PAL.silver, lh: 9 });
    // formularz
    for (const f of this.fields) {
      const on = this.field === f, val = on ? Input.field.value : (Settings[f.key] || (f.key === 'name' ? 'Kapitan' : ''));
      Font.draw(ctx, f.label, 28, f.y, { color: PAL.grey });
      ctx.fillStyle = PAL.black; ctx.fillRect(f.x - 1, f.y - 4, f.w + 2, 14);
      ctx.fillStyle = on ? '#2a2440' : '#1c1830'; ctx.fillRect(f.x, f.y - 3, f.w, 12);
      if (on) { ctx.fillStyle = PAL.gold; ctx.fillRect(f.x, f.y + 8, f.w, 1); }
      Font.draw(ctx, val + (on && (Math.floor(t * 3) & 1) ? '_' : ''), f.x + 3, f.y, { color: Settings[f.key] || on ? PAL.white : PAL.steel });
    }
    UI.button(ctx, this.rndBtn);
    Font.draw(ctx, 'Bandera', 28, 181, { color: PAL.grey });
    for (let i = 0; i < N_PLAYER_COLORS; i++) {
      const C = SHIP_COLORS[i], X = 74 + i * 13, sel = Settings.col === i;
      ctx.fillStyle = sel ? PAL.yellow : PAL.black; ctx.fillRect(X - 1, 178, 13, 13);
      ctx.fillStyle = C.d; ctx.fillRect(X, 179, 11, 11); ctx.fillStyle = C.c; ctx.fillRect(X + 1, 180, 9, 7); ctx.fillStyle = C.l; ctx.fillRect(X + 1, 180, 9, 1);
    }
    for (const b of this.btns) if (!b.hidden) UI.button(ctx, b);
    UI.button(ctx, this.fsBtn);
    // status serwera i sala sław
    const s = this.status;
    let sy = 288;
    if (this.online) {
      const txt = !s ? 'Sprawdzam serwer...' : s.ok ? 'Na morzu: ' + s.players + ' ' + plural(s.players, 'kapitan', 'kapitanów', 'kapitanów') : 'Serwer niedostępny - graj offline';
      Font.draw(ctx, txt, 28, sy, { color: s && s.ok ? PAL.green : PAL.grey, shadow: PAL.black }); sy += 12;
    } else { Font.drawWrapped(ctx, 'Gra otwarta z pliku - multiplayer działa po uruchomieniu serwera.', 28, sy, 186, { color: PAL.grey, lh: 9 }); sy += 20; }
    const hof = (s && s.hof) || Store.get('hof', []);
    if (hof.length) {
      UI.panel(ctx, W - 196, 30, 188, 16 + Math.min(5, hof.length) * 11, 'dark');
      Font.draw(ctx, 'SALA SŁAWY', W - 190, 35, { color: PAL.gold });
      hof.slice(0, 5).forEach((e, i) => {
        const yy = 47 + i * 11, tier = powerTier(e.pw);
        Font.draw(ctx, (i + 1) + '. ' + (e.n.length > 12 ? e.n.slice(0, 11) + '…' : e.n), W - 190, yy, { color: i === 0 ? PAL.yellow : PAL.silver });
        Font.draw(ctx, '★' + e.pw + '  ×' + e.k, W - 14, yy, { align: 'right', color: POWER_TIERS[tier].col });
      });
    }
    Font.draw(ctx, 'v' + VERSION, W - 8, H - 12, { color: PAL.steel, align: 'right', shadow: PAL.black });
    Font.draw(ctx, 'Kliknij pole, by wpisać imię', 28, 344, { color: PAL.steel, shadow: PAL.black });
  }
}

// ---------- rozgrywka ----------
class PlayScene {
  constructor(o) {
    this.o = o; this.t = 0; this.cw = null; this.hud = null; this.yard = null; this.yardState = null;
    this.state = 'connecting'; this.err = ''; this.chat = null; this.showMap = false; this.paused = false;
    this.dead = null; this.deadT = 0; this.hintT = 14; this.thr = 0; this.turn = 0; this.sent = { thr: null, turn: null }; this.combatT = 0;
    this.pauseBtns = [
      { x: W / 2 - 70, y: 156, w: 140, h: 18, label: 'WRÓĆ NA MORZE', primary: true, act: 'resume' },
      { x: W / 2 - 70, y: 180, w: 140, h: 18, label: 'OPUŚĆ MORZE', act: 'menu' }
    ];
    this.deadBtns = [
      { x: W / 2 - 126, y: 244, w: 120, h: 20, label: 'NOWE ŻYCIE', primary: true, act: 'respawn' },
      { x: W / 2 + 6, y: 244, w: 120, h: 20, label: 'MENU', act: 'menu' }
    ];
    this.errBtns = [
      { x: W / 2 - 70, y: 200, w: 140, h: 18, label: 'POŁĄCZ PONOWNIE', primary: true, act: 'retry' },
      { x: W / 2 - 70, y: 224, w: 140, h: 18, label: 'GRAJ OFFLINE', act: 'offline' },
      { x: W / 2 - 70, y: 248, w: 140, h: 18, label: 'MENU', act: 'menu' }
    ];
    Net.handler = m => this.onMsg(m);
    this.start();
  }
  start() {
    this.state = 'connecting';
    if (this.o.mode === 'offline') Net.startLocal(this.o.join);
    else Net.connect(Object.assign({}, this.o.join, { token: Session.get() }), ok => { if (!ok) { this.state = 'error'; this.err = Net.closeReason; } });
  }
  enter() { Music.play('sea'); Ambience.set(1); }
  exit() { Net.handler = null; Net.close(); Input.setField(null); Music.duck = 1; }
  cursor() { return !!(this.yard || this.paused || this.dead || this.state !== 'play' || this.showMap); }
  onMsg(m) {
    if (m.t === 'welcome') {
      if (!this.cw || this.cw.seed !== m.seed) { this.cw = new ClientWorld(m); this.hud = new Hud(this.cw); }
      else { this.cw.myId = m.id; this.cw.me.shipId = m.you.ship; this.cw.ships.clear(); this.cw.evq.length = 0; this.cw.off = null; }
      Session.set(m.token);
      this.state = 'play'; this.thr = 0; this.sent = { thr: null, turn: null };
      return;
    }
    if (m.t === 'full') { this.state = 'error'; this.err = 'Serwer jest pełny - spróbuj za chwilę'; Net.close(); return; }
    if (!this.cw) return;
    switch (m.t) {
      case 'yard':
        if (m.closed) { this.yard = null; break; }
        this.yardState = m;
        if (this.yard) this.yard.setState(m);
        break;
      case 'dead': this.dead = m; this.deadT = 0; this.yard = null; this.chatClose(); Music.stop(); Music.sting('lose'); break;
      case 'life': this.dead = null; this.thr = 0; this.hintT = 6; this.cw.onMsg(m); this.cw.camInit = false; Music.play('sea'); break;
      case 'feed': this.hud.feed(m); if (m.k === 'chat') SFX.play('hover'); break;
      case 'ban': this.hud.banner(m); break;
      case 'note': this.hud.note(m); break;
      default: this.cw.onMsg(m);
    }
  }
  chatOpen() { this.chat = { value: '', max: 80, onEnter: v => { v = cleanName(v, 80); if (v) Net.send({ t: 'chat', x: v }); this.chatClose(); }, onEsc: () => this.chatClose() }; Input.setField(this.chat); }
  chatClose() { if (Input.field === this.chat) Input.setField(null); this.chat = null; }
  openYard() {
    const me = this.cw.me, s = this.cw.myShip;
    if (!s || !s.alive) return;
    if (me.port < 0) { this.hud.note({ x: 'Stocznia jest tylko w porcie - płyń do kotwicy na mapie (M)' }); return; }
    this.yard = new YardUI(this.cw);
    if (this.yardState) this.yard.setState(Object.assign({}, this.yardState, { quiet: true }));
    Net.send({ t: 'yard', op: 'open' });
    this.thr = 0; SFX.play('bell');
  }
  closeYard() { this.yard = null; Net.send({ t: 'yard', op: 'close' }); this.thr = 0; this.sent.thr = null; }
  update(dt) {
    this.t += dt;
    Net.update(dt);
    if (this.state === 'play' && Net.state === 'closed' && this.o.mode === 'online') { this.state = 'error'; this.err = Net.closeReason || 'Połączenie przerwane'; }
    if (this.state !== 'play') { this.updateError(); return; }
    const cw = this.cw;
    cw.update(dt); this.hud.update(dt); Shake.update(dt);
    if (this.hintT > 0 && !this.yard) this.hintT -= dt;
    this.music(dt);
    if (this.chat) return;
    if (this.dead) { this.deadT += dt; if (this.deadT > 2.2) this.updateDead(); return; }
    if (this.paused) {
      const c = navButtons(this.pauseBtns, this);
      if (Input.hit('Escape') || (c && c.act === 'resume')) this.paused = false;
      else if (c && c.act === 'menu') Game.go(() => new TitleScene());
      return;
    }
    if (this.yard) {
      const r = this.yard.update(dt);
      if (r === 'close' || Input.hit('Escape') || Input.hit('KeyB')) this.closeYard();
      return;
    }
    if (Input.hit('Escape')) { if (this.showMap) this.showMap = false; else { this.paused = true; SFX.play('click'); } return; }
    if (Act.hit(BIND.play, 'map')) { this.showMap = !this.showMap; SFX.play('click'); }
    if (Act.hit(BIND.play, 'chat')) { this.chatOpen(); return; }
    if (Act.hit(BIND.play, 'yard')) this.openYard();
    const s = cw.myShip, b = BIND.play;
    if (!s || !s.alive) return;
    if (Act.hit(b, 'up') && this.thr < 3) { this.thr++; SFX.play('sail', { up: true }); }
    if (Act.hit(b, 'down') && this.thr > -1) { this.thr--; SFX.play('sail', { up: false }); }
    this.turn = (Act.down(b, 'right') ? 1 : 0) - (Act.down(b, 'left') ? 1 : 0);
    if (this.thr !== this.sent.thr || this.turn !== this.sent.turn) { Net.send({ t: 'in', thr: this.thr, turn: this.turn }); this.sent.thr = this.thr; this.sent.turn = this.turn; }
    const fire = (side, i) => {
      if (cw.me.port >= 0) { this.hud.note({ x: 'W porcie nie wolno strzelać!' }); return; }
      if (!cw.me.rl[i].some(f => f >= 10)) SFX.play('empty');
      Net.send({ t: 'fire', s: side });
    };
    if (Act.hit(b, 'fireL')) fire('L', 0);
    if (Act.hit(b, 'fireR')) fire('R', 1);
    if (Act.hit(b, 'special')) fire('S', 2);
  }
  music(dt) {
    const me = this.cw.me;
    if (me.cmb) this.combatT = 8; else this.combatT -= dt;
    if (this.dead) return;
    Music.play(this.yard ? 'build' : this.combatT > 0 ? 'battle' : 'sea');
  }
  updateDead() {
    const c = navButtons(this.deadBtns, this);
    if (c && c.act === 'respawn') { Net.send({ t: 'respawn' }); this.deadBtns[0].disabled = true; setTimeout(() => { this.deadBtns[0].disabled = false; }, 1500); }
    if (c && c.act === 'menu') Game.go(() => new TitleScene());
  }
  updateError() {
    if (this.state !== 'error') { if (Input.hit('Escape')) Game.go(() => new TitleScene()); return; }
    const c = navButtons(this.errBtns, this);
    if (!c) return;
    if (c.act === 'retry') this.start();
    if (c.act === 'offline') { this.o = { mode: 'offline', join: this.o.join }; this.cw = null; this.start(); }
    if (c.act === 'menu') Game.go(() => new TitleScene());
  }
  // ---------- rysowanie ----------
  draw(ctx) {
    if (this.state !== 'play' || !this.cw) { this.drawWait(ctx); return; }
    if (this.yard) { this.yard.draw(ctx); return; }
    this.cw.draw(ctx);
    this.hud.draw(ctx, { chat: this.chat, hintT: this.hintT, yard: !!this.yard });
    if (Act.down(BIND.play, 'board') && !this.chat) this.hud.drawPlayers(ctx);
    if (this.showMap) this.hud.drawBigMap(ctx);
    if (this.dead && this.deadT > 2.2) this.drawDead(ctx);
    else if (this.dead) { const a = clamp(this.deadT / 2.2, 0, 1); ctx.fillStyle = 'rgba(40,8,16,' + (a * 0.45).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
    if (this.paused) {
      ctx.fillStyle = 'rgba(24,20,37,0.75)'; ctx.fillRect(0, 0, W, H);
      UI.panel(ctx, W / 2 - 100, 100, 200, 110, 'wood');
      Font.draw(ctx, 'PAUZA', W / 2, 114, { align: 'center', scale: 2, color: PAL.gold, shadow: PAL.black });
      Font.draw(ctx, this.o.mode === 'online' ? 'Uwaga: morze nie czeka - gra trwa!' : 'Świat offline płynie dalej', W / 2, 136, { align: 'center', color: PAL.salmon });
      for (const b of this.pauseBtns) UI.button(ctx, b);
    }
  }
  drawWait(ctx) {
    drawSeaBackdrop(ctx, this.t);
    if (this.state === 'error') {
      UI.panel(ctx, W / 2 - 150, 120, 300, 156, 'wood');
      Font.draw(ctx, 'BRAK POŁĄCZENIA', W / 2, 134, { align: 'center', scale: 2, color: PAL.salmon, shadow: PAL.black });
      Font.drawWrapped(ctx, this.err || 'Nie udało się połączyć z serwerem.', W / 2, 160, 270, { align: 'center', color: PAL.silver, lh: 10 });
      for (const b of this.errBtns) UI.button(ctx, b);
      return;
    }
    Font.draw(ctx, this.o.mode === 'offline' ? 'Budujemy świat...' : 'Łączenie z serwerem' + '...'.slice(0, 1 + Math.floor(this.t * 3) % 3), W / 2, H / 2 - 4, { align: 'center', scale: 2, color: PAL.gold, outline: PAL.black });
  }
  drawDead(ctx) {
    const d = this.dead, st = d.st || {}, k = clamp((this.deadT - 2.2) / 0.4, 0, 1);
    ctx.fillStyle = 'rgba(24,8,16,' + (0.45 + 0.3 * k).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H);
    const pw = 340, ph = 214, x = W / 2 - pw / 2, y = 62 + Math.round((1 - ease.outCubic(k)) * 30);
    ctx.globalAlpha = k;
    UI.panel(ctx, x, y, pw, ph, 'wood');
    Font.draw(ctx, 'ZATOPIONY!', W / 2, y + 12, { align: 'center', scale: 3, color: PAL.salmon, outline: PAL.black });
    Font.draw(ctx, d.by ? 'Na dno posłał Cię: ' + d.by : 'Okręt ' + (st.ship || '') + ' poszedł na dno', W / 2, y + 40, { align: 'center', color: PAL.silver });
    const rows = [['Czas na morzu', fmtTime(st.time || 0)], ['Zatopieni kapitanowie', st.kills || 0], ['Zatopieni piraci', st.npc || 0], ['Rozbite beczki', st.barrels || 0],
      ['Zdobyte złoto', st.gold || 0], ['Największa siła', '★' + (st.maxPower || 0) + ' ' + POWER_TIERS[powerTier(st.maxPower || 0)].name]];
    rows.forEach((r, i) => {
      const yy = y + 60 + i * 13;
      if (i & 1) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 8, yy - 3, pw - 16, 12); }
      Font.draw(ctx, r[0], x + 16, yy, { color: PAL.silver });
      Font.draw(ctx, String(r[1]), x + pw - 16, yy, { align: 'right', color: PAL.white });
    });
    Font.drawWrapped(ctx, 'Masz tylko jedno życie. Okręt, złoto i łupy przepadły - zaczynasz od tratwy.', W / 2, y + 144, 300, { align: 'center', color: PAL.gold, lh: 10 });
    for (const b of this.deadBtns) { b.y = y + ph - 32; UI.button(ctx, b); }
    ctx.globalAlpha = 1;
  }
}

// ---------- jak grać ----------
class HowToScene {
  constructor() {
    this.t = 0; this.page = 0; this.pages = ['CEL', 'STOCZNIA', 'ŁUPY', 'ZDARZENIA', 'STEROWANIE'];
    this.btnPrev = { x: 20, y: 330, w: 90, h: 18, label: 'WSTECZ' };
    this.btnNext = { x: W - 110, y: 330, w: 90, h: 18, label: 'DALEJ', primary: true };
    const a = Design.fromRows(TEMPLATES.bryg.rows, 1); this.demo = Design.list(a).map(b => Object.assign(b, { alive: true })); this.demoSpr = renderShip(this.demo, SHIP_COLORS[1]);
  }
  enter() { Music.play('menu'); }
  update(dt) {
    this.t += dt;
    const c = UI.updateButtons([this.btnPrev, this.btnNext]);
    if (c === this.btnPrev || Act.hit(BIND.menu, 'left') || Input.hit('Escape')) { if (this.page === 0 || Input.hit('Escape')) { Game.go(() => new TitleScene()); return; } this.page--; SFX.play('click'); }
    if (c === this.btnNext || Act.hit(BIND.menu, 'right') || Input.hit('Enter') || Input.hit('Space')) { if (this.page === this.pages.length - 1) { Game.go(() => new TitleScene()); return; } this.page++; SFX.play('click'); }
    this.btnNext.label = this.page === this.pages.length - 1 ? 'GOTOWE' : 'DALEJ';
    this.btnPrev.label = this.page === 0 ? 'MENU' : 'WSTECZ';
  }
  bullets(ctx, list, x, y, w) {
    let yy = y;
    for (const l of list) { ctx.fillStyle = PAL.gold; ctx.fillRect(x, yy + 2, 3, 3); yy += Font.drawWrapped(ctx, l, x + 8, yy, w - 8, { color: PAL.silver, lh: 10 }) + 5; }
  }
  draw(ctx) {
    const t = this.t;
    drawSeaBackdrop(ctx, t);
    Font.draw(ctx, 'JAK GRAĆ', W / 2, 10, { align: 'center', scale: 2, color: PAL.gold, outline: PAL.black });
    this.pages.forEach((p, i) => {
      const x = W / 2 - 220 + i * 88;
      Font.draw(ctx, (i + 1) + '. ' + p, x + 44, 32, { align: 'center', color: i === this.page ? PAL.white : PAL.steel, shadow: PAL.black });
      if (i === this.page) { ctx.fillStyle = PAL.gold; ctx.fillRect(x + 14, 42, 60, 1); }
    });
    UI.panel(ctx, 20, 50, 600, 272, 'wood');
    const P = this.page;
    if (P === 0) {
      ctx.save(); ctx.translate(50, 70); ctx.scale(2, 2); ctx.drawImage(this.demoSpr.img, 0, 0); drawShipDyn(ctx, this.demo, { t, row: 0.3 }); ctx.globalAlpha = 0.7; drawSails(ctx, this.demo, { col: SHIP_COLORS[1], sail: 2 }); ctx.restore();
      Font.draw(ctx, 'POSTRACH MÓRZ', 270, 64, { scale: 2, color: PAL.gold, shadow: PAL.black });
      this.bullets(ctx, [
        'Wypływasz razem z innymi kapitanami na wspólne, losowe morze pełne wysp, portów i piratów.',
        'Zatapiaj okręty i rozbijaj beczki, by zdobyć złoto i łupy. Za złoto w portach kupujesz lepsze części.',
        'Im mocniejszy okręt, tym wyższa SIŁA (★). Minimapa pokazuje siłę każdego gracza, a najsilniejszy nosi KORONĘ Postrachu Mórz.',
        'Kto zatopi Postrach Mórz, dostaje dodatkowe 150 złota.',
        'HARDKOR: masz jedno życie. Gdy okręt pójdzie na dno, tracisz wszystko i zaczynasz od tratwy.',
        'W portach (przerywany krąg) nikt nie może Cię skrzywdzić - tam też naprawisz okręt.'
      ], 270, 86, 330);
    } else if (P === 1) {
      Font.draw(ctx, 'STOCZNIA W PORCIE (B)', 40, 64, { scale: 2, color: PAL.gold, shadow: PAL.black });
      this.bullets(ctx, [
        'Wpłyń do portu i naciśnij B. Kupuj części, stawiaj je myszką (LPM), a PPM zdejmuje część do ładowni.',
        'Materiały kadłuba: sosna, dąb, mahoń, żelazo, stal - i upiorne drewno ze statku widma.',
        'Bronie: armata, długie działo, karonada (śrut), smocze działo (podpala), działo łańcuchowe (tnie maszty), krętlica (strzela sama) i moździerz.',
        'Każda część ma JAKOŚĆ. Lepsza jakość = więcej obrażeń, szybsze ładowanie i większa wytrzymałość. Lepsze żagle są większe i barwniejsze, a lufy zmieniają kolor: żeliwo, stal, brąz, złoto i upiorna zieleń.',
        'W porcie kupisz do jakości mistrzowskiej. Legendarne i upiorne części zdobędziesz tylko z łupów.',
        'Zniszczone części naprawisz w stoczni za ćwierć ich wartości.'
      ], 40, 86, 560);
    } else if (P === 2) {
      Font.draw(ctx, 'ZŁOTO I ŁUPY', 40, 64, { scale: 2, color: PAL.gold, shadow: PAL.black });
      ctx.drawImage(Icons.barrel, 46, 90); ctx.drawImage(Icons.powder, 58, 90); ctx.drawImage(Icons.chest, 70, 91);
      this.bullets(ctx, [
        'Po morzu dryfują beczki. Rozbij je kulą albo taranem, a potem podpłyń po złoto lub przedmiot.',
        'Beczki prochu wybuchają! Skrzynie są twarde, ale kryją najlepsze łupy.',
        'Im dalej od środka morza, tym bogatsze łupy i groźniejsi piraci: Spokojne Wody, Szerokie Morze, Diabelskie Głębiny.',
        'Zatopiony okręt zostawia złoto i części w wodzie - kto pierwszy, ten lepszy.',
        'Przedmioty trafiają do ładowni (najwyżej ' + MAX_HOLD + '). Możesz je zamontować albo sprzedać w porcie.'
      ], 40, 104, 560);
    } else if (P === 3) {
      Font.draw(ctx, 'ZDARZENIA NA MORZU', 40, 64, { scale: 2, color: PAL.gold, shadow: PAL.black });
      const ev = [[Icons.ghost, 'STATEK WIDMO', 'Upiorny okręt wynurza się z głębin. Groźny, ale z jego wraku wypadają legendarne i upiorne części oraz upiorne drewno.', PAL.ghost],
        [Icons.merchant, 'ZŁOTY GALEON', 'Kupiec z pełną ładownią ucieka przed każdym. Dogoń go, a zgarniesz górę złota.', PAL.gold],
        [Icons.storm, 'SZTORM', 'Wędrująca burza z silnym wiatrem. Pioruny trafiają w okręty i wzniecają pożary.', PAL.cyan],
        [Icons.treasure, 'DRYFUJĄCY SKARB', 'Rozsypane skrzynie i beczki w jednym miejscu. Wyścig o łupy gotowy.', PAL.yellow]];
      ev.forEach((e, i) => {
        const y = 92 + i * 52;
        ctx.save(); ctx.translate(44, y); ctx.scale(2, 2); ctx.drawImage(e[0], 0, 0); ctx.restore();
        Font.draw(ctx, e[1], 80, y, { color: e[3], shadow: PAL.black });
        Font.drawWrapped(ctx, e[2], 80, y + 12, 500, { color: PAL.silver, lh: 10 });
      });
    } else {
      Font.draw(ctx, 'STEROWANIE', 40, 64, { scale: 2, color: PAL.gold, shadow: PAL.black });
      const rows = [['Żagle', 'W / S'], ['Skręt', 'A / D'], ['Lewa burta', 'Q'], ['Prawa burta', 'E'], ['Moździerz, dziób', 'SPACJA'], ['Stocznia (w porcie)', 'B'], ['Mapa', 'M'], ['Lista graczy', 'TAB'], ['Czat', 'ENTER'], ['Pauza', 'ESC']];
      rows.forEach((r, i) => {
        const col = i < 5 ? 0 : 1, y = 92 + (i % 5) * 20, x = 60 + col * 280;
        Font.draw(ctx, r[0], x, y + 2, { color: PAL.silver });
        UI.keycap(ctx, r[1], x + 150, y);
      });
      this.bullets(ctx, ['Pad: krzyżak/gałka - ster i żagle, LB/RB - burty, A - moździerz, Y - stocznia, BACK - mapa.',
        'Krętlice strzelają same do najbliższego wroga albo beczki.'], 60, 210, 520);
    }
    UI.button(ctx, this.btnPrev); UI.button(ctx, this.btnNext);
  }
}

// ---------- ustawienia ----------
class SettingsScene {
  constructor() {
    this.t = 0; this.sel = 0;
    this.rows = [
      { label: 'Muzyka', get: () => Math.round(Settings.music * 100) + '%', adj: d => { Settings.music = clamp(Math.round((Settings.music + d * 0.1) * 10) / 10, 0, 1); SFX.volumes(); } },
      { label: 'Efekty dźwiękowe', get: () => Math.round(Settings.sfx * 100) + '%', adj: d => { Settings.sfx = clamp(Math.round((Settings.sfx + d * 0.1) * 10) / 10, 0, 1); SFX.volumes(); SFX.play('cannon', { vol: 0.5 }); } },
      { label: 'Wstrząsy ekranu', get: () => Settings.shake ? 'WŁĄCZONE' : 'WYŁĄCZONE', adj: () => { Settings.shake = !Settings.shake; if (Settings.shake) Shake.add(0.5); } },
      { label: 'Filtr CRT', get: () => Settings.crt ? 'WŁĄCZONY' : 'WYŁĄCZONY', adj: () => { Settings.crt = !Settings.crt; } },
      { label: 'Pełny ekran', get: () => document.fullscreenElement ? 'TAK' : 'NIE', adj: () => Screen.toggleFullscreen() }
    ];
    this.btnBack = { x: W / 2 - 60, y: 290, w: 120, h: 20, label: 'WSTECZ', primary: true };
  }
  update(dt) {
    this.t += dt; Shake.update(dt);
    if (Act.hit(BIND.menu, 'up')) { this.sel = (this.sel + this.rows.length - 1) % this.rows.length; SFX.play('hover'); }
    if (Act.hit(BIND.menu, 'down')) { this.sel = (this.sel + 1) % this.rows.length; SFX.play('hover'); }
    if (Act.hit(BIND.menu, 'left')) { this.rows[this.sel].adj(-1); saveSettings(); SFX.play('click'); }
    if (Act.hit(BIND.menu, 'right') || Input.hit('Enter')) { this.rows[this.sel].adj(1); saveSettings(); SFX.play('click'); }
    this.rows.forEach((r, i) => {
      const y = 90 + i * 30;
      if (Input.inRect(140, y - 4, 360, 22)) {
        if (Input.mouse.moved) this.sel = i;
        if (Input.mouse.pressed[0]) { r.adj(Input.mouse.x < 400 ? -1 : 1); saveSettings(); SFX.play('click'); }
      }
    });
    const c = UI.updateButtons([this.btnBack]);
    if (c || Input.hit('Escape')) Game.go(() => new TitleScene());
  }
  draw(ctx) {
    drawSeaBackdrop(ctx, this.t);
    ctx.save(); ctx.translate(Shake.x, Shake.y);
    Font.draw(ctx, 'USTAWIENIA', W / 2, 30, { align: 'center', scale: 2, color: PAL.gold, outline: PAL.black });
    UI.panel(ctx, 130, 70, 380, 176, 'wood');
    this.rows.forEach((r, i) => {
      const y = 90 + i * 30, on = i === this.sel;
      if (on) { ctx.fillStyle = 'rgba(254,174,52,0.12)'; ctx.fillRect(138, y - 5, 364, 20); }
      Font.draw(ctx, r.label, 150, y, { color: on ? PAL.white : PAL.silver, shadow: PAL.black });
      Font.draw(ctx, '<', 380, y, { color: on ? PAL.gold : PAL.steel });
      Font.draw(ctx, r.get(), 440, y, { align: 'center', color: on ? PAL.yellow : PAL.white, shadow: PAL.black });
      Font.draw(ctx, '>', 496, y, { color: on ? PAL.gold : PAL.steel });
    });
    UI.button(ctx, this.btnBack);
    Font.draw(ctx, 'Strzałki / mysz zmieniają wartości. Ustawienia zapisują się same.', W / 2, 330, { align: 'center', color: PAL.grey, shadow: PAL.black });
    ctx.restore();
  }
}
