'use strict';

/**
 * coherency-mapper.js — map a project's structural coherency.
 *
 * Reads every file in a project through the field-tool protocol
 * (engaging entanglement + canonical encoder + substrate match +
 * coding cousins + field contribution), then surfaces:
 *
 *   - per-category structural health (well-formed/orphan/inconsistent
 *     /duplicate counts)
 *   - flagged files needing attention, grouped into fix buckets
 *   - cross-system bridges (where this project's patterns resonate
 *     with the rest of the substrate)
 *   - aggregate summary contribution back to the field
 *
 * Every per-file read contributes to the LRE automatically via
 * FieldTool.read's built-in fc.contribute call. The mapper then
 * adds aggregate contributions on top (coherency:map:<project>:*)
 * so the field histogram carries the project-level findings.
 *
 * Output shape is designed to be consumed by entangled agents
 * (each fix bucket becomes a tractable subtask) or surfaced
 * directly as a docs artifact.
 */

const fs = require('node:fs');
const path = require('node:path');
const fc = require('./field-coupling');
const ft = require('./field-tool');

const DEFAULT_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.rb', '.java',
  '.md', '.json', '.toml', '.yaml', '.yml', '.css', '.html',
];

const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'target', 'dist', 'build',
  'vendor', '__pycache__', '.venv', 'venv', '.pytest_cache',
  'coverage', '.nyc_output', '.remembrance', '.cache',
]);

const DEFAULT_CATEGORIZER = (rel) => {
  if (rel.startsWith('app/api/')) {
    if (rel.includes('/portal/') || rel.includes('/client/')) return 'api/portal';
    if (rel.includes('/leads/')) return 'api/leads';
    if (rel.includes('/admin/')) return 'api/admin';
    if (rel.includes('/stripe/') || rel.includes('/checkout/') || rel.includes('/webhook')) return 'api/payment';
    return 'api/other';
  }
  if (rel.startsWith('app/portal/')) return 'page/portal';
  if (rel.startsWith('app/admin/')) return 'page/admin';
  if (rel.startsWith('app/lib/') || rel.startsWith('app/utils/')) return 'lib';
  if (rel.startsWith('app/components/') || rel.includes('/components/')) return 'components';
  if (rel.startsWith('app/')) return 'page/marketing';
  if (rel.startsWith('lib/') || rel.startsWith('src/lib/')) return 'lib';
  if (rel.startsWith('src/')) return 'src';
  if (rel.startsWith('public/')) return 'public';
  if (rel.startsWith('scripts/')) return 'scripts';
  if (/\.(test|spec)\.(ts|tsx|js)$/.test(rel)) return 'tests';
  if (rel.endsWith('.md')) return 'docs';
  if (rel.endsWith('.json') || rel.endsWith('.toml') || rel.endsWith('.yaml') || rel.endsWith('.yml')) return 'config';
  if (/^(next|tailwind|tsconfig|package|postcss|jest|eslint|prettier|vite|webpack)/.test(rel)) return 'config';
  return 'other';
};

/**
 * Detect the substrate namespace for a project by resonance
 * self-identification. The Void substrate indexes repos under short
 * aliases (rmb-blockchain, oracle, claw, …) that rarely match the
 * directory basename (REMEMBRANCE-BLOCKCHAIN, …) — so guessing the
 * namespace from the path misclassifies every file as ORPHAN and turns
 * self-matches into fake 1.0000 "cross-system bridges". Instead: read a
 * small sample of the project's files against the substrate, find their
 * exact self-matches (cosine ≥ selfMatchAt with the same basename), and
 * take the dominant name prefix. The substrate tells us who we are.
 *
 * @param {string[]} files       — absolute file paths from the walk
 * @param {string}   projectPath — project root (for relative names)
 * @param {object}   [opts]
 *   sampleSize?:  number = 8    — how many files to read for detection
 *   selfMatchAt?: number = 0.999 — cosine floor for a self-match
 *   sourceTag?:   string        — field-coupling source for the reads
 * @returns {string|null} the detected namespace, or null when no
 *   prefix reaches two independent self-matches.
 */
