'use strict';

/**
 * Gap-Filled Utilities — real implementations for elements discovered
 * by the periodic table's self-improvement loop.
 *
 * Each function was specified by the element discovery engine based on
 * gaps in the oracle's property space. The periodic table said "this
 * kind of function should exist but doesn't." These are the functions.
 *
 * Every function has atomicProperties matching the gap spec exactly,
 * covenant-aligned (harmPotential=none, alignment=healing where
 * applicable), and passes all four validation gates.
 */

/**
 * GAP 1: Light-weight transforming STATE function
 * Pure, cached, valence 1, O(1)
 *
 * A memoization wrapper that caches the result of a unary function.
 * Pure (no side effects), cached (solid phase), composes with one
 * other function (the wrapped function).
 */
function memoizeOne(fn) {
  const cache = new Map();
  return function memoized(key) {
    if (cache.has(key)) return cache.get(key);
    const result = fn(key);
    cache.set(key, result);
    return result;
  };
}
memoizeOne.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.15, group: 10, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 2: Light-weight transforming MATH function
 * Pure, computed, valence 0, O(1)
 *
 * Clamps a number between a minimum and maximum.
 * Pure, standalone (valence 0), constant time.
 */
function clamp(value, min, max) {
  if (typeof value !== 'number') return min;
  return Math.max(min, Math.min(max, value));
}
clamp.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 1, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 3: Light-weight transforming STRING function
 * Pure, computed, valence 0, O(1)
 *
 * Truncates a string to a maximum length with an ellipsis suffix.
 * Pure, standalone, constant time (string.slice is O(1) in V8).
 */
function truncate(str, maxLength, suffix = '...') {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}
truncate.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 3, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 4: Heavy-weight transforming META function (side-effecting)
 * Side-effecting, computed, valence 4, O(n²), healing alignment
 *
 * Deep-analyzes a module's exported functions, computes their atomic
 * properties, identifies missing coverage, and returns a diagnostic
 * report. Side-effecting because it reads the filesystem and calls
 * the property extractor. Healing alignment because it helps the
 * system understand itself.
 */
function analyzeModuleCoverage(filePath) {
  const fs = require('fs');
  const path = require('path');
  if (!fs.existsSync(filePath)) return { error: 'File not found', coverage: 0, functions: [] };

  const code = fs.readFileSync(filePath, 'utf-8');
  const functions = [];

  // Extract exported function names
  const exportMatch = code.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  if (exportMatch) {
    const names = (exportMatch[1].match(/\b([A-Za-z_]\w*)\b/g) || [])
      .filter(n => !/^(function|async|const|let|var|module|exports|require)$/.test(n));
    for (const name of names) {
      const hasAtomic = code.includes(name + '.atomicProperties');
      functions.push({ name, hasAtomicProperties: hasAtomic });
    }
  }

  const total = functions.length;
  const covered = functions.filter(f => f.hasAtomicProperties).length;
  const coverage = total > 0 ? covered / total : 1;

  return {
    file: path.basename(filePath),
    totalFunctions: total,
    atomicallyCovered: covered,
    coverage: Math.round(coverage * 100),
    uncovered: functions.filter(f => !f.hasAtomicProperties).map(f => f.name),
  };
}
analyzeModuleCoverage.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
};

/**
 * GAP 5: Heavy-weight transforming META function (pure)
 * Pure, computed, valence 4, O(n²), healing alignment
 *
 * Computes the property-space distance between two atomic signatures.
 * Returns a 0-1 similarity score where 1 = identical properties.
 * Pure function — no side effects, no filesystem access.
 * Healing alignment because it helps the system measure itself.
 */
