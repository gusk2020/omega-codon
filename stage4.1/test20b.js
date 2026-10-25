'use strict';
// Stage 2.0 tests (the new parts). The legacy path is covered by test20.js (the Stage 1.9D suite run against this code). Run from this folder:
//   node test20.js && node test20b.js
const assert = require('node:assert/strict');
const E7 = require('../stage1.7/engine17');
const E9D = require('../stage1.9d/engine19'), G9D = require('../stage1.9d/game');
const E = require('./engine19'), G = require('./game'), CIV = require('./civilization'), W = require('./world'), RK = require('./rank');
const results = [];
function test(name, fn) { const t = Date.now(); console.log('… ' + name.slice(0, 60)); try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 900)); process.exitCode = 1; } }
const full = (x) => JSON.stringify(x), evKey = (g) => JSON.stringify(g.events.map((e) => [e.t, e.kind, e.text]));
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, g: r.finalGenomes.map((x) => x.genes), eco: r.ecology, pred: r.predation, m: r.modeFractions });
const adv = (g, n) => { const target = g.t + n; while (g.t < target && !g.isOver && !g.pending) { g.advance(target - g.t); if (g.checkpoint) g.continueFromCheckpoint(); } return g.t; };
const mk = (traits) => G.makeGenome(E, { traits });
const ADAPT_CFG = { creatures: ['lowMetabolism'], rivals: ['hunter', 'highFecundity'], seed: 7, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive' };
const newAdaptive = (o = {}) => { const g = G.newGame(E, { ...ADAPT_CFG, ...o }); g.setAutoContinuous(true); return g; };

// ---------- compatibility ----------
test('2.0→1.7: 新しい部品は既定では何も変えない（文明の受け口が中立でも、異常細胞なしでも、Stage 1.7とビット単位で一致）', () => {
  const P = { period: 20, pulseLength: 4 };
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of [{}, { resourceRegime: P, lineageCount: 3 }, { preyRefuge: 0.3, resourceRegime: P }]) {
    const o = { seed: 4, steps: 300, environment: env, ...extra }, ref = strip(E7.simulate(o));
    assert.equal(strip(E.simulate(o)), ref, env); assert.equal(strip(E.simulate({ ...o, civ: true })), ref, env + ' civ-neutral');
    const l = E.simulate({ ...o, live: true }); l.step(300); assert.equal(strip(l.result()), ref, env + ' live');
  }
});
test('2.0 旧セーブ: Stage 1.9D（v5）のセーブも読み込めて、同じ状態・同じ出来事に戻り、旧い時間方式として動く', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 5, realms: true, scenario: 'kpg', ecology: 'v2' }, a = G9D.newGame(E9D, cfg); a.setAutoContinuous(true);
  let guard = 0; while (a.t < 2500 && guard++ < 200) { a.advance(Math.min(100, 2500 - a.t)); if (a.checkpoint) a.continueFromCheckpoint(); }
  const sv = JSON.parse(JSON.stringify(a.save())); assert.equal(sv.v, 5);
  const b = G.loadGame(E, sv); guard = 0; while (b.replayTo !== null && guard++ < 400) b.advance(50);
  assert.equal(b.t, a.t); assert.equal(full(b.live.stats()), full(a.live.stats())); assert.equal(evKey(b), evKey(a)); assert.equal(b.isAdaptive, false); assert.equal(b.worldInfo(), null);
  adv(a, 300); adv(b, 300); assert.equal(full(b.live.stats()), full(a.live.stats()), 'and they keep matching');
});

