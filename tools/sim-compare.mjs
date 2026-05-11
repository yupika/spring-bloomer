// Compare goal-card spec variants. Reuses game engine in-process by mutating
// GOAL_CARD_SPEC between runs (works because const arrays are still mutable).
// Usage:  node tools/sim-compare.mjs [numPlayers=4] [numGames=3000]
// Edit the VARIANTS map to test other specs.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const sandbox = {
  console, Math, Date, JSON, Array, Object, Set, Map, Number, String, Boolean,
  parseInt, parseFloat, isNaN, isFinite,
  document: { getElementById: () => ({ textContent: '', style: {}, classList: { add(){}, remove(){} } }) },
  window: {},
  localStorage: (() => { const s={}; return { getItem:k=>k in s?s[k]:null, setItem:(k,v)=>{s[k]=String(v);}, removeItem:k=>{delete s[k];}}; })(),
  sessionStorage: { getItem:()=>null, setItem:()=>{} },
  setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
  fetch: () => Promise.resolve({ ok:true, json:()=>Promise.resolve({}) }),
  performance: { now: () => Date.now() },
  navigator: { userAgent: 'sim' },
  location: { hostname: 'localhost', search: '', hash: '' },
};
vm.createContext(sandbox);

vm.runInContext(`
  var render = function(){};
  var log = function(){};
  var logEvent = function(){};
  var logGameStart = function(){};
  var logGameEnd = function(){};
  var setActiveTab = function(){};
`, sandbox);

const files = [
  'js/constants.js', 'js/state.js', 'js/deck.js', 'js/personality.js',
  'js/logger.js', 'js/engine.js', 'js/ai.js', 'js/simulator.js',
];
for (const f of files) {
  const src = fs.readFileSync(path.join(REPO, f), 'utf8');
  vm.runInContext(src, sandbox, { filename: f });
}

// Patch simulator to also track instant-win reasons. Done by replacing the
// function in-context with a wrapped version.
vm.runInContext(`
  const _origRunSim = runSimulation;
  runSimulation = function(np, ng, onProgress) {
    const reasons = { sameSuit: { A:0, B:0, C:0, D:0, E:0 }, distinctSuits: 0 };
    const _origStart = startGame;
    startGame = function(numPlayers, humanName) {
      state.lastInstantWinReason = null;
      _origStart(numPlayers, humanName);
      if (state.lastInstantWinReason) {
        const r = state.lastInstantWinReason;
        if (r.type === 'sameSuit') reasons.sameSuit[r.suit]++;
        else if (r.type === 'distinctSuits') reasons.distinctSuits++;
      }
    };
    const result = _origRunSim(np, ng, onProgress);
    startGame = _origStart;
    result.instantWinReasons = reasons;
    return result;
  };
`, sandbox);

const VARIANTS = {
  baseline: {
    label: '現状 5/5/5/5/5',
    spec: [
      { value:1,  suits:['A'] },
      { value:2,  suits:['B','E'] },
      { value:3,  suits:['C','D','E'] },
      { value:4,  suits:['A','C','D','E'] },
      { value:5,  suits:['A','B','C','D','E'] },
      { value:6,  suits:['B','C','D'] },
      { value:7,  suits:['A','B','C'] },
      { value:9,  suits:['D','E'] },
      { value:11, suits:['B'] },
      { value:12, suits:['A'] },
    ],
  },
  tilt25: {
    label: '軽傾斜 4/5/5/5/6 — 7を A→E',
    spec: [
      { value:1,  suits:['A'] },
      { value:2,  suits:['B','E'] },
      { value:3,  suits:['C','D','E'] },
      { value:4,  suits:['A','C','D','E'] },
      { value:5,  suits:['A','B','C','D','E'] },
      { value:6,  suits:['B','C','D'] },
      { value:7,  suits:['B','C','E'] },   // A→E
      { value:9,  suits:['D','E'] },
      { value:11, suits:['B'] },
      { value:12, suits:['A'] },
    ],
  },
};

const SUIT_NAMES = { A:'ネジハナ', B:'たんぽぽ', C:'シロツメ', D:'スミレ', E:'オオイヌ' };
const numPlayers = parseInt(process.argv[2] || '4', 10);
const numGames = parseInt(process.argv[3] || '3000', 10);
const fair = 1 / numPlayers;

