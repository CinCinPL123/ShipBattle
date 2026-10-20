'use strict';
/* =========================================================
   Renderer okrętów: sprite z bloków, materiały, jakości,
   ruchome części (lufy, wiosła, ster), żagle i bandery
   ========================================================= */
const DECKS = {
  pine: { a: '#a8644a', b: '#b86f50', c: '#c27a55', seam: '#87493a', hi: '#d08c63', knot: '#733e39', edge: PAL.woodDD, rail: PAL.woodD, rail2: '#8a4c3e' },
  oak: { a: '#6e4334', b: '#7a4a38', c: '#84513c', seam: '#4e2e27', hi: '#946048', knot: '#3e2731', edge: '#24161c', rail: '#4e2e27', rail2: '#5e382c' },
  mahog: { a: '#8a3b32', b: '#9a4436', c: '#a64c3a', seam: '#5e2424', hi: '#b8604a', knot: '#4a1c1e', edge: '#2e1418', rail: '#5e2424', rail2: '#6e2c28' },
  ghost: { a: '#2f8a76', b: '#36a088', c: '#2a7d6c', seam: '#1a5248', hi: '#7dffc8', knot: '#12463f', edge: '#0c2e2a', rail: '#1a5248', rail2: '#22685a' }
};
const METALS = {
  iron: { edge: PAL.navy, rail: PAL.slate, base: PAL.steel, alt: '#6a7a98', hi: PAL.grey, low: PAL.slate, rivet: PAL.silver },
  steel: { edge: '#2a3350', rail: '#5a6988', base: '#8b9bb4', alt: '#9aaac2', hi: '#c0cbdc', low: '#5a6988', rivet: PAL.white }
};
// kolory luf według jakości: żeliwo, stal, brąz, złoto, upiorna
const GUNQ = [
  { a: PAL.black, b: PAL.slate, tip: PAL.steel },
  { a: PAL.slate, b: PAL.grey, tip: PAL.silver },
  { a: '#7a3e1c', b: '#c27a1f', tip: PAL.gold },
  { a: '#a8601a', b: PAL.gold, tip: PAL.yellow },
  { a: PAL.ghostD, b: PAL.ghost, tip: '#ffffff' }
];
const TRIMQ = [null, null, null, '#c27a1f', '#2a9d7c'];
function deckOf(p) { const P = PARTS[p]; return DECKS[P.deck || (P.mat === 'ghost' ? 'ghost' : 'pine')]; }
function deckColor(D, x, y) {
  const pl = Math.floor(x / 3), sx = x - pl * 3;
  if (sx === 2) return D.seam;
  const off = Math.floor(hash2(pl, 7) * 13);
  if ((y + off) % 13 === 0) return D.seam;
  const h = hash2(x, y);
  if (h < 0.035) return D.hi;
  if (h > 0.985) return D.knot;
  const t = hash2(pl, 3);
  return t < 0.33 ? D.a : t < 0.66 ? D.b : D.c;
}
function metalColor(M, i, j, x, y) {
  if ((i === 1 || i === 6) && (j === 1 || j === 6)) return M.rivet;
  if (i === 0 || j === 0) return M.hi;
  if (i === 7 || j === 7) return M.low;
  return hash2(x, y) < 0.08 ? M.alt : M.base;
}
const OVL = {
  cannon: ['........', '........', '..nkkn..', '..nddn..', '..kddk..', '..nddn..', '..nkkn..', '........'],
  longgun: ['........', '..nkkn..', '..nddn..', '..kddk..', '..nddn..', '..nddn..', '..nkkn..', '........'],
  carro: ['........', '........', '.nkkkkn.', '.nddddn.', '.kddddk.', '.nddddn.', '.nkkkkn.', '........'],
  firegun: ['........', '........', '..nkkn..', '..nrrn..', '..kddk..', '..norn..', '..nkkn..', '........'],
  chain: ['........', '........', '.nkkkkn.', '.nddddn.', '.kdssdk.', '.nddddn.', '.nkkkkn.', '..g..g..'],
  swivelLR: ['........', '........', '..nnnn..', '.nkkkkn.', '.nkddkn.', '.nkkkkn.', '..nnnn..', '........'],
  swivel: ['........', '...nn...', '..nkkn..', '.nkSSkn.', '.nkSSkn.', '..nkkn..', '...nn...', '........'],
  mortar: ['........', '..nnnn..', '.nggggn.', '.ngxxsn.', '.ngxxsn.', '.nssssn.', '..nnnn..', '........'],
  mast: ['........', '.l....l.', '...kk...', '..kbbk..', '..kbbk..', '...kk...', '.l....l.', '........'],
  oars: ['........', '........', '...tt...', '...ee...', '..wWWw..', '.dddddd.', '........', '........'],
  rudder: ['........', '...ll...', '.lkddkl.', '..dlld..', '..dlld..', '.lkddkl.', '...ll...', '........'],
  ram: ['...gg...', '..gsSg..', '..sSSs..', '...SS...', '...ss...', '........', '.s....s.', '........'],
  keg: ['........', '..kkkk..', '.kdbbdk.', '.kbrrbk.', '.kbrrbk.', '.kdbbdk.', '..kkkk..', '........'],
  carp: ['......G.', '.kkkkGGG', '.kdlldG.', '.klddlk.', '.klddlk.', '.kdlldk.', '.kkkkkk.', '........'],
  nest: ['........', '..kkkk..', '.kllllk.', '.klkklk.', '.klkklk.', '.kllllk.', '..kkkk..', '........'],
  core: ['.kkkkkk.', 'kTTTTTTk', 'kLLLLLLk', 'kTTTTTTk', 'kTTyyTTk', 'kTTTTTTk', 'kDDDDDDk', '.kkkkkk.'],
  bombard: ['........', '.nnnnnn.', 'nkkkkkkn', 'nkddddkn', 'nkddddkn', 'nkkkkkkn', '.nnnnnn.', '........'],
  rocket: ['........', '........', '.nkkkkn.', '.nrdrdn.', '.kddddk.', '.nrdrdn.', '.nkkkkn.', '........'],
  flame: ['........', '...oo...', '..nkkn..', '..nrrn..', '..krok..', '..nrrn..', '..nkkn..', '........'],
  harpoon: ['........', '...nn...', '.l.kk.l.', '.lkddkl.', '..kddk..', '..nddn..', '...nn...', '........'],
  mines: ['........', '..kkkk..', '.kxxxxk.', '.kxrrxk.', '.kxxxxk.', '.kxxxxk.', '..kddk..', '........'],
  jib: ['...dd...', '...dd...', '..kddk..', '..kbbk..', '..kbbk..', '..kddk..', '........', '........'],
  steam: ['..xxxx..', '.xssssx.', '.xsxxsx.', '.xsxxsx.', '.xssssx.', '.krrrrk.', '.kddddk.', '........'],
  armory: ['........', '.kkkkkk.', '.kSddSk.', '.kdSSdk.', '.kdSSdk.', '.kSddSk.', '.kkkkkk.', '........'],
  crane: ['......d.', '.....dd.', '....d.d.', '...d..d.', '..kkkkd.', '.kdbbdk.', '.kkkkkk.', '........'],
  kraken: ['.mmmmmm.', 'mPWWWPPm', 'mPWWWWPm', 'mPPWWWPm', 'mPPWWPPm', 'mPPPWPPm', 'mPPPPPPm', '.mmmmmm.'],
  lantern: ['...kk...', '..kkkk..', '.khhhhk.', '.khWWhk.', '.khWWhk.', '.khhhhk.', '..kkkk..', '...kk...'],
  figure: ['...YY...', '..YyyY..', '..YyyY..', '...YY...', '..YYYY..', '.Y.YY.Y.', '...YY...', '..Y..Y..'],
  dread: ['x.......', 'xxxxxxx.', 'xxWWWxx.', 'xxWxWxx.', 'xxxWxxx.', 'xxWxWxx.', 'xxxxxxx.', 'x.......'],
  storm: ['...kk...', '...ss...', '..suus..', '.suyUus.', '.suUyus.', '.suyuus.', '.suuuus.', '..ssss..'],
  pearl: ['........', '..iiii..', '.iWWWWi.', 'iWWUWWWi', 'iWWWWWUi', '.iWWWWi.', '..iiii..', '........']
};
function ovlColors(col, q) {
  const tr = TRIMQ[q || 0];
  return { k: tr || PAL.woodDD, d: PAL.woodD, b: PAL.wood, l: PAL.woodL, n: tr || PAL.navy, g: PAL.grey, s: PAL.slate, S: PAL.silver, x: PAL.black,
    r: PAL.red2, o: PAL.orange, e: PAL.skin, w: PAL.silver, W: PAL.white, G: PAL.green, T: col.c, L: col.l, D: col.d, t: col.c, y: PAL.yellow,
    m: '#3a1d40', P: '#68386c', h: PAL.ghost, Y: PAL.gold, u: '#2a9df0', U: '#8fd3ff', i: '#e98bc4' };
}
// relikwie na okręcie (tylko całe bloki) i to, jak zmieniają wygląd
function relicsOf(blocks) {
  const R = new Set();
  for (const b of blocks) if (b.alive !== false && PARTS[b.p].relic) R.add(b.p);
  return R;
}
function relicTrim(R) {
  if (!R.size) return null;
  const t = {};
  if (R.has('kraken')) { t.edge = '#3a1d40'; t.rail = '#68386c'; t.rail2 = '#8a4a8c'; }
  else if (R.has('lantern')) t.edge = '#12463f';
  else if (R.has('dread')) t.edge = '#0e0e16';
  else if (R.has('pearl')) t.edge = '#10305a';
  if (R.has('figure')) { t.rail = '#c27a1f'; t.rail2 = '#feae34'; }
  return t.edge || t.rail ? t : null;
}
const _ovlCache = new Map();
function ovlCol(col, q) { const k = col.c + q; let v = _ovlCache.get(k); if (!v) { v = ovlColors(col, q); _ovlCache.set(k, v); } return v; }
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
// znaczek jakości w rogu bloku
function drawGem(x, ox, oy, q) {
  if (!q) return;
  x.fillStyle = PAL.black; x.fillRect(ox + 5, oy + 6, 3, 2);
  x.fillStyle = QUAL[q].col; x.fillRect(ox + 6, oy + 6, 2, 1);
  if (q >= 3) x.fillRect(ox + 5, oy + 7, 1, 1);
}
const BOW = [2, 4, 4, 6, 6, 8, 8, 8];
const RAM_SPIKE = [[1, 6], [2, 5], [2, 5], [3, 4]];
const RAMQ = [[PAL.grey, PAL.silver, PAL.navy], [PAL.silver, PAL.white, PAL.slate], ['#c27a1f', PAL.gold, '#7a3e1c'], [PAL.gold, PAL.yellow, '#a8601a'], [PAL.ghostD, PAL.ghost, PAL.ghostDD]];