function atomicDistance(propsA, propsB) {
  if (!propsA || !propsB) return 0;

  let matches = 0;
  let dimensions = 0;

  // Charge match
  dimensions++;
  if (propsA.charge === propsB.charge) matches++;

  // Valence proximity
  dimensions++;
  const vDiff = Math.abs((propsA.valence || 0) - (propsB.valence || 0));
  matches += 1 - Math.min(1, vDiff / 8);

  // Mass match
  dimensions++;
  if (propsA.mass === propsB.mass) matches++;

  // Spin match
  dimensions++;
  if (propsA.spin === propsB.spin) matches++;

  // Phase match
  dimensions++;
  if (propsA.phase === propsB.phase) matches++;

  // Reactivity match
  dimensions++;
  if (propsA.reactivity === propsB.reactivity) matches++;

  // Group proximity
  dimensions++;
  const gDiff = Math.abs((propsA.group || 1) - (propsB.group || 1));
  matches += 1 - Math.min(1, gDiff / 18);

  // Period proximity
  dimensions++;
  const pDiff = Math.abs((propsA.period || 1) - (propsB.period || 1));
  matches += 1 - Math.min(1, pDiff / 7);

  // Covenant dimensions
  dimensions++;
  if ((propsA.harmPotential || 'none') === (propsB.harmPotential || 'none')) matches++;
  dimensions++;
  if ((propsA.alignment || 'neutral') === (propsB.alignment || 'neutral')) matches++;
  dimensions++;
  if ((propsA.intention || 'neutral') === (propsB.intention || 'neutral')) matches++;

  return dimensions > 0 ? Math.round((matches / dimensions) * 1000) / 1000 : 0;
}
atomicDistance.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 6,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
};

/**
 * GAP 6: Light-weight transforming SORT function (cached)
 * Pure, cached (solid), valence 2, O(n log n)
 *
 * Sorts an array by a key-extraction function. Returns a new array
 * (pure). Valence 2 = composes with the array and the key extractor.
 * Cached phase because the comparator is built once and reused.
 */
function sortByKey(arr, keyFn) {
  if (!Array.isArray(arr)) return [];
  return arr.slice().sort((a, b) => {
    const ka = keyFn(a), kb = keyFn(b);
    if (ka < kb) return -1;
    if (ka > kb) return 1;
    return 0;
  });
}
sortByKey.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.45, group: 14, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 7: Light-weight transforming SORT function (mutable)
 * Pure interface but mutates input (liquid phase), valence 2, O(n log n)
 *
 * In-place sort with a comparator. Liquid phase = state changes during
 * execution. Returns the same array reference for chaining.
 */
function sortInPlace(arr, compareFn) {
  if (!Array.isArray(arr)) return [];
  return arr.sort(compareFn || ((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
}
sortInPlace.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0.55, group: 14, period: 4,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 8: Light-weight transforming ERROR sentinel (cached)
 * Pure, cached (solid), valence 0, O(1)
 *
 * Creates a frozen error sentinel — an immutable object representing
 * an error state. Cached because once created, it never changes.
 * Valence 0 = standalone, no composition needed.
 */
function errorSentinel(code, message) {
  return Object.freeze({
    __sentinel: true,
    code: String(code || 'UNKNOWN'),
    message: String(message || 'Unknown error'),
    timestamp: Date.now(),
    isSentinel() { return true; },
  });
}
errorSentinel.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.05, group: 9, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 9: Light-weight transforming ARRAY function
 * Pure, computed (gas), valence 0, O(n)
 *
 * Deduplicates an array preserving insertion order.
 * Pure — returns a new array, never mutates input.
 */
function unique(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr)];
}
unique.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 4, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 10: Light-weight transforming OBJECT function
 * Pure, computed (gas), valence 0, O(k) where k = keys.length
 *
 * Picks specified keys from an object, returning a new object
 * with only those keys. Pure — no mutation.
 */
function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return {};
  const result = {};
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) result[k] = obj[k];
  }
  return result;
}
pick.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 5, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 11: Light-weight transforming IO function
 * Pure, computed (gas), valence 0, O(1)
 *
 * Formats a byte count into human-readable form (KB, MB, GB, etc).
 * Pure — no filesystem access, just number formatting.
 */
