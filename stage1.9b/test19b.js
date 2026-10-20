'use strict';
// Stage 1.9B tests. Run from this folder: node test19b.js   (older suites: stage1.9a/test19.js, stage1.8/test18.js, ...)
const assert = require('node:assert/strict');
const E7 = require('../stage1.7/engine17'), E9A = require('../stage1.9a/engine18'), G9A = require('../stage1.9a/game'), G8 = require('../stage1.8/game'), E8 = require('../stage1.8/engine18');
const E = require('./engine19'), G = require('./game'), AD = require('./adaptation'), HS = require('./earthhistory'), H = require('../stage1.9a/habitat');
const results = [];
function test(name, fn) { const t = Date.now(); try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 700)); process.exitCode = 1; } }
const P20 = { period: 20, pulseLength: 4 };
const core = (st) => JSON.stringify({ ...st, parentAgeSum: undefined, lifeSum: undefined, thermal: undefined, realmAlive: undefined, moves: undefined });
const evKey = (g) => JSON.stringify(g.events.map((e) => [e.t, e.kind, e.text]));
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, g: r.finalGenomes.map((x) => x.genes), eco: r.ecology, pred: r.predation, m: r.modeFractions });
function play(mod, Eng, cfg, steps, choice = 'watch') { const g = mod.newGame(Eng, cfg); for (let i = 0; i < steps / 50 && !g.live.done; i++) { g.advance(50); if (g.pending) g.choose(choice); } return g; }
function genomeWith(name, value) { const g = E.founderGenome(), k = E.TRAITS.findIndex((l) => l[0] === name); const make = (w) => { const h = E.cloneGenome(g); h.genes.push({ k: 0, prom: 15, sens: null, len: 1, on: true, eff: [[k, w]] }); return h; }; let lo = -40, hi = 40; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (E.develop(make(m), E.REFERENCE_DEV).traits[k] < value) lo = m; else hi = m; } return make((lo + hi) / 2); }

