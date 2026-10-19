'use strict';
/* =========================================================
   Grafika: płótna pomocnicze, morze, wyspy, cząsteczki, UI
   ========================================================= */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  return [c, x];
}
function pline(ctx, x0, y0, x1, y1, col, w) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = col; w = w || 1;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  while (n++ < 400) {
    ctx.fillRect(x0, y0, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
// sprite z mapy znaków
function fromMap(rows, colors) {
  const h = rows.length, w = rows[0].length;
  const [c, x] = makeCanvas(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = rows[j][i];
    if (ch !== '.' && colors[ch]) { x.fillStyle = colors[ch]; x.fillRect(i, j, 1, 1); }
  }
  return c;
}
// pikselowe koła i okręgi (z pamięcią podręczną)
const Disc = {
  cache: new Map(),
  get(r, col) {
    r = Math.max(0, Math.round(r));
    const key = r + col;
    let c = this.cache.get(key);
    if (c) return c;
    const s = r * 2 + 1;
    const [cc, x] = makeCanvas(s, s);
    x.fillStyle = col;
    for (let j = 0; j < s; j++) {
      const dy = j - r;
      const hw = Math.floor(Math.sqrt(Math.max(0, r * r + r * 0.8 - dy * dy)));
      x.fillRect(r - hw, j, hw * 2 + 1, 1);
    }
    if (this.cache.size > 600) this.cache.clear();
    this.cache.set(key, cc);
    return cc;
  }
};
function drawDisc(ctx, x, y, r, col) {
  const d = Disc.get(r, col), rr = (d.width - 1) / 2;
  ctx.drawImage(d, Math.round(x) - rr, Math.round(y) - rr);
}
const Ring = {
  cache: new Map(),
  get(r, col) {
    r = Math.max(1, Math.round(r));
    const key = r + col;
    let c = this.cache.get(key);
    if (c) return c;
    const s = r * 2 + 1;
    const [cc, x] = makeCanvas(s, s);
    x.fillStyle = col;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const d = Math.sqrt((i - r) * (i - r) + (j - r) * (j - r));
      if (Math.abs(d - r + 0.3) < 0.62) x.fillRect(i, j, 1, 1);
    }
    if (this.cache.size > 300) this.cache.clear();
    this.cache.set(key, cc);
    return cc;
  }
};
function drawRing(ctx, x, y, r, col) {
  const d = Ring.get(r, col), rr = (d.width - 1) / 2;
  ctx.drawImage(d, Math.round(x) - rr, Math.round(y) - rr);
}
// zabarwienie obrazka jednym kolorem
function tintSprite(src, col, alpha) {
  const [c, x] = makeCanvas(src.width, src.height);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-atop';
  x.globalAlpha = alpha === undefined ? 1 : alpha;
  x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---------- ikony ----------
const Icons = {};
function buildIcons() {
  const C = { k: PAL.woodDD, g: PAL.gold, y: PAL.yellow, w: PAL.white, o: PAL.orange, d: PAL.woodD, b: PAL.wood, l: PAL.woodL,
    s: PAL.steel, S: PAL.silver, n: PAL.navy, r: PAL.red2, R: PAL.red, x: PAL.black, G: PAL.green, D: PAL.greenD, c: PAL.cyan, B: PAL.blue2, e: PAL.grey };
  Icons.coin = fromMap(['.kkkk.', 'kggyyk', 'kgyywk', 'kggggk', 'kogggk', '.kkkk.'], C);
  Icons.coinBig = fromMap(['..kkkk..', '.kggyyk.', 'kggyywyk', 'kgggyygk', 'kogggggk', 'kooggggk', '.kooogk.', '..kkkk..'], C);
  Icons.heart = fromMap(['.xx.xx.', 'xrrxRrx', 'xrwrrRx', 'xrrrrRx', '.xrrRx.', '..xRx..', '...x...'], C);
  Icons.skull = fromMap(['.xxxxx.', 'xSSSSSx', 'xSxSxSx', 'xSxSxSx', 'xSSxSSx', '.xSSSx.', '.xSxSx.', '..xxx..'], C);
  Icons.anchor = fromMap(['..xxx..', '..xex..', '..xxx..', 'xxxexxx', '...e...', 'x..e..x', 'ex.e.xe', '.eeeee.'], C);
  Icons.crateRepair = fromMap(['xxxxxxxx', 'xbbbbbbx', 'xblrrlbx', 'xbrrrrbx', 'xbrrrrbx', 'xblrrlbx', 'xbbbbbbx', 'xxxxxxxx'], C);
  Icons.cratePowder = fromMap(['..xxxx..', '.xddddx.', 'xdsssssx', 'xdxrrxdx', 'xdxrrxdx', 'xdsssssx', '.xddddx.', '..xxxx..'], C);
  Icons.crateWind = fromMap(['....x...', '...xlx..', '..xlllx.', '.xlllllx', 'xllllllx', '....d...', '....d...', 'dddddddd'], Object.assign({}, C, { l: PAL.sand }));
  Icons.lightning = fromMap(['..y', '.y.', 'yyy', '.y.', 'y..'], C);
  Icons.flagR = fromMap(['xrrrr.', 'xrrrrr', 'xRrrr.', 'x.....', 'x.....'], C);
  Icons.flagB = fromMap(['xBBBB.', 'xBBBBB', 'xcBBB.', 'x.....', 'x.....'], C);
  Icons.cursor = fromMap([
    'x.........', 'xx........', 'xwx.......', 'xwwx......', 'xwwwx.....', 'xwwwwx....', 'xwwwwwx...', 'xwwwwwwx..',
    'xwwwwxxxx.', 'xwwxwx....', 'xwx.xwx...', 'xx..xwx...', '.....xx...'], C);
  Icons.hammer = fromMap([
    '.xxxx.....', 'xeSSSx....', 'xeSSSSx...', '.xxeSSSx..', '...xxSx...', '....xdx...', '.....xdx..', '......xdx.', '.......xdx', '........xx'], C);
  Icons.medal = fromMap(['.rr.rr.', '..rRr..', '..xxx..', '.xgyyx.', 'xgyywgx', 'xggyggx', '.xgggx.', '..xxx..'], C);
}

// ---------- morze ----------
const Water = {
  frames: [], N: 14, fps: 7, depth: null,
  tones: ['#0b2c56', '#0f3e72', '#124e89', '#17609f', '#1d74b4'],
  crest: '#3a98d4', foam: '#b8e4ff',
  init() {
    this.depth = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.depth[y * W + x] = Noise.fbm(x * 0.0065 + 11, y * 0.0095 + 5, 3);
  },
  genFrame(k) {
    const [c, x] = makeCanvas(W, H);
    const img = x.createImageData(W, H), d = img.data;
    const t = k / this.N * TAU, ca = Math.cos(t), sa = Math.sin(t);
    const tones = this.tones.map(hexRgb), crest = hexRgb(this.crest), foam = hexRgb(this.foam);
    let i = 0;
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++, i++) {
        const dep = this.depth[i];
        const n1 = Noise.v(px * 0.042 + ca * 1.7, py * 0.082 + sa * 1.7);
        const n2 = Noise.v(px * 0.058 - sa * 1.4 + 40, py * 0.047 + ca * 1.4 + 17);
        const v = dep * 0.6 + (n1 + n2) * 0.2 + (bayer(px, py) - 0.5) * 0.085;
        let idx = Math.floor((v - 0.3) / 0.4 * 5);
        idx = idx < 0 ? 0 : idx > 4 ? 4 : idx;
        let col = tones[idx];
        const rd = Math.abs(n1 - n2);
        if (rd < 0.016 && v > 0.42) col = crest;
        if (rd < 0.005 && n1 > 0.58) col = foam;
        if (hash2(px * 7 + k, py * 13) > 0.9993) col = foam;
        const o = i * 4;
        d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  },
  frame(t) { return this.frames[Math.floor(t * this.fps) % this.frames.length]; },
  draw(ctx, t) { ctx.drawImage(this.frame(t), 0, 0); }
};

// ---------- wyspy ----------
function makeIsland(seed, r, kind) {
  const rng = mulberry32(seed);
  const M = 10, S = Math.ceil((r + M) * 2 + 1);
  const [c, x] = makeCanvas(S, S);
  const cx = S / 2, cy = S / 2;
  const p1 = rng() * TAU, p2 = rng() * TAU, p3 = rng() * TAU;
  const rr = a => r * (1 + 0.12 * Math.sin(a * 3 + p1) + 0.07 * Math.sin(a * 5 + p2) + 0.04 * Math.sin(a * 8 + p3));
  const img = x.createImageData(S, S), d = img.data;
  const set = (i, j, hex, al) => { const col = hexRgb(hex), o = (j * S + i) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = al === undefined ? 255 : al; };
  const foam = [];
  const shallow = Math.max(4, r * 0.35);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy, dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const a = Math.atan2(dy, dx), R = rr(a), q = dist / R;
    const lit = -(dx + dy) / (dist * 1.414);
    const bz = bayer(i, j), nz = Noise.v(i * 0.35 + seed, j * 0.35);
    if (q < 1) {
      if (kind === 'rock') {
        const h = 1 - q + lit * 0.25 + (nz - 0.5) * 0.3;
        set(i, j, q > 0.86 ? PAL.slate : h > 0.55 ? PAL.silver : h > 0.32 ? PAL.grey : h > 0.15 ? PAL.steel : PAL.slate);
      } else {
        const gr = kind === 'palm' ? 0.66 + (nz - 0.5) * 0.18 : -1;
        if (q < gr) {
          const gh = lit * 0.4 + (nz - 0.5) * 0.6 + (bz - 0.5) * 0.35;
          set(i, j, q > gr - 0.07 ? PAL.greenDD : gh > 0.15 ? PAL.green : gh > -0.25 ? PAL.greenD : PAL.greenDD);
        } else if (q > 0.9) set(i, j, (bz > 0.5) ? PAL.skinD : PAL.woodL);
        else {
          const sh = lit * 0.5 + (nz - 0.5) * 0.4 + (bz - 0.5) * 0.3;
          set(i, j, sh > 0.05 ? PAL.sand : sh > -0.35 ? PAL.woodL : PAL.skinD);
        }
      }
    } else if (dist < R + shallow) {
      const k = (dist - R) / shallow;
      if (bz > k * 1.05) set(i, j, k < 0.35 ? '#2d8fca' : '#1f7ab9');
      if (dist < R + 2.2) foam.push([i, j, rng() * TAU]);
    }
  }
  x.putImageData(img, 0, 0);
  // dekoracje
  const deco = (n, f) => { for (let k = 0; k < n; k++) f(); };
  if (kind === 'palm') {
    const np = Math.max(1, Math.round(r / 9));
    deco(np, () => {
      const a = rng() * TAU, dd = rng() * r * 0.4;
      drawPalm(x, cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, rng);
    });
  }
  if (kind === 'sand') {
    deco(3, () => { const a = rng() * TAU, dd = rng() * r * 0.6; x.fillStyle = PAL.white; x.fillRect(Math.round(cx + Math.cos(a) * dd), Math.round(cy + Math.sin(a) * dd), 1, 1); });
    if (rng() < 0.6) { // skrzynia ze skarbem
      const tx = Math.round(cx - 2 + (rng() - 0.5) * r * 0.5), ty = Math.round(cy - 2 + (rng() - 0.5) * r * 0.5);
      x.fillStyle = PAL.woodDD; x.fillRect(tx - 1, ty + 1, 6, 4);
      x.fillStyle = PAL.woodD; x.fillRect(tx, ty, 4, 3); x.fillStyle = PAL.gold; x.fillRect(tx + 1, ty + 1, 2, 1);
    } else { // znak X
      const tx = Math.round(cx), ty = Math.round(cy);
      x.fillStyle = PAL.red;
      for (let k = -2; k <= 2; k++) { x.fillRect(tx + k, ty + k, 1, 1); x.fillRect(tx + k, ty - k, 1, 1); }
    }
  }
  if (kind === 'rock') {
    deco(3, () => {
      const a = rng() * TAU, dd = r + 2 + rng() * 3, br = 1 + Math.floor(rng() * 2);
      const bx = cx + Math.cos(a) * dd, by = cy + Math.sin(a) * dd;
      x.drawImage(Disc.get(br, PAL.slate), Math.round(bx) - br, Math.round(by) - br);
      x.fillStyle = PAL.grey; x.fillRect(Math.round(bx) - br + 1, Math.round(by) - br + 1, 1, 1);
    });
  }
  return { canvas: c, S, r, kind, foam, x: 0, y: 0 };
}
function drawPalm(x, px, py, rng) {
  px = Math.round(px); py = Math.round(py);
  const fr = 5 + Math.floor(rng() * 3), L = 6 + Math.floor(rng() * 3), a0 = rng() * TAU;
  // cień korony
  x.fillStyle = 'rgba(24,20,37,0.35)';
  for (let k = 0; k < fr; k++) {
    const a = a0 + k / fr * TAU;
    for (let s = 1; s <= L; s++) x.fillRect(Math.round(px + 3 + Math.cos(a) * s), Math.round(py + 3 + Math.sin(a) * s), 1, 1);
  }
  for (let k = 0; k < fr; k++) {
    const a = a0 + k / fr * TAU + (rng() - 0.5) * 0.3;
    for (let s = 1; s <= L; s++) {
      const fx = px + Math.cos(a) * s, fy = py + Math.sin(a) * s + (s * s) * 0.04;
      x.fillStyle = s > L - 2 ? PAL.greenD : PAL.green; x.fillRect(Math.round(fx), Math.round(fy), 1, 1);
      if (s > 1 && s < L - 1 && (s & 1)) {
        x.fillStyle = PAL.greenD;
        x.fillRect(Math.round(fx - Math.sin(a)), Math.round(fy + Math.cos(a)), 1, 1);
        x.fillRect(Math.round(fx + Math.sin(a)), Math.round(fy - Math.cos(a)), 1, 1);
      }
    }
  }
  x.fillStyle = PAL.woodD; x.fillRect(px - 1, py, 1, 1); x.fillRect(px + 1, py, 1, 1); x.fillRect(px, py + 1, 1, 1);
  x.fillStyle = PAL.yellow; x.fillRect(px, py, 1, 1);
}
function drawIslandFoam(ctx, isl, t) {
  ctx.fillStyle = 'rgba(220,244,255,0.85)';
  const ox = Math.round(isl.x - isl.S / 2), oy = Math.round(isl.y - isl.S / 2);
  for (const f of isl.foam) if (Math.sin(t * 2.3 + f[2]) > 0.15) ctx.fillRect(ox + f[0], oy + f[1], 1, 1);
}

// ---------- cząsteczki ----------
const P_DEF = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, t: 0, life: 1, type: 'px', layer: 'over', size: 1, wind: 0, grow: 0, r: 1, rot: 0, vr: 0, onLand: null };
class Particles {
  constructor() { this.a = []; }
  add(o) { const p = Object.assign({}, P_DEF, o); if (!p.cols) p.cols = [PAL.white]; this.a.push(p); return p; }
  clear() { this.a.length = 0; }
  update(dt, wind) {
    const wx = wind ? wind.x : 0, wy = wind ? wind.y : 0, A = this.a;
    for (let i = A.length - 1; i >= 0; i--) {
      const p = A[i];
      p.t += dt;
      if (p.t >= p.life) { A[i] = A[A.length - 1]; A.pop(); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += (p.vx + wx * p.wind) * dt; p.y += (p.vy + wy * p.wind) * dt;
      if (p.g || p.vz) {
        p.vz -= p.g * dt; p.z += p.vz * dt;
        if (p.z <= 0 && p.vz < 0) { p.z = 0; this.land(p); }
      }
      if (p.vr) p.rot += p.vr * dt;
      if (p.floating) { p.x += Math.sin(p.t * 2 + p.rot) * 0.02; }
    }
  }
  land(p) {
    if (p.onLand === 'float') {
      p.vz = 0; p.g = 0; p.vx *= 0.12; p.vy *= 0.12; p.vr *= 0.1; p.layer = 'under'; p.floating = true;
      p.life = p.t + rand(2.5, 5);
      if (chance(0.25)) this.add({ type: 'ring', layer: 'under', x: p.x, y: p.y, r: 1, grow: 5, life: 0.4, cols: ['#b8e4ff'] });
    } else if (p.onLand === 'splash') {
      p.life = p.t;
      this.add({ type: 'ring', layer: 'under', x: p.x, y: p.y, r: 1, grow: 4, life: 0.3, cols: ['#b8e4ff'] });
    } else if (p.onLand === 'die') { p.life = p.t; }
    else { p.vz = -p.vz * 0.3; if (Math.abs(p.vz) < 6) { p.vz = 0; p.g = 0; p.vx *= 0.3; p.vy *= 0.3; } }
  }
  draw(ctx, layer) {
    for (const p of this.a) {
      if (p.layer !== layer) continue;
      const f = p.t / p.life;
      const col = p.cols[Math.min(p.cols.length - 1, Math.floor(f * p.cols.length))];
      switch (p.type) {
        case 'px': {
          const s = p.size, X = Math.round(p.x), Y = Math.round(p.y - p.z);
          if (p.z > 1) { ctx.fillStyle = 'rgba(8,16,40,0.35)'; ctx.fillRect(Math.round(p.x + p.z * 0.3), Math.round(p.y + p.z * 0.2), s, s); }
          if (p.fade) ctx.globalAlpha = 1 - f;
          if (p.floating) ctx.globalAlpha = Math.min(1, (p.life - p.t) / 1.2);
          ctx.fillStyle = col; ctx.fillRect(X, Y, s, s);
          ctx.globalAlpha = 1;
          break;
        }
        case 'disc': {
          const r = p.r + p.grow * (p.easeGrow ? ease.outCubic(f) : f);
          const al = (p.alpha === undefined ? 1 : p.alpha) * (p.noFade ? 1 : (1 - f * f));
          ctx.globalAlpha = al; drawDisc(ctx, p.x, p.y - p.z, r, col); ctx.globalAlpha = 1;
          break;
        }
        case 'ring': {
          const r = p.r + p.grow * ease.outCubic(f);
          ctx.globalAlpha = (p.alpha === undefined ? 1 : p.alpha) * (1 - f); drawRing(ctx, p.x, p.y, r, col); ctx.globalAlpha = 1;
          break;
        }
        case 'plank': {
          ctx.save();
          ctx.translate(Math.round(p.x), Math.round(p.y - p.z)); ctx.rotate(p.rot);
          if (p.floating) ctx.globalAlpha = Math.min(1, (p.life - p.t) / 1.2);
          if (p.z > 1) { ctx.fillStyle = 'rgba(8,16,40,0.3)'; ctx.fillRect(-p.w / 2 + 1, 1, p.w, p.h); }
          ctx.fillStyle = col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          if (p.w > 2) { ctx.fillStyle = PAL.woodDD; ctx.fillRect(-p.w / 2, p.h / 2 - 1, p.w, 1); }
          ctx.restore();
          break;
        }
        case 'line': {
          ctx.globalAlpha = 1 - f;
          pline(ctx, p.x, p.y - p.z, p.x - p.vx * 0.035, p.y - p.z - p.vy * 0.035, col);
          ctx.globalAlpha = 1;
          break;
        }
        case 'text': {
          const al = f < 0.7 ? 1 : (1 - f) / 0.3;
          const pop = p.t < 0.12 ? 1 + (0.12 - p.t) * 4 : 1;
          Font.draw(ctx, p.text, p.x, p.y - ease.outCubic(f) * (p.rise || 14), { color: col, align: 'center', shadow: PAL.black, scale: Math.round((p.scale || 1) * pop), alpha: al });
          break;
        }
        case 'star': {
          const s = f < 0.5 ? 1 : 0;
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1 - s, 1, 3 + s * 2); ctx.fillRect(Math.round(p.x) - 1 - s, Math.round(p.y), 3 + s * 2, 1);
          break;
        }
      }
    }
  }
}

