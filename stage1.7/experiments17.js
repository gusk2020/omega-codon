'use strict';
// Stage 1.7 experiments. Usage: node experiments17.js [--seeds 30] [--seed0 1] [--scale 1] [--out results17.json]
// Hypotheses P1-P6, manipulation checks M1-M5 and the decision rule are fixed in PREREGISTRATION.md before any result.
const { Worker, isMainThread, parentPort } = require('node:worker_threads');
const os = require('node:os');
const fs = require('node:fs');
const E = require('./engine17');
const S = require('../stage1.6/stats16');

const BASE = { environment: 'rich', resourceRegime: { period: 20, pulseLength: 4 } };
const CELLS = {
  base_sel: {}, base_drift: { selection: false },
  refuge_floor: { preyRefuge: 0.3 },                              // positive control (protection AND food, as in Stage 1.6)
  hidden30: { preyHidden: 0.3 },                                  // protection only
  inflow194: { preyInflow: 0.194 }, inflow065: { preyInflow: 0.065 }, inflow020: { preyInflow: 0.02 }, // food only (0.194 = what the floor supplied)
  'birth0.25': { birthScale: 0.25 }, 'birth0.5': { birthScale: 0.5 }, birth2: { birthScale: 2 },
  'capture0.5': { captureScale: 0.5 }, capture2: { captureScale: 2 },
  'growth0.5': { preyGrowthScale: 0.5 }, growth3: { preyGrowthScale: 3 },
};
const STEPS = 2000;

