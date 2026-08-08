'use strict';

/**
 * mapper/deep-map.js — the live re-encode path: map a project's
 * structural coherency by reading every file through the canonical
 * field-tool protocol (entanglement + canonical encoder + substrate
 * match + coding cousins + field contribution).
 *
 * This is the deep/refresh path for repos the substrate hasn't ingested
 * yet; mapper/substrate-map.js is the seconds-fast read over existing
 * compression. Extracted verbatim from coherency-mapper.js in the
 * flagship decomposition.
 *
 * @returns {{
 *   project: string,
 *   timestamp: string,
 *   filesAudited: number,
 *   substrateSize: number,
 *   perCategory: Record<string, {n, wellFormed, orphan, inconsistent, duplicate}>,
 *   buckets: {
 *     A_components_incoherent: [...],
 *     B_api_inconsistent: [...],
 *     C_lib_drift: [...],
 *     D_duplicate_pairs: [...],
 *     E_other_orphans: [...],
 *   },
 *   crossSystemBridges: [...],
 *   fieldStateAfter: object,
 *   contributionsCount: number,
 * }}
 */

const fs = require('node:fs');
const path = require('node:path');
const fc = require('../field-coupling');
const ft = require('../field-tool');
const {
  DEFAULT_CATEGORIZER, FULL_COHERENCE_CAP, _walk, _inferLang, _median,
} = require('./config');
const { detectSubstrateNamespace } = require('./namespace');
const { _pairwiseFlow } = require('./flow');
const { _dedupePairs, _annotateDataPairs, _annotateOrphans } = require('./pairs');

