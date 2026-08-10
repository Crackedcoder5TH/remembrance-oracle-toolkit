'use strict';

/**
 * covenant-entangled — the two covenant gates, crossed, in one leaf module.
 *
 * A file can be judged by two INDEPENDENT scanners:
 *   - the fractal audit (covenant-fractal.js): byte-scale ungated
 *     mutations + atomic-scale missing periodic-table declarations.
 *   - the covenant scanner (covenant.js, principle 11): SQL / injection /
 *     harm at the source level.
 * They read DIFFERENT things. A file can pass one and be blocked by the
 * other — quantum-field.js reached fractal-clean after annotation while
 * its `${table}` DDL interpolations still broke the covenant scanner
 * (trap 27). Judging an exemption sheddable from one gate alone is how
 * that slips through.
 *
 * fullCovenantAudit runs BOTH and reports `clean` only when the fractal
 * audit is healthy AND the covenant seals — neither verdict is complete
 * for a shed decision without the other, so they are always crossed here.
 *
 * WHY A SEPARATE LEAF MODULE: entangling the two meant one gate module
 * requiring the other, which grew the lexical require knot (the cycle
 * ratchet caught it, 62→64). This module sits ABOVE both gates as a pure
 * consumer — nothing in core requires it back — so the coupling lives in
 * one leaf instead of tangling the two cores together. The load graph
 * stays acyclic and the lexical baseline holds.
 */

const { fractalAudit } = require('./covenant-fractal');
const { covenantCheck } = require('./covenant');

/**
 * @param {{code: string, filePath?: string, options?: object}} ctx
 * @returns {{clean, fractalHealth, sealed, fractal, covenant, reasons}}
 */
function fullCovenantAudit(ctx) {
  const code = ctx && ctx.code;
  const fractal = fractalAudit(ctx);
  let covenant = { sealed: true, violations: [] };
  if (typeof code === 'string') {
    try {
      covenant = covenantCheck(code, (ctx && ctx.options) || {});
    } catch (e) {
      covenant = { sealed: false, violations: [{ reason: 'covenant scanner unavailable: ' + (e && e.message) }] };
    }
  }
  const reasons = [];
  if (!fractal.fractalHealth) {
    if ((fractal.byteScale || []).length) reasons.push(`${fractal.byteScale.length} ungated mutation(s) [byte scale]`);
    if ((fractal.atomicScale || []).length) reasons.push(`${fractal.atomicScale.length} missing atomic declaration(s) [atomic scale]`);
  }
  if (!covenant.sealed) {
    for (const v of (covenant.violations || [])) reasons.push(`${v.reason} [covenant scale]`);
  }
  return {
    clean: !!fractal.fractalHealth && !!covenant.sealed,
    fractalHealth: !!fractal.fractalHealth,
    sealed: !!covenant.sealed,
    fractal,
    covenant,
    reasons,
  };
}
fullCovenantAudit.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'odd', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.97, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = { fullCovenantAudit };
