'use strict';

/**
 * mapper/format.js — render a coherency map as the structured report the
 * goggles print. Extracted from coherency-mapper.js in the flagship
 * decomposition.
 */

function formatMap(m) {
  const lines = [];
  lines.push('═══ COHERENCY MAP: ' + m.project + ' ═══');
  lines.push('  audited:       ' + m.filesAudited + ' files');
  lines.push('  duration:      ' + (m.durationMs / 1000).toFixed(1) + 's');
  lines.push('  contributions: ' + m.contributionsCount + ' to field');
  if (m.fieldStateAfter && m.fieldStateBefore) {
    lines.push('  field Δ:       coh ' + (m.fieldStateAfter.coherence - m.fieldStateBefore.coherence).toFixed(4) +
      '  sources +' + (m.fieldStateAfter.sources - m.fieldStateBefore.sources));
  }
  lines.push('');
  lines.push('PER-CATEGORY HEALTH:');
  const cats = Object.entries(m.perCategory).sort((a, b) => b[1].n - a[1].n);
  for (const [name, c] of cats) {
    lines.push('  ' + name.padEnd(18) + ' n=' + String(c.n).padStart(4) +
      '  well-formed=' + String(c.wellFormed).padStart(3) +
      '  orphan=' + String(c.orphan).padStart(2) +
      '  inconsistent=' + String(c.inconsistent).padStart(2) +
      '  duplicate=' + String(c.duplicate).padStart(3));
  }
  lines.push('');
  lines.push('FIX BUCKETS:');
  lines.push('  A  components incoherent : ' + m.buckets.A_components_incoherent.length);
  lines.push('  B  api inconsistent      : ' + m.buckets.B_api_inconsistent.length);
  lines.push('  C  lib drift             : ' + m.buckets.C_lib_drift.length);
  {
    const dp = m.buckets.D_duplicate_pairs;
    const series = dp.filter(p => p.versionSeries).length;
    const linked = dp.filter(p => p.resolvedSymlink).length;
    const organic = dp.filter(p => !p.versionSeries && !p.resolvedSymlink);
    const fmtEcho = organic.filter(p => p.payloadIdentical === false).length;
    const trueDup = organic.filter(p => p.payloadIdentical === true).length;
    const unverified = organic.length - fmtEcho - trueDup;
    lines.push('  D  duplicate pairs       : ' + dp.length
      + (series || linked || fmtEcho || trueDup
        ? `  (${series} version-series · ${linked} symlink-resolved · ${trueDup} payload-identical · ${fmtEcho} format echo · ${unverified} unverified)`
        : ''));
  }
  {
    const eo = m.buckets.E_other_orphans;
    const adjudicated = eo.filter(o => o.adjudicated).length;
    const fresh = eo.length - adjudicated;
    lines.push('  E  other orphans         : ' + eo.length
      + (adjudicated ? `  (${adjudicated} adjudicated · ${fresh} NEW)` : ''));
  }
  lines.push('  TOTAL flagged            : ' +
    (m.buckets.A_components_incoherent.length + m.buckets.B_api_inconsistent.length +
     m.buckets.C_lib_drift.length + m.buckets.D_duplicate_pairs.length + m.buckets.E_other_orphans.length));
  lines.push('');
  if (m.crossSystemBridges.length > 0) {
    lines.push('TOP CROSS-SYSTEM BRIDGES:');
    for (const br of m.crossSystemBridges.slice(0, 10)) {
      lines.push('  ' + br.score.toFixed(4) + '  ' + br.from + '  ↔  ' + br.to);
    }
  }
  return lines.join('\n');
}
formatMap.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.2, group: 13, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'presentation',
};

module.exports = { formatMap };
