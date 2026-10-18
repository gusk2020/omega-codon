'use strict';
// Statistics for Stage 1.4. Every comparison here respects the paired-seed
// design: condition A and condition B with the same seed share an environment
// history, so they are analysed as pairs, never as independent samples.
const { rng } = require('./engine14');

const finite = (v) => v !== null && v !== undefined && Number.isFinite(v);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
const sd = (a) => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)) : 0; };
// True median: the mean of the two middle values when n is even.
function median(a) {
  const s = a.filter(finite).sort((x, y) => x - y), n = s.length, h = n >> 1;
  if (!n) return null;
  return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
// The Stage 1.3 runner's median: the upper of the two middle values when n is even.
function upperMedian(a) { const s = a.filter(finite).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }
function desc(a) { a = a.filter(finite); return { mean: mean(a), sd: sd(a), median: median(a), min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null, n: a.length }; }

// Paired differences a[i] - b[i]; pairs with a missing value on either side are dropped and counted.
function pairs(a, b) { const d = []; let dropped = 0; for (let i = 0; i < a.length; i++) if (finite(a[i]) && finite(b[i])) d.push(a[i] - b[i]); else dropped++; return { d, dropped }; }

// Mean paired difference, percentile bootstrap 95% CI, standardised effect dz,
// and a sign-flip permutation test (exact for n <= 20, 20000 random flips otherwise).
function pairedTest(d, { seed = 1, alternative = 'two-sided' } = {}) {
  const n = d.length;
  if (!n) return { n: 0, meanDiff: null, ci95: null, dz: null, p: null, positive: 0, negative: 0 };
  const m = mean(d), s = sd(d), r = rng(seed);
  const boots = [];
  for (let b = 0; b < 4000; b++) { let t = 0; for (let i = 0; i < n; i++) t += d[Math.floor(r() * n)]; boots.push(t / n); }
  boots.sort((x, y) => x - y);
  const ci95 = [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length) - 1]];
  const stat = (signs) => { let t = 0; for (let i = 0; i < n; i++) t += signs(i) * d[i]; return t / n; };
  let ge = 0, le = 0, absGe = 0, total = 0;
  const obs = m;
  const tally = (v) => { total++; if (v >= obs - 1e-12) ge++; if (v <= obs + 1e-12) le++; if (Math.abs(v) >= Math.abs(obs) - 1e-12) absGe++; };
  if (n <= 20) { for (let mask = 0; mask < 1 << n; mask++) tally(stat((i) => ((mask >> i) & 1 ? -1 : 1))); }
  else { const r2 = rng(seed + 7); tally(obs); for (let k = 0; k < 20000; k++) tally(stat(() => (r2() < 0.5 ? -1 : 1))); }
  const p = alternative === 'greater' ? ge / total : alternative === 'less' ? le / total : absGe / total;
  return { n, meanDiff: m, ci95, dz: s > 1e-9 ? m / s : null, p, alternative, positive: d.filter((v) => v > 0).length, negative: d.filter((v) => v < 0).length };
}
function paired(a, b, opts) { const { d, dropped } = pairs(a, b); return { ...pairedTest(d, opts), droppedPairs: dropped }; }
// Difference in differences per seed: (a1 - a0) - (b1 - b0).
function did(a1, a0, b1, b0, opts) {
  const d = []; let dropped = 0;
  for (let i = 0; i < a1.length; i++) { const v = [a1[i], a0[i], b1[i], b0[i]]; if (v.every(finite)) d.push((v[0] - v[1]) - (v[2] - v[3])); else dropped++; }
  return { ...pairedTest(d, opts), droppedPairs: dropped };
}

function logChoose(n, k) { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; }
// Exact McNemar test on paired binary outcomes (e.g. extinct yes/no under two
// conditions with the same seed). b = A only, c = B only.
function mcnemarExact(xA, xB) {
  let b = 0, c = 0, both = 0, neither = 0;
  for (let i = 0; i < xA.length; i++) { if (xA[i] && !xB[i]) b++; else if (!xA[i] && xB[i]) c++; else if (xA[i]) both++; else neither++; }
  const n = b + c;
  let p = 1;
  if (n) { const k = Math.min(b, c); let tail = 0; for (let i = 0; i <= k; i++) tail += Math.exp(logChoose(n, i) - n * Math.LN2); p = Math.min(1, 2 * tail); }
  return { A: b + both, B: c + both, n: xA.length, discordantAonly: b, discordantBonly: c, p };
}

// Holm step-down adjustment; returns adjusted p in the original order.
function holm(ps) {
  const idx = ps.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]), out = new Array(ps.length);
  let run = 0;
  idx.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (ps.length - k) * p)); out[i] = run; });
  return out;
}

module.exports = { mean, sd, median, upperMedian, desc, paired, did, pairedTest, mcnemarExact, holm, finite };
