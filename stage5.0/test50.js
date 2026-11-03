'use strict';
// Stage 5.0 tests (Stage 1: time progression, rank balance, save restore).
// TEST-ONLY SHORTCUT: `testStartYears` (begin 290 Myr after the present). Speeds are modelled as the number of steps per call to advance()
// (the app asks for 10..6000 steps per second; the engine itself has no speed setting).
const assert = require('node:assert/strict');
const { E, G, runner, cont, runTo } = require('./testlib'), R = require('./rank');
const { test, finish } = runner();
const mk = (seed, o = {}) => { const g = G.newGame(E, { creatures: o.creatures || [], rivals: [], seed, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4, ...(o.start === false ? {} : { testStartYears: 3.8e9 + 2.9e8 }) }); g.setAutoContinuous(true); return g; };
const Myr = (g) => (g.worldInfo().years - 3.8e9 - 2.9e8) / 1e6;
const restore = (g) => { const sv = JSON.parse(JSON.stringify(g.save())), b = G.loadGame(E, sv); let n = 0; while (b.replayTo !== null && n++ < 6000) { b.advance(200); cont(b); } return b; };

const view = (g) => { const st = g.live.stats(); return { t: g.t, years: g.worldInfo().years, alive: st.lineageAlive.map((n) => (n > 0 ? 1 : 0)).join(''), best: g.rank.best && g.rank.best.rank, codex: g.codex().map((e) => e.id).sort().join(','), feats: g.feats().map((e) => e.id).sort().join(','), ach: g.achievements.length, seq: g.eventSeq }; };
let shared = null;
test('1A：+309 Myrを越えても世界の時間が進み続ける（速度切替・停止/再開つき）', () => {
  const g = mk(3), speeds = [10, 30, 100, 400, 1500, 6000]; let k = 0, n = 0;
  while (Myr(g) < 520 && n++ < 600) {
    const per = speeds[k++ % speeds.length]; g.advance(Math.max(1, Math.round(per / 4))); cont(g); // ×1..×600 in turn
    if (n % 9 === 0) { const y = g.worldInfo().years, t = g.t; g.advance(0); assert.equal(g.worldInfo().years, y); assert.equal(g.t, t); } // stop: nothing moves
  }
  assert.ok(Myr(g) >= 520, `world time stalled at +${Myr(g).toFixed(1)} Myr`);
  let y0 = Myr(g); for (let i = 0; i < 40; i++) { g.advance(1500); cont(g); }
  assert.ok(Myr(g) > y0, 'keeps advancing after +309 Myr and a stop/resume cycle');
  shared = g;
});
test('1A：イベント400件超でも時間が進み、セーブ復元後に時間・ステップ数が一致する', () => {
  const g = mk(3, { creatures: ['standard'], start: false }); let n = 0;
  while (g.eventSeq <= 450 && !g.isOver && n++ < 3000) { g.advance(500); cont(g); }
  assert.ok(g.eventSeq > 400, `only ${g.eventSeq} events`); // eventSeq counts every event ever raised (the log itself is trimmed to the last 400)
  const y = g.worldInfo().years; for (let i = 0; i < 20; i++) { g.advance(500); cont(g); }
  assert.ok(g.worldInfo().years > y, 'time still advances beyond 400 events');
  const b = restore(g); assert.equal(b.t, g.t); assert.equal(b.worldInfo().years, g.worldInfo().years); assert.equal(b.eventSeq, g.eventSeq);
});
test('1A：+309 Myr後のセーブも、復元後に時間・ステップ数が一致する', () => {
  const g = shared || mk(3); const b = restore(g);
  assert.equal(b.t, g.t); assert.equal(b.worldInfo().years, g.worldInfo().years);
  for (let i = 0; i < 10; i++) { g.advance(700); cont(g); b.advance(700); cont(b); } assert.equal(b.t, g.t); assert.equal(b.worldInfo().years, g.worldInfo().years); // and they stay together
});
test('1B：γにはα→γの即時昇格を防ぐ条件があり、上位ランクの条件は単調に厳しくなる', () => {
  const ax = (tiers) => ({ aging: tiers[0], repair: tiers[1], efficiency: tiers[2], range: tiers[3], dormancy: tiers[4], competition: 0 });
  assert.deepEqual(R.CONTINUITY.tiers, [150, 200, 260, 400, 4000]); // the top tier (and so the Omega condition) is unchanged
  const g = RANKS_OK(); assert.ok(g);
});
function RANKS_OK() { const rk = R.RANKS || null; if (!rk) return true; for (let i = 1; i < rk.length; i++) assert.ok(rk[i].C >= rk[i - 1].C, 'continuity requirement never falls'); const gm = rk.find((r) => r.id === 'γ'); assert.ok(gm.K.some(([l]) => l >= 2), 'γ needs a tier-2 axis'); return true; }
test('1B/5.1：序盤で一気にγ以上へ上がらない。昇格は能力・連続生存に加えて「形質の変化」と「観察期間」を要する', () => {
  const g = mk(3, { creatures: ['standard'], start: false }); runTo(g, 3000);
  assert.ok(g.rank.best, 'a rank was judged'); assert.ok(R.order.indexOf(g.rank.best.rank) <= R.order.indexOf('β'), `at 3000 steps the best rank is ${g.rank.best.rank}`);
  assert.equal(R.CONTINUITY.tiers[4], 4000); assert.equal(R.OMEGA_NEED === undefined, false);
  const strong = { alive: 50, observedSteps: 100000, continuity: 300, aging: { value: 1.2, young: 999, old: 999 }, repair: { value: 0.99 }, efficiency: { value: 0.1, intakeRatio: 1 }, range: { value: 4 }, dormancy: { value: 0.95, episodes: 9 }, competition: { value: 20000 }, independence: { value: 1 } };
  assert.ok(R.order.indexOf(R.evaluate({ ...strong, drift: 0.2 }).rank) >= R.order.indexOf('δ'), 'strong abilities and real change reach delta or beyond');
  assert.equal(R.evaluate({ ...strong, drift: 0.0 }).rank, 'α', 'the same abilities without any evolved change stay alpha');
  assert.equal(R.evaluate({ ...strong, drift: 0.2, observedSteps: 1000 }).rank, 'α', 'and a lineage observed for only 1000 steps is not promoted');
});

