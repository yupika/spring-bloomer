// Local smoke test: run a complete 3-player game through the engine
// without any networking, just to check the state machine doesn't crash.
// Run: node server/test-smoke.mjs

import { createGameState, startNewBattle, submitSimChoice, playCard, endTurn, dropOut, serializeStateFor } from './src/engine.js';

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function autoBidStep(gs, seat) {
  // crude AI: if can end turn, sometimes end, sometimes play, sometimes drop
  const player = gs.players[seat];
  if (player.hand.length === 0) return dropOut(gs, seat);
  // Try end turn first if possible
  // (engine validates internally)
  const endResult = endTurn(gs, seat);
  if (endResult.ok) return endResult;
  // Else play a random card
  const cardIdx = Math.floor(Math.random() * player.hand.length);
  return playCard(gs, seat, cardIdx);
}

const NUM = 3;
console.log(`\n=== Smoke test: ${NUM}-player game ===`);
const gs = createGameState(NUM, ['A', 'B', 'C']);
console.log(`Players: ${gs.players.map(p => p.name).join(', ')}`);
console.log(`Max battles: ${gs.maxRounds}`);

let safety = 0;
startNewBattle(gs);
console.log(`\nBattle ${gs.currentRound} start, goal=${gs.goalCard.value}${gs.goalCard.suit}`);

while (gs.phase !== 'gameOver' && safety < 10000) {
  safety++;
  if (gs.phase === 'reveal') {
    // All pending players submit a random sim choice
    const pending = Array.from(gs.pendingSimChoices);
    if (pending.length === 0) {
      console.log('reveal pending empty but phase=reveal — should have advanced');
      break;
    }
    const seat = pending[0];
    const player = gs.players[seat];
    const cardIdx = Math.floor(Math.random() * player.hand.length);
    submitSimChoice(gs, seat, cardIdx);
  } else if (gs.phase === 'bidding') {
    const seat = gs.currentTurnPlayerId;
    const player = gs.players[seat];
    if (!player) {
      console.log('no current turn player — bug?');
      break;
    }
    if (player.hand.length === 0) {
      dropOut(gs, seat);
      continue;
    }
    // 30% chance drop, 30% chance end turn (if allowed), else play random
    const r = Math.random();
    if (r < 0.10) {
      dropOut(gs, seat);
    } else if (r < 0.40) {
      const result = endTurn(gs, seat);
      if (result.error) {
        const cardIdx = Math.floor(Math.random() * player.hand.length);
        playCard(gs, seat, cardIdx);
      }
    } else {
      const cardIdx = Math.floor(Math.random() * player.hand.length);
      playCard(gs, seat, cardIdx);
    }
  } else if (gs.phase === 'battleEnd') {
    if (gs.currentRound >= gs.maxRounds) {
      console.log('max rounds reached but phase still battleEnd — should be gameOver');
      break;
    }
    startNewBattle(gs);
  }
}

console.log(`\n=== End ===`);
console.log(`Final phase: ${gs.phase}`);
console.log(`Battles played: ${gs.currentRound}`);
console.log(`Winner: seat ${gs.winnerId}, name ${gs.players[gs.winnerId]?.name}`);
console.log(`Battle outcomes:`, gs.battleEndCounts);
console.log(`Final scores:`);
for (const p of gs.players) {
  const total = p.goalCards.reduce((s, c) => s + c.value, 0);
  console.log(`  ${p.name}: ${p.goalCards.length} cards, ${total} points`);
}
console.log(`Iterations: ${safety}`);

// Test serialization
const view = serializeStateFor(gs, 0);
console.log(`\nSerialized view for seat 0:`);
console.log(`  yourSeat=${view.yourSeat}, phase=${view.phase}`);
console.log(`  player[0].hand visible=${view.players[0].hand !== null}`);
console.log(`  player[1].hand visible=${view.players[1].hand !== null} (should be false)`);
console.log(`  player[1].handCount=${view.players[1].handCount}`);
