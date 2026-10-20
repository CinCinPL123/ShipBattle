'use strict';
/* =========================================================
   Połączenie z serwerem (WebSocket) albo lokalny świat offline.
   Wiadomości trafiają do skrzynki i są obsługiwane w pętli gry.
   ========================================================= */
const Net = {
  ws: null, local: null, inbox: [], handler: null, mode: null, state: 'idle', rtt: 0, pingT: 0, closeReason: '',
  canOnline() { return location.protocol === 'http:' || location.protocol === 'https:'; },
  wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + location.pathname.replace(/[^/]*$/, '') + 'ws';
  },
  connect(join, cb) {
    this.close();
    this.mode = 'online'; this.state = 'connecting'; this.inbox = []; this.closeReason = '';
    let ws;
    try { ws = new WebSocket(this.wsUrl()); } catch (e) { this.state = 'closed'; this.closeReason = 'Nie można połączyć się z serwerem'; cb && cb(false); return; }
    this.ws = ws;
    let opened = false;
    ws.onopen = () => { opened = true; this.state = 'open'; ws.send(JSON.stringify(Object.assign({ t: 'join' }, join))); cb && cb(true); };
    ws.onmessage = e => { try { this.inbox.push(JSON.parse(e.data)); } catch (err) { /* uszkodzona wiadomość */ } };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.state = 'closed';
      if (!this.closeReason) this.closeReason = opened ? 'Połączenie z serwerem zostało przerwane' : 'Serwer nie odpowiada';
      if (!opened) cb && cb(false);
    };
    ws.onerror = () => { };
  },
  // gra bez serwera: ten sam świat liczy się w przeglądarce
  startLocal(join) {
    this.close();
    this.mode = 'offline'; this.state = 'open'; this.inbox = [];
    const world = new SimWorld({ offline: true, npc: 5, hof: Store.get('hof', []), onHof: l => Store.set('hof', l) });
    this.local = { world, acc: 0, player: null };
    this.local.player = world.join(m => this.inbox.push(m), join);
  },
  send(m) {
    if (this.mode === 'offline' && this.local) { this.local.world.handle(this.local.player, m); return; }
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  },
  update(dt) {
    if (this.mode === 'offline' && this.local) {
      const L = this.local, step = 1 / TICK_HZ;
      L.acc = Math.min(L.acc + dt, 0.25);
      while (L.acc >= step) { L.world.tick(step); L.acc -= step; }
    } else if (this.state === 'open') {
      this.pingT -= dt;
      if (this.pingT <= 0) { this.pingT = 2; this.send({ t: 'ping', c: performance.now() }); }
    }
    while (this.inbox.length) {
      const m = this.inbox.shift();
      if (m.t === 'pong') { this.rtt = performance.now() - m.c; }
      if (this.handler) this.handler(m);
    }
  },
  close() {
    if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch (e) { /* już zamknięte */ } }
    this.local = null; this.state = 'idle'; this.inbox = [];
  }
};
