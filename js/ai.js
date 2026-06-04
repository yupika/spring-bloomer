'use strict';
function calculateDesire(player) {
  const goal = state.goalCard;
  const pers = P(player);
  let desire = 0.15 + pers.aggression * 0.10;

  // Base value from goal card's points
  desire += (goal.value / 12) * 0.30 * pers.valueWeight;

  const myCards = player.goalCards;
  const mySuitCount = {};
  for (const c of myCards) mySuitCount[c.suit] = (mySuitCount[c.suit] || 0) + 1;

  const ownedOfGoal = mySuitCount[goal.suit] || 0;
  const myDistinct = Object.keys(mySuitCount).length;
  const required = DISTINCT_SUITS_REQUIRED;

  // Personality: collector loves their focus suit
  if (pers.suitFocus && goal.suit === pers.suitFocus) {
    desire += pers.suitFocusBoost;
  }

  // Personality: aggressive — selective by value
  if (pers.lowValueIgnore && goal.value <= pers.lowValueIgnore) {
    desire *= 0.30;
  }
  if (pers.highValueBonus && goal.value >= 7) {
    desire += pers.highValueBonus;
  }

  // Personality: opportunist — snowball into already-owned suits
  // Lock-in only meaningful while there are still rounds left to capitalize.
  if (pers.reactiveLock) {
    const owned = mySuitCount[goal.suit] || 0;
    const remaining = state.maxRounds - state.currentRound + 1;
    if (owned >= 1 && remaining >= 3) {
      desire += pers.reactiveLock + 0.10 * Math.min(2, owned - 1);
    }
  }
  // Collector also loves any suit they're already collecting heavily (≥2)
  if (pers.type === 'collector') {
    const heaviest = Math.max(0, ...Object.values(mySuitCount));
    if (heaviest >= 2 && (mySuitCount[goal.suit] || 0) === heaviest) desire += 0.15;
  }

  // === Own winning lines ===
  if (ownedOfGoal === 2) {
    desire = 1.0; // taking this wins via 3-of-suit
  } else if (ownedOfGoal === 1) {
    desire += 0.25;
  }

  // Distinct-suits path
  if (!mySuitCount[goal.suit]) {
    if (myDistinct + 1 >= required) {
      desire = Math.max(desire, 0.97);
    } else if (myDistinct + 2 === required) {
      desire += 0.25;
    } else if (myDistinct < required) {
      desire += 0.08;
    }
  }

  // === Defensive ===
  // Universal block desire: any opponent close to an instant win pulls our
  // desire up so we contest that goal card.
  for (const opp of state.players) {
    if (opp.id === player.id) continue;
    const oSuit = {};
    for (const c of opp.goalCards) oSuit[c.suit] = (oSuit[c.suit] || 0) + 1;
    const oOwnedOfGoal = oSuit[goal.suit] || 0;
    const oDistinct = Object.keys(oSuit).length;

    let block = 0;
    if (oOwnedOfGoal === 2) block = Math.max(block, 0.92);
    if (!oSuit[goal.suit] && oDistinct + 1 >= required) block = Math.max(block, 0.90);
    if (!oSuit[goal.suit] && oDistinct + 2 === required && goal.value >= 7) block = Math.max(block, 0.50);
    desire = Math.max(desire, block);
  }

  // === Endgame point chase ===
  const remainingRounds = state.maxRounds - state.currentRound + 1;
  const myPoints = myCards.reduce((s, c) => s + c.value, 0);
  let topPoints = 0;
  for (const opp of state.players) {
    if (opp.id === player.id) continue;
    const op = opp.goalCards.reduce((s, c) => s + c.value, 0);
    if (op > topPoints) topPoints = op;
  }
  if (remainingRounds <= 4) {
    const deficit = topPoints - myPoints;
    if (deficit > 0) desire += Math.min(0.28, deficit / 20) * pers.valueWeight;
  }
  if (remainingRounds <= 2) desire += 0.10;

  // === Resource pressure: dampen when cards are scarce (unless near-win) ===
  // Burner/flex/hoarder differentiation lives here.
  // L1 (legacy) only — L2+ planners use the affordability contest gate instead.
  if (!hasLayer(player, 'L2') && desire < 0.85) {
    const press = resourcePressure(player);
    // Aggressive remap so hoarder vs burner produces noticeable spread.
    desire *= 0.30 + 0.70 * press;
    // Burners with full deck nudge marginal battles upward (engage more often).
    if (player.resourceMode && player.resourceMode.type === 'burner' &&
        press >= 1.0 && desire >= 0.25 && desire <= 0.65) {
      desire *= 1.15;
    }
  }

  // Apply personality min-engage threshold (soft pull-down for borderline)
  if (desire < pers.minEngage) {
    desire *= 0.7; // softly suppress to discourage half-hearted bidding
  }

  return Math.max(0, Math.min(1, desire));
}

