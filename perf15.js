'use strict';
// Performance and memory of one 2000-step run per environment, each in a fresh
// process so peak memory is that run's alone. Usage: node perf14.js [--out perf15.json]
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const E = require('./engine15');

if (process.argv[2] === '--child') {
  const before = process.memoryUsage().heapUsed;
  const REG = { pulsed: { resourceRegime: { period: 20, pulseLength: 4 } }, waves: { pathogenRegime: { mode: 'same', interval: 30, waveLength: 10, strength: 0.3 } },
    waves8: { pathogenRegime: { mode: 'same', interval: 8, waveLength: 3, strength: 0.5 } }, storage: { storageEvolvable: true, storageCost: 0.004, resourceRegime: { period: 20, pulseLength: 4 } },
    lineages: { lineageCount: 4, storageEvolvable: true, storageCost: 0.004 }, rareBreeding: { breedingRegime: { openProb: 0.06, windowLength: 3 } }, periodic: { thermalRegime: { mode: 'periodic', mean: 0.45, amp: 0.4, period: 120 } } };
  const [env, reg] = process.argv[3].split('+');
  const r = E.simulate({ seed: 1, steps: 2000, environment: env, ...(REG[reg] || {}) });
  const u = process.resourceUsage();
  console.log(JSON.stringify({ env: process.argv[3], ms: r.elapsedMs, peakPopulation: r.population.max,
    heapAfterMB: (process.memoryUsage().heapUsed - before) / 1048576, maxRssMB: u.maxRSS / 1024 }));
  process.exit(0);
}
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'perf15.json';
const rows = [...Object.keys(E.ENVIRONMENTS), 'rich+pulsed', 'rich+waves', 'rich+waves8', 'rich+storage', 'rich+lineages', 'rich+rareBreeding', 'rich+periodic'].map((env) => JSON.parse(execFileSync(process.execPath, [__filename, '--child', env]).toString()));
const baseline = JSON.parse(execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify({maxRssMB: process.resourceUsage().maxRSS / 1024}))']).toString());
fs.writeFileSync(out, JSON.stringify({ node: process.version, emptyNodeMaxRssMB: baseline.maxRssMB, runs: rows }, null, 1));
for (const r of rows) console.log(r.env.padEnd(16), `${r.ms} ms`, `peak pop ${r.peakPopulation}`, `maxRSS ${r.maxRssMB.toFixed(0)} MB`);
console.log('empty node maxRSS', baseline.maxRssMB.toFixed(0), 'MB');