// ---------- individuals: cost, abnormal cells ----------
test('異常細胞：細胞の入れ替えが多いほど増え、免疫による監視が弱いと大きくなって死因になる。既定では無効', () => {
  const run = (traits, ab) => E.simulate({ seed: 3, steps: 1500, environment: 'rich', founders: 60, resourceScale: 3, mutation: false, founderGenomes: [mk(traits)], abnormal: ab, extrinsicMortality: 0.0005, maxPopulation: 300 });
  const base = run({ metabolism: 0.5, repairRate: 0.8, immune: 0.5 }, null); assert.equal(base.deathCauses.abnormal, undefined, 'off by default: no such cause');
  const lowRep = run({ metabolism: 0.5, repairRate: 0.8, immune: 0.5, replaceRatio: 0.05 }, true), hiRep = run({ metabolism: 0.5, repairRate: 0.8, immune: 0.5, replaceRatio: 0.95 }, true);
  assert.ok((hiRep.deathCauses.abnormal || 0) > 5 * (lowRep.deathCauses.abnormal || 0) + 20, `renewal costs: ${hiRep.deathCauses.abnormal} vs ${lowRep.deathCauses.abnormal}`);
  const strong = run({ metabolism: 0.5, repairRate: 0.8, immune: 0.95, replaceRatio: 0.95 }, true), weak = run({ metabolism: 0.5, repairRate: 0.8, immune: 0.05, replaceRatio: 0.95 }, true);
  assert.ok((weak.deathCauses.abnormal || 0) > (strong.deathCauses.abnormal || 0), `surveillance helps: ${weak.deathCauses.abnormal} vs ${strong.deathCauses.abnormal}`);
  assert.ok(Math.abs(hiRep.energy.residual) < 1e-6 && Math.abs(strong.energy.residual) < 1e-6, 'the energy ledger still closes');
  const l = E.simulate({ seed: 1, steps: 1e9, founders: 20, live: true, abnormal: true }); l.step(200); assert.ok(l.individuals().every((x) => x.A >= 0 && x.A <= 3));
});
test('長寿型と繁殖型：どちらが有利かは条件しだい（隠れた補正なし）。同じ餌を奪い合うと繁殖型が圧倒し、周期的な飢えのもとでは長寿型が勝つ回がある', () => {
  const longLived = mk({ metabolism: 0.5, repairRate: 0.8, immune: 0.6, fecundity: 0.25, replaceRatio: 0.3, tolerance: 0.7, dormancyDepth: 0.1 }), repro = mk({ fecundity: 0.9 });
  const duel = (seed, res, reg) => { const r = E.simulate({ seed, steps: 3000, environment: 'rich', resourceScale: res, resourceRegime: reg, extrinsicMortality: 0.002, lineageCount: 2, founderGenomes: [longLived, repro], founderCounts: [50, 50], mutation: false, abnormal: true, maxPopulation: 800, sampleEvery: 3000 }), a = r.lineages.alive, t = a[0] + a[1]; return t ? a[0] / t : null; };
  let reproWins = 0; for (let s = 1; s <= 6; s++) if (duel(s, 1, { period: 20, pulseLength: 4 }) < 0.25) reproWins++;
  assert.ok(reproWins >= 5, `with shared food and short pulses the reproducer should usually win (${reproWins}/6)`);
  let longWins = 0; for (let s = 1; s <= 6; s++) { const sh = duel(s, 0.5, { period: 150, pulseLength: 10 }); if (sh !== null && sh > 0.75) longWins++; }
  assert.ok(longWins >= 1, `under long famines the long-lived type wins in some runs (${longWins}/6)`);
  const iso = (g) => E.simulate({ seed: 1, steps: 1500, environment: 'rich', extrinsicMortality: 0.002, founders: 80, founderGenomes: [g], mutation: false, abnormal: true, maxPopulation: 800, sampleEvery: 1500 });
  const a = iso(longLived), b = iso(repro); assert.ok(a.lifespan.calendarMean > 1.4 * b.lifespan.calendarMean, 'the long-lived type really lives longer, and pays for it elsewhere');
});

