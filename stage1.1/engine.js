/* Omega Codon Stage 1.1 — individual-based evolution engine.
 * An abstract software model. It is NOT a biological predictor, and nothing in
 * it produces new organs or genuine biological novelty: every capacity an
 * organism can have is one of the five channels declared below. What can
 * evolve is how much of each channel a genome carries, where its genes sit,
 * whether they are silenced, and a mutable regulatory network that lets
 * expression respond to signals.
 *
 * Time unit: one step = one "season". No population size is ever enforced:
 * births, deaths and extinction come only from each individual's energy,
 * damage, pathogen load and age. A safety ceiling (maxPopulation) exists to
 * bound memory; when it is hit the run reports capHit=true.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.OmegaEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ---- Declared abstractions --------------------------------------------
  const CHANNELS = ['forage', 'repair', 'immune', 'tolerance', 'fecundity'];
  const C = { forage: 0, repair: 1, immune: 2, tolerance: 3, fecundity: 4 };
  const NC = CHANNELS.length;
  // Regulatory inputs: 5 external/internal signals followed by the 5 channels.
  const SIGNALS = ['scarcity', 'pathogen', 'thermal', 'ownDamage', 'ownEnergy'];
  const NS = SIGNALS.length;
  const NIN = NS + NC;

  // Every parameter is an assumption; all are listed here and reported.
  const DEFAULTS = {
    seed: 1,
    steps: 2000,
    founders: 100,
    patches: 4,
    maxPopulation: 6000,
    environment: 'temperate',   // key of ENVIRONMENTS
    variable: true,             // regime shifts + local disasters
    selection: true,            // false = genotype not expressed (drift control)
    interactions: true,         // false = regulatory edges ignored
    mutation: true,
    mutationRate: 0.3,          // probability an offspring carries >=1 mutation
    disasterRate: 0.004,        // per patch per step (variable mode only)
    extrinsicMortality: 0.01,   // per step, independent of state
    migrationRate: 0.02,
    sampleEvery: 20,
    founderGenomes: null,       // optional array of {genes, edges} to seed from
    shift: null,                // optional {at: step, environment: key}: a deliberate perturbation
  };

  // Mean conditions per patch. resource = production per patch per step,
  // thermal = 0..1 stress, pathogen = background infection pressure.
  const ENVIRONMENTS = {
    temperate: { resource: 18, thermal: 0.25, pathogen: 0.04 },
    cold:      { resource: 15, thermal: 0.75, pathogen: 0.02 },
    plague:    { resource: 18, thermal: 0.2,  pathogen: 0.25 },
    harsh:     { resource: 6,  thermal: 0.9,  pathogen: 0.2 },
    rich:      { resource: 28, thermal: 0.1,  pathogen: 0.03 },
    brink:     { resource: 2.5, thermal: 1.0, pathogen: 0.3 },
  };

  const EXPRESSION_COST = [0.05, 0.06, 0.07, 0.05, 0.0]; // per unit expression
  const EDGE_COST = 0.004;
  const GENE_COST = 0.003;
  const BASE_COST = 0.06;
  const MATURITY_AGE = 3;
  const OFFSPRING_COST = 0.55;
  const OFFSPRING_ENERGY = 0.45;
  const ENERGY_MAX = 3;
  const MAX_GENES = 80;
  const MIN_GENES = 3;
  const MAX_EDGES = 16;

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
  const sigmoid = (v) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, v))));
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ---- Genome ------------------------------------------------------------
  // gene: {c: channel, s: strength, on: expressed?}. Order matters: a gene's
  // contribution falls off with position (an abstract promoter-distance
  // effect), so translocations and inversions change the phenotype.
  // edge: {src: 0..NIN-1, dst: channel, w: weight}.
  function founderGenome() {
    const genes = [];
    const layout = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 0, 1, 2, 4];
    for (const c of layout) genes.push({ c, s: 0.6, on: true });
    return { genes, edges: [] };
  }

  function cloneGenome(g) {
    return { genes: g.genes.map((x) => ({ c: x.c, s: x.s, on: x.on })), edges: g.edges.map((e) => ({ src: e.src, dst: e.dst, w: e.w })) };
  }

  // Dosage per channel, cached at birth (the genome never changes in a life).
  function dosage(genome) {
    const d = new Float64Array(NC);
    const gs = genome.genes;
    for (let i = 0; i < gs.length; i++) if (gs[i].on) d[gs[i].c] += gs[i].s / (1 + 0.03 * i);
    for (let c = 0; c < NC; c++) d[c] = 1 - Math.exp(-d[c] / 1.6);
    return d;
  }

  function maintenanceBase(genome, interactions) {
    return BASE_COST + GENE_COST * genome.genes.length + (interactions ? EDGE_COST * genome.edges.length : 0);
  }

  // Expression = dosage scaled by a regulatory multiplier in (0, 2). With no
  // edges (or interactions off) the multiplier is exactly 1, so the edges are
  // the only route to plastic, signal-dependent expression.
  function express(base, edges, signals, interactions, out) {
    if (!interactions || edges.length === 0) {
      for (let c = 0; c < NC; c++) out[c] = base[c];
      return out;
    }
    const x = out;
    for (let c = 0; c < NC; c++) x[c] = base[c];
    const mod = new Float64Array(NC);
    for (let round = 0; round < 2; round++) {
      mod.fill(0);
      for (let k = 0; k < edges.length; k++) {
        const e = edges[k];
        const u = e.src < NS ? signals[e.src] : x[e.src - NS];
        mod[e.dst] += e.w * u;
      }
      for (let c = 0; c < NC; c++) x[c] = Math.min(1, base[c] * 2 * sigmoid(mod[c]));
    }
    return x;
  }

  function mutate(parent, rand) {
    const g = cloneGenome(parent);
    const ops = 1 + (rand() < 0.25 ? 1 : 0);
    for (let n = 0; n < ops; n++) {
      const r = rand();
      const L = g.genes.length;
      const i = Math.floor(rand() * L);
      if (r < 0.22) { // point: strength
        g.genes[i].s = clamp(g.genes[i].s * Math.exp((rand() - 0.5) * 0.6), 0.05, 2);
      } else if (r < 0.30) { // point: channel substitution
        g.genes[i].c = Math.floor(rand() * NC);
      } else if (r < 0.42) { // duplication (tandem)
        if (L < MAX_GENES) g.genes.splice(i + 1, 0, { ...g.genes[i] });
      } else if (r < 0.54) { // deletion
        if (L > MIN_GENES) g.genes.splice(i, 1);
      } else if (r < 0.62) { // translocation
        const [x] = g.genes.splice(i, 1);
        g.genes.splice(Math.floor(rand() * g.genes.length + 1), 0, x);
      } else if (r < 0.68) { // inversion of a segment
        const j = Math.min(L, i + 2 + Math.floor(rand() * 5));
        const seg = g.genes.slice(i, j).reverse();
        g.genes.splice(i, seg.length, ...seg);
      } else if (r < 0.74) { // silencing / reactivation (dormancy)
        g.genes[i].on = !g.genes[i].on;
      } else if (r < 0.84) { // add regulatory edge
        if (g.edges.length < MAX_EDGES) g.edges.push({ src: Math.floor(rand() * NIN), dst: Math.floor(rand() * NC), w: (rand() - 0.5) * 4 });
      } else if (r < 0.90) { // remove edge
        if (g.edges.length) g.edges.splice(Math.floor(rand() * g.edges.length), 1);
      } else { // rewire weight
        if (g.edges.length) { const e = g.edges[Math.floor(rand() * g.edges.length)]; e.w = clamp(e.w + (rand() - 0.5) * 1.5, -4, 4); }
      }
    }
    return g;
  }

  // Expression a genome would show under fixed reference signals. Used to
  // report genotypic traits identically whether or not they are expressed.
  const REFERENCE_SIGNALS = [0.5, 0.2, 0.3, 0.2, 0.5];
  function genotypeTraits(genome, interactions = true, signals = REFERENCE_SIGNALS) {
    return Array.from(express(dosage(genome), genome.edges, signals, interactions, new Float64Array(NC)));
  }

  // ---- Simulation ---------------------------------------------------------
  function simulate(userOptions = {}) {
    const o = { ...DEFAULTS, ...userOptions };
    let env = ENVIRONMENTS[o.environment];
    if (!env) throw new Error('unknown environment: ' + o.environment);
    if (o.shift && !ENVIRONMENTS[o.shift.environment]) throw new Error('unknown shift environment: ' + o.shift.environment);
    o.steps = clamp(Math.floor(o.steps), 0, 100000);
    o.founders = clamp(Math.floor(o.founders), 0, o.maxPopulation);
    o.patches = clamp(Math.floor(o.patches), 1, 32);
    const rand = rng(o.seed);
    const t0 = Date.now();

    const founder = founderGenome();
    const founderBase = dosage(founder);
    const founderMaint = maintenanceBase(founder, o.interactions);

    // Patch state. Variable mode moves each patch's conditions between
    // regimes and applies rare local disasters.
    const patches = [];
    for (let p = 0; p < o.patches; p++) {
      patches.push({ resource: env.resource, thermal: env.thermal, pathogen: env.pathogen,
        target: { resource: env.resource, thermal: env.thermal, pathogen: env.pathogen },
        famine: 0, infected: 0, count: 0, demand: 0 });
    }

    let nextId = 1;
    function makeIndividual(genome, patch, energy) {
      const base = dosage(genome);
      return { id: nextId++, genome, base, maint: maintenanceBase(genome, o.interactions), patch,
        age: 0, energy, damage: 0, load: 0, x: new Float64Array(NC) };
    }

    let pop = [];
    for (let i = 0; i < o.founders; i++) {
      const src = o.founderGenomes ? o.founderGenomes[i % o.founderGenomes.length] : founder;
      pop.push(makeIndividual(cloneGenome(src), i % o.patches, 1.0));
    }

    const history = [];
    let births = 0, deaths = 0, lifespanSum = 0, deathCount = 0, disasters = 0;
    let lifeAll = 0, totBirths = 0, totDeaths = 0, extinctAt = null, capHit = false, peak = pop.length;
    const signals = new Float64Array(NS);

    function sample(t) {
      const n = pop.length;
      const traits = new Array(NC).fill(0);
      let len = 0, edges = 0, dmg = 0, inf = 0, age = 0;
      const uniq = new Set();
      for (const ind of pop) {
        const tr = genotypeTraits(ind.genome, o.interactions);
        for (let c = 0; c < NC; c++) traits[c] += tr[c];
        len += ind.genome.genes.length; edges += ind.genome.edges.length;
        dmg += ind.damage; inf += ind.load > 0 ? 1 : 0; age += ind.age;
        if (uniq.size < 400) uniq.add(genomeKey(ind.genome));
      }
      const d = n || 1;
      history.push({ step: t, population: n, births, deaths,
        meanLifespan: deathCount ? lifespanSum / deathCount : null,
        meanAge: age / d, meanDamage: dmg / d, infectedFraction: inf / d,
        meanGenes: len / d, meanEdges: edges / d,
        diversity: n ? uniq.size / Math.min(n, 400) : 0,
        traits: traits.map((v) => v / d),
        resource: patches.reduce((a, p) => a + p.resource, 0) / patches.length,
        thermal: patches.reduce((a, p) => a + p.thermal, 0) / patches.length,
        disasters });
      births = 0; deaths = 0; lifespanSum = 0; deathCount = 0; disasters = 0;
    }

    sample(0);
    for (let t = 1; t <= o.steps; t++) {
      if (pop.length === 0) { if (extinctAt === null) extinctAt = t - 1; break; }

      if (o.shift && t === o.shift.at) {
        env = ENVIRONMENTS[o.shift.environment];
        for (const p of patches) { p.resource = p.target.resource = env.resource; p.thermal = p.target.thermal = env.thermal; p.pathogen = p.target.pathogen = env.pathogen; }
      }
      // Environment update.
      for (const p of patches) {
        if (o.variable) {
          if (rand() < 0.01) {
            p.target = { resource: env.resource * (0.5 + rand()), thermal: clamp(env.thermal + (rand() - 0.5) * 0.8, 0, 1),
              pathogen: clamp(env.pathogen * (0.3 + rand() * 2.4), 0, 0.6) };
          }
          p.resource += (p.target.resource - p.resource) * 0.05;
          p.thermal += (p.target.thermal - p.thermal) * 0.05;
          p.pathogen += (p.target.pathogen - p.pathogen) * 0.05;
        }
        p.count = 0; p.demand = 0; p.infected = 0; p.hit = 0;
        if (o.variable && rand() < o.disasterRate) { p.hit = 0.6 + rand() * 0.9; p.famine = 15; disasters++; }
      }

      // Expression (needs patch signals) and resource demand.
      for (const ind of pop) {
        const p = patches[ind.patch];
        p.count++;
        if (ind.load > 0) p.infected++;
      }
      for (const ind of pop) {
        const p = patches[ind.patch];
        const prod = p.resource * (p.famine > 0 ? 0.4 : 1);
        signals[0] = clamp(p.count * 0.35 / (prod + 1), 0, 2);
        signals[1] = clamp(p.pathogen * 3 + (p.count ? p.infected / p.count : 0), 0, 2);
        signals[2] = p.thermal;
        signals[3] = clamp(ind.damage, 0, 2);
        signals[4] = ind.energy / ENERGY_MAX;
        if (o.selection) {
          express(ind.base, ind.genome.edges, signals, o.interactions, ind.x);
        } else {
          // Drift control: genotype is inherited and mutated but not expressed.
          for (let c = 0; c < NC; c++) ind.x[c] = founderBase[c];
        }
        ind.demand = 0.2 + 0.8 * ind.x[C.forage];
        p.demand += ind.demand;
      }

      const next = [];
      for (const ind of pop) {
        const p = patches[ind.patch];
        const x = ind.x;
        const prod = p.resource * (p.famine > 0 ? 0.4 : 1);
        // Uncrowded intake is still limited by how sparse food is (a saturating
        // encounter rate), so a poor patch can be unviable at any density.
        const intake = Math.min(ind.demand * prod / (prod + 4), prod * ind.demand / (p.demand || 1));
        let cost = (o.selection ? ind.maint : founderMaint);
        for (let c = 0; c < NC; c++) cost += EXPRESSION_COST[c] * x[c];
        ind.energy += intake - cost - 0.05 * ind.load;

        // Infection: background plus density-dependent transmission.
        if (ind.load <= 0) {
          const pressure = p.pathogen + 0.35 * (p.count ? p.infected / p.count : 0);
          if (rand() < pressure * (1 - 0.85 * x[C.immune])) ind.load = 0.2;
        } else {
          ind.load += 0.3 * ind.load * (1 - x[C.immune]) - 0.12 * x[C.immune];
          if (ind.load <= 0) ind.load = 0; else if (ind.load > 2) ind.load = 2;
        }

        // Damage: senescence that grows with age, thermal stress, infection,
        // disasters; repair removes it (less well when starving).
        const senescence = 0.015 * (1 + ind.age / 20);
        ind.damage += senescence + 0.12 * p.thermal * (1 - x[C.tolerance]) + 0.08 * ind.load
          + p.hit * (1 - 0.6 * x[C.tolerance]);
        ind.damage -= 0.25 * x[C.repair] * (ind.energy > 0 ? 1 : 0.3);
        if (ind.damage < 0) ind.damage = 0;

        let hazard = o.extrinsicMortality + 0.3 * ind.damage * ind.damage;
        if (ind.energy < 0) { ind.energy = 0; hazard += 0.25; }
        if (ind.energy > ENERGY_MAX) ind.energy = ENERGY_MAX;
        ind.age++;
        if (rand() < 1 - Math.exp(-hazard)) {
          deaths++; totDeaths++; lifespanSum += ind.age; lifeAll += ind.age; deathCount++;
          continue;
        }

        // Reproduction (asexual: a single genetic lineage, as the game asks).
        if (ind.age >= MATURITY_AGE && ind.energy > OFFSPRING_COST + 0.3 && rand() < 0.7 * x[C.fecundity]) {
          ind.energy -= OFFSPRING_COST;
          const genome = o.mutation && rand() < o.mutationRate ? mutate(ind.genome, rand) : ind.genome;
          let patch = ind.patch;
          if (rand() < o.migrationRate) patch = Math.floor(rand() * o.patches);
          next.push(makeIndividual(genome, patch, OFFSPRING_ENERGY));
          births++; totBirths++;
        }
        if (rand() < o.migrationRate * 0.25) ind.patch = Math.floor(rand() * o.patches);
        next.push(ind);
      }
      for (const p of patches) if (p.famine > 0) p.famine--;

      if (next.length > o.maxPopulation) {
        capHit = true;
        // Random (state-independent) thinning; reported, never silent.
        while (next.length > o.maxPopulation) next.splice(Math.floor(rand() * next.length), 1);
      }
      pop = next;
      if (pop.length > peak) peak = pop.length;
      if (pop.length === 0 && extinctAt === null) extinctAt = t;
      if (t % o.sampleEvery === 0 || t === o.steps || pop.length === 0) sample(t);
    }

    const last = history[history.length - 1];
    return {
      options: { ...o, founderGenomes: o.founderGenomes ? o.founderGenomes.length : null },
      history,
      extinct: pop.length === 0,
      extinctAt,
      capHit,
      peakPopulation: peak,
      totalBirths: totBirths,
      totalDeaths: totDeaths,
      meanLifespanAll: totDeaths ? lifeAll / totDeaths : null,
      finalPopulation: pop.length,
      finalGenomes: pop.map((ind) => ind.genome),
      summary: last,
      elapsedMs: Date.now() - t0,
    };
  }

  function genomeKey(g) {
    let s = '';
    for (const x of g.genes) s += x.c + (x.on ? '' : '!') + (x.s * 20 | 0) + '.';
    s += '|';
    for (const e of g.edges) s += e.src + '>' + e.dst + ':' + (e.w * 4 | 0) + '.';
    return s;
  }

  // Common-garden assay: seed the same number of individuals from a genome
  // set into an environment with mutation off, and measure what they do.
  function assay(genomes, options = {}) {
    const n = options.founders ?? 100;
    const sampleSet = [];
    for (let i = 0; i < n; i++) sampleSet.push(genomes[i % genomes.length]);
    const r = simulate({ ...options, founders: n, mutation: false, founderGenomes: sampleSet });
    const pops = r.history.map((h) => h.population);
    return { extinct: r.extinct, extinctAt: r.extinctAt, finalPopulation: r.finalPopulation,
      meanPopulation: pops.reduce((a, b) => a + b, 0) / pops.length, meanLifespan: r.meanLifespanAll,
      totalBirths: r.totalBirths, capHit: r.capHit };
  }

  return { rng, CHANNELS, SIGNALS, DEFAULTS, ENVIRONMENTS, founderGenome, dosage, express, mutate,
    genotypeTraits, simulate, assay, genomeKey };
});
