'use strict';

/**
 * Access control — covenant-domain elements. Group 2 comparison + group 9
 * error. Pure transforms (charge 0).
 */



function rejectUnauthorized(reason, headers = {}) {
  return {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
    body: JSON.stringify({ error: 'unauthorized', reason: String(reason || 'access denied') }),
  };
}
rejectUnauthorized.atomicProperties = {
  charge: -1, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 9, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = { rejectUnauthorized };
