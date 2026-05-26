'use strict';
// WebSocket-based multiplayer client.
// Talks to play.dilettantegames.net/spring-bloomer/ws.
// Owns lobby state + server-pushed game state adoption.

const WS_URL = 'wss://play.dilettantegames.net/spring-bloomer/ws';

const mp = {
  ws: null,
  status: 'disconnected',  // disconnected | connecting | lobby | playing | gameover
  myId: null,
  hostId: null,
  roomCode: null,
  players: [],             // [{id, name, seat, connected}]
  errorMsg: null,
  // pendingAction: ['create', name] | ['join', code, name] — set before connect,
  // executed once the socket opens.
  pendingAction: null,
};

function mpConnect(onOpen) {
  if (mp.ws && mp.ws.readyState === WebSocket.OPEN) {
    if (onOpen) onOpen();
    return;
  }
  mp.status = 'connecting';
  mp.errorMsg = null;
  renderLobbyOrSetup();

  try {
    mp.ws = new WebSocket(WS_URL);
  } catch (err) {
    mp.status = 'disconnected';
    mp.errorMsg = `接続失敗: ${err.message}`;
    renderLobbyOrSetup();
    return;
  }

  mp.ws.addEventListener('open', () => {
    if (onOpen) onOpen();
  });
  mp.ws.addEventListener('message', (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handleMpMessage(msg);
  });
  mp.ws.addEventListener('close', () => {
    const wasPlaying = mp.status === 'playing';
    mp.status = 'disconnected';
    mp.ws = null;
    if (wasPlaying) {
      mp.errorMsg = '接続が切れました';
    }
    renderLobbyOrSetup();
  });
  mp.ws.addEventListener('error', () => {
    mp.errorMsg = '接続エラー';
    renderLobbyOrSetup();
  });
}

function mpSend(obj) {
  if (!mp.ws || mp.ws.readyState !== WebSocket.OPEN) return false;
  try {
    mp.ws.send(JSON.stringify(obj));
    return true;
  } catch {
    return false;
  }
}

function mpCreateRoom(name) {
  mpConnect(() => mpSend({ type: 'create_room', name }));
}

function mpJoinRoom(code, name) {
  const upperCode = (code || '').toUpperCase().trim();
  if (!upperCode) {
    mp.errorMsg = '部屋コードを入力してください';
    renderLobbyOrSetup();
    return;
  }
  mpConnect(() => mpSend({ type: 'join_room', code: upperCode, name }));
}

function mpLeaveRoom() {
  mpSend({ type: 'leave_room' });
  resetMpClientState();
  if (mp.ws) try { mp.ws.close(); } catch {}
}

function mpStartGame() {
  mpSend({ type: 'start_game' });
}

function mpSimChoice(cardIdx) {
  mpSend({ type: 'sim_choice', cardIdx });
}

function mpPlayCard(cardIdx) {
  mpSend({ type: 'play_card', cardIdx });
}

function mpEndTurn() {
  mpSend({ type: 'end_turn' });
}

function mpDrop() {
  mpSend({ type: 'drop' });
}

function resetMpClientState() {
  mp.status = 'disconnected';
  mp.myId = null;
  mp.hostId = null;
  mp.roomCode = null;
  mp.players = [];
  mp.errorMsg = null;
  state.mode = 'single';
  state.mySeat = 0;
}

// ---------- inbound message handlers ----------

function handleMpMessage(msg) {
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'joined':       return onJoined(msg);
    case 'room_update':  return onRoomUpdate(msg);
    case 'left':         return onLeft();
    case 'game_started': return onGameStarted(msg);
    case 'state':        return onState(msg);
    case 'game_over':    return onGameOver(msg);
    case 'log':          if (typeof log === 'function') log(msg.msg || ''); return;
    case 'error':
      mp.errorMsg = msg.message || 'unknown error';
      renderLobbyOrSetup();
      return;
    default:
      console.warn('[mp] unknown message type:', msg.type, msg);
  }
}

function onJoined(msg) {
  mp.status = 'lobby';
  mp.myId = msg.yourId;
  mp.hostId = msg.hostId;
  mp.roomCode = msg.code;
  mp.players = msg.players || [];
  mp.errorMsg = null;
  state.mode = 'multi';
  renderLobbyOrSetup();
}

function onRoomUpdate(msg) {
  mp.hostId = msg.hostId;
  mp.players = msg.players || [];
  // In lobby: refresh the lobby panel. In game: render() will pick up name
  // changes through the next state push, no extra work here.
  if (mp.status === 'lobby') renderLobbyOrSetup();
}

function onLeft() {
  resetMpClientState();
  // Hide game, show setup
  $('game').classList.add('hidden');
  $('result').classList.add('hidden');
  $('setup').classList.remove('hidden');
  renderLobbyOrSetup();
}

