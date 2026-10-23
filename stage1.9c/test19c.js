'use strict';
// Stage 1.9C tests. Run from this folder: node test19c.js   (older suites: stage1.9b/test19b.js, stage1.9a/test19.js, stage1.8/test18.js, ...)
const assert = require('node:assert/strict');
const E7 = require('../stage1.7/engine17'), E8 = require('../stage1.8/engine18'), G8 = require('../stage1.8/game'), E9A = require('../stage1.9a/engine18'), G9A = require('../stage1.9a/game'), E9B = require('../stage1.9b/engine19'), G9B = require('../stage1.9b/game');
const E = require('./engine19'), G = require('./game'), H = require('./habitat'), BG = require('./background'), AD = require('./adaptation');
const results = [];
function test(name, fn) { const t = Date.now(); try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 800)); process.exitCode = 1; } }
const P20 = { period: 20, pulseLength: 4 };
const core = (st) => JSON.stringify({ ...st, parentAgeSum: undefined, lifeSum: undefined, thermal: undefined, realmAlive: undefined, moves: undefined, lineageStats: undefined });
const full = (st) => JSON.stringify(st);
const evKey = (g) => JSON.stringify(g.events.map((e) => [e.t, e.kind, e.text]));
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, g: r.finalGenomes.map((x) => x.genes), eco: r.ecology, pred: r.predation, m: r.modeFractions });
const gen = (id) => G.makeGenome(E, G.CREATURES.find((c) => c.id === id));
function drive(g, steps, choice = 'watch') { while (g.t < steps && !g.live.done) { g.advance(Math.min(50, steps - g.t)); if (g.pending) g.choose(choice); } return g; }

