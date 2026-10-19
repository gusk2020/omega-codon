'use strict';
// Stage 1.5 experiments. Usage: node experiments15.js [--seeds 30] [--seed0 1] [--steps 2000] [--out results15.json]
// Hypotheses, endpoints and the decision rule are fixed in PREREGISTRATION.md before any result was seen.
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const os = require('node:os');
const fs = require('node:fs');
const E = require('./engine15');
const S = require('./stats15');

const BASE = { environment: 'rich' };
const PULSE = { period: 20, pulseLength: 4 }, PULSE40 = { period: 40, pulseLength: 8 };
const ST = { storageEvolvable: true, storageCost: 0.004 };
const W8 = { interval: 8, waveLength: 3, strength: 0.5 }, W4 = { ...W8, interval: 4 }, W16 = { ...W8, interval: 16 };
const STORAGE_IDX = E.LOCI.length;

// ---- evolution cells (mutation on, 2000 steps) ---------------------------------------------
const RUN_CELLS = {
  // P4 / Stage 1.4 continuity: storage fixed, no storage cost, so these must equal Stage 1.4's C cells exactly
  P4_pulsed_sel: { resourceRegime: PULSE }, P4_pulsed_drift: { resourceRegime: PULSE, selection: false },
  P4_stable_sel: {}, P4_stable_drift: { selection: false },
  // P2: storage can evolve, and costs energy to hold
  P2_pulsed_sel: { ...ST, resourceRegime: PULSE }, P2_pulsed_drift: { ...ST, resourceRegime: PULSE, selection: false },
  P2_stable_sel: { ...ST }, P2_stable_drift: { ...ST, selection: false },
  P2_pulsed_sel_c0: { ...ST, storageCost: 0, resourceRegime: PULSE }, P2_stable_sel_c0: { ...ST, storageCost: 0 },
  // P3: memory with a wave interval shorter than a lifespan
  ...Object.fromEntries(['same', 'novel'].flatMap((m) => [
    [`M_${m}_full`, { pathogenRegime: { ...W8, mode: m } }], [`M_${m}_drift`, { pathogenRegime: { ...W8, mode: m }, selection: false }],
    [`M_${m}_noMemory`, { pathogenRegime: { ...W8, mode: m }, memory: false }], [`M_${m}_cost0`, { pathogenRegime: { ...W8, mode: m }, memoryCost: false }],
    [`M_${m}_benefit0`, { pathogenRegime: { ...W8, mode: m }, memoryBenefit: false }]])),
  M4_same_full: { pathogenRegime: { ...W4, mode: 'same' } }, M4_same_noMemory: { pathogenRegime: { ...W4, mode: 'same' }, memory: false }, M4_same_cost0: { pathogenRegime: { ...W4, mode: 'same' }, memoryCost: false },
  M16_same_full: { pathogenRegime: { ...W16, mode: 'same' } }, M16_same_noMemory: { pathogenRegime: { ...W16, mode: 'same' }, memory: false }, M16_same_cost0: { pathogenRegime: { ...W16, mode: 'same' }, memoryCost: false },
};

// ---- accounting assays: fixed genotype, no mutation, 600 steps -------------------------------
const ASSAY_CELLS = Object.fromEntries(['same', 'novel'].flatMap((m) => [
  [`A_${m}_full`, { pathogenRegime: { ...W8, mode: m } }], [`A_${m}_noMemory`, { pathogenRegime: { ...W8, mode: m }, memory: false }],
  [`A_${m}_cost0`, { pathogenRegime: { ...W8, mode: m }, memoryCost: false }], [`A_${m}_benefit0`, { pathogenRegime: { ...W8, mode: m }, memoryBenefit: false }]]));

// ---- competition cells (mutation off, 600 steps, lineage IDs) --------------------------------
const REGIMES = { stableRich: {}, lowStable: { resourceScale: 0.3 }, pulsed: { resourceRegime: PULSE }, pulsed40: { resourceRegime: PULSE40 }, pulsed_noSelection: { resourceRegime: PULSE, selection: false } };
const COMPETE = {};
for (const r of Object.keys(REGIMES)) COMPETE['C1_' + r] = { kind: 'C1', opts: { ...REGIMES[r] } };                                   // Stage 1.4's 0.6 vs 1.2 competition, re-measured by lineage
for (const r of Object.keys(REGIMES)) COMPETE['H_' + r] = { kind: 'H', opts: { ...ST, ...REGIMES[r] } };                                // cap 3 vs cap 8, metabolism 1.0
COMPETE.H_stableRich_c0 = { kind: 'H', opts: { ...ST, storageCost: 0 } }; COMPETE.H_pulsed_c0 = { kind: 'H', opts: { ...ST, storageCost: 0, resourceRegime: PULSE } };
COMPETE.H_stableRich_c12 = { kind: 'H', opts: { ...ST, storageCost: 0.012 } }; COMPETE.H_pulsed_c12 = { kind: 'H', opts: { ...ST, storageCost: 0.012, resourceRegime: PULSE } };
for (const r of Object.keys(REGIMES)) COMPETE['Q_' + r] = { kind: 'Q', opts: { ...ST, ...REGIMES[r] } };                                 // low-metabolism / high-storage / mixed / baseline

