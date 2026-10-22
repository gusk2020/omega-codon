# オメガ・コドン Stage 1.4

Stage 1.3（遺伝子ブロックとGRN）に、切り替え可能な生態条件を4つ加えた版。新しい条件をすべてオフにすると、Stage 1.3とビット単位で一致する。

- A：病原体の再流行と抗原特異的記憶
- B：まれな繁殖機会
- C：資源のパルス供給
- D：予測可能な周期変動とノイズ

結果と未達は `REPORT.md`、事前登録は `PREREGISTRATION.md` を参照。抽象モデルであり、実在生物の予測ではない。

## 再現
```
node test14.js                                   # 34件
(cd stage1.3 && node test13.js); (cd stage1.2 && node test12.js); (cd stage1.1 && node test.js)
node experiments14.js --seeds 30 --seed0 1       # 約7分（4コア）→ results14.json
node experiments14.js --only C --seeds 30 --seed0 31 --out results14_replication_C.json
node median-audit13.js stage1.3/results13.json   # Stage 1.3 中央値の再集計
node perf14.js
```

## 変更ファイル一覧（Stage 1.3 から）
| 種別 | ファイル |
|---|---|
| 新規 | `engine14.js`、`stats14.js`、`experiments14.js`、`test14.js`、`perf14.js`、`median-audit13.js` |
| 新規（文書） | `PREREGISTRATION.md`、`PREREG_SHA256SUMS`、`REPORT.md`、`README.md` |
| 新規（結果） | `results14.json`、`results14_replication_C.json`、`results14_C_controls.json`、`median-audit13.json`、`perf14.json` |
| 無変更（同梱） | `stage1.3/`、`stage1.2/`、`stage1.1/`、`stage1-original/`（それぞれSHA256付き） |
