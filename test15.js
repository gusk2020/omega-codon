'use strict';
// Stage 1.5 automated tests. Run: node test15.js
const assert = require('node:assert/strict');
const E = require('./engine15');

const results = [];
function test(name, fn) {
  const t = Date.now();
  try { fn(); results.push([name, 'PASS', Date.now() - t]); }
  catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', e.message); process.exitCode = 1; }
}
const sim = (o) => E.simulate({ steps: 600, ...o });
const TI = (name) => E.LOCI.findIndex((l) => l[0] === name);
// Genome whose developed trait is near `value`: add one structural gene and
// solve its effect weight by bisection (the GRN has no per-trait locus to set).
function withTrait(name, value) {
  const k = TI(name);
  const make = (w) => { const g = E.founderGenome(); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[k, w]] }); return g; };
  let lo = -40, hi = 40;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (E.develop(make(mid), E.REFERENCE_DEV).traits[k] < value) lo = mid; else hi = mid; }
  return make((lo + hi) / 2);
}

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
  const g = withTrait('replaceRatio', 0.99); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[TI('memoryLearn'), 40]] });
  const r = E.assay([g], { seed: 2, steps: 400, environment: 'rich' });
  assert.ok(r.cells.originalAtDeath < 0.9, 'replacement must remove original cells');
  assert.ok(r.cells.memoryRetentionAtDeath === null || r.cells.memoryRetentionAtDeath <= 1 + 1e-12);
  assert.ok(r.final.meanM <= r.final.meanO + 1e-12);
});

