'use strict';

/**
 * Attack surface detection — covenant-domain elements. Group 15 search.
 * Different period for variety.
 */

const INJECTION_PATTERNS = {
  sql: /(\bor\b\s+\d+\s*=\s*\d+|\bunion\b\s+\bselect\b|;\s*drop\s+table|--\s*$|\/\*.*\*\/)/i,
  nosql: /(\$where|\$regex|\$ne\s*:|\$gt\s*:|\$lt\s*:)\s*\{/,
  ldap: /[*()\\\0\/]|\|\|/,
  command: /[;&|`]|\$\([^)]+\)|<\(.*\)/,
  path: /\.\.[\/\\]|^[\/\\]|\0/,
  xss: /<\s*script|javascript:|on\w+\s*=|<\s*iframe/i,
};

function detectInjectionAttempt(input) {
  if (typeof input !== 'string') return { detected: false, reason: 'not-string' };
  const findings = [];
  for (const [kind, pattern] of Object.entries(INJECTION_PATTERNS)) {
    if (pattern.test(input)) findings.push({ kind, sample: input.match(pattern)[0].slice(0, 60) });
  }
  const __retVal = {
    detected: findings.length > 0,
    findings,
    severity: findings.length >= 2 ? 'high' : findings.length === 1 ? 'medium' : 'none',
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, 1 - (__retVal.severity || 0))), source: 'oracle:attack-surface:detectInjectionAttempt' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}
detectInjectionAttempt.atomicProperties = {
  charge: -1, valence: 1, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'stable', electronegativity: 0.6, group: 15, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

const KNOWN_BAD_PATTERNS = [
  { id: 'eval-literal',       re: /\beval\s*\(\s*['"`]/, severity: 'high' },
  { id: 'function-new',       re: /new\s+Function\s*\(/, severity: 'high' },
  { id: 'child-process',      re: /require\s*\(\s*['"`]child_process['"`]/, severity: 'high' },
  { id: 'document-write',     re: /document\.write\s*\(/, severity: 'medium' },
  { id: 'inner-html-dynamic', re: /\.innerHTML\s*=\s*[^'"`]/, severity: 'medium' },
  { id: 'unsafe-regex',       re: /\(.*\+.*\+.*\)[*+]/, severity: 'low' },
  { id: 'http-basic-auth',    re: /Authorization:\s*Basic\s+/, severity: 'low' },
];

function matchKnownBadPattern(code) {
  if (typeof code !== 'string') return { matches: [], worst: 'none' };
  const matches = [];
  for (const p of KNOWN_BAD_PATTERNS) {
    if (p.re.test(code)) matches.push({ id: p.id, severity: p.severity });
  }
  const severityOrder = { high: 3, medium: 2, low: 1, none: 0 };
  const worst = matches.reduce((w, m) => severityOrder[m.severity] > severityOrder[w] ? m.severity : w, 'none');
  return { matches, worst, count: matches.length };
}
matchKnownBadPattern.atomicProperties = {
  charge: -1, valence: 1, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.7, group: 15, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = { detectInjectionAttempt, matchKnownBadPattern, INJECTION_PATTERNS, KNOWN_BAD_PATTERNS };
