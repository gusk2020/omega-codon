'use strict';
// Stage 1.3 experiments. Usage: node experiments13.js [--seeds 30] [--steps 2000] [--out results13.json]
// Paired design: within an environment, every condition uses seeds 1..N, and
// the environment's own random stream (regime shifts, disasters) depends only
// on the seed, so each condition faces the same environmental history.
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const os = require('node:os');
const fs = require('node:fs');
const E = require('./engine13');

const CONDITIONS = {
  full: {},
  drift: { selection: false },
  noMemory: { memory: false },
  noSwitching: { switching: false },
  additive: { regulation: false },   // gene-regulatory network switched off: additive genotype->phenotype map
};
// Few-and-long-lived probe: which life history evolves as density and
// extrinsic mortality change ('rich' climate, resources scaled).
const SWEEP = [];
for (const resourceScale of [0.3, 1]) for (const extrinsicMortality of [0.002, 0.01, 0.05]) for (const selection of [true, false]) SWEEP.push({ resourceScale, extrinsicMortality, selection });
const LOW_SIG = [0.2, 0.05, 0.1, 0], HIGH_SIG = [1.5, 1, 0.9, 1];
function withTrait(name, value) {
  const k = E.LOCI.findIndex((l) => l[0] === name);
  const make = (w) => { const g = E.founderGenome(); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[k, w]] }); return g; };
  let lo = -40, hi = 40;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (E.develop(make(mid), E.REFERENCE_DEV).traits[k] < value) lo = mid; else hi = mid; }
  return make((lo + hi) / 2);
}
// Plasticity and mutational robustness of up to 20 evolved genomes.
function grnMetrics(genomes, regulation, seed) {
  const r = E.rng(seed), span = E.LOCI.map((l) => l[2] - l[1]), sample = [];
  for (let i = 0; i < Math.min(20, genomes.length); i++) sample.push(genomes[Math.floor(i * genomes.length / Math.min(20, genomes.length))]);
  const diff = (a, b) => a.reduce((s, v, k) => s + Math.abs(v - b[k]) / span[k], 0) / a.length;
  let plast = 0, robust = 0, tried = 0;
  for (const g of sample) {
    plast += diff(E.develop(g, LOW_SIG, regulation).traits, E.develop(g, HIGH_SIG, regulation).traits);
    const base = E.develop(g, E.REFERENCE_DEV, regulation).traits, key = JSON.stringify(g.genes);
    for (let m = 0; m < 30 && tried < 10 * sample.length; m++) {
      const h = E.mutate(g, r, 30);
      if (JSON.stringify(h.genes) === key) continue; // behaviour-circuit-only mutation: not a GRN mutation
      tried++; if (diff(base, E.develop(h, E.REFERENCE_DEV, regulation).traits) < 0.01) robust++;
    }
  }
  return { plasticity: sample.length ? plast / sample.length : null, robustness: tried ? robust / tried : null };
}
const ENVS = Object.keys(E.ENVIRONMENTS);

function compactRun(r) {
  return {
    extinct: r.extinct, extinctAt: r.extinctAt, persistence: r.lineagePersistence, capHit: r.capHit,
    popMin: r.population.min, popMedian: r.population.median, popMax: r.population.max,
    lifeMean: r.lifespan.calendarMean, lifeMedian: r.lifespan.calendarMedian, lifeMax: r.lifespan.calendarMax,
    activeMean: r.lifespan.activeMean, internalMean: r.lifespan.internalMean,
    birthsPerDeath: r.reproduction.birthsPerDeath, causes: r.deathCauses,
    intakePlant: r.energy.intakePlant, intakePrey: r.energy.intakePrey, spentBy: r.energy.spentBy, residual: r.energy.residual,
    huntSuccess: r.predation.successPerHuntStep, encounterSuccess: r.predation.successPerEncounter,
    precision: r.switching.huntPrecision, recall: r.switching.huntRecall, accuracy: r.switching.accuracy,
    sensorFP: r.switching.sensorFalsePositiveRate, sensorFN: r.switching.sensorFalseNegativeRate,
    originalAtDeath: r.cells.originalAtDeath, memoryRetention: r.cells.memoryRetentionAtDeath,
    meanM: r.final.meanM, loci: r.final.loci, modes: r.modeFractions, ms: r.elapsedMs,
    genes: r.final.meanGenes, regLinks: r.final.meanRegLinks, pleiotropy: r.final.meanPleiotropy,
    ...(r.finalGenomes.length ? grnMetrics(r.finalGenomes, r.options.regulation, r.options.seed) : { plasticity: null, robustness: null }),
  };
}