// ---------- world: time base, climate, civilisation ----------
test('世界の時計：年は「計算したステップ×30日」＋「跳躍で進めた年」と一致し、世代は計算した分だけ。跳躍の間、個体の年齢は進まない', () => {
  const g = newAdaptive(); adv(g, 14000); const wi = g.worldInfo(), st = g.live.stats();
  assert.ok(wi.leaps > 0 && wi.leapYears > 1e6, 'it leaps'); assert.ok(Math.abs(wi.years - (wi.simulatedYears + wi.leapYears)) / wi.years < 1e-9, `years add up: ${wi.years} vs ${wi.simulatedYears + wi.leapYears}`);
  assert.ok(Math.abs(wi.simulatedYears - st.t * W.YEARS_PER_STEP) < 1e-6); assert.equal(wi.daysPerStep, 30);
  assert.ok(wi.generations > 100 && wi.generations < st.t / 5, 'generations are the simulated ones'); assert.ok(wi.skippedGenerations > 100 * wi.generations, 'skipped generations are reported apart, as an estimate');
  const live = g.live, ages = new Map(live.individuals().map((x) => [x.id, x.age])); live.leap({ steps: 100, growth: [0, 0, 0, 0, 0], recordAge: [100000, 100000, 100000, 100000, 100000] });
  for (const x of live.individuals()) if (ages.has(x.id)) assert.equal(x.age, ages.get(x.id), 'a leap does not age anybody');
});
test('跳躍：進化はしない（子孫は親と同じ遺伝子）、収支は閉じる、記録より長い期間は個体が生き延びない、減り続ける系統だけ絶える', () => {
  const live = E.simulate({ seed: 2, steps: 1e9, environment: 'rich', founders: 150, lineageCount: 2, founderCounts: [75, 75], founderGenomes: [mk({}), mk({ fecundity: 0.8 })], live: true, civ: true, realms: true, maxPopulation: 1000 });
  live.step(600); const before = live.individuals(), gs = new Set(before.map((x) => x.genes + ':' + x.lin)); const counts0 = live.stats().lineageAlive.slice();
  const rep = live.leap({ steps: 1e7, growth: [0, -0.01], minKeep: 3, recordAge: [Math.max(...before.map((x) => x.age)) + 1e8, 50] });
  const after = live.individuals(), st = live.stats();
  assert.equal(st.lineageAlive[0], counts0[0], 'a steady lineage keeps its numbers'); assert.equal(st.lineageAlive[1], 0, 'a lineage that was falling is extinct after a very long leap'); assert.deepEqual(rep.extinct, [1]);
  for (const x of after) assert.ok(gs.has(x.genes + ':' + x.lin), 'no new genes appear in a leap');
  assert.ok(after.filter((x) => x.age === 0).length >= counts0[0] - before.filter((x) => x.age + 1e7 <= Math.max(...before.map((y) => y.age)) + 1e8).length, 'the replaced individuals are newborn'); assert.ok(Math.abs(live.result().energy.residual) < 1e-6, 'ledger closes');
  const r2 = live.leap({ steps: 5, growth: [0, 0], recordAge: [1e9, 1e9] }); assert.equal(r2.reseeded[0], 0, 'a short leap within the recorded lifespan carries everybody across'); assert.equal(r2.kept[0], st.lineageAlive[0]);
});
test('特別に長寿な個体がいる間は、時間を跳躍せず1ステップずつ進む', () => {
  assert.equal(G.leapBlocker([{ lin: 0, age: 300 }, { lin: 1, age: 50 }], () => 25), null, 'under 400 steps: not exceptional');
  assert.deepEqual(G.leapBlocker([{ lin: 0, age: 450 }], () => 25), { lin: 0, age: 450 }); assert.equal(G.leapBlocker([{ lin: 0, age: 450 }], () => 200), null, 'a lineage that normally lives long is not blocked by ordinary members');
  assert.deepEqual(G.leapBlocker([{ lin: 0, age: 900 }], () => 200), { lin: 0, age: 900 });
});
test('可変時間の収束：刻みを細かくしても世界モデルの結果がほぼ同じ（1回の大きな刻み／8分割／64分割）', () => {
  const mkw = () => { const w = W.create(3, { noise: false }); w.civ.civ = { id: 1, born: 0, N: 0.2, T: 3, S: 0.8, peakN: 0.2, peakT: 3, collapses: 0, phase: 'rise', stance: {}, known: {}, war: 0, attackTaken: 0, cogAtBirth: 0.5, legacyAtBirth: 0, stockAtBirth: 1 }; return w; };
  const ctx = { cog: 0.5, biomass: 0.7, prod: 1, warm: 0 }, total = 6000, outs = [];
  for (const parts of [1, 8, 64]) { const w = mkw(); for (let k = 0; k < parts; k++) CIV.step(w.civ, total / parts, ctx); const c = w.civ.civ, r = w.civ.residue; outs.push([c ? c.N : 0, c ? c.T : 0, c ? c.S : 1, r.pollution, r.conv[1], r.stock]); }
  for (let k = 0; k < 6; k++) { const ref = outs[2][k], scale = Math.max(0.05, Math.abs(ref)); assert.ok(Math.abs(outs[0][k] - ref) / scale < 0.06, `coarse vs fine, var ${k}: ${outs[0][k]} vs ${ref}`); assert.ok(Math.abs(outs[1][k] - ref) / scale < 0.04, `8 vs 64, var ${k}: ${outs[1][k]} vs ${ref}`); }
  // the stepper never takes a step it cannot justify: tightening the tolerance moves the answer by little
  const a = mkw(), b = mkw(); CIV.integrate(a.civ, { prod: 1, war: 0 }, 6000, 0.05); CIV.integrate(b.civ, { prod: 1, war: 0 }, 6000, 0.002); assert.ok(Math.abs(a.civ.civ.N - b.civ.civ.N) < 0.02 && Math.abs(a.civ.civ.T - b.civ.civ.T) < 0.1);
});
test('跳躍の長さは、出来事を飛び越えないよう自動で短くなる（出現・天体衝突の期待数、文明がいる間の上限）', () => {
  const w = W.create(5), ctx = { cog: 0.6, biomass: 0.8 }; w.civ.lastEndOrStart = 0; w.years = 5e7;
  for (const cog of [0.3, 0.5, 0.7]) { const c = { cog, biomass: 0.8 }, h = W.safeLeap(w, c), amb = W.ambient(w), lam = CIV.emergenceRate(w.civ, { cog, biomass: 0.8, prod: amb.prod, warm: amb.warm }); assert.ok(lam * h <= 0.31, `expected emergences per leap ${lam * h}`); assert.ok((w.par.impactRate + w.par.volcRate) * h <= 0.26, 'expected catastrophes per leap'); }
  const g = W.safeLeap(w, { cog: 0.9, biomass: 1 }), rate = 0.3 / CIV.emergenceRate(w.civ, { cog: 0.9, biomass: 1, prod: W.ambient(w).prod, warm: 0 }); assert.ok(g <= rate + 1);
  w.civ.civ = { id: 1, born: 0, N: 0.3, T: 4, S: 0.8, peakN: 0.3, peakT: 4, collapses: 0, phase: 'rise', stance: {}, known: {}, war: 0, attackTaken: 0 }; assert.ok(W.safeLeap(w, ctx) <= 4000, 'while a civilisation lives, leaps are short');
});
test('文明：10億年の間に何度も出現・崩壊・滅亡し、周期的ではなく、影響は残り、世界は続く（8シード）', () => {
  const ctx = { cog: 0.55, biomass: 0.7 }; let total = 0, multi = 0, afterEnd = 0, ends = 0, polluted = 0, decayed = 0; const gaps = [];
  for (let seed = 1; seed <= 8; seed++) {
    const w = W.create(seed); let lastEmerge = null; const ems = [];
    while (w.years < 1e9) { const h = Math.min(W.safeLeap(w, ctx), 1e9 - w.years), ev = W.advance(w, h, ctx); for (const e of ev) if (e.kind === 'civ-emerge') ems.push(w.years); }
    total += w.civ.count; if (w.civ.count >= 2) multi++; for (let i = 1; i < ems.length; i++) gaps.push(ems[i] - ems[i - 1]);
    for (const h of w.civ.history) { ends++; if (h.residue.pollution > 0.05) polluted++; }
    afterEnd += w.civ.count > w.civ.history.length ? 0 : 1; assert.ok(w.civ.residue.pollution < 2.5);
  }
  assert.ok(total >= 20, `civilisations in 8 Gyr of worlds: ${total}`); assert.ok(multi >= 6, `worlds with several: ${multi}/8`); assert.ok(ends >= 15 && polluted >= 5, `ended ${ends}, left pollution ${polluted}`);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length, sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length); assert.ok(sd / mean > 0.4, `not periodic: CV ${(sd / mean).toFixed(2)}`);
  // what a civilisation leaves behind fades slowly and the mineable stock does not come back
  const w = W.create(3, { noise: false }); w.civ.residue.pollution = 1; w.civ.residue.stock = 0.5; w.civ.residue.conv = [0.3, 0.6, 0.2, 0.3]; for (let i = 0; i < 100; i++) CIV.step(w.civ, 10000, { cog: 0.3, biomass: 0.5, prod: 1, warm: 0 });
  assert.ok(w.civ.residue.pollution < 0.1 && w.civ.residue.pollution > 0, 'pollution decays over ~1e6 years'); assert.equal(w.civ.residue.stock, 0.5, 'the used stock does not come back');
});
test('文明の出現は、生物圏の認知能力・気候・汚染・前の文明の遺産に実際に左右される（決まった周期ではない）', () => {
  const w = W.create(1); w.civ.years = 1e8; w.civ.lastEndOrStart = 0; const r = (c) => CIV.emergenceRate(w.civ, { cog: 0.55, biomass: 0.7, prod: 1, warm: 0, ...c });
  assert.ok(r({ cog: 0.7 }) > r({ cog: 0.5 }) && r({ cog: 0.5 }) > r({ cog: 0.3 }), 'more cognitive life, more often'); assert.equal(r({ warm: 14 }), 0, 'too hot: none'); assert.ok(r({ prod: 0.3 }) < r({ prod: 1 }), 'poor land: less');
  assert.ok(r({ biomass: 0.2 }) < r({ biomass: 1 }), 'thin biosphere: less'); const base = r({}); w.civ.residue.pollution = 1; assert.ok(r({}) < base, 'pollution blocks'); w.civ.residue.pollution = 0; w.civ.residue.legacy = 0.8; assert.ok(r({}) > base, 'ruins help the next one');
  w.civ.residue.legacy = 0; w.civ.years = 1e8 + 1e5; w.civ.lastEndOrStart = 1e8; assert.ok(r({}) < 0.02 * base, 'just after a civilisation ended, the next is far less likely');
});

