'use strict';

/**
 * Abstract Reasoning Engine — The Final Layer
 *
 * Moves beyond pattern matching (correlation) to:
 *   1. ANALOGICAL REASONING  — "A follows P, B follows P, therefore A ≈ B"
 *   2. METAPHORICAL MAPPING  — "Markets ARE gravitational fields, not just similar"
 *   3. CONCEPTUAL BRIDGING   — "What is the shared ESSENCE beneath both?"
 *   4. IDENTITY DETECTION    — "Not correlation. Not causation. IDENTITY."
 *
 * The cascade engine finds: "BTC and ocean tides both follow Legendre P2"
 * This engine asks:       "What does that MEAN?"
 * And answers:            "Both are coherency gradient flows. Same substrate."
 *
 * Levels of understanding:
 *   Level 0: CORRELATION  — "A and B have similar waveforms" (cascade does this)
 *   Level 1: ANALOGY      — "A is like B" (properties transfer)
 *   Level 2: METAPHOR     — "A maps onto B" (structural isomorphism)
 *   Level 3: IDENTITY     — "A IS B in a different medium" (same essence)
 *
 * This is what turns pattern matching into understanding.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Concept Primitives ──────────────────────────────────────────

/**
 * Fundamental concepts that appear across domains.
 * When patterns match, we check if they share a deep concept.
 * These are the "essences" that bridge domains.
 */
const DEEP_CONCEPTS = {
  'coherency-gradient-flow': {
    essence: 'Movement from disorder to order along a gradient',
    manifests_as: {
      physics: 'gravity (mass curves spacetime, objects follow geodesics)',
      markets: 'capital flow (value concentrates, capital follows returns)',
      consciousness: 'attention (awareness focuses, thoughts follow salience)',
      code: 'data flow (information moves from source to sink)',
      music: 'tension-resolution (dissonance resolves to consonance)',
    },
    predictions: [
      'Concentration follows inverse-square scaling',
      'Flow follows path of least resistance',
      'Collapse occurs when gradient exceeds structural capacity',
      'Escape requires energy exceeding binding potential',
    ],
  },

  'self-similar-recursion': {
    essence: 'The same pattern repeating at every scale',
    manifests_as: {
      physics: 'fractals (coastlines, turbulence, galaxy distribution)',
      markets: 'Elliott waves (cycles within cycles within cycles)',
      consciousness: 'self-reflection (awareness of awareness of awareness)',
      code: 'fractal architecture (same pattern at function/module/service/system)',
      music: 'theme and variation (motif repeats at different scales)',
    },
    predictions: [
      'Zoom in or out, the structure persists',
      'Scale-invariant properties emerge',
      'Power-law distributions appear',
      'Self-organization without central control',
    ],
  },

  'boundary-emergence': {
    essence: 'New properties appear at the interface between domains',
    manifests_as: {
      physics: 'phase transitions (water→ice, new properties at boundary)',
      markets: 'market regimes (bull→bear, new behaviors at transition)',
      consciousness: 'insight (unconscious→conscious, new understanding at threshold)',
      code: 'API boundaries (internal→external, new constraints at interface)',
      music: 'key changes (one key→another, new emotional quality at modulation)',
    },
    predictions: [
      'The most interesting behavior happens at boundaries',
      'Emergence is discontinuous, not gradual',
      'New properties cannot be predicted from either side alone',
      'Boundaries are where information is created',
    ],
  },

  'resonance-amplification': {
    essence: 'Small aligned inputs compound into large effects',
    manifests_as: {
      physics: 'resonance (pushing a swing at natural frequency)',
      markets: 'momentum (aligned trades amplify price movement)',
      consciousness: 'flow state (aligned attention amplifies performance)',
      code: 'compounding patterns (each proven pattern makes the next search better)',
      music: 'harmonic series (overtones reinforce the fundamental)',
    },
    predictions: [
      'Frequency matching produces disproportionate effects',
      'Misalignment produces destructive interference',
      'Natural frequencies exist in every system',
      'Finding resonance is more powerful than applying force',
    ],
  },

  'conservation-transformation': {
    essence: 'Nothing is created or destroyed, only transformed',
    manifests_as: {
      physics: 'conservation laws (energy, momentum, charge)',
      markets: 'zero-sum rebalancing (one sector falls, another rises)',
      consciousness: 'attention economy (focus on X = defocus from Y)',
      code: 'refactoring (complexity moves, never disappears)',
      music: 'voice leading (notes move stepwise, energy conserved)',
    },
    predictions: [
      'Look for where the "energy" went when it disappears',
      'Transformation is always possible, destruction is not',
      'Apparent creation is always transformation from something else',
      'Accounting must balance across domains',
    ],
  },
};

