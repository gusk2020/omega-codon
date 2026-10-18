'use strict';
// POST-HOC analysis (written after the results were seen; NOT pre-registered; not used for any verdict).
// Usage: node posthoc17.js  ->  posthoc17.json
const fs = require('node:fs');
const S = require('../stage1.6/stats16');
const A = JSON.parse(fs.readFileSync('results17.json', 'utf8')), B = JSON.parse(fs.readFileSync('results17_replication.json', 'utf8'));
const both = (cell) => [...A.runs[cell], ...B.runs[cell]];
const out = { posthoc: true, note: 'written after the results; exploratory; pooled seeds 1-30 and 101-130' };
const base = both('base_sel');
const rho = (xs, f, g, alt) => S.spearmanPerm(xs.map(f), xs.map(g), { seed: 11, alternative: alt });
out.PH1_baseSelected_pooled60 = {
  n: base.length,
  earlyBirthRate400_vs_preyFractionEarly: rho(base, (r) => r.earlyBirthRate400, (r) => r.preyFractionEarly),
  preyFractionEarly_vs_persistence: rho(base, (r) => r.preyFractionEarly, (r) => r.persistence),
  earlyBirthRate400_vs_persistence: rho(base, (r) => r.earlyBirthRate400, (r) => r.persistence),
  huntFraction_vs_persistence: rho(base, (r) => r.huntFraction, (r) => r.persistence) };
// PH2: birth dose response is non-monotone: pooled extinction counts and life/pop per cell
const cells = ['birth0.25', 'birth0.5', 'base_sel', 'birth2'];
out.PH2_birthDose_pooled60 = Object.fromEntries(cells.map((c) => { const r = both(c); const m = (f) => r.reduce((a, x) => a + f(x), 0) / r.length; return [c, { extinct: r.filter((x) => x.extinct).length, n: r.length, popMedian: m((x) => x.popMedian), lifeMean: m((x) => x.lifeMean), persistence: m((x) => x.persistence), preyFractionEarly: m((x) => x.preyFractionEarly), huntFraction: m((x) => x.huntFraction), birthsPerIndividualStep: m((x) => x.birthsPerIndividualStep) }]; }));
// PH3: halving capture raises extinction: is it starvation (prey fraction high, catches per individual low)?
out.PH3_capture_pooled60 = Object.fromEntries(['capture0.5', 'base_sel', 'capture2'].map((c) => { const r = both(c); const m = (f) => r.reduce((a, x) => a + f(x), 0) / r.length; return [c, { extinct: r.filter((x) => x.extinct).length, catchesPerIndividualStep: m((x) => x.catchesPerIndividualStep), preyFractionMean: m((x) => x.preyFractionMean), huntFraction: m((x) => x.huntFraction), popMedian: m((x) => x.popMedian) }]; }));
fs.writeFileSync('posthoc17.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 3500));
