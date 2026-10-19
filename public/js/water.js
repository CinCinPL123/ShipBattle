'use strict';
/* =========================================================
   Morze: kafelki bez szwów zakotwiczone w świecie.
   Zamiast podmieniać całe klatki (co migało), grzbiety fal
   i piana to osobne warstwy, które powoli płyną w różne
   strony, a piana przenika się miękko między dwoma wzorami.
   ========================================================= */
const Water = {
  BT: 512, T: 256, base: null, crest: null, foamA: null, foamB: null, glint: null,
  tones: ['#0b2c56', '#0f3e72', '#124e89', '#17609f', '#1d74b4'],
  crestCol: '#3a98d4', foamCol: '#b8e4ff',
  init() {
    this.base = this.genBase();
    this.crest = this.genLines(0, 0.018, this.crestCol, 0.92, true);
    this.foamA = this.genLines(5, 0.0065, this.foamCol, 1, false);
    this.foamB = this.genLines(9, 0.0065, '#eaf7ff', 1, false);
  },
  genBase() {
    const T = this.BT, [c, x] = makeCanvas(T, T), img = x.createImageData(T, T), d = img.data;
    const tones = this.tones.map(hexRgb);
    for (let py = 0, i = 0; py < T; py++) for (let px = 0; px < T; px++, i++) {
      const dep = Noise.pfbm(px / 128, py / 128, 4, 3, 1);
      const fine = Noise.pfbm(px / 32, py / 32, 16, 2, 4);
      const v = 0.5 + (dep - 0.5) * 0.85 + (fine - 0.5) * 0.3 + (bayer(px, py) - 0.5) * 0.085;
      const idx = clamp(Math.floor((v - 0.3) / 0.4 * 5), 0, 4), col = tones[idx], o = i * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  },
  // cienkie, kręte linie tam, gdzie dwa pola szumu prawie się równają
  genLines(seed, thr, hex, alpha, all) {
    const T = this.T, [c, x] = makeCanvas(T, T), img = x.createImageData(T, T), d = img.data, col = hexRgb(hex);
    for (let py = 0, i = 0; py < T; py++) for (let px = 0; px < T; px++, i++) {
      const n1 = Noise.pv(px * 11 / T, py * 21 / T, 11, seed, 21);
      const n2 = Noise.pv(px * 15 / T + 40, py * 12 / T + 17, 15, seed + 3, 12);
      const rd = Math.abs(n1 - n2);
      if (rd < thr && (all || n1 > 0.42)) {
        const o = i * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.round(255 * alpha * (rd < thr * 0.5 ? 1 : 0.65));
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  },
  // fine = przesunięcie co piksel ekranu, a nie co piksel gry - fale płyną gładko
  tile(ctx, img, ox, oy, fine) {
    const T = img.width, r = v => fine ? Math.round(v * Screen.scale) / Screen.scale : Math.round(v);
    const sx = -(((r(ox) % T) + T) % T), sy = -(((r(oy) % T) + T) % T);
    for (let y = sy; y < H; y += T) for (let x = sx; x < W; x += T) ctx.drawImage(img, x, y);
  },
  // vx, vy - lewy górny róg widoku w świecie
  draw(ctx, vx, vy, t) {
    if (!this.base) return;
    this.tile(ctx, this.base, vx, vy);
    this.tile(ctx, this.crest, vx - t * 4.2, vy - t * 1.6, true);
    const k = 0.5 + 0.5 * Math.sin(t * 0.45);
    ctx.globalAlpha = 0.25 + 0.75 * k; this.tile(ctx, this.foamA, vx + t * 2.6, vy - t * 3.4, true);
    ctx.globalAlpha = 0.25 + 0.75 * (1 - k); this.tile(ctx, this.foamB, vx - t * 3.1, vy + t * 2.2, true);
    ctx.globalAlpha = 1;
  }
};