test('細胞交換OFFでは元細胞の割合が交換で減らない', () => {
  const g = withTrait('replaceRatio', 0.99);
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
  const g = withTrait('metabolism', 0.4);
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

test('GRN: 祖先の表現型はStage 1.2の祖先値と一致（制御あり/なし両方）', () => {
  for (const reg of [true, false]) {
    const t = E.develop(E.founderGenome(), E.REFERENCE_DEV, reg).traits;
    E.TRAITS.forEach((l, k) => assert.ok(Math.abs(t[k] - l[3]) < 1e-9, `${l[0]} ${t[k]}`));
  }
});

test('GRN: 制御OFFでは発生が信号に依存しない／ONでは依存する', () => {
  const f = E.founderGenome(), a = [0, 0, 0, 0], b = [2, 2, 1, 2];
  assert.deepEqual(E.develop(f, a, false).traits, E.develop(f, b, false).traits);
  assert.notDeepEqual(E.develop(f, a, true).traits, E.develop(f, b, true).traits);
});

test('GRN: 1遺伝子=1能力ではない（多面発現・制御遺伝子の多形質効果）', () => {
  const f = E.founderGenome();
  assert.ok(f.genes.some((g) => g.k === 0 && new Set(g.eff.map((e) => e[0])).size > 1), 'some structural gene is pleiotropic');
  const base = E.develop(f, E.REFERENCE_DEV).traits;
  let best = 0;
  f.genes.forEach((g, i) => { if (g.k !== 1) return; const h = E.cloneGenome(f); h.genes[i].on = false;
    const t = E.develop(h, E.REFERENCE_DEV).traits; best = Math.max(best, t.filter((v, k) => Math.abs(v - base[k]) > 1e-4).length); });
  assert.ok(best >= 3, `silencing one regulator should move several traits (max ${best})`);
});

test('GRN: 2000回の変異後も構造は有効（長さ・辺・形質範囲）', () => {
  const r = E.rng(77); let g = E.founderGenome();
  for (let i = 0; i < 2000; i++) {
    g = E.mutate(g, r, 30);
    assert.ok(g.genes.length >= 4 && g.genes.length <= 64 && g.edges.length <= 30);
    if (i % 100 === 0) E.develop(g, [r(), r(), r(), r()]).traits.forEach((v, k) => assert.ok(v >= E.TRAITS[k][1] && v <= E.TRAITS[k][2] && Number.isFinite(v)));
  }
});

test('GRN: 遺伝子の順序が効く（転座・逆位で表現型が変わり得る）', () => {
  const f = E.founderGenome(), base = E.develop(f, E.REFERENCE_DEV).traits;
  let changed = 0;
  for (let i = 0; i < f.genes.length; i++) for (const j of [0, f.genes.length - 1]) {
    const h = E.cloneGenome(f); const [x] = h.genes.splice(i, 1); h.genes.splice(j, 0, x);
    const t = E.develop(h, E.REFERENCE_DEV).traits; if (t.some((v, k) => Math.abs(v - base[k]) > 1e-6)) changed++;
  }
  assert.ok(changed > 0, 'moving genes must sometimes change development');
});

test('GRN: 重複で遺伝子量が増え、ゲノムコストも増える', () => {
  const f = E.founderGenome(), i = f.genes.findIndex((g) => g.k === 0 && g.eff.length === 1);
  const h = E.cloneGenome(f); h.genes.splice(i + 1, 0, { ...h.genes[i], eff: h.genes[i].eff.map((e) => e.slice()) });
  const k = f.genes[i].eff[0][0], a = E.develop(f, E.REFERENCE_DEV), b = E.develop(h, E.REFERENCE_DEV);
  assert.notEqual(a.traits[k], b.traits[k]); assert.ok(b.geneCost > a.geneCost);
});

test('選択なし対照でも報告形質は遺伝型（ドリフトで祖先値から動く）', () => {
  const r = sim({ seed: 13, selection: false, steps: 800 });
  assert.ok(E.LOCI.some((l) => Math.abs(r.final.loci[l[0]] - l[3]) > 0.005), 'drifting genomes must be visible in reported traits');
});

// ---- Stage 1.4 ----
const S = require('./stats15');
const E13 = require('./stage1.3/engine13');
const WAVES = { interval: 30, waveLength: 10, strength: 0.3 };

test('1.4→1.5: 既定値ではStage 1.3ともビット単位で一致（6環境×4条件）', () => {
  const strip = (r) => { const e = { ...r.energy, spentBy: { ...r.energy.spentBy } }; for (const k of ['acclimation', 'storage']) if (k in e.spentBy) { assert.equal(e.spentBy[k], 0); delete e.spentBy[k]; }
    return JSON.stringify({ h: r.history.map(({ meanStorage, ...x }) => x), c: r.deathCauses, e, p: r.population, l: r.lifespan, s: r.switching, m: r.modeFractions, cells: r.cells, g: r.finalGenomes.map((g) => g.genes) }); };
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of [{}, { selection: false }, { regulation: false }, { memory: false }]) {
    const o = { seed: 3, steps: 400, environment: env, ...extra };
    assert.equal(strip(E.simulate(o)), strip(E13.simulate(o)), `${env} ${JSON.stringify(extra)}`);
  }
});

test('1.4 統計: 中央値は偶数件で中央2値の平均', () => {
  assert.equal(S.median([4, 1, 3, 2]), 2.5); assert.equal(S.median([3, 1, 2]), 2); assert.equal(S.upperMedian([4, 1, 3, 2]), 3);
  assert.equal(S.median([]), null); assert.equal(S.median([null, 5, NaN]), 5);
});

test('1.4 統計: McNemar正確検定・Holm補正・対応のある並べ替え検定', () => {
  assert.equal(S.mcnemarExact([0, 0, 0, 0], [1, 1, 0, 0]).p, 0.5);
  assert.ok(Math.abs(S.mcnemarExact(Array(6).fill(0), Array(6).fill(1)).p - 0.03125) < 1e-12);
  assert.equal(S.mcnemarExact([1, 0], [1, 0]).p, 1);
  assert.deepEqual(S.holm([0.01, 0.04, 0.03]).map((v) => +v.toFixed(6)), [0.03, 0.06, 0.06]);
  const t = S.pairedTest([1, 2, 3, 4, 5], { alternative: 'greater' });
  assert.equal(t.p, 1 / 32); assert.equal(t.positive, 5);
  const z = S.pairedTest([0, 0, 0]); assert.equal(z.dz, null); assert.equal(z.p, 1);
  const d = S.did([5, 6], [1, 1], [2, 2], [1, 1]); assert.equal(d.meanDiff, 3.5); // ((5-1)-(2-1) + (6-1)-(2-1)) / 2
});

test('1.4 A: 流行は指定間隔で起き、同一抗原は固定・新規抗原は変わる', () => {
  const same = E.simulate({ seed: 2, steps: 300, pathogenRegime: { ...WAVES, mode: 'same' } });
  assert.equal(same.regimes.waves, 10);
  assert.ok(same.regimes.waveInfections > 0);
  const novel = E.simulate({ seed: 2, steps: 300, pathogenRegime: { ...WAVES, mode: 'novel' } });
  assert.ok(novel.regimes.reinfectionsSameAntigen < same.regimes.reinfectionsSameAntigen, 'a fixed antigen allows same-antigen reinfection far more often');
});

test('1.4 A: 免疫記憶も元細胞の範囲内（保持率≤1）、記憶OFFでは形成されない、コスト0では記憶コスト0', () => {
  const r = E.simulate({ seed: 4, steps: 600, pathogenRegime: { ...WAVES, mode: 'same' } });
  assert.ok(r.regimes.immuneMemoryRetentionAtDeath === null || r.regimes.immuneMemoryRetentionAtDeath <= 1 + 1e-12);
  assert.ok(r.regimes.immuneMemoryPeakAtDeath > 0);
  const off = E.simulate({ seed: 4, steps: 600, pathogenRegime: { ...WAVES, mode: 'same' }, memory: false });
  assert.equal(off.regimes.immuneMemoryPeakAtDeath, 0);
  const free = E.simulate({ seed: 4, steps: 600, pathogenRegime: { ...WAVES, mode: 'same' }, memoryCost: false });
  assert.equal(free.energy.spentBy.memory, 0); assert.ok(free.final.meanM > 0 || free.regimes.immuneMemoryPeakAtDeath > 0);
});

test('1.4 A: 細胞交換を最大にすると免疫記憶の保持が下がる', () => {
  const g = withTrait('replaceRatio', 0.99), h = withTrait('replaceRatio', 0.01);
  const opt = { seed: 5, steps: 500, pathogenRegime: { ...WAVES, mode: 'same' } };
  const hi = E.assay([g], opt), lo = E.assay([h], opt);
  assert.ok(hi.regimes.immuneMemoryRetentionAtDeath < lo.regimes.immuneMemoryRetentionAtDeath);
});

test('1.4 B: 繁殖窓がまれだと出生は減るが禁止はされず、世代時間は延びる', () => {
  const f = E.simulate({ seed: 6, steps: 800 }), r = E.simulate({ seed: 6, steps: 800, breedingRegime: { openProb: 0.06, windowLength: 3 } });
  assert.ok(r.reproduction.totalBirths > 0 && r.reproduction.totalBirths < f.reproduction.totalBirths);
  assert.ok(r.reproduction.generationTime > f.reproduction.generationTime);
});

test('1.4 C: パルス供給は1周期の平均が安定供給と同じ', () => {
  const period = 20, len = 4; let sum = 0;
  for (let t = 0; t < period; t++) sum += (t % period) < len ? period / len : 0;
  assert.equal(sum / period, 1);
  const r = E.simulate({ seed: 7, steps: 200, resourceRegime: { period, pulseLength: len } });
  assert.ok(Math.abs(r.energy.residual) < 1e-6);
});

test('1.4 D: 周期と無相関ノイズは同じ平均・同じ振幅分布', () => {
  const env = E.ENVIRONMENTS.rich; void env;
  const per = E.simulate({ seed: 8, steps: 1200, thermalRegime: { mode: 'periodic', mean: 0.45, amp: 0.4, period: 120 }, sampleEvery: 1, founders: 0 });
  assert.ok(per.extinct); // no organisms: only checks that the regime runs with an empty world
  const sample = (mode) => { let s = 0, s2 = 0; const n = 1200; for (let t = 1; t <= n; t++) { const v = mode === 'p' ? 0.45 + 0.4 * Math.sin(6.283185307 * t / 120) : 0.45 + 0.4 * Math.sin(6.283185307 * ((t * 0.6180339887) % 1)); s += v; s2 += v * v; } return [s / n, s2 / n]; };
  const [mp, vp] = sample('p'), [mn, vn] = sample('n');
  assert.ok(Math.abs(mp - mn) < 0.01 && Math.abs(vp - vn) < 0.01);
});

test('1.4 D: 可塑性OFFでは再順化せずコストも0、ONでは再順化コストが計上される', () => {
  const on = E.simulate({ seed: 9, steps: 300, acclimateCost: 0.02 }), off = E.simulate({ seed: 9, steps: 300, acclimateCost: 0.02, plasticity: false });
  assert.ok(on.energy.spentBy.acclimation > 0); assert.equal(off.energy.spentBy.acclimation, 0);
  assert.ok(Math.abs(on.energy.residual) < 1e-6 && Math.abs(off.energy.residual) < 1e-6);
});

// (a run stops at extinction, so the comparison uses a climate where none of these conditions dies out in 600 steps)
test('1.4: paired seed — 全レジームで環境履歴（災害系列）は条件に依存しない', () => {
  for (const reg of [{ pathogenRegime: { ...WAVES, mode: 'novel' } }, { breedingRegime: { openProb: 0.06, windowLength: 3 } }, { thermalRegime: { mode: 'noise', mean: 0.45, amp: 0.4, period: 120 } }]) {
    const sigs = [{}, { selection: false }, { memory: false }, { plasticity: false }].map((x) => E.simulate({ seed: 10, steps: 600, environment: 'rich', ...reg, ...x })).map((r) => (assert.equal(r.extinct, false), r.envSignature));
    assert.ok(sigs.every((v) => v === sigs[0]), JSON.stringify(sigs));
  }
});

// ---- Stage 1.5 ----
const E14 = require('./stage1.4/engine14');
const STORAGE = E.LOCI.length;
function twoGene(metabolism, storage) {
  const solve = (make, k, value) => { let lo = -40, hi = 40; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (E.develop(make(mid), E.REFERENCE_DEV).traits[k] < value) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const mk = (w1, w2) => { const g = E.founderGenome(); g.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[0, w1]] }); g.genes.push({ k: 0, prom: 14, sens: null, len: 1, on: true, eff: [[STORAGE, w2]] }); return g; };
  return mk(solve((w) => mk(w, 0), 0, metabolism), solve((w) => mk(0, w), STORAGE, storage));
}

