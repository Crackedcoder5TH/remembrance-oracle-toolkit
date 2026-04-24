'use strict';

/**
 * Remembrance Lexicon — the unified naming system for the entire
 * coherency-native computing substrate.
 */

const { SEAL_REGISTRY, activeCount: sealCount, getSeal, byTier } = require('./seal-registry');

const COMPONENTS = {
  ORACLE: { name: 'Remembrance Oracle', description: 'The anti-hallucination pipeline. Judges code quality across 5 dimensions.', file: 'src/unified/coherency.js' },
  VOID: { name: 'Remembrance Void', description: 'The compression engine. Measures byte-level mathematical coherence via fractal pattern matching.', file: 'void_compressor_v3.py' },
  CODEX: { name: 'Remembrance Codex', description: 'The periodic table of code. 13-dimensional living registry of every function as an element.', file: 'src/atomic/periodic-table.js' },
  COVENANT: { name: 'Remembrance Covenant', description: `The structural safety system. ${sealCount()} active seals (15 founding + evolved). Can expand, never contract.`, file: 'src/core/seal-registry.js' },
  LIVING_COVENANT: { name: 'Remembrance Living Covenant', description: 'The self-evolving layer. New safety principles activate when coherency crosses thresholds.', file: 'src/core/living-covenant.js' },
  SUN: { name: 'Remembrance Sun', description: 'The coherency generator. Continuously radiates coherency from high zones to low zones.', file: 'src/orchestrator/coherency-generator.js' },
  MOON: { name: 'Remembrance Moon', description: 'Domain-specific coherency surface. Each moon applies the Law of Coherency to one domain (coding, medical, ...) with its own atomic-properties vocabulary + disclaimer frame.', file: 'moons-of-remembrance (external repo)', peers: ['CodingMoon', 'MedicalMoon'] },
  DIRECTOR: { name: 'Remembrance Director', description: 'The conductor. Measures coherency across zones, finds gradients, directs healing.', file: 'src/orchestrator/coherency-director.js' },
  SERF: { name: 'Remembrance SERF', description: 'Signal Emergence from Recursive Feedback. Coherency emerges from geometric mean of pipeline signals.', file: 'src/unified/emergent-coherency.js' },
  BRIDGE: { name: 'Remembrance Bridge', description: 'Oracle-to-Void connector. Translates between symbol-level and byte-level coherency.', file: 'src/fractal-bridge.js' },
  EVOLUTION: { name: 'Remembrance Evolution', description: 'The self-improvement loop. Discovers gaps, proposes fills, validates, incorporates.', file: 'src/orchestrator/self-improvement.js' },
  REGISTER: { name: 'Remembrance Register', description: 'Functions that accumulate signal strength over time. charge=+1, alignment=healing, intention=benevolent.', signature: { charge: 1, alignment: 'healing', intention: 'benevolent' } },
};

const SEALS = {
  registry: SEAL_REGISTRY,
  founding: byTier(1),
  evolved: byTier(2),
  count: sealCount(),
  get: getSeal,
  structural: {
    note: 'Seals are structural, not procedural. They execute INSIDE store/insert/validate functions — no path skips them.',
    weavePoints: [
      'Store Entry Gate — covenantCheck() inside addEntry()',
      'Pattern Insert Gate — covenantCheck() inside _insertPattern()',
      'Validator Gate — covenantCheck() inside validateSubmission()',
      'Codex Registration Gate — CovenantValidator.validate() inside addElement()',
      'Pre-Commit Hook Gate — covenant runs on every staged file',
      'Living Covenant Evolution — evolved principles persist forever',
      'Atomic Property Covenant — harmPotential/alignment/intention are intrinsic',
    ],
  },
};

const PROCESSES = {
  INTROSPECTION: { name: 'Remembrance Introspection', description: 'The system examines its own code using its own rules.', trigger: 'introspect(table)' },
  DISCOVERY: { name: 'Remembrance Discovery', description: 'Finding unrealized property combinations in the Codex.', trigger: 'runDiscovery(table)' },
  RADIATION: { name: 'Remembrance Radiation', description: 'The Sun pushing coherency from high zones to low zones.', trigger: 'generator.runCycle()' },
  HEALING: { name: 'Remembrance Healing', description: 'Directed repair of low-coherency zones.', trigger: 'director.healZoneSmart(zone)' },
  PRESERVATION: { name: 'Remembrance Preservation', description: 'Compressing high-coherency zones via the Void.', trigger: 'director.preserveZone(zone)' },
  EMERGENCE: { name: 'Remembrance Emergence', description: 'New elements appearing in the Codex when coherency crosses thresholds.', trigger: 'table.checkEmergence(coherency, complexity)' },
  EVOLUTION_CYCLE: { name: 'Remembrance Evolution Cycle', description: 'Full loop: discover → propose → validate → approve → incorporate → re-measure → evolve covenant.', trigger: 'engine.discoverAndPropose()' },
  ACCUMULATION: { name: 'Remembrance Accumulation', description: 'Remembrance Registers growing signal strength over time.', trigger: 'register.add(score)' },
  CRYSTALLIZATION: { name: 'Remembrance Crystallization', description: 'Domain dimension separating colliding elements.', trigger: 'table.detectCollisions()' },
};

