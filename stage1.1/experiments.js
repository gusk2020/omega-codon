'use strict';
// Stage 1.1 experiments: 30 seeds per condition, ablations, holdout assays.
// Usage: node experiments.js [--seeds 30] [--out results.json]
const fs = require('node:fs');
const E = require('./engine');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = Number(arg('--seeds', 30));
const OUT = arg('--out', 'results.json');
const STEPS = 2000;
const ASSAY_STEPS = 600;
const T = E.CHANNELS;

// ---- statistics ----------------------------------------------------------
const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const ci95 = (a) => 1.96 * sd(a) / Math.sqrt(a.length || 1);
const cohenD = (a, b) => { const s = Math.sqrt((sd(a) ** 2 + sd(b) ** 2) / 2); return s ? (mean(a) - mean(b)) / s : 0; };
// Two-sided Mann-Whitney U with normal approximation and tie correction.
function mannWhitney(a, b) {
  const all = a.map((v) => [v, 0]).concat(b.map((v) => [v, 1])).sort((x, y) => x[0] - y[0]);
  const ranks = new Array(all.length);
  let tie = 0;
  for (let i = 0; i < all.length;) {
    let j = i; while (j + 1 < all.length && all[j + 1][0] === all[i][0]) j++;
    const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) ranks[k] = r;
    const tn = j - i + 1; tie += tn ** 3 - tn; i = j + 1;
  }
  let ra = 0; for (let k = 0; k < all.length; k++) if (all[k][1] === 0) ra += ranks[k];
  const n1 = a.length, n2 = b.length, U = ra - n1 * (n1 + 1) / 2, mu = n1 * n2 / 2;
  const N = n1 + n2, sigma = Math.sqrt(n1 * n2 / 12 * ((N + 1) - tie / (N * (N - 1))));
  if (!sigma) return 1;
  const z = Math.abs(U - mu) / sigma;
  return Math.min(1, 2 * (1 - normCdf(z)));
}
function normCdf(z) { // Abramowitz-Stegun 26.2.17
  const t = 1 / (1 + 0.2316419 * z), d = 0.3989423 * Math.exp(-z * z / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
}
const compare = (a, b) => ({ meanA: mean(a), meanB: mean(b), d: cohenD(a, b), p: mannWhitney(a, b) });
const desc = (a) => ({ mean: mean(a), sd: sd(a), ci95: ci95(a), min: Math.min(...a), max: Math.max(...a), n: a.length });

const t0 = Date.now();
const runtimes = [];
function run(opts) { const r = E.simulate(opts); runtimes.push(r.elapsedMs); return r; }
function sampleGenomes(r, k = 100) {
  const g = r.finalGenomes; if (!g.length) return null;
  const out = []; for (let i = 0; i < k; i++) out.push(g[Math.floor(i * g.length / k)]); return out;
}
const founderSet = [E.founderGenome()];

// ---- Experiment A: selection x variability x interactions ---------------
const ASSAY_ENVS = { train: 'temperate', holdoutCold: 'cold', holdoutPlague: 'plague', holdoutBrink: 'brink' };
const A = [];
const founderAssay = {};
for (const [k, env] of Object.entries(ASSAY_ENVS)) {
  const rows = [];
  for (let s = 1; s <= SEEDS; s++) rows.push(E.assay(founderSet, { seed: 10000 + s, environment: env, variable: false, steps: ASSAY_STEPS }));
  founderAssay[k] = rows;
}
for (const selection of [true, false]) for (const variable of [false, true]) for (const interactions of [true, false]) {
  const rows = [];
  for (let s = 1; s <= SEEDS; s++) {
    const r = run({ seed: s, steps: STEPS, environment: 'temperate', selection, variable, interactions });
    const h = r.summary;
    const row = { seed: s, extinct: r.extinct, finalPopulation: r.finalPopulation, capHit: r.capHit,
      lifespan: r.meanLifespanAll, genes: h.meanGenes, edges: h.meanEdges, diversity: h.diversity, traits: h.traits, assays: {} };
    const g = sampleGenomes(r);
    for (const [k, env] of Object.entries(ASSAY_ENVS)) {
      // Assays always express the genotype (selection on) so that a drift
      // lineage is judged by what its genome would actually do.
      row.assays[k] = g ? E.assay(g, { seed: 10000 + s, environment: env, variable: false, steps: ASSAY_STEPS, interactions }) : null;
    }
    rows.push(row);
  }
  A.push({ selection, variable, interactions, rows });
}

function summariseA(c) {
  const live = c.rows.filter((r) => !r.extinct);
  const out = { selection: c.selection, variable: c.variable, interactions: c.interactions,
    extinct: c.rows.filter((r) => r.extinct).length, capHit: c.rows.filter((r) => r.capHit).length,
    finalPopulation: desc(c.rows.map((r) => r.finalPopulation)), lifespan: desc(live.map((r) => r.lifespan)),
    genes: desc(live.map((r) => r.genes)), edges: desc(live.map((r) => r.edges)), traits: {}, assays: {} };
  T.forEach((name, i) => { out.traits[name] = desc(live.map((r) => r.traits[i])); });
  for (const k of Object.keys(ASSAY_ENVS)) {
    const a = live.map((r) => r.assays[k]);
    out.assays[k] = { meanPopulation: desc(a.map((x) => x.meanPopulation)), extinct: a.filter((x) => x.extinct).length };
  }
  return out;
}
const summaryA = A.map(summariseA);
const founderSummary = {};
for (const k of Object.keys(ASSAY_ENVS)) founderSummary[k] = { meanPopulation: desc(founderAssay[k].map((x) => x.meanPopulation)), extinct: founderAssay[k].filter((x) => x.extinct).length };

// Contrasts on assay performance.
const pick = (sel, vari, inter) => A.find((c) => c.selection === sel && c.variable === vari && c.interactions === inter);
const assayVals = (c, k) => c.rows.filter((r) => !r.extinct).map((r) => r.assays[k].meanPopulation);
const founderVals = (k) => founderAssay[k].map((x) => x.meanPopulation);
const contrasts = {};
for (const k of Object.keys(ASSAY_ENVS)) {
  contrasts[k] = {
    selectionVsDrift_variable: compare(assayVals(pick(true, true, true), k), assayVals(pick(false, true, true), k)),
    selectionVsDrift_fixed: compare(assayVals(pick(true, false, true), k), assayVals(pick(false, false, true), k)),
    selectionVsFounder_variable: compare(assayVals(pick(true, true, true), k), founderVals(k)),
    driftVsFounder_variable: compare(assayVals(pick(false, true, true), k), founderVals(k)),
    variableVsFixed_selection: compare(assayVals(pick(true, true, true), k), assayVals(pick(true, false, true), k)),
    interactionsOnVsOff_variable: compare(assayVals(pick(true, true, true), k), assayVals(pick(true, true, false), k)),
  };
}
// Trait-change magnitude: distance of genotype traits from the founder.
const founderTraits = E.genotypeTraits(E.founderGenome());
const traitShift = (c) => c.rows.filter((r) => !r.extinct).map((r) => Math.hypot(...r.traits.map((v, i) => v - founderTraits[i])));
contrasts.traitShift_selectionVsDrift = compare(traitShift(pick(true, true, true)), traitShift(pick(false, true, true)));
// Independent trajectories: between-seed spread of the trait vector.
const spread = (c) => { const live = c.rows.filter((r) => !r.extinct); return T.map((_, i) => sd(live.map((r) => r.traits[i]))); };
const trajectories = { selectionVariable: spread(pick(true, true, true)), driftVariable: spread(pick(false, true, true)) };

// ---- Experiment B: life history under extrinsic mortality ---------------
const B = {};
for (const [label, m] of [['lowMortality', 0.005], ['highMortality', 0.08]]) for (const selection of [true, false]) {
  const rows = [];
  for (let s = 1; s <= SEEDS; s++) {
    const r = run({ seed: 2000 + s, steps: STEPS, environment: 'temperate', variable: false, extrinsicMortality: m, selection });
    const g = sampleGenomes(r);
    // Common garden with NO extrinsic mortality: what lifespan is intrinsic?
    const a = g ? E.assay(g, { seed: 20000 + s, environment: 'temperate', variable: false, steps: ASSAY_STEPS, extrinsicMortality: 0 }) : null;
    rows.push({ extinct: r.extinct, traits: r.summary.traits, intrinsicLifespan: a ? a.meanLifespan : null, birthsPerCapita: a ? a.totalBirths / Math.max(1, a.meanPopulation) / ASSAY_STEPS : null });
  }
  B[label + (selection ? '' : '_drift')] = rows;
}
const bcol = (rows, f) => rows.filter((r) => !r.extinct && r.intrinsicLifespan != null).map(f);
const lifeHistory = {};
for (const [k, rows] of Object.entries(B)) lifeHistory[k] = {
  intrinsicLifespan: desc(bcol(rows, (r) => r.intrinsicLifespan)),
  repair: desc(bcol(rows, (r) => r.traits[1])), fecundity: desc(bcol(rows, (r) => r.traits[4])),
  birthsPerCapitaStep: desc(bcol(rows, (r) => r.birthsPerCapita)) };
lifeHistory.contrast = {
  intrinsicLifespan: compare(bcol(B.lowMortality, (r) => r.intrinsicLifespan), bcol(B.highMortality, (r) => r.intrinsicLifespan)),
  repair: compare(bcol(B.lowMortality, (r) => r.traits[1]), bcol(B.highMortality, (r) => r.traits[1])),
  fecundity: compare(bcol(B.lowMortality, (r) => r.traits[4]), bcol(B.highMortality, (r) => r.traits[4])),
  intrinsicLifespan_drift: compare(bcol(B.lowMortality_drift, (r) => r.intrinsicLifespan), bcol(B.highMortality_drift, (r) => r.intrinsicLifespan)),
};

// ---- Experiment C: survival is not guaranteed ---------------------------
const C = {};
for (const [label, opts] of [
  ['brink_selection', { environment: 'brink', variable: true, selection: true }],
  ['brink_drift', { environment: 'brink', variable: true, selection: false }],
  ['brink_fixed_selection', { environment: 'brink', variable: false, selection: true }],
  ['rich_then_brink', { environment: 'rich', variable: true, selection: true, shift: { at: 1000, environment: 'brink' } }],
  ['rich_no_shift', { environment: 'rich', variable: true, selection: true }],
]) {
  const rows = [];
  for (let s = 1; s <= SEEDS; s++) { const r = run({ seed: 3000 + s, steps: STEPS, ...opts }); rows.push({ extinct: r.extinct, extinctAt: r.extinctAt, finalPopulation: r.finalPopulation }); }
  C[label] = { extinct: rows.filter((r) => r.extinct).length, n: rows.length,
    extinctAt: rows.filter((r) => r.extinct).map((r) => r.extinctAt), finalPopulation: desc(rows.map((r) => r.finalPopulation)) };
}

const results = {
  generated: new Date().toISOString(), seeds: SEEDS, steps: STEPS, assaySteps: ASSAY_STEPS,
  defaults: E.DEFAULTS, environments: E.ENVIRONMENTS, founderTraits,
  experimentA: summaryA, founderAssay: founderSummary, contrasts, trajectories,
  lifeHistory, survival: C,
  runtime: { totalSeconds: (Date.now() - t0) / 1000, runs: runtimes.length, perRunMs: desc(runtimes) },
};
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log('wrote', OUT, 'in', results.runtime.totalSeconds.toFixed(1), 's');
