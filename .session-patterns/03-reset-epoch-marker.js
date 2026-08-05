// @oracle-infrastructure — experiment/example/app scaffolding, not substrate periodic-table elements
// Epoch marker pattern: after resetSession(), disk-fallback entries older
// than _resetAt are ignored. Preserves cross-process enforcement (other
// processes never call resetSession) while honoring local reset semantics.
let _resetAt = 0;
function resetSession() { _session = newSession(); _resetAt = Date.now(); }
function wasSearchRecent() {
  for (const s of persistedSessions) {
    const tsMs = new Date(s.lastSearchTimestamp).getTime();
    if (tsMs < _resetAt) continue;
    if (Date.now() - tsMs < threshold) return true;
  }
  return false;
}
