#!/usr/bin/env node
'use strict';

/**
 * run-patterns.js — the harness the pattern tests were written for.
 *
 * Each patterns/**\/<name>.test.js references its subject as a bare global
 * (see the "available via isolated sandbox concatenation" note at the top of
 * every file). The implementation lives in the sibling <name>.js and is
 * exported via module.exports. Running these files through a plain
 * `node --test` walk fails with ReferenceError because the impl is never
 * brought into scope.
 *
 * This runner reproduces the intended isolation: for every *.test.js it spawns
 * a dedicated process, injects the sibling impl's exports as globals, then runs
 * just that test file. One process per test => no cross-pattern global
 * collisions. Exit non-zero if any file fails.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const CONCURRENCY = 8;

function findTests(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTests(full));
    else if (entry.isFile() && entry.name.endsWith('.test.js')) out.push(full);
  }
  return out;
}

function runOne(testFile) {
  return new Promise((resolve) => {
    const impl = testFile.replace(/\.test\.js$/, '.js');
    const rel = path.relative(ROOT, testFile);
    if (!fs.existsSync(impl)) {
      resolve({ rel, ok: false, reason: 'no sibling implementation' });
      return;
    }
    // camelCase fallback name from the filename (is-url -> isUrl), used when a
    // direct function export is anonymous.
    const fallback = path.basename(impl, '.js').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    // Inject the impl's export(s) as globals, then run the single test file.
    // Two export styles exist: `module.exports = { fn }` (named — spread it) and
    // `module.exports = fn` (direct — bind under the function's own name).
    const code =
      `const __m = require(${JSON.stringify(impl)});` +
      `if (typeof __m === 'function') { if (__m.name) globalThis[__m.name] = __m; globalThis[${JSON.stringify(fallback)}] = __m; }` +
      `else if (__m && typeof __m === 'object') { Object.assign(globalThis, __m); }` +
      `require('node:test');` +
      `require(${JSON.stringify(testFile)});`;
    const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (codeOut) => {
      resolve({ rel, ok: codeOut === 0, reason: codeOut === 0 ? '' : (stderr.trim().split('\n').slice(-1)[0] || `exit ${codeOut}`) });
    });
  });
}

async function main() {
  const tests = findTests(ROOT).sort();
  const results = [];
  let i = 0;
  async function worker() {
    while (i < tests.length) {
      const mine = tests[i++];
      results.push(await runOne(mine));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tests.length) }, worker));

  const failed = results.filter((r) => !r.ok);
  for (const f of failed) console.error(`FAIL  ${f.rel}  — ${f.reason}`);
  console.log(`\npatterns: ${results.length - failed.length}/${results.length} files passed`);
  process.exit(failed.length ? 1 : 0);
}

main();