test('1.9C→1.7: 新しい既定のオプションは動態を変えない（通常実行・ライブ実行とも、Stage 1.7とビット単位で一致）', () => {
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of [{}, { resourceRegime: P20, lineageCount: 3 }, { preyRefuge: 0.3, resourceRegime: P20 }, { preyHidden: 0.3, preyInflow: 0.05 }]) {
    const o = { seed: 4, steps: 300, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E7.simulate(o)), env + JSON.stringify(extra)); const l = E.simulate({ ...o, live: true }); l.step(300); assert.equal(strip(l.result()), strip(E7.simulate(o)));
  }
});
test('1.9C 旧セーブ: v1（1.8）・v2（1.9A）・v3（1.9B）は、そのまま読み込めて同じ状態・同じ出来事に戻る', () => {
  const a8 = drive(G8.newGame(E8, { creatures: ['standard', 'lowMetabolism'], seed: 31 }), 900, 'refuge'); const s1 = JSON.parse(JSON.stringify(a8.save()));
  const a9 = G9A.newGame(E9A, { creatures: ['standard'], rivals: G9A.pickRivals(8, ['standard'], 2), seed: 8 }); let n = 0; for (let i = 0; i < 30; i++) { a9.advance(50); if (a9.pending) { n++; a9.choose(n % 2 ? 'auto' : 'support'); } } const s2 = JSON.parse(JSON.stringify(a9.save()));
  const ab = G9B.newGame(E9B, { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 12, realms: true, scenario: 'kpg' }); ab.setAutoContinuous(true); ab.advance(1200); const s3 = JSON.parse(JSON.stringify(ab.save()));
  for (const [sv, ref, ver] of [[s1, a8, 1], [s2, a9, 2], [s3, ab, 3]]) {
    assert.equal(sv.v, ver); const b = G.loadGame(E, sv); while (b.replayTo !== null) b.advance(50);
    assert.equal(core(b.live.stats()), core(ref.live.stats()), 'v' + ver); assert.equal(evKey(b), evKey(ref), 'events v' + ver); assert.equal(b.cfg.ecology, 'legacy'); assert.equal(b.backgroundReport(), null);
  }
});
test('1.9C 資源分割: 餌の分割は、全員が同じ配分なら元と同じ取り分になり、エネルギー収支が閉じ、摂取量の内訳が合う', () => {
  const o = { seed: 3, steps: 400, environment: 'rich', realms: true, lineageCount: 3, founderGenomes: ['standard', 'hunter', 'tough'].map(gen), live: true, niche: { slots: 3, weights: [[1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3]], specialistBonus: 0 } };
  const l = E.simulate(o); l.step(400); const r = l.result(), st = l.stats();
  assert.ok(Math.abs(r.energy.residual) < 1e-6); const sum = st.lineageStats.reduce((a, x) => a + x.intake, 0); assert.ok(Math.abs(sum - (r.energy.intakePlant + r.energy.intakePrey)) < 1e-6, `${sum} ${r.energy.intakePlant + r.energy.intakePrey}`);
  assert.equal(st.lineageStats.reduce((a, x) => a + x.count, 0), st.population); assert.equal(st.lineageStats.reduce((a, x) => a + x.births, 0), st.births); assert.equal(st.lineageStats.reduce((a, x) => a + x.deaths, 0), st.deaths);
});
test('1.9C 資源分割: 別々の餌を使う同一の遺伝子の3系統は長く共存し、同じ配分の3系統は共存しにくい（資源分割が効いている）', () => {
  const run = (weights, seed) => { const l = E.simulate({ seed, steps: 2500, environment: 'rich', realms: true, lineageCount: 3, founders: 100, founderGenomes: [gen('standard'), gen('standard'), gen('standard')], live: true, niche: { slots: 3, weights, specialistBonus: 0 } }); l.step(2500); return l.stats().lineageAlive.filter((n) => n > 0).length; };
  let sep = 0, same = 0; for (let seed = 1; seed <= 6; seed++) { sep += run([[1, 0, 0], [0, 1, 0], [0, 0, 1]], seed); same += run([[1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3]], seed); }
  assert.equal(sep, 18, `separate niches: ${sep}/18 lineage-survivals`); assert.ok(same <= 10, `identical niches should lose lineages: ${same}/18`);
});
test('1.9C 創始個体と移入: 系統ごとの初期個体数が守られ、移入は指定の系統・領域に入り、収支が閉じる', () => {
  const l = E.simulate({ seed: 2, steps: 300, environment: 'rich', realms: { startByLineage: [1, 1, 1] }, founderCounts: [60, 40, 0], founderGenomes: ['standard', 'hunter', 'tough'].map(gen), live: true });
  const s0 = l.stats(); assert.deepEqual(s0.lineageAlive, [60, 40, 0]); l.step(50);
  const made = l.introduce(2, gen('tough'), 7, 3); assert.equal(made, 7); const s1 = l.stats(); assert.equal(s1.realmAlive[3][2], 7); assert.equal(s1.lineageStats[2].immigrants, 7);
  l.step(200); const r = l.result(); assert.ok(Math.abs(r.energy.residual) < 1e-6); assert.equal(l.stats().lineageStats.reduce((a, x) => a + x.count, 0), l.stats().population);
});
test('1.9C 背景生態系: 決定論的で、単位は保存され（移入した分だけ減る）、絶えた集団は戻らず、何も無から現れない', () => {
  const groups = [{ id: 'a', lin: 0, niche: [1, 0, 0] }, { id: 'b', lin: 1, niche: [0.34, 0.33, 0.33] }, { id: 'c', lin: 2, niche: [0, 0.3, 0.7] }];
  const run = () => { const st = BG.create(5, groups); const log = []; let ext = {}; for (let t = 0; t < 300; t++) { const before = BG.summary(st).map((g) => g.units); const r = BG.tick(st, { dt: 25, resourceMod: 1, arenaCount: [50, 50, 20, 5] }); log.push(JSON.stringify(r.immigrants)); for (const g of BG.summary(st)) { if (g.extinct) { ext[g.id] = true; assert.ok(!r.immigrants.some((i) => i.group === g.id) || before[groups.findIndex((x) => x.id === g.id)] > 0); } else assert.ok(!ext[g.id], 'an extinct group came back'); } } return { log, sum: JSON.stringify(BG.summary(st)) }; };
  const a = run(), b = run(); assert.equal(a.sum, b.sum); assert.deepEqual(a.log, b.log);
  const st = BG.create(9, groups), u0 = BG.summary(st).map((g) => g.units); const r = BG.tick(st, { dt: 25, resourceMod: 1, arenaCount: [0, 0, 0, 0] });
  for (const im of r.immigrants) assert.ok(im.n >= 1 && BG.summary(st).find((g) => g.id === im.group).immigrantsTotal >= im.n);
  const zero = BG.create(1, groups); zero.groups.forEach((g) => { g.B = [0, 0, 0, 0]; }); assert.equal(BG.tick(zero, { dt: 25, resourceMod: 1, arenaCount: [0, 0, 0, 0] }).immigrants.length, 0); assert.ok(u0.every((x) => x > 0));
});
test('1.9C 二重計上なし: アリーナの個体と背景の単位は別々に数え、移入した数だけ背景から減る。注目系統には背景がない', () => {
  const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); g.advance(1500);
  const st = g.live.stats(), rr = g.realmReport(), bgr = g.backgroundReport();
  assert.equal(rr.realms.reduce((a, r) => a + r.total, 0), st.population); assert.equal(st.lineageAlive.reduce((a, b) => a + b, 0), st.population);
  assert.ok(!bgr.groups.some((x) => x.id === 'standard'), 'the focus lineage must have no background pool'); assert.equal(bgr.computedSpecies, false);
  const imm = st.lineageStats.reduce((a, x) => a + x.immigrants, 0), bgImm = bgr.groups.reduce((a, x) => a + x.immigrantsTotal, 0); assert.equal(imm, bgImm);
  const r = g.live.result(); assert.ok(Math.abs(r.energy.residual) < 1e-6);
});
test('1.9C 出来事: 局所絶滅・再侵入・独占などは、実際に起きた時だけ記録され、再侵入は必ず先の絶滅の後。因果の断定をしない', () => {
  let seen = { local: 0, reinvasion: 0, immigration: 0, trait: 0 };
  for (const seed of [1, 2, 3, 4]) {
    const g = G.newGame(E, { creatures: ['standard'], rivals: G.pickRivals(seed, ['standard'], 2), seed, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); g.advance(4000);
    for (const e of g.events) {
      if (e.kind === 'local') seen.local++; if (e.kind === 'immigration') seen.immigration++; if (e.kind === 'trait') { seen.trait++; assert.ok(e.text.includes('原因かどうかは検証していません')); }
      if (e.text.startsWith('再侵入')) { seen.reinvasion++; const name = e.text.split('：')[1].split('（')[0].split(' ')[0]; assert.ok(g.events.some((x) => x.t < e.t && x.kind === 'lineage' && x.text.includes(name) && x.text.includes('絶えた')), `no earlier extinction for ${name}`); }
    }
  }
  assert.ok(seen.local > 0 && seen.immigration > 0 && seen.trait > 0, JSON.stringify(seen));
});
test('1.9C 進化の説明: 形質ごとの変化が日本語で出て、生存結果は並べるだけ。知能指標とミーム依存度は別で、ミーム依存度は未計算', () => {
  const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter'], seed: 5, realms: true, ecology: 'v2' }); g.setAutoContinuous(true); g.advance(2500);
  const ev = g.evolutionReport(); assert.ok(ev.length >= 2); const e = ev[0]; assert.ok(e.rows.length === 14 && e.rows.every((r) => /[ぁ-ん一-龥]/.test(r.name + r.text)));
  assert.ok(e.rows.some((r) => r.changed), 'nothing changed in 2500 steps?'); assert.ok(e.note.includes('検証していません'));
  assert.equal(e.cognition.memeDependence, null); assert.equal(e.cognition.social, null); assert.equal(e.cognition.camp, 'genome'); assert.ok(e.cognition.index >= 0 && e.cognition.index <= 1);
  assert.ok(g.series.some((s) => s.cog && s.cog.some((x) => x !== null)));
});
test('1.9C 知能: 強制されない（固定の遺伝型では認知指標が動かず、自然に変わる場合だけ変わる）', () => {
  const l = E.simulate({ seed: 4, steps: 600, mutation: false, environment: 'rich', realms: true, live: true }); const idx = ['memoryLearn', 'memoryUpkeep', 'falsePositive', 'falseNegative', 'switchThreshold'].map((n) => E.TRAITS.findIndex((x) => x[0] === n));
  const mean = () => { const ind = l.individuals(); return idx.map((i) => ind.reduce((a, x) => a + x.traits[i], 0) / ind.length); }; const a = mean(); l.step(600); const b = mean();
  for (let k = 0; k < idx.length; k++) assert.ok(Math.abs(a[k] - b[k]) < 0.15, `trait ${k} moved ${a[k]}→${b[k]} without mutation`);
});
test('1.9C 適応範囲の履歴: 100ステップごと＋重要な出来事で記録され、ダミーであることが記録に残り、再現できる', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter'], seed: 6, realms: true, scenario: 'kpg', ecology: 'v2' }, g = G.newGame(E, cfg); g.setAutoContinuous(true); g.advance(1200);
  const S = g.rangeSnapshots; assert.ok(S.length >= 13); assert.ok(S.every((s) => s.source === 'dummy' && s.lineages.length === 5)); assert.ok(S.some((s) => s.reason === 'interval') && S.some((s) => s.reason !== 'interval'));
  assert.deepEqual(S.filter((s) => s.reason === 'interval').map((s) => s.t % 100), S.filter((s) => s.reason === 'interval').map(() => 0)); for (let i = 1; i < S.length; i++) assert.ok(S[i].t >= S[i - 1].t);
  const h = G.loadGame(E, JSON.parse(JSON.stringify(g.save()))); while (h.replayTo !== null) h.advance(50); assert.equal(JSON.stringify(h.rangeSnapshots), JSON.stringify(S));
  assert.equal(g.adaptationProvider.linkedToEvolution, false); assert.ok(g.adaptationProvider.label.includes('ダミー'));
});
test('1.9C セーブ→ロード（v4）: 競争相手・背景・自動・履歴を含めて、続けて遊んだときと同じ', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 14, realms: true, scenario: 'kpg', ecology: 'v2' }, g = G.newGame(E, cfg); let n = 0; for (let i = 0; i < 40; i++) { g.advance(50); if (g.pending) { n++; g.choose(n % 2 ? 'auto' : 'support'); } }
  const sv = JSON.parse(JSON.stringify(g.save())); assert.equal(sv.v, 4); assert.equal(sv.cfg.ecology, 'v2');
  const b = G.loadGame(E, sv); while (b.replayTo !== null) b.advance(40);
  assert.equal(full(b.live.stats()), full(g.live.stats())); assert.equal(evKey(b), evKey(g)); assert.equal(JSON.stringify(b.backgroundReport()), JSON.stringify(g.backgroundReport())); assert.equal(JSON.stringify(b.evolutionReport()), JSON.stringify(g.evolutionReport()));
  g.advance(150); b.advance(150); assert.equal(full(b.live.stats()), full(g.live.stats()));
});
test('1.9C 再現性: 停止位置が違っても同じ状態（背景の更新も25ステップの格子）', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter'], seed: 21, realms: true, scenario: 'kpg', ecology: 'v2' }, a = G.newGame(E, cfg), b = G.newGame(E, cfg); a.setAutoContinuous(true); b.setAutoContinuous(true);
  while (a.t < 1500) a.advance(Math.min(7, 1500 - a.t)); while (b.t < 1500) b.advance(Math.min(60, 1500 - b.t)); assert.equal(full(a.live.stats()), full(b.live.stats())); assert.equal(JSON.stringify(a.backgroundReport()), JSON.stringify(b.backgroundReport()));
});
test('1.9C 共存: 旧設定（1.9B）より、多種が長く共存する。独占・絶滅の余地は残る（6シード×3000ステップ）', () => {
  let legacy = 0, v2 = 0, v2lost = 0, v2extinctEvents = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const focus = ['standard'], rivals = G.pickRivals(seed, focus, 2);
    const a = G.newGame(E, { creatures: focus, rivals, seed, realms: true, scenario: 'kpg' }); a.setAutoContinuous(true); a.advance(3000); legacy += a.live.stats().lineageAlive.filter((n) => n >= 5).length >= 2 ? 1 : 0;
    const b = G.newGame(E, { creatures: focus, rivals, seed, realms: true, scenario: 'kpg', ecology: 'v2' }); b.setAutoContinuous(true); b.advance(3000); const alive = b.live.stats().lineageAlive.filter((n) => n >= 5).length; v2 += alive >= 2 ? 1 : 0; v2lost += alive < 4 ? 1 : 0; v2extinctEvents += b.events.filter((e) => e.kind === 'lineage').length;
  }
  assert.ok(v2 >= 5 && v2 > legacy, `legacy ${legacy}/6, v2 ${v2}/6`); assert.ok(v2lost >= 1 && v2extinctEvents >= 1, 'in v2 some lineages must still go extinct: coexistence is not guaranteed');
});
test('1.9C 生息域マップ: 標準は温度の対数(K)×圧力の対数、上が低圧・右が高温、領域別の自動範囲。領域別／共通の切替、領域ごとの拡大・移動、全体表示', () => {
  const v = H.defaultView(); assert.equal(v.xUnit, 'K'); assert.equal(v.xScale, 'log'); assert.equal(v.yScale, 'log'); assert.equal(v.yRev, true); assert.equal(v.xRev, false); assert.equal(v.rangeMode, 'per'); assert.equal(v.split, true);
  assert.equal(H.project(300, v.xr, 'log', 100, false, false) > H.project(200, v.xr, 'log', 100, false, false), true, 'hotter must be to the right');
  assert.ok(H.project(1e3, v.yr, 'log', 100, v.yRev, true) < H.project(1e7, v.yr, 'log', 100, v.yRev, true), 'low pressure must be at the top');
  const air = H.panelRange(v, 'air'), water = H.panelRange(v, 'water'); assert.notDeepEqual(air.yr, water.yr); assert.ok(air.yr[1] < water.yr[1]); for (const r of H.REALMS) { const p = H.panelRange(v, r.id); assert.ok(p.xr[0] <= r.T[0] && p.xr[1] >= r.T[1] && p.yr[0] <= r.P[0] && p.yr[1] >= r.P[1] && p.xr[0] <= H.REFERENCE.T && p.yr[0] <= H.REFERENCE.P && p.yr[1] >= H.REFERENCE.P); }
  const c = { ...v, rangeMode: 'common' }; assert.deepEqual(H.panelRange(c, 'air'), H.panelRange(c, 'water')); assert.deepEqual(H.panelRange({ ...v, split: false }, 'air'), { xr: v.xr, yr: v.yr });
  const z = H.setPanelRange(v, 'air', H.zoomRange(air.xr, 'log', 0.3, 0.5), H.panRange(air.yr, 'log', 0.2)); assert.notDeepEqual(H.panelRange(z, 'air'), air); assert.deepEqual(H.panelRange(z, 'water'), water, 'other panels must not move');
  const zc = H.setPanelRange(c, 'air', [100, 500], [1e3, 1e6]); assert.deepEqual(zc.xr, [100, 500]); const r = H.resetView(z); assert.deepEqual(H.panelRange(r, 'air'), air); assert.ok(H.ticks(...air.xr, 'log', 'K').length >= 2, 'a narrow log range still needs ticks');
  assert.equal(H.formatTick(1e5, 'log', 'y'), '100k'); assert.equal(H.formatTick(2e7, 'log', 'y'), '20M'); assert.equal(H.formatTick(300, 'log', 'x', 'K'), '300');
});
test('1.9C 1000ステップ（5系統スロット・背景・自動）が高速（2.5秒未満）', () => {
  const t = Date.now(); const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter', 'tough', 'lowMetabolism'], seed: 1, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); g.advance(1000); g.lineageReport(); g.evolutionReport(); g.backgroundReport(); assert.ok(Date.now() - t < 2500, String(Date.now() - t));
});
for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