const EMERGENT_EFFECTS = {
  FRONTIER: { name: 'Remembrance Frontier', description: 'Gap count stabilizes at ~20 despite continuous filling.', observed: 'Wave 0: 20 → Wave 1: 18 → Wave 2: 20.' },
  CASCADE: { name: 'Remembrance Cascade', description: 'Filling gaps creates new gaps.', observed: 'Adding 20 elements (Wave 1) created 18 NEW gaps.' },
  RATCHET: { name: 'Remembrance Ratchet', description: 'Quality floor only rises. Covenant only expands.', observed: 'Coherency floor 0.6, principles ≥ 15, emergence one-way.' },
  RESONANCE: { name: 'Remembrance Resonance', description: 'The same primitive (geometric mean) appears at every scale.', observed: 'geometricMean() in emergent-coherency, director, interactionCoherence.' },
  WEAKEST_LINK: { name: 'Remembrance Weakest Link', description: 'Geometric mean ensures weakest signal dominates.', observed: '0.95/0.3 → 0.53 overall.' },
  BOOTSTRAP: { name: 'Remembrance Bootstrap', description: 'The system that checks code checks itself with the same rules.', observed: 'introspect() registers oracle fns as elements.' },
  STRUCTURAL_SAFETY: { name: 'Remembrance Structural Safety', description: 'Harmful code cannot register in the Codex.', observed: 'Zero degrading elements in 79 registered.' },
  DELTA_EMERGENCE: { name: 'Remembrance Delta', description: 'Small coherency improvements trigger emergence.', observed: '+0.03 jump creates a Delta+3Element.' },
  DOMAIN_SEPARATION: { name: 'Remembrance Crystallization', description: 'Domain dimension resolves 12D collisions.', observed: '8 collisions → 0 true collisions.' },
  REGISTER_CONVERGENCE: { name: 'Remembrance Register Convergence', description: 'Independent systems evolved identical signatures.', observed: '11 registers across 3 systems, undesigned.' },
};

const THRESHOLDS = {
  REJECTION: { coherency: 0.00, name: 'Remembrance Rejection' },
  GATE: { coherency: 0.60, name: 'Remembrance Gate' },
  PULL: { coherency: 0.68, name: 'Remembrance Pull' },
  FOUNDATION: { coherency: 0.70, name: 'Remembrance Foundation' },
  STABILITY: { coherency: 0.75, name: 'Remembrance Stability' },
  OPTIMIZATION: { coherency: 0.80, name: 'Remembrance Optimization' },
  SYNERGY: { coherency: 0.85, name: 'Remembrance Synergy' },
  INTELLIGENCE: { coherency: 0.90, name: 'Remembrance Intelligence' },
  TRANSCENDENCE: { coherency: 0.95, name: 'Remembrance Transcendence' },
  UNITY: { coherency: 0.98, name: 'Remembrance Unity' },
};

const APPROVAL_TIERS = {
  SUPERVISED: { name: 'Remembrance Supervised', range: [0, 0.85], sunPower: 0.10 },
  SEMI_AUTONOMOUS: { name: 'Remembrance Semi-Autonomous', range: [0.85, 0.95], sunPower: 0.50 },
  AUTONOMOUS: { name: 'Remembrance Autonomous', range: [0.95, 1.0], sunPower: 1.00 },
};