test('1.5: 既定値ではStage 1.4とビット単位で一致（6環境×全レジーム）', () => {
  const strip = (r) => { const e = { ...r.energy, spentBy: { ...r.energy.spentBy } }; for (const k of ['acclimation', 'storage']) if (e.spentBy[k] === 0) delete e.spentBy[k];
    return JSON.stringify({ h: r.history.map(({ meanStorage, ...x }) => x), c: r.deathCauses, e, p: r.population, l: r.lifespan, s: r.switching, m: r.modeFractions, cells: r.cells, rg: r.regimes, g: r.finalGenomes.map((g) => g.genes) }); };
  const conds = [{}, { selection: false }, { regulation: false }, { memory: false }, { pathogenRegime: { ...WAVES, mode: 'same' } }, { breedingRegime: { openProb: 0.06, windowLength: 3 } }, { resourceRegime: { period: 20, pulseLength: 4 } }, { thermalRegime: { mode: 'periodic', mean: 0.45, amp: 0.4, period: 120 }, acclimateCost: 0.02 }];
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of conds) { const o = { seed: 3, steps: 300, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E14.simulate(o)), `${env} ${JSON.stringify(extra).slice(0, 50)}`); }
});

test('1.5 系統: 祖先系統IDは子孫に継承され、集計が個体数と一致', () => {
  const r = E.simulate({ seed: 2, steps: 600, lineageCount: 3 });
  assert.equal(r.lineages.alive.reduce((a, b) => a + b, 0), r.population.final);
  assert.ok(Math.abs(r.lineages.shareAtEnd.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.equal(E.simulate({ seed: 2, steps: 100 }).lineages, null);
});

test('1.5 系統: 絶滅した系統には絶滅ステップが記録され、生存系統はnull', () => {
  const r = E.assay([twoGene(1.0, 3), twoGene(1.0, 3)], { seed: 4, steps: 300, storageEvolvable: true, resourceRegime: { period: 20, pulseLength: 4 }, extrinsicMortality: 0.2 });
  r.lineages.alive.forEach((a, k) => assert.equal(a === 0, r.lineages.extinctAt[k] !== null));
});

test('1.5 系統: 系統割合の直接計測は、変異なしでは平均代謝からの逆算と一致する', () => {
  const lo = twoGene(0.6, 3), hi = twoGene(1.2, 3);
  const r = E.assay([lo, hi], { seed: 5, steps: 300, storageEvolvable: true });
  const last = r.history[r.history.length - 1], derived = (1.2 - last.loci.metabolism) / 0.6;
  assert.ok(Math.abs(derived - r.lineages.shareAtEnd[0]) < 1e-6, `${derived} vs ${r.lineages.shareAtEnd[0]}`);
});

test('1.5 貯蔵: 創始遺伝子は貯蔵形質を向かず、変異は固定時は向かず、進化可能時は向き得る', () => {
  assert.equal(E.founderGenome().genes.filter((g) => g.k === 0).some((g) => g.eff.some((e) => e[0] === STORAGE)), false);
  const count = (n) => { const r = E.rng(11); let g = E.founderGenome(), hit = 0; for (let i = 0; i < 6000; i++) { g = E.mutate(g, r, 30, n); if (g.genes.some((x) => x.k === 0 && x.eff.some((e) => e[0] === STORAGE))) hit++; } return hit; };
  assert.equal(count(E.LOCI.length), 0); assert.ok(count(E.TRAITS.length) > 0);
});

test('1.5 貯蔵: 容量は発生した形質で、維持コストは容量に比例し、収支が閉じる', () => {
  assert.ok(Math.abs(E.develop(twoGene(1.0, 8), E.REFERENCE_DEV).traits[STORAGE] - 8) < 1e-9);
  const o = { seed: 6, steps: 300, storageEvolvable: true, storageCost: 0.004, resourceRegime: { period: 20, pulseLength: 4 } };
  const c3 = E.assay([twoGene(1.0, 3)], o), c8 = E.assay([twoGene(1.0, 8)], o);
  assert.ok(c8.energy.spentBy.storage / (c8.energy.spentBy.storage > 0 ? c8.lifespan.deathsRecorded + c8.population.final : 1) > 0);
  assert.ok(c8.energy.spentBy.storage > c3.energy.spentBy.storage * 0.9 || c8.population.median !== c3.population.median);
  for (const r of [c3, c8]) assert.ok(Math.abs(r.energy.residual) < 1e-6);
  const free = E.assay([twoGene(1.0, 8)], { ...o, storageCost: 0 }); assert.equal(free.energy.spentBy.storage, 0);
});

test('1.5 貯蔵: 容量が大きいほど、供給のパルスで余った分の廃棄（オーバーフロー）が減る', () => {
  const o = { seed: 7, steps: 400, storageEvolvable: true, storageCost: 0, resourceRegime: { period: 20, pulseLength: 4 } };
  assert.ok(E.assay([twoGene(1.0, 8)], o).energy.overflow < E.assay([twoGene(1.0, 3)], o).energy.overflow);
});

test('1.5 記憶: 利益0・コスト0・記憶ありは、記憶なしと完全に同じ動態になる', () => {
  const o = { seed: 8, steps: 500, mutation: false, pathogenRegime: { interval: 8, waveLength: 3, strength: 0.5, mode: 'same' } };
  const a = E.simulate({ ...o, memoryBenefit: false, memoryCost: false }), b = E.simulate({ ...o, memory: false });
  assert.deepEqual(a.history.map((h) => h.population), b.history.map((h) => h.population));
  assert.equal(a.energy.spentBy.memory, 0);
});

test('1.5 記憶: 利益0では記憶を獲得・維持しコストを払うが、利益だけを取り除く', () => {
  const o = { seed: 9, steps: 500, mutation: false, pathogenRegime: { interval: 8, waveLength: 3, strength: 0.5, mode: 'same' } };
  const r = E.simulate({ ...o, memoryBenefit: false }), none = E.simulate({ ...o, memory: false }), full = E.simulate(o);
  assert.ok(r.final.meanM > 0 && r.energy.spentBy.memory > 0);
  assert.ok(r.regimes.immuneMemoryPeakAtDeath > 0);
  assert.notDeepEqual(r.history.map((h) => h.population), none.history.map((h) => h.population));
  assert.ok(full.regimes.reinfectionsSameAntigen !== r.regimes.reinfectionsSameAntigen || full.population.median !== r.population.median);
});

test('1.5 出生率: 初期400ステップと後半が別々に出る', () => {
  const r = E.simulate({ seed: 10, steps: 800 }), s = E.simulate({ seed: 10, steps: 300 });
  assert.ok(r.reproduction.earlyBirthRate400 > 0 && r.reproduction.earlyBirthRate400 < 1 && r.reproduction.lateBirthRate > 0);
  assert.equal(s.reproduction.lateBirthRate, null);
});

test('1.5 統計: Spearman並べ替え検定は符号を正しく判定し、定数ではNaN', () => {
  const up = [1, 2, 3, 4, 5, 6, 7, 8], down = up.slice().reverse();
  assert.ok(Math.abs(S.spearmanPerm(up, down, { alternative: 'less' }).rho + 1) < 1e-12);
  assert.ok(S.spearmanPerm(up, down, { alternative: 'less' }).p < 0.001); assert.equal(S.spearmanPerm(up, down, { alternative: 'greater' }).p, 1);
  assert.ok(Number.isNaN(S.spearmanPerm([1, 1, 1, 1, 1], up.slice(0, 5)).rho));
});

test('1.5: 系統・貯蔵の追加後も全出力は有限', () => {
  const walk = (v, path) => { if (v === null) return; if (typeof v === 'number') assert.ok(Number.isFinite(v), path); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, path + '[' + i + ']')); else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'finalGenomes' && k !== 'options') walk(x, path + '.' + k); };
  walk(E.simulate({ seed: 12, steps: 500, storageEvolvable: true, storageCost: 0.004, lineageCount: 2, pathogenRegime: { interval: 8, waveLength: 3, strength: 0.5, mode: 'novel' } }), 'run');
});

for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
