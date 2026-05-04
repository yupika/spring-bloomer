// Spring Bloomer multiplayer server (Bun + WebSocket).
// One game per Bun process; routed under the path prefix /spring-bloomer
// so multiple games can sit behind a single play.<domain> Nginx host.

import { handleMessage } from './handlers.js';
import { getRoom } from './rooms.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const PATH_PREFIX = process.env.PATH_PREFIX || '/spring-bloomer';
const VERSION = '0.1.0';

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    // Health check (also useful for Nginx upstream check)
    if (url.pathname === `${PATH_PREFIX}/health`) {
      return Response.json({ ok: true, version: VERSION, prefix: PATH_PREFIX });
    }

    // WebSocket upgrade
    if (url.pathname === `${PATH_PREFIX}/ws`) {
      const success = server.upgrade(req, {
        data: { playerId: null, roomCode: null },
      });
      if (success) return;
      return new Response('upgrade failed', { status: 400 });
    }

    return new Response('not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      // ws.data is initialized in upgrade()
      console.log(`[ws] connection opened`);
    },
    message(ws, message) {
      let parsed;
      try {
        parsed = JSON.parse(typeof message === 'string' ? message : message.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'invalid JSON' }));
        return;
      }
      try {
        handleMessage(ws, parsed);
      } catch (err) {
        console.error('[ws] handler error:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'internal error' }));
      }
    },
    close(ws) {
      const { roomCode, playerId } = ws.data || {};
      console.log(`[ws] closed (room=${roomCode || '-'}, player=${playerId || '-'})`);
      if (roomCode) {
        const room = getRoom(roomCode);
        if (room && playerId) room.handleDisconnect(playerId);
      }
    },
  },
});

console.log(`[server] spring-bloomer-server v${VERSION}`);
console.log(`[server] listening on port ${PORT}, path prefix '${PATH_PREFIX}'`);
console.log(`[server] WS endpoint: ws://localhost:${PORT}${PATH_PREFIX}/ws`);
console.log(`[server] health:      http://localhost:${PORT}${PATH_PREFIX}/health`);
