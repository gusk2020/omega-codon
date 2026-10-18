'use strict';
// Stage 1.8 tests. Run from this folder: node test18.js
const assert = require('node:assert/strict');
const E17 = require('../stage1.7/engine17'), E = require('./engine18'), G = require('./game');
const results = [];
function test(name, fn) { const t = Date.now(); try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 500)); process.exitCode = 1; } }
const P20 = { period: 20, pulseLength: 4 };
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, s: r.switching, m: r.modeFractions, g: r.finalGenomes.map((g) => g.genes), rep: r.reproduction, lin: r.lineages, eco: r.ecology, pred: r.predation });

test('1.8→1.7: 非ライブ実行はStage 1.7とビット単位で一致（6環境×4条件）', () => {
  const conds = [{}, { resourceRegime: P20 }, { resourceRegime: P20, preyInflow: 0.065, birthScale: 2 }, { lineageCount: 3, resourceRegime: P20 }];
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of conds) { const o = { seed: 4, steps: 300, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E17.simulate(o)), env); }
});
test('1.8 ライブ実行: 一歩ずつ進めた結果は、一括実行と同じ', () => {
  for (const o of [{ seed: 7, steps: 400, resourceRegime: P20 }, { seed: 8, steps: 400, resourceRegime: P20, lineageCount: 2 }]) {
    const live = E.simulate({ ...o, live: true }); while (!live.done) live.step(1 + (live.t % 7));
    assert.equal(strip(live.result()), strip(E17.simulate(o)));
  }
});
test('1.8 ライブ実行: 任意の区切りで進めても同じ（途中でstats/individualsを読んでも乱数を使わない）', () => {
  const o = { seed: 9, steps: 300, resourceRegime: P20 }, live = E.simulate({ ...o, live: true });
  while (!live.done) { live.step(13); live.stats(); live.individuals(); }
  assert.equal(strip(live.result()), strip(E17.simulate(o)));
});
test('1.8 介入: 食料補助・保護・災害は決定論的で、収支が閉じる', () => {
  const play = () => { const l = E.simulate({ seed: 3, steps: 600, resourceRegime: P20, live: true }); l.step(100); l.setOption('preyInflow', 0.065); l.step(100); l.setOption('preyInflow', 0); l.setOption('preyHidden', 0.3); l.step(100); l.disaster(1.2); l.step(1); l.step(300); return l; };
  const a = play(), b = play(); assert.equal(strip(a.result()), strip(b.result())); assert.ok(Math.abs(a.result().energy.residual) < 1e-6);
  assert.notEqual(strip(a.result()), strip(E17.simulate({ seed: 3, steps: 600, resourceRegime: P20 })));
});
test('1.8 介入: 災害は個体数を減らす方向に働く', () => {
  const l = E.simulate({ seed: 3, steps: 300, resourceRegime: P20, live: true }), c = E.simulate({ seed: 3, steps: 300, resourceRegime: P20, live: true });
  l.step(150); c.step(150); l.disaster(1.5); l.step(30); c.step(30); assert.ok(l.stats().population <= c.stats().population);
});
test('1.8 ゲーム: 生物のひな形は発達させると狙いの形質になる', () => {
  for (const c of G.CREATURES) { const g = G.makeGenome(E, c); const tr = E.develop(g, E.REFERENCE_DEV).traits; for (const [k, v] of Object.entries(c.traits || {})) assert.ok(Math.abs(tr[E.LOCI.findIndex((l) => l[0] === k)] - v) < 0.02, `${c.id} ${k}`); }
});
test('1.8 ゲーム: セーブ→ロードは、続けて遊んだときと同じ状態になる', () => {
  const cfg = { creatures: ['standard', 'lowMetabolism'], seed: 21 };
  const a = G.newGame(E, cfg); a.advance(250); a.apply({ kind: 'support', on: true }); a.advance(150); a.apply({ kind: 'disaster' }); a.advance(100);
  const save = JSON.parse(JSON.stringify(a.save()));
  const b = G.loadGame(E, save); while (b.t < a.t) b.advance(50);
  assert.equal(b.t, a.t); assert.equal(JSON.stringify(b.live.stats()), JSON.stringify(a.live.stats()));
  a.advance(120); b.advance(120); assert.equal(JSON.stringify(b.live.stats()), JSON.stringify(a.live.stats()));
  assert.equal(JSON.stringify(b.events), JSON.stringify(a.events));
});
test('1.8 ゲーム: 分岐イベントは介入を求め、答えはセーブに残る', () => {
  const g = G.newGame(E, { creatures: ['standard', 'highFecundity', 'lowMetabolism'], seed: 5 }); let prompt = null;
  for (let i = 0; i < 120 && !prompt; i++) { g.advance(50); prompt = g.pending; }
  assert.ok(prompt, 'no branch point reached'); assert.ok(prompt.options.length >= 2);
  g.choose(prompt.options[0].id); assert.equal(g.pending, null); assert.ok(g.save().log.length >= 1);
});
test('1.8 ゲーム: 絶滅で終了し、結果が出る（波のある土地で全滅するシードを探す）', () => {
  let ended = null;
  for (let seed = 1; seed <= 12 && !ended; seed++) { const g = G.newGame(E, { creatures: ['standard'], seed, environment: 'pulse' }); for (let i = 0; i < 60 && !g.live.done; i++) { g.advance(50); if (g.pending) g.choose('watch'); } if (g.live.done) ended = g; }
  assert.ok(ended, 'no extinction found'); assert.ok(ended.summary().text.includes('全滅')); assert.equal(ended.live.stats().population, 0);
});
test('1.8: 1000ステップの実行が高速（1.5秒未満）', () => { const t = Date.now(); const l = E.simulate({ seed: 1, steps: 1000, resourceRegime: P20, live: true }); l.step(1000); assert.ok(Date.now() - t < 1500, String(Date.now() - t)); });
for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
