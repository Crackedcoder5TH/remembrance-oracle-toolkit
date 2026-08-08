'use strict';

/**
 * mapper/substrate-map.js — the substrate-native map: read the
 * compression, don't rebuild it.
 *
 * The Void substrate already holds the encoded signature of every
 * ingested file. A coherency map is therefore a READ over existing
 * vectors — pure math, seconds — not a re-encode of the repo.
 * mapper/deep-map.js (which re-reads every file through the live
 * encoder) remains as the deep/refresh path for repos the substrate
 * hasn't ingested yet. Extracted verbatim from coherency-mapper.js in
 * the flagship decomposition.
 */

const fs = require('node:fs');
const path = require('node:path');
const fc = require('../field-coupling');
const {
  flowCosines: _flowCosines, deepestFlow: _deepestFlow,
} = require('../decoder-stack');
const { DEFAULT_CATEGORIZER, _walk, substrateSelfNames } = require('./config');
const { namespaceFromIndexNames } = require('./namespace');
const { _pairwiseFlow } = require('./flow');
const { _dedupePairs, _annotateDataPairs, _annotateOrphans } = require('./pairs');

/**
 * Build the macro coherency map from the substrate's existing vectors.
 *
 * No file content is read and nothing is encoded (except nothing at
 * all — even namespace detection is index-name matching). The map is
 * assembled from what the Void already compressed:
 *   - orphans / stable-high siblings / flow shapes: in-namespace
 *     pairwise depth-flow over composed vectors
 *   - duplicates: min-depth cosine ≥ duplicateAt across all depths
 *   - cross-system bridges: L1 scan of flagged entries vs the rest of
 *     the substrate, confirmed at full depth
 *   - coverage: which repo files the substrate has / hasn't ingested
 *
 * Intrinsic per-file coherence is deliberately NOT here — it's a
 * content property the per-file goggle (FOCUS) computes live. Use
 * mapProjectCoherency (--deep) when you need it in the map.
 *
 * @param {string} projectPath
 * @param {object} [opts] — namespace?, voidRoot?, duplicateAt?=0.999,
 *   stableHighAt?=0.90, bridgeAt?=0.99, bridgeScope?='flagged'|'all'
 * @returns {object|null} same shape as mapProjectCoherency (files[].coherence
 *   is null), or null when the substrate index is unavailable.
 */
