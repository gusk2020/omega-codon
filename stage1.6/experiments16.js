'use strict';
// Stage 1.6 experiments. Usage: node experiments16.js [--seeds 30] [--seed0 1] [--out results16.json]
// Confirmatory hypotheses P1-P6, endpoints and the decision rule are fixed in PREREGISTRATION.md before any result.
// Everything under `exploratory` is unadjusted and is not used for a verdict.
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const os = require('node:os');
const fs = require('node:fs');
const E = require('./engine16');
const S = require('./stats16');

const BASE = { environment: 'rich' };
const P20 = { period: 20, pulseLength: 4 }, P40 = { period: 40, pulseLength: 8 };
const ST0 = { storageEvolvable: true, storageCost: 0 };
const STORAGE_IDX = E.STORAGE_INDEX;

// ---- E1: storage evolution (mutation on, 6000 steps; samples read at 2000 and 6000) ------------------------------------
const E1 = {};
for (const sup of [1, 16]) for (const eff of [1, 4]) for (const reg of ['stable', 'p20']) for (const sel of ['sel', 'drift'])
  E1[`E1_S${sup}F${eff}_${reg}_${sel}`] = { ...ST0, storageSupply: sup, storageEffectScale: eff, ...(reg === 'p20' ? { resourceRegime: P20 } : {}), selection: sel === 'sel' };
for (const sel of ['sel', 'drift']) {
  E1[`E1_S16F4_p40_${sel}`] = { ...ST0, storageSupply: 16, storageEffectScale: 4, resourceRegime: P40, selection: sel === 'sel' };      // stronger selection: longer gaps
  E1[`E1_S16F4_p20cost4_${sel}`] = { ...ST0, storageCost: 0.004, storageSupply: 16, storageEffectScale: 4, resourceRegime: P20, selection: sel === 'sel' }; // with the reference holding cost
}

// ---- E1c: storage competition, capacity 8 vs 3 at metabolism 1.0 (mutation off, 600 steps) -------------------------------
const REG = { stable: {}, p20: { resourceRegime: P20 }, p40: { resourceRegime: P40 } };
const E1C = {};
for (const [rn, ro] of Object.entries(REG)) for (const c of [0, 1, 2, 4]) E1C[`H_${rn}_c${c}`] = { ...ST0, storageCost: c / 1000, ...ro };
E1C.H_p20_c0_noSel = { ...ST0, storageCost: 0, resourceRegime: P20, selection: false };

// ---- E2: memory — fixed genotype accounting grid (mutation off, 600 steps) --------------------------------------------------
const VARIANTS = { full: {}, noMemory: { memory: false }, cost0: { memoryCost: false }, benefit0: { memoryBenefit: false } };
const waves = (W, mode = 'same') => ({ pathogenRegime: { interval: W, waveLength: 3, strength: 0.5, mode } });
const E2 = {};
for (const D of [3, 8, 17]) for (const W of [6, 12, 24]) for (const dec of [0.1, 1])
  for (const [vn, vo] of Object.entries(VARIANTS)) E2[`G_D${D}_W${W}_m${dec}_${vn}`] = { ...waves(W), infection: { duration: D, load: 0.2 }, memoryDecay: dec, ...vo };
const MAXOPP = { D: 3, W: 6, dec: 0.1 };
for (const [vn, vo] of Object.entries(VARIANTS)) {
  E2[`GN_${vn}`] = { ...waves(6, 'novel'), infection: { duration: 3, load: 0.2 }, memoryDecay: 0.1, ...vo };                 // new antigen every wave
  for (const sev of [4, 10]) E2[`GS${sev}_${vn}`] = { ...waves(6), infection: { duration: 3, load: 0.2 }, memoryDecay: 0.1, infectionSeverity: sev, ...vo };
  E2[`GD_${vn}`] = { ...waves(8), memoryDecay: 1, ...vo };                                                                     // Stage 1.5's dynamic infection, for continuity
}
// ---- E2e: memory evolution at the maximum-opportunity cell (mutation on, 3000 steps) -----------------------------------------
const E2E = {};
for (const mode of ['same', 'novel']) for (const [vn, vo] of Object.entries({ full: {}, noMemory: { memory: false }, cost0: { memoryCost: false }, benefit0: { memoryBenefit: false }, drift: { selection: false } }))
  E2E[`ME_${mode}_${vn}`] = { ...waves(6, mode), infection: { duration: 3, load: 0.2 }, memoryDecay: 0.1, ...vo };