// === Resource planning (L2+) ===
// Forward-looking budget: how many battles can we still afford to *contest*?
// Each battle costs ~1 forced sim card; contesting adds ~CONTEST_COST more.
function affordability(player) {
  const battlesLeft = Math.max(1, state.maxRounds - state.currentRound + 1);
  const myLeft = player.hand.length + player.deck.length;
  const contestBudget = Math.max(0, myLeft - battlesLeft); // reserve 1 sim/battle
  const affordable = contestBudget / CONTEST_COST;
  const fightDensity = affordable / battlesLeft; // <1 → can't fight every battle
  return { battlesLeft, myLeft, fightDensity };
}

// Per-battle spend cap (L2+): how many cards we'll commit to *this* battle before
// folding. Goal cards are the win condition, so the default is to fight at full
// strength like everyone else — the cap only refuses the PATHOLOGICAL case: being
// dragged into an endless bidding war that bleeds the deck dry (the exploit that
// beat the old AI). Squeeze below full strength only under real scarcity.
const RESOURCE_SPEND_SHIFT = { burner: 1, flex: 0, hoarder: -1 };
function spendCap(player, desire) {
  const a = affordability(player);
  // Full-strength baseline: an average contested battle costs ~CONTEST_COST extra.
  let cap = CONTEST_COST;
  cap += RESOURCE_SPEND_SHIFT[player.resourceMode ? player.resourceMode.type : 'flex'] || 0;
  // Value-scaled: high-value battles justify a longer war; weak ones, shorter.
  if (desire >= 0.80) cap += 2;
  else if (desire >= 0.55) cap += 1;
  else if (desire < 0.35) cap -= 1;
  // Scarcity squeeze: only ration when the deck genuinely can't keep up.
  if (a.fightDensity < 0.50) cap -= 1;
  if (a.fightDensity < 0.25) cap -= 1;
  // Endgame/surplus release: leftover cards are worthless, spend the reserve.
  if (a.battlesLeft <= 3) cap += 2;
  if (a.myLeft > a.battlesLeft * 4) cap += 2;

  // === L3 counting: read opponents' remaining cards (public-derivable) ===
  if (hasLayer(player, 'L3')) {
    const opps = state.players.filter(p => p.id !== player.id && !p.droppedOut);
    if (opps.length) {
      const oppLefts = opps.map(p => p.hand.length + p.deck.length);
      const oppAvg = oppLefts.reduce((s, x) => s + x, 0) / opps.length;
      const oppMin = Math.min.apply(null, oppLefts);
      const oppMax = Math.max.apply(null, oppLefts);
      // I out-card my rivals → stand firm, outlast aggressors (they exhaust first).
      if (a.myLeft > oppAvg + 3) cap += 2;
      // Rivals nearly dry → cheap/free wins are there; push to claim them.
      if (oppMin <= 3) cap += 1;
      // Someone is out-hoarding me badly → mirror them: probe with one card,
      // never feed a war. Keeps our stock up so their late-game scoop (the
      // conserve exploit: hoard, then chain instant-win goals against a dry
      // field) meets real contests. Block-level desire still overrides.
      if (oppMax > a.myLeft + 4 && a.battlesLeft > 3 && desire < 0.80) cap = 1;
    }
  }
  // === L4 composition: weigh remaining cards, not just count them ===
  // I know my own pool exactly; rivals' pools are derivable (see rivalRemaining).
  // If my remaining movement dominates the strongest rival's, extend the stand.
  if (hasLayer(player, 'L4')) {
    const opps = state.players.filter(p => p.id !== player.id && !p.droppedOut);
    if (opps.length) {
      const myPool = player.hand.concat(player.deck);
      const mySum = myPool.reduce((s, c) => s + effectiveSimValue(c), 0);
      let bestOppSum = 0;
      for (const o of opps) {
        const sum = rivalRemaining(o.id).reduce((s, c) => s + effectiveSimValue(c), 0);
        if (sum > bestOppSum) bestOppSum = sum;
      }
      // I out-power everyone → press on. (No tighten branch: the L3 mirror
      // already handles being badly out-carded; tightening here just made L4
      // fold winnable battles in normal games.)
      if (mySum > bestOppSum * 1.25) cap += 1;
    }
  }
  return Math.max(1, cap);
}

