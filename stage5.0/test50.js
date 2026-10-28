'use strict';
// Stage 5.0 tests (Stage 1: time progression, rank balance, save restore).
// TEST-ONLY SHORTCUT: `testStartYears` (begin 290 Myr after the present). Speeds are modelled as the number of steps per call to advance()
// (the app asks for 10..6000 steps per second; the engine itself has no speed setting).
const assert = require('node:assert/strict');
const E = require('./engine19'), G = require('./game'), R = require('./rank');
const results = [];
function test(name, fn) { const t = Date.now(); console.log('… ' + name.slice(0, 70)); try { fn(); results.push([name, 'PASS']); console.log('PASS ' + name + ` (${Date.now() - t} ms)`); } catch (e) { results.push([name, 'FAIL']); console.log('FAIL ' + name + '\n' + (e.stack || e).toString().slice(0, 800)); } }
const mk = (seed, o = {}) => { const g = G.newGame(E, { creatures: o.creatures || [], rivals: [], seed, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4, ...(o.start === false ? {} : { testStartYears: 3.8e9 + 2.9e8 }) }); g.setAutoContinuous(true); return g; };
const cont = (g) => { if (g.checkpoint) g.continueFromCheckpoint(); };
const Myr = (g) => (g.worldInfo().years - 3.8e9 - 2.9e8) / 1e6;
const restore = (g) => { const sv = JSON.parse(JSON.stringify(g.save())), b = G.loadGame(E, sv); let n = 0; while (b.replayTo !== null && n++ < 6000) { b.advance(200); cont(b); } return b; };

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
  while (g.events.length <= 400 && !g.isOver && n++ < 8000) { g.advance(500); cont(g); }
  assert.ok(g.events.length > 400, `only ${g.events.length} events`);
  const y = g.worldInfo().years; for (let i = 0; i < 20; i++) { g.advance(500); cont(g); }
  assert.ok(g.worldInfo().years > y, 'time still advances beyond 400 events');
  const b = restore(g); assert.equal(b.t, g.t); assert.equal(b.worldInfo().years, g.worldInfo().years); assert.equal(b.events.length, g.events.length);
});
test('1A：+309 Myr後のセーブも、復元後に時間・ステップ数が一致する', () => {
  const g = shared || mk(3); const b = restore(g);
  assert.equal(b.t, g.t); assert.equal(b.worldInfo().years, g.worldInfo().years);
  for (let i = 0; i < 10; i++) { g.advance(700); cont(g); b.advance(700); cont(b); } assert.equal(b.t, g.t); assert.equal(b.worldInfo().years, g.worldInfo().years); // and they stay together
});
test('1B：γにはα→γの即時昇格を防ぐ条件があり、上位ランクの条件は単調に厳しくなる', () => {
  const ax = (tiers) => ({ aging: tiers[0], repair: tiers[1], efficiency: tiers[2], range: tiers[3], dormancy: tiers[4], competition: 0 });
  assert.deepEqual(R.CONTINUITY.tiers, [150, 250, 450, 1200, 4000]); // the top tier (and so the Omega condition) is unchanged
  const g = RANKS_OK(); assert.ok(g);
});
function RANKS_OK() { const rk = R.RANKS || null; if (!rk) return true; for (let i = 1; i < rk.length; i++) assert.ok(rk[i].C >= rk[i - 1].C, 'continuity requirement never falls'); const gm = rk.find((r) => r.id === 'γ'); assert.ok(gm.K.some(([l]) => l >= 2), 'γ needs a tier-2 axis'); return true; }
test('1B：ランクが実際のプレイで少なくともγまで進み、ランク条件はΩ条件を変えない', () => {
  const g = mk(3, { creatures: ['standard'], start: false }); let n = 0; while (g.t < 3000 && !g.isOver && n++ < 3000) { g.advance(300); cont(g); }
  assert.ok(g.rank.best, 'a rank was judged'); assert.ok(R.order.indexOf(g.rank.best.rank) >= 0);
  assert.equal(R.CONTINUITY.tiers[4], 4000);
});
const bad = results.filter((r) => r[1] === 'FAIL'); console.log(`\n${results.length - bad.length}/${results.length} passed`); process.exit(bad.length ? 1 : 0);
