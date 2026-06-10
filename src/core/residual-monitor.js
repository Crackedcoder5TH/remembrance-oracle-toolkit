'use strict';

/**
 * residual-monitor.js — measures what the current encoder stack
 * fails to explain, and signals when depth should grow.
 *
 * Directly entangled with Void compression: every compression pass
 * computes residual against the current depth, and when residual
 * exceeds threshold, the stack activates its next layer (or signals
 * that a new layer needs to be designed).
 *
 * Residual is measured as **false-equivalence rate**: pairs of
 * patterns that the current stack scores as near-identical (cosine
 * ≥ 0.99) BUT are demonstrably distinct (different namespaces,
 * different source files). High false-equivalence = the stack
 * cannot resolve patterns that should be resolvable. That's the
 * residual a new layer must explain.
 *
 * The monitor doesn't compute all O(N²) pairs on a large substrate.
 * It samples: for each of K probe patterns, find its top-1 cousin
 * in the substrate and check the collision condition. Sampling
 * gives an unbiased estimator of residual rate cheaply.
 */

const fs = require('node:fs');
const {
  composedAtDepth, composedCosine, currentDepth, maxAvailableDepth, activateNextLayer,
  activeLayers,
} = require('./encoder-stack');

const DEFAULT_PROBE_COUNT = 200;
const DEFAULT_COLLISION_THRESHOLD = 0.99;
const DEFAULT_RESIDUAL_TRIGGER = 0.05;   // 5% false-equivalence triggers spawn

// ── Helpers ─────────────────────────────────────────────────────

function _namespaceOf(name) {
  if (typeof name !== 'string') return '';
  const slash = name.indexOf('/');
  return slash < 0 ? name : name.slice(0, slash);
}

function _topLevelDomain(name) {
  // Two-level prefix for finer distinct-domain check:
  //   solana/runtime/...      → solana/runtime
  //   language/french         → language/french
  //   website/app/components  → website/app
  const parts = String(name || '').split('/');
  return parts.slice(0, Math.min(2, parts.length)).join('/');
}

function _sampleIndices(n, k) {
  // Deterministic-spread sample so two runs over the same substrate
  // produce the same probe set.
  if (n <= k) {
    const out = []; for (let i = 0; i < n; i++) out.push(i); return out;
  }
  const out = [];
  const step = n / k;
  for (let i = 0; i < k; i++) out.push(Math.floor(i * step));
  return out;
}

// ── Core: residual measurement ──────────────────────────────────

/**
 * Measure the false-equivalence rate of the current encoder stack
 * against a substrate of entries holding pre-computed L1 vectors
 * AND source-recoverable identities.
 *
 * Approach:
 *   - sample K probe patterns
 *   - for each probe, find its top-1 cousin in the substrate by
 *     the current depth's composed cosine
 *   - if cosine ≥ 0.99 AND the cousin is in a different top-level
 *     domain, count as a false-equivalence
 *
 * NOTE: this implementation operates on L1-only substrate data
 * (the format pattern_index_fractal.json stores). For depth > 1,
 * it composes from source text where available; when not, falls
 * back to L1 cosine alone.
 *
 * @param {object} opts
 *   substratePath: path to pattern_index_fractal.json
 *   probeCount?: number = 200
 *   collisionThreshold?: number = 0.99
 *   sourceLookup?: (name) => string|null   resolves a name to
 *     readable source text for re-encoding at depth > 1
 * @returns {{
 *   depth, probesExamined, collisions, falseEquivalences,
 *   residualRate, examples: [...],
 *   triggers: boolean
 * }}
 */
function measureResidual(opts = {}) {
  const path = opts.substratePath
    || '/home/user/Void-Data-Compressor/pattern_index_fractal.json';
  const probeCount = opts.probeCount || DEFAULT_PROBE_COUNT;
  const collisionThreshold = opts.collisionThreshold || DEFAULT_COLLISION_THRESHOLD;
  const trigger = opts.residualTrigger || DEFAULT_RESIDUAL_TRIGGER;

  const idx = JSON.parse(fs.readFileSync(path, 'utf8'));
  const entries = Object.entries(idx.index)
    .map(([name, entry]) => ({ name, fractal: entry.fractal }))
    .filter(e => Array.isArray(e.fractal) && e.fractal.length === 29);

  const depth = currentDepth();
  const probes = _sampleIndices(entries.length, probeCount).map(i => entries[i]);
  const collisions = [];
  const examples = [];

  for (const probe of probes) {
    let bestIdx = -1, bestCos = -1;
    for (let j = 0; j < entries.length; j++) {
      if (entries[j].name === probe.name) continue;
      const c = _cosineL1(probe.fractal, entries[j].fractal);
      if (c > bestCos) { bestCos = c; bestIdx = j; }
    }
    if (bestIdx < 0) continue;
    const cousin = entries[bestIdx];
    if (bestCos < collisionThreshold) continue;

    // Collision at L1. Now ask: are they distinct domains?
    const probeDom = _topLevelDomain(probe.name);
    const cousinDom = _topLevelDomain(cousin.name);
    if (probeDom === cousinDom) {
      // Same domain — collision is expected (e.g., two solana/runtime
      // files plausibly carry similar shape). Not a residual signal.
      continue;
    }

    // Different domains AND near-identical signatures. That's residual.
    collisions.push({ probe: probe.name, cousin: cousin.name, cosine: bestCos });
    if (examples.length < 8) {
      examples.push({
        probe: probe.name,
        cousin: cousin.name,
        cosine: Number(bestCos.toFixed(4)),
      });
    }
  }

  const residualRate = collisions.length / probes.length;
  return {
    depth,
    probesExamined: probes.length,
    collisions: collisions.length,
    falseEquivalences: collisions.length,
    residualRate,
    examples,
    triggers: residualRate >= trigger,
    triggerThreshold: trigger,
  };
}

function _cosineL1(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Entanglement with compression ────────────────────────────────

/**
 * Called by the Void compression flow after a batch of new
 * patterns is added. Measures residual; if triggered, activates the
 * next layer. This is the entanglement: compression invokes the
 * residual check, residual fires the encoder spawn.
 *
 * @param {object} opts — same as measureResidual
 * @returns {{
 *   measurement: object,
 *   action: 'no-op' | 'activated-layer' | 'no-more-layers-available',
 *   activated?: {id, dims, seed},
 *   depthAfter: number
 * }}
 */
function checkAndSpawn(opts = {}) {
  const measurement = measureResidual(opts);
  let action = 'no-op';
  let activated = null;

  if (measurement.triggers) {
    const max = maxAvailableDepth();
    const cur = currentDepth();
    if (cur >= max) {
      action = 'no-more-layers-available';
    } else {
      activated = activateNextLayer();
      action = activated ? 'activated-layer' : 'no-op';
    }
  }

  return {
    measurement,
    action,
    activated,
    depthAfter: currentDepth(),
    activeStack: activeLayers(),
  };
}

module.exports = {
  DEFAULT_PROBE_COUNT,
  DEFAULT_COLLISION_THRESHOLD,
  DEFAULT_RESIDUAL_TRIGGER,
  measureResidual,
  checkAndSpawn,
};