function runTask(task) {
  if (task.kind === 'main') return compactRun(E.simulate({ seed: task.seed, steps: task.steps, environment: task.env, ...CONDITIONS[task.cond] }));
  if (task.kind === 'sweep') return compactRun(E.simulate({ seed: task.seed, steps: task.steps, environment: 'rich', ...SWEEP[task.cell] }));
  // metabolism competition: identical founders except metabolism
  const low = withTrait('metabolism', 0.6), high = withTrait('metabolism', 1.2);
  const mix = E.assay([low, high], { seed: task.seed, environment: task.env, steps: 600 });
  const lowShare = mix.finalGenomes.length ? mix.finalGenomes.filter((g) => E.develop(g, E.REFERENCE_DEV).traits[0] < 0.9).length / mix.finalGenomes.length : null;
  const cl = E.assay([low], { seed: task.seed, environment: task.env, steps: 600 });
  const ch = E.assay([high], { seed: task.seed, environment: task.env, steps: 600 });
  return { lowShare, mixExtinct: mix.extinct, lowClonePop: cl.population.median, highClonePop: ch.population.median,
    lowCloneLife: cl.lifespan.calendarMean, highCloneLife: ch.lifespan.calendarMean, lowCloneExtinct: cl.extinct, highCloneExtinct: ch.extinct };
}

if (!isMainThread) {
  parentPort.on('message', (task) => parentPort.postMessage({ id: task.id, out: runTask(task) }));
  return;
}

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(arg('--seeds', 30)), STEPS = Number(arg('--steps', 2000)), OUT = arg('--out', 'results13.json');

const tasks = [];
for (const env of ENVS) for (const cond of Object.keys(CONDITIONS)) for (let s = 1; s <= SEEDS; s++) tasks.push({ id: tasks.length, kind: 'main', env, cond, seed: s, steps: STEPS });
for (const env of ENVS) for (let s = 1; s <= SEEDS; s++) tasks.push({ id: tasks.length, kind: 'metab', env, seed: 500 + s });
for (let c = 0; c < SWEEP.length; c++) for (let s = 1; s <= SEEDS; s++) tasks.push({ id: tasks.length, kind: 'sweep', cell: c, seed: 700 + s, steps: STEPS });

const t0 = Date.now();
const results = new Array(tasks.length);
let nextTask = 0, done = 0;
const nWorkers = Math.max(1, Math.min(os.cpus().length, 4));
const pool = [];
const finished = new Promise((resolve) => {
  for (let w = 0; w < nWorkers; w++) {
    const worker = new Worker(__filename);
    pool.push(worker);
    const feed = () => { if (nextTask < tasks.length) worker.postMessage(tasks[nextTask++]); };
    worker.on('message', ({ id, out }) => { results[id] = out; done++; if (done === tasks.length) resolve(); else feed(); });
    worker.on('error', (e) => { console.error(e); process.exit(1); });
    feed();
  }
});

