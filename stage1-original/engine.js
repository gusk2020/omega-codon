/* Omega Codon Stage 1 — experimental evolutionary simulation; not a biological predictor. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.OmegaEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const GENE_TYPES=20, ENVIRONMENTS=[
 {name:'温暖・病原体',stress:[.85,.25,.2,.1]},
 {name:'寒冷・損傷',stress:[.25,.95,.25,.1]},
 {name:'乾燥・飢餓',stress:[.2,.3,.95,.1]},
 {name:'複合災害',stress:[.85,.85,.85,.55]}
];
function rng(seed){let x=Number(seed)>>>0;return function(){x=(x+0x6D2B79F5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function sigmoid(x){return 1/(1+Math.exp(-Math.max(-30,Math.min(30,x))));}
function initialGenome(rand,n=20){return Array.from({length:n},()=>Math.floor(rand()*GENE_TYPES));}
function phenotype(genome,env,interactions=true){let activity=[0,0,0,0],counts=new Array(GENE_TYPES).fill(0);for(let g of genome)counts[g]++;
  // Each block is a regulatory node: presence, neighbouring interactions, and environmental inputs affect expression.
  for(let i=0;i<genome.length;i++){
    const g=genome[i], prev=genome[(i+genome.length-1)%genome.length],next=genome[(i+1)%genome.length];
    const channel=g%4, envInput=env.stress[channel], inhibition=counts[g]>.0?Math.log1p(counts[g])*.13:0;
    let coupling=0;
    if(interactions){coupling=((g*7+prev*11)%13-6)*.075+((next*3+g)%11-5)*.055;if(prev===g)coupling+=.35;if((g+next)%7===0)coupling+=.38;}
    const expression=sigmoid(-.75+envInput*.65+coupling-inhibition);
    activity[channel]+=expression*(.52+(g%5)*.115);
  }
  // Diminishing returns prevent arbitrarily large genomes from becoming universally optimal.
  const capacities=activity.map(a=>1-Math.exp(-a/2.8));
  const maintenance=.08+.007*genome.length+.00042*genome.length*genome.length;
  const mismatch=env.stress.reduce((sum,s,i)=>sum+s*(1-capacities[i])**2,0);
  return {capacities,maintenance,mismatch,fitness:Math.exp(-1.85*mismatch-1.45*maintenance)};
}
function mutate(source,rand,mutationRate=.15){const g=source.slice();if(rand()>mutationRate)return g;const op=Math.floor(rand()*5),i=Math.floor(rand()*g.length);
 if(op===0)g[i]=Math.floor(rand()*GENE_TYPES);
 if(op===1&&g.length<100)g.splice(i,0,g[i]);
 if(op===2&&g.length>4)g.splice(i,1);
 if(op===3&&g.length<100)g.splice(i,0,Math.floor(rand()*GENE_TYPES));
 if(op===4&&g.length>1){const j=Math.floor(rand()*g.length);[g[i],g[j]]=[g[j],g[i]];}
 return g;
}
function simulate(options={}){
 const seed=options.seed??42,popSize=Math.max(10,Math.min(1000,options.population??100)),generations=Math.max(1,Math.min(10000,options.generations??1000)), interactions=options.interactions!==false, changing=options.changing!==false, mutationRate=options.mutationRate??.24;
 const rand=rng(seed),founder=initialGenome(rand,options.genomeLength??20);
 let population=Array.from({length:popSize},()=>({genome:mutate(founder,rand,.85),age:0}));const history=[],sampleInterval=Math.max(1,Math.floor(generations/250));
 for(let t=0;t<=generations;t++){
   const phase=changing?Math.floor(t/Math.max(1,Math.floor(generations/4)))%4:0;
   const env=ENVIRONMENTS[phase],evals=population.map(p=>phenotype(p.genome,env,interactions));
   if(t%sampleInterval===0||t===generations){const mean=k=>evals.reduce((a,e)=>a+e[k],0)/evals.length;const best=evals.reduce((a,e)=>a.fitness>e.fitness?a:e);const unique=new Set(population.map(p=>p.genome.join(','))).size;
      history.push({generation:t,environment:env.name,meanFitness:mean('fitness'),bestFitness:best.fitness,meanGenome:population.reduce((a,p)=>a+p.genome.length,0)/population.length,diversity:unique/population.length,meanCapacity:[0,1,2,3].map(k=>evals.reduce((a,e)=>a+e.capacities[k],0)/evals.length)});
   }
   if(t===generations)break;
   // Fitness-weighted reproduction with nonzero baseline survival prevents numerical collapse.
   const weights=evals.map(e=>.02+e.fitness**3),total=weights.reduce((a,b)=>a+b,0),cumulative=[];let acc=0;for(const w of weights){acc+=w;cumulative.push(acc);}
   const next=[];for(let i=0;i<popSize;i++){const target=rand()*total;let lo=0,hi=cumulative.length-1;while(lo<hi){const m=(lo+hi)>>>1;if(cumulative[m]<target)lo=m+1;else hi=m;}next.push({genome:mutate(population[lo].genome,rand,mutationRate),age:0});}population=next;
 }
 const last=history[history.length-1];return {options:{seed,population:popSize,generations,interactions,changing,mutationRate},history,founder,final:population.map(p=>p.genome),summary:last};
}
return {rng,phenotype,mutate,simulate,ENVIRONMENTS};
});
