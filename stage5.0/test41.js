'use strict';
// Stage 4.0 audit tests (the internal clean-up). The earlier suites run against this code too.
// TEST-ONLY SHORTCUT: `testStartYears` (begin later in the history). Everything else is the game as played.
const assert = require('node:assert/strict'); const crypto = require('node:crypto');
const E40 = require('../stage4.0/engine19'), G40 = require('../stage4.0/game');
const E = require('./engine19'), G = require('./game');
const results = [];
function test(name, fn) { const t = Date.now(); console.log('… ' + name.slice(0, 60)); try { fn(); results.push([name, 'PASS', Date.now() - t]); console.log('PASS ' + name + ` (${Date.now() - t} ms)`); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 900)); process.exitCode = 1; } }
const S4 = (Gm, Em, o = {}) => { const g = Gm.newGame(Em, { creatures: [], rivals: [], environment: 'steady', seed: 3, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4, ...o }); g.setAutoContinuous(true); return g; };
const cont = (g) => { if (g.checkpoint) g.continueFromCheckpoint(); };
const hash = (g) => crypto.createHash('md5').update(JSON.stringify([g.live.stats(), g.codex().map((e) => e.id), g.feats().map((e) => e.id), g.worldInfo().years, Array.from(g.dish().owner)])).digest('hex').slice(0, 12);
const to = (g, t) => { let n = 0; while (g.t < t && !g.isOver && n++ < 5000) { g.advance(t - g.t); cont(g); } return g.t; };

