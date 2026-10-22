'use strict';
// POST-HOC analysis (written after the results were seen; NOT pre-registered; not used for any verdict).
// Usage: node posthoc16.js  ->  posthoc16.json
const fs = require('node:fs');
const S = require('./stats16');
const A = JSON.parse(fs.readFileSync('results16.json', 'utf8')), B = JSON.parse(fs.readFileSync('results16_replication.json', 'utf8'));
const both = (cell, kind = 'runs') => [...A[kind][cell], ...B[kind][cell]];
const out = { posthoc: true, note: 'written after the results; exploratory; pooled over seeds 1-30 and 101-130 where stated' };

// PH1: what predicts persistence among selected lineages under pulsed supply, using measures that do not depend on how long the run lasted
const base = both('X_base_sel');
const rho = (f, g, alt) => S.spearmanPerm(base.map(f), base.map(g), { seed: 11, alternative: alt });
out.PH1_pooled60_pulsedSelected = {
  n: base.length,
  huntFraction_vs_persistence: rho((r) => r.huntFraction, (r) => r.persistence, 'less'),
  preyFractionEarly_vs_persistence: rho((r) => r.ecology.preyFractionEarly, (r) => r.persistence, 'greater'),
  earlyBirthRate400_vs_persistence: rho((r) => r.earlyBirthRate400, (r) => r.persistence, 'less'),
  earlyBirthRate400_vs_preyFractionEarly: rho((r) => r.earlyBirthRate400, (r) => r.ecology.preyFractionEarly),
  huntFraction_vs_preyFractionEarly: rho((r) => r.huntFraction, (r) => r.ecology.preyFractionEarly),
  extinctRuns: base.filter((r) => r.extinct).length,
  warning: 'preyFractionMin is NOT used: a minimum over a longer run is lower by construction, so it is confounded with run length.' };

// PH2: memory investment relative to neutral drift, when the holding cost is removed
const me = (cell) => [...A.runs[cell], ...B.runs[cell]].map((r) => r.loci.memoryLearn);
out.PH2_memoryLearn_vsDrift_pooled60 = { fullCost: S.paired(me('ME_same_full'), me('ME_same_drift'), { seed: 12 }), costFree: S.paired(me('ME_same_cost0'), me('ME_same_drift'), { seed: 13 }), benefitFree: S.paired(me('ME_same_benefit0'), me('ME_same_drift'), { seed: 14 }) };

// PH3: where the capacity-8 lineage stops winning (linear interpolation of the win rate against the holding cost, pooled)
const wr = (cell) => { const sh = [...A.competeRuns[cell], ...B.competeRuns[cell]].map((r) => r.shares[1]); return sh.filter((v) => v > 0.5).length / sh.length; };
out.PH3_breakEvenCost = {};
for (const reg of ['stable', 'p20', 'p40']) {
  const pts = [0, 1, 2, 4].map((c) => [c / 1000, wr(`H_${reg}_c${c}`)]); let be = null;
  for (let i = 0; i + 1 < pts.length; i++) if (pts[i][1] >= 0.5 && pts[i + 1][1] < 0.5) be = pts[i][0] + (pts[i][1] - 0.5) / (pts[i][1] - pts[i + 1][1]) * (pts[i + 1][0] - pts[i][0]);
  out.PH3_breakEvenCost[reg] = { winRate: Object.fromEntries(pts.map(([c, w]) => [c, w])), costAtWinRateHalf: be, n: 60 };
}

// PH4: how much of the evolution run was left when the lineage died (observation period vs extinction)
out.PH4_survivalByStep = {};
for (const cell of ['E1_S16F4_p20_sel', 'E1_S16F4_p20_drift', 'E1_S1F1_p20_sel']) {
  const rs = both(cell); out.PH4_survivalByStep[cell] = { n: rs.length, aliveAt2000: rs.filter((r) => r.persistence > 2000).length, aliveAt4000: rs.filter((r) => r.persistence > 4000).length, aliveAt6000: rs.filter((r) => !r.extinct).length,
    capacityAmongLiveAt6000: S.desc(rs.filter((r) => !r.extinct).map((r) => r.storage6000.capacity)) };
}
// PH5: the refuge also raised the population six-fold, so it is a food subsidy as well as a protection of prey
const pop = (cell) => both(cell).map((r) => r.popMedian);
out.PH5_refuge_isAlsoSubsidy = { popMedianBaseline: S.desc(pop('X_base_sel')), popMedianRefuge: S.desc(pop('X_refuge_sel')), preyShareOfIntake: { baseline: S.desc(both('X_base_sel').map((r) => r.preyShare)), refuge: S.desc(both('X_refuge_sel').map((r) => r.preyShare)) } };
fs.writeFileSync('posthoc16.json', JSON.stringify(out, null, 1));
const f = (v) => (v == null || Number.isNaN(v) ? '-' : Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(1));
for (const [k, v] of Object.entries(out.PH1_pooled60_pulsedSelected)) if (v && v.rho !== undefined) console.log('PH1', k.padEnd(40), 'rho', f(v.rho), 'CI', v.ci95.map(f).join('..'), 'p', f(v.p));
for (const [k, v] of Object.entries(out.PH2_memoryLearn_vsDrift_pooled60)) console.log('PH2', k.padEnd(12), f(v.meanDiff), v.ci95.map(f).join('..'));
for (const [k, v] of Object.entries(out.PH3_breakEvenCost)) console.log('PH3', k, JSON.stringify(v.winRate), 'cost at 50% wins', v.costAtWinRateHalf == null ? '-' : v.costAtWinRateHalf.toFixed(5));
for (const [k, v] of Object.entries(out.PH4_survivalByStep)) console.log('PH4', k, JSON.stringify({ n: v.n, a2000: v.aliveAt2000, a4000: v.aliveAt4000, a6000: v.aliveAt6000, cap6000live: f(v.capacityAmongLiveAt6000.mean) }));
console.log('PH5 pop baseline', f(out.PH5_refuge_isAlsoSubsidy.popMedianBaseline.mean), 'refuge', f(out.PH5_refuge_isAlsoSubsidy.popMedianRefuge.mean));