// === L4 composition estimation (fair: public info only) ===
// Every deck starts from the same public composition (DECK_SPEC + WILD_TEMPLATES).
// Subtracting a rival's seen plays yields their exact remaining multiset —
// hand/deck split stays hidden, but the pool itself is knowable.
function rivalRemaining(oppId) {
  const rem = [];
  for (const s of SUITS) for (const v of DECK_SPEC[s]) rem.push({ value: v, suit: s, effect: null });
  for (const t of WILD_TEMPLATES) rem.push({ value: t.value, suit: WILD, effect: t.effect });
  const seen = (state.seenBySeat && state.seenBySeat[oppId]) || [];
  for (const c of seen) {
    const i = rem.findIndex(r => r.suit === c.suit && r.value === c.value &&
                                 (r.effect || null) === (c.effect || null));
    if (i >= 0) rem.splice(i, 1);
  }
  return rem;
}

// Highest sim-reveal score any active rival could still show for this goal suit.
// Goal-suit cards get +1; wilds don't. Used to right-size our own sim card.
function rivalMaxReveal(player, goalSuit) {
  let best = 0;
  for (const o of state.players) {
    if (o.id === player.id || o.droppedOut) continue;
    for (const c of rivalRemaining(o.id)) {
      const v = (c.suit === goalSuit) ? c.value + 1 : effectiveSimValue(c);
      if (v > best) best = v;
    }
  }
  return best;
}

// Effective face value for sorting/sim choice purposes
function effectiveSimValue(card) {
  if (card.suit !== WILD) return card.value;
  if (card.effect === 'round') return state.currentRound;
  if (card.effect === 'draw') return 1;
  return card.value;
}

// Movement gained by playing this card on your turn (own NOT counted on field).
function turnPlayMovement(card, playerId) {
  return computeScore(card);
}

