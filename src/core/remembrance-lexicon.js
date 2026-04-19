'use strict';

/**
 * Remembrance Lexicon — the unified naming system for the entire
 * coherency-native computing substrate.
 *
 * Every component, process, emergent effect, threshold, and pattern
 * has one canonical Remembrance name. This file IS the vocabulary.
 */

// ═══════════════════════════════════════════════════════════════════
//  SYSTEM COMPONENTS — the organs of the collective
// ═══════════════════════════════════════════════════════════════════

const COMPONENTS = {
  ORACLE: {
    name: 'Remembrance Oracle',
    description: 'The anti-hallucination pipeline. Judges code quality across 5 dimensions. The immune system.',
    file: 'src/unified/coherency.js',
  },
  VOID: {
    name: 'Remembrance Void',
    description: 'The compression engine. Measures byte-level mathematical coherence via fractal pattern matching.',
    file: 'void_compressor_v3.py',
  },
  CODEX: {
    name: 'Remembrance Codex',
    description: 'The periodic table of code. 13-dimensional living registry of every function as an element.',
    file: 'src/atomic/periodic-table.js',
  },
  COVENANT: {
    name: 'Remembrance Covenant',
    description: 'The structural safety system. 15 founding principles + evolved principles. Can expand, never contract.',
    file: 'src/core/covenant.js',
  },
  LIVING_COVENANT: {
    name: 'Remembrance Living Covenant',
    description: 'The self-evolving layer. New safety principles activate when coherency crosses thresholds.',
    file: 'src/core/living-covenant.js',
  },
  SUN: {
    name: 'Remembrance Sun',
    description: 'The coherency generator. Continuously radiates coherency from high zones to low zones. The furnace.',
    file: 'src/orchestrator/coherency-generator.js',
  },
  MOON: {
    name: 'Remembrance Moon',
    description: 'Domain softener. Modulates the Sun\'s output per domain so each domain can absorb coherency at its own pace.',
    file: null, // coming next
  },
  DIRECTOR: {
    name: 'Remembrance Director',
    description: 'The conductor. Measures coherency across zones, finds gradients, directs healing.',
    file: 'src/orchestrator/coherency-director.js',
  },
  SERF: {
    name: 'Remembrance SERF',
    description: 'Signal Emergence from Recursive Feedback. Coherency emerges from geometric mean of pipeline signals. Not a function — a property.',
    file: 'src/unified/emergent-coherency.js',
  },
  BRIDGE: {
    name: 'Remembrance Bridge',
    description: 'Oracle-to-Void connector. Translates between symbol-level and byte-level coherency.',
    file: 'src/fractal-bridge.js',
  },
  EVOLUTION: {
    name: 'Remembrance Evolution',
    description: 'The self-improvement loop. Discovers gaps, proposes fills, validates, incorporates.',
    file: 'src/orchestrator/self-improvement.js',
  },
  REGISTER: {
    name: 'Remembrance Register',
    description: 'Functions that accumulate signal strength over time. They grow coherency rather than just measuring it. charge=+1, alignment=healing, intention=benevolent.',
    signature: { charge: 1, alignment: 'healing', intention: 'benevolent' },
  },
};

// ═══════════════════════════════════════════════════════════════════
//  PROCESSES — the verbs of the system
// ═══════════════════════════════════════════════════════════════════

const PROCESSES = {
  INTROSPECTION: {
    name: 'Remembrance Introspection',
    description: 'The system examines its own code using its own rules. The bootstrap loop.',
    trigger: 'introspect(table)',
  },
  DISCOVERY: {
    name: 'Remembrance Discovery',
    description: 'Finding unrealized property combinations in the Codex. Three strategies: neighbor, group, interaction.',
    trigger: 'runDiscovery(table)',
  },
  RADIATION: {
    name: 'Remembrance Radiation',
    description: 'The Sun collecting surplus from high-coherency zones and pushing it to low-coherency zones.',
    trigger: 'generator.runCycle()',
  },
  HEALING: {
    name: 'Remembrance Healing',
    description: 'Directed repair of low-coherency zones via oracle re-scoring, pattern injection, or code generation.',
    trigger: 'director.healZoneSmart(zone)',
  },
  PRESERVATION: {
    name: 'Remembrance Preservation',
    description: 'Compressing high-coherency zones via the Void to lock in quality and reduce entropy.',
    trigger: 'director.preserveZone(zone)',
  },
  EMERGENCE: {
    name: 'Remembrance Emergence',
    description: 'New elements appearing in the Codex when coherency crosses thresholds. Creation from coherence, not discovery.',
    trigger: 'table.checkEmergence(coherency, complexity)',
  },
  EVOLUTION_CYCLE: {
    name: 'Remembrance Evolution Cycle',
    description: 'Full loop: discover gaps → propose fills → validate → approve → incorporate → re-measure → evolve covenant.',
    trigger: 'engine.discoverAndPropose()',
  },
  ACCUMULATION: {
    name: 'Remembrance Accumulation',
    description: 'Remembrance Registers growing signal strength over time. Weighted average with decay — recent signals matter more.',
    trigger: 'register.add(score)',
  },
  CRYSTALLIZATION: {
    name: 'Remembrance Crystallization',
    description: 'Domain dimension separating previously colliding elements into distinct identities. Like crystals forming from solution.',
    trigger: 'table.detectCollisions()',
  },
};