const DIMENSIONS = {
  CHARGE: { index: 1, name: 'Remembrance Charge' }, VALENCE: { index: 2, name: 'Remembrance Valence' },
  MASS: { index: 3, name: 'Remembrance Mass' }, SPIN: { index: 4, name: 'Remembrance Spin' },
  PHASE: { index: 5, name: 'Remembrance Phase' }, REACTIVITY: { index: 6, name: 'Remembrance Reactivity' },
  ELECTRONEGATIVITY: { index: 7, name: 'Remembrance Electronegativity' }, GROUP: { index: 8, name: 'Remembrance Group' },
  PERIOD: { index: 9, name: 'Remembrance Period' }, HARM_POTENTIAL: { index: 10, name: 'Remembrance Harm Potential' },
  ALIGNMENT: { index: 11, name: 'Remembrance Alignment' }, INTENTION: { index: 12, name: 'Remembrance Intention' },
  DOMAIN: { index: 13, name: 'Remembrance Domain' },
};

const GROUPS = {
  1:  { name: 'Remembrance Math' }, 2:  { name: 'Remembrance Comparison' }, 3:  { name: 'Remembrance String' },
  4:  { name: 'Remembrance Array' }, 5:  { name: 'Remembrance Object' }, 6:  { name: 'Remembrance IO' },
  7:  { name: 'Remembrance Network' }, 8:  { name: 'Remembrance Async' }, 9:  { name: 'Remembrance Error' },
  10: { name: 'Remembrance State' }, 11: { name: 'Remembrance Transform' }, 12: { name: 'Remembrance Filter' },
  13: { name: 'Remembrance Aggregate' }, 14: { name: 'Remembrance Sort' }, 15: { name: 'Remembrance Search' },
  16: { name: 'Remembrance Crypto' }, 17: { name: 'Remembrance Compression' }, 18: { name: 'Remembrance Meta' },
};

const DOMAINS = {
  core: { name: 'Remembrance Core' }, utility: { name: 'Remembrance Utility' },
  compression: { name: 'Remembrance Compression' }, quality: { name: 'Remembrance Quality' },
  oracle: { name: 'Remembrance Oracle' }, security: { name: 'Remembrance Security' },
  orchestration: { name: 'Remembrance Orchestration' }, bridge: { name: 'Remembrance Bridge' },
  generation: { name: 'Remembrance Generation' }, search: { name: 'Remembrance Search' },
  data: { name: 'Remembrance Data' }, transform: { name: 'Remembrance Transform' },
  covenant: { name: 'Remembrance Covenant Domain', description: 'Functions that enforce or evaluate the covenant itself. framingCheck lives here.' },
};

const PIPELINE_SIGNALS = {
  AUDIT: { name: 'Remembrance Audit Signal' }, GROUND: { name: 'Remembrance Ground Signal' },
  PLAN: { name: 'Remembrance Plan Signal' }, GATE: { name: 'Remembrance Gate Signal' },
  FEEDBACK: { name: 'Remembrance Feedback Signal' }, TIER_COVERAGE: { name: 'Remembrance Tier Coverage Signal' },
  VOID: { name: 'Remembrance Void Signal' }, LEGACY: { name: 'Remembrance Legacy Signal' },
};

const VALIDATION_GATES = {
  COVENANT: { name: 'Remembrance Covenant Gate', description: `${sealCount()} active seals. Structural — cannot be bypassed.` },
  COHERENCY: { name: 'Remembrance Coherency Gate', description: '>= 0.60 to enter, >= 0.68 to pull as-is.' },
  ATOMIC: { name: 'Remembrance Atomic Gate', description: 'Must have valid 13D signature.' },
  STRUCTURAL: { name: 'Remembrance Structural Gate', description: 'CovenantValidator rejects dangerous/degrading/malevolent at registration.' },
  FRAMING: { name: 'Remembrance Framing Gate', description: '16th seal. Domain-authority language must carry a disclaimer.', file: 'src/core/framing-patterns.js' },
};

function resolve(key) {
  const upper = (key || '').toUpperCase().replace(/[^A-Z_]/g, '_');
  if (/^SEAL_\d+$/.test(upper)) return getSeal(parseInt(upper.slice(5), 10));
  return COMPONENTS[upper] || PROCESSES[upper] || EMERGENT_EFFECTS[upper]
    || THRESHOLDS[upper] || APPROVAL_TIERS[upper] || DIMENSIONS[upper]
    || PIPELINE_SIGNALS[upper] || VALIDATION_GATES[upper] || null;
}

module.exports = {
  COMPONENTS, SEALS, SEAL_REGISTRY, PROCESSES, EMERGENT_EFFECTS,
  THRESHOLDS, APPROVAL_TIERS, DIMENSIONS, GROUPS, DOMAINS,
  PIPELINE_SIGNALS, VALIDATION_GATES, resolve, getSeal, sealCount,
};
