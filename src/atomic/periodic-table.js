'use strict';

/**
 * Periodic Table of Code — the foundational data structure for
 * Atomic Coding.
 *
 * Every function is an "element" defined by 9 atomic properties:
 *
 *   charge          : -1 (contracts) | 0 (transforms) | +1 (expands)
 *   valence         : 0-8 (how many other functions it composes with)
 *   mass            : 'light' | 'medium' | 'heavy' (complexity: O(1)/O(n)/O(n²))
 *   spin            : 'even' (reversible/pure) | 'odd' (irreversible/side-effects)
 *   phase           : 'solid' (cached) | 'liquid' (mutable) | 'gas' (computed)
 *   reactivity      : 'inert' (pure) | 'low' | 'medium' | 'high' (interaction level)
 *   electronegativity: 0-1 (how strongly it pulls dependencies toward itself)
 *   group           : 1-18 (functional family: math, string, array, async, etc.)
 *   period          : 1-7 (abstraction level: primitive → framework)
 *
 * Elements with the same property signature are INTERCHANGEABLE —
 * different implementations of the same functional role.
 *
 * The periodic table tracks which property combinations are
 * REALIZED (have at least one implementation) and which are GAPS
 * (predicted to be useful but not yet implemented).
 *
 * The three-level capability model:
 *   INNATE      — encoded properties, exist before execution
 *   EMERGENT    — meta-functions from fractal structure at complexity thresholds
 *   INTERACTION — novel behaviors from property combination
 *
 * Integration:
 *   Oracle:  uses the table for systematic pattern discovery
 *   Void:    uses signatures for compression (same signature = interchangeable)
 *   Both:    the self-improvement loop — void finds gaps, oracle fills them
 */

const fs = require('fs');
const path = require('path');

// ── Property value enums ────────────────────────────────────────────

const CHARGE_VALUES = [-1, 0, 1];
const MASS_VALUES = ['light', 'medium', 'heavy'];
const SPIN_VALUES = ['even', 'odd'];
const PHASE_VALUES = ['solid', 'liquid', 'gas'];
const REACTIVITY_VALUES = ['inert', 'low', 'medium', 'high'];
const MAX_VALENCE = 8;
const MAX_GROUP = 18;
const MAX_PERIOD = 7;

// ── Functional groups ───────────────────────────────────────────────
// Maps group numbers to functional families (like chemical groups)

const GROUPS = {
  1: 'math',           // Arithmetic, numeric operations
  2: 'comparison',     // Equality, ordering, matching
  3: 'string',         // String manipulation
  4: 'array',          // Array/list operations
  5: 'object',         // Object/map/record operations
  6: 'io',             // Input/output, file system
  7: 'network',        // HTTP, sockets, IPC
  8: 'async',          // Promises, streams, concurrency
  9: 'error',          // Error handling, validation
  10: 'state',         // State management, caching
  11: 'transform',     // Data transformation, mapping
  12: 'filter',        // Data filtering, selection
  13: 'aggregate',     // Reduction, accumulation
  14: 'sort',          // Ordering, ranking
  15: 'search',        // Lookup, indexing
  16: 'crypto',        // Hashing, encryption, signatures
  17: 'compression',   // Encoding, compression, serialization
  18: 'meta',          // Reflection, code generation, meta-programming
};

// ── Signature encoding ──────────────────────────────────────────────

/**
 * Encode atomic properties into a compact signature string.
 * Format: C{charge}V{valence}M{mass[0]}S{spin[0]}P{phase[0]}R{reactivity[0]}E{electronegativity}G{group}D{period}
 *
 * Examples:
 *   C+V2MlSePsRiE3G1D1 = positive charge, valence 2, light, even spin, solid phase, inert, low electronegativity, math group, period 1
 *   C-V1MmSoPlRhE7G8D3 = negative charge, valence 1, medium, odd spin, liquid, high reactivity, high electronegativity, async group, period 3
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
  return `C${c}V${v}M${m}S${s}P${p}R${r}E${e}G${g}D${d}`;
}

/**
 * Decode a signature string back to atomic properties.
 */
function decodeSignature(sig) {
  const m = sig.match(/C([+\-0])V(\d)M([lmh])S([eo])P([slg])R([ilmh])E(\d)G(\d+)D(\d)/);
  if (!m) return null;
  return {
    charge: m[1] === '+' ? 1 : m[1] === '-' ? -1 : 0,
    valence: parseInt(m[2]),
    mass: { l: 'light', m: 'medium', h: 'heavy' }[m[3]],
    spin: { e: 'even', o: 'odd' }[m[4]],
    phase: { s: 'solid', l: 'liquid', g: 'gas' }[m[5]],
    reactivity: { i: 'inert', l: 'low', m: 'medium', h: 'high' }[m[6]],
    electronegativity: parseInt(m[7]) / 9,
    group: parseInt(m[8]),
    period: parseInt(m[9]),
  };
}

