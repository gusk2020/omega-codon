/* Omega Codon Stage 1.2 — behaviour, longevity and cell-memory engine.
 * An abstract software model, not a biological predictor. It does not create
 * organs, and it makes no claim about real plants, sharks, deep-sea animals
 * or archaea. Every capacity is one of the loci or modes declared below.
 *
 * Builds on Stage 1.1 (stage1.1/engine.js, kept unchanged): the same
 * birth/death/pathogen/disaster/extinction rules, plus
 *   - five behaviour modes chosen each step by a mutable regulatory circuit
 *     fed by environmental cues, internal state and an internal rhythm;
 *   - noisy sensing with evolvable false-positive / false-negative rates;
 *   - regeneration split into repairing ORIGINAL cells vs REPLACING them;
 *   - a cell memory that exists only in surviving original cells.
 *
 * Game-specific assumptions (stated, not derived from biology):
 *   A1 Memory lives only in the original cell cohort. Replaced cells start
 *      blank and division does not pass memory on. Offspring start at M = 0.
 *   A2 (switchable, `rateOfLiving`) intrinsic damage accrues per unit of
 *      metabolic activity ("internal time"), not per calendar step. This is
 *      a contested hypothesis in real biology; it is an option here so its
 *      effect can be measured rather than assumed.
 *   A3 One step = one calendar "season". Internal time is tracked separately
 *      and is never used as calendar time. No log scale is used anywhere in
 *      the model or its metrics; a log scale, if any, is a display choice.
 * There is no fitness function: only survival and reproduction select.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OmegaEngine12 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MODES = ['dormant', 'wait', 'explore', 'hunt', 'repair'];
  const M_DORMANT = 0, M_WAIT = 1, M_EXPLORE = 2, M_HUNT = 3, M_REPAIR = 4, M_TRANSITION = 5;
  const NM = MODES.length;
  const INPUTS = ['bias', 'preyCue', 'scarcity', 'thermal', 'danger', 'energy', 'damage', 'infected', 'rhythmSin', 'rhythmCos'];
  const NI = INPUTS.length;

  // Loci: [name, min, max, founder value]. All evolve by point mutation.
  const LOCI = [
    ['metabolism', 0.2, 1.6, 1.0],     // scales every cost, every capacity, and (A2) ageing
    ['movement', 0, 1, 0.6],           // foraging reach while exploring
    ['predation', 0, 1, 0.4],          // capture ability while hunting
    ['tolerance', 0, 1, 0.4],          // resistance to heat/cold and disasters
    ['immune', 0, 1, 0.4],
    ['fecundity', 0, 1, 0.6],
    ['repairRate', 0, 1, 0.5],         // regeneration effort per step
    ['replaceRatio', 0, 1, 0.3],       // share of regeneration done by replacing cells
    ['dormancyDepth', 0.05, 0.5, 0.3], // metabolic fraction while dormant (lower = deeper)
    ['falsePositive', 0.02, 0.5, 0.25],
    ['falseNegative', 0.02, 0.5, 0.25],
    ['memoryLearn', 0, 1, 0.3],        // acquisition rate (costs while carried)
    ['memoryUpkeep', 0.05, 1, 0.5],    // maintenance spend: more = slower decay, more cost
    ['switchThreshold', 0, 2, 0.4],   // a new mode must beat the current one by this much
    ['rhythmPeriod', 4, 60, 20],
    ['rhythmPhase', 0, 6.2832, 0],
  ];
  const L = Object.fromEntries(LOCI.map((l, i) => [l[0], i]));
  const NL = LOCI.length;

  const DEFAULTS = {
    seed: 1, steps: 2000, founders: 100, patches: 4, maxPopulation: 6000,
    environment: 'rich', variable: true,
    selection: true, memory: true, switching: true, replacement: true, rateOfLiving: true,
    mutation: true, mutationRate: 0.3, extrinsicMortality: 0.01, migrationRate: 0.02,
    sampleEvery: 20, founderGenomes: null, maxEdges: 30,
  };

  // resource: plant food per patch per step; prey: prey carrying capacity per
  // patch; injury: damage multiplier while hunting.
  const ENVIRONMENTS = {
    rich:            { resource: 22, prey: 60, thermal: 0.2,  pathogen: 0.04, disasterRate: 0.002, injury: 1 },
    scarce:          { resource: 5,  prey: 15, thermal: 0.3,  pathogen: 0.04, disasterRate: 0.002, injury: 1 },
    plague:          { resource: 18, prey: 40, thermal: 0.2,  pathogen: 0.28, disasterRate: 0.002, injury: 1 },
    preyless:        { resource: 10, prey: 3,  thermal: 0.25, pathogen: 0.04, disasterRate: 0.002, injury: 1 },
    damageHeavy:     { resource: 16, prey: 40, thermal: 0.8,  pathogen: 0.06, disasterRate: 0.004, injury: 2.5 },
    extremeDisaster: { resource: 16, prey: 40, thermal: 0.4,  pathogen: 0.06, disasterRate: 0.03, injury: 1 },
  };

  const ENERGY_MAX = 3, MATURITY_AGE = 3, OFFSPRING_COST = 0.55, OFFSPRING_ENERGY = 0.45;
  const SWITCH_COST = 0.02, HUNT_GAIN = 1.5;
  const MODE_METAB = [null, 0.6, 1.0, 1.3, 0.9, 0.6]; // dormant comes from its locus

  function rng(seed) {
    let x = Number(seed) >>> 0;
    return function () {
      x = (x + 0x6D2B79F5) >>> 0;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ---- genome ---------------------------------------------------------------
  // edge {m: mode, i: input, w}; score[m] = sum of w * input[i].
  function founderGenome() {
    const loci = LOCI.map((l) => l[3]);
    const e = (m, i, w) => ({ m, i: INPUTS.indexOf(i), w });
    const edges = [
      e(M_EXPLORE, 'bias', 0.6), e(M_WAIT, 'bias', 0.1), e(M_HUNT, 'bias', -0.3), e(M_REPAIR, 'bias', -0.6), e(M_DORMANT, 'bias', -1.2),
      e(M_HUNT, 'preyCue', 1.4), e(M_REPAIR, 'damage', 1.6), e(M_DORMANT, 'scarcity', 0.8), e(M_DORMANT, 'thermal', 0.5),
      e(M_WAIT, 'energy', 0.4),
    ];
    return { loci, edges };
  }
  const cloneGenome = (g) => ({ loci: g.loci.slice(), edges: g.edges.map((x) => ({ m: x.m, i: x.i, w: x.w })) });

  function mutate(parent, r, maxEdges) {
    const g = cloneGenome(parent);
    const ops = 1 + (r() < 0.3 ? 1 : 0);
    for (let n = 0; n < ops; n++) {
      const u = r();
      if (u < 0.55) { // locus point mutation
        const k = Math.floor(r() * NL), [, lo, hi] = LOCI[k];
        g.loci[k] = clamp(g.loci[k] + (r() - 0.5) * 0.25 * (hi - lo), lo, hi);
      } else if (u < 0.75) { // rewire a circuit weight
        if (g.edges.length) { const x = g.edges[Math.floor(r() * g.edges.length)]; x.w = clamp(x.w + (r() - 0.5) * 1.2, -4, 4); }
      } else if (u < 0.88) { // new regulatory edge
        if (g.edges.length < maxEdges) g.edges.push({ m: Math.floor(r() * NM), i: Math.floor(r() * NI), w: (r() - 0.5) * 3 });
      } else { // lose an edge
        if (g.edges.length) g.edges.splice(Math.floor(r() * g.edges.length), 1);
      }
    }
    return g;
  }

  function decide(edges, input, switching, score, current, threshold) {
    score.fill(0);
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k];
      if (!switching && e.i !== 0) continue; // switching off: genetic default only
      score[e.m] += e.w * input[e.i];
    }
    let best = 0;
    for (let m = 1; m < NM; m++) if (score[m] > score[best]) best = m;
    return best !== current && score[best] - score[current] < threshold ? current : best;
  }

  // ---- simulation -----------------------------------------------------------
  function simulate(userOptions = {}) {
    const o = { ...DEFAULTS, ...userOptions };
    const env = ENVIRONMENTS[o.environment];
    if (!env) throw new Error('unknown environment: ' + o.environment);
    o.steps = clamp(Math.floor(o.steps), 0, 100000);
    o.founders = clamp(Math.floor(o.founders), 0, o.maxPopulation);
    o.patches = clamp(Math.floor(o.patches), 1, 32);
    const t0 = Date.now();
    // Three independent streams: the environment's history is identical for
    // every condition run with the same seed (paired design), and mutation
    // draws never shift demographic draws.
    const rand = rng(o.seed), envRand = rng((o.seed * 2654435761) ^ 0x51ED27), mutRand = rng((o.seed * 40503) ^ 0xA5A5A5);

    const founder = founderGenome();
    const patches = [];
    for (let p = 0; p < o.patches; p++) patches.push({ resource: env.resource, thermal: env.thermal, pathogen: env.pathogen,
      target: { resource: env.resource, thermal: env.thermal, pathogen: env.pathogen }, prey: env.prey,
      famine: 0, hit: 0, count: 0, infected: 0, demand: 0, eaten: 0 });

    let nextId = 1;
    const newborn = (genome, patch, energy) => ({ id: nextId++, genome, patch, energy, age: 0, internal: 0, active: 0,
      damage: 0, load: 0, O: 1, M: 0, Mpeak: 0, P: 0, mode: M_EXPLORE, pending: -1, arousal: 0, births: 0,
      dmgSrc: [0, 0, 0, 0, 0], hunts: 0, catches: 0, present: false });
    let pop = [];
    for (let i = 0; i < o.founders; i++) pop.push(newborn(cloneGenome(o.founderGenomes ? o.founderGenomes[i % o.founderGenomes.length] : founder), i % o.patches, 1.0));

    // Energy ledger: sum(alive energy) == start + intake - spent - reproOverhead - lostAtDeath - overflow + deficit.
    const ledger = { start: pop.reduce((a, x) => a + x.energy, 0), intakePlant: 0, intakePrey: 0, spent: 0, reproOverhead: 0, lostAtDeath: 0, overflow: 0, deficit: 0 };
    const spentBy = { base: 0, memory: 0, regeneration: 0, switching: 0, hunting: 0 };
    const DAMAGE_SOURCES = ['senescence', 'thermal', 'pathogen', 'disaster', 'injury'];
    const causes = { extrinsic: 0, starvation: 0, senescence: 0, thermal: 0, pathogen: 0, disaster: 0, injury: 0 };
    const deaths = []; // compact records: calendar, active, internal, births, O, memoryRetention
    const decisions = { tp: 0, fp: 0, fn: 0, tn: 0 }, sensing = { cueWhenAbsent: 0, absent: 0, missWhenPresent: 0, present: 0 };
    const modeSteps = new Array(NM + 1).fill(0);
    let disasters = 0, envSignature = 0, huntSteps = 0, huntEncounters = 0, catches = 0, totalBirths = 0, extinctAt = null, capHit = false, switches = 0;
    const popTrace = new Int32Array(o.steps + 1);
    popTrace[0] = pop.length;
    const history = [];
    const input = new Float64Array(NI), score = new Float64Array(NM);

    function traitMeans() {
      const m = new Array(NL).fill(0); let O = 0, Mm = 0, edges = 0;
      for (const x of pop) { for (let k = 0; k < NL; k++) m[k] += x.genome.loci[k]; O += x.O; Mm += x.M; edges += x.genome.edges.length; }
      const n = pop.length || 1;
      return { loci: Object.fromEntries(LOCI.map((l, k) => [l[0], m[k] / n])), meanO: O / n, meanM: Mm / n, meanEdges: edges / n };
    }
    function sample(t) {
      const tm = traitMeans();
      history.push({ step: t, population: pop.length, ...tm, prey: patches.reduce((a, p) => a + p.prey, 0) / patches.length });
    }
    sample(0);

    for (let t = 1; t <= o.steps; t++) {
      if (pop.length === 0) { if (extinctAt === null) extinctAt = t - 1; break; }

      for (const p of patches) {
        if (o.variable && envRand() < 0.01) p.target = { resource: env.resource * (0.5 + envRand()), thermal: clamp(env.thermal + (envRand() - 0.5) * 0.6, 0, 1), pathogen: clamp(env.pathogen * (0.4 + envRand() * 1.8), 0, 0.6) };
        p.resource += (p.target.resource - p.resource) * 0.05;
        p.thermal += (p.target.thermal - p.thermal) * 0.05;
        p.pathogen += (p.target.pathogen - p.pathogen) * 0.05;
        p.hit = 0;
        if (envRand() < env.disasterRate) { p.hit = 0.6 + envRand() * 0.9; p.famine = 15; disasters++; envSignature = (envSignature * 31 + t) % 1000000007; }
        p.prey += 0.3 * p.prey * (1 - p.prey / env.prey) + 0.002 * env.prey; // logistic + trickle immigration
        p.count = 0; p.infected = 0; p.demand = 0; p.eaten = 0;
      }
      for (const x of pop) { const p = patches[x.patch]; p.count++; if (x.load > 0) p.infected++; }

      // 1. sense, decide, set demand
      for (const x of pop) {
        const g = o.selection ? x.genome : founder, lo = g.loci, p = patches[x.patch];
        const metab = lo[L.metabolism];
        const prod = p.resource * (p.famine > 0 ? 0.4 : 1);
        const memF = o.memory ? x.M : 0;
        // An encounter persists until the prey is caught or slips away, so a hunt
        // started on a cue can still find it after the switching delay.
        x.present = (x.present && rand() < 0.7) || rand() < 0.5 * Math.min(1, p.prey / env.prey);
        const fpE = lo[L.falsePositive] * (1 - 0.6 * memF), fnE = lo[L.falseNegative] * (1 - 0.6 * memF);
        x.cue = x.present ? rand() >= fnE : rand() < fpE;
        if (x.present) { sensing.present++; if (!x.cue) sensing.missWhenPresent++; } else { sensing.absent++; if (x.cue) sensing.cueWhenAbsent++; }

        if (x.arousal > 0) { x.arousal--; x.switchCost = 0; x.eff = x.arousal > 0 ? M_DORMANT : M_TRANSITION; if (x.arousal === 0) x.mode = x.pending; }
        else {
          input[0] = 1; input[1] = x.cue ? 1 : 0; input[2] = clamp(p.count * 0.35 / (prod + 1), 0, 2); input[3] = p.thermal;
          input[4] = p.famine > 0 ? 1 : 0; input[5] = x.energy / ENERGY_MAX; input[6] = clamp(x.damage, 0, 2); input[7] = x.load > 0 ? 1 : 0;
          const ph = 6.283185 * x.age / lo[L.rhythmPeriod] + lo[L.rhythmPhase];
          input[8] = Math.sin(ph); input[9] = Math.cos(ph);
          const d = decide(g.edges, input, o.switching, score, x.mode, lo[L.switchThreshold]);
          x.eff = x.mode;
          if (d !== x.mode) {
            switches++;
            x.switchCost = SWITCH_COST * metab;
            if (x.mode === M_DORMANT) { // waking takes time; deeper dormancy is slower
              x.arousal = Math.round((0.5 - lo[L.dormancyDepth]) * 6); x.pending = d;
              if (x.arousal === 0) { x.mode = d; x.eff = M_TRANSITION; } else x.eff = M_DORMANT;
            } else { x.mode = d; x.eff = M_TRANSITION; }
          } else x.switchCost = 0;
          if (x.eff !== M_DORMANT) {
            const hunting = x.eff === M_HUNT;
            if (hunting && x.present) decisions.tp++; else if (hunting) decisions.fp++; else if (x.present) decisions.fn++; else decisions.tn++;
          }
        }
        if (x.eff === M_EXPLORE) x.demand = (0.3 + 0.7 * lo[L.movement]) * Math.min(1.3, metab);
        else if (x.eff === M_WAIT) x.demand = 0.15 * Math.min(1.3, metab);
        else x.demand = 0;
        p.demand += x.demand;
      }

      // 2. energy, infection, damage, regeneration, death, reproduction
      const next = [];
      for (const x of pop) {
        const g = o.selection ? x.genome : founder, lo = g.loci, p = patches[x.patch], mode = x.eff;
        const metab = lo[L.metabolism];
        modeSteps[mode]++;
        const modeMetab = mode === M_DORMANT ? lo[L.dormancyDepth] : MODE_METAB[mode];
        const activity = metab * modeMetab;
        const prod = p.resource * (p.famine > 0 ? 0.4 : 1);
        let gain = 0;
        if (x.demand > 0) {
          gain = Math.min(x.demand * prod / (prod + 4), prod * x.demand / (p.demand || 1));
          ledger.intakePlant += gain; p.eaten += gain;
        }
        let huntCost = 0;
        if (mode === M_HUNT) {
          huntSteps++; x.hunts++; huntCost = 0.05 * metab;
          // hunting is an active search, not only a reaction to a cue
          if (!x.present) x.present = rand() < 0.6 * Math.min(1, p.prey / env.prey) * (0.4 + 0.6 * lo[L.movement]);
          if (x.present && p.prey >= 1) {
            huntEncounters++;
            const memF = o.memory ? x.M : 0;
            const pc = clamp(1.5 * lo[L.predation] * (0.4 + 0.6 * Math.min(1.2, metab)) * (1 + 0.8 * memF), 0, 0.95);
            if (rand() < pc) {
              gain += HUNT_GAIN; ledger.intakePrey += HUNT_GAIN; p.prey -= 1; catches++; x.catches++; x.present = false;
              if (o.memory) x.M += lo[L.memoryLearn] * (x.O - x.M) * 0.2;
            }
          }
          if (rand() < 0.3) { const inj = 0.05 * env.injury * (1 - 0.5 * lo[L.tolerance]); x.damage += inj; x.dmgSrc[4] += inj; }
        }
        const locusCost = 0.03 * lo[L.movement] + 0.04 * lo[L.predation] + 0.05 * lo[L.tolerance] + 0.06 * lo[L.immune]
          + 0.05 * ((0.5 - lo[L.falsePositive]) + (0.5 - lo[L.falseNegative])) / 0.48;
        const base = activity * (0.05 + locusCost);
        const memCost = o.memory ? 0.02 * lo[L.memoryLearn] + 0.06 * lo[L.memoryUpkeep] * x.M : 0;
        // regeneration
        const r = lo[L.repairRate] * (mode === M_REPAIR ? 2.5 : mode === M_DORMANT ? 0.5 : 1) * (x.energy > 0 ? 1 : 0.3) * Math.sqrt(Math.min(1.2, metab));
        const rho = o.replacement ? lo[L.replaceRatio] : 0;
        const fix = r * (1 - rho), rep = r * rho, eff = 1 / (1 + x.P / 3);
        const regenCost = 0.10 * fix + 0.05 * rep;
        const cost = base + memCost + regenCost + huntCost + x.switchCost;
        spentBy.base += base; spentBy.memory += memCost; spentBy.regeneration += regenCost; spentBy.hunting += huntCost; spentBy.switching += x.switchCost;
        ledger.spent += cost;
        x.energy += gain - cost;

        // infection (exposure depends on mode)
        const expo = mode === M_EXPLORE || mode === M_HUNT ? 1.5 : mode === M_DORMANT ? 0.5 : 1;
        const memF = o.memory ? x.M : 0;
        if (x.load <= 0) {
          const pressure = p.pathogen + 0.35 * (p.count ? p.infected / p.count : 0);
          if (rand() < pressure * expo * (1 - 0.85 * lo[L.immune]) * (1 - 0.5 * memF)) x.load = 0.2;
        } else {
          x.load += 0.3 * x.load * (1 - lo[L.immune]) - 0.12 * lo[L.immune] * (1 + 0.5 * memF);
          if (x.load <= 0) { x.load = 0; if (o.memory) x.M += lo[L.memoryLearn] * (x.O - x.M) * 0.2; }
          else if (x.load > 2) x.load = 2;
        }

        // damage
        x.internal += activity;
        const ageing = o.rateOfLiving ? activity : 1;
        const clock = o.rateOfLiving ? x.internal : x.age;
        const sen = 0.012 * (1 + clock / 25) * ageing;
        const shelter = mode === M_DORMANT ? 0.5 : 1; // assumption: a dormant body is sheltered (cyst/burrow)
        const th = 0.12 * p.thermal * (1 - lo[L.tolerance]) * shelter;
        const pa = 0.08 * x.load;
        const di = p.hit * (1 - 0.6 * lo[L.tolerance]) * shelter;
        x.damage += sen + th + pa + di;
        x.dmgSrc[0] += sen; x.dmgSrc[1] += th; x.dmgSrc[2] += pa; x.dmgSrc[3] += di;
        // regeneration: repair keeps original cells; replacement swaps them for blank ones
        x.damage -= 0.15 * fix + 0.35 * rep * eff;
        const Oold = x.O;
        x.O *= 1 - 0.25 * rep * eff;
        x.P += rep;
        if (x.damage > 0.4) x.O *= 1 - 0.03 * (x.damage - 0.4); // unrepaired cells die
        if (x.damage < 0) x.damage = 0;
        if (o.memory) {
          x.M *= x.O / Oold;                               // A1: memory goes with its cells
          x.M *= 1 - 0.03 * (1 - lo[L.memoryUpkeep]);      // upkeep slows decay
          if (x.M > x.O) x.M = x.O;
          if (x.M > x.Mpeak) x.Mpeak = x.M;
        }

        // mortality
        const hz = { extrinsic: o.extrinsicMortality, damage: 0.3 * x.damage * x.damage, starvation: 0 };
        if (x.energy < 0) { ledger.deficit += -x.energy; x.energy = 0; hz.starvation = 0.25; }
        if (x.energy > ENERGY_MAX) { ledger.overflow += x.energy - ENERGY_MAX; x.energy = ENERGY_MAX; }
        x.age++;
        if (mode !== M_DORMANT) x.active++;
        const hazard = hz.extrinsic + hz.damage + hz.starvation;
        if (rand() < 1 - Math.exp(-hazard)) {
          let cause = hz.starvation >= hz.damage && hz.starvation >= hz.extrinsic ? 'starvation' : hz.extrinsic >= hz.damage ? 'extrinsic' : null;
          if (!cause) { let b = 0; for (let k = 1; k < 5; k++) if (x.dmgSrc[k] > x.dmgSrc[b]) b = k; cause = DAMAGE_SOURCES[b]; }
          causes[cause]++;
          ledger.lostAtDeath += x.energy;
          deaths.push([x.age, x.active, x.internal, x.births, x.O, x.Mpeak > 0 ? x.M / x.Mpeak : null, x.hunts, x.catches]);
          continue;
        }

        if (mode !== M_DORMANT && mode !== M_TRANSITION && x.age >= MATURITY_AGE && x.energy > OFFSPRING_COST + 0.3 && rand() < 0.7 * lo[L.fecundity]) {
          x.energy -= OFFSPRING_COST; ledger.reproOverhead += OFFSPRING_COST - OFFSPRING_ENERGY;
          const genome = o.mutation && mutRand() < o.mutationRate ? mutate(x.genome, mutRand, o.maxEdges) : x.genome;
          const patch = rand() < o.migrationRate ? Math.floor(rand() * o.patches) : x.patch;
          next.push(newborn(genome, patch, OFFSPRING_ENERGY)); x.births++; totalBirths++;
        }
        if (rand() < o.migrationRate * 0.25) x.patch = Math.floor(rand() * o.patches);
        next.push(x);
      }
      for (const p of patches) { if (p.famine > 0) p.famine--; if (p.prey < 0) p.prey = 0; }
      if (next.length > o.maxPopulation) { capHit = true; while (next.length > o.maxPopulation) { const k = Math.floor(rand() * next.length); ledger.lostAtDeath += next[k].energy; next.splice(k, 1); } }
      pop = next;
      popTrace[t] = pop.length;
      if (pop.length === 0 && extinctAt === null) extinctAt = t;
      if (t % o.sampleEvery === 0 || t === o.steps || pop.length === 0) sample(t);
    }

    const ran = extinctAt === null ? o.steps : extinctAt;
    const trace = Array.from(popTrace.subarray(1, ran + 1)).sort((a, b) => a - b);
    const alive = pop.reduce((a, x) => a + x.energy, 0);
    const expected = ledger.start + ledger.intakePlant + ledger.intakePrey - ledger.spent - ledger.reproOverhead - ledger.lostAtDeath - ledger.overflow + ledger.deficit;
    const col = (k) => deaths.map((d) => d[k]).filter((v) => v !== null);
    const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
    const totalModes = modeSteps.reduce((a, b) => a + b, 0) || 1;
    const dec = decisions, nd = dec.tp + dec.fp + dec.fn + dec.tn;
    return {
      options: { ...o, founderGenomes: o.founderGenomes ? o.founderGenomes.length : null },
      extinct: pop.length === 0, extinctAt, capHit, disasters, envSignature,
      lineagePersistence: ran,                      // calendar steps the lineage existed (censored at o.steps)
      population: { min: trace.length ? trace[0] : 0, median: med(trace), max: trace.length ? trace[trace.length - 1] : 0, final: pop.length },
      lifespan: { calendarMean: mean(col(0)), calendarMedian: med(col(0)), calendarMax: col(0).length ? Math.max(...col(0)) : null,
        activeMean: mean(col(1)), internalMean: mean(col(2)), deathsRecorded: deaths.length },
      reproduction: { totalBirths, birthsPerDeath: mean(col(3)), maxBirths: col(3).length ? Math.max(...col(3)) : null },
      deathCauses: causes,
      energy: { ...ledger, alive, residual: alive - expected, spentBy },
      predation: { huntSteps, encounters: huntEncounters, catches, successPerHuntStep: huntSteps ? catches / huntSteps : null, successPerEncounter: huntEncounters ? catches / huntEncounters : null },
      switching: { switches, decisions: dec, huntPrecision: dec.tp + dec.fp ? dec.tp / (dec.tp + dec.fp) : null,
        huntRecall: dec.tp + dec.fn ? dec.tp / (dec.tp + dec.fn) : null, accuracy: nd ? (dec.tp + dec.tn) / nd : null,
        sensorFalsePositiveRate: sensing.absent ? sensing.cueWhenAbsent / sensing.absent : null,
        sensorFalseNegativeRate: sensing.present ? sensing.missWhenPresent / sensing.present : null },
      modeFractions: Object.fromEntries(MODES.concat(['transition']).map((m, k) => [m, modeSteps[k] / totalModes])),
      cells: { originalAtDeath: mean(col(4)), memoryRetentionAtDeath: mean(col(5)) },
      history, finalGenomes: pop.map((x) => x.genome), final: traitMeans(),
      elapsedMs: Date.now() - t0,
    };
  }

  function assay(genomes, options = {}) {
    const n = options.founders ?? 100, set = [];
    for (let i = 0; i < n; i++) set.push(genomes[i % genomes.length]);
    return simulate({ ...options, founders: n, mutation: false, founderGenomes: set });
  }

  return { rng, MODES, INPUTS, LOCI, DEFAULTS, ENVIRONMENTS, founderGenome, mutate, simulate, assay };
});
