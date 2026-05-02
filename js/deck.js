'use strict';
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createPlayerDeck() {
  const deck = [];
  for (const [suit, values] of Object.entries(DECK_SPEC)) {
    for (const v of values) deck.push({ value: v, suit, effect: null });
  }
  for (const tpl of WILD_TEMPLATES) {
    deck.push({ value: tpl.value, suit: WILD, effect: tpl.effect });
  }
  return shuffle(deck);
}

function createGoalDeck() {
  const cards = [];
  for (const spec of GOAL_CARD_SPEC) {
    for (const s of spec.suits) cards.push({ value: spec.value, suit: s });
  }
  return shuffle(cards);
}

function formatCard(c) {
  let s = `${c.value}${SUIT_GLYPHS[c.suit]}`;
  if (c.suit === WILD && c.effect) s += `[${WILD_EFFECT_LABELS[c.effect]}]`;
  return s;
}
