'use strict';
// ============== Logging & Rendering ==============
function log(msg, cls) {
  state.log.push({ msg, cls: cls || '' });
  if (state.log.length > 200) state.log.shift();
}

const $ = (id) => document.getElementById(id);

function render() {
  if (state.silent) return;
  $('setup').classList.toggle('hidden', state.phase !== 'setup');
  $('game').classList.toggle('hidden', state.phase === 'setup' || state.phase === 'gameOver');
  $('result').classList.toggle('hidden', state.phase !== 'gameOver');
  $('tab-nav').classList.toggle('hidden', state.phase === 'setup' || state.phase === 'gameOver');

  if (state.phase === 'setup') {
    if (typeof renderLobbyOrSetup === 'function') renderLobbyOrSetup();
    return;
  }
  if (state.phase === 'gameOver') { renderResult(); return; }

  renderPlayers();
  renderDummies();
  renderGoal();
  renderBoard();
  renderSuitTally();
  renderField();
  renderHand();
  renderMyGoals();
  renderPhase();
  renderLog();
}

function renderSuitTally() {
  const div = $('suit-tally');
  if (!div) return;
  div.innerHTML = '';
  const counts = {};
  for (const s of ALL_SUITS) counts[s] = 0;
  for (const f of state.field) counts[f.card.suit]++;
  const goalSuit = state.goalCard ? state.goalCard.suit : null;
  for (const s of ALL_SUITS) {
    const n = counts[s];
    const isGoal = s === goalSuit;
    const cls = `st suit-${s.toLowerCase()}${n === 0 ? ' zero' : ''}${isGoal ? ' goal' : ''}`;
    const title = `${SUIT_LABELS[s]}: 場に ${n} 枚${isGoal ? '（目的スート）' : ''}`;
    div.insertAdjacentHTML('beforeend',
      `<span class="${cls}" style="color: var(--suit-${s.toLowerCase()})" title="${title}"><span class="glyph">${SUIT_GLYPHS[s]}</span><span class="count">${n}</span></span>`);
  }
}