// ---- statistics -----------------------------------------------------------
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : 0; };
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const desc = (a) => { a = a.filter((v) => v !== null && Number.isFinite(v)); return { mean: mean(a), sd: sd(a), median: median(a), min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null, n: a.length }; };
function normCdf(z) { const t = 1 / (1 + 0.2316419 * z), d = 0.3989423 * Math.exp(-z * z / 2); return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); }
// Paired comparison: mean difference with 95% CI, signs, Wilcoxon signed-rank (normal approx).
function paired(a, b) {
  const d = []; for (let i = 0; i < a.length; i++) if (a[i] !== null && b[i] !== null && Number.isFinite(a[i]) && Number.isFinite(b[i])) d.push(a[i] - b[i]);
  const nz = d.filter((v) => v !== 0), n = nz.length;
  const ranked = nz.map((v) => [Math.abs(v), Math.sign(v)]).sort((x, y) => x[0] - y[0]);
  let wPlus = 0, tie = 0;
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && ranked[j + 1][0] === ranked[i][0]) j++; const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) if (ranked[k][1] > 0) wPlus += r; const t = j - i + 1; tie += t ** 3 - t; i = j + 1; }
  const mu = n * (n + 1) / 4, sig = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tie / 48);
  const p = n && sig ? Math.min(1, 2 * (1 - normCdf(Math.abs(wPlus - mu) / sig))) : 1;
  const m = mean(d), half = d.length > 1 ? 1.96 * sd(d) / Math.sqrt(d.length) : null;
  return { meanDiff: m, ci95: half === null ? null : [m - half, m + half], positive: d.filter((v) => v > 0).length, negative: d.filter((v) => v < 0).length, n: d.length, p };
}
function fisher(a, b, c, d) {
  const lf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
  const n = a + b + c + d, r1 = a + b, c1 = a + c;
  const pr = (x) => Math.exp(lf(r1) + lf(n - r1) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(n - r1 - c1 + x));
  const obs = pr(a); let p = 0;
  for (let x = Math.max(0, c1 - (n - r1)); x <= Math.min(r1, c1); x++) { const v = pr(x); if (v <= obs * (1 + 1e-9)) p += v; }
  return Math.min(1, p);
}
function spearman(x, y) {
  const idx = []; for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i]) && Number.isFinite(y[i])) idx.push(i);
  const rank = (v) => { const o = idx.map((i) => [v[i], i]).sort((a, b) => a[0] - b[0]); const r = {}; for (let k = 0; k < o.length;) { let j = k; while (j + 1 < o.length && o[j + 1][0] === o[k][0]) j++; for (let q = k; q <= j; q++) r[o[q][1]] = (k + j) / 2 + 1; k = j + 1; } return idx.map((i) => r[i]); };
  const rx = rank(x), ry = rank(y), mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0; for (let i = 0; i < rx.length; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  const n = rx.length;
  if (!dx || !dy || n < 4) return { rho: NaN, ci95: [NaN, NaN], n };
  const rho = num / Math.sqrt(dx * dy);
  const z = 0.5 * Math.log((1 + rho) / (1 - rho)), se = Math.sqrt((1 + rho * rho / 2) / (n - 3)); // Bonett-Wright
  return { rho, ci95: [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)], n };
}
// eta^2 of a value across environments, with a permutation p-value.
function etaSquared(groups, rand) {
  const all = groups.flat(), gm = mean(all);
  const calc = (gs) => { let between = 0; for (const g of gs) between += g.length * (mean(g) - gm) ** 2; const total = all.reduce((s, v) => s + (v - gm) ** 2, 0); return total ? between / total : 0; };
  const obs = calc(groups); let ge = 0; const R = 999;
  for (let r = 0; r < R; r++) {
    const sh = all.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    let k = 0; const gs = groups.map((g) => { const out = sh.slice(k, k + g.length); k += g.length; return out; });
    if (calc(gs) >= obs) ge++;
  }
  return { eta2: obs, p: (ge + 1) / (R + 1) };
}