// ---------- pressure on life, strategies ----------
function pressured(g, strat, seed, cap, steps = 700) {
  const live = E.simulate({ seed, steps: 1e9, environment: 'rich', founders: 150, founderGenomes: [g], mutation: false, live: true, civ: true, abnormal: true, realms: { start: [1] }, maxPopulation: 2000 });
  live.setStance(0, { none: 0, flee: 1, coexist: 2, defend: 3, attack: 4 }[strat]); live.setCiv({ cap: [cap], harm: [0.004, 0.02, 0.003, 0.005], press: [0.15, 1, 0.1, 0.3] }); live.step(steps);
  const st = live.stats(), res = live.result(), tk = live.civTake(); return { rate: (st.causes.civilization || 0) / res.ecology.personSteps * 100, pop: st.population, safe: (st.realmAlive[0][0] + st.realmAlive[2][0]) / Math.max(1, st.population), vig: res.energy.spentBy.vigilance || 0, atk: tk.attack[0].reduce((a, b) => a + b, 0), dead: st.population === 0 };
}
const avgOf = (g, s, cap, N = 4) => { const o = { rate: 0, pop: 0, safe: 0, vig: 0, atk: 0, dead: 0 }; for (let seed = 1; seed <= N; seed++) { const r = pressured(g, s, seed, cap); for (const k of Object.keys(o)) o[k] += +r[k] / N; } return o; };
test('文明の圧力は生物に作用する：捕獲が死因になり、生息地の改変と損傷が数と状態を悪くする。圧力ゼロなら何も起きない', () => {
  const g = mk({}), mkl = (cap, res, harm) => { const l = E.simulate({ seed: 2, steps: 1e9, environment: 'rich', founders: 100, founderGenomes: [g], mutation: false, live: true, civ: true, realms: { start: [1] }, maxPopulation: 1500 }); l.setCiv({ cap: [cap], res, harm }); l.step(600); return l; };
  const none = mkl([0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]), cap = mkl([0.01, 0.05, 0.01, 0.01], [1, 1, 1, 1], [0, 0, 0, 0]), res = mkl([0, 0, 0, 0], [1, 0.3, 1, 1], [0, 0, 0, 0]), harm = mkl([0, 0, 0, 0], [1, 1, 1, 1], [0.03, 0.04, 0.03, 0.03]);
  assert.equal(none.stats().causes.civilization || 0, 0); assert.ok(cap.stats().causes.civilization > 300, 'captured'); assert.ok(cap.stats().meanLifespan < 0.8 * none.stats().meanLifespan, `captured individuals live shorter: ${cap.stats().meanLifespan} vs ${none.stats().meanLifespan} (numbers are refilled by births, so the effect shows in lifespans)`);
  assert.ok(res.stats().population < 0.8 * none.stats().population, 'habitat conversion lowers the numbers'); assert.ok(harm.individuals().reduce((a, x) => a + x.damage, 0) / harm.stats().population > 1.3 * none.individuals().reduce((a, x) => a + x.damage, 0) / none.stats().population, 'harm shows up as damage');
});
test('4つの戦略：効き目は能力と状況に左右される（逃避・防御・攻撃・共存）。選んだだけでは成功しない', () => {
  const CAP = [0.01, 0.06, 0.01, 0.02], mover = mk({ movement: 0.95 }), immobile = mk({ movement: 0.05 }), tank = mk({ tolerance: 0.9, immune: 0.8, repairRate: 0.9 }), frail = mk({ tolerance: 0.05, immune: 0.1, repairRate: 0.1 });
  const m0 = avgOf(mover, 'none', CAP), m1 = avgOf(mover, 'flee', CAP), i0 = avgOf(immobile, 'none', CAP), i1 = avgOf(immobile, 'flee', CAP);
  assert.ok(m1.rate < 0.92 * m0.rate && m1.safe > m0.safe + 0.05, `flee helps one who can move: ${m1.rate.toFixed(2)} vs ${m0.rate.toFixed(2)}, safe share ${m1.safe.toFixed(2)} vs ${m0.safe.toFixed(2)}`);
  assert.ok(Math.abs(i1.rate - i0.rate) / i0.rate < 0.06 && i0.dead > 0.99 && i1.dead > 0.99, `flee does not rescue one that cannot move: ${i1.rate.toFixed(2)} vs ${i0.rate.toFixed(2)}, extinct ${i0.dead}/${i1.dead}`);
  const t0 = avgOf(tank, 'none', CAP), t1 = avgOf(tank, 'defend', CAP), f0 = avgOf(frail, 'none', CAP), f1 = avgOf(frail, 'defend', CAP);
  assert.ok(t1.rate < 0.9 * t0.rate && t1.vig > 0, `defend lowers the capture rate and costs vigilance energy: ${t1.rate.toFixed(2)} vs ${t0.rate.toFixed(2)}, vigilance ${t1.vig.toFixed(1)}`);
  assert.ok((t0.rate - t1.rate) / t0.rate > (f0.rate - f1.rate) / f0.rate - 0.02, 'defence pays off at least as much for a robust body as for a frail one');
  const hunter = mk({ predation: 0.95 }), nonHunter = mk({ predation: 0.02 }), h1 = avgOf(hunter, 'attack', CAP), n1 = avgOf(nonHunter, 'attack', CAP), h0 = avgOf(hunter, 'none', CAP);
  assert.ok(h1.atk > 20 * Math.max(1, n1.atk), `attack power comes from predators: ${h1.atk.toFixed(0)} vs ${n1.atk.toFixed(0)}`); assert.ok(h1.rate > 0.97 * h0.rate, 'attackers draw retaliation: no safer than doing nothing');
  const lowC = { civ: 0 }; const w = W.create(1); const mkc = (T) => { w.civ.civ = { id: 1, born: 0, N: 0.5, T, S: 0.8, peakN: 0.5, peakT: T, collapses: 0, phase: 'rise', stance: {}, known: {}, war: 0, attackTaken: 0 }; return w.civ.civ; };
  const c3 = mkc(3), a3 = CIV.applyAttack(w.civ, 20000, 25); const n3 = c3.N; const c8 = mkc(8), a8 = CIV.applyAttack(w.civ, 20000, 25); assert.ok(a3 > 3 * a8, `the same attack does far less to a machine civilisation: ${a3} vs ${a8}`); assert.ok(n3 < 0.5 && c8.N < 0.5);
});
test('共存：文明が「役に立ち、脅威でない」と見なした系統だけが、支援と引き換えに捕獲が減る。捕食の強い系統は敵対のまま', () => {
  const w = W.create(1); w.civ.civ = { id: 1, born: 0, N: 0.4, T: 3, S: 0.9, peakN: 0.4, peakT: 3, collapses: 0, phase: 'rise', stance: {}, known: {}, war: 0, attackTaken: 0 };
  const mkp = (pred, fec) => ({ total: 100, abund: [0, 100, 0, 0], traits: { predation: pred, fecundity: fec, movement: 0.5, tolerance: 0.4, immune: 0.4, repair: 0.5, cog: 0.5 } });
  const farm = [mkp(0.1, 0.9), mkp(0.9, 0.3)], hostile = CIV.effects(w.civ, farm, ['none', 'none'], { prod: 1 }), co = CIV.effects(w.civ, farm, ['coexist', 'coexist'], { prod: 1 });
  assert.equal(co.stances[0], 'coexist'); assert.ok(co.subsidy[0][1] > 0 && co.cap[0][1] < hostile.cap[0][1] + 1e-9 || hostile.stances[0] === 'use', 'a useful, harmless lineage is helped'); assert.equal(co.stances[1], 'hostile', 'a strong predator is not');
  assert.equal(co.subsidy[1].reduce((a, b) => a + b, 0), 0, 'no help for it'); assert.ok(hostile.stances[0] !== 'coexist', 'without the policy it is not coexistence');
  const rich = E.simulate({ seed: 1, steps: 1e9, founders: 60, live: true, civ: true, realms: { start: [1] }, founderGenomes: [mk({})] }); rich.setCiv({ subsidy: [[0, 0.05, 0, 0]] }); rich.step(300); assert.ok(rich.result().energy.intakePlant > 0 && Math.abs(rich.result().energy.residual) < 1e-6, 'the subsidy is booked as intake: the ledger closes');
});

