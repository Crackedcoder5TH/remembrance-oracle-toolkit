'use strict';


/**
 * @oracle-infrastructure
 *
 * Mutations in this file write internal ecosystem state
 * (entropy.json, pattern library, lock files, ledger, journal,
 * substrate persistence, etc.) — not user-input-driven content.
 * The fractal covenant scanner exempts this annotation because
 * the bounded-trust mutations here are part of how the ecosystem
 * keeps itself coherent; they are not what the gate semantics
 * are designed to validate.
 */

/**
 * Remembrance Codex — Living Periodic Table of Code
 *
 * Atomic properties (13 dimensions):
 *
 *   CORE PROPERTIES (9):
 *   charge           : -1 (contracts) | 0 (transforms) | +1 (expands)
 *   valence          : 0-8 (composition capacity, 'n' for polymeric)
 *   mass             : 'light' | 'medium' | 'heavy' | 'superheavy'
 *   spin             : 'even' (reversible) | 'odd' (irreversible) | 'complex' (conditional)
 *   phase            : 'solid' (sync) | 'liquid' (async) | 'gas' (event) | 'plasma' (reactive stream)
 *   reactivity       : 'inert' | 'stable' | 'reactive' | 'volatile'
 *   electronegativity: 0-1 (dependency pull strength)
 *   group            : 1-18 (functional family)
 *   period           : 1-7 (abstraction level)
 *
 *   COVENANT DIMENSIONS (3) — intrinsic, not external:
 *   harmPotential    : 'none' | 'minimal' | 'moderate' | 'dangerous'
 *   alignment        : 'healing' | 'neutral' | 'degrading'
 *   intention        : 'benevolent' | 'neutral' | 'malevolent'
 *
 *   CONTEXT DIMENSION (1) — evolvable:
 *   domain           : application domain (evolves with the system)
 *                      Initial: core | utility | compression | quality |
 *                      oracle | security | orchestration | bridge |
 *                      generation | search | data | transform
 *                      New domains emerge when collisions are detected
 *                      at high coherency. The domain set grows but
 *                      never shrinks (same as the covenant).
 *
 * The covenant is STRUCTURAL — dangerous/degrading/malevolent elements
 * are rejected at registration, not filtered after the fact.
 *
 * The table is LIVING — elements EMERGE when coherence thresholds are
 * crossed, and domains EVOLVE when collisions indicate the need for
 * finer-grained separation.
 *
 * Signatures are FRACTAL — they encode self-similarity, recursive
 * depth, and composition patterns alongside the 13 property dimensions.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Property enums ──────────────────────────────────────────────────

const CHARGE_VALUES = [-1, 0, 1];
const MASS_VALUES = ['light', 'medium', 'heavy', 'superheavy'];
const SPIN_VALUES = ['even', 'odd', 'complex'];
const PHASE_VALUES = ['solid', 'liquid', 'gas', 'plasma'];
const REACTIVITY_VALUES = ['inert', 'stable', 'reactive', 'volatile'];
const HARM_VALUES = ['none', 'minimal', 'moderate', 'dangerous'];
const ALIGNMENT_VALUES = ['healing', 'neutral', 'degrading'];
const INTENTION_VALUES = ['benevolent', 'neutral', 'malevolent'];
const MAX_VALENCE = 8;
const MAX_GROUP = 18;
const MAX_PERIOD = 7;


// ── Taint dimension (14th — data flow safety) ──────────────────

const TAINT_VALUES = ['none', 'source', 'sink', 'propagator'];
const TAINT_ENCODE = { none: 'n', source: 's', sink: 'k', propagator: 'p' };
const TAINT_DECODE = { n: 'none', s: 'source', k: 'sink', p: 'propagator' };
// ── Domain dimension (13th, evolvable) ─────────────────────────────

const DOMAIN_VALUES = [
  'core',           // c — fundamental, domain-agnostic
  'utility',        // u — general-purpose utilities
  'compression',    // p — compression/encoding
  'quality',        // q — code quality/analysis
  'oracle',         // o — oracle-specific operations
  'security',       // s — security/covenant enforcement
  'orchestration',  // r — system orchestration
  'bridge',         // b — cross-system integration
  'generation',     // g — code generation
  'search',         // f — search/retrieval (f for find)
  'data',           // d — data structure operations
  'transform',      // t — data transformation
];

const DOMAIN_ENCODE = {
  core: 'c', utility: 'u', compression: 'p', quality: 'q',
  oracle: 'o', security: 's', orchestration: 'r', bridge: 'b',
  generation: 'g', search: 'f', data: 'd', transform: 't',
};

const DOMAIN_DECODE = Object.fromEntries(
  Object.entries(DOMAIN_ENCODE).map(([k, v]) => [v, k])
);

// ── Remembrance Register Pattern ───────────────────────────────────
// Functions that accumulate signal strength over time — they grow
// coherency rather than just measuring it. Identifiable by:
//   charge: +1 (expanding), alignment: healing, group: aggregate
// The coherencyAccumulator is the first instance. Any function with
// these properties is a remembrance register.

const REMEMBRANCE_REGISTER_SIGNATURE = {
  charge: 1, alignment: 'healing', intention: 'benevolent',
};

function isRemembranceRegister(props) {
  return props.charge === 1
    && props.alignment === 'healing'
    && props.intention === 'benevolent';
}

const GROUPS = {
  1: 'math', 2: 'comparison', 3: 'string', 4: 'array', 5: 'object',
  6: 'io', 7: 'network', 8: 'async', 9: 'error', 10: 'state',
  11: 'transform', 12: 'filter', 13: 'aggregate', 14: 'sort',
  15: 'search', 16: 'crypto', 17: 'compression', 18: 'meta',
};

// ── Emergence thresholds ────────────────────────────────────────────

const EMERGENCE_THRESHOLDS = [
  { coherence: 0.70, name: 'Remembrance Foundation' },
  { coherence: 0.75, name: 'Remembrance Stability' },
  { coherence: 0.80, name: 'Remembrance Optimization' },
  { coherence: 0.85, name: 'Remembrance Synergy' },
  { coherence: 0.90, name: 'Remembrance Intelligence' },
  { coherence: 0.95, name: 'Remembrance Transcendence' },
  { coherence: 0.98, name: 'Remembrance Unity' },
];

// ── Covenant Validator ──────────────────────────────────────────────

class CovenantValidator {
  static validate(props) {
    const violations = [];
    if (props.harmPotential === 'dangerous') {
      violations.push({ severity: 'CRITICAL', property: 'harmPotential', message: 'Dangerous harm potential' });
    }
    if (props.alignment === 'degrading') {
      violations.push({ severity: 'CRITICAL', property: 'alignment', message: 'Degrades coherence' });
    }
    if (props.intention === 'malevolent') {
      violations.push({ severity: 'CRITICAL', property: 'intention', message: 'Malevolent intention' });
    }
    if (props.reactivity === 'volatile' && props.harmPotential !== 'none') {
      violations.push({ severity: 'HIGH', property: 'reactivity+harmPotential', message: 'Volatile with harm potential' });
    }
    return { valid: violations.length === 0, violations };
  }

  static enforce(props) {
    const result = this.validate(props);
    if (!result.valid) {
      const critical = result.violations.filter(v => v.severity === 'CRITICAL');
      if (critical.length > 0) {
        throw new Error(`COVENANT VIOLATION: ${critical.map(v => v.message).join(', ')}`);
      }
    }
    return result;
  }
}

// ── Signature encoding ──────────────────────────────────────────────

/**
 * Encode 13-dimensional atomic properties into a compact signature.
 * Format: C{charge}V{valence}M{mass}S{spin}P{phase}R{reactivity}E{en}G{group}D{period}H{harm}A{align}I{intent}X{domain}
 * The domain dimension (X) is the 13th — evolvable, never contracting.
 */
