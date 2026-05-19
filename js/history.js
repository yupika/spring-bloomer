'use strict';
// Lightweight play history — stored in localStorage on this device only.
// One record per finished game; capped at HISTORY_LIMIT entries (most recent first).

const HISTORY_KEY = 'bloomer-play-history';
const HISTORY_LIMIT = 20;

function recordPlayHistory(rec) {
  try {
    const arr = getPlayHistory();
    arr.unshift(rec);
    if (arr.length > HISTORY_LIMIT) arr.length = HISTORY_LIMIT;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
  } catch {}
}

function getPlayHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function clearPlayHistory() {
  try { localStorage.removeItem(HISTORY_KEY); } catch {}
}

// Determine win type from the winner's collected goal cards
function determineWinType(winnerCards) {
  if (!winnerCards || winnerCards.length === 0) return { type: 'points' };
  const suitCount = {};
  for (const c of winnerCards) suitCount[c.suit] = (suitCount[c.suit] || 0) + 1;
  for (const [suit, n] of Object.entries(suitCount)) {
    if (n >= 3) return { type: 'sameSuit', suit };
  }
  const distinct = Object.keys(suitCount).length;
  if (distinct >= 4) return { type: 'distinctSuits', count: distinct };
  return { type: 'points' };
}

function describeWinType(wt) {
  if (!wt) return '—';
  if (wt.type === 'sameSuit') {
    const lbl = (typeof SUIT_LABELS !== 'undefined' && SUIT_LABELS[wt.suit]) || wt.suit;
    const gly = (typeof SUIT_GLYPHS !== 'undefined' && SUIT_GLYPHS[wt.suit]) || '';
    return `${gly} ${lbl} 3枚`;
  }
  if (wt.type === 'distinctSuits') return `${wt.count}種揃え`;
  return '合計点勝負';
}

function formatHistoryDate(ts) {
  const d = new Date(ts);
  const m = d.getMonth() + 1, day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${hh}:${mm}`;
}

function renderHistoryList() {
  const section = document.getElementById('history-section');
  const list = document.getElementById('history-list');
  if (!section || !list) return;
  const items = getPlayHistory();
  if (items.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  list.innerHTML = items.map(it => {
    const modeLbl = it.mode === 'online' ? '🌸 オンライン' : '🌱 ソロ';
    const winLbl = describeWinType(it.winType);
    const myWin = it.myRank === 1;
    const rankCls = myWin ? 'won' : (it.myRank === 2 ? 'second' : '');
    const meBlock = `<span class="hist-rank ${rankCls}">${it.myRank}位</span><span class="hist-name">${escapeHtml(it.myName || 'あなた')}</span>`;
    const winnerSuffix = myWin
      ? `<span class="hist-suffix won">勝ち</span>`
      : `<span class="hist-suffix">勝者: ${escapeHtml(it.winnerName || '—')}</span>`;
    return `<li class="hist-item">
      <span class="hist-meta">${modeLbl} ／ ${it.numPlayers}人</span>
      ${meBlock}
      ${winnerSuffix}
      <span class="hist-win">${winLbl}</span>
      <span class="hist-date">${formatHistoryDate(it.ts)}</span>
    </li>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
