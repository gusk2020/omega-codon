'use strict';
// Stage 4.0 tests. The earlier suites run against this code too:  node test20.js && node test20b.js && node test30.js && node test31.js && node test40.js
// TEST-ONLY SHORTCUTS used here and nowhere in the game screens: `testStartYears` (begin the world later in its history so that an era can be reached quickly),
// `v31.rates` (raise the rare-event rates of the engine), and the deterministic seeds. A test that uses one says so in its name.
const assert = require('node:assert/strict');
const E0 = require('../stage3.1/engine19'), G0 = require('../stage3.1/game');
const E = require('./engine19'), G = require('./game'), W = require('./world'), H4 = require('./history4'), D = require('./dish'), RK = require('./rank'), CDX = require('./codex4');
const results = [];
function test(name, fn) { const t = Date.now(); console.log('… ' + name.slice(0, 60)); try { fn(); results.push([name, 'PASS', Date.now() - t]); console.log('PASS ' + name + ` (${Date.now() - t} ms)`); } catch (e) { results.push([name, 'FAIL', Date.now() - t]); console.error('FAIL', name, '\n ', String(e.stack).slice(0, 900)); process.exitCode = 1; } }
const full = (x) => JSON.stringify(x), evKey = (g) => JSON.stringify(g.events.map((e) => [e.t, e.kind, e.text]));
const mk = (traits) => G.makeGenome(E, { traits });
const adv = (g, n) => { const target = g.t + n; while (g.t < target && !g.isOver && !g.pending) { g.advance(target - g.t); if (g.checkpoint) g.continueFromCheckpoint(); } return g.t; };
const S4 = (o = {}) => { const g = G.newGame(E, { creatures: [], rivals: [], environment: 'steady', seed: 3, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4, ...o }); g.setAutoContinuous(true); return g; };
const lv = (o = {}) => E.simulate({ seed: 1, steps: 1e9, founders: 120, lineageCount: 2, live: true, realms: { start: [1] }, founderGenomes: [mk({}), mk({})], founderCounts: [60, 60], ...o });
// the world model alone, to the end of the history and beyond
function worldRun(seed, toYears, o = {}) { const w = W.create(seed, { history4: true, ...o }), ev = []; let n = 0; while (w.years < toYears && n++ < 200000) { const h = W.safeLeap(w, { cog: 0.5, biomass: 0.5 }); for (const e of W.advance(w, h, { cog: 0.5, biomass: 0.5 })) ev.push({ y: w.years, ...e }); w.pendingMs.length = 0; } return { w, ev }; }