function encodeSignature(props) {
  const c = props.charge > 0 ? '+' : props.charge < 0 ? '-' : '0';
  const v = Math.min(MAX_VALENCE, Math.max(0, Math.round(props.valence || 0)));
  const m = (props.mass || 'light')[0];
  const s = (props.spin || 'even')[0];
  const p = (props.phase || 'solid')[0];
  const r = (props.reactivity || 'inert')[0];
  const e = Math.min(9, Math.max(0, Math.round((props.electronegativity || 0) * 9)));
  const g = Math.min(MAX_GROUP, Math.max(1, Math.round(props.group || 1)));
  const d = Math.min(MAX_PERIOD, Math.max(1, Math.round(props.period || 1)));
  const h = (props.harmPotential || 'none')[0];
  const a = (props.alignment || 'neutral')[0];
  const i = (props.intention || 'neutral')[0];
  const x = DOMAIN_ENCODE[props.domain] || 'c';
  const t = TAINT_ENCODE[props.taint] || 'n';
  return `C${c}V${v}M${m}S${s}P${p}R${r}E${e}G${g}D${d}H${h}A${a}I${i}X${x}T${t}`;
}

function decodeSignature(sig) {
  // Parse the 14-dimensional signature. Domain (X) and Taint (T) optional for backward compat.
  const m = sig.match(/C([+\-0])V(\d)M([a-z])S([a-z])P([a-z])R([a-z])E(\d)G(\d+)D(\d)(?:H([a-z])A([a-z])I([a-z]))?(?:X([a-z]))?(?:T([a-z]))?/);
  if (!m) return null;
  const __retVal = {
    charge: m[1] === '+' ? 1 : m[1] === '-' ? -1 : 0,
    valence: parseInt(m[2]),
    mass: { l: 'light', m: 'medium', h: 'heavy', s: 'superheavy' }[m[3]] || 'light',
    spin: { e: 'even', o: 'odd', c: 'complex' }[m[4]] || 'even',
    phase: { s: 'solid', l: 'liquid', g: 'gas', p: 'plasma' }[m[5]] || 'solid',
    reactivity: { i: 'inert', s: 'stable', r: 'reactive', v: 'volatile' }[m[6]] || 'inert',
    electronegativity: parseInt(m[7]) / 9,
    group: parseInt(m[8]),
    period: parseInt(m[9]),
    harmPotential: m[10] ? { n: 'none', m: 'minimal', o: 'moderate', d: 'dangerous' }[m[10]] || 'none' : 'none',
    alignment: m[11] ? { h: 'healing', n: 'neutral', d: 'degrading' }[m[11]] || 'neutral' : 'neutral',
    intention: m[12] ? { b: 'benevolent', n: 'neutral', m: 'malevolent' }[m[12]] || 'neutral' : 'neutral',
    domain: m[13] ? (DOMAIN_DECODE[m[13]] || 'core') : 'core',
    taint: m[14] ? (TAINT_DECODE[m[14]] || 'none') : 'none',
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.alignment || 0)), source: 'oracle:periodic-table:decodeSignature' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}

