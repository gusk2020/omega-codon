'use strict';
// Stage 3.0 tests (the new parts). The earlier suites run against this code too:  node test20.js && node test20b.js && node test30.js
// TEST-ONLY SHORTCUTS used here, and nowhere in the game screens: `testStartYears` (begin the world later in its history so an era can be reached quickly),
// `testHooks` (stage an extinction / add a record of life that left the Earth). A test that uses one says so in its name.
const assert = require('node:assert/strict');
const E2 = require('../stage2.0/engine19'), G2 = require('../stage2.0/game');
const E7 = require('../stage1.7/engine17');
const E = require('./engine19'), G = require('./game'), N = require('./niche'), CAT = require('./catastrophe'), W = require('./world'), OFF = require('./offworld'), RK = require('./rank');
const results = [];
function test(name, fn) { const t = Date.now(); console.log('… ' + name.slice(0, 60)); try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 900)); process.exitCode = 1; } }
const full = (x) => JSON.stringify(x), evKey = (g) => JSON.stringify(g.events.map((e) => [e.t, e.kind, e.text]));
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, g: r.finalGenomes.map((x) => x.genes), eco: r.ecology, pred: r.predation, m: r.modeFractions });
const mk = (traits) => G.makeGenome(E, { traits }), box = N.makeBox(E);
const adv = (g, n) => { const target = g.t + n; while (g.t < target && !g.isOver && !g.pending) { g.advance(target - g.t); if (g.checkpoint) g.continueFromCheckpoint(); } return g.t; };
const S3 = (o = {}) => { const g = G.newGame(E, { creatures: ['dormant'], rivals: ['regenerator', 'tough'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive', stage: 3, ...o }); g.setAutoContinuous(true); return g; };
const runTo = (g, pred, maxSteps = 200000) => { const seen = []; let guard = 0; while (!pred(g) && !g.isOver && guard++ < maxSteps / 50) { g.advance(50); if (g.checkpoint) { seen.push([g.checkpoint.kind, g.checkpoint.ms && g.checkpoint.ms.stage, g.worldInfo().years]); g.continueFromCheckpoint(); } } return seen; };

// ---------- compatibility ----------
test('3.0→1.7: 新しい部品（生息域・文明・異常細胞の受け口）は既定では何も変えない。Stage 1.7とビット単位で一致', () => {
  const P = { period: 20, pulseLength: 4 };
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of [{}, { resourceRegime: P, lineageCount: 3 }]) { const o = { seed: 4, steps: 300, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E7.simulate(o)), env); assert.equal(strip(E.simulate({ ...o, civ: true })), strip(E7.simulate(o)), env + ' civ'); }
});
test('3.0 旧セーブ: Stage 2.0（v6・可変時間・文明あり）のセーブも、同じ状態・同じ出来事に戻る', () => {
  const cfg = { creatures: ['lowMetabolism'], rivals: ['hunter', 'tough'], seed: 7, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive' }, a = G2.newGame(E2, cfg); a.setAutoContinuous(true);
  let guard = 0; while (a.t < 9000 && guard++ < 400) { a.advance(Math.min(100, 9000 - a.t)); if (a.checkpoint) a.continueFromCheckpoint(); }
  const sv = JSON.parse(JSON.stringify(a.save())); assert.equal(sv.v, 6); assert.ok(a.worldInfo().leaps > 0, 'the old save includes leaps');
  const b = G.loadGame(E, sv); guard = 0; while (b.replayTo !== null && guard++ < 2000) b.advance(100);
  assert.equal(b.t, a.t); assert.equal(full(b.live.stats()), full(a.live.stats())); assert.equal(evKey(b), evKey(a)); assert.equal(b.worldInfo().years, a.worldInfo().years); assert.equal(b.cfg.stage, undefined, 'an old save is not a stage-3 world'); assert.equal(b.catInfo(), null);
});

// ---------- the temperature x pressure habitat ----------
test('生息域：適応可能領域（箱）は進化する形質から決まる。耐性が高いほど広く、代謝が高いと耐熱は狭く耐寒は広い。休眠で広がる', () => {
  const b = (t, d = false) => { const lo = E.develop(mk(t), E.REFERENCE_DEV).traits, out = new Float64Array(4); box(lo, d, out); return { Tlo: out[0], Thi: out[1], Pmin: out[2], Pmax: out[3] }; };
  const std = b({}), tol = b({ tolerance: 0.95 }), frail = b({ tolerance: 0.1 });
  assert.ok(tol.Thi > std.Thi && std.Thi > frail.Thi && tol.Tlo < std.Tlo && std.Tlo < frail.Tlo && tol.Pmax > std.Pmax && std.Pmax > frail.Pmax, 'tolerance widens every side');
  const hot = b({ metabolism: 1.5 }), cool = b({ metabolism: 0.4 }); assert.ok(hot.Thi < cool.Thi && hot.Tlo < cool.Tlo, 'high metabolism: less heat tolerance, more cold tolerance');
  const dorm = b({ dormancyDepth: 0.08 }, true), awake = b({ dormancyDepth: 0.08 }, false); assert.ok(dorm.Thi > awake.Thi && dorm.Tlo < awake.Tlo && dorm.Pmax > awake.Pmax, 'dormancy widens the box');
  const rep = b({ repairRate: 0.95 }); assert.ok(rep.Pmax > std.Pmax, 'repair adds pressure tolerance');
});
test('生息域：環境の柱（温度・圧力）は気候で動き、箱との重なりが縮小し、分断され得る', () => {
  const prof0 = N.profile('water', 0), prof20 = N.profile('water', 20); assert.ok(prof20.T.every((t, k) => Math.abs(t - prof0.T[k] - 20) < 1e-9) && prof20.P.every((p, k) => p === prof0.P[k]), 'warming shifts T only');
  const mkBox = (Tlo, Thi, Pmin, Pmax) => [Tlo, Thi, Pmin, Pmax];
  const standard = mkBox(262, 311, 9e3, 7.7e6), s0 = N.suitability(standard, prof0), s20 = N.suitability(standard, prof20); assert.ok(s0.filter((v) => v >= 0.5).length > s20.filter((v) => v >= 0.5).length, 'warming shrinks the habitable part');
  const split = mkBox(286, 345, 1e4, 3e8), seg = N.segments(N.suitability(split, prof0)); assert.ok(seg.length >= 2, `a box that fits the surface and the vents but not the cold middle is split in two: ${JSON.stringify(seg)}`);
  assert.equal(N.profile('land', 0), null, 'land keeps its three layers, not a T-P column');
});
test('生息域と生存計算：箱の外では実際に損傷し、耐性しだいで死因・数が変わる。実際の分布は適応可能領域の中に収まりやすい', () => {
  const run = (g, dK, realm = 0, steps = 900) => { const live = E.simulate({ seed: 4, steps: 1e9, environment: 'rich', founders: 100, founderGenomes: [g], mutation: false, live: true, realms: { start: [realm] }, depth: { ...N.engineArrays([dK, dK, dK, dK]), box, bins: N.BINS }, maxPopulation: 1500 }); live.step(steps); const st = live.stats(); return { th: st.causes.thermal || 0, pr: st.causes.pressure || 0, dist: live.depthDist()[realm][0], ind: live.individuals() }; };
  const tolerant = mk({ tolerance: 0.95, repairRate: 0.8 }), standard = mk({}), frail = mk({ tolerance: 0.1 });
  const r = (g, dK) => run(g, dK); const f0 = r(frail, 0), f1 = r(frail, 25), s1 = r(standard, 25), t1 = r(tolerant, 25);
  assert.ok(f1.th > 3 * Math.max(10, f0.th), `warming kills the frail by heat: ${f0.th} -> ${f1.th}`); assert.ok(f1.th > s1.th && s1.th > t1.th, `and the more tolerant suffer less: ${f1.th} / ${s1.th} / ${t1.th}`);
  // the realized distribution: individuals sit where their own box allows, mostly
  const lo = (x) => x.traits, out = new Float64Array(4); let inside = 0, all = 0;
  for (const x of s1.ind) { if (x.patch !== 0) continue; box(lo(x), false, out); const T = N.profile('water', 25).T[x.zb], P = N.profile('water', 25).P[x.zb]; all++; if (T >= out[0] && T <= out[1] && P >= out[2] && P <= out[3]) inside++; }
  const std0 = run(standard, 0); let in0 = 0, all0 = 0; for (const x of std0.ind) { if (x.patch !== 0) continue; box(lo(x), false, out); const T = N.profile('water', 0).T[x.zb], P = N.profile('water', 0).P[x.zb]; all0++; if (T >= out[0] && T <= out[1] && P >= out[2] && P <= out[3]) in0++; }
  assert.ok(in0 / all0 > 0.9, `in the mild world nearly all sit inside their box (${in0}/${all0})`); assert.ok(all > 20, 'there are individuals');
  const mean = (d) => d.reduce((a, n, k) => a + n * k, 0) / Math.max(1, d.reduce((a, b) => a + b, 0)); assert.ok(mean(s1.dist) !== mean(std0.dist), 'the distribution moved with the climate');
});
test('生息域の進化：高温の世界で、耐熱を高める遺伝子が選ばれて広がる（実際の進化計算）', () => {
  const mean = (r) => r.final.loci.tolerance; const hot = (seed) => E.simulate({ seed, steps: 2500, environment: 'rich', founders: 80, mutation: true, mutationRate: 0.3, live: false, realms: { start: [0] }, depth: { ...N.engineArrays([22, 22, 22, 22]), box, bins: N.BINS }, maxPopulation: 600, sampleEvery: 2500 });
  const mild = (seed) => E.simulate({ seed, steps: 2500, environment: 'rich', founders: 80, mutation: true, mutationRate: 0.3, live: false, realms: { start: [0] }, depth: { ...N.engineArrays([0, 0, 0, 0]), box, bins: N.BINS }, maxPopulation: 600, sampleEvery: 2500 });
  let up = 0, n = 0, dh = 0, dm = 0; for (const seed of [1, 2, 3, 4, 5, 6]) { const a = hot(seed), b = mild(seed); if (a.extinct || b.extinct) continue; n++; dh += mean(a); dm += mean(b); if (mean(a) > mean(b)) up++; }
  assert.ok(n >= 4 && dh / n > dm / n + 0.02, `average tolerance after 2500 steps: hot world ${(dh / n).toFixed(3)} vs mild ${(dm / n).toFixed(3)} (${up}/${n} seeds higher)`);
});

// ---------- the great catastrophes ----------
test('大災厄：10億・20億・30億年代に1回ずつ。時期・種類・規模・回復の可否はシードで決まり、年代の設定は保たれる', () => {
  const eras = [[1e9, 2e9], [2e9, 3e9], [3e9, 3.8e9]], kinds = new Set(), onsets = new Set(); let rec1 = 0, rec3 = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const cat = CAT.schedule(seed); assert.equal(cat.length, 3); assert.deepEqual(CAT.schedule(seed).map((c) => [c.onset, c.parts.join(), c.scale]), cat.map((c) => [c.onset, c.parts.join(), c.scale]), 'same seed, same history');
    cat.forEach((c, i) => { assert.ok(c.onset >= eras[i][0] && c.onset <= eras[i][1], 'inside its era'); assert.ok(c.scale >= CAT.ERAS[i].minScale, 'at least the setting of the era'); kinds.add(c.parts.join('+')); onsets.add(Math.round(c.onset / 1e6)); if (i === 0 && c.recoverable) rec1++; if (i === 2) { rec3 += c.recoverable ? 1 : 0; assert.equal(c.recoverable, false, 'the last crisis ends the surface biosphere'); } });
    assert.ok(cat[1].scale >= 1.6 && cat[2].scale >= 2.6);
  }
  assert.ok(kinds.size >= 6, `many different kinds (${kinds.size})`); assert.ok(onsets.size > 100, 'onset times vary'); assert.ok(rec1 > 20 && rec1 < 40, `most but not all first-era crises are recoverable (${rec1}/40)`);
  assert.notDeepEqual(CAT.schedule(1).map((c) => c.onset), CAT.schedule(2).map((c) => c.onset));
});
test('大災厄の影響：回復できる災厄は元に戻り、戻らない災厄は残る。海洋の喪失は水中を空にする。月の災厄は仮説と明記される', () => {
  const c = (type, rec, scale = 1.5) => ({ id: 1, era: 1, onset: 0, parts: [type], scale, severity: 1 - Math.exp(-0.9 * scale), recoverable: rec, tauR: type === 'oceanLoss' ? 3e8 : 4e4 * Math.sqrt(scale), hits: [] });
  const imp = c('impact', true), e0 = CAT.effectsAt([imp], 1e3), e1 = CAT.effectsAt([imp], 1e6); assert.ok(e0.res[1] < 0.5 && e1.res[1] > 0.98, 'a recoverable impact recovers'); assert.ok(e0.dT[1] < -5, 'it first cools');
  const perm = c('impact', false), p1 = CAT.effectsAt([perm], 1e8); assert.ok(p1.res[1] < 0.6, 'an unrecoverable impact leaves the land poor for ever');
  const oc = c('oceanLoss', false, 2.5), o1 = CAT.effectsAt([oc], 2e8); assert.ok(o1.res[0] < 0.1, 'the sea is gone'); assert.ok(o1.res[2] > o1.res[1] && o1.res[1] > o1.res[0], 'underground is the least hurt, the sea the most'); assert.ok(o1.dT[1] > 15);
  const cs = c('climateShock', true), s0 = CAT.effectsAt([cs], 3e4), s1 = CAT.effectsAt([cs], 1e7); assert.ok(s0.dT[1] > 8 && Math.abs(s1.dT[1]) < 0.1);
  const moon = CAT.schedule(5).concat(CAT.schedule(6)).concat(CAT.schedule(7)).concat(CAT.schedule(8)).concat(CAT.schedule(9)).find((x) => x.parts.includes('lunar')); assert.ok(moon && CAT.forecast(moon, 2, moon.onset - 1e4).hypothesis, 'the lunar crisis is marked as this work\'s own hypothesis'); assert.equal(CAT.TYPES.lunar.science, 'hypothesis'); assert.equal(CAT.TYPES.impact.science, 'real-kind');
});
test('予告：すべての大災厄に3段階の警告。誤差はあるが段階ごとに小さくなり、種類を外すこともある。生き物が予知するのではない', () => {
  let wrong0 = 0, wrong1 = 0, wrong2 = 0, n = 0, w = [0, 0, 0], se = [0, 0, 0], tcount = 0;
  for (let seed = 1; seed <= 60; seed++) for (const c of CAT.schedule(seed)) { n++; const f = [0, 1, 2].map((i) => CAT.forecast(c, i, c.onset - c.lead * [1, 0.3, 0.05][i])); if (!f[0].kinds.every((k) => c.parts.includes(k)) || f[0].kinds.length !== c.parts.length) wrong0++; if (f[1].kinds.join() !== c.parts.join()) wrong1++; if (f[2].kinds.join() !== c.parts.join()) wrong2++; f.forEach((x, i) => { w[i] += x.windowYears; se[i] += Math.abs(Math.log(x.scaleValue / c.scale)); assert.ok(x.remainingYears > 0 && x.window[0] < x.window[1] && ['大', '非常に大', '極大', '生命圏規模'].includes(x.scaleClass)); assert.ok(/予知しているわけではありません/.test(x.note)); }); }
  assert.ok(wrong0 > 0.1 * n && wrong0 < 0.45 * n, `the early forecast is often wrong about the kind (${wrong0}/${n})`); assert.ok(wrong1 < wrong0 && wrong2 === 0, 'it improves, and the last one has the kind right');
  assert.ok(w[0] > w[1] && w[1] > w[2], 'the time window narrows'); assert.ok(se[0] > se[1] && se[1] > se[2], 'the size estimate improves');
  const ms = CAT.milestones(CAT.schedule(3)); assert.equal(ms.length, 15); assert.equal(ms.filter((m) => m.kind === 'warning').length, 9); assert.deepEqual(ms.map((m) => m.t), ms.map((m) => m.t).slice().sort((a, b) => a - b));
});
test('可変時間との整合：警告・開始・事後の節目は飛び越えない（4Gyrを5シードで）。跳躍はちょうど節目で終わる', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = W.create(seed, { catastrophe: true }), ctx = { cog: 0.55, biomass: 0.7 }, seen = []; let leaps = 0;
    while (w.years < 3.95e9) { const before = w.years, nm = w.ms[w.msIdx], h = Math.min(W.safeLeap(w, ctx), 3.95e9 - w.years); if (nm) assert.ok(before + h <= nm.t + 1e-3, `a leap must not pass the milestone at ${nm.t} (leap ${before} + ${h})`); const ev = W.advance(w, h, ctx); leaps++; for (const e of ev) if (e.kind.startsWith('cat-')) seen.push([e.kind, w.years, e.stage, e.cat]); w.pendingMs = []; }
    assert.equal(seen.length, 15, `seed ${seed}: every milestone happened exactly once`); assert.ok(leaps < 12000, `leaps ${leaps}`);
    for (const m of w.ms) assert.ok(seen.some((s) => Math.abs(s[1] - m.t) < 5), 'at its own time');
  }
  const a = W.create(1, { catastrophe: true }), b = W.create(1, { catastrophe: true }); assert.equal(a.ms.length, b.ms.length); const amb = W.ambient(a); assert.ok(amb.cat && amb.thermal >= 0);
  const w2 = W.create(1, { catastrophe: true, startYears: a.cat[0].onset + 100 }); assert.ok(w2.cat[0].onset < w2.years && W.ambient(w2).prod < W.ambient(a).prod, 'during a crisis the land is poorer'); assert.ok(W.ambient(w2).resource > W.ambient(w2).prod, 'the arena sees the crisis per realm, not twice');
});
test('太陽光度と気候：時代とともに上がり、緩衝の弱まりで後の年代ほど高温。科学的な部分（光度）と仮定（緩衝）が分かれている', () => {
  assert.ok(W.luminosity(1e9) > W.luminosity(0) && W.luminosity(3e9) > W.luminosity(1e9)); assert.ok(Math.abs(W.luminosity(1e9) / W.luminosity(0) - 1.10) < 0.03, 'about +10% in a billion years (standard solar evolution)');
  assert.ok(W.bufferAt(0.5e9) > W.bufferAt(2.5e9) && W.bufferAt(2.5e9) > W.bufferAt(3.9e9));
  const t = (y) => { const w = W.create(1, { catastrophe: true, startYears: y }); return W.ambient(w).warmSolar; }; assert.ok(t(0.5e9) < t(1.5e9) && t(1.5e9) < t(2.5e9) && t(2.5e9) < t(3.5e9), 'the later the hotter'); assert.ok(t(3.5e9) > 20, 'by the 30億年代 the surface is far hotter even before a catastrophe');
});
test('災厄は演出ではなく生物の生存に作用する：衝突の直後に個体数が落ち、回復できる災厄では生態系が戻る（テスト専用の開始年代）', () => {
  let seed = 0; for (let s = 1; s < 200; s++) { const c = CAT.schedule(s)[0]; if (c.parts.length === 1 && c.parts[0] === 'impact' && c.recoverable) { seed = s; break; } } assert.ok(seed > 0);
  const c0 = CAT.schedule(seed)[0], g = S3({ seed, testStartYears: c0.onset - 4e6, testHooks: false }); let pre = 0, post = 0, recovered = 0, onsetT = null;
  const seen = []; let guard = 0; while (g.worldInfo().years < c0.onset + 8e5 && !g.isOver && guard++ < 60000) { g.advance(50); if (g.checkpoint) { const k = g.checkpoint.kind; seen.push(k); if (k === 'catastrophe') { onsetT = g.t; pre = g.live.stats().population; } g.continueFromCheckpoint(); } if (onsetT !== null && g.t > onsetT) { post = post === 0 ? g.live.stats().population : Math.min(post, g.live.stats().population); } }
  assert.deepEqual([...new Set(seen)].filter((k) => k !== 'interval' && k !== 'focus-extinct').slice(0, 3), ['warning', 'catastrophe', 'aftermath'], 'warnings, then the catastrophe, then the aftermath, each a pause');
  assert.equal(seen.filter((k) => k === 'warning').length, 3, 'three warnings'); assert.ok(pre > 50, `population before ${pre}`); assert.ok(post < 0.75 * pre, `the impact hurts: ${pre} -> ${post}`);
  recovered = g.live.stats().population; assert.ok(recovered > 0.5 * pre || g.isOver === false && recovered > 40, `life recovers after a recoverable impact: ${recovered} vs ${pre}`); assert.ok(g.events.some((e) => e.sub === 'cat-aftermath'));
});
test('回復できない最後の危機（30億年代・テスト専用の開始年代）：地球の生命圏は終わり得る。生き延びる道は一本ではなく、地中や休眠に残る系統がある場合がある', () => {
  const finals = []; for (let s = 1; s <= 60 && finals.length < 3; s++) { const c = CAT.schedule(s)[2]; if (c.parts.includes('oceanLoss') && c.scale > 2.6) finals.push(s); }
  let ended = 0, survived = 0; const n = finals.length; assert.ok(n >= 2);
  for (const seed of finals) { const c = CAT.schedule(seed)[2], g = S3({ seed, testStartYears: c.onset - 5e5, creatures: ['dormant'], rivals: ['regenerator', 'tough'] }); let guard = 0; while (g.worldInfo().years < c.onset + 3e8 && !g.isOver && guard++ < 60000) { g.advance(100); if (g.checkpoint) g.continueFromCheckpoint(); } const st = g.live.stats(); if (g.isOver || st.population === 0) ended++; else survived++; }
  assert.ok(ended >= 1, `an unrecoverable crisis can end the biosphere (${ended}/${n})`); console.log('   final crisis: ended', ended, 'survived', survived, 'of', n);
});

