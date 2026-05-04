// In-memory room registry. Keyed by 4-char human-friendly code.

// Avoid easily-confused characters (0/O, 1/I/L, etc.)
const ROOM_CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ23456789';
const CODE_LEN = 4;

const rooms = new Map();

export function generateRoomCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LEN; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new Error('room code generator: collision after 200 attempts');
}

export function createRoom(RoomClass) {
  const code = generateRoomCode();
  const room = new RoomClass(code);
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code) || null;
}

export function deleteRoom(code) {
  rooms.delete(code);
}

export function listRoomCodes() {
  return Array.from(rooms.keys());
}

export function roomCount() {
  return rooms.size;
}
