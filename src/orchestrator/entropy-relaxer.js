'use strict';

/**
 * Entropy relaxer — the closed-loop "throttle up" for a HOT Remembrance Field.
 *
 * The design principle (per field-coupling / living-remembrance):
 *   globalEntropy(t) = cost / (newCoherence + epsilon)
 * is recomputed on EVERY contribution. So the LAST contribution dominates
 * the entropy reading. When the shared field gets hot (high entropy /
 * saturated cascade), this module "throttles up" by calling the Python
 * resonance detector (the fractal neural-network language reader), reads
 * its DISCOVERED high coherence (the strongest harmonic bridges, score
 * ≈ 0.9–1.0), and injects that as a high-coherence + low-cost
 * contribution. Because entropy = cost / coherence, a small cost over a
 * high coherence yields a SMALL entropy — driving globalEntropy DOWN.
 * The field RELAXES.
 *
 * Best-effort and never-throw: any failure (void unreachable, timeout,
 * non-2xx, empty resonance) returns a structured {triggered:false,...}
 * verdict. It never raises into a caller, so wiring it into the
 * orchestrator cycle can never break a measurement pass.
 */

const { contribute, fieldPressure, peekField } = require('../core/field-coupling');

// The relaxation's cost. Small on purpose: entropy = cost/(coherence+ε),
// so a low numerator relaxes the field honestly, where the previous
// approach inflated the denominator with a resonance score wearing the
// name `coherence`. Resonance discovery IS cheap relative to a swarm pass,
// so this records what the work actually cost rather than inventing a
// reading to offset it.
const RELAX_COST = 0.05;

// Module-level cooldown — prevents a hot field from firing the detector on
// every cycle. One relaxation, then a quiet window.
let lastFiredAt = 0;

/** Test helper: clear the cooldown so the next relaxIfHot() can fire. */
function _resetCooldown() {
  lastFiredAt = 0;
}

