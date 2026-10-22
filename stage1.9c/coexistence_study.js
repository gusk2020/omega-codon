'use strict';
// Coexistence study (Stage 1.9C): exploratory comparison of the Stage 1.9B arena with the 1.9C ecology. Not a hypothesis test.
// usage: node coexistence_study.js <variant> <seeds> <steps>   variants: b19 | c19 | c19-nobg | c19-nonicheless
const E = require('./engine19'), G = require('./game');
const variant = process.argv[2] || 'c19', SEEDS = Number(process.argv[3] || 20), STEPS = Number(process.argv[4] || 4000);
const out = { variant, steps: STEPS, runs: [] };
for (let seed = 1; seed <= SEEDS; seed++) {
  const focus = ['standard'], rivals = G.pickRivals(seed, focus, 2);
  const cfg = variant === 'b19' ? { creatures: focus, rivals, seed, realms: true, scenario: 'kpg' } : { creatures: focus, rivals, seed, realms: true, scenario: 'kpg', ecology: 'v2', ...(variant === 'c19nobg' ? { background: false } : {}) };
  const g = G.newGame(E, cfg); g.setAutoContinuous(true); let firstSingle = null;
  while (g.t < STEPS && !g.live.done) { g.advance(25); const alive = g.live.stats().lineageAlive.filter((n) => n >= 5).length; if (alive <= 1 && firstSingle === null && g.t >= 200) firstSingle = g.t; }
  const st = g.live.stats(), ev = g.events;
  const cnt = (k) => ev.filter((e) => e.kind === k).length;
  out.runs.push({ seed, alive5: st.lineageAlive.filter((n) => n >= 5).length, alive1: st.lineageAlive.filter((n) => n >= 1).length, pop: st.population, firstSingle, local: cnt('local'), immigration: ev.filter((e) => e.kind === 'immigration' && e.text.startsWith('背景')).length, reinvasion: ev.filter((e) => e.text.startsWith('再侵入')).length, collapse: cnt('collapse'), dominance: cnt('dominance'), lineageExt: cnt('lineage'), div: g.diversity().arenaShannon });
}
const r = out.runs, sum = (f) => r.reduce((a, x) => a + f(x), 0), med = (a) => { const v = a.filter((x) => x !== null).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
out.summary = { runs: r.length, twoOrMore5AtEnd: sum((x) => (x.alive5 >= 2 ? 1 : 0)), threeOrMore5AtEnd: sum((x) => (x.alive5 >= 3 ? 1 : 0)), extinctAll: sum((x) => (x.pop === 0 ? 1 : 0)), medianFirstSingle: med(r.map((x) => x.firstSingle)), neverSingle: sum((x) => (x.firstSingle === null ? 1 : 0)), meanLocalExtinctions: sum((x) => x.local) / r.length, meanImmigrationEvents: sum((x) => x.immigration) / r.length, runsWithReinvasion: sum((x) => (x.reinvasion > 0 ? 1 : 0)), meanCollapse: sum((x) => x.collapse) / r.length, meanShannon: sum((x) => x.div) / r.length };
console.log(JSON.stringify(out));
