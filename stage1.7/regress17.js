'use strict';
// engine17 with every new option at its default must equal engine16 bit for bit (including Stage 1.6's own options).
// Usage: node regress17.js
const E16 = require('../stage1.6/engine16'), E17 = require('./engine17');
const OLD_ECO = ['preyFractionMean', 'preyFractionMin', 'preyFractionEarly', 'earlyPopulationMax'];
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, s: r.switching, m: r.modeFractions, cells: r.cells, rg: r.regimes,
  eco: Object.fromEntries(OLD_ECO.map((k) => [k, r.ecology[k]])), pred: r.predation, g: r.finalGenomes.map((g) => g.genes), rep: r.reproduction, lin: r.lineages, ex: r.extinctAt });
const W = { interval: 8, waveLength: 3, strength: 0.5 }, PULSE = { period: 20, pulseLength: 4 };
const conds = [{}, { selection: false }, { memory: false }, { resourceRegime: PULSE }, { resourceRegime: PULSE, selection: false },
  { resourceRegime: PULSE, preyRefuge: 0.3 }, { resourceRegime: PULSE, fecundityLocked: true }, { resourceRegime: PULSE, preyScale: 0.5 }, { resourceRegime: PULSE, preyScale: 1e-4 },
  { storageEvolvable: true, storageCost: 0.004, storageSupply: 16, storageEffectScale: 4, resourceRegime: PULSE }, { pathogenRegime: W, infection: { duration: 3, load: 0.2 }, infectionSeverity: 4 },
  { pathogenRegime: { ...W, mode: 'novel' }, memoryCost: false }, { breedingRegime: { openProb: 0.06, windowLength: 3 } }, { lineageCount: 3, storageEvolvable: true, mutationRate: 0.9 }];
let ok = 0, bad = 0;
for (const env of Object.keys(E16.ENVIRONMENTS)) for (const extra of conds) {
  const o = { seed: 3, steps: 250, environment: env, ...extra };
  if (strip(E16.simulate(o)) === strip(E17.simulate(o))) ok++; else { bad++; console.log('DIFF', env, JSON.stringify(extra).slice(0, 70)); }
}
console.log('identical', ok, 'diff', bad);
process.exitCode = bad ? 1 : 0;