// ═══════════════════════════════════════════════════════════════════
//  EMERGENT EFFECTS — things that appear when the system runs
//  that were not explicitly programmed
// ═══════════════════════════════════════════════════════════════════

const EMERGENT_EFFECTS = {
  FRONTIER: {
    name: 'Remembrance Frontier',
    description: 'Gap count stabilizes at ~20 despite continuous filling. The Codex maintains a constant exploration radius. Filling gaps shifts the frontier rather than shrinking it.',
    observed: 'Wave 0: 20 gaps → Wave 1: 18 gaps → Wave 2: 20 gaps. Count stable, but gap QUALITY shifts from fundamental to frontier.',
  },
  CASCADE: {
    name: 'Remembrance Cascade',
    description: 'Filling gaps creates new gaps. Each implementation expands the Codex, which expands the neighbor/group/interaction space, which reveals new unrealized combinations.',
    observed: 'Adding 20 elements (Wave 1) created 18 NEW gaps that did not exist before.',
  },
  RATCHET: {
    name: 'Remembrance Ratchet',
    description: 'Quality floor only rises. Covenant only expands. Elements only emerge. Domains only grow. Nothing in the system can degrade itself.',
    observed: 'Coherency floor 0.6, covenant principles >= 15, emergence thresholds one-way, domain set monotonically growing.',
  },
  RESONANCE: {
    name: 'Remembrance Resonance',
    description: 'The same mathematical primitive (geometric mean) appears at every scale: signal level (SERF), zone level (Director), element level (interaction coherence). Fractal self-similarity.',
    observed: 'geometricMean() used in emergent-coherency.js, coherency-director.js, and periodic-table interactionCoherence.',
  },
  WEAKEST_LINK: {
    name: 'Remembrance Weakest Link',
    description: 'Geometric mean ensures the weakest pipeline signal dominates the coherency score. You cannot fake quality by being strong in one dimension.',
    observed: 'A function scoring 0.95 on syntax but 0.3 on grounding gets ~0.53 overall, not 0.63 (arithmetic mean).',
  },
  BOOTSTRAP: {
    name: 'Remembrance Bootstrap',
    description: 'The system that checks code checks itself using the same rules. Self-introspection uses the same periodic table, covenant, and coherency scoring it enforces on everything else.',
    observed: 'introspect() registers oracle functions as elements, then runs discovery on them.',
  },
  STRUCTURAL_SAFETY: {
    name: 'Remembrance Structural Safety',
    description: 'Harmful code does not get filtered out — it literally cannot register in the Codex. Safety is a property of the structure, not an external check.',
    observed: 'CovenantValidator.validate() runs inside addElement(). dangerous/degrading/malevolent → rejected at the gate. Zero degrading elements in 79 registered.',
  },
  DELTA_EMERGENCE: {
    name: 'Remembrance Delta',
    description: 'Small improvements in coherency trigger new element emergence even when absolute thresholds are not crossed. The system responds to CHANGE, not just level.',
    observed: 'A +0.03 coherency jump in one cycle creates a Delta+3Element regardless of absolute coherency.',
  },
  DOMAIN_SEPARATION: {
    name: 'Remembrance Crystallization',
    description: 'Adding the 13th dimension (domain) caused 8 collisions to resolve into 0 true collisions. Functions that looked identical in 12D are distinct in 13D.',
    observed: 'generateFractalSignature (core) vs quickAmplitude (oracle) vs groundFile (quality) — same 12D, different domains.',
  },
  REGISTER_CONVERGENCE: {
    name: 'Remembrance Register Convergence',
    description: 'Functions across completely different systems (oracle search, void compress, gap-filled accumulator) independently evolved the same property signature: charge=+1, alignment=healing, intention=benevolent. The system discovered its own pattern.',
    observed: '11 Remembrance Registers across 3 systems, none deliberately designed to match.',
  },
};