// ---------- life beyond the Earth ----------
test('地球外：到達・一時的な生存・自律的な生存を区別する。自律は未計算、文明の輸送はΩの条件にならない（3つの経路）', () => {
  const prof = (o = {}) => ({ lin: 0, name: 'x', total: 100, abund: [0, 60, 30, 10], traits: { tolerance: 0.9, repair: 0.8, movement: 0.5, metabolism: 0.5, dormancyDepth: 0.08, ...o } });
  const w = OFF.create(3); let reached = 0, temp = 0; for (let i = 0; i < 200; i++) for (const r of OFF.ejecta(w, [prof()], 1e9, 2)) { reached++; if (r.status === 'temporary') temp++; assert.equal(r.route, 'ejecta'); assert.equal(r.autonomous, null); assert.ok(/未計算|計算していません/.test(r.autonomousNote)); }
  assert.ok(reached > 20 && temp > 0 && temp < reached, `reached ${reached}, some survived the journey ${temp}`);
  const hardy = OFF.ejecta(OFF.create(1), [prof({ tolerance: 0.05, repair: 0.05, dormancyDepth: 0.5 })], 0, 2).length, hardyHigh = (() => { let c = 0; const ww = OFF.create(1); for (let i = 0; i < 100; i++) c += OFF.ejecta(ww, [prof()], 0, 2).length; return c; })(); assert.ok(hardyHigh > hardy, 'a rocky, tolerant lineage is more likely to be thrown out');
  const ws = OFF.create(4); let selfN = 0; for (let i = 0; i < 100; i++) selfN += OFF.selfReach(ws, [{ ...prof(), abund: [0, 0, 0, 80] }], 1e9, 1e8).length; assert.ok(selfN > 0); assert.equal(OFF.selfReach(OFF.create(4), [{ ...prof({ tolerance: 0.3 }), abund: [0, 0, 0, 80] }], 1e9, 1e12).length, 0, 'without the body for it, never'); assert.equal(OFF.selfReach(OFF.create(4), [prof()], 1e9, 1e12).length, 0, 'and not without living in the air');
  const wt = OFF.create(5), t = OFF.transport(wt, [prof()], ['use'], { T: 9 }, 1e9, 1e5); assert.equal(t.length, 1); assert.equal(t[0].omegaEligible, false, 'being carried is not autonomy'); assert.equal(t[0].supported, true); assert.equal(OFF.transport(OFF.create(5), [prof()], ['hostile'], { T: 9 }, 1e9, 1e5).length, 0); assert.equal(OFF.transport(OFF.create(5), [prof()], ['use'], { T: 5 }, 1e9, 1e5).length, 0, 'it needs the technology');
  assert.equal(OFF.ejecta(OFF.create(1), [prof()], 0, 2).concat([]).every((r) => r.omegaEligible), true); assert.ok(OFF.summary(w).length === 1);
});
test('災厄後の継続：地球の生命圏が絶えても、地球外に生き残りがいればゲームは終わらず観察を続ける。いなければ終わる（テスト専用の操作）', () => {
  const a = S3({ testHooks: true }); adv(a, 3000); a.testHooks.killEarth(); adv(a, 200); assert.equal(a.isOver, true, 'no life anywhere: the game ends');
  const b = S3({ testHooks: true }); adv(b, 3000); const rec = b.testHooks.addOffworld(0, 'ejecta', true); b.testHooks.killEarth(); b.advance(200); assert.equal(b.isOver, false); assert.equal(b.checkpoint && b.checkpoint.kind, 'earth-ended'); b.continueFromCheckpoint();
  const o = b.offworld(); assert.equal(o.earthEnded, true); assert.equal(o.alive, true); assert.ok(/未計算/.test(o.notes) && o.records[0].autonomous === null && o.records[0].status === 'temporary'); assert.ok(b.events.some((e) => e.sub === 'offworld') && b.events.some((e) => /地球の生命圏は終わりました/.test(e.text)));
  const c = S3({ testHooks: true }); adv(c, 3000); c.testHooks.addOffworld(0, 'ejecta', false); c.testHooks.killEarth(); c.advance(200); assert.equal(c.isOver, true, 'having only reached (nothing known to be alive) is not enough to go on');
  const d = S3({ testHooks: true }); adv(d, 3000); const tr = d.testHooks.addOffworld(0, 'transport', true); assert.equal(tr.omegaEligible, false); assert.equal(tr.supported, true);
});

