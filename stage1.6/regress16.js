'use strict';
// engine16 with every new option at its default must equal engine15 bit for bit.
// Usage: node regress16.js   (prints the number of identical and differing configurations)
const E15 = require('../engine15'), E16 = require('./engine16');
const OLD_REG = ['waves', 'waveInfections', 'reinfectionsSameAntigen', 'immuneMemoryPeakAtDeath', 'immuneMemoryRetentionAtDeath', 'waveInfectionsPerDeath'];
const strip = (r) => JSON.stringify({ h: r.history.map(({ storageCarriers, ...x }) => x), c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, s: r.switching, m: r.modeFractions, cells: r.cells,
  rg: Object.fromEntries(OLD_REG.map((k) => [k, r.regimes[k]])), g: r.finalGenomes.map((g) => g.genes), rep: r.reproduction, lin: r.lineages, ex: r.extinctAt });
const W = { interval: 8, waveLength: 3, strength: 0.5 }, PULSE = { period: 20, pulseLength: 4 };
const conds = [{}, { selection: false }, { regulation: false }, { memory: false }, { storageEvolvable: true, storageCost: 0.004, resourceRegime: PULSE },
  { pathogenRegime: { ...W, mode: 'same' } }, { pathogenRegime: { ...W, mode: 'novel' }, memoryCost: false }, { pathogenRegime: { ...W, mode: 'same' }, memoryBenefit: false },
  { breedingRegime: { openProb: 0.06, windowLength: 3 } }, { resourceRegime: PULSE }, { thermalRegime: { mode: 'periodic', mean: 0.45, amp: 0.4, period: 120 }, acclimateCost: 0.02 },
  { lineageCount: 3, storageEvolvable: true, mutationRate: 0.9 }];
let ok = 0, bad = 0;
for (const env of Object.keys(E15.ENVIRONMENTS)) for (const extra of conds) {
  const o = { seed: 3, steps: 300, environment: env, ...extra };
  if (strip(E15.simulate(o)) === strip(E16.simulate(o))) ok++; else { bad++; console.log('DIFF', env, JSON.stringify(extra).slice(0, 70)); }
}
console.log('identical', ok, 'diff', bad);
process.exitCode = bad ? 1 : 0;
