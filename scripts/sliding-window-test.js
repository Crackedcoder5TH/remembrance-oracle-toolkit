#!/usr/bin/env node
'use strict';

/**
 * Phase 2a — Sliding-window hypothesis test
 *
 * Refined hypothesis: bugs localize to a small region of the file.
 * Whole-file averaging destroys the signal; a sliding window should
 * reveal the bug as a LOCAL coherency minimum.
 *
 * Test method:
 *   1. Take 4 files with known-buggy line numbers (from `audit check`).
 *   2. For each file, slide a window of WINDOW_LINES across the file
 *      with WINDOW_STRIDE overlap.
 *   3. Score each window via Void.
 *   4. Find the window with the lowest coherency.
 *   5. Check if that window's line range contains any known-buggy line.
 *
 * Hits = windows whose min-coherency region overlaps a known bug line.
 * If hits/total > random chance (~window/filesize), hypothesis passes.
 */

const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');

const VOID_KEY = process.env.VOID_API_KEY;
if (!VOID_KEY) { console.error('VOID_API_KEY required'); process.exit(1); }

const WINDOW_LINES = 12;
const WINDOW_STRIDE = 4;
const MIN_BYTES = 64;  // Void needs >=8 bytes, but small windows are noisy

function postJSON(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request({
      host: 'localhost', port: 8080, path, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-API-Key': VOID_KEY,
      },
      timeout: 60000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve({ error: body }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

function auditLines(file) {
  try {
    const out = execFileSync('node', ['src/cli.js', 'audit', 'check', '--file', file, '--json'],
      { encoding: 'utf-8', timeout: 60000, stdio: ['ignore', 'pipe', 'ignore'] });
    const r = JSON.parse(out);
    const f = r.files?.[0];
    if (!f) return [];
    return (f.findings || []).map(x => x.line).sort((a, b) => a - b);
  } catch { return []; }
}

async function scan(file) {
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  const bugLines = auditLines(file);
  const windows = [];

  for (let start = 0; start + WINDOW_LINES <= lines.length; start += WINDOW_STRIDE) {
    const end = Math.min(start + WINDOW_LINES, lines.length);
    const chunk = lines.slice(start, end).join('\n');
    if (chunk.length < MIN_BYTES) continue;
    try {
      const r = await postJSON('/coherence', { text: chunk });
      if (typeof r.coherence !== 'number') continue;
      windows.push({
        start: start + 1,       // 1-indexed to match editor/audit
        end,
        coherence: r.coherence,
        bytes: chunk.length,
        containsBug: bugLines.some(b => b >= start + 1 && b <= end),
      });
    } catch { /* skip */ }
  }

  return { file, bugLines, windows };
}

async function run() {
  const targets = [
    '.remembrance/debug-fixes/debug-fix-negotiation-sort-mutation.js',
    'digital-cathedral/patterns/batch4/sorted-array.js',
    'digital-cathedral/tests/lead-distribution.test.js',
    'dashboard/public/app.js',
  ];

  const results = [];
  let hits = 0, misses = 0;

  for (const file of targets) {
    const r = await scan(file);
    results.push(r);

    if (r.windows.length === 0) {
      console.log(`\n${file}: NO WINDOWS (too small)`);
      continue;
    }

    r.windows.sort((a, b) => a.coherence - b.coherence);
    const min = r.windows[0];
    const max = r.windows[r.windows.length - 1];
    const range = max.coherence - min.coherence;

    // How many of the bottom-3 windows overlap a bug line?
    const bottomN = 3;
    const hitRate = r.windows.slice(0, bottomN).filter(w => w.containsBug).length;
    const bugWindowsTotal = r.windows.filter(w => w.containsBug).length;
    const expectedByChance = (bugWindowsTotal / r.windows.length) * bottomN;

    console.log(`\n=== ${file} ===`);
    console.log(`  bugs at lines: ${r.bugLines.join(', ')}`);
    console.log(`  ${r.windows.length} windows (${WINDOW_LINES} lines, stride ${WINDOW_STRIDE})`);
    console.log(`  coherency range: ${min.coherence.toFixed(4)} .. ${max.coherence.toFixed(4)} (spread ${range.toFixed(4)})`);
    console.log(`  lowest-coherency window: lines ${min.start}-${min.end} (coh ${min.coherence.toFixed(4)})${min.containsBug ? ' ← CONTAINS BUG' : ''}`);
    console.log(`  bottom-${bottomN} windows hit ${hitRate}/${bottomN} bug sites (expected by chance: ${expectedByChance.toFixed(2)})`);

    if (hitRate > expectedByChance) hits++;
    else misses++;
  }

  console.log('\n=== Verdict ===');
  console.log(`files where bottom-3 windows hit bugs better than chance: ${hits}/${hits + misses}`);

  fs.mkdirSync('docs/benchmarks', { recursive: true });
  fs.writeFileSync('docs/benchmarks/sliding-window-test-2026-04-14.json',
    JSON.stringify({ results, hits, misses, ts: new Date().toISOString() }, null, 2));
  console.log('\nRaw data: docs/benchmarks/sliding-window-test-2026-04-14.json');
}

run().catch(e => { console.error(e); process.exit(1); });
