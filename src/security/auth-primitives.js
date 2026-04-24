'use strict';

/**
 * Auth primitives — covenant-domain elements. Different group (16 crypto)
 * and varied masses/charges to spread the property space.
 */

const { createHash, createHmac, randomBytes, scryptSync } = require('crypto');

function deriveSessionKey(password, salt, keyLen = 32) {
  if (typeof password !== 'string' || !salt) return null;
  const s = Buffer.isBuffer(salt) ? salt : Buffer.from(String(salt));
  return scryptSync(password, s, keyLen).toString('hex');
}
deriveSessionKey.atomicProperties = {
  charge: 0, valence: 3, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.6, group: 16, period: 4,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function rotateSecret(current, grace = 24 * 3600 * 1000) {
  const next = randomBytes(32).toString('hex');
  const now = Date.now();
  return {
    next,
    nextIssuedAt: now,
    previous: current || null,
    previousValidUntil: current ? now + grace : null,
    fingerprint: createHash('sha256').update(next).digest('hex').slice(0, 12),
  };
}
rotateSecret.atomicProperties = {
  charge: 1, valence: 2, mass: 'light', spin: 'odd', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.7, group: 16, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function parseJwtShape(token) {
  if (typeof token !== 'string') return { valid: false, reason: 'not-string' };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false, reason: 'wrong-segment-count' };
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    return { valid: true, alg: header.alg, typ: header.typ, exp: payload.exp, iss: payload.iss };
  } catch (e) {
    return { valid: false, reason: 'malformed' };
  }
}
parseJwtShape.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.5, group: 16, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = { deriveSessionKey, rotateSecret, parseJwtShape };