function cpuChooseSimultaneous(player) {
  if (player.hand.length === 0) return null;
  const rawDesire = calculateDesire(player);
  const pers = P(player);
  const bs = B(player);
  const goalSuit = state.goalCard.suit;

  // Apply bidding-style desire shift for simultaneous phase
  const desire = Math.max(0, Math.min(1, rawDesire + bs.desireShiftSim));

  // === High desire: invest seriously ===
  if (desire >= 0.85) {
    const matching = player.hand.filter(c => c.suit === goalSuit);
    if (matching.length > 0) {
      // L4: right-size the reveal — cheapest goal-suit card that still tops
      // anything rivals can show. Don't burn the A7 when an A4 already wins.
      if (hasLayer(player, 'L4') && matching.length > 1) {
        const rivMax = rivalMaxReveal(player, goalSuit);
        const asc = matching.slice().sort((a, b) => a.value - b.value);
        const enough = asc.find(c => c.value + 1 >= rivMax);
        if (enough) return enough;
      }
      // Aggressive personalities lead with their highest goal-suit card; others
      // lean toward upper-mid (save the best for turn play).
      const sorted = matching.slice().sort((a, b) => b.value - a.value);
      if (pers.type === 'aggressive' || pers.type === 'pointHunter') return sorted[0];
      return sorted[Math.min(1, sorted.length - 1)] || sorted[0];
    }
    const w6 = player.hand.find(c => c.suit === WILD && c.value === 6);
    if (w6) return w6;
    const wRound = player.hand.find(c => c.suit === WILD && c.effect === 'round');
    if (wRound && state.currentRound >= 5) return wRound;
    const nonWild = player.hand.filter(c => c.suit !== WILD);
    if (nonWild.length > 0) return nonWild.slice().sort((a, b) => b.value - a.value)[0];
    return player.hand.slice().sort((a, b) => effectiveSimValue(b) - effectiveSimValue(a))[0];
  }

  // === Mid desire: compete moderately ===
  if (desire > 0.50) {
    const matching = player.hand.filter(c => c.suit === goalSuit);
    if (matching.length > 0) {
      const sorted = matching.slice().sort((a, b) => a.value - b.value);
      // pointHunter goes a bit harder; efficient stays cheap
      let idx = (pers.type === 'efficient')
        ? 0
        : (pers.type === 'pointHunter' || pers.type === 'aggressive')
          ? Math.min(sorted.length - 1, Math.ceil(sorted.length / 2))
          : Math.floor(sorted.length / 2);
      // Apply bidding-style card shift
      idx = Math.max(0, Math.min(sorted.length - 1, idx + bs.simCardShift));
      return sorted[idx];
    }
    const w6 = player.hand.find(c => c.suit === WILD && c.value === 6);
    if (w6 && pers.type !== 'efficient') return w6;
    const wRound = player.hand.find(c => c.suit === WILD && c.effect === 'round');
    if (wRound && state.currentRound >= 6) return wRound;
    const nonWild = player.hand.filter(c => c.suit !== WILD);
    const pool = nonWild.length > 0 ? nonWild : player.hand;
    const sorted = pool.slice().sort((a, b) => effectiveSimValue(a) - effectiveSimValue(b));
    return sorted[Math.floor(sorted.length / 2)];
  }

  // === Low desire: dump ===
  // Collector prefers to dump non-focus suits (active "染め手" play).
  // Default: dump the cheapest, preserving key wilds.
  const isPreservedWild = (c) => {
    if (c.suit !== WILD) return false;
    if (c.value === 6) return true;
    if (c.effect === 'round' && state.currentRound >= 8) return true;
    if (c.effect === 'draw') return false; // draw wild is fine to play (replaces itself)
    return false;
  };

  let pool = player.hand.filter(c => !isPreservedWild(c));
  if (pool.length === 0) pool = player.hand.slice();

  // Collector: pre-committed suit focus
  if (pers.suitFocus && pers.dumpBias > 0.2) {
    const offFocus = pool.filter(c => c.suit !== WILD && c.suit !== pers.suitFocus);
    if (offFocus.length > 0) pool = offFocus;
  }

  // Opportunist: once they've won goal cards, dump non-owned-suit cards to lock in
  if (pers.reactiveLock && player.goalCards.length > 0) {
    const ownedSuits = new Set(player.goalCards.map(c => c.suit));
    const offOwned = pool.filter(c => c.suit !== WILD && !ownedSuits.has(c.suit));
    if (offOwned.length > 0) {
      pool = offOwned;
      // Random chance to dump high (purge from deck) like collector
      if (pool.length > 1 && Math.random() < pers.lockDumpBias) {
        pool.sort((a, b) => b.value - a.value);
        return pool[0];
      }
    }
  }

  // Collector strong-dump: highest off-focus card
  if (pers.type === 'collector' && pool.length > 1 && Math.random() < pers.dumpBias) {
    pool.sort((a, b) => b.value - a.value);
    return pool[0];
  }

  pool.sort((a, b) => effectiveSimValue(a) - effectiveSimValue(b));
  return pool[0];
}

