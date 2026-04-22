'use strict';

/**
 * Covenant Fractal — the covenant exists at every scale.
 *
 * 7 scales of same-shape guards plus 2 meta-rules:
 *   1. byte/token     — scanForUngatedMutations()
 *   2. function       — requireGate() / createGate()
 *   3. element        — delegates to CovenantValidator
 *   4. composition    — delegates to canBond()
 *   5. substrate      — signSubstrate() / verifySubstrate()
 *   6. file           — computeFileCovenantSignature()
 *   7. group coherence — covenantGroupCoherence()  [role-aware by default]
 *   + evolution       — checkMonotonicEvolution()
 *   + cross-scale     — verifyCrossScaleAlignment()
 */

const { createHash } = require('crypto');
const { CovenantValidator } = require('../atomic/periodic-table');
const { SEAL_REGISTRY } = require('./seal-registry');

let _roleAware;
try {
  ({ covenantGroupCoherenceRoleAware: _roleAware } = require('../atomic/role-aware-coherence'));
} catch (e) {
  _roleAware = null;
}

const MUTATION_PATTERNS = [
  /\.(writeFile|writeFileSync|unlink|unlinkSync|appendFile|appendFileSync|rm|rmSync|rmdir)\s*\(/g,
];
const GATE_INVOCATION_PATTERN = /\b(covenant|runAllChecks|CovenantValidator|covenantCheck|validateCovenant|requireGate|covenantGate)\s*[.\(]/;

function scanForUngatedMutations(code) {
  if (typeof code !== 'string') return [];
  const findings = [];
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of MUTATION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) {
        const start = Math.max(0, i - 20);
        const window = lines.slice(start, i + 1).join('\n');
        if (!GATE_INVOCATION_PATTERN.test(window)) {
          findings.push({
            line: i + 1,
            excerpt: line.trim().slice(0, 120),
            reason: 'mutation without preceding covenant gate invocation',
          });
        }
      }
    }
  }
  return findings;
}
scanForUngatedMutations.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.5, group: 12, period: 3,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function requireGate(fn) {
  const gated = function (...args) {
    const maybeGate = args[0];
    if (!maybeGate || typeof maybeGate !== 'object' || maybeGate.__covenantGate !== true) {
      throw new Error('COVENANT VIOLATION: mutation function invoked without gate. Pass a gate as first argument.');
    }
    if (maybeGate.sealed !== true) {
      throw new Error('COVENANT VIOLATION: gate present but not sealed. Call gate.seal(props) before invoking.');
    }
    return fn.apply(this, args);
  };
  gated.__covenantWrapped = true;
  gated.__originalFn = fn;
  return gated;
}
requireGate.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.6, group: 18, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function createGate() {
  return {
    __covenantGate: true,
    sealed: false,
    seal(props) {
      const result = CovenantValidator.validate(props);
      if (!result.valid) throw new Error('COVENANT VIOLATION: gate seal rejected. ' + result.violations.map(v => v.message).join('; '));
      this.sealed = true;
      this.props = props;
      return this;
    },
  };
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function signSubstrate(data) {
  const content = stableStringify(data);
  const hash = createHash('sha256').update(content).digest('hex');
  return { hash, signedAt: new Date().toISOString(), algorithm: 'sha256' };
}
signSubstrate.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.4, group: 16, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'security',
};

function verifySubstrate(data, signature) {
  if (!signature || !signature.hash) return { valid: false, reason: 'no signature' };
  const expected = signSubstrate(data);
  if (expected.hash !== signature.hash) return { valid: false, reason: 'hash mismatch', expected: expected.hash, actual: signature.hash };
  return { valid: true };
}

function computeFileCovenantSignature(fileContent, filePath = '') {
  const contentHash = createHash('sha256').update(fileContent).digest('hex');
  const atomicBlocks = [];
  const re = /(\w+)\.atomicProperties\s*=\s*\{([\s\S]*?)\}/g;
  let m;
  while ((m = re.exec(fileContent)) !== null) {
    atomicBlocks.push({ name: m[1], decl: m[2].replace(/\s+/g, ' ').trim() });
  }
  const covenantHash = createHash('sha256').update(JSON.stringify(atomicBlocks)).digest('hex');
  return {
    filePath,
    contentHash,
    covenantHash,
    declaredElements: atomicBlocks.length,
    combined: createHash('sha256').update(contentHash + ':' + covenantHash).digest('hex'),
  };
}
computeFileCovenantSignature.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.4, group: 16, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'security',
};

/**
 * covenantGroupCoherence — primary self-measurement at fractal scale 7.
 *
 * Delegates to role-aware coherence by default (rewards functional
 * complementarity). Falls back to similarity-based math if role-aware
 * module is missing. Pass { method: 'similarity' } to force legacy math.
 */
