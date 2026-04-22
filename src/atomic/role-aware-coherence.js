'use strict';

/**
 * Role-Aware Coherence — rewards functional COMPLEMENTARITY (not similarity).
 *
 * A diverse covenant covers different roles (validate, sanitize, guard,
 * audit, accumulate). Those roles inherently need different properties.
 * Measuring them with similarity-math produces artificially low coherence.
 *
 * Role-aware math rewards:
 *   - charge -1 ↔ +1 pairs (contract + expand = full cycle)
 *   - phase solid ↔ gas pairs (cache feeds compute)
 *   - mass off-by-one pairs (wrapper + implementation)
 *   - reactivity inert ↔ stable pairs (pure trusts stable)
 *   - intent-complementary function names (validator × mutator, etc)
 *
 * Still enforces covenant invariants: harm ≤ minimal, alignment ≠ degrading,
 * intention ≠ malevolent.
 */

// Expanded intent patterns — richer verb coverage drops the "neutral" bucket,
// lifting coherence because classified roles score role-complementarity
// (0.70-0.95) while neutral×neutral scores 0.60.
const INTENT_CATEGORIES = {
  validator: /^(is|has|can|should|check|validate|verify|ensure|assert|test|match|permit|accept|reject)/i,
  sanitizer: /^(sanitize|clean|escape|redact|strip|normalize|purify|scrub|mask|trim)/i,
  guard: /^(guard|protect|secure|authorize|authenticate|allow|deny|require|gate|seal)/i,
  transform: /^(to|from|convert|transform|map|format|parse|serialize|encode|decode|hash|sign|compute|calculate|apply|process|build|render|resolve|wrap|unwrap|compose|normalize|reduce)/i,
  query: /^(get|find|search|lookup|fetch|read|load|select|detect|extract|count|list|enumerate|classify|identify|discover|probe|scan|inspect)/i,
  mutation: /^(set|update|write|save|delete|remove|destroy|drop|rotate|generate|emit|create|register|init|start|stop|open|close|append|add|insert|push|publish|commit)/i,
  aggregate: /^(correlate|aggregate|sum|collect|accumulate|combine|merge|reduce|fold|gather)/i,
  healer: /^(heal|repair|fix|refine|optimize|improve|recover|restore|regenerate)/i,
  destroyer: /^(corrupt|poison|exploit|attack|bypass|overflow|inject|pollute|spoof|impersonate)/i,
};