function cpuTakeTurn(playerId) {
  if (state.phase !== 'bidding' || state.currentTurnPlayerId !== playerId) return;
  const player = state.players[playerId];
  const action = cpuDecideAction(player);

  if (action.type === 'play') {
    playCard(playerId, action.idx);
    if (state.phase === 'bidding' && state.currentTurnPlayerId === playerId) {
      if (state.silent) {
        cpuTakeTurn(playerId);
      } else {
        if (state.cpuTimeoutId) clearTimeout(state.cpuTimeoutId);
        state.cpuTimeoutId = setTimeout(() => cpuTakeTurn(playerId), 600);
      }
    }
  } else if (action.type === 'endTurn') {
    endTurn(playerId);
  } else {
    dropOut(playerId);
  }
}

// Max number of cards a CPU is willing to chain in one turn to reach 30.
// Tied to personality (一点読み types push more) and bidding style.
function maxFinisherCards(player) {
  const pers = P(player);
  const bs = B(player);
  let base;
  switch (pers.type) {
    case 'efficient': base = 1; break;
    case 'pointHunter':
    case 'aggressive': base = 3; break;
    default: base = 2; // balanced, collector, opportunist
  }
  let bonus = 0;
  if (bs.type === 'burst') bonus = 1;
  else if (bs.type === 'scout' || bs.type === 'drifter') bonus = -1;
  return Math.max(1, Math.min(3, base + bonus));
}

// Plan a multi-card finisher to reach `distance` this turn. Considers same-suit
// chain bonus: when n same-suit cards are played in one turn, each subsequent
// one sees the previous on the field (+1 to its move). Total chain bonus per
// suit = n*(n-1)/2, order-independent. WILD cards excluded (special effects
// don't compose cleanly).
//
// Returns {firstIdx, totalMove, totalCost, size} of the plan, or null if no
// subset of size 1..maxK reaches `distance`.
function planMultiCardFinish(player, playerId, distance, maxK) {
  if (distance <= 0 || maxK < 1) return null;
  const goalSuit = state.goalCard.suit;
  const pool = [];
  for (let i = 0; i < player.hand.length; i++) {
    const c = player.hand[i];
    if (c.suit === WILD) continue;
    pool.push({ idx: i, c, move: turnPlayMovement(c, playerId), cost: c.value });
  }
  if (pool.length === 0) return null;

  let best = null;
  const subset = [];

  const consider = () => {
    let totalMove = 0, totalCost = 0;
    const suitCount = {};
    for (const k of subset) {
      const o = pool[k];
      totalMove += o.move;
      totalCost += o.cost;
      suitCount[o.c.suit] = (suitCount[o.c.suit] || 0) + 1;
    }
    for (const n of Object.values(suitCount)) totalMove += n * (n - 1) / 2;
    if (totalMove < distance) return;
    if (best === null
        || totalCost < best.totalCost
        || (totalCost === best.totalCost && subset.length < best.size)) {
      // First-card heuristic: cheapest first preserves big-move cards for
      // chain-bonus stacking on later plays. Tie-break: goal-suit first.
      const sorted = subset.slice().sort((a, b) => {
        const oa = pool[a], ob = pool[b];
        if (oa.cost !== ob.cost) return oa.cost - ob.cost;
        const ag = oa.c.suit === goalSuit ? 1 : 0;
        const bg = ob.c.suit === goalSuit ? 1 : 0;
        return bg - ag;
      });
      best = { firstIdx: pool[sorted[0]].idx, totalMove, totalCost, size: subset.length };
    }
  };

  const gen = (start, remaining) => {
    if (subset.length > 0) consider();
    if (remaining === 0) return;
    for (let i = start; i < pool.length; i++) {
      subset.push(i);
      gen(i + 1, remaining - 1);
      subset.pop();
    }
  };
  gen(0, maxK);
  return best;
}

