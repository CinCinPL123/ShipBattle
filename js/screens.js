'use strict';
/* =========================================================
   Ekrany: menu, przygotowanie, VS, bitwa, koniec meczu
   ========================================================= */
const BOTS = [
  { name: 'Majtek Józek', lvl: 'ŁATWY', desc: 'Dopiero się uczy, gdzie jest dziób. Strzela, zanim wyceluje.' },
  { name: 'Bosman Zenon', lvl: 'ŚREDNI', desc: 'Stary wyga. Ustawia się burtą i strzela celnie.' },
  { name: 'Kapitan Szkwał', lvl: 'TRUDNY', desc: 'Bezlitosny. Zbiera skrzynie, wyprzedza ruchy i nie wybacza.' }
];
const FACES = [];
function buildFaces() {
  const C = { w: PAL.white, B: PAL.blue2, s: PAL.skin, S: PAL.skinD, x: PAL.black, r: PAL.red, W: PAL.silver, g: PAL.grey, G: PAL.silver, N: PAL.navy, Y: PAL.gold, k: PAL.black, K: PAL.navy, R: PAL.red2, d: PAL.woodD, p: PAL.woodDD, o: PAL.orange };
  const maps = [
    ['....wwww....', '...wwwwww...', '...BBBBBB...', '..ssssssss..', '..sxssssxs..', '..ssssssss..', '..ssSrrSss..', '...ssssss...', '....SSSS....', '..WBWBWBWB..', '.WBWBWBWBWB.', '.BWBWBWBWBW.'],
    ['....SSSS....', '...ssssss...', '..ssssssss..', '..sxssssxs..', '..ssssssss..', '..gssggssg..', '.ggggrrgggg.', '.gggggggggg.', '..ggggggggpp', '...gggggg.do', '..NNNNNNNN..', '.NNNYNNYNNN.'],
    ['.kkkkkkkkkk.', 'kkkkkwkkkkkk', '.kkkkkkkkkk.', '..ssssssss..', '..sKKssxss..', '..sKssssss..', '..kssssssk..', '..kkkrrkkk..', '...kkkkkk...', '..RRRRRRRR..', '.RRRYRRYRRR.', '.RRRRRRRRRR.']
  ];
  for (const m of maps) FACES.push(fromMap(m, C));
}
function newMatch(mode, level, winsNeeded) {
  const n0 = SHIP_NAMES.random(), n1 = SHIP_NAMES.random(n0);
  const tot = () => ({ shots: 0, hits: 0, dmg: 0, kills: 0, rams: 0 });
  return {
    mode, level, winsNeeded, round: 1, history: [],
    players: [
      { name: n0, captain: mode === 'pvp' ? 'Gracz 1' : 'Ty', wins: 0, cells: null, bonus: 0, human: true, tot: tot() },
      { name: n1, captain: mode === 'pvp' ? 'Gracz 2' : BOTS[level].name, wins: 0, cells: null, bonus: 0, human: mode === 'pvp', arche: null, tot: tot() }
    ]
  };
}
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
  // cień
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) if (inside(xx, y)) put(xx + 4, y + 5, PAL.black, 150);
  // obrys
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
    // gwoździe
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
  if (Act.hit(BIND.menu, 'down') || Act.hit(BIND.menu, 'right') && scene.navH) { scene.focus = (scene.focus + 1) % vis.length; SFX.play('hover'); scene.kbNav = true; }
  if (Act.hit(BIND.menu, 'up') || Act.hit(BIND.menu, 'left') && scene.navH) { scene.focus = (scene.focus - 1 + vis.length) % vis.length; SFX.play('hover'); scene.kbNav = true; }
  if (Input.mouse.moved) scene.kbNav = false;
  vis.forEach((b, i) => { b.focus = scene.kbNav && i === scene.focus; });
  const c = UI.updateButtons(list);
  if (c) return c;
  if (scene.kbNav && (Input.hit('Enter') || Input.hit('Space') || Input.hit('GP0_A') || Input.hit('GP1_A'))) { SFX.play('click'); return vis[scene.focus]; }
  return null;
}
// ---------- menu główne ----------
class MenuScene {
  constructor() {
    this.t = 0; this.focus = 0; this.kbNav = false; this.fade = 0;
    const bx = 34, by = 150, bw = 150, bh = 20;
    this.btns = [
      { x: bx, y: by, w: bw, h: bh, label: 'GRAJ Z BOTEM', primary: true, act: 'bot' },
      { x: bx, y: by + 26, w: bw, h: bh, label: 'DWÓCH GRACZY', act: 'pvp' },
      { x: bx, y: by + 52, w: bw, h: bh, label: 'JAK GRAĆ', act: 'how' },
      { x: bx, y: by + 78, w: bw, h: bh, label: 'USTAWIENIA', act: 'set' }
    ];
    this.fsBtn = { x: W - 92, y: 8, w: 84, h: 15, label: 'PEŁNY EKRAN', act: 'fs' };
    this.newAttract();
  }
  newAttract() {
    const A = AIBuild.make(randi(300, 460), 2), B = AIBuild.make(randi(300, 460), 2);
    this.att = new Battle({ attract: true, designs: [A.cells, B.cells], names: ['', ''], controllers: [new BotCtrl(2, A.arche), new BotCtrl(2, B.arche)], weather: pick(['day', 'day', 'sunset']), onEnd: () => { this.attEnd = true; } });
    this.attEnd = false; this.attFade = 1;
  }
  enter() { Music.play('menu'); Ambience.set(0.8); }
  update(dt) {
    this.t += dt;
    SFX.muted = true; this.att.update(dt); SFX.muted = false;
    Shake.trauma = 0; Shake.x = 0; Shake.y = 0;
    if (this.attFade > 0) this.attFade = Math.max(0, this.attFade - dt * 1.5);
    if (this.attEnd) { this.fade += dt * 1.2; if (this.fade >= 1) { this.newAttract(); this.fade = 0; } }
    if (Math.random() < dt * 0.06) SFX.play('gull');
    const c = navButtons(this.btns, this) || UI.updateButtons([this.fsBtn]);
    if (!c) return;
    if (c.act === 'bot') Game.go(() => new SetupScene('bot'));
    else if (c.act === 'pvp') Game.go(() => new SetupScene('pvp'));
    else if (c.act === 'how') Game.go(() => new HowToScene());
    else if (c.act === 'set') Game.go(() => new SettingsScene());
    else if (c.act === 'fs') Screen.toggleFullscreen();
  }
  draw(ctx) {
    this.att.draw(ctx);
    if (this.attFade > 0 || this.fade > 0) { ctx.fillStyle = 'rgba(24,20,37,' + Math.max(this.attFade, this.fade).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
    // przyciemnienie z lewej
    ctx.fillStyle = 'rgba(16,14,30,0.86)'; ctx.fillRect(0, 0, 214, H);
    for (let x = 214; x < 300; x += 2) { ctx.fillStyle = 'rgba(16,14,30,' + (0.86 * (1 - (x - 214) / 86)).toFixed(3) + ')'; ctx.fillRect(x, 0, 2, H); }
    ctx.fillStyle = PAL.woodDD; ctx.fillRect(0, 0, 214, 1);
    const bob = Math.round(Math.sin(this.t * 1.6) * 2);
    ctx.drawImage(LOGO, 22, 38 + bob);
    Font.draw(ctx, 'ZBUDUJ  ·  WYPŁYŃ  ·  ZATOP', 30, 108, { color: PAL.gold, outline: PAL.black });
    Font.draw(ctx, 'Pixelowa bitwa morska dla 1-2 kapitanów', 30, 122, { color: PAL.silver, shadow: PAL.black });
    for (const b of this.btns) UI.button(ctx, b);
    UI.button(ctx, this.fsBtn);
    const wins = Career.wins.reduce((a, b) => a + b, 0);
    Font.draw(ctx, 'Wygrane mecze: ' + wins + '   Zatopione okręty: ' + Career.sunk, 30, 262, { color: PAL.grey, shadow: PAL.black });
    Font.draw(ctx, 'Sterowanie: mysz + klawiatura lub pad', 30, 340, { color: PAL.steel, shadow: PAL.black });
    Font.draw(ctx, 'v1.0', W - 8, H - 12, { color: PAL.steel, align: 'right', shadow: PAL.black });
  }
}

// ---------- przygotowanie meczu ----------
class SetupScene {
  constructor(mode) {
    this.mode = mode; this.t = 0; this.level = Store.get('lastLevel', 1); this.wins = Store.get('lastWins', 2);
    this.m = newMatch(mode, this.level, this.wins);
    this.btnBack = { x: 20, y: 330, w: 90, h: 18, label: 'WSTECZ' };
    this.btnGo = { x: W - 160, y: 326, w: 140, h: 22, label: 'DO STOCZNI!', primary: true };
    this.btnW2 = { x: 0, y: 0, w: 24, h: 15, label: '2' }; this.btnW3 = { x: 0, y: 0, w: 24, h: 15, label: '3' };
    this.btnT = [45, 60, 90].map(v => ({ x: 0, y: 0, w: 32, h: 15, label: v + 's', v }));
    this.btnN0 = { x: 0, y: 0, w: 44, h: 15, label: 'LOSUJ' }; this.btnN1 = { x: 0, y: 0, w: 44, h: 15, label: 'LOSUJ' };
    this.cards = [0, 1, 2].map(i => ({ x: 34 + i * 194, y: 52, w: 180, h: 150, i }));
  }
  enter() { Music.play('menu'); }
  update(dt) {
    this.t += dt;
    if (Input.hit('Escape')) { Game.go(() => new MenuScene()); return; }
    if (this.mode === 'bot') {
      if (Act.hit(BIND.menu, 'left')) { this.level = (this.level + 2) % 3; SFX.play('hover'); }
      if (Act.hit(BIND.menu, 'right')) { this.level = (this.level + 1) % 3; SFX.play('hover'); }
      for (const c of this.cards) {
        c.hot = Input.inRect(c.x, c.y, c.w, c.h);
        if (c.hot && Input.mouse.pressed[0]) { if (this.level !== c.i) SFX.play('click'); this.level = c.i; }
      }
    }
    const lay = this.mode === 'bot' ? [210, 228, 246] : [244, 262, 280];
    this.btnW2.x = 150; this.btnW2.y = lay[0]; this.btnW3.x = 178; this.btnW3.y = lay[0];
    this.btnT.forEach((b, k) => { b.x = 150 + k * 36; b.y = lay[1]; b.active = Settings.buildTime === b.v; });
    this.btnW2.active = this.wins === 2; this.btnW3.active = this.wins === 3;
    this.btnN0.x = 360; this.btnN0.y = lay[2]; this.btnN1.x = 560; this.btnN1.y = lay[2]; this.btnN1.hidden = this.mode !== 'pvp';
    const all = [this.btnBack, this.btnGo, this.btnW2, this.btnW3].concat(this.btnT, [this.btnN0, this.btnN1]);
    const c = UI.updateButtons(all.filter(b => !b.hidden));
    if (c === this.btnBack) { Game.go(() => new MenuScene()); return; }
    if (c === this.btnW2) this.wins = 2;
    if (c === this.btnW3) this.wins = 3;
    if (c && c.v) { Settings.buildTime = c.v; saveSettings(); }
    if (c === this.btnN0) this.m.players[0].name = SHIP_NAMES.random(this.m.players[0].name);
    if (c === this.btnN1) this.m.players[1].name = SHIP_NAMES.random(this.m.players[1].name);
    if (c === this.btnGo || Input.hit('Enter') || Input.hit('GP0_A') || Input.hit('GP0_START')) this.start();
  }
  start() {
    const m = this.m;
    m.level = this.level; m.winsNeeded = this.wins;
    if (this.mode === 'bot') m.players[1].captain = BOTS[this.level].name;
    Store.set('lastLevel', this.level); Store.set('lastWins', this.wins);
    Game.go(() => new BuildScene(m));
  }
  draw(ctx) {
    drawSeaBackdrop(ctx, this.t);
    Font.draw(ctx, this.mode === 'bot' ? 'WYBIERZ RYWALA' : 'DWÓCH KAPITANÓW', W / 2, 16, { align: 'center', scale: 2, color: PAL.gold, outline: PAL.black });
    if (this.mode === 'bot') this.drawBotCards(ctx); else this.drawPvpInfo(ctx);
    const lay = this.mode === 'bot' ? [210, 228, 246] : [244, 262, 280];
    UI.panel(ctx, 30, lay[0] - 6, 580, 62, 'dark');
    Font.draw(ctx, 'Mecz do zwycięstw:', 40, lay[0] + 4, { color: PAL.silver });
    Font.draw(ctx, 'Czas budowy:', 40, lay[1] + 4, { color: PAL.silver });
    Font.draw(ctx, this.mode === 'pvp' ? 'Okręty:' : 'Twój okręt:', 40, lay[2] + 4, { color: PAL.silver });
    Font.draw(ctx, this.m.players[0].name, 150, lay[2] + 4, { color: TEAM[0].l, shadow: PAL.black });
    if (this.mode === 'pvp') Font.draw(ctx, this.m.players[1].name, 420, lay[2] + 4, { color: TEAM[1].l, shadow: PAL.black });
    for (const b of [this.btnW2, this.btnW3].concat(this.btnT, [this.btnN0, this.btnN1])) if (!b.hidden) UI.button(ctx, b);
    Font.drawWrapped(ctx, 'Z każdą rundą rośnie budżet. Przegrany rundy dostaje +40 złota pociechy.', 290, lay[0] + 4, 310, { color: PAL.grey, lh: 10 });
    UI.button(ctx, this.btnBack); UI.button(ctx, this.btnGo);
  }
  drawBotCards(ctx) {
    for (const c of this.cards) {
      const sel = this.level === c.i, B = BOTS[c.i], y = c.y + (sel ? -3 : 0);
      UI.panel(ctx, c.x, y, c.w, c.h, sel ? 'team1' : 'wood');
      if (sel) {
        ctx.fillStyle = Math.floor(this.t * 5) & 1 ? PAL.yellow : PAL.gold;
        ctx.fillRect(c.x - 1, y - 1, c.w + 2, 1); ctx.fillRect(c.x - 1, y + c.h, c.w + 2, 1); ctx.fillRect(c.x - 1, y - 1, 1, c.h + 2); ctx.fillRect(c.x + c.w, y - 1, 1, c.h + 2);
      }
      ctx.fillStyle = PAL.black; ctx.fillRect(c.x + 8, y + 8, 52, 52);
      ctx.fillStyle = ['#3e8948', '#124e89', '#5c1624'][c.i]; ctx.fillRect(c.x + 10, y + 10, 48, 48);
      ctx.save(); ctx.translate(c.x + 10, y + 10 + (sel ? Math.round(Math.sin(this.t * 4)) : 0)); ctx.scale(4, 4); ctx.drawImage(FACES[c.i], 0, 0); ctx.restore();
      Font.draw(ctx, B.name, c.x + 68, y + 12, { color: PAL.white, shadow: PAL.black });
      Font.draw(ctx, B.lvl, c.x + 68, y + 24, { color: [PAL.green, PAL.gold, PAL.red2][c.i], shadow: PAL.black });
      for (let k = 0; k < 3; k++) Font.draw(ctx, '★', c.x + 68 + k * 8, y + 36, { color: k <= c.i ? PAL.gold : PAL.slate });
      Font.draw(ctx, 'Wygrane: ' + Career.wins[c.i], c.x + 68, y + 48, { color: PAL.grey });
      Font.drawWrapped(ctx, B.desc, c.x + 10, y + 70, c.w - 20, { color: PAL.silver, lh: 10 });
      Font.draw(ctx, 'Budżet bota: ' + Math.round(BOT_MULT[c.i] * 100) + '%', c.x + 10, y + c.h - 16, { color: PAL.steel });
    }
  }
  drawPvpInfo(ctx) {
    const R0 = [['STOCZNIA', ''], ['W A S D', 'kursor'], ['Q / E', 'zmiana części'], ['SPACJA', 'postaw'], ['X', 'usuń'], ['R / G', 'lustro / gotowe'],
      ['BITWA', ''], ['W / S', 'żagle'], ['A / D', 'skręt'], ['Q / E', 'salwa lewą / prawą'], ['SPACJA', 'moździerz, dziób']];
    const R1 = [['STOCZNIA', ''], ['←↑→↓', 'kursor'], [', / .', 'zmiana części'], ['/', 'postaw'], ['M', 'usuń'], ['N / ENTER', 'lustro / gotowe'],
      ['BITWA', ''], ['↑ / ↓', 'żagle'], ['← / →', 'skręt'], [', / .', 'salwa lewą / prawą'], ['/', 'moździerz, dziób']];
    for (let i = 0; i < 2; i++) {
      const x = 30 + i * 296, y = 46, T = TEAM[i];
      UI.panel(ctx, x, y, 284, 188, 'team' + i);
      Font.draw(ctx, 'GRACZ ' + (i + 1), x + 10, y + 9, { scale: 2, color: T.l, outline: PAL.black });
      (i ? R1 : R0).forEach((r, k) => {
        const yy = y + 30 + k * 13.5;
        if (!r[1]) { Font.draw(ctx, r[0], x + 10, yy, { color: PAL.gold }); return; }
        UI.keycap(ctx, r[0], x + 14, yy - 2);
        Font.draw(ctx, r[1], x + 100, yy, { color: PAL.silver });
      });
      Font.draw(ctx, 'Pad ' + (i + 1) + ' też działa', x + 274, y + 176, { color: PAL.steel, align: 'right' });
    }
    Font.draw(ctx, 'Mysz działa na tej połowie ekranu, nad którą się znajduje.', W / 2, 237, { align: 'center', color: PAL.grey, shadow: PAL.black });
  }
}
function drawSeaBackdrop(ctx, t) {
  Water.draw(ctx, t);
  ctx.fillStyle = 'rgba(16,14,30,0.55)'; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(UI.vignette, 0, 0);
}

// ---------- ekran VS przed bitwą ----------
class VSScene {
  constructor(m) {
    this.m = m; this.t = 0; this.left = false;
    this.sh = [0, 1].map(i => { const bl = Design.list(m.players[i].cells); return { bl, spr: renderShip(bl, i), st: Design.stats(m.players[i].cells) }; });
    this.weather = WEATHERS[(m.round - 1) % WEATHERS.length];
  }
  enter() { Music.stop(); Music.sting('start'); SFX.play('horn'); Ambience.set(1); }
  update(dt) {
    this.t += dt;
    if ((this.t > 4.4 || (this.t > 1 && (Input.any || Input.mouse.pressed[0]))) && !this.left) {
      this.left = true; const m = this.m; Game.go(() => new BattleScene(m));
    }
    if (this.t > 0.62 && this.t - dt <= 0.62) { SFX.play('explosion'); Shake.add(0.5); }
    Shake.update(dt);
  }
  draw(ctx) {
    const t = this.t;
    Water.draw(ctx, t);
    // ukośny podział
    const k = ease.outCubic(clamp(t / 0.5, 0, 1)), mid = W / 2 + Math.sin(t * 2) * 4;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = TEAM[0].dd; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo((mid + 40) * k, 0); ctx.lineTo((mid - 40) * k, H); ctx.lineTo(0, H); ctx.fill();
    ctx.fillStyle = TEAM[1].dd; ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W - (W - mid - 40) * k, 0); ctx.lineTo(W - (W - mid + 40) * k, H); ctx.lineTo(W, H); ctx.fill();
    ctx.globalAlpha = 1;
    for (let s = 0; s < 8; s++) { // pędzące paski
      const y = (s * 47 + t * 260) % (H + 40) - 20;
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, Math.round(y), W, 2);
    }
    ctx.save(); ctx.translate(Shake.x, Shake.y);
    for (let i = 0; i < 2; i++) {
      const s = this.sh[i], p = ease.outBack(clamp((t - 0.1 - i * 0.12) / 0.55, 0, 1));
      const cx = i === 0 ? lerp(-160, 160, p) : lerp(W + 160, W - 160, p), cy = 150 + Math.round(Math.sin(t * 2 + i) * 2);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(i === 0 ? Math.PI / 2 : -Math.PI / 2); ctx.scale(2, 2);
      ctx.translate(-SW / 2, -SH / 2);
      ctx.globalAlpha = 0.3; ctx.drawImage(s.spr.sil, 2, 3); ctx.globalAlpha = 1;
      ctx.drawImage(s.spr.img, 0, 0);
      drawShipDyn(ctx, s.bl, { t, row: 0.4, rudder: 0 });
      drawSails(ctx, s.bl, { team: i, sail: 3 });
      ctx.restore();
      const P = this.m.players[i], tx = i === 0 ? 160 : W - 160, a = clamp((t - 0.7) / 0.3, 0, 1);
      ctx.globalAlpha = a;
      Font.draw(ctx, P.name, tx, 252, { align: 'center', scale: 2, color: TEAM[i].l, outline: PAL.black });
      Font.draw(ctx, P.captain, tx, 270, { align: 'center', color: PAL.silver, outline: PAL.black });
      const rows = [['Prędkość', s.st.speed / 80, PAL.cyan], ['Siła ognia', s.st.fire / 70, PAL.orange], ['Wytrzymałość', s.st.hp / 1300, PAL.red2]];
      rows.forEach((r, k2) => {
        Font.draw(ctx, r[0], tx - 86, 286 + k2 * 13, { color: PAL.silver, outline: PAL.black });
        UI.bar(ctx, tx - 8, 288 + k2 * 13, 90, 4, r[1] * clamp((t - 0.8) / 0.6, 0, 1), r[2]);
      });
      ctx.globalAlpha = 1;
    }
    if (t > 0.55) {
      const s = t < 0.75 ? ease.outBack((t - 0.55) / 0.2) * 1.2 : 1;
      ctx.save(); ctx.translate(W / 2, 150); ctx.scale(s, s);
      Font.draw(ctx, 'VS', 0, -21, { align: 'center', scale: 6, color: PAL.gold, outline: PAL.black });
      ctx.restore();
      if (t < 0.75) { ctx.fillStyle = 'rgba(255,255,255,' + (1 - (t - 0.55) / 0.2).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H); }
    }
    ctx.restore();
    Font.draw(ctx, 'RUNDA ' + this.m.round + '  ·  ' + WEATHER_NAME[this.weather].toUpperCase(), W / 2, 20, { align: 'center', scale: 2, color: PAL.white, outline: PAL.black });
    if (t > 1.2 && Math.floor(t * 3) & 1) Font.draw(ctx, 'Naciśnij dowolny klawisz', W / 2, 340, { align: 'center', color: PAL.grey, outline: PAL.black });
    ctx.drawImage(UI.vignette, 0, 0);
  }
}

