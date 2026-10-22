'use strict';
// Diagnosis of single-species dominance (Stage 1.9C). Exploratory, not a hypothesis test.
// usage: node diagnose.js <variant> <seeds> <steps>  -> prints one JSON line
const E = require('./engine19'), G = require('./game');
const variant = process.argv[2] || 'base', SEEDS = Number(process.argv[3] || 12), STEPS = Number(process.argv[4] || 4000);
const ids = ['standard', 'hunter', 'tough'];
const gen = (id) => G.makeGenome(E, G.CREATURES.find((c) => c.id === id));
const NICHES = { standard: [0.34, 0.33, 0.33], lowMetabolism: [0.7, 0.3, 0], highFecundity: [0.1, 0.8, 0.1], hunter: [0.2, 0.2, 0.6], tough: [0, 0.3, 0.7] };
const W = (a) => a.map((id) => NICHES[id]);
const V0 = (b) => () => ({ gs: ids.map(gen), o: { realms: true, niche: { slots: 3, weights: W(ids), specialistBonus: b } } });
const V = {
  nicheB05: V0(0.5), nicheB10: V0(1.0), nicheB15: V0(1.5),
  niche: () => ({ gs: ids.map(gen), o: { realms: true, niche: { slots: 3, weights: W(ids) } } }),
  nicheNeutral: () => ({ gs: [gen('standard'), gen('standard'), gen('standard')], o: { realms: true, niche: { slots: 3, weights: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] } } }),
  nicheSame: () => ({ gs: [gen('standard'), gen('standard'), gen('standard')], o: { realms: true, niche: { slots: 3, weights: [[.34, .33, .33], [.34, .33, .33], [.34, .33, .33]] } } }),
  base: () => ({ gs: ids.map(gen), o: { realms: true } }),
  norealm: () => ({ gs: ids.map(gen), o: {} }),
  neutral: () => ({ gs: [gen('standard'), gen('standard'), gen('standard')], o: { realms: true } }),
  neutralNoRealm: () => ({ gs: [gen('standard'), gen('standard'), gen('standard')], o: {} }),
  founders300: () => ({ gs: ids.map(gen), o: { realms: true, founders: 300 } }),
  immobile: () => ({ gs: ids.map(gen), o: { realms: { rate: 0 } } }),
  mobile: () => ({ gs: ids.map(gen), o: { realms: { rate: 0.2 } } }),
  noprey: () => ({ gs: ids.map(gen), o: { realms: true, environment: 'preyless' } }),
  noMutation: () => ({ gs: ids.map(gen), o: { realms: true, mutation: false } }),
};
const out = { variant, seeds: SEEDS, steps: STEPS, runs: [] };
for (let seed = 1; seed <= SEEDS; seed++) {
  const { gs, o } = V[variant](); const l = E.simulate({ seed, steps: STEPS, environment: 'rich', founders: 100, lineageCount: 3, founderGenomes: gs, sampleEvery: 100, live: true, ...o });
  let firstLoss = null, single = null, lastCounts = null; const pop3 = [];
  while (!l.done) { l.step(25); const st = l.stats(), alive = st.lineageAlive.filter((x) => x > 0).length; if (alive < 3 && firstLoss === null) firstLoss = st.t; if (alive <= 1 && single === null) single = st.t; if (st.t % 500 === 0) pop3.push(st.lineageAlive.join('/')); lastCounts = st.lineageAlive; }
  out.runs.push({ seed, firstLoss, single, final: lastCounts });
}
const med = (a) => { const v = a.filter((x) => x !== null).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
out.summary = { medianFirstLoss: med(out.runs.map((r) => r.firstLoss)), medianSingle: med(out.runs.map((r) => r.single)), singleBy: out.runs.filter((r) => r.single !== null).length, threeAliveAtEnd: out.runs.filter((r) => r.final.every((x) => x > 0)).length, twoOrMoreAtEnd: out.runs.filter((r) => r.final.filter((x) => x > 0).length >= 2).length };
console.log(JSON.stringify({ variant, ...out.summary, runs: out.runs.map((r) => `${r.seed}:${r.firstLoss}/${r.single}/${r.final.join('-')}`).join(' ') }));
