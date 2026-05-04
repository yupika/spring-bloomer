// Room state machine. One instance per active room.
// Phases: 'lobby' -> 'playing' -> 'ended'
// Game logic itself lives in engine.js (added in a later chunk).

import { deleteRoom } from './rooms.js';

let _pidCounter = 0;
function newPlayerId() {
  return `p${Date.now().toString(36)}_${(++_pidCounter).toString(36)}`;
}

export class Room {
  constructor(code) {
    this.code = code;
    this.phase = 'lobby';                  // 'lobby' | 'playing' | 'ended'
    this.players = new Map();              // playerId -> { id, name, ws, seat, connected }
    this.hostId = null;
    this.createdAt = Date.now();
    this.engine = null;                    // populated when game starts (next chunk)
  }

  addPlayer(ws, name) {
    if (this.phase !== 'lobby') {
      sendError(ws, 'this room has already started a game');
      return null;
    }
    const id = newPlayerId();
    const player = {
      id,
      name: (name || 'プレイヤー').slice(0, 16),
      ws,
      seat: this.players.size,
      connected: true,
    };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    ws.data.playerId = id;
    ws.data.roomCode = this.code;
    return player;
  }

  removePlayer(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);

    // Reassign host if needed
    if (this.hostId === playerId) {
      const next = this.players.values().next().value;
      this.hostId = next ? next.id : null;
    }

    // Re-pack seat indices
    let seat = 0;
    for (const pl of this.players.values()) pl.seat = seat++;

    if (this.players.size === 0) {
      // Empty room: clean up
      deleteRoom(this.code);
    }
  }

  handleDisconnect(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.phase === 'lobby') {
      // In lobby, just drop them
      this.removePlayer(playerId);
      this.broadcastLobby();
    } else if (this.phase === 'playing') {
      // In game: mark as dropped from this battle (host doesn't matter mid-game)
      p.connected = false;
      // TODO (next chunk): tell engine to mark them as dropped/auto-action
      this.broadcastLobby();
    }
  }

  startGame(playerId) {
    if (this.phase !== 'lobby') return sendError(this.players.get(playerId)?.ws, 'game already started');
    if (playerId !== this.hostId) return sendError(this.players.get(playerId)?.ws, 'only host can start the game');
    if (this.players.size < 2) return sendError(this.players.get(playerId)?.ws, '2人以上で開始できます');

    this.phase = 'playing';
    // TODO (next chunk): instantiate engine, deal cards, etc.
    this.broadcast({ type: 'game_started', playerCount: this.players.size });
    this.broadcast({ type: 'log', msg: '(ゲームロジックは次の実装で接続されます)' });
  }

  // ---------- broadcast helpers ----------

  lobbySnapshot() {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id, name: p.name, seat: p.seat, connected: p.connected,
      })),
    };
  }

  broadcastLobby() {
    this.broadcast({ type: 'room_update', ...this.lobbySnapshot() });
  }

  broadcast(message, exceptPlayerId = null) {
    const payload = JSON.stringify(message);
    for (const p of this.players.values()) {
      if (p.id === exceptPlayerId) continue;
      if (p.ws.readyState === 1) p.ws.send(payload);
    }
  }

  sendTo(playerId, message) {
    const p = this.players.get(playerId);
    if (p && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(message));
    }
  }
}

export function sendError(ws, message) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'error', message }));
  }
}
