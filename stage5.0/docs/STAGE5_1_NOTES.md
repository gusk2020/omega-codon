# Stage 5.0 / 5.1 notes

## Why 5.1
Stage 5.0 failed every item on a Pixel 7a: the world clock froze for seconds after stop/resume/speed changes, rank stayed at gamma, and loading a save replayed the whole run (very slow).

## What changed
1. **Lighter long play** (games created from 5.1 on carry `cfg.light`; old log saves keep the old numbers so they replay exactly):
   leap window 400 -> 120 steps, approximate evolution 240 -> 80 steps at mutation x3 (was x2), UI simulation chunks 25 -> 5 steps, leap caps in `world.js` / `civilization.js` grow with the age of a civilisation / its residue (the original 1A stall).
2. **Milestone saves**: a save is a state taken only on a "continue?" screen (`game.milestone()`), no periodic auto-save. Kept: world clock/climate/crises/civilisation, lineage records, rank, codex, feats, achievements, the living arena as up to 6 genome groups per lineage. Not kept: per-individual position/age/energy, random streams, history between milestones. Load never replays (`kind: 'milestone'`, v10). Old log saves still load, slowly, with a warning.
3. **Rank**: promotion also needs evolved trait change from the lineage's own starting traits (`drift`) and observation steps (`O`); continuity tiers 150/200/260/400/4000 (top tier and the Omega criteria unchanged).

## Measured (desktop node, same run, old = Stage 4.1/5.0 timing, new = 5.1)
- World time per second of real time: 46 -> 79 Myr/s (45 s, seed 3).
- Big clock jumps (>= 100k yr) in 45 s: 112 -> 248.
- Longest single advance(5) call: 28 -> 34 ms (a phone will be a few times slower; the UI budget is 8-11 ms per frame with 5-step chunks).
- Save/restore: 40000-step run restored in ~0.2-0.3 s (was ~20 s replay); save size ~115 KB.
- Rank, 7 seeds x 200-240 s each (~200k+ steps, ~4 Gyr): gamma at ~6k steps (was 500), delta at ~15-17k, epsilon at 37k-101k. 5 of 7 seeds reach epsilon, 2 stay at gamma (their longest individual life stays under 200 steps). Nobody reaches zeta+: it needs a longest individual life of 260+ steps, which selection does not produce in these runs.

## Known limits
- Individual lifespan (continuity) is the wall above epsilon; raising it would need a change to how lifespan is selected, which is outside this stage.
- Saves are possible only on continue screens; progress after the last one is lost on load (stated on screen).
- Phone speed is not measured: all numbers above are from a desktop. Pixel 7a still has to confirm them.
- 1C (full-history replay) is gone for new saves; old-format saves still replay slowly.
