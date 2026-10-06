/**
 * The one door's reading WITH its provenance (void-service readingOf), against
 * a stand-in service in its own process — the door's curl is synchronous, so a
 * stand-in sharing this process's event loop could never answer. Pins what was
 * measured broken on 2026-10-01:
 *   · /compress_signal carries its blends inside the sealed `shape`, never at
 *     the top level — provenance read only from the top level left every
 *     canonical reading unjudged for self-match;
 *   · a cache hit returns THIS content's provenance, not the last read's;
 *   · the bytes ride as series_b64, and an older service that wants the list
 *     still answers;
 *   · a response with no number is no reading — null, never 0.
 */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const STUB = `
const http = require('http');
const blends = (self) => Array.from({ length: 3 }, (_, i) => self
  ? { name1: 'p' + i, name2: 'p' + i, alpha: 1.0, beta: 0.0 }
  : { name1: 'p' + i, name2: 'q' + i, alpha: 0.4, beta: 0.3 });
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const send = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    if (req.url === '/health') return send({ status: 'ok' });
    const a = JSON.parse(body || '{}');
    const wire = typeof a.series_b64 === 'string' ? 'b64' : Array.isArray(a.series) ? 'list' : 'none';
    const text = wire === 'b64' ? Buffer.from(a.series_b64, 'base64').toString()
      : wire === 'list' ? Buffer.from(a.series).toString() : '';
    if (text.includes('OLD') && wire !== 'list') return send({ error: 'series must be a list of >= 8 numbers' });
    if (text.includes('NONUM')) return send({ method: 'x' });
    if (text.includes('FALLBACK')) {
      const empty = { blends: [] };
      return send({ avg_coherence: 0, strategy: 'void_symbolic', mint: 'mint:fallback',
        shape: empty, commitment: { shape: empty }, basis_id: 'b1', elapsed_s: 0.01, memory: {} });
    }
    const shape = { blends: blends(text.includes('SELF')) };
    send({ avg_coherence: text.length / 1000, mint: 'mint:' + text.slice(0, 8) + ':' + wire,
      shape, commitment: { shape }, basis_id: 'b1', elapsed_s: 0.01, memory: { computed: 2, served: 5 } });
  });
}).listen(0, '127.0.0.1', function () { console.log(this.address().port); });
`;

let child;
let vs;

before(async () => {
  child = spawn(process.execPath, ['-e', STUB], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    child.stdout.once('data', (d) => resolve(String(d).trim()));
    child.once('error', reject);
  });
  process.env.VOID_SVC_PORT = port;
  process.env.VOID_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'void-svc-'));
  delete require.cache[require.resolve('../src/core/void-service')];
  vs = require('../src/core/void-service');
});

after(() => { if (child) child.kill(); });

test('provenance is read from the shape the service sealed', () => {
  const content = 'function alpha() { return 1; } // an artifact read as its own shape';
  const r = vs.readingOf(content);
  assert.strictEqual(r.coherence, content.length / 1000);
  assert.strictEqual(r.measures, 'artifact-shape');
  assert.strictEqual(r.selfMatched, false);
  assert.strictEqual(r.basisId, 'b1');
  assert.strictEqual(r.memory.computed, 2);
});

test('the bytes ride as series_b64', () => {
  const r = vs.readingOf('const wire = "base64"; // the canonical wire, as read-signal sends it');
  assert.ok(r.mint.endsWith(':b64'), r.mint);
});

test('every chunk reconstructed by one pattern alone reads as library-membership', () => {
  const r = vs.readingOf('SELF — a file the library already holds verbatim');
  assert.strictEqual(r.measures, 'library-membership');
  assert.strictEqual(r.selfMatched, true);
});

test('a cache hit returns this content\'s provenance, not the previous read\'s', () => {
  const A = 'SELF copy A — read first, then again after another file';
  const B = 'artifact B — an ordinary file read in between';
  const first = vs.readingOf(A);
  vs.readingOf(B);
  const again = vs.readingOf(A);
  assert.strictEqual(again.mint, first.mint);
  assert.strictEqual(again.measures, 'library-membership');
  assert.strictEqual(vs.lastReading().mint, first.mint);
  assert.strictEqual(vs.coherencyOf(A), first.coherence);
});

test('an older service that wants the list still answers', () => {
  const r = vs.readingOf('OLD generation service, no series_b64 field');
  assert.ok(r && r.mint.endsWith(':list'), r && r.mint);
});

// Measured 2026-10-01: seeds/code/async-mutex.testcode.js read 0.0000 via
// void_symbolic with 0 blends, and was ranked "weakest structure".
test('a reading with no blend is named the fallback it is', () => {
  const r = vs.readingOf('FALLBACK — the fractal path reconstructed nothing');
  assert.strictEqual(r.coherence, 0);
  assert.strictEqual(r.strategy, 'void_symbolic');
  assert.ok(r.measures.startsWith('fallback (void_symbolic'), r.measures);
});

test('a response with no number is no reading — null, never 0', () => {
  assert.strictEqual(vs.readingOf('NONUM — the service answered without avg_coherence'), null);
  assert.strictEqual(vs.coherencyOf('NONUM — a second content, still no number'), null);
});
