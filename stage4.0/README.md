# Stage 2.0 — 地球編・中間版

Stage 1.9D の上に積んだ変更（旧い時間方式・旧セーブは `time` を指定しないかぎりそのまま動く）。

実行ファイルは `index.html` `app.js` `game.js` `engine19.js` `style.css` `timemodel.js` `habitat.js` `earthhistory.js` `adaptation.js` `background.js` `rank.js` `civilization.js` `world.js`。`docs/` と `test20*.js` はPrivate専用で、公開しない。

- `engine19.js` 追加（すべて任意オプション。既定ではStage 1.7とビット一致）：異常細胞（`abnormal`）、文明からの圧力と戦略の受け口（`civ`）、時間の跳躍（`live.leap`）、長い実行のための死亡記録の上限。
- `civilization.js` 知性文明の粗い世界モデル（人口・技術・安定、環境改変、崩壊・滅亡・再出現、残る影響、生物との関係）。
- `world.js` 世界の時計（年）、太陽光度と気候、天体衝突・大噴火、跳躍の長さの決め方。
- `game.js` 可変時間（1ステップ＝30日、跳躍）、文明との関係、4つの方針、操作系統の切り替え、U単位、セーブv6。
- `rank.js` 「文明の敵意を支援なしで生き延びた回数」の軸を追加（計算した場合だけ採点）。
- `app.js` / `style.css` / `index.html` グラフ・ピクトグラム中心の画面。詳細は各タブの下に収納。

テスト：`node test20.js`（Stage 1.9Dの28件を本コードで）と `node test20b.js`（新規20件）。

## Stage 3.0
30億年代までの長期歴史、大災厄と予告、温度×圧力の生息域、地球外の最小状態、ランク進捗表示、7種の初期生物。詳細は docs/STAGE3_0_DESIGN.md。

## Stage 3.1
通常画面の情報量を削減。環境介入を廃止し、文明・植物など・動物への方針に変更。環境支配力、突然変異・融合・分離・機能交換、四象限の経路の自由化。詳細は docs/STAGE3_1_DESIGN.md。
