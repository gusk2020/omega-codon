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

# Stage 5.2

## World clock shown to the 10,000-year digit
`WORLD.jaYears` / `formatBP`: 5億1234万年前, いまから5億1234万年後, 9999万年, 123年前, 現代. Before, the past was rounded to 0.01 億 (1,000,000 yr) and looked frozen while the clock moved by less. The HUD sub-line uses the same function (`worldInfo().elapsedText`) and shows `⏩ +N万年` for 5 s after any jump of 1,000,000 yr or more. Display only: the simulation never reads it (tested).

## "The clock jumps after loading a save" - cause found, not a restore fault
Seeds 3, 5 and 6, saved at a real continue-screen and loaded: the world clock is identical right after loading, and after 30, 100 and 400 chunks of 250 steps the loaded game and the unsaved original have advanced by the same amount to within 0.01 Myr (seed 3: +126.46 / +203.03 / +407.4 Myr; seed 5: +1.48 / +303.03 / +959.07; seed 6: +26.47 / +278.03 / +433.9). Not bit-for-bit: individuals are re-created and random streams restart, by design. The jump is the model's own variable step: near the present a civilisation lives for a long stretch and the clock barely moves (leaps <= a few thousand years), then it ends and the next leaps are 25-50 Myr each. Saved or not, the player sees the same.

## Measured load (desktop, 60 s run, CPU profile)
- Individual stepping (`engine19.js` stepOnce, expressGenes, develop, rawTraitDrive, ...) 76 %; garbage collection 11 %; depth-habitat box 7 %; game layer (means, rank, codex, events) 5 %; world/civilisation 0.2 %.
- Cost is linear in population: 0.23 ms/step under 100 individuals, 0.36 at 100-199, 0.48 at 200-299, 0.67 at 300-399, 0.84 at 400-499, 1.05 at 500+. Populations above 400 occur about 1.5 % of the time.
- Tried and dropped: caching each individual's habitat box (bit-identical results but no measurable gain, within noise or slightly slower). Not done: a population cap (changes evolution outcomes) and anything in the individual engine (out of scope).
- Conclusion: the remaining cost is the per-individual engine; history, rank, UI and approximation are too small to be worth touching.
