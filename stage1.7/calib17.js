'use strict';
// CALIBRATION (not a test; seeds 901-910 are used nowhere else): how much food does Stage 1.6's prey floor supply?
// The measured mean is then fixed in PREREGISTRATION.md as the "matched" food-only inflow.
const E = require('./engine17'); const fs = require('node:fs');
const P20 = { period: 20, pulseLength: 4 }, rows = [];
for (let s = 901; s <= 910; s++) {
  const r = E.simulate({ seed: s, steps: 2000, environment: 'rich', resourceRegime: P20, preyRefuge: 0.3 });
  rows.push({ seed: s, floorAdded: r.ecology.preyFloorAddedPerPatchStep, produced: r.ecology.preyProducedPerPatchStep, caught: r.ecology.preyCaughtPerPatchStep, popMedian: r.population.median, extinct: r.extinct });
}
const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
const out = { seeds: '901-910', meanFloorAddedPerPatchStep: mean('floorAdded'), meanProducedPerPatchStep: mean('produced'), meanCaughtPerPatchStep: mean('caught'), meanPopMedian: mean('popMedian'), extinct: rows.filter((r) => r.extinct).length, rows };
fs.writeFileSync('calib17.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify({ ...out, rows: undefined }, null, 1));
