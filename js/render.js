'use strict';
/* =========================================================
   Renderer okrętów: sprite z bloków, cień, piana, ruchome części
   ========================================================= */
const SW = COLS * TILE + PAD * 2, SH = ROWS * TILE + PAD * 2;
const DECK = { a: '#a8644a', b: '#b86f50', c: '#c27a55', seam: '#87493a', hi: '#d08c63', knot: '#733e39' };
function deckColor(x, y) {
  const pl = Math.floor(x / 3), sx = x - pl * 3;
  if (sx === 2) return DECK.seam;
  const off = Math.floor(hash2(pl, 7) * 13);
  if ((y + off) % 13 === 0) return DECK.seam;
  const h = hash2(x, y);
  if (h < 0.035) return DECK.hi;
  if (h > 0.985) return DECK.knot;
  const t = hash2(pl, 3);
  return t < 0.33 ? DECK.a : t < 0.66 ? DECK.b : DECK.c;
}
function metalColor(i, j, x, y) {
  if ((i === 1 || i === 6) && (j === 1 || j === 6)) return PAL.silver;
  if (i === 0 || j === 0) return PAL.grey;
  if (i === 7 || j === 7) return PAL.slate;
  return hash2(x, y) < 0.08 ? '#6a7a98' : PAL.steel;
}
const OVL = {
  cannon: ['........', '........', '..nkkn..', '..nddn..', '..kddk..', '..nddn..', '..nkkn..', '........'],
  swivel: ['........', '........', '..nnnn..', '.nkkkkn.', '.nkddkn.', '.nkkkkn.', '..nnnn..', '........'],
  mortar: ['........', '..nnnn..', '.nggggn.', '.ngxxsn.', '.ngxxsn.', '.nssssn.', '..nnnn..', '........'],
  mast: ['........', '.l....l.', '...kk...', '..kbbk..', '..kbbk..', '...kk...', '.l....l.', '........'],
  oars: ['........', '........', '...tt...', '...ee...', '..wWWw..', '.dddddd.', '........', '........'],
  rudder: ['........', '...ll...', '.lkddkl.', '..dlld..', '..dlld..', '.lkddkl.', '...ll...', '........'],
  ram: ['...gg...', '..gsSg..', '..sSSs..', '...SS...', '...ss...', '........', '.s....s.', '........'],
  keg: ['........', '..kkkk..', '.kdbbdk.', '.kbrrbk.', '.kbrrbk.', '.kdbbdk.', '..kkkk..', '........'],
  carp: ['......G.', '.kkkkGGG', '.kdlldG.', '.klddlk.', '.klddlk.', '.kdlldk.', '.kkkkkk.', '........'],
  core: ['.kkkkkk.', 'kTTTTTTk', 'kLLLLLLk', 'kTTTTTTk', 'kTTyyTTk', 'kTTTTTTk', 'kDDDDDDk', '.kkkkkk.']
};
function ovlColors(team) {
  const T = TEAM[team];
  return { k: PAL.woodDD, d: PAL.woodD, b: PAL.wood, l: PAL.woodL, n: PAL.navy, g: PAL.grey, s: PAL.slate, S: PAL.silver, x: PAL.black,
    r: PAL.red2, e: PAL.skin, w: PAL.silver, W: PAL.white, G: PAL.green, T: T.c, L: T.l, D: T.d, t: T.c, y: PAL.yellow };
}
function rotIdx(i, j, f) {
  switch (f) { case 'D': return [7 - i, 7 - j]; case 'L': return [j, 7 - i]; case 'R': return [7 - j, i]; default: return [i, j]; }
}
function drawOverlay(x, map, ox, oy, col, facing) {
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const ch = map[j][i]; if (ch === '.') continue;
    const q = rotIdx(i, j, facing);
    x.fillStyle = col[ch]; x.fillRect(ox + q[0], oy + q[1], 1, 1);
  }
}
function drawCrack(x, ox, oy, seed) {
  let px = 1 + Math.floor(hash2(seed, 1) * 6), py = 1 + Math.floor(hash2(seed, 2) * 6);
  x.fillStyle = 'rgba(24,20,37,0.85)';
  for (let s = 0; s < 4; s++) {
    x.fillRect(ox + px, oy + py, 1, 1);
    px = clamp(px + (hash2(seed, s + 3) < 0.5 ? -1 : 1), 0, 7);
    py = clamp(py + (hash2(seed, s + 9) < 0.5 ? 0 : 1), 0, 7);
  }
}
const BOW = [2, 4, 4, 6, 6, 8, 8, 8];
const RAM_SPIKE = [[1, 6], [2, 5], [2, 5], [3, 4]];

