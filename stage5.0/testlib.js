'use strict';
// Helpers shared by the Stage 5.0+ test files (test50, test60, test61): a tiny test runner and ways to play a game forward.
const E = require('./engine19'), G = require('./game');
function runner() {
  const results = [];
  const test = (name, fn) => { const t = Date.now(); console.log('… ' + name.slice(0, 70)); try { fn(); results.push([name, 'PASS']); console.log('PASS ' + name + ` (${Date.now() - t} ms)`); } catch (e) { results.push([name, 'FAIL']); console.log('FAIL ' + name + '\n' + (e.stack || e).toString().slice(0, 900)); } };
  const finish = () => { const bad = results.filter((r) => r[1] === 'FAIL'); console.log(`\n${results.length - bad.length}/${results.length} passed`); process.exit(bad.length ? 1 : 0); };
  return { test, finish };
}
// a game from the origin of life with one focus creature, as a player starts it (milestones are passed automatically)
const newPlayGame = (seed) => { const g = G.newGame(E, { creatures: ['standard'], rivals: [], seed, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4 }); g.setAutoContinuous(true); return g; };
const cont = (g) => { if (g.checkpoint) g.continueFromCheckpoint(); };
const runTo = (g, t) => { let n = 0; while (g.t < t && !g.isOver && n++ < 4000) { g.advance(250); cont(g); } };
// a milestone snapshot (as the JSON a save file holds); a few steps are played if one cannot be taken at this instant
const snapOf = (g) => { for (let i = 0; i < 400; i++) { const m = g.milestone(); if (m) return JSON.parse(JSON.stringify(m)); g.advance(5); cont(g); } throw new Error('no milestone could be taken'); };
module.exports = { E, G, runner, newPlayGame, cont, runTo, snapOf };