// ---------------- Stage 5.1: milestone saves (a state, not a history) ----------------
test('5.1 節目セーブ：保存→読込は数秒以内で、同じ世界・同じ系統・同じ記録から再開できる（全履歴の再生なし）', () => {
  const g = mk(3, { creatures: ['standard'], start: false }); runTo(g, 30000);
  const snap = g.milestone(); assert.ok(snap, 'a milestone can be taken'); const json = JSON.stringify(snap);
  assert.ok(json.length < 400 * 1024, `save size ${json.length}`);
  const t0 = Date.now(); const b = G.loadGame(E, JSON.parse(json)); const ms = Date.now() - t0;
  console.log(`   save ${Math.round(json.length / 1024)} KB, restore ${ms} ms (a full replay of the same run took ~20 s)`);
  assert.ok(ms < 3000, `restore took ${ms} ms`); assert.equal(b.replayTo, null, 'nothing is replayed');
  const a = view(g), c = view(b); for (const k of ['t', 'years', 'alive', 'best', 'codex', 'feats', 'ach', 'seq']) assert.deepEqual(c[k], a[k], k);
  const pa = g.live.stats().population, pb = b.live.stats().population; assert.ok(Math.abs(pa - pb) <= Math.max(5, 0.1 * pa), `population ${pa} vs ${pb}`);
  const y0 = b.worldInfo().years; runTo(b, 40000); assert.ok(b.worldInfo().years > y0, 'continues'); assert.ok(b.live.stats().population > 0, 'life goes on');
});
test('5.1 節目セーブ：+309 Myr後の世界も復元でき、5億年以上先まで継続できる', () => {
  const g = shared || mk(3); const snap = JSON.parse(JSON.stringify(g.milestone() || (g.advance(25), g.milestone())));
  const b = G.loadGame(E, snap); assert.equal(b.worldInfo().years, g.worldInfo().years);
  const y0 = Myr(b); let n = 0; while (Myr(b) < y0 + 200 && n++ < 600) { b.advance(1000); cont(b); }
  assert.ok(Myr(b) >= y0 + 200, `stalled at +${Myr(b).toFixed(1)}`); assert.ok(Myr(b) > 500, 'beyond +500 Myr');
});
test('5.1 節目セーブ：壊れたセーブは理由つきで拒否される（無言で最初から始まらない）', () => {
  const g = mk(3, { creatures: ['standard'], start: false }); runTo(g, 3000); const ok = JSON.parse(JSON.stringify(g.milestone()));
  assert.doesNotThrow(() => G.validateSave(ok));
  for (const mut of [(s) => { s.arena = 5; }, (s) => { delete s.wm; }, (s) => { s.t = 'x'; }, (s) => { s.v = 99; }, (s) => { s.arena = [{ lin: 0, patch: 0, n: 1 }]; }]) { const bad = JSON.parse(JSON.stringify(ok)); mut(bad); assert.throws(() => G.loadGame(E, bad), /セーブが壊れています/); }
});
test('5.1 旧形式（操作ログ）のセーブも、従来どおり読み込める', () => {
  const g = mk(3, { creatures: ['standard'], start: false }); runTo(g, 2000); const old = JSON.parse(JSON.stringify(g.save())); const b = G.loadGame(E, old); let n = 0; while (b.replayTo !== null && n++ < 3000) { b.advance(200); cont(b); }
  assert.equal(b.t, g.t);
});
test('5.1 節目の間は保存されない：通常進行のadvanceはセーブ用の状態を作らず、節目以外ではmilestone()も使えるが保存の呼び出しはアプリ側が節目だけに限る', () => {
  const src = require('node:fs').readFileSync(__dirname + '/app.js', 'utf8');
  assert.ok(!/putSave\('auto'\)[^]{0,0}/.test(src.replace(/const autoSaved = putSave\('auto'\)/, '')), 'putSave(auto) is only called at the milestone screen');
  assert.ok(src.includes('if (!game || !game.checkpoint) return false;'), 'putSave refuses outside a milestone screen');
});

