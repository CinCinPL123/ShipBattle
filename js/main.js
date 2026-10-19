'use strict';
/* =========================================================
   Start gry: ładowanie, pętla główna, kursor
   ========================================================= */
const LOAD_QUIPS = ['Strugamy deski...', 'Smołujemy kadłuby...', 'Ładujemy armaty...', 'Szyjemy żagle...', 'Przekupujemy mewy...', 'Szukamy kapitana...', 'Wiążemy węzły...'];
class LoadScene {
  constructor() { this.t = 0; this.k = 0; this.done = false; this.q = 0; }
  update(dt) {
    this.t += dt;
    if (!this.done) {
      const t0 = performance.now();
      while (this.k < Water.N && performance.now() - t0 < 28) { Water.frames.push(Water.genFrame(this.k)); this.k++; }
      if (this.k >= Water.N) { this.done = true; finishInit(); }
    }
    this.q = Math.floor(this.t * 1.6) % LOAD_QUIPS.length;
    if (this.done && this.t > 0.6 && (Input.any || Input.mouse.pressed[0])) { SFX.unlock(); SFX.play('click'); Game.go(() => new MenuScene()); }
  }
  draw(ctx) {
    ctx.fillStyle = PAL.black; ctx.fillRect(0, 0, W, H);
    if (this.k > 0) { ctx.globalAlpha = 0.35 * Math.min(1, this.t); ctx.drawImage(Water.frames[Math.floor(this.t * Water.fps) % this.k], 0, 0); ctx.globalAlpha = 1; }
    const bob = Math.round(Math.sin(this.t * 1.6) * 2);
    ctx.drawImage(LOGO, Math.round(W / 2 - LOGO.width / 2), 104 + bob);
    Font.draw(ctx, 'ZBUDUJ  ·  WYPŁYŃ  ·  ZATOP', W / 2, 174, { align: 'center', color: PAL.gold, outline: PAL.black });
    if (!this.done) {
      const f = this.k / Water.N;
      UI.bar(ctx, W / 2 - 80, 214, 160, 4, f, PAL.gold);
      Font.draw(ctx, LOAD_QUIPS[this.q], W / 2, 226, { align: 'center', color: PAL.grey });
    } else if (Math.floor(this.t * 2.5) & 1) {
      Font.draw(ctx, 'KLIKNIJ ALBO NACIŚNIJ KLAWISZ', W / 2, 218, { align: 'center', scale: 1, color: PAL.white, outline: PAL.black });
    }
    Font.draw(ctx, 'Najlepiej z dźwiękiem', W / 2, 330, { align: 'center', color: PAL.steel });
    if (('ontouchstart' in window) && !matchMedia('(pointer: fine)').matches)
      Font.draw(ctx, 'Bitwa wymaga klawiatury albo pada - najlepiej grać na komputerze', W / 2, 342, { align: 'center', color: PAL.salmon });
  }
}
let inited = false;
function finishInit() {
  if (inited) return; inited = true;
  buildBattleArt(); buildFaces();
}
function drawCursor(ctx) {
  const m = Input.mouse;
  if (!m.active || Input.lastDevice !== 'mouse') return;
  const sc = Game.scene;
  if (sc instanceof BattleScene && !sc.paused && !sc.result) return;
  let icon = Icons.cursor, ox = 0, oy = 0;
  if (sc instanceof BuildScene && !sc.done && !sc.paused && sc.builders.some(b => b.overGrid)) { icon = Icons.hammer; ox = -1; oy = -1; }
  ctx.drawImage(icon, Math.round(m.x) + ox, Math.round(m.y) + oy);
}
let lastT = 0, errShown = false;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
  try {
    Input.pollPads();
    Game.update(dt);
    Screen.begin();
    Game.draw(Screen.ctx);
    drawCursor(Screen.ctx);
    if (Settings.crt) Screen.drawCRT();
  } catch (e) {
    if (!errShown) { errShown = true; console.error(e); }
  }
  Input.endFrame();
  requestAnimationFrame(frame);
}
function boot() {
  Screen.init();
  Input.init(Screen.canvas);
  buildIcons(); UI.buildVignette(); buildLogo();
  Water.init();
  Game.set(new LoadScene());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Game.scene instanceof BattleScene && !Game.scene.result) Game.scene.paused = true;
    if (document.hidden && Game.scene instanceof BuildScene) Game.scene.paused = true;
  });
  Screen.canvas.focus();
  requestAnimationFrame(t => { lastT = t; frame(t); });
}
window.addEventListener('load', boot);
