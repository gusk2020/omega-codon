# Stage 6.1 notes: tidy-up with no change in behaviour

Goal: a simpler, lighter, easier-to-maintain code base while the game stays exactly as the Stage 6 build plays. No new features, no balance or model changes, no screen removed (the older tabs are untouched).

## How it was kept safe
- `test61.js` + `baseline-s6.json`: fingerprints of everything the screens read (state, ranks, records, dish sites, phylogeny, summary, abilities, codon, time ledger) for 3 seeds, both a plain run and a run resumed from a milestone save. Recorded BEFORE the first change; every step was required to leave them unchanged. (If the simulation is ever changed on purpose: `node test61.js --update`.) CI runs it.
- A browser snapshot (Chromium, 412x892) loaded the same milestone save, then compared slot list, load confirm and result, HUD, the dish panel text and canvas pixels (path and territory mode), tap selection, the three phylogeny canvases, the codon canvas, and the text of every tab. 0 differences after every step. Width 360: no horizontal overflow on any tab.
- All existing tests (test20, 20b, 30, 31, 40, 41, 50, 60) pass.

## What changed
- app.js 1300 -> 1112 lines: removed the unreachable old dish painter and other unreferenced functions and variables (the old `game.dish()` API and `dish.js` stay: tests still use them); the three Stage 6 screens moved to `views6.js` (dish + panel, phylogeny, codon); one shared pan/zoom/tap binder replaced two copies; one `cardButton` helper replaced three copies; `setText` / `setHtml` stop unchanged DOM writes.
- game.js 1026 -> 989 lines: the Stage 6 observation code (dish sites, abilities, save summary) moved to `observe6.js`.
- One seeded RNG (`mulberry.js`) instead of four identical copies (background, civilization, catastrophe, offworld); one colour helper (`colors.js`) for the dish and the phylogeny; shared test helpers (`testlib.js`).
- The dish panel is rebuilt at once only when the player's choice changes, otherwise at most twice a second and never while a finger is on it. At x600 it used to be rebuilt about 8 times a second (a button replaced between touch-down and touch-up loses the tap): 51 -> 10 DOM rewrites in 6 s; `detailnav` 51 -> 0.
- The phylogeny tab no longer rebuilds its event list when nothing changed.

## Measured (desktop, same machine; not a Pixel 7a)
- Runtime code: 23 -> 27 files, 5130 -> 5117 lines, 603,883 -> 599,699 bytes (gzip 212,242 -> 213,661: the new file headers cost about as much as the removed code). The goal was structure, not size.
- Simulation speed, 40 s, seeds 3 / 5: steps/s 1708 / 1586 -> 1742 / 1564; world Myr/s 85.7 / 84.9 -> 85.9 / 84.0; p99 call 11.0 / 11.1 -> 10.5 / 11.0 ms; longest call 48.9 / 36.7 -> 33.7 / 72.4 ms (single outliers, GC; no trend). Heap after 30,000 steps: 14 MB both. No speed change is claimed: the simulation was not touched.

## Left alone on purpose (candidates for later, none needed now)
- engine19.js (1046 lines) and the rest of game.js (simulation control, records, codex/feat detection): large but tied together by shared state; splitting them is risky without a reason and the engine is out of scope.
- app.js still carries the Stage 1.x-3.x screens for old saves; they are kept.
- Unused CSS rules were not hunted without a way to prove they are unused.

## For the concept review (not acted on)
The user felt that Stage 6 still lacks a sense of fun ("楽しさの表現が不足している"). Recorded as a fact only; no cause was assumed and nothing was changed for it.
