# Stage 1.9C — 多種共存・背景生態系・進化の具体表示・環境マップ改良

Stage 1.9B（PR #6）の上に積んだ変更。新しいオプションを使わない実行は Stage 1.7 とビット単位で一致（`test19c.js`）。旧セーブ（v1〜v3）はそのまま読み込める（`ecology: legacy`）。

- `engine19.js` 追加：餌の資源分割（`niche`）、系統ごとの初期個体数（`founderCounts`）、アリーナ外からの個体の到着（`introduce`）、系統別の集計（出生・死亡・寿命・摂取・捕獲）。
- `background.js` アリーナ外の背景生態系（粗い計算、単位は個体相当）。
- `game.js` v2生態系（5系統スロット、移入、局所絶滅・独占・共倒れ・再侵入の観察、進化の説明、認知指標、適応範囲の履歴）。セーブはv4。
- `habitat.js` / `app.js` 標準軸（温度の対数×圧力の対数、上=低圧）、領域別／共通の軸範囲、4領域の共通配置、履歴とスライダー、高速×150・×600と実測表示。
- `docs/`（Private専用）設計台帳、共存の診断と結果（`COEXISTENCE_STUDY.md`）。`diagnose.js`・`coexistence_study.js`・`diag_*.json`・`study_*.json`。
