'use strict';
// Re-aggregates Stage 1.3's committed per-run results with the true median and
// reports every table median that changes. Usage: node median-audit13.js <results13.json> [--out file]
const fs = require('node:fs');
const S = require('./stats14');
const src = process.argv[2], out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'median-audit13.json';
const r = JSON.parse(fs.readFileSync(src, 'utf8'));
const KEYS = ['popMin', 'popMedian', 'popMax', 'persistence', 'lifeMean', 'lifeMedian', 'lifeMax', 'activeMean', 'internalMean', 'birthsPerDeath',
  'huntSuccess', 'encounterSuccess', 'precision', 'recall', 'accuracy', 'sensorFP', 'sensorFN', 'originalAtDeath', 'memoryRetention', 'meanM', 'genes', 'regLinks', 'pleiotropy', 'plasticity', 'robustness'];
const rows = [];
for (const [env, conds] of Object.entries(r.runs)) for (const [cond, runs] of Object.entries(conds)) for (const k of KEYS) {
  const v = runs.map((x) => x[k]), old = S.upperMedian(v), fixed = S.median(v), stored = r.table[env][cond][k]?.median;
  if (old === null) continue;
  rows.push({ env, cond, metric: k, storedMedian: stored, upperMedianRecomputed: old, trueMedian: fixed, absDiff: Math.abs(fixed - old), relDiff: old ? Math.abs(fixed - old) / Math.abs(old) : 0, n: v.filter(S.finite).length });
}
const changed = rows.filter((x) => x.absDiff > 0);
const summary = { tableMedians: rows.length, changed: changed.length, storedMatchesUpperMedian: rows.every((x) => x.storedMedian === x.upperMedianRecomputed),
  maxRelDiff: Math.max(...rows.map((x) => x.relDiff)), meanRelDiffAmongChanged: changed.length ? changed.reduce((a, x) => a + x.relDiff, 0) / changed.length : 0,
  largest: changed.sort((a, b) => b.relDiff - a.relDiff).slice(0, 8) };
fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));
console.log(JSON.stringify({ ...summary, largest: summary.largest.map((x) => `${x.env}/${x.cond}/${x.metric}: ${x.upperMedianRecomputed} -> ${x.trueMedian}`) }, null, 1));
