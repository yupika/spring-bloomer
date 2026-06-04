# Spring Bloomer — AI設計 v2（資源計画・カウンティング・スキルレベル）

最終更新: 2026-06-04（実装完了・検証済み）

## 背景

計測(4人戦×8000)で判明した旧AIの天井:
- 性格(burner/flex/hoarder)は反映されているが、差は「降りる頻度」の数%のみ。全モードが残り1〜3枚まで使い切るのが常態。
- **終盤に残り札が最多だった席が勝率61%**（fair 25%）。残り札の多さ＝勝敗の最大予測因子。
- 「序中盤は降り終盤だけ戦う」だけの**温存bot**で勝率65%、相手の枯渇を見て押す**カウンティングbot**で74%。
- 原因: AIは各バトルを盤面だけで判断し、**資源計画も相手のカウンティングも持たない**。

→ 詳細メモ: `.claude/.../memory/ai-counting-weakness.md`

## 設計方針（確定）

1. **目標強度**: 上級者と互角を上限に。ただし**最強固定にしない**。CPUごとにスキルレベルをランダム混在させ、現状の直感型も1レベルとして残す。
2. **カウンティング**: 枚数 ＋ 札構成の推定（残りスート/値分布）まで。
3. **スコープ**: 資源計画 ＋ 枚数カウント ＋ 札構成推定 ＋ 性格レンジ拡大 ＋ レベル制、一括。

## アーキテクチャ：スキルレベル × 性格 を直交させる

- **スキルレベル = どの認知層が動くか**（思考の深さ）
- **性格 = その層の中でのスタイル**（既存 personality / resourceMode / biddingStyle）

両者は独立。L3のhoarder、L1のburner、等が自然に組める。

### スキルレベル定義（認知層の積み増し）

| Lv | 名称 | 有効な認知層 | 挙動 |
|----|------|------------|------|
| L1 | 直感 | その場勘のみ（旧AI） | 資源計画・計数なし。legacy `resourcePressure` で減衰 |
| L2 | 計画 | ＋資源計画(spendCap) | 全バトル参戦するが、1バトルへの投入枚数に予算上限。泥沼の競り合いを拒否 |
| L3 | 計数 | ＋枚数カウント | 札勝ち時は粘り勝ち、相手枯渇時は押す、**極端に出し負けたらミラー温存** |
| L4 | 読み | ＋札構成推定 | 残り構成から sim 札を適正サイズ化、総合火力勝ち時に押し増し |

### レベル割当（ゲーム開始時、CPUごと重み付きランダム）

```
SKILL_WEIGHTS = { L1: 0.30, L2: 0.30, L3: 0.25, L4: 0.15 }  // 難易度調整はここ
```
- `engine.js:startGame` の各CPU生成時に `skill: rollSkill()` を付与（human は null）。

## ① 資源計画 — spendCap モデル（L2+）

**【設計ピボット】** 当初案の「参戦バトルを選別する閾値τ」は実装・計測の結果**棄却**。
バトルをスキップすると目的札（＝勝利条件そのもの）を失い、勝率21%まで沈んだ。
さらに「広く浅く」（全戦に2-3枚ずつ）も「選んで全力」（二値参戦）も逆効果と実証。

**正解は「全バトル満額で戦う。ただし病的な競り合いだけ拒否する」**:

```
affordability:
  battlesLeft, myLeft, fightDensity = (myLeft - battlesLeft) / CONTEST_COST / battlesLeft

spendCap(player, desire):                  // このバトルに投入する上限枚数
  cap  = CONTEST_COST (=4)                 // 満額ベースライン
  cap += {burner:+1, flex:0, hoarder:-1}   // RESOURCE_SPEND_SHIFT（性格レンジ④）
  cap += desire≥0.80 ? +2 : desire≥0.55 ? +1 : desire<0.35 ? -1 : 0
  cap -= fightDensity<0.50 ? 1 : 0         // 本当に枯渇している時だけ絞る
  cap -= fightDensity<0.25 ? 1 : 0
  cap += battlesLeft≤3 ? +2 : 0            // 終盤解放（残り札に終端価値はない）
  cap += myLeft > battlesLeft*4 ? +2 : 0   // 余剰解放
```

cap 到達後は「sim値≤1で escape が成立する札」だけ許可、なければ降り
（`cpuDecideAction` の lowest 分岐冒頭）。

## ② 枚数カウント（L3+）

公開情報のみ＝フェア（`hand+deck = 35 − その席が場に出した札数`、全て可視）。
spendCap 内で:

```
oppAvg/oppMin/oppMax = 相手残枚数の統計
myLeft > oppAvg+3            → cap += 2   // 札勝ち→粘り勝ち（突撃を先に枯らす）
oppMin ≤ 3                   → cap += 1   // 枯れた相手から安く拾う
oppMax > myLeft+4 (中盤まで,  → cap = 1   // ★ミラー防御: 極端な溜め込みを検知したら
  desire<0.80)                            //   1枚プローブのみ。戦争に付き合わない
```