function renderPlayers() {
  const ul = $('player-list');
  ul.innerHTML = '';
  for (const p of state.players) {
    const li = document.createElement('li');
    li.className = 'player-item';
    if (p.isHuman) li.classList.add('you');
    if (state.currentTurnPlayerId === p.id) li.classList.add('current');
    if (p.droppedOut) li.classList.add('dropped');

    const goalSum = p.goalCards.reduce((s, c) => s + c.value, 0);
    const suitCount = {};
    for (const c of p.goalCards) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
    const suitsStr = Object.entries(suitCount).map(([s, n]) => `${SUIT_GLYPHS[s]}${n}`).join(' ');

    const pos = state.positions[p.id];
    const posValue = pos ? pos.value : 0;

    let personaBadge = '';
    if (p.personality) {
      const pp = p.personality;
      const rm = p.resourceMode;
      const focus = pp.suitFocus ? ` (${SUIT_GLYPHS[pp.suitFocus]})` : '';
      const fmt = (n) => (n).toFixed(2);
      const params = [
        `攻め: ${fmt(pp.aggression)}`,
        `値重視: ${fmt(pp.valueWeight)}`,
        `参戦閾: ${fmt(pp.minEngage)}`,
        `リスク: ${fmt(pp.riskTolerance)}`,
        `粘り: ${fmt(pp.sticky)}`,
        `撤退耐性: ${fmt(pp.dropTax)}`,
      ];
      if (pp.suitFocusBoost) params.push(`染め執着: ${fmt(pp.suitFocusBoost)}`);
      if (pp.dumpBias) params.push(`捨て偏重: ${fmt(pp.dumpBias)}`);
      if (pp.lowValueIgnore) params.push(`低価値無視: ≤${pp.lowValueIgnore}`);
      if (pp.highValueBonus) params.push(`高価値贔屓: +${fmt(pp.highValueBonus)}`);
      if (pp.reactiveLock) params.push(`後追い乗り: +${fmt(pp.reactiveLock)}`);
      if (pp.lockDumpBias) params.push(`乗り後捨て: ${fmt(pp.lockDumpBias)}`);
      if (rm) {
        params.push(`―― ${RESOURCE_MODE_DESC[rm.type]}`);
        params.push(`残量警戒: ${fmt(rm.worryThreshold)}枚/バトル`);
        params.push(`圧縮下限: ${fmt(rm.pressureFloor)}`);
      }
      const bst = p.biddingStyle;
      if (bst) {
        params.push(`―― ${BIDDING_STYLE_DESC[bst.type]}`);
        params.push(`同時出しdesire偏差: ${fmt(bst.desireShiftSim)}`);
        params.push(`カード選択シフト: ${bst.simCardShift}`);
        params.push(`参戦倍率: ${fmt(bst.engageMultiplier)}`);
        if (bst.type === 'scout') params.push(`撤退人数閾: ${bst.competitorDropThreshold}人`);
        if (bst.type === 'burst') params.push(`投入上限: ${bst.commitmentLimit}枚`);
        if (bst.type === 'drifter') params.push(`参戦上限比率: ${fmt(bst.opponentCeilingRatio)}`);
      }
      const title = `${PERSONALITY_DESC[pp.type]}\n――\n${params.join('\n')}`;
      const rmTag = rm ? `/${RESOURCE_MODE_LABELS[rm.type]}` : '';
      const bsTag = bst ? `/${BIDDING_STYLE_LABELS[bst.type]}` : '';
      personaBadge = `<span class="badge persona persona-${pp.type}" title="${title}">${PERSONALITY_LABELS[pp.type]}${focus}<span style="opacity:.7;font-size:9px">${rmTag}${bsTag}</span></span>`;
    }

    li.innerHTML = `
      <div><span class="player-color-dot" style="background:${PLAYER_COLORS[p.id]}"></span><span class="name">${p.name}</span></div>
      <div class="stats">手札 ${p.hand.length} ／ 山 ${p.deck.length} ／ 位置 ${posValue}</div>
      <div class="stats">獲得 ${p.goalCards.length}枚 ${goalSum}点 ${suitsStr}</div>
      <div class="badges">
        ${p.id === state.parentIdx ? '<span class="badge parent">親</span>' : ''}
        ${p.droppedOut ? '<span class="badge dropped">降</span>' : ''}
        ${personaBadge}
      </div>
    `;
    ul.appendChild(li);
  }
}

function renderDummies() {
  const ul = $('dummy-list');
  ul.innerHTML = '';
  if (state.dummies.length === 0) {
    ul.innerHTML = '<li style="font-size: 12px; color: var(--ink-soft); font-style: italic;">なし（4-5人プレイ）</li>';
    return;
  }
  for (const d of state.dummies) {
    const li = document.createElement('li');
    li.className = 'dummy-item';
    const cardHTML = d.revealed ? cardHTMLString(d.revealed, 'small') : '<span style="font-size: 11px; color: var(--ink-soft);">未公開</span>';
    li.innerHTML = `<span class="label">${d.id}</span>${cardHTML}<span style="font-size: 11px; color: var(--ink-soft); margin-left:auto;">山${d.deck.length}</span>`;
    ul.appendChild(li);
  }
}

function renderGoal() {
  $('round-info').textContent = `Battle ${state.currentRound} / ${state.maxRounds}`;
  const div = $('goal-card-display');
  if (state.goalCard) {
    const c = state.goalCard;
    div.style.borderColor = `var(--suit-${c.suit.toLowerCase()})`;
    div.innerHTML = `
      <div class="gv" style="color: var(--suit-${c.suit.toLowerCase()})">${c.value}</div>
      <div class="gs" style="color: var(--suit-${c.suit.toLowerCase()})">${SUIT_GLYPHS[c.suit]}</div>
      <div class="gname" style="color: var(--suit-${c.suit.toLowerCase()})">${SUIT_LABELS[c.suit]}</div>
    `;
  } else {
    div.innerHTML = '<span class="muted">—</span>';
  }
}