// bloki: [{p, c, r, hp?, max?, broken?, burnt?, alive?}] -> {img, sil, foam}
function renderShip(blocks, team) {
  const occ = new Int16Array(COLS * ROWS).fill(-1);
  blocks.forEach((b, k) => { if (b.alive !== false) occ[b.r * COLS + b.c] = k; });
  const has = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS && occ[r * COLS + c] >= 0;
  const mask = new Int16Array(SW * SH).fill(-1);
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]; if (b.alive === false) continue;
    const c = b.c, r = b.r, up = !has(c, r - 1), dn = !has(c, r + 1), lf = !has(c - 1, r), rt = !has(c + 1, r);
    const ox = PAD + c * TILE, oy = PAD + r * TILE, br = b.broken || 0, tip = up && lf && rt && b.p !== 'ram';
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      let ins = true;
      if (tip) { if (Math.abs(i + 0.5 - 4) > BOW[j] / 2) ins = false; }
      else { if (up && lf && i + j < 3) ins = false; if (up && rt && (7 - i) + j < 3) ins = false; }
      if (dn && lf && i + (7 - j) < 2) ins = false;
      if (dn && rt && (7 - i) + (7 - j) < 2) ins = false;
      if (br) {
        if ((br & 1) && j < ((hash2(ox + i, 1) * 3) | 0)) ins = false;
        if ((br & 2) && 7 - j < ((hash2(ox + i, 2) * 3) | 0)) ins = false;
        if ((br & 4) && i < ((hash2(oy + j, 3) * 3) | 0)) ins = false;
        if ((br & 8) && 7 - i < ((hash2(oy + j, 4) * 3) | 0)) ins = false;
      }
      if (ins) mask[(oy + j) * SW + ox + i] = k;
    }
    if (b.p === 'ram' && up) for (let s = 0; s < 4; s++) for (let i = RAM_SPIKE[s][0]; i <= RAM_SPIKE[s][1]; i++) mask[(oy - 1 - s) * SW + ox + i] = k;
  }
  // krawędzie: 1 = obrys, 2 = reling
  const ed = new Uint8Array(SW * SH);
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x; if (mask[i] < 0) continue;
    if (mask[i - 1] < 0 || mask[i + 1] < 0 || mask[i - SW] < 0 || mask[i + SW] < 0) ed[i] = 1;
  }
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x; if (mask[i] < 0 || ed[i]) continue;
    if (ed[i - 1] === 1 || ed[i + 1] === 1 || ed[i - SW] === 1 || ed[i + SW] === 1) ed[i] = 2;
  }
  const [cv, x] = makeCanvas(SW, SH);
  const img = x.createImageData(SW, SH), d = img.data;
  const [sc, sx] = makeCanvas(SW, SH), simg = sx.createImageData(SW, SH), sd = simg.data;
  for (let y = 0; y < SH; y++) for (let xx = 0; xx < SW; xx++) {
    const i = y * SW + xx, k = mask[i]; if (k < 0) continue;
    const b = blocks[k], metal = PARTS[b.p].mat === 'metal';
    const li = xx - PAD - b.c * TILE, lj = y - PAD - b.r * TILE;
    let col;
    if (ed[i] === 1) {
      col = metal ? PAL.navy : PAL.woodDD;
      const br = b.broken || 0;
      if (br && (((br & 1) && lj < 3) || ((br & 2) && lj > 4) || ((br & 4) && li < 3) || ((br & 8) && li > 4))) col = hash2(xx, y) < 0.55 ? PAL.woodL : PAL.woodD;
    } else if (ed[i] === 2) col = metal ? PAL.slate : ((li <= 1 || lj <= 1) ? '#8a4c3e' : PAL.woodD);
    else col = metal ? metalColor(clamp(li, 0, 7), clamp(lj, 0, 7), xx, y) : deckColor(xx, y);
    const c3 = hexRgb(col), o = i * 4;
    d[o] = c3[0]; d[o + 1] = c3[1]; d[o + 2] = c3[2]; d[o + 3] = 255;
    sd[o] = 24; sd[o + 1] = 20; sd[o + 2] = 37; sd[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); sx.putImageData(simg, 0, 0);
  // nakładki części
  const col = ovlColors(team);
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]; if (b.alive === false) continue;
    const ox = PAD + b.c * TILE, oy = PAD + b.r * TILE;
    const L = !has(b.c - 1, b.r), R = !has(b.c + 1, b.r), U = !has(b.c, b.r - 1), Dd = !has(b.c, b.r + 1);
    b.fc = null;
    if (b.p === 'cannon') {
      b.fc = L && R ? 'LR' : L ? 'L' : R ? 'R' : U ? 'U' : Dd ? 'D' : null;
      if (b.fc === 'LR') drawOverlay(x, OVL.swivel, ox, oy, col, 'U');
      else drawOverlay(x, OVL.cannon, ox, oy, col, b.fc || 'U');
    } else if (b.p === 'oars') { b.os = [L, R]; drawOverlay(x, OVL.oars, ox, oy, col, 'U'); }
    else if (OVL[b.p]) drawOverlay(x, OVL[b.p], ox, oy, col, 'U');
    const fr = b.hp === undefined ? 1 : b.hp / b.max;
    if (fr < 0.72) drawCrack(x, ox, oy, k * 7 + b.c * 31 + b.r);
    if (fr < 0.42) { drawCrack(x, ox, oy, k * 7 + 2 + b.c); drawCrack(x, ox, oy, k * 11 + 5 + b.r); }
    if (b.burnt) {
      for (let s = 0; s < 16; s++) {
        x.fillStyle = hash2(k * 13 + s, 77) < 0.5 ? PAL.black : PAL.woodDD;
        x.fillRect(ox + Math.floor(hash2(k + s, 21) * 8), oy + Math.floor(hash2(k + s, 33) * 8), 1, 1);
      }
    }
  }
  // piana wokół kadłuba
  const [fc, fx] = makeCanvas(SW, SH), fimg = fx.createImageData(SW, SH), fd = fimg.data;
  for (let y = 1; y < SH - 1; y++) for (let xx = 1; xx < SW - 1; xx++) {
    const i = y * SW + xx; if (mask[i] >= 0) continue;
    let n = 0;
    if (mask[i - 1] >= 0) n++; if (mask[i + 1] >= 0) n++; if (mask[i - SW] >= 0) n++; if (mask[i + SW] >= 0) n++;
    if (n) { const o = i * 4; fd[o] = 230; fd[o + 1] = 246; fd[o + 2] = 255; fd[o + 3] = 170; }
  }
  fx.putImageData(fimg, 0, 0);
  return { img: cv, sil: sc, foam: fc };
}

