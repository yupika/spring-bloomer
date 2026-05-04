// Game constants. Mirror of js/constants.js but as ESM exports.
// Keep in sync with the browser-side definitions.

export const SUITS = ['A', 'B', 'C', 'D', 'E'];
export const WILD = 'W';
export const ALL_SUITS = [...SUITS, WILD];

export const SUIT_LABELS = {
  A: 'ネジハナ', B: 'たんぽぽ', C: 'シロツメクサ', D: 'スミレ', E: 'オオイヌノフグリ', W: 'ワイルド'
};
export const SUIT_GLYPHS = {
  A: '✿', B: '❀', C: '✤', D: '✾', E: '☘', W: '✣'
};

// Per-player deck breakdown (35 cards)
export const DECK_SPEC = {
  A: [3, 4, 5, 6],
  B: [2, 3, 3, 4, 5],
  C: [1, 2, 3, 3, 4, 4],
  D: [1, 1, 2, 2, 3, 3, 4],
  E: [1, 1, 1, 2, 2, 3, 3, 3],
};

export const WILD_TEMPLATES = [
  { value: 0, effect: 'round' },
  { value: 0, effect: 'stack' },
  { value: 1, effect: 'draw' },
  { value: 1, effect: 'draw' },
  { value: 6, effect: null },
];

export const WILD_EFFECT_LABELS = {
  round: '=R',
  stack: '↑載',
  draw: '+引',
};

// Goal cards (20 total — 4 per suit, all suits hold a 5)
export const GOAL_CARD_SPEC = [
  { value: 1,  suits: ['A'] },
  { value: 2,  suits: ['B', 'E'] },
  { value: 3,  suits: ['C', 'D', 'E'] },
  { value: 4,  suits: ['D'] },
  { value: 5,  suits: ['A', 'B', 'C', 'D', 'E'] },
  { value: 6,  suits: ['C'] },
  { value: 7,  suits: ['B', 'C'] },
  { value: 9,  suits: ['D', 'E'] },
  { value: 11, suits: ['A', 'B'] },
  { value: 12, suits: ['A'] }
];

export const HAND_SIZE = 6;
export const SCORE_BOARD_MAX = 35;
export const WIN_THRESHOLD = 30;
export const DISTINCT_SUITS_REQUIRED = 4;

// Hardcoded for 2-5p (matches client). For >5p we extrapolate +2 battles per
// extra seat and 0 dummies.
const ROUND_LIMITS_TABLE = { 2: 8, 3: 10, 4: 12, 5: 14 };
const DUMMY_COUNTS_TABLE = { 2: 3, 3: 2, 4: 0, 5: 0 };

export function maxRoundsFor(n) {
  if (ROUND_LIMITS_TABLE[n] != null) return ROUND_LIMITS_TABLE[n];
  return 14 + (n - 5) * 2;
}

export function dummyCountFor(n) {
  if (DUMMY_COUNTS_TABLE[n] != null) return DUMMY_COUNTS_TABLE[n];
  return 0;
}
