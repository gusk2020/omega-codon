# オメガ・コドン Stage 1.5

Stage 1.4（遺伝子ブロック＋GRN＋生態条件）に、次を加えた版。

- 祖先系統ID（競争を系統の個体数で直接測る）
- 進化可能なエネルギー貯蔵容量（維持コスト付き）
- 記憶の利益とコストの分離
- 個体数・個体寿命・系統存続期間の別々の記録

新しい条件をすべてオフにすると、Stage 1.4とビット単位で一致する。結果と未達は `REPORT.md`、事前登録は `PREREGISTRATION.md`。抽象モデルであり、実在生物の予測ではない。

## 再現
```
node test15.js                                                                     # 46件
node experiments15.js --seeds 30 --seed0 1   --out results15.json                  # 約6分（4コア）
node experiments15.js --seeds 30 --seed0 101 --out results15_replication.json      # 独立シード
node decide15.js results15.json results15_replication.json                         # 事前登録の判定規則
node reanalyze14.js                                                                # Stage 1.4の絶滅を含む再解析
node perf15.js
```
過去版の回帰：`stage1.4` は `ln -s ../stage1.3 stage1.4/stage1.3` の上で `node test14.js`、`stage1.3` `stage1.2` `stage1.1` はそれぞれ `node test13.js` `node test12.js` `node test.js`。ハッシュは各フォルダの `SHA256SUMS`。

## 変更ファイル（Stage 1.4から）
- 新規：`engine15.js` `stats15.js` `experiments15.js` `test15.js` `decide15.js` `reanalyze14.js` `diag15.js` `perf15.js`
- 文書：`PREREGISTRATION.md` `PREREG_SHA256SUMS` `RESULTS_SHA256SUMS` `REPORT.md` `README.md`
- 結果：`results15.json` `results15_replication.json` `decisions15.json` `reanalysis14.json` `diag15.json` `perf15.json`
- 無変更（同梱）：`stage1.1/` 〜 `stage1.4/` `stage1-original/`