function cpuDecideAction(player) {
  const playerId = player.id;
  const pers = P(player);
  const bs = B(player);
  const desire = calculateDesire(player);
  const pos = state.positions.find(p => p.playerId === playerId);
  const distance = WIN_THRESHOLD - pos.value;
  const ableToEnd = canEndTurn(playerId);
  const committed = player._committedThisBattle || 0;

  // Count active opponents (not dropped, not us)
  const activeOpponents = state.players.filter(
    p => p.id !== playerId && !p.droppedOut
  ).length;

  // Empty hand: can only end turn or drop
  if (player.hand.length === 0) {
    return ableToEnd ? { type: 'endTurn' } : { type: 'drop' };
  }

  // === Bidding-style early exits (rare, extreme-condition only) ===
  // Scout: ≥5 active opponents with low desire → retreat (only in 5+ player games)
  if (bs.type === 'scout' && activeOpponents >= bs.competitorDropThreshold && desire < bs.competitorDesireCap) {
    return ableToEnd ? { type: 'endTurn' } : { type: 'drop' };
  }

  // === Winning swing: single-card reach (cheapest card that closes 30) ===
  if (distance > 0 && desire > 0.40) {
    let bestIdx = -1, bestVal = Infinity;
    for (let i = 0; i < player.hand.length; i++) {
      const c = player.hand[i];
      const move = turnPlayMovement(c, playerId);
      if (move >= distance) {
        const cv = effectiveSimValue(c);
        if (cv < bestVal) { bestVal = cv; bestIdx = i; }
      }
    }
    if (bestIdx >= 0) return { type: 'play', idx: bestIdx };
  }

  // === Multi-card finisher: plan 2-3 card combos when "止めにいく" mode ===
  // Trigger: high desire OR already committed cards this battle. Personality
  // and bidding style dictate how many cards we're willing to chain.
  if (distance > 0 && (desire >= 0.70 || committed >= 1)) {
    const maxK = maxFinisherCards(player);
    if (maxK >= 2) {
      const plan = planMultiCardFinish(player, playerId, distance, maxK);
      if (plan) return { type: 'play', idx: plan.firstIdx };
    }
  }

  // === We're not the lowest — usually end turn ===
  if (ableToEnd) {
    // Critical desire + thin margin: consolidate cheaply
    if (desire >= 0.85) {
      const others = state.positions
        .filter(p => p.playerId !== playerId && !state.players[p.playerId].droppedOut);
      const minOther = Math.min.apply(null, others.map(p => p.value));
      const margin = pos.value - minOther;
      if (margin <= 3) {
        let bestIdx = -1, bestCost = Infinity;
        for (let i = 0; i < player.hand.length; i++) {
          const c = player.hand[i];
          const cost = effectiveSimValue(c);
          const move = turnPlayMovement(c, playerId);
          if (move > 0 && cost <= 2 && cost < bestCost) {
            bestCost = cost; bestIdx = i;
          }
        }
        if (bestIdx >= 0) return { type: 'play', idx: bestIdx };
      }
    }
    return { type: 'endTurn' };
  }

  // === We are the lowest (or tied for lowest) — must play or drop ===

  // L2+ efficiency: once we've spent our budget for this battle, fold rather than
  // chase. Cheap wins still happen below this cap; expensive bidding wars don't.
  if (hasLayer(player, 'L2') && committed >= spendCap(player, desire)) {
    // Allow one last cheap escape that secures the battle, else drop.
    const posC = state.positions.find(p => p.playerId === playerId);
    const othersC = state.positions
      .filter(p => p.playerId !== playerId && !state.players[p.playerId].droppedOut);
    const minOtherC = othersC.length ? Math.min.apply(null, othersC.map(p => p.value)) : posC.value;
    const marginC = (minOtherC - posC.value) + 1;
    let cheapIdx = -1;
    for (let i = 0; i < player.hand.length; i++) {
      const c = player.hand[i];
      if (computeScore(c) >= marginC && effectiveSimValue(c) <= 1) { cheapIdx = i; break; }
    }
    return cheapIdx >= 0 ? { type: 'play', idx: cheapIdx } : { type: 'drop' };
  }

  // Find the lowest "other" target we need to overtake
  const others = state.positions
    .filter(p => p.playerId !== playerId && !state.players[p.playerId].droppedOut);
  const minOther = others.length > 0
    ? Math.min.apply(null, others.map(p => p.value))
    : pos.value;
  const escapeMargin = (minOther - pos.value) + 1; // movement needed to escape lowest

  // Stickiness from already-committed cards (sunk cost — keep fighting)
  // Plus aggressive personality drop tax.
  // Burst gets initial desire boost when few cards committed.
  const stickyBoost = (committed > 0 ? pers.sticky : 0) + pers.dropTax;
  const burstBoost = (bs.type === 'burst' && committed <= 1) ? bs.burstInitialBoost : 0;
  const adjustedDesire = Math.min(1, desire + stickyBoost + burstBoost);

  // Build per-card analysis
  const options = player.hand.map((c, i) => ({
    i, c,
    cost: effectiveSimValue(c),
    move: turnPlayMovement(c, playerId),
  }));

  // Cheap-escape candidates (cards that lift us above the lowest at low cost)
  const escapes = options
    .filter(o => o.move >= escapeMargin)
    .sort((a, b) => a.cost - b.cost || b.move - a.move);

  // === Critical desire: keep pushing ===
  if (adjustedDesire >= 0.85) {
    // Prefer cheap escape; else cheapest forward-mover; else cheapest stall
    if (escapes.length > 0) return { type: 'play', idx: escapes[0].i };
    const forwards = options.filter(o => o.move > 0).sort((a, b) => a.cost - b.cost);
    if (forwards.length > 0) return { type: 'play', idx: forwards[0].i };
    options.sort((a, b) => a.cost - b.cost);
    return { type: 'play', idx: options[0].i };
  }

  // === Sticky: if already committed and a cheap escape exists, take it ===
  // This is the bug fix — don't drop after committing if we can climb out cheaply.
  if (committed > 0 && escapes.length > 0) {
    const acceptableCost = 2 + Math.floor(committed * 1.5) + pers.riskTolerance * 4;
    if (escapes[0].cost <= acceptableCost) {
      return { type: 'play', idx: escapes[0].i };
    }
  }

  // === Standard cost-benefit ===
  options.sort((a, b) => a.cost - b.cost);
  const pick = options[0];

  // Engage thresholds, scaled by personality and bidding style
  const playThresh = pers.minEngage / bs.engageMultiplier;
  const cheapPlayThresh = playThresh - 0.10 * pers.riskTolerance;

  let shouldPlay = false;

  // High desire: just play
  if (adjustedDesire > 0.70) shouldPlay = true;
  // Medium desire with cheap card
  else if (adjustedDesire > 0.50 && pick.cost <= 3) shouldPlay = true;
  // Low desire but free / very cheap
  else if (adjustedDesire > cheapPlayThresh && pick.cost <= 1) shouldPlay = true;
  // Cheap escape exists and we're not totally uninterested
  else if (escapes.length > 0 && escapes[0].cost <= 2 && adjustedDesire > playThresh - 0.05) {
    shouldPlay = true;
  }
  // Sunken cost: if we've committed, hold the line for one more cheap card
  else if (committed > 0 && pick.cost <= 2 && adjustedDesire > playThresh - 0.20) {
    shouldPlay = true;
  }
  // Many cards in hand and cheap toss helps us linger to see what others do
  else if (player.hand.length >= 5 && pick.cost <= 2 && adjustedDesire > 0.25) {
    shouldPlay = true;
  }

  if (shouldPlay && escapes.length > 0 && escapes[0].cost <= pick.cost + 1) {
    // Prefer the escape if it's nearly as cheap (escapes the lowest = ends turn next)
    return { type: 'play', idx: escapes[0].i };
  }
  return shouldPlay ? { type: 'play', idx: pick.i } : { type: 'drop' };
}