// ---------- bitwa (runda meczu) ----------
class BattleScene {
  constructor(m) {
    this.m = m; this.t = 0; this.paused = false; this.result = null; this.endT = 0; this.focus = 0;
    const pvp = m.mode === 'pvp';
    const ctrls = pvp
      ? [new HumanCtrl(BIND.p1, ['Q', 'E', 'SPC']), new HumanCtrl(BIND.p2, [',', '.', '/'])]
      : [new HumanCtrl(BIND.solo, ['Q', 'E', 'SPC']), new BotCtrl(m.level, m.players[1].arche)];
    this.b = new Battle({
      designs: [m.players[0].cells, m.players[1].cells], names: [m.players[0].name, m.players[1].name], controllers: ctrls,
      weather: WEATHERS[(m.round - 1) % WEATHERS.length], round: m.round, winsNeeded: m.winsNeeded,
      wins: [m.players[0].wins, m.players[1].wins], mode: m.mode, botName: pvp ? null : 'BOT', hints: m.round === 1,
      onEnd: r => this.onEnd(r)
    });
    this.pauseBtns = [
      { x: W / 2 - 70, y: 150, w: 140, h: 18, label: 'WZNÓW', primary: true, act: 'resume' },
      { x: W / 2 - 70, y: 174, w: 140, h: 18, label: 'WYJDŹ DO MENU', act: 'menu' }
    ];
    this.nextBtn = { x: W / 2 - 60, y: 286, w: 120, h: 20, label: 'DALEJ', primary: true };
  }
  enter() { Music.play('battle'); Ambience.set(1.1); }
  exit() { Music.duck = 1; Shake.trauma = 0; }
  onEnd(r) {
    const m = this.m;
    this.result = r; this.endT = 0;
    r.stats.forEach((s, i) => { const T = m.players[i].tot; for (const k in T) T[k] += s[k] || 0; });
    if (r.winner >= 0) {
      m.players[r.winner].wins++;
      m.players[r.winner].bonus = 0; m.players[1 - r.winner].bonus = 40;
      if (m.mode !== 'pvp' && r.winner === 0) Career.sunk++;
    } else { m.players[0].bonus = 20; m.players[1].bonus = 20; }
    saveCareer();
    m.history.push(r.winner);
    this.matchOver = m.players.some(p => p.wins >= m.winsNeeded);
    const humanWon = m.mode === 'pvp' ? r.winner >= 0 : r.winner === 0;
    Music.sting(humanWon ? 'win' : 'lose');
  }
  next() {
    const m = this.m;
    if (this.matchOver) Game.go(() => new MatchEndScene(m));
    else { m.round++; Game.go(() => new BuildScene(m)); }
  }
  update(dt) {
    this.t += dt;
    if (!this.result && (Input.hit('Escape') || (Input.hit('KeyP') && this.m.mode !== 'pvp') || Input.hit('GP0_START') && this.m.mode !== 'pvp')) { this.paused = !this.paused; SFX.play('click'); Ambience.set(this.paused ? 0.4 : 1.1); }
    if (this.paused) {
      const c = navButtons(this.pauseBtns, this);
      if (c && c.act === 'resume') { this.paused = false; Ambience.set(1.1); }
      if (c && c.act === 'menu') Game.go(() => new MenuScene());
      return;
    }
    this.b.update(dt);
    Shake.update(dt);
    if (this.result) {
      this.endT += dt;
      const c = UI.updateButtons([this.nextBtn]);
      if (this.endT > 1.2 && (c || Input.hit('Enter') || Input.hit('Space') || Input.hit('GP0_A') || Input.hit('GP1_A'))) { if (!this.going) { this.going = true; this.next(); } }
    }
  }
  draw(ctx) {
    this.b.draw(ctx);
    if (this.result) this.drawSummary(ctx);
    if (Settings.crt) { }
    if (this.paused) {
      ctx.fillStyle = 'rgba(24,20,37,0.75)'; ctx.fillRect(0, 0, W, H);
      UI.panel(ctx, W / 2 - 100, 100, 200, 106, 'wood');
      Font.draw(ctx, 'PAUZA', W / 2, 114, { align: 'center', scale: 2, color: PAL.gold, shadow: PAL.black });
      Font.draw(ctx, 'Runda ' + this.m.round + ' · ' + WEATHER_NAME[this.b.weather], W / 2, 134, { align: 'center', color: PAL.grey });
      for (const b of this.pauseBtns) UI.button(ctx, b);
    }
  }
  drawSummary(ctx) {
    const r = this.result, m = this.m, k = clamp(this.endT / 0.4, 0, 1);
    ctx.fillStyle = 'rgba(24,20,37,' + (0.6 * k).toFixed(2) + ')'; ctx.fillRect(0, 0, W, H);
    const pw = 360, ph = 214, x = W / 2 - pw / 2, y = 64 + Math.round((1 - ease.outCubic(k)) * 40);
    ctx.globalAlpha = k;
    UI.panel(ctx, x, y, pw, ph, 'wood');
    let title, col;
    if (r.winner < 0) { title = 'REMIS!'; col = PAL.silver; }
    else if (m.mode === 'pvp') { title = 'RUNDA DLA GRACZA ' + (r.winner + 1); col = TEAM[r.winner].l; }
    else { title = r.winner === 0 ? 'RUNDA WYGRANA!' : 'RUNDA PRZEGRANA'; col = r.winner === 0 ? PAL.gold : PAL.salmon; }
    Font.draw(ctx, title, W / 2, y + 12, { align: 'center', scale: 2, color: col, outline: PAL.black });
    const sub = r.winner < 0 ? 'Oba okręty poszły na dno' : (m.players[r.winner].name + ' panuje na morzu');
    Font.draw(ctx, sub, W / 2, y + 32, { align: 'center', color: PAL.silver });
    // wynik
    for (let i = 0; i < 2; i++) for (let q = 0; q < m.winsNeeded; q++) {
      const filled = q < m.players[i].wins, fresh = i === r.winner && q === m.players[i].wins - 1;
      const sx = i === 0 ? W / 2 - 24 - q * 14 : W / 2 + 14 + q * 14;
      const pop = fresh ? 1 + Math.max(0, 0.6 - this.endT) * 2 : 1;
      ctx.save(); ctx.translate(sx + 3, y + 50); ctx.scale(Math.round(pop * 2) / 2, Math.round(pop * 2) / 2);
      Font.draw(ctx, '★', -6, -7, { scale: 2, color: filled ? TEAM[i].c : PAL.slate, outline: PAL.black });
      ctx.restore();
    }
    Font.draw(ctx, ':', W / 2, y + 44, { align: 'center', scale: 2, color: PAL.white });
    // tabela
    const rows = [['Strzały', s => s.shots], ['Trafienia', s => s.hits], ['Celność', s => s.shots ? Math.round(s.hits / s.shots * 100) + '%' : '-'],
      ['Obrażenia', s => Math.round(s.dmg)], ['Zniszczone części', s => s.kills], ['Taranowania', s => s.rams]];
    const ty = y + 72;
    Font.draw(ctx, m.players[0].name, x + 200, ty, { align: 'center', color: TEAM[0].l });
    Font.draw(ctx, m.players[1].name, x + 300, ty, { align: 'center', color: TEAM[1].l });
    rows.forEach((row, i) => {
      const yy = ty + 13 + i * 12;
      if (i & 1) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x + 8, yy - 2, pw - 16, 11); }
      Font.draw(ctx, row[0], x + 14, yy, { color: PAL.silver });
      Font.draw(ctx, String(row[1](r.stats[0])), x + 200, yy, { align: 'center', color: PAL.white });
      Font.draw(ctx, String(row[1](r.stats[1])), x + 300, yy, { align: 'center', color: PAL.white });
    });
    if (r.winner >= 0 && !this.matchOver) Font.draw(ctx, '+40 złota pociechy dla: ' + m.players[1 - r.winner].name, W / 2, y + 160, { align: 'center', color: PAL.gold });
    if (this.matchOver) Font.draw(ctx, 'KONIEC MECZU!', W / 2, y + 160, { align: 'center', color: PAL.yellow, outline: PAL.black });
    this.nextBtn.label = this.matchOver ? 'PODSUMOWANIE' : 'NASTĘPNA RUNDA';
    this.nextBtn.y = y + ph - 32; this.nextBtn.w = 140; this.nextBtn.x = W / 2 - 70;
    if (this.endT > 1.2) UI.button(ctx, this.nextBtn);
    ctx.globalAlpha = 1;
  }
}