// bloki: [{p, q, c, r, hp?, max?, broken?, burnt?, alive?}] -> {img, sil, foam}
function renderShip(blocks, col) {
  const trim = relicTrim(relicsOf(blocks));
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
    if (b.p === 'ram' && up) for (let s = 0; s < 4; s++) for (let i = RAM_SPIKE[s][0]; i <= RAM_SPIKE[s][1]; i++) if (oy - 1 - s >= 0) mask[(oy - 1 - s) * SW + ox + i] = k;
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
    const b = blocks[k], P = PARTS[b.p], metal = P.mat === 'metal', M = metal ? METALS[P.metal || 'iron'] : null, D = metal ? null : deckOf(b.p);
    const li = xx - PAD - b.c * TILE, lj = y - PAD - b.r * TILE;
    let c;
    if (b.p === 'ram' && lj < 0) {
      const R = RAMQ[b.q || 0], s = -1 - lj;
      c = (li === RAM_SPIKE[s][0] || li === RAM_SPIKE[s][1] || s === 3) ? R[2] : (li === 3 ? R[1] : R[0]);
    } else if (ed[i] === 1) {
      c = trim && trim.edge ? trim.edge : metal ? M.edge : D.edge;
      const br = b.broken || 0;
      if (br && (((br & 1) && lj < 3) || ((br & 2) && lj > 4) || ((br & 4) && li < 3) || ((br & 8) && li > 4))) c = hash2(xx, y) < 0.55 ? PAL.woodL : PAL.woodD;
    } else if (ed[i] === 2) c = trim && trim.rail ? ((li <= 1 || lj <= 1) ? trim.rail2 : trim.rail) : metal ? M.rail : ((li <= 1 || lj <= 1) ? D.rail2 : D.rail);
    else c = metal ? metalColor(M, clamp(li, 0, 7), clamp(lj, 0, 7), xx, y) : deckColor(D, xx, y);
    const c3 = hexRgb(c), o = i * 4;
    d[o] = c3[0]; d[o + 1] = c3[1]; d[o + 2] = c3[2]; d[o + 3] = 255;
    sd[o] = 24; sd[o + 1] = 20; sd[o + 2] = 37; sd[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); sx.putImageData(simg, 0, 0);
  // nakładki części
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]; if (b.alive === false) continue;
    const ox = PAD + b.c * TILE, oy = PAD + b.r * TILE, oc = ovlCol(col, b.q || 0);
    const open = (c, r) => !has(c, r);
    const Wd = WEAPONS[PARTS[b.p].w];
    b.fc = Wd && Wd.side ? Design.facing(open, b.c, b.r) : null;
    if (Wd && Wd.side) drawOverlay(x, b.fc === 'LR' ? OVL.swivelLR : OVL[b.p] || OVL.cannon, ox, oy, oc, b.fc === 'LR' ? 'U' : b.fc || 'U');
    else if (b.p === 'oars') { b.os = [open(b.c - 1, b.r), open(b.c + 1, b.r)]; drawOverlay(x, OVL.oars, ox, oy, oc, 'U'); }
    else if (OVL[b.p]) drawOverlay(x, OVL[b.p], ox, oy, oc, 'U');
    if (hasQ(b.p)) drawGem(x, ox, oy, b.q || 0);
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
const GUN_SHAPE = { cannon: [7, 2], longgun: [10, 2], carro: [4, 3], firegun: [6, 2], chain: [6, 3], swivel: [5, 1], rocket: [4, 3], flame: [5, 2], bombard: [6, 4], harpoon: [8, 1] };
function drawBarrel(ctx, cx, cy, dir, rec, p, q) {
  const v = DIRV[dir], dx = v[0], dy = v[1], r = Math.round(rec), G = GUNQ[q || 0];
  const sh = GUN_SHAPE[p] || GUN_SHAPE.cannon, len = sh[0] + (p === 'carro' || p === 'bombard' || p === 'rocket' ? (q >> 1) : q || 0), wid = sh[1];
  for (let s = -1; s <= len; s++) {
    const k = s - r, X = cx + dx * k, Y = cy + dy * k, end = s >= len - 1;
    for (let w = 0; w < wid; w++) {
      const off = w - (wid >> 1), dark = w === wid - 1 && wid > 1;
      if ((p === 'chain' || p === 'rocket') && w === 1) continue; // dwie lufy z przerwą
      ctx.fillStyle = end ? (dark ? G.b : G.tip) : (dark ? G.a : G.b);
      if ((p === 'firegun' || p === 'flame') && end && !dark) ctx.fillStyle = PAL.orange;
      if (p === 'rocket' && end) ctx.fillStyle = PAL.red2;
      if (p === 'harpoon') ctx.fillStyle = s === len ? PAL.white : end ? PAL.silver : PAL.woodL;
      if (dx !== 0) ctx.fillRect(X, cy + off, 1, 1); else ctx.fillRect(cx + off, Y, 1, 1);
    }
  }
}
// krętlica: krótka lufa obracana pod dowolnym kątem
function drawSwivel(ctx, cx, cy, ang, rec, q) {
  const G = GUNQ[q || 0], len = 5 + (q || 0), ca = Math.cos(ang), sa = Math.sin(ang);
  for (let s = 0; s <= len; s++) {
    const k = s - rec * 2;
    ctx.fillStyle = s >= len - 1 ? G.tip : G.b;
    ctx.fillRect(Math.round(cx + ca * k), Math.round(cy + sa * k), 1, 1);
  }
  ctx.fillStyle = G.a; ctx.fillRect(cx - 1, cy - 1, 2, 2);
}
const OARQ = [PAL.woodD, PAL.woodD, '#1a5a9c', '#c27a1f', PAL.ghostD];
function drawShipDyn(ctx, blocks, o) {
  const t = o.t || 0;
  for (const b of blocks) {
    if (b.alive === false) continue;
    const cx = PAD + b.c * TILE + 4, cy = PAD + b.r * TILE + 4, q = b.q || 0;
    if (b.p === 'swivel') drawSwivel(ctx, cx, cy, b.aim === undefined ? -Math.PI / 2 : b.aim, b.recoil || 0, q);
    else if (b.fc && GUN_SHAPE[b.p]) {
      const dir = b.fc === 'LR' ? (b.sw || 'L') : b.fc;
      drawBarrel(ctx, cx, cy, dir, (b.recoil || 0) * 2.5, b.p, q);
    } else if (b.p === 'oars' && b.os) {
      const ph = t * (2 + o.row * 7) + b.r * 0.7;
      const sw = o.row > 0.03 ? Math.round(Math.sin(ph) * 2.5) : 1;
      const dip = o.row > 0.03 ? (Math.cos(ph) > 0 ? 1 : 0) : 0, blade = OARQ[q];
      if (b.os[0]) { pline(ctx, cx - 1, cy, cx - 9 - dip, cy + sw, PAL.woodL); ctx.fillStyle = blade; ctx.fillRect(cx - 10 - dip, cy + sw - 1, 2, 3); }
      if (b.os[1]) { pline(ctx, cx, cy, cx + 8 + dip, cy + sw, PAL.woodL); ctx.fillStyle = blade; ctx.fillRect(cx + 8 + dip, cy + sw - 1, 2, 3); }
    } else if (b.p === 'rudder') {
      const a = -(o.rudder || 0) * 0.55, len = 6 + (q >= 2 ? 1 : 0);
      const ex = cx + Math.sin(a) * len, ey = cy + 3 + Math.cos(a) * len;
      pline(ctx, cx, cy + 3, ex, ey, q >= 2 ? PAL.navy : PAL.woodDD, 2);
      pline(ctx, cx, cy + 3, ex, ey, q >= 2 ? GUNQ[q].b : PAL.woodD);
    } else if (b.p === 'nest') {
      ctx.fillStyle = PAL.woodDD; ctx.fillRect(cx - 1, cy - 1, 2, 2);
      if (Math.sin(t * 2 + b.r) > 0) { ctx.fillStyle = PAL.skin; ctx.fillRect(cx + 1, cy - 2, 1, 1); }
    } else if (b.p === 'jib') {
      pline(ctx, cx, cy - 2, cx, cy - 13, PAL.woodDD, 2); pline(ctx, cx, cy - 2, cx, cy - 13, PAL.woodL);
    } else if (b.p === 'lantern') {
      ctx.fillStyle = Math.sin(t * 5 + b.c) > -0.3 ? '#d8fff0' : PAL.ghost; ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
  }
}
// ---------- żagle: rozmiar i barwa zależą od jakości masztu ----------
const SAILQ = [
  { w: 22, d: [0, 3, 4, 6], body: PAL.sand, hi: '#f4ead2', lo: PAL.woodL, seam: PAL.skinD },
  { w: 26, d: [0, 3, 5, 7], body: '#e8eef8', hi: PAL.white, lo: PAL.silver, seam: PAL.grey, stripe: 'c' },
  { w: 30, d: [0, 4, 6, 8], body: 'c', hi: 'l', lo: 'd', seam: 'd', stripe: '#ffffff' },
  { w: 32, d: [0, 4, 7, 9], body: '#2a2030', hi: '#4a3a50', lo: PAL.black, seam: PAL.red, stripe: PAL.gold, trim: PAL.gold },
  { w: 34, d: [0, 4, 7, 10], body: PAL.ghost, hi: '#d8fff0', lo: PAL.ghostD, seam: PAL.ghostDD, tatter: true }
];
// żagle zmienione przez relikwie (rozmiar zostaje z jakości masztu)
const SAIL_SKIN = {
  storm: { body: '#262b44', hi: '#3a4466', lo: PAL.black, seam: '#10305a', stripe: null, bolt: PAL.yellow, trim: PAL.cyan, tatter: false },
  lantern: { body: PAL.ghost, hi: '#d8fff0', lo: PAL.ghostD, seam: PAL.ghostDD, stripe: null, trim: null, tatter: true },
  dread: { body: '#1e1e2a', hi: '#3a3a4a', lo: PAL.black, seam: PAL.red, stripe: PAL.red2, trim: PAL.red, tatter: false }
};
function sailSkin(R) { return R.has('storm') ? 'storm' : R.has('lantern') ? 'lantern' : R.has('dread') ? 'dread' : ''; }
const Sails = {
  cache: new Map(),
  get(col, lvl, q, shadow, skin) {
    const key = col.c + ':' + lvl + ':' + q + ':' + (shadow ? 1 : 0) + ':' + (skin || '');
    let c = this.cache.get(key); if (c) return c;
    if (shadow) { c = tintSprite(this.get(col, lvl, q, false, skin), PAL.black, 1); this.cache.set(key, c); return c; }
    const S = skin ? Object.assign({}, SAILQ[q], SAIL_SKIN[skin]) : SAILQ[q], Wd = S.w + 2, Hh = 14, yard = 11, D = S.d[lvl];
    const cl = v => v === 'c' ? col.c : v === 'l' ? col.l : v === 'd' ? col.d : v;
    const [cv, x] = makeCanvas(Wd, Hh);
    if (lvl === 0) {
      x.fillStyle = PAL.woodDD; x.fillRect(1, yard - 2, Wd - 2, 4);
      x.fillStyle = cl(S.body); x.fillRect(2, yard - 1, Wd - 4, 2);
      x.fillStyle = cl(S.hi); x.fillRect(2, yard - 1, Wd - 4, 1);
      x.fillStyle = cl(S.seam); for (let i = 4; i < Wd - 3; i += 5) x.fillRect(i, yard - 1, 1, 2);
    } else {
      const half = (S.w - 1) / 2;
      for (let i = 1; i <= S.w; i++) {
        const tt = (i - 0.5 - half) / half, bul = Math.max(0, Math.round(D * (1 - tt * tt)));
        let top = yard - bul;
        if (S.tatter && hash2(i, 5) < 0.3) top += 1 + Math.floor(hash2(i, 9) * 2);
        for (let y = top; y < yard; y++) {
          const k = (yard - y) / Math.max(1, bul);
          let c = k > 0.82 ? S.hi : k < 0.3 ? S.lo : S.body;
          if (S.stripe && lvl >= 2 && k > 0.38 && k < 0.66) c = S.stripe;
          if (i % 6 === 0 && k <= 0.82) c = S.seam;
          if (S.bolt && y === yard - Math.max(1, Math.round(bul * (((i >> 1) & 1) ? 0.62 : 0.38)))) c = S.bolt;
          if (S.tatter && hash2(i, y) < 0.06) continue;
          x.fillStyle = cl(c); x.fillRect(i, y, 1, 1);
        }
        x.fillStyle = S.trim || PAL.woodDD; x.fillRect(i, top - 1, 1, 1);
      }
      x.fillStyle = PAL.woodDD; x.fillRect(0, yard - 1, Wd, 3);
      x.fillStyle = S.trim || PAL.woodD; x.fillRect(1, yard, Wd - 2, 1);
    }
    this.cache.set(key, cv);
    return cv;
  }
};
function drawSails(ctx, blocks, o) {
  const lvl = clamp(Math.round(o.sail === undefined ? 3 : o.sail), 0, 3);
  const skin = o.skin !== undefined ? o.skin : sailSkin(relicsOf(blocks));
  for (const b of blocks) {
    if (b.alive === false) continue;
    if (b.p === 'jib') { drawJib(ctx, b, lvl, o, skin); continue; }
    if (b.p !== 'mast') continue;
    const cx = PAD + b.c * TILE + 4, cy = PAD + b.r * TILE + 4, q = b.q || 0, S = SAILQ[q];
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(o.yaw || 0);
    if ((q === 4 || skin === 'lantern') && !o.shadow) ctx.globalAlpha *= 0.82;
    ctx.drawImage(Sails.get(o.col, lvl, q, o.shadow, skin), -(S.w + 2) / 2, -11);
    ctx.restore();
  }
}
// trójkątny fok na bukszprycie
function drawJib(ctx, b, lvl, o, skin) {
  const cx = PAD + b.c * TILE + 4, cy = PAD + b.r * TILE + 4, q = b.q || 0;
  const S = skin ? Object.assign({}, SAILQ[q], SAIL_SKIN[skin]) : SAILQ[q], col = o.col;
  const cl = v => v === 'c' ? col.c : v === 'l' ? col.l : v === 'd' ? col.d : v;
  const side = (o.yaw || 0) >= 0 ? 1 : -1, top = cy - 12, h = 13, wmax = lvl === 0 ? 1 : 3 + lvl + (q >> 1);
  for (let j = 0; j < h; j++) {
    const w = Math.max(1, Math.round(wmax * j / (h - 1)));
    for (let i = 1; i <= w; i++) {
      ctx.fillStyle = o.shadow ? PAL.black : cl(i === w ? S.lo : j < 2 ? S.hi : S.body);
      ctx.fillRect(cx + side * i, top + j, 1, 1);
    }
  }
}
function drawFlag(ctx, x, y, rel, col, t, style) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rel);
  ctx.fillStyle = PAL.woodDD; ctx.fillRect(-1, -1, 2, 2);
  const dread = style === 'dread', pirate = col === SHIP_COLORS[COL_PIRATE] || dread, ghost = col === SHIP_COLORS[COL_GHOST];
  for (let s = 1; s <= (dread ? 9 : 7); s++) {
    const wv = Math.round(Math.sin(t * 9 - s * 0.9) * (s / 7) * 1.4);
    const w = s < 6 ? 3 : 2;
    if (ghost && (s === 4 || s === 7) && Math.sin(t * 3 + s) > 0) continue;
    ctx.fillStyle = pirate ? (s === 3 || s === 4 ? (dread ? PAL.red2 : PAL.white) : PAL.black) : s === 1 ? col.d : (s & 1) ? col.c : col.l;
    ctx.fillRect(-1 + wv, -s - 1, w, 1);
  }
  ctx.restore();
}

