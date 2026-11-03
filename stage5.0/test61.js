'use strict';
// Behaviour guard for refactoring (Stage 6.1). Plays three seeds and compares fingerprints of everything the screens read against values recorded before the refactor
// (baseline-s6.json). A refactor must leave every fingerprint unchanged. If the simulation is changed ON PURPOSE, regenerate with:  node test61.js --update
const assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto'), path = require('node:path');
const E = require('./engine19'), G = require('./game');
const FILE = path.join(__dirname, 'baseline-s6.json'), UPDATE = process.argv.includes('--update');
const md5 = (x) => crypto.createHash('md5').update(JSON.stringify(x, (k, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v))).digest('hex').slice(0, 12);
const mk = (seed) => { const g = G.newGame(E, { creatures: ['standard'], rivals: [], seed, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4 }); g.setAutoContinuous(true); return g; };
const cont = (g) => { if (g.checkpoint) g.continueFromCheckpoint(); };
const runTo = (g, t) => { let n = 0; while (g.t < t && !g.isOver && n++ < 4000) { g.advance(250); cont(g); } };
function fingerprint(g) {
  const st = g.live.stats(), d = g.dish2(), p = g.phylo(1e9), wi = g.worldInfo(), alive = d.lineages.find((l) => l.alive > 0);
  return {
    state: md5([st.t, st.population, st.lineageAlive, st.births, st.deaths, wi.years, wi.bpText, wi.elapsedText]),
    rank: md5([g.rank.best, g.rank.current, g.rank.lineages.map((l) => [l.lin, l.rank, l.C, l.axes.map((a) => a.tier)])]),
    records: md5([g.codex().map((e) => e.id), g.feats().map((e) => e.id), g.achievements.length, g.eventSeq]),
    dish: md5(d.lineages.map((l) => [l.id, l.alive, l.extinct, l.influence, l.beads.map((b) => [b.key, b.n, b.par, b.first, b.last])])),
    phylo: md5([p.nodes.map((n) => [n.id, n.parent, n.lin, n.kind, n.status, n.label]), p.links, p.roots.map((r) => [r.id, r.alive, r.lostClades, r.ends])]),
    summary: md5(g.summary2()),
    abilities: md5(alive ? g.abilities(alive.lin) : null),
    codon: md5(alive ? (() => { const c = g.codonInfo(alive.lin); return [c.genes, c.stats, c.costs]; })() : null),
    timeline: md5([g.timeInfo(), g.timeLedger() && g.timeLedger().leaps]),
  };
}
const out = {};
for (const seed of [3, 5, 6]) {
  const g = mk(seed); runTo(g, 20000); const a = fingerprint(g);
  let m = null; for (let i = 0; i < 400 && !m; i++) { m = g.milestone(); if (!m) { g.advance(5); cont(g); } }
  const b = G.loadGame(E, JSON.parse(JSON.stringify(m))); runTo(b, b.t + 5000); const c = fingerprint(b);
  out['seed' + seed] = { play: a, resumed: c, save: md5([m.v, m.kind, Object.keys(m).sort(), m.summary, m.arena.length]) };
  console.log('seed', seed, JSON.stringify(a.state), JSON.stringify(a.rank));
}
if (UPDATE) { fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n'); console.log('baseline written'); process.exit(0); }
const base = JSON.parse(fs.readFileSync(FILE, 'utf8')); let bad = 0;
for (const seed of Object.keys(out)) for (const part of ['play', 'resumed']) for (const k of Object.keys(out[seed][part])) if (out[seed][part][k] !== base[seed][part][k]) { bad++; console.log(`FAIL ${seed} ${part} ${k}: ${out[seed][part][k]} != ${base[seed][part][k]}`); }
for (const seed of Object.keys(out)) if (out[seed].save !== base[seed].save) { bad++; console.log(`FAIL ${seed} save layout`); }
console.log(bad ? `${bad} differences` : 'PASS behaviour fingerprints unchanged'); process.exit(bad ? 1 : 0);
