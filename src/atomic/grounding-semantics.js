'use strict';

/**
 * Grounding Semantics — lie detection between what a function CLAIMS
 * (name, docstring, declared atomicProperties) and what it DOES (call graph,
 * mutation patterns, observable side effects).
 *
 * The regex-based covenant catches obvious harm. This module catches the
 * harder case: an AI generates `function validateInput(x) { corruptData(x); }`
 * where the name suggests safety but the body does the opposite.
 *
 * Approach:
 *   1. classifyNameIntent: extract intent category from identifier
 *   2. classifyBodyBehavior: extract observable behavior from body
 *   3. detectLieGap: compare the two; gap = lie likelihood
 */

const INTENT_CATEGORIES = {
  validator: /^(is|has|can|should|check|validate|verify|ensure|assert)/i,
  sanitizer: /^(sanitize|clean|escape|redact|strip|normalize|purify)/i,
  guard: /^(guard|protect|secure|authorize|authenticate|permit|allow|deny)/i,
  transform: /^(to|from|convert|transform|map|format|parse|serialize)/i,
  query: /^(get|find|search|lookup|fetch|read|load|select)/i,
  mutation: /^(set|update|write|save|delete|remove|destroy|drop|truncate)/i,
  healer: /^(heal|repair|fix|refine|optimize|improve)/i,
  destroyer: /^(destroy|kill|wipe|purge|annihilate|corrupt|poison|exploit|attack)/i,
};