function formatBytes(bytes, decimals = 2) {
  if (typeof bytes !== 'number' || bytes === 0) return '0 B';
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(abs) / Math.log(k)), units.length - 1);
  const val = abs / Math.pow(k, i);
  return `${sign}${val.toFixed(decimals)} ${units[i]}`;
}
formatBytes.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 6, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 12: Light-weight transforming NETWORK function
 * Pure, computed (gas), valence 0, O(n)
 *
 * Parses a URL query string into a plain object.
 * Pure — no network access, just string parsing.
 */
function parseQueryString(qs) {
  if (typeof qs !== 'string') return {};
  const cleaned = qs.startsWith('?') ? qs.slice(1) : qs;
  if (!cleaned) return {};
  const result = {};
  for (const pair of cleaned.split('&')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) {
      result[decodeURIComponent(pair)] = '';
    } else {
      const key = decodeURIComponent(pair.slice(0, eqIdx));
      const val = decodeURIComponent(pair.slice(eqIdx + 1));
      result[key] = val;
    }
  }
  return result;
}
parseQueryString.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 7, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 13: Heavy-weight transforming META function (pure, minimal harm)
 * Pure, computed, valence 4, O(n), healing alignment
 *
 * Measures cyclomatic complexity of code. Pure — operates on a string,
 * no filesystem. harmPotential 'minimal' because complexity metrics
 * could theoretically guide adversarial code generation, but the
 * healing alignment makes this a diagnostic tool.
 */
function measureComplexity(code) {
  if (typeof code !== 'string') return { complexity: 0, branches: 0, loops: 0, depth: 0 };
  let complexity = 1;
  let branches = 0;
  let loops = 0;

  const branchPatterns = /\b(if|else\s+if|case|\?\s*[^:]|&&|\|\|)\b/g;
  const loopPatterns = /\b(for|while|do)\b/g;
  let m;
  while ((m = branchPatterns.exec(code)) !== null) { complexity++; branches++; }
  while ((m = loopPatterns.exec(code)) !== null) { complexity++; loops++; }

  let maxDepth = 0, depth = 0;
  for (const ch of code) {
    if (ch === '{') { depth++; if (depth > maxDepth) maxDepth = depth; }
    else if (ch === '}') depth--;
  }

  return {
    complexity,
    branches,
    loops,
    depth: maxDepth,
    rating: complexity <= 5 ? 'simple' : complexity <= 10 ? 'moderate' : complexity <= 20 ? 'complex' : 'very-complex',
  };
}
measureComplexity.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 7,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
};

/**
 * GAP 14: Medium-weight transforming COMPARISON function
 * Pure, computed (gas), valence 0, O(n)
 *
 * Deep structural equality for plain objects and arrays.
 * Medium-weight because it recurses. harmPotential 'minimal'
 * because deep comparison on circular structures could hang,
 * so we cap recursion depth.
 */
function deepEqual(a, b, maxDepth = 20) {
  return _deepEq(a, b, 0, maxDepth);
}
function _deepEq(a, b, depth, maxDepth) {
  if (depth > maxDepth) return false;
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  const isArrA = Array.isArray(a), isArrB = Array.isArray(b);
  if (isArrA !== isArrB) return false;
  if (isArrA) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!_deepEq(a[i], b[i], depth + 1, maxDepth)) return false;
    }
    return true;
  }
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!_deepEq(a[k], b[k], depth + 1, maxDepth)) return false;
  }
  return true;
}
deepEqual.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 3,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 15: Light-weight transforming TRANSFORM function (mutable)
 * Mutates target (liquid phase), valence 0, O(n)
 *
 * Shallow-assigns properties from sources into target, mutating it.
 * Liquid phase because state changes. Returns the target for chaining.
 */
