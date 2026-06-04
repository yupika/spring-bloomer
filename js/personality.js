'use strict';
function rollResourceMode() {
  const type = RESOURCE_MODES[Math.floor(Math.random() * RESOURCE_MODES.length)];
  const jitter = (range) => (Math.random() - 0.5) * range;
  if (type === 'burner') {
    return {
      type,
      // Doesn't worry about scarcity until cards are critically low
      worryThreshold: 1.4 + jitter(0.4),
      pressureFloor:  0.65 + jitter(0.10),
    };
  } else if (type === 'hoarder') {
    return {
      type,
      // Worries early, dampens hard
      worryThreshold: 3.3 + jitter(0.6),
      pressureFloor:  0.25 + jitter(0.10),
    };
  } else { // flex
    return {
      type,
      worryThreshold: 2.4 + jitter(0.4),
      pressureFloor:  0.45 + jitter(0.10),
    };
  }
}

function rollBiddingStyle() {
  const type = BIDDING_STYLE_TYPES[Math.floor(Math.random() * BIDDING_STYLE_TYPES.length)];
  const jitter = (range) => (Math.random() - 0.5) * range;
  if (type === 'sticky') {
    return {
      type,
      desireShiftSim: 0.02 + jitter(0.02),  // tiny upward shift → invests a touch more in sim
      simCardShift: 0,                       // no card selection shift
      engageMultiplier: 1.06 + jitter(0.04), // slightly easier to keep fighting
      competitorDropThreshold: 99,           // unused
      competitorDesireCap: 0,                // unused
      commitmentLimit: 99,                   // unused
      burstInitialBoost: 0,                  // unused
      opponentCeilingRatio: 1.0,             // unused
      lonelyDesireFloor: 0,                  // unused
    };
  } else if (type === 'scout') {
    return {
      type,
      desireShiftSim: -0.04 + jitter(0.03), // slightly lower desire in simultaneous
      simCardShift: -1,                      // pick cheaper card
      engageMultiplier: 0.96 + jitter(0.04), // somewhat harder to engage
      competitorDropThreshold: 5,            // only retreat when ≥5 opponents (rare)
      competitorDesireCap: 0.40 + jitter(0.08), // desire below this → drop when crowded
      commitmentLimit: 99,
      burstInitialBoost: 0,
      opponentCeilingRatio: 1.0,
      lonelyDesireFloor: 0,
    };
  } else if (type === 'burst') {
    return {
      type,
      desireShiftSim: -0.01 + jitter(0.02), // barely conservative in sim
      simCardShift: 0,                       // neutral in simultaneous
      engageMultiplier: 1.0 + jitter(0.03),  // neutral engagement
      competitorDropThreshold: 99,
      competitorDesireCap: 0,
      commitmentLimit: 99,                   // no commitment-based exit
      burstInitialBoost: 0.05 + jitter(0.03), // modest initial desire boost
      opponentCeilingRatio: 1.0,
      lonelyDesireFloor: 0,
    };
  } else { // drifter
    return {
      type,
      desireShiftSim: -0.03 + jitter(0.03), // mild downward shift
      simCardShift: 0,                       // no card advantage in simultaneous
      engageMultiplier: 0.96 + jitter(0.04), // slightly harder to engage
      competitorDropThreshold: 99,
      competitorDesireCap: 0,
      commitmentLimit: 99,
      burstInitialBoost: 0,
      opponentCeilingRatio: 1.0,             // unused (early exit removed)
      lonelyDesireFloor: 0,                  // unused (lonely condition removed)
    };
  }
}

function rollSkill() {
  const r = Math.random();
  let acc = 0;
  for (const lv of SKILL_LEVELS) {
    acc += SKILL_WEIGHTS[lv] || 0;
    if (r < acc) return lv;
  }
  return SKILL_LEVELS[SKILL_LEVELS.length - 1];
}