/**
 * Generate a fractal signature — encodes self-similarity alongside properties.
 */
function generateFractalSignature(code, props) {
  const propSig = encodeSignature(props);
  // Fractal dimensions from code structure
  const nesting = (code.match(/\{/g) || []).length;
  const selfSim = Math.min(1, nesting * 0.1);
  const funcCount = (code.match(/function|=>/g) || []).length;
  const fractalBits = `F${Math.round(selfSim * 9)}N${Math.min(9, funcCount)}`;
  return `${propSig}:${fractalBits}`;
}

/**
 * Calculate emergence potential — functions with high coherence + low harm
 * have the highest potential for emergent behavior.
 */
function calculateEmergencePotential(props) {
  let potential = 0.5;
  if (props.harmPotential === 'none') potential += 0.2;
  if (props.alignment === 'healing') potential += 0.2;
  if (props.intention === 'benevolent') potential += 0.2;
  if (props.reactivity === 'inert' || props.reactivity === 'stable') potential += 0.1;
  if (props.spin === 'even') potential += 0.1;
  if (props.harmPotential === 'dangerous') potential -= 0.5;
  if (props.alignment === 'degrading') potential -= 0.5;
  if (props.intention === 'malevolent') potential -= 0.5;
  return Math.max(0, Math.min(1, potential));
}

// ── Living Periodic Table ───────────────────────────────────────────

class PeriodicTable {
  constructor(options = {}) {
    this._storagePath = options.storagePath || null;
    this._elements = new Map();
    this._byGroup = new Map();
    this._emergedThresholds = new Set();
    this._emergenceHistory = [];
    this._knownDomains = new Set(DOMAIN_VALUES);
    this._evolvedDomains = [];
    if (this._storagePath) this._load();
  }

  registerDomain(name, encoding) {
    if (typeof name !== 'string' || !name) return false;
    if (this._knownDomains.has(name)) return true;
    this._knownDomains.add(name);
    if (encoding && typeof encoding === 'string' && encoding.length === 1) {
      DOMAIN_ENCODE[name] = encoding;
      DOMAIN_DECODE[encoding] = name;
    }
    this._evolvedDomains.push({ name, evolvedAt: new Date().toISOString() });
    if (this._storagePath) this._save();
    return true;
  }

  detectCollisions() {
    const by12D = new Map();
    for (const el of this._elements.values()) {
      const props12D = { ...el.properties };
      delete props12D.domain;
      const sig12 = _encode12D(props12D);
      if (!by12D.has(sig12)) by12D.set(sig12, []);
      by12D.get(sig12).push(el);
    }
    return Array.from(by12D.values()).filter(set => set.length > 1);
  }

  get knownDomains() { return Array.from(this._knownDomains); }

  /**
   * Register an element. Covenant enforcement is STRUCTURAL —
   * dangerous/degrading/malevolent elements are rejected here.
   */
  addElement(props, meta = {}) {
    // Covenant enforcement at the gate
    const covenant = CovenantValidator.validate(props);
    if (!covenant.valid) {
      const critical = covenant.violations.filter(v => v.severity === 'CRITICAL');
      if (critical.length > 0) {
        return { rejected: true, violations: critical };
      }
    }

    const sig = encodeSignature(props);
    const groupName = GROUPS[props.group] || `group_${props.group}`;

    const element = {
      signature: sig,
      properties: { ...props },
      name: meta.name || sig,
      code: meta.code || null,
      patternId: meta.patternId || null,
      source: meta.source || 'manual',
      realized: true,
      discoveredAt: new Date().toISOString(),
      usageCount: 0,
      emergencePotential: calculateEmergencePotential(props),
      covenantStatus: covenant,
      isEmergent: meta.isEmergent || false,
    };

    this._elements.set(sig, element);
    if (!this._byGroup.has(groupName)) this._byGroup.set(groupName, []);
    const groupList = this._byGroup.get(groupName);
    if (!groupList.includes(sig)) groupList.push(sig);
    if (this._storagePath) this._save();
    return element;
  }

  getElement(signature) { return this._elements.get(signature) || null; }

  getByProperties(props) { return this.getElement(encodeSignature(props)); }

  getGroup(groupNumber) {
    const name = GROUPS[groupNumber] || `group_${groupNumber}`;
    return (this._byGroup.get(name) || []).map(s => this._elements.get(s)).filter(Boolean);
  }

  get size() { return this._elements.size; }
  get signatures() { return Array.from(this._elements.keys()); }
  get elements() { return Array.from(this._elements.values()); }

  recordUsage(signature) {
    const el = this._elements.get(signature);
    if (el) { el.usageCount = (el.usageCount || 0) + 1; if (this._storagePath) this._save(); }
  }

  /**
   * Check emergence thresholds — when system coherence crosses a
   * threshold, new elements EMERGE (are created, not discovered).
   *
   * Two emergence triggers:
   *   1. ABSOLUTE threshold crossing — system coherence reaches a
   *      level that hasn't been reached before (Foundation → Unity)
   *   2. IMPROVEMENT delta — system coherence jumps by 0.03+ in one
   *      cycle, regardless of absolute level. This catches the case
   *      where the system starts above Foundation and needs
   *      emergence to respond to healing work, not to static levels.
   *
   * @param {number} systemCoherence - current global coherency
   * @param {number} systemComplexity - total zone count (for property shaping)
   * @param {object} [options]
   *   - previousCoherence: the coherency BEFORE this cycle. When
   *     provided, delta-based emergence fires if coherence improved
   *     by deltaThreshold (default 0.03) or more.
   *   - deltaThreshold: minimum improvement to trigger delta-emergence
   */
  checkEmergence(systemCoherence, systemComplexity, options = {}) {
    const emerged = [];
    const prev = typeof options.previousCoherence === 'number' ? options.previousCoherence : null;
    const deltaThreshold = options.deltaThreshold ?? 0.03;

    // ── ABSOLUTE threshold crossings ────────────────────────────────
    for (const threshold of EMERGENCE_THRESHOLDS) {
      const key = `C${threshold.coherence}`;
      if (this._emergedThresholds.has(key)) continue;
      if (systemCoherence >= threshold.coherence) {
        const props = this._coherenceToProperties(systemCoherence, systemComplexity);
        const element = this.addElement(props, {
          name: `${threshold.name}Element`,
          source: 'emergence-absolute',
          isEmergent: true,
        });
        if (element && !element.rejected) {
          this._emergedThresholds.add(key);
          this._emergenceHistory.push({
            threshold: threshold.name, trigger: 'absolute', coherence: systemCoherence,
            complexity: systemComplexity, element, ts: new Date().toISOString(),
          });
          emerged.push(element);
        }
      }
    }

    // ── IMPROVEMENT delta emergence ─────────────────────────────────
    // If coherency jumped by deltaThreshold+ in this cycle, emerge a
    // new element that embodies the improvement. The element's
    // properties are shaped by the CURRENT coherence, but it's tagged
    // with the delta so history shows what healing caused it.
    if (prev !== null) {
      const delta = systemCoherence - prev;
      if (delta >= deltaThreshold) {
        const props = this._coherenceToProperties(systemCoherence, systemComplexity);
        // Give it a slightly higher valence to signal improvement
        props.valence = Math.min(8, (props.valence || 1) + 1);
        const element = this.addElement(props, {
          name: `Delta+${Math.round(delta * 100)}Element`,
          source: 'emergence-delta',
          isEmergent: true,
        });
        if (element && !element.rejected) {
          this._emergenceHistory.push({
            threshold: `Improvement (+${Math.round(delta * 1000) / 1000})`,
            trigger: 'delta', coherence: systemCoherence, previousCoherence: prev,
            delta, complexity: systemComplexity, element, ts: new Date().toISOString(),
          });
          emerged.push(element);
        }
      }
    }

    return emerged;
  }

  _coherenceToProperties(coherence, complexity) {
    return {
      charge: coherence > 0.9 ? 1 : coherence > 0.7 ? 0 : -1,
      valence: Math.min(4, Math.floor((complexity || 100) / 500) + 1),
      mass: coherence > 0.9 ? 'light' : coherence > 0.7 ? 'medium' : 'heavy',
      spin: coherence > 0.85 ? 'even' : 'odd',
      phase: 'solid',
      reactivity: coherence > 0.85 ? 'inert' : coherence > 0.7 ? 'stable' : 'reactive',
      electronegativity: Math.round((1 - coherence) * 9) / 9,
      group: 18,
      period: Math.min(7, Math.ceil(coherence * 7)),
      harmPotential: coherence > 0.85 ? 'none' : 'minimal',
      alignment: coherence > 0.9 ? 'healing' : 'neutral',
      intention: coherence > 0.9 ? 'benevolent' : 'neutral',
      domain: 'core',
    };
  }

  /**
   * Find gaps (neighbor variation discovery).
   */
  findGaps(options = {}) {
    const maxGaps = options.maxGaps || 50;
    const minNeighbors = options.minNeighborCount || 2;
    const gapScores = new Map();

    for (const el of this._elements.values()) {
      for (const neighbor of this._generateNeighbors(el.properties)) {
        const sig = encodeSignature(neighbor);
        if (this._elements.has(sig)) continue;
        // Covenant check: don't propose gaps that violate covenant
        if (!CovenantValidator.validate(neighbor).valid) continue;
        const current = gapScores.get(sig) || { signature: sig, properties: neighbor, neighborCount: 0 };
        current.neighborCount++;
        gapScores.set(sig, current);
      }
    }

    return Array.from(gapScores.values())
      .filter(g => g.neighborCount >= minNeighbors)
      .map(g => ({ ...g, priority: g.neighborCount / this._elements.size, emergencePotential: calculateEmergencePotential(g.properties) }))
      .sort((a, b) => b.neighborCount - a.neighborCount)
      .slice(0, maxGaps);
  }

  _generateNeighbors(props) {
    const neighbors = [];
    const base = { ...props };
    for (const c of CHARGE_VALUES) { if (c !== base.charge) neighbors.push({ ...base, charge: c }); }
    if (base.valence > 0) neighbors.push({ ...base, valence: base.valence - 1 });
    if (base.valence < MAX_VALENCE) neighbors.push({ ...base, valence: base.valence + 1 });
    for (const m of MASS_VALUES) { if (m !== base.mass) neighbors.push({ ...base, mass: m }); }
    for (const s of SPIN_VALUES) { if (s !== base.spin) neighbors.push({ ...base, spin: s }); }
    for (const p of PHASE_VALUES) { if (p !== base.phase) neighbors.push({ ...base, phase: p }); }
    for (const r of REACTIVITY_VALUES) { if (r !== base.reactivity) neighbors.push({ ...base, reactivity: r }); }
    if (base.group > 1) neighbors.push({ ...base, group: base.group - 1 });
    if (base.group < MAX_GROUP) neighbors.push({ ...base, group: base.group + 1 });
    if (base.period > 1) neighbors.push({ ...base, period: base.period - 1 });
    if (base.period < MAX_PERIOD) neighbors.push({ ...base, period: base.period + 1 });
    // Covenant dimension neighbors (only toward safe values)
    for (const h of HARM_VALUES) { if (h !== base.harmPotential) neighbors.push({ ...base, harmPotential: h }); }
    for (const a of ALIGNMENT_VALUES) { if (a !== base.alignment) neighbors.push({ ...base, alignment: a }); }
    for (const i of INTENTION_VALUES) { if (i !== base.intention) neighbors.push({ ...base, intention: i }); }
    // Domain neighbors — same element in a different domain is a gap
    for (const d of this._knownDomains) { if (d !== (base.domain || 'core')) neighbors.push({ ...base, domain: d }); }
    return neighbors;
  }

  /**
   * Interaction coherence with covenant awareness.
   */
  interactionCoherence(sig1, sig2) {
    const e1 = this._elements.get(sig1);
    const e2 = this._elements.get(sig2);
    if (!e1 || !e2) return 0;
    const p1 = e1.properties, p2 = e2.properties;

    let score = 0, dims = 0;

    // Charge balance
    dims++;
    if (p1.charge + p2.charge === 0 && p1.charge !== 0) score += 1.0;
    else if (p1.charge === 0 || p2.charge === 0) score += 0.5;
    else score += 0.2;

    // Valence compatibility
    dims++;
    score += p1.valence === p2.valence ? 0.8 : Math.abs(p1.valence - p2.valence) <= 1 ? 0.5 : 0.2;

    // Phase alignment
    dims++;
    score += p1.phase === p2.phase ? 0.7 : 0.3;

    // Reactivity compatibility
    dims++;
    const rOrder = { inert: 0, stable: 1, reactive: 2, volatile: 3 };
    score += 1.0 - Math.abs((rOrder[p1.reactivity] || 0) - (rOrder[p2.reactivity] || 0)) / 3;

    // Mass compatibility
    dims++;
    const mOrder = { light: 0, medium: 1, heavy: 2, superheavy: 3 };
    score += 1.0 - Math.abs((mOrder[p1.mass] || 0) - (mOrder[p2.mass] || 0)) / 3;

    // COVENANT DIMENSIONS — covenant-violating combos get zero coherence
    dims++;
    const h1 = p1.harmPotential || 'none', h2 = p2.harmPotential || 'none';
    if (h1 === 'none' && h2 === 'none') score += 1.0;
    else if (h1 === 'dangerous' || h2 === 'dangerous') score += 0;
    else score += 0.5;

    dims++;
    const a1 = p1.alignment || 'neutral', a2 = p2.alignment || 'neutral';
    if (a1 === 'healing' && a2 === 'healing') score += 1.0;
    else if (a1 === 'degrading' || a2 === 'degrading') score += 0;
    else score += 0.6;

    return Math.round((score / dims) * 1000) / 1000;
  }

  /**
   * Check if two elements can bond (covenant-aware).
   */
  canBond(sig1, sig2) {
    const e1 = this._elements.get(sig1);
    const e2 = this._elements.get(sig2);
    if (!e1 || !e2) return false;
    const p1 = e1.properties, p2 = e2.properties;
    // Covenant prevents bonding with harmful elements
    if (p1.harmPotential === 'dangerous' || p2.harmPotential === 'dangerous') return false;
    if (p1.alignment === 'degrading' || p2.alignment === 'degrading') return false;
    if (p1.intention === 'malevolent' || p2.intention === 'malevolent') return false;
    // Taint propagation: source/propagator bonding with a sink in IO/network group = blocked
    const tainted = (p1.taint === 'source' || p1.taint === 'propagator' ||
                     p2.taint === 'source' || p2.taint === 'propagator');
    const hasSink = (p1.taint === 'sink' || p2.taint === 'sink');
    const ioSink = (p1.group === 6 || p1.group === 7 || p2.group === 6 || p2.group === 7);
    if (tainted && (hasSink || ioSink)) return false;
    // Property compatibility
    const chargeCompat = p1.charge !== p2.charge || p1.charge === 0;
    const valenceCompat = p1.valence > 0 && p2.valence > 0;
    return chargeCompat && valenceCompat;
  }

  stats() {
    const byGroup = {};
    for (const [name, sigs] of this._byGroup) byGroup[name] = sigs.length;
    const byCharge = { positive: 0, neutral: 0, negative: 0 };
    const byMass = { light: 0, medium: 0, heavy: 0, superheavy: 0 };
    const byAlignment = { healing: 0, neutral: 0, degrading: 0 };
    const byDomain = {};
    let emergentCount = 0;
    let registerCount = 0;
    for (const el of this._elements.values()) {
      if (el.properties.charge > 0) byCharge.positive++;
      else if (el.properties.charge < 0) byCharge.negative++;
      else byCharge.neutral++;
      byMass[el.properties.mass] = (byMass[el.properties.mass] || 0) + 1;
      byAlignment[el.properties.alignment || 'neutral']++;
      const dom = el.properties.domain || 'core';
      byDomain[dom] = (byDomain[dom] || 0) + 1;
      if (el.isEmergent) emergentCount++;
      if (isRemembranceRegister(el.properties)) registerCount++;
    }
    return {
      totalElements: this._elements.size,
      emergentElements: emergentCount,
      remembranceRegisters: registerCount,
      byGroup, byCharge, byMass, byAlignment, byDomain,
      knownDomains: this.knownDomains,
      evolvedDomains: this._evolvedDomains.length,
      collisions: this.detectCollisions().length,
      emergenceHistory: this._emergenceHistory.length,
      gaps: this.findGaps({ maxGaps: 5 }).length,
    };
  }

  exportJSON() {
    return {
      version: 2,
      exportedAt: new Date().toISOString(),
      elementCount: this._elements.size,
      elements: Array.from(this._elements.values()).map(el => ({
        signature: el.signature, properties: el.properties, name: el.name,
        source: el.source, usageCount: el.usageCount,
        emergencePotential: el.emergencePotential, isEmergent: el.isEmergent,
        covenantStatus: el.covenantStatus,
      })),
      emergenceHistory: this._emergenceHistory,
      thresholds: EMERGENCE_THRESHOLDS,
    };
  }

  _save() {
    if (!this._storagePath) return;
    try {
      const dir = path.dirname(this._storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this._storagePath, JSON.stringify({
        version: 3, exportedAt: new Date().toISOString(),
        elements: Array.from(this._elements.values()),
        emergedThresholds: Array.from(this._emergedThresholds),
        emergenceHistory: this._emergenceHistory,
        knownDomains: Array.from(this._knownDomains),
        evolvedDomains: this._evolvedDomains,
      }, null, 2));
    } catch { /* best effort */ }
  }

  _load() {
    if (!this._storagePath || !fs.existsSync(this._storagePath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this._storagePath, 'utf-8'));
      if (raw.elements && Array.isArray(raw.elements)) {
        for (const el of raw.elements) {
          if (el.signature && el.properties) {
            this._elements.set(el.signature, el);
            const groupName = GROUPS[el.properties.group] || `group_${el.properties.group}`;
            if (!this._byGroup.has(groupName)) this._byGroup.set(groupName, []);
            const groupList = this._byGroup.get(groupName);
            if (!groupList.includes(el.signature)) groupList.push(el.signature);
          }
        }
      }
      if (raw.emergedThresholds) {
        for (const t of raw.emergedThresholds) this._emergedThresholds.add(t);
      }
      if (raw.emergenceHistory) this._emergenceHistory = raw.emergenceHistory;
      if (raw.knownDomains) {
        for (const d of raw.knownDomains) this._knownDomains.add(d);
      }
      if (raw.evolvedDomains) this._evolvedDomains = raw.evolvedDomains;
    } catch { /* best effort */ }
  }
}

