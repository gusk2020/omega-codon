'use strict';
// Stage 1.2 automated tests. Run: node test12.js
const assert = require('node:assert/strict');
const E = require('./engine12');

const results = [];
function test(name, fn) {
  const t = Date.now();
  try { fn(); results.push([name, 'PASS', Date.now() - t]); }
  catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}
const sim = (o) => E.simulate({ steps: 600, ...o });

test('同一シードで完全再現', () => {
  const a = sim({ seed: 5, environment: 'plague' }), b = sim({ seed: 5, environment: 'plague' });
  assert.deepEqual(a.history, b.history); assert.deepEqual(a.deathCauses, b.deathCauses);
});

test('シードが違えば結果が違う', () => {
  assert.notDeepEqual(sim({ seed: 1 }).history, sim({ seed: 2 }).history);
});

test('全出力が有限（全環境・全アブレーション）', () => {
  const walk = (v, path) => {
    if (v === null) return;
    if (typeof v === 'number') assert.ok(Number.isFinite(v), path);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '[' + i + ']'));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'finalGenomes' && k !== 'options') walk(x, path + '.' + k);
  };
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of [{}, { selection: false }, { memory: false, switching: false, replacement: false, rateOfLiving: false }]) walk(sim({ seed: 3, environment: env, ...extra }), env);
});

test('エネルギー収支が閉じる（誤差1e-6未満）', () => {
  for (const env of Object.keys(E.ENVIRONMENTS)) {
    const r = sim({ seed: 4, environment: env, steps: 1000 });
    assert.ok(Math.abs(r.energy.residual) < 1e-6, `${env} residual ${r.energy.residual}`);
  }
});

test('個体数は固定されない', () => {
  const r = sim({ seed: 6, steps: 1000 });
  assert.ok(r.population.max > r.population.min + 50);
});

test('絶滅が起こり得る（極限条件）', () => {
  let ext = 0;
  for (let s = 1; s <= 6; s++) if (E.simulate({ seed: s, steps: 800, environment: 'scarce', extrinsicMortality: 0.15, founders: 20 }).extinct) ext++;
  assert.ok(ext > 0, 'some runs must go extinct');
});

test('境界値: 個体0・1、ステップ0、未知環境', () => {
  const z = sim({ seed: 1, founders: 0 }); assert.equal(z.extinct, true); assert.equal(z.extinctAt, 0);
  assert.ok(sim({ seed: 1, founders: 1 }).lineagePersistence >= 1);
  const n = E.simulate({ seed: 1, steps: 0 }); assert.equal(n.population.final, 100); assert.equal(n.history.length, 1);
  assert.throws(() => E.simulate({ environment: 'mars' }));
});

test('記憶は元細胞の範囲内にしか存在しない（M ≤ O）', () => {
  // run with heavy replacement and fast learning, then inspect via a tiny probe
  const g = E.founderGenome(); g.loci[E.LOCI.findIndex((l) => l[0] === 'replaceRatio')] = 1; g.loci[E.LOCI.findIndex((l) => l[0] === 'memoryLearn')] = 1;
  const r = E.assay([g], { seed: 2, steps: 400, environment: 'rich' });
  assert.ok(r.cells.originalAtDeath < 0.9, 'replacement must remove original cells');
  assert.ok(r.cells.memoryRetentionAtDeath === null || r.cells.memoryRetentionAtDeath <= 1 + 1e-12);
  assert.ok(r.final.meanM <= r.final.meanO + 1e-12);
});

test('細胞交換OFFでは元細胞の割合が交換で減らない', () => {
  const g = E.founderGenome(); g.loci[E.LOCI.findIndex((l) => l[0] === 'replaceRatio')] = 1;
  const on = E.assay([g], { seed: 3, steps: 400, environment: 'rich' });
  const off = E.assay([g], { seed: 3, steps: 400, environment: 'rich', replacement: false });
  assert.ok(off.cells.originalAtDeath > on.cells.originalAtDeath);
});

test('記憶OFFでは記憶が0でコストもかからない', () => {
  const r = sim({ seed: 7, memory: false });
  assert.equal(r.final.meanM, 0); assert.equal(r.energy.spentBy.memory, 0);
});

test('行動切替OFFでは刺激で行動が変わらない', () => {
  const r = sim({ seed: 8, switching: false, mutation: false });
  assert.equal(r.switching.switches, 0); assert.equal(r.modeFractions.explore, 1);
});

test('選択なし対照: 変異率を変えても人口動態は同一', () => {
  const a = sim({ seed: 9, selection: false, mutationRate: 0.1 }), b = sim({ seed: 9, selection: false, mutationRate: 0.9 });
  assert.deepEqual(a.history.map((h) => h.population), b.history.map((h) => h.population));
});

test('paired seed: 条件が違っても環境履歴（災害の系列）は同一', () => {
  const o = { seed: 10, steps: 800, environment: 'extremeDisaster' };
  const sigs = [{}, { memory: false }, { selection: false }, { switching: false }].map((x) => E.simulate({ ...o, ...x }).envSignature);
  assert.ok(sigs[0] !== 0); assert.ok(sigs.every((v) => v === sigs[0]), JSON.stringify(sigs));
});

test('低代謝では内部時間が暦年齢より遅く進む（両者を別々に記録）', () => {
  const r = sim({ seed: 11, mutation: false });
  assert.ok(r.lifespan.internalMean !== r.lifespan.calendarMean);
  const g = E.founderGenome(); g.loci[0] = 0.4;
  const slow = E.assay([g], { seed: 11, steps: 600 });
  assert.ok(slow.lifespan.internalMean / slow.lifespan.calendarMean < r.lifespan.internalMean / r.lifespan.calendarMean);
});

test('死亡原因の合計 = 記録された死亡数', () => {
  const r = sim({ seed: 12, environment: 'extremeDisaster' });
  assert.equal(Object.values(r.deathCauses).reduce((a, b) => a + b, 0), r.lifespan.deathsRecorded);
});

test('処理時間: 2000ステップ1回が5秒未満（Node）', () => {
  const r = E.simulate({ seed: 1, steps: 2000, environment: 'rich' });
  assert.ok(r.elapsedMs < 5000, r.elapsedMs + ' ms');
});

for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