// ---------- rank progress ----------
test('ランクの進捗：現在と歴代最高は別。次のランクの条件・不足量・有効な戦略とその代償を数値で示す（γ→δ）', () => {
  const m = { alive: 50, observedSteps: 9000, continuity: 320, aging: { value: 2.0, young: 999, old: 999 }, repair: { value: 0.95 }, efficiency: { value: 0.2, intakeRatio: 1 }, range: { value: 3 }, dormancy: { value: null, episodes: 0 }, competition: { value: 5000 }, independence: { value: 1 } };
  const res = RK.evaluate(m), p = RK.progress(res, m); assert.equal(res.rank, 'γ'); assert.equal(p.from, 'γ'); assert.equal(p.to, 'δ');
  const reqs = Object.fromEntries(p.requirements.map((r) => [r.id, r])); assert.ok(reqs.continuity.met && reqs['axes-1'].met && !reqs['axes-2'].met, 'gamma to delta: a tier-2 axis is missing'); assert.equal(reqs['axes-2'].short, 1);
  const near = reqs['axes-2'].candidates[0]; assert.equal(near.id, 'repair'); assert.ok(near.shortRatio > 0 && near.shortRatio < 0.02, 'repair is nearest'); assert.ok(near.advice.strategies.length >= 2 && near.advice.costs.length >= 2, 'with strategies and their costs');
  assert.ok(p.done > 0.5 && p.done < 1); assert.ok(RK.progress({ judged: false, reason: 'x' }).judged === false);
  const low = { ...m, continuity: 100 }, pl = RK.progress(RK.evaluate(low), low); assert.ok(pl.requirements[0].short > 0 || pl.to === null || pl.from === 'α', 'continuity shortfall is a number'); const top = RK.evaluate({ ...m, continuity: 6000, aging: { value: 1.0, young: 999, old: 999 }, repair: { value: 0.999 }, efficiency: { value: 0.05, intakeRatio: 1 }, range: { value: 4 }, dormancy: { value: 0.99, episodes: 99 }, competition: { value: 999999 }, independence: { value: 9 } });
  assert.notEqual(RK.progress(top, m).to, 'Ω', 'the next of the top judged rank is never Omega'); assert.equal(top.omega.judgeable, false);
  const g = S3(); adv(g, 12000); assert.ok(g.rank.best === null || typeof g.rank.best.rank === 'string'); for (const l of Object.values(g.rank.byLin)) if (l.best && l.current) assert.ok(l.best.rankIndex >= l.current.rankIndex, 'best ever never below current');
});