// ---------- efekty ----------
const SMOKE = ['#eef3fa', '#c0cbdc', '#a7b3c8', '#8b9bb4', '#71809c', '#5a6988'];
const DSMOKE = ['#5a6988', '#4a5574', '#3a4466', '#2f3756', '#262b44'];
const FIRE = [PAL.white, PAL.yellow, PAL.gold, PAL.orange, PAL.rust, PAL.red, '#5a2a3a'];
const FOAM = ['#eaf7ff', '#b8e4ff', '#8ccbf0', '#4fa6dc'];
const FX = {
  splinters(P, x, y, n, dx, dy, spd) {
    dx = dx || 0; dy = dy || 0; spd = spd || 60;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.25, 1) * spd, plank = chance(0.35);
      P.add({
        type: plank ? 'plank' : 'px', w: randi(2, 4), h: 1, x: x + rand(-2, 2), y: y + rand(-2, 2), z: rand(1, 4),
        vx: Math.cos(a) * s + dx * spd * 0.7, vy: Math.sin(a) * s + dy * spd * 0.7, vz: rand(25, 70), g: 150, drag: 1.1,
        life: rand(1.2, 2.4), rot: rand(0, TAU), vr: rand(-14, 14), size: chance(0.25) ? 2 : 1,
        cols: [pick([PAL.woodL, PAL.sand, PAL.wood, PAL.woodL, PAL.woodD])], onLand: 'float'
      });
    }
  },
  metal(P, x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(30, 90);
      P.add({ type: 'line', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3, life: rand(0.15, 0.35), cols: [PAL.white, PAL.yellow, PAL.gold] });
    }
  },
  smoke(P, x, y, n, o) {
    o = o || {};
    for (let i = 0; i < n; i++) P.add({
      type: 'disc', x: x + rand(-2, 2), y: y + rand(-2, 2), r: rand(1, 2.5), grow: rand(3, 7) * (o.big ? 1.8 : 1),
      vx: rand(-6, 6) + (o.vx || 0), vy: rand(-6, 6) + (o.vy || 0), drag: 1.6, wind: 0.7, life: rand(0.8, 1.6) * (o.long ? 1.7 : 1),
      cols: o.dark ? DSMOKE : SMOKE, alpha: o.alpha === undefined ? 0.75 : o.alpha, easeGrow: true
    });
  },
  muzzle(P, x, y, dx, dy) {
    P.add({ type: 'disc', x: x + dx * 2, y: y + dy * 2, r: 3, grow: -2, life: 0.09, cols: [PAL.white, PAL.yellow], noFade: true });
    P.add({ type: 'disc', x: x + dx * 5, y: y + dy * 5, r: 2, grow: -1, life: 0.07, cols: [PAL.yellow, PAL.gold], noFade: true });
    for (let i = 0; i < 5; i++) {
      const s = rand(40, 110), sp = rand(-0.5, 0.5);
      P.add({ type: 'line', x, y, vx: (dx + -dy * sp) * s, vy: (dy + dx * sp) * s, drag: 5, life: rand(0.1, 0.25), cols: [PAL.white, PAL.yellow, PAL.orange] });
    }
    for (let i = 0; i < 5; i++) P.add({
      type: 'disc', x: x + dx * rand(1, 6), y: y + dy * rand(1, 6), r: rand(1, 2), grow: rand(4, 8), vx: dx * rand(15, 45) + rand(-5, 5),
      vy: dy * rand(15, 45) + rand(-5, 5), drag: 2.2, wind: 0.8, life: rand(0.9, 1.7), cols: SMOKE, alpha: 0.7, easeGrow: true
    });
  },
  splash(P, x, y, big) {
    P.add({ type: 'ring', layer: 'under', x, y, r: 1, grow: big ? 15 : 8, life: 0.7, cols: ['#eaf7ff', '#b8e4ff'] });
    P.add({ type: 'disc', layer: 'under', x, y, r: big ? 4 : 2, grow: big ? 6 : 3, life: 0.8, cols: ['#dff3ff', '#a4d8f7', '#5aa9dc'], alpha: 0.85 });
    const n = big ? 24 : 11;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(5, big ? 40 : 22);
      P.add({ type: 'px', x, y, z: 1, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rand(30, big ? 110 : 75), g: 180, life: 2, cols: [pick(['#ffffff', '#dff3ff', '#b8e4ff'])], onLand: 'splash', size: chance(0.3) ? 2 : 1 });
    }
  },
  explosion(P, x, y, size) {
    size = size || 1;
    P.add({ type: 'disc', x, y, r: 2 * size, grow: 11 * size, life: 0.38, cols: [PAL.white, PAL.yellow, PAL.gold, PAL.orange, PAL.rust], easeGrow: true });
    for (let i = 0; i < 4; i++) P.add({ type: 'disc', x: x + rand(-6, 6) * size, y: y + rand(-6, 6) * size, r: 1, grow: rand(4, 8) * size, life: rand(0.25, 0.45), cols: [PAL.yellow, PAL.gold, PAL.orange, PAL.red], easeGrow: true });
    P.add({ type: 'ring', x, y, r: 3, grow: 24 * size, life: 0.35, cols: [PAL.white, PAL.yellow] });
    FX.smoke(P, x, y, Math.round(6 * size), { big: true, dark: true, long: true, alpha: 0.8 });
    FX.metal(P, x, y, Math.round(10 * size));
  },
  fire(P, x, y) {
    P.add({ type: 'px', x: x + rand(-3, 3), y: y + rand(-3, 3), z: rand(0, 2), vz: rand(10, 24), vx: rand(-3, 3), vy: rand(-3, 3), wind: 0.9, life: rand(0.35, 0.7), cols: FIRE, size: chance(0.35) ? 2 : 1 });
    if (chance(0.12)) FX.smoke(P, x, y, 1, { dark: true, alpha: 0.55 });
  },
  foam(P, x, y, vx, vy, big) {
    P.add({ type: 'px', layer: 'under', x, y, vx, vy, drag: 2.4, life: rand(0.7, 1.5), cols: FOAM, size: big ? 2 : 1 });
  },
  dust(P, x, y) {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      P.add({ type: 'disc', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, drag: 5, r: 2, grow: 2, life: 0.4, cols: [PAL.sand, PAL.woodL, PAL.skinD], alpha: 0.8 });
    }
  },
  text(P, x, y, str, col, scale, life) { P.add({ type: 'text', x, y, text: str, cols: [col], life: life || 1.1, rise: 16, scale: scale || 1 }); },
  sparkle(P, x, y, col) { P.add({ type: 'star', x, y, life: 0.45, cols: [col || PAL.yellow] }); },
  bubbles(P, x, y) { P.add({ type: 'ring', layer: 'under', x: x + rand(-4, 4), y: y + rand(-4, 4), r: 1, grow: rand(1, 3), life: rand(0.4, 0.8), cols: ['#b8e4ff'] }); }
};

