'use strict';
// Applies the pre-registered decision rule (PREREGISTRATION.md) to the primary run and the independent-seed run.
// Usage: node decide16.js results16.json results16_replication.json [--out decisions16.json]
const fs = require('node:fs');
const [a, b] = process.argv.slice(2);
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'decisions16.json';
const P = JSON.parse(fs.readFileSync(a, 'utf8')).confirmatory, Rp = JSON.parse(fs.readFileSync(b, 'utf8')).confirmatory;
const dec = {};
for (const [k, v] of Object.entries(P)) {
  const r = Rp[k];
  const holmOk = v.pHolm < 0.05, ciOk = v.ci95 !== null && v.ci95[0] > 0, repOk = r.p !== null && r.p < 0.05 && r.meanDiff > 0;
  dec[k] = { endpoint: v.endpoint, primary: { effect: v.meanDiff, ci95: v.ci95, p: v.p, pHolm: v.pHolm, n: v.n, dz: v.dz ?? null }, replication: { effect: r.meanDiff, ci95: r.ci95, p: r.p, n: r.n, dz: r.dz ?? null },
    criteria: { holmBelow05: holmOk, ciLowerAboveZero: ciOk, replicatedSameDirection: repOk }, verdict: holmOk && ciOk && repOk ? 'SUPPORTED' : 'NOT SUPPORTED (FAIL)' };
}
fs.writeFileSync(out, JSON.stringify(dec, null, 1));
for (const [k, d] of Object.entries(dec)) console.log(k.padEnd(18), d.verdict.padEnd(22), 'primary', d.primary.effect?.toFixed(4), 'CI', d.primary.ci95?.map((x) => x.toFixed(4)).join('..'), 'pHolm', d.primary.pHolm.toFixed(4), '| replication', d.replication.effect?.toFixed(4), 'p', d.replication.p?.toFixed(4), JSON.stringify(d.criteria));
