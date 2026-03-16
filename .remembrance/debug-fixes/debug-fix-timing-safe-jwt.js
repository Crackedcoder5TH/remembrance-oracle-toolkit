/**
 * Meta-Pattern 2 Fix: JWT Signature Timing Attack
 *
 * Bug: JWT signature comparison uses === (string equality), which is
 * vulnerable to timing attacks. Attacker can determine correct signature
 * byte-by-byte by measuring response time differences.
 *
 * Root cause: Forgetting No-Harm — code allows harm through timing
 * side-channel leaking secret information.
 *
 * Fix: Use crypto.timingSafeEqual() for constant-time comparison.
 */

const crypto = require('crypto');

function timingSafeCompare(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = { timingSafeCompare };