// ---------- game: control, strategies, save/load, units, rank ----------
test('操作する系統を切り替えても世界はリセットされない。方針は系統ごとに保持され、切り替えは保存・読込で再現する', () => {
  const g = newAdaptive(); adv(g, 6500); const st0 = g.live.stats(), y0 = g.worldInfo().years, alive = st0.lineageAlive.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0); assert.ok(alive.length >= 2, 'two living lineages are needed');
  const from = g.controlled, to = alive.find((i) => i !== from); assert.ok(g.setControlled(to)); assert.equal(g.controlled, to); assert.equal(g.t, st0.t); assert.equal(g.worldInfo().years, y0, 'world untouched');
  assert.ok(g.setStrategy(to, 'defend')); assert.ok(g.setStrategy(from, 'flee')); assert.deepEqual([g.strategies()[to], g.strategies()[from]], ['defend', 'flee']); assert.equal(g.setStrategy(to, 'defend'), false, 'no change, no log'); assert.equal(g.setControlled(99), false);
  adv(g, 800); const sv = JSON.parse(JSON.stringify(g.save())); assert.equal(sv.v, 6); assert.ok(sv.log.some((e) => e.kind === 'control') && sv.log.some((e) => e.kind === 'strategy'));
  const b = G.loadGame(E, sv); let guard = 0; while (b.replayTo !== null && guard++ < 2000) b.advance(100); assert.equal(b.t, g.t); assert.equal(full(b.live.stats()), full(g.live.stats())); assert.equal(b.controlled, g.controlled); assert.deepEqual(b.strategies(), g.strategies());
  assert.equal(full({ ...b.worldInfo(), emergenceRate: 0 }), full({ ...g.worldInfo(), emergenceRate: 0 })); assert.equal(evKey(b), evKey(g));
  adv(g, 400); adv(b, 400); assert.equal(full(b.live.stats()), full(g.live.stats()), 'and they keep matching');
});
test('再現性：停止位置が違っても同じ状態（跳躍・文明・背景を含む）。同じシードは同じ世界、違うシードは違う世界', () => {
  const a = newAdaptive(), b = newAdaptive(), c = newAdaptive({ seed: 8 }); let t = 0; while (t < 9000) { const n = Math.min(137, 9000 - t); b.advance(n); if (b.checkpoint) b.continueFromCheckpoint(); t = b.t; }
  adv(a, 9000); assert.equal(a.t, b.t); assert.equal(full(a.live.stats()), full(b.live.stats())); assert.equal(evKey(a), evKey(b)); assert.equal(a.worldInfo().years, b.worldInfo().years);
  adv(c, 9000); assert.notEqual(full(a.live.stats()), full(c.live.stats()));
});
test('Uの表示：アリーナの実個体と背景の単位は別々に数え、領域ごとの合計が全体と一致する。世界全体の個体数は作らない', () => {
  const g = newAdaptive(); adv(g, 3000); const U = g.units(), st = g.live.stats(); let arena = 0, bg = 0;
  for (let r = 0; r < 4; r++) for (const c of U.realms[r]) { arena += c.arenaIndividuals; bg += c.backgroundUnits; } assert.equal(arena, st.population); assert.ok(Math.abs(bg - U.backgroundUnits) < 1e-6); assert.equal(U.perUnit, 10); assert.ok(/世界全体の個体数は示しません/.test(U.note)); assert.equal(U.worldPopulation, undefined);
});
test('ランク：個体の自力の生存から決まる。「文明の敵意を支援なしで生き延びた回数」は計算した回数だけ。知能・文明・個体数では上がらない', () => {
  const ax = (tiers) => ({ alive: 50, observedSteps: 9000, continuity: 700, aging: { value: tiers.aging ?? null, young: 999, old: 999 }, repair: { value: tiers.repair ?? null }, efficiency: { value: tiers.eff ?? null, intakeRatio: 1 }, range: { value: 2 }, dormancy: { value: null, episodes: 0 }, competition: { value: 0 }, ...(tiers.ind !== undefined ? { independence: { value: tiers.ind } } : {}) });
  const without = RK.evaluate(ax({})), withInd = RK.evaluate(ax({ ind: 4 })), noModel = RK.evaluate(ax({}));
  const indAx = withInd.axes.find((a) => a.id === 'independence'); assert.equal(indAx.tier, 3); assert.equal(without.axes.find((a) => a.id === 'independence').tier, null, 'not scored where it is not computed');
  assert.ok(withInd.K[3] >= without.K[3] + 1 && withInd.rankIndex >= without.rankIndex); assert.equal(noModel.omega.judgeable, false); assert.equal(RK.evaluate({ ...ax({}), alive: 3 }).judged, false);
  const g = newAdaptive(); adv(g, 12000); const byLin = g.rank.byLin; assert.ok(Object.keys(byLin).length >= 3, 'ranks are kept per lineage');
  for (const l of Object.values(byLin)) if (l.best && l.current) assert.ok(l.best.rankIndex >= l.current.rankIndex, 'best ever never falls below current');
  const i1 = g.rank.lineages.find((l) => l.lin === g.controlled); if (i1 && i1.judged) assert.ok(i1.axes.some((a) => a.id === 'independence')); assert.ok(g.rank.best === null || g.rank.best.rank !== 'Ω');
});
test('進行：固定ステップの終わりはなく、節目で止まり、続行・保存・やり直しができる。次の出来事まで早送りしても出来事を見落とさない', () => {
  const g = newAdaptive({ checkpoint: { first: 2500, every: 2000 } }); g.advance(6000); if (g.checkpoint && g.checkpoint.kind === 'focus-extinct') { g.continueFromCheckpoint(); g.advance(6000); } assert.ok(g.checkpoint && g.checkpoint.kind === 'interval' && g.checkpoint.t === 2500 && g.t === 2500, 'it stops at the first checkpoint'); const s0 = full(g.live.stats()); g.advance(500); assert.equal(full(g.live.stats()), s0, 'nothing changes while paused');
  assert.ok(g.continueFromCheckpoint()); let n = 0; while (g.t < 9000 && n++ < 400) { g.advance(100); if (g.checkpoint) g.continueFromCheckpoint(); } assert.ok(g.t >= 9000 && !g.isOver, 'no fixed end');
  // fast-forward: stepping in small pieces from the same start and stopping at the first civ/world/lineage event finds the same first event as one long advance
  const f1 = newAdaptive(), f2 = newAdaptive(); const first = (g, chunk) => { const n0 = g.events.length; let k = 0; while (k++ < 4000 && !g.isOver) { g.advance(chunk); if (g.checkpoint) g.continueFromCheckpoint(); const e = g.events.slice(n0).find((x) => ['civ', 'world'].includes(x.kind)); if (e) return [e.t, e.text]; } return null; };
  const e1 = first(f1, 25), e2 = first(f2, 300); assert.ok(e1, 'a civ/world event comes'); assert.equal(e1[1], e2[1], 'same first event whichever way it is stepped to'); assert.ok(e1[0] <= e2[0], 'and the fine stepping is never later');
});
test('性能：可変時間（文明・跳躍つき）の5000ステップが妥当な時間で進む', () => {
  const g = newAdaptive(); const t0 = Date.now(); adv(g, 5000); const ms = Date.now() - t0; console.log('   5000 steps adaptive:', ms, 'ms'); assert.ok(ms < 12000, 'under 12 s');
});

for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