// ---------- koniec meczu ----------
class MatchEndScene {
  constructor(m) {
    this.m = m; this.t = 0; this.fx = new Particles(); this.fwT = 0.3; this.focus = 0;
    this.w = m.players[0].wins >= m.winsNeeded ? 0 : 1;
    const bl = Design.list(m.players[this.w].cells);
    this.ship = { bl, spr: renderShip(bl, this.w) };
    this.humanWon = m.mode === 'pvp' || this.w === 0;
    if (m.mode !== 'pvp') { if (this.w === 0) Career.wins[m.level]++; else Career.losses[m.level]++; } else Career.pvp++;
    saveCareer();
    this.btns = [
      { x: W / 2 - 126, y: 318, w: 120, h: 20, label: 'REWANŻ', primary: true, act: 'again' },
      { x: W / 2 + 6, y: 318, w: 120, h: 20, label: 'MENU GŁÓWNE', act: 'menu' }
    ];
    this.navH = true;
  }
  enter() { Music.play(this.humanWon ? 'victory' : 'menu'); Ambience.set(0.7); }
  firework() {
    const x = rand(60, W - 60), y = rand(30, 140), col = pick([PAL.gold, PAL.red2, PAL.cyan, PAL.green, PAL.white, TEAM[this.w].c]);
    for (let i = 0; i < 34; i++) {
      const a = i / 34 * TAU, s = rand(40, 75);
      this.fx.add({ type: 'line', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 1.6, life: rand(0.8, 1.3), cols: [PAL.white, col, col, PAL.slate] });
    }
    this.fx.add({ type: 'disc', x, y, r: 3, grow: 8, life: 0.3, cols: [PAL.white, col] });
    SFX.play('crackle'); SFX.play('mortar');
  }
  update(dt) {
    this.t += dt; this.fx.update(dt, null);
    if (this.humanWon) { this.fwT -= dt; if (this.fwT <= 0) { this.firework(); this.fwT = rand(0.35, 0.9); } }
    if (this.humanWon && chance(dt * 30)) this.fx.add({ type: 'px', x: rand(0, W), y: -4, vx: rand(-15, 15), vy: rand(25, 50), life: 6, cols: [pick([PAL.red2, PAL.gold, PAL.cyan, PAL.green, PAL.white])], size: 2 });
    const c = navButtons(this.btns, this);
    if (c && c.act === 'again') {
      const o = this.m, m = newMatch(o.mode, o.level, o.winsNeeded);
      m.players[0].name = o.players[0].name; m.players[1].name = SHIP_NAMES.random(o.players[0].name);
      if (o.mode === 'pvp') m.players[1].name = o.players[1].name;
      Game.go(() => new BuildScene(m));
    }
    if (c && c.act === 'menu') Game.go(() => new MenuScene());
  }
  draw(ctx) {
    const t = this.t, m = this.m;
    Water.draw(ctx, t);
    // okręt zwycięzcy kręci się po zatoce
    const a = t * 0.35, cx = W / 2 + Math.cos(a) * 150, cy = 210 + Math.sin(a) * 50, ang = a + Math.PI;
    ctx.save(); ctx.translate(cx + 3, cy + 4); ctx.rotate(ang); ctx.globalAlpha = 0.3; ctx.drawImage(this.ship.spr.sil, -SW / 2, -SH / 2); ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.translate(-SW / 2, -SH / 2);
    ctx.drawImage(this.ship.spr.img, 0, 0); drawShipDyn(ctx, this.ship.bl, { t, row: 0.6 }); drawSails(ctx, this.ship.bl, { team: this.w, sail: 3, yaw: 0.2 });
    ctx.restore();
    if (!this.humanWon) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#6a74a0'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
    this.fx.draw(ctx, 'under'); this.fx.draw(ctx, 'over');
    ctx.fillStyle = 'rgba(16,14,30,0.5)'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(UI.vignette, 0, 0);
    let title, col;
    if (m.mode === 'pvp') { title = 'WYGRYWA GRACZ ' + (this.w + 1) + '!'; col = TEAM[this.w].l; }
    else if (this.w === 0) { title = 'ZWYCIĘSTWO!'; col = PAL.gold; }
    else { title = 'PORAŻKA...'; col = PAL.salmon; }
    const s = t < 0.4 ? ease.outBack(t / 0.4) : 1;
    ctx.save(); ctx.translate(W / 2, 40); ctx.scale(s, s);
    Font.draw(ctx, title, 0, -14, { align: 'center', scale: 4, color: col, outline: PAL.black });
    ctx.restore();
    Font.draw(ctx, m.players[this.w].name + ' rządzi falami  ·  ' + m.players[0].wins + ' : ' + m.players[1].wins, W / 2, 66, { align: 'center', color: PAL.white, outline: PAL.black });
    if (m.mode !== 'pvp' && this.w === 1) Font.draw(ctx, BOTS[m.level].name + ': Do zobaczenia na dnie, szczurze lądowy!', W / 2, 80, { align: 'center', color: PAL.silver, outline: PAL.black });
    // tabela meczu
    const x = W / 2 - 170, y = 98, pw = 340;
    UI.panel(ctx, x, y, pw, 128, 'dark');
    Font.draw(ctx, 'STATYSTYKI MECZU', x + 10, y + 7, { color: PAL.gold });
    Font.draw(ctx, m.players[0].name, x + 200, y + 7, { align: 'center', color: TEAM[0].l });
    Font.draw(ctx, m.players[1].name, x + 290, y + 7, { align: 'center', color: TEAM[1].l });
    const rows = [['Strzały', s2 => s2.shots], ['Trafienia', s2 => s2.hits], ['Celność', s2 => s2.shots ? Math.round(s2.hits / s2.shots * 100) + '%' : '-'],
      ['Zadane obrażenia', s2 => Math.round(s2.dmg)], ['Zniszczone części', s2 => s2.kills], ['Taranowania', s2 => s2.rams], ['Wygrane rundy', (s2, i) => m.players[i].wins]];
    rows.forEach((r, i) => {
      const yy = y + 22 + i * 14;
      if (i & 1) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 4, yy - 3, pw - 8, 13); }
      Font.draw(ctx, r[0], x + 10, yy, { color: PAL.silver });
      Font.draw(ctx, String(r[1](m.players[0].tot, 0)), x + 200, yy, { align: 'center', color: PAL.white });
      Font.draw(ctx, String(r[1](m.players[1].tot, 1)), x + 290, yy, { align: 'center', color: PAL.white });
    });
    for (const b of this.btns) UI.button(ctx, b);
  }
}

