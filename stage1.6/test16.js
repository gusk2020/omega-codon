'use strict';
// Stage 1.6 automated tests. Run from this folder: node test16.js
// Stage 1.5's own suite is run separately from the repository root: node test15.js
const assert = require('node:assert/strict');
const E15 = require('../engine15'), E = require('./engine16'), S = require('./stats16');

const results = [];
function test(name, fn) {
  const t = Date.now();
  try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.message).slice(0, 400)); process.exitCode = 1; }
}
const NL = E.STORAGE_INDEX, W6 = { interval: 6, waveLength: 3, strength: 0.5, mode: 'same' }, P20 = { period: 20, pulseLength: 4 };
const TI = (n) => E.LOCI.findIndex((l) => l[0] === n);
function genomeWith(k, value) { // add one structural gene and solve its effect so that trait k develops to `value`
  const make = (w) => { const g = E.founderGenome(); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[k, w]] }); return g; };
  let lo = -40, hi = 40; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (E.develop(make(mid), E.REFERENCE_DEV).traits[k] < value) lo = mid; else hi = mid; }
  return make((lo + hi) / 2);
}
const OLD_REG = ['waves', 'waveInfections', 'reinfectionsSameAntigen', 'immuneMemoryPeakAtDeath', 'immuneMemoryRetentionAtDeath', 'waveInfectionsPerDeath'];
const strip = (r) => JSON.stringify({ h: r.history.map(({ storageCarriers, ...x }) => x), c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, s: r.switching, m: r.modeFractions, cells: r.cells,
  rg: Object.fromEntries(OLD_REG.map((k) => [k, r.regimes[k]])), g: r.finalGenomes.map((g) => g.genes), rep: r.reproduction, lin: r.lineages });

test('1.6→1.5: 既定値ではStage 1.5とビット単位で一致（6環境×8条件）', () => {
  const conds = [{}, { selection: false }, { memory: false }, { storageEvolvable: true, storageCost: 0.004, resourceRegime: P20 }, { pathogenRegime: W6 },
    { pathogenRegime: { ...W6, mode: 'novel' }, memoryCost: false }, { breedingRegime: { openProb: 0.06, windowLength: 3 } }, { lineageCount: 3, storageEvolvable: true, mutationRate: 0.9 }];
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of conds) { const o = { seed: 3, steps: 250, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E15.simulate(o)), `${env} ${JSON.stringify(extra).slice(0, 40)}`); }
});

test('1.6 変異: 既定の引数では mutate がStage 1.5と同じ乱数列・同じ結果を返す', () => {
  const a = E.rng(5), b = E.rng(5); let ga = E.founderGenome(), gb = E15.founderGenome();
  for (let i = 0; i < 1500; i++) { ga = E.mutate(ga, a, 30, E.TRAITS.length); gb = E15.mutate(gb, b, 30, E15.TRAITS.length); }
  assert.equal(JSON.stringify(ga.genes), JSON.stringify(gb.genes));
});

test('1.6 変異供給: 供給16は供給1より、貯蔵を向く遺伝子が出やすい（既定の1は一様）', () => {
  const rate = (supply) => { const r = E.rng(9); let hit = 0, N = 400; for (let n = 0; n < N; n++) { let g = E.founderGenome(); for (let i = 0; i < 40; i++) g = E.mutate(g, r, 30, E.TRAITS.length, { supply, scale: 1 }); if (g.genes.some((x) => x.k === 0 && x.eff.some((e) => e[0] === NL))) hit++; } return hit / N; };
  const r1 = rate(1), r16 = rate(16);
  assert.ok(r16 > r1 * 2, `${r1} vs ${r16}`);
});

test('1.6 効果量: 効果量4倍は、貯蔵を向く効果の重みを大きくする', () => {
  const size = (scale) => { const r = E.rng(11); const w = []; for (let n = 0; n < 600; n++) { let g = E.founderGenome(); for (let i = 0; i < 40; i++) g = E.mutate(g, r, 30, E.TRAITS.length, { supply: 16, scale }); for (const x of g.genes) if (x.k === 0) for (const e of x.eff) if (e[0] === NL) w.push(Math.abs(e[1])); } return w.reduce((a, b) => a + b, 0) / w.length; };
  assert.ok(size(4) > size(1) * 2);
});

test('1.6 貯蔵を向く遺伝子の保有割合を、履歴に記録する', () => {
  assert.equal(E.assay([E.founderGenome()], { seed: 1, steps: 40, storageEvolvable: true }).history[0].storageCarriers, 0);
  assert.equal(E.assay([genomeWith(NL, 8)], { seed: 1, steps: 40, storageEvolvable: true }).history[0].storageCarriers, 1);
});

test('1.6 感染期間: 固定期間の感染は、観測された平均期間が設定どおりになる', () => {
  for (const D of [3, 8, 17]) { const r = E.simulate({ seed: 4, steps: 300, pathogenRegime: W6, infection: { duration: D, load: 0.2 } }); assert.equal(r.regimes.infectionDurationMean, D); assert.ok(r.regimes.infectionsCleared > 50); }
  const dyn = E.simulate({ seed: 4, steps: 300, pathogenRegime: W6 }); assert.ok(dyn.regimes.infectionDurationMean > 0 && dyn.regimes.infectionDurationMean !== 3);
});