// ---- E3: causal pathway under pulsed supply (mutation on, 2000 steps) ---------------------------------------------------------
const E3 = {
  X_base_sel: { resourceRegime: P20 }, X_base_drift: { resourceRegime: P20, selection: false },
  X_refuge_sel: { resourceRegime: P20, preyRefuge: 0.3 }, X_fecLock_sel: { resourceRegime: P20, fecundityLocked: true },
  X_noPrey_sel: { resourceRegime: P20, preyScale: 1e-4 }, X_both_sel: { resourceRegime: P20, preyRefuge: 0.3, fecundityLocked: true },
};

const RUN_CELLS = { ...E1, ...E2E, ...E3 };
const STEPS = { E1: 6000, E2E: 3000, E3: 2000 };
const stepsFor = (cell) => (cell.startsWith('E1_') ? STEPS.E1 : cell.startsWith('ME_') ? STEPS.E2E : STEPS.E3);

// ---- genotypes ---------------------------------------------------------------------------------------------------------------
function solve(make, k, value) { let lo = -40, hi = 40; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (E.develop(make(mid), E.REFERENCE_DEV).traits[k] < value) lo = mid; else hi = mid; } return (lo + hi) / 2; }
function twoGeneGenome(metabolism, storage) { // same number of extra genes for every competitor, so gene length and expression cost are equal
  const mk = (w1, w2) => { const g = E.founderGenome(); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[0, w1]] }); g.genes.push({ k: 0, prom: 14, sens: null, len: 1, on: true, eff: [[STORAGE_IDX, w2]] }); return g; };
  return mk(solve((w) => mk(w, 0), 0, metabolism), solve((w) => mk(0, w), STORAGE_IDX, storage));
}

function valueAt(history, step) { // last sample at or before `step` in which the lineage was alive
  let best = null; for (const h of history) { if (h.step > step) break; if (h.population > 0) best = h; } return best || history[0];
}

function compact(r, o, extra = {}) {
  const tot = r.energy.intakePlant + r.energy.intakePrey, a = valueAt(r.history, 2000), b = valueAt(r.history, 6000), last = valueAt(r.history, Infinity);
  return { extinct: r.extinct, extinctAt: r.extinctAt, persistence: r.lineagePersistence, popMin: r.population.min, popMedian: r.population.median, popMax: r.population.max,
    lifeMean: r.lifespan.calendarMean, activeMean: r.lifespan.activeMean, generationTime: r.reproduction.generationTime, earlyBirthRate400: r.reproduction.earlyBirthRate400, lateBirthRate: r.reproduction.lateBirthRate,
    birthsPerDeath: r.reproduction.birthsPerDeath, causes: r.deathCauses, loci: last.loci, meanM: last.meanM,
    storage2000: { capacity: a.meanStorage, carriers: a.storageCarriers, step: a.step }, storage6000: { capacity: b.meanStorage, carriers: b.storageCarriers, step: b.step },
    huntFraction: r.modeFractions.hunt, dormantFraction: r.modeFractions.dormant, exploreFraction: r.modeFractions.explore, preyShare: tot ? r.energy.intakePrey / tot : null,
    regimes: r.regimes, ecology: r.ecology, spentBy: r.energy.spentBy, residual: r.energy.residual, capHit: r.capHit, ms: r.elapsedMs, ...extra };
}

