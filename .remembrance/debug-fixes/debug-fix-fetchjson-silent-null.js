/**
 * Meta-Pattern 12 Fix: Silent Null on Network Error in _fetchJson
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "Callers always check for null returns from _fetchJson"
 * Reality:    "_fetchJson resolves null on any error (timeout, DNS failure,
 *              parse error), and some callers access .patterns or .manifest
 *              on the result without null checks, causing TypeError"
 *
 * Bug class: Integration — error swallowed at boundary, crashes downstream
 * Location:  src/cloud/negotiation.js:_fetchJson() lines 346-376
 *            Callers: negotiate() line 171 does `offered.patterns` after _fetchJson
 *            which could be null
 * Severity:  MEDIUM — any network hiccup during negotiation triggers
 *            "TypeError: Cannot read properties of null (reading 'patterns')"
 *
 * The current code also swallows HTTP error status codes (4xx, 5xx) —
 * it parses the error body as JSON and returns it as if successful.
 *
 * Fix: Return a typed result object that distinguishes success from failure,
 *      or at minimum guard all callers. The simplest fix: add null coalescing.
 */

// Before (broken):
// const offered = await _fetchJson(url, opts);
// if (offered && Array.isArray(offered.patterns)) { ... }
// ↑ This is fine, but other callers skip the check:
// const remoteManifest = await _fetchJson(url, opts);
// remoteManifest.manifest.length  ← crashes if null

// After (fixed):
function safeFetchResult(raw, expectedKey) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, data: null, error: 'null_or_invalid_response' };
  }
  if (expectedKey && !Array.isArray(raw[expectedKey])) {
    return { ok: false, data: raw, error: `missing_or_invalid_key:${expectedKey}` };
  }
  return { ok: true, data: raw, error: null };
}

module.exports = { safeFetchResult };
