#!/usr/bin/env node
'use strict';

/**
 * @oracle-infrastructure — writes the internal ecosystem capability index;
 * operational tooling, bounded to internal state, not user-input-driven.
 *
 * build-capability-index — index every exported coding function across the
 * ecosystem, so the goggles can surface the ones relevant to whatever you are
 * editing. "Open the goggles, and the ecosystem's callable functions nearest to
 * your work are right there."
 *
 * Scans each repo for explicit export forms (module.exports = { ... },
 * exports.x, export function/const x) and emits records keyed by the SAME
 * ecosystem-prefixed path the goggles print for nearest siblings (oracle/...,
 * void/..., etc.) so the two line up by construction.
 *
 *   node scripts/build-capability-index.js        # writes ecosystem-capabilities.json
 *
 * Output: { generatedAt, repos, totalFunctions, byPath: { "<prefix>/<rel>": [fn, ...] } }
 */

const fs = require('node:fs');
const path = require('node:path');

const ORACLE = path.resolve(__dirname, '..');
const PARENT = path.resolve(ORACLE, '..');

// prefix (as the goggles print it) -> repo dir under the ecosystem parent.
const REPOS = {
  'oracle': 'remembrance-oracle-toolkit',
  'void': 'Void-Data-Compressor',
  'rmb-blockchain': 'REMEMBRANCE-BLOCKCHAIN',
  'rmb-swarm': 'REMEMBRANCE-AGENT-Swarm-',
  'rmb-dialer': 'Remembrance-dialer',
  'rmb-plugger': 'REMEMBRANCE-API-Key-Plugger',
  'moons': 'MOONS-OF-REMEMBRANCE',
  'website': path.join('remembrance-oracle-toolkit', 'digital-cathedral'),
};
const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'target', 'coverage', 'patterns']);
const EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(path.join(dir, e.name), out); }
    else if (e.isFile() && EXT.has(path.extname(e.name)) && !e.name.endsWith('.test.js')) out.push(path.join(dir, e.name));
  }
}

// Pull exported identifiers from explicit export forms.
function exportsOf(src) {
  const names = new Set();
  let m;
  // module.exports = { a, b: x, c }   (take the keys)
  const objExp = src.match(/module\.exports\s*=\s*\{([\s\S]*?)\}/);
  if (objExp) {
    for (const part of objExp[1].split(',')) {
      const k = part.split(':')[0].trim().replace(/^\.\.\./, '');
      if (/^[A-Za-z_$][\w$]*$/.test(k)) names.add(k);
    }
  }
  // exports.foo = ... | module.exports.foo = ...
  const re1 = /(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = re1.exec(src))) names.add(m[1]);
  // export function foo | export async function foo | export const foo = | export class foo
  const re2 = /export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = re2.exec(src))) names.add(m[1]);
  // export { a, b as c }  (take exported local names / aliases' source)
  const re3 = /export\s*\{([^}]*)\}/g;
  while ((m = re3.exec(src))) {
    for (const part of m[1].split(',')) {
      const k = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(k)) names.add(k);
    }
  }
  // keep only function-shaped names (heuristic: appears as `function k`/`const k = (`/`k(` def)
  return [...names].filter((n) => n !== 'default');
}

const byPath = {};
let totalFunctions = 0;
const repoStats = {};

for (const [prefix, rel] of Object.entries(REPOS)) {
  const root = path.join(PARENT, rel);
  if (!fs.existsSync(root)) continue;
  const files = [];
  walk(root, files);
  let n = 0;
  for (const f of files) {
    let src; try { src = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const fns = exportsOf(src);
    if (!fns.length) continue;
    const key = prefix + '/' + path.relative(root, f).split(path.sep).join('/');
    byPath[key] = fns;
    n += fns.length;
  }
  repoStats[prefix] = { files: Object.keys(byPath).filter((k) => k.startsWith(prefix + '/')).length, functions: n };
  totalFunctions += n;
}

const out = {
  generatedAt: new Date().toISOString(),
  repos: repoStats,
  totalFunctions,
  paths: Object.keys(byPath).length,
  byPath,
};
const dest = path.join(ORACLE, 'ecosystem-capabilities.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 0));
console.error(`indexed ${totalFunctions} exported functions across ${Object.keys(byPath).length} modules -> ${dest}`);
for (const [p, s] of Object.entries(repoStats)) console.error(`  ${p.padEnd(14)} ${s.functions} fns in ${s.files} modules`);