// ---------- interfejs ----------
const UI = {
  _hoverSnd: null,
  panel(ctx, x, y, w, h, kind) {
    x = Math.round(x); y = Math.round(y);
    kind = kind || 'wood';
    if (kind === 'dark') {
      ctx.fillStyle = 'rgba(24,20,37,0.84)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = PAL.slate; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
      return;
    }
    if (kind === 'paper') {
      ctx.fillStyle = PAL.woodDD; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = PAL.sand; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = PAL.woodL; ctx.fillRect(x + 1, y + h - 3, w - 2, 2); ctx.fillRect(x + w - 3, y + 1, 2, h - 2);
      ctx.fillStyle = PAL.white; ctx.fillRect(x + 2, y + 2, w - 6, 1);
      return;
    }
    const tc = kind === 'team0' ? TEAM[0] : kind === 'team1' ? TEAM[1] : null;
    ctx.fillStyle = PAL.black; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = tc ? tc.d : PAL.woodD; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = tc ? tc.c : PAL.wood; ctx.fillRect(x + 1, y + 1, w - 2, 1); ctx.fillRect(x + 1, y + 1, 1, h - 2);
    ctx.fillStyle = tc ? tc.dd : PAL.woodDD; ctx.fillRect(x + 1, y + h - 2, w - 2, 1); ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
    ctx.fillStyle = PAL.black; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.fillStyle = '#20243a'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x + 4, y + 4, w - 8, 1);
    ctx.fillStyle = tc ? tc.l : PAL.gold;
    ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + w - 3, y + 2, 1, 1); ctx.fillRect(x + 2, y + h - 3, 1, 1); ctx.fillRect(x + w - 3, y + h - 3, 1, 1);
  },
  button(ctx, b) {
    const hot = (b.hot || b.focus) && !b.disabled, dn = b.down && b.hot;
    const x = Math.round(b.x), y = Math.round(b.y) + (dn ? 1 : 0), w = b.w, h = b.h;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x + 1, Math.round(b.y) + 2, w, h);
    ctx.fillStyle = PAL.black; ctx.fillRect(x, y, w, h);
    let base, hi, lo, tc, sh;
    if (b.disabled) { base = '#454a63'; hi = PAL.steel; lo = PAL.slate; tc = PAL.grey; sh = null; }
    else if (b.primary) { base = hot ? PAL.gold : PAL.orange; hi = hot ? PAL.yellow : PAL.gold; lo = PAL.rust; tc = PAL.woodDD; sh = null; }
    else if (b.active) { base = hot ? '#3f9a54' : PAL.greenD; hi = PAL.green; lo = PAL.greenDD; tc = PAL.white; sh = PAL.greenDD; }
    else { base = hot ? '#c47c58' : PAL.wood; hi = hot ? PAL.sand : PAL.woodL; lo = PAL.woodD; tc = PAL.white; sh = PAL.woodDD; }
    ctx.fillStyle = base; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = hi; ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = lo; ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    const s = b.scale || 1;
    let lx = x + w / 2;
    if (b.icon) { const iw = b.icon.width; lx += (iw + 3) / 2; ctx.drawImage(b.icon, Math.round(lx - Font.measure(b.label) * s / 2 - iw - 3), Math.round(y + (h - b.icon.height) / 2)); }
    Font.draw(ctx, b.label, lx, y + Math.round((h - 7 * s) / 2), { align: 'center', color: tc, shadow: sh, scale: s });
    if (hot) {
      const yy = y + Math.floor(h / 2);
      ctx.fillStyle = PAL.yellow;
      const bob = Math.round(Math.sin(Game.t * 8)) ;
      ctx.fillRect(x - 5 - bob, yy - 2, 1, 5); ctx.fillRect(x - 4 - bob, yy - 1, 1, 3); ctx.fillRect(x - 3 - bob, yy, 1, 1);
      ctx.fillRect(x + w + 4 + bob, yy - 2, 1, 5); ctx.fillRect(x + w + 3 + bob, yy - 1, 1, 3); ctx.fillRect(x + w + 2 + bob, yy, 1, 1);
    }
  },
  updateButtons(list) {
    let clicked = null;
    const m = Input.mouse;
    for (const b of list) {
      if (b.hidden) continue;
      const was = b.hot;
      b.hot = !b.disabled && Input.inRect(b.x, b.y, b.w, b.h);
      if (b.hot && !was && m.moved) SFX.play('hover');
      if (b.hot && m.pressed[0]) b.down = true;
      if (m.released[0]) { if (b.down && b.hot) clicked = b; b.down = false; }
    }
    if (clicked) SFX.play('click');
    return clicked;
  },
  bar(ctx, x, y, w, h, f, col, o) {
    o = o || {};
    f = clamp(f, 0, 1);
    ctx.fillStyle = PAL.black; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = o.bg || PAL.navy; ctx.fillRect(x, y, w, h);
    const fw = Math.round(w * f);
    ctx.fillStyle = col; ctx.fillRect(x, y, fw, h);
    if (h > 2) { ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x, y, fw, 1); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + h - 1, fw, 1); }
    if (o.ghost !== undefined) {
      const g = clamp(o.ghost, 0, 1), gw = Math.round(w * g);
      if (gw > fw) { ctx.fillStyle = (Math.floor(Game.t * 6) & 1) ? 'rgba(99,199,77,0.9)' : 'rgba(99,199,77,0.6)'; ctx.fillRect(x + fw, y, gw - fw, h); }
      else if (gw < fw) { ctx.fillStyle = (Math.floor(Game.t * 6) & 1) ? 'rgba(228,59,68,0.95)' : 'rgba(228,59,68,0.6)'; ctx.fillRect(x + gw, y, fw - gw, h); }
    }
    if (o.ticks) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 1; i < o.ticks; i++) ctx.fillRect(x + Math.round(w * i / o.ticks), y, 1, h); }
  },
  keycap(ctx, label, x, y, o) {
    o = o || {};
    const w = Math.max(9, Font.measure(label) + 5);
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = PAL.black; ctx.fillRect(x, y, w, 11);
    ctx.fillStyle = o.active ? PAL.yellow : PAL.silver; ctx.fillRect(x + 1, y + 1, w - 2, 8);
    ctx.fillStyle = o.active ? PAL.gold : PAL.grey; ctx.fillRect(x + 1, y + 8, w - 2, 2);
    ctx.fillStyle = PAL.white; ctx.fillRect(x + 1, y + 1, w - 2, 1);
    Font.draw(ctx, label, x + w / 2, y + 2 - (label.length === 1 && /[a-ząćęłńóśźż]/.test(label) ? 1 : 0), { align: 'center', color: PAL.woodDD });
    return w;
  },
  vignette: null,
  buildVignette() {
    const [c, x] = makeCanvas(W, H);
    x.fillStyle = PAL.black;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const dx = (i - W / 2) / (W / 2), dy = (j - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx * 0.8 + dy * dy * 0.9);
      const v = clamp((d - 0.78) / 0.5, 0, 1);
      if (bayer(i, j) < v * 0.75) x.fillRect(i, j, 1, 1);
    }
    this.vignette = c;
  }
};
