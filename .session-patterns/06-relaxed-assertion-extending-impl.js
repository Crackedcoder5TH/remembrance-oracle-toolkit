// Stale-assertion repair: when impl grows from `'system'` to
// `'system+ecosystem'` (added ecosystem cross-check), update test to
// pattern-match the prefix instead of strict-equaling the old value.
// Captures intent (decided by system, possibly with extra signals)
// without locking the impl into a single string.
assert.match(autoInc[0].decidedBy, /^system/);
