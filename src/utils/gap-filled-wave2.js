'use strict';

/**
 * Gap-Filled Utilities — Wave 2
 *
 * Second generation of implementations discovered by the periodic table
 * after Wave 1 filled the original 20 gaps. Adding 20 elements to the
 * table created 18 NEW gaps at the frontier — confirming the table is
 * alive and expanding. These are the frontier fills.
 */

/**
 * GAP W2-1: Light-weight compression function (cached)
 * Pure, cached (solid), valence 1, group 17 (compression), O(n)
 *
 * Run-length encodes a string or array. Returns encoded pairs.
 * Cached phase because the encoding is deterministic and reusable.
 */
function runLengthEncode(data) {
  if (typeof data === 'string') data = data.split('');
  if (!Array.isArray(data) || data.length === 0) return [];
  const result = [];
  let current = data[0], count = 1;
  for (let i = 1; i < data.length; i++) {
    if (data[i] === current) { count++; }
    else { result.push([current, count]); current = data[i]; count = 1; }
  }
  result.push([current, count]);
  return result;
}
runLengthEncode.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.1, group: 17, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'compression',
};

/**
 * GAP W2-2: Heavy-weight meta function (pure, inert)
 * Pure, computed (gas), valence 4, heavy, inert, O(n²)
 *
 * Analyzes the density and distribution of elements across the
 * periodic table's property space. Pure — takes data, returns analysis.
 */
function analyzeElementDensity(elements) {
  if (!Array.isArray(elements)) return { density: 0, distribution: {}, hotspots: [] };
  const groupCounts = {};
  const periodCounts = {};
  const chargeCounts = { positive: 0, neutral: 0, negative: 0 };

  for (const el of elements) {
    const p = el.properties || el;
    const g = p.group || 0;
    const d = p.period || 0;
    groupCounts[g] = (groupCounts[g] || 0) + 1;
    periodCounts[d] = (periodCounts[d] || 0) + 1;
    if (p.charge > 0) chargeCounts.positive++;
    else if (p.charge < 0) chargeCounts.negative++;
    else chargeCounts.neutral++;
  }

  const totalCells = 18 * 7;
  const occupiedCells = new Set(elements.map(e => {
    const p = e.properties || e;
    return `${p.group}-${p.period}`;
  })).size;

  const hotspots = Object.entries(groupCounts)
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([g, c]) => ({ group: parseInt(g), count: c }));

  const __retVal = {
    totalElements: elements.length,
    density: Math.round((occupiedCells / totalCells) * 1000) / 1000,
    groupDistribution: groupCounts,
    periodDistribution: periodCounts,
    chargeBalance: chargeCounts,
    hotspots,
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.density || 0)), source: 'oracle:gap-filled-wave2:analyzeElementDensity' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}
analyzeElementDensity.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.88, group: 18, period: 7,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};

/**
 * GAP W2-3: Light-weight async function (computed)
 * Pure, computed (gas), valence 0, group 8 (async), O(1)
 *
 * Returns a promise that resolves after a given delay.
 * The fundamental async primitive — everything async composes from this.
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms || 0));
}
delay.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 8, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-4: Light-weight state function (computed)
 * Pure, computed (gas), valence 0, group 10 (state), O(n)
 *
 * Creates a deep-frozen snapshot of an object's current state.
 * Computed phase because it produces a new immutable value each call.
 */
function snapshot(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  const clone = Array.isArray(obj) ? obj.map(snapshot) : {};
  if (!Array.isArray(obj)) {
    for (const key of Object.keys(obj)) clone[key] = snapshot(obj[key]);
  }
  return Object.freeze(clone);
}
snapshot.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 10, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-5: Light-weight sort predicate (computed)
 * Pure, computed (gas), valence 0, group 14 (sort), O(n)
 *
 * Tests whether an array is already sorted in ascending order.
 * A sort predicate — returns boolean, doesn't sort.
 */