// ---------- jak grać ----------
class HowToScene {
  constructor() {
    this.t = 0; this.page = 0; this.pages = ['STOCZNIA', 'CZĘŚCI', 'BITWA', 'STEROWANIE'];
    this.btnPrev = { x: 20, y: 330, w: 90, h: 18, label: 'WSTECZ' };
    this.btnNext = { x: W - 110, y: 330, w: 90, h: 18, label: 'DALEJ', primary: true };
    const a = AIBuild.fromRows(TEMPLATES.bryg.rows); this.demo = Design.list(a); this.demoSpr = renderShip(this.demo, 0);
  }
  enter() { Music.play('menu'); }
  update(dt) {
    this.t += dt;
    const c = UI.updateButtons([this.btnPrev, this.btnNext]);
    if (c === this.btnPrev || Act.hit(BIND.menu, 'left') || Input.hit('Escape')) { if (this.page === 0 || Input.hit('Escape')) { Game.go(() => new MenuScene()); return; } this.page--; SFX.play('click'); }
    if (c === this.btnNext || Act.hit(BIND.menu, 'right') || Input.hit('Enter') || Input.hit('Space')) { if (this.page === this.pages.length - 1) { Game.go(() => new MenuScene()); return; } this.page++; SFX.play('click'); }
    this.btnNext.label = this.page === this.pages.length - 1 ? 'GOTOWE' : 'DALEJ';
    this.btnPrev.label = this.page === 0 ? 'MENU' : 'WSTECZ';
  }
  bullets(ctx, list, x, y, w) {
    let yy = y;
    for (const l of list) {
      ctx.fillStyle = PAL.gold; ctx.fillRect(x, yy + 2, 3, 3);
      yy += Font.drawWrapped(ctx, l, x + 8, yy, w - 8, { color: PAL.silver, lh: 10 }) + 5;
    }
  }
  draw(ctx) {
    const t = this.t;
    drawSeaBackdrop(ctx, t);
    Font.draw(ctx, 'JAK GRAĆ', W / 2, 10, { align: 'center', scale: 2, color: PAL.gold, outline: PAL.black });
    this.pages.forEach((p, i) => {
      const x = W / 2 - 160 + i * 80;
      Font.draw(ctx, (i + 1) + '. ' + p, x + 40, 32, { align: 'center', color: i === this.page ? PAL.white : PAL.steel, shadow: PAL.black });
      if (i === this.page) { ctx.fillStyle = PAL.gold; ctx.fillRect(x + 12, 42, 56, 1); }
    });
    UI.panel(ctx, 20, 50, 600, 272, 'wood');
    const P = this.page;
    if (P === 0) {
      ctx.save(); ctx.translate(60, 70); ctx.scale(2, 2); ctx.drawImage(this.demoSpr.img, 0, 0); drawShipDyn(ctx, this.demo, { t, row: 0.3 }); ctx.globalAlpha = 0.6; drawSails(ctx, this.demo, { team: 0, sail: 2 }); ctx.restore();
      Font.draw(ctx, 'MINUTA NA BUDOWĘ', 260, 64, { scale: 2, color: PAL.gold, shadow: PAL.black });
      this.bullets(ctx, [
        'Masz 60 sekund i sakiewkę złota. Dobudowuj części do kajuty kapitana - wszystko musi się ze sobą łączyć.',
        'LPM stawia część (przeciągnij, aby malować), PPM usuwa ją i oddaje całe złoto. Najechanie na pole od razu pokazuje zmianę statystyk.',
        'LUSTRO stawia części parami po obu burtach. Oszczędza czas i daje ładne okręty.',
        'Zielone narożniki pokazują, gdzie część pasuje. Czerwony wykrzyknik to część zasłonięta przez inne.',
        'Ciężki okręt zwalnia. Pilnuj ŁADOWNOŚCI - poszycie trzyma okręt na wodzie.',
        'W kolejnych rundach Twój okręt czeka w doku, a budżet rośnie. Przegrany dostaje pociechę.'
      ], 260, 86, 340);
    } else if (P === 1) {
      PART_ORDER.forEach((p, i) => {
        const col = i % 2, row = (i / 2) | 0, x = 34 + col * 296, y = 62 + row * 50, Pp = PARTS[p];
        ctx.save(); ctx.translate(x, y); ctx.scale(2, 2); ctx.drawImage(PartIcons.get(p, 0), 0, 0); ctx.restore();
        Font.draw(ctx, Pp.name.toUpperCase(), x + 38, y + 3, { color: PAL.white, shadow: PAL.black });
        ctx.drawImage(Icons.coin, x + 38 + Font.measure(Pp.name.toUpperCase()) + 6, y + 3);
        Font.draw(ctx, String(Pp.cost), x + 38 + Font.measure(Pp.name.toUpperCase()) + 14, y + 3, { color: PAL.gold });
        Font.drawWrapped(ctx, Pp.desc, x + 38, y + 14, 240, { color: PAL.silver, lh: 9 });
      });
    } else if (P === 2) {
      Font.draw(ctx, 'NA PEŁNE MORZE', 40, 64, { scale: 2, color: PAL.gold, shadow: PAL.black });
      this.bullets(ctx, [
        'Zniszcz KAJUTĘ KAPITANA rywala (serce na pasku), a jego okręt pójdzie na dno. Pancerz i poszycie wokół kajuty ją chronią.',
        'Kule wybijają pojedyncze deski - zobaczysz drzazgi i dziury. Odcięte części odpadają i toną.',
        'Żagle płyną najszybciej z wiatrem. Kompas u góry pokazuje, dokąd wieje.',
        'Ustaw się burtą do rywala i odpal salwę. Pasek pod nazwą pokazuje stan dział: złote są naładowane.',
        'Trafione deski mogą zapłonąć. Cieśla gasi pożary i naprawia sąsiednie części.',
        'Prochownia przyspiesza działa, ale wybucha po trafieniu - nie stawiaj jej przy kajucie!',
        'Pływające skrzynie: czerwony krzyż - naprawa, beczka - szybkie ładowanie, żagiel - pomyślny wiatr.',
        'Po 95 sekundach budzi się WIR, który ściąga okręty do środka morza.'
      ], 40, 86, 560);
    } else {
      Font.draw(ctx, 'STEROWANIE', 40, 64, { scale: 2, color: PAL.gold, shadow: PAL.black });
      const rows = [['', 'GRA Z BOTEM / GRACZ 1', 'GRACZ 2'], ['Żagle', 'W / S', '↑ / ↓'], ['Skręt', 'A / D', '← / →'], ['Lewa burta', 'Q', ','], ['Prawa burta', 'E', '.'],
        ['Moździerz, dziób', 'SPACJA', '/'], ['Pauza', 'ESC', 'ESC']];
      rows.forEach((r, i) => {
        const y = 92 + i * 18;
        if (!i) { Font.draw(ctx, r[1], 240, y, { color: TEAM[0].l, align: 'center' }); Font.draw(ctx, r[2], 440, y, { color: TEAM[1].l, align: 'center' }); return; }
        Font.draw(ctx, r[0], 60, y + 2, { color: PAL.silver });
        const w1 = Font.measure(r[1]) + 5, w2 = Font.measure(r[2]) + 5;
        UI.keycap(ctx, r[1], 240 - w1 / 2, y); UI.keycap(ctx, r[2], 440 - w2 / 2, y);
      });
      this.bullets(ctx, ['Pad: lewa gałka / krzyżak - ster i żagle, LB/RB - burty, A - moździerz, START - pauza. Drugi pad steruje Graczem 2.',
        'W stoczni: mysz albo kursor z klawiatury. Cyfry 1-0 wybierają część, kółko myszy przewija listę.'], 60, 232, 520);
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
      { label: 'Czas budowy', get: () => Settings.buildTime + ' s', adj: d => { const o = [45, 60, 90]; let i = o.indexOf(Settings.buildTime); i = clamp(i + (d || 1), 0, 2); if (!d && i === 2 && Settings.buildTime === 90) i = 0; Settings.buildTime = o[i]; } },
      { label: 'Pełny ekran', get: () => document.fullscreenElement ? 'TAK' : 'NIE', adj: () => Screen.toggleFullscreen() }
    ];
    this.btnBack = { x: W / 2 - 60, y: 300, w: 120, h: 20, label: 'WSTECZ', primary: true };
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
    if (c || Input.hit('Escape')) Game.go(() => new MenuScene());
  }
  draw(ctx) {
    drawSeaBackdrop(ctx, this.t);
    ctx.save(); ctx.translate(Shake.x, Shake.y);
    Font.draw(ctx, 'USTAWIENIA', W / 2, 30, { align: 'center', scale: 2, color: PAL.gold, outline: PAL.black });
    UI.panel(ctx, 130, 70, 380, 200, 'wood');
    this.rows.forEach((r, i) => {
      const y = 90 + i * 30, on = i === this.sel;
      if (on) { ctx.fillStyle = 'rgba(254,174,52,0.12)'; ctx.fillRect(138, y - 5, 364, 20); }
      Font.draw(ctx, r.label, 150, y, { color: on ? PAL.white : PAL.silver, shadow: PAL.black });
      Font.draw(ctx, '<', 380, y, { color: on ? PAL.gold : PAL.steel });
      Font.draw(ctx, r.get(), 440, y, { align: 'center', color: on ? PAL.yellow : PAL.white, shadow: PAL.black });
      Font.draw(ctx, '>', 496, y, { color: on ? PAL.gold : PAL.steel });
    });
    UI.button(ctx, this.btnBack);
    Font.draw(ctx, 'Strzałki / mysz zmieniają wartości. Ustawienia zapisują się same.', W / 2, 336, { align: 'center', color: PAL.grey, shadow: PAL.black });
    ctx.restore();
  }
}