function runTask(t) {
  if (t.kind === 'compete') {
    const genomes = [twoGeneGenome(1.0, 3), twoGeneGenome(1.0, 8)];
    const r = E.assay(genomes, { seed: t.seed, steps: 600, ...BASE, ...E1C[t.cell] }), L = r.lineages;
    return { shares: L.shareAtEnd, alive: L.alive, persistence: L.extinctAt.map((x) => (x === null ? 600 : x)), extinct: r.extinct, finalPopulation: r.population.final, popMedian: r.population.median, capHit: r.capHit };
  }
  if (t.kind === 'assay') { const o = { seed: t.seed, steps: 600, ...BASE, ...E2[t.cell] }; return compact(E.assay([E.founderGenome()], o), o); }
  const o = { seed: t.seed, steps: t.steps, ...BASE, ...RUN_CELLS[t.cell] };
  return compact(E.simulate(o), o);
}

if (!isMainThread) { parentPort.on('message', (t) => parentPort.postMessage({ id: t.id, out: runTask(t) })); return; }

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SCALE = Number(arg('--scale', 1)), SEEDS = Number(arg('--seeds', 30)), SEED0 = Number(arg('--seed0', 1)), OUT = arg('--out', 'results16.json'), ONLY = arg('--only', null);
const seeds = Array.from({ length: SEEDS }, (_, i) => SEED0 + i);
const tasks = [];
const keep = (cell) => !ONLY || cell.startsWith(ONLY);
for (const cell of Object.keys(RUN_CELLS)) if (keep(cell)) for (const seed of seeds) tasks.push({ id: tasks.length, kind: 'run', cell, seed, steps: Math.max(50, Math.round(stepsFor(cell) * SCALE)) });
for (const cell of Object.keys(E2)) if (keep(cell)) for (const seed of seeds) tasks.push({ id: tasks.length, kind: 'assay', cell, seed: 300 + seed });
for (const cell of Object.keys(E1C)) if (keep(cell)) for (const seed of seeds) tasks.push({ id: tasks.length, kind: 'compete', cell, seed: 500 + seed });
// longest jobs first, so the workers finish together
const weight = (t) => (t.kind === 'run' ? t.steps : 600);
tasks.sort((a, b) => weight(b) - weight(a)); tasks.forEach((t, i) => (t.id = i));

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
  const col = (rows, f) => (rows || []).map((r) => (r ? f(r) : null));
  const ext = (cell) => col(R[cell], (r) => r.extinct);
  const has = (cell) => !!(R[cell] || A[cell] || C[cell]);

  // =================== CONFIRMATORY ===================
  const confirmatory = {};
  const did = (a, b, c, d, f, seed, at) => S.did(col(R[a], (r) => f(r)), col(R[b], (r) => f(r)), col(R[c], (r) => f(r)), col(R[d], (r) => f(r)), { seed, alternative: 'greater' });
  if (has('E1_S1F1_p20_sel')) confirmatory.P1_carriers = { endpoint: 'storage-gene carrier fraction at step 2000, supply 1 / effect 1, cost 0: (sel p20 - sel stable) - (drift p20 - drift stable)', ...did('E1_S1F1_p20_sel', 'E1_S1F1_stable_sel', 'E1_S1F1_p20_drift', 'E1_S1F1_stable_drift', (r) => r.storage2000.carriers, 401) };
  if (has('E1_S16F4_p20_sel')) confirmatory.P2_capacity = { endpoint: 'mean storage capacity at step 6000, supply 16 / effect 4, cost 0: (sel p20 - sel stable) - (drift p20 - drift stable)', ...did('E1_S16F4_p20_sel', 'E1_S16F4_stable_sel', 'E1_S16F4_p20_drift', 'E1_S16F4_stable_drift', (r) => r.storage6000.capacity, 402) };
  if (has('H_p20_c0')) confirmatory.P3_competition = { endpoint: 'share of the capacity-8 lineage minus 0.5, pulsed p20, holding cost 0 (win margin, 600 steps, mutation off)', ...S.oneSample(col(C.H_p20_c0, (r) => r.shares[1]), 0.5, { seed: 403, alternative: 'greater' }) };
  if (has(`G_D3_W6_m0.1_full`)) confirmatory.P4_memoryNet = { endpoint: 'median population, memory minus no memory, infection 3 steps / wave interval 6 / decay 0.1, same antigen, fixed genotype', ...S.paired(col(A['G_D3_W6_m0.1_full'], (r) => r.popMedian), col(A['G_D3_W6_m0.1_noMemory'], (r) => r.popMedian), { seed: 404, alternative: 'greater' }) };
  if (has('X_refuge_sel')) confirmatory.P5_preyRefuge = { endpoint: 'share of runs that go extinct, pulsed, selection on: baseline minus prey refuge 30%', ...S.eventReduction(ext('X_base_sel'), ext('X_refuge_sel'), 405) };
  if (has('X_fecLock_sel')) confirmatory.P6_fecundityLock = { endpoint: 'share of runs that go extinct, pulsed, selection on: baseline minus fecundity locked at the founder value', ...S.eventReduction(ext('X_base_sel'), ext('X_fecLock_sel'), 406) };
  const keys = Object.keys(confirmatory), adj = S.holm(keys.map((k) => confirmatory[k].p ?? 1));
  keys.forEach((k, i) => { confirmatory[k].pHolm = adj[i]; });

  // =================== EXPLORATORY (unadjusted) ===================
  const exploratory = {};
  const P = (a, b, f, seed = 7, opts = {}) => S.paired(col(R[a], f), col(R[b], f), { seed, ...opts });
  // (1) storage: supply x effect x selection strength x period; carriers AND capacity side by side
  exploratory.storageFactorial = {};
  for (const [cond, [sa, sb, da, db]] of Object.entries({
    S1F1_p20: ['E1_S1F1_p20_sel', 'E1_S1F1_stable_sel', 'E1_S1F1_p20_drift', 'E1_S1F1_stable_drift'], S16F1_p20: ['E1_S16F1_p20_sel', 'E1_S16F1_stable_sel', 'E1_S16F1_p20_drift', 'E1_S16F1_stable_drift'],
    S1F4_p20: ['E1_S1F4_p20_sel', 'E1_S1F4_stable_sel', 'E1_S1F4_p20_drift', 'E1_S1F4_stable_drift'], S16F4_p20: ['E1_S16F4_p20_sel', 'E1_S16F4_stable_sel', 'E1_S16F4_p20_drift', 'E1_S16F4_stable_drift'],
    S16F4_p40: ['E1_S16F4_p40_sel', 'E1_S16F4_stable_sel', 'E1_S16F4_p40_drift', 'E1_S16F4_stable_drift'] })) {
    if (!has(sa)) continue;
    exploratory.storageFactorial[cond] = {};
    for (const step of ['storage2000', 'storage6000']) for (const [ep, key] of [['carriers', 'carriers'], ['capacity', 'capacity']])
      exploratory.storageFactorial[cond][`${ep}_${step}`] = did(sa, sb, da, db, (r) => r[step][key], 411);
  }
  exploratory.storageCells = Object.fromEntries(Object.keys(E1).filter(has).map((c) => [c, { n: R[c].length, extinct: R[c].filter((r) => r.extinct).length,
    carriers2000: S.desc(col(R[c], (r) => r.storage2000.carriers)), capacity2000: S.desc(col(R[c], (r) => r.storage2000.capacity)),
    carriers6000: S.desc(col(R[c], (r) => r.storage6000.carriers)), capacity6000: S.desc(col(R[c], (r) => r.storage6000.capacity)),
    persistence: S.desc(col(R[c], (r) => r.persistence)), popMedian: S.desc(col(R[c], (r) => r.popMedian)), lifespanAllDeaths: S.desc(col(R[c], (r) => r.lifeMean)) }]));
  exploratory.storageHoldingCost_p20 = has('E1_S16F4_p20cost4_sel') ? { sel_vs_costFree: P('E1_S16F4_p20cost4_sel', 'E1_S16F4_p20_sel', (r) => r.storage6000.capacity, 412), extinctionCostly: [ext('E1_S16F4_p20cost4_sel').filter(Boolean).length, ext('E1_S16F4_p20_sel').filter(Boolean).length] } : null;
  // (2) competition: wins and the break-even holding cost
  exploratory.competition = {};
  for (const [rn] of Object.entries(REG)) for (const c of [0, 1, 2, 4]) { const k = `H_${rn}_c${c}`; if (!has(k)) continue;
    const sh = col(C[k], (r) => r.shares[1]); exploratory.competition[k] = { cap8Share: S.desc(sh), wins: sh.filter((v) => v > 0.5).length, n: sh.length, cap8Persistence: S.desc(col(C[k], (r) => r.persistence[1])), cap3Persistence: S.desc(col(C[k], (r) => r.persistence[0])) }; }
  if (has('H_p20_c0_noSel')) { const sh = col(C.H_p20_c0_noSel, (r) => r.shares[1]); exploratory.competition.H_p20_c0_noSel = { cap8Share: S.desc(sh), wins: sh.filter((v) => v > 0.5).length, n: sh.length }; }
  exploratory.breakEvenCost = Object.fromEntries(Object.keys(REG).map((rn) => [rn, { winRateByCostPerMille: Object.fromEntries([0, 1, 2, 4].filter((c) => has(`H_${rn}_c${c}`)).map((c) => [c, exploratory.competition[`H_${rn}_c${c}`].wins / exploratory.competition[`H_${rn}_c${c}`].n])) }]));
  exploratory.pulsedMinusStable_byCost = Object.fromEntries([0, 1, 2, 4].filter((c) => has(`H_p20_c${c}`)).map((c) => [c, S.paired(col(C[`H_p20_c${c}`], (r) => r.shares[1]), col(C[`H_stable_c${c}`], (r) => r.shares[1]), { seed: 421 })]));
  // (3) memory grid: benefit, cost and what happened to infections
  const cellKey = (D, W, dec, v) => `G_D${D}_W${W}_m${dec}_${v}`;
  exploratory.memoryGrid = {};
  for (const D of [3, 8, 17]) for (const W of [6, 12, 24]) for (const dec of [0.1, 1]) {
    if (!A[cellKey(D, W, dec, 'full')]) continue;
    const g = (v, f) => col(A[cellKey(D, W, dec, v)], f), full = A[cellKey(D, W, dec, 'full')], per = (n, d) => (d ? n / d : null);
    exploratory.memoryGrid[`D${D}_W${W}_m${dec}`] = {
      infectionDurationObserved: S.desc(full.map((r) => r.regimes.infectionDurationMean)), exposures: S.desc(full.map((r) => r.regimes.exposures)),
      exposureWithMemoryFraction: S.desc(full.map((r) => r.regimes.exposureWithMemoryFraction)), reinfectionsSameAntigen: S.desc(full.map((r) => r.regimes.reinfectionsSameAntigen)),
      defencePreventedPerRun: S.desc(full.map((r) => r.regimes.defencePrevented)), defenceSuccessPerExposure: S.desc(full.map((r) => per(r.regimes.defencePrevented, r.regimes.exposures))),
      meanProtectionAtMemoryExposure: S.desc(full.map((r) => r.regimes.meanProtectionAtMemoryExposure)),
      net_popMedian: S.paired(g('full', (r) => r.popMedian), g('noMemory', (r) => r.popMedian), { seed: 431 }), grossBenefit_popMedian: S.paired(g('cost0', (r) => r.popMedian), g('noMemory', (r) => r.popMedian), { seed: 432 }),
      cost_popMedian: S.paired(g('benefit0', (r) => r.popMedian), g('noMemory', (r) => r.popMedian), { seed: 433 }),
      net_lifespan: S.paired(g('full', (r) => r.lifeMean), g('noMemory', (r) => r.lifeMean), { seed: 434 }), grossBenefit_lifespan: S.paired(g('cost0', (r) => r.lifeMean), g('noMemory', (r) => r.lifeMean), { seed: 435 }),
      cost_lifespan: S.paired(g('benefit0', (r) => r.lifeMean), g('noMemory', (r) => r.lifeMean), { seed: 436 }) };
  }
  const acct = (prefix) => { if (!A[`${prefix}_full`]) return null; const g = (v, f) => col(A[`${prefix}_${v}`], f); return { defencePreventedPerRun: S.desc(g('full', (r) => r.regimes.defencePrevented)), reinfections: S.desc(g('full', (r) => r.regimes.reinfectionsSameAntigen)),
    net_popMedian: S.paired(g('full', (r) => r.popMedian), g('noMemory', (r) => r.popMedian), { seed: 441 }), grossBenefit_popMedian: S.paired(g('cost0', (r) => r.popMedian), g('noMemory', (r) => r.popMedian), { seed: 442 }), cost_popMedian: S.paired(g('benefit0', (r) => r.popMedian), g('noMemory', (r) => r.popMedian), { seed: 443 }),
    net_lifespan: S.paired(g('full', (r) => r.lifeMean), g('noMemory', (r) => r.lifeMean), { seed: 444 }), grossBenefit_lifespan: S.paired(g('cost0', (r) => r.lifeMean), g('noMemory', (r) => r.lifeMean), { seed: 445 }), cost_lifespan: S.paired(g('benefit0', (r) => r.lifeMean), g('noMemory', (r) => r.lifeMean), { seed: 446 }) }; };
  exploratory.memoryNovelAntigen = acct('GN'); exploratory.memorySeverity4 = acct('GS4'); exploratory.memorySeverity10 = acct('GS10'); exploratory.memoryStage15Continuity = acct('GD');
  if (R.ME_same_full) exploratory.memoryEvolution = {
    memoryLearn_did: S.did(col(R.ME_same_full, (r) => r.loci.memoryLearn), col(R.ME_novel_full, (r) => r.loci.memoryLearn), col(R.ME_same_drift, (r) => r.loci.memoryLearn), col(R.ME_novel_drift, (r) => r.loci.memoryLearn), { seed: 451, alternative: 'greater' }),
    same_full_vs_noMemory_popMedian: P('ME_same_full', 'ME_same_noMemory', (r) => r.popMedian, 452), same_cost0_vs_noMemory_popMedian: P('ME_same_cost0', 'ME_same_noMemory', (r) => r.popMedian, 453),
    same_benefit0_vs_noMemory_popMedian: P('ME_same_benefit0', 'ME_same_noMemory', (r) => r.popMedian, 454), memoryLearn_full_vs_drift_same: P('ME_same_full', 'ME_same_drift', (r) => r.loci.memoryLearn, 455),
    memoryLearn_cost0_vs_full_same: P('ME_same_cost0', 'ME_same_full', (r) => r.loci.memoryLearn, 456) };
  // (4) causal pathway: interventions, then the observational chain
  const inclusive = (a, b) => ({ extinction: S.eventReduction(ext(a), ext(b), 461), extinctionTwoSided: S.mcnemarExact(ext(a), ext(b)), persistenceRMST: P(a, b, (r) => r.persistence, 462), lifespanAllDeaths: P(a, b, (r) => r.lifeMean, 463),
    popMedian: P(a, b, (r) => r.popMedian, 464), earlyBirthRate400: P(a, b, (r) => r.earlyBirthRate400, 465), generationTime: P(a, b, (r) => r.generationTime, 466),
    preyFractionEarly: P(a, b, (r) => r.ecology.preyFractionEarly, 467), preyFractionMin: P(a, b, (r) => r.ecology.preyFractionMin, 468), earlyPopulationMax: P(a, b, (r) => r.ecology.earlyPopulationMax, 469), huntFraction: P(a, b, (r) => r.huntFraction, 470) });
  exploratory.pathway = {};
  for (const [name, a, b] of [['selection_vs_drift', 'X_base_sel', 'X_base_drift'], ['base_vs_refuge', 'X_base_sel', 'X_refuge_sel'], ['base_vs_fecLock', 'X_base_sel', 'X_fecLock_sel'], ['base_vs_noPrey', 'X_base_sel', 'X_noPrey_sel'], ['base_vs_both', 'X_base_sel', 'X_both_sel'], ['refuge_vs_both', 'X_refuge_sel', 'X_both_sel']])
    if (has(a) && has(b)) exploratory.pathway[name] = inclusive(a, b);
  if (R.X_base_sel) exploratory.pathwayChain_observational = Object.fromEntries(['X_base_sel', 'X_refuge_sel', 'X_fecLock_sel'].filter(has).map((c) => [c, {
    earlyBirths_vs_preyFractionMin: S.spearmanPerm(col(R[c], (r) => r.earlyBirthRate400), col(R[c], (r) => r.ecology.preyFractionMin), { seed: 471 }),
    preyFractionMin_vs_persistence: S.spearmanPerm(col(R[c], (r) => r.ecology.preyFractionMin), col(R[c], (r) => r.persistence), { seed: 472, alternative: 'greater' }),
    earlyBirths_vs_persistence: S.spearmanPerm(col(R[c], (r) => r.earlyBirthRate400), col(R[c], (r) => r.persistence), { seed: 473, alternative: 'less' }),
    earlyPopulationMax_vs_persistence: S.spearmanPerm(col(R[c], (r) => r.ecology.earlyPopulationMax), col(R[c], (r) => r.persistence), { seed: 474, alternative: 'less' }),
    starvationShare_vs_persistence: S.spearmanPerm(col(R[c], (r) => { const t = Object.values(r.causes).reduce((a, b) => a + b, 0); return t ? r.causes.starvation / t : null; }), col(R[c], (r) => r.persistence), { seed: 475, alternative: 'less' }) }]));

  // =================== per-cell summaries: population, individual lifespan and lineage persistence, never merged ===================
  const cells = {};
  for (const [cell, rows] of Object.entries({ ...R, ...A })) {
    const causes = {}; for (const r of rows) for (const [k, v] of Object.entries(r.causes)) causes[k] = (causes[k] || 0) + v;
    const ct = Object.values(causes).reduce((a, b) => a + b, 0) || 1;
    cells[cell] = { n: rows.length, extinct: rows.filter((r) => r.extinct).length, capHit: rows.filter((r) => r.capHit).length, maxAbsEnergyResidual: Math.max(...rows.map((r) => Math.abs(r.residual))),
      population: { min: S.desc(rows.map((r) => r.popMin)), median: S.desc(rows.map((r) => r.popMedian)), max: S.desc(rows.map((r) => r.popMax)) },
      individualLifespanAllDeaths: S.desc(rows.map((r) => r.lifeMean)), lineagePersistence: S.desc(rows.map((r) => r.persistence)),
      ...Object.fromEntries(['generationTime', 'earlyBirthRate400', 'lateBirthRate', 'huntFraction', 'dormantFraction', 'preyShare', 'meanM'].map((k) => [k, S.desc(rows.map((r) => r[k]))])),
      memoryLearn: S.desc(rows.map((r) => r.loci.memoryLearn)), fecundity: S.desc(rows.map((r) => r.loci.fecundity)), metabolism: S.desc(rows.map((r) => r.loci.metabolism)),
      deathCauseShare: Object.fromEntries(Object.entries(causes).map(([k, v]) => [k, v / ct])), dormancyDominatedRuns: rows.filter((r) => r.dormantFraction > 0.5).length, runtimeMs: S.desc(rows.map((r) => r.ms)) };
  }
  const out = { generated: new Date().toISOString(), node: process.version, seeds, steps: STEPS, config: { E1, E1C, E2, E2E, E3 }, confirmatory, exploratory, cells,
    runs: R, assayRuns: A, competeRuns: C, runtime: { wallSeconds: (Date.now() - t0) / 1000, workers: nW, tasks: tasks.length } };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, 'tasks', tasks.length, 'in', out.runtime.wallSeconds.toFixed(1), 's');
  for (const [k, v] of Object.entries(confirmatory)) console.log(k.padEnd(18), 'stat', v.meanDiff?.toFixed(4), 'CI', v.ci95?.map((x) => x.toFixed(4)).join('..'), 'p', v.p?.toFixed(4), 'pHolm', v.pHolm?.toFixed(4), 'n', v.n, 'dropped', v.droppedPairs ?? 0);
});
