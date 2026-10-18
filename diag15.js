'use strict';
// POST-HOC diagnostic (not pre-registered): is the storage trait ever reachable by mutation within 2000 steps?
// Reports the fraction of final genomes holding at least one gene whose effect targets the storage trait.
const E = require('./engine15'); const S = require('./stats15');
const STORAGE = E.LOCI.length, out = {};
const ST = { storageEvolvable: true }, PULSE = { resourceRegime: { period: 20, pulseLength: 4 } };
for (const [name, o] of Object.entries({ pulsed_cost0: { ...ST, storageCost: 0, ...PULSE }, stable_cost0: { ...ST, storageCost: 0 }, pulsed_cost004: { ...ST, storageCost: 0.004, ...PULSE } })) {
  const frac = [], stor = [], gdrift = [];
  for (let s = 1; s <= 12; s++) {
    const r = E.simulate({ seed: s, steps: 2000, environment: 'rich', ...o });
    if (!r.finalGenomes.length) continue;
    const hold = (gs) => gs.filter((g) => g.genes.some((x) => x.k === 0 && x.eff.some((e) => e[0] === STORAGE))).length / gs.length;
    frac.push(hold(r.finalGenomes)); stor.push(r.history.at(-1).meanStorage);
  }
  out[name] = { runs: frac.length, meanFractionCarryingStorageGene: S.mean(frac), maxFraction: Math.max(...frac), meanStorage: S.mean(stor), maxMeanStorage: Math.max(...stor) };
}
// how often does a founder-descended lineage ever acquire the target? (mutation supply, no selection)
let hits = 0, N = 40000; const r = E.rng(5); let g = E.founderGenome();
for (let i = 0; i < N; i++) { g = E.mutate(g, r, 30, E.TRAITS.length); }
out.mutationSupply = { mutationsApplied: N, finalGenomeCarriesStorageGene: g.genes.some((x) => x.k === 0 && x.eff.some((e) => e[0] === STORAGE)) };
console.log(JSON.stringify(out, null, 1));
require('node:fs').writeFileSync('diag15.json', JSON.stringify(out, null, 1));
