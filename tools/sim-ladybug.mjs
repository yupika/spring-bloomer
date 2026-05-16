// Spring Bloomer — ladybug rule A/B/C tester.
// Compares 'jump' / 'stop' / 'none' under identical setup.
//
// Usage:  bun tools/sim-ladybug.mjs [runs] [playerCount]
//   default: 1500 games, 4 players
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

const RUNS = parseInt(process.argv[2] || '1500', 10);
const NP = parseInt(process.argv[3] || '4', 10);

function runWithRule(rule) {
  const sandbox = {
    console, Math, Date, JSON, Array, Object, Set, Map, Number, String, Boolean,
    parseInt, parseFloat, isNaN, isFinite,
    document: { getElementById: () => ({ textContent:'', style:{}, classList:{ add(){}, remove(){} } }) },
    window: {}, sessionStorage:{ getItem:()=>null, setItem:()=>{} },
    localStorage:(()=>{const s={};return{getItem:k=>k in s?s[k]:null,setItem:(k,v)=>{s[k]=String(v);},removeItem:k=>{delete s[k];}};})(),
    setTimeout:()=>0, clearTimeout:()=>{}, requestAnimationFrame:()=>0,
    fetch:()=>Promise.resolve({ok:true,json:()=>Promise.resolve({})}),
    performance:{now:()=>Date.now()}, navigator:{userAgent:'sim'},
    location:{hostname:'localhost',search:'',hash:''},
  };
  vm.createContext(sandbox);
  vm.runInContext(`var render=function(){}; var log=function(){}; var logEvent=function(){}; var logGameStart=function(){}; var logGameEnd=function(){}; var setActiveTab=function(){};`, sandbox);

  const files = ['js/constants.js','js/state.js','js/deck.js','js/personality.js','js/logger.js','js/engine.js','js/ai.js','js/simulator.js'];
  for (const f of files) {
    let src = fs.readFileSync(path.join(REPO, f), 'utf8');
    // Patch the rule constant by rewriting its declaration before evaluation.
    if (f === 'js/constants.js') {
      src = src.replace(/const LADYBUG_RULE\s*=\s*'[^']+'\s*;/,
                        `const LADYBUG_RULE = '${rule}';`);
    }
    vm.runInContext(src, sandbox, { filename: f });
  }

  return vm.runInContext(`runSimulation(${NP}, ${RUNS})`, sandbox);
}

function summarize(label, stats) {
  const r = stats.battleEndReasons;
  const total = r.scoreOut + r.lastStanding + r.allDropped;
  const pct = (n) => `${(n/total*100).toFixed(1)}%`;
  return {
    label,
    avgBattles: stats.avgBattles.toFixed(2),
    instantWinPct: (stats.instantWins / RUNS * 100).toFixed(1),
    pointWinPct: (stats.pointWins / RUNS * 100).toFixed(1),
    scoreOutPct: pct(r.scoreOut),
    lastStandingPct: pct(r.lastStanding),
    allDroppedPct: pct(r.allDropped),
    totalBattles: total,
  };
}

console.log(`Ladybug A/B/C test  —  ${NP}-player × ${RUNS} games per rule\n`);

const results = [];
for (const rule of ['none', 'jump', 'stop']) {
  console.log(`Running rule='${rule}'...`);
  results.push(summarize(rule, runWithRule(rule)));
}

console.log('');
console.log('┌──────────┬────────┬────────────┬───────────┬───────────┬──────────────┬────────────┐');
console.log('│ rule     │ avgBtl │ instantWin │ pointWin  │ score-out │ last-standing│ all-dropped│');
console.log('├──────────┼────────┼────────────┼───────────┼───────────┼──────────────┼────────────┤');
for (const r of results) {
  const row = [
    r.label.padEnd(8),
    String(r.avgBattles).padStart(6),
    (r.instantWinPct + '%').padStart(10),
    (r.pointWinPct + '%').padStart(9),
    r.scoreOutPct.padStart(9),
    r.lastStandingPct.padStart(12),
    r.allDroppedPct.padStart(10),
  ];
  console.log(`│ ${row.join(' │ ')} │`);
}
console.log('└──────────┴────────┴────────────┴───────────┴───────────┴──────────────┴────────────┘');
console.log('\nLegend:');
console.log("  none — ladybug ignored (baseline)");
console.log("  jump — chip skips +1 when landing on ladybug");
console.log("  stop — chip stops -1 when landing on ladybug");
