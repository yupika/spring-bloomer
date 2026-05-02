'use strict';
// ============== Init ==============
function startGame(numPlayers) {
  state.numPlayers = numPlayers;
  state.maxRounds = ROUND_LIMITS[numPlayers];
  state.currentRound = 0;
  state.parentIdx = 0;
  state.players = [];
  state.dummies = [];
  state.goalDeck = createGoalDeck();
  state.log = [];
  state.winnerId = null;

  for (let i = 0; i < numPlayers; i++) {
    const isHuman = (i === 0) && !state.silent;
    state.players.push({
      id: i,
      name: isHuman ? 'あなた' : (state.silent ? `P${i + 1}` : `CPU ${i}`),
      isHuman,
      deck: createPlayerDeck(),
      hand: [],
      goalCards: [],
      droppedOut: false,
      simChoice: null,
      personality: isHuman ? null : rollPersonality(),
      resourceMode: isHuman ? null : rollResourceMode(),
      biddingStyle: isHuman ? null : rollBiddingStyle(),
    });
  }

  const dc = DUMMY_COUNTS[numPlayers];
  for (let i = 0; i < dc; i++) {
    state.dummies.push({
      id: `D${i + 1}`,
      deck: createPlayerDeck(),
      revealed: null,
    });
  }

  for (const p of state.players) drawToHand(p);

  startNewBattle();
  render();
}

function drawToHand(player) {
  while (player.hand.length < HAND_SIZE && player.deck.length > 0) {
    player.hand.push(player.deck.shift());
  }
}

function startNewBattle() {
  state.currentRound++;
  state.phase = 'reveal';
  state.field = [];
  state.positions = state.players.map(p => ({
    playerId: p.id, value: 0, placedAt: 0
  }));
  state.selectedCardIdx = null;
  state.currentTurnPlayerId = null;

  for (const p of state.players) {
    p.droppedOut = false;
    p.simChoice = null;
    p._committedThisBattle = 0;
    drawToHand(p);
  }

  if (state.goalDeck.length === 0) {
    state.goalDeck = createGoalDeck();
  }
  state.goalCard = state.goalDeck.shift();

  // Reveal dummies and place them on the battlefield from the start
  for (const d of state.dummies) {
    d.revealed = d.deck.length > 0 ? d.deck.shift() : null;
    if (d.revealed) {
      state.field.push({ playerId: d.id, card: d.revealed, fromDummy: true });
    }
  }

  log(`━━ Battle ${state.currentRound} 開始 ／ 親: ${state.players[state.parentIdx].name} ／ 目的: ${formatCard(state.goalCard)} (${SUIT_LABELS[state.goalCard.suit]}) ━━`, 'section');

  // CPU pre-decides their sim card
  for (const p of state.players) {
    if (!p.isHuman && p.hand.length > 0) {
      p.simChoice = cpuChooseSimultaneous(p);
    }
  }

  // In simulation mode, the human seat is also AI-driven
  if (state.silent) {
    const me = state.players[0];
    if (me && me.hand.length > 0 && !me.simChoice) {
      me.simChoice = cpuChooseSimultaneous(me);
    }
    processSimultaneousReveal();
  } else {
    // Non-silent: if human has no hand, the "出す" button stays disabled and
    // the game would stall. Auto-advance after a short delay so the player
    // can see they were dealt 0 cards before being auto-dropped.
    const me = state.players[0];
    if (me && me.hand.length === 0) {
      log(`${me.name} は手札なし → 自動で進行します`);
      setTimeout(() => {
        if (state.phase === 'reveal' && state.players[0].hand.length === 0) {
          processSimultaneousReveal();
          render();
        }
      }, 1400);
    }
  }
}