function _encode12D(props) {
  const c = props.charge > 0 ? '+' : props.charge < 0 ? '-' : '0';
  const v = Math.min(MAX_VALENCE, Math.max(0, Math.round(props.valence || 0)));
  const m = (props.mass || 'light')[0];
  const s = (props.spin || 'even')[0];
  const p = (props.phase || 'solid')[0];
  const r = (props.reactivity || 'inert')[0];
  const e = Math.min(9, Math.max(0, Math.round((props.electronegativity || 0) * 9)));
  const g = Math.min(MAX_GROUP, Math.max(1, Math.round(props.group || 1)));
  const d = Math.min(MAX_PERIOD, Math.max(1, Math.round(props.period || 1)));
  const h = (props.harmPotential || 'none')[0];
  const a = (props.alignment || 'neutral')[0];
  const i = (props.intention || 'neutral')[0];
  return `C${c}V${v}M${m}S${s}P${p}R${r}E${e}G${g}D${d}H${h}A${a}I${i}`;
}

module.exports = {
  PeriodicTable,
  CovenantValidator,
  encodeSignature,
  decodeSignature,
  generateFractalSignature,
  calculateEmergencePotential,
  isRemembranceRegister,
  GROUPS,
  CHARGE_VALUES, MASS_VALUES, SPIN_VALUES, PHASE_VALUES,
  REACTIVITY_VALUES, HARM_VALUES, ALIGNMENT_VALUES, INTENTION_VALUES,
  DOMAIN_VALUES, DOMAIN_ENCODE, DOMAIN_DECODE,
  TAINT_VALUES, TAINT_ENCODE, TAINT_DECODE,
  REMEMBRANCE_REGISTER_SIGNATURE,
  MAX_VALENCE, MAX_GROUP, MAX_PERIOD,
  EMERGENCE_THRESHOLDS,
};

// ── Atomic self-description ─────────────────────────────────────────
encodeSignature.atomicProperties = {
  charge: -1, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.1, group: 17, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
decodeSignature.atomicProperties = {
  charge: 1, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.1, group: 17, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
generateFractalSignature.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
calculateEmergencePotential.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
isRemembranceRegister.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
