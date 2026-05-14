'use strict';

/**
 * Void-scan — sliding-window coherence diagnostic.
 *
 * Chunks a file into overlapping windows, scores each window via
 * Void's /coherence endpoint, and returns the windows sorted by
 * coherence. The lowest-coherence windows are the candidate bug
 * sites — regions of the file whose byte structure is least like
 * anything in Void's substrate.
 *
 * ─── Important caveat ───────────────────────────────────────────────
 *
 * Phase 1 + Phase 2a of the empirical study (see
 * docs/benchmarks/coherence-vs-findings-2026-04-14.md) found that at
 * the whole-file level Void coherence does NOT correlate with audit
 * finding count (Spearman ρ = +0.14), and at the sliding-window
 * level the lowest-coherence window contains a known bug only ~1/3
 * of the time. This tool is therefore a DIAGNOSTIC, not a reliable
 * bug detector — it surfaces regions that look "unusual" to the
 * substrate, which is useful for human review but not conclusive.
 *
 * A code-native Void substrate (trained on proven patterns from the
 * Oracle library instead of physics/market waveforms) would likely
 * fix this. Until that exists, treat this tool as: "Void finds the
 * three weirdest regions of this file. Might be bugs. Might just be
 * unfamiliar code structure."
 *
 * ───────────────────────────────────────────────────────────────────
 */

const fs = require('fs');
const http = require('http');

const DEFAULT_WINDOW_LINES = 20;
const DEFAULT_STRIDE = 5;
const MIN_WINDOW_BYTES = 64;

function postCoherence(text, options = {}) {
  const apiKey = options.apiKey || process.env.VOID_API_KEY;
  const host = options.host || process.env.VOID_HOST || 'localhost';
  const port = options.port || Number(process.env.VOID_PORT) || 8080;
  const timeoutMs = options.timeoutMs || 60000;

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ text });
    const req = http.request({
      host, port, method: 'POST', path: '/coherence',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-API-Key': apiKey || '',
      },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { resolve({ error: body || `HTTP ${res.statusCode}` }); }
      });
    });
    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}

/**
 * Scan a file with a sliding window and return per-window Void
 * coherence scores, sorted ascending (lowest coherence first).
 *
 * @param {string} filePath - absolute or relative path to file
 * @param {object} options
 *   - windowLines: lines per window (default 20)
 *   - stride:      lines between window starts (default 5)
 *   - topN:        how many lowest-coherence windows to include in
 *                  the `candidates` array (default 5)
 *   - apiKey, host, port, timeoutMs: forwarded to /coherence
 * @returns {Promise<{
 *   file, totalLines, windowsScored, windows, candidates, error
 * }>}
 */
async function voidScanFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { file: filePath, error: 'not found', windows: [], candidates: [] };
  }
  const source = fs.readFileSync(filePath, 'utf-8');
  const lines = source.split('\n');
  const windowLines = options.windowLines || DEFAULT_WINDOW_LINES;
  const stride = options.stride || DEFAULT_STRIDE;
  const topN = options.topN || 5;

  const windows = [];
  for (let start = 0; start + windowLines <= lines.length || (windows.length === 0 && start < lines.length); start += stride) {
    const end = Math.min(start + windowLines, lines.length);
    const chunk = lines.slice(start, end).join('\n');
    if (chunk.length < MIN_WINDOW_BYTES) {
      if (end === lines.length) break;
      continue;
    }
    try {
      const r = await postCoherence(chunk, options);
      if (typeof r.coherence === 'number') {
        windows.push({
          startLine: start + 1,
          endLine: end,
          coherence: r.coherence,
          voidRatio: r.void_ratio,
          bytes: chunk.length,
        });
      }
    } catch (e) {
      return { file: filePath, error: `void unreachable: ${e.message}`, windows: [], candidates: [] };
    }
    if (end === lines.length) break;
  }

  const sorted = windows.slice().sort((a, b) => a.coherence - b.coherence);
  const candidates = sorted.slice(0, topN);

  return {
    file: filePath,
    totalLines: lines.length,
    windowsScored: windows.length,
    windows,
    candidates,
  };
}

module.exports = { voidScanFile, postCoherence };
