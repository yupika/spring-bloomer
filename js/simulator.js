'use strict';
// ============== Simulation ==============
// Snapshot enough of state to restore after a sim run, then run N silent games.
function runSimulation(numPlayers, numGames, onProgress) {
  // Save current state (so we can restore after the sim)
  const saved = JSON.parse(JSON.stringify({
    numPlayers: state.numPlayers,
    players: state.players,
    dummies: state.dummies,
    goalDeck: state.goalDeck,
    goalCard: state.goalCard,
    parentIdx: state.parentIdx,
    currentRound: state.currentRound,
    maxRounds: state.maxRounds,
    phase: state.phase,
    field: state.field,
    positions: state.positions,
    log: state.log,
    winnerId: state.winnerId,
    selectedCardIdx: state.selectedCardIdx,
    currentTurnPlayerId: state.currentTurnPlayerId,
  }));
  const savedSilent = state.silent;

  // Stats accumulators
  const stats = {
    numPlayers, numGames,
    completed: 0,
    instantWins: 0,
    pointWins: 0,
    avgBattles: 0,
    totalBattles: 0,
    perPersonality: {},
    perResourceMode: {},
    perBiddingStyle: {},
    perSeat: {},
    suitFocusWins: { withFocus: 0, total: 0 },
    battleEndReasons: { scoreOut: 0, lastStanding: 0, allDropped: 0 },
    // Per goal card (value-suit): appearance and winner-claim counts.
    // pointWin* tracks only point-win games; all* tracks all games.
    goalCardStats: {},
  };
  for (const spec of GOAL_CARD_SPEC) {
    for (const s of spec.suits) {
      stats.goalCardStats[`${spec.value}-${s}`] = {
        value: spec.value, suit: s,
        appearedAll: 0, winnerHeldAll: 0,
        appearedPoint: 0, winnerHeldPoint: 0,
      };
    }
  }
  for (const t of PERSONALITY_TYPES) {
    stats.perPersonality[t] = {
      games: 0, wins: 0, totalScore: 0, totalCardsLeft: 0,
      instantWins: 0, totalBattles: 0,
    };
  }
  for (const r of RESOURCE_MODES) {
    stats.perResourceMode[r] = { games: 0, wins: 0, totalScore: 0, totalCardsLeft: 0 };
  }
  for (const b of BIDDING_STYLE_TYPES) {
    stats.perBiddingStyle[b] = { games: 0, wins: 0, totalScore: 0, totalCardsLeft: 0 };
  }
  for (let s = 0; s < numPlayers; s++) stats.perSeat[s] = 0;

  for (let g = 0; g < numGames; g++) {
    state.silent = true;
    startGame(numPlayers);
    // startGame in silent mode runs the entire game synchronously via startNewBattle chains
    // Collect results
    const winner = state.players[state.winnerId];
    const wasInstantWin = state.currentRound < state.maxRounds;
    if (wasInstantWin) stats.instantWins++; else stats.pointWins++;
    stats.totalBattles += state.currentRound;

    // Goal card appearance / winner-held tally
    const revealed = state.revealedGoalCards || [];
    const winnerHeldKeys = new Set((winner ? winner.goalCards : []).map(c => `${c.value}-${c.suit}`));
    const appearedKeys = new Set(revealed.map(c => `${c.value}-${c.suit}`));
    for (const key of appearedKeys) {
      const rec = stats.goalCardStats[key];
      if (!rec) continue;
      rec.appearedAll++;
      if (winnerHeldKeys.has(key)) rec.winnerHeldAll++;
      if (!wasInstantWin) {
        rec.appearedPoint++;
        if (winnerHeldKeys.has(key)) rec.winnerHeldPoint++;
      }
    }
    for (const p of state.players) {
      const pp = p.personality;
      if (!pp) continue;
      const rec = stats.perPersonality[pp.type];
      rec.games++;
      rec.totalBattles += state.currentRound;
      const score = p.goalCards.reduce((s, c) => s + c.value, 0);
      const cardsLeft = p.deck.length + p.hand.length;
      rec.totalScore += score;
      rec.totalCardsLeft += cardsLeft;
      if (p.id === state.winnerId) {
        rec.wins++;
        if (wasInstantWin) rec.instantWins++;
        if (pp.suitFocus) stats.suitFocusWins.withFocus++;
      }
      if (p.resourceMode) {
        const rm = stats.perResourceMode[p.resourceMode.type];
        rm.games++;
        rm.totalScore += score;
        rm.totalCardsLeft += cardsLeft;
        if (p.id === state.winnerId) rm.wins++;
      }
      if (p.biddingStyle) {
        const bm = stats.perBiddingStyle[p.biddingStyle.type];
        bm.games++;
        bm.totalScore += score;
        bm.totalCardsLeft += cardsLeft;
        if (p.id === state.winnerId) bm.wins++;
      }
    }
    if (winner && winner.personality && winner.personality.suitFocus) {
      stats.suitFocusWins.total++;
    }
    stats.perSeat[state.winnerId]++;
    if (state.battleEndCounts) {
      for (const r of Object.keys(stats.battleEndReasons)) {
        stats.battleEndReasons[r] += state.battleEndCounts[r] || 0;
      }
    }
    stats.completed++;
    if (onProgress) onProgress(stats.completed, numGames);
  }
  stats.avgBattles = stats.totalBattles / Math.max(1, stats.completed);

  // Restore saved state
  state.silent = savedSilent;
  Object.assign(state, saved);
  return stats;
}