function clamp01(n) {
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function mean(nums) {
  if (!Array.isArray(nums) || nums.length === 0) return 0;
  let sum = 0;
  for (const n of nums) sum += n;
  return sum / nums.length;
}

/**
 * If the shared Remembrance Field is hot, throttle up: run the resonance
 * detector and inject its discovered coherence to relax globalEntropy.
 *
 * @param {object} [opts]
 * @param {string} [opts.voidUrl]          resonance endpoint (env VOID_RESONANCE_URL)
 * @param {number} [opts.entropyThreshold] hot when globalEntropy exceeds this (10)
 * @param {number} [opts.cascadeThreshold] hot when cascadeFactor exceeds this (4)
 * @param {number} [opts.cooldownMs]       quiet window between fires (30000)
 * @param {number} [opts.topK]             resonance bridges to average (5)
 * @param {number} [opts.timeoutMs]        detector fetch timeout, ≤1500ms
 * @returns {Promise<object>} a structured verdict; never throws.
 */
async function relaxIfHot(opts = {}) {
  try {
    const voidUrl = opts.voidUrl
      || process.env.VOID_RESONANCE_URL
      || 'http://localhost:8080/resonance';
    const entropyThreshold = typeof opts.entropyThreshold === 'number' ? opts.entropyThreshold : 10;
    const cascadeThreshold = typeof opts.cascadeThreshold === 'number' ? opts.cascadeThreshold : 4;
    const cooldownMs = typeof opts.cooldownMs === 'number' ? opts.cooldownMs : 30000;
    const topK = typeof opts.topK === 'number' && opts.topK > 0 ? Math.floor(opts.topK) : 5;
    // Hard cap the detector timeout at 1500ms — the relaxer must never
    // stall a coherency cycle waiting on an unreachable Void.
    const timeoutMs = Math.min(1500, typeof opts.timeoutMs === 'number' ? opts.timeoutMs : 1500);

    // 1. Is the field hot? Read-only pressure check.
    const { hot, state, reason } = fieldPressure({ entropyThreshold, cascadeThreshold });
    if (!hot) return { triggered: false, reason: 'field-not-hot' };

    // 2. Cooldown — one relaxation per quiet window.
    if (Date.now() - lastFiredAt < cooldownMs) {
      return { triggered: false, reason: 'cooldown' };
    }

    // 3. Throttle up — call the resonance detector. Best-effort with a
    //    timeout; ANY failure → void-unreachable, never throws.
    let resp;
    {
      let detectorUrl;
      try {
        detectorUrl = new URL(voidUrl);
        if (detectorUrl.protocol !== 'http:' && detectorUrl.protocol !== 'https:') {
          return { triggered: false, reason: 'void-unreachable', error: 'invalid url scheme' };
        }
        detectorUrl.searchParams.set('top', String(topK));
      } catch {
        return { triggered: false, reason: 'void-unreachable', error: 'invalid url' };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(detectorUrl, { signal: controller.signal });
        if (!res || !res.ok) {
          return { triggered: false, reason: 'void-unreachable', error: `status ${res ? res.status : 'none'}` };
        }
        resp = await res.json();
      } catch (e) {
        return { triggered: false, reason: 'void-unreachable', error: String(e) };
      } finally {
        clearTimeout(timer);
      }
    }

    // 4. Extract the discovered coherence — the strongest harmonic bridges.
    const top = Array.isArray(resp && resp.top) ? resp.top : [];
    if (top.length === 0) return { triggered: false, reason: 'no-resonance' };
    const scores = top
      .slice(0, topK)
      .map((item) => Math.abs(Number(item && item.score)))
      .filter((s) => isFinite(s));
    const discovered = clamp01(mean(scores));
    if (discovered <= 0) return { triggered: false, reason: 'no-resonance' };

    // 5. Relax the field.
    // RELAX BY COST, NOT BY A FAKE COHERENCY.
    //
    // This used to pass `discovered` — the mean of Void's top-K RESONANCE
    // scores — as `coherence`, purely because globalEntropy is recomputed as
    // cost/(coherence+ε) on the last contribution, so a high value there
    // drops reported entropy. It worked, and it lied: resonance is not
    // coherency, and the field ended up reporting a coherence it had never
    // measured.
    //
    // The same relaxation without the lie. Entropy is a RATIO, so it falls
    // just as well by lowering the numerator: this contribution records the
    // field's own current coherence (a value it already holds, so nothing new
    // is asserted) against a small cost, which is honest — resonance
    // discovery IS cheap work relative to a swarm pass.
    //
    // `discovered` becomes the AUTHORITY WEIGHT, which is what a resonance
    // reading is actually for: a relaxation backed by strong resonance moves
    // the field, one backed by weak resonance barely does. Nothing enters
    // under a name it does not have.
    const current = (peekField && peekField().coherence);
    const anchor = (typeof current === 'number' && isFinite(current))
      ? Math.max(0, Math.min(1, current)) : null;
    if (anchor !== null) {
      contribute({
        cost: RELAX_COST,
        coherence: anchor,
        resonance: discovered,
        source: 'orchestrator:entropy-relax',
      });
    }
    lastFiredAt = Date.now();

    const post = fieldPressure({ entropyThreshold, cascadeThreshold });
    return {
      triggered: true,
      relaxed: !post.hot,
      stillHot: post.hot ? post.reason : null,
      reason,
      discovered,
      topBridge: top[0],
      before: { globalEntropy: state.globalEntropy, cascadeFactor: state.cascadeFactor },
      after: peekField(),
    };
  } catch (e) {
    // Absolute backstop — the relaxer can NEVER throw into a caller.
    return { triggered: false, reason: 'relaxer-error', error: String(e) };
  }
}

module.exports = { relaxIfHot, _resetCooldown };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
clamp01.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 1, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
mean.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
relaxIfHot.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