function renderBoard() {
  const grid = $('board-grid');
  grid.innerHTML = '';
  for (let i = 0; i <= SCORE_BOARD_MAX; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    if (i === 0) cell.classList.add('start');
    if (i >= WIN_THRESHOLD && i < SCORE_BOARD_MAX) cell.classList.add('win-zone');
    if (i === WIN_THRESHOLD) cell.classList.add('win-mark');

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i;
    cell.appendChild(num);

    const here = state.positions
      .filter(p => p.value === i)
      .sort((a, b) => a.placedAt - b.placedAt);

    if (here.length > 0) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const pos of here) {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.style.background = PLAYER_COLORS[pos.playerId];
        chip.title = `${state.players[pos.playerId].name} (${pos.value})`;
        chip.textContent = pos.playerId === state.mySeat ? 'Y' : `${pos.playerId}`;
        if (state.players[pos.playerId].droppedOut) chip.style.opacity = '0.4';
        chips.appendChild(chip);
      }
      cell.appendChild(chips);
    }
    grid.appendChild(cell);
  }
}

function renderField() {
  const div = $('field-cards');
  div.innerHTML = '';
  if (state.field.length === 0) {
    div.innerHTML = '<span style="font-size: 12px; color: var(--ink-soft); font-style: italic;">カードはまだ場に出ていません</span>';
    return;
  }
  // Sort: dummies first, then players (for stable visual)
  const sorted = state.field.slice().sort((a, b) => {
    if (a.fromDummy !== b.fromDummy) return a.fromDummy ? -1 : 1;
    return 0;
  });
  for (const f of sorted) {
    const wrap = document.createElement('div');
    wrap.className = 'field-card' + (f.fromDummy ? ' dummy' : '');
    const owner = f.fromDummy ? `ダミー${f.playerId}` : state.players[f.playerId].name;
    const marker = f.fromDummy ? '<div class="marker">dummy</div>' : '';
    wrap.innerHTML = `<span class="owner">${owner}</span>${cardHTMLString(f.card, 'small')}${marker}`;
    div.appendChild(wrap);
  }
}

function cardHTMLString(card, size) {
  const cls = `card${size === 'small' ? ' small' : ''} suit-${card.suit.toLowerCase()}`;
  const eff = (card.suit === WILD && card.effect)
    ? `<div class="e">${WILD_EFFECT_LABELS[card.effect]}</div>`
    : '';
  return `<div class="${cls}"><div class="v">${card.value}</div><div class="s">${SUIT_GLYPHS[card.suit]}</div>${eff}</div>`;
}

function renderHand() {
  const me = state.players[state.mySeat];
  $('hand-count').textContent = me.hand.length;
  $('deck-count').textContent = me.deck.length;

  const div = $('hand-cards');
  div.innerHTML = '';

  // Display sorted by suit then value, but track original index
  const indexed = me.hand.map((c, i) => ({ c, i }));
  indexed.sort((a, b) => {
    if (a.c.suit !== b.c.suit) return ALL_SUITS.indexOf(a.c.suit) - ALL_SUITS.indexOf(b.c.suit);
    return a.c.value - b.c.value;
  });

  const alreadySubmitted = state.mode === 'multi' && state.phase === 'reveal' && me.simChoice;
  const isMyTurn = (state.phase === 'reveal' && !alreadySubmitted) ||
                   (state.phase === 'bidding' && state.currentTurnPlayerId === state.mySeat);

  for (const { c, i } of indexed) {
    const cardEl = document.createElement('div');
    cardEl.className = `card hand-card suit-${c.suit.toLowerCase()}`;
    if (state.selectedCardIdx === i) cardEl.classList.add('selected');
    if (!isMyTurn) cardEl.classList.add('disabled');
    const eff = (c.suit === WILD && c.effect)
      ? `<div class="e">${WILD_EFFECT_LABELS[c.effect]}</div>`
      : '';
    cardEl.innerHTML = `<div class="v">${c.value}</div><div class="s">${SUIT_GLYPHS[c.suit]}</div>${eff}`;
    if (c.suit === WILD && c.effect) {
      cardEl.title = WILD_EFFECT_DESC[c.effect];
    }
    cardEl.addEventListener('click', () => {
      if (!isMyTurn) return;
      state.selectedCardIdx = (state.selectedCardIdx === i) ? null : i;
      render();
    });
    div.appendChild(cardEl);
  }

  if (me.hand.length === 0) {
    div.innerHTML = '<span style="font-size: 13px; color: var(--ink-soft); font-style: italic;">手札なし（自動的に降りる扱い）</span>';
  }
}