function detectSubstrateNamespace(files, projectPath, opts = {}) {
  const sampleSize = opts.sampleSize || 8;
  const selfMatchAt = opts.selfMatchAt || 0.999;
  const sourceTag = opts.sourceTag || 'coherency-map:detect-namespace';
  // Spread the sample across the walk order rather than taking a block,
  // so one directory can't dominate the vote.
  const candidates = files.filter(f => /\.(m?[jt]sx?|c[jt]s|py|rs|go|md)$/.test(f));
  const step = Math.max(1, Math.floor(candidates.length / sampleSize));
  const sample = [];
  for (let i = 0; i < candidates.length && sample.length < sampleSize; i += step) {
    sample.push(candidates[i]);
  }
  const votes = {};
  for (const f of sample) {
    let content;
    try { content = fs.readFileSync(f, 'utf8').slice(0, 12000); } catch { continue; }
    if (content.length < 60) continue;
    const rel = path.relative(projectPath, f);
    let r;
    try {
      r = ft.read(
        { content, name: rel, language: _inferLang(rel) },
        { source: sourceTag, growSubstrate: false, topK: 3 },
      );
    } catch { continue; }
    const matches = (r && r.voidResonance && r.voidResonance.topMatches) || [];
    for (const m of matches) {
      const score = m.d4 !== undefined ? m.d4 : (m.score || 0);
      const name = String(m.name || '');
      if (score >= selfMatchAt && name.includes('/')
          && path.basename(name) === path.basename(rel)) {
        const prefix = name.split('/')[0];
        votes[prefix] = (votes[prefix] || 0) + 1;
      }
    }
  }
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  // Two independent self-matches make a quorum; a single hit could be a
  // genuine cross-repo duplicate (bootstrap scripts, shared docs).
  if (ranked.length && ranked[0][1] >= 2) return ranked[0][0];
  return null;
}

function _walk(dir, opts) {
  const out = [];
  const stack = [dir];
  const skip = opts.skipDirs || DEFAULT_SKIP_DIRS;
  const exts = opts.extensions || DEFAULT_EXTENSIONS;
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (exts.includes(ext)) out.push(full);
      }
    }
  }
  return out;
}