// ============== Battle phases ==============
function processSimultaneousReveal() {
  // Field already contains dummy cards (placed in startNewBattle).
  // Add player simultaneous-choice cards to the field.
  for (const p of state.players) {
    if (!p.simChoice) continue; // hand was empty
    const idx = p.hand.indexOf(p.simChoice);
    if (idx >= 0) p.hand.splice(idx, 1);
    state.field.push({ playerId: p.id, card: p.simChoice, fromDummy: false });
    log(`${p.name} → ${formatCard(p.simChoice)}`);
  }
  for (const d of state.dummies) {
    if (d.revealed) log(`ダミー${d.id} → ${formatCard(d.revealed)}`);
  }

  // Calculate initial scores. Order = parent first, then around.
  let placeCounter = 0;
  for (let k = 0; k < state.players.length; k++) {
    const idx = (state.parentIdx + k) % state.players.length;
    const p = state.players[idx];
    if (!p.simChoice) {
      // No card played; auto-drop and remain at 0
      placeCounter++;
      state.positions[idx] = { playerId: p.id, value: 0, placedAt: placeCounter };
      p.droppedOut = true;
      log(`${p.name} は手札なし → 自動的に降りる`);
      continue;
    }
    const score = computeScore(p.simChoice);
    placeCounter++;
    state.positions[idx] = { playerId: p.id, value: score, placedAt: placeCounter };
    log(`${p.name} スコア ${score} (${formatCard(p.simChoice)})`);
  }

  // Activate wild "draw" effects for sim reveal
  for (const p of state.players) {
    if (p.simChoice && p.simChoice.suit === WILD && p.simChoice.effect === 'draw') {
      if (p.deck.length > 0) {
        const drawn = p.deck.shift();
        p.hand.push(drawn);
        log(`${p.name} が +引 効果でデッキから1枚引いた`);
      } else {
        log(`${p.name} の +引 効果（デッキ切れで引けず）`);
      }
    }
  }

  for (const p of state.players) p.simChoice = null;

  state.phase = 'bidding';
  determineNextBidder();
}

// Compute score for placing/playing a card. The caller controls whether
// "own" is counted by deciding when to place the card on state.field:
//   - Sim reveal: place all cards on field FIRST, then compute (own counted).
//   - Turn play: compute FIRST, then place (own NOT counted).
// Wild cards never receive the +1 goal-suit bonus and are never counted
// in the same-suit field count.
function computeScore(card) {
  if (card.suit === WILD) {
    if (card.effect === 'round') return state.currentRound;
    // 'stack' effect produces an absolute jump, handled in playCard;
    // for sim reveal it contributes 0 (no other player can be "above" in a
    // useful way during simultaneous placement).
    if (card.effect === 'stack') return 0;
    // 'draw' wild and the plain 6 just use face value.
    return card.value;
  }
  const goalSuit = state.goalCard.suit;
  let same = 0;
  for (const f of state.field) {
    if (f.card.suit === card.suit) same++;
  }
  let score = card.value + same;
  if (card.suit === goalSuit) score += 1;
  return score;
}

function determineNextBidder() {
  // Active = not dropped
  const active = state.positions.filter(pos => !state.players[pos.playerId].droppedOut);

  if (active.length === 0) {
    endBattle(null);
    return;
  }
  if (active.length === 1) {
    endBattle(active[0].playerId);
    return;
  }

  // Lowest value, tie-break: latest placedAt wins (chip on top → goes first)
  let lowest = active[0];
  for (const c of active) {
    if (c.value < lowest.value) lowest = c;
    else if (c.value === lowest.value && c.placedAt > lowest.placedAt) lowest = c;
  }

  state.currentTurnPlayerId = lowest.playerId;
  const player = state.players[lowest.playerId];

  if (!player.isHuman) {
    if (state.silent) {
      cpuTakeTurn(player.id);
    } else {
      if (state.cpuTimeoutId) clearTimeout(state.cpuTimeoutId);
      state.cpuTimeoutId = setTimeout(() => cpuTakeTurn(player.id), 800);
    }
  }
  if (!state.silent) render();
}

function humanPlay(cardIdx) {
  if (state.phase === 'reveal') {
    // Lock in human's sim choice and process
    const me = state.players[0];
    const card = me.hand[cardIdx];
    if (!card) return;
    me.simChoice = card;
    state.selectedCardIdx = null;
    processSimultaneousReveal();
  } else if (state.phase === 'bidding' && state.currentTurnPlayerId === 0) {
    state.selectedCardIdx = null;
    playCard(0, cardIdx);
    // playCard does NOT advance turn — human retains turn and can play more
  }
}

function humanEndTurn() {
  if (state.phase === 'bidding' && state.currentTurnPlayerId === 0) {
    if (!canEndTurn(0)) return; // safety: can't end while still lowest
    state.selectedCardIdx = null;
    endTurn(0);
  }
}

function humanDrop() {
  if (state.phase === 'bidding' && state.currentTurnPlayerId === 0) {
    state.selectedCardIdx = null;
    dropOut(0);
  }
}

