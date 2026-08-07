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

// the label-blind encoder — gives each function its OWN structural signature so the
// goggles can resonate what you're looking at directly against functions (not just files).
let composedAtDepth = null;
try { composedAtDepth = require('../src/core/decoder-stack').composedAtDepth; } catch (_) { /* engine-only */ }
const SIG_DEPTH = 4; // composed_v1 (116-D) — matches the depth the goggles query at

// extract a function's definition snippet from source for encoding its shape
function bodyOf(src, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pats = [
    new RegExp('(?:async\\s+)?function\\s+' + esc + '\\b'),
    new RegExp('(?:const|let|var)\\s+' + esc + '\\s*=\\s*(?:async\\s*)?(?:function|\\()'),
    new RegExp('class\\s+' + esc + '\\b'),
    new RegExp('\\b' + esc + '\\s*[:=]\\s*(?:async\\s*)?(?:function|\\()'),
  ];
  let at = -1;
  for (const p of pats) { const m = p.exec(src); if (m && (at < 0 || m.index < at)) at = m.index; }
  if (at < 0) return null;
  return src.slice(at, at + 1600); // ~structural window; enough for the encoder to read shape
}
// HOW DO YOU CALL IT? The index held name + path + fractal signature, so the
// goggles could say a function EXISTS and where it lives, but not how to
// invoke it. That gap costs real time: `orchestrate diagnose` was called three
// different wrong ways in one session before someone read the arg parsing.
// A name locates a function; the parameter list is what makes it callable.
//
// Deliberately cheap and textual — the parameter list as written, plus the
// first line of any JSDoc directly above. No AST, no type inference: enough to
// call the thing correctly, which is the whole job.
function callSigOf(src, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pats = [
    new RegExp('(?:async\\s+)?function\\s+' + esc + '\\s*\\(([^)]*)\\)'),
    new RegExp('(?:const|let|var)\\s+' + esc + '\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>'),
    new RegExp('(?:const|let|var)\\s+' + esc + '\\s*=\\s*(?:async\\s+)?function\\s*\\*?\\s*\\(([^)]*)\\)'),
    new RegExp('\\b' + esc + '\\s*[:=]\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>'),
    new RegExp('\\b' + esc + '\\s*\\(([^)]*)\\)\\s*\\{'),          // method shorthand
  ];
  let best = null, at = Infinity;
  for (const p of pats) {
    const m = p.exec(src);
    if (m && m.index < at) { at = m.index; best = m; }
  }
  if (!best) return null;

  // Collapse whitespace; destructured params keep their shape.
  const params = best[1].replace(/\s+/g, ' ').trim();

  // First sentence of the JSDoc block immediately above the definition.
  //
  // Anchored to the LAST `/**` in the window, deliberately. A plain
  // `/\/\*\*([\s\S]*?)\*\/\s*$/` is not anchored at its start, so when the
  // 900-char window contained an earlier function's doc block the match ran
  // from THAT block through to the final `*/` and the "first line" came from
  // the wrong function — computeCoherencyScore was labelled "Score fractal
  // alignment (0-1)", which is scoreFractalAlignment's doc. A signature that
  // describes a different function is worse than no description at all.
  let doc = null;
  const before = src.slice(Math.max(0, at - 900), at);
  const open = before.lastIndexOf('/**');
  if (open >= 0) {
    const block = before.slice(open);
    const close = block.indexOf('*/');
    // Only whitespace may sit between the block and the definition, otherwise
    // the comment belongs to something else.
    if (close > 0 && block.slice(close + 2).trim() === '') {
      const first = block.slice(3, close)
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, '').trim())
        .filter((l) => l && !l.startsWith('@'))[0];
      if (first) doc = first.slice(0, 120);
    }
  }
  return { params, doc };
}

function sigOf(snippet) {
  if (!composedAtDepth || !snippet) return null;
  try { return Array.from(composedAtDepth(snippet, SIG_DEPTH)).map((x) => Math.round(x * 1e4) / 1e4); }
  catch (_) { return null; }
}

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

// Canonical walker (ECOSYSTEM §7); hidden dirs were only pruned via SKIP, so
// skipHidden stays off, and the .test.js exclusion is applied on the result.
const { walkFiles } = require('../src/core/walk-files');
function walk(dir, out) {
  for (const p of walkFiles(dir, { skipDirs: SKIP, extensions: [...EXT], skipHidden: false })) {
    if (!p.endsWith('.test.js')) out.push(p);
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
const functions = [];   // [{ n: name, p: path, s: signature }] — per-function structural signatures
const callSigs = {};    // path -> { fnName: { params, doc } } — HOW TO CALL each one
let withSig = 0;
let totalFunctions = 0, signed = 0;
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
    for (const name of fns) {
      const s = sigOf(bodyOf(src, name));
      const call = callSigOf(src, name);
      if (call) {
        callSigs[key] = callSigs[key] || {};
        callSigs[key][name] = call;
        withSig++;
      }
      if (s) { functions.push({ n: name, p: key, s }); signed++; }
    }
  }
  repoStats[prefix] = { files: Object.keys(byPath).filter((k) => k.startsWith(prefix + '/')).length, functions: n };
  totalFunctions += n;
}

const out = {
  generatedAt: new Date().toISOString(),
  repos: repoStats,
  totalFunctions,
  signedFunctions: signed,
  callableFunctions: withSig,
  callSigs,
  sigDepth: SIG_DEPTH,
  paths: Object.keys(byPath).length,
  byPath,
  functions,   // per-function signatures for direct FUNCTION RESONANCE in the goggles
};
const dest = path.join(ORACLE, 'ecosystem-capabilities.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 0));
console.error(`indexed ${totalFunctions} exported functions (${signed} with signatures, depth ${SIG_DEPTH}) across ${Object.keys(byPath).length} modules -> ${dest}`);
for (const [p, s] of Object.entries(repoStats)) console.error(`  ${p.padEnd(14)} ${s.functions} fns in ${s.files} modules`);