function onGameStarted(msg) {
  mp.status = 'playing';
  // Find own seat from player list
  const self = mp.players.find(p => p.id === mp.myId);
  state.mySeat = self ? self.seat : 0;
  state.mode = 'multi';
  state.numPlayers = msg.numPlayers || mp.players.length;
  state.historySaved = false;
  // Hide setup, show game
  $('setup').classList.add('hidden');
  $('result').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('tab-nav').classList.remove('hidden');
  // First state push will follow
}

function onState(msg) {
  adoptServerState(msg.state);
  render();
}

function onGameOver(msg) {
  mp.status = 'gameover';
  // result section will be shown on next render when state.phase === 'gameOver'
  render();
}

// ---------- DOM updates for lobby/setup ----------

function renderLobbyOrSetup() {
  const onlineCta  = document.getElementById('online-cta');
  const lobbyPanel = document.getElementById('lobby-panel');
  const playerOpts = document.querySelector('#setup .player-options');
  const statusLine = document.getElementById('mp-status-line');
  const lobbyError = document.getElementById('lobby-error');

  if (!onlineCta || !lobbyPanel) return;

  if (mp.status === 'lobby') {
    // In a room, before the game starts: hide create/join, show lobby
    if (playerOpts) playerOpts.style.display = 'none';
    onlineCta.classList.add('hidden');
    lobbyPanel.classList.remove('hidden');

    document.getElementById('lobby-code').textContent = mp.roomCode || '----';

    const ul = document.getElementById('lobby-players');
    ul.innerHTML = '';
    for (const p of mp.players) {
      const li = document.createElement('li');
      if (p.id === mp.hostId) li.classList.add('host');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = p.name;
      li.appendChild(name);
      if (p.id === mp.hostId) li.insertAdjacentHTML('beforeend', '<span class="host-tag">ホスト</span>');
      if (p.id === mp.myId)   li.insertAdjacentHTML('beforeend', '<span class="you-tag">あなた</span>');
      if (!p.connected)       li.insertAdjacentHTML('beforeend', '<span class="disconnected-tag">切断中</span>');
      ul.appendChild(li);
    }

    const startBtn = document.getElementById('lobby-start-btn');
    const isHost = mp.myId === mp.hostId;
    startBtn.disabled = !isHost || mp.players.length < 2;
    startBtn.textContent = isHost
      ? (mp.players.length < 2 ? '▶ 開始（2人以上必要）' : '▶ ゲーム開始')
      : '▶ 開始（ホスト待ち）';

    lobbyError.textContent = mp.errorMsg || '';
    if (statusLine) statusLine.textContent = '';
  } else {
    // Not in a room: show normal setup options
    if (playerOpts) playerOpts.style.display = '';
    onlineCta.classList.remove('hidden');
    lobbyPanel.classList.add('hidden');

    if (statusLine) {
      if (mp.status === 'connecting') statusLine.textContent = '接続中...';
      else if (mp.errorMsg)           statusLine.textContent = mp.errorMsg;
      else                            statusLine.textContent = '';
    }
  }
}

// Map server's per-viewer state into the client-side `state` object so the
// existing render code (which reads from globals) can show it as-is.
function adoptServerState(s) {
  state.phase = s.phase;
  state.currentRound = s.currentRound;
  state.ladybugPos = s.ladybugPos;
  state.maxRounds = s.maxRounds;
  state.parentIdx = s.parentIdx;
  state.goalCard = s.goalCard;
  state.field = s.field || [];
  state.positions = s.positions || [];
  state.currentTurnPlayerId = s.currentTurnPlayerId;
  state.winnerId = s.winnerId;
  state.battleEndCounts = s.battleEndCounts;
  state.mySeat = s.yourSeat;
  state.selectedCardIdx = null;

  // Dummies: server sends {id, revealed, remaining}. Render reads .deck.length.
  state.dummies = (s.dummies || []).map(d => ({
    id: d.id,
    revealed: d.revealed,
    deck: { length: d.remaining },
  }));

  // Players: opponents get a stub hand of the right length (no cards visible).
  state.players = s.players.map(p => {
    const hand = p.hand !== null && p.hand !== undefined ? p.hand : new Array(p.handCount).fill(null);
    return {
      id: p.id,
      name: p.name,
      isHuman: true,
      droppedOut: p.droppedOut,
      goalCards: p.goalCards || [],
      deck: { length: p.deckCount || 0 },
      hand,
      simChoice: p.simChoice || null,
      simSubmitted: !!p.simSubmitted,
      personality: null,    // hide CPU personality fields in MP
      resourceMode: null,
      biddingStyle: null,
    };
  });
}