function rollPersonality() {
  const type = PERSONALITY_TYPES[Math.floor(Math.random() * PERSONALITY_TYPES.length)];
  const jitter = (range) => (Math.random() - 0.5) * range;
  // Defaults (balanced)
  const p = {
    type,
    aggression:    0.50 + jitter(0.30),
    valueWeight:   1.00 + jitter(0.30),
    minEngage:     0.30 + jitter(0.10),
    riskTolerance: 0.50 + jitter(0.30),
    sticky:        0.20 + jitter(0.10),
    suitFocus:     null,
    suitFocusBoost:0,
    dumpBias:      0.0,
    dropTax:       0.0 + jitter(0.10),
    lowValueIgnore:0,
    highValueBonus:0,
  };
  if (type === 'pointHunter') {
    p.valueWeight   = 1.50 + jitter(0.30);
    p.minEngage     = 0.45 + jitter(0.10);
    p.aggression    = 0.55 + jitter(0.20);
    p.riskTolerance = 0.55 + jitter(0.20);
    p.sticky        = 0.25 + jitter(0.10);
    p.dropTax       = 0.10 + jitter(0.10);
  } else if (type === 'collector') {
    p.suitFocus     = SUITS[Math.floor(Math.random() * SUITS.length)];
    p.suitFocusBoost= 0.35 + Math.random() * 0.30;
    p.dumpBias      = 0.35 + Math.random() * 0.30;
    p.valueWeight   = 0.85 + jitter(0.20);
    p.minEngage     = 0.25 + jitter(0.10);
    p.aggression    = 0.55 + jitter(0.20);
    p.riskTolerance = 0.50 + jitter(0.20);
    p.sticky        = 0.20 + jitter(0.10);
  } else if (type === 'efficient') {
    p.aggression    = 0.45 + jitter(0.15);
    p.riskTolerance = 0.30 + jitter(0.15);
    p.minEngage     = 0.40 + jitter(0.10);
    p.valueWeight   = 1.10 + jitter(0.20);
    p.sticky        = 0.20 + jitter(0.10);
    p.dropTax       = 0.05 + jitter(0.10);
  } else if (type === 'aggressive') {
    // "Aggressive" = selective high-value hunter.
    // Picks fewer battles than pointHunter (skips low-value outright),
    // throws heavy on chosen targets, but doesn't spiral into card burn.
    p.aggression    = 0.50 + jitter(0.20);
    p.valueWeight   = 1.55 + jitter(0.25);
    p.riskTolerance = 0.55 + jitter(0.20);
    p.minEngage     = 0.45 + jitter(0.10);
    p.sticky        = 0.15 + jitter(0.10);
    p.dropTax       = 0.10 + jitter(0.10);
    p.lowValueIgnore = Math.random() < 0.5 ? 2 : 3;   // some ignore ≤2, others ≤3
    p.highValueBonus = 0.25 + jitter(0.15);
  } else if (type === 'opportunist') {
    // Reactive: no initial color preference. Locks onto whatever suit they
    // win first, then chases that aggressively. Adapts to game flow.
    p.aggression    = 0.50 + jitter(0.20);
    p.valueWeight   = 1.10 + jitter(0.25);
    p.riskTolerance = 0.55 + jitter(0.20);
    p.minEngage     = 0.30 + jitter(0.10);
    p.sticky        = 0.20 + jitter(0.10);
    p.dropTax       = 0.05 + jitter(0.10);
    p.reactiveLock  = 0.30 + jitter(0.15);  // bonus to owned-suit goals (snowball)
    p.lockDumpBias  = 0.40 + Math.random() * 0.30;  // dump non-owned suits once locked
  }
  // Clamp to sane ranges
  p.aggression    = Math.max(0.20, Math.min(1.20, p.aggression));
  p.valueWeight   = Math.max(0.50, Math.min(2.00, p.valueWeight));
  p.minEngage     = Math.max(0.15, Math.min(0.65, p.minEngage));
  p.riskTolerance = Math.max(0.15, Math.min(1.00, p.riskTolerance));
  p.sticky        = Math.max(0.00, Math.min(0.50, p.sticky));
  p.dropTax       = Math.max(0.00, Math.min(0.40, p.dropTax));
  p.suitFocusBoost= Math.max(0.00, Math.min(0.80, p.suitFocusBoost));
  p.dumpBias      = Math.max(0.00, Math.min(0.80, p.dumpBias));
  p.highValueBonus= Math.max(0.00, Math.min(0.50, p.highValueBonus));
  if (p.reactiveLock)    p.reactiveLock    = Math.max(0.10, Math.min(0.60, p.reactiveLock));
  if (p.lockDumpBias)    p.lockDumpBias    = Math.max(0.20, Math.min(0.80, p.lockDumpBias));
  return p;
}

// Default personality (used when player has none — e.g., human seat in regular play
// won't reach AI code, but be defensive)
const NEUTRAL_PERSONALITY = {
  type: 'balanced', aggression: 0.5, valueWeight: 1.0, minEngage: 0.30,
  riskTolerance: 0.5, sticky: 0.20, suitFocus: null, suitFocusBoost: 0,
  dumpBias: 0.0, dropTax: 0.0,
};
function P(player) { return player.personality || NEUTRAL_PERSONALITY; }

const DEFAULT_BIDDING_STYLE = {
  type: 'sticky', desireShiftSim: 0, simCardShift: 0, engageMultiplier: 1.0,
  competitorDropThreshold: 99, competitorDesireCap: 0, commitmentLimit: 99,
  burstInitialBoost: 0, opponentCeilingRatio: 1.0, lonelyDesireFloor: 0,
};
function B(player) { return player.biddingStyle || DEFAULT_BIDDING_STYLE; }

// Skill accessor + layer gate. Higher level enables all lower layers.
function SK(player) { return player.skill || 'L1'; }
function hasLayer(player, minLevel) {
  return SKILL_LEVELS.indexOf(SK(player)) >= SKILL_LEVELS.indexOf(minLevel);
}

// Resource awareness: estimate how scarce our deck/hand feels given the player's
// resource style. Returns multiplier in [pressureFloor, 1.0]. Lower = scarcer.
// (L1 legacy path only; L2+ uses spendCap/affordability instead — see ai.js.)
const DEFAULT_RESOURCE = { worryThreshold: 2.4, pressureFloor: 0.40 };
function resourcePressure(player) {
  const mode = player.resourceMode || DEFAULT_RESOURCE;
  const cardsLeft = player.hand.length + player.deck.length;
  const battlesLeft = Math.max(1, state.maxRounds - state.currentRound + 1);
  const expected = battlesLeft * mode.worryThreshold;
  if (cardsLeft >= expected) return 1.0;
  const ratio = cardsLeft / expected;
  return Math.max(mode.pressureFloor, 0.50 + 0.50 * ratio);
}