function lastAlive(r) { for (let i = r.history.length - 1; i >= 0; i--) if (r.history[i].population > 0) return r.history[i]; return r.history[0]; }
function runTask(t) {
  const o = { seed: t.seed, steps: t.steps, ...BASE, ...CELLS[t.cell] };
  const r = E.simulate(o), h = lastAlive(r), tot = r.energy.intakePlant + r.energy.intakePrey, eco = r.ecology;
  return { extinct: r.extinct, extinctAt: r.extinctAt, persistence: r.lineagePersistence, popMin: r.population.min, popMedian: r.population.median, popMax: r.population.max,
    lifeMean: r.lifespan.calendarMean, activeMean: r.lifespan.activeMean, generationTime: r.reproduction.generationTime, earlyBirthRate400: r.reproduction.earlyBirthRate400,
    birthsPerIndividualStep: eco.birthsPerIndividualStep, catchesPerIndividualStep: eco.catchesPerIndividualStep, preyProducedPerPatchStep: eco.preyProducedPerPatchStep,
    preyCaughtPerPatchStep: eco.preyCaughtPerPatchStep, preyFloorAddedPerPatchStep: eco.preyFloorAddedPerPatchStep,
    preyFractionEarly: eco.preyFractionEarly, preyFractionMin: eco.preyFractionMin, preyFractionMean: eco.preyFractionMean, earlyPopulationMax: eco.earlyPopulationMax,
    huntFraction: r.modeFractions.hunt, dormantFraction: r.modeFractions.dormant, preyShare: tot ? r.energy.intakePrey / tot : null, loci: h.loci, causes: r.deathCauses,
    residual: r.energy.residual, capHit: r.capHit, ms: r.elapsedMs };
}
if (!isMainThread) { parentPort.on('message', (t) => parentPort.postMessage({ id: t.id, out: runTask(t) })); return; }

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SCALE = Number(arg('--scale', 1)), SEEDS = Number(arg('--seeds', 30)), SEED0 = Number(arg('--seed0', 1)), OUT = arg('--out', 'results17.json');
const seeds = Array.from({ length: SEEDS }, (_, i) => SEED0 + i);
const tasks = [];
for (const cell of Object.keys(CELLS)) for (const seed of seeds) tasks.push({ id: tasks.length, cell, seed, steps: Math.max(60, Math.round(STEPS * SCALE)) });
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
  const R = {}; tasks.forEach((t, i) => { (R[t.cell] ??= [])[seeds.indexOf(t.seed)] = results[i]; });
  const col = (cell, f) => R[cell].map((r) => f(r));
  const ext = (cell) => col(cell, (r) => r.extinct);
  const P = (a, b, f, seed = 7, opts = {}) => S.paired(col(a, f), col(b, f), { seed, ...opts });

  // ============ CONFIRMATORY ============
  const confirmatory = {
    P1_protectionOnly: { endpoint: 'extinct share, base minus hidden30 (prey protection only, no food added)', check: 'M4', ...S.eventReduction(ext('base_sel'), ext('hidden30'), 501) },
    P2_foodOnly: { endpoint: 'extinct share, base minus inflow194 (food only, no protection)', check: 'M5', ...S.eventReduction(ext('base_sel'), ext('inflow194'), 502) },
    P3_birthsHalved: { endpoint: 'extinct share, base minus birthScale 0.5', check: 'M1', ...S.eventReduction(ext('base_sel'), ext('birth0.5'), 503) },
    P4_birthsDoubled: { endpoint: 'extinct share, birthScale 2 minus base (more births -> more extinction)', check: 'M1', ...S.eventReduction(ext('birth2'), ext('base_sel'), 504) },
    P5_captureHalved: { endpoint: 'extinct share, base minus captureScale 0.5', check: 'M2', ...S.eventReduction(ext('base_sel'), ext('capture0.5'), 505) },
    P6_preyGrowthTripled: { endpoint: 'extinct share, base minus preyGrowthScale 3', check: 'M3', ...S.eventReduction(ext('base_sel'), ext('growth3'), 506) },
  };
  const keys = Object.keys(confirmatory), adj = S.holm(keys.map((k) => confirmatory[k].p ?? 1));
  keys.forEach((k, i) => { confirmatory[k].pHolm = adj[i]; });
  // manipulation checks: raw paired contrasts against the same-seed baseline (the pass/fail reading is done in decide17.js)
  const checks = {
    M1_births: { low: P('birth0.5', 'base_sel', (r) => r.birthsPerIndividualStep, 511), high: P('birth2', 'base_sel', (r) => r.birthsPerIndividualStep, 512) },
    M2_predation: { low: P('capture0.5', 'base_sel', (r) => r.catchesPerIndividualStep, 513), high: P('capture2', 'base_sel', (r) => r.catchesPerIndividualStep, 514) },
    M3_preyRecovery: { high: P('growth3', 'base_sel', (r) => r.preyProducedPerPatchStep, 515), low: P('growth0.5', 'base_sel', (r) => r.preyProducedPerPatchStep, 516) },
    M4_protectionOnly: { minPreyFractionMin: Math.min(...col('hidden30', (r) => r.preyFractionMin)), maxFloorAdded: Math.max(...col('hidden30', (r) => r.preyFloorAddedPerPatchStep)),
      preyFractionMin_vs_base: P('hidden30', 'base_sel', (r) => r.preyFractionMin, 517) },
    M5_foodOnly: { caught_vs_base: P('inflow194', 'base_sel', (r) => r.preyCaughtPerPatchStep, 518), maxFloorAdded: Math.max(...col('inflow194', (r) => r.preyFloorAddedPerPatchStep)) },
    positiveControl_refuge: { extinct: S.eventReduction(ext('base_sel'), ext('refuge_floor'), 519), floorAddedMean: S.desc(col('refuge_floor', (r) => r.preyFloorAddedPerPatchStep)).mean },
  };
  // the births -> prey chain: does changing births move the early prey fraction in the expected direction?
  checks.birthsToPrey = { halved: P('birth0.5', 'base_sel', (r) => r.preyFractionEarly, 520), doubled: P('birth2', 'base_sel', (r) => r.preyFractionEarly, 521) };

  // ============ EXPLORATORY (unadjusted) ============
  // a = baseline, b = intervention. extinction: share(a) - share(b), so a positive value means the intervention REDUCES extinction.
  // every other metric is reported as intervention minus baseline.
  const view = (a, b) => ({ extinction: S.eventReduction(ext(a), ext(b), 531), extinctionTwoSided: S.mcnemarExact(ext(a), ext(b)),
    persistenceRMST: P(b, a, (r) => r.persistence, 532), lifespanAllDeaths: P(b, a, (r) => r.lifeMean, 533), popMedian: P(b, a, (r) => r.popMedian, 534),
    preyFractionEarly: P(b, a, (r) => r.preyFractionEarly, 535), preyFractionMean: P(b, a, (r) => r.preyFractionMean, 536), huntFraction: P(b, a, (r) => r.huntFraction, 537),
    birthsPerIndividualStep: P(b, a, (r) => r.birthsPerIndividualStep, 538), catchesPerIndividualStep: P(b, a, (r) => r.catchesPerIndividualStep, 539), preyProducedPerPatchStep: P(b, a, (r) => r.preyProducedPerPatchStep, 540),
    preyCaughtPerPatchStep: P(b, a, (r) => r.preyCaughtPerPatchStep, 541), earlyPopulationMax: P(b, a, (r) => r.earlyPopulationMax, 542) });
  const exploratory = { interventionsVsBase: {}, doseResponse: {} };
  for (const c of Object.keys(CELLS)) if (c !== 'base_sel') exploratory.interventionsVsBase[c] = view('base_sel', c);   
  exploratory.doseResponse = {
    foodInflow: Object.fromEntries(['base_sel', 'inflow020', 'inflow065', 'inflow194'].map((c) => [c, { extinct: R[c].filter((r) => r.extinct).length, popMedian: S.desc(col(c, (r) => r.popMedian)).mean }])),
    births: Object.fromEntries(['birth0.25', 'birth0.5', 'base_sel', 'birth2'].map((c) => [c, { extinct: R[c].filter((r) => r.extinct).length, birthsPerIndividualStep: S.desc(col(c, (r) => r.birthsPerIndividualStep)).mean, preyFractionEarly: S.desc(col(c, (r) => r.preyFractionEarly)).mean }])),
    capture: Object.fromEntries(['capture0.5', 'base_sel', 'capture2'].map((c) => [c, { extinct: R[c].filter((r) => r.extinct).length, catchesPerIndividualStep: S.desc(col(c, (r) => r.catchesPerIndividualStep)).mean, huntFraction: S.desc(col(c, (r) => r.huntFraction)).mean }])),
    preyGrowth: Object.fromEntries(['growth0.5', 'base_sel', 'growth3'].map((c) => [c, { extinct: R[c].filter((r) => r.extinct).length, preyProducedPerPatchStep: S.desc(col(c, (r) => r.preyProducedPerPatchStep)).mean }])),
  };
  // across interventions: does a change in the early prey fraction go with a change in lineage persistence? (observational; not causal evidence)
  const dPrey = [], dPers = [];
  for (const c of Object.keys(CELLS)) if (c !== 'base_sel' && c !== 'base_drift') for (let i = 0; i < seeds.length; i++) { dPrey.push(R[c][i].preyFractionEarly - R.base_sel[i].preyFractionEarly); dPers.push(R[c][i].persistence - R.base_sel[i].persistence); }
  exploratory.preyChangeVsPersistenceChange = { points: dPrey.length, ...S.spearmanPerm(dPrey, dPers, { seed: 551, alternative: 'greater' }) };

  // ============ per-cell summaries: population, individual lifespan, lineage persistence and extinction, never merged ============
  const cells = {};
  for (const [cell, rows] of Object.entries(R)) {
    const causes = {}; for (const r of rows) for (const [k, v] of Object.entries(r.causes)) causes[k] = (causes[k] || 0) + v;
    const ct = Object.values(causes).reduce((a, b) => a + b, 0) || 1;
    cells[cell] = { n: rows.length, extinct: rows.filter((r) => r.extinct).length, capHit: rows.filter((r) => r.capHit).length, maxAbsEnergyResidual: Math.max(...rows.map((r) => Math.abs(r.residual))),
      population: { min: S.desc(rows.map((r) => r.popMin)), median: S.desc(rows.map((r) => r.popMedian)), max: S.desc(rows.map((r) => r.popMax)) },
      individualLifespanAllDeaths: S.desc(rows.map((r) => r.lifeMean)), lineagePersistence: S.desc(rows.map((r) => r.persistence)),
      ...Object.fromEntries(['birthsPerIndividualStep', 'catchesPerIndividualStep', 'preyProducedPerPatchStep', 'preyCaughtPerPatchStep', 'preyFloorAddedPerPatchStep', 'preyFractionEarly', 'preyFractionMean', 'earlyPopulationMax', 'earlyBirthRate400', 'generationTime', 'huntFraction', 'dormantFraction', 'preyShare'].map((k) => [k, S.desc(rows.map((r) => r[k]))])),
      deathCauseShare: Object.fromEntries(Object.entries(causes).map(([k, v]) => [k, v / ct])), dormancyDominatedRuns: rows.filter((r) => r.dormantFraction > 0.5).length, runtimeMs: S.desc(rows.map((r) => r.ms)) };
  }
  const out = { generated: new Date().toISOString(), node: process.version, seeds, steps: STEPS * SCALE, config: { BASE, CELLS }, confirmatory, manipulationChecks: checks, exploratory, cells, runs: R, runtime: { wallSeconds: (Date.now() - t0) / 1000, workers: nW, tasks: tasks.length } };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log('wrote', OUT, 'tasks', tasks.length, 'in', out.runtime.wallSeconds.toFixed(1), 's');
  for (const [k, v] of Object.entries(confirmatory)) console.log(k.padEnd(22), 'reduction', v.meanDiff?.toFixed(4), 'CI', v.ci95?.map((x) => x.toFixed(4)).join('..'), 'p', v.p?.toFixed(4), 'pHolm', v.pHolm?.toFixed(4), 'ext', v.mcnemar.eventsA + '/' + v.mcnemar.eventsB);
});
