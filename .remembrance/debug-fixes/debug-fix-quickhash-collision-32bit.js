/**
 * Meta-Pattern 14 Fix: 32-bit Integer Overflow in _quickHash
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "The DJB2 hash function produces well-distributed values"
 * Reality:    "JavaScript's bitwise OR (| 0) truncates to 32-bit signed int,
 *              giving only ~4 billion possible hashes. With 477 patterns and
 *              base-36 encoding, the output space is further reduced. Collision
 *              probability follows the birthday paradox: ~50% at ~65k entries"
 *
 * Bug class: Performance/Logic — hash collisions in manifest comparison
 *            cause patterns to be falsely considered "same" and skipped
 * Location:  src/cloud/negotiation.js:_quickHash() lines 337-343
 * Severity:  LOW-MEDIUM — affects negotiation correctness at scale;
 *            two different code strings may produce the same codeHash,
 *            causing compareManifests() to skip a legitimate upgrade
 *
 * Additionally, the bitwise OR `| 0` can produce negative numbers,
 * and `.toString(36)` on a negative number produces "-hash", which
 * looks like a different format than expected.
 *
 * Fix: Use crypto hash for manifests (stable, collision-resistant).
 */

const crypto = require('crypto');

// Before (broken):
// function _quickHash(str) {
//   let h = 0;
//   for (let i = 0; i < str.length; i++) {
//     h = ((h << 5) - h + str.charCodeAt(i)) | 0;  // 32-bit truncation
//   }
//   return h.toString(36);  // can be negative: "-1a2b3c"
// }

// After (fixed):
function stableCodeHash(str) {
  if (!str) return '0';
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 12);
}

module.exports = { stableCodeHash };