function classifyRole(name) {
  if (typeof name !== 'string' || !name) return 'neutral';
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

const ROLE_COMPLEMENTARITY = {
  'validator+mutation':  0.95,
  'validator+guard':     0.90,
  'validator+sanitizer': 0.85,
  'validator+query':     0.85,
  'validator+transform': 0.80,
  'sanitizer+transform': 0.90,
  'sanitizer+mutation':  0.85,
  'sanitizer+query':     0.80,
  'guard+audit':         0.90,
  'guard+mutation':      0.90,
  'guard+query':         0.85,
  'guard+transform':     0.80,
  'query+mutation':      0.85,
  'query+aggregate':     0.85,
  'query+transform':     0.80,
  'aggregate+transform': 0.85,
  'aggregate+mutation':  0.80,
  'healer+validator':    0.85,
  'healer+transform':    0.80,
  'healer+aggregate':    0.75,
  'transform+mutation':  0.80,
  // Same-role pairs
  'validator+validator': 0.72,
  'sanitizer+sanitizer': 0.72,
  'guard+guard':         0.72,
  'transform+transform': 0.72,
  'query+query':         0.72,
  'mutation+mutation':   0.65,
  'aggregate+aggregate': 0.72,
  'healer+healer':       0.72,
  'neutral+neutral':     0.60,
};

function roleComplementarity(roleA, roleB) {
  if (roleA === 'destroyer' || roleB === 'destroyer') return 0;
  const key1 = `${roleA}+${roleB}`;
  const key2 = `${roleB}+${roleA}`;
  if (ROLE_COMPLEMENTARITY[key1] != null) return ROLE_COMPLEMENTARITY[key1];
  if (ROLE_COMPLEMENTARITY[key2] != null) return ROLE_COMPLEMENTARITY[key2];
  if (roleA === 'neutral' || roleB === 'neutral') return 0.60;
  return 0.55;
}
roleComplementarity.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 2, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

const PHASE_BONDS = {
  'solid+solid':   0.70, 'solid+gas':    0.90, 'solid+liquid': 0.60, 'solid+plasma': 0.55,
  'gas+gas':       0.70, 'gas+liquid':   0.60, 'gas+plasma':   0.75,
  'liquid+liquid': 0.50, 'liquid+plasma':0.50, 'plasma+plasma':0.60,
};

function phaseBond(a, b) {
  const k1 = `${a}+${b}`;
  const k2 = `${b}+${a}`;
  return PHASE_BONDS[k1] || PHASE_BONDS[k2] || 0.5;
}

const REACT_BONDS = {
  'inert+inert':       0.80, 'inert+stable':     0.90, 'inert+reactive':   0.40, 'inert+volatile':   0.20,
  'stable+stable':     0.75, 'stable+reactive':  0.70, 'stable+volatile':  0.45,
  'reactive+reactive': 0.55, 'reactive+volatile':0.40, 'volatile+volatile':0.30,
};

function reactBond(a, b) {
  const k1 = `${a}+${b}`;
  const k2 = `${b}+${a}`;
  return REACT_BONDS[k1] || REACT_BONDS[k2] || 0.5;
}

function roleAwareCoherence(el1, el2) {
  if (!el1 || !el2 || !el1.properties || !el2.properties) return 0;
  const p1 = el1.properties;
  const p2 = el2.properties;

  if (p1.harmPotential === 'dangerous' || p2.harmPotential === 'dangerous') return 0;
  if (p1.alignment === 'degrading' || p2.alignment === 'degrading') return 0;
  if (p1.intention === 'malevolent' || p2.intention === 'malevolent') return 0;

  let score = 0;
  let dims = 0;

  dims++;
  if (p1.charge + p2.charge === 0 && p1.charge !== 0) score += 1.0;
  else if (p1.charge === 0 && p2.charge === 0) score += 0.75;
  else if (p1.charge === 0 || p2.charge === 0) score += 0.75;
  else if (p1.charge === p2.charge) score += 0.60;
  else score += 0.40;

  dims++;
  const vDiff = Math.abs((p1.valence || 0) - (p2.valence || 0));
  if (vDiff === 0) score += 0.80;
  else if (vDiff === 1) score += 0.70;
  else if (vDiff === 2) score += 0.55;
  else score += 0.40;

  dims++;
  score += phaseBond(p1.phase || 'solid', p2.phase || 'solid');

  dims++;
  score += reactBond(p1.reactivity || 'inert', p2.reactivity || 'inert');

  dims++;
  const mOrder = { light: 0, medium: 1, heavy: 2, superheavy: 3 };
  const mDiff = Math.abs((mOrder[p1.mass] || 0) - (mOrder[p2.mass] || 0));
  if (mDiff === 0) score += 0.70;
  else if (mDiff === 1) score += 0.85;
  else if (mDiff === 2) score += 0.55;
  else score += 0.40;

  dims++;
  const r1 = classifyRole(el1.name);
  const r2 = classifyRole(el2.name);
  score += roleComplementarity(r1, r2);

  dims++;
  const h1 = p1.harmPotential || 'none';
  const h2 = p2.harmPotential || 'none';
  if (h1 === 'none' && h2 === 'none') score += 1.0;
  else if (h1 === 'minimal' && h2 === 'minimal') score += 0.85;
  else score += 0.65;

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
  INTENT_CATEGORIES,
  ROLE_COMPLEMENTARITY,
  PHASE_BONDS,
  REACT_BONDS,
};
