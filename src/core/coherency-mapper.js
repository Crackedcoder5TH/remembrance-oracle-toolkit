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
  const namespace = opts.namespace || path.basename(projectPath);
  const categorize = opts.categorize || DEFAULT_CATEGORIZER;
  const topK = opts.topK || 10;
  const contentCap = opts.contentCap || 12000;
  const duplicateAt = opts.duplicateAt || 0.999;
  const sourceTag = opts.sourceTag || ('coherency-map:' + namespace + ':read');

  const t0 = Date.now();
  const files = _walk(projectPath, opts);
  const results = [];
  const before = fc.peekField();

  // ── 1. Per-file reads through the canonical protocol ─────────
  for (const f of files) {
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
    });
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
  let contributionsCount = 0;
  function ctr(coh, src) {
    try { fc.contribute({ cost: 1.0, coherence: coh, source: src }); contributionsCount++; } catch {}
  }
  ctr(Math.min(1, results.length / 1000), 'coherency-map:' + namespace + ':files-audited');
  ctr(1 - buckets.A_components_incoherent.length / Math.max(1, results.length), 'coherency-map:' + namespace + ':components-health');
  ctr(1 - buckets.B_api_inconsistent.length / Math.max(1, results.length), 'coherency-map:' + namespace + ':api-health');
  ctr(1 - buckets.C_lib_drift.length / Math.max(1, results.length), 'coherency-map:' + namespace + ':lib-health');
  ctr(1 - buckets.D_duplicate_pairs.length / Math.max(1, results.length / 2), 'coherency-map:' + namespace + ':non-duplication');
  ctr(bridges.length > 0 ? Math.min(1, bridges.length / 100) : 0, 'coherency-map:' + namespace + ':cross-system-bridges');
  for (const [cat, c] of Object.entries(perCategory)) {
    ctr(c.wellFormed / Math.max(1, c.n), 'coherency-map:' + namespace + ':category:' + cat + ':well-formed-ratio');
  }

  return {
    project: namespace,
    projectPath,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - t0,
    filesAudited: results.length,
    substrateSize: results[0] && results[0].topCousin ? '~46k+ (per FieldTool)' : 'unknown',
    perCategory,
    buckets,
    crossSystemBridges: bridges.slice(0, 30),
    fieldStateBefore: { coherence: before.coherence, updateCount: before.updateCount, sources: Object.keys(before.sources || {}).length },
    fieldStateAfter: (() => { const a = fc.peekField(); return { coherence: a.coherence, updateCount: a.updateCount, sources: Object.keys(a.sources || {}).length }; })(),
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
  lines.push('  field Δ:       coh ' + (m.fieldStateAfter.coherence - m.fieldStateBefore.coherence).toFixed(4) +
    '  sources +' + (m.fieldStateAfter.sources - m.fieldStateBefore.sources));
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
  formatMap,
  coherencyFlow,
  classifyFlow,
  formatFlow,
  DEFAULT_EXTENSIONS,
  DEFAULT_SKIP_DIRS,
  DEFAULT_CATEGORIZER,
};
