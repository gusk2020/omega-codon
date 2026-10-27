'use strict';
// Stage 5.0 tests. TEST-ONLY SHORTCUT: `testStartYears`.
const assert = require('node:assert/strict');
const E = require('./engine19'), G = require('./game');
const mk = (seed) => { const g = G.newGame(E, { creatures: [], rivals: [], seed, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4, testStartYears: 3.8e9 + 2.9e8 }); g.setAutoContinuous(true); return g; };
const cont = (g) => { if (g.checkpoint) g.continueFromCheckpoint(); };
const Myr = (g) => (g.worldInfo().years - 3.8e9 - 2.9e8) / 1e6;
console.log('… 1A: world time keeps advancing past +309 Myr (seed 3, many events, stop/resume)');
const g = mk(3); let n = 0, ev = 0; while (Myr(g) < 520 && n++ < 400) { g.advance(500); cont(g); if (n % 7 === 0) { g.advance(0); } }
ev = g.save().ops ? g.save().ops.length : 0;
assert.ok(Myr(g) > 520 - 1e-6 || n < 400, `world time stalled at +${Myr(g).toFixed(1)} Myr`);
assert.ok(Myr(g) > 309, 'passed +309 Myr');
const sv = JSON.parse(JSON.stringify(g.save())); const b = G.loadGame(E, sv); let gd = 0; while (b.replayTo !== null && gd++ < 4000) { b.advance(200); cont(b); }
assert.equal(b.t, g.t); assert.equal(b.worldInfo().years, g.worldInfo().years);
console.log('PASS 1A', Myr(g).toFixed(1), 'Myr, steps', g.t);
