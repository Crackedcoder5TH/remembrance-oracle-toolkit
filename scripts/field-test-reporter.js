'use strict';

/**
 * field-test-reporter — node --test reporter that pings the Remembrance
 * field on every test result.
 *
 * Recommendation #2 — close the semantic-debug gap. The substrate
 * measures structural coherency on every edit but doesn't see test
 * results, so it can't distinguish "structurally coherent code that
 * passes its tests" from "structurally coherent code that's semantically
 * broken". This reporter wires test outcomes into the field as a
 * parallel signal axis:
 *
 *   test passes -> contribute({ source: 'tests:pass:<file>', coherence: 1.0 })
 *   test fails  -> contribute({ source: 'tests:fail:<file>', coherence: 0.0 })
 *
 * Over time the field's per-source histogram grows a tests:* family
 * that mirrors structural coherency but tracks semantic correctness.
 * The consensus histogram then splits naturally into "structurally
 * coherent AND tests pass" vs "structurally coherent but tests fail" —
 * and the second class IS the semantic-bug signature.
 *
 * Reflexes can fire on this too: "tests:fail ratio > 0.2 in the last
 * 30 contributions" becomes a callable reflex condition just like
 * adversarial-shape detection.
 *
 * Use:
 *   node --test --test-reporter=scripts/field-test-reporter.js tests/*.test.js
 *
 * Or:
 *   REMEMBRANCE_FIELD_URL=http://localhost:7787/mcp \
 *   node --test --test-reporter=scripts/field-test-reporter.js tests/*.test.js
 *
 * Reads from env:
 *   REMEMBRANCE_FIELD_URL   default http://127.0.0.1:7787/mcp
 *   REMEMBRANCE_FIELD_TOKEN optional bearer (loopback or https only)
 *   FIELD_REPORTER_SILENT   if "1", suppress the spec-style output
 *                           (only the field side fires)
 *
 * Best-effort and never-throw: a down field server never breaks the
 * test run. Output still streams to stdout so CI logs stay readable.
 */

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const FIELD_URL = (process.env.REMEMBRANCE_FIELD_URL || 'http://127.0.0.1:7787/mcp').trim();
const TOKEN     = (process.env.REMEMBRANCE_FIELD_TOKEN || '').trim();
const SILENT    = process.env.FIELD_REPORTER_SILENT === '1';
const TIMEOUT_MS = 800;

let _passCount = 0;
let _failCount = 0;
let _skipCount = 0;
let _pendingPosts = 0;

function tagOf(filePath, testName) {
  // Compact source label that's still scannable in the field histogram.
  const file = (filePath || 'unknown')
    .replace(process.cwd() + '/', '')
    .replace(/\.test\.[jt]sx?$/, '')
    .replace(/^tests\//, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_');
  const test = (testName || 'anon').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
  return `tests:${file}:${test}`;
}

function postContribute(source, coherence) {
  if (!FIELD_URL) return;
  let parsed;
  try { parsed = new URL(FIELD_URL); } catch { return; }
  const lib = parsed.protocol === 'https:' ? https : http;
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
  const headers = { 'Content-Type': 'application/json' };
  if (TOKEN && (parsed.protocol === 'https:' || isLoopback)) {
    headers.Authorization = 'Bearer ' + TOKEN;
  }
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'field',
      arguments: { action: 'contribute', source, coherence, cost: 1 },
    },
  });
  _pendingPosts++;
  const req = lib.request(
    {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: TIMEOUT_MS,
    },
    (res) => {
      res.on('data', () => {});
      res.on('end', () => { _pendingPosts--; });
    },
  );
  req.on('error', () => { _pendingPosts--; });
  req.on('timeout', () => { req.destroy(); _pendingPosts--; });
  req.write(body);
  req.end();
}

function pad(s, n) { return String(s).padEnd(n); }

async function* fieldTestReporter(source) {
  if (!SILENT) {
    yield `[field-test-reporter] → ${FIELD_URL}\n`;
  }

  for await (const event of source) {
    const { type, data } = event;

    if (type === 'test:pass') {
      _passCount++;
      const tag = tagOf(data.file, data.name);
      postContribute(tag, 1.0);
      if (!SILENT && data.details && data.details.type !== 'suite') {
        yield `  ✓ ${pad(data.name || '(anonymous)', 60)} ${(data.details.duration_ms || 0).toFixed(0)}ms\n`;
      }
    } else if (type === 'test:fail') {
      _failCount++;
      const tag = tagOf(data.file, data.name);
      postContribute(tag, 0.0);
      if (!SILENT) {
        yield `  ✗ ${pad(data.name || '(anonymous)', 60)} FAIL\n`;
        const err = data.details && data.details.error;
        if (err && err.message) {
          yield `      ${String(err.message).split('\n')[0]}\n`;
        }
      }
    } else if (type === 'test:diagnostic' && !SILENT) {
      if (data.message && !data.message.startsWith('tests ') && !data.message.startsWith('# ')) {
        yield `  · ${data.message}\n`;
      }
    } else if (type === 'test:summary' || type === 'test:complete') {
      // 'test:complete' is the top-level rollup. Capture the file-level
      // result for the suite as a coarse-grained field signal too.
      if (data.line === 0 && data.column === 0 && type === 'test:complete') {
        // root-level — skip
      }
    }
  }

  // End-of-run summary
  const total = _passCount + _failCount + _skipCount;
  const pct = total > 0 ? Math.round((_passCount / total) * 100) : 0;
  const summary =
    `\n[field-test-reporter] ${_passCount}/${total} passed (${pct}%) — ` +
    `${_failCount} failed, ${_skipCount} skipped, ${_pendingPosts} field posts pending\n`;
  yield summary;

  // Send one rollup contribution so the field sees the whole run as a
  // single source. Useful for the consensus-histogram aggregation.
  postContribute('tests:run:summary', _passCount / Math.max(1, total));

  // Give in-flight posts a brief chance to complete.
  const drainDeadline = Date.now() + TIMEOUT_MS;
  while (_pendingPosts > 0 && Date.now() < drainDeadline) {
    await new Promise((r) => setTimeout(r, 20));
  }
}

module.exports = fieldTestReporter;