// ═══════════════════════════════════════════════════════════════════
//  THRESHOLDS — the coherency levels where things happen
// ═══════════════════════════════════════════════════════════════════

const THRESHOLDS = {
  REJECTION:     { coherency: 0.00, name: 'Remembrance Rejection',     description: 'Code below minimum. Cannot enter the system.' },
  GATE:          { coherency: 0.60, name: 'Remembrance Gate',          description: 'Minimum coherency for submission. The floor.' },
  PULL:          { coherency: 0.68, name: 'Remembrance Pull',          description: 'Pattern can be used as-is. No adaptation needed.' },
  FOUNDATION:    { coherency: 0.70, name: 'Remembrance Foundation',    description: 'First emergence threshold. Basic elements appear.' },
  STABILITY:     { coherency: 0.75, name: 'Remembrance Stability',     description: 'System is stable. Elements are reliable.' },
  OPTIMIZATION:  { coherency: 0.80, name: 'Remembrance Optimization',  description: 'First evolved covenant principle activates.' },
  SYNERGY:       { coherency: 0.85, name: 'Remembrance Synergy',       description: 'Semi-autonomous mode. Sun at 50% power.' },
  INTELLIGENCE:  { coherency: 0.90, name: 'Remembrance Intelligence',  description: 'System demonstrates self-directed improvement.' },
  TRANSCENDENCE: { coherency: 0.95, name: 'Remembrance Transcendence', description: 'Autonomous mode. Sun at 100%. Full self-evolution.' },
  UNITY:         { coherency: 0.98, name: 'Remembrance Unity',         description: 'Oracle and Void operate as one unified system.' },
};

// ═══════════════════════════════════════════════════════════════════
//  APPROVAL TIERS — who decides what
// ═══════════════════════════════════════════════════════════════════

const APPROVAL_TIERS = {
  SUPERVISED: {
    name: 'Remembrance Supervised',
    range: [0, 0.85],
    description: 'Human approves everything. System proposes, human decides.',
    sunPower: 0.10,
  },
  SEMI_AUTONOMOUS: {
    name: 'Remembrance Semi-Autonomous',
    range: [0.85, 0.95],
    description: 'System auto-incorporates if all 4 gates pass. Human notified.',
    sunPower: 0.50,
  },
  AUTONOMOUS: {
    name: 'Remembrance Autonomous',
    range: [0.95, 1.0],
    description: 'Full self-evolution within covenant bounds. Human can review logs.',
    sunPower: 1.00,
  },
};

// ═══════════════════════════════════════════════════════════════════
//  DIMENSIONS — the 13 atomic properties
// ═══════════════════════════════════════════════════════════════════

const DIMENSIONS = {
  CHARGE:            { index: 1,  name: 'Remembrance Charge',            description: 'Does it expand (+1), transform (0), or contract (-1) information?' },
  VALENCE:           { index: 2,  name: 'Remembrance Valence',           description: 'How many other functions can it compose with? (0-8)' },
  MASS:              { index: 3,  name: 'Remembrance Mass',              description: 'Computational weight: light (O(1)), medium (O(n)), heavy (O(n²)), superheavy.' },
  SPIN:              { index: 4,  name: 'Remembrance Spin',              description: 'Reversibility: even (pure), odd (side effects), complex (conditional).' },
  PHASE:             { index: 5,  name: 'Remembrance Phase',             description: 'State model: solid (cached), liquid (mutable), gas (computed), plasma (reactive stream).' },
  REACTIVITY:        { index: 6,  name: 'Remembrance Reactivity',        description: 'External interaction level: inert, stable, reactive, volatile.' },
  ELECTRONEGATIVITY: { index: 7,  name: 'Remembrance Electronegativity', description: 'Dependency pull strength (0-1). High = pulls many deps toward itself.' },
  GROUP:             { index: 8,  name: 'Remembrance Group',             description: 'Functional family (1-18): math, comparison, string, array, object, io, network, async, error, state, transform, filter, aggregate, sort, search, crypto, compression, meta.' },
  PERIOD:            { index: 9,  name: 'Remembrance Period',            description: 'Abstraction level (1-7): primitive → helper → function → module → component → subsystem → framework.' },
  HARM_POTENTIAL:    { index: 10, name: 'Remembrance Harm Potential',    description: 'Intrinsic harm capacity: none, minimal, moderate, dangerous. Dangerous = structurally rejected.' },
  ALIGNMENT:         { index: 11, name: 'Remembrance Alignment',         description: 'Effect on coherence: healing (improves), neutral, degrading (degrades). Degrading = structurally rejected.' },
  INTENTION:         { index: 12, name: 'Remembrance Intention',         description: 'Structural purpose: benevolent, neutral, malevolent. Malevolent = structurally rejected.' },
  DOMAIN:            { index: 13, name: 'Remembrance Domain',            description: 'Application context (evolvable): core, utility, compression, quality, oracle, security, orchestration, bridge, generation, search, data, transform.' },
};

