'use strict';
// Stage 1.9A tests. Run from this folder: node test19.js   (Stage 1.8's own suite: cd ../stage1.8 && node test18.js)
const assert = require('node:assert/strict');
const E8 = require('../stage1.8/engine18'), G8 = require('../stage1.8/game');
const E = require('./engine18'), G = require('./game'), H = require('./habitat'), T = require('./timemodel');
const results = [];
function test(name, fn) { const t = Date.now(); try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 600)); process.exitCode = 1; } }
const core = (st) => JSON.stringify({ ...st, parentAgeSum: undefined, lifeSum: undefined, thermal: undefined });
const evKey = (g) => JSON.stringify(g.events.map((e) => [e.t, e.kind, e.text]));
function play(mod, Eng, cfg, steps, choice = 'watch') { const g = mod.newGame(Eng, cfg); for (let i = 0; i < steps / 50 && !g.live.done; i++) { g.advance(50); if (g.pending) g.choose(choice); } return g; }

test('1.9A→1.8: 競争相手なしなら、Stage 1.8とまったく同じ動態・同じ出来事（見守る／食料支援）', () => {
  for (const cfg of [{ creatures: ['standard', 'lowMetabolism'], seed: 21 }, { creatures: ['hunter'], seed: 5, environment: 'pulse' }, { creatures: ['standard', 'highFecundity', 'tough'], seed: 9 }]) {
    for (const ch of ['watch', 'support']) { const a = play(G8, E8, cfg, 1500, ch), b = play(G, E, cfg, 1500, ch); assert.equal(core(b.live.stats()), core(a.live.stats())); assert.equal(evKey(b), evKey(a)); }
  }
});
test('1.9A: Stage 1.8で作ったセーブ（v1）は、そのまま読み込めて同じ状態に戻る', () => {
  const a = play(G8, E8, { creatures: ['standard', 'lowMetabolism'], seed: 31 }, 900, 'refuge'); a.advance(40);
  const save = JSON.parse(JSON.stringify(a.save())); assert.equal(save.v, 1);
  const b = G.loadGame(E, save); while (b.replayTo !== null) b.advance(50);
  assert.equal(b.t, a.t); assert.equal(core(b.live.stats()), core(a.live.stats())); assert.equal(evKey(b), evKey(a)); assert.equal(b.autoContinuous, false);
});
test('1.9A: 新しいセーブ（v2）→ロードは、続けて遊んだときと同じ（競争相手・自動を含む）', () => {
  const cfg = { creatures: ['standard'], rivals: G.pickRivals(8, ['standard'], 2), seed: 8 };
  const a = G.newGame(E, cfg); let n = 0; for (let i = 0; i < 40; i++) { a.advance(50); if (a.pending) { n++; a.choose(n % 2 ? 'auto' : 'support'); } }
  const save = JSON.parse(JSON.stringify(a.save())); assert.equal(save.v, 2);
  const b = G.loadGame(E, save); while (b.replayTo !== null) b.advance(50);
  assert.equal(core(b.live.stats()), core(a.live.stats())); assert.equal(evKey(b), evKey(a)); assert.equal(JSON.stringify(b.timeInfo()), JSON.stringify(a.timeInfo()));
  a.advance(100); b.advance(100); assert.equal(core(b.live.stats()), core(a.live.stats()));
});
test('1.9A 時間: 世代数と寿命換算の参考値は、寿命が変わっても逆戻りしない', () => {
  const g = G.newGame(E, { creatures: ['standard', 'lowMetabolism'], seed: 3, environment: 'pulse' }); let pg = 0, pr = 0, lifeMin = Infinity, lifeMax = 0;
  for (let i = 0; i < 160; i++) { g.advance(25); if (g.pending) g.choose('disaster'); const ti = g.timeInfo(); assert.ok(ti.generations >= pg - 1e-12 && ti.lifespanReferenceSteps >= pr - 1e-12, `step ${ti.steps}`); pg = ti.generations; pr = ti.lifespanReferenceSteps; if (ti.windowLifespan) { lifeMin = Math.min(lifeMin, ti.windowLifespan); lifeMax = Math.max(lifeMax, ti.windowLifespan); } }
  assert.ok(pg > 5 && pr > 0); assert.ok(lifeMax > lifeMin, 'lifespan never changed, so this test proved nothing');
});
test('1.9A 時間: ステップ→日・年の換算は仮定として明示され、単位が正しい', () => {
  assert.equal(T.format(100, 'day'), '約100日'); assert.equal(T.format(365.25 * 2, 'day'), '約2.0年'); assert.equal(T.format(10, 'year'), '約10年'); assert.equal(T.format(0.4, 'day'), '1日未満');
  assert.equal(T.formatDays(365.25 * 3e5), '約30万年'); assert.equal(T.formatDays(NaN), '-'); assert.equal(T.find('nonsense').id, 'day'); assert.equal(T.SCENARIO_START_YEARS_BP, 66e6);
  for (const a of T.ASSUMPTIONS) assert.ok(a.name.includes('ステップ'));
});
test('1.9A 自動: 「自動」は「見守る」と同じ動態で、理由が履歴に残る', () => {
  const cfg = { creatures: ['standard', 'hunter'], seed: 12 };
  const w = play(G, E, cfg, 2500, 'watch'), a = play(G, E, cfg, 2500, 'auto');
  assert.equal(core(a.live.stats()), core(w.live.stats()));
  assert.ok(a.events.some((e) => e.kind === 'player' && e.text.includes('自動') && e.text.includes('理由'))); assert.ok(a.log.every((e) => e.kind !== 'choice' || e.id === 'auto' && e.r === 'once'));
  assert.ok(a.pending === null || a.pending.options.some((o) => o.id === 'auto'));
});
test('1.9A 自動: 連続自動モードは分岐点で止まらず、中立（見守る）だけを行い、理由が残る', () => {
  const cfg = { creatures: ['standard', 'hunter'], seed: 12 }, w = play(G, E, cfg, 2500, 'watch');
  const g = G.newGame(E, cfg); g.setAutoContinuous(true); let stops = 0; for (let i = 0; i < 50; i++) { g.advance(50); if (g.pending) stops++; }
  assert.equal(stops, 0); assert.equal(core(g.live.stats()), core(w.live.stats()));
  assert.ok(g.log.length > 0 && g.log.every((e) => e.id === 'auto' && e.r === 'continuous')); assert.ok(g.events.some((e) => e.text.includes('連続自動モード')));
  assert.equal(g.save().autoContinuous, true);
});
test('1.9A 自動: 連続自動のセーブを読み込むと、同じ状態に戻り、モードも復元される', () => {
  const g = G.newGame(E, { creatures: ['standard', 'hunter'], seed: 14 }); g.setAutoContinuous(true); g.advance(1800);
  const b = G.loadGame(E, JSON.parse(JSON.stringify(g.save()))); assert.equal(b.autoContinuous, false); while (b.replayTo !== null) b.advance(40);
  assert.equal(b.autoContinuous, true); assert.equal(core(b.live.stats()), core(g.live.stats())); assert.equal(evKey(b), evKey(g)); assert.equal(JSON.stringify(b.log), JSON.stringify(g.log));
});
test('1.9A 競争相手: 注目系統・競争相手が区別され、実際に計算した値だけを報告する', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 6 }, g = G.newGame(E, cfg); g.advance(400);
  const rep = g.lineageReport(); assert.equal(rep.length, 3); assert.deepEqual(rep.map((r) => r.role), ['focus', 'rival', 'rival']);
  const st = g.live.stats(); rep.forEach((r, i) => { assert.equal(r.alive, st.lineageAlive[i]); assert.ok(Number.isInteger(r.catchesOfLiving)); });
  const bg = g.background(); assert.equal(bg.computedSpecies, false); assert.equal(bg.computedBackgroundPopulation, false); assert.ok(bg.preyFraction >= 0 && bg.preyFraction <= 1);
  assert.throws(() => G.newGame(E, { creatures: ['standard', 'hunter', 'tough'], rivals: ['lowMetabolism', 'highFecundity'], seed: 1 }));
});
test('1.9A 競争相手: 競争相手の選び方は、種から決まり、注目系統と重ならず、成績に依存しない', () => {
  for (const seed of [1, 2, 3, 77]) { const a = G.pickRivals(seed, ['standard'], 2), b = G.pickRivals(seed, ['standard'], 2); assert.deepEqual(a, b); assert.ok(a.length === 2 && !a.includes('standard') && new Set(a).size === 2); }
  assert.equal(G.pickRivals(1, ['standard', 'hunter', 'tough'], 3).length, 1); assert.equal(G.pickRivals(1, ['standard'], 0).length, 0);
  assert.ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => G.pickRivals(s, ['standard'], 1)[0])).size > 1);
});
test('1.9A 競争相手: 注目系統の遺伝子は、競争相手がいても変わらない（創始個体の設計は独立）', () => {
  const a = G.makeGenome(E, G.CREATURES.find((c) => c.id === 'hunter')), b = G.makeGenome(E, G.CREATURES.find((c) => c.id === 'hunter')); assert.equal(JSON.stringify(a.genes), JSON.stringify(b.genes));
});
test('1.9A 競争相手: 個体数が少ない注目系統でも、終了時の文言は失敗扱いしない', () => {
  const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter'], seed: 2, environment: 'pulse' }); g.advance(1500); while (g.pending) g.choose('watch');
  const text = g.summary().text; assert.ok(!/失敗|負け|敗北|劣/.test(text), text);
});
test('1.9A 生息域: 4領域は表示用の仮定で、基準点は288.15K・101325Pa、将来の要因は未定義として登録されている', () => {
  assert.deepEqual(H.REALMS.map((r) => r.id), ['water', 'land', 'underground', 'air']); assert.equal(H.REFERENCE.T, 288.15); assert.equal(H.REFERENCE.P, 101325);
  for (const r of H.REALMS) { assert.ok(r.T[0] > 0 && r.T[1] > r.T[0] && r.P[0] > 0 && r.P[1] > r.P[0]); }
  assert.deepEqual(H.FACTORS.filter((f) => !f.defined).map((f) => f.id), ['oxygen', 'moisture', 'gravity']);
  assert.ok(Math.abs(H.kelvinToCelsius(288.15) - 15) < 1e-9 && Math.abs(H.celsiusToKelvin(-273.15)) < 1e-9);
});
test('1.9A 生息域: 対数軸は正値だけを扱い、0や負値を対数化しない。摂氏の対数は選べずケルビンになる', () => {
  assert.equal(H.toAxis(0, 'log'), null); assert.equal(H.toAxis(-5, 'log'), null); assert.equal(H.toAxis(NaN, 'linear'), null); assert.equal(H.toAxis(100, 'log'), 2); assert.equal(H.toAxis(-5, 'linear'), -5);
  assert.deepEqual(H.normaliseAxisChoice('C', 'log'), { unit: 'K', scale: 'log' }); assert.deepEqual(H.normaliseAxisChoice('C', 'linear'), { unit: 'C', scale: 'linear' });
  const v = H.setScale(H.defaultView(), 'x', 'log'); assert.equal(v.xUnit, 'K'); assert.ok(v.xr[0] > 0);
  assert.equal(H.project(0, [1, 10], 'log', 100, false, false), null); assert.equal(H.project(-1, [1, 10], 'log', 100, false, false), null);
});
test('1.9A 生息域: 初期範囲は全4領域と基準点をすべて含み、リセットで必ず元に戻る', () => {
  for (const xs of ['linear', 'log']) for (const ys of ['linear', 'log']) {
    let v = H.defaultView(); v = H.setScale(v, 'x', xs); v = H.setScale(v, 'y', ys);
    for (const r of H.REALMS) { assert.ok(v.xr[0] <= r.T[0] && v.xr[1] >= r.T[1], `x ${xs}`); assert.ok(v.yr[0] <= r.P[0] && v.yr[1] >= r.P[1], `y ${ys}`); }
    assert.ok(v.xr[0] <= H.REFERENCE.T && v.xr[1] >= H.REFERENCE.T && v.yr[0] <= H.REFERENCE.P && v.yr[1] >= H.REFERENCE.P);
    const z = { ...v, xr: H.zoomRange(v.xr, v.xScale, 0.2, 0.3), yr: H.panRange(v.yr, v.yScale, 0.4) }; assert.notDeepEqual(z.xr, v.xr);
    assert.deepEqual(H.resetView(z).xr, v.xr); assert.deepEqual(H.resetView(z).yr, v.yr);
  }
  assert.equal(H.defaultView().split, true);
});
test('1.9A 生息域: 軸の反転・拡大・移動は投影の向きと範囲を正しく変え、対数でも正値を保つ', () => {
  const r = [100, 200]; assert.equal(H.project(100, r, 'linear', 100, false, false), 0); assert.equal(H.project(100, r, 'linear', 100, true, false), 100);
  assert.equal(H.project(100, r, 'linear', 100, false, true), 100); assert.equal(H.project(100, r, 'linear', 100, true, true), 0);
  let lr = [1e3, 1e8]; for (let i = 0; i < 40; i++) lr = H.zoomRange(lr, 'log', 0.5, 0.5); assert.ok(lr[0] > 0 && lr[1] > lr[0]);
  for (let i = 0; i < 60; i++) lr = H.panRange(lr, 'log', -0.5); assert.ok(lr[0] > 0);
  let xr = [200, 300]; for (let i = 0; i < 50; i++) xr = H.panRange(xr, 'linear', -1); assert.ok(xr[0] >= 0 && xr[1] > xr[0]);
  const t = H.ticks(173.15, 423.15, 'linear', 'C'); assert.ok(t.every((x) => Math.abs((x - 273.15) / 50 - Math.round((x - 273.15) / 50)) < 1e-6)); assert.deepEqual(H.ticks(10, 1e5, 'log'), [10, 100, 1000, 10000, 100000]);
});
test('1.9A→1.7: 通常実行のエンジンはStage 1.7とビット単位で一致、ライブ実行も一致（観測用の項目を足しただけ）', () => {
  const E17 = require('../stage1.7/engine17'), P20 = { period: 20, pulseLength: 4 }, strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, g: r.finalGenomes.map((x) => x.genes), eco: r.ecology, pred: r.predation });
  for (const env of ['rich', 'scarce', 'plague']) for (const extra of [{}, { resourceRegime: P20, lineageCount: 3 }]) { const o = { seed: 4, steps: 300, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E17.simulate(o))); const l = E.simulate({ ...o, live: true }); l.step(300); assert.equal(strip(l.result()), strip(E17.simulate(o))); }
});
test('1.9A: 1000ステップ・競争相手あり・毎ステップ統計でも高速（2秒未満）', () => {
  const t = Date.now(); const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter', 'tough', 'lowMetabolism'], seed: 1 }); g.setAutoContinuous(true); g.advance(1000); g.lineageReport(); assert.ok(Date.now() - t < 2000, String(Date.now() - t));
});
for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
