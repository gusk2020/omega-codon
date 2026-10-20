'use strict';
// Stage 1.4 ecological experiments A-D.
// Usage: node experiments14.js [--seeds 30] [--seed0 1] [--steps 2000] [--only A,B,C,D] [--out results14.json]
// The four primary hypotheses, their endpoints and the decision rule are fixed
// in PREREGISTRATION.md and in PRIMARY below, before any result was seen.
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const os = require('node:os');
const fs = require('node:fs');
const E = require('./engine14');
const S = require('./stats14');

const BASE = { environment: 'rich' };
const WAVES = { interval: 30, waveLength: 10, strength: 0.3 };
const RARE = { openProb: 0.06, windowLength: 3 };              // about 15% of steps open
const PULSE = { period: 20, pulseLength: 4 };                  // same mean food, 1 step in 5
const PERIODIC = { mode: 'periodic', mean: 0.45, amp: 0.4, period: 120 };
const NOISE = { ...PERIODIC, mode: 'noise' };                  // same marginal distribution, no autocorrelation

// cell name -> simulate options
const CELLS = {
  // A: recurrent same-antigen epidemics vs a new antigen every wave
  A_same_full: { pathogenRegime: { ...WAVES, mode: 'same' } },
  A_same_drift: { pathogenRegime: { ...WAVES, mode: 'same' }, selection: false },
  A_same_noMemory: { pathogenRegime: { ...WAVES, mode: 'same' }, memory: false },
  A_same_cost0: { pathogenRegime: { ...WAVES, mode: 'same' }, memoryCost: false },
  A_novel_full: { pathogenRegime: { ...WAVES, mode: 'novel' } },
  A_novel_drift: { pathogenRegime: { ...WAVES, mode: 'novel' }, selection: false },
  A_novel_noMemory: { pathogenRegime: { ...WAVES, mode: 'novel' }, memory: false },
  A_novel_cost0: { pathogenRegime: { ...WAVES, mode: 'novel' }, memoryCost: false },
  A_near_full: { pathogenRegime: { ...WAVES, mode: 'near' } },
  A_near_noMemory: { pathogenRegime: { ...WAVES, mode: 'near' }, memory: false },
  A_same150_full: { pathogenRegime: { ...WAVES, interval: 150, mode: 'same' } },
  A_same150_noMemory: { pathogenRegime: { ...WAVES, interval: 150, mode: 'same' }, memory: false },
  A_sameLongRetention_full: { pathogenRegime: { ...WAVES, mode: 'same' }, memoryDecay: 0.3 },
  A_sameLongRetention_noMemory: { pathogenRegime: { ...WAVES, mode: 'same' }, memoryDecay: 0.3, memory: false },
  // B: rare irregular breeding windows vs breeding always possible
  B_frequent_sel: {}, B_frequent_drift: { selection: false },
  B_rare_sel: { breedingRegime: RARE }, B_rare_drift: { breedingRegime: RARE, selection: false },
  // C: stable rich vs low stable vs pulsed food (same mean as stable rich)
  C_stableRich_sel: {}, C_stableRich_drift: { selection: false },
  C_lowStable_sel: { resourceScale: 0.3 }, C_lowStable_drift: { resourceScale: 0.3, selection: false },
  C_pulsed_sel: { resourceRegime: PULSE }, C_pulsed_drift: { resourceRegime: PULSE, selection: false },
  // D: predictable periodic climate vs uncorrelated noise; GRN and plasticity
  D_periodic_plastic: { thermalRegime: PERIODIC }, D_periodic_nonplastic: { thermalRegime: PERIODIC, plasticity: false },
  D_periodic_noGRN: { thermalRegime: PERIODIC, regulation: false }, D_periodic_drift: { thermalRegime: PERIODIC, selection: false },
  D_noise_plastic: { thermalRegime: NOISE }, D_noise_nonplastic: { thermalRegime: NOISE, plasticity: false },
  D_noise_noGRN: { thermalRegime: NOISE, regulation: false }, D_noise_drift: { thermalRegime: NOISE, selection: false },
  D_periodic_acclim5_cost: { thermalRegime: PERIODIC, acclimateEvery: 5, acclimateCost: 0.02 },
  D_periodic_acclim25_cost: { thermalRegime: PERIODIC, acclimateEvery: 25, acclimateCost: 0.02 },
  D_periodic_acclim100_cost: { thermalRegime: PERIODIC, acclimateEvery: 100, acclimateCost: 0.02 },
};
const GARDEN = { environment: 'rich', steps: 600 };            // common garden for intrinsic lifespan (B)
const COMPETE = { stableRich: {}, lowStable: { resourceScale: 0.3 }, pulsed: { resourceRegime: PULSE },
  // controls added after the primary run (recorded in REPORT.md): with selection off both genotypes
  // live by the founder phenotype, so any share change is drift; and a longer gap between pulses
  pulsed_noSelection: { resourceRegime: PULSE, selection: false }, pulsed40: { resourceRegime: { period: 40, pulseLength: 8 } } };