// ---------- roster, lineages, strategies still work in the new world ----------
test('主要7初期生物：7種すべてを選んで始められ、7系統が計算され、系統切替ができる。旧い世界は従来の5種のまま', () => {
  assert.equal(G.CREATURES7.length, 7); assert.equal(G.CREATURES.length, 5); const ids = G.CREATURES7.map((c) => c.id); assert.equal(new Set(ids).size, 7);
  for (const id of ids) { const g = S3({ creatures: [id], rivals: G.pickRivals(5, [id], 2, G.CREATURES7), seed: 5 }); assert.equal(g.creatures.length, 7, id); adv(g, 500); assert.ok(g.live.stats().population > 0 || g.isOver === false, id + ' runs'); assert.equal(g.cfg.stage, 3); assert.equal(g.controlled, g.creatures.findIndex((c) => c.id === id)); }
  const old = G.newGame(E, { creatures: ['standard'], seed: 2, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive' }); assert.equal(old.creatures.length, 5, 'without stage 3 the roster is the old five'); const rv = G.pickRivals(9, ['dormant'], 2, G.CREATURES7); assert.ok(rv.length === 2 && !rv.includes('dormant'));
  const g = S3({ creatures: ['standard'], rivals: ['dormant', 'regenerator'] }); adv(g, 3000); const alive = g.live.stats().lineageAlive.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0); assert.ok(alive.length >= 2); const to = alive.find((i) => i !== g.controlled); assert.ok(g.setControlled(to)); assert.ok(g.setStrategy(to, 'flee')); assert.equal(g.strategies()[to], 'flee');
});
test('セーブ・ロード（v7）：予告の途中・災厄の最中のセーブも、同じ状態・同じ出来事に戻る（テスト専用の開始年代）', () => {
  const c0 = CAT.schedule(3)[0], g = S3({ seed: 3, testStartYears: c0.onset - 3e6 }); let guard = 0, savedAt = null, sv = null;
  while (g.worldInfo().years < c0.onset + 2e5 && !g.isOver && guard++ < 40000) { g.advance(50); if (g.checkpoint) { if (g.checkpoint.kind === 'warning' && g.checkpoint.ms.stage === 'update' && !sv) { sv = JSON.parse(JSON.stringify(g.save())); savedAt = g.t; } g.continueFromCheckpoint(); } }
  assert.ok(sv, 'saved at a warning'); assert.equal(sv.v, 7); assert.equal(sv.cfg.stage, 3); assert.equal(sv.cfg.testStartYears, c0.onset - 3e6);
  const b = G.loadGame(E, sv); let gd = 0; while (b.replayTo !== null && gd++ < 4000) b.advance(100); assert.equal(b.t, savedAt); assert.equal(b.checkpoint && b.checkpoint.kind, 'warning', 'a save made at a warning is still at the warning');
  const g2 = S3({ seed: 3, testStartYears: c0.onset - 3e6 }); gd = 0; while (g2.t < savedAt && gd++ < 4000) { g2.advance(Math.min(50, savedAt - g2.t)); if (g2.checkpoint && g2.t < savedAt) g2.continueFromCheckpoint(); }
  assert.equal(full(b.live.stats()), full(g2.live.stats())); assert.equal(b.worldInfo().years, g2.worldInfo().years); assert.equal(evKey(b), evKey(g2));
});
test('時間の記録：計算した時間と跳躍で省略した時間、近似の方法・条件・限界が記録され、混同されない', () => {
  const g = S3(); adv(g, 14000); const L = g.timeLedger(), wi = g.worldInfo(); assert.ok(L.leaps > 0 && L.skippedYears > 1e6); assert.ok(Math.abs(L.simulatedYears + L.skippedYears - wi.years) / wi.years < 1e-9);
  assert.ok(L.simulatedGenerations < L.skippedGenerationsEstimate / 100, 'skipped generations are an estimate kept apart'); assert.ok(/進化せず/.test(L.method) && L.limits.length >= 3 && /400ステップ/.test(L.conditions)); assert.ok(L.recent.length > 0 && 'extrapolated' in L.recent[0] && 'reseeded' in L.recent[0]);
  assert.equal(S3().timeLedger().leaps, 0); assert.equal(G.newGame(E, { creatures: ['standard'], seed: 1, realms: true, scenario: 'kpg', ecology: 'v2' }).timeLedger(), null);
});
test('性能：30億年代までの長期進行（空のアリーナ込み）が妥当な時間とメモリで終わる。通常の進行も実用速度', () => {
  const g = S3({ testHooks: true }); adv(g, 7000); g.testHooks.addOffworld(0, 'ejecta', true); g.testHooks.killEarth(); const t0 = Date.now(); let n = 0; while (!g.isOver && n++ < 6000) { g.advance(5000); if (g.checkpoint) g.continueFromCheckpoint(); }
  const ms = Date.now() - t0; console.log('   4 Gyr with an empty arena:', ms, 'ms, steps', g.t, 'heap MB', (process.memoryUsage().heapUsed / 1e6).toFixed(0)); assert.ok(g.isOver && g.worldInfo().years >= 3.98e9 && ms < 90000); assert.ok(process.memoryUsage().heapUsed < 600e6, 'memory stays bounded');
  const h = S3(); const t1 = Date.now(); adv(h, 5000); const m2 = Date.now() - t1; console.log('   5000 steps with life:', m2, 'ms'); assert.ok(m2 < 20000);
});

for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
