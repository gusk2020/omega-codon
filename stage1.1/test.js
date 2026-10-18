'use strict';
// Stage 1.1 automated tests. Run: node test.js
const assert = require('node:assert/strict');
const E = require('./engine');

const results = [];
function test(name, fn) {
  const t = Date.now();
  try { fn(); results.push([name, 'PASS', Date.now() - t]); }
  catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}
const finite = (v) => v === null || Number.isFinite(v);

test('同一シードで完全再現', () => {
  const o = { seed: 7, steps: 600, variable: true };
  assert.deepEqual(E.simulate(o).history, E.simulate(o).history);
});

test('シードが違えば結果が違う', () => {
  assert.notDeepEqual(E.simulate({ seed: 1, steps: 400 }).history, E.simulate({ seed: 2, steps: 400 }).history);
});

test('全出力値が有限', () => {
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const variable of [false, true]) {
    const r = E.simulate({ seed: 3, steps: 500, environment: env, variable });
    for (const h of r.history) {
      for (const [k, v] of Object.entries(h)) {
        if (Array.isArray(v)) v.forEach((x) => assert.ok(finite(x), `${env} ${k}`));
        else if (typeof v === 'number' || v === null) assert.ok(finite(v), `${env} ${k}=${v}`);
      }
      h.traits.forEach((x) => assert.ok(x >= 0 && x <= 1));
    }
  }
});

test('個体数は固定されない（変動する）', () => {
  const pops = E.simulate({ seed: 4, steps: 1000 }).history.map((h) => h.population);
  assert.ok(new Set(pops).size > 20, 'population should vary');
  assert.ok(Math.max(...pops) > 100, 'should grow beyond the founders');
});

test('境界値: 個体0・1、ステップ0、変異なし', () => {
  const zero = E.simulate({ seed: 1, founders: 0, steps: 50 });
  assert.equal(zero.extinct, true); assert.equal(zero.extinctAt, 0);
  const one = E.simulate({ seed: 1, founders: 1, steps: 300 });
  assert.ok(one.history.length >= 1);
  const none = E.simulate({ seed: 1, steps: 0 });
  assert.equal(none.history.length, 1); assert.equal(none.finalPopulation, 100);
  const noMut = E.simulate({ seed: 1, steps: 300, mutation: false });
  const key = E.genomeKey(E.founderGenome());
  assert.ok(noMut.finalGenomes.every((g) => E.genomeKey(g) === key), 'no mutation means clones');
  assert.throws(() => E.simulate({ environment: 'nowhere' }));
});

test('遺伝子の長さ・制御辺は上下限内', () => {
  const r = E.simulate({ seed: 5, steps: 1500, mutationRate: 1 });
  for (const g of r.finalGenomes) { assert.ok(g.genes.length >= 3 && g.genes.length <= 80); assert.ok(g.edges.length <= 16); }
});

test('絶滅が起こり得る（生存は保証されない）', () => {
  let extinct = 0;
  for (let s = 1; s <= 10; s++) if (E.simulate({ seed: s, steps: 1500, environment: 'brink', variable: true }).extinct) extinct++;
  assert.ok(extinct > 0, 'some brink runs must go extinct');
  assert.ok(extinct < 10, 'but not all of them');
});

test('安全上限に通常条件で達しない', () => {
  for (const env of ['temperate', 'rich']) assert.equal(E.simulate({ seed: 1, steps: 1500, environment: env }).capHit, false);
});

test('選択なし対照: 遺伝型は個体の運命に影響しない', () => {
  // interactions only changes how a genome is expressed; with selection off
  // nothing is expressed, so the two runs must be identical.
  const a = E.simulate({ seed: 9, steps: 800, selection: false, interactions: true });
  const b = E.simulate({ seed: 9, steps: 800, selection: false, interactions: false });
  assert.deepEqual(a.history.map((h) => h.population), b.history.map((h) => h.population));
});

test('相互作用OFFでは制御辺が発現に効かない', () => {
  const g = E.founderGenome(); g.edges.push({ src: 1, dst: 2, w: 3 });
  const off = E.genotypeTraits(g, false), base = E.genotypeTraits(E.founderGenome(), false);
  assert.deepEqual(off, base);
  assert.notDeepEqual(E.genotypeTraits(g, true), base);
});

test('制御辺は信号に応じた可塑的発現を作れる', () => {
  const g = E.founderGenome(); g.edges.push({ src: 1, dst: 2, w: 3 }); // pathogen -> immune
  const low = E.genotypeTraits(g, true, [0.5, 0, 0.3, 0.2, 0.5])[2];
  const high = E.genotypeTraits(g, true, [0.5, 1.5, 0.3, 0.2, 0.5])[2];
  assert.ok(high > low + 0.1, `immune should rise with pathogen signal (${low} -> ${high})`);
});

test('短命/長命戦略差: 外因死亡が高いと修復↓・繁殖↑', () => {
  const avg = (m, i) => { let s = 0; for (let k = 1; k <= 6; k++) s += E.simulate({ seed: 100 + k, steps: 1500, variable: false, extrinsicMortality: m }).summary.traits[i]; return s / 6; };
  assert.ok(avg(0.08, 4) > avg(0.005, 4), 'fecundity should be higher under high extrinsic mortality');
  assert.ok(avg(0.08, 1) < avg(0.005, 1), 'repair should be lower under high extrinsic mortality');
});

test('意図的な環境急変で結果が変わる', () => {
  const base = E.simulate({ seed: 11, steps: 1500, environment: 'rich' });
  const shocked = E.simulate({ seed: 11, steps: 1500, environment: 'rich', shift: { at: 700, environment: 'brink' } });
  assert.ok(shocked.finalPopulation < base.finalPopulation * 0.5);
});

test('実行時間: 2000ステップ1回が5秒未満（Node）', () => {
  const r = E.simulate({ seed: 1, steps: 2000, variable: true });
  assert.ok(r.elapsedMs < 5000, `${r.elapsedMs} ms`);
});

for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
