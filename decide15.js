'use strict';
// Applies the pre-registered decision rule (PREREGISTRATION.md) to the primary run and the independent-seed run.
// Usage: node decide15.js results15.json results15_replication.json [--out decisions15.json]
const fs = require('node:fs');
const [a, b] = process.argv.slice(2);
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'decisions15.json';
const P = JSON.parse(fs.readFileSync(a, 'utf8')), Rp = JSON.parse(fs.readFileSync(b, 'utf8'));
const dec = {};
for (const [k, v] of Object.entries(P.primary)) {
  const r = Rp.primary[k], corr = k.startsWith('P4');
  const stat = corr ? v.rho : v.meanDiff, rstat = corr ? r.rho : r.meanDiff;
  const ciOk = corr ? v.ci95[1] < 0 : v.ci95[0] > 0;
  const holmOk = v.pHolm < 0.05;
  const dirOk = corr ? rstat < 0 : rstat > 0;
  const repOk = r.p !== null && r.p < 0.05 && dirOk;
  dec[k] = { primary: { stat, ci95: v.ci95, p: v.p, pHolm: v.pHolm, n: v.n, dz: v.dz ?? null }, replication: { stat: rstat, ci95: r.ci95, p: r.p, n: r.n, dz: r.dz ?? null },
    criteria: { holmBelow05: holmOk, ciExcludesZeroInDirection: ciOk, replicatedSameDirection: repOk }, verdict: holmOk && ciOk && repOk ? 'SUPPORTED' : 'NOT SUPPORTED (FAIL)' };
}
fs.writeFileSync(out, JSON.stringify(dec, null, 1));
for (const [k, d] of Object.entries(dec)) console.log(k.padEnd(26), d.verdict.padEnd(22), 'primary', d.primary.stat?.toFixed(4), 'CI', d.primary.ci95.map((x) => x.toFixed(4)).join('..'), 'pHolm', d.primary.pHolm.toFixed(4), '| replication', d.replication.stat?.toFixed(4), 'p', d.replication.p?.toFixed(4), JSON.stringify(d.criteria));
