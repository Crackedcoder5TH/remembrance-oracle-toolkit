'use strict';

/**
 * Role-Aware Coherence — an alternative to interactionCoherence() that
 * rewards FUNCTIONAL COMPLEMENTARITY instead of property similarity.
 *
 * Why this exists:
 *   The original interactionCoherence rewards same-phase, same-mass,
 *   charge-balanced-to-zero. That works for compressing homogeneous pattern
 *   libraries but penalizes a DIVERSE covenant. A covenant's elements cover
 *   different roles (validate, sanitize, guard, audit, accumulate) — those
 *   roles inherently need different properties. Measuring them with
 *   similarity-math produces artificially low coherence.
 *
 * The role-aware math instead rewards:
 *   - charge -1 ↔ +1 pairs (contract + expand = full cycle)
 *   - phase solid ↔ gas pairs (cache feeds compute)
 *   - mass off-by-one pairs (wrapper + implementation layering)
 *   - reactivity inert ↔ stable pairs (pure trusts stable)
 *   - intent-complementary function names (validator × mutator, etc)
 *
 * It still enforces covenant invariants strictly:
 *   - both must have harm ≤ minimal
 *   - both must have healing or neutral alignment
 *   - neither can have malevolent intention
 *
 * Usage:
 *   const { roleAwareCoherence } = require('./role-aware-coherence');
 *   const score = roleAwareCoherence(el1, el2);
 *   // 0-1 score reflecting how well these two elements combine FUNCTIONALLY
 */

const INTENT_CATEGORIES = {
  validator: /^(is|has|can|should|check|validate|verify|ensure|assert)/i,
  sanitizer: /^(sanitize|clean|escape|redact|strip|normalize|purify|scrub)/i,
  guard: /^(guard|protect|secure|authorize|authenticate|permit|allow|deny|require)/i,
  transform: /^(to|from|convert|transform|map|format|parse|serialize|encode|decode|hash|sign)/i,
  query: /^(get|find|search|lookup|fetch|read|load|select|detect|match)/i,
  mutation: /^(set|update|write|save|delete|remove|destroy|drop|rotate)/i,
  aggregate: /^(correlate|aggregate|sum|collect|accumulate|combine|merge)/i,
  healer: /^(heal|repair|fix|refine|optimize|improve|recover)/i,
  destroyer: /^(destroy|kill|wipe|purge|annihilate|corrupt|poison|exploit|attack|bypass)/i,
};

function classifyRole(name) {
  if (typeof name !== 'string' || !name) return 'neutral';
  // Strip any path prefix before the last colon (for "path/file.js:funcName")
  const clean = name.includes(':') ? name.split(':').pop() : name;
  for (const [cat, re] of Object.entries(INTENT_CATEGORIES)) {
    if (re.test(clean)) return cat;
  }
  return 'neutral';
}
classifyRole.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 2, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

// Role pairs: value = complementarity score. Missing pair = 0.5 (neutral).
// Destroyer pairs are forbidden (score 0 → kills overall coherence).
const ROLE_COMPLEMENTARITY = {
  'validator+mutation':  0.95,
  'validator+guard':     0.90,
  'validator+sanitizer': 0.85,
  'sanitizer+transform': 0.90,
  'sanitizer+mutation':  0.85,
  'guard+audit':         0.90,
  'guard+mutation':      0.90,
  'guard+query':         0.85,
  'query+mutation':      0.85,
  'query+aggregate':     0.85,
  'aggregate+transform': 0.85,
  'healer+validator':    0.85,
  'healer+transform':    0.80,
  'transform+mutation':  0.80,
  // Same-role pairs: moderate (cover same territory)
  'validator+validator': 0.70,
  'sanitizer+sanitizer': 0.70,
  'guard+guard':         0.70,
  'transform+transform': 0.70,
  'query+query':         0.70,
  'mutation+mutation':   0.65,
  'aggregate+aggregate': 0.70,
  'healer+healer':       0.70,
  'neutral+neutral':     0.60,
};

function roleComplementarity(roleA, roleB) {
  // Destroyer conflicts with every healing role — score 0
  if (roleA === 'destroyer' || roleB === 'destroyer') return 0;
  const key1 = `${roleA}+${roleB}`;
  const key2 = `${roleB}+${roleA}`;
  if (ROLE_COMPLEMENTARITY[key1] != null) return ROLE_COMPLEMENTARITY[key1];
  if (ROLE_COMPLEMENTARITY[key2] != null) return ROLE_COMPLEMENTARITY[key2];
  // neutral pairs against specific roles
  if (roleA === 'neutral' || roleB === 'neutral') return 0.55;
  return 0.5;
}
roleComplementarity.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 2, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

// Phase-bonding matrix: cross-phase pairs can complement (cache feeds compute)
const PHASE_BONDS = {
  'solid+solid':   0.70,
  'solid+gas':     0.90,  // cache feeds compute
  'solid+liquid':  0.60,
  'solid+plasma':  0.55,
  'gas+gas':       0.70,  // two pure computations compose
  'gas+liquid':    0.60,
  'gas+plasma':    0.75,
  'liquid+liquid': 0.50,  // two mutables can conflict
  'liquid+plasma': 0.50,
  'plasma+plasma': 0.60,
};

function phaseBond(a, b) {
  const key1 = `${a}+${b}`;
  const key2 = `${b}+${a}`;
  return PHASE_BONDS[key1] || PHASE_BONDS[key2] || 0.5;
}