function isSorted(arr, compareFn) {
  if (!Array.isArray(arr) || arr.length <= 1) return true;
  const cmp = compareFn || ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (let i = 1; i < arr.length; i++) {
    if (cmp(arr[i - 1], arr[i]) > 0) return false;
  }
  return true;
}
isSorted.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 14, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-6: Light-weight search function (computed)
 * Pure, computed (gas), valence 0, group 15 (search), O(log n)
 *
 * Binary search on a sorted array. Returns the index of the target
 * or -1 if not found. Pure — no mutation.
 */
function binarySearch(arr, target, compareFn) {
  if (!Array.isArray(arr)) return -1;
  const cmp = compareFn || ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const c = cmp(arr[mid], target);
    if (c === 0) return mid;
    if (c < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
binarySearch.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 15, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'search',
};

/**
 * GAP W2-7: Light-weight crypto function (computed)
 * Pure, computed (gas), valence 0, group 16 (crypto), O(n)
 *
 * A fast deterministic hash function for strings.
 * Not cryptographically secure — for hash tables and dedup, not security.
 */
function simpleHash(str) {
  if (typeof str !== 'string') str = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
simpleHash.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 16, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-8: Light-weight compression metric (computed)
 * Pure, computed (gas), valence 0, group 17 (compression), O(1)
 *
 * Computes compression ratio between original and compressed sizes.
 * Pure — just math on two numbers.
 */
function compressionRatio(originalSize, compressedSize) {
  if (typeof originalSize !== 'number' || originalSize <= 0) return 0;
  if (typeof compressedSize !== 'number' || compressedSize <= 0) return 0;
  return Math.round((originalSize / compressedSize) * 1000) / 1000;
}
compressionRatio.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 17, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'compression',
};

/**
 * GAP W2-9: Heavy meta function (side-effecting, healing, minimal harm)
 * Side-effecting (odd spin), computed, valence 4, reactive, O(n²)
 *
 * Audits a set of files for atomic property coverage. Side-effecting
 * because it reads the filesystem. Healing alignment because it
 * helps the system understand its own coverage gaps.
 */
function auditAtomicCoverage(files) {
  const fs = require('fs');
  const results = [];
  for (const filePath of (files || [])) {
    try {
      const code = fs.readFileSync(filePath, 'utf-8');
      const exportMatch = code.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
      const exports = exportMatch
        ? (exportMatch[1].match(/\b([A-Za-z_]\w*)\b/g) || [])
            .filter(n => !/^(function|async|const|let|var|module|exports|require)$/.test(n))
        : [];
      const withAtomic = exports.filter(name =>
        code.includes(name + '.atomicProperties'));
      results.push({
        file: filePath,
        total: exports.length,
        covered: withAtomic.length,
        ratio: exports.length > 0 ? Math.round((withAtomic.length / exports.length) * 100) : 100,
        missing: exports.filter(n => !withAtomic.includes(n)),
      });
    } catch (e) {
      results.push({ file: filePath, error: e.message });
    }
  }
  const totalFns = results.reduce((s, r) => s + (r.total || 0), 0);
  const coveredFns = results.reduce((s, r) => s + (r.covered || 0), 0);
  return {
    files: results,
    summary: {
      totalFiles: results.length,
      totalFunctions: totalFns,
      coveredFunctions: coveredFns,
      overallCoverage: totalFns > 0 ? Math.round((coveredFns / totalFns) * 100) : 100,
    },
  };
}
auditAtomicCoverage.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 7,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'quality',
};

/**
 * GAP W2-10: Heavy meta function (pure, healing, minimal harm, period 6)
 * Pure (even spin), computed, valence 4, reactive, O(n)
 *
 * Predicts when the next emergence event will occur based on
 * current coherency trajectory. Pure — takes data, returns prediction.
 */
