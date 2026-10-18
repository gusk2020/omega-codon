'use strict';
// Re-reads Stage 1.4's committed per-run results and adds the extinction-inclusive views that its lifespan
// comparisons lacked (they dropped extinct runs). Read-only on stage1.4/results14.json.
const fs = require('node:fs');
const S = require('./stats15');
const j = JSON.parse(fs.readFileSync('stage1.4/results14.json', 'utf8')), R = j.runs;
const col = (c, f) => R[c].map((r) => (r ? f(r) : null));
const ext = (a, b) => S.mcnemarExact(col(a, (r) => r.extinct), col(b, (r) => r.extinct));
const view = (a, b) => ({ extinct: { A: R[a].filter((r) => r.extinct).length, B: R[b].filter((r) => r.extinct).length, mcnemar: ext(a, b) },
  persistenceRMST: S.paired(col(a, (r) => r.persistence), col(b, (r) => r.persistence), { seed: 1 }),
  lifespanAllDeaths: S.paired(col(a, (r) => r.lifeMean), col(b, (r) => r.lifeMean), { seed: 2 }),
  lifespanSurvivorsOnly_gardenOrMain: S.paired(col(a, (r) => (r.extinct ? null : r.lifeMean)), col(b, (r) => (r.extinct ? null : r.lifeMean)), { seed: 3 }),
  popMedian: S.paired(col(a, (r) => r.popMedian), col(b, (r) => r.popMedian), { seed: 4 }) });
const out = {
  B_rare_vs_frequent_selection: view('B_rare_sel', 'B_frequent_sel'),
  B_rare_selection_vs_drift: view('B_rare_sel', 'B_rare_drift'),
  B_gardenLifespan_stage14_as_reported: S.paired(col('B_rare_sel', (r) => r.garden?.lifeMean), col('B_frequent_sel', (r) => r.garden?.lifeMean), { seed: 5 }),
  C_pulsed_selection_vs_drift: view('C_pulsed_sel', 'C_pulsed_drift'),
  C_pulsed_vs_stable_selection: view('C_pulsed_sel', 'C_stableRich_sel'),
  C_lowStable_selection_vs_drift: view('C_lowStable_sel', 'C_lowStable_drift'),
  note: 'persistenceRMST = restricted mean lineage persistence up to 2000 steps (extinct runs contribute their extinction step); lifespanAllDeaths = mean individual lifespan over every recorded death, extinct runs included.' };
fs.writeFileSync('reanalysis14.json', JSON.stringify(out, null, 1));
const f = (o) => (o.meanDiff != null ? `${o.meanDiff.toFixed(2)} [${o.ci95.map((x) => x.toFixed(2)).join(',')}] n=${o.n} drop=${o.droppedPairs ?? 0} p=${o.p.toFixed(3)}` : 'n/a');
for (const [k, v] of Object.entries(out)) { if (k === 'note') continue; if (v.extinct) console.log(k, '\n  extinct', JSON.stringify(v.extinct.mcnemar), '\n  RMST', f(v.persistenceRMST), '\n  life(all deaths)', f(v.lifespanAllDeaths), '\n  life(survivors only)', f(v.lifespanSurvivorsOnly_gardenOrMain), '\n  pop', f(v.popMedian)); else console.log(k, f(v)); }
