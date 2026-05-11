// Headless runner that prints the per-goal-card win-claim breakdown.
// Usage:  node tools/sim-goalcards.mjs [numPlayers=4] [numGames=2000]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const sandbox = {
  console,
  Math, Date, JSON, Array, Object, Set, Map, Number, String, Boolean,
  parseInt, parseFloat, isNaN, isFinite,
  // browser stubs
  document: { getElementById: () => ({ textContent: '', style: {}, classList: { add() {}, remove() {} } }) },
  window: {},
  localStorage: (() => {
    const store = {};
    return {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    };
  })(),
  sessionStorage: { getItem: () => null, setItem: () => {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: () => 0,
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  performance: { now: () => Date.now() },
  navigator: { userAgent: 'sim' },
  location: { hostname: 'localhost', search: '', hash: '' },
  crypto: { randomUUID: () => Math.random().toString(36).slice(2) },
};
vm.createContext(sandbox);

const files = [
  'js/constants.js',
  'js/state.js',
  'js/deck.js',
  'js/personality.js',
  'js/logger.js',
  'js/engine.js',
  'js/ai.js',
  'js/simulator.js',
];

// Stubs for render/log so engine doesn't crash in silent mode
vm.runInContext(`
  var render = function(){};
  var log = function(){};
  var logEvent = function(){};
  var logGameStart = function(){};
  var logGameEnd = function(){};
  var setActiveTab = function(){};
`, sandbox);

for (const f of files) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}

const numPlayers = parseInt(process.argv[2] || '4', 10);
const numGames = parseInt(process.argv[3] || '2000', 10);

console.log(`# Spring Bloomer sim — ${numPlayers}人 × ${numGames}回`);
const t0 = Date.now();
const stats = vm.runInContext(`runSimulation(${numPlayers}, ${numGames})`, sandbox);
const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

console.log(`完了: ${stats.completed}回 / ${elapsed}秒`);
console.log(`即勝: ${stats.instantWins} (${(stats.instantWins/stats.completed*100).toFixed(1)}%)`);
console.log(`点数勝ち: ${stats.pointWins} (${(stats.pointWins/stats.completed*100).toFixed(1)}%)`);
console.log(`平均バトル数: ${stats.avgBattles.toFixed(2)}`);
console.log();

// Goal card table (point-win only)
console.log('## 得点札別 勝利貢献度（点数勝ち時）');
console.log('値\tスート\t出現率\t点勝出現\t勝者獲得\t獲得率\tvs公平');
const SUIT_NAMES = { A: 'ネジハナ', B: 'たんぽぽ', C: 'シロツメ', D: 'スミレ', E: 'オオイヌ' };
const fair = 1 / numPlayers;
const rows = Object.values(stats.goalCardStats)
  .filter(r => r.appearedPoint > 0)
  .map(r => ({
    ...r,
    rate: r.winnerHeldPoint / r.appearedPoint,
    appearRate: r.appearedAll / stats.completed,
    baseline: (r.winnerHeldPoint / r.appearedPoint) / fair,
  }))
  .sort((a, b) => b.rate - a.rate);

for (const r of rows) {
  const mark = r.baseline > 1.30 ? ' ★赤' : r.baseline > 1.10 ? ' ↑' : r.baseline < 0.80 ? ' ↓' : '';
  console.log(`${r.value}\t${SUIT_NAMES[r.suit]}\t${(r.appearRate*100).toFixed(1)}%\t${r.appearedPoint}\t${r.winnerHeldPoint}\t${(r.rate*100).toFixed(1)}%\t${r.baseline.toFixed(2)}×${mark}`);
}

console.log();
console.log('## スート別 合計');
const suitAgg = {};
for (const r of rows) {
  if (!suitAgg[r.suit]) suitAgg[r.suit] = { appearedPoint: 0, winnerHeldPoint: 0 };
  suitAgg[r.suit].appearedPoint += r.appearedPoint;
  suitAgg[r.suit].winnerHeldPoint += r.winnerHeldPoint;
}
for (const s of ['A','B','C','D','E']) {
  const a = suitAgg[s];
  if (!a) continue;
  const rate = a.winnerHeldPoint / a.appearedPoint;
  console.log(`${SUIT_NAMES[s]}\t出現${a.appearedPoint}\t獲得${a.winnerHeldPoint}\t獲得率${(rate*100).toFixed(1)}%\tvs公平 ${(rate/fair).toFixed(2)}×`);
}

console.log();
console.log('## 性格別 勝率');
const types = Object.keys(stats.perPersonality);
for (const t of types) {
  const r = stats.perPersonality[t];
  if (!r.games) continue;
  const wr = r.wins / r.games * 100;
  console.log(`${t}\t出場${r.games}\t勝${r.wins}\t勝率${wr.toFixed(1)}%\tvs公平 ${(wr/100/fair).toFixed(2)}×`);
}