// ikony części do stoczni (16x16)
const PartIcons = {
  cache: new Map(),
  get(p, q, col) {
    q = q || 0; col = col || SHIP_COLORS[0];
    const key = p + q + col.c;
    let c = this.cache.get(key); if (c) return c;
    const [cv, x] = makeCanvas(16, 16);
    const ox = 4, oy = 4, P = PARTS[p], metal = P.mat === 'metal', M = metal ? METALS[P.metal || 'iron'] : null, D = metal ? null : deckOf(p);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const edge = i === 0 || j === 0 || i === 7 || j === 7, rail = !edge && (i === 1 || j === 1 || i === 6 || j === 6);
      if ((i === 0 || i === 7) && (j === 0 || j === 7)) continue;
      x.fillStyle = edge ? (metal ? M.edge : D.edge) : rail ? (metal ? M.rail : D.rail) : metal ? metalColor(M, i, j, i + 40, j + 9) : deckColor(D, i + 40, j + 9);
      x.fillRect(ox + i, oy + j, 1, 1);
    }
    const oc = ovlCol(col, q);
    if (P.w && WEAPONS[P.w].side) drawOverlay(x, OVL[p] || OVL.cannon, ox, oy, oc, 'U');
    else if (OVL[p]) drawOverlay(x, OVL[p], ox, oy, oc, 'U');
    if (GUN_SHAPE[p] && p !== 'swivel') drawBarrel(x, ox + 4, oy + 4, 'U', 0, p, q);
    if (p === 'swivel') drawSwivel(x, ox + 4, oy + 4, -Math.PI / 4, 0, q);
    if (p === 'oars') { pline(x, ox + 2, oy + 4, ox - 3, oy + 6, PAL.woodL); x.fillStyle = OARQ[q]; x.fillRect(ox - 4, oy + 5, 2, 3); }
    if (p === 'rudder') { pline(x, ox + 4, oy + 7, ox + 4, oy + 11, PAL.woodDD, 2); pline(x, ox + 4, oy + 7, ox + 4, oy + 10, q >= 2 ? GUNQ[q].b : PAL.woodD); }
    if (p === 'ram') {
      const R = RAMQ[q];
      for (let s = 0; s < 4; s++) for (let i = RAM_SPIKE[s][0]; i <= RAM_SPIKE[s][1]; i++) {
        x.fillStyle = (i === RAM_SPIKE[s][0] || i === RAM_SPIKE[s][1] || s === 3) ? R[2] : (i === 3 ? R[1] : R[0]);
        x.fillRect(ox + i, oy - 1 - s, 1, 1);
      }
    }
    if (p === 'jib') {
      pline(x, ox + 4, oy + 3, ox + 4, oy - 3, PAL.woodL);
      const bd = SAILQ[q].body;
      for (let j = 0; j < 6; j++) for (let i = 1; i <= Math.round(j * 0.8) + 1; i++) { x.fillStyle = j < 1 ? PAL.white : bd === 'c' ? col.c : bd; x.fillRect(ox + 4 + i, oy - 3 + j, 1, 1); }
    }
    if (p === 'mast') {
      const S = SAILQ[q], w = Math.min(15, Math.round(S.w / 2)), yard = oy + 6, cl = v => v === 'c' ? col.c : v === 'l' ? col.l : v === 'd' ? col.d : v;
      const x0 = 8 - Math.floor(w / 2), bulge = 2 + (q >= 2 ? 1 : 0);
      for (let i = 0; i < w; i++) {
        const tt = (i - (w - 1) / 2) / ((w - 1) / 2), bul = Math.round(bulge * (1 - tt * tt));
        for (let y = yard - bul; y < yard; y++) { x.fillStyle = cl(y === yard - bul ? S.hi : (y === yard - 2 && S.stripe ? S.stripe : S.body)); x.fillRect(x0 + i, y, 1, 1); }
      }
      x.fillStyle = PAL.woodDD; x.fillRect(x0 - 1, yard, w + 2, 2);
      x.fillStyle = S.trim || PAL.woodD; x.fillRect(x0, yard, w, 1);
    }
    if (hasQ(p)) drawGem(x, ox, oy, q);
    this.cache.set(key, cv);
    return cv;
  }
};