function lastAlive(r) { for (let i = r.history.length - 1; i >= 0; i--) if (r.history[i].population > 0) return r.history[i]; return r.history[0]; }
function sampleGenomes(g, k = 100) { const out = []; for (let i = 0; i < k; i++) out.push(g[Math.floor(i * g.length / k)]); return out; }
function withTrait(name, value) {
  const k = E.LOCI.findIndex((l) => l[0] === name);
  const make = (w) => { const g = E.founderGenome(); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[k, w]] }); return g; };
  let lo = -40, hi = 40;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (E.develop(make(mid), E.REFERENCE_DEV).traits[k] < value) lo = mid; else hi = mid; }
  return make((lo + hi) / 2);
}

function runTask(t) {
  if (t.kind === 'compete') {
    const low = withTrait('metabolism', 0.6), high = withTrait('metabolism', 1.2);
    const r = E.assay([low, high], { seed: t.seed, steps: 600, ...BASE, ...COMPETE[t.regime] });
    const h = lastAlive(r), met = h.loci.metabolism;
    return { extinct: r.extinct, extinctAt: r.extinctAt, lowShare: h.population ? Math.min(1, Math.max(0, (1.2 - met) / 0.6)) : null, finalPopulation: r.population.final };
  }
  const r = E.simulate({ seed: t.seed, steps: t.steps, ...BASE, ...CELLS[t.cell] });
  const h = lastAlive(r), tot = r.energy.intakePlant + r.energy.intakePrey;
  const out = {
    extinct: r.extinct, extinctAt: r.extinctAt, persistence: r.lineagePersistence, popMedian: r.population.median, popMin: r.population.min, popMax: r.population.max,
    lifeMean: r.lifespan.calendarMean, lifeMax: r.lifespan.calendarMax, activeMean: r.lifespan.activeMean, internalMean: r.lifespan.internalMean,
    generationTime: r.reproduction.generationTime, birthsPerDeath: r.reproduction.birthsPerDeath, maxBirths: r.reproduction.maxBirths, breedersAmongDead: r.reproduction.breedersAmongDead,
    causes: r.deathCauses, loci: h.loci, lociFromStep: h.step, meanM: h.meanM, modes: r.modeFractions,
    huntFraction: r.modeFractions.hunt, exploreFraction: r.modeFractions.explore, dormantFraction: r.modeFractions.dormant,
    preyShare: tot ? r.energy.intakePrey / tot : null, intakePerStep: r.lineagePersistence ? tot / r.lineagePersistence : null,
    regimes: r.regimes, spentBy: r.energy.spentBy, residual: r.energy.residual, capHit: r.capHit, ms: r.elapsedMs,
  };
  if (t.garden && r.finalGenomes.length) {
    const g = E.assay(sampleGenomes(r.finalGenomes), { seed: 900 + t.seed, ...GARDEN });
    out.garden = { lifeMean: g.lifespan.calendarMean, activeMean: g.lifespan.activeMean, popMedian: g.population.median, extinct: g.extinct };
  }
  return out;
}

if (!isMainThread) { parentPort.on('message', (t) => parentPort.postMessage({ id: t.id, out: runTask(t) })); return; }

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(arg('--seeds', 30)), SEED0 = Number(arg('--seed0', 1)), STEPS = Number(arg('--steps', 2000));
const ONLY = arg('--only', 'A,B,C,D').split(','), OUT = arg('--out', 'results14.json');
const seeds = Array.from({ length: SEEDS }, (_, i) => SEED0 + i);

