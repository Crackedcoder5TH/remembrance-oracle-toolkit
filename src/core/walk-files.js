'use strict';

/**
 * walk-files.js — ONE directory walker for the whole substrate.
 *
 * The goggles measured `function walk()` / `_walk()` hand-rolled in 17
 * separate files (map: reimplementation debt, ≥0.95 resonance). Each was
 * retyped because finding the existing one cost more than writing it — the
 * exact "chose the easiest path" the operator asked to hunt down. Same
 * resolution as the flowCosines consolidation (ECOSYSTEM §7: one
 * implementation, everyone routes to it).
 *
 * The canonical form was `coherency-mapper._walk`, generalized here with
 * the options the various copies each needed:
 *
 *   skipDirs    Set of directory NAMES to prune (default DEFAULT_SKIP_DIRS)
 *   extensions  array of lower-case extensions to keep, e.g. ['.js']
 *               (default null = every file)
 *   skipHidden  prune dotfile/dotdir names (default true — most callers did)
 *   maxFiles    stop once this many files are collected (default Infinity)
 *   onFile      called with each kept absolute path; return false to stop
 *
 * Iterative (an explicit stack), so it does not blow the call stack on deep
 * trees and can honour maxFiles mid-walk the way the harvest/multi-engine
 * copies did with their recursion caps.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'target', 'dist', 'build',
  'vendor', '__pycache__', '.venv', 'venv', '.pytest_cache',
  'coverage', '.nyc_output', '.remembrance', '.cache',
]);

/**
 * Collect files under `dir`. Returns an array of absolute paths (also
 * streamed to `onFile` if provided).
 * @param {string} dir
 * @param {object} [opts]
 * @returns {string[]}
 */
function walkFiles(dir, opts = {}) {
  const skip = opts.skipDirs || DEFAULT_SKIP_DIRS;
  const exts = opts.extensions || null;
  const skipHidden = opts.skipHidden !== false;
  const maxFiles = Number.isFinite(opts.maxFiles) ? opts.maxFiles : Infinity;
  const onFile = typeof opts.onFile === 'function' ? opts.onFile : null;

  const out = [];
  const stack = [dir];
  while (stack.length) {
    if (out.length >= maxFiles) break;
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (skipHidden && e.name.startsWith('.')) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) {
        if (!skip.has(e.name)) stack.push(full);
      } else if (e.isFile()) {
        if (exts && !exts.includes(path.extname(e.name).toLowerCase())) continue;
        out.push(full);
        if (onFile && onFile(full) === false) return out;
        if (out.length >= maxFiles) break;
      }
    }
  }
  return out;
}
walkFiles.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.3, group: 12, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
};

module.exports = { walkFiles, DEFAULT_SKIP_DIRS };