function mapFromSubstrate(projectPath, opts = {}) {
  const t0 = Date.now();
  const { VoidLibrary } = require('../void-library');
  const lib = opts.voidLibrary
    || new VoidLibrary(opts.voidRoot ? { voidRoot: opts.voidRoot } : {});
  if (lib.size() === 0) return null;
  const composed = lib._composed;
  const fractals = lib._fractals;
  if (!composed || composed.size === 0) return null;

  const categorize = opts.categorize || DEFAULT_CATEGORIZER;
  const duplicateAt = opts.duplicateAt || 0.999;
  const stableHighAt = opts.stableHighAt || 0.90;
  const bridgeAt = opts.bridgeAt || 0.99;
  const bridgeScope = opts.bridgeScope === 'all' ? 'all' : 'flagged';

  // 1. Repo walk — names only, no content reads.
  const walked = _walk(projectPath, opts).map(f => path.relative(projectPath, f));
  const walkedSet = new Set(walked);

  // 2. Namespace: pure index math, resonance detection only as fallback.
  const namespace = opts.namespace
    || namespaceFromIndexNames(walked, composed.keys())
    || path.basename(projectPath);

  // 3. Collect this namespace's entries with their pre-encoded vectors.
  const prefix = namespace + '/';
  const entries = [];
  for (const [name, vec] of composed) {
    if (name.startsWith(prefix)) {
      entries.push({ rel: name.slice(prefix.length), name, vec });
    }
  }
  if (entries.length === 0) return null;

  const entryRels = new Set(entries.map(e => e.rel));
  const unindexed = walked.filter(r => !entryRels.has(r));
  // Entries the walk didn't see are NOT one population, and reporting
  // them under one "ghosts (no longer on disk)" label misreads 98% of
  // them. Split by what each entry actually is:
  //   seededPatterns — pattern-style names (`lru-cache-rs:rust`), seeded
  //     library entries that were never repo files;
  //   walkInvisible  — files that EXIST on disk but the walk skips
  //     (extension/dir outside the walk rules);
  //   deleted        — path-style entries genuinely absent from disk.
  // All three stay in the sibling pool (a file's duplicate may live
  // there) but are excluded from the per-file health table — a map of
  // the repo should count the repo's files, not the substrate's history.
  const ghostBreakdown = { seededPatterns: [], walkInvisible: [], deleted: [] };
  //   supersededDuplicate — an entry from an OLDER key scheme whose real
  //     file is still indexed under the current one. `void/Void-Data-
  //     Compressor/api` is namespace `void/` plus a relpath that still
  //     carries the repo directory, with the extension stripped; the same
  //     file is present and current as `void/api.py`. Reporting these as
  //     "deleted since ingestion" is wrong twice over — nothing was deleted,
  //     and the substrate did not lose the memory. 26 of this repo's 50
  //     ghosts were this, and conflating them with real deletions is what
  //     would make a prune destroy history.
  ghostBreakdown.supersededDuplicate = [];
  // Compare against ALL index entries, not only files currently on disk. A
  // superseded key can duplicate an entry that is itself deleted —
  // `void/Void-Data-Compressor/fusion_lattice_simulation` supersedes
  // `void/fusion_lattice_simulation.py`, and that file is gone too. It is
  // still a duplicate KEY, not a second deletion, and counting it twice
  // overstates what the substrate lost.
  const _currentRels = new Set(entries.map((x) => x.rel));
  // The leading segment must be the REPO DIRECTORY NAME — the old scheme's
  // actual signature. Stripping ANY leading directory matches distinct files
  // in nested folders (`vscode-extension/README.md` vs `README.md`) and would
  // classify real entries as disposable duplicates.
  const _repoDir = path.basename(projectPath);
  const _isSuperseded = (rel) => {
    if (!rel.startsWith(_repoDir + '/')) return false;
    const base = rel.slice(_repoDir.length + 1);
    return ['.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.md', '.json', '.sh', '.rs']
      .some((ext) => _currentRels.has(base + ext)) || _currentRels.has(base);
  };
  for (const e of entries) {
    if (walkedSet.has(e.rel)) continue;
    if (e.rel.includes(':')) ghostBreakdown.seededPatterns.push(e.rel);
    else if (fs.existsSync(path.join(projectPath, e.rel))) ghostBreakdown.walkInvisible.push(e.rel);
    else if (_isSuperseded(e.rel)) ghostBreakdown.supersededDuplicate.push(e.rel);
    else ghostBreakdown.deleted.push(e.rel);
  }
  const ghosts = [].concat(ghostBreakdown.seededPatterns, ghostBreakdown.walkInvisible,
    ghostBreakdown.supersededDuplicate, ghostBreakdown.deleted);

  // 4. In-namespace pairwise depth-flow: nearest sibling, stable-high
  //    count, duplicates. Flags are computed for on-disk files only; the
  //    full entry set (including ghosts) remains the sibling pool being
  //    compared against. The file's NEIGHBORHOOD comes from _pairwiseFlow
  //    — the ONE sibling engine both map modes share.
  const flow = _pairwiseFlow(entries, { duplicateAt });
  const results = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!walkedSet.has(e.rel)) continue; // ghost — pool member, not a map row
    const { stableHigh, duplicates, siblings } = flow[i];
    const category = categorize(e.rel);
    const flags = [];
    if (stableHigh === 0) flags.push('ORPHAN');
    if (duplicates.length > 0) flags.push('DUPLICATE');
    if (stableHigh >= 3) flags.push('WELL-FORMED');
    results.push({
      rel: e.rel, category, flags,
      coherence: null, // intrinsic coherence is FOCUS's job (live read)
      stableHighSameProject: stableHigh,
      nearestSibling: siblings[0] ? { name: siblings[0].rel, d4: siblings[0].d4, shape: siblings[0].shape, score: siblings[0].d4 } : null,
      siblings,
      duplicates,
      _vecIdx: i,
    });
  }

  // 5. Cross-system bridges — two-stage. Stage 1: fast L1 scan for the
  //    nearest external candidate. Stage 2: confirm with the full
  //    depth-flow — a bridge must hold at EVERY depth (min-depth ≥
  //    bridgeAt), because L1 alone saturates on structurally-flat
  //    content (the known noise floor: a JS util and a stock series can
  //    read 1.0 at 29-D while diverging completely at depth).
  //    'flagged' scope (default) scans orphans + duplicates — the files
  //    whose identity questions the bridges answer; 'all' scans everything.
  const scan = bridgeScope === 'all'
    ? results
    : results.filter(r => r.flags.includes('ORPHAN') || r.flags.includes('DUPLICATE'));
  const bridges = [];
  for (const r of scan) {
    const l1 = fractals.get(prefix + r.rel);
    const cv = composed.get(prefix + r.rel);
    if (!l1) continue;
    // The file's own memory under an aliased namespace is identity,
    // never a bridge.
    const selfAliases = new Set(substrateSelfNames(namespace, r.rel).slice(1));
    let bestName = null, bestScore = -1;
    for (const [name, vec] of fractals) {
      if (name.startsWith(prefix)) continue;
      if (selfAliases.has(name)) continue;
      let dot = 0, na = 0, nb = 0;
      for (let k = 0; k < 29; k++) {
        const x = l1[k] || 0, y = vec[k] || 0;
        dot += x * y; na += x * x; nb += y * y;
      }
      const s = (na > 1e-12 && nb > 1e-12) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
      if (s > bestScore) { bestScore = s; bestName = name; }
    }
    if (!bestName || bestScore < bridgeAt) continue;
    // Stage 2: depth-flow confirmation over composed vectors.
    const candidate = composed.get(bestName);
    if (cv && candidate) {
      // Every active depth, not the first four. Destructuring d1..d4 read
      // 116 of 232 dims, so L5-redundancy · L6-content · L7-dimensional ·
      // L8-dynamical never reached the bridge test — and those are exactly
      // the layers that separate look-alikes.
      const flow2 = _flowCosines(cv, candidate);
      const minDepth = Math.min(...flow2);
      const deep = _deepestFlow(flow2);
      if (minDepth < bridgeAt) continue; // L1 saturation, not a bridge
      bridges.push({ from: r.rel, to: bestName, score: deep, minDepth });
      r.topExternal = { name: bestName, score: deep };
    } else {
      // No composed vector to confirm with — report but mark unconfirmed.
      bridges.push({ from: r.rel, to: bestName, score: bestScore, unconfirmed: true });
      r.topExternal = { name: bestName, score: bestScore };
    }
  }
  bridges.sort((a, b) => b.score - a.score);

  // 6. Per-category health.
  const perCategory = {};
  for (const r of results) {
    if (!perCategory[r.category]) {
      perCategory[r.category] = { n: 0, wellFormed: 0, orphan: 0, inconsistent: 0, duplicate: 0 };
    }
    const c = perCategory[r.category];
    c.n++;
    if (r.flags.includes('WELL-FORMED')) c.wellFormed++;
    if (r.flags.includes('ORPHAN')) c.orphan++;
    if (r.flags.includes('DUPLICATE')) c.duplicate++;
  }

  const buckets = {
    A_components_incoherent: results.filter(r => r.category === 'components' && !r.flags.includes('WELL-FORMED')),
    B_api_inconsistent: results.filter(r => r.category.startsWith('api/') && r.flags.includes('INCONSISTENT')),
    C_lib_drift: results.filter(r => r.category === 'lib' && r.flags.includes('ORPHAN')),
    D_duplicate_pairs: _annotateDataPairs(_dedupePairs(results), projectPath),
    E_other_orphans: _annotateOrphans(results.filter(r =>
      r.flags.includes('ORPHAN')
      && !['components', 'lib'].includes(r.category)
      && !r.category.startsWith('api/')
    ), projectPath),
  };

  // 7. Field contribution — only what the vectors honestly witness.
  let contributionsCount = 0;
  try {
    fc.contribute({
      cost: 1.0,
      coherence: 1 - buckets.D_duplicate_pairs.length / Math.max(1, results.length / 2),
      source: 'coherency-map:' + namespace + ':non-duplication',
    });
    contributionsCount++;
  } catch { /* best-effort */ }

  for (const r of results) delete r._vecIdx;

  return {
    project: namespace,
    projectPath,
    mode: 'substrate',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - t0,
    filesAudited: results.length,
    // Substrate mode reads structure, not intrinsic coherency — the readings
    // are a live-read job (--deep / FOCUS), so the distribution is empty here.
    medianCoherence: null,
    minCoherence: null,
    maxCoherence: null,
    scoredCount: 0,
    substrateSize: composed.size,
    coverage: {
      walkedFiles: walked.length,
      indexedFiles: results.length,
      unindexed: unindexed.slice(0, 30),
      unindexedCount: unindexed.length,
      ghosts: ghosts.slice(0, 30),
      ghostCount: ghosts.length,
      ghostBreakdown: {
        seededPatternCount: ghostBreakdown.seededPatterns.length,
        walkInvisibleCount: ghostBreakdown.walkInvisible.length,
        walkInvisible: ghostBreakdown.walkInvisible.slice(0, 10),
        supersededDuplicateCount: ghostBreakdown.supersededDuplicate.length,
        supersededDuplicate: ghostBreakdown.supersededDuplicate.slice(0, 10),
        deletedCount: ghostBreakdown.deleted.length,
        deleted: ghostBreakdown.deleted.slice(0, 10),
      },
    },
    files: results.map(r => ({
      rel: r.rel, category: r.category, coherence: r.coherence, flags: r.flags,
      stableHighSameProject: r.stableHighSameProject,
      siblings: r.siblings, // the file's in-repo neighborhood (top 5 + shapes)
    })),
    perCategory,
    buckets,
    crossSystemBridges: bridges.slice(0, 30),
    contributionsCount,
  };
}
mapFromSubstrate.atomicProperties = {
  charge: 1, valence: 4, mass: 'heavy', spin: 'even', phase: 'liquid',
  reactivity: 'stable', electronegativity: 0.85, group: 14, period: 6,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'analysis',
};

module.exports = { mapFromSubstrate };
