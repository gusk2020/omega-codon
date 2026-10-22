# Stage 1.6

Stage 1.5の独立監査（基礎実装は条件付きPASS）が指摘した課題への対応。事前登録した一次仮説P1〜P6と、事後分析を分けて記録している。

- 貯蔵：変異供給・効果量・選択強度・観測期間を分け、保有遺伝子割合と実際の容量の両方を測る。競争の勝敗と損益分岐も測る。
- 記憶：感染期間・再感染間隔・記憶持続時間を独立に動かし、再感染回数と、記憶が感染を防いだ回数を測る。記憶の維持コストは変えない。
- 因果：獲物の避難・繁殖の固定という介入で、短期繁殖と絶滅の経路を調べる。
- 個体寿命・系統存続期間・個体数は別々に記録する。

新しい条件をすべてオフにすると、Stage 1.5（`../engine15.js`）とビット単位で一致する。
結果と未達は `REPORT.md`、事前登録は `PREREGISTRATION.md`、判定は `decisions16.json`。

再現手順は `REPORT.md` の最後を参照。主なコマンド：
```
node test16.js && node regress16.js
node experiments16.js --seeds 30 --seed0 1   --out results16.json
node experiments16.js --seeds 30 --seed0 101 --out results16_replication.json
node decide16.js results16.json results16_replication.json
```