const tasks = [];
for (const cell of Object.keys(CELLS)) if (ONLY.includes(cell[0])) for (const seed of seeds) tasks.push({ id: tasks.length, kind: 'run', cell, seed, steps: STEPS, garden: cell.startsWith('B_') });
if (ONLY.includes('C')) for (const regime of Object.keys(COMPETE)) for (const seed of seeds) tasks.push({ id: tasks.length, kind: 'compete', regime, seed: 500 + seed });

const t0 = Date.now(), results = new Array(tasks.length);
let next = 0, done = 0;
const nW = Math.max(1, Math.min(os.cpus().length, 4)), pool = [];
new Promise((resolve) => {
  for (let w = 0; w < nW; w++) {
    const worker = new Worker(__filename); pool.push(worker);
    const feed = () => { if (next < tasks.length) worker.postMessage(tasks[next++]); };
    worker.on('message', ({ id, out }) => { results[id] = out; if (++done === tasks.length) resolve(); else feed(); });
    worker.on('error', (e) => { console.error(e); process.exit(1); });
    feed();
  }
}).then(() => {
  pool.forEach((w) => w.terminate());
  const R = {}, C = {};
  tasks.forEach((t, i) => { if (t.kind === 'run') (R[t.cell] ??= [])[seeds.indexOf(t.seed)] = results[i]; else (C[t.regime] ??= [])[seeds.indexOf(t.seed - 500)] = results[i]; });
  const col = (cell, f) => (R[cell] || []).map((r) => (r && !r.extinct ? f(r) : null));
  const colAll = (cell, f) => (R[cell] || []).map((r) => (r ? f(r) : null));

  // ---- primary hypotheses (pre-registered; one-sided, direction = "favours the target trait") ----
  const primary = {};
  if (R.A_same_full) primary.A_memory = { endpoint: 'evolved genotypic memoryLearn: (sel same - sel novel) - (drift same - drift novel)',
    ...S.did(col('A_same_full', (r) => r.loci.memoryLearn), col('A_novel_full', (r) => r.loci.memoryLearn), col('A_same_drift', (r) => r.loci.memoryLearn), col('A_novel_drift', (r) => r.loci.memoryLearn), { seed: 101, alternative: 'greater' }) };
  if (R.B_rare_sel) primary.B_longevity = { endpoint: 'common-garden mean calendar lifespan: (sel rare - sel frequent) - (drift rare - drift frequent)',
    ...S.did(col('B_rare_sel', (r) => r.garden?.lifeMean), col('B_frequent_sel', (r) => r.garden?.lifeMean), col('B_rare_drift', (r) => r.garden?.lifeMean), col('B_frequent_drift', (r) => r.garden?.lifeMean), { seed: 102, alternative: 'greater' }) };
  if (C.pulsed) primary.C_lowMetabolism = { endpoint: 'share of the low-metabolism genotype (0.6 vs 1.2) at the end of a 50:50 competition: pulsed - stable rich',
    ...S.paired(C.pulsed.map((r) => r.lowShare), C.stableRich.map((r) => r.lowShare), { seed: 103, alternative: 'greater' }) };
  if (R.D_periodic_plastic) primary.D_plasticity = { endpoint: 'median population: (plastic - nonplastic) under periodic - same under noise (GRN on, selection on)',
    ...S.did(colAll('D_periodic_plastic', (r) => r.popMedian), colAll('D_periodic_nonplastic', (r) => r.popMedian), colAll('D_noise_plastic', (r) => r.popMedian), colAll('D_noise_nonplastic', (r) => r.popMedian), { seed: 104, alternative: 'greater' }) };
  const keys = Object.keys(primary), adj = S.holm(keys.map((k) => primary[k].p));
  keys.forEach((k, i) => { primary[k].pHolm = adj[i]; primary[k].supported = adj[i] < 0.05 && primary[k].ci95 && primary[k].ci95[0] > 0; });

  // ---- secondary (exploratory, unadjusted) ----
  const sec = {};
  const pc = (a, b, f, opts = {}) => S.paired(col(a, f), col(b, f), { seed: 7, ...opts });
  const ext = (a, b) => S.mcnemarExact(colAll(a, (r) => r.extinct), colAll(b, (r) => r.extinct));
  if (R.A_same_full) sec.A = {
    memoryBenefitPop_same: pc('A_same_full', 'A_same_noMemory', (r) => r.popMedian), memoryBenefitPop_novel: pc('A_novel_full', 'A_novel_noMemory', (r) => r.popMedian),
    memoryBenefitPop_near: pc('A_near_full', 'A_near_noMemory', (r) => r.popMedian), memoryBenefitPop_interval150: pc('A_same150_full', 'A_same150_noMemory', (r) => r.popMedian),
    memoryBenefitPop_longRetention: pc('A_sameLongRetention_full', 'A_sameLongRetention_noMemory', (r) => r.popMedian),
    memoryLearn_cost0_vs_full_same: pc('A_same_cost0', 'A_same_full', (r) => r.loci.memoryLearn), memoryLearn_full_vs_drift_same: pc('A_same_full', 'A_same_drift', (r) => r.loci.memoryLearn),
    memoryBenefitLife_same: pc('A_same_full', 'A_same_noMemory', (r) => r.lifeMean),
    extinction_same_full_vs_noMemory: ext('A_same_full', 'A_same_noMemory'),
  };
  if (R.B_rare_sel) sec.B = {
    gardenLife_sel_rare_vs_frequent: pc('B_rare_sel', 'B_frequent_sel', (r) => r.garden?.lifeMean), gardenLife_drift_rare_vs_frequent: pc('B_rare_drift', 'B_frequent_drift', (r) => r.garden?.lifeMean),
    repairRate_sel_rare_vs_frequent: pc('B_rare_sel', 'B_frequent_sel', (r) => r.loci.repairRate), metabolism_sel_rare_vs_frequent: pc('B_rare_sel', 'B_frequent_sel', (r) => r.loci.metabolism),
    fecundity_sel_rare_vs_frequent: pc('B_rare_sel', 'B_frequent_sel', (r) => r.loci.fecundity), generationTime_sel_rare_vs_frequent: pc('B_rare_sel', 'B_frequent_sel', (r) => r.generationTime),
    extinction_rare_sel_vs_drift: ext('B_rare_sel', 'B_rare_drift'),
  };
  if (R.C_pulsed_sel) sec.C = {
    extinction_pulsed_sel_vs_drift: ext('C_pulsed_sel', 'C_pulsed_drift'), extinction_pulsed_vs_stableRich_sel: ext('C_pulsed_sel', 'C_stableRich_sel'),
    extinction_lowStable_sel_vs_drift: ext('C_lowStable_sel', 'C_lowStable_drift'),
    metabolism_pulsed_vs_stableRich_sel: pc('C_pulsed_sel', 'C_stableRich_sel', (r) => r.loci.metabolism), metabolism_lowStable_vs_stableRich_sel: pc('C_lowStable_sel', 'C_stableRich_sel', (r) => r.loci.metabolism),
    dormancy_pulsed_vs_stableRich_sel: pc('C_pulsed_sel', 'C_stableRich_sel', (r) => r.dormantFraction),
    lowShare_lowStable_vs_stableRich: S.paired(C.lowStable.map((r) => r.lowShare), C.stableRich.map((r) => r.lowShare), { seed: 9 }),
    persistence_pulsed_sel_vs_drift: S.paired(colAll('C_pulsed_sel', (r) => r.persistence), colAll('C_pulsed_drift', (r) => r.persistence), { seed: 9 }),
  };
  if (R.D_periodic_plastic) sec.D = {
    plastic_vs_nonplastic_periodic: S.paired(colAll('D_periodic_plastic', (r) => r.popMedian), colAll('D_periodic_nonplastic', (r) => r.popMedian), { seed: 11 }),
    plastic_vs_nonplastic_noise: S.paired(colAll('D_noise_plastic', (r) => r.popMedian), colAll('D_noise_nonplastic', (r) => r.popMedian), { seed: 11 }),
    grn_vs_noGRN_periodic: S.paired(colAll('D_periodic_plastic', (r) => r.popMedian), colAll('D_periodic_noGRN', (r) => r.popMedian), { seed: 11 }),
    grn_vs_noGRN_noise: S.paired(colAll('D_noise_plastic', (r) => r.popMedian), colAll('D_noise_noGRN', (r) => r.popMedian), { seed: 11 }),
    acclim5_vs_25_cost: S.paired(colAll('D_periodic_acclim5_cost', (r) => r.popMedian), colAll('D_periodic_acclim25_cost', (r) => r.popMedian), { seed: 11 }),
    acclim100_vs_25_cost: S.paired(colAll('D_periodic_acclim100_cost', (r) => r.popMedian), colAll('D_periodic_acclim25_cost', (r) => r.popMedian), { seed: 11 }),
    acclim25_cost_vs_free: S.paired(colAll('D_periodic_acclim25_cost', (r) => r.popMedian), colAll('D_periodic_plastic', (r) => r.popMedian), { seed: 11 }),
  };

  // ---- per-cell summaries ----
  const cells = {};
  for (const [cell, rows] of Object.entries(R)) {
    const live = rows.filter((r) => !r.extinct), causes = {};
    for (const r of rows) for (const [k, v] of Object.entries(r.causes)) causes[k] = (causes[k] || 0) + v;
    const ct = Object.values(causes).reduce((a, b) => a + b, 0) || 1;
    cells[cell] = { n: rows.length, extinct: rows.filter((r) => r.extinct).length, capHit: rows.filter((r) => r.capHit).length,
      maxAbsEnergyResidual: Math.max(...rows.map((r) => Math.abs(r.residual))),
      ...Object.fromEntries(['popMedian', 'persistence', 'lifeMean', 'lifeMax', 'activeMean', 'internalMean', 'generationTime', 'birthsPerDeath', 'maxBirths', 'breedersAmongDead',
        'huntFraction', 'exploreFraction', 'dormantFraction', 'preyShare', 'intakePerStep', 'meanM'].map((k) => [k, S.desc(rows.map((r) => r[k]))])),
      loci: Object.fromEntries(E.LOCI.map((l) => [l[0], S.desc(live.map((r) => r.loci[l[0]]))])),
      deathCauseShare: Object.fromEntries(Object.entries(causes).map(([k, v]) => [k, v / ct])),
      immune: { peakAtDeath: S.desc(rows.map((r) => r.regimes.immuneMemoryPeakAtDeath)), retentionAtDeath: S.desc(rows.map((r) => r.regimes.immuneMemoryRetentionAtDeath)),
        waveInfectionsPerDeath: S.desc(rows.map((r) => r.regimes.waveInfectionsPerDeath)), reinfections: S.desc(rows.map((r) => r.regimes.reinfectionsSameAntigen)) },
      garden: rows[0]?.garden !== undefined ? { lifeMean: S.desc(rows.map((r) => r.garden?.lifeMean)), activeMean: S.desc(rows.map((r) => r.garden?.activeMean)) } : undefined,
      // a long life spent mostly dormant is not counted as an animal outcome
      dormancyDominatedRuns: rows.filter((r) => r.dormantFraction > 0.5).length,
      runtimeMs: S.desc(rows.map((r) => r.ms)) };
  }
  const competition = Object.fromEntries(Object.entries(C).map(([k, rows]) => [k, { lowShare: S.desc(rows.map((r) => r.lowShare)), lowWins: rows.filter((r) => r.lowShare > 0.5).length,
    extinct: rows.filter((r) => r.extinct).length, n: rows.length }]));

  const out = { generated: new Date().toISOString(), node: process.version, seeds, steps: STEPS, cellsConfig: CELLS, garden: GARDEN, competeConfig: COMPETE,
    primary, secondary: sec, cells, competition, runs: R, competeRuns: C,
    runtime: { wallSeconds: (Date.now() - t0) / 1000, workers: nW, perRunMs: S.desc(Object.values(R).flat().map((r) => r.ms)) } };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('wrote', OUT, 'tasks', tasks.length, 'in', out.runtime.wallSeconds.toFixed(1), 's');
  for (const [k, v] of Object.entries(primary)) console.log(k, 'mean', v.meanDiff?.toFixed(4), 'CI', v.ci95?.map((x) => x.toFixed(4)).join('..'), 'dz', v.dz?.toFixed(2), 'p', v.p?.toFixed(4), 'pHolm', v.pHolm?.toFixed(4), 'n', v.n, 'dropped', v.droppedPairs, v.supported ? 'SUPPORTED' : 'not supported');
});