const results = {};
for (const [key, v] of Object.entries(VARIANTS)) {
  // Mutate GOAL_CARD_SPEC in place
  vm.runInContext(`
    GOAL_CARD_SPEC.length = 0;
    GOAL_CARD_SPEC.push(...${JSON.stringify(v.spec)});
  `, sandbox);

  process.stdout.write(`[${key}] running ${numGames} games...`);
  const t0 = Date.now();
  const stats = vm.runInContext(`runSimulation(${numPlayers}, ${numGames})`, sandbox);
  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  console.log(` done in ${elapsed}s`);
  results[key] = { label: v.label, stats };
}

// ===== Reporting =====
console.log('\n=========== 比較レポート ===========');
console.log(`設定: ${numPlayers}人 × ${numGames}回 / 公平基準 = ${(fair*100).toFixed(1)}%`);

console.log('\n## ゲーム決着');
console.log('variant\t\t即勝\t即勝%\t点勝%\t平均バトル');
for (const [key, r] of Object.entries(results)) {
  const s = r.stats;
  const iw = (s.instantWins/s.completed*100).toFixed(1);
  const pw = (s.pointWins/s.completed*100).toFixed(1);
  console.log(`${key}\t\t${s.instantWins}\t${iw}%\t${pw}%\t${s.avgBattles.toFixed(2)}`);
}

console.log('\n## スート別 勝者獲得率（点数勝ち時）');
console.log('suit          ' + Object.keys(results).map(k => k.padEnd(12)).join(''));
for (const suit of ['A','B','C','D','E']) {
  const cells = [];
  for (const key of Object.keys(results)) {
    const s = results[key].stats;
    let app=0, held=0;
    for (const r of Object.values(s.goalCardStats)) {
      if (r.suit === suit) { app += r.appearedPoint; held += r.winnerHeldPoint; }
    }
    const rate = app > 0 ? held/app : 0;
    cells.push(`${(rate*100).toFixed(1)}% (${(rate/fair).toFixed(2)}×)`);
  }
  console.log(`${SUIT_NAMES[suit].padEnd(12)}  ${cells.map(c => c.padEnd(12)).join('')}`);
}

console.log('\n## 高得点札 個別獲得率（点数勝ち時）');
const highCards = [[12,'A'],[11,'B'],[9,'D'],[9,'E'],[7,'A'],[7,'B'],[7,'C'],[7,'E']];
console.log('card           ' + Object.keys(results).map(k => k.padEnd(20)).join(''));
for (const [v, s] of highCards) {
  const cells = [];
  let exists = false;
  for (const key of Object.keys(results)) {
    const rec = results[key].stats.goalCardStats[`${v}-${s}`];
    if (rec && rec.appearedPoint > 0) {
      exists = true;
      const rate = rec.winnerHeldPoint / rec.appearedPoint;
      cells.push(`${(rate*100).toFixed(1)}% (${(rate/fair).toFixed(2)}×)`);
    } else {
      cells.push('—');
    }
  }
  if (exists) console.log(`${v} ${SUIT_NAMES[s].padEnd(8)}    ${cells.map(c => c.padEnd(20)).join('')}`);
}

console.log('\n## 即勝の中身（同スート3枚 — スート別 / 異4種）');
console.log('reason         ' + Object.keys(results).map(k => k.padEnd(20)).join(''));
for (const suit of ['A','B','C','D','E']) {
  const cells = [];
  for (const key of Object.keys(results)) {
    const r = results[key].stats.instantWinReasons.sameSuit[suit];
    const pct = (r/results[key].stats.completed*100).toFixed(1);
    cells.push(`${r}回 (${pct}%)`);
  }
  console.log(`3-${SUIT_NAMES[suit].padEnd(8)}    ${cells.map(c => c.padEnd(20)).join('')}`);
}
const cells = [];
for (const key of Object.keys(results)) {
  const r = results[key].stats.instantWinReasons.distinctSuits;
  const pct = (r/results[key].stats.completed*100).toFixed(1);
  cells.push(`${r}回 (${pct}%)`);
}
console.log(`異4種         ${cells.map(c => c.padEnd(20)).join('')}`);

console.log('\n## 性格別 勝率 (vs公平)');
const persTypes = Object.keys(results.baseline.stats.perPersonality);
console.log('性格         ' + Object.keys(results).map(k => k.padEnd(14)).join(''));
for (const t of persTypes) {
  const cells = [];
  for (const key of Object.keys(results)) {
    const r = results[key].stats.perPersonality[t];
    if (r.games > 0) {
      const wr = r.wins/r.games;
      cells.push(`${(wr*100).toFixed(1)}% (${(wr/fair).toFixed(2)}×)`);
    } else cells.push('—');
  }
  console.log(`${t.padEnd(12)}  ${cells.map(c => c.padEnd(14)).join('')}`);
}
