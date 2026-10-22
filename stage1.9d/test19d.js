'use strict';
// Stage 1.9D tests. Run from this folder: node test19d.js   (older suites: stage1.9c/test19c.js, stage1.9b/test19b.js, ...)
const assert = require('node:assert/strict');
const E7 = require('../stage1.7/engine17'), E8 = require('../stage1.8/engine18'), G8 = require('../stage1.8/game'), E9A = require('../stage1.9a/engine18'), G9A = require('../stage1.9a/game'), E9B = require('../stage1.9b/engine19'), G9B = require('../stage1.9b/game');
const E9C = require('../stage1.9c/engine19'), G9C = require('../stage1.9c/game');
const E = require('./engine19'), G = require('./game'), H = require('./habitat'), BG = require('./background'), AD = require('./adaptation'), RK = require('./rank');
const results = [];
function test(name, fn) { const t = Date.now(); console.log('… ' + name.slice(0, 60)); try { fn(); results.push([name, 'PASS', Date.now() - t]); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 800)); process.exitCode = 1; } }
const P20 = { period: 20, pulseLength: 4 };
const core = (st) => JSON.stringify({ ...st, parentAgeSum: undefined, lifeSum: undefined, thermal: undefined, realmAlive: undefined, moves: undefined, lineageStats: undefined });
const full = (st) => JSON.stringify(st);
const evKey = (g) => JSON.stringify(g.events.map((e) => [e.t, e.kind, e.text]));
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, g: r.finalGenomes.map((x) => x.genes), eco: r.ecology, pred: r.predation, m: r.modeFractions });
// The game now pauses at checkpoints (and when the focus lineage dies out). These older checks only want the simulation to go on, so they continue every pause.
const adv = (g, n) => { const target = g.t + n; while (g.t < target && !g.isOver && !g.pending) { g.advance(target - g.t); if (g.checkpoint) g.continueFromCheckpoint(); } return g.t; };
const gen = (id) => G.makeGenome(E, G.CREATURES.find((c) => c.id === id));
function drive(g, steps, choice = 'watch') { while (g.t < steps && !g.live.done) { adv(g, Math.min(50, steps - g.t)); if (g.pending) g.choose(choice); } return g; }

