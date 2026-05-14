// Server-side game engine. Pure-ish: takes a state object and mutates/returns
// it. No globals, no DOM. Mirrors the rules implemented in js/engine.js but
// exposed as ESM with state passed explicitly.

import { createPlayerDeck, createGoalDeck } from './deck.js';
import {
  HAND_SIZE, WIN_THRESHOLD, WILD,
  DISTINCT_SUITS_REQUIRED, maxRoundsFor, dummyCountFor,
} from './constants.js';

// -------- state construction --------

export function createGameState(numPlayers, playerNames = []) {
  const state = {
    numPlayers,
    maxRounds: maxRoundsFor(numPlayers),
    currentRound: 0,
    parentIdx: 0,
    players: [],
    dummies: [],
    goalDeck: createGoalDeck(),
    goalCard: null,
    log: [],
    winnerId: null,
    phase: 'ready',                    // ready | reveal | bidding | battleEnd | gameOver
    field: [],
    positions: [],
    currentTurnPlayerId: null,
    battleEndCounts: { scoreOut: 0, lastStanding: 0, allDropped: 0 },
    pendingSimChoices: new Set(),      // set of seat indices still to pick
  };

  for (let i = 0; i < numPlayers; i++) {
    state.players.push({
      id: i,
      name: playerNames[i] || `P${i + 1}`,
      isHuman: true,
      deck: createPlayerDeck(),
      hand: [],
      goalCards: [],
      droppedOut: false,
      simChoice: null,
    });
  }

  const dc = dummyCountFor(numPlayers);
  for (let i = 0; i < dc; i++) {
    state.dummies.push({ id: `D${i + 1}`, deck: createPlayerDeck(), revealed: null });
  }

  for (const p of state.players) drawToHand(p);
  return state;
}

export function drawToHand(player) {
  while (player.hand.length < HAND_SIZE && player.deck.length > 0) {
    player.hand.push(player.deck.shift());
  }
}

// -------- battle lifecycle --------

export function startNewBattle(state) {
  state.currentRound++;
  state.phase = 'reveal';
  state.field = [];
  state.positions = state.players.map(p => ({ playerId: p.id, value: 0, placedAt: 0 }));
  state.currentTurnPlayerId = null;

  for (const p of state.players) {
    p.droppedOut = false;
    p.simChoice = null;
    drawToHand(p);
  }

  if (state.goalDeck.length === 0) state.goalDeck = createGoalDeck();
  state.goalCard = state.goalDeck.shift();

  state.pendingSimChoices = new Set();
  for (const p of state.players) {
    if (p.hand.length > 0) state.pendingSimChoices.add(p.id);
  }

  // Reveal dummies
  for (const d of state.dummies) {
    d.revealed = d.deck.length > 0 ? d.deck.shift() : null;
    if (d.revealed) {
      state.field.push({ playerId: d.id, card: d.revealed, fromDummy: true });
    }
  }
}

export function submitSimChoice(state, playerId, cardIdx) {
  if (state.phase !== 'reveal') return { error: 'not in reveal phase' };
  const player = state.players[playerId];
  if (!player) return { error: 'invalid player' };
  if (!state.pendingSimChoices.has(playerId)) return { error: 'already submitted or no hand' };
  if (cardIdx == null || cardIdx < 0 || cardIdx >= player.hand.length) {
    return { error: 'invalid card index' };
  }

  player.simChoice = player.hand[cardIdx];
  state.pendingSimChoices.delete(playerId);

  if (state.pendingSimChoices.size === 0) {
    processSimultaneousReveal(state);
    return { processed: true };
  }
  return { processed: false, remaining: state.pendingSimChoices.size };
}

export function processSimultaneousReveal(state) {
  // Place sim cards on field first (everyone visible)
  for (const p of state.players) {
    if (!p.simChoice) continue;
    const idx = p.hand.indexOf(p.simChoice);
    if (idx >= 0) p.hand.splice(idx, 1);
    state.field.push({ playerId: p.id, card: p.simChoice, fromDummy: false });
  }

  // Score in parent-first order
  let placeCounter = 0;
  for (let k = 0; k < state.players.length; k++) {
    const idx = (state.parentIdx + k) % state.players.length;
    const p = state.players[idx];
    if (!p.simChoice) {
      placeCounter++;
      state.positions[idx] = { playerId: p.id, value: 0, placedAt: placeCounter };
      p.droppedOut = true;
      continue;
    }
    const score = computeScore(state, p.simChoice, true);
    placeCounter++;
    state.positions[idx] = { playerId: p.id, value: score, placedAt: placeCounter };
  }

  // Wild "draw" effect
  for (const p of state.players) {
    if (p.simChoice && p.simChoice.suit === WILD && p.simChoice.effect === 'draw') {
      if (p.deck.length > 0) p.hand.push(p.deck.shift());
    }
  }

  for (const p of state.players) p.simChoice = null;

  state.phase = 'bidding';
  determineNextBidder(state);
}

export function computeScore(state, card, excludeOwn = false) {
  if (card.suit === WILD) {
    if (card.effect === 'round') return state.currentRound;
    return card.value;
  }
  const goalSuit = state.goalCard.suit;
  let same = 0;
  for (const f of state.field) {
    if (f.card.suit === card.suit) same++;
  }
  if (excludeOwn) same--;
  let score = card.value + same;
  if (card.suit === goalSuit) score += 1;
  return score;
}

