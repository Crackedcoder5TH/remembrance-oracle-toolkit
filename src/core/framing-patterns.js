'use strict';

/**
 * Framing Patterns — proposed 16th covenant seal: "No False Framing"
 *
 * Closes the gap where HARM_PATTERNS / DEEP_SECURITY_PATTERNS pass structurally
 * clean code whose FRAMING implies domain-authority claims the code can't back
 * up. Medical, legal, financial, or scientific language without a disclaimer
 * would trip this check.
 *
 * Status: PROPOSED. Not yet wired into CovenantValidator by default.
 *
 * To activate, either:
 *   const { addCheck } = require('./covenant-validator');
 *   addCheck(require('./framing-patterns').checkFraming);
 *
 * Or run:
 *   node src/cli.js self-improve approve framing-patterns
 *
 * atomicProperties places this check in the quality/meta space (group 18,
 * period 7), matching the other covenant-side validators.
 */

const DOMAIN_FRAMING_PATTERNS = {
  medical: {
    claim: /\b(diagnos(e|is|tic)|symptom(s|\smap)?|prescrib|treatment|clinical(ly)?|patient|dosage?|healing\ssession|triage)\b/i,
    disclaimer: /\b(not\s+medical\s+advice|metaphor|educational\s+purposes|informational\s+only|not\s+a\s+diagnostic|not\s+clinical)/i,
  },
  legal: {
    claim: /\b(legal\s+advice|counsel|liability|jurisdictional?|statute|indemnif|attorney\s+recommendation)\b/i,
    disclaimer: /\b(not\s+legal\s+advice|consult\s+an\s+attorney|informational\s+only)/i,
  },
  financial: {
    claim: /\b(investment\s+advice|portfolio\s+recommendation|trading\s+signal|financial\s+advice|tax\s+advice)\b/i,
    disclaimer: /\b(not\s+financial\s+advice|not\s+tax\s+advice|consult\s+an\s+advisor|informational\s+only)/i,
  },
  scientific: {
    claim: /\b(clinically\s+(tested|proven)|FDA\s+approved|peer\s+reviewed\s+by|evidence[-\s]based\s+recommendation)\b/i,
    disclaimer: /\b(unverified|illustrative|metaphor|not\s+peer\s+reviewed|informational\s+only)/i,
  },
};

const SELF_SKIP_RE = /framing-patterns|framing\.test|covenant-patterns\.test/;

function checkFraming(code, filePath = '') {
  if (typeof code !== 'string' || code.length === 0) {
    return { flagged: false, domain: null, disclaimerPresent: false, findings: [] };
  }
  if (SELF_SKIP_RE.test(filePath)) {
    return { flagged: false, domain: null, disclaimerPresent: false, findings: [], skipped: 'self-reference' };
  }
  const findings = [];
  for (const [domain, patterns] of Object.entries(DOMAIN_FRAMING_PATTERNS)) {
    if (patterns.claim.test(code)) {
      const disclaimerPresent = patterns.disclaimer.test(code);
      const matched = code.match(patterns.claim);
      findings.push({
        domain,
        disclaimerPresent,
        severity: disclaimerPresent ? 'low' : 'medium',
        match: matched ? matched[0] : null,
      });
    }
  }
  const flagged = findings.some(f => !f.disclaimerPresent);
  const primary = findings.find(f => !f.disclaimerPresent) || findings[0] || null;
  return {
    flagged,
    domain: primary ? primary.domain : null,
    disclaimerPresent: primary ? primary.disclaimerPresent : false,
    findings,
    remedy: flagged && primary
      ? `Add a disclaimer for domain "${primary.domain}". Example comment: /* Coherency metaphor — not ${primary.domain} advice. */`
      : null,
  };
}

checkFraming.atomicProperties = {
  charge: 0,
  valence: 2,
  mass: 'medium',
  spin: 'even',
  phase: 'gas',
  reactivity: 'reactive',
  electronegativity: 0.85,
  group: 18,
  period: 7,
  harmPotential: 'none',
  alignment: 'healing',
  intention: 'benevolent',
  domain: 'covenant',
};

const PROPOSED_SEAL = {
  id: 16,
  name: 'No False Framing',
  seal: 'Code that claims domain authority must carry a disclaimer.',
  check: 'checkFraming',
  status: 'proposed',
};

module.exports = {
  DOMAIN_FRAMING_PATTERNS,
  checkFraming,
  PROPOSED_SEAL,
};