/**
 * Map the structural coherency of a project.
 *
 * @param {string} projectPath        — absolute path to the project root
 * @param {object} [opts]
 *   namespace?:    string             — substrate namespace prefix (defaults to project basename)
 *   categorize?:   (rel) => category  — file categorizer (defaults to typical web project)
 *   extensions?:   string[]           — extensions to include
 *   skipDirs?:     Set<string>        — dirs to skip during walk
 *   topK?:         number = 10        — top-K cousins per file
 *   contentCap?:   number = 12000     — per-file content cap
 *   duplicateAt?:  number = 0.999     — duplicate threshold
 *   sourceTag?:    string             — field-coupling source for per-file reads
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
    try { content = fs.readFileSync(f, 'utf8').slice(0, contentCap); } catch { continue; }
    if (content.length < 60) continue;

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
    // it's STABLE-HIGH AND the minimum cosine across all four depths
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
    if (stableHighSameProject.length === 0) flags.push('ORPHAN');
    if (duplicates.length > 0) flags.push('DUPLICATE');
    if (category.startsWith('api/') && stableHighSameCategory.length === 0 && stableHighSameProject.length > 0) flags.push('INCONSISTENT');
    if (stableHighSameProject.length >= 3 && stableHighSameCategory.length >= 1) flags.push('WELL-FORMED');

    try { onProgress(fileIdx, files.length, rel, Date.now() - tFile); } catch { /* progress is best-effort */ }

    results.push({
      rel, category, flags,
      // intrinsic structural coherence — distinct from the resonance-based
      // neighbour stats below (sameProject/sameCategory derive from voidResonance)
      coherence: r.coherence,
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
  // mode uses (pairwiseFlow), run over the vectors just encoded. The
  // substrate-topK stats above are EMPTY for a repo the substrate has
  // not witnessed (every file misread as ORPHAN — the supabase
  // degeneracy) and truncated at topK for a witnessed one; the repo's
  // own files compared to each other are the ground truth for in-repo
  // wiring. Substrate matches remain authoritative for what they truly
  // measure: external bridges and ecosystem placement.
  {
    const pool = results.filter(r => Array.isArray(r._vec) && r._vec.length > 0);
    if (pool.length >= 2) {
      const flow = pairwiseFlow(pool.map(r => ({ rel: r.rel, vec: r._vec })), { duplicateAt });
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
    A_components_incoherent: results.filter(r => r.category === 'components' && !r.flags.includes('WELL-FORMED')),
    B_api_inconsistent: results.filter(r => r.category.startsWith('api/') && r.flags.includes('INCONSISTENT')),
    C_lib_drift: results.filter(r => r.category === 'lib' && (
      r.flags.includes('ORPHAN') ||
      (!r.flags.includes('WELL-FORMED') && r.topExternal && r.topExternal.score >= 0.95)
    )),
    D_duplicate_pairs: _dedupePairs(results),
    E_other_orphans: results.filter(r =>
      r.flags.includes('ORPHAN') &&
      !['components', 'lib'].includes(r.category) &&
      !r.category.startsWith('api/')
    ),
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
  function ctr(coh, src) {
    try { fc.contribute({ cost: 1.0, coherence: coh, source: src }); contributionsCount++; } catch {}
  }
  const meanCoherence = results.length
    ? results.reduce((s, r) => s + (r.coherence || 0), 0) / results.length
    : 0;
  ctr(meanCoherence, 'coherency-map:' + namespace + ':structural');
  ctr(1 - buckets.D_duplicate_pairs.length / Math.max(1, results.length / 2), 'coherency-map:' + namespace + ':non-duplication');
  // Orphan-rate meta-signal — same rule as the residual and dimensional
  // couplings: a completed wiring measurement is a COHERENT event (the
  // instrument worked), so it contributes at healthy coherence with the
  // RATE in the source bucket, never in the coherence scalar.
  const orphanRate = results.length
    ? results.filter(r => r.flags.includes('ORPHAN')).length / results.length : 0;
  ctr(0.9, 'coherency-map:' + namespace + ':orphan-rate:'
    + (orphanRate >= 0.5 ? 'high' : orphanRate >= 0.15 ? 'elevated' : 'low'));

  return {
    project: namespace,
    projectPath,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - t0,
    filesAudited: results.length,
    meanCoherence,
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

// ── Substrate-native map — read the compression, don't rebuild it ───
//
// The Void substrate already holds the encoded signature of every
// ingested file (fractal 29-D + composed_v1 116-D). A coherency map is
// therefore a READ over existing vectors — pure math, seconds — not a
// re-encode of the repo. mapProjectCoherency() above (which re-reads
// every file through the live encoder) remains as the deep/refresh
// path for repos the substrate hasn't ingested yet.

/**
 * Detect the substrate namespace with zero encoding: one pass over the
 * index names, voting for the prefix whose entries' relative paths
 * coincide with the repo's walked files.
 *
 * @param {string[]} rels — repo-relative file paths
 * @param {Iterable<string>} indexNames — substrate pattern names
 * @returns {string|null}
 */
function namespaceFromIndexNames(rels, indexNames) {
  const relSet = new Set(rels);
  const votes = {};
  for (const name of indexNames) {
    const i = name.indexOf('/');
    if (i <= 0) continue;
    if (relSet.has(name.slice(i + 1))) {
      const prefix = name.slice(0, i);
      votes[prefix] = (votes[prefix] || 0) + 1;
    }
  }
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  // Three coinciding paths make a quorum; one or two could be shared
  // boilerplate (bootstrap scripts, AGENTS.md) living in several repos.
  if (ranked.length && ranked[0][1] >= 3) return ranked[0][0];
  return null;
}

// One pass over 116 dims accumulating partial dot products at the four
// depth checkpoints (29/58/87/116) — d1..d4 cosines in a single sweep.
function _flowCosines(a, b) {
  const CHECK = [29, 58, 87, 116];
  const out = [0, 0, 0, 0];
  let dot = 0, na = 0, nb = 0, c = 0;
  const n = Math.min(116, a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
    if (i + 1 === CHECK[c]) {
      out[c] = (na > 1e-12 && nb > 1e-12) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
      c++;
    }
  }
  // Vectors shorter than a checkpoint reuse the deepest reading available.
  for (; c < 4; c++) out[c] = c > 0 ? out[c - 1] : 0;
  return out;
}

/**
 * Build the macro coherency map from the substrate's existing vectors.
 *
 * No file content is read and nothing is encoded (except nothing at
 * all — even namespace detection is index-name matching). The map is
 * assembled from what the Void already compressed:
 *   - orphans / stable-high siblings / flow shapes: in-namespace
 *     pairwise depth-flow over composed_v1
 *   - duplicates: min-depth cosine ≥ duplicateAt across all 4 depths
 *   - cross-system bridges: L1 scan of flagged entries vs the rest of
 *     the substrate
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
  const { VoidLibrary } = require('./void-library');
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
  // Entries whose rel is not a file on disk: either files deleted since
  // ingestion, or older-vintage pattern-style entries (name:language).
  // They stay in the sibling pool (a file's duplicate may live there)
  // but are excluded from the per-file health table — a map of the repo
  // should count the repo's files, not the substrate's history.
  const ghosts = entries.filter(e => !walkedSet.has(e.rel)).map(e => e.rel);

  // 4. In-namespace pairwise depth-flow: nearest sibling, stable-high
  //    count, duplicates. One 116-dim sweep per pair. Flags are
  //    computed for on-disk files only; the full entry set (including
  //    ghosts) remains the sibling pool being compared against.
  // The file's NEIGHBORHOOD comes from pairwiseFlow — the ONE sibling
  // engine both map modes share: top in-repo siblings by full-depth
  // cosine with flow shapes, stable-high counts, duplicates.
  const flow = pairwiseFlow(entries, { duplicateAt });
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
    let bestName = null, bestScore = -1;
    for (const [name, vec] of fractals) {
      if (name.startsWith(prefix)) continue;
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
      const [d1, d2, d3, d4] = _flowCosines(cv, candidate);
      const minDepth = Math.min(d1, d2, d3, d4);
      if (minDepth < bridgeAt) continue; // L1 saturation, not a bridge
      bridges.push({ from: r.rel, to: bestName, score: d4, minDepth });
      r.topExternal = { name: bestName, score: d4 };
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
    D_duplicate_pairs: _dedupePairs(results),
    E_other_orphans: results.filter(r =>
      r.flags.includes('ORPHAN')
      && !['components', 'lib'].includes(r.category)
      && !r.category.startsWith('api/')
    ),
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
    meanCoherence: null,
    substrateSize: composed.size,
    coverage: {
      walkedFiles: walked.length,
      indexedFiles: results.length,
      unindexed: unindexed.slice(0, 30),
      unindexedCount: unindexed.length,
      ghosts: ghosts.slice(0, 30),
      ghostCount: ghosts.length,
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

function _dedupePairs(results) {
  const seen = new Map();
  for (const r of results) {
    for (const d of r.duplicates) {
      const key = [r.rel, d.name].sort().join(' ↔ ');
      if (!seen.has(key)) {
        seen.set(key, { a: r.rel, b: d.name, score: d.score });
      }
    }
  }
  return [...seen.values()];
}

function _inferLang(rel) {
  const ext = path.extname(rel).toLowerCase();
  return ({
    '.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.jsx': 'jsx', '.mjs': 'js', '.cjs': 'js',
    '.py': 'python', '.rs': 'rust', '.go': 'go', '.rb': 'ruby', '.java': 'java',
    '.md': 'markdown', '.json': 'json', '.toml': 'toml',
    '.yaml': 'yaml', '.yml': 'yaml', '.css': 'css', '.html': 'html',
  })[ext] || 'unknown';
}

/**
 * Convenience: map + format as a structured report string.
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
  lines.push('  D  duplicate pairs       : ' + m.buckets.D_duplicate_pairs.length);
  lines.push('  E  other orphans         : ' + m.buckets.E_other_orphans.length);
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

// ── Coherency flow reading ─────────────────────────────────────
//
// Depth-aware reading of how a cousin relationship reads at every
// scale of the encoder. The shape of the flow IS the signal:
//
//   STABLE-HIGH    d1 ≈ d2 ≈ d3 ≈ d4 ≈ high  → real fundamental cousin
//   ASCENDING      d1 low, d4 high            → hidden similarity surfacing
//   DECAY          d1 high, d4 low             → surface similarity only
//   OSCILLATING    mixed                       → partial / scale-dependent
//
// Coherency is meant to be read as a flow across all depths, not
// from any one depth's verdict. Each depth captures structure at a
// different scale; the flow shape says what kind of similarity is
// at hand.

function _cosineLen(a, b, len) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Read the coherency flow between two patterns across all depths.
 * Each pattern must carry both `l1` (29-D) and `composed` (29*k-D)
 * vectors from the substrate.
 *
 * Returns the d1..d4 cosines plus the flow shape category.
 */
function coherencyFlow(a, b) {
  if (!a || !b) return null;
  const d1 = _cosineLen(a.l1 || a.fractal, b.l1 || b.fractal, 29);
  const composedA = a.composed || a.composed_v1;
  const composedB = b.composed || b.composed_v1;
  let d2 = 0, d3 = 0, d4 = 0;
  if (composedA && composedB) {
    d2 = _cosineLen(composedA, composedB, Math.min(58, composedA.length));
    d3 = _cosineLen(composedA, composedB, Math.min(87, composedA.length));
    d4 = _cosineLen(composedA, composedB, Math.min(116, composedA.length));
  } else {
    d2 = d3 = d4 = d1;
  }
  return { d1, d2, d3, d4, shape: classifyFlow({ d1, d2, d3, d4 }) };
}

/**
 * In-repo pairwise depth-flow — the ONE sibling engine both map modes
 * share. For every entry, sweep the whole pool: stable-high count,
 * duplicates (min-depth ≥ duplicateAt), and the top-5 sibling
 * neighbourhood with flow shapes. Extracted from mapFromSubstrate so
 * the deep path can run the exact same comparison over vectors it just
 * encoded — deep mode previously derived in-repo stats from substrate
 * topK matches, which are EMPTY for an unwitnessed repo (every file
 * misread as ORPHAN — the supabase degeneracy) and truncated for a
 * witnessed one.
 *
 * @param {Array<{rel: string, vec: number[]}>} entries — the pool
 * @param {object} [opts] duplicateAt?: number = 0.999
 * @returns {Array<{stableHigh, duplicates, siblings}>} per-entry stats
 */
function pairwiseFlow(entries, opts = {}) {
  const duplicateAt = opts.duplicateAt || 0.999;
  const n = entries.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let stableHigh = 0;
    const duplicates = [];
    const siblings = []; // kept sorted desc by d4, capped at 5
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const [d1, d2, d3, d4] = _flowCosines(entries[i].vec, entries[j].vec);
      const shape = classifyFlow({ d1, d2, d3, d4 });
      if (shape === 'STABLE-HIGH') {
        stableHigh++;
        const minDepth = Math.min(d1, d2, d3, d4);
        if (minDepth >= duplicateAt) {
          duplicates.push({ name: entries[j].rel, score: d4, minDepth, shape });
        }
      }
      if (siblings.length < 5 || d4 > siblings[siblings.length - 1].d4) {
        siblings.push({ rel: entries[j].rel, d4, shape });
        siblings.sort((a, b) => b.d4 - a.d4);
        if (siblings.length > 5) siblings.pop();
      }
    }
    out[i] = { stableHigh, duplicates, siblings };
  }
  return out;
}

function classifyFlow(f) {
  const values = [f.d1, f.d2, f.d3, f.d4];
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min;
  if (range < 0.05) {
    if (max > 0.90) return 'STABLE-HIGH';
    if (max < 0.50) return 'STABLE-LOW';
    return 'STABLE-MID';
  }
  let inc = 0, dec = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i-1] + 0.01) inc++;
    if (values[i] < values[i-1] - 0.01) dec++;
  }
  if (dec >= 2 && inc <= 1) return 'DECAY';
  if (inc >= 2 && dec <= 1) return 'ASCENDING';
  return 'OSCILLATING';
}

function formatFlow(f) {
  if (!f) return 'no-flow';
  return `${f.d1.toFixed(3)} → ${f.d2.toFixed(3)} → ${f.d3.toFixed(3)} → ${f.d4.toFixed(3)}  [${f.shape}]`;
}

module.exports = {
  mapProjectCoherency,
  mapFromSubstrate,
  namespaceFromIndexNames,
  detectSubstrateNamespace,
  formatMap,
  coherencyFlow,
  classifyFlow,
  formatFlow,
  DEFAULT_EXTENSIONS,
  DEFAULT_SKIP_DIRS,
  DEFAULT_CATEGORIZER,
};