test('整理の前後で、シミュレーションの結果が同じ（Stage 4.0と4.1を、3つの乱数・3つの時代で、約290の時点で比較）', () => {
  let bad = 0, n = 0; for (const [seed, start] of [[3, 3.5e9], [5, 2.9e9], [8, 3.78e9]]) { const a = S4(G40, E40, { seed, testStartYears: start }), pts = []; while (a.t < 9000 && !a.isOver) { a.advance(150); cont(a); pts.push([a.t, hash(a)]); } const b = S4(G, E, { seed, testStartYears: start }); for (const [t, h] of pts) { to(b, t); n++; if (b.t !== t || hash(b) !== h) bad++; } }
  assert.equal(bad, 0, `${bad} of ${n} points differ`);
});
test('近似進化は、小分けにして後続のフレームで進む。1回の呼び出しで進むのは指定したステップまで（以前は最大240ステップ飛んだ）', () => {
  const g = S4(G, E, { testStartYears: 3.5e9 }); let maxDelta = 0, sawPending = false; for (let i = 0; i < 1500 && g.t < 20000; i++) { const t0 = g.t; g.advance(25); cont(g); maxDelta = Math.max(maxDelta, g.t - t0); if (g.approxLeft > 0) sawPending = true; }
  assert.ok(sawPending, 'approximate evolution was in progress at some call boundary'); assert.ok(maxDelta <= 25, `one advance(25) moved ${maxDelta} steps`);
  const old = S4(G40, E40, { testStartYears: 3.5e9 }); let m0 = 0; for (let i = 0; i < 1500 && old.t < 20000; i++) { const t0 = old.t; old.advance(25); cont(old); m0 = Math.max(m0, old.t - t0); } console.log(`  largest jump per advance(25): 4.0 ${m0} steps, 4.1 ${maxDelta} steps`); assert.ok(m0 > 25, 'the old version did jump');
});
test('保存→読込は、近似進化の最中に保存しても同じ状態に戻る。刻み幅を変えても結果は同じ', () => {
  const a = S4(G, E, { testStartYears: 3.5e9 }); let n = 0; while (a.approxLeft === 0 && n++ < 4000) { a.advance(5); cont(a); } assert.ok(a.approxLeft > 0, 'caught it in the middle');
  const sv = JSON.parse(JSON.stringify(a.save())); const b = G.loadGame(E, sv); let gd = 0; while (b.replayTo !== null && gd++ < 3000) { b.advance(20); cont(b); } assert.equal(b.t, a.t); assert.equal(b.approxLeft, a.approxLeft, 'the unfinished part is still unfinished'); assert.equal(hash(b), hash(a));
  to(a, a.t + 800); to(b, b.t + 800); assert.equal(hash(b), hash(a), 'and carries on identically');
  const c = S4(G, E, { testStartYears: 3.5e9 }), d = S4(G, E, { testStartYears: 3.5e9 }); to(c, 4000); let k = 0; while (d.t < 4000 && k++ < 9000) { d.advance(Math.min(7, 4000 - d.t)); cont(d); } assert.equal(hash(c), hash(d), 'the chunking of the calls does not change the result');
});
test('「次の出来事まで」は、記録が400件を超えても新しい出来事を見つける（連番で数える）', () => {
  const g = S4(G, E, { testStartYears: 3.5e9 }); let n = 0; while (g.events.length < 400 && n++ < 400) { g.advance(100); cont(g); } const seq0 = g.eventSeq; let found = 0; n = 0; while (!found && n++ < 600) { g.advance(100); cont(g); found = g.eventsSince(seq0).length; }
  assert.ok(g.events.length <= 400); assert.ok(found > 0, 'a new event is visible after the log was trimmed'); assert.ok(g.eventsSince(seq0).every((e) => e.seq > seq0)); assert.equal(g.eventsSince(g.eventSeq).length, 0);
  const seqs = g.events.map((e) => e.seq); assert.deepEqual(seqs, seqs.slice().sort((x, y) => x - y), 'in order');
});
test('記録の洪水：進化の通知が400件の記録を占めない。重要な出来事（世界・図鑑）が残る。同じ名前の別形態には番号がつく', () => {
  const g = S4(G, E, { testStartYears: 3.5e9 }); to(g, 14000); const kinds = {}; for (const e of g.events) kinds[e.kind] = (kinds[e.kind] || 0) + 1; const evo = kinds.evo || 0;
  console.log('  event kinds after 14000 steps:', JSON.stringify(kinds)); const minor = (kinds.evo || 0) + (kinds.immigration || 0) + (kinds.disaster || 0) + (kinds.local || 0) + (kinds.trait || 0); assert.ok(evo <= 0.35 * g.events.length, `evo ${evo}, minor ${minor} of ${g.events.length}`); assert.ok((kinds.world || 0) + (kinds.codex || 0) + (kinds.lineage || 0) > 0, 'important events are still there');
  const names = g.codex().filter((e) => e.type === 'form').map((e) => e.name); assert.equal(new Set(names).size, names.length, 'no two forms share a name');
  const texts = g.events.map((e) => e.kind + e.text); assert.ok(texts.length - new Set(texts).size < 0.35 * texts.length, 'repeats are limited');
});
test('壊れたセーブは理由つきで断られ、古い形式のセーブは通る（保存データは消さない）', () => {
  const g = S4(G, E, { testStartYears: 3.5e9 }); to(g, 1200); const ok = JSON.parse(JSON.stringify(g.save())); assert.doesNotThrow(() => G.validateSave(ok));
  const bads = [null, 5, {}, { ...ok, cfg: null }, { ...ok, log: 'x' }, { ...ok, t: -4 }, { ...ok, t: NaN }, { ...ok, cfg: { ...ok.cfg, seed: 'a' } }, { ...ok, v: 99 }, { ...ok, log: [{ t: 5, kind: 'continue' }, { t: 2, kind: 'continue' }] }, { ...ok, log: [{ kind: 'continue' }] }];
  for (const b of bads) assert.throws(() => G.loadGame(E, b), /セーブが壊れています/); assert.doesNotThrow(() => G.validateSave({ v: 1, cfg: { creatures: ['standard'], seed: 1 }, t: 100, log: [{ t: 10, kind: 'watch' }, { t: 50, kind: 'support' }] }), 'legacy kinds are accepted');
});
console.log('\n' + results.map((r) => `${r[1]}  ${r[0]}  (${r[2]} ms)`).join('\n') + '\n' + (results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED'));
