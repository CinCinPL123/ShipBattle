'use strict';
/* =========================================================
   Start gry: pętla główna i kursor
   ========================================================= */
function drawCursor(ctx) {
  const m = Input.mouse;
  if (!m.active || Input.lastDevice !== 'mouse') return;
  const sc = Game.scene;
  if (sc instanceof PlayScene && !sc.cursor()) return;
  let icon = Icons.cursor, ox = 0, oy = 0;
  if (sc instanceof PlayScene && sc.yard && sc.yard.hover) { icon = Icons.hammer; ox = -1; oy = -1; }
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
  buildIcons(); buildLogo();
  Game.set(new LoadScene());
  Screen.canvas.focus();
  requestAnimationFrame(t => { lastT = t; frame(t); });
}
window.addEventListener('load', boot);
