'use strict';
/* =========================================================
   Renderer okrętów: sprite z bloków (kadłub + element na nim),
   gładki obrys w kształcie statku, materiały, jakości,
   ruchome części (lufy, wiosła, koła, ster), żagle i bandery
   ========================================================= */
const DECKS = {
  pine: { a: '#a8644a', b: '#b86f50', c: '#c27a55', seam: '#87493a', hi: '#d08c63', knot: '#733e39', edge: PAL.woodDD, rail: PAL.woodD, rail2: '#8a4c3e' },
  oak: { a: '#6e4334', b: '#7a4a38', c: '#84513c', seam: '#4e2e27', hi: '#946048', knot: '#3e2731', edge: '#24161c', rail: '#4e2e27', rail2: '#5e382c' },
  mahog: { a: '#8a3b32', b: '#9a4436', c: '#a64c3a', seam: '#5e2424', hi: '#b8604a', knot: '#4a1c1e', edge: '#2e1418', rail: '#5e2424', rail2: '#6e2c28' },
  bamboo: { a: '#b8a850', b: '#c8b860', c: '#a89840', seam: '#7a6a30', hi: '#e0d078', knot: '#5a4a20', edge: '#3a2e14', rail: '#6a5a28', rail2: '#8a7a38' },
  ghost: { a: '#2f8a76', b: '#36a088', c: '#2a7d6c', seam: '#1a5248', hi: '#7dffc8', knot: '#12463f', edge: '#0c2e2a', rail: '#1a5248', rail2: '#22685a' }
};
const METALS = {
  iron: { edge: PAL.navy, rail: PAL.slate, rail2: PAL.steel, base: PAL.steel, alt: '#6a7a98', hi: PAL.grey, low: PAL.slate, rivet: PAL.silver },
  steel: { edge: '#2a3350', rail: '#5a6988', rail2: '#8b9bb4', base: '#8b9bb4', alt: '#9aaac2', hi: '#c0cbdc', low: '#5a6988', rivet: PAL.white },
  thorn: { edge: '#181425', rail: '#3a4466', rail2: '#5a6988', base: '#4a5574', alt: '#5a6078', hi: '#8b9bb4', low: '#2a3350', rivet: '#e43b44' }
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
// styl kadłuba: paleta pokładu albo metalu (h - rodzaj kadłuba)
const _hullStyle = new Map();
function hullStyle(h) {
  let s = _hullStyle.get(h);
  if (!s) {
    const P = PARTS[h] || PARTS.hull, metal = P.mat === 'metal';
    s = { metal, M: metal ? METALS[P.metal || 'iron'] : null, D: metal ? null : DECKS[P.deck || (P.mat === 'ghost' ? 'ghost' : 'pine')] };
    _hullStyle.set(h, s);
  }
  return s;
}
function deckOf(p) { return hullStyle(p).D; }
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
  ballista: ['...SS...', '...ww...', '...dd...', '...dd...', '.l.dd.l.', '.lkddkl.', '..kddk..', '........'],
  turret: ['..nnnn..', '.nSSSSn.', 'nSsssSSn', 'nSsxxsSn', 'nSsxxsSn', 'nSsssSSn', '.nSSSSn.', '..nnnn..'],
  tesla: ['...yy...', '..yUUy..', '.yUccUy.', '.UcWWcU.', '.UcWWcU.', '.yUccUy.', '..yUUy..', '...yy...'],
  mines: ['........', '..kkkk..', '.kxxxxk.', '.kxrrxk.', '.kxxxxk.', '.kxxxxk.', '..kddk..', '........'],
  jib: ['...dd...', '...dd...', '..kddk..', '..kbbk..', '..kbbk..', '..kddk..', '........', '........'],
  lateen: ['........', '...kk...', '..kbbk..', '..kbbk..', '...kk...', '........', '........', '........'],
  paddle: ['........', '.kkkkkk.', '.kddddk.', '.kdssdk.', '.kdssdk.', '.kddddk.', '.kkkkkk.', '........'],
  steam: ['..xxxx..', '.xssssx.', '.xsxxsx.', '.xsxxsx.', '.xssssx.', '.krrrrk.', '.kddddk.', '........'],
  armory: ['........', '.kkkkkk.', '.kSddSk.', '.kdSSdk.', '.kdSSdk.', '.kSddSk.', '.kkkkkk.', '........'],
  drum: ['..kkkk..', '.kbbbbk.', 'kbWWWWbk', 'kbWrrWbk', 'kbWrrWbk', 'kbWWWWbk', '.kbbbbk.', '..kkkk..'],
  pump: ['........', '..ssss..', '.sBBBBs.', '.sBccBs.', '.sBccBs.', '.sBBBBs.', '..ssss..', '....s...'],
  shield: ['..SSSS..', '.SwwwwS.', 'SwwTTwwS', 'SwTLLTwS', 'SwTLLTwS', 'SwwTTwwS', '.SwwwwS.', '..SSSS..'],
  crane: ['......d.', '.....dd.', '....d.d.', '...d..d.', '..kkkkd.', '.kdbbdk.', '.kkkkkk.', '........'],
  magnet: ['........', '.rr..rr.', '.rr..rr.', '.rr..rr.', '.rrrrrr.', '..rrrr..', '.SS..SS.', '........'],
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
    m: '#3a1d40', P: '#68386c', h: PAL.ghost, Y: PAL.gold, u: '#2a9df0', U: '#8fd3ff', i: '#e98bc4', c: PAL.cyan, B: PAL.blue2 };
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
// nakładki elementów rysujemy z pamięci podręcznej 8x8 - okręt ma ich kilkaset, a piksel po pikselu byłoby wolno
const _ovlSpr = new Map();
function blitOverlay(x, name, map, ox, oy, col, q, facing) {
  const key = name + '|' + col.c + '|' + (q || 0) + '|' + facing;
  let c = _ovlSpr.get(key);
  if (!c) {
    if (_ovlSpr.size > 3000) _ovlSpr.clear();
    const m = makeCanvas(8, 8); c = m[0];
    drawOverlay(m[1], map, 0, 0, ovlCol(col, q), facing);
    _ovlSpr.set(key, c);
  }
  x.drawImage(c, ox, oy);
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
const RAM_SPIKE = [[1, 6], [2, 5], [2, 5], [3, 4]];
const RAMQ = [[PAL.grey, PAL.silver, PAL.navy], [PAL.silver, PAL.white, PAL.slate], ['#c27a1f', PAL.gold, '#7a3e1c'], [PAL.gold, PAL.yellow, '#a8601a'], [PAL.ghostD, PAL.ghost, PAL.ghostDD]];

// ---------- obrys kadłuba ----------
// Kafle 8x8 układają się w schodki, więc obrys wygładzamy: rozmycie pudełkowe maski i próg 0,5
// zaokrąglają wypukłe rogi i zamieniają schodki dziobu w płynną krzywą. Parametry do strojenia:
const HULL_SMOOTH = { r: 3, passes: 2 };
const _fA = new Float32Array(SW * SH), _fT = new Float32Array(SW * SH);
function blurPass(a, tmp, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = 0; x <= r && x < w; x++) s += a[row + x];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s * inv;
      const xo = x - r, xi = x + r + 1;
      if (xo >= 0) s -= a[row + xo];
      if (xi < w) s += a[row + xi];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y <= r && y < h; y++) s += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      a[y * w + x] = s * inv;
      const yo = y - r, yi = y + r + 1;
      if (yo >= 0) s -= tmp[yo * w + x];
      if (yi < h) s += tmp[yi * w + x];
    }
  }
}
// raw: indeks bloku albo -1 dla każdego piksela; zwraca maskę po wygładzeniu (pole _fA zostaje do liczenia oświetlenia)
function smoothHull(raw) {
  const N = SW * SH, mask = new Int16Array(N).fill(-1);
  for (let i = 0; i < N; i++) _fA[i] = raw[i] >= 0 ? 1 : 0;
  for (let p = 0; p < HULL_SMOOTH.passes; p++) blurPass(_fA, _fT, SW, SH, HULL_SMOOTH.r);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = y * SW + x;
    if (_fA[i] < 0.5) continue;
    if (raw[i] >= 0) { mask[i] = raw[i]; continue; }
    // piksel dodany przy wklęsłych rogach: bierzemy blok najbliższego piksela surowej maski
    let best = -1, bd = 1e9;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= SW || yy >= SH) continue;
      const k = raw[yy * SW + xx];
      if (k >= 0 && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = k; }
    }
    mask[i] = best;
  }
  return mask;
}