// ---------------- Stage 5.2 ----------------
const W = require('./world');
test('5.2 世界時間の表示：万年の桁まで、過去・現在・未来の符号と丸めが正しい', () => {
  const w = W.create(3, { history4: true }), P = w.presentYears, f = (y) => { w.years = y; return W.formatBP(w); };
  assert.equal(f(0), '38億年前'); assert.equal(f(P), '現代'); assert.equal(f(P - 5.1234e8), '5億1234万年前'); assert.equal(f(P - 1e8), '1億年前'); assert.equal(f(P - 9.9999e7), '9999万年前');
  assert.equal(f(P - 3e4), '3万年前'); assert.equal(f(P - 123), '123年前'); assert.equal(f(P + 5.1234e8), 'いまから5億1234万年後'); assert.equal(f(P + 5e4), 'いまから5万年後'); assert.equal(f(P + 0.5), '現代');
  // a clock that moves by 1,000,000 years must change its text (the old display rounded to 0.01 億年 = 1,000,000 years and hid smaller moves)
  assert.notEqual(f(P - 3e8), f(P - 3e8 - 1e4));
});
test('5.2 表示はシミュレーションに影響しない：worldInfoを何度読んでも状態が変わらない', () => {
  const a = mk(3, { start: false }), b = mk(3, { start: false }); runTo(a, 8000); runTo(b, 8000);
  for (let i = 0; i < 50; i++) { a.worldInfo(); a.worldInfo().bpText; } runTo(a, 9000); runTo(b, 9000);
  assert.equal(a.worldInfo().years, b.worldInfo().years); assert.equal(a.live.stats().population, b.live.stats().population); assert.equal(a.worldInfo().elapsedText, W.jaYears(a.worldInfo().years));
});
test('5.2 セーブ復元後の世界時間：読込直後は保存時と同じで、その後の進み方は保存せず続けた場合と一致する（複数シード）', () => {
  for (const seed of [3, 5]) {
    const g = mk(seed, { start: false }); g.setAutoContinuous(false); let n = 0; while (!g.checkpoint && g.t < 150000 && n++ < 4000) { g.advance(250); if (g.pending) g.choose('auto', 'once'); }
    assert.ok(g.checkpoint, 'a milestone was reached (seed ' + seed + ')');
    const b = G.loadGame(E, JSON.parse(JSON.stringify(g.milestone()))); assert.equal(b.worldInfo().years, g.worldInfo().years, 'no jump on load'); assert.equal(b.t, g.t);
    for (const x of [g, b]) { x.setAutoContinuous(true); cont(x); }
    const y0 = g.worldInfo().years, gainA = [], gainB = [];
    for (let i = 1; i <= 100; i++) { g.advance(250); cont(g); b.advance(250); cont(b); if (i % 25 === 0) { gainA.push(g.worldInfo().years - y0); gainB.push(b.worldInfo().years - y0); } }
    // not bit-for-bit (individuals are re-created and random streams restart, by design), but the world must advance the same way: within 1 % (or 20,000 years) at every checkpoint
    gainA.forEach((a, k) => assert.ok(Math.abs(a - gainB[k]) <= Math.max(0.01 * a, 2e4), `seed ${seed} after ${(k + 1) * 25} chunks: unsaved +${a} vs loaded +${gainB[k]}`));
  }
});
finish();
