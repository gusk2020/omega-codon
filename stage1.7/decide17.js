'use strict';
// Applies the pre-registered decision rule (PREREGISTRATION.md) to the primary and the independent-seed run.
// Usage: node decide17.js results17.json results17_replication.json [--out decisions17.json]
const fs = require('node:fs');
const [a, b] = process.argv.slice(2);
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'decisions17.json';
const A = JSON.parse(fs.readFileSync(a, 'utf8')), B = JSON.parse(fs.readFileSync(b, 'utf8'));
const neg = (o) => o.meanDiff < 0 && o.ci95[1] < 0, pos = (o) => o.meanDiff > 0 && o.ci95[0] > 0;
const M = {
  M1: (m) => neg(m.M1_births.low) && pos(m.M1_births.high),
  M2: (m) => neg(m.M2_predation.low),
  M3: (m) => pos(m.M3_preyRecovery.high),
  M4: (m) => m.M4_protectionOnly.minPreyFractionMin >= 0.3 - 1e-9 && m.M4_protectionOnly.maxFloorAdded === 0,
  M5: (m) => pos(m.M5_foodOnly.caught_vs_base) && m.M5_foodOnly.maxFloorAdded === 0,
};
const checks = Object.fromEntries(Object.keys(M).map((k) => [k, { primary: M[k](A.manipulationChecks), replication: M[k](B.manipulationChecks) }]));
const prey = (m) => pos(m.birthsToPrey.halved) && neg(m.birthsToPrey.doubled);
const dec = {};
for (const [k, v] of Object.entries(A.confirmatory)) {
  const r = B.confirmatory[k], chk = v.check, chkOk = checks[chk].primary && checks[chk].replication;
  const holmOk = v.pHolm < 0.05, ciOk = v.ci95 !== null && v.ci95[0] > 0, repOk = r.p !== null && r.p < 0.05 && r.meanDiff > 0;
  dec[k] = { endpoint: v.endpoint, extinctionCountsFirstVsSecond_inComparisonOrder: { primary: [v.mcnemar.eventsA, v.mcnemar.eventsB, v.mcnemar.pairs], replication: [r.mcnemar.eventsA, r.mcnemar.eventsB, r.mcnemar.pairs] },
    primary: { reduction: v.meanDiff, ci95: v.ci95, p: v.p, pHolm: v.pHolm, n: v.n }, replication: { reduction: r.meanDiff, ci95: r.ci95, p: r.p, n: r.n },
    manipulationCheck: { id: chk, primary: checks[chk].primary, replication: checks[chk].replication },
    criteria: { holmBelow05: holmOk, ciLowerAboveZero: ciOk, replicatedSameDirection: repOk, manipulationCheckPassed: chkOk }, verdict: holmOk && ciOk && repOk && chkOk ? 'SUPPORTED' : 'NOT SUPPORTED (FAIL)' };
}
const sup = (k) => dec[k].verdict === 'SUPPORTED';
const positiveControl = { primary: pos(A.manipulationChecks.positiveControl_refuge.extinct), replication: pos(B.manipulationChecks.positiveControl_refuge.extinct) };
const verdicts = {
  positiveControlSensitive: positiveControl.primary && positiveControl.replication,
  shortTermReproductionIsACause: sup('P3_birthsHalved') && sup('P4_birthsDoubled') && prey(A.manipulationChecks) && prey(B.manipulationChecks) ? 'SUPPORTED' : 'UNPROVEN',
  refugeEffect: { protectionAlone: sup('P1_protectionOnly') ? 'sufficient' : 'not shown', foodAlone: sup('P2_foodOnly') ? 'sufficient' : 'not shown' },
  predationIntensityIsACause: sup('P5_captureHalved') ? 'SUPPORTED' : 'UNPROVEN', preyRecoveryIsACause: sup('P6_preyGrowthTripled') ? 'SUPPORTED' : 'UNPROVEN',
  birthsMovedPreyInExpectedDirection: { primary: prey(A.manipulationChecks), replication: prey(B.manipulationChecks) } };
fs.writeFileSync(out, JSON.stringify({ checks, positiveControl, hypotheses: dec, verdicts }, null, 1));
console.log('manipulation checks', JSON.stringify(checks));
for (const [k, d] of Object.entries(dec)) console.log(k.padEnd(22), d.verdict.padEnd(22), 'ext(first,second)', JSON.stringify(d.extinctionCountsFirstVsSecond_inComparisonOrder.primary.slice(0, 2)), JSON.stringify(d.extinctionCountsFirstVsSecond_inComparisonOrder.replication.slice(0, 2)), 'reduction', d.primary.reduction?.toFixed(3), 'CI', d.primary.ci95?.map((x) => x.toFixed(3)).join('..'), 'pHolm', d.primary.pHolm.toFixed(4), '| repl', d.replication.reduction?.toFixed(3), 'p', d.replication.p?.toFixed(4), JSON.stringify(d.criteria));
console.log('verdicts', JSON.stringify(verdicts));
