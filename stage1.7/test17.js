'use strict';
// Stage 1.7 automated tests. Run from this folder: node test17.js
// Earlier suites are run separately: node test16.js (stage1.6), node test15.js (repository root), and the older ones.
const assert = require('node:assert/strict');
const E16 = require('../stage1.6/engine16'), E = require('./engine17'), S = require('../stage1.6/stats16');
const results = [];
function test(name, fn) { const t = Date.now(); try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.message).slice(0, 400)); process.exitCode = 1; } }
const P20 = { period: 20, pulseLength: 4 };
const run = (o) => E.simulate({ seed: 5, steps: 500, resourceRegime: P20, ...o });
const assay = (o) => E.assay([E.founderGenome()], { seed: 5, steps: 500, resourceRegime: P20, ...o }); // fixed genotype, no mutation: isolates the intervention from selection
const OLD_ECO = ['preyFractionMean', 'preyFractionMin', 'preyFractionEarly', 'earlyPopulationMax'];
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, s: r.switching, m: r.modeFractions, rg: r.regimes, eco: Object.fromEntries(OLD_ECO.map((k) => [k, r.ecology[k]])), pred: r.predation, g: r.finalGenomes.map((g) => g.genes), rep: r.reproduction, ex: r.extinctAt });

test('1.7→1.6: 既定値ではStage 1.6とビット単位で一致（6環境×7条件）', () => {
  const conds = [{}, { selection: false }, { resourceRegime: P20 }, { resourceRegime: P20, preyRefuge: 0.3 }, { resourceRegime: P20, fecundityLocked: true }, { storageEvolvable: true, storageSupply: 16, resourceRegime: P20 }, { pathogenRegime: { interval: 6, waveLength: 3, strength: 0.5, mode: 'same' }, infection: { duration: 3, load: 0.2 } }];
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of conds) { const o = { seed: 3, steps: 250, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E16.simulate(o)), `${env} ${JSON.stringify(extra).slice(0, 40)}`); }
});
test('1.7: 既定値を明示しても、省略したときと同じ', () => {
  const o = { seed: 4, steps: 400, resourceRegime: P20 };
  assert.equal(strip(E.simulate(o)), strip(E.simulate({ ...o, birthScale: 1, captureScale: 1, preyGrowthScale: 1, preyHidden: 0, preyInflow: 0 })));
});
test('1.7 出生数: birthScale は出生率を、0.5で下げ、2で上げる（個体あたり出生数で確認）', () => {
  const b = (s) => assay({ birthScale: s }).ecology.birthsPerIndividualStep;
  assert.ok(b(0.5) < b(1) && b(1) < b(2), `${b(0.5)} ${b(1)} ${b(2)}`);
  assert.ok(b(0.5) < b(1) * 0.75);
});
test('1.7 出生数: 子のエネルギーコストは変えない（収支が閉じる）', () => { for (const s of [0.25, 2]) assert.ok(Math.abs(run({ birthScale: s }).energy.residual) < 1e-6); });
test('1.7 捕食強度: captureScale は、狩りの成功を変える（固定遺伝型の個体あたり捕獲数）', () => {
  // 捕獲数は獲物の枯渇で頭打ちになる（それ自体が仮説の経路）。成功率の増加は、捕獲数の増加（0.5→1）と獲物の減少（1→2）として現れる。
  const e = (s) => assay({ captureScale: s }).ecology;
  assert.ok(e(0.5).catchesPerIndividualStep < e(1).catchesPerIndividualStep, `${e(0.5).catchesPerIndividualStep} ${e(1).catchesPerIndividualStep}`);
  assert.ok(e(0.5).preyFractionMin > e(1).preyFractionMin && e(1).preyFractionMin > e(2).preyFractionMin);
});
test('1.7 獲物の回復: preyGrowthScale は、獲物の産出を変える', () => {
  const g = (s) => assay({ preyGrowthScale: s }).ecology.preyProducedPerPatchStep;
  assert.ok(g(0.5) < g(1) && g(1) < g(3), `${g(0.5)} ${g(1)} ${g(3)}`);
});
test('1.7 保護のみ: 獲物は保護された数を下回らず、避難による補充は0で、保護された獲物は食料にならない', () => {
  const r = assay({ preyHidden: 0.3 });
  assert.ok(r.ecology.preyFractionMin >= 0.3 - 1e-9, String(r.ecology.preyFractionMin)); assert.equal(r.ecology.preyFloorAddedPerPatchStep, 0);
  assert.ok(assay({ preyHidden: 0.95 }).predation.catches < assay({ preyHidden: 0 }).predation.catches * 0.5);
});
test('1.7 食料のみ: 保護の下限は足さず（補充0）、捕獲できる獲物が増える', () => {
  const base = assay({}), inflow = assay({ preyInflow: 0.194 });
  assert.equal(inflow.ecology.preyFloorAddedPerPatchStep, 0); assert.ok(inflow.ecology.preyCaughtPerPatchStep > base.ecology.preyCaughtPerPatchStep);
});
test('1.7 避難（下限）は保護と食料の両方：補充が正で、下限0では0', () => {
  const r = { ecology: run({ steps: 1000, preyRefuge: 0.3 }).ecology }; assert.ok(r.ecology.preyFloorAddedPerPatchStep > 0.05, String(r.ecology.preyFloorAddedPerPatchStep)); assert.equal(assay({}).ecology.preyFloorAddedPerPatchStep, 0);
  assert.ok(r.ecology.preyFractionMin >= 0.3 - 1e-9);
});
test('1.7 計測: 個体・ステップあたりの量は、総数と整合する', () => {
  const r = run({}), e = r.ecology; assert.ok(Math.abs(e.birthsPerIndividualStep * e.personSteps - r.reproduction.totalBirths) < 1e-6);
  assert.ok(Math.abs(e.catchesPerIndividualStep * e.personSteps - r.predation.catches) < 1e-6);
});
test('1.7: 新しい条件でもエネルギー収支が閉じ、全出力が有限、決定論的に再現する', () => {
  const walk = (v, path) => { if (v === null) return; if (typeof v === 'number') assert.ok(Number.isFinite(v), path); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '[' + i + ']')); else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'finalGenomes' && k !== 'options') walk(x, path + '.' + k); };
  for (const extra of [{ birthScale: 2, captureScale: 2 }, { preyHidden: 0.3, preyInflow: 0.065 }, { preyGrowthScale: 3, preyRefuge: 0.3 }, { preyScale: 1e-4 }]) { const r = run(extra); assert.ok(Math.abs(r.energy.residual) < 1e-6); walk(r, 'run'); assert.equal(strip(r), strip(run(extra))); }
});
test('1.7: 処理時間が妥当（2000ステップ・介入あり・5秒未満）', () => { const r = E.simulate({ seed: 1, steps: 2000, resourceRegime: P20, birthScale: 2, preyInflow: 0.065 }); assert.ok(r.elapsedMs < 5000, String(r.elapsedMs)); });
test('1.7 統計: stage1.6の統計関数を読める', () => { assert.ok(Math.abs(S.eventReduction([1, 1, 1, 1, 0, 0], [0, 0, 0, 0, 0, 0]).meanDiff - 4 / 6) < 1e-12); });
for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
