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
  const banner = $('turn-banner');
  if (banner) banner.classList.toggle('hidden', state.phase === 'setup' || state.phase === 'gameOver');

  if (state.phase === 'setup') {
    _prevHandMultiset = null;  // fresh hand will animate in on next game
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
  // Boost = (# of same-suit cards on field) + (1 if this suit is the goal suit).
  // Wild (✣) is not counted toward any suit bonus.
  const fieldCount = {};
  for (const s of SUITS) fieldCount[s] = 0;
  for (const f of state.field) {
    if (f.card.suit !== WILD) fieldCount[f.card.suit]++;
  }
  const goalSuit = state.goalCard ? state.goalCard.suit : null;
  for (const s of SUITS) {
    const fc = fieldCount[s];
    const isGoal = s === goalSuit;
    const boost = fc + (isGoal ? 1 : 0);
    const cls = `st suit-${s.toLowerCase()}${boost === 0 ? ' zero' : ''}${isGoal ? ' goal' : ''}`;
    const goalNote = isGoal ? `（得点札 +1 ／ 場 ${fc}）` : `（場 ${fc}）`;
    const title = `${SUIT_LABELS[s]}: +${boost} ブースト${goalNote}`;
    div.insertAdjacentHTML('beforeend',
      `<span class="${cls}" style="color: var(--suit-${s.toLowerCase()})" title="${title}"><span class="glyph">${SUIT_GLYPHS[s]}</span><span class="count">+${boost}</span></span>`);
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
        params.push(`残量警戒: ${fmt(rm.worryThreshold)}枚/ラウンド`);
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
  if (state.dummies.length === 0) {
    ul.innerHTML = '<li style="font-size: 12px; color: var(--ink-soft); font-style: italic;">なし（4-5人プレイ）</li>';
    return;
  }
  // Track per-dummy reveal state so we only re-render (and flip-animate) on change.
  const flipped = new Set();
  for (const d of state.dummies) {
    const cardKey = d.revealed ? `${d.revealed.suit}${d.revealed.value}${d.revealed.effect || ''}` : '';
    let li = ul.querySelector(`[data-dummy-id="${d.id}"]`);
    const prevKey = li ? li.dataset.cardKey || '' : '';
    if (li && prevKey === cardKey) {
      // Just refresh deck count
      const deckSpan = li.querySelector('.dummy-deck');
      if (deckSpan) deckSpan.textContent = `山${d.deck.length}`;
      continue;
    }
    if (!li) {
      li = document.createElement('li');
      li.className = 'dummy-item';
      li.dataset.dummyId = d.id;
      ul.appendChild(li);
    }
    li.dataset.cardKey = cardKey;
    let cardHTML;
    if (d.revealed) {
      cardHTML = `
        <div class="card card-img-wrap small">
          <div class="flip-card${prevKey === '' ? ' flipped' : ''}">
            <div class="flip-face flip-back"><img class="card-img" src="assets/cards/hand/back.webp" alt="裏"></div>
            <div class="flip-face flip-front"><img class="card-img" src="${cardImagePath(d.revealed, 'hand')}" alt="${d.revealed.value}"></div>
          </div>
        </div>
      `;
      if (prevKey === '') flipped.add(li);
    } else {
      cardHTML = cardBackHTML('small');
    }
    li.innerHTML = `<span class="label">${d.id}</span>${cardHTML}<span class="dummy-deck" style="font-size: 11px; color: var(--ink-soft); margin-left:auto;">山${d.deck.length}</span>`;
  }
  // Trigger flip animations on next frame for freshly-revealed cards.
  if (flipped.size) {
    requestAnimationFrame(() => {
      for (const li of flipped) {
        const fc = li.querySelector('.flip-card');
        if (fc) fc.classList.remove('flipped');
      }
    });
  }
}

function renderGoal() {
  $('round-info').textContent = `Round ${state.currentRound} / ${state.maxRounds}`;
  const div = $('goal-card-display');
  if (!state.goalCard) {
    div.classList.remove('has-img');
    div.innerHTML = '<span class="muted">—</span>';
    div.dataset.cardKey = '';
    return;
  }
  const c = state.goalCard;
  const cardKey = `${c.suit}${c.value}`;
  if (div.dataset.cardKey === cardKey) return;  // unchanged, skip re-render
  div.dataset.cardKey = cardKey;
  div.classList.add('has-img');
  div.style.borderColor = `var(--suit-${c.suit.toLowerCase()})`;
  div.innerHTML = `
    <div class="flip-card flipped">
      <div class="flip-face flip-back"><img class="card-img" src="assets/cards/goal/back.webp" alt="裏"></div>
      <div class="flip-face flip-front"><img class="card-img" src="${cardImagePath(c, 'goal')}" alt="${c.value} ${SUIT_LABELS[c.suit]}"></div>
    </div>
  `;
  requestAnimationFrame(() => {
    const fc = div.querySelector('.flip-card');
    if (fc) fc.classList.remove('flipped');
  });
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

    if (state.ladybugPos === i) {
      cell.classList.add('ladybug-cell');
      const bug = document.createElement('span');
      bug.className = 'ladybug';
      bug.textContent = '🐞';
      bug.title = `テントウムシ — ラウンド ${i}`;
      cell.appendChild(bug);
    }

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

  // During multiplayer reveal phase, show face-down placeholders for opponents
  // who have already submitted (their card content is hidden until reveal).
  if (state.phase === 'reveal' && state.mode === 'multi') {
    const submitted = state.players.filter(p =>
      p.id !== state.mySeat && (p.simSubmitted || p.simChoice));
    if (submitted.length === 0 && state.field.length === 0) {
      div.innerHTML = '<span style="font-size: 12px; color: var(--ink-soft); font-style: italic;">他のプレイヤーが選択中…</span>';
      return;
    }
    for (const p of submitted) {
      const wrap = document.createElement('div');
      wrap.className = 'field-card submitted';
      wrap.innerHTML = `<span class="owner">${p.name}</span>${cardBackHTML('small')}<div class="marker">提出済み</div>`;
      div.appendChild(wrap);
    }
    if (submitted.length === 0) {
      div.innerHTML = '<span style="font-size: 12px; color: var(--ink-soft); font-style: italic;">他のプレイヤーが選択中…</span>';
    }
    return;
  }

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

function cardImagePath(card, kind = 'hand') {
  if (card.suit === WILD) {
    if (card.effect === 'round') return 'assets/cards/hand/W-round.webp';
    if (card.effect === 'draw')  return 'assets/cards/hand/W-draw.webp';
    return 'assets/cards/hand/W-plain.webp';
  }
  return `assets/cards/${kind}/${card.suit}${card.value}.webp`;
}

function cardBackHTML(size, kind = 'hand') {
  const cls = `card card-img-wrap${size === 'small' ? ' small' : ''}`;
  return `<div class="${cls}"><img class="card-img" src="assets/cards/${kind}/back.webp" alt="裏"></div>`;
}

function cardHTMLString(card, size, kind = 'hand') {
  const cls = `card card-img-wrap${size === 'small' ? ' small' : ''} suit-${card.suit.toLowerCase()}`;
  const src = cardImagePath(card, kind);
  const alt = card.suit === WILD
    ? `${card.value} ✣${card.effect ? ' ' + WILD_EFFECT_LABELS[card.effect] : ''}`
    : `${card.value} ${SUIT_LABELS[card.suit]}`;
  return `<div class="${cls}"><img class="card-img" src="${src}" alt="${alt}" loading="lazy"></div>`;
}

// Tracks the previous hand as a multiset so newly drawn cards can flip in.
let _prevHandMultiset = null;

function _handKey(c) { return c.suit + c.value + (c.effect || ''); }
function _handToMultiset(hand) {
  const m = new Map();
  for (const c of hand) {
    const k = _handKey(c);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function renderHand() {
  const me = state.players[state.mySeat];
  $('hand-count').textContent = me.hand.length;
  $('deck-count').textContent = me.deck.length;

  const div = $('hand-cards');
  div.innerHTML = '';

  if (me.hand.length === 0) {
    div.innerHTML = '<span style="font-size: 13px; color: var(--ink-soft); font-style: italic;">手札なし（自動的に降りる扱い）</span>';
    _prevHandMultiset = new Map();
    return;
  }

  // Display sorted by suit then value, but track original index
  const indexed = me.hand.map((c, i) => ({ c, i }));
  indexed.sort((a, b) => {
    if (a.c.suit !== b.c.suit) return ALL_SUITS.indexOf(a.c.suit) - ALL_SUITS.indexOf(b.c.suit);
    return a.c.value - b.c.value;
  });

  const alreadySubmitted = state.mode === 'multi' && state.phase === 'reveal' && me.simChoice;
  const isMyTurn = (state.phase === 'reveal' && !alreadySubmitted) ||
                   (state.phase === 'bidding' && state.currentTurnPlayerId === state.mySeat);

  // Compare against previous hand to detect freshly drawn cards.
  const prev = new Map(_prevHandMultiset || []);
  const toFlip = [];
  let staggerIdx = 0;

  for (const { c, i } of indexed) {
    const cardEl = document.createElement('div');
    cardEl.className = `card card-img-wrap hand-card suit-${c.suit.toLowerCase()}`;
    if (state.selectedCardIdx === i) cardEl.classList.add('selected');
    if (!isMyTurn) cardEl.classList.add('disabled');
    const src = cardImagePath(c, 'hand');
    const alt = c.suit === WILD
      ? `${c.value} ✣${c.effect ? ' ' + WILD_EFFECT_LABELS[c.effect] : ''}`
      : `${c.value} ${SUIT_LABELS[c.suit]}`;

    const k = _handKey(c);
    const prevCount = prev.get(k) || 0;
    const isFreshlyDrawn = prevCount === 0;
    if (!isFreshlyDrawn) prev.set(k, prevCount - 1);

    if (isFreshlyDrawn) {
      const delay = staggerIdx * 140;
      staggerIdx++;
      cardEl.innerHTML = `
        <div class="flip-card flipped" style="transition-delay: ${delay}ms;">
          <div class="flip-face flip-back"><img class="card-img" src="assets/cards/hand/back.webp" alt=""></div>
          <div class="flip-face flip-front"><img class="card-img" src="${src}" alt="${alt}"></div>
        </div>`;
      toFlip.push(cardEl);
    } else {
      cardEl.innerHTML = `<img class="card-img" src="${src}" alt="${alt}" loading="lazy">`;
    }

    if (c.suit === WILD && c.effect) cardEl.title = WILD_EFFECT_DESC[c.effect];
    cardEl.addEventListener('click', () => {
      if (!isMyTurn) return;
      state.selectedCardIdx = (state.selectedCardIdx === i) ? null : i;
      render();
    });
    div.appendChild(cardEl);
  }

  // Trigger the flip on next frame so the transition fires.
  if (toFlip.length) {
    requestAnimationFrame(() => {
      for (const el of toFlip) {
        const fc = el.querySelector('.flip-card');
        if (fc) fc.classList.remove('flipped');
      }
    });
  }

  _prevHandMultiset = _handToMultiset(me.hand);
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
      m.className = `goal-mini card-img-wrap suit-${c.suit.toLowerCase()}`;
      m.innerHTML = `<img class="card-img" src="${cardImagePath(c, 'goal')}" alt="${c.value} ${SUIT_LABELS[c.suit]}">`;
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

function setTurnBanner(text, variant) {
  const b = $('turn-banner');
  const t = $('turn-banner-text');
  if (!b || !t) return;
  if (!text) { b.classList.add('hidden'); return; }
  b.classList.remove('hidden');
  b.classList.remove('my-turn', 'submitted', 'waiting');
  if (variant) b.classList.add(variant);
  t.textContent = text;
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
      const total = state.players.length;
      const submitted = state.players.filter(p => p.simChoice).length;
      txt.innerHTML = `<strong>同時出しフェイズ</strong> ／ 提出済み<br><span class="muted">他のプレイヤーを待っています…（${submitted} / ${total} 名以上）</span>`;
      setTurnBanner(`✓ 提出済み — 他のプレイヤーを待っています (${submitted}/${total})`, 'submitted');
      playBtn.disabled = true;
    } else {
      const note = state.mode === 'multi'
        ? '手札からカードを選んで「出す」を押す。他のプレイヤーが選択するまで待ちます。'
        : '手札からカードを選んで「出す」を押す。CPUは既に選択済み。';
      txt.innerHTML = `<strong>同時出しフェイズ</strong> ／ 親 ${state.players[state.parentIdx].name}<br><span class="muted">${note}</span>`;
      setTurnBanner('▶ 同時出し — カードを選んでください', 'my-turn');
      playBtn.disabled = state.selectedCardIdx === null || me.hand.length === 0;
      playBtn.textContent = '出す';
    }
  } else if (state.phase === 'bidding') {
    const cur = state.players[state.currentTurnPlayerId];
    const meIsCurrentTurn = state.currentTurnPlayerId === state.mySeat;
    if (meIsCurrentTurn) {
      const myPos = state.positions.find(p => p.playerId === state.mySeat);
      const ableToEnd = canEndTurn(state.mySeat);

      if (ableToEnd) {
        txt.innerHTML = `<strong>▶ あなたの手番です</strong>（最下位は他へ） ／ 位置 ${myPos.value}<br><span class="muted">続けて出して引き離す／「ターン終了」で次のプレイヤーへ／降りる</span>`;
      } else {
        const cardsRemain = me.hand.length;
        txt.innerHTML = `<strong>▶ あなたの手番です</strong>（最下位） ／ 位置 ${myPos.value} ／ 残り ${WIN_THRESHOLD - myPos.value} で勝利<br><span class="muted">出すか降りるかを選択（最下位を抜けるまで複数枚出してOK）／手札 ${cardsRemain}枚</span>`;
      }
      setTurnBanner('▶ あなたの手番です', 'my-turn');
      playBtn.disabled = state.selectedCardIdx === null || me.hand.length === 0;
      playBtn.textContent = '出す';
      endTurnBtn.disabled = !ableToEnd;
      dropBtn.disabled = false;
    } else if (cur) {
      const note = state.mode === 'multi' ? '相手の入力待ち' : 'CPU思考中';
      txt.innerHTML = `<strong>${cur.name} の手番</strong>...<br><span class="muted">${note}</span>`;
      setTurnBanner(`${cur.name} の手番 — ${note}`, 'waiting');
    } else {
      txt.textContent = '...';
      setTurnBanner('', null);
    }
  } else if (state.phase === 'battleEnd') {
    txt.innerHTML = `<strong>ラウンド終了</strong> ／ 次ラウンド準備中…`;
    setTurnBanner('ラウンド終了 — 次ラウンド準備中…', 'waiting');
  } else {
    setTurnBanner('', null);
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

  // Save to local play history (once per game)
  if (!state.historySaved && typeof recordPlayHistory === 'function') {
    const me = state.players[state.mySeat];
    if (me) {
      const myRank = sorted.findIndex(p => p.id === me.id) + 1;
      const myScore = me.goalCards.reduce((s, c) => s + c.value, 0);
      const winType = determineWinType(w.goalCards);
      recordPlayHistory({
        ts: Date.now(),
        mode: state.mode || 'solo',
        numPlayers: state.players.length,
        myName: me.name,
        myRank,
        myScore,
        winnerName: w.name,
        winType,
      });
      if (typeof renderHistoryList === 'function') renderHistoryList();
    }
    state.historySaved = true;
  }
}

// ============== Tabs (mobile) ==============
function setActiveTab(tab) {
  document.body.dataset.activeTab = tab;
  document.querySelectorAll('#tab-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.go === tab);
  });
}
