'use strict';
// Performance and memory of one 2000-step run per environment, each in a fresh
// process so peak memory is that run's alone. Usage: node perf13.js [--out perf13.json]
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const E = require('./engine13');

if (process.argv[2] === '--child') {
  const before = process.memoryUsage().heapUsed;
  const r = E.simulate({ seed: 1, steps: 2000, environment: process.argv[3] });
  const u = process.resourceUsage();
  console.log(JSON.stringify({ env: process.argv[3], ms: r.elapsedMs, peakPopulation: r.population.max,
    heapAfterMB: (process.memoryUsage().heapUsed - before) / 1048576, maxRssMB: u.maxRSS / 1024 }));
  process.exit(0);
}
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'perf13.json';
const rows = Object.keys(E.ENVIRONMENTS).map((env) => JSON.parse(execFileSync(process.execPath, [__filename, '--child', env]).toString()));
const baseline = JSON.parse(execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify({maxRssMB: process.resourceUsage().maxRSS / 1024}))']).toString());
fs.writeFileSync(out, JSON.stringify({ node: process.version, emptyNodeMaxRssMB: baseline.maxRssMB, runs: rows }, null, 1));
for (const r of rows) console.log(r.env.padEnd(16), `${r.ms} ms`, `peak pop ${r.peakPopulation}`, `maxRSS ${r.maxRssMB.toFixed(0)} MB`);
console.log('empty node maxRSS', baseline.maxRssMB.toFixed(0), 'MB');