export function determineNextBidder(state) {
  const active = state.positions.filter(pos => !state.players[pos.playerId].droppedOut);
  if (active.length === 0) return endBattle(state, null, 'allDropped');
  if (active.length === 1) return endBattle(state, active[0].playerId, 'lastStanding');

  let lowest = active[0];
  for (const c of active) {
    if (c.value < lowest.value) lowest = c;
    else if (c.value === lowest.value && c.placedAt > lowest.placedAt) lowest = c;
  }
  state.currentTurnPlayerId = lowest.playerId;
}

// -------- bidding-phase actions --------

export function playCard(state, playerId, cardIdx) {
  if (state.phase !== 'bidding') return { error: 'not in bidding phase' };
  if (state.currentTurnPlayerId !== playerId) return { error: 'not your turn' };
  const player = state.players[playerId];
  const card = player.hand[cardIdx];
  if (!card) return { error: 'invalid card' };

  player.hand.splice(cardIdx, 1);
  const pos = state.positions.find(p => p.playerId === playerId);

  const score = computeScore(state, card);
  state.field.push({ playerId, card, fromDummy: false });
  pos.value += score;

  let maxPA = 0;
  for (const p of state.positions) if (p.placedAt > maxPA) maxPA = p.placedAt;
  pos.placedAt = maxPA + 1;

  if (card.suit === WILD && card.effect === 'draw') {
    if (player.deck.length > 0) player.hand.push(player.deck.shift());
  }

  if (pos.value >= WIN_THRESHOLD) {
    endBattle(state, playerId, 'scoreOut');
    return { ok: true };
  }
  return { ok: true };
}

export function canEndTurn(state, playerId) {
  const myPos = state.positions.find(p => p.playerId === playerId);
  if (!myPos) return false;
  const others = state.positions
    .filter(p => p.playerId !== playerId && !state.players[p.playerId].droppedOut);
  if (others.length === 0) return false;
  const minOther = Math.min.apply(null, others.map(p => p.value));
  return myPos.value > minOther;
}

export function endTurn(state, playerId) {
  if (state.phase !== 'bidding') return { error: 'not in bidding phase' };
  if (state.currentTurnPlayerId !== playerId) return { error: 'not your turn' };
  if (!canEndTurn(state, playerId)) return { error: '最低値を脱出していないとターン終了できません' };
  determineNextBidder(state);
  return { ok: true };
}

export function dropOut(state, playerId, opts = {}) {
  // opts.force allows the room to drop a disconnected player without
  // requiring it to be their turn (used on disconnect mid-bidding).
  if (state.phase !== 'bidding') return { error: 'not in bidding phase' };
  if (!opts.force && state.currentTurnPlayerId !== playerId) {
    return { error: 'not your turn' };
  }
  const player = state.players[playerId];
  if (player.droppedOut) return { error: 'already dropped' };
  player.droppedOut = true;
  determineNextBidder(state);
  return { ok: true };
}

export function endBattle(state, winnerId, reason) {
  state.phase = 'battleEnd';
  state.currentTurnPlayerId = null;
  if (reason && state.battleEndCounts) {
    state.battleEndCounts[reason] = (state.battleEndCounts[reason] || 0) + 1;
  }

  if (winnerId !== null && winnerId !== undefined) {
    const w = state.players[winnerId];
    w.goalCards.push(state.goalCard);
    state.parentIdx = winnerId;

    if (checkInstantWin(w)) {
      state.phase = 'gameOver';
      state.winnerId = winnerId;
      return;
    }
  }

  if (state.currentRound >= state.maxRounds) {
    let best = null, bestScore = -1, bestCount = -1;
    for (const p of state.players) {
      const total = p.goalCards.reduce((s, c) => s + c.value, 0);
      if (total > bestScore || (total === bestScore && p.goalCards.length > bestCount)) {
        bestScore = total;
        bestCount = p.goalCards.length;
        best = p;
      }
    }
    state.phase = 'gameOver';
    state.winnerId = best.id;
  }
  // Else: caller proceeds to startNewBattle.
}

export function checkInstantWin(player) {
  const cards = player.goalCards;
  if (cards.length === 0) return false;
  const suitCount = {};
  for (const c of cards) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
  for (const c of Object.values(suitCount)) if (c >= 3) return true;
  if (Object.keys(suitCount).length >= DISTINCT_SUITS_REQUIRED) return true;
  return false;
}

// -------- per-player view (filters opponents' hands) --------

export function serializeStateFor(state, viewerSeat) {
  return {
    phase: state.phase,
    currentRound: state.currentRound,
    maxRounds: state.maxRounds,
    parentIdx: state.parentIdx,
    goalCard: state.goalCard,
    field: state.field,
    positions: state.positions,
    currentTurnPlayerId: state.currentTurnPlayerId,
    winnerId: state.winnerId,
    battleEndCounts: state.battleEndCounts,
    pendingSimChoices: Array.from(state.pendingSimChoices || []),
    dummies: state.dummies.map(d => ({ id: d.id, revealed: d.revealed, remaining: d.deck.length })),
    players: state.players.map(p => {
      const isSelf = p.id === viewerSeat;
      return {
        id: p.id,
        name: p.name,
        droppedOut: p.droppedOut,
        goalCards: p.goalCards,
        deckCount: p.deck.length,
        handCount: p.hand.length,
        // Reveal hand only to its owner. Reveal simChoice to its owner only,
        // or to everyone once we leave the reveal phase.
        hand: isSelf ? p.hand : null,
        simChoice: (isSelf || state.phase !== 'reveal') ? p.simChoice : null,
        // During reveal phase, opponents see a boolean instead of the card itself.
        simSubmitted: !!p.simChoice,
      };
    }),
    yourSeat: viewerSeat,
  };
}