function covenantGroupCoherence(periodicTable, options) {
  const opts = options || {};
  if (_roleAware && opts.method !== 'similarity') {
    return _roleAware(periodicTable);
  }
  if (!periodicTable) return { coherence: 0, reason: 'no periodic table' };
  const elements = (periodicTable.elements || []).filter(el =>
    el && el.properties && (el.properties.domain === 'security' || el.properties.domain === 'covenant')
  );
  if (elements.length < 2) {
    return { coherence: 1.0, reason: 'insufficient elements to measure', count: elements.length };
  }
  let totalCoherence = 0;
  let pairs = 0;
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      if (typeof periodicTable.interactionCoherence === 'function') {
        totalCoherence += periodicTable.interactionCoherence(elements[i].signature, elements[j].signature);
        pairs++;
      }
    }
  }
  const coherence = pairs > 0 ? totalCoherence / pairs : 0;
  return {
    coherence: Math.round(coherence * 1000) / 1000,
    pairs,
    count: elements.length,
    decoherent: coherence < 0.8,
    method: 'similarity-fallback',
  };
}
covenantGroupCoherence.atomicProperties = {
  charge: 0, valence: 3, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.8, group: 18, period: 6,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

const HARM_ORDER = { none: 0, minimal: 1, moderate: 2, dangerous: 3 };

function checkMonotonicEvolution(proposed, existingRegistry) {
  const registry = existingRegistry || SEAL_REGISTRY;
  if (!proposed || !proposed.name) return { accepted: false, reason: 'proposal missing name' };
  const violations = [];
  for (const seal of registry) {
    if (seal.name === proposed.name && seal.id !== proposed.id) {
      violations.push({ kind: 'duplicate_name', existing: seal.id, proposed: proposed.id });
    }
  }
  if (proposed.supersedes != null) {
    const superseded = registry.find(s => s.id === proposed.supersedes);
    if (!superseded) {
      violations.push({ kind: 'supersedes_unknown', proposed: proposed.supersedes });
    } else {
      const oldSev = HARM_ORDER[superseded.minHarmFlagged] != null ? HARM_ORDER[superseded.minHarmFlagged] : 1;
      const newSev = HARM_ORDER[proposed.minHarmFlagged] != null ? HARM_ORDER[proposed.minHarmFlagged] : 1;
      if (newSev < oldSev) {
        violations.push({ kind: 'weakens_severity', old: superseded.minHarmFlagged, new: proposed.minHarmFlagged });
      }
    }
  }
  const permissive = /(allow|permit|exempt|bypass|skip|disable)/i;
  if (proposed.seal && permissive.test(proposed.seal)) {
    violations.push({ kind: 'permissive_language', sample: proposed.seal.slice(0, 80) });
  }
  return {
    accepted: violations.length === 0,
    violations,
    monotonic: violations.length === 0,
  };
}
checkMonotonicEvolution.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'reactive', electronegativity: 0.85, group: 18, period: 6,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function verifyCrossScaleAlignment(scaleReports) {
  const { byteHarm, elementHarm, compositionHarm } = scaleReports || {};
  const ranks = { none: 0, minimal: 1, moderate: 2, dangerous: 3 };
  const scales = { byteHarm, elementHarm, compositionHarm };
  const reported = Object.entries(scales).filter(function (entry) { return entry[1] != null; });
  if (reported.length < 2) return { aligned: true, reason: 'insufficient scales to compare' };
  const ranked = reported.map(function (entry) {
    return { scale: entry[0], rank: ranks[entry[1]] != null ? ranks[entry[1]] : 0, level: entry[1] };
  });
  const max = Math.max.apply(null, ranked.map(function (r) { return r.rank; }));
  const min = Math.min.apply(null, ranked.map(function (r) { return r.rank; }));
  const aligned = max - min <= 1;
  return {
    aligned,
    scales: ranked,
    gap: max - min,
    reason: aligned ? 'scales agree within one level' : 'harm-definition gap between scales',
  };
}
verifyCrossScaleAlignment.atomicProperties = {
  charge: 0, valence: 3, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.85, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function fractalAudit(ctx) {
  const report = {};
  if (ctx && ctx.code) {
    report.byteScale = scanForUngatedMutations(ctx.code);
    report.fileSignature = computeFileCovenantSignature(ctx.code, ctx.filePath || '');
  }
  if (ctx && ctx.substrateData && ctx.substrateSignature) {
    report.substrateScale = verifySubstrate(ctx.substrateData, ctx.substrateSignature);
  }
  if (ctx && ctx.periodicTable) {
    report.groupCoherence = covenantGroupCoherence(ctx.periodicTable);
  }
  const fractalHealth =
    (!report.byteScale || report.byteScale.length === 0) &&
    (!report.substrateScale || report.substrateScale.valid) &&
    (!report.groupCoherence || !report.groupCoherence.decoherent);
  report.fractalHealth = fractalHealth;
  report.ranAt = new Date().toISOString();
  return report;
}
fractalAudit.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'odd', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.95, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = {
  scanForUngatedMutations,
  requireGate,
  createGate,
  signSubstrate,
  verifySubstrate,
  stableStringify,
  computeFileCovenantSignature,
  covenantGroupCoherence,
  checkMonotonicEvolution,
  verifyCrossScaleAlignment,
  fractalAudit,
};
