// Room state machine. One per active room.
// Phases: 'lobby' -> 'playing' -> 'ended'

import { deleteRoom } from './rooms.js';
import {
  createGameState, startNewBattle,
  submitSimChoice, playCard, endTurn, dropOut,
  serializeStateFor,
} from './engine.js';

let _pidCounter = 0;
function newPlayerId() {
  return `p${Date.now().toString(36)}_${(++_pidCounter).toString(36)}`;
}

const MAX_PLAYERS = 8;       // cap so clients don't accidentally create huge rooms
const MIN_PLAYERS = 2;

export class Room {
  constructor(code) {
    this.code = code;
    this.phase = 'lobby';                  // 'lobby' | 'playing' | 'ended'
    this.players = new Map();              // playerId -> { id, name, ws, seat, connected }
    this.hostId = null;
    this.createdAt = Date.now();
    this.gameState = null;                 // populated when game starts
  }

  // ---------- player management ----------

  addPlayer(ws, name) {
    if (this.phase !== 'lobby') {
      sendError(ws, 'this room has already started a game');
      return null;
    }
    if (this.players.size >= MAX_PLAYERS) {
      sendError(ws, `room is full (max ${MAX_PLAYERS})`);
      return null;
    }
    const id = newPlayerId();
    const player = {
      id,
      name: ((name || '').trim() || 'プレイヤー').slice(0, 16),
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

    if (this.hostId === playerId) {
      const next = this.players.values().next().value;
      this.hostId = next ? next.id : null;
    }

    // Re-pack seat indices (lobby only — once playing, seats are frozen)
    if (this.phase === 'lobby') {
      let seat = 0;
      for (const pl of this.players.values()) pl.seat = seat++;
    }

    if (this.players.size === 0) {
      deleteRoom(this.code);
    }
  }

  handleDisconnect(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = false;

    if (this.phase === 'lobby') {
      this.removePlayer(playerId);
      this.broadcastLobby();
      return;
    }

    if (this.phase === 'playing') {
      // Auto-act for the disconnected player so the game doesn't stall.
      if (this.gameState.phase === 'reveal' &&
          this.gameState.pendingSimChoices.has(p.seat)) {
        // Submit a default sim_choice (their first card)
        const sp = this.gameState.players[p.seat];
        if (sp && sp.hand.length > 0) {
          submitSimChoice(this.gameState, p.seat, 0);
        } else {
          // Empty hand — already auto-dropped at battle start
          this.gameState.pendingSimChoices.delete(p.seat);
        }
        this._afterAction();
      } else if (this.gameState.phase === 'bidding') {
        // If it's their turn, force-drop. If not, mark for auto-drop next turn.
        const sp = this.gameState.players[p.seat];
        if (sp && !sp.droppedOut) {
          dropOut(this.gameState, p.seat, { force: true });
          this._afterAction();
        }
      }
      this.broadcastLobby();
    }
  }

  // ---------- game start ----------

  startGame(playerId) {
    const ws = this.players.get(playerId)?.ws;
    if (this.phase !== 'lobby') return sendError(ws, 'game already started');
    if (playerId !== this.hostId) return sendError(ws, 'only the host can start the game');
    if (this.players.size < MIN_PLAYERS) {
      return sendError(ws, `${MIN_PLAYERS}人以上で開始できます`);
    }

    // Snapshot seat order from current player order
    const seated = Array.from(this.players.values());
    const names = seated.map(p => p.name);
    this.gameState = createGameState(seated.length, names);
    this.phase = 'playing';

    startNewBattle(this.gameState);

    this.broadcast({ type: 'game_started', numPlayers: seated.length });
    this.broadcastState();
  }

  // ---------- per-player actions ----------

  handleAction(playerId, action) {
    const player = this.players.get(playerId);
    if (!player) return;
    const ws = player.ws;
    if (this.phase !== 'playing') return sendError(ws, 'no active game');

    const seat = player.seat;
    const gs = this.gameState;
    let result;

    switch (action.type) {
      case 'sim_choice':
        result = submitSimChoice(gs, seat, action.cardIdx);
        break;
      case 'play_card':
        result = playCard(gs, seat, action.cardIdx);
        break;
      case 'end_turn':
        result = endTurn(gs, seat);
        break;
      case 'drop':
        result = dropOut(gs, seat);
        break;
      default:
        return sendError(ws, `unknown action: ${action.type}`);
    }

    if (result && result.error) return sendError(ws, result.error);
    this._afterAction();
  }

  // After any state-changing action: broadcast new state, then advance
  // automatically if a battle ended (start the next one) or end the game.
  _afterAction() {
    const gs = this.gameState;

    if (gs.phase === 'gameOver') {
      this.phase = 'ended';
      this.broadcastState();
      this.broadcast({
        type: 'game_over',
        winnerSeat: gs.winnerId,
        winnerName: gs.players[gs.winnerId]?.name,
      });
      return;
    }

    if (gs.phase === 'battleEnd') {
      // Broadcast end-of-battle snapshot, then start the next.
      this.broadcastState();
      // Small server-side pause so clients can render the result animation.
      setTimeout(() => {
        if (this.phase !== 'playing') return;
        startNewBattle(gs);
        this.broadcastState();
      }, 1500);
      return;
    }

    this.broadcastState();
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

  // Send each player a state filtered to their own view (own hand visible, others hidden).
  broadcastState() {
    if (!this.gameState) return;
    for (const p of this.players.values()) {
      if (!p.connected || p.ws.readyState !== 1) continue;
      const view = serializeStateFor(this.gameState, p.seat);
      try {
        p.ws.send(JSON.stringify({ type: 'state', state: view }));
      } catch {}
    }
  }

  broadcast(message, exceptPlayerId = null) {
    const payload = JSON.stringify(message);
    for (const p of this.players.values()) {
      if (p.id === exceptPlayerId) continue;
      if (p.ws.readyState !== 1) continue;
      try { p.ws.send(payload); } catch {}
    }
  }

  sendTo(playerId, message) {
    const p = this.players.get(playerId);
    if (p && p.ws.readyState === 1) {
      try { p.ws.send(JSON.stringify(message)); } catch {}
    }
  }
}

export function sendError(ws, message) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify({ type: 'error', message })); } catch {}
  }
}