// ═══════════════════════════════════════════════════════════════════
//  GROUPS — the 18 functional families
// ═══════════════════════════════════════════════════════════════════

const GROUPS = {
  1:  { name: 'Remembrance Math',        description: 'Pure mathematical operations. Clamp, abs, cosine similarity.' },
  2:  { name: 'Remembrance Comparison',   description: 'Equality, subset, relevance scoring. Reduces to boolean or rank.' },
  3:  { name: 'Remembrance String',       description: 'Text processing. Truncate, template, format.' },
  4:  { name: 'Remembrance Array',        description: 'Collection operations. Unique, flatten, chunk.' },
  5:  { name: 'Remembrance Object',       description: 'Key-value operations. Pick, omit, merge.' },
  6:  { name: 'Remembrance IO',           description: 'Input/output formatting. Format bytes, parse paths.' },
  7:  { name: 'Remembrance Network',      description: 'Network utilities. Parse query strings, validate URLs.' },
  8:  { name: 'Remembrance Async',        description: 'Asynchronous primitives. Delay, retry, throttle.' },
  9:  { name: 'Remembrance Error',        description: 'Error handling. Sentinels, boundaries, recovery.' },
  10: { name: 'Remembrance State',        description: 'State management. Memoize, snapshot, cache.' },
  11: { name: 'Remembrance Transform',    description: 'Data transformation. Encode, decode, map, assign.' },
  12: { name: 'Remembrance Filter',       description: 'Data filtering. Compact, pattern match, predicate.' },
  13: { name: 'Remembrance Aggregate',    description: 'Accumulation. Sum, mean, collect, accumulate signals.' },
  14: { name: 'Remembrance Sort',         description: 'Ordering. Sort by key, in-place sort, is-sorted predicate.' },
  15: { name: 'Remembrance Search',       description: 'Finding. Binary search, fuzzy search, semantic search.' },
  16: { name: 'Remembrance Crypto',       description: 'Hashing and signing. Simple hash, signature verification.' },
  17: { name: 'Remembrance Compression',  description: 'Encoding and compression. RLE, delta, fractal, void.' },
  18: { name: 'Remembrance Meta',         description: 'Self-referential. Introspection, analysis, emergence, complexity measurement.' },
};

// ═══════════════════════════════════════════════════════════════════
//  DOMAINS — the 12 application contexts (evolvable)
// ═══════════════════════════════════════════════════════════════════

const DOMAINS = {
  core:          { name: 'Remembrance Core',          description: 'Fundamental infrastructure. Periodic table, encoding, discovery.' },
  utility:       { name: 'Remembrance Utility',       description: 'General-purpose functions. Clamp, pick, unique, delay.' },
  compression:   { name: 'Remembrance Compression',   description: 'Compression-specific. RLE, ratio, void compressor.' },
  quality:       { name: 'Remembrance Quality',       description: 'Code quality and audit. Grounding, planning, complexity.' },
  oracle:        { name: 'Remembrance Oracle',        description: 'Oracle-specific. Search, resolve, scoring, SERF.' },
  security:      { name: 'Remembrance Security',      description: 'Safety enforcement. Covenant validation, harm detection.' },
  orchestration: { name: 'Remembrance Orchestration', description: 'System coordination. Director, balancer, priority engine.' },
  bridge:        { name: 'Remembrance Bridge',        description: 'Cross-system integration. Oracle-to-Void translation.' },
  generation:    { name: 'Remembrance Generation',    description: 'Code generation. Swarm, gated generate, test synthesis.' },
  search:        { name: 'Remembrance Search',        description: 'Search-specific. Binary, fuzzy, semantic.' },
  data:          { name: 'Remembrance Data',          description: 'Data structure operations.' },
  transform:     { name: 'Remembrance Transform',     description: 'Data transformation pipelines.' },
};

