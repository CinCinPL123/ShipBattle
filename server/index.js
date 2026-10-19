'use strict';
/* =========================================================
   Serwer gry Drzazgi: pliki statyczne + WebSocket + pętla świata
   Konfiguracja przez zmienne środowiskowe (patrz README).
   ========================================================= */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
require('./load-shared')();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS, 10) || 40;
const NPC_COUNT = process.env.NPC_COUNT !== undefined ? parseInt(process.env.NPC_COUNT, 10) : 9;
const WORLD_SEED = parseInt(process.env.WORLD_SEED, 10) || 0;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const PUBLIC = path.join(__dirname, '..', 'public');
const HOF_FILE = path.join(DATA_DIR, 'hall-of-fame.json');

// ---------- sala sław (opcjonalnie zapisywana na dysk) ----------
function loadHof() {
  try { const v = JSON.parse(fs.readFileSync(HOF_FILE, 'utf8')); return Array.isArray(v) ? v.slice(0, 10) : []; } catch (e) { return []; }
}
let hofTimer = null;
function saveHof(list) {
  clearTimeout(hofTimer);
  hofTimer = setTimeout(() => {
    try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(HOF_FILE, JSON.stringify(list)); }
    catch (e) { console.warn('Nie zapisano sali sław:', e.message); }
  }, 1000);
}

const world = new SimWorld({ seed: WORLD_SEED || undefined, npc: NPC_COUNT, maxPlayers: MAX_PLAYERS, hof: loadHof(), onHof: saveHof });
const started = Date.now();

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
function onlineCount() { let n = 0; for (const p of world.players.values()) if (p.discT === null) n++; return n; }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (url.pathname === '/status') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, version: VERSION, players: onlineCount(), max: MAX_PLAYERS, npc: world.ships.filter(s => s.kind !== 'player').length, uptime: Math.round((Date.now() - started) / 1000), hof: world.hof }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': st.size, 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

// ---------- WebSocket ----------
// gniazdo pod /ws (także /podkatalog/ws, gdy gra stoi za proxy w podkatalogu)
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (!new URL(req.url, 'http://x').pathname.endsWith('/ws')) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, req) => {
  let player = null, budget = 60, last = Date.now();
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const send = m => {
    if (ws.readyState !== 1) return;
    if (ws.bufferedAmount > 1 << 20) return; // zbyt wolne łącze - pomijamy migawkę
    ws.send(JSON.stringify(m));
  };
  ws.on('message', (data, isBinary) => {
    // ogranicznik: ~60 wiadomości na sekundę
    const now = Date.now();
    budget = Math.min(120, budget + (now - last) * 0.06); last = now;
    if (--budget < 0 || isBinary) return;
    let m;
    try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    if (!player) {
      if (m.t !== 'join') return;
      player = world.join(send, m);
      if (!player) { setTimeout(() => ws.close(), 200); return; }
      console.log('[+] %s (%s) online: %d', player.name, req.socket.remoteAddress, onlineCount());
      return;
    }
    world.handle(player, m);
  });
  ws.on('close', () => {
    if (player) { world.leave(player); console.log('[-] %s online: %d', player.name, onlineCount()); }
    player = null;
  });
  ws.on('error', () => { });
});
// wykrywanie zerwanych połączeń
const hb = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* ignoruj */ }
  }
}, 15000);

// ---------- pętla świata (stały krok) ----------
const DT = 1 / TICK_HZ;
let acc = 0, prev = process.hrtime.bigint();
const loop = setInterval(() => {
  const now = process.hrtime.bigint();
  acc += Number(now - prev) / 1e9; prev = now;
  if (acc > 0.5) acc = 0.5; // po zawieszeniu nie nadrabiamy w nieskończoność
  while (acc >= DT) {
    try { world.tick(DT); } catch (e) { console.error('Błąd symulacji:', e); }
    acc -= DT;
  }
}, 1000 / TICK_HZ / 2);

server.listen(PORT, HOST, () => {
  console.log('Drzazgi %s: http://%s:%d  (świat %d, porty %d, wyspy %d)', VERSION, HOST, PORT, world.seed, world.ports.length, world.islands.length);
});

function shutdown() {
  console.log('Zamykanie serwera...');
  clearInterval(loop); clearInterval(hb);
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(HOF_FILE, JSON.stringify(world.hof)); } catch (e) { /* brak zapisu */ }
  for (const ws of wss.clients) ws.close(1001, 'restart');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