// ---------- ruchome elementy (we współrzędnych sprite'a) ----------
const DIRV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
function drawBarrel(ctx, cx, cy, dir, rec) {
  const v = DIRV[dir], dx = v[0], dy = v[1], r = Math.round(rec);
  for (let s = -1; s <= 7; s++) {
    const k = s - r, X = cx + dx * k, Y = cy + dy * k, end = s >= 6;
    if (dx !== 0) {
      ctx.fillStyle = end ? PAL.steel : PAL.slate; ctx.fillRect(X, cy - 1, 1, 1);
      ctx.fillStyle = end ? PAL.slate : PAL.black; ctx.fillRect(X, cy, 1, 1);
    } else {
      ctx.fillStyle = end ? PAL.steel : PAL.slate; ctx.fillRect(cx - 1, Y, 1, 1);
      ctx.fillStyle = end ? PAL.slate : PAL.black; ctx.fillRect(cx, Y, 1, 1);
    }
  }
}
function drawShipDyn(ctx, blocks, o) {
  const t = o.t || 0;
  for (const b of blocks) {
    if (b.alive === false) continue;
    const cx = PAD + b.c * TILE + 4, cy = PAD + b.r * TILE + 4;
    if (b.p === 'cannon' && b.fc) {
      const dir = b.fc === 'LR' ? (b.sw || 'L') : b.fc;
      drawBarrel(ctx, cx, cy, dir, (b.recoil || 0) * 2.5);
    } else if (b.p === 'oars' && b.os) {
      const ph = t * (2 + o.row * 7) + b.r * 0.7;
      const sw = o.row > 0.03 ? Math.round(Math.sin(ph) * 2.5) : 1;
      const dip = o.row > 0.03 ? (Math.cos(ph) > 0 ? 1 : 0) : 0;
      if (b.os[0]) { pline(ctx, cx - 1, cy, cx - 9 - dip, cy + sw, PAL.woodL); ctx.fillStyle = PAL.woodD; ctx.fillRect(cx - 10 - dip, cy + sw - 1, 2, 3); }
      if (b.os[1]) { pline(ctx, cx, cy, cx + 8 + dip, cy + sw, PAL.woodL); ctx.fillStyle = PAL.woodD; ctx.fillRect(cx + 8 + dip, cy + sw - 1, 2, 3); }
    } else if (b.p === 'rudder') {
      const a = -(o.rudder || 0) * 0.55;
      const ex = cx + Math.sin(a) * 6, ey = cy + 3 + Math.cos(a) * 6;
      pline(ctx, cx, cy + 3, ex, ey, PAL.woodDD, 2);
      pline(ctx, cx, cy + 3, ex, ey, PAL.woodD);
    }
  }
}
// żagle: canvas 26x12, maszt w punkcie (13,9)
const Sails = {
  cache: new Map(),
  get(team, lvl, shadow) {
    const key = team + ':' + lvl + ':' + (shadow ? 1 : 0);
    let c = this.cache.get(key); if (c) return c;
    if (shadow) { c = tintSprite(this.get(team, lvl, false), PAL.black, 1); this.cache.set(key, c); return c; }
    const T = TEAM[team], Wd = 26, Hh = 12, yard = 9, D = [0, 3, 5, 7][lvl];
    const [cv, x] = makeCanvas(Wd, Hh);
    if (lvl === 0) {
      x.fillStyle = PAL.woodDD; x.fillRect(1, yard - 2, 24, 4);
      x.fillStyle = PAL.sand; x.fillRect(2, yard - 1, 22, 2);
      x.fillStyle = PAL.white; x.fillRect(2, yard - 1, 22, 1);
      x.fillStyle = PAL.skinD; for (let i = 4; i < 23; i += 5) x.fillRect(i, yard - 1, 1, 2);
    } else {
      for (let i = 1; i <= 24; i++) {
        const tt = (i - 12.5) / 12, bul = Math.max(0, Math.round(D * (1 - tt * tt)));
        const top = yard - bul;
        for (let y = top; y < yard; y++) {
          const k = (yard - y) / Math.max(1, bul);
          let col = k > 0.82 ? PAL.white : k < 0.3 ? PAL.woodL : PAL.sand;
          if (lvl >= 2 && k > 0.38 && k < 0.66) col = T.c;
          if (i % 6 === 0 && k <= 0.82) col = (col === T.c) ? T.d : PAL.skinD;
          x.fillStyle = col; x.fillRect(i, y, 1, 1);
        }
        x.fillStyle = PAL.woodDD; x.fillRect(i, top - 1, 1, 1);
      }
      x.fillStyle = PAL.woodDD; x.fillRect(0, yard - 1, 26, 3);
      x.fillStyle = PAL.woodD; x.fillRect(1, yard, 24, 1);
    }
    this.cache.set(key, cv);
    return cv;
  }
};
function drawSails(ctx, blocks, o) {
  const lvl = clamp(Math.round(o.sail === undefined ? 3 : o.sail), 0, 3);
  for (const b of blocks) {
    if (b.alive === false || b.p !== 'mast') continue;
    const cx = PAD + b.c * TILE + 4, cy = PAD + b.r * TILE + 4;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(o.yaw || 0);
    ctx.drawImage(Sails.get(o.team, lvl, o.shadow), -13, -9);
    ctx.restore();
  }
}
function drawFlag(ctx, x, y, rel, team, t) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rel);
  const T = TEAM[team];
  ctx.fillStyle = PAL.woodDD; ctx.fillRect(-1, -1, 2, 2);
  for (let s = 1; s <= 7; s++) {
    const wv = Math.round(Math.sin(t * 9 - s * 0.9) * (s / 7) * 1.4);
    const w = s < 6 ? 3 : 2;
    ctx.fillStyle = s === 1 ? T.d : (s & 1) ? T.c : T.l;
    ctx.fillRect(-1 + wv, -s - 1, w, 1);
  }
  ctx.restore();
}