function renderSimResult(stats) {
  const totalGames = stats.completed;
  const meta = `${stats.numPlayers}人プレイ × ${totalGames}回 ／ 平均 ${stats.avgBattles.toFixed(2)} ラウンドで決着 ／ 即勝 ${stats.instantWins}（${(stats.instantWins/totalGames*100).toFixed(1)}%）／ 点数勝ち ${stats.pointWins}`;
  $('sim-meta').textContent = meta;

  // Per personality table
  const persRows = PERSONALITY_TYPES.map(t => {
    const r = stats.perPersonality[t];
    if (r.games === 0) return null;
    const winRate = r.wins / r.games * 100;
    const expected = r.games / stats.numPlayers; // chance baseline
    const winRateBaseline = (r.wins / r.games) / (1 / stats.numPlayers);
    const avgScore = r.totalScore / r.games;
    const avgCardsLeft = r.totalCardsLeft / r.games;
    return { t, r, winRate, expected, winRateBaseline, avgScore, avgCardsLeft };
  }).filter(Boolean).sort((a, b) => b.winRate - a.winRate);

  let persTable = `<table><thead><tr>
    <th>性格</th><th class="num">出場</th><th class="num">勝</th>
    <th class="num">勝率</th><th class="num">vs 公平</th>
    <th class="num">平均得点</th><th class="num">平均残カード</th>
  </tr></thead><tbody>`;
  for (const row of persRows) {
    const baseStr = row.winRateBaseline.toFixed(2) + '×';
    const baseColor = row.winRateBaseline > 1.05 ? 'var(--green-deep)'
                    : row.winRateBaseline < 0.95 ? 'var(--suit-a)' : 'var(--ink)';
    const barWidth = Math.min(100, row.winRate * 1.5);
    persTable += `<tr>
      <td><span class="badge persona persona-${row.t}">${PERSONALITY_LABELS[row.t]}</span></td>
      <td class="num">${row.r.games}</td>
      <td class="num">${row.r.wins}</td>
      <td class="num"><span class="bar" style="width:${barWidth}px"></span>${row.winRate.toFixed(1)}%</td>
      <td class="num" style="color:${baseColor};font-weight:600">${baseStr}</td>
      <td class="num">${row.avgScore.toFixed(1)}</td>
      <td class="num">${row.avgCardsLeft.toFixed(1)}</td>
    </tr>`;
  }
  persTable += '</tbody></table>';

  // Per resource mode
  let rmTable = `<table><thead><tr>
    <th>リソース型</th><th class="num">出場</th><th class="num">勝</th>
    <th class="num">勝率</th><th class="num">vs 公平</th>
    <th class="num">平均得点</th><th class="num">平均残カード</th>
  </tr></thead><tbody>`;
  for (const rm of RESOURCE_MODES) {
    const r = stats.perResourceMode[rm];
    if (r.games === 0) continue;
    const winRate = r.wins / r.games * 100;
    const baseline = (r.wins / r.games) / (1 / stats.numPlayers);
    rmTable += `<tr>
      <td>${RESOURCE_MODE_LABELS[rm]}</td>
      <td class="num">${r.games}</td>
      <td class="num">${r.wins}</td>
      <td class="num">${winRate.toFixed(1)}%</td>
      <td class="num">${baseline.toFixed(2)}×</td>
      <td class="num">${(r.totalScore / r.games).toFixed(1)}</td>
      <td class="num">${(r.totalCardsLeft / r.games).toFixed(1)}</td>
    </tr>`;
  }
  rmTable += '</tbody></table>';

  // Per bidding style
  let bsTable = `<table><thead><tr>
    <th>競り方</th><th class="num">出場</th><th class="num">勝</th>
    <th class="num">勝率</th><th class="num">vs 公平</th>
    <th class="num">平均得点</th><th class="num">平均残カード</th>
  </tr></thead><tbody>`;
  for (const b of BIDDING_STYLE_TYPES) {
    const r = stats.perBiddingStyle[b];
    if (r.games === 0) continue;
    const winRate = r.wins / r.games * 100;
    const baseline = (r.wins / r.games) / (1 / stats.numPlayers);
    bsTable += `<tr>
      <td>${BIDDING_STYLE_LABELS[b]}</td>
      <td class="num">${r.games}</td>
      <td class="num">${r.wins}</td>
      <td class="num">${winRate.toFixed(1)}%</td>
      <td class="num">${baseline.toFixed(2)}×</td>
      <td class="num">${(r.totalScore / r.games).toFixed(1)}</td>
      <td class="num">${(r.totalCardsLeft / r.games).toFixed(1)}</td>
    </tr>`;
  }
  bsTable += '</tbody></table>';

  // Per seat
  let seatTable = `<table><thead><tr><th>席</th><th class="num">勝</th><th class="num">勝率</th></tr></thead><tbody>`;
  for (let s = 0; s < stats.numPlayers; s++) {
    const w = stats.perSeat[s] || 0;
    const wr = (w / totalGames * 100).toFixed(1);
    seatTable += `<tr><td>P${s + 1}${s === 0 ? '（親初期）' : ''}</td><td class="num">${w}</td><td class="num">${wr}%</td></tr>`;
  }
  seatTable += '</tbody></table>';

  // Notes / interpretation
  const winRates = persRows.map(r => r.winRate);
  const spread = winRates.length > 0 ? Math.max(...winRates) - Math.min(...winRates) : 0;
  let interp = '';
  if (spread > 15) {
    interp = `性格間の勝率差が大きい（${spread.toFixed(1)}pt）。バランス調整の余地あり。`;
  } else {
    interp = `性格間の勝率差は小さい（${spread.toFixed(1)}pt）。概ねバランスは取れている。`;
  }

  const html = `
    <div class="sim-section">
      <h3>性格別 勝率</h3>
      ${persTable}
      <p style="font-size:11px; color:var(--ink-soft); margin:8px 0 0;">「vs 公平」= 勝率÷(1/人数)。1.0×が公平基準。${interp}</p>
    </div>
    <div class="sim-section">
      <h3>リソース型 別 勝率</h3>
      ${rmTable}
      <p style="font-size:11px; color:var(--ink-soft); margin:8px 0 0;">使い切/柔軟/保持の3型。性格と直交してランダム付与されます。</p>
    </div>
    <div class="sim-section">
      <h3>競り方 別 勝率</h3>
      ${bsTable}
      <p style="font-size:11px; color:var(--ink-soft); margin:8px 0 0;">粘り/偵察/一点/流しの4型。性格・リソース型と直交してランダム付与されます。</p>
    </div>
    <div class="sim-section">
      <h3>席別 勝数</h3>
      ${seatTable}
    </div>
    <div class="sim-section">
      <h3>ゲーム決着内訳</h3>
      即勝（同スート3 or 異4種）: <strong>${stats.instantWins}</strong> / ${totalGames}（${(stats.instantWins/totalGames*100).toFixed(1)}%）<br>
      点数勝ち（規定ラウンド消化）: <strong>${stats.pointWins}</strong> / ${totalGames}（${(stats.pointWins/totalGames*100).toFixed(1)}%）<br>
      平均ラウンド数: <strong>${stats.avgBattles.toFixed(2)}</strong>
    </div>
    <div class="sim-section">
      <h3>得点札別 勝利貢献度（点数勝ち時）</h3>
      ${(() => {
        const rows = Object.values(stats.goalCardStats)
          .filter(r => r.appearedPoint > 0)
          .map(r => ({
            ...r,
            rate: r.winnerHeldPoint / r.appearedPoint,
            rateAll: r.appearedAll > 0 ? r.winnerHeldAll / r.appearedAll : 0,
            appearRate: r.appearedAll / totalGames,
          }))
          .sort((a, b) => b.rate - a.rate);
        if (rows.length === 0) return '（点数勝ちのゲームが0件）';
        const fair = 1 / stats.numPlayers;
        let tbl = `<table><thead><tr>
          <th>得点札</th><th class="num">値</th>
          <th class="num">出現/全</th><th class="num">出現率</th>
          <th class="num">点勝出現</th><th class="num">勝者獲得</th>
          <th class="num">獲得率</th><th class="num">vs 公平</th>
        </tr></thead><tbody>`;
        for (const r of rows) {
          const baseline = r.rate / fair;
          const baseColor = baseline > 1.20 ? 'var(--suit-a)'
                          : baseline > 1.05 ? 'var(--green-deep)'
                          : baseline < 0.80 ? 'var(--ink-soft)' : 'var(--ink)';
          tbl += `<tr>
            <td><span style="color:var(--suit-${r.suit.toLowerCase()});font-weight:600">${r.value} ${SUIT_GLYPHS[r.suit]}</span> <span style="color:var(--ink-soft);font-size:11px">${SUIT_LABELS[r.suit]}</span></td>
            <td class="num">${r.value}</td>
            <td class="num">${r.appearedAll}/${totalGames}</td>
            <td class="num">${(r.appearRate * 100).toFixed(1)}%</td>
            <td class="num">${r.appearedPoint}</td>
            <td class="num">${r.winnerHeldPoint}</td>
            <td class="num">${(r.rate * 100).toFixed(1)}%</td>
            <td class="num" style="color:${baseColor};font-weight:600">${baseline.toFixed(2)}×</td>
          </tr>`;
        }
        tbl += '</tbody></table>';
        return tbl;
      })()}
      <p style="font-size:11px; color:var(--ink-soft); margin:8px 0 0;">
        「獲得率」=（点数勝ち時に勝者が保有していた割合）／（同カードが出現した点数勝ちゲーム）。
        「vs 公平」が <strong>1.20×超</strong>（赤）は勝者に集まりがちで強カードの疑い。
        100%に近いほど「勝利に常に絡む」。
      </p>
    </div>
    <div class="sim-section">
      <h3>ラウンド決着内訳</h3>
      ${(() => {
        const r = stats.battleEndReasons;
        const total = r.scoreOut + r.lastStanding + r.allDropped;
        if (total === 0) return '（データなし）';
        const pct = (n) => `${n} (${(n/total*100).toFixed(1)}%)`;
        return `${WIN_THRESHOLD}点到達で決着: <strong>${pct(r.scoreOut)}</strong><br>
                他全員が降りて勝者確定: <strong>${pct(r.lastStanding)}</strong><br>
                全員降りて勝者なし: <strong>${pct(r.allDropped)}</strong><br>
                ラウンド総数: <strong>${total}</strong>`;
      })()}
    </div>`;
  $('sim-content').innerHTML = html;
}

let lastSimConfig = null;

function startSimulation() {
  const np = parseInt($('sim-players').value);
  const ng = parseInt($('sim-count').value);
  lastSimConfig = { np, ng };
  $('sim-running').classList.remove('hidden');
  $('sim-progress-text').textContent = `0 / ${ng}`;
  $('sim-progress-bar').style.width = '0%';

  // Defer to next frame so the overlay actually renders before blocking work
  requestAnimationFrame(() => {
    setTimeout(() => {
      const t0 = performance.now();
      // Update progress occasionally (every ~5%)
      let lastUpdate = 0;
      const stats = runSimulation(np, ng, (done, total) => {
        if (done - lastUpdate >= Math.max(1, Math.floor(total / 20)) || done === total) {
          $('sim-progress-text').textContent = `${done} / ${total}`;
          $('sim-progress-bar').style.width = `${(done/total*100).toFixed(1)}%`;
          lastUpdate = done;
        }
      });
      const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
      $('sim-running').classList.add('hidden');
      renderSimResult(stats);
      const meta = $('sim-meta');
      meta.textContent = meta.textContent + `（実行時間 ${elapsed}秒）`;
      $('sim-result').classList.remove('hidden');
    }, 30);
  });
}
