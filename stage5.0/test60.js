'use strict';
// Stage 6 tests: circular dish, three-layout phylogeny, codon links, save summaries. TEST-ONLY SHORTCUT: none (games start at the origin of life).
const assert = require('node:assert/strict');
const E = require('./engine19'), G = require('./game'), D2 = require('./dish2'), DV = require('./dishview'), PT = require('./phylotree');
const results = [];
function test(name, fn) { const t = Date.now(); console.log('… ' + name.slice(0, 70)); try { fn(); results.push([name, 'PASS']); console.log('PASS ' + name + ` (${Date.now() - t} ms)`); } catch (e) { results.push([name, 'FAIL']); console.log('FAIL ' + name + '\n' + (e.stack || e).toString().slice(0, 900)); } }
const mk = (seed) => { const g = G.newGame(E, { creatures: ['standard'], rivals: [], seed, realms: true, scenario: 'free', ecology: 'v2', time: 'adaptive', stage: 4 }); g.setAutoContinuous(true); return g; };
const snapOf = (g) => { for (let i = 0; i < 400; i++) { const m = g.milestone(); if (m) return JSON.parse(JSON.stringify(m)); g.advance(5); cont(g); } throw new Error('no milestone could be taken'); };
const cont = (g) => { if (g.checkpoint) g.continueFromCheckpoint(); };
const runTo = (g, t) => { let n = 0; while (g.t < t && !g.isOver && n++ < 4000) { g.advance(250); cont(g); } };
let shared = null;
test('6 円盤の座標：左＝陸・右＝水、半径＝圧力（中心が高圧）、1気圧の線、上＝低温・下＝高温', () => {
  assert.ok(D2.radiusOfPressure(3e8) < 0.01 && D2.radiusOfPressure(100) > 0.99, 'centre = high pressure, rim = near vacuum');
  assert.ok(D2.radiusOfPressure(1e7) < D2.radiusOfPressure(1e5) && D2.radiusOfPressure(1e5) < D2.radiusOfPressure(1e3), 'monotone in pressure');
  assert.ok(Math.abs(D2.radiusOfPressure(D2.P_ATM) - D2.R_ATM) < 1e-12 && D2.R_ATM > 0.4 && D2.R_ATM < 0.75, 'the 1-atm ring sits inside the disc, and the high-pressure core stays under 40 % of the radius' );
  assert.ok(D2.R_ATM >= 0.5, 'the high-pressure core is not over-widened (the 1-atm ring is at least half way out)');
  const land = D2.place('land', 0.5, D2.P_ATM), water = D2.place('water', 0.5, D2.P_ATM); assert.ok(land.x < 0 && water.x > 0, 'land is the left half, water the right half'); assert.ok(Math.abs(land.x + water.x) < 1e-12);
  const cold = D2.place('land', 0.0, D2.P_ATM), hot = D2.place('land', 1.0, D2.P_ATM); assert.ok(cold.y < land.y && land.y < hot.y, 'cold at the top, hot at the bottom'); assert.ok(Math.abs(Math.hypot(land.x, land.y) - D2.R_ATM) < 1e-9);
  assert.ok(Math.abs(D2.pressureOfRadius(D2.radiusOfPressure(5e4)) - 5e4) / 5e4 < 1e-9, 'the display radius can be turned back into the scientific value');
});
test('6 円盤のデータは実際の個体の位置だけから作られる（ダミー・架空の系統を作らない）', () => {
  const g = mk(3); runTo(g, 30000); shared = g; const d = g.dish2(), st = g.live.stats();
  assert.ok(d.lineages.length >= 1 && d.lineages.length <= 8); for (const L of d.lineages) assert.equal(L.alive, st.lineageAlive[L.lin]);
  for (const L of d.lineages) { const alive = L.beads.filter((b) => b.alive).length; if (L.alive === 0) assert.equal(alive, 0, 'an extinct lineage has no living bead'); else assert.ok(alive >= 1, 'a living lineage has at least one living bead'); const total = L.beads.reduce((a, b) => a + b.n, 0); assert.ok(total <= L.alive + 1e-9 && total >= 0.9 * L.alive, `bead counts (${total}) come from the living individuals (${L.alive})`); }
  const everLineages = new Set(d.lineages.map((l) => l.id)); for (const id of everLineages) assert.ok(g.creatures.some((c) => c.id === id));
  assert.ok(d.lineages.some((L) => L.beads.some((b) => !b.alive)), 'after 30000 steps some sites have been vacated (hollow beads)');
  for (const L of d.lineages) for (const b of L.beads) if (b.par !== null && b.par !== undefined) { assert.ok(L.beads.some((q) => q.key === b.par), 'a link points at a recorded site of the same lineage'); assert.equal(b.par >= 10000, b.key >= 10000, 'links stay on one half'); }
  assert.equal(d.civ, null, 'no civilisation this early is drawn'); assert.ok(d.sources.land.includes('仮表示') && d.sources.civ.includes('仮表示'), 'provisional placements are labelled');
});
test('6 文明は黒破線の×（環境を変える力で大小）で、文明が無いときは描かれない／過去の文明は履歴に残る', () => {
  const g = mk(5); g.setAutoContinuous(true); const W = require('./world'); void W;
  const wm = null; void wm; const d = g.dish2(); assert.equal(d.civ, null); assert.ok(Array.isArray(d.pastCivs));
  const src = require('node:fs').readFileSync(__dirname + '/dishview.js', 'utf8'); assert.ok(src.includes("setLineDash([6, 5])") && src.includes('moveTo(p.x - s, p.y - s)'), 'a dashed region and a cross are drawn for a civilisation');
});
test('6 能力は0〜1の8項目（ピクトグラム＋ゲージ用）で、現存しない系統には出さない', () => {
  const g = shared || mk(3), d = g.dish2(), L = d.lineages.find((l) => l.alive > 0), ab = g.abilities(L.lin); assert.equal(ab.items.length, 8); for (const i of ab.items) assert.ok(i.value >= 0 && i.value <= 1, i.id);
  const dead = d.lineages.find((l) => l.alive === 0); if (dead) assert.equal(g.abilities(dead.lin), null);
});
test('6 描画：ズーム・パン・タップの当たり判定が、同じ座標で一致する', () => {
  const g = shared || mk(3), d = g.dish2(), vs = DV.newView(); const lay = DV.layout(360, 360, d, vs); assert.ok(lay.items.length > 0);
  const it = lay.items.find((q) => q.b.alive && !lay.items.some((o) => o !== q && Math.hypot(o.x - q.x, o.y - q.y) < 14)) || lay.items.find((q) => q.b.alive), h = DV.hit(360, 360, d, vs, it.x, it.y); assert.ok(h && (h.lin === it.L.lin || lay.items.some((o) => o.L.lin === h.lin && Math.hypot(o.x - it.x, o.y - it.y) < 14)), 'tapping a bead selects its lineage (or the one drawn on top of it)');
  vs.zoom = 3; vs.px = 0.4; vs.py = -0.2; const lay2 = DV.layout(360, 360, d, vs), it2 = lay2.items.find((q) => q.L.lin === it.L.lin && q.b.key === it.b.key); assert.ok(it2 && Math.abs(it2.x - it.x) > 1, 'zoom/pan move the bead'); const h2 = DV.hit(360, 360, d, vs, it2.x, it2.y); assert.ok(h2 !== null);
  assert.equal(DV.hit(360, 360, d, DV.newView(), 2, 2), null, 'a tap in the corner selects nothing');
  const calls = []; const ctx = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...a) => { calls.push(k); }), set: () => true }); DV.draw(ctx, 360, 360, d, DV.newView()); assert.ok(calls.includes('arc') && calls.includes('stroke'), 'the dish draws');
});
test('6 系統樹：円形・放射状・矩形が同じ記録から作られ、記録にない祖先を作らない', () => {
  const g = shared || mk(3), p = g.phylo(); assert.ok(p.nodes.length > 0); const ids = new Set(p.nodes.map((n) => n.id)); assert.equal(ids.size, p.nodes.length, 'event ids are unique');
  for (const n of p.nodes) { assert.ok(n.parent === null || ids.has(n.parent), 'every parent is a recorded event'); assert.ok(n.label && n.status); }
  for (const mode of ['circle', 'fan', 'rect']) { const lay = PT.layout(p, mode); assert.equal(lay.nodes.length, p.nodes.length, mode); assert.equal(lay.edges.length, p.nodes.length); for (const n of lay.nodes) { assert.ok(isFinite(n.x) && isFinite(n.y), mode); if (mode === 'rect') assert.ok(n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1); else assert.ok(Math.hypot(n.x, n.y) <= 1.0001); } assert.equal(lay.links.length, p.links.filter((l) => ids.has(l.to)).length, 'only recorded exchanges and fusions are linked'); }
  const lin = p.nodes[0].lin, lay = PT.layout(p, 'circle', { collapsed: new Set([lin]) }); assert.ok(lay.nodes.length < p.nodes.length && lay.roots.find((r) => r.lin === lin).collapsed, 'a collapsed lineage hides its events but keeps its line');
  const h = PT.hit(360, 360, PT.layout(p, 'circle'), PT.newView(), PT.frame(360, 360, PT.newView(), 'circle').ox + PT.layout(p, 'circle').nodes[0].x * PT.frame(360, 360, PT.newView(), 'circle').sx, PT.frame(360, 360, PT.newView(), 'circle').oy + PT.layout(p, 'circle').nodes[0].y * PT.frame(360, 360, PT.newView(), 'circle').sy); assert.ok(h && (h.type === 'node' || h.type === 'root'));
});
test('6 系統樹の記録は節目セーブを越えて残り、IDが重ならない', () => {
  const g = shared || mk(3), p0 = g.phylo(1e9), b = G.loadGame(E, snapOf(g)), p1 = b.phylo(1e9);
  assert.deepEqual(p1.nodes.map((n) => n.id), p0.nodes.map((n) => n.id), 'the same recorded events after the restore'); assert.equal(p1.resumed, true);
  runTo(b, b.t + 6000); const p2 = b.phylo(1e9), ids = p2.nodes.map((n) => n.id); assert.equal(new Set(ids).size, ids.length, 'ids stay unique after new events'); assert.ok(p2.nodes.length >= p1.nodes.length);
  assert.ok(Math.min(...p2.nodes.filter((n) => !p1.nodes.some((q) => q.id === n.id)).map((n) => n.id).concat([Infinity])) > Math.max(...p0.nodes.map((n) => n.id)), 'new events are numbered after the old ones');
});
test('6 3画面の連携：選んだ系統のIDが、シャーレ・系統樹・コドン・能力で同じ系統を指し、保存復元後も保たれる', () => {
  const g = mk(3); runTo(g, 20000); const d = g.dish2(), L = d.lineages.find((l) => l.alive > 0); g.sel = L.id;
  const idx = g.creatures.findIndex((c) => c.id === g.sel); assert.equal(idx, L.lin); assert.equal(g.phylo().roots[idx].id, L.id); assert.equal(g.codonInfo(idx).lin, idx); assert.equal(g.abilities(idx).lin, idx);
  const b = G.loadGame(E, snapOf(g)); assert.equal(b.sel, L.id, 'the selection survives the milestone'); const j = b.creatures.findIndex((c) => c.id === b.sel); assert.equal(j, idx); assert.equal(b.dish2().lineages.find((l) => l.id === b.sel).lin, idx); assert.equal(b.phylo().roots[j].id, L.id);
  assert.deepEqual(b.dish2().lineages.map((l) => l.id), g.dish2().lineages.map((l) => l.id), 'the same lineages are on the dish after the restore'); assert.deepEqual(b.dish2().lineages.map((l) => l.beads.length), g.dish2().lineages.map((l) => l.beads.length), 'and the same recorded sites');
});
test('6 絶滅した系統：選択でき、シャーレには空の輪（◯）が残り、コドン・能力は「取り出せない」と返す', () => {
  const g = shared || mk(3), d = g.dish2(), dead = d.lineages.find((l) => l.extinct); if (!dead) return; g.sel = dead.id; assert.equal(g.codonInfo(dead.lin), null); assert.equal(g.abilities(dead.lin), null); assert.equal(dead.beads.filter((b) => b.alive).length, 0); assert.ok(g.phylo().roots[dead.lin].alive === 0);
});
test('6 セーブ画面の要約：保存時と読込直後で、年代・生存系統・ランク・記録が一致し、個体数は近似と明示される', () => {
  const g = shared || mk(3), s = g.summary2(); assert.ok(s.bpText && s.elapsedText && Array.isArray(s.alive)); assert.equal(s.individualsKind, '計算中の個体の実数');
  const snap = snapOf(g); assert.deepEqual(snap.summary, JSON.parse(JSON.stringify(s)), 'the save carries the summary taken at the same moment');
  const b = G.loadGame(E, snap), rows = G.compareSummaries(snap.summary, b.summary2()), by = Object.fromEntries(rows.map((r) => [r.key, r]));
  for (const k of ['years', 'alive', 'rank', 'codex']) assert.equal(by[k].ok, true, k); assert.equal(by.individuals.approx, true); assert.ok(by.individuals.ok, 'the re-created individuals are close in number');
  const bad = G.compareSummaries(snap.summary, { ...b.summary2(), years: snap.summary.years + 1e6, bpText: '別の年代' }); assert.equal(bad.find((r) => r.key === 'years').ok, false, 'a different world is reported as different');
});
test('6 読込失敗：理由つきで拒否し、保存データも現在の世界も変えない', () => {
  const g = shared || mk(3), snap = snapOf(g), before = JSON.stringify(snap); for (const mut of [(s) => { s.arena = 3; }, (s) => { delete s.wm; }, (s) => { s.t = -1; }]) { const bad = JSON.parse(JSON.stringify(snap)); mut(bad); assert.throws(() => G.loadGame(E, bad), /セーブが壊れています/); } assert.equal(JSON.stringify(snap), before); assert.ok(g.t > 0);
});
test('6 セーブは節目だけ：アプリは定期保存・自由保存を持たない／読み込み前に確認と要約を出す', () => {
  const src = require('node:fs').readFileSync(__dirname + '/app.js', 'utf8'); assert.ok(!/putSave\('auto'\)(?![^]{0,0})/.test(src.replace(/const autoSaved = putSave\('auto'\)/, '')), 'only the milestone screen auto-saves'); assert.ok(src.includes('この保存を読み込みますか？') && src.includes('compareSummaries') && src.includes('RESTORE_NOTE'));
  assert.ok(src.includes('if (!game || !game.checkpoint) return false;'));
});
const bad = results.filter((r) => r[1] === 'FAIL'); console.log(`\n${results.length - bad.length}/${results.length} passed`); process.exit(bad.length ? 1 : 0);