function renderMyGoals() {
  const me = state.players[state.mySeat];
  const div = $('my-goals-row');
  div.innerHTML = '';
  if (me.goalCards.length === 0) {
    div.innerHTML = '<span style="font-size: 12px; color: var(--ink-soft); font-style: italic;">まだなし</span>';
  } else {
    for (const c of me.goalCards) {
      const m = document.createElement('div');
      m.className = `goal-mini suit-${c.suit.toLowerCase()}`;
      m.innerHTML = `<span class="gv">${c.value}</span><span class="gs">${SUIT_GLYPHS[c.suit]}</span>`;
      div.appendChild(m);
    }
  }

  // Suit progress
  const sp = $('my-suit-progress');
  sp.innerHTML = '';
  const suitCount = {};
  for (const c of me.goalCards) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
  for (const s of SUITS) {
    const n = suitCount[s] || 0;
    const row = document.createElement('div');
    row.style.display = 'contents';
    sp.insertAdjacentHTML('beforeend',
      `<span class="pname"><span class="glyph" style="color: var(--suit-${s.toLowerCase()})">${SUIT_GLYPHS[s]}</span> ${SUIT_LABELS[s]}</span><span style="font-weight: ${n>=3?'700':'400'}; color: ${n>=3?'var(--suit-a)':'var(--ink)'}">${n}</span>`);
  }

  const totalPts = me.goalCards.reduce((s, c) => s + c.value, 0);
  const distinctSuits = Object.keys(suitCount).length;
  const required = DISTINCT_SUITS_REQUIRED;
  $('win-hint').innerHTML = `合計 <strong>${totalPts}</strong>点 ／ 異なるスート ${distinctSuits} 種<br>勝利条件: 同スート3枚 or 異なる ${required} 種`;
}

