'use strict';
// ============== Event Handlers ==============
// Dev mode: enable simulation panel and any other dev tooling.
// Trigger with ?dev=1 (or #dev) in the URL. Persists for the session via
// sessionStorage so refreshes don't lose it.
function isDevMode() {
  if (sessionStorage.getItem('bloomer-dev') === '1') return true;
  const params = new URLSearchParams(location.search);
  if (params.get('dev') === '1' || location.hash === '#dev') {
    sessionStorage.setItem('bloomer-dev', '1');
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (isDevMode()) {
    document.body.classList.add('dev-mode');
    const sc = document.getElementById('sim-cta');
    if (sc) sc.classList.remove('hidden');
  }

  // Log opt-in: sync checkbox with localStorage state
  const optInToggle = $('log-optin-toggle');
  if (optInToggle) {
    optInToggle.checked = isLogOptedIn();
    optInToggle.addEventListener('change', (e) => setLogOptIn(e.target.checked));
  }

  // Player name: load from localStorage, persist on change
  const nameInput = $('player-name-input');
  if (nameInput) {
    const saved = localStorage.getItem('bloomer-player-name') || '';
    nameInput.value = saved;
    nameInput.addEventListener('input', (e) => {
      localStorage.setItem('bloomer-player-name', e.target.value.trim());
    });
  }

  document.querySelectorAll('[data-players]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.silent = false;
      state.mode = 'single';
      state.mySeat = 0;
      const name = (nameInput?.value || '').trim() || 'あなた';
      startGame(parseInt(btn.dataset.players), name);
      setActiveTab('battle');
    });
  });
  $('play-btn').addEventListener('click', () => {
    if (state.selectedCardIdx === null) return;
    if (state.mode === 'multi') {
      const idx = state.selectedCardIdx;
      state.selectedCardIdx = null;
      if (state.phase === 'reveal') mpSimChoice(idx);
      else if (state.phase === 'bidding' && state.currentTurnPlayerId === state.mySeat) mpPlayCard(idx);
      render();
    } else {
      humanPlay(state.selectedCardIdx);
    }
  });
  $('end-turn-btn').addEventListener('click', () => {
    if (state.mode === 'multi') {
      state.selectedCardIdx = null;
      mpEndTurn();
      render();
    } else {
      humanEndTurn();
    }
  });
  $('drop-btn').addEventListener('click', () => {
    if (state.mode === 'multi') {
      state.selectedCardIdx = null;
      mpDrop();
      render();
    } else {
      humanDrop();
    }
  });
  $('reset-btn').addEventListener('click', () => {
    if (state.cpuTimeoutId) clearTimeout(state.cpuTimeoutId);
    if (state.mode === 'multi') mpLeaveRoom();
    state.silent = false;
    state.mode = 'single';
    state.mySeat = 0;
    state.phase = 'setup';
    state.players = [];
    state.dummies = [];
    state.log = [];
    render();
  });
  $('play-again-btn').addEventListener('click', () => {
    if (state.mode === 'multi') mpLeaveRoom();
    state.mode = 'single';
    state.mySeat = 0;
    state.phase = 'setup';
    state.players = [];
    state.dummies = [];
    state.log = [];
    render();
  });

  // ===== Online play / Lobby =====
  const getDisplayName = () => (nameInput?.value || '').trim() || 'あなた';
  $('mp-create-btn').addEventListener('click', () => {
    mpCreateRoom(getDisplayName());
  });
  $('mp-join-btn').addEventListener('click', () => {
    const code = $('mp-code').value.trim();
    mpJoinRoom(code, getDisplayName());
  });
  $('mp-code').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
  $('mp-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('mp-join-btn').click();
  });
  $('lobby-start-btn').addEventListener('click', () => mpStartGame());
  $('lobby-leave-btn').addEventListener('click', () => mpLeaveRoom());
  $('lobby-copy-btn').addEventListener('click', async () => {
    if (!mp.roomCode) return;
    try { await navigator.clipboard.writeText(mp.roomCode); } catch {}
  });

  // Tabs
  setActiveTab('battle');
  document.querySelectorAll('#tab-nav button').forEach(b => {
    b.addEventListener('click', () => setActiveTab(b.dataset.tab));
  });

  // Simulation
  $('sim-run-btn').addEventListener('click', startSimulation);
  $('sim-close-btn').addEventListener('click', () => {
    $('sim-result').classList.add('hidden');
  });
  $('sim-rerun-btn').addEventListener('click', () => {
    $('sim-result').classList.add('hidden');
    startSimulation();
  });

  // Manual modal
  const openManual = () => {
    const modal = $('manual-modal');
    modal.classList.remove('hidden');
    // Reset scroll to the top each time it opens
    const box = modal.querySelector('.manual-box');
    if (box) box.scrollTop = 0;
  };
  const closeManual = () => $('manual-modal').classList.add('hidden');
  $('manual-btn-header').addEventListener('click', openManual);
  $('manual-btn-setup').addEventListener('click', openManual);
  $('manual-close-btn').addEventListener('click', closeManual);
  $('manual-close-btn-bottom').addEventListener('click', closeManual);
  // Click outside the box to close
  $('manual-modal').addEventListener('click', (e) => {
    if (e.target.id === 'manual-modal') closeManual();
  });
  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('manual-modal').classList.contains('hidden')) closeManual();
  });

  // Show tab nav (it's hidden by default to avoid FOUC; CSS handles desktop hide)
  $('tab-nav').classList.remove('hidden');

  // Play history (localStorage)
  if (typeof renderHistoryList === 'function') renderHistoryList();
  const histClearBtn = document.getElementById('history-clear-btn');
  if (histClearBtn) {
    histClearBtn.addEventListener('click', () => {
      if (!confirm('プレイ履歴を消去します。よろしいですか？')) return;
      clearPlayHistory();
      renderHistoryList();
    });
  }

  render();
});