finished.then(() => {
  pool.forEach((w) => w.terminate());
  const main = {}, metab = {}, sweepRuns = [];
  tasks.forEach((t, i) => {
    if (t.kind === 'main') ((main[t.env] ??= {})[t.cond] ??= [])[t.seed - 1] = results[i];
    else if (t.kind === 'metab') (metab[t.env] ??= []).push(results[i]);
    else (sweepRuns[t.cell] ??= []).push(results[i]);
  });

  const KEYS = ['popMin', 'popMedian', 'popMax', 'persistence', 'lifeMean', 'lifeMedian', 'lifeMax', 'activeMean', 'internalMean', 'birthsPerDeath',
    'huntSuccess', 'encounterSuccess', 'precision', 'recall', 'accuracy', 'sensorFP', 'sensorFN', 'originalAtDeath', 'memoryRetention', 'meanM', 'genes', 'regLinks', 'pleiotropy', 'plasticity', 'robustness'];
  const table = {};
  for (const env of ENVS) for (const cond of Object.keys(CONDITIONS)) {
    const rows = main[env][cond];
    const s = { extinct: rows.filter((r) => r.extinct).length, n: rows.length, capHit: rows.filter((r) => r.capHit).length,
      maxAbsEnergyResidual: Math.max(...rows.map((r) => Math.abs(r.residual))) };
    for (const k of KEYS) s[k] = desc(rows.map((r) => r[k]));
    const causeTot = {}; for (const r of rows) for (const [c, v] of Object.entries(r.causes)) causeTot[c] = (causeTot[c] || 0) + v;
    const ct = Object.values(causeTot).reduce((a, b) => a + b, 0) || 1;
    s.deathCauseShare = Object.fromEntries(Object.entries(causeTot).map(([c, v]) => [c, v / ct]));
    const intake = rows.map((r) => r.intakePlant + r.intakePrey);
    s.preyShareOfIntake = desc(rows.map((r) => r.intakePrey / ((r.intakePlant + r.intakePrey) || 1)));
    const spentKeys = Object.keys(rows[0].spentBy);
    const sp = Object.fromEntries(spentKeys.map((k) => [k, rows.reduce((a, r) => a + r.spentBy[k], 0)]));
    const spt = Object.values(sp).reduce((a, b) => a + b, 0) || 1;
    s.spendingShare = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, v / spt]));
    s.totalIntake = desc(intake);
    s.loci = Object.fromEntries(E.LOCI.map((l) => [l[0], desc(rows.filter((r) => !r.extinct).map((r) => r.loci[l[0]]))]));
    s.modes = Object.fromEntries(Object.keys(rows[0].modes).map((m) => [m, desc(rows.map((r) => r.modes[m]))]));
    s.runtimeMs = desc(rows.map((r) => r.ms));
    (table[env] ??= {})[cond] = s;
  }

  const contrasts = {};
  const METRICS = ['popMedian', 'persistence', 'lifeMean', 'activeMean', 'internalMean', 'birthsPerDeath', 'meanM', 'originalAtDeath', 'huntSuccess', 'precision', 'plasticity', 'robustness', 'genes'];
  for (const env of ENVS) for (const cond of Object.keys(CONDITIONS)) {
    if (cond === 'full') continue;
    const A = main[env].full, B = main[env][cond], c = {};
    for (const k of METRICS) c[k] = paired(A.map((r) => r[k]), B.map((r) => r[k]));
    const ea = A.filter((r) => r.extinct).length, eb = B.filter((r) => r.extinct).length;
    c.extinction = { full: ea, other: eb, n: A.length, fisherP: fisher(ea, A.length - ea, eb, B.length - eb) };
    (contrasts[env] ??= {})['full_vs_' + cond] = c;
  }

  const prand = E.rng(424242);
  const strategy = {};
  const STRAT = [...E.LOCI.map((l) => 'locus:' + l[0]), 'mode:dormant', 'mode:hunt', 'mode:repair', 'meanM'];
  const val = (r, k) => (k.startsWith('locus:') ? r.loci[k.slice(6)] : k.startsWith('mode:') ? r.modes[k.slice(5)] : r[k]);
  for (const cond of ['full', 'drift']) for (const k of STRAT) {
    const groups = ENVS.map((env) => main[env][cond].filter((r) => !r.extinct).map((r) => val(r, k)).filter(Number.isFinite));
    (strategy[cond] ??= {})[k] = etaSquared(groups, prand);
  }
  const strategyMeans = Object.fromEntries(STRAT.map((k) => [k, Object.fromEntries(ENVS.map((env) => [env, mean(main[env].full.filter((r) => !r.extinct).map((r) => val(r, k)).filter(Number.isFinite))]))]));

  // Tradeoffs: pooled across environments (confounded by environment) and
  // within each environment (the less confounded reading), reported side by side.
  const TRADE = {
    metabolism_vs_calendarLife: [(r) => r.loci.metabolism, (r) => r.lifeMean],
    huntFraction_vs_calendarLife: [(r) => r.modes.hunt, (r) => r.lifeMean],
    huntFraction_vs_preyShare: [(r) => r.modes.hunt, (r) => r.intakePrey / (r.intakePlant + r.intakePrey)],
    replaceRatio_vs_originalCells: [(r) => r.loci.replaceRatio, (r) => r.originalAtDeath],
    replaceRatio_vs_memoryRetention: [(r) => r.loci.replaceRatio, (r) => r.memoryRetention],
    memory_vs_calendarLife: [(r) => r.meanM, (r) => r.lifeMean],
    dormancy_vs_calendarLife: [(r) => r.modes.dormant, (r) => r.lifeMean],
    fecundity_vs_calendarLife: [(r) => r.loci.fecundity, (r) => r.lifeMean],
    repairRate_vs_calendarLife: [(r) => r.loci.repairRate, (r) => r.lifeMean],
    tolerance_vs_popMedian: [(r) => r.loci.tolerance, (r) => r.popMedian],
  };
  const tradeoffs = {};
  for (const [k, [fx, fy]] of Object.entries(TRADE)) {
    const fullAll = ENVS.flatMap((env) => main[env].full.filter((r) => !r.extinct));
    const within = Object.fromEntries(ENVS.map((env) => { const rows = main[env].full.filter((r) => !r.extinct); return [env, spearman(rows.map(fx), rows.map(fy)).rho]; }));
    tradeoffs[k] = { pooled: spearman(fullAll.map(fx), fullAll.map(fy)), withinEnv: within, withinEnvMean: mean(Object.values(within).filter(Number.isFinite)) };
  }

  const metabolism = {};
  for (const env of ENVS) {
    const rows = metab[env];
    metabolism[env] = { lowShareInMix: desc(rows.map((r) => r.lowShare)), lowWinsMix: rows.filter((r) => r.lowShare !== null && r.lowShare > 0.5).length,
      lowClonePop: desc(rows.map((r) => r.lowClonePop)), highClonePop: desc(rows.map((r) => r.highClonePop)),
      clonePop_lowMinusHigh: paired(rows.map((r) => r.lowClonePop), rows.map((r) => r.highClonePop)),
      lowCloneLife: desc(rows.map((r) => r.lowCloneLife)), highCloneLife: desc(rows.map((r) => r.highCloneLife)),
      extinct: { low: rows.filter((r) => r.lowCloneExtinct).length, high: rows.filter((r) => r.highCloneExtinct).length, n: rows.length } };
  }

  const sweep = SWEEP.map((cell, c) => { const rows = sweepRuns[c];
    return { ...cell, extinct: rows.filter((r) => r.extinct).length, n: rows.length, popMedian: desc(rows.map((r) => r.popMedian)), lifeMean: desc(rows.map((r) => r.lifeMean)),
      lifeMax: desc(rows.map((r) => r.lifeMax)), activeMean: desc(rows.map((r) => r.activeMean)), birthsPerDeath: desc(rows.map((r) => r.birthsPerDeath)),
      dormant: desc(rows.map((r) => r.modes.dormant)), hunt: desc(rows.map((r) => r.modes.hunt)), preyShare: desc(rows.map((r) => r.intakePrey / ((r.intakePlant + r.intakePrey) || 1))),
      loci: Object.fromEntries(['metabolism', 'repairRate', 'fecundity', 'tolerance', 'predation', 'replaceRatio', 'memoryLearn'].map((k) => [k, desc(rows.filter((r) => !r.extinct).map((r) => r.loci[k]))])) }; });
  // life-history contrast inside the sweep, selection only: low vs high extrinsic mortality at each density
  const lifeHistory = {};
  for (const rs of [0.3, 1]) {
    const idx = (m, sel) => SWEEP.findIndex((c) => c.resourceScale === rs && c.extrinsicMortality === m && c.selection === sel);
    const lo = sweepRuns[idx(0.002, true)], hi = sweepRuns[idx(0.05, true)], loD = sweepRuns[idx(0.002, false)], hiD = sweepRuns[idx(0.05, false)];
    const L = (rows, k) => rows.map((r) => r.loci[k]);
    lifeHistory['resource' + rs] = {
      repairRate: paired(L(lo, 'repairRate'), L(hi, 'repairRate')), fecundity: paired(L(lo, 'fecundity'), L(hi, 'fecundity')), metabolism: paired(L(lo, 'metabolism'), L(hi, 'metabolism')),
      repairRate_drift: paired(L(loD, 'repairRate'), L(hiD, 'repairRate')), fecundity_drift: paired(L(loD, 'fecundity'), L(hiD, 'fecundity')),
    };
  }
  const prev = (() => { try { return require('./stage1.2/results12.json').table; } catch { return null; } })();
  const vsStage12 = prev ? Object.fromEntries(ENVS.map((env) => [env, { stage12: { popMedian: prev[env].full.popMedian.mean, lifeMean: prev[env].full.lifeMean.mean, extinct: prev[env].full.extinct },
    stage13: { popMedian: table[env].full.popMedian.mean, lifeMean: table[env].full.lifeMean.mean, extinct: table[env].full.extinct } }])) : null;
  const allMs = Object.values(main).flatMap((c) => Object.values(c).flat().map((r) => r.ms));
  const out = { generated: new Date().toISOString(), seeds: SEEDS, steps: STEPS, conditions: CONDITIONS, environments: E.ENVIRONMENTS, loci: E.LOCI,
    table, contrasts, strategy, strategyMeans, tradeoffs, metabolism, sweep, lifeHistory, vsStage12, runs: main, sweepRuns,
    runtime: { wallSeconds: (Date.now() - t0) / 1000, workers: nWorkers, perRunMs: desc(allMs) } };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('wrote', OUT, 'tasks', tasks.length, 'in', out.runtime.wallSeconds.toFixed(1), 's');
});
