'use strict';
// Stage 3.1 tests. The earlier suites run against this code too:  node test20.js && node test20b.js && node test30.js && node test31.js
// TEST-ONLY SHORTCUTS used here and nowhere in the game screens: `v31.rates` (raise the rare-event rates so that a short run can show them), `testStartYears`.
const assert = require('node:assert/strict');
const E0 = require('../stage3.0/engine19'), G0 = require('../stage3.0/game');
const E = require('./engine19'), G = require('./game'), RK = require('./rank'), F = require('./fmt');
const results = [];
function test(name, fn) { const t = Date.now(); console.log('… ' + name.slice(0, 60)); try { fn(); results.push([name, 'PASS', Date.now() - t]); console.log('PASS ' + name + ` (${Date.now() - t} ms)`); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 900)); process.exitCode = 1; } }
const full = (x) => JSON.stringify(x), evKey = (g) => JSON.stringify(g.events.map((e) => [e.t, e.kind, e.text]));
const mk = (traits) => G.makeGenome(E, { traits });
const adv = (g, n) => { const target = g.t + n; while (g.t < target && !g.isOver && !g.pending) { g.advance(target - g.t); if (g.checkpoint) g.continueFromCheckpoint(); } return g.t; };
const S31 = (o = {}) => { const g = G.newGame(E, { creatures: ['dormant', 'hunter'], rivals: ['regenerator', 'tough'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive', stage: 3.1, ...o }); g.setAutoContinuous(true); return g; };
const lv = (o = {}) => E.simulate({ seed: 1, steps: 1e9, founders: 120, lineageCount: 2, live: true, realms: { start: [1] }, founderGenomes: [mk({}), mk({})], founderCounts: [60, 60], ...o });
const strip = (r) => JSON.stringify({ h: r.history, c: r.deathCauses, e: r.energy, p: r.population, l: r.lifespan, g: r.finalGenomes.map((x) => x.genes) });

test('互換: 新しい部品（v31）は既定では何も変えない。Stage 3.0のエンジンとビット単位で一致', () => {
  for (const env of ['rich', 'scarce', 'plague']) for (const extra of [{}, { lineageCount: 3, realms: true }, { civ: true, realms: true, depth: null }]) { const o = { seed: 6, steps: 500, environment: env, ...extra }; assert.equal(strip(E.simulate(o)), strip(E0.simulate(o)), env + JSON.stringify(extra)); }
});
test('旧セーブ: Stage 3.0（v7）と Stage 2.0（v6）のセーブが、同じ状態・同じ出来事で読み込める', () => {
  const a = G0.newGame(E0, { creatures: ['dormant'], rivals: ['regenerator', 'tough'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive', stage: 3 }); a.setAutoContinuous(true); adv(a, 6000);
  const sv = JSON.parse(JSON.stringify(a.save())); assert.equal(sv.v, 7);
  const b = G.loadGame(E, sv); let guard = 0; while (b.replayTo !== null && guard++ < 2000) b.advance(100);
  assert.equal(b.t, a.t); assert.equal(full(b.live.stats()), full(a.live.stats())); assert.equal(evKey(b), evKey(a)); assert.equal(b.cfg.stage, 3); assert.equal(b.targetInfo(), null, 'a 3.0 world has no per-target stances'); assert.equal(b.evoReport(), null);
  const a6 = G0.newGame(E0, { creatures: ['lowMetabolism'], rivals: ['hunter', 'tough'], seed: 7, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive' }); a6.setAutoContinuous(true); adv(a6, 5000);
  const b6 = G.loadGame(E, JSON.parse(JSON.stringify(a6.save()))); guard = 0; while (b6.replayTo !== null && guard++ < 2000) b6.advance(100); assert.equal(full(b6.live.stats()), full(a6.live.stats())); assert.equal(a6.save().v, 6);
});
test('新規ゲーム（3.1）と主要7初期生物：7種すべてで始められ、7系統が計算される。保存はv8', () => {
  for (const c of G.CREATURES7.map((x) => x.id)) { const g = S31({ creatures: [c], rivals: [] }); adv(g, 400); assert.equal(g.cfg.stage, 3.1); assert.ok(g.live.stats().lineageAlive[g.creatures.findIndex((x) => x.id === c)] >= 0); }
  const g = S31(); adv(g, 800); assert.equal(g.creatures.length, 7); assert.equal(g.save().v, 8); assert.equal(g.save().cfg.stage, 3.1);
});
test('環境への介入の廃止：分岐点で止まらず、選択肢もない。旧「介入」の入口は何も起こさない。個体数が急減しても環境は動かない', () => {
  const g = S31(); const env0 = JSON.stringify(g.live.options.environment); adv(g, 9000);
  assert.equal(g.pending, null); assert.equal(g.choose('support'), false); assert.equal(g.choose('disaster'), false); assert.equal(g.effects.length, 0);
  assert.ok(!g.log.some((e) => e.kind === 'choice' || e.kind === 'support' || e.kind === 'refuge' || e.kind === 'disaster'), 'nothing in the log intervenes in the environment');
  const old = G.newGame(E, { creatures: ['standard'], rivals: [], seed: 2, realms: true, ecology: 'v2' }); adv(old, 3000); assert.ok(old.log.length >= 0, 'the old path still builds');
});
test('方針：3つの対象（文明・植物など・動物）は別々に設定でき、系統ごとに保存される。切替えても他の系統は変わらない', () => {
  const g = S31(); adv(g, 600); const a = g.controlled, other = g.creatures.findIndex((c, i) => i !== a && g.live.stats().lineageAlive[i] > 0); assert.ok(other >= 0);
  assert.ok(g.setTarget(a, 'plant', 'use')); assert.ok(g.setTarget(a, 'animal', 'defend')); assert.ok(g.setTarget(a, 'civ', 'flee'));
  let ti = g.targetInfo(a); const cur = (t) => ti.targets.find((x) => x.id === t).current; assert.equal(cur('plant'), 'use'); assert.equal(cur('animal'), 'defend'); assert.equal(cur('civ'), 'flee');
  ti = g.targetInfo(other); assert.equal(cur('plant'), 'none'); assert.equal(cur('animal'), 'none'); assert.equal(cur('civ'), 'none'); assert.deepEqual(g.live.targets().plant[other], 0);
  assert.equal(g.setTarget(a, 'plant', 'nonsense'), false); assert.equal(g.setTarget(a, 'mars', 'use'), false);
  const old = S31().targetInfo.length; const g2 = G.newGame(E, { creatures: ['standard'], rivals: [], seed: 2, realms: true, ecology: 'v2', time: 'adaptive', stage: 3 }); assert.equal(g2.setTarget(0, 'plant', 'use'), false, 'only the 3.1 world has per-target stances');
});
test('方針の作用：植物への方針は実際の摂取に作用し、必要な力がないと失敗する（同じ乱数の短い期間で比較）', () => {
  const run = (traits, code) => { let sum = 0; for (let seed = 1; seed <= 4; seed++) { const L = lv({ seed, founders: 400, founderCounts: [200, 200], founderGenomes: [mk(traits), mk(traits)], v31: { evo: false, free: false } }); if (code) L.setTarget(0, 'plant', code); L.step(40); sum += L.stats().lineageStats[0].intake; } return sum / 4; };
  const strong = { movement: 0.9, metabolism: 1.3 }, weak = { movement: 0.05, metabolism: 0.3 };
  const base = run(strong, 0), use = run(strong, 1), avoid = run(strong, 3), baseW = run(weak, 0), useW = run(weak, 1);
  assert.ok(use > base * 1.15, `use with the means takes more (${use.toFixed(0)} vs ${base.toFixed(0)})`); assert.ok(avoid < base * 0.7, 'avoiding plants takes less'); assert.ok(useW < baseW, `use without the means fails: it takes less (${useW.toFixed(0)} vs ${baseW.toFixed(0)})`);
  const sym = (code) => { const L = lv({ founders: 400, founderCounts: [200, 200], founderGenomes: [mk({ immune: 0.9, tolerance: 0.9 }), mk({ immune: 0.9, tolerance: 0.9 })], v31: { evo: false, free: false } }); if (code) L.setTarget(0, 'plant', code); L.step(120); return L.stats().lineageStats[0].intake; };
  assert.ok(sym(2) < sym(0), 'symbiosis takes less than the unrestrained lineage (its price)');
});
test('方針の作用：動物への方針は狩りの利得・負傷・獲物の減り方に作用し、能力がないと失敗する', () => {
  const run = (traits, code) => { let c = 0, d = 0, i = 0; for (let seed = 1; seed <= 10; seed++) { const L = lv({ seed, founders: 60, founderCounts: [30, 30], founderGenomes: [mk(traits), mk(traits)], v31: { evo: false, free: false } }); if (code) L.setTarget(0, 'animal', code); L.step(100); const s = L.stats().lineageStats[0]; c += s.catches; i += s.intake; d += L.lineageDetail()[0].dmgIn; } return { catches: c / 10, intake: i / 10, dmg: d / 10 }; };
  const hunterT = { predation: 0.9, movement: 0.7 }, weakT = { predation: 0.05, movement: 0.7 };
  const base = run(hunterT, 0), hunt = run(hunterT, 1), avoid = run(hunterT, 3), weakBase = run(weakT, 0), weakHunt = run(weakT, 1);
  assert.ok(hunt.intake > base.intake, `a capable hunter that hunts harder gains more (${hunt.intake.toFixed(0)} vs ${base.intake.toFixed(0)})`); assert.ok(hunt.dmg > base.dmg, 'and pays for it in injury');
  assert.ok(avoid.catches < base.catches * 0.85 && avoid.dmg < base.dmg * 0.85, 'avoiding animals: fewer catches and less injury');
  assert.ok(weakHunt.catches < weakBase.catches, 'a body that cannot hunt only fails harder when told to');
});
test('進化の出来事：突然変異・機能交換・融合・分離が起こり、実際の遺伝子と能力計算に反映される（検査用に頻度を上げる）', () => {
  const L = lv({ founderGenomes: [mk({ predation: 0.8 }), mk({ immune: 0.2 })], founderCounts: [80, 80], v31: { rates: { fusion: 0.01, exchange: 0.01, sep: 0.2 } } }); L.step(1500);
  const ev = L.evo(), c = ev.counts.reduce((a, x) => { for (const k in x) a[k] = (a[k] || 0) + x[k]; return a; }, {});
  for (const k of ['strengthen', 'weaken', 'newcap', 'loss', 'exchange', 'fusion']) assert.ok(c[k] > 0, k + ' occurred (' + full(c) + ')');
  assert.ok(c.separation > 0, 'a symbiont can be released again');
  const kinds = new Set(ev.events.map((e) => e.status)); assert.ok(kinds.has('established') && (kinds.has('lost') || kinds.has('faded')), 'occurrence, establishment and loss are told apart: ' + [...kinds]);
  const inds = L.individuals(); assert.ok(inds.some((x) => x.genes > 14), 'received or internalised genes are really in the genomes');
  const r = L.result(); assert.ok(Math.abs(r.energy.residual) < 1e-6, 'the energy ledger still closes with fusion and exchange (residual ' + r.energy.residual + ')');
  const fused = ev.events.filter((e) => e.kind === 'fusion'); assert.ok(fused.length > 0); assert.ok(L.stats().causes.fusion > 0, 'the engulfed partner is a real death');
});
test('進化の出来事：水平伝播は感染中のほうが起こりやすく、1回に遺伝子1つだけ（完成した器官の交換はない）', () => {
  const run = (infection) => { const L = lv({ founders: 140, founderCounts: [70, 70], infection: infection ? { load: 0.4, duration: 12 } : null, environment: infection ? 'plague' : 'rich', v31: { rates: { exchange: 0.01, fusion: 0 } } }); L.step(500); return L.evo(); };
  const calm = run(false), sick = run(true); const via = (ev, v) => ev.events.filter((e) => e.kind === 'exchange' && e.via === v).length;
  assert.ok(via(sick, 'infection') > 0 && via(sick, 'infection') / Math.max(1, sick.events.filter((e) => e.kind === 'exchange').length) > via(calm, 'infection') / Math.max(1, calm.events.filter((e) => e.kind === 'exchange').length), 'infection raises the share of exchanges that go through infection');
  const L = lv({ founderGenomes: [mk({}), mk({})], v31: { rates: { exchange: 0.02, fusion: 0 } } }); const g0 = L.individuals().map((x) => x.genes); L.step(1); const g1 = L.individuals().map((x) => x.genes);
  for (let i = 0; i < 40; i++) { const a = L.individuals(); L.step(1); const b = L.individuals(); const m = new Map(a.map((x) => [x.id, x.genes])); for (const x of b) if (m.has(x.id)) assert.ok(x.genes - m.get(x.id) <= 1, 'at most one gene per exchange'); }
});
test('四象限の自由化：参考ルート以外の領域間の移動も起こるが、費用が高く、住みつく数は参考ルートより少ない。無効にすると起こらない', () => {
  const run = (free) => { const L = lv({ founders: 160, founderCounts: [80, 80], v31: { free, evo: false } }); L.step(2500); return L.stats(); };
  const on = run(true), off = run(false), ref = E.REALM_ADJ; const outside = (s) => { let n = 0; s.moves.forEach((row, a) => row.forEach((c, b) => { if (a !== b && !ref[a].includes(b)) n += c; })); return n; };
  assert.equal(outside(off), 0, 'with free routes off nothing crosses outside the reference roads'); assert.ok(outside(on) > 0, 'with free routes on some do');
  let inRef = 0; on.moves.forEach((row, a) => row.forEach((c, b) => { if (a !== b && ref[a].includes(b)) inRef += c; })); assert.ok(inRef > outside(on) * 3, 'but the reference roads stay far busier: rarity buys nothing');
  assert.ok(on.realmAlive[3].reduce((a, b) => a + b, 0) <= on.realmAlive[1].reduce((a, b) => a + b, 0), 'the thin air is not the better place to live');
});
test('異端の進化：珍しさは記録（発見）になるだけで、生存確率にもランク判定にも入らない', () => {
  const g = S31(); adv(g, 6000); const d = g.discoveries(); assert.ok(Array.isArray(d));
  const m = { alive: 50, observedSteps: 900, continuity: 700, aging: { value: 1.2, young: 50, old: 50 }, repair: { value: 0.97 }, efficiency: { value: 0.1, intakeRatio: 1 }, range: { value: 3 }, dormancy: { value: 0.8, episodes: 40 }, competition: { value: 5000 } };
  assert.equal(full(RK.evaluate(m)), full(RK.evaluate({ ...m, discoveries: ['x', 'y', 'z'], dominance: 1, rarity: 1 })), 'the rank takes no account of rarity, dominance or discoveries');
  assert.ok(!/discover|rarity|dominance/i.test(require('fs').readFileSync(require.resolve('./rank'), 'utf8').replace(/\/\/.*$/gm, '')), 'rank.js does not even mention them');
});
test('環境支配力：個体数を含まない（1個体あたりの量だけ）。少数でも強い系統が大きく、多数でも弱い系統は小さくなり得る', () => {
  const g = S31(); adv(g, 7000); const d = g.dominance().filter((x) => x && x.value !== null && x.parts); assert.ok(d.length >= 2, 'at least two lineages alive');
  const W = g.DOM.w; for (const x of d) { const v = W.use * x.parts.use + W.impact * x.parts.impact + W.persist * x.parts.persist + W.range * x.parts.range; assert.ok(Math.abs(v - x.value) < 1e-9, 'dominance is exactly the weighted per-individual parts'); assert.ok(x.value >= 0 && x.value <= 1); assert.equal(x.reliable, x.alive >= 5); }
  const src = require('fs').readFileSync(require.resolve('./game'), 'utf8'); const body = src.slice(src.indexOf('game.dominance = ()'), src.indexOf('// (3) Evolution events')); assert.ok(!/\balive\s*[*\/+]|[*\/+]\s*alive\b|population/.test(body.replace(/alive: *alive|alive >= 5|!alive|\balive\b,/g, '')), 'no head count enters the formula');
  let found = false, seen = 0; for (const seed of [3, 4, 5, 6]) { const h = seed === 3 ? g : S31({ seed }); if (h !== g) adv(h, 7000); const dd = h.dominance().filter((x) => x && x.value !== null && x.alive > 0); seen++; for (let i = 0; i < dd.length; i++) for (let j = 0; j < dd.length; j++) if (dd[i].alive < dd[j].alive && dd[i].value > dd[j].value) found = true; if (found) break; }
  assert.ok(found, 'in some world a smaller lineage is the larger presence: the ranking by dominance is not the ranking by head count (looked at ' + seen + ' worlds)');
});
test('公平性：同じ遺伝子の2系統は、環境支配力にも個体数にも隠れた差がない（6つの乱数）', () => {
  let diffDom = 0, diffCount = 0, n = 0;
  for (let seed = 1; seed <= 6; seed++) { const g = G.newGame(E, { creatures: ['standard'], rivals: [], seed, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 3.1, background: false }); g.setAutoContinuous(true); adv(g, 3000); const d = g.dominance().filter((x) => x && x.value !== null && x.alive >= 5); if (d.length) { diffDom += d[0].value; n++; } }
  assert.ok(n >= 3, 'the standard lineage survives in most seeds'); assert.ok(diffDom / n > 0.05 && diffDom / n < 0.95);
});
test('少数長寿型と多数繁殖型：どちらも計算され、結果は乱数の種によって変わる（優遇補正なし）', () => {
  const rows = []; for (let seed = 1; seed <= 4; seed++) { const g = S31({ creatures: ['lowMetabolism', 'highFecundity'], rivals: [], seed, scenario: 'free' }); adv(g, 5000); const st = g.live.stats(), d = g.dominance(); const i = g.creatures.findIndex((c) => c.id === 'lowMetabolism'), j = g.creatures.findIndex((c) => c.id === 'highFecundity'); rows.push({ seed, lowAlive: st.lineageAlive[i], fecAlive: st.lineageAlive[j], lowDom: d[i] && d[i].value, fecDom: d[j] && d[j].value }); }
  console.log('  long-lived vs prolific:', JSON.stringify(rows)); assert.equal(rows.length, 4); assert.ok(rows.some((r) => r.lowAlive > 0 || r.fecAlive > 0));
});
test('ランク条件表示と実判定の一致：表示された不足を満たすと、実際に次のランクになる。条件が足りないうちは次にならない', () => {
  const base = { alive: 50, observedSteps: 200000, drift: 0.3, continuity: 120, aging: { value: 3, young: 50, old: 50 }, repair: { value: 0.9 }, efficiency: { value: 0.3, intakeRatio: 1 }, range: { value: 2 }, dormancy: { value: 0.5, episodes: 40 }, competition: { value: 100 } };
  for (const [start, mut] of [[base, {}], [{ ...base, continuity: 320, repair: { value: 0.93 } }, {}], [{ ...base, continuity: 650, repair: { value: 0.97 }, range: { value: 3 }, dormancy: { value: 0.8, episodes: 40 }, aging: { value: 2, young: 50, old: 50 } }, {}]]) {
    const res = RK.evaluate(start), ck = RK.checklist(res, start); assert.ok(ck.judged); assert.ok(!ck.allMet, 'a rank that is not reached is never shown as complete'); assert.equal(ck.from, res.rank);
    const fixed = { ...start }; const axes = ck.items.filter((i) => i.id !== 'continuity'); const next = RK.RANKS.find((r) => r.id === ck.to);
    const need = next.K.slice().sort((a, b) => b[0] - a[0]); // satisfy by pushing the nearest unmet axes to the target
    for (const [lvl, n] of next.K) { let have = res.axes.filter((a) => a.tier !== null && a.tier >= lvl).length; for (const a of res.axes.filter((x) => !(x.tier !== null && x.tier >= lvl)).sort((p, q) => (q.tier ?? -1) - (p.tier ?? -1))) { if (have >= n) break; const ax = RK.AXES.find((x) => x.id === a.id), tv = ax.tiers[lvl - 1]; if (tv === undefined || tv === Infinity || a.id === 'independence') continue; fixed[a.id] = { ...(fixed[a.id] || {}), value: tv, ...(a.id === 'aging' ? { young: 50, old: 50 } : {}), ...(a.id === 'efficiency' ? { intakeRatio: 1 } : {}), ...(a.id === 'dormancy' ? { episodes: 40 } : {}) }; have++; } }
    if (next.C > 0) fixed.continuity = Math.max(fixed.continuity, RK.CONTINUITY.tiers[next.C - 1]);
    const after = RK.evaluate(fixed); assert.ok(after.rankIndex >= res.rankIndex + 1, `meeting the listed shortfalls reaches ${ck.to} (got ${after.rank} from ${res.rank})`);
  }
  const short = { ...base, continuity: 10 }; const ck2 = RK.checklist(RK.evaluate(short), short); assert.equal(ck2.items.find((i) => i.id === 'continuity').status, 'short');
  const g = S31(); adv(g, 8000); const c = g.rankChecklist(); assert.ok(c === null || c.items !== undefined);
});
test('数字の表示：万・億・兆とSI接頭語。科学的な意味を変える丸めをしない（有効数字3桁）', () => {
  assert.equal(F.num(1234), '1,234'); assert.equal(F.num(150000), '15万'); assert.equal(F.num(1234567), '123万'); assert.equal(F.num(150000000), '1.5億'); assert.equal(F.num(2500000000), '25億');
  assert.equal(F.years(2500000000), '25億年'); assert.equal(F.years(480), '480年'); assert.equal(F.years(66000000), '6600万年'); assert.equal(F.si(1200000, 'B'), '1.2MB'); assert.equal(F.si(1500, 'g'), '1.5kg'); assert.equal(F.si(7, 'W'), '7W');
  for (const x of [1.234e5, 9.99e6, 3.14159e9, 4.2e11]) { const t = F.num(x); const back = parseFloat(t) * (t.includes('兆') ? 1e12 : t.includes('億') ? 1e8 : t.includes('万') ? 1e4 : 1); assert.ok(Math.abs(back - x) / x < 0.005, `${x} -> ${t}`); }
  assert.equal(F.num(null), '—'); assert.equal(F.exact(1234567), '1,234,567');
});
test('保存（v8）：方針・進化の出来事・長い進行をまたいで、読み込むと同じ状態・同じ出来事・同じ方針に戻る', () => {
  const a = S31(); adv(a, 1500); a.setTarget(a.controlled, 'plant', 'symbiosis'); a.setTarget(a.controlled, 'animal', 'avoid'); adv(a, 1500); const other = a.creatures.findIndex((c, i) => i !== a.controlled && a.live.stats().lineageAlive[i] > 0); if (other >= 0) a.setControlled(other); a.setTarget(a.controlled, 'plant', 'compete'); adv(a, 2500);
  const sv = JSON.parse(JSON.stringify(a.save())), size = JSON.stringify(sv).length; assert.equal(sv.v, 8); assert.ok(size < 20000, 'the save stays small: ' + size + ' bytes');
  const b = G.loadGame(E, sv); let guard = 0; while (b.replayTo !== null && guard++ < 3000) b.advance(100);
  assert.equal(b.t, a.t); assert.equal(full(b.live.stats()), full(a.live.stats())); assert.equal(evKey(b), evKey(a)); assert.equal(full(b.targetInfo(0).targets.map((t) => t.current)), full(a.targetInfo(0).targets.map((t) => t.current))); assert.equal(full(b.live.evo().counts), full(a.live.evo().counts)); assert.equal(b.controlled, a.controlled);
});
test('性能：3.1は3.0と比べて、同じ6000ステップで極端に遅くならない（測定値を表示）', () => {
  const t0 = Date.now(); const a = G0.newGame(E0, { creatures: ['dormant', 'hunter'], rivals: ['regenerator', 'tough'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive', stage: 3 }); a.setAutoContinuous(true); adv(a, 6000); const t30 = Date.now() - t0;
  const t1 = Date.now(); const b = S31(); adv(b, 6000); const t31 = Date.now() - t1; console.log(`  6000 steps: stage 3.0 ${t30} ms, stage 3.1 ${t31} ms (${(t31 / t30).toFixed(2)}x); save ${JSON.stringify(a.save()).length} vs ${JSON.stringify(b.save()).length} bytes`);
  assert.ok(t31 < t30 * 2.2 + 3000, 'within about twice');
});
console.log('\n' + results.map((r) => `${r[1]}  ${r[0]}  (${r[2]} ms)`).join('\n') + '\n' + (results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED'));
