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
  document.querySelectorAll('[data-players]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.silent = false;
      startGame(parseInt(btn.dataset.players));
      setActiveTab('battle');
    });
  });
  $('play-btn').addEventListener('click', () => {
    if (state.selectedCardIdx === null) return;
    humanPlay(state.selectedCardIdx);
  });
  $('end-turn-btn').addEventListener('click', humanEndTurn);
  $('drop-btn').addEventListener('click', humanDrop);
  $('reset-btn').addEventListener('click', () => {
    if (state.cpuTimeoutId) clearTimeout(state.cpuTimeoutId);
    state.silent = false;
    state.phase = 'setup';
    state.players = [];
    state.dummies = [];
    state.log = [];
    render();
  });
  $('play-again-btn').addEventListener('click', () => {
    state.phase = 'setup';
    state.players = [];
    state.dummies = [];
    state.log = [];
    render();
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

  render();
});
