'use strict';

/**
 * Batch risk scanner — walks a directory tree, scores every source
 * file with `computeBugProbability`, and returns an aggregate report
 * sorted by probability descending.
 *
 * This is the batch counterpart to `src/quality/risk-score.js`. It's
 * intentionally kept separate so the single-file scorer stays a pure
 * function with no filesystem dependencies.
 *
 * What gets scanned:
 *   - .js / .mjs / .cjs / .ts / .tsx / .jsx files
 *   - excluding node_modules, .git, .remembrance, dist, build,
 *     coverage, .next, out, and `digital-cathedral/` subtrees
 *     (the cathedral holds intentionally-buggy fixtures that would
 *     dominate the risk report with false hits)
 *
 * What the report contains:
 *   - per-file { file, probability, riskLevel, topFactors[0]?.name }
 *   - counts by risk level
 *   - aggregate mean / median probability
 *   - topN worst offenders (default 10)
 *
 * Pure-ish: reads the filesystem but writes nothing. Safe to call
 * from CLI handlers, MCP tools, or CI jobs.
 */

const fs = require('fs');
const path = require('path');
const { computeBugProbability, classifyRisk } = require('./risk-score');

const DEFAULT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

const DEFAULT_EXCLUDES = new Set([
  'node_modules',
  '.git',
  '.remembrance',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  '.cache',
  'digital-cathedral', // intentionally-buggy fixtures, skip by default
]);

// Files larger than this are almost certainly not hand-written code
// (minified bundles, generated artifacts). Skip them so one JSON blob
// doesn't blow up the scan budget.
const MAX_BYTES = 512 * 1024;

/**
 * Scan a directory tree.
 *
 * @param {string} rootDir
 * @param {object} [options]
 *   - extensions: Set<string> of file extensions to include
 *   - excludes:   Set<string> of directory names to skip
 *   - topN:       how many worst offenders to include in stats.top
 *   - maxBytes:   skip files larger than this (default 512 KB)
 *   - weights:    override DEFAULT_WEIGHTS for computeBugProbability
 *   - onFile:     optional progress callback(filePath, index, total)
 * @returns {{ files: Array, stats: object, scannedAt: string }}
 */
function scanDirectory(rootDir, options = {}) {
  const extensions = options.extensions || DEFAULT_EXTENSIONS;
  const excludes = options.excludes || DEFAULT_EXCLUDES;
  const topN = options.topN || 10;
  const maxBytes = options.maxBytes || MAX_BYTES;
  const weights = options.weights;
  const onFile = typeof options.onFile === 'function' ? options.onFile : null;

  if (!fs.existsSync(rootDir)) {
    return emptyReport(rootDir, `directory not found: ${rootDir}`);
  }

  const candidates = collectFiles(rootDir, extensions, excludes);
  const results = [];
  let idx = 0;

  for (const file of candidates) {
    idx++;
    let stat;
    try { stat = fs.statSync(file); }
    catch { continue; }
    if (stat.size > maxBytes) continue;

    let code;
    try { code = fs.readFileSync(file, 'utf-8'); }
    catch { continue; }

    const analysis = computeBugProbability(code, { filePath: file, weights });
    // Unparseable / empty files come back with meta.skipped set and
    // probability 0. Surface those as SKIPPED so they don't silently
    // inflate the LOW bucket count in batch reports.
    const riskLevel = analysis.meta?.skipped ? 'SKIPPED' : analysis.riskLevel;
    results.push({
      file: path.relative(rootDir, file) || file,
      probability: analysis.probability,
      riskLevel,
      components: analysis.components,
      signals: {
        cyclomatic: analysis.signals.cyclomatic,
        maxDepth: analysis.signals.maxDepth,
        totalCoherency: analysis.signals.totalCoherency,
        lines: analysis.signals.lines,
      },
      topFactor: analysis.topFactors[0]?.name || null,
      skipped: analysis.meta?.skipped || null,
    });

    if (onFile) { try { onFile(file, idx, candidates.length); } catch { /* ignore */ } }
  }

  return buildReport(rootDir, results, topN);
}

/**
 * Walk the tree collecting candidate files. Synchronous — the CLI
 * runs single-threaded and this keeps the ordering deterministic.
 */
function collectFiles(rootDir, extensions, excludes) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    // Sort for deterministic traversal. Copy first (the audit
    // backend is flow-insensitive and flags in-place .sort on
    // locally-owned arrays, but the cost here is trivial).
    const sortedEntries = entries.slice().sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sortedEntries) {
      if (entry.name.startsWith('.') && entry.name !== '.') {
        // Skip dotfiles/dirs except the root itself — this also
        // catches `.git`, `.next`, `.remembrance`, etc.
        if (excludes.has(entry.name)) continue;
        if (entry.isDirectory()) continue;
      }
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (excludes.has(entry.name)) continue;
        stack.push(p);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.has(ext)) out.push(p);
      }
    }
  }
  return out;
}

/**
 * Compute aggregate statistics + sorted listing from per-file results.
 */
function buildReport(rootDir, results, topN) {
  const sorted = results.slice().sort((a, b) => b.probability - a.probability);
  // SKIPPED covers files where computeBugProbability couldn't score
  // (empty, unparseable, scorer threw). Counted separately so they
  // don't silently inflate LOW.
  const byRisk = { HIGH: 0, MEDIUM: 0, LOW: 0, SKIPPED: 0 };
  for (const r of sorted) {
    byRisk[r.riskLevel] = (byRisk[r.riskLevel] || 0) + 1;
  }

  const n = sorted.length;
  let mean = 0;
  let median = 0;
  if (n > 0) {
    let sum = 0;
    for (const r of sorted) sum += r.probability;
    mean = sum / n;
    const ascending = sorted.map(r => r.probability).sort((a, b) => a - b);
    median = n % 2 === 0
      ? (ascending[n / 2 - 1] + ascending[n / 2]) / 2
      : ascending[Math.floor(n / 2)];
  }

  return {
    root: rootDir,
    scannedAt: new Date().toISOString(),
    files: sorted,
    stats: {
      total: n,
      byRisk,
      meanProbability: round4(mean),
      medianProbability: round4(median),
      top: sorted.slice(0, topN),
    },
  };
}

function emptyReport(rootDir, reason) {
  return {
    root: rootDir,
    scannedAt: new Date().toISOString(),
    files: [],
    stats: {
      total: 0,
      byRisk: { HIGH: 0, MEDIUM: 0, LOW: 0, SKIPPED: 0 },
      meanProbability: 0,
      medianProbability: 0,
      top: [],
    },
    error: reason,
  };
}

function round4(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10000) / 10000;
}

module.exports = {
  scanDirectory,
  DEFAULT_EXTENSIONS,
  DEFAULT_EXCLUDES,
  MAX_BYTES,
};
