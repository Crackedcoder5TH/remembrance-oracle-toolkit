/**
 * Meta-Pattern 9 Fix: Unprotected JSON.parse in Audit Log Reader
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "The detail column always contains valid JSON"
 * Reality:    "Corrupted database rows, manual edits, or encoding errors
 *              can produce malformed JSON, crashing the entire audit log read"
 *
 * Bug class: Data — one bad row crashes the entire query
 * Location:  src/store/sqlite.js:getAuditLog() line 577
 *            JSON.parse(r.detail || '{}') — no try/catch
 * Severity:  MEDIUM — audit log is read during maintenance, debugging, and
 *            dashboard display; crash propagates up
 *
 * Also affected: _rowToEntry() and _rowToPattern() parse coherency_json
 *   without protection — but those use _safeJSON() which handles it.
 *   The audit log is the gap.
 *
 * Fix: Use the same _safeJSON pattern already used elsewhere in the class.
 */

// Before (broken):
// getAuditLog() {
//   return rows.map(r => ({
//     ...
//     detail: JSON.parse(r.detail || '{}'),  // THROWS on malformed JSON
//   }));
// }

// After (fixed):
function safeParseAuditDetail(detailStr) {
  if (!detailStr) return {};
  try {
    return JSON.parse(detailStr);
  } catch {
    return { _parseError: true, raw: String(detailStr).slice(0, 200) };
  }
}

module.exports = { safeParseAuditDetail };