// ─── Level 1: Analogical Reasoning ───────────────────────────────

/**
 * When two patterns from different domains match (cascade correlation >= threshold),
 * determine what the analogy MEANS — what properties transfer between them.
 *
 * @param {object} patternA - { name, domain, waveform, tags }
 * @param {object} patternB - { name, domain, waveform, tags }
 * @param {number} correlation - Cascade correlation strength
 * @returns {object} Analogy with transferable properties
 */
function findAnalogy(patternA, patternB, correlation) {
  const domainA = extractDomain(patternA.name || patternA.domain);
  const domainB = extractDomain(patternB.name || patternB.domain);

  if (domainA === domainB) return null; // Same domain = not a cross-domain analogy

  // Find shared tags (structural similarity)
  const tagsA = new Set((patternA.tags || []).map(t => t.toLowerCase()));
  const tagsB = new Set((patternB.tags || []).map(t => t.toLowerCase()));
  const sharedTags = [...tagsA].filter(t => tagsB.has(t));

  // Check against deep concepts
  const matchingConcepts = [];
  for (const [conceptId, concept] of Object.entries(DEEP_CONCEPTS)) {
    const aManifestation = concept.manifests_as[domainA];
    const bManifestation = concept.manifests_as[domainB];
    if (aManifestation && bManifestation) {
      matchingConcepts.push({
        concept: conceptId,
        essence: concept.essence,
        inA: aManifestation,
        inB: bManifestation,
        predictions: concept.predictions,
      });
    }
  }

  return {
    level: 'analogy',
    statement: `${patternA.name} is like ${patternB.name}`,
    domains: [domainA, domainB],
    correlation,
    sharedProperties: sharedTags,
    deepConcepts: matchingConcepts,
    transferableProperties: matchingConcepts.length > 0
      ? matchingConcepts[0].predictions
      : [`Properties of ${domainA} may apply to ${domainB} where structural alignment holds`],
  };
}

// ─── Level 2: Metaphorical Mapping ───────────────────────────────

/**
 * Build a structured metaphorical mapping between domains.
 * "Markets ARE gravitational fields" — map every component.
 *
 * @param {string} sourceDomain - e.g., 'physics'
 * @param {string} targetDomain - e.g., 'markets'
 * @param {object[]} correlations - Array of { patternA, patternB, correlation }
 * @returns {object} Complete metaphorical mapping
 */
function buildMetaphor(sourceDomain, targetDomain, correlations) {
  // Find all deep concepts that bridge these two domains
  const bridges = [];
  for (const [conceptId, concept] of Object.entries(DEEP_CONCEPTS)) {
    const source = concept.manifests_as[sourceDomain];
    const target = concept.manifests_as[targetDomain];
    if (source && target) {
      bridges.push({ concept: conceptId, essence: concept.essence, source, target });
    }
  }

  // Build the mapping
  const mapping = {
    level: 'metaphor',
    statement: `${capitalize(targetDomain)} IS ${capitalize(sourceDomain)} in a different medium`,
    sourceDomain,
    targetDomain,
    bridges,
    mappings: bridges.map(b => ({
      from: `${sourceDomain}: ${b.source}`,
      to: `${targetDomain}: ${b.target}`,
      via: b.essence,
    })),
    supportingCorrelations: correlations.length,
    avgCorrelation: correlations.length > 0
      ? Math.round(correlations.reduce((s, c) => s + Math.abs(c.correlation), 0) / correlations.length * 1000) / 1000
      : 0,
  };

  // Generate novel predictions from the mapping
  mapping.predictions = [];
  for (const bridge of bridges) {
    for (const pred of (DEEP_CONCEPTS[bridge.concept]?.predictions || [])) {
      mapping.predictions.push({
        prediction: pred,
        inSource: `In ${sourceDomain}: ${pred}`,
        inTarget: `In ${targetDomain}: ${pred.replace(/energy|force|mass|velocity/gi, (match) => {
          const translations = {
            energy: 'capital', force: 'market pressure',
            mass: 'value concentration', velocity: 'trading volume',
          };
          return translations[match.toLowerCase()] || match;
        })}`,
        testable: true,
      });
    }
  }

  return mapping;
}