function mapProjectCoherency(projectPath, opts = {}) {
  const categorize = opts.categorize || DEFAULT_CATEGORIZER;
  const topK = opts.topK || 10;
  // 64k cap: a 12k cap truncated ordinary source files (~24KB) mid-function,
  // and the broken syntax read as false "weak structure" in the map. Most
  // real source fits under 64k; the cap now only guards genuinely huge files.
  const contentCap = opts.contentCap || 64000;
  const duplicateAt = opts.duplicateAt || 0.999;

  const t0 = Date.now();
  const files = _walk(projectPath, opts);
  // Resolve the substrate namespace: explicit opt, else resonance
  // self-identification against the substrate, else the basename.
  const namespace = opts.namespace
    || detectSubstrateNamespace(files, projectPath, opts)
    || path.basename(projectPath);
  const sourceTag = opts.sourceTag || ('coherency-map:' + namespace + ':read');
  const results = [];
  const before = fc.peekField();

  // ── 1. Per-file reads through the canonical protocol ─────────
  // Progress is reported on stderr (stdout stays the report) so a long
  // map over a big repo shows where it is — and where it stalls.
  const onProgress = opts.onProgress || ((i, n, rel, ms) => {
    if (i % 50 === 0 || ms > 2000) {
      process.stderr.write(`  [coherency-map] ${i}/${n} ${rel}${ms > 2000 ? ' (slow: ' + ms + 'ms)' : ''}\n`);
    }
  });
  let fileIdx = 0;
  for (const f of files) {
    fileIdx++;
    const tFile = Date.now();
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (content.length < 60) continue;
    // Files beyond the cap are encoded from a truncated prefix. The cut
    // lands mid-function, so the *intrinsic coherence* of the truncated
    // text is a reading of the truncation, not the file. Sibling and
    // duplicate vectors still come from the capped prefix (plenty of
    // signal for kinship, bounded cost) — but coherence is re-read from
    // the FULL text below, exactly as the focused goggle reads it, so
    // the map and FOCUS agree. Only blobs beyond FULL_COHERENCE_CAP
    // keep coherence withheld (TRUNCATED, coherence null).
    const fullText = content;
    const truncated = content.length > contentCap;
    if (truncated) content = content.slice(0, contentCap);

    const rel = path.relative(projectPath, f);
    const category = categorize(rel);

    let r;
    try {
      r = ft.read(
        { content, name: rel, language: _inferLang(rel) },
        { source: sourceTag, growSubstrate: false, topK },
      );
    } catch { continue; }
    if (!r || !r.voidResonance) continue;

    const self = namespace + '/' + rel;
    const others = r.voidResonance.topMatches.filter(m => m.name !== self);
    const sameProject = others.filter(m => m.name.startsWith(namespace + '/'));
    const sameCategory = sameProject.filter(m => {
      const cn = m.name.slice(namespace.length + 1);
      return categorize(cn) === category;
    });

    // Flow-aware classification: a match is a cousin only when its
    // flow shape is STABLE-HIGH. A match is a duplicate only when
    // it's STABLE-HIGH AND the minimum cosine across all depths
    // is at-or-above the duplicate threshold. Surface similarity at
    // L1 alone (DECAY shape) doesn't qualify as cousinship under
    // flow-aware reading.
    function _isStableHigh(m) {
      return m.shape === 'STABLE-HIGH' || (m.d1 === undefined && m.score > 0.90);
    }
    function _minDepth(m) {
      if (m.d1 === undefined) return m.score;
      return Math.min(m.d1, m.d2, m.d3, m.d4);
    }
    const stableHighSameProject = sameProject.filter(_isStableHigh);
    const stableHighSameCategory = sameCategory.filter(_isStableHigh);
    const duplicates = sameProject.filter(m => _isStableHigh(m) && _minDepth(m) >= duplicateAt);
    const topExternal = others.find(m => !m.name.startsWith(namespace + '/')) || null;

    const flowShapeDist = {};
    for (const m of others) {
      const sh = m.shape || (m.score > 0.90 ? 'STABLE-HIGH' : 'STABLE-MID');
      flowShapeDist[sh] = (flowShapeDist[sh] || 0) + 1;
    }

    const flags = [];
    if (truncated) flags.push('TRUNCATED');
    if (stableHighSameProject.length === 0) flags.push('ORPHAN');
    if (duplicates.length > 0) flags.push('DUPLICATE');
    if (category.startsWith('api/') && stableHighSameCategory.length === 0 && stableHighSameProject.length > 0) flags.push('INCONSISTENT');
    if (stableHighSameProject.length >= 3 && stableHighSameCategory.length >= 1) flags.push('WELL-FORMED');

    try { onProgress(fileIdx, files.length, rel, Date.now() - tFile); } catch { /* progress is best-effort */ }

    // Over-cap files: re-read coherence from the full text (the focused
    // goggle has no cap and handles these fine) so the map carries the
    // same number FOCUS would show. Genuine blobs stay withheld.
    let coherence = r.coherence;
    if (truncated) {
      coherence = null;
      if (fullText.length <= FULL_COHERENCE_CAP) {
        try {
          const rFull = ft.read(
            { content: fullText, name: rel, language: _inferLang(rel) },
            { source: sourceTag + ':full-coherence', growSubstrate: false, topK: 1 },
          );
          if (rFull && typeof rFull.coherence === 'number') coherence = rFull.coherence;
        } catch { /* stays withheld */ }
      }
    }

    results.push({
      rel, category, flags,
      // intrinsic structural coherence — distinct from the resonance-based
      // neighbour stats below (sameProject/sameCategory derive from voidResonance).
      // For TRUNCATED files this is the full-text reading (or null for blobs).
      coherence,
      sameProject: sameProject.length,
      sameCategory: sameCategory.length,
      stableHighSameProject: stableHighSameProject.length,
      stableHighSameCategory: stableHighSameCategory.length,
      flowShapeDist,
      duplicates: duplicates.map(d => ({
        name: d.name.slice(namespace.length + 1),
        score: d.d4 !== undefined ? d.d4 : d.score,
        minDepth: _minDepth(d),
        shape: d.shape || 'STABLE-HIGH',
      })),
      topCousin: others[0] || null,
      topExternal,
      _vec: r.composed || null, // for the in-repo pairwise pass below
    });
  }

  // ── 1b. In-repo pairwise pass — the same sibling engine substrate
  // mode uses (_pairwiseFlow), run over the vectors just encoded. The
  // substrate-topK stats above are EMPTY for a repo the substrate has
  // not witnessed (every file misread as ORPHAN — the supabase
  // degeneracy) and truncated at topK for a witnessed one; the repo's
  // own files compared to each other are the ground truth for in-repo
  // wiring. Substrate matches remain authoritative for what they truly
  // measure: external bridges and ecosystem placement.
  {
    const pool = results.filter(r => Array.isArray(r._vec) && r._vec.length > 0);
    if (pool.length >= 2) {
      const flow = _pairwiseFlow(pool.map(r => ({ rel: r.rel, vec: r._vec })), { duplicateAt });
      for (let i = 0; i < pool.length; i++) {
        const r = pool[i];
        const { stableHigh, duplicates, siblings } = flow[i];
        const stableHighSameCategory = siblings.filter(
          s => s.shape === 'STABLE-HIGH' && categorize(s.rel) === r.category).length;
        r.stableHighSameProject = stableHigh;
        r.stableHighSameCategory = stableHighSameCategory;
        r.duplicates = duplicates.map(d => ({ name: d.name, score: d.score, minDepth: d.minDepth, shape: d.shape }));
        r.siblings = siblings;
        r.nearestSibling = siblings[0]
          ? { name: siblings[0].rel, d4: siblings[0].d4, shape: siblings[0].shape, score: siblings[0].d4 }
          : null;
        const flags = [];
        // Preserve content-derived flags (TRUNCATED) — this rebuild only
        // owns the resonance-derived ones.
        if (r.flags.includes('TRUNCATED')) flags.push('TRUNCATED');
        if (stableHigh === 0) flags.push('ORPHAN');
        if (duplicates.length > 0) flags.push('DUPLICATE');
        if (r.category.startsWith('api/') && stableHighSameCategory === 0 && stableHigh > 0) flags.push('INCONSISTENT');
        if (stableHigh >= 3) flags.push('WELL-FORMED');
        r.flags = flags;
      }
    }
    for (const r of results) delete r._vec;
  }

  // ── 2. Per-category health ───────────────────────────────────
  const perCategory = {};
  for (const r of results) {
    if (!perCategory[r.category]) {
      perCategory[r.category] = { n: 0, wellFormed: 0, orphan: 0, inconsistent: 0, duplicate: 0 };
    }
    const c = perCategory[r.category];
    c.n++;
    if (r.flags.includes('WELL-FORMED')) c.wellFormed++;
    if (r.flags.includes('ORPHAN')) c.orphan++;
    if (r.flags.includes('INCONSISTENT')) c.inconsistent++;
    if (r.flags.includes('DUPLICATE')) c.duplicate++;
  }

  // ── 3. Fix buckets ───────────────────────────────────────────
  const buckets = {
    A_components_incoherent: _annotateOrphans(results.filter(r => r.category === 'components' && !r.flags.includes('WELL-FORMED')), projectPath),
    B_api_inconsistent: results.filter(r => r.category.startsWith('api/') && r.flags.includes('INCONSISTENT')),
    C_lib_drift: results.filter(r => r.category === 'lib' && (
      r.flags.includes('ORPHAN') ||
      (!r.flags.includes('WELL-FORMED') && r.topExternal && r.topExternal.score >= 0.95)
    )),
    D_duplicate_pairs: _annotateDataPairs(_dedupePairs(results), projectPath),
    E_other_orphans: _annotateOrphans(results.filter(r =>
      r.flags.includes('ORPHAN') &&
      !['components', 'lib'].includes(r.category) &&
      !r.category.startsWith('api/')
    ), projectPath),
  };

  // ── 4. Cross-system bridges ──────────────────────────────────
  const bridges = [];
  for (const r of results) {
    if (r.topExternal && r.topExternal.score >= 0.95) {
      bridges.push({ from: r.rel, to: r.topExternal.name, score: r.topExternal.score });
    }
  }
  bridges.sort((a, b) => b.score - a.score);

  // ── 5. Aggregate field contributions ─────────────────────────
  // Only readings that are actually about ALIGNMENT go to the field.
  // Size metrics (files audited, bridge count) and sparse-coverage
  // artifacts (well-formed ratios when the substrate holds few patterns
  // for this namespace, so in-repo cousins can't surface within global
  // topK) previously contributed as coherence and cratered the field
  // with false "unhealthy" readings on small or under-indexed repos.
  // "Small" and "under-indexed" are not "misaligned" — they stay in the
  // report as diagnostics but are not field observations.
  let contributionsCount = 0;
  function _ctr(coh, src) {
    try { fc.contribute({ cost: 1.0, coherence: coh, source: src }); contributionsCount++; } catch {}
  }
  // NO AVERAGING. This used to reduce every scored file to one mean and
  // contribute that single number as the repo's structural coherency. The
  // mean is not a reading — no file has it, and the compressor never emitted
  // it. Each scored file carries a coherency the compressor measured off its
  // bytes; those go in as themselves, at cost 1 each, the same way `--do
  // replay` and harvest feed the field.
  //
  // TRUNCATED files carry coherence:null and are skipped — withheld is not
  // zero.
  const scored = results.filter(r => typeof r.coherence === 'number');
  for (const r of scored) {
    _ctr(r.coherence, 'void:compress_signal:map:' + namespace);
  }
  _ctr(1 - buckets.D_duplicate_pairs.length / Math.max(1, results.length / 2), 'coherency-map:' + namespace + ':non-duplication');
  // Orphan-rate meta-signal — same rule as the residual and dimensional
  // couplings: a completed wiring measurement is a COHERENT event (the
  // instrument worked), so it contributes at healthy coherence with the
  // RATE in the source bucket, never in the coherence scalar.
  const orphanRate = results.length
    ? results.filter(r => r.flags.includes('ORPHAN')).length / results.length : 0;
  _ctr(0.9, 'coherency-map:' + namespace + ':orphan-rate:'
    + (orphanRate >= 0.5 ? 'high' : orphanRate >= 0.15 ? 'elevated' : 'low'));

  return {
    project: namespace,
    projectPath,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - t0,
    filesAudited: results.length,
    // Distribution, not an average. `medianCoherence` is an actual file's
    // reading — some file in this repo really measured that. A mean is a
    // number no file has and the compressor never produced, so it is not
    // reported here at all.
    medianCoherence: _median(scored.map(r => r.coherence)),
    minCoherence: scored.length ? Math.min(...scored.map(r => r.coherence)) : null,
    maxCoherence: scored.length ? Math.max(...scored.map(r => r.coherence)) : null,
    scoredCount: scored.length,
    substrateSize: results[0] && results[0].topCousin ? '~46k+ (per FieldTool)' : 'unknown',
    // Compact per-file readings — the macro lens (goggles MACRO section)
    // ranks a focused file against these to place it in the whole map.
    files: results.map(r => ({
      rel: r.rel, category: r.category, coherence: r.coherence, flags: r.flags,
      stableHighSameProject: r.stableHighSameProject,
    })),
    perCategory,
    buckets,
    crossSystemBridges: bridges.slice(0, 30),
    fieldStateBefore: { coherence: before.coherence, updateCount: before.updateCount, sources: Object.keys(before.sources || {}).length },
    fieldStateAfter: (() => { const a = fc.peekField(); return { coherence: a.coherence, updateCount: a.updateCount, sources: Object.keys(a.sources || {}).length }; })(),
    contributionsCount,
  };
}
mapProjectCoherency.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'odd', phase: 'plasma',
  reactivity: 'reactive', electronegativity: 0.9, group: 14, period: 6,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'analysis',
};

module.exports = { mapProjectCoherency };