function mutAssign(target, ...sources) {
  if (!target || typeof target !== 'object') return target;
  for (const src of sources) {
    if (src && typeof src === 'object') {
      for (const key of Object.keys(src)) target[key] = src[key];
    }
  }
  return target;
}
mutAssign.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 16: Light-weight transforming TRANSFORM function (reactive stream)
 * Plasma phase (reactive stream), valence 0, O(1) per event
 *
 * Creates a reactive map — wraps an EventEmitter so every emitted
 * value is transformed through a mapping function before re-emission.
 * Plasma phase = reactive stream processing.
 */
function reactiveMap(emitter, event, fn) {
  const { EventEmitter } = require('events');
  const mapped = new EventEmitter();
  emitter.on(event, (...args) => {
    try { mapped.emit(event, fn(...args)); }
    catch { /* swallow transform errors in stream */ }
  });
  mapped._source = emitter;
  mapped._event = event;
  return mapped;
}
reactiveMap.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'plasma',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 17: Light-weight transforming FILTER function
 * Pure, computed (gas), valence 0, O(n)
 *
 * Removes all falsy values from an array (null, undefined, 0, '', false, NaN).
 * Pure — returns a new array.
 */
function compact(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(Boolean);
}
compact.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 12, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 18: Light-weight transforming TRANSFORM function (minimal harm)
 * Pure, computed (gas), valence 0, O(1)
 *
 * Applies a transform function with an error boundary. If the
 * transform throws, returns the fallback. harmPotential 'minimal'
 * because swallowing errors can mask bugs — but the fallback makes
 * this safer than an unguarded transform.
 */
function safeTransform(value, fn, fallback) {
  try { return fn(value); }
  catch { return fallback; }
}
safeTransform.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 19: Light-weight contracting COMPARISON function (cached)
 * Pure, cached (solid), valence 1, charge -1, O(n)
 *
 * Checks if every element in `subset` exists in `superset`.
 * Contracting (charge -1) because it reduces two collections to
 * a single boolean. Valence 1 = composes with one other function.
 * Cached because the Set is built once per call.
 */
function isSubsetOf(subset, superset) {
  if (!Array.isArray(subset) || !Array.isArray(superset)) return false;
  const superSet = new Set(superset);
  return subset.every(item => superSet.has(item));
}
isSubsetOf.atomicProperties = {
  charge: -1, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.2, group: 2, period: 2,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
};

/**
 * GAP 20: Light-weight expanding AGGREGATE function (cached)
 * Pure, cached (solid), valence 2, charge +1, stable, healing, benevolent
 *
 * A coherency accumulator — takes a stream of scores and maintains
 * a running weighted average that grows signal strength over time.
 * Expanding (charge +1) because it ADDS information.
 * Healing alignment + benevolent intention because it strengthens
 * coherency signals rather than degrading them.
 */
function coherencyAccumulator(options = {}) {
  const decay = options.decay || 0.95;
  const minSamples = options.minSamples || 3;
  let weightedSum = 0;
  let weightTotal = 0;
  let count = 0;
  let peak = 0;

  return {
    add(score, weight = 1) {
      weightedSum = weightedSum * decay + score * weight;
      weightTotal = weightTotal * decay + weight;
      count++;
      if (score > peak) peak = score;
    },
    value() {
      if (count < minSamples || weightTotal === 0) return 0;
      return Math.round((weightedSum / weightTotal) * 1000) / 1000;
    },
    confidence() {
      return Math.min(1, count / (minSamples * 3));
    },
    peak() { return peak; },
    count() { return count; },
    reset() { weightedSum = 0; weightTotal = 0; count = 0; peak = 0; },
  };
}
coherencyAccumulator.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.6, group: 13, period: 3,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
};

module.exports = {
  memoizeOne,
  clamp,
  truncate,
  analyzeModuleCoverage,
  atomicDistance,
  sortByKey,
  sortInPlace,
  errorSentinel,
  unique,
  pick,
  formatBytes,
  parseQueryString,
  measureComplexity,
  deepEqual,
  mutAssign,
  reactiveMap,
  compact,
  safeTransform,
  isSubsetOf,
  coherencyAccumulator,
};