// ikony części do palety stoczni (16x16)
const PartIcons = {
  cache: new Map(),
  get(p, team) {
    team = team || 0;
    const key = p + team;
    let c = this.cache.get(key); if (c) return c;
    const [cv, x] = makeCanvas(16, 16);
    const ox = 4, oy = 4, metal = PARTS[p].mat === 'metal';
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const edge = i === 0 || j === 0 || i === 7 || j === 7, rail = !edge && (i === 1 || j === 1 || i === 6 || j === 6);
      if ((i === 0 || i === 7) && (j === 0 || j === 7)) continue;
      x.fillStyle = edge ? (metal ? PAL.navy : PAL.woodDD) : rail ? (metal ? PAL.slate : PAL.woodD) : metal ? metalColor(i, j, i + 40, j + 9) : deckColor(i + 40, j + 9);
      x.fillRect(ox + i, oy + j, 1, 1);
    }
    const col = ovlColors(team);
    if (p === 'cannon') drawOverlay(x, OVL.cannon, ox, oy, col, 'U');
    else if (OVL[p]) drawOverlay(x, OVL[p], ox, oy, col, 'U');
    if (p === 'cannon') drawBarrel(x, ox + 4, oy + 4, 'U', 0);
    if (p === 'oars') { pline(x, ox + 2, oy + 4, ox - 3, oy + 6, PAL.woodL); x.fillStyle = PAL.woodD; x.fillRect(ox - 4, oy + 5, 2, 3); }
    if (p === 'rudder') { pline(x, ox + 4, oy + 7, ox + 4, oy + 11, PAL.woodDD, 2); pline(x, ox + 4, oy + 7, ox + 4, oy + 10, PAL.woodD); }
    if (p === 'ram') {
      for (let s = 0; s < 4; s++) for (let i = RAM_SPIKE[s][0]; i <= RAM_SPIKE[s][1]; i++) {
        x.fillStyle = (i === RAM_SPIKE[s][0] || i === RAM_SPIKE[s][1] || s === 3) ? PAL.navy : (i === 3 ? PAL.silver : PAL.grey);
        x.fillRect(ox + i, oy - 1 - s, 1, 1);
      }
    }
    if (p === 'mast') {
      const yard = oy + 6;
      for (let i = 0; i < 14; i++) {
        const tt = (i - 6.5) / 6.5, bul = Math.round(3 * (1 - tt * tt));
        for (let y = yard - bul; y < yard; y++) { x.fillStyle = y === yard - bul ? PAL.white : y === yard - 2 ? TEAM[team].c : PAL.sand; x.fillRect(ox - 3 + i, y, 1, 1); }
      }
      x.fillStyle = PAL.woodDD; x.fillRect(ox - 4, yard, 16, 2);
      x.fillStyle = PAL.woodD; x.fillRect(ox - 3, yard, 14, 1);
    }
    this.cache.set(key, cv);
    return cv;
  }
};