function renderPhase() {
  const txt = $('phase-text');
  const playBtn = $('play-btn');
  const endTurnBtn = $('end-turn-btn');
  const dropBtn = $('drop-btn');
  playBtn.disabled = true;
  endTurnBtn.disabled = true;
  dropBtn.disabled = true;

  const me = state.players[state.mySeat];

  if (state.phase === 'reveal') {
    if (state.mode === 'multi' && me.simChoice) {
      // I've already submitted; show waiting state
      const total = state.players.length;
      const submitted = state.players.filter(p => p.simChoice).length;
      // For others' simChoice we can only see our own due to reveal-phase filtering,
      // so derive remaining from positions or fall back to a generic message.
      txt.innerHTML = `<strong>同時出しフェイズ</strong> ／ 提出済み<br><span class="muted">他のプレイヤーを待っています…（${submitted} / ${total} 名以上）</span>`;
      playBtn.disabled = true;
    } else {
      const note = state.mode === 'multi'
        ? '手札からカードを選んで「出す」を押す。他のプレイヤーが選択するまで待ちます。'
        : '手札からカードを選んで「出す」を押す。CPUは既に選択済み。';
      txt.innerHTML = `<strong>同時出しフェイズ</strong> ／ 親 ${state.players[state.parentIdx].name}<br><span class="muted">${note}</span>`;
      playBtn.disabled = state.selectedCardIdx === null || me.hand.length === 0;
      playBtn.textContent = '出す';
    }
  } else if (state.phase === 'bidding') {
    const cur = state.players[state.currentTurnPlayerId];
    const meIsCurrentTurn = state.currentTurnPlayerId === state.mySeat;
    if (meIsCurrentTurn) {
      const myPos = state.positions.find(p => p.playerId === state.mySeat);
      const ableToEnd = canEndTurn(state.mySeat);
      const others = state.positions
        .filter(p => p.playerId !== state.mySeat && !state.players[p.playerId].droppedOut);
      const minOther = others.length > 0 ? Math.min.apply(null, others.map(p => p.value)) : 0;

      if (ableToEnd) {
        const margin = myPos.value - minOther;
        txt.innerHTML = `<strong>${cur.name} の手番</strong>（最下位は他へ） ／ 位置 ${myPos.value}（次点 ${minOther}、差 +${margin}）<br><span class="muted">続けて出して引き離す／「ターン終了」で次のプレイヤーへ／降りる</span>`;
      } else {
        const cardsRemain = me.hand.length;
        txt.innerHTML = `<strong>${cur.name} の手番</strong>（最下位） ／ 位置 ${myPos.value} ／ 残り ${WIN_THRESHOLD - myPos.value} で勝利<br><span class="muted">出すか降りるかを選択（最下位を抜けるまで複数枚出してOK）／手札 ${cardsRemain}枚</span>`;
      }
      playBtn.disabled = state.selectedCardIdx === null || me.hand.length === 0;
      playBtn.textContent = '出す';
      endTurnBtn.disabled = !ableToEnd;
      dropBtn.disabled = false;
    } else if (cur) {
      const note = state.mode === 'multi' ? '相手の入力待ち' : 'CPU思考中';
      txt.innerHTML = `<strong>${cur.name} の手番</strong>...<br><span class="muted">${note}</span>`;
    } else {
      txt.textContent = '...';
    }
  } else if (state.phase === 'battleEnd') {
    txt.innerHTML = `<strong>バトル終了</strong> ／ 次バトル準備中…`;
  }
}

function renderLog() {
  const div = $('log');
  div.innerHTML = state.log.slice(-40).map(l => `<div class="log-line ${l.cls}">${l.msg}</div>`).join('');
  div.scrollTop = div.scrollHeight;
}

function renderResult() {
  const w = state.players[state.winnerId];
  if (!w) { $('result-title').textContent = 'ゲーム終了'; $('result-detail').innerHTML = ''; return; }
  const isMe = state.winnerId === state.mySeat;
  $('result-title').textContent = isMe ? `🌸 ${w.name} の勝利!` : `🥀 ${w.name} の勝利`;
  const sorted = state.players.slice().sort((a, b) => {
    const at = a.goalCards.reduce((s, c) => s + c.value, 0);
    const bt = b.goalCards.reduce((s, c) => s + c.value, 0);
    return bt - at;
  });
  const lines = sorted.map((p, i) => {
    const total = p.goalCards.reduce((s, c) => s + c.value, 0);
    const cards = p.goalCards.map(c => formatCard(c)).join(' ');
    return `<div>${i + 1}. <strong>${p.name}</strong> ${p.goalCards.length}枚 ／ ${total}点 — ${cards || '—'}</div>`;
  }).join('');
  $('result-detail').innerHTML = `<span class="winner">${w.name}</span>${lines}`;
}

// ============== Tabs (mobile) ==============
function setActiveTab(tab) {
  document.body.dataset.activeTab = tab;
  document.querySelectorAll('#tab-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
}
