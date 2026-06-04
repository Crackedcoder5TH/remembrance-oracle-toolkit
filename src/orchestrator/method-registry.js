'use strict';

/**
 * Method Registry — the orchestrator's self-introspection.
 *
 * Every method the orchestrator can use to act on the substrate is
 * cataloged here with its triggers, its effect, its cost, and its
 * reversibility. The registry exists so the orchestrator can answer
 * three questions about itself:
 *
 *   listMethods()                — what can I do?
 *   describeMethod(name)         — what does this one do?
 *   methodsFor(condition)        — which methods address this condition?
 *   selectResponseFor(state)     — given the current field state, what
 *                                  is the appropriate response set?
 *
 * Without this layer, every controller has to hardcode which method to
 * call for which condition. With it, the orchestrator can look up the
 * matching tool by condition and reason about its own behaviour. The
 * registry is data, not code — so adding a new reflex or tool is one
 * entry rather than a controller rewrite.
 *
 * Trigger language (intentionally simple, machine-readable):
 *   cascade > N         | cascade < N
 *   entropy > N         | entropy < N
 *   coherence > N       | coherence < N
 *   adversarialRatio > N
 *   cognitionVariance > N
 *   direction == X      (healing | degrading | saturating | relaxing | steady | mixed)
 *   any                 (always applicable)
 *
 * A method matches a state when ALL its triggers evaluate true. Multiple
 * methods can match — selectResponseFor returns the matching set.
 */

const METHODS = {
  'relax-if-hot': {
    module: 'orchestrator/entropy-relaxer',
    fn: 'relaxIfHot',
    effect: 'lowers globalEntropy and cascadeFactor by injecting high-coherence resonance bridges',
    triggers: ['cascade > 4', 'entropy > 10'],
    triggerMode: 'any',   // any trigger fires it
    reversibility: 'natural-decay (cascade relaxes on its own over time)',
    cost: 'low',
    sideEffects: ['contributes one observation under orchestrator:entropy-relax source'],
    cooldownMs: 30_000,
  },

  'tighten-if-adversarial': {
    module: 'orchestrator/reflex-engine',
    fn: 'tightenIfAdversarial',
    effect: 'sets variance-gate displacement threshold from 0.15 (default) to 0.10 (tightened) so synthetic-shaped contributions are rejected harder',
    triggers: ['adversarialRatio > 0.15'],
    triggerMode: 'all',
    reversibility: 'reversible — restoreIfQuietened restores default when adversarial ratio drops below 0.05',
    cost: 'low',
    sideEffects: ['mutates _displacementThreshold in field-coupling'],
    cooldownMs: 60_000,
  },

  'restore-if-quietened': {
    module: 'orchestrator/reflex-engine',
    fn: 'restoreIfQuietened',
    effect: 'sets variance-gate back to default (0.15) after adversarial pressure subsides',
    triggers: ['adversarialRatio < 0.05'],
    triggerMode: 'all',
    reversibility: 'symmetric pair with tighten-if-adversarial',
    cost: 'low',
    sideEffects: ['mutates _displacementThreshold in field-coupling'],
    cooldownMs: 60_000,
  },

  'warn-if-cognition-drifting': {
    module: 'orchestrator/reflex-engine',
    fn: 'warnIfCognitionDrifting',
    effect: 'emits a focus-warning verdict when the working agent\'s cognition trajectory variance rises above 0.05',
    triggers: ['cognitionVariance > 0.05'],
    triggerMode: 'all',
    reversibility: 'no field mutation — verdict only',
    cost: 'none',
    sideEffects: [],
    cooldownMs: 30_000,
  },

  'relax-if-degrading': {
    module: 'orchestrator/reflex-engine',
    fn: 'relaxIfDegrading',
    effect: 'when field direction reports degrading, delegate to relaxIfHot to inject coherence',
    triggers: ['direction == degrading'],
    triggerMode: 'all',
    reversibility: 'natural-decay (same as relaxIfHot)',
    cost: 'low',
    sideEffects: ['contributes one observation under orchestrator:entropy-relax source'],
    cooldownMs: 60_000,
  },

  'fire-reflexes': {
    module: 'orchestrator/reflex-engine',
    fn: 'fireReflexes',
    effect: 'runs every reflex once and returns structured verdicts — the canonical "tick" of the substrate as actor',
    triggers: ['any'],
    triggerMode: 'all',
    reversibility: 'composed (each reflex reversible per its own contract)',
    cost: 'low (the sensors are cheap; only firing reflexes mutate)',
    sideEffects: ['composed of all individual reflex side effects'],
    cooldownMs: 0,  // composite — cooldowns live in individual reflexes
  },

  'record-meta-observation': {
    module: 'core/field-coupling',
    fn: 'recordMetaObservation',
    effect: 'aggregates a trajectory of scores, classifies via dual oracle, contributes the classification back to the field',
    triggers: ['any'],
    triggerMode: 'all',
    reversibility: 'append-only contribution; the histogram entry stays',
    cost: 'low',
    sideEffects: ['adds one meta:* source to the field histogram'],
    cooldownMs: 0,
  },

  'temporal-snapshot': {
    module: 'core/field-coupling',
    fn: 'recordTemporalSnapshot',
    effect: 'walks a file\'s git history and contributes adjacent + arc fractal-coherency readings as temporal:* sources',
    triggers: ['any'],
    triggerMode: 'all',
    reversibility: 'append-only contributions',
    cost: 'medium (git + waveform computation)',
    sideEffects: ['adds temporal:*:adjacent and temporal:*:arc sources to the field'],
    cooldownMs: 0,
  },

  'consensus-histogram': {
    module: 'core/covenant-trust',
    fn: 'consensusHistogram',
    effect: 'returns counts and ratios of the four absorption outcomes over a recent window — the environmental sensor',
    triggers: ['any'],
    triggerMode: 'all',
    reversibility: 'read-only',
    cost: 'minimal',
    sideEffects: [],
    cooldownMs: 0,
  },
};

