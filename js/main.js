'use strict';
// ============== Event Handlers ==============
document.addEventListener('DOMContentLoaded', () => {
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

  // Show tab nav (it's hidden by default to avoid FOUC; CSS handles desktop hide)
  $('tab-nav').classList.remove('hidden');

  render();
});
