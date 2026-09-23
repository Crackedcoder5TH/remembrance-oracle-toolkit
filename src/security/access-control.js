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
rejectUnauthorized.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "solid", reactivity: "inert", electronegativity: 0, group: 10, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { rejectUnauthorized };