// ── Trigger evaluation ───────────────────────────────────────────────────

function _parseTrigger(trig) {
  if (trig === 'any') return { field: null, op: null, value: null, alwaysTrue: true };
  // direction == X
  let m = trig.match(/^(\w+)\s*==\s*(\w+)$/);
  if (m) return { field: m[1], op: '==', value: m[2] };
  // <field> <op> <number>
  m = trig.match(/^(\w+)\s*([<>]=?|==)\s*([-+]?\d*\.?\d+)$/);
  if (m) return { field: m[1], op: m[2], value: parseFloat(m[3]) };
  return null;
}

function _evalTrigger(parsed, state) {
  if (!parsed) return false;
  if (parsed.alwaysTrue) return true;
  const val = state[parsed.field];
  if (val === undefined || val === null) return false;
  switch (parsed.op) {
    case '>':  return val >  parsed.value;
    case '<':  return val <  parsed.value;
    case '>=': return val >= parsed.value;
    case '<=': return val <= parsed.value;
    case '==': return val === parsed.value;
    default:   return false;
  }
}

function _methodMatches(method, state) {
  if (!method.triggers || method.triggers.length === 0) return false;
  const parsed = method.triggers.map(_parseTrigger).filter(Boolean);
  if (parsed.length === 0) return false;
  const mode = method.triggerMode || 'all';
  if (mode === 'any') return parsed.some(p => _evalTrigger(p, state));
  return parsed.every(p => _evalTrigger(p, state));
}

// ── Public introspection API ────────────────────────────────────────────

/** List every method name in the registry. */
function listMethods() {
  return Object.keys(METHODS);
}

/** Describe a single method by name. */
function describeMethod(name) {
  const m = METHODS[name];
  if (!m) return null;
  return { name, ...m };
}

/**
 * Return the methods whose triggers match the given state. The state
 * is a flat object with named fields (cascade, entropy, coherence,
 * adversarialRatio, cognitionVariance, direction, ...).
 *
 * @param {object} state
 * @returns {object[]} matching method descriptors
 */
function methodsFor(state) {
  const out = [];
  for (const [name, m] of Object.entries(METHODS)) {
    if (_methodMatches(m, state)) out.push({ name, ...m });
  }
  return out;
}

/**
 * Build a state snapshot from the live substrate and return the methods
 * whose triggers match. The orchestrator's "what should I do right now?"
 * call.
 *
 * @returns {{state:object, applicable:object[], specific:object[], universal:object[]}}
 */
function selectResponseFor() {
  let cascade = null, entropy = null, coherence = null;
  let adversarialRatio = null, cognitionVariance = null, direction = null;
  try {
    const fc = require('../core/field-coupling');
    const f = fc.peekField();
    if (f) {
      cascade = f.cascadeFactor;
      entropy = f.globalEntropy;
      coherence = f.coherence;
    }
    const ct = fc.cognitionTrajectory();
    if (ct && ct.variance != null) cognitionVariance = ct.variance;
    const dir = fc.fieldDirection(5);
    if (dir && dir.verdict) direction = dir.verdict;
  } catch (_) { /* best-effort */ }
  try {
    const { consensusHistogram } = require('../core/covenant-trust');
    const h = consensusHistogram();
    if (h && h.total > 0) adversarialRatio = h.ratios['A-yes-B-no'];
  } catch (_) { /* best-effort */ }

  const state = { cascade, entropy, coherence, adversarialRatio, cognitionVariance, direction };
  const applicable = methodsFor(state);
  // Split applicable into specific (triggered by a numeric/categorical
  // condition) and universal (always-applicable diagnostic tools).
  const specific = applicable.filter(m => !m.triggers.includes('any'));
  const universal = applicable.filter(m => m.triggers.includes('any'));
  return { state, applicable, specific, universal };
}

module.exports = {
  METHODS,
  listMethods,
  describeMethod,
  methodsFor,
  selectResponseFor,
  // exposed for testing
  _parseTrigger,
  _evalTrigger,
  _methodMatches,
};
