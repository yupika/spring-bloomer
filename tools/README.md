# tools/ — ヘッドレスシミュレーション

ブラウザを起動せずに Spring Bloomer のゲームロジックを大量試行し、バランス検証に使うスクリプト群。

ゲーム本体（`js/*.js`）を `node:vm` 隔離コンテキストにロードし、`state.silent = true` で同期実行する。ロジック変更後に手早く回帰チェックしたいときに使う。

## 3つのランナー

### `sim-summary.mjs` — 全人数まとめて出す
人数別の即勝/点数勝ち率と平均バトル数を一覧。基礎チェック向き。

```sh
node tools/sim-summary.mjs           # デフォルト 1500 ゲーム/人数
node tools/sim-summary.mjs 3000      # 3000 ゲーム/人数
```

### `sim-goalcards.mjs` — 得点札別の勝利貢献度
指定人数で N 回試行し、各得点札（値×スート）について「点数勝ちゲームに出現した時、勝者が獲得した割合」を出す。「12✿が常に勝ちに絡んでないか？」をチェック。

```sh
node tools/sim-goalcards.mjs         # 4人 × 2000ゲーム
node tools/sim-goalcards.mjs 5 3000  # 5人 × 3000ゲーム
```

「vs 公平」が 1.20×超（赤）なら勝者偏重の疑い。

### `sim-compare.mjs` — 複数のスペックを並べて比較
`GOAL_CARD_SPEC` を差し替えて 2 つ以上の設定を同条件で走らせる。傾斜や値域変更の影響を「現状」と比べたい時に。

```sh
node tools/sim-compare.mjs           # 4人 × 3000ゲーム
node tools/sim-compare.mjs 4 5000
```

比較対象は冒頭の `VARIANTS` マップを直接編集して足す。

## 仕組み

`vm.createContext` でブラウザ DOM/タイマー API を no-op スタブ化したサンドボックスを作り、`js/constants.js` 〜 `js/simulator.js` を順にロード。`runSimulation(np, ng)` を呼ぶ。`startGame` は `state.silent = true` で同期的に最後まで走る。

`GOAL_CARD_SPEC` は `const` 宣言だが配列なので、`.length = 0` → `push(...)` で中身を差し替えれば次の `createGoalDeck()` 呼び出しから反映される（`sim-compare.mjs` がこれを利用）。