// Reactivity-pairing matrix
const REACT_BONDS = {
  'inert+inert':       0.80,
  'inert+stable':      0.90,  // pure trusts stable
  'inert+reactive':    0.40,
  'inert+volatile':    0.20,
  'stable+stable':     0.75,
  'stable+reactive':   0.70,  // orchestrator manages reactive
  'stable+volatile':   0.45,
  'reactive+reactive': 0.55,
  'reactive+volatile': 0.40,
  'volatile+volatile': 0.30,
};

function reactBond(a, b) {
  const key1 = `${a}+${b}`;
  const key2 = `${b}+${a}`;
  return REACT_BONDS[key1] || REACT_BONDS[key2] || 0.5;
}

function roleAwareCoherence(el1, el2) {
  if (!el1 || !el2 || !el1.properties || !el2.properties) return 0;
  const p1 = el1.properties;
  const p2 = el2.properties;

  // Covenant invariants — hard gates
  if (p1.harmPotential === 'dangerous' || p2.harmPotential === 'dangerous') return 0;
  if (p1.alignment === 'degrading' || p2.alignment === 'degrading') return 0;
  if (p1.intention === 'malevolent' || p2.intention === 'malevolent') return 0;

  let score = 0;
  let dims = 0;

  // 1. Charge: COMPLEMENTARY (-1 × +1) beats IDENTITY for functional pairing
  dims++;
  if (p1.charge + p2.charge === 0 && p1.charge !== 0) score += 1.0;       // +1/-1 cycle
  else if (p1.charge === 0 && p2.charge === 0) score += 0.75;              // two transforms
  else if (p1.charge === 0 || p2.charge === 0) score += 0.75;              // transform + directional
  else if (p1.charge === p2.charge) score += 0.60;                          // same direction
  else score += 0.40;

  // 2. Valence: similar = composes
  dims++;
  const vDiff = Math.abs((p1.valence || 0) - (p2.valence || 0));
  if (vDiff === 0) score += 0.80;
  else if (vDiff === 1) score += 0.70;
  else if (vDiff === 2) score += 0.55;
  else score += 0.40;

  // 3. Phase-bonding (complement > identity for certain pairs)
  dims++;
  score += phaseBond(p1.phase || 'solid', p2.phase || 'solid');

  // 4. Reactivity-pairing
  dims++;
  score += reactBond(p1.reactivity || 'inert', p2.reactivity || 'inert');

  // 5. Mass: off-by-one = layering (wrapper + impl). Same is fine. Far apart = less.
  dims++;
  const mOrder = { light: 0, medium: 1, heavy: 2, superheavy: 3 };
  const mDiff = Math.abs((mOrder[p1.mass] || 0) - (mOrder[p2.mass] || 0));
  if (mDiff === 0) score += 0.70;
  else if (mDiff === 1) score += 0.85;  // layering bonus
  else if (mDiff === 2) score += 0.55;
  else score += 0.40;

  // 6. Role-complementarity (the key dimension)
  dims++;
  const r1 = classifyRole(el1.name);
  const r2 = classifyRole(el2.name);
  score += roleComplementarity(r1, r2);

  // 7. Harm agreement (both none = full score)
  dims++;
  const h1 = p1.harmPotential || 'none';
  const h2 = p2.harmPotential || 'none';
  if (h1 === 'none' && h2 === 'none') score += 1.0;
  else if (h1 === 'minimal' && h2 === 'minimal') score += 0.85;
  else score += 0.65;

  // 8. Alignment agreement
  dims++;
  const a1 = p1.alignment || 'neutral';
  const a2 = p2.alignment || 'neutral';
  if (a1 === 'healing' && a2 === 'healing') score += 1.0;
  else if (a1 === 'healing' || a2 === 'healing') score += 0.75;
  else score += 0.55;

  return Math.round((score / dims) * 1000) / 1000;
}
roleAwareCoherence.atomicProperties = {
  charge: 1, valence: 4, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.85, group: 18, period: 6,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function covenantGroupCoherenceRoleAware(periodicTable) {
  if (!periodicTable) return { coherence: 0, reason: 'no periodic table' };
  const elements = (periodicTable.elements || []).filter(el =>
    el && el.properties && (el.properties.domain === 'security' || el.properties.domain === 'covenant')
  );
  if (elements.length < 2) {
    return { coherence: 1.0, reason: 'insufficient elements', count: elements.length };
  }
  let total = 0;
  let pairs = 0;
  const roleDistribution = {};
  for (const el of elements) {
    const r = classifyRole(el.name);
    roleDistribution[r] = (roleDistribution[r] || 0) + 1;
  }
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      total += roleAwareCoherence(elements[i], elements[j]);
      pairs++;
    }
  }
  const coherence = pairs > 0 ? total / pairs : 0;
  return {
    coherence: Math.round(coherence * 1000) / 1000,
    pairs,
    count: elements.length,
    decoherent: coherence < 0.8,
    roleDistribution,
    method: 'role-aware',
  };
}
covenantGroupCoherenceRoleAware.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = {
  classifyRole,
  roleComplementarity,
  phaseBond,
  reactBond,
  roleAwareCoherence,
  covenantGroupCoherenceRoleAware,
  ROLE_COMPLEMENTARITY,
  PHASE_BONDS,
  REACT_BONDS,
};
