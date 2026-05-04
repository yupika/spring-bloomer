// WebSocket message router.

import { createRoom, getRoom } from './rooms.js';
import { Room, sendError } from './room.js';

export function handleMessage(ws, msg) {
  if (!msg || typeof msg.type !== 'string') {
    return sendError(ws, 'invalid message: missing type');
  }

  switch (msg.type) {
    case 'create_room':   return handleCreate(ws, msg);
    case 'join_room':     return handleJoin(ws, msg);
    case 'leave_room':    return handleLeave(ws);
    case 'start_game':    return handleStart(ws);
    case 'sim_choice':
    case 'play_card':
    case 'end_turn':
    case 'drop':
      return handleGameAction(ws, msg);
    default:
      return sendError(ws, `unknown message type: ${msg.type}`);
  }
}

function handleCreate(ws, msg) {
  if (ws.data.roomCode) {
    return sendError(ws, 'already in a room; leave first');
  }
  const room = createRoom(Room);
  const player = room.addPlayer(ws, msg.name);
  if (!player) return; // error already sent
  ws.send(JSON.stringify({
    type: 'joined',
    yourId: player.id,
    ...room.lobbySnapshot(),
  }));
}

function handleJoin(ws, msg) {
  if (ws.data.roomCode) {
    return sendError(ws, 'already in a room; leave first');
  }
  const code = (msg.code || '').toUpperCase().trim();
  if (!code) return sendError(ws, 'room code is required');

  const room = getRoom(code);
  if (!room) return sendError(ws, `room ${code} not found`);

  const player = room.addPlayer(ws, msg.name);
  if (!player) return;

  ws.send(JSON.stringify({
    type: 'joined',
    yourId: player.id,
    ...room.lobbySnapshot(),
  }));
  // Notify everyone else
  room.broadcast({ type: 'room_update', ...room.lobbySnapshot() }, player.id);
}

function handleLeave(ws) {
  const code = ws.data.roomCode;
  if (!code) return; // not in a room, no-op
  const room = getRoom(code);
  if (!room) {
    ws.data.roomCode = null;
    ws.data.playerId = null;
    return;
  }
  const playerId = ws.data.playerId;
  room.removePlayer(playerId);
  ws.data.roomCode = null;
  ws.data.playerId = null;
  ws.send(JSON.stringify({ type: 'left' }));
  room.broadcastLobby();
}

function handleStart(ws) {
  const code = ws.data.roomCode;
  if (!code) return sendError(ws, 'not in a room');
  const room = getRoom(code);
  if (!room) return sendError(ws, 'room not found');
  room.startGame(ws.data.playerId);
}

function handleGameAction(ws, msg) {
  const code = ws.data.roomCode;
  if (!code) return sendError(ws, 'not in a room');
  const room = getRoom(code);
  if (!room) return sendError(ws, 'room not found');
  room.handleAction(ws.data.playerId, msg);
}