// ---- genotypes ----------------------------------------------------------------------------------
// Every competitor carries the same number of extra genes, so gene-length and expression cost are equal;
// only the target trait values differ. The weights are found by bisection on the developed trait.
function solve(make, k, value) {
  let lo = -40, hi = 40;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (E.develop(make(mid), E.REFERENCE_DEV).traits[k] < value) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function metabolismGenome(value) { // exactly Stage 1.4's withTrait('metabolism', value)
  const make = (w) => { const g = E.founderGenome(); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[0, w]] }); return g; };
  return make(solve(make, 0, value));
}
function twoGeneGenome(metabolism, storage) {
  const mk = (w1, w2) => { const g = E.founderGenome(); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[0, w1]] }); g.genes.push({ k: 0, prom: 14, sens: null, len: 1, on: true, eff: [[STORAGE_IDX, w2]] }); return g; };
  return mk(solve((w) => mk(w, 0), 0, metabolism), solve((w) => mk(0, w), STORAGE_IDX, storage));
}
const GENOTYPES = {
  C1: [['slow', () => metabolismGenome(0.6)], ['fast', () => metabolismGenome(1.2)]],
  H: [['cap3', () => twoGeneGenome(1.0, 3)], ['cap8', () => twoGeneGenome(1.0, 8)]],
  Q: [['base', () => twoGeneGenome(1.0, 3)], ['lowMet', () => twoGeneGenome(0.6, 3)], ['highStore', () => twoGeneGenome(1.0, 8)], ['mixed', () => twoGeneGenome(0.6, 8)]],
};

function lastAlive(r) { for (let i = r.history.length - 1; i >= 0; i--) if (r.history[i].population > 0) return r.history[i]; return r.history[0]; }

function runTask(t) {
  if (t.kind === 'compete') {
    const spec = COMPETE[t.cell], gs = GENOTYPES[spec.kind], genomes = gs.map(([, f]) => f());
    const r = E.assay(genomes, { seed: t.seed, steps: 600, ...BASE, ...spec.opts });
    const h = lastAlive(r), L = r.lineages;
    return { names: gs.map(([n]) => n), shares: L.shareAtEnd, alive: L.alive, persistence: L.extinctAt.map((x) => (x === null ? 600 : x)), extinctedLineage: L.extinctAt.map((x) => x !== null),
      extinct: r.extinct, finalPopulation: r.population.final, popMedian: r.population.median, legacyMeanMetabolism: h.loci.metabolism, meanStorage: h.meanStorage, capHit: r.capHit };
  }
  const o = t.kind === 'assay' ? { seed: t.seed, steps: 600, ...BASE, ...ASSAY_CELLS[t.cell] } : { seed: t.seed, steps: t.steps, ...BASE, ...RUN_CELLS[t.cell] };
  const r = t.kind === 'assay' ? E.assay([E.founderGenome()], o) : E.simulate(o);
  const h = lastAlive(r), tot = r.energy.intakePlant + r.energy.intakePrey;
  return {
    extinct: r.extinct, extinctAt: r.extinctAt, persistence: r.lineagePersistence, popMin: r.population.min, popMedian: r.population.median, popMax: r.population.max,
    lifeMean: r.lifespan.calendarMean, lifeMax: r.lifespan.calendarMax, activeMean: r.lifespan.activeMean, internalMean: r.lifespan.internalMean,
    generationTime: r.reproduction.generationTime, earlyBirthRate400: r.reproduction.earlyBirthRate400, lateBirthRate: r.reproduction.lateBirthRate,
    birthsPerDeath: r.reproduction.birthsPerDeath, causes: r.deathCauses, loci: h.loci, lastAliveStep: h.step, meanStorage: h.meanStorage, meanM: h.meanM,
    huntFraction: r.modeFractions.hunt, dormantFraction: r.modeFractions.dormant, exploreFraction: r.modeFractions.explore,
    preyShare: tot ? r.energy.intakePrey / tot : null, regimes: r.regimes, spentBy: r.energy.spentBy, residual: r.energy.residual, capHit: r.capHit, ms: r.elapsedMs,
  };
}