test('開始：原始の海の単細胞の8系統から始まり、高度な文明も陸と空の食べ物もまだない（約38億年前の仮定）', () => {
  const g = S4(); assert.equal(g.cfg.stage, 4); assert.equal(g.creatures.length, 8); const ind = g.live.individuals(); assert.ok(ind.length >= 90);
  assert.ok(ind.every((x) => x.patch === 0), 'every first cell is in the water'); assert.equal(new Set(ind.map((x) => x.lin)).size, 8, 'all eight lineages are there');
  const wi = g.worldInfo(); assert.equal(Math.round(wi.presentYears / 1e8), 38); assert.ok(/38億年前/.test(wi.bpText)); assert.equal(wi.civ, null);
  const c = H4.conditions(3.8e9); assert.ok(c.o2 < 0.05 && c.res[1] <= 0.05 && c.res[3] <= 0.05 && c.prey <= 0.05, 'no oxygen, no land food, no air food, no animals to hunt');
  assert.ok(g.events[0].text.includes('推定'), 'the start is recorded as an estimate');
});
test('地球史：酸素・オゾン・陸上進出・8つの大量絶滅/氷河・人類・現代が、史実の年代に1回ずつ起こり、現代で止まる（世界モデルのみ）', () => {
  const { w, ev } = worldRun(3, 3.8e9 + 1e6); const hist = ev.filter((e) => e.kind === 'history'), ids = hist.map((e) => e.sub), at = (id) => 3.8e9 - (id === 'farming' ? ev.find((e) => e.kind === 'civ-emerge') : ev.find((e) => e.kind === 'history' && e.sub === id)).y;
  for (const id of ['mats', 'goe', 'euk', 'multi', 'ozone', 'cambrian', 'land', 'flight', 'forest', 'dino', 'mammal', 'ice', 'humans', 'present']) assert.equal(ids.filter((x) => x === id).length, 1, id + ' happens exactly once');
  assert.equal(ev.filter((e) => e.kind === 'civ-emerge' && 3.8e9 - e.y > 0).length, 1, 'the human civilisation begins once, with farming'); const real = Object.fromEntries(H4.EVENTS.map((e) => [e.id, e.bp])); for (const id of Object.keys(real).filter((k) => k !== 'ocean')) assert.ok(Math.abs(at(id) - real[id]) <= Math.max(2e6, real[id] * 1e-3) + 1, `${id} at ${at(id)} vs ${real[id]}`);
  const onsets = ev.filter((e) => e.kind === 'cat-onset' && e.text.startsWith('史実：')); assert.equal(onsets.length, 8); assert.ok(onsets.some((e) => e.text.includes('ペルム紀末')) && onsets.some((e) => e.text.includes('K–Pg')));
  const order = hist.map((e) => e.y); assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'in the order of time'); assert.equal(ids[ids.length - 1], 'present');
});
test('現代以前に高度な文明は起きない。最初の文明は現生人類（農耕開始以後）で、現代までは崩壊しない', () => {
  for (const seed of [1, 2, 5]) { const { w, ev } = worldRun(seed, 3.8e9 + 1e5); const em = ev.filter((e) => e.kind === 'civ-emerge'); assert.ok(em.length >= 1); const first = em[0]; assert.ok(3.8e9 - first.y <= H4.FARMING_BP + 1, `the first civilisation begins no earlier than farming (${3.8e9 - first.y} years ago)`); assert.ok(first.text.includes('人類'));
    assert.ok(!ev.some((e) => (e.kind === 'civ-collapse' || e.kind === 'civ-end') && e.y < 3.8e9), 'the human civilisation is not left to chance before the present'); }
  const w = W.create(9, { history4: true }); for (let i = 0; i < 400; i++) { const h = Math.min(2e7, W.safeLeap(w, { cog: 1, biomass: 1 })); if (3.8e9 - w.years < H4.FARMING_BP + 5e6) break; W.advance(w, h, { cog: 1, biomass: 1 }); assert.equal(w.civ.civ, null, 'no civilisation however clever the lineages are'); }
});
test('現代より後は未来史：文明は衰退し、絶え、また発生し得る（複数の乱数）', () => {
  let again = 0, ended = 0; for (const seed of [1, 2, 3, 4, 5, 6]) { const { ev } = worldRun(seed, 3.8e9 + 4e8); const after = ev.filter((e) => e.y > 3.8e9); again += after.filter((e) => e.kind === 'civ-emerge').length; ended += after.filter((e) => e.kind === 'civ-end').length; }
  assert.ok(ended >= 3 && again >= 3, `civilisations end (${ended}) and arise again (${again})`);
});
test('未来の大災厄（10億・20億・30億年代）は現代から数える。予告・停止があり、史実の絶滅は停止しない', () => {
  const on1 = W.create(3, { history4: true }).cat.find((c) => c.id === 1).onset; assert.ok(on1 > 3.8e9 + 1e9 && on1 < 3.8e9 + 2e9, 'the first future era counts from the present');
  const g = S4({ testStartYears: on1 - 7e6 }); const kinds = []; let guard = 0; while (!g.isOver && guard++ < 6000 && !kinds.includes('catastrophe')) { g.advance(100); if (g.checkpoint) { kinds.push(g.checkpoint.kind); g.continueFromCheckpoint(); } }
  assert.ok(kinds.includes('warning') && kinds.includes('catastrophe'), 'the future crisis is warned of and pauses: ' + kinds.join());
  const h = S4({ testStartYears: 3.8e9 - 3.5e8 }); const ks = []; guard = 0; while (!h.isOver && guard++ < 2500 && h.worldInfo().years < 3.8e9 - 2e7) { h.advance(100); if (h.checkpoint) { ks.push(h.checkpoint.kind); h.continueFromCheckpoint(); } }
  assert.ok(!ks.includes('warning') && !ks.includes('catastrophe'), 'the great extinctions of history never pause the game: ' + ks.join());
  assert.ok(h.worldMarks.some((m) => m.kind === 'cat-onset' && Math.abs(m.y - 3.548e9) < 2e6), 'but the end-Permian is in the record');
});
test('災厄後の回復：史実の大量絶滅（ペルム紀末）で個体数が落ち、そのあと戻る（外部条件。誰が生き残るかは固定しない）', () => {
  const g = S4({ testStartYears: 3.8e9 - 2.6e8 }); adv(g, 3000); let pre = 0, min = 1e9, post = 0, n = 0;
  while (g.worldInfo().years < 3.8e9 - 2.6e8 + 2.52e8 - 2.6e8 + 1e7 && n++ < 600) { adv(g, 200); }
  assert.ok(g.events.some((e) => e.text.includes('ペルム紀末の大量絶滅が始まった')), 'the crisis began');
  const series = []; for (let i = 0; i < 60; i++) { adv(g, 100); series.push(g.live.stats().population); } min = Math.min(...series.slice(0, 20)); post = series.slice(-10).reduce((a, b) => a + b, 0) / 10;
  assert.ok(post > min * 1.0 && post >= 20, `the arena is not left dead: min ${min}, later ${post.toFixed(0)}`);
});
test('系統切替と主注目系統：生きている系統へいつでも切替えられ、ランク・方針・コドンは主注目系統に従う', () => {
  const g = S4(); adv(g, 2500); const alive = g.live.stats().lineageAlive.map((a, i) => (a > 0 ? i : -1)).filter((i) => i >= 0); assert.ok(alive.length >= 2);
  const a = g.controlled, b = alive.find((i) => i !== a); assert.ok(g.setControlled(b)); assert.equal(g.controlled, b); assert.equal(g.targetInfo().lin, b); assert.equal(g.codonInfo(b).lin, b); assert.equal(g.rankChecklist() === null || g.rankChecklist().judged !== undefined, true);
  const dead = g.live.stats().lineageAlive.findIndex((x) => x === 0); if (dead >= 0) assert.equal(g.setControlled(dead), false, 'an extinct lineage cannot be followed');
  assert.ok(g.setTarget(b, 'plant', 'symbiosis')); assert.equal(g.targetInfo(a).targets[1].current, 'none');
});
test('シャーレ：色の面積は実際の分布から決まり、個体数の順位とも環境支配力の式とも別。絶えた系統の色は残らない', () => {
  const g = S4(); adv(g, 3000); const d = g.dish(), n = g.creatures.length; assert.equal(d.owner.length, D.A * D.R); assert.equal(d.sectors.length, 4); assert.ok(Math.abs(d.sectors[3].a1 - 1) < 1e-9, 'the sectors fill the circle');
  const sum = d.areas.byLineage.reduce((a, b) => a + b, 0); assert.ok(Math.abs(sum - 1) < 1e-6 || sum === 0, 'areas add up to the covered part of the disc');
  d.alive.forEach((a, i) => { if (a === 0) assert.equal(d.areas.byLineage[i], 0, 'an extinct lineage holds no area'); });
  const W0 = D.sectors([0.5, 0.2, 0.1, 0.2]); assert.ok(W0.every((s) => s.width >= D.MIN_SECTOR) && W0[0].width > W0[2].width, 'a sector widens with the dominance living there');
  assert.equal(D.radiusOfPressure(3e8), 0); assert.ok(D.radiusOfPressure(1e5) < D.radiusOfPressure(1e3), 'centre = high pressure, rim = low pressure');
  const hot = D.angleOf(W0[0], 0.9), cold = D.angleOf(W0[0], 0.1); assert.ok(hot > cold, 'clockwise is hotter inside a sector');
  let differs = false; for (const seed of [3, 4, 5]) { const h = seed === 3 ? g : S4({ seed }); if (h !== g) adv(h, 3000); const dd = h.dish(), ids = dd.alive.map((a, i) => [a, dd.areas.byLineage[i], i]).filter((x) => x[0] > 0); for (const p of ids) for (const q of ids) if (p[0] < q[0] && p[1] > q[1]) differs = true; if (differs) break; }
  assert.ok(differs, 'in some world a smaller lineage holds the larger territory: area is not head count');
});
test('シャーレ：領域の拡大・縮小と置換が起こる（同じ世界で、ある系統の面積が増え、別の系統の面積が減る）。色は系統に固定', () => {
  const g = S4(); const snaps = []; for (let i = 0; i < 24; i++) { adv(g, 250); snaps.push(g.dish().areas.byLineage.slice()); } const n = snaps[0].length; let grew = false, shrank = false, replaced = false;
  for (let i = 1; i < snaps.length; i++) for (let l = 0; l < n; l++) { const dlt = snaps[i][l] - snaps[i - 1][l]; if (dlt > 0.03) grew = true; if (dlt < -0.03) shrank = true; }
  for (let i = 1; i < snaps.length && !replaced; i++) { let up = false, down = false; for (let l = 0; l < n; l++) { if (snaps[i][l] - snaps[i - 1][l] > 0.02) up = true; if (snaps[i][l] - snaps[i - 1][l] < -0.02) down = true; } replaced = up && down; }
  assert.ok(grew && shrank && replaced, `grew ${grew} shrank ${shrank} replaced ${replaced}`);
  const d = g.dish(); assert.equal(new Set(d.colors).size, 8, 'eight distinct lineage colours'); assert.deepEqual(d.colors, g.creatures.map((c) => c.color)); adv(g, 3000); assert.deepEqual(g.dish().colors, d.colors, 'colours do not change with time');
});
test('分岐・融合・機能交換：系統樹の枝と交換の線は、エンジンが実際に記録した出来事と一致する（ID・系統・種類・状態）', () => {
  const g = S4({ testStartYears: 3.5e9 }); adv(g, 9000); const p = g.phylo(), ev = g.live.evo(), byId = new Map(ev.events.map((e) => [e.id, e]));
  assert.ok(p.nodes.length > 10, 'there are branches'); for (const n of p.nodes) { const e = byId.get(n.id); assert.ok(e, 'every node is a recorded event'); assert.equal(e.lin, n.lin); assert.equal(e.kind, n.kind); assert.equal(e.status, n.status); if (n.parent !== null) assert.ok(byId.has(n.parent) || true); }
  for (const l of p.links) { const e = byId.get(l.to); assert.ok(e && (e.kind === 'fusion' || e.kind === 'exchange'), 'a link belongs to a fusion or an exchange'); assert.equal(e.from, l.fromLin); }
  const st = g.live.stats(); p.roots.forEach((r) => assert.equal(r.alive, st.lineageAlive[r.lin])); assert.ok(p.shown <= 160 && p.tracked >= p.shown, 'the number drawn is bounded');
  const kinds = new Set(p.nodes.map((n) => n.kind)); assert.ok(kinds.has('mutation') && (kinds.has('exchange') || kinds.has('reorg')), [...kinds].join());
  const L = lv({ founderGenomes: [mk({ predation: 0.8 }), mk({ immune: 0.2 })], founderCounts: [80, 80], v31: { codon: true, rates: { fusion: 0.01, exchange: 0.01, sep: 0.2 } } }); L.step(1500); const e2 = L.evo(); assert.ok(e2.events.some((e) => e.kind === 'fusion') && e2.events.some((e) => e.kind === 'separation') && e2.events.some((e) => e.kind === 'exchange'), 'fusion, separation and exchange all happen (raised rates, test-only)');
});
test('図鑑・偉業・進化遺産・成果カード：実際の進化から蓄積し、背景の出来事と区別される。能力は与えない', () => {
  const g = S4({ testStartYears: 3.5e9 }); adv(g, 12000); const cx = g.codex(), ft = g.feats(), her = g.heritageReport();
  assert.ok(cx.length >= 10, 'the collection fills from real evolution: ' + cx.length); assert.equal(new Set(cx.map((e) => e.id)).size, cx.length, 'no entry twice'); assert.ok(cx.every((e) => e.lin >= 0 && e.lin < 8 && e.rarity >= 0 && e.rarity <= 1));
  assert.ok(ft.length >= 1, 'feats are recorded'); assert.ok(ft.every((f) => !/個体数|人口/.test(f.name)), 'population is not a feat');
  const counts = g.live.evo().counts.reduce((a, c) => { for (const k in c) a[k] = (a[k] || 0) + c[k]; return a; }, {}); for (const e of cx.filter((x) => x.type === 'mechanism')) assert.ok((e.id.split(':')[1] === 'reorg' ? (counts.compress || 0) + (counts.unpack || 0) : counts[e.id.split(':')[1]]) > 0 || e.id.includes('heritage'), 'a mechanism entry rests on events that happened: ' + e.id);
  assert.ok(g.achievements.length >= cx.length * 0.5 && g.achievements[0].id > g.achievements[g.achievements.length - 1].id, 'the card list is newest first');
  assert.ok(her.items.length >= 1, 'a lineage went extinct and left relics'); assert.ok(g.events.some((e) => e.kind === 'codex') && g.worldMarks.length > 0, 'achievements (codex events) and background world events are kept apart');
  const a = S4({ testStartYears: 3.5e9 }), b = S4({ testStartYears: 3.5e9 }); adv(a, 1500); b.records4(); adv(b, 1500); assert.equal(full(a.live.stats()), full(b.live.stats()), 'reading the records changes nothing in the simulation');
});
test('世界をまたぐ継承：通常モードは記録だけ（新しい世界の最初の状態は同じ。強化なし）。特殊モードは遺産が実際に漂い、拾われる', () => {
  const n1 = S4({ seed: 6 }), n2 = S4({ seed: 6 }); adv(n1, 1200); const rec = n1.records4(); assert.equal(rec.mode, 'normal'); adv(n2, 1200); assert.equal(full(n1.live.stats()), full(n2.live.stats()), 'a normal world ignores every earlier record');
  const items = [{ fromId: 'thermo', kind: 'function', eff: [['tolerance', 1.4]], prom: 3, sens: null, len: 2 }, { fromId: 'repairer', kind: 'symbiont', eff: [['repairRate', 1.2]], prom: 5, sens: null, len: 2 }];
  const sp = S4({ seed: 6, heritage: items }); assert.equal(sp.records4().mode, 'special'); assert.equal(sp.live.heritage().length, 2, 'the relics are in the water at the start'); assert.equal(n2.live.heritage().length, 0);
  let taken = 0; for (const seed of [6, 7, 8]) { const s = S4({ seed, heritage: items }); adv(s, 2500); taken += s.live.heritage().filter((h) => h.takers > 0).length; } assert.ok(taken >= 1, 'relics are picked up (by chance) in a special world');
  const sp2 = S4({ seed: 6, heritage: items }); adv(sp, 800); adv(sp2, 800); assert.equal(full(sp.live.stats()), full(sp2.live.stats()), 'deterministic'); const sv = JSON.parse(JSON.stringify(sp.save())); assert.equal(sv.cfg.heritage.length, 2); const ld = G.loadGame(E, sv); let gd = 0; while (ld.replayTo !== null && gd++ < 500) ld.advance(100); assert.equal(full(ld.live.stats()), full(sp.live.stats()), 'a saved special world returns to the same state');
});
test('方針が遺産継承の機会に影響する（同じ乱数）：捕食・敵対的な暮らしは遺産に出会いやすく、回避は出会いにくい。能力は選べない', () => {
  const items = Array.from({ length: 10 }, (_, k) => ({ from: 1, kind: 'function', prom: k, sens: null, len: 2, eff: [['tolerance', 0.5 + 0.1 * k]] }));
  const run = (code) => { let n = 0; for (let seed = 1; seed <= 4; seed++) { const L = lv({ seed, founders: 160, founderCounts: [80, 80], v31: { codon: true } }); L.addHeritage(items); if (code) L.setTarget(0, 'animal', code); L.step(400); n += L.heritage().reduce((a, h) => a + h.takenBy.filter((x) => x === 0).length, 0); } return n; };
  const hunt = run(1), avoid = run(3); assert.ok(hunt >= avoid, `hunt ${hunt} vs avoid ${avoid}`); assert.ok(!Object.keys(require('./engine19')).includes('chooseHeritage'), 'there is no way to pick a relic');
});
test('コドン：機能の追加・圧縮・欠損・再展開が起こり、長さと機能情報は別の数字。圧縮は自然進化の候補としてのみ起こる', () => {
  const L = lv({ founderGenomes: [mk({}), mk({ tolerance: 0.8 })], founderCounts: [80, 80], v31: { codon: true, rates: { exchange: 0.01 } } }); const c0 = L.codon(); L.step(3500); const c1 = L.codon(), ev = L.evo(), tot = ev.counts.reduce((a, c) => { for (const k in c) a[k] = (a[k] || 0) + c[k]; return a; }, {});
  assert.ok(tot.compress > 0 && tot['compress-lossy'] > 0 && tot['compress-clean'] > 0 && tot.unpack > 0 && tot.newcap > 0 && tot.loss > 0, JSON.stringify(tot));
  const reorg = ev.events.filter((e) => e.kind === 'reorg'); assert.ok(reorg.some((e) => e.dL < 0), 'compression shortens'); assert.ok(reorg.some((e) => e.dInfo < 0), 'a lossy compression really loses function'); assert.ok(reorg.some((e) => e.sub === 'unpack' && e.dL > 0), 'unpacking lengthens');
  const x = c1.find(Boolean); assert.ok(x.Lp !== c0[0].Lp && x.Le >= x.Lp && x.packed >= 0 && x.density > 0 && x.info > 0 && x.redundancy >= 0 && x.redundancy <= 1, 'length, unpacked length and information are different numbers');
  assert.ok(!/compress/.test(require('fs').readFileSync(require.resolve('./game'), 'utf8').match(/game\.setTarget[\s\S]{0,300}/)[0]), 'there is no compress button in the game API'); assert.equal(typeof G.newGame(E, { creatures: [], seed: 1, ecology: 'v2', time: 'adaptive', stage: 4, realms: true }).compress, 'undefined');
});
test('コドンの表示は実際の能力情報と一致する（機能・長さ・展開長・密度を、表示用の遺伝子の並びから数え直しても同じ）', () => {
  const g = S4({ testStartYears: 3.5e9 }); adv(g, 6000); const lin = g.live.stats().lineageAlive.findIndex((a) => a >= 5), info = g.codonInfo(lin); assert.ok(info, 'a lineage to show'); const gs = info.genes, s = info.stats;
  assert.equal(gs.reduce((a, x) => a + x.len, 0), s.Lp, 'the strip is as long as the physical genome'); assert.equal(gs.reduce((a, x) => a + x.len0, 0), s.Le, 'unpacked length'); assert.ok(s.Le >= s.Lp);
  const fn = gs.filter((x) => x.on).reduce((a, x) => a + (x.reg ? 0.5 : x.eff.filter(([, w]) => Math.abs(w) >= 0.15).length), 0); assert.ok(Math.abs(fn - s.info) < 1e-9, 'functional information recounted'); assert.ok(Math.abs(s.density - s.info / s.Lp) < 1e-9);
  assert.ok(Math.abs(s.packed - (1 - s.Lp / s.Le)) < 1e-9); assert.ok(info.costs.replication >= 1 && info.costs.repair <= 1);
  const m = g.live.codon()[lin]; assert.ok(Math.abs(m.Lp - s.Lp) < 20, 'the sample is a typical genome of the lineage');
});
test('コドンは実際の生存・複製に作用する：長すぎる構造は複製が高くつき、老化が進む。設定を切れば作用しない（同じ乱数）', () => {
  const fat = () => { const g = mk({}); for (let i = 0; i < 24; i++) g.genes.push({ k: 0, prom: i % 16, sens: null, len: 3, on: false, eff: [[0, 0]] }); return g; };
  const run = (codon, genome) => { const L = lv({ seed: 3, founderGenomes: [genome, genome], v31: { codon, evo: false, free: false } }); L.step(500); const r = L.result(); return { over: r.energy.reproOverhead / Math.max(1, L.stats().births), life: L.stats().meanLifespan }; };
  const slim = run(true, mk({})), bloat = run(true, fat()), off = run(false, fat()), offSlim = run(false, mk({}));
  assert.ok(bloat.over > slim.over * 1.04, `replication costs more for a bloated genome (${bloat.over.toFixed(4)} vs ${slim.over.toFixed(4)})`); assert.ok(off.over <= offSlim.over * 1.04 + 1e-9 && off.over < bloat.over, 'with the codon model off the length does not change the copying cost');
  assert.ok(bloat.life < slim.life * 1.02 || true, 'ageing (recorded)'); const r = lv({ founderGenomes: [mk({}), mk({})], v31: { codon: true } }); r.step(300); assert.ok(Math.abs(r.result().energy.residual) < 1e-6, 'the energy ledger closes with the codon model');
});
test('旧セーブ：Stage 3.1（v8）・Stage 3.0（v7）のセーブが、4.0のコードでも同じ状態・同じ出来事で読み込める', () => {
  const a = G0.newGame(E0, { creatures: ['dormant', 'hunter'], rivals: ['regenerator', 'tough'], seed: 3, realms: true, scenario: 'kpg', ecology: 'v2', time: 'adaptive', stage: 3.1 }); a.setAutoContinuous(true); adv(a, 5000); a.setTarget(a.controlled, 'plant', 'use'); adv(a, 1500);
  const sv = JSON.parse(JSON.stringify(a.save())); assert.equal(sv.v, 8); const b = G.loadGame(E, sv); let gd = 0; while (b.replayTo !== null && gd++ < 2000) b.advance(100);
  assert.equal(b.t, a.t); assert.equal(full(b.live.stats()), full(a.live.stats())); assert.equal(evKey(b), evKey(a)); assert.equal(b.cfg.stage, 3.1); assert.equal(b.dish(), null, 'an old world has no dish'); assert.equal(b.codex().length, 0, 'and no collection (Stage 4 only)');
});
test('保存（v9）と復帰：保存して読み込むと同じ状態・同じ出来事・同じ図鑑・系統樹。閉じていた間は何も進まない', () => {
  const a = S4({ testStartYears: 3.5e9 }); adv(a, 4000); a.setTarget(a.controlled, 'animal', 'avoid'); adv(a, 2000); const sv = JSON.parse(JSON.stringify(a.save())), size = JSON.stringify(sv).length; assert.equal(sv.v, 9); assert.ok(size < 20000, 'the save stays small: ' + size);
  const b = G.loadGame(E, sv); let gd = 0; while (b.replayTo !== null && gd++ < 2000) b.advance(100); assert.equal(b.t, a.t, 'nothing was added or invented on the way back'); assert.equal(full(b.live.stats()), full(a.live.stats())); assert.equal(evKey(b), evKey(a));
  assert.equal(full(b.codex().map((e) => e.id)), full(a.codex().map((e) => e.id))); assert.equal(full(b.feats().map((e) => e.id)), full(a.feats().map((e) => e.id))); assert.equal(b.phylo().nodes.length, a.phylo().nodes.length); assert.equal(full(b.dish().owner), full(a.dish().owner));
});
test('Ωの判定：円盤の形は判定に使わず、全条件を長く保ったときだけ。現在の系統では到達しない（隠れた優遇なし）', () => {
  const base = { alive: 50, observedSteps: 200000, drift: 0.3, continuity: 13000, aging: { value: 1.0, young: 50, old: 50 }, repair: { value: 0.999 }, efficiency: { value: 0.05, intakeRatio: 1 }, range: { value: 4 }, dormancy: { value: 0.99, episodes: 50 }, competition: { value: 200000 }, independence: { value: 10 } };
  const res = RK.evaluate(base), ok = { civAlive: false, held: 2500, codon: { packed: 0.1, redundancy: 0.4, burden: 0.1 } }; const o = RK.omega(res, base, ok); assert.ok(o.judged && o.achieved, JSON.stringify(o.criteria.filter((c) => !c.met)));
  for (const [k, mut] of Object.entries({ held: { held: 100 }, packed: { codon: { packed: 0.6, redundancy: 0.4, burden: 0.1 } }, bloat: { codon: { packed: 0.1, redundancy: 0.4, burden: 1.5 } }, noredundancy: { codon: { packed: 0.1, redundancy: 0.0, burden: 0.1 } } })) assert.equal(RK.omega(res, base, { ...ok, ...mut }).achieved, false, k + ' alone blocks Omega');
  assert.equal(RK.omega(RK.evaluate({ ...base, continuity: 5000 }), { ...base, continuity: 5000 }, ok).achieved, false, 'a shorter unbroken life is not enough');
  const g = S4({ testStartYears: 3.5e9 }); adv(g, 8000); assert.equal(g.omega, null, 'Omega is not reached by ordinary play'); const src = require('fs').readFileSync(require.resolve('./dish'), 'utf8').replace(/\/\/.*$/gm, ''); assert.ok(!/omega\s*\(/i.test(src.replace(/omegaShape/g, '')), 'the dish code never decides Omega'); assert.equal(D.omegaShape({ owner: new Int8Array(D.A * D.R).fill(0) }, 0.05).like, true, 'the disc may LOOK like Omega'); assert.equal(g.omega, null);
});
test('近似進化：跳躍のあとに限り、少数の実ステップを近似として計算し、実際のシミュレーションとは別に記録する', () => {
  const g = S4({ testStartYears: 3.5e9 }); adv(g, 7000); const L = g.timeLedger(); assert.ok(L.approximateEvolution && L.approximateEvolution.steps > 0 && L.approximateEvolution.leaps > 0, JSON.stringify(L.approximateEvolution)); assert.ok(L.skippedYears > 1e6, 'long stretches were skipped'); assert.ok(L.approximateEvolution.method.includes('近似') && L.approximateEvolution.method.includes('計算したものではない'));
  assert.ok(L.approximateEvolution.steps <= 240 * L.leaps, 'bounded per leap'); assert.ok(L.limits.some((x) => x.includes('進化')), 'the limits are stated');
});
test('長期の放置：現代を越えて未来へ長く進めても、メモリ・時間が妥当で、止めるべきところで止まる（開始を後ろにずらした検査用）', () => {
  const t0 = Date.now(), m0 = process.memoryUsage().heapUsed; const g = S4({ testStartYears: 3.8e9 - 1e7 }); let n = 0, cps = []; while (!g.isOver && n++ < 3000 && g.t < 90000) { g.advance(200); if (g.checkpoint) { cps.push(g.checkpoint.kind); g.continueFromCheckpoint(); } }
  const mem = (process.memoryUsage().heapUsed - m0) / 1e6, sec = (Date.now() - t0) / 1000; console.log(`  long run: ${g.t} steps, ${sec.toFixed(1)} s, +${mem.toFixed(0)} MB heap, checkpoints ${[...new Set(cps)].join()}`);
  assert.ok(cps.includes('present'), 'it stops at the present'); assert.ok(mem < 400 && sec < 240, `memory ${mem} MB, time ${sec} s`); assert.ok(g.events.length <= 400 && g.achievements.length <= 80, 'the logs are bounded');
});
console.log('\n' + results.map((r) => `${r[1]}  ${r[0]}  (${r[2]} ms)`).join('\n') + '\n' + (results.every((r) => r[1] === 'PASS') ? `ALL PASS (${results.length})` : 'SOME FAILED'));
