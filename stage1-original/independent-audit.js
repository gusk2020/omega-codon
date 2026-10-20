'use strict';
const assert = require('node:assert/strict');
const {simulate,phenotype,ENVIRONMENTS} = require('./engine');
const n=30,results=[];
for(const changing of [false,true]) for(const interactions of [false,true]){
 const rows=[];
 for(let seed=1;seed<=n;seed++){
  const r=simulate({seed,population:100,generations:1000,changing,interactions});
  assert.equal(r.final.length,100);
  assert.ok(r.history.every(h=>Number.isFinite(h.meanFitness)&&Number.isFinite(h.bestFitness)&&h.meanGenome>=4));
  rows.push({initial:r.history[0].meanFitness,final:r.summary.meanFitness,delta:r.summary.meanFitness-r.history[0].meanFitness,diversity:r.summary.diversity,genome:r.summary.meanGenome});
 }
 const avg=k=>rows.reduce((s,r)=>s+r[k],0)/n;
 results.push({changing,interactions,seeds:n,initial:avg('initial'),final:avg('final'),delta:avg('delta'),positiveRuns:rows.filter(r=>r.delta>0).length,diversity:avg('diversity'),genome:avg('genome')});
}
console.log(JSON.stringify(results,null,2));