// ── The Periodic Table ──────────────────────────────────────────────

class PeriodicTable {
  /**
   * @param {object} [options]
   *   - storagePath: path to persist the table as JSON (default: .remembrance/atomic-table.json)
   */
  constructor(options = {}) {
    this._storagePath = options.storagePath || null;
    /** @type {Map<string, Element>} signature → element */
    this._elements = new Map();
    /** @type {Map<string, string[]>} group name → list of signatures in that group */
    this._byGroup = new Map();
    if (this._storagePath) this._load();
  }

  /**
   * Register an element (a realized property combination).
   *
   * @param {object} props - atomic properties
   * @param {object} [meta]
   *   - name: human-readable name (optional)
   *   - code: implementation source (optional)
   *   - patternId: link to oracle pattern store (optional)
   *   - source: where this element was discovered ('harvest', 'discovery', 'manual')
   */
  addElement(props, meta = {}) {
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
    };

    this._elements.set(sig, element);

    if (!this._byGroup.has(groupName)) this._byGroup.set(groupName, []);
    const groupList = this._byGroup.get(groupName);
    if (!groupList.includes(sig)) groupList.push(sig);

    if (this._storagePath) this._save();
    return element;
  }

  /**
   * Get an element by its signature.
   */
  getElement(signature) {
    return this._elements.get(signature) || null;
  }

  /**
   * Get an element by its properties (computes signature internally).
   */
  getByProperties(props) {
    return this.getElement(encodeSignature(props));
  }

  /**
   * Find all elements in a functional group.
   */
  getGroup(groupNumber) {
    const name = GROUPS[groupNumber] || `group_${groupNumber}`;
    const sigs = this._byGroup.get(name) || [];
    return sigs.map(s => this._elements.get(s)).filter(Boolean);
  }

  /**
   * Total number of realized elements.
   */
  get size() { return this._elements.size; }

  /**
   * All realized signatures.
   */
  get signatures() { return Array.from(this._elements.keys()); }

  /**
   * All realized elements.
   */
  get elements() { return Array.from(this._elements.values()); }

  /**
   * Record a usage of an element (for frequency tracking).
   */
  recordUsage(signature) {
    const el = this._elements.get(signature);
    if (el) {
      el.usageCount = (el.usageCount || 0) + 1;
      if (this._storagePath) this._save();
    }
  }

  /**
   * Predict which property combinations SHOULD exist but don't.
   * This is the gap discovery engine.
   *
   * Strategy: for each realized element, generate "neighbor"
   * signatures by varying one property at a time. Neighbors that
   * don't exist in the table are gaps. Gaps that have many
   * realized neighbors are higher priority (the property space
   * around them is well-explored, suggesting the gap is meaningful).
   *
   * @param {object} [options]
   *   - maxGaps: maximum number of gaps to return (default 50)
   *   - minNeighborCount: minimum realized neighbors to consider a gap meaningful (default 2)
   * @returns {Array<{ signature, properties, neighborCount, priority }>}
   */
  findGaps(options = {}) {
    const maxGaps = options.maxGaps || 50;
    const minNeighbors = options.minNeighborCount || 2;

    const gapScores = new Map();

    for (const el of this._elements.values()) {
      const neighbors = this._generateNeighbors(el.properties);
      for (const neighbor of neighbors) {
        const sig = encodeSignature(neighbor);
        if (this._elements.has(sig)) continue; // already realized
        const current = gapScores.get(sig) || { signature: sig, properties: neighbor, neighborCount: 0 };
        current.neighborCount++;
        gapScores.set(sig, current);
      }
    }

    // Filter by minimum neighbor count, sort by priority (more neighbors = more meaningful gap)
    const gaps = Array.from(gapScores.values())
      .filter(g => g.neighborCount >= minNeighbors)
      .map(g => ({ ...g, priority: g.neighborCount / this._elements.size }))
      .sort((a, b) => b.neighborCount - a.neighborCount)
      .slice(0, maxGaps);

    return gaps;
  }

  /**
   * Generate all single-property-variation neighbors of an element.
   * For each property, try each possible value; skip the current value.
   */
  _generateNeighbors(props) {
    const neighbors = [];
    const base = { ...props };

    // Charge variations
    for (const c of CHARGE_VALUES) {
      if (c !== base.charge) neighbors.push({ ...base, charge: c });
    }
    // Valence variations (±1)
    if (base.valence > 0) neighbors.push({ ...base, valence: base.valence - 1 });
    if (base.valence < MAX_VALENCE) neighbors.push({ ...base, valence: base.valence + 1 });
    // Mass variations
    for (const m of MASS_VALUES) {
      if (m !== base.mass) neighbors.push({ ...base, mass: m });
    }
    // Spin variations
    for (const s of SPIN_VALUES) {
      if (s !== base.spin) neighbors.push({ ...base, spin: s });
    }
    // Phase variations
    for (const p of PHASE_VALUES) {
      if (p !== base.phase) neighbors.push({ ...base, phase: p });
    }
    // Reactivity variations
    for (const r of REACTIVITY_VALUES) {
      if (r !== base.reactivity) neighbors.push({ ...base, reactivity: r });
    }
    // Group ±1 (same period, adjacent family)
    if (base.group > 1) neighbors.push({ ...base, group: base.group - 1 });
    if (base.group < MAX_GROUP) neighbors.push({ ...base, group: base.group + 1 });
    // Period ±1 (same group, different abstraction level)
    if (base.period > 1) neighbors.push({ ...base, period: base.period - 1 });
    if (base.period < MAX_PERIOD) neighbors.push({ ...base, period: base.period + 1 });

    return neighbors;
  }

  /**
   * Measure the interaction coherence between two elements.
   * Positive + negative charge = balanced = high coherence.
   * Same valence = composable = medium coherence.
   * Same phase = synchronous = base coherence.
   *
   * Returns 0-1.
   */
  interactionCoherence(sig1, sig2) {
    const e1 = this._elements.get(sig1);
    const e2 = this._elements.get(sig2);
    if (!e1 || !e2) return 0;
    const p1 = e1.properties;
    const p2 = e2.properties;

    let score = 0;
    let dimensions = 0;

    // Charge balance
    dimensions++;
    if (p1.charge + p2.charge === 0 && p1.charge !== 0) score += 1.0; // perfect balance
    else if (p1.charge === 0 || p2.charge === 0) score += 0.5; // neutral + anything
    else score += 0.2; // same charge = some tension

    // Valence compatibility
    dimensions++;
    if (p1.valence === p2.valence) score += 0.8;
    else if (Math.abs(p1.valence - p2.valence) <= 1) score += 0.5;
    else score += 0.2;

    // Phase alignment
    dimensions++;
    if (p1.phase === p2.phase) score += 0.7;
    else score += 0.3;

    // Reactivity compatibility (inert + inert = stable, high + high = volatile)
    dimensions++;
    const rOrder = { inert: 0, low: 1, medium: 2, high: 3 };
    const rDiff = Math.abs((rOrder[p1.reactivity] || 0) - (rOrder[p2.reactivity] || 0));
    score += 1.0 - (rDiff / 3);

    // Mass compatibility (similar = balanced pipeline)
    dimensions++;
    const mOrder = { light: 0, medium: 1, heavy: 2 };
    const mDiff = Math.abs((mOrder[p1.mass] || 0) - (mOrder[p2.mass] || 0));
    score += 1.0 - (mDiff / 2);

    return Math.round((score / dimensions) * 1000) / 1000;
  }

  /**
   * Get summary statistics about the table.
   */
  stats() {
    const byGroup = {};
    for (const [name, sigs] of this._byGroup) {
      byGroup[name] = sigs.length;
    }
    const byCharge = { positive: 0, neutral: 0, negative: 0 };
    const byMass = { light: 0, medium: 0, heavy: 0 };
    for (const el of this._elements.values()) {
      if (el.properties.charge > 0) byCharge.positive++;
      else if (el.properties.charge < 0) byCharge.negative++;
      else byCharge.neutral++;
      byMass[el.properties.mass] = (byMass[el.properties.mass] || 0) + 1;
    }
    return {
      totalElements: this._elements.size,
      byGroup,
      byCharge,
      byMass,
      gaps: this.findGaps({ maxGaps: 5 }).length,
    };
  }

  // ── Persistence ───────────────────────────────────────────────────

  _save() {
    if (!this._storagePath) return;
    try {
      const dir = path.dirname(this._storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        elements: Array.from(this._elements.values()),
      };
      fs.writeFileSync(this._storagePath, JSON.stringify(data, null, 2));
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
    } catch { /* best effort */ }
  }

  /**
   * Export the table as JSON for cross-system sharing.
   * This is how the oracle shares its periodic table with the void compressor.
   */
  exportJSON() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      elementCount: this._elements.size,
      elements: Array.from(this._elements.values()).map(el => ({
        signature: el.signature,
        properties: el.properties,
        name: el.name,
        source: el.source,
        usageCount: el.usageCount,
      })),
    };
  }
}

module.exports = {
  PeriodicTable,
  encodeSignature,
  decodeSignature,
  GROUPS,
  CHARGE_VALUES,
  MASS_VALUES,
  SPIN_VALUES,
  PHASE_VALUES,
  REACTIVITY_VALUES,
  MAX_VALENCE,
  MAX_GROUP,
  MAX_PERIOD,
};

// ── Atomic self-description ─────────────────────────────────────────
// The periodic table describes ITSELF atomically. This is the bootstrap:
// the code that stores atomic properties has its own atomic properties.
encodeSignature.atomicProperties = {
  charge: -1, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.1, group: 17, period: 1,
};
decodeSignature.atomicProperties = {
  charge: 1, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.1, group: 17, period: 1,
};