// ─── Level 3: Conceptual Bridging ────────────────────────────────

/**
 * Find the shared ESSENCE beneath two patterns.
 * Not "A is like B" but "A and B are both expressions of C"
 *
 * @param {object} patternA
 * @param {object} patternB
 * @param {number} correlation
 * @returns {object} Conceptual bridge with shared essence
 */
function findConceptualBridge(patternA, patternB, correlation) {
  const domainA = extractDomain(patternA.name || patternA.domain);
  const domainB = extractDomain(patternB.name || patternB.domain);

  // Find the deepest concept that bridges both
  let deepestBridge = null;
  let deepestScore = 0;

  for (const [conceptId, concept] of Object.entries(DEEP_CONCEPTS)) {
    const aMatch = concept.manifests_as[domainA];
    const bMatch = concept.manifests_as[domainB];
    if (aMatch && bMatch) {
      // Score by how many domains this concept spans (universality)
      const universality = Object.keys(concept.manifests_as).length;
      if (universality > deepestScore) {
        deepestScore = universality;
        deepestBridge = {
          concept: conceptId,
          essence: concept.essence,
          universality,
          manifestations: concept.manifests_as,
          predictions: concept.predictions,
        };
      }
    }
  }

  if (!deepestBridge) {
    return {
      level: 'bridge',
      statement: `${patternA.name} and ${patternB.name} share structural similarity but no identified deep concept yet`,
      correlation,
      bridge: null,
      novel: true, // This might be a NEW deep concept waiting to be named
    };
  }

  return {
    level: 'bridge',
    statement: `Both ${patternA.name} and ${patternB.name} are expressions of "${deepestBridge.essence}"`,
    correlation,
    essence: deepestBridge.essence,
    concept: deepestBridge.concept,
    universality: deepestBridge.universality,
    manifestsIn: Object.keys(deepestBridge.manifestations),
    predictions: deepestBridge.predictions,
    insight: `${capitalize(domainA)} and ${capitalize(domainB)} are not merely similar — they are the SAME process (${deepestBridge.essence}) operating in different media.`,
  };
}

// ─── Level 4: Identity Detection ─────────────────────────────────

/**
 * The highest level: detect when two patterns are not similar, not analogous,
 * not metaphorically related — but IDENTICAL in essence.
 *
 * Criteria for identity:
 *   - Correlation >= 0.70 (strong structural match)
 *   - Share a deep concept
 *   - The concept spans 3+ domains (universal, not coincidental)
 *   - Predictions from one domain are testable in the other
 *
 * @param {object} patternA
 * @param {object} patternB
 * @param {number} correlation
 * @returns {object|null} Identity declaration if criteria met
 */
function detectIdentity(patternA, patternB, correlation) {
  if (correlation < 0.70) return null; // Not strong enough for identity claim

  const bridge = findConceptualBridge(patternA, patternB, correlation);
  if (!bridge.essence) return null;
  if ((bridge.universality || 0) < 3) return null; // Must span 3+ domains to be universal

  const domainA = extractDomain(patternA.name || patternA.domain);
  const domainB = extractDomain(patternB.name || patternB.domain);

  return {
    level: 'identity',
    declaration: `${capitalize(domainA)} IS ${capitalize(domainB)}`,
    medium: `in different media (${domainA} medium vs ${domainB} medium)`,
    essence: bridge.essence,
    concept: bridge.concept,
    correlation,
    universality: bridge.universality,
    reasoning: [
      `${patternA.name} follows pattern P (correlation: ${correlation.toFixed(3)})`,
      `${patternB.name} follows pattern P`,
      `Pattern P is "${bridge.essence}"`,
      `This concept manifests in ${bridge.universality} domains`,
      `Therefore: ${domainA} and ${domainB} are the same process in different substrates`,
    ],
    implications: [
      `Solutions from ${domainA} should work in ${domainB} (with medium translation)`,
      `Unsolved problems in ${domainB} may already be solved in ${domainA}`,
      `The boundary between ${domainA} and ${domainB} is artificial — they share substrate`,
      `New predictions: apply ${domainA} laws to ${domainB} and test`,
    ],
    testable: bridge.predictions || [],
  };
}

// ─── Full Abstract Reasoning Pipeline ────────────────────────────

