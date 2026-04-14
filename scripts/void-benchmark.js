#!/usr/bin/env node
'use strict';

/**
 * Void coherence benchmark for the fix-spree commit.
 *
 * Feeds the post-fix content of every meaningfully-changed src file to
 * Void's /coherence endpoint and captures the Void coherency score,
 * compression ratio, and cascade matches. Also scores the same file's
 * pre-fix content from HEAD~1 so we can measure the delta.
 *
 * Usage: VOID_API_KEY=<key> node scripts/void-benchmark.js
 */

const { execFileSync } = require('child_process');
const http = require('http');

const VOID_HOST = 'localhost';
const VOID_PORT = 8080;
const VOID_KEY = process.env.VOID_API_KEY;
if (!VOID_KEY) {
  console.error('VOID_API_KEY not set');
  process.exit(1);
}

// The files with meaningful logic changes (not pure renames).
// Ordered small → large so the bigger (slower) files come last.
const FILES = [
  'src/core/events.js',
  'src/audit/prior-promoter.js',
  'src/cli.js',
  'src/audit/bayesian-prior.js',
  'src/core/preflight.js',
  'src/core/reactions.js',
  'tests/audit-storage-tiers.test.js',
  'tests/core-ecosystem.test.js',
  'src/core/storage.js',
  'src/core/covenant.js',
  'src/core/ecosystem.js',
  'src/core/compliance.js',
  'src/patterns/library.js',
  'src/cli/commands/admin.js',
  'src/cli/commands/library.js',
  'src/store/sqlite.js',
];

function postJSON(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: VOID_HOST, port: VOID_PORT, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-API-Key': VOID_KEY,
      },
      timeout: 180000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

async function voidCoherence(text) {
  const r = await postJSON('/coherence', { text });
  return r.body;
}

function gitShow(ref, file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf-8' });
  } catch { return null; }
}

function fileRead(file) {
  const fs = require('fs');
  try { return fs.readFileSync(file, 'utf-8'); } catch { return null; }
}

async function benchmark() {
  const results = [];
  for (const file of FILES) {
    const after = fileRead(file);
    const before = gitShow('0631ef7^', file);

    let voidAfter = null, voidBefore = null;
    try { voidAfter = after ? await voidCoherence(after) : null; }
    catch (e) { voidAfter = { error: e.message }; }
    try { voidBefore = before ? await voidCoherence(before) : null; }
    catch (e) { voidBefore = { error: e.message }; }

    results.push({ file, before: voidBefore, after: voidAfter });
    const bh = voidBefore?.coherence ?? 'n/a';
    const ah = voidAfter?.coherence ?? 'n/a';
    const bytes = voidAfter?.raw_size ?? 0;
    const voidRatio = voidAfter?.void_ratio ?? 0;
    const delta = (typeof bh === 'number' && typeof ah === 'number')
      ? (ah - bh).toFixed(4)
      : 'n/a';
    console.log(
      `${file.padEnd(42)}  ` +
      `coh: ${String(bh).padStart(6)} → ${String(ah).padStart(6)}  ` +
      `Δ: ${String(delta).padStart(8)}  ` +
      `ratio: ${voidRatio}x  ` +
      `${bytes}B`
    );
  }

  // Aggregate
  const pre = results.map(r => r.before?.coherence).filter(v => typeof v === 'number');
  const post = results.map(r => r.after?.coherence).filter(v => typeof v === 'number');
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const postAvg = post.length ? avg(post).toFixed(4) : 'n/a';
  const preAvg = pre.length ? avg(pre).toFixed(4) : 'n/a';

  console.log('\n=== Aggregate ===');
  console.log(`pre-fix  Void coherency (avg): ${preAvg}`);
  console.log(`post-fix Void coherency (avg): ${postAvg}`);
  if (post.length === pre.length) {
    console.log(`delta                       : ${(Number(postAvg) - Number(preAvg)).toFixed(4)}`);
  }
  console.log(`files scored                 : ${post.length}/${FILES.length}`);

  const fs = require('fs');
  fs.writeFileSync('.remembrance/void-benchmark.json', JSON.stringify(results, null, 2));
  console.log('\nFull report saved to .remembrance/void-benchmark.json');
}

benchmark().catch((e) => { console.error(e); process.exit(1); });
