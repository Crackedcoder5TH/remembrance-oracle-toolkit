'use strict';

/**
 * Tests for the sliding-window Void-scan diagnostic.
 *
 * These tests use a local HTTP stub instead of a real Void server so
 * they run without external dependencies. The stub returns a fixed
 * mapping of line-range-sum → coherence score so we can verify the
 * sliding window, the min-coherence sort, and the error path.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const { voidScanFile } = require('../src/audit/void-scan');

// Deterministic stub server: returns coherence based on whether the
// window's text contains the substring "BUG" (lower) or "CLEAN"
// (higher). Good enough to verify the ranking logic.
let server;
let port;

before(() => new Promise((resolve) => {
  server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/coherence') {
      res.writeHead(404); res.end(); return;
    }
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      const { text } = JSON.parse(body);
      let coherence = 0.5;
      if (text.includes('BUG')) coherence = 0.2;
      else if (text.includes('CLEAN')) coherence = 0.8;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        coherence, void_ratio: 3.0, raw_size: text.length,
      }));
    });
  });
  server.listen(0, () => { port = server.address().port; resolve(); });
}));

after(() => new Promise((resolve) => {
  if (server) server.close(resolve); else resolve();
}));

function makeFile(name, content) {
  const p = path.join(os.tmpdir(), `void-scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`);
  fs.writeFileSync(p, content);
  return p;
}

describe('void-scan: sliding-window diagnostic', () => {
  it('returns error when file does not exist', async () => {
    const r = await voidScanFile('/nonexistent-void-scan-path.js', {
      apiKey: 'x', host: 'localhost', port,
    });
    assert.equal(r.error, 'not found');
  });

  it('scores each window and returns them sorted ascending', async () => {
    // 30 lines: 10 CLEAN at top, 10 BUG in middle, 10 CLEAN at bottom.
    const lines = [
      ...Array.from({ length: 10 }, (_, i) => `// CLEAN line ${i}`),
      ...Array.from({ length: 10 }, (_, i) => `// BUG line ${i}`),
      ...Array.from({ length: 10 }, (_, i) => `// CLEAN line ${i + 10}`),
    ];
    const file = makeFile('sandwich.js', lines.join('\n'));
    try {
      const r = await voidScanFile(file, {
        windowLines: 10, stride: 5, topN: 3,
        apiKey: 'x', host: 'localhost', port,
      });
      assert.equal(r.totalLines, 30);
      assert.ok(r.windowsScored >= 3, `expected >=3 windows, got ${r.windowsScored}`);

      // The candidates are the lowest-coherence windows. They must
      // be sorted ascending by coherence.
      for (let i = 1; i < r.candidates.length; i++) {
        assert.ok(r.candidates[i - 1].coherence <= r.candidates[i].coherence,
          'candidates must be sorted ascending');
      }

      // The first candidate (lowest coherence) should overlap the
      // BUG region (lines 11-20 in 1-indexed).
      const first = r.candidates[0];
      assert.ok(first.coherence <= 0.3, `bug window coh should be low, got ${first.coherence}`);
      const overlapsBug = first.endLine >= 11 && first.startLine <= 20;
      assert.ok(overlapsBug, `lowest-coh window (${first.startLine}-${first.endLine}) must overlap BUG region`);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('returns error object when Void is unreachable', async () => {
    const file = makeFile('unreachable.js', 'const x = 1;\n'.repeat(30));
    try {
      const r = await voidScanFile(file, {
        apiKey: 'x', host: 'localhost', port: 1, timeoutMs: 500,
      });
      assert.ok(r.error);
      assert.match(r.error, /void unreachable/);
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('skips windows below MIN_WINDOW_BYTES', async () => {
    // 5 one-char lines — total ~10 bytes, below 64-byte min
    const file = makeFile('tiny.js', 'a\nb\nc\nd\ne\n');
    try {
      const r = await voidScanFile(file, {
        windowLines: 20, stride: 5,
        apiKey: 'x', host: 'localhost', port,
      });
      assert.equal(r.windowsScored, 0);
      assert.deepEqual(r.candidates, []);
    } finally {
      fs.unlinkSync(file);
    }
  });
});
