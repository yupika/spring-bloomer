'use strict';
const state = {
  numPlayers: 0,
  players: [],
  dummies: [],
  goalDeck: [],
  goalCard: null,
  parentIdx: 0,
  currentRound: 0,
  maxRounds: 14,
  phase: 'setup', // setup | reveal | bidding | battleEnd | gameOver
  field: [], // {playerId, card, fromDummy}
  positions: [], // {playerId, value, placedAt}
  log: [],
  winnerId: null,
  selectedCardIdx: null,
  currentTurnPlayerId: null,
  cpuTimeoutId: null,
  silent: false, // when true, skip rendering and run synchronously (for sim)
};