function predictEmergence(coherencyHistory, thresholds) {
  if (!Array.isArray(coherencyHistory) || coherencyHistory.length < 2) {
    return { predicted: false, reason: 'insufficient data' };
  }
  const defaults = [0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 0.98];
  const targets = thresholds || defaults;
  const recent = coherencyHistory.slice(-10);
  const current = recent[recent.length - 1];
  const oldest = recent[0];
  const trend = (current - oldest) / recent.length;

  const nextThreshold = targets.find(t => t > current);
  if (!nextThreshold) return { predicted: false, reason: 'all thresholds crossed', current };

  if (trend <= 0) return { predicted: false, reason: 'negative or flat trend', current, trend };

  const stepsNeeded = Math.ceil((nextThreshold - current) / trend);
  return {
    predicted: true,
    current,
    nextThreshold,
    trend: Math.round(trend * 10000) / 10000,
    estimatedSteps: stepsNeeded,
    confidence: Math.min(1, recent.length / 10),
  };
}
predictEmergence.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 6,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'core',
};

/**
 * GAP W2-11: Light transform, mutable (liquid), minimal harm
 * Mutates (liquid), valence 0, O(1)
 *
 * Applies a mutation function to an object in place. harmPotential
 * 'minimal' because in-place mutation can cause bugs if the caller
 * doesn't expect it.
 */
function mutTransform(obj, fn) {
  if (!obj || typeof obj !== 'object' || typeof fn !== 'function') return obj;
  fn(obj);
  return obj;
}
mutTransform.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-12: Light transform, reactive stream (plasma), minimal harm
 * Plasma phase, valence 0, O(1) per event
 *
 * Creates a reactive filter — wraps an EventEmitter so only events
 * matching a predicate are re-emitted. harmPotential 'minimal'
 * because silently dropping events can cause downstream issues.
 */
function reactiveFilter(emitter, event, predicate) {
  const { EventEmitter } = require('events');
  const filtered = new EventEmitter();
  emitter.on(event, (...args) => {
    try { if (predicate(...args)) filtered.emit(event, ...args); }
    catch { /* swallow predicate errors in stream */ }
  });
  filtered._source = emitter;
  filtered._event = event;
  return filtered;
}
reactiveFilter.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'plasma',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-13: Light filter, computed (gas), minimal harm
 * Pure, computed, valence 0, O(n)
 *
 * Filters an array by a regex pattern applied to string conversion.
 * harmPotential 'minimal' because regex can have pathological backtracking.
 */
function filterByPattern(arr, pattern) {
  if (!Array.isArray(arr)) return [];
  if (pattern instanceof RegExp) return arr.filter(item => pattern.test(String(item)));
  if (typeof pattern === 'string') return arr.filter(item => String(item).includes(pattern));
  return arr.slice();
}
filterByPattern.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 12, period: 1,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-14: Light transform, cached (solid), minimal harm
 * Cached, valence 0, O(1)
 *
 * A frozen identity transform — takes a value, returns a frozen copy.
 * Cached because frozen values are inherently cacheable.
 * harmPotential 'minimal' because freezing can break code that
 * expects to mutate the returned value.
 */
function frozenIdentity(value) {
  if (value === null || typeof value !== 'object') return value;
  const copy = Array.isArray(value) ? [...value] : { ...value };
  return Object.freeze(copy);
}
frozenIdentity.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-15: Heavy meta function (complex spin, healing)
 * Complex spin (conditional reversibility), valence 4, reactive, O(n²)
 *
 * Conditional analysis — examines code under different assumption sets.
 * Complex spin because the analysis is conditionally reversible:
 * you can re-run with different conditions for a different result.
 */