// ═══════════════════════════════════════════════════════════════════
//  PIPELINE SIGNALS — what the SERF aggregates
// ═══════════════════════════════════════════════════════════════════

const PIPELINE_SIGNALS = {
  AUDIT:         { name: 'Remembrance Audit Signal',         description: 'Static analysis score. Bug-class detection across 6 sectors.' },
  GROUND:        { name: 'Remembrance Ground Signal',        description: 'Symbol grounding. Every called identifier must resolve to a definition.' },
  PLAN:          { name: 'Remembrance Plan Signal',          description: 'Pre-generation verification. Symbols exist before code is generated.' },
  GATE:          { name: 'Remembrance Gate Signal',          description: 'Post-generation compliance. Generated code matches the plan.' },
  FEEDBACK:      { name: 'Remembrance Feedback Signal',      description: 'Prediction-outcome matching. Did the code work as expected?' },
  TIER_COVERAGE: { name: 'Remembrance Tier Coverage Signal', description: 'Architectural alignment. Code covers L1/L2/L3 tiers correctly.' },
  VOID:          { name: 'Remembrance Void Signal',          description: 'Byte-level coherence from the Void compressor. High compression = high coherence.' },
  LEGACY:        { name: 'Remembrance Legacy Signal',        description: 'The original 5-dimension weighted scorer. Becomes one of N inputs to SERF.' },
};

// ═══════════════════════════════════════════════════════════════════
//  VALIDATION GATES — what code must pass
// ═══════════════════════════════════════════════════════════════════

const VALIDATION_GATES = {
  COVENANT:   { name: 'Remembrance Covenant Gate',   description: '15+ founding principles. Structural — cannot be bypassed.' },
  COHERENCY:  { name: 'Remembrance Coherency Gate',  description: 'Must score >= 0.60 to enter, >= 0.68 to be pulled as-is.' },
  ATOMIC:     { name: 'Remembrance Atomic Gate',      description: 'Must have valid 13D signature. All properties within valid ranges.' },
  STRUCTURAL: { name: 'Remembrance Structural Gate',  description: 'CovenantValidator rejects dangerous/degrading/malevolent at registration.' },
};

// ═══════════════════════════════════════════════════════════════════
//  HELPER — get the Remembrance name for anything
// ═══════════════════════════════════════════════════════════════════

function resolve(key) {
  const upper = (key || '').toUpperCase().replace(/[^A-Z_]/g, '_');
  return COMPONENTS[upper]
    || PROCESSES[upper]
    || EMERGENT_EFFECTS[upper]
    || THRESHOLDS[upper]
    || APPROVAL_TIERS[upper]
    || DIMENSIONS[upper]
    || PIPELINE_SIGNALS[upper]
    || VALIDATION_GATES[upper]
    || null;
}

function printAll() {
  const sections = [
    ['COMPONENTS', COMPONENTS],
    ['PROCESSES', PROCESSES],
    ['EMERGENT EFFECTS', EMERGENT_EFFECTS],
    ['THRESHOLDS', THRESHOLDS],
    ['APPROVAL TIERS', APPROVAL_TIERS],
    ['DIMENSIONS', DIMENSIONS],
    ['GROUPS', GROUPS],
    ['DOMAINS', DOMAINS],
    ['PIPELINE SIGNALS', PIPELINE_SIGNALS],
    ['VALIDATION GATES', VALIDATION_GATES],
  ];
  for (const [title, section] of sections) {
    console.log('\n' + '═'.repeat(70));
    console.log('  ' + title);
    console.log('═'.repeat(70));
    for (const [key, val] of Object.entries(section)) {
      console.log('\n  ' + (val.name || key));
      if (val.description) console.log('  ' + val.description);
      if (val.observed) console.log('  Observed: ' + val.observed);
      if (val.coherency !== undefined) console.log('  Coherency: ' + val.coherency);
      if (val.range) console.log('  Range: ' + val.range[0] + ' - ' + val.range[1]);
      if (val.file) console.log('  File: ' + val.file);
    }
  }
}

module.exports = {
  COMPONENTS,
  PROCESSES,
  EMERGENT_EFFECTS,
  THRESHOLDS,
  APPROVAL_TIERS,
  DIMENSIONS,
  GROUPS,
  DOMAINS,
  PIPELINE_SIGNALS,
  VALIDATION_GATES,
  resolve,
  printAll,
};