**ミラー防御が温存exploit対策の本丸**。温存botの正体は「溜めて終盤に連勝し
即勝ちコンボ（同スート3 or 異4種）を完成させる」（bot勝利の95%が即勝ち）。
中盤までに自分も備蓄を保てば、終盤が枯れ場にならず scoop が成立しない。
ブロック級 desire(≥0.80) はミラーより優先（リーチ阻止は常時）。

## ③ 札構成推定（L4）

全員同一の35枚構成は公知 → **残り構成 = 全構成 − 既出**が厳密に出る
（`state.seenBySeat[seat]` を `playCard`/`processSimultaneousReveal` で更新。
検証: 11万チェックで実残数と完全一致）。

- `rivalRemaining(oppId)`: 相手の残りマルチセット（手札/山の区別は不明のまま＝フェア）
- **sim札の適正サイズ化**: `rivalMaxReveal` 以上で最安の goal-suit 札を出す。
  相手がA4までしか出せないのにA7を切らない。
- **火力比較**: 自分の残り総量(effectiveSimValue合計)が最強の相手×1.25を超えるなら cap+1。
  ※「出し負け時に絞る」分岐は実装→計測で**削除**（L4だけ勝率22.6%に沈んだ。
  極端ケースはL3ミラーが既にカバー、通常戦で勝てるバトルを降りるだけだった）

## ④ 性格レンジ拡大

- `RESOURCE_SPEND_SHIFT = { burner:+1, flex:0, hoarder:-1 }`（spendCap 直結）
- L1 は legacy `resourcePressure`（worryThreshold/pressureFloor）を継続使用
- 結果スプレッド: 終了時残枚数 burner 2.5 / flex 3.4 / hoarder 4.5（旧: 1.2/2.2/2.4）、
  勝率 24.0/24.8/26.2%（旧: 17.8/26.9/30.2% — burner が単なるハンデでなくなった）

## 統合ポイント（変更ファイル）

- `js/constants.js`: `SKILL_LEVELS/LABELS/WEIGHTS`, `CONTEST_COST`
- `js/personality.js`: `rollSkill()`, `SK()/hasLayer()`, legacy `resourcePressure()` 維持
- `js/ai.js`: `affordability()/spendCap()/rivalRemaining()/rivalMaxReveal()`、
  `calculateDesire` の resourcePressure を L1 限定化、
  `cpuDecideAction` lowest 分岐に cap ゲート、`cpuChooseSimultaneous` に L4 sim適正化
- `js/engine.js`: `skill` 付与、`state.seenBySeat` 配線

## 検証結果（4p、matrix×6000 / melee×8000）

### Exploit耐性（seat0=搾取bot vs 場、fair=25%）

| bot \ 場 | L1(旧) | L2 | L3 | L4 | MIXED |
|------|------|------|------|------|------|
| 温存bot | 64.5 | 20.9 | 23.3 | 24.1 | 34.2 |
| 突撃bot | 2.2 | 16.0 | 8.6 | 7.3 | 7.3 |
| 普通 | 26.0 | 26.6 | 25.7 | 26.1 | 24.5 |

- L2+ 場では両exploitとも fair 以下に封殺。普通に打つのが最善＝健全。
- MIXED の温存34.2%は**L1席(64.5%)の混入分そのもの**（重み加重平均と一致）。
  L1を残す仕様のコスト。難易度を上げたければ `SKILL_WEIGHTS` の L1 を下げる。

### メレー（混在4人戦）

| skill | 勝率 | 残枚数 | 目的札/局 |
|----|------|------|------|
| L1 | 25.3 | 2.0 | 2.87 |
| L2 | 25.1 | 4.5 | 2.37 |
| L3 | 24.3 | 4.2 | 2.42 |
| L4 | 25.4 | 4.2 | 2.47 |

- レベル間は均衡（「上位レベルがAI同士でも常勝」ではなく、**人間の搾取戦略への耐性**が上位レベルの価値）。
- ゲーム健全性: avgRounds 10.5/12、即勝ち92.8%・点数勝ち7.2%・膠着0%（旧AI: 10.9 / 89.9% / 10.1% / 0% — ほぼ不変）。

### 教訓（チューニングで実証された原則）

1. **目的札を諦めるAIは勝てない**。バトルスキップ型の「計画」は必ず沈む。
2. **中途半端な投資（2-3枚出して降りる）が最悪**。札は減るのに目的札ゼロ。
3. **AI同士の勝率は搾取耐性の指標にならない**。検証は必ず搾取bot vs 場で。
4. cap低い→メレーで沈む / cap高い→温存に搾取される。**解は適応**（L3ミラー）。
