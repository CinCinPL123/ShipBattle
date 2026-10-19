'use strict';
/* =========================================================
   DRZAZGI — wspólny rdzeń (przeglądarka i serwer):
   matematyka, losowość, szum, paleta
   ========================================================= */
const TAU = Math.PI * 2;

// Paleta (Endesga 32 + kilka odcieni pomocniczych)
const PAL = {
  black: '#181425', navy: '#262b44', slate: '#3a4466', steel: '#5a6988', grey: '#8b9bb4', silver: '#c0cbdc', white: '#ffffff',
  woodDD: '#3e2731', woodD: '#733e39', wood: '#b86f50', woodL: '#e4a672', sand: '#ead4aa', skin: '#e8b796', skinD: '#c28569',
  rust: '#be4a2f', orange2: '#d77643', red: '#a22633', red2: '#e43b44', orange: '#f77622', gold: '#feae34', yellow: '#fee761',
  green: '#63c74d', greenD: '#3e8948', greenDD: '#265c42', teal: '#193c3e',
  blue: '#124e89', blue2: '#0099db', cyan: '#2ce8f5', pink: '#ff0044', purple: '#68386c', mag: '#b55088', salmon: '#f6757a',
  ghost: '#7dffc8', ghostD: '#2a9d7c', ghostDD: '#12463f'
};

// ---------- narzędzia ----------
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const chance = p => Math.random() < p;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function angNorm(a) { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }
const angDiff = (a, b) => angNorm(b - a);
const lerpAng = (a, b, t) => a + angDiff(a, b) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
// polska odmiana liczebnikow: 1 wezel, 2 wezly, 5 wezlow
function plural(n, one, few, many) {
  n = Math.abs(Math.round(n));
  if (n === 1) return one;
  const d = n % 10, dd = n % 100;
  return (d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14)) ? few : many;
}
// kąt kursowy: 0 = w górę ekranu, rośnie zgodnie z ruchem wskazówek
const headingTo = (dx, dy) => Math.atan2(dx, -dy);
const fwdX = a => Math.sin(a), fwdY = a => -Math.cos(a);
const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  outBack: t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1
};
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

const _rgbCache = new Map();
function hexRgb(h) {
  let v = _rgbCache.get(h);
  if (!v) { const n = parseInt(h.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _rgbCache.set(h, v); }
  return v;
}
function rgba(h, a) { const c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  const c = i => Math.round(lerp(A[i], B[i], t)).toString(16).padStart(2, '0');
  return '#' + c(0) + c(1) + c(2);
}

// ---------- szum ----------
const Noise = (() => {
  const N = 256, M = 255, lat = new Float32Array(N * N), r = mulberry32(1337);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const sm = t => t * t * (3 - 2 * t);
  function v(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), w = sm(y - yi);
    const x0 = xi & M, y0 = yi & M, x1 = (xi + 1) & M, y1 = (yi + 1) & M;
    const a = lat[y0 * N + x0], b = lat[y0 * N + x1], c = lat[y1 * N + x0], d = lat[y1 * N + x1];
    const top = a + (b - a) * u, bot = c + (d - c) * u;
    return top + (bot - top) * w;
  }
  function fbm(x, y, o = 3) {
    let s = 0, a = .5, f = 1, n = 0;
    for (let i = 0; i < o; i++) { s += a * v(x * f + i * 31.7, y * f + i * 17.3); n += a; a *= .5; f *= 2; }
    return s / n;
  }
  // szum okresowy (P x Py komórek siatki) - do kafelków bez szwów
  function pv(x, y, P, seed, Py) {
    const xi = Math.floor(x), yi = Math.floor(y), u = sm(x - xi), w = sm(y - yi), s = (seed || 0) * 37;
    Py = Py || P;
    const m = (k, n) => ((k % n) + n) % n;
    const x0 = (m(xi, P) + s) & M, x1 = (m(xi + 1, P) + s) & M, y0 = (m(yi, Py) + s * 3) & M, y1 = (m(yi + 1, Py) + s * 3) & M;
    const a = lat[y0 * N + x0], b = lat[y0 * N + x1], c = lat[y1 * N + x0], d = lat[y1 * N + x1];
    const top = a + (b - a) * u, bot = c + (d - c) * u;
    return top + (bot - top) * w;
  }
  function pfbm(x, y, P, o, seed) {
    let s = 0, a = .5, f = 1, n = 0;
    for (let i = 0; i < o; i++) { s += a * pv(x * f, y * f, P * f, (seed || 0) + i * 7); n += a; a *= .5; f *= 2; }
    return s / n;
  }
  return { v, fbm, pv, pfbm };
})();
