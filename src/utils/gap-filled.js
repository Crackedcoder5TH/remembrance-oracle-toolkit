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
      const hasAtomic = new RegExp(`${name}\\.atomicProperties`).test(code);
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

module.exports = {
  memoizeOne,
  clamp,
  truncate,
  analyzeModuleCoverage,
  atomicDistance,
};