// bloki: [{p, q, h, c, r, hp?, max?, broken?, burnt?, alive?}] -> {img, sil, foam}
function renderShip(blocks, col) {
  const R = relicsOf(blocks), trim = relicTrim(R);
  const occ = new Int16Array(COLS * ROWS).fill(-1);
  blocks.forEach((b, k) => { if (b.alive !== false) occ[b.r * COLS + b.c] = k; });
  const has = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS && occ[r * COLS + c] >= 0;
  const N = SW * SH, raw = new Int16Array(N).fill(-1);
  let minR = ROWS;
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]; if (b.alive === false) continue;
    const ox = PAD + b.c * TILE, oy = PAD + b.r * TILE;
    if (b.r < minR) minR = b.r;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) raw[(oy + j) * SW + ox + i] = k;
  }
  const mask = smoothHull(raw);
  // odłamane krawędzie (po zniszczeniu sąsiada) wyszczerbiają obrys
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k], br = b.alive === false ? 0 : b.broken || 0;
    if (!br) continue;
    const ox = PAD + b.c * TILE, oy = PAD + b.r * TILE;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      let cut = false;
      if ((br & 1) && j < ((hash2(ox + i, 1) * 3) | 0)) cut = true;
      if ((br & 2) && 7 - j < ((hash2(ox + i, 2) * 3) | 0)) cut = true;
      if ((br & 4) && i < ((hash2(oy + j, 3) * 3) | 0)) cut = true;
      if ((br & 8) && 7 - i < ((hash2(oy + j, 4) * 3) | 0)) cut = true;
      if (cut) mask[(oy + j) * SW + ox + i] = -1;
    }
  }
  // krawędzie: 1 = obrys, 2 = reling, 3 = zewnętrzna deska pokładu
  const ed = new Uint8Array(N);
  for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x; if (mask[i] < 0) continue;
    if (mask[i - 1] < 0 || mask[i + 1] < 0 || mask[i - SW] < 0 || mask[i + SW] < 0) ed[i] = 1;
  }
  for (let lvl = 2; lvl <= 3; lvl++) for (let y = 1; y < SH - 1; y++) for (let x = 1; x < SW - 1; x++) {
    const i = y * SW + x; if (mask[i] < 0 || ed[i]) continue;
    if (ed[i - 1] === lvl - 1 || ed[i + 1] === lvl - 1 || ed[i - SW] === lvl - 1 || ed[i + SW] === lvl - 1) ed[i] = lvl;
  }
  // oświetlenie z lewej-góry: normalna obrysu z gradientu wygładzonej maski
  const lightAt = i => {
    const gx = _fA[i + 1] - _fA[i - 1], gy = _fA[i + SW] - _fA[i - SW], l = Math.hypot(gx, gy);
    return l < 1e-4 ? 0 : (gx + gy) / (l * 1.414);
  };
  // dodatki poza obrysem: kolce pancerza, bukszpryt, kolec tarana (kolor wymuszony, indeks piksela -> kolor)
  const ovr = new Map();
  const addPx = (x, y, k, hex) => { if (x < 0 || y < 0 || x >= SW || y >= SH) return; const i = y * SW + x; if (mask[i] >= 0) return; mask[i] = k; ovr.set(i, hex); };
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]; if (b.alive === false) continue;
    const c = b.c, r = b.r, ox = PAD + c * TILE, oy = PAD + r * TILE, up = !has(c, r - 1), dn = !has(c, r + 1), lf = !has(c - 1, r), rt = !has(c + 1, r);
    if (b.p === 'ram' && up) for (let s = 0; s < 4; s++) for (let i = RAM_SPIKE[s][0]; i <= RAM_SPIKE[s][1]; i++) {
      const Rm = RAMQ[b.q || 0], li = i;
      addPx(ox + i, oy - 1 - s, k, (li === RAM_SPIKE[s][0] || li === RAM_SPIKE[s][1] || s === 3) ? Rm[2] : (li === 3 ? Rm[1] : Rm[0]));
    }
    if (b.h === 'thorn') {
      const M = METALS.thorn;
      for (const p2 of [2, 5]) {
        if (up) { addPx(ox + p2, oy - 1, k, M.hi); addPx(ox + p2, oy - 2, k, M.rivet); }
        if (dn) { addPx(ox + p2, oy + 8, k, M.hi); addPx(ox + p2, oy + 9, k, M.rivet); }
        if (lf) { addPx(ox - 1, oy + p2, k, M.hi); addPx(ox - 2, oy + p2, k, M.rivet); }
        if (rt) { addPx(ox + 8, oy + p2, k, M.hi); addPx(ox + 9, oy + p2, k, M.rivet); }
      }
    }
    // bukszpryt: cienki drąg na dziobie, o ile nie ma tam taranu, foka ani figury
    if (r === minR && c === CORE_C && up && b.p !== 'ram' && b.p !== 'jib' && b.p !== 'figure') {
      for (let s = 1; s <= 5; s++) addPx(ox + 3, oy - s, k, s === 5 ? PAL.woodDD : s & 1 ? PAL.woodD : PAL.woodDD);
    }
  }
  const [cv, x] = makeCanvas(SW, SH);
  const img = x.createImageData(SW, SH), d = img.data;
  const [sc, sx] = makeCanvas(SW, SH), simg = sx.createImageData(SW, SH), sd = simg.data;
  for (let y = 0; y < SH; y++) for (let xx = 0; xx < SW; xx++) {
    const i = y * SW + xx, k = mask[i]; if (k < 0) continue;
    const b = blocks[k], H = hullStyle(b.h || b.p), M = H.M, D = H.D, metal = H.metal;
    const li = xx - PAD - b.c * TILE, lj = y - PAD - b.r * TILE, e = ed[i];
    let c;
    if (ovr.has(i)) c = ovr.get(i);
    else if (e === 1) {
      c = trim && trim.edge ? trim.edge : metal ? M.edge : D.edge;
      const br = b.broken || 0;
      if (br && (((br & 1) && lj < 3) || ((br & 2) && lj > 4) || ((br & 4) && li < 3) || ((br & 8) && li > 4))) c = hash2(xx, y) < 0.55 ? PAL.woodL : PAL.woodD;
    } else if (e === 2) {
      const ln = lightAt(i), lit = ln > 0.3;
      // reling malowany w barwie okrętu (jaśniejszy od strony światła); pancerz i relikwie zachowują własny kolor
      c = trim && trim.rail ? (lit ? trim.rail2 : trim.rail) : metal ? (lit ? M.rail2 : M.rail) : (ln < -0.3 ? col.dd : lit ? col.c : col.d);
    } else if (e === 3) {
      const base = metal ? metalColor(M, clamp(li, 0, 7), clamp(lj, 0, 7), xx, y) : deckColor(D, xx, y);
      c = ((xx + y) & 1) ? (metal ? M.low : D.seam) : base;
    } else c = metal ? metalColor(M, clamp(li, 0, 7), clamp(lj, 0, 7), xx, y) : deckColor(D, xx, y);
    const c3 = hexRgb(c), o = i * 4;
    d[o] = c3[0]; d[o + 1] = c3[1]; d[o + 2] = c3[2]; d[o + 3] = 255;
    sd[o] = 24; sd[o + 1] = 20; sd[o + 2] = 37; sd[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); sx.putImageData(simg, 0, 0);
  // nakładki elementów
  for (let k = 0; k < blocks.length; k++) {
    const b = blocks[k]; if (b.alive === false) continue;
    const ox = PAD + b.c * TILE, oy = PAD + b.r * TILE, q = b.q || 0;
    const open = (c, r) => !has(c, r);
    const Wd = WEAPONS[PARTS[b.p].w];
    b.fc = Wd && Wd.side ? Design.facing(open, b.c, b.r) : null;
    if (Wd && Wd.side) blitOverlay(x, b.fc === 'LR' ? 'swivelLR' : OVL[b.p] ? b.p : 'cannon', b.fc === 'LR' ? OVL.swivelLR : OVL[b.p] || OVL.cannon, ox, oy, col, q, b.fc === 'LR' ? 'U' : b.fc || 'U');
    else if (b.p === 'oars' || b.p === 'paddle') { b.os = [open(b.c - 1, b.r), open(b.c + 1, b.r)]; blitOverlay(x, b.p, OVL[b.p], ox, oy, col, q, 'U'); }
    else if (OVL[b.p]) blitOverlay(x, b.p, OVL[b.p], ox, oy, col, q, 'U');
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
const GUN_SHAPE = { cannon: [7, 2], longgun: [10, 2], carro: [4, 3], firegun: [6, 2], chain: [6, 3], swivel: [5, 1], rocket: [4, 3], flame: [5, 2], bombard: [6, 4], harpoon: [8, 1], ballista: [9, 1] };
const AUTO_AIM = new Set(['swivel', 'turret']);
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
      if (p === 'harpoon' || p === 'ballista') ctx.fillStyle = s === len ? PAL.white : end ? PAL.silver : PAL.woodL;
      if (dx !== 0) ctx.fillRect(X, cy + off, 1, 1); else ctx.fillRect(cx + off, Y, 1, 1);
    }
  }
}
// krętlica i wieża: lufa obracana pod dowolnym kątem (wieża jest grubsza i dłuższa)
function drawSwivel(ctx, cx, cy, ang, rec, q, kind) {
  const G = GUNQ[q || 0], turret = kind === 'turret', len = (turret ? 7 : 5) + (q || 0), ca = Math.cos(ang), sa = Math.sin(ang);
  for (let s = 0; s <= len; s++) {
    const k = s - rec * 2;
    ctx.fillStyle = s >= len - 1 ? G.tip : G.b;
    ctx.fillRect(Math.round(cx + ca * k), Math.round(cy + sa * k), 1, 1);
    if (turret) { ctx.fillStyle = s >= len - 1 ? G.b : G.a; ctx.fillRect(Math.round(cx + ca * k - sa), Math.round(cy + sa * k + ca), 1, 1); }
  }
  ctx.fillStyle = G.a; ctx.fillRect(cx - 1, cy - 1, 2, 2);
}
const OARQ = [PAL.woodD, PAL.woodD, '#1a5a9c', '#c27a1f', PAL.ghostD];
function drawShipDyn(ctx, blocks, o) {
  const t = o.t || 0;
  for (const b of blocks) {
    if (b.alive === false) continue;
    const cx = PAD + b.c * TILE + 4, cy = PAD + b.r * TILE + 4, q = b.q || 0;
    if (AUTO_AIM.has(b.p)) drawSwivel(ctx, cx, cy, b.aim === undefined ? -Math.PI / 2 : b.aim, b.recoil || 0, q, b.p);
    else if (b.fc && GUN_SHAPE[b.p]) {
      const dir = b.fc === 'LR' ? (b.sw || 'L') : b.fc;
      drawBarrel(ctx, cx, cy, dir, (b.recoil || 0) * 2.5, b.p, q);
    } else if (b.p === 'oars' && b.os) {
      const ph = t * (2 + o.row * 7) + b.r * 0.7;
      const sw = o.row > 0.03 ? Math.round(Math.sin(ph) * 2.5) : 1;
      const dip = o.row > 0.03 ? (Math.cos(ph) > 0 ? 1 : 0) : 0, blade = OARQ[q];
      if (b.os[0]) { pline(ctx, cx - 1, cy, cx - 9 - dip, cy + sw, PAL.woodL); ctx.fillStyle = blade; ctx.fillRect(cx - 10 - dip, cy + sw - 1, 2, 3); }
      if (b.os[1]) { pline(ctx, cx, cy, cx + 8 + dip, cy + sw, PAL.woodL); ctx.fillStyle = blade; ctx.fillRect(cx + 8 + dip, cy + sw - 1, 2, 3); }
    } else if (b.p === 'paddle' && b.os) {
      // koło łopatkowe po zewnętrznej stronie burty: sześć łopat, kręci się z prędkością okrętu
      const ang0 = t * (0.8 + o.row * 9) + b.r;
      for (const side of [0, 1]) {
        if (!b.os[side]) continue;
        const wx = cx + (side ? 8 : -8), wy = cy;
        ctx.fillStyle = PAL.woodDD; ctx.fillRect(wx - 1, wy - 1, 3, 3);
        for (let s = 0; s < 6; s++) {
          const a = ang0 + s * TAU / 6, ex = wx + Math.cos(a) * 5, ey = wy + Math.sin(a) * 5;
          pline(ctx, wx, wy, ex, ey, PAL.woodL);
          ctx.fillStyle = OARQ[q] === PAL.woodD ? PAL.woodD : OARQ[q]; ctx.fillRect(Math.round(ex) - 1, Math.round(ey) - 1, 2, 2);
        }
      }
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
    } else if (b.p === 'tesla') {
      // iskry skaczące po cewce
      const ph = t * 11 + b.c * 3 + b.r * 5;
      if (Math.sin(ph) > 0.2) { const a = ph * 1.7; ctx.fillStyle = PAL.white; ctx.fillRect(Math.round(cx + Math.cos(a) * 3), Math.round(cy + Math.sin(a) * 3), 1, 1); ctx.fillStyle = PAL.cyan; ctx.fillRect(Math.round(cx + Math.cos(a + 2.4) * 4), Math.round(cy + Math.sin(a + 2.4) * 4), 1, 1); }
    } else if (b.p === 'steam' && o.row > 0.1) {
      ctx.fillStyle = Math.sin(t * 14 + b.r) > 0 ? PAL.orange : PAL.red2; ctx.fillRect(cx - 1, cy + 1, 2, 1);
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
    if (b.p === 'jib') { drawFoil(ctx, b, lvl, o, skin, 11, 4, true); continue; }
    if (b.p === 'lateen') { drawFoil(ctx, b, lvl, o, skin, 20, 6, false); continue; }
    if (b.p !== 'mast') continue;
    const cx = PAD + b.c * TILE + 4, cy = PAD + b.r * TILE + 4, q = b.q || 0, S = SAILQ[q];
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(o.yaw || 0);
    if ((q === 4 || skin === 'lantern') && !o.shadow) ctx.globalAlpha *= 0.82;
    ctx.drawImage(Sails.get(o.col, lvl, q, o.shadow, skin), -(S.w + 2) / 2, -11);
    ctx.restore();
  }
}
// żagiel trójkątny wzdłuż okrętu: fok (wierzchołek na dziobie, szerszy ku rufie) albo łaciński (ukośny, szerszy)
function drawFoil(ctx, b, lvl, o, skin, h, wBase, jib) {
  const cx = PAD + b.c * TILE + 4, cy = PAD + b.r * TILE + 4, q = b.q || 0;
  const S = skin ? Object.assign({}, SAILQ[q], SAIL_SKIN[skin]) : SAILQ[q], col = o.col;
  const cl = v => v === 'c' ? col.c : v === 'l' ? col.l : v === 'd' ? col.d : v;
  const side = (o.yaw || 0) >= 0 ? 1 : -1, top = jib ? cy - 9 : cy - 12, wmax = lvl === 0 ? 1 : wBase + lvl * (jib ? 1.5 : 1) + (q >> 1);
  if (!jib) pline(ctx, cx, top - 1, cx, top + h, o.shadow ? PAL.black : PAL.woodDD); // reja łacińska
  for (let j = 0; j < h; j++) {
    const f = j / (h - 1), w = Math.max(1, Math.round(wmax * Math.pow(f, 0.75)));
    for (let i = 1; i <= w; i++) {
      ctx.fillStyle = o.shadow ? PAL.black : cl(i === w ? S.lo : j < 2 ? S.hi : (S.stripe && lvl >= 2 && !jib && j % 6 === 3) ? S.stripe : S.body);
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

// ikony części do stoczni (16x16): element stoi na kadłubie h (domyślnie sosnowym); kadłub rysujemy jako sam kafel
const PartIcons = {
  cache: new Map(),
  get(p, q, col, h) {
    q = q || 0; col = col || SHIP_COLORS[0];
    const P = PARTS[p], base = P.cat === 'hull' ? p : (h || 'hull');
    const key = p + q + col.c + base;
    let c = this.cache.get(key); if (c) return c;
    const [cv, x] = makeCanvas(16, 16);
    const ox = 4, oy = 4, H = hullStyle(base), metal = H.metal, M = H.M, D = H.D;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const edge = i === 0 || j === 0 || i === 7 || j === 7, rail = !edge && (i === 1 || j === 1 || i === 6 || j === 6);
      if ((i === 0 || i === 7) && (j === 0 || j === 7)) continue;
      x.fillStyle = edge ? (metal ? M.edge : D.edge) : rail ? (metal ? M.rail : D.rail) : metal ? metalColor(M, i, j, i + 40, j + 9) : deckColor(D, i + 40, j + 9);
      x.fillRect(ox + i, oy + j, 1, 1);
    }
    if (P.cat === 'hull') { this.cache.set(key, cv); return cv; }
    const oc = ovlCol(col, q);
    if (P.w && WEAPONS[P.w].side) drawOverlay(x, OVL[p] || OVL.cannon, ox, oy, oc, 'U');
    else if (OVL[p]) drawOverlay(x, OVL[p], ox, oy, oc, 'U');
    if (GUN_SHAPE[p] && !AUTO_AIM.has(p)) drawBarrel(x, ox + 4, oy + 4, 'U', 0, p, q);
    if (AUTO_AIM.has(p)) drawSwivel(x, ox + 4, oy + 4, -Math.PI / 4, 0, q, p);
    if (p === 'oars') { pline(x, ox + 2, oy + 4, ox - 3, oy + 6, PAL.woodL); x.fillStyle = OARQ[q]; x.fillRect(ox - 4, oy + 5, 2, 3); }
    if (p === 'paddle') { for (let s = 0; s < 6; s++) { const a = s * TAU / 6 + 0.3; pline(x, ox - 3, oy + 4, ox - 3 + Math.cos(a) * 4, oy + 4 + Math.sin(a) * 4, PAL.woodL); } }
    if (p === 'rudder') { pline(x, ox + 4, oy + 7, ox + 4, oy + 11, PAL.woodDD, 2); pline(x, ox + 4, oy + 7, ox + 4, oy + 10, q >= 2 ? GUNQ[q].b : PAL.woodD); }
    if (p === 'ram') {
      const Rm = RAMQ[q];
      for (let s = 0; s < 4; s++) for (let i = RAM_SPIKE[s][0]; i <= RAM_SPIKE[s][1]; i++) {
        x.fillStyle = (i === RAM_SPIKE[s][0] || i === RAM_SPIKE[s][1] || s === 3) ? Rm[2] : (i === 3 ? Rm[1] : Rm[0]);
        x.fillRect(ox + i, oy - 1 - s, 1, 1);
      }
    }
    if (p === 'jib' || p === 'lateen') {
      const bd = SAILQ[q].body, h = p === 'jib' ? 6 : 8;
      for (let j = 0; j < h; j++) for (let i = 1; i <= Math.round((j + 1) * (p === 'jib' ? 0.8 : 0.9)); i++) { x.fillStyle = j < 1 ? PAL.white : bd === 'c' ? col.c : bd; x.fillRect(ox + 4 + i, oy - 3 + j, 1, 1); }
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
