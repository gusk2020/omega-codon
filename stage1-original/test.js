const assert=require('node:assert/strict');const {simulate,phenotype,ENVIRONMENTS}=require('./engine');
const opt={seed:42,population:100,generations:1000};const a=simulate(opt),b=simulate(opt);assert.deepEqual(a.history,b.history,'same seed must reproduce');
const c=simulate({...opt,seed:43});assert.notDeepEqual(a.history,c.history,'seeds should differ');
const d=simulate({...opt,changing:false});assert.notDeepEqual(a.history,d.history,'environment switch should matter');
const e=simulate({...opt,interactions:false});assert.notDeepEqual(a.history,e.history,'gene interactions should matter');
const p=phenotype([0,1,2,3,4,5,6,7],ENVIRONMENTS[0]);assert.ok(p.fitness>=0&&p.fitness<=1);assert.equal(a.history.at(-1).generation,1000);
for (const r of a.history) assert.ok(Number.isFinite(r.meanFitness)&&r.meanGenome>=4);
console.log('PASS: reproducibility, seed diversity, environmental response, genetic interaction, fitness bounds, finite values');
console.log(JSON.stringify({initial:a.history[0],final:a.history.at(-1)},null,2));