test('1.9B→1.7: 領域を使わない通常実行・ライブ実行は、Stage 1.7とビット単位で一致（6環境×5条件）', () => {
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of [{}, { resourceRegime: P20, lineageCount: 3 }, { preyRefuge: 0.3, resourceRegime: P20 }, { preyHidden: 0.3, preyInflow: 0.05 }, { variable: false, thermalRegime: { mode: 'periodic', mean: 0.3, amp: 0.2, period: 50 } }]) {
    const o = { seed: 4, steps: 300, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E7.simulate(o)), env + JSON.stringify(extra)); const l = E.simulate({ ...o, live: true }); l.step(300); assert.equal(strip(l.result()), strip(E7.simulate(o)));
  }
});
test('1.9B→1.9A/1.8: 旧セーブ（v1・v2）は、領域なし・シナリオなしの旧動作として同じ状態に戻る', () => {
  const a8 = play(G8, E8, { creatures: ['standard', 'lowMetabolism'], seed: 31 }, 900, 'refuge'); a8.advance(40); const s1 = JSON.parse(JSON.stringify(a8.save())); assert.equal(s1.v, 1);
  const b1 = G.loadGame(E, s1); while (b1.replayTo !== null) b1.advance(50); assert.equal(core(b1.live.stats()), core(a8.live.stats())); assert.equal(evKey(b1), evKey(a8)); assert.equal(b1.realmReport(), null); assert.equal(b1.historyInfo(), null);
  const cfg = { creatures: ['standard'], rivals: G9A.pickRivals(8, ['standard'], 2), seed: 8 }; const a9 = G9A.newGame(E9A, cfg); let n = 0; for (let i = 0; i < 40; i++) { a9.advance(50); if (a9.pending) { n++; a9.choose(n % 2 ? 'auto' : 'support'); } }
  const s2 = JSON.parse(JSON.stringify(a9.save())); assert.equal(s2.v, 2); const b2 = G.loadGame(E, s2); while (b2.replayTo !== null) b2.advance(50); assert.equal(core(b2.live.stats()), core(a9.live.stats())); assert.equal(evKey(b2), evKey(a9));
  assert.equal(b2.save().v, 3); assert.equal(b2.cfg.realms, false); assert.equal(b2.cfg.scenario, 'free');
});
test('1.9B 領域: 4領域に個体が分布し、領域別の合計＝系統別の合計＝全個体数（重複計上なし）', () => {
  const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 3, realms: true }); g.advance(1500); while (g.pending) { g.choose('watch'); g.advance(50); }
  const rr = g.realmReport(), st = g.live.stats(); assert.deepEqual(rr.realms.map((r) => r.name), ['水中', '地上', '地中', '空中']);
  const byRealm = rr.realms.reduce((a, r) => a + r.total, 0), byLin = st.lineageAlive.reduce((a, b) => a + b, 0); assert.equal(byRealm, st.population); assert.equal(byLin, st.population);
  assert.ok(rr.realms.filter((r) => r.total > 0).length >= 3, JSON.stringify(rr.realms.map((r) => r.total))); rr.realms.forEach((r) => assert.equal(r.byLineage.reduce((a, b) => a + b, 0), r.total));
});
test('1.9B 領域: 創始個体は系統ごとの開始領域（地上）から始まり、同じ種が複数の領域に広がり、元の領域にも残る', () => {
  const g = G.newGame(E, { creatures: ['standard'], seed: 5, realms: true }); const r0 = g.realmReport(); assert.equal(r0.realms[1].total, 100); assert.equal(r0.realms[0].total + r0.realms[2].total + r0.realms[3].total, 0);
  g.advance(800); while (g.pending) { g.choose('watch'); g.advance(50); } const r1 = g.realmReport(); assert.ok(r1.realms[1].total > 0, 'land emptied'); assert.ok(r1.realms.filter((r) => r.total > 0).length >= 2);
});
test('1.9B 領域: 移動は隣り合う領域だけで、エネルギー収支が閉じ、移動コストが記録される', () => {
  const l = E.simulate({ seed: 2, steps: 1200, realms: true, lineageCount: 1, live: true }); l.step(1200); const st = l.stats(), r = l.result();
  assert.ok(Math.abs(r.energy.residual) < 1e-6); assert.ok(r.energy.spentBy.moving > 0);
  st.moves.forEach((row, a) => row.forEach((n, b) => { if (n > 0) assert.ok(E.REALM_ADJ[a].includes(b), `${a}->${b}`); })); assert.equal(st.moves[0][3] + st.moves[3][0] + st.moves[2][3] + st.moves[3][2], 0); assert.ok(st.moves.flat().reduce((a, b) => a + b, 0) > 50);
});
test('1.9B 領域: 移動は移動能力・コストに依存する（能力が高いほど、コストが低いほど多く移る）', () => {
  const count = (genome, realms) => { const l = E.simulate({ seed: 7, steps: 400, realms, mutation: false, founders: 60, founderGenomes: [genome], lineageCount: 1, live: true }); l.step(400); return l.stats().moves.flat().reduce((a, b) => a + b, 0); };
  const lo = count(genomeWith('movement', 0.1), true), hi = count(genomeWith('movement', 0.9), true); assert.ok(hi > lo * 1.5, `${lo} ${hi}`);
  const cheap = count(genomeWith('movement', 0.6), { cost: 0.0 }), dear = count(genomeWith('movement', 0.6), { cost: 0.5 }); assert.ok(cheap > dear, `${cheap} ${dear}`);
});
test('1.9B 領域: 領域ごとに環境が違う（食料・熱ストレス・病気）。数値はゲーム上の設定として定義されている', () => {
  const l = E.simulate({ seed: 1, steps: 200, realms: true, variable: false, live: true }); l.step(200); const p = l.patchState();
  assert.ok(p[3].resource < p[2].resource && p[2].resource < p[1].resource, JSON.stringify(p.map((x) => x.resource))); assert.ok(p[3].thermal > p[1].thermal && p[1].thermal > p[0].thermal && p[0].thermal > p[2].thermal);
  assert.ok(p[2].pathogen < p[1].pathogen && p[3].pathogen < p[2].pathogen); assert.ok(p[3].preyCap < p[2].preyCap && p[2].preyCap < p[1].preyCap);
  for (const d of E.REALM_DEFS) assert.ok(d.resource > 0 && d.prey > 0);
});
test('1.9B 領域: 決定論的に再現し、処理時間が妥当（1000ステップ・4領域・競争相手あり・2秒未満）', () => {
  const run = () => { const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 9, realms: true, scenario: 'kpg' }); g.setAutoContinuous(true); const t = Date.now(); g.advance(1000); return [core(g.live.stats()), Date.now() - t, JSON.stringify(g.realmReport())]; };
  const a = run(), b = run(); assert.equal(a[0], b[0]); assert.equal(a[2], b[2]); assert.ok(a[1] < 2000, String(a[1]));
});
test('1.9B 時間・シナリオ: 衝突の外部条件は、食料と寒冷化として加わり、時間とともに戻る。進化の結果は固定しない', () => {
  const c0 = HS.impactConditions(0), c1 = HS.impactConditions(250), c2 = HS.impactConditions(5000); assert.ok(c0.resource < c1.resource && c1.resource < c2.resource && c2.resource > 0.999); assert.ok(c0.thermal > c1.thermal && c1.thermal > c2.thermal);
  const run = (scenario) => { const g = G.newGame(E, { creatures: ['standard'], seed: 4, realms: true, scenario }); g.advance(25); return g.live.patchState().reduce((a, p) => a + p.resource, 0); };
  assert.ok(run('kpg') < run('free') * 0.8);
  const outcomes = new Set(); for (let seed = 1; seed <= 6; seed++) { const g = G.newGame(E, { creatures: ['standard'], rivals: G.pickRivals(seed, ['standard'], 2), seed, realms: true, scenario: 'kpg' }); for (let i = 0; i < 40; i++) { g.advance(50); if (g.pending) g.choose('watch'); } outcomes.add(g.live.stats().lineageAlive.map((x) => x > 0 ? 1 : 0).join('')); }
  assert.ok(outcomes.size > 1, 'the same lineage survived in every seed: the scenario must not fix the outcome: ' + [...outcomes]);
});
test('1.9B 時間・シナリオ: 停止位置が違っても同じ（25ステップの格子で外部条件を更新）。セーブ→ロードも一致', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter'], seed: 12, realms: true, scenario: 'kpg' };
  const a = G.newGame(E, cfg), b = G.newGame(E, cfg); a.setAutoContinuous(true); b.setAutoContinuous(true); while (a.t < 1000) a.advance(Math.min(7, 1000 - a.t)); while (b.t < 1000) b.advance(50); assert.equal(core(a.live.stats()), core(b.live.stats())); assert.equal(JSON.stringify(a.realmReport()), JSON.stringify(b.realmReport()));
  const g = G.newGame(E, cfg); let n = 0; for (let i = 0; i < 30; i++) { g.advance(50); if (g.pending) { n++; g.choose(n % 2 ? 'auto' : 'support'); } } const sv = JSON.parse(JSON.stringify(g.save())); assert.equal(sv.v, 3); assert.equal(sv.cfg.scenario, 'kpg'); assert.equal(sv.cfg.realms, true);
  const l = G.loadGame(E, sv); while (l.replayTo !== null) l.advance(40); assert.equal(core(l.live.stats()), core(g.live.stats())); assert.equal(evKey(l), evKey(g)); assert.equal(JSON.stringify(l.realmReport()), JSON.stringify(g.realmReport()));
});
test('1.9B 時間・シナリオ: 開始年代は約6,604万年前で、イベントは「計算に反映」と「年表のみ」が区別され、時間尺度は未校正の仮定', () => {
  assert.equal(HS.KPG_AGE_YEARS_BP, 66.043e6); assert.deepEqual(HS.EVENTS.filter((e) => e.status === 'applied').map((e) => e.id), ['kpg-impact']); assert.ok(HS.EVENTS.length >= 6 && HS.EVENTS.every((e) => e.ageMa > 0 && e.uncMa > 0 && e.name && e.text));
  assert.ok(HS.EVENTS.every((e, i, a) => i === 0 || e.ageMa <= a[i - 1].ageMa)); assert.equal(HS.TIMESCALES.fine.calibrated, false); assert.equal(Object.keys(HS.TIMESCALES).length, 1);
  let prev = -1; for (const s of [0, 1, 100, 1000, 36525]) { const c = HS.clock(s); assert.ok(c.yearsSinceImpact > prev); prev = c.yearsSinceImpact; assert.ok(c.yearsBP < HS.KPG_AGE_YEARS_BP + 1); } assert.equal(HS.clock(36525 * 2).withinFineScale, false);
  const sc = HS.scaleCheck(25, 26); assert.equal(sc.lifespanDays, 25); assert.ok(sc.note.includes('短命')); assert.ok(HS.scaleCheck(2000, 900).note.includes('1年以上')); assert.equal(HS.formatYearsBP(66.043e6), '約6,604万年前');
  assert.ok(G.newGame(E, { creatures: ['standard'], seed: 1, realms: true, scenario: 'kpg' }).historyInfo().events.length >= 6); assert.equal(G.newGame(E, { creatures: ['standard'], seed: 1, realms: true }).historyInfo(), null);
});
test('1.9B ダミー適応範囲: 決定論的で、ゲノム・シミュレーションとは無関係、「ダミー・未連動」を名乗り、範囲は常に妥当', () => {
  const P = AD.provider; assert.equal(P.source, 'dummy'); assert.equal(P.linkedToEvolution, false); assert.ok(P.label.includes('ダミー') && P.label.includes('未連動'));
  const g1 = G.newGame(E, { creatures: ['standard'], seed: 5, realms: true }), g2 = G.newGame(E, { creatures: ['hunter', 'tough'], seed: 5, realms: true }); g1.advance(300); g2.advance(100);
  assert.equal(JSON.stringify(P.lineageRange(0, 5, 300)), JSON.stringify(P.lineageRange(0, 5, 300))); assert.equal(JSON.stringify(P.lineageRange(0, g1.cfg.seed, 500)), JSON.stringify(P.lineageRange(0, g2.cfg.seed, 500)));
  const wA = [], wP = []; for (let t = 0; t <= 4000; t += 50) { const r = P.lineageRange(1, 5, t); assert.ok(r.active.T[0] > 0 && r.active.T[1] > r.active.T[0] && r.active.P[0] > 0 && r.active.P[1] > r.active.P[0]); assert.ok(r.dormant.T[0] <= r.active.T[0] && r.dormant.T[1] >= r.active.T[1] && r.dormant.P[0] <= r.active.P[0] && r.dormant.P[1] >= r.active.P[1]); wA.push(r.active.T[1] - r.active.T[0]); wP.push(Math.log10(r.active.P[1] / r.active.P[0])); }
  assert.ok(Math.max(...wA) > Math.min(...wA) * 1.5 && Math.max(...wP) > Math.min(...wP) * 1.5); assert.ok(wA.some((v, i) => i && v > wA[i - 1]) && wA.some((v, i) => i && v < wA[i - 1]));
  const ia = P.individualRange(10, 0, 5, 300), ib = P.individualRange(11, 0, 5, 300); assert.notEqual(JSON.stringify(ia), JSON.stringify(ib)); assert.notEqual(JSON.stringify(ia), JSON.stringify(P.lineageRange(0, 5, 300)));
  for (const r of H.REALMS) { const c = AD.realmCentre(r); assert.ok(c.T > r.T[0] && c.T < r.T[1] && c.P > r.P[0] && c.P < r.P[1]); }
});
test('1.9B: ダミー表示の関数は、ゲームの計算結果に一切影響しない（呼んでも呼ばなくても同じ状態）', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter'], seed: 6, realms: true, scenario: 'kpg' }, a = G.newGame(E, cfg), b = G.newGame(E, cfg); a.setAutoContinuous(true); b.setAutoContinuous(true);
  for (let i = 0; i < 20; i++) { a.advance(50); b.advance(50); AD.provider.lineageRange(0, 6, a.t); AD.provider.individualRange(3, 0, 6, a.t); }
  assert.equal(core(a.live.stats()), core(b.live.stats()));
});
for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