function conditionalAnalyze(code, conditions) {
  if (typeof code !== 'string') return { results: [], summary: 'no code' };
  const defaults = {
    checkBranches: true,
    checkLoops: true,
    checkDepth: true,
    maxAcceptableComplexity: 15,
  };
  const conds = { ...defaults, ...conditions };
  const results = [];

  if (conds.checkBranches) {
    const branches = (code.match(/\b(if|else\s+if|switch|case|\?)\b/g) || []).length;
    results.push({ check: 'branches', count: branches, ok: branches <= conds.maxAcceptableComplexity });
  }
  if (conds.checkLoops) {
    const loops = (code.match(/\b(for|while|do)\b/g) || []).length;
    results.push({ check: 'loops', count: loops, ok: loops <= Math.ceil(conds.maxAcceptableComplexity / 3) });
  }
  if (conds.checkDepth) {
    let maxD = 0, d = 0;
    for (const ch of code) { if (ch === '{') { d++; if (d > maxD) maxD = d; } else if (ch === '}') d--; }
    results.push({ check: 'depth', count: maxD, ok: maxD <= Math.ceil(conds.maxAcceptableComplexity / 2) });
  }

  const allOk = results.every(r => r.ok);
  return { results, passing: allOk, conditionsUsed: conds };
}
conditionalAnalyze.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'complex', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'quality',
};

/**
 * GAP W2-16: Light contracting math function (cached)
 * Contracting (charge -1), cached (solid), valence 0, O(1)
 *
 * Floor of absolute value — contracts a real number to a non-negative
 * integer. Charge -1 because information is lost (sign + fractional part).
 */
function absFloor(n) {
  if (typeof n !== 'number' || isNaN(n)) return 0;
  return Math.floor(Math.abs(n));
}
absFloor.atomicProperties = {
  charge: -1, valence: 0, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0, group: 1, period: 1,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/**
 * GAP W2-17: Medium expanding search function (stable, healing)
 * Expanding (charge +1), computed, valence 3, stable, O(n*m)
 *
 * Fuzzy string search — finds approximate matches in a list of items.
 * Expanding because it ADDS relevance scores to each result.
 * Healing alignment because better search = better system understanding.
 */
function fuzzySearch(items, query, keyFn) {
  if (!Array.isArray(items) || typeof query !== 'string') return [];
  const extractKey = keyFn || (x => String(x));
  const q = query.toLowerCase();

  return items
    .map(item => {
      const text = extractKey(item).toLowerCase();
      let score = 0;
      if (text === q) score = 1.0;
      else if (text.startsWith(q)) score = 0.9;
      else if (text.includes(q)) score = 0.7;
      else {
        let qi = 0;
        for (let ti = 0; ti < text.length && qi < q.length; ti++) {
          if (text[ti] === q[qi]) qi++;
        }
        score = qi === q.length ? 0.3 + (0.3 * q.length / text.length) : 0;
      }
      return { item, score };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
fuzzySearch.atomicProperties = {
  charge: 1, valence: 3, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'stable', electronegativity: 0.7, group: 15, period: 4,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'search',
};

/**
 * GAP W2-18: Medium expanding search function (reactive, healing)
 * Expanding (charge +1), computed, valence 4, reactive, O(n*m)
 *
 * Semantic search with a pluggable scoring function and threshold.
 * More complex than fuzzy search — takes a custom scorer and filters
 * by minimum relevance. Reactive because results change with scorer.
 */
function semanticSearch(items, query, scoreFn, threshold) {
  if (!Array.isArray(items)) return [];
  const minScore = typeof threshold === 'number' ? threshold : 0.3;
  const scorer = scoreFn || ((item, q) => {
    const s = String(item).toLowerCase();
    const qLower = String(q).toLowerCase();
    if (s.includes(qLower)) return 0.8;
    const words = qLower.split(/\s+/);
    const matched = words.filter(w => s.includes(w)).length;
    return words.length > 0 ? matched / words.length : 0;
  });

  return items
    .map(item => ({ item, score: scorer(item, query) }))
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score);
}
semanticSearch.atomicProperties = {
  charge: 1, valence: 4, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.8, group: 15, period: 5,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'search',
};

module.exports = {
  runLengthEncode,
  analyzeElementDensity,
  delay,
  snapshot,
  isSorted,
  binarySearch,
  simpleHash,
  compressionRatio,
  auditAtomicCoverage,
  predictEmergence,
  mutTransform,
  reactiveFilter,
  filterByPattern,
  frozenIdentity,
  conditionalAnalyze,
  absFloor,
  fuzzySearch,
  semanticSearch,
};