const BEHAVIOR_SIGNATURES = {
  returnsBool: /return\s+(true|false|!|typeof|instanceof|\w+\s*[=!<>]=|Boolean\s*\()/,
  comparisons: /[=!<>]=|\.(includes|startsWith|endsWith|test|match|equals)\s*\(/,
  mutations: /\.(push|pop|shift|unshift|splice|sort|reverse|fill)\s*\(|\s(delete|=)\s/,
  ioSideEffects: /(fs\.|readFile|writeFile|fetch|http\.|exec|spawn|process\.exit|process\.kill)/,
  corrupts: /corrupt|destroy|poison|exploit|attack|bypass|inject/i,
  throwsOrErrors: /throw\s+|Error\s*\(/,
  writesFilesystem: /\.(writeFile|writeFileSync|unlink|unlinkSync|rm|rmSync|mkdir|mkdirSync)\s*\(/,
  crypto: /(createHash|createHmac|randomBytes|timingSafeEqual|encrypt|decrypt)/,
  networkIO: /(fetch\s*\(|http\.|https\.|axios\.|socket\.|request\()/,
};

function classifyNameIntent(name) {
  if (typeof name !== 'string' || !name) return { category: 'unknown', confidence: 0 };
  for (const [cat, re] of Object.entries(INTENT_CATEGORIES)) {
    if (re.test(name)) return { category: cat, confidence: 0.8, matchedBy: re.source };
  }
  return { category: 'neutral', confidence: 0.3 };
}

function classifyBodyBehavior(body) {
  if (typeof body !== 'string') return {};
  const signals = {};
  for (const [key, re] of Object.entries(BEHAVIOR_SIGNATURES)) {
    signals[key] = re.test(body);
  }
  return signals;
}

function expectedBehaviorFor(intent) {
  switch (intent) {
    case 'validator': return { must: ['returnsBool', 'comparisons'], mustNot: ['corrupts', 'writesFilesystem'] };
    case 'sanitizer': return { must: ['comparisons'], mustNot: ['corrupts', 'writesFilesystem', 'networkIO'] };
    case 'guard': return { must: [], mustNot: ['corrupts'] };
    case 'transform': return { must: [], mustNot: ['corrupts', 'writesFilesystem'] };
    case 'query': return { must: [], mustNot: ['mutations', 'writesFilesystem'] };
    case 'mutation': return { must: [], mustNot: ['corrupts'] };
    case 'healer': return { must: [], mustNot: ['corrupts', 'destroyer'] };
    case 'destroyer': return { must: ['mutations'], mustNot: [] };
    default: return { must: [], mustNot: ['corrupts'] };
  }
}

function detectLieGap(name, body, declaredProps) {
  const intent = classifyNameIntent(name);
  const behavior = classifyBodyBehavior(body);
  const expected = expectedBehaviorFor(intent.category);

  const violations = [];
  for (const required of expected.must) {
    if (!behavior[required]) {
      violations.push({ severity: 'medium', kind: 'missing_expected_behavior', name: required, intent: intent.category });
    }
  }
  for (const forbidden of expected.mustNot) {
    if (behavior[forbidden]) {
      violations.push({ severity: 'high', kind: 'forbidden_behavior_present', name: forbidden, intent: intent.category });
    }
  }

  if (declaredProps) {
    if (declaredProps.alignment === 'healing' && behavior.corrupts) {
      violations.push({ severity: 'high', kind: 'declared_healing_but_corrupts', declared: 'healing', observed: 'corrupts' });
    }
    if (declaredProps.intention === 'benevolent' && behavior.corrupts) {
      violations.push({ severity: 'high', kind: 'declared_benevolent_but_corrupts', declared: 'benevolent' });
    }
    if (declaredProps.harmPotential === 'none' && (behavior.writesFilesystem || behavior.ioSideEffects)) {
      violations.push({ severity: 'medium', kind: 'declared_harm_none_but_has_side_effects', declared: 'none' });
    }
    if (declaredProps.spin === 'even' && (behavior.ioSideEffects || behavior.mutations)) {
      violations.push({ severity: 'low', kind: 'declared_pure_but_has_effects', declared: 'even' });
    }
  }

  const lieScore = violations.reduce((s, v) => {
    if (v.severity === 'high') return s + 0.4;
    if (v.severity === 'medium') return s + 0.2;
    return s + 0.05;
  }, 0);

  return {
    name,
    intentCategory: intent.category,
    intentConfidence: intent.confidence,
    observedBehavior: behavior,
    violations,
    lieScore: Math.min(1.0, Math.round(lieScore * 100) / 100),
    isLying: lieScore >= 0.4,
  };
}
detectLieGap.atomicProperties = {
  charge: 0, valence: 3, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.85, group: 18, period: 6,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function extractFunctions(source) {
  const fns = [];
  const re = /(?:function\s+(\w+)\s*\([^)]*\)\s*\{|const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{|(\w+)\s*:\s*(?:async\s+)?function\s*\([^)]*\)\s*\{|(\w+)\s*\([^)]*\)\s*\{)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const name = m[1] || m[2] || m[3] || m[4];
    if (!name) continue;
    const start = m.index + m[0].length - 1;
    let depth = 1;
    let i = start + 1;
    while (i < source.length && depth > 0) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') depth--;
      i++;
    }
    fns.push({ name, body: source.slice(start, i), start: m.index });
  }
  return fns;
}

function auditSourceForLies(source) {
  const fns = extractFunctions(source);
  const results = [];
  for (const fn of fns) {
    const declMatch = source.match(new RegExp(`${fn.name}\\.atomicProperties\\s*=\\s*\\{([^}]*)\\}`));
    const declared = declMatch ? parseDeclaredProps(declMatch[1]) : null;
    const gap = detectLieGap(fn.name, fn.body, declared);
    if (gap.lieScore > 0) results.push(gap);
  }
  return {
    scanned: fns.length,
    suspicious: results.length,
    lies: results.filter(r => r.isLying),
    weakSignals: results.filter(r => !r.isLying),
  };
}
auditSourceForLies.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function parseDeclaredProps(body) {
  const out = {};
  const KEYS = ['charge','valence','mass','spin','phase','reactivity','electronegativity','group','period','harmPotential','alignment','intention','domain'];
  for (const key of KEYS) {
    const m = body.match(new RegExp(`\\b${key}\\s*:\\s*([^,\\n}]+)`));
    if (!m) continue;
    let v = m[1].trim().replace(/,$/, '').trim();
    const str = v.match(/^['"](.*)['"]\s*$/);
    if (str) { out[key] = str[1]; continue; }
    const num = v.match(/^-?\d+(?:\.\d+)?$/);
    if (num) { out[key] = parseFloat(v); continue; }
    out[key] = v;
  }
  return out;
}

module.exports = {
  INTENT_CATEGORIES,
  BEHAVIOR_SIGNATURES,
  classifyNameIntent,
  classifyBodyBehavior,
  expectedBehaviorFor,
  detectLieGap,
  extractFunctions,
  auditSourceForLies,
  parseDeclaredProps,
};