if (!isMainThread) { parentPort.on('message', (t) => parentPort.postMessage({ id: t.id, out: runTask(t) })); return; }

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(arg('--seeds', 30)), SEED0 = Number(arg('--seed0', 1)), STEPS = Number(arg('--steps', 2000)), OUT = arg('--out', 'results15.json');
const seeds = Array.from({ length: SEEDS }, (_, i) => SEED0 + i);

const tasks = [];
for (const cell of Object.keys(RUN_CELLS)) for (const seed of seeds) tasks.push({ id: tasks.length, kind: 'run', cell, seed, steps: STEPS });
for (const cell of Object.keys(ASSAY_CELLS)) for (const seed of seeds) tasks.push({ id: tasks.length, kind: 'assay', cell, seed: 300 + seed });
for (const cell of Object.keys(COMPETE)) for (const seed of seeds) tasks.push({ id: tasks.length, kind: 'compete', cell, seed: 500 + seed });

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
  const R = {}, A = {}, C = {};
  tasks.forEach((t, i) => { const tgt = t.kind === 'run' ? R : t.kind === 'assay' ? A : C; (tgt[t.cell] ??= [])[seeds.indexOf(t.kind === 'run' ? t.seed : t.kind === 'assay' ? t.seed - 300 : t.seed - 500)] = results[i]; });
  const col = (cells, f) => (cells || []).map((r) => (r ? f(r) : null));
  const shareOf = (cell, name) => col(C[cell], (r) => r.shares[r.names.indexOf(name)]);

  // ---- primary ----
  const primary = {};
  primary.P1_storage = { endpoint: 'share of the capacity-8 lineage after a 2-lineage competition (capacity 8 vs 3): pulsed - stable rich',
    ...S.paired(shareOf('H_pulsed', 'cap8'), shareOf('H_stableRich', 'cap8'), { seed: 201, alternative: 'greater' }) };
  primary.P2_storageEvolution = { endpoint: 'final genotypic storage capacity: (sel pulsed - sel stable) - (drift pulsed - drift stable); extinct runs use their last live sample',
    ...S.did(col(R.P2_pulsed_sel, (r) => r.meanStorage), col(R.P2_stable_sel, (r) => r.meanStorage), col(R.P2_pulsed_drift, (r) => r.meanStorage), col(R.P2_stable_drift, (r) => r.meanStorage), { seed: 202, alternative: 'greater' }) };
  primary.P3_memory = { endpoint: 'final genotypic memoryLearn: (sel same - sel novel) - (drift same - drift novel); extinct runs use their last live sample',
    ...S.did(col(R.M_same_full, (r) => r.loci.memoryLearn), col(R.M_novel_full, (r) => r.loci.memoryLearn), col(R.M_same_drift, (r) => r.loci.memoryLearn), col(R.M_novel_drift, (r) => r.loci.memoryLearn), { seed: 203, alternative: 'greater' }) };
  const sp = S.spearmanPerm(col(R.P4_pulsed_sel, (r) => r.earlyBirthRate400), col(R.P4_pulsed_sel, (r) => r.persistence), { seed: 204, alternative: 'less' });
  primary.P4_shortTermVsLongTerm = { endpoint: 'Spearman rho between births per individual-step in steps 1-400 and lineage persistence (censored at 2000), pulsed, selection on', ...sp, meanDiff: sp.rho, supportedDirection: sp.rho < 0 };
  const keys = Object.keys(primary), adj = S.holm(keys.map((k) => primary[k].p ?? 1));
  keys.forEach((k, i) => { primary[k].pHolm = adj[i]; });

  // ---- cell summaries ----
  const cells = {};
  for (const [cell, rows] of Object.entries({ ...R, ...A })) {
    const causes = {}; for (const r of rows) for (const [k, v] of Object.entries(r.causes)) causes[k] = (causes[k] || 0) + v;
    const ct = Object.values(causes).reduce((a, b) => a + b, 0) || 1;
    cells[cell] = { n: rows.length, extinct: rows.filter((r) => r.extinct).length, capHit: rows.filter((r) => r.capHit).length, maxAbsEnergyResidual: Math.max(...rows.map((r) => Math.abs(r.residual))),
      ...Object.fromEntries(['popMin', 'popMedian', 'popMax', 'lifeMean', 'persistence', 'activeMean', 'generationTime', 'earlyBirthRate400', 'lateBirthRate', 'birthsPerDeath', 'huntFraction', 'dormantFraction', 'exploreFraction', 'preyShare', 'meanStorage', 'meanM'].map((k) => [k, S.desc(rows.map((r) => r[k]))])),
      memoryLearn: S.desc(rows.map((r) => r.loci.memoryLearn)), metabolism: S.desc(rows.map((r) => r.loci.metabolism)), fecundity: S.desc(rows.map((r) => r.loci.fecundity)),
      immune: { peakAtDeath: S.desc(rows.map((r) => r.regimes.immuneMemoryPeakAtDeath)), retentionAtDeath: S.desc(rows.map((r) => r.regimes.immuneMemoryRetentionAtDeath)),
        waveInfectionsPerDeath: S.desc(rows.map((r) => r.regimes.waveInfectionsPerDeath)), reinfections: S.desc(rows.map((r) => r.regimes.reinfectionsSameAntigen)) },
      spendingStorage: S.desc(rows.map((r) => r.spentBy.storage)), spendingMemory: S.desc(rows.map((r) => r.spentBy.memory)),
      deathCauseShare: Object.fromEntries(Object.entries(causes).map(([k, v]) => [k, v / ct])),
      dormancyDominatedRuns: rows.filter((r) => r.dormantFraction > 0.5).length, runtimeMs: S.desc(rows.map((r) => r.ms)) };
  }
  const pc = (a, b, f, opts = {}) => S.paired(col(R[a], f), col(R[b], f), { seed: 7, ...opts });
  const ext = (a, b) => S.mcnemarExact(col(R[a], (r) => r.extinct), col(R[b], (r) => r.extinct));
  // extinct-inclusive set: lineage persistence (restricted mean survival time up to the horizon), whole-run mean individual
  // lifespan (every death counted, extinct runs included), population, and the extinction count; shown together, never merged
  const inclusive = (a, b) => ({ extinction: ext(a, b), persistence_rmst: pc(a, b, (r) => r.persistence), lifespanAllDeaths: pc(a, b, (r) => r.lifeMean), popMedian: pc(a, b, (r) => r.popMedian), earlyBirthRate400: pc(a, b, (r) => r.earlyBirthRate400), generationTime: pc(a, b, (r) => r.generationTime) });

  const secondary = {};
  // (1) low-metabolism competition re-measured by lineage
  secondary.C1_lineageAccounting = Object.fromEntries(Object.keys(REGIMES).map((reg) => {
    const rows = C['C1_' + reg], legacy = rows.map((r) => Math.min(1, Math.max(0, (1.2 - r.legacyMeanMetabolism) / 0.6))), direct = rows.map((r) => r.shares[0]);
    const old14 = (() => { try { const j = require('./stage1.4/results14.json'); const name = { stableRich: 'stableRich', lowStable: 'lowStable', pulsed: 'pulsed' }[reg]; return name && SEED0 === 1 ? j.competeRuns[name].map((r) => r.lowShare) : null; } catch { return null; } })();
    const exclT = rows.map((r) => (r.extinctedLineage[1] ? r.persistence[1] : null)).filter(S.finite);
    return [reg, { slowShare: S.desc(direct), slowWins: direct.filter((v) => v > 0.5).length, legacyDerivedShare: S.desc(legacy), maxAbsDiffDirectVsLegacy: Math.max(...direct.map((v, i) => Math.abs(v - legacy[i]))),
      maxAbsDiffVsStage14Saved: old14 ? Math.max(...direct.map((v, i) => Math.abs(v - old14[i]))) : null, fastLineageExcluded: exclT.length, meanStepsToExcludeFast: exclT.length ? S.mean(exclT) : null,
      slowPersistence: S.desc(rows.map((r) => r.persistence[0])), fastPersistence: S.desc(rows.map((r) => r.persistence[1])) }];
  }));
  secondary.C1_pulsed_vs_stable = S.paired(col(C.C1_pulsed, (r) => r.shares[0]), col(C.C1_stableRich, (r) => r.shares[0]), { seed: 301, alternative: 'greater' });
  secondary.C1_pulsed_vs_noSelection = S.paired(col(C.C1_pulsed, (r) => r.shares[0]), col(C.C1_pulsed_noSelection, (r) => r.shares[0]), { seed: 302, alternative: 'greater' });
  // (2) storage competition
  const cmp = (cell) => ({ cap8Share: S.desc(shareOf(cell, 'cap8')), cap8Wins: shareOf(cell, 'cap8').filter((v) => v > 0.5).length, cap3Persistence: S.desc(col(C[cell], (r) => r.persistence[0])), cap8Persistence: S.desc(col(C[cell], (r) => r.persistence[1])), extinctRuns: C[cell].filter((r) => r.extinct).length });
  secondary.H_headToHead = Object.fromEntries(Object.keys(C).filter((k) => k.startsWith('H_')).map((k) => [k, cmp(k)]));
  secondary.H_contrasts = {
    pulsed_vs_stable_cost0: S.paired(shareOf('H_pulsed_c0', 'cap8'), shareOf('H_stableRich_c0', 'cap8'), { seed: 311, alternative: 'greater' }),
    pulsed_vs_stable_cost12: S.paired(shareOf('H_pulsed_c12', 'cap8'), shareOf('H_stableRich_c12', 'cap8'), { seed: 312, alternative: 'greater' }),
    pulsed_vs_noSelection: S.paired(shareOf('H_pulsed', 'cap8'), shareOf('H_pulsed_noSelection', 'cap8'), { seed: 313, alternative: 'greater' }),
    pulsed40_vs_stable: S.paired(shareOf('H_pulsed40', 'cap8'), shareOf('H_stableRich', 'cap8'), { seed: 314, alternative: 'greater' }),
    lowStable_vs_stable: S.paired(shareOf('H_lowStable', 'cap8'), shareOf('H_stableRich', 'cap8'), { seed: 315 }),
    stable_cost_effect: S.paired(shareOf('H_stableRich', 'cap8'), shareOf('H_stableRich_c0', 'cap8'), { seed: 316 }),
  };
  secondary.Q_fourWay = Object.fromEntries(Object.keys(C).filter((k) => k.startsWith('Q_')).map((cell) => {
    const names = C[cell][0].names, out = {};
    names.forEach((n, i) => { const wins = C[cell].filter((r) => r.shares.every((v, j) => v <= r.shares[i] || j === i)).length;
      out[n] = { share: S.desc(C[cell].map((r) => r.shares[i])), winsLargest: wins, persistence: S.desc(C[cell].map((r) => r.persistence[i])), lineageExtinctRuns: C[cell].filter((r) => r.extinctedLineage[i]).length }; });
    return [cell, out];
  }));
  // (3) memory: benefit / cost separation
  secondary.M_evolution = { same_full_vs_noMemory: inclusive('M_same_full', 'M_same_noMemory'), novel_full_vs_noMemory: inclusive('M_novel_full', 'M_novel_noMemory'),
    same_cost0_vs_noMemory: inclusive('M_same_cost0', 'M_same_noMemory'), same_benefit0_vs_noMemory: inclusive('M_same_benefit0', 'M_same_noMemory'),
    memoryLearn_cost0_vs_full_same: pc('M_same_cost0', 'M_same_full', (r) => r.loci.memoryLearn), memoryLearn_benefit0_vs_full_same: pc('M_same_benefit0', 'M_same_full', (r) => r.loci.memoryLearn),
    memoryLearn_full_vs_drift_same: pc('M_same_full', 'M_same_drift', (r) => r.loci.memoryLearn),
    interval4: { gross_cost0_vs_noMemory: pc('M4_same_cost0', 'M4_same_noMemory', (r) => r.popMedian), net_full_vs_noMemory: pc('M4_same_full', 'M4_same_noMemory', (r) => r.popMedian) },
    interval16: { gross_cost0_vs_noMemory: pc('M16_same_cost0', 'M16_same_noMemory', (r) => r.popMedian), net_full_vs_noMemory: pc('M16_same_full', 'M16_same_noMemory', (r) => r.popMedian) } };
  const ac = (m, f) => { const g = (c) => col(A[`A_${m}_${c}`], f); return { net: S.paired(g('full'), g('noMemory'), { seed: 321 }), gross_benefit_costFree: S.paired(g('cost0'), g('noMemory'), { seed: 322 }), cost_benefitFree: S.paired(g('benefit0'), g('noMemory'), { seed: 323 }) }; };
  secondary.M_fixedGenotypeAccounting = {};
  for (const m of ['same', 'novel']) secondary.M_fixedGenotypeAccounting[m] = { popMedian: ac(m, (r) => r.popMedian), lifespanAllDeaths: ac(m, (r) => r.lifeMean), waveInfectionsPerDeath: ac(m, (r) => r.regimes.waveInfectionsPerDeath), reinfections: ac(m, (r) => r.regimes.reinfectionsSameAntigen) };
  // (4) short-term vs long-term, population / individual lifespan / lineage persistence reported separately
  secondary.E4_pulsed_sel_vs_drift = inclusive('P4_pulsed_sel', 'P4_pulsed_drift');
  secondary.E4_stable_sel_vs_drift = inclusive('P4_stable_sel', 'P4_stable_drift');
  secondary.E4_storage_pulsed_sel_vs_drift = inclusive('P2_pulsed_sel', 'P2_pulsed_drift');
  secondary.E4_storage_rescue_pulsed_sel = inclusive('P2_pulsed_sel', 'P4_pulsed_sel');
  secondary.E4_storage_cost0_vs_cost_pulsed = inclusive('P2_pulsed_sel_c0', 'P2_pulsed_sel');
  secondary.E4_storage_vs_fixed_stable = inclusive('P2_stable_sel', 'P4_stable_sel');
  secondary.E4_correlations = Object.fromEntries(['P4_pulsed_sel', 'P4_pulsed_drift', 'P4_stable_sel', 'P2_pulsed_sel', 'P2_pulsed_drift'].map((c) => [c, {
    earlyBirthRate_vs_persistence: S.spearmanPerm(col(R[c], (r) => r.earlyBirthRate400), col(R[c], (r) => r.persistence), { seed: 331, alternative: 'less' }),
    earlyBirthRate_vs_lifespanAllDeaths: S.spearmanPerm(col(R[c], (r) => r.earlyBirthRate400), col(R[c], (r) => r.lifeMean), { seed: 332 }),
    earlyBirthRate_vs_popMedian: S.spearmanPerm(col(R[c], (r) => r.earlyBirthRate400), col(R[c], (r) => r.popMedian), { seed: 333 }),
    fecundityGenotype_vs_persistence: S.spearmanPerm(col(R[c], (r) => r.loci.fecundity), col(R[c], (r) => r.persistence), { seed: 334, alternative: 'less' }) }]));
  const stage14Cross = (() => { try { const j = require('./stage1.4/results14.json'); if (SEED0 !== 1) return null; const strip = (x) => JSON.stringify(x, (k, v) => (['ms', 'garden'].includes(k) ? undefined : v)); const pick = (r) => [r.extinct, r.extinctAt, r.persistence, r.popMedian, r.lifeMean];
      return { pulsed_sel_identical: JSON.stringify(R.P4_pulsed_sel.map(pick)) === JSON.stringify(j.runs.C_pulsed_sel.map(pick)), pulsed_drift_identical: JSON.stringify(R.P4_pulsed_drift.map(pick)) === JSON.stringify(j.runs.C_pulsed_drift.map(pick)), stable_sel_identical: JSON.stringify(R.P4_stable_sel.map(pick)) === JSON.stringify(j.runs.C_stableRich_sel.map(pick)), _unused: strip(0) }; } catch { return null; } })();

  const out = { generated: new Date().toISOString(), node: process.version, seeds, steps: STEPS, config: { RUN_CELLS, ASSAY_CELLS, COMPETE, ST, W8, PULSE, PULSE40 }, primary, secondary, stage14Cross, cells,
    competeSummary: Object.fromEntries(Object.entries(C).map(([k, rows]) => [k, { n: rows.length, extinct: rows.filter((r) => r.extinct).length, shares: rows[0].names.map((n, i) => [n, S.desc(rows.map((r) => r.shares[i]))]) }])),
    runs: R, assayRuns: A, competeRuns: C, runtime: { wallSeconds: (Date.now() - t0) / 1000, workers: nW, perRunMs: S.desc(Object.values(R).flat().map((r) => r.ms)) } };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, 'tasks', tasks.length, 'in', out.runtime.wallSeconds.toFixed(1), 's');
  for (const [k, v] of Object.entries(primary)) console.log(k, 'stat', (v.meanDiff ?? v.rho)?.toFixed(4), 'CI', v.ci95?.map((x) => x.toFixed(4)).join('..'), 'p', v.p?.toFixed(4), 'pHolm', v.pHolm?.toFixed(4), 'n', v.n, 'dropped', v.droppedPairs ?? 0);
  console.log('stage1.4 cross-check', JSON.stringify(stage14Cross));
});