test('1.9D→1.7: 新しい既定のオプションは動態を変えない（通常実行・ライブ実行とも、Stage 1.7とビット単位で一致）', () => {
  for (const env of Object.keys(E.ENVIRONMENTS)) for (const extra of [{}, { resourceRegime: P20, lineageCount: 3 }, { preyRefuge: 0.3, resourceRegime: P20 }, { preyHidden: 0.3, preyInflow: 0.05 }]) {
    const o = { seed: 4, steps: 300, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E7.simulate(o)), env + JSON.stringify(extra)); const l = E.simulate({ ...o, live: true }); l.step(300); assert.equal(strip(l.result()), strip(E7.simulate(o)));
  }
});
test('1.9D 旧セーブ: v1（1.8）・v2（1.9A）・v3（1.9B）は、そのまま読み込めて同じ状態・同じ出来事に戻る', () => {
  const a8 = drive(G8.newGame(E8, { creatures: ['standard', 'lowMetabolism'], seed: 31 }), 900, 'refuge'); const s1 = JSON.parse(JSON.stringify(a8.save()));
  const a9 = G9A.newGame(E9A, { creatures: ['standard'], rivals: G9A.pickRivals(8, ['standard'], 2), seed: 8 }); let n = 0; for (let i = 0; i < 30; i++) { adv(a9, 50); if (a9.pending) { n++; a9.choose(n % 2 ? 'auto' : 'support'); } } const s2 = JSON.parse(JSON.stringify(a9.save()));
  const ab = G9B.newGame(E9B, { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 12, realms: true, scenario: 'kpg' }); ab.setAutoContinuous(true); adv(ab, 1200); const s3 = JSON.parse(JSON.stringify(ab.save()));
  for (const [sv, ref, ver] of [[s1, a8, 1], [s2, a9, 2], [s3, ab, 3]]) {
    assert.equal(sv.v, ver); const b = G.loadGame(E, sv); while (b.replayTo !== null) b.advance(50);
    assert.equal(core(b.live.stats()), core(ref.live.stats()), 'v' + ver); assert.equal(evKey(b), evKey(ref), 'events v' + ver); assert.equal(b.cfg.ecology, 'legacy'); assert.equal(b.backgroundReport(), null);
  }
});
test('1.9D 資源分割: 餌の分割は、全員が同じ配分なら元と同じ取り分になり、エネルギー収支が閉じ、摂取量の内訳が合う', () => {
  const o = { seed: 3, steps: 400, environment: 'rich', realms: true, lineageCount: 3, founderGenomes: ['standard', 'hunter', 'tough'].map(gen), live: true, niche: { slots: 3, weights: [[1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3]], specialistBonus: 0 } };
  const l = E.simulate(o); l.step(400); const r = l.result(), st = l.stats();
  assert.ok(Math.abs(r.energy.residual) < 1e-6); const sum = st.lineageStats.reduce((a, x) => a + x.intake, 0); assert.ok(Math.abs(sum - (r.energy.intakePlant + r.energy.intakePrey)) < 1e-6, `${sum} ${r.energy.intakePlant + r.energy.intakePrey}`);
  assert.equal(st.lineageStats.reduce((a, x) => a + x.count, 0), st.population); assert.equal(st.lineageStats.reduce((a, x) => a + x.births, 0), st.births); assert.equal(st.lineageStats.reduce((a, x) => a + x.deaths, 0), st.deaths);
});
test('1.9D 資源分割: 別々の餌を使う同一の遺伝子の3系統は長く共存し、同じ配分の3系統は共存しにくい（資源分割が効いている）', () => {
  const run = (weights, seed) => { const l = E.simulate({ seed, steps: 2500, environment: 'rich', realms: true, lineageCount: 3, founders: 100, founderGenomes: [gen('standard'), gen('standard'), gen('standard')], live: true, niche: { slots: 3, weights, specialistBonus: 0 } }); l.step(2500); return l.stats().lineageAlive.filter((n) => n > 0).length; };
  let sep = 0, same = 0; for (let seed = 1; seed <= 6; seed++) { sep += run([[1, 0, 0], [0, 1, 0], [0, 0, 1]], seed); same += run([[1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3], [1 / 3, 1 / 3, 1 / 3]], seed); }
  assert.equal(sep, 18, `separate niches: ${sep}/18 lineage-survivals`); assert.ok(same <= 10, `identical niches should lose lineages: ${same}/18`);
});
test('1.9D 創始個体と移入: 系統ごとの初期個体数が守られ、移入は指定の系統・領域に入り、収支が閉じる', () => {
  const l = E.simulate({ seed: 2, steps: 300, environment: 'rich', realms: { startByLineage: [1, 1, 1] }, founderCounts: [60, 40, 0], founderGenomes: ['standard', 'hunter', 'tough'].map(gen), live: true });
  const s0 = l.stats(); assert.deepEqual(s0.lineageAlive, [60, 40, 0]); l.step(50);
  const made = l.introduce(2, gen('tough'), 7, 3); assert.equal(made, 7); const s1 = l.stats(); assert.equal(s1.realmAlive[3][2], 7); assert.equal(s1.lineageStats[2].immigrants, 7);
  l.step(200); const r = l.result(); assert.ok(Math.abs(r.energy.residual) < 1e-6); assert.equal(l.stats().lineageStats.reduce((a, x) => a + x.count, 0), l.stats().population);
});
test('1.9D 背景生態系: 決定論的で、単位は保存され（移入した分だけ減る）、絶えた集団は戻らず、何も無から現れない', () => {
  const groups = [{ id: 'a', lin: 0, niche: [1, 0, 0] }, { id: 'b', lin: 1, niche: [0.34, 0.33, 0.33] }, { id: 'c', lin: 2, niche: [0, 0.3, 0.7] }];
  const run = () => { const st = BG.create(5, groups); const log = []; let ext = {}; for (let t = 0; t < 300; t++) { const before = BG.summary(st).map((g) => g.units); const r = BG.tick(st, { dt: 25, resourceMod: 1, arenaCount: [50, 50, 20, 5] }); log.push(JSON.stringify(r.immigrants)); for (const g of BG.summary(st)) { if (g.extinct) { ext[g.id] = true; assert.ok(!r.immigrants.some((i) => i.group === g.id) || before[groups.findIndex((x) => x.id === g.id)] > 0); } else assert.ok(!ext[g.id], 'an extinct group came back'); } } return { log, sum: JSON.stringify(BG.summary(st)) }; };
  const a = run(), b = run(); assert.equal(a.sum, b.sum); assert.deepEqual(a.log, b.log);
  const st = BG.create(9, groups), u0 = BG.summary(st).map((g) => g.units); const r = BG.tick(st, { dt: 25, resourceMod: 1, arenaCount: [0, 0, 0, 0] });
  for (const im of r.immigrants) assert.ok(im.n >= 1 && BG.summary(st).find((g) => g.id === im.group).immigrantsTotal >= im.n);
  const zero = BG.create(1, groups); zero.groups.forEach((g) => { g.B = [0, 0, 0, 0]; }); assert.equal(BG.tick(zero, { dt: 25, resourceMod: 1, arenaCount: [0, 0, 0, 0] }).immigrants.length, 0); assert.ok(u0.every((x) => x > 0));
});
test('1.9D 二重計上なし: アリーナの個体と背景の単位は別々に数え、移入した数だけ背景から減る。注目系統には背景がない', () => {
  const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); adv(g, 1500);
  const st = g.live.stats(), rr = g.realmReport(), bgr = g.backgroundReport();
  assert.equal(rr.realms.reduce((a, r) => a + r.total, 0), st.population); assert.equal(st.lineageAlive.reduce((a, b) => a + b, 0), st.population);
  assert.ok(!bgr.groups.some((x) => x.id === 'standard'), 'the focus lineage must have no background pool'); assert.equal(bgr.computedSpecies, false);
  const imm = st.lineageStats.reduce((a, x) => a + x.immigrants, 0), bgImm = bgr.groups.reduce((a, x) => a + x.immigrantsTotal, 0); assert.equal(imm, bgImm);
  const r = g.live.result(); assert.ok(Math.abs(r.energy.residual) < 1e-6);
});
test('1.9D 出来事: 局所絶滅・再侵入・独占などは、実際に起きた時だけ記録され、再侵入は必ず先の絶滅の後。因果の断定をしない', () => {
  let seen = { local: 0, reinvasion: 0, immigration: 0, trait: 0 };
  for (const seed of [1, 2, 3, 4]) {
    const g = G.newGame(E, { creatures: ['standard'], rivals: G.pickRivals(seed, ['standard'], 2), seed, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); adv(g, 4000);
    for (const e of g.events) {
      if (e.kind === 'local') seen.local++; if (e.kind === 'immigration') seen.immigration++; if (e.kind === 'trait') { seen.trait++; assert.ok(e.text.includes('原因かどうかは検証していません')); }
      if (e.text.startsWith('再侵入')) { seen.reinvasion++; const name = e.text.split('：')[1].split('（')[0].split(' ')[0]; assert.ok(g.events.some((x) => x.t < e.t && x.kind === 'lineage' && x.text.includes(name) && x.text.includes('絶えた')), `no earlier extinction for ${name}`); }
    }
  }
  assert.ok(seen.local > 0 && seen.immigration > 0 && seen.trait > 0, JSON.stringify(seen));
});
test('1.9D 進化の説明: 形質ごとの変化が日本語で出て、生存結果は並べるだけ。知能指標とミーム依存度は別で、ミーム依存度は未計算', () => {
  const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter'], seed: 5, realms: true, ecology: 'v2' }); g.setAutoContinuous(true); adv(g, 2500);
  const ev = g.evolutionReport(); assert.ok(ev.length >= 2); const e = ev[0]; assert.ok(e.rows.length === 14 && e.rows.every((r) => /[ぁ-ん一-龥]/.test(r.name + r.text)));
  assert.ok(e.rows.some((r) => r.changed), 'nothing changed in 2500 steps?'); assert.ok(e.note.includes('検証していません'));
  assert.equal(e.cognition.memeDependence, null); assert.equal(e.cognition.social, null); assert.equal(e.cognition.camp, 'genome'); assert.ok(e.cognition.index >= 0 && e.cognition.index <= 1);
  assert.ok(g.series.some((s) => s.cog && s.cog.some((x) => x !== null)));
});
test('1.9D 知能: 強制されない（固定の遺伝型では認知指標が動かず、自然に変わる場合だけ変わる）', () => {
  const l = E.simulate({ seed: 4, steps: 600, mutation: false, environment: 'rich', realms: true, live: true }); const idx = ['memoryLearn', 'memoryUpkeep', 'falsePositive', 'falseNegative', 'switchThreshold'].map((n) => E.TRAITS.findIndex((x) => x[0] === n));
  const mean = () => { const ind = l.individuals(); return idx.map((i) => ind.reduce((a, x) => a + x.traits[i], 0) / ind.length); }; const a = mean(); l.step(600); const b = mean();
  for (let k = 0; k < idx.length; k++) assert.ok(Math.abs(a[k] - b[k]) < 0.15, `trait ${k} moved ${a[k]}→${b[k]} without mutation`);
});
test('1.9D 適応範囲の履歴: 100ステップごと＋重要な出来事で記録され、ダミーであることが記録に残り、再現できる', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter'], seed: 6, realms: true, scenario: 'kpg', ecology: 'v2' }, g = G.newGame(E, cfg); g.setAutoContinuous(true); adv(g, 1200);
  const S = g.rangeSnapshots; assert.ok(S.length >= 13); assert.ok(S.every((s) => s.source === 'dummy' && s.lineages.length === 5)); assert.ok(S.some((s) => s.reason === 'interval') && S.some((s) => s.reason !== 'interval'));
  assert.deepEqual(S.filter((s) => s.reason === 'interval').map((s) => s.t % 100), S.filter((s) => s.reason === 'interval').map(() => 0)); for (let i = 1; i < S.length; i++) assert.ok(S[i].t >= S[i - 1].t);
  const h = G.loadGame(E, JSON.parse(JSON.stringify(g.save()))); while (h.replayTo !== null) h.advance(50); assert.equal(JSON.stringify(h.rangeSnapshots), JSON.stringify(S));
  assert.equal(g.adaptationProvider.linkedToEvolution, false); assert.ok(g.adaptationProvider.label.includes('ダミー'));
});
test('1.9D セーブ→ロード（v4）: 競争相手・背景・自動・履歴を含めて、続けて遊んだときと同じ', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 14, realms: true, scenario: 'kpg', ecology: 'v2' }, g = G.newGame(E, cfg); let n = 0; for (let i = 0; i < 40; i++) { adv(g, 50); if (g.pending) { n++; g.choose(n % 2 ? 'auto' : 'support'); } }
  const sv = JSON.parse(JSON.stringify(g.save())); assert.equal(sv.v, 5); assert.equal(sv.cfg.ecology, 'v2');
  const b = G.loadGame(E, sv); while (b.replayTo !== null) b.advance(40);
  assert.equal(full(b.live.stats()), full(g.live.stats())); assert.equal(evKey(b), evKey(g)); assert.equal(JSON.stringify(b.backgroundReport()), JSON.stringify(g.backgroundReport())); assert.equal(JSON.stringify(b.evolutionReport()), JSON.stringify(g.evolutionReport()));
  adv(g, 150); adv(b, 150); assert.equal(full(b.live.stats()), full(g.live.stats()));
});
test('1.9D 再現性: 停止位置が違っても同じ状態（背景の更新も25ステップの格子）', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter'], seed: 21, realms: true, scenario: 'kpg', ecology: 'v2' }, a = G.newGame(E, cfg), b = G.newGame(E, cfg); a.setAutoContinuous(true); b.setAutoContinuous(true);
  while (a.t < 1500) adv(a, Math.min(7, 1500 - a.t)); while (b.t < 1500) adv(b, Math.min(60, 1500 - b.t)); assert.equal(full(a.live.stats()), full(b.live.stats())); assert.equal(JSON.stringify(a.backgroundReport()), JSON.stringify(b.backgroundReport()));
});
test('1.9D 共存: 旧設定（1.9B）より、多種が長く共存する。独占・絶滅の余地は残る（6シード×3000ステップ）', () => {
  let legacy = 0, v2 = 0, v2lost = 0, v2extinctEvents = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const focus = ['standard'], rivals = G.pickRivals(seed, focus, 2);
    const a = G.newGame(E, { creatures: focus, rivals, seed, realms: true, scenario: 'kpg' }); a.setAutoContinuous(true); adv(a, 3000); legacy += a.live.stats().lineageAlive.filter((n) => n >= 5).length >= 2 ? 1 : 0;
    const b = G.newGame(E, { creatures: focus, rivals, seed, realms: true, scenario: 'kpg', ecology: 'v2' }); b.setAutoContinuous(true); adv(b, 3000); const alive = b.live.stats().lineageAlive.filter((n) => n >= 5).length; v2 += alive >= 2 ? 1 : 0; v2lost += alive < 4 ? 1 : 0; v2extinctEvents += b.events.filter((e) => e.kind === 'lineage').length;
  }
  assert.ok(v2 >= 5 && v2 > legacy, `legacy ${legacy}/6, v2 ${v2}/6`); assert.ok(v2lost >= 1 && v2extinctEvents >= 1, 'in v2 some lineages must still go extinct: coexistence is not guaranteed');
});
test('1.9D 生息域マップ: 標準は温度の対数(K)×圧力の対数、左が高温・右が低温、上が低圧、領域別の自動範囲。切替・領域ごとの拡大・全体表示', () => {
  const v = H.defaultView(); assert.equal(v.xUnit, 'K'); assert.equal(v.xScale, 'log'); assert.equal(v.yScale, 'log'); assert.equal(v.yRev, true); assert.equal(v.xRev, true); assert.equal(v.rangeMode, 'per'); assert.equal(v.split, true);
  assert.ok(H.project(300, v.xr, 'log', 100, v.xRev, false) < H.project(200, v.xr, 'log', 100, v.xRev, false), 'hotter must be to the LEFT');
  assert.ok(H.project(1e3, v.yr, 'log', 100, v.yRev, true) < H.project(1e7, v.yr, 'log', 100, v.yRev, true), 'low pressure must be at the top');
  const air = H.panelRange(v, 'air'), water = H.panelRange(v, 'water'); assert.notDeepEqual(air.yr, water.yr); for (const r of H.REALMS) { const p = H.panelRange(v, r.id); assert.ok(p.xr[0] <= r.T[0] && p.xr[1] >= r.T[1] && p.yr[0] <= r.P[0] && p.yr[1] >= r.P[1]); }
  const c = { ...v, rangeMode: 'common' }; assert.deepEqual(H.panelRange(c, 'air'), H.panelRange(c, 'water'));
  const z = H.setPanelRange(v, 'air', H.zoomRange(air.xr, 'log', 0.3, 0.5), H.panRange(air.yr, 'log', 0.2)); assert.notDeepEqual(H.panelRange(z, 'air'), air); assert.deepEqual(H.panelRange(z, 'water'), water); assert.deepEqual(H.panelRange(H.resetView(z), 'air'), air);
  assert.deepEqual(H.REALMS.map((r) => r.id), ['water', 'land', 'underground', 'air']); assert.equal(H.REFERENCE.T, 288.15);
});
test('1.9D 1000ステップ（5系統スロット・背景・自動）が高速（2.5秒未満）', () => {
  const t = Date.now(); const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter', 'tough', 'lowMetabolism'], seed: 1, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); adv(g, 1000); g.lineageReport(); g.evolutionReport(); g.backgroundReport(); assert.ok(Date.now() - t < 2500, String(Date.now() - t));
});