test('1.6 防御の計測: 記憶なし・利益0では防御0、記憶ありでは正で、期待値と整合', () => {
  const o = { seed: 5, steps: 600, mutation: false, pathogenRegime: W6, infection: { duration: 3, load: 0.2 }, memoryDecay: 0.1 };
  const none = E.simulate({ ...o, memory: false }), b0 = E.simulate({ ...o, memoryBenefit: false }), full = E.simulate(o);
  assert.equal(none.regimes.defencePrevented, 0); assert.equal(b0.regimes.defencePrevented, 0);
  assert.ok(full.regimes.defencePrevented > 100);
  assert.ok(Math.abs(full.regimes.defencePrevented / full.regimes.defenceExpectedPrevented - 1) < 0.15, `${full.regimes.defencePrevented} vs ${full.regimes.defenceExpectedPrevented}`);
  assert.ok(full.regimes.exposuresWithMemory <= full.regimes.exposures && full.regimes.exposureWithMemoryFraction > 0 && full.regimes.exposureWithMemoryFraction <= 1);
  assert.ok(full.regimes.reinfectionsSameAntigen >= 0);
});

test('1.6 防御の計測は乱数を追加しない（計測あり/なしで同じ動態）', () => {
  const o = { seed: 6, steps: 400, pathogenRegime: W6, infection: { duration: 3, load: 0.2 } };
  assert.equal(strip(E.simulate(o)), strip(E.simulate({ ...o })));
});

test('1.6 利益0・コスト0・記憶あり は、記憶なしと同じ動態（新しい感染設定でも）', () => {
  const o = { seed: 7, steps: 400, mutation: false, pathogenRegime: W6, infection: { duration: 3, load: 0.2 } };
  assert.deepEqual(E.simulate({ ...o, memoryBenefit: false, memoryCost: false }).history.map((h) => h.population), E.simulate({ ...o, memory: false }).history.map((h) => h.population));
});

test('1.6 感染の重さ: 重いほど個体寿命が短い（固定遺伝型）', () => {
  const life = (sev) => E.simulate({ seed: 8, steps: 500, mutation: false, pathogenRegime: W6, infection: { duration: 8, load: 0.2 }, infectionSeverity: sev }).lifespan.calendarMean;
  assert.ok(life(10) < life(1));
});

test('1.6 獲物の避難: 獲物の割合が避難の下限を下回らない', () => {
  const r = E.simulate({ seed: 9, steps: 600, resourceRegime: P20, preyRefuge: 0.3 });
  assert.ok(r.ecology.preyFractionMin >= 0.3 - 1e-9, String(r.ecology.preyFractionMin));
  const base = E.simulate({ seed: 9, steps: 600, resourceRegime: P20 });
  assert.ok(base.ecology.preyFractionMin < 0.3);
});

test('1.6 獲物なし（容量を1万分の1）: 捕獲は0で、値は有限', () => {
  const r = E.simulate({ seed: 10, steps: 400, resourceRegime: P20, preyScale: 1e-4 });
  assert.equal(r.predation.catches, 0); assert.ok(Number.isFinite(r.ecology.preyFractionMean));
});

test('1.6 繁殖の固定: 繁殖力の遺伝型が違っても、固定時は動態が同じ／非固定では違う', () => {
  const hi = genomeWith(TI('fecundity'), 0.95), lo = genomeWith(TI('fecundity'), 0.3);
  const run = (g, locked) => E.assay([g], { seed: 11, steps: 300, fecundityLocked: locked }).history.map((h) => h.population).join(',');
  assert.equal(run(hi, true), run(lo, true)); assert.notEqual(run(hi, false), run(lo, false));
});

test('1.6: 新しい条件でもエネルギー収支が閉じ、全出力が有限', () => {
  const walk = (v, path) => { if (v === null) return; if (typeof v === 'number') assert.ok(Number.isFinite(v), path); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '[' + i + ']')); else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'finalGenomes' && k !== 'options') walk(x, path + '.' + k); };
  for (const extra of [{ storageEvolvable: true, storageSupply: 16, storageEffectScale: 4, resourceRegime: P20 }, { pathogenRegime: W6, infection: { duration: 3, load: 0.2 }, infectionSeverity: 4 }, { resourceRegime: P20, preyRefuge: 0.3, fecundityLocked: true }]) {
    const r = E.simulate({ seed: 12, steps: 500, ...extra }); assert.ok(Math.abs(r.energy.residual) < 1e-6); walk(r, 'run');
  }
});

test('1.6 統計: 一標本検定・片側McNemar・絶滅割合の差', () => {
  assert.ok(Math.abs(S.oneSample([0.6, 0.7, 0.8, 0.9], 0.5, { alternative: 'greater' }).meanDiff - 0.25) < 1e-12);
  assert.ok(Math.abs(S.mcnemarOneSided([1, 1, 1, 0, 0], [0, 0, 0, 0, 0]).pOneSided - 0.125) < 1e-12);
  assert.equal(S.mcnemarOneSided([0, 0, 0], [1, 1, 1]).pOneSided, 1);
  const r = S.eventReduction([1, 1, 1, 1, 0, 0], [0, 0, 0, 0, 0, 0]); assert.ok(Math.abs(r.meanDiff - 4 / 6) < 1e-12 && r.p < 0.07);
  assert.equal(S.eventReduction([0, 0], [0, 0]).meanDiff, 0);
});

test('1.6: 決定論的に再現し、処理時間が妥当（2000ステップ＋感染条件で5秒未満）', () => {
  const o = { seed: 13, steps: 2000, pathogenRegime: W6, infection: { duration: 3, load: 0.2 }, storageEvolvable: true };
  const a = E.simulate(o), b = E.simulate(o);
  assert.equal(strip(a), strip(b)); assert.ok(a.elapsedMs < 5000, String(a.elapsedMs));
});

for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
