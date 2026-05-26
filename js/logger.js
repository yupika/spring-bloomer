'use strict';
// Game event logger + remote send.
// - UID generated on first visit, stored in localStorage (anonymous).
// - Opt-in state in localStorage; default ON with explicit notice in UI.
// - Silent simulation runs are NEVER logged.
// - Sends one POST per finished game (game_end), not per event.

// Deployed Cloudflare Worker URL. Swap to a custom subdomain
// (e.g. api-bloom.dilettantegames.net) once the DNS/route is wired.
const API_ORIGIN = 'https://spring-bloomer-api.yupika-iris.workers.dev';

const APP_VERSION = 'v0.3';
const UID_KEY    = 'bloomer-uid';
const OPTIN_KEY  = 'bloomer-log-optin';

function _shouldLog() {
  // Don't log silent simulation runs
  return typeof state !== 'undefined' && !state.silent;
}

function getLogUid() {
  let uid = localStorage.getItem(UID_KEY);
  if (!uid) {
    uid = (crypto.randomUUID && crypto.randomUUID()) || _fallbackUuid();
    localStorage.setItem(UID_KEY, uid);
  }
  return uid;
}

function _fallbackUuid() {
  // RFC4122 v4 fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function isLogOptedIn() {
  const v = localStorage.getItem(OPTIN_KEY);
  return v === null ? true : v === '1'; // default ON
}

function setLogOptIn(v) {
  localStorage.setItem(OPTIN_KEY, v ? '1' : '0');
}

// Per-game buffer
let _buffer = null;
let _meta   = null;

function logGameStart(numPlayers, parentIdx) {
  if (!_shouldLog()) return;
  _buffer = [];
  const mode    = (typeof state !== 'undefined' && state.mode)    || 'single';
  const mySeat  = (typeof state !== 'undefined' && state.mySeat != null) ? state.mySeat : 0;
  const seats   = (typeof state !== 'undefined' && Array.isArray(state.players))
    ? state.players.map(p => ({ id: p.id, name: p.name, is_human: !!p.isHuman }))
    : [];
  _meta = { started_at: Date.now(), num_players: numPlayers, mode, my_seat: mySeat };
  logEvent('game_start', { num_players: numPlayers, parent_idx: parentIdx, mode, my_seat: mySeat, seats });
}

function logEvent(type, data) {
  if (!_shouldLog() || !_buffer) return;
  const ev = { type, t: Date.now() };
  if (data) Object.assign(ev, data);
  _buffer.push(ev);
}

function logGameEnd(meta) {
  if (!_shouldLog() || !_buffer) return;
  logEvent('game_end', meta);

  if (!isLogOptedIn()) {
    _buffer = null; _meta = null;
    return;
  }

  const payload = {
    uid:           getLogUid(),
    app_version:   APP_VERSION,
    num_players:   _meta.num_players,
    num_battles:   meta.num_battles,
    started_at:    _meta.started_at,
    ended_at:      Date.now(),
    winner_seat:   meta.winner_seat,
    win_reason:    meta.win_reason,
    winner_score:  meta.winner_score,
    mode:          _meta.mode,
    my_seat:       _meta.my_seat,
    events:        _buffer,
  };

  _buffer = null; _meta = null;

  // Fire-and-forget; do not block UI on errors.
  fetch(API_ORIGIN + '/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((err) => {
    // Quietly log to console; never break gameplay.
    if (typeof console !== 'undefined') console.warn('[logger] send failed:', err);
  });
}
