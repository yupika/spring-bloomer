'use strict';
// CLI runner for simulation. Run: node sim-cli.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const files = [
  'js/constants.js',
  'js/state.js',
  'js/deck.js',
  'js/personality.js',
  'js/engine.js',
  'js/ai.js',
  'js/simulator.js',
];

// Stub render / log / DOM-touching functions so silent simulation runs without browser.
globalThis.render = () => {};
globalThis.log = () => {};
globalThis.$ = () => null;

for (const f of files) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
  vm.runInThisContext(src, { filename: f });
}

// Mark as silent so engine doesn't try to render etc.
state.silent = true;

const RUNS = 1500;
const PLAYER_COUNTS = [2, 3, 4, 5];

console.log(`Running ${RUNS} games for each of ${PLAYER_COUNTS.join(', ')} players...\n`);

for (const np of PLAYER_COUNTS) {
  const stats = runSimulation(np, RUNS);
  const r = stats.battleEndReasons;
  const total = r.scoreOut + r.lastStanding + r.allDropped;
  const pct = (n) => `${n} (${(n/total*100).toFixed(1)}%)`;
  console.log(`=== ${np}-player × ${RUNS} games ===`);
  console.log(`  Avg battles per game: ${stats.avgBattles.toFixed(2)}`);
  console.log(`  Game ends -- instant: ${stats.instantWins} (${(stats.instantWins/RUNS*100).toFixed(1)}%), points: ${stats.pointWins} (${(stats.pointWins/RUNS*100).toFixed(1)}%)`);
  console.log(`  Battle outcomes (total ${total}):`);
  console.log(`    score-out (>=30):     ${pct(r.scoreOut)}`);
  console.log(`    last-standing:        ${pct(r.lastStanding)}`);
  console.log(`    all-dropped:          ${pct(r.allDropped)}`);
  console.log('');
}
