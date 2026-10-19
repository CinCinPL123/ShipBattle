'use strict';
// Test sieciowy: uruchamia serwer, łączy dwóch klientów WebSocket i sprawdza przebieg gry.
const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const PORT = 39000 + Math.floor(Math.random() * 1000);
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: path.join(require('os').tmpdir(), 'drzazgi-test-' + PORT) }),
  stdio: ['ignore', 'pipe', 'inherit']
});
const fail = e => { console.error(e); srv.kill(); process.exit(1); };
const get = p => new Promise((res, rej) => http.get('http://127.0.0.1:' + PORT + p, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res({ code: r.statusCode, body: d, type: r.headers['content-type'] })); }).on('error', rej));

function client(name) {
  return new Promise((res, rej) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
    const c = { ws, msgs: [], by: {} };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, ship: 'Testowa ' + name, col: 2 })));
    ws.on('message', d => { const m = JSON.parse(d); c.msgs.push(m); (c.by[m.t] = c.by[m.t] || []).push(m); if (m.t === 'welcome') res(c); });
    ws.on('error', rej);
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

srv.stdout.on('data', async d => {
  if (!String(d).includes('http://')) return;
  try {
    assert.strictEqual((await get('/health')).body, 'ok');
    const st = JSON.parse((await get('/status')).body);
    assert.ok(st.ok && st.players === 0);
    const idx = await get('/');
    assert.strictEqual(idx.code, 200); assert.ok(idx.type.startsWith('text/html'));
    assert.strictEqual((await get('/shared/sim/world.js')).code, 200);
    assert.notStrictEqual((await get('/%2e%2e/package.json')).code, 200, 'wyjście poza public/');
    const a = await client('Ala'), b = await client('Bolek');
    const w = a.by.welcome[0];
    assert.ok(w.isl.length > 40 && w.ports.length === 8 && w.you.ship > 0 && w.token);
    a.ws.send(JSON.stringify({ t: 'in', thr: 3, turn: 0.5 }));
    a.ws.send(JSON.stringify({ t: 'chat', x: 'Ahoj!' }));
    a.ws.send('to nie jest json');
    await wait(1500);
    const snaps = a.by.s || [];
    assert.ok(snaps.length >= 15, 'za mało migawek: ' + snaps.length);
    const last = snaps[snaps.length - 1];
    const mine = last.sh.find(s => s[0] === w.you.ship);
    assert.ok(mine, 'brak własnego okrętu w migawce');
    assert.strictEqual(mine[7], 3, 'przepustnica nie dotarła do serwera');
    assert.ok((a.by.ship || []).some(m => m.id === w.you.ship), 'brak opisu własnego okrętu');
    assert.ok((b.by.feed || []).some(m => m.k === 'chat' && m.x === 'Ahoj!'), 'czat nie dotarł');
    assert.ok((a.by.map || []).length >= 1, 'brak mapy');
    // ponowne połączenie tym samym tokenem przejmuje okręt
    a.ws.close();
    await wait(300);
    const a2 = await new Promise((res, rej) => {
      const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
      ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: 'Ala', token: w.token })));
      ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'welcome') res({ ws, m }); });
      ws.on('error', rej);
    });
    assert.strictEqual(a2.m.you.ship, w.you.ship, 'po powrocie powinien być ten sam okręt');
    a2.ws.close(); b.ws.close();
    console.log('OK - migawek:', snaps.length, 'średni rozmiar:', Math.round(snaps.reduce((s, m) => s + JSON.stringify(m).length, 0) / snaps.length), 'B');
    srv.kill(); process.exit(0);
  } catch (e) { fail(e); }
});
setTimeout(() => fail(new Error('przekroczony czas testu')), 20000);