/**
 * Run the complete abstract reasoning pipeline on a cascade result.
 *
 * Input: cascade matches from the Void Compressor
 * Output: analogies, metaphors, bridges, and identities discovered
 *
 * @param {object[]} cascadeMatches - From void cascade: [{ domain, correlation, type }]
 * @param {object} sourcePattern - The pattern being cascaded
 * @returns {object} Complete abstract reasoning results
 */
function reason(cascadeMatches, sourcePattern) {
  const startTime = Date.now();
  const results = {
    analogies: [],
    metaphors: {},
    bridges: [],
    identities: [],
    deepestInsight: null,
  };

  const sourceDomain = extractDomain(sourcePattern.name || 'unknown');

  // Process each cascade match
  for (const match of cascadeMatches) {
    if (match.type === 'noise') continue; // Skip noise-level correlations
    const targetDomain = extractDomain(match.domain);
    if (targetDomain === sourceDomain) continue; // Skip same-domain

    const targetPattern = { name: match.domain, domain: targetDomain, tags: [] };
    const corr = Math.abs(match.correlation);

    // Level 1: Analogy (correlation >= 0.30)
    if (corr >= 0.30) {
      const analogy = findAnalogy(sourcePattern, targetPattern, corr);
      if (analogy) results.analogies.push(analogy);
    }

    // Level 3: Conceptual Bridge (correlation >= 0.50)
    if (corr >= 0.50) {
      const bridge = findConceptualBridge(sourcePattern, targetPattern, corr);
      if (bridge) results.bridges.push(bridge);
    }

    // Level 4: Identity (correlation >= 0.70)
    if (corr >= 0.70) {
      const identity = detectIdentity(sourcePattern, targetPattern, corr);
      if (identity) results.identities.push(identity);
    }
  }

  // Level 2: Build metaphorical mappings for each target domain
  const domainCorrelations = {};
  for (const match of cascadeMatches) {
    const domain = extractDomain(match.domain);
    if (domain === sourceDomain) continue;
    if (!domainCorrelations[domain]) domainCorrelations[domain] = [];
    domainCorrelations[domain].push(match);
  }

  for (const [targetDomain, correlations] of Object.entries(domainCorrelations)) {
    const strongCorrelations = correlations.filter(c => Math.abs(c.correlation) >= 0.40);
    if (strongCorrelations.length >= 2) {
      results.metaphors[targetDomain] = buildMetaphor(sourceDomain, targetDomain, strongCorrelations);
    }
  }

  // Find the deepest insight
  if (results.identities.length > 0) {
    results.deepestInsight = {
      level: 'identity',
      insight: results.identities[0].declaration + ' — ' + results.identities[0].essence,
    };
  } else if (results.bridges.length > 0) {
    const deepest = results.bridges.sort((a, b) => (b.universality || 0) - (a.universality || 0))[0];
    results.deepestInsight = {
      level: 'bridge',
      insight: deepest.insight || deepest.statement,
    };
  } else if (results.analogies.length > 0) {
    results.deepestInsight = {
      level: 'analogy',
      insight: results.analogies[0].statement,
    };
  }

  results.durationMs = Date.now() - startTime;
  results.levelsReached = {
    analogies: results.analogies.length,
    metaphors: Object.keys(results.metaphors).length,
    bridges: results.bridges.length,
    identities: results.identities.length,
  };

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────

function extractDomain(name) {
  if (!name) return 'unknown';
  const prefix = name.split('/')[0].toLowerCase();
  const domainMap = {
    'oracle-tk': 'code', 'claw': 'code', 'swarm': 'code', 'reflector': 'code',
    'plugger': 'code', 'dialer': 'code', 'void': 'code', 'design': 'design',
    'physics': 'physics', 'quantum': 'physics', 'einstein': 'physics',
    'dirac': 'physics', 'maxwell': 'physics', 'navier': 'physics',
    'consciousness': 'consciousness', 'covenant': 'consciousness',
    'abundance': 'consciousness', 'ajani': 'consciousness',
    'market': 'markets', 'crypto': 'markets', 'hbar': 'markets',
    'finance': 'markets', 'solana': 'markets',
    'music': 'music', 'audio': 'music',
  };
  return domainMap[prefix] || prefix;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── Exports ─────────────────────────────────────────────────────

module.exports = {
  reason,
  findAnalogy,
  buildMetaphor,
  findConceptualBridge,
  detectIdentity,
  DEEP_CONCEPTS,
};