function playCard(playerId, cardIdx) {
  const player = state.players[playerId];
  const card = player.hand[cardIdx];
  if (!card) return;
  player.hand.splice(cardIdx, 1);
  player._committedThisBattle = (player._committedThisBattle || 0) + 1;

  const pos = state.positions.find(p => p.playerId === playerId);
  const oldValue = pos.value;
  let logLine;

  // Stack effect: jump to the next-higher player's score (no field-symbol calc)
  if (card.suit === WILD && card.effect === 'stack') {
    state.field.push({ playerId, card, fromDummy: false });
    const aboveScores = state.positions
      .filter(p => p.playerId !== playerId && p.value > pos.value)
      .map(p => p.value)
      .sort((a, b) => a - b);
    if (aboveScores.length > 0) {
      pos.value = aboveScores[0];
      logLine = `${player.name} ▷ ${formatCard(card)} (上載 ${oldValue}→${pos.value})`;
    } else {
      logLine = `${player.name} ▷ ${formatCard(card)} (上に乗るプレイヤーなし／移動なし)`;
    }
  } else {
    // Compute BEFORE pushing to field, so own card is NOT counted in same-suit
    const score = computeScore(card);
    state.field.push({ playerId, card, fromDummy: false });
    pos.value += score;
    logLine = `${player.name} ▷ ${formatCard(card)} (+${score}) → ${pos.value}`;
  }

  // Update placedAt to the latest among all positions
  let maxPA = 0;
  for (const p of state.positions) if (p.placedAt > maxPA) maxPA = p.placedAt;
  pos.placedAt = maxPA + 1;

  log(logLine);

  // Draw effect: after playing, draw 1 card from deck
  if (card.suit === WILD && card.effect === 'draw') {
    if (player.deck.length > 0) {
      const drawn = player.deck.shift();
      player.hand.push(drawn);
      log(`  └ +引 効果でデッキから1枚引いた`);
    } else {
      log(`  └ +引 効果（デッキ切れ）`);
    }
  }

  if (pos.value >= WIN_THRESHOLD) {
    log(`${player.name} が ${WIN_THRESHOLD} に到達！`, 'win');
    endBattle(playerId);
    return;
  }

  // IMPORTANT: do NOT advance the turn here. The current player retains
  // the turn and can play more cards, end turn, or drop.
  if (!state.silent) render();
}

// Explicitly end the current player's turn. Pass to next-lowest active player.
function endTurn(playerId) {
  log(`${state.players[playerId].name} ターン終了`);
  determineNextBidder();
}

// Returns true if this player can end their turn now (i.e., is strictly
// above the lowest active player). When still tied-at-lowest or strictly
// the lowest, the player must keep playing or drop.
function canEndTurn(playerId) {
  const myPos = state.positions.find(p => p.playerId === playerId);
  if (!myPos) return false;
  const others = state.positions
    .filter(p => p.playerId !== playerId && !state.players[p.playerId].droppedOut);
  if (others.length === 0) return false;
  const minOther = Math.min.apply(null, others.map(p => p.value));
  return myPos.value > minOther;
}

function dropOut(playerId) {
  const player = state.players[playerId];
  player.droppedOut = true;
  log(`${player.name} 降りた`);
  determineNextBidder();
}

function endBattle(winnerId) {
  state.phase = 'battleEnd';
  state.currentTurnPlayerId = null;

  if (winnerId !== null) {
    const w = state.players[winnerId];
    w.goalCards.push(state.goalCard);
    log(`★ ${w.name} が目的カード ${formatCard(state.goalCard)} を獲得`, 'win');
    state.parentIdx = winnerId;

    if (checkInstantWin(w)) {
      state.phase = 'gameOver';
      state.winnerId = winnerId;
      log(`🌸 ${w.name} の勝利！（即勝条件達成）`, 'win');
      if (!state.silent) render();
      return;
    }
  } else {
    log(`誰も獲得せず`);
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
    log(`規定 ${state.maxRounds} バトル終了。${best.name} が ${bestScore} 点で勝利`, 'win');
    if (!state.silent) render();
    return;
  }

  if (state.silent) {
    startNewBattle();
    return;
  }
  render();
  setTimeout(() => {
    startNewBattle();
    render();
  }, 1800);
}

function checkInstantWin(player) {
  const cards = player.goalCards;
  if (cards.length === 0) return false;
  const suitCount = {};
  for (const c of cards) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;

  for (const c of Object.values(suitCount)) {
    if (c >= 3) return true; // 3 of same suit
  }
  const required = DISTINCT_SUITS_REQUIRED;
  if (Object.keys(suitCount).length >= required) return true;
  return false;
}
