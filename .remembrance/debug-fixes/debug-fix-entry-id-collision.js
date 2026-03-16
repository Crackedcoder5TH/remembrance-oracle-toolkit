/**
 * Meta-Pattern 10 Fix: Hash Collision in Entry ID Generation
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "Hash(code + timestamp) always produces a unique ID"
 * Reality:    "Two entries submitted in the same millisecond with the same code
 *              produce identical IDs, causing INSERT to silently overwrite or
 *              violate the PRIMARY KEY constraint"
 *
 * Bug class: Logic — ID collision causes data loss or crashes
 * Location:  src/store/sqlite.js:addEntry() line 583
 *            _hash(entry.code + Date.now().toString())
 *            Also: _insertPattern() line 744 uses _hash(pattern.code + pattern.name + Date.now())
 * Severity:  MEDIUM — batch operations and fast loops can trigger this;
 *            auto-register processes many patterns in rapid succession
 *
 * Date.now() has millisecond precision. In a tight loop, multiple calls
 * within the same millisecond produce the same timestamp string.
 * Combined with identical code, the hash collides.
 *
 * Fix: Add a random nonce to the hash input to guarantee uniqueness.
 */

const crypto = require('crypto');

// Before (broken):
// _hash(entry.code + Date.now().toString())
// Same code + same ms = same hash = collision

// After (fixed):
function uniqueHash(input) {
  const nonce = crypto.randomBytes(8).toString('hex');
  return crypto.createHash('sha256')
    .update(input + Date.now().toString() + nonce)
    .digest('hex')
    .slice(0, 16);
}

module.exports = { uniqueHash };
