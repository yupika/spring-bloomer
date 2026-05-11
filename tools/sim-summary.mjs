// Spring Bloomer — multi-player-count summary runner.
// Usage:  node tools/sim-summary.mjs [runs]
// Prints avg battles + instant/point win rates for 2/3/4/5 players.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');

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
  vm.runInContext(fs.readFileSync(path.join(REPO, f), 'utf8'), sandbox, { filename: f });
}

const RUNS = parseInt(process.argv[2] || '1500', 10);
const PLAYER_COUNTS = [2, 3, 4, 5];

console.log(`Running ${RUNS} games for each of ${PLAYER_COUNTS.join(', ')} players...\n`);

for (const np of PLAYER_COUNTS) {
  const stats = vm.runInContext(`runSimulation(${np}, ${RUNS})`, sandbox);
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
