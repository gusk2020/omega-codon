# Stage 6 notes (circular dish, phylogeny, codon, save summaries)

## Circular dish (`dish2.js`, `dishview.js`, `game.dish2()`)
- One circle: left half = land (surface, underground, air), right half = water. Radius = pressure on a log scale, centre = high pressure, rim = near vacuum; the exponent 0.8 keeps the high-pressure core small (the 1-atm ring is at ~61 % of the radius). The yellow dashed ring is 1 atm: land surface on the left, sea surface on the right. On each half, top = cold, bottom = hot.
- Display coordinates are separate from the science: a site stores (side, temperature, pressure); the unit-disc position is computed from them.
- Beads: a site (side x 12 temperature rows x 12 pressure rings) is recorded every 100 steps (and after each leap) from where living individuals really are. Filled = someone is there now, hollow = vacated. Lines link a new site to the nearest site the lineage already held on the same half (a record of range spread, not a genealogy). Colour = lineage; size = influence (the existing per-capita dominance, no head count) x the share of the lineage at that site.
- Real vs provisional: water, underground and air positions come from the engine's temperature/pressure bins (real). Land has no temperature bins, so land individuals are spread over their lineage's tolerated range (provisional, labelled). The civilisation cross is placed on the land ring (provisional); only its size (tech level) and the dashed radius come from the civilisation model. Past civilisations stay in `pastCivs` (history), not on the dish.
- Modes: 進化経路 (default) and 勢力圏 read the same data. Beads of the far future are drawn up to 25 % more spread out (display only; stated in the legend).
- Phone: pinch zoom (1-8x), drag pan, tap selects the nearest bead (the lineage id is stored in `game.sel`).
- Abilities: 8 pictogram tiles (2 rows of 4), needle or bar gauge, tap for detail. Values are the lineage's mean traits scaled to each trait's own range.

## Phylogeny (`phylotree.js`, `game.phylo()`)
- Circle / fan / rectangle layouts of the same recorded events; branches are drawn as in a phylogram (along the parent ring or row, then outwards). Dashed curves are recorded fusions, exchanges and heritage; lost clades are a count, never invented ancestors. Lineages can be collapsed (+N). Default shows the main 160 events; "記録すべて" shows up to 600 recorded.
- The engine's event list does not survive a milestone resume, so the save now carries the recorded nodes (`evoBase`), the extinction records and the next event id (`evNextId`); ids stay unique across saves.

## Codon screen
- Same boustrophedon strip as before, now with: shared lineage selection, a chip row (extinct lineages say their structure is not available), a banner saying this is the game's abstract model and not DNA, recorded counts per kind (mutation, loss, exchange, fusion, separation, compress, unpack) and the recent recorded events. Duplication (amplification) is not recorded by the engine and is stated as 未記録. Selecting an event rings the genes whose effect is on the same trait (an estimate, stated on screen).

## Links
`game.sel` (a lineage id string) is the one selection for the dish, the tree and the codon screen, is kept in milestone saves, and resolves to the same lineage index everywhere (tested, including after a restore and for extinct lineages).

## Save screens
Slot list, before saving, load confirmation and right after loading use one compact summary (`game.summary2()`): world year (to 10,000 years), living lineages, simulated individual count (actual number, and stated as re-created approximately after a load), current/best rank, codex and feats, a world mark (seed, steps). After a load a table compares saved vs restored (years, lineages, rank, records exact; individuals approximate). What is and is not reproduced is written next to it. Failures show a reason and keep the data.
