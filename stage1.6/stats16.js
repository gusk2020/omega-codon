'use strict';
// Stage 1.6 statistics: Stage 1.5's plus a one-sample test, a one-sided exact McNemar test and a paired
// binary-difference summary. Every comparison keeps the paired-seed design.
const S = require('../stats15');

// Paired test of values against a constant (e.g. a share against 0.5).
function oneSample(values, mu, opts) { return { ...S.pairedTest(values.filter(S.finite).map((v) => v - mu), opts), droppedPairs: values.filter((v) => !S.finite(v)).length }; }

function logChoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
// Exact one-sided McNemar test for paired binary outcomes: H1 = condition A has the event more often than B.
// aOnly = pairs where only A had the event, bOnly = only B. p = P(X >= aOnly), X ~ Binomial(aOnly + bOnly, 1/2).
function mcnemarOneSided(xA, xB) {
  let aOnly = 0, bOnly = 0, both = 0;
  for (let i = 0; i < xA.length; i++) { if (xA[i] && !xB[i]) aOnly++; else if (!xA[i] && xB[i]) bOnly++; else if (xA[i]) both++; }
  const n = aOnly + bOnly; let p = 1;
  if (n) { p = 0; for (let k = aOnly; k <= n; k++) p += Math.exp(logChoose(n, k) - n * Math.LN2); p = Math.min(1, p); }
  return { eventsA: aOnly + both, eventsB: bOnly + both, pairs: xA.length, aOnly, bOnly, pOneSided: p };
}

// Event-rate reduction A - B on binary outcomes (1/0), with a bootstrap CI and the exact one-sided p.
function eventReduction(xA, xB, seed = 1) {
  const a = xA.map((v) => (v ? 1 : 0)), b = xB.map((v) => (v ? 1 : 0)), d = a.map((v, i) => v - b[i]);
  const t = S.pairedTest(d, { seed, alternative: 'greater' }), m = mcnemarOneSided(xA, xB);
  return { n: d.length, meanDiff: t.meanDiff, ci95: t.ci95, dz: t.dz, p: m.pOneSided, mcnemar: m, positive: t.positive, negative: t.negative };
}

module.exports = { ...S, oneSample, mcnemarOneSided, eventReduction };