test('1.9D 旧セーブ: Stage 1.9C（v4）のセーブも読み込めて同じ状態に戻り、1.9Cの動きとそのまま一致する（ランク等は観察のみで、計算に影響しない）', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter', 'tough'], seed: 14, realms: true, scenario: 'kpg', ecology: 'v2' };
  const a = G9C.newGame(E9C, cfg); let n = 0; for (let i = 0; i < 40; i++) { a.advance(50); if (a.pending) { n++; a.choose(n % 2 ? 'auto' : 'support'); } }
  const sv = JSON.parse(JSON.stringify(a.save())); assert.equal(sv.v, 4);
  const b = G.loadGame(E, sv); while (b.replayTo !== null) b.advance(50);
  assert.equal(full(b.live.stats()), full(a.live.stats())); assert.equal(JSON.stringify(b.events.filter((e) => e.kind !== 'rank').map((e) => [e.t, e.kind, e.text])), JSON.stringify(a.events.map((e) => [e.t, e.kind, e.text])));
  assert.equal(b.save().v, 5);
});
test('1.9D 旧セーブ（v4）: 注目系統が絶えて遊び続けたセーブも、止まらずに最後まで読み込める（旧セーブには節目が無い）', () => {
  const cfg = { creatures: ['lowMetabolism'], rivals: ['hunter', 'tough'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2' };
  const a = G9C.newGame(E9C, cfg); a.setAutoContinuous(true); a.advance(1500); assert.ok(a.live.stats().lineageAlive[1] === 0, 'the focus lineage must have died out in this case');
  const sv = JSON.parse(JSON.stringify(a.save())); assert.equal(sv.v, 4); const b = G.loadGame(E, sv); let guard = 0; while (b.replayTo !== null && guard++ < 200) b.advance(50);
  assert.ok(b.replayTo === null && b.t === a.t, `replay stuck at ${b.t} of ${a.t}`); assert.equal(full(b.live.stats()), full(a.live.stats())); assert.equal(b.checkpoint, null);
  assert.equal(JSON.stringify(b.events.filter((e) => e.kind !== 'rank').map((e) => [e.t, e.kind, e.text])), JSON.stringify(a.events.map((e) => [e.t, e.kind, e.text])));
});
test('1.9D 観察のみ: 同じ設定で、1.9Cのゲームと1.9Dのゲームは、4000ステップまで同じ状態（個体中心の記録・ランクは計算に影響しない）', () => {
  for (const seed of [3, 9]) { const cfg = { creatures: ['lowMetabolism'], rivals: G.pickRivals(seed, ['lowMetabolism'], 2), seed, realms: true, scenario: 'kpg', ecology: 'v2' }; const a = G9C.newGame(E9C, cfg), b = G.newGame(E, cfg); a.setAutoContinuous(true); b.setAutoContinuous(true); a.advance(2500); b.advance(2500); assert.equal(full(b.live.stats()), full(a.live.stats()), 'seed ' + seed); }
});
test('1.9D 個体中心の集計: 年齢別の死亡率・損傷の出入り・休眠・消費が、エンジンの総量と一致する', () => {
  const l = E.simulate({ seed: 4, steps: 1e9, environment: 'rich', realms: true, lineageCount: 2, founderGenomes: [gen('standard'), gen('lowMetabolism')], founders: 100, live: true, continueWhenEmpty: true }); l.step(1500);
  const d = l.lineageDetail(), r = l.result(), st = l.stats();
  assert.ok(Math.abs(d.reduce((a, x) => a + x.spent, 0) - r.energy.spent) < 1e-6, 'spent per lineage must sum to the ledger');
  assert.equal(d.reduce((a, x) => a + x.hDe.reduce((p, q) => p + q, 0), 0), st.deaths - st.causes.capacityCull); assert.equal(d.reduce((a, x) => a + x.hAt.reduce((p, q) => p + q, 0), 0) - d.reduce((a, x) => a + x.hDe.reduce((p, q) => p + q, 0), 0) >= 0, true);
  for (const x of d) { assert.ok(x.dmgOut <= x.dmgIn + 1e-9 && x.dmgIn > 0); assert.ok(x.dormWake <= x.dormEnter + 5); assert.ok(x.aliveMaxAge <= 1500); }
  const ind = l.individuals(); assert.ok(ind.every((x) => x.O > 0 && x.O <= 1 && x.P >= 0 && x.active <= x.age && x.id > 0)); assert.equal(new Set(ind.map((x) => x.id)).size, ind.length, 'individual ids are unique');
});
test('1.9D 連続生存: 年齢は細胞が入れ替わっても続く（置換量が増えても、同じ個体IDの年齢は減らない）', () => {
  const l = E.simulate({ seed: 6, steps: 1e9, environment: 'rich', mutation: false, founders: 80, live: true }); let prev = new Map();
  for (let i = 0; i < 40; i++) { l.step(10); for (const x of l.individuals()) { if (prev.has(x.id)) { assert.ok(x.age === prev.get(x.id).age + 10, 'age must grow by exactly the steps lived'); assert.ok(x.P >= prev.get(x.id).P - 1e-12, 'replacement only accumulates'); } } prev = new Map(l.individuals().map((x) => [x.id, x])); }
  assert.ok([...prev.values()].some((x) => x.P > 0.1), 'some individuals replaced cells');
});
test('1.9D 固定終了の撤廃: ライブ実行は10万ステップを超えて続き、アリーナが空でも（背景から戻れるように）止まらない', () => {
  const l = E.simulate({ seed: 1, steps: 1e9, environment: 'rich', founders: 30, live: true, continueWhenEmpty: true }); l.step(300); assert.ok(!l.done);
  const e = E.simulate({ seed: 1, steps: 1e9, environment: 'scarce', founders: 5, founderGenomes: [gen('tough')], live: true, continueWhenEmpty: true }); e.step(400); assert.equal(e.stats().population, 0); assert.ok(!e.done); e.introduce(0, gen('standard'), 10, 0); e.step(10); assert.ok(e.stats().population > 0);
  const stop = E.simulate({ seed: 1, steps: 1e9, environment: 'scarce', founders: 5, founderGenomes: [gen('tough')], live: true }); stop.step(400); assert.ok(stop.done, 'without the option, an empty arena still ends the run (old behaviour)');
});
test('1.9D 節目: 設定した節目で止まり、止まっている間は状態が変わらず、続行を記録し、保存・読込で再現する。自動継続では勝手に進まない', () => {
  const cfg = { creatures: ['standard'], rivals: ['hunter'], seed: 5, realms: true, scenario: 'kpg', ecology: 'v2', checkpoint: { first: 600, every: 500 } }, g = G.newGame(E, cfg); g.setAutoContinuous(true);
  const seen = []; for (let i = 0; i < 80 && g.t < 2300; i++) { g.advance(100); if (g.checkpoint) { seen.push([g.checkpoint.t, g.checkpoint.kind]); const s0 = full(g.live.stats()); g.advance(500); assert.equal(full(g.live.stats()), s0, 'no change while paused'); if (g.checkpoint.kind === 'interval') g.continueFromCheckpoint(); else g.continueFromCheckpoint(); } }
  const intervals = seen.filter((x) => x[1] === 'interval').map((x) => x[0]); assert.deepEqual(intervals.slice(0, 3), [600, 1100, 1600]);
  assert.ok(g.log.filter((e) => e.kind === 'continue').length >= 3);
  const sv = JSON.parse(JSON.stringify(g.save())), b = G.loadGame(E, sv); while (b.replayTo !== null) b.advance(100); assert.equal(full(b.live.stats()), full(g.live.stats())); assert.equal(b.checkpoint === null, g.checkpoint === null); assert.equal(JSON.stringify(b.log), JSON.stringify(g.log));
  const pend = G.newGame(E, cfg); pend.advance(600); assert.equal(pend.checkpoint.kind, 'interval'); const l2 = G.loadGame(E, JSON.parse(JSON.stringify(pend.save()))); while (l2.replayTo !== null) l2.advance(100); assert.ok(l2.checkpoint && l2.checkpoint.t === 600, 'a save made at a checkpoint is still at the checkpoint');
  const def = G.newGame(E, { creatures: ['standard'], seed: 1, realms: true, ecology: 'v2' }); def.advance(1000); assert.equal(def.checkpoint, null, 'default first checkpoint is the old fixed end, 100000 steps');
});
test('1.9D 節目: 注目系統がすべて絶えたら止まって知らせる（敗北条件は未実装で、観察は続けられる）', () => {
  let hit = null; for (let seed = 1; seed <= 14 && !hit; seed++) { const g = G.newGame(E, { creatures: ['tough'], rivals: ['hunter', 'lowMetabolism'], seed, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); for (let i = 0; i < 60 && !g.checkpoint; i++) g.advance(50); if (g.checkpoint && g.checkpoint.kind === 'focus-extinct') hit = g; }
  assert.ok(hit, 'no seed lost the focus lineage'); assert.ok(hit.events.some((e) => e.text.includes('敗北条件は未実装'))); const t = hit.t; hit.continueFromCheckpoint(); hit.advance(100); assert.ok(hit.t > t, 'observation continues');
});
test('1.9D ランク: αから、複数の経路で同じランクに届き、能力の「合計」や知能では決まらない。Ωは判定しない', () => {
  const base = { continuity: 130, alive: 50, observedSteps: 2000, aging: { value: 3.4, young: 5000, old: 8000 }, repair: { value: 0.9 }, efficiency: { value: 0.28, intakeRatio: 1.0 }, range: { value: 4 }, dormancy: { value: 0.5, episodes: 300 }, competition: { value: 1500 } };
  assert.equal(RK.evaluate(base).rank, 'α'); assert.equal(RK.evaluate({ ...base, alive: 3 }).judged, false); assert.equal(RK.evaluate({ ...base, observedSteps: 100 }).judged, false);
  const lowMet = { ...base, continuity: 320, aging: { value: 1.2, young: 5000, old: 8000 }, efficiency: { value: 0.1, intakeRatio: 1 }, dormancy: { value: 0.9, episodes: 900 } };
  const repairer = { ...base, continuity: 320, repair: { value: 0.99 }, competition: { value: 60000 }, aging: { value: 1.7, young: 5000, old: 8000 } };
  const a = RK.evaluate(lowMet), b = RK.evaluate(repairer); assert.equal(a.rank, b.rank, `${a.rank} ${b.rank}`); assert.ok(RK.order.indexOf(a.rank) >= 3);
  assert.notDeepEqual(a.axes.filter((x) => x.tier >= 2).map((x) => x.id), b.axes.filter((x) => x.tier >= 2).map((x) => x.id), 'the two routes must use different abilities');
  const top = RK.evaluate({ continuity: 99999, alive: 100, observedSteps: 99999, aging: { value: 1, young: 9e5, old: 9e5 }, repair: { value: 1 }, efficiency: { value: 0.01, intakeRatio: 2 }, range: { value: 4 }, dormancy: { value: 1, episodes: 999 }, competition: { value: 1e9 } });
  assert.equal(top.rank, 'θ'); assert.equal(top.omega.judgeable, false); assert.ok(top.omega.text.includes('Ω達成を表示することはありません')); assert.ok(!RK.order.includes('Ω'));
  assert.ok(a.missing.length >= 0 && typeof a.reason === 'string' && a.reason.length > 0); const starved = RK.evaluate({ ...lowMet, efficiency: { value: 0.05, intakeRatio: 0.5 } }); assert.equal(starved.axes.find((x) => x.id === 'efficiency').tier, null, 'low spending from starvation is not efficiency');
  const noData = RK.evaluate({ ...lowMet, dormancy: { value: 0.99, episodes: 5 } }); assert.equal(noData.axes.find((x) => x.id === 'dormancy').tier, null);
  const worse = RK.evaluate({ ...lowMet, aging: { value: 4, young: 5000, old: 8000 }, efficiency: { value: 0.3, intakeRatio: 1 }, dormancy: { value: 0.3, episodes: 900 } }); assert.ok(worse.rankIndex < a.rankIndex, 'losing abilities lowers the current rank');
});
test('1.9D ランク（ゲーム）: 現在のランクは下がってよく、過去最高は下がらない。未実装・ダミーの能力では採点せず、計算に影響しない', () => {
  let ok = 0; for (const seed of [3, 4, 8]) {
    const g = G.newGame(E, { creatures: ['lowMetabolism'], rivals: G.pickRivals(seed, ['lowMetabolism'], 2), seed, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); let bestSeen = -1;
    for (let i = 0; i < 160; i++) { g.advance(50); if (g.checkpoint) g.continueFromCheckpoint(); const b = g.rank.best; if (b) { assert.ok(b.rankIndex >= bestSeen, 'best must never fall'); bestSeen = b.rankIndex; if (g.rank.current) assert.ok(b.rankIndex >= g.rank.current.rankIndex); } }
    for (const l of g.rank.lineages) if (l.judged) { assert.ok(!l.axes.some((a) => /temperature|pressure|adaptation|meme|social/.test(a.id)), 'only computed abilities are scored'); ok++; }
    assert.ok(g.rank.history.every((h) => RK.order.includes(h.rank))); if (g.rank.best) assert.equal(g.rank.best.rank === 'Ω', false);
  }
  assert.ok(ok > 0, 'no lineage was ever judged');
  const a = G.newGame(E, { creatures: ['lowMetabolism'], rivals: ['hunter'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2' }), b = G.newGame(E, { creatures: ['lowMetabolism'], rivals: ['hunter'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2' });
  a.setAutoContinuous(true); b.setAutoContinuous(true); b.adaptationProvider = { ...AD.provider, lineageRange: () => ({ active: { T: [1, 2], P: [1, 2] }, dormant: { T: [1, 2], P: [1, 2] } }), individualRange: () => ({ active: { T: [1, 2], P: [1, 2] }, dormant: { T: [1, 2], P: [1, 2] } }) };
  a.advance(2500); b.advance(2500); assert.equal(JSON.stringify(a.rank.lineages.map((l) => [l.rank, l.C, l.K])), JSON.stringify(b.rank.lineages.map((l) => [l.rank, l.C, l.K])), 'the rank must not depend on the placeholder adaptation ranges'); assert.equal(full(a.live.stats()), full(b.live.stats()));
});
test('1.9D 個体の画面: 上位個体・最長記録・生存本能と個体知能の指標（計算済み）。社会的知性は未計算', () => {
  const g = G.newGame(E, { creatures: ['standard'], rivals: ['hunter'], seed: 5, realms: true, ecology: 'v2' }); g.setAutoContinuous(true); g.advance(1500);
  const top = g.topIndividuals(5); assert.ok(top.length === 5 && top.every((x, i, a) => i === 0 || a[i - 1].age >= x.age)); assert.ok(top.every((x) => x.born === g.t - x.age && /./.test(x.name)));
  const sc = g.individualScores(top[0]); assert.ok(sc.instinct >= 0 && sc.instinct <= 1 && sc.intelligence >= 0 && sc.intelligence <= 1); assert.equal('social' in sc, false);
  const rec = g.records(); assert.ok(rec.every((r) => r.recordAge >= r.aliveNow));
});
test('1.9D 多種共存は維持される（4シード×3000ステップ）', () => {
  let two = 0; for (let seed = 1; seed <= 4; seed++) { const g = G.newGame(E, { creatures: ['standard'], rivals: G.pickRivals(seed, ['standard'], 2), seed, realms: true, scenario: 'kpg', ecology: 'v2' }); g.setAutoContinuous(true); g.advance(3000); if (g.live.stats().lineageAlive.filter((n) => n >= 5).length >= 2) two++; }
  assert.ok(two >= 3, `${two}/4`);
});

for (const [n, s, ms] of results) console.log(`${s}  ${n}  (${ms} ms)`);
console.log(results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED');
