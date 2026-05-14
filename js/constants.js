'use strict';
const SUITS = ['A', 'B', 'C', 'D', 'E'];
const WILD = 'W';
const ALL_SUITS = [...SUITS, WILD];

const SUIT_LABELS = {
  A: 'ネジハナ', B: 'たんぽぽ', C: 'シロツメクサ', D: 'スミレ', E: 'オオイヌノフグリ', W: 'ワイルド'
};
const SUIT_GLYPHS = {
  A: '✿', B: '❀', C: '☘', D: '✾', E: '✤', W: '✣'
};

// Per-player deck breakdown (35 cards)
const DECK_SPEC = {
  A: [3, 4, 6, 7],
  B: [2, 3, 3, 5, 6],
  C: [2, 2, 3, 3, 4, 4],
  D: [1, 2, 2, 2, 3, 3, 4],
  E: [1, 1, 1, 2, 2, 3, 3, 3],
};
// Wild cards have special effects.
// effect:
//   'round' = card value becomes current round number when played
//   'draw'  = after playing, draw 1 from your deck
//   null    = no special effect
const WILD_TEMPLATES = [
  { value: 0, effect: 'round' },
  { value: 1, effect: 'draw' },
  { value: 1, effect: 'draw' },
  { value: 1, effect: 'draw' },
  { value: 6, effect: null },
];
const WILD_EFFECT_LABELS = {
  round: '=R',
  draw: '+引',
};
const WILD_EFFECT_DESC = {
  round: '現在のラウンドと同じ値になる',
  draw: '出した後にデッキから1枚引く',
};

// Goal cards (25 total — 5 per suit, all suits hold a 5)
// Pyramid distribution peaking at value 5.
// A: peaky (1, 11, 12), C: clean allrounder.
const GOAL_CARD_SPEC = [
  { value: 1,  suits: ['A'] },
  { value: 2,  suits: ['B', 'E'] },
  { value: 3,  suits: ['C', 'D', 'E'] },
  { value: 4,  suits: ['A', 'C', 'D', 'E'] },
  { value: 5,  suits: ['A', 'B', 'C', 'D', 'E'] },
  { value: 6,  suits: ['B', 'C', 'D'] },
  { value: 7,  suits: ['A', 'B', 'C'] },
  { value: 9,  suits: ['D', 'E'] },
  { value: 11, suits: ['B'] },
  { value: 12, suits: ['A'] }
];

const HAND_SIZE = 6;
const SCORE_BOARD_MAX = 35;
const WIN_THRESHOLD = 33;
const ROUND_LIMITS = { 2: 8, 3: 10, 4: 12, 5: 14 };
const DUMMY_COUNTS = { 2: 3, 3: 2, 4: 0, 5: 0 };
// Number of distinct suits required to win (alternative to 3 of same suit)
const DISTINCT_SUITS_REQUIRED = 4;

const PLAYER_COLORS = ['#b73e5e', '#3f6e9a', '#c89018', '#6b4d7a', '#4f7355'];

// ===== Personality system =====
const PERSONALITY_TYPES = ['balanced', 'pointHunter', 'collector', 'efficient', 'aggressive', 'opportunist'];
const PERSONALITY_LABELS = {
  balanced: 'バランス',
  pointHunter: '点数狙い',
  collector: '色集め',
  efficient: 'コスパ',
  aggressive: '攻撃的',
  opportunist: '反応型',
};
const PERSONALITY_DESC = {
  balanced: '広く普通に競る',
  pointHunter: '高得点札に集中。低得点は流す',
  collector: '特定スートを集める。他色は積極ダンプ',
  efficient: '安く済むときだけ参戦',
  aggressive: '高得点目的を選んで一発で取る',
  opportunist: '早く取れた色に乗っかって追加で取る',
};

// ===== Resource management style =====
// Orthogonal to personality. Controls how the CPU rations cards over the game.
const RESOURCE_MODES = ['burner', 'flex', 'hoarder'];
const RESOURCE_MODE_LABELS = {
  burner:  '使い切',
  flex:    '柔軟',
  hoarder: '保持',
};
const RESOURCE_MODE_DESC = {
  burner:  '札を惜しまずバトルに出す。終盤に空っぽになりがち',
  flex:    '残量を見て自然にやりくり',
  hoarder: '札を温存。本命にだけ投入する',
};

// ===== Bidding style (3rd axis) =====
// Controls how the CPU behaves in simultaneous-reveal and bidding phases.
const BIDDING_STYLE_TYPES = ['sticky', 'scout', 'burst', 'drifter'];
const BIDDING_STYLE_LABELS = {
  sticky:  '粘り',
  scout:   '偵察',
  burst:   '一点',
  drifter: '流し',
};
const BIDDING_STYLE_DESC = {
  sticky:  '安い札で粘り強く競りに参加する',
  scout:   '控えめに出して様子見。対戦者が多いと早期撤退',
  burst:   '序盤に全力投入。上限を超えたら即撤退',
  drifter: '基本は降り。対戦者が減ったときだけ参戦',
};
