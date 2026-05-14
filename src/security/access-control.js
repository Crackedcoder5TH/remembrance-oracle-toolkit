'use strict';

/**
 * Access control — covenant-domain elements. Group 2 comparison + group 9
 * error. Pure transforms (charge 0).
 */

function requireRole(principal, requiredRole) {
  if (!principal || typeof principal !== 'object') return { allowed: false, reason: 'no-principal' };
  const roles = principal.roles || [];
  if (!Array.isArray(roles)) return { allowed: false, reason: 'roles-not-array' };
  if (!roles.includes(requiredRole)) return { allowed: false, reason: 'role-not-held', required: requiredRole };
  return { allowed: true, principal: principal.id || null, role: requiredRole };
}
requireRole.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.4, group: 2, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

function scopedAccess(principal, resource, scopeRequired) {
  if (!principal || !resource) return { allowed: false, reason: 'missing' };
  const scopes = principal.scopes || [];
  if (!scopes.includes(scopeRequired)) return { allowed: false, reason: 'scope-missing', required: scopeRequired };
  if (resource.owner && resource.owner !== principal.id && !scopes.includes('admin')) {
    return { allowed: false, reason: 'not-owner' };
  }
  return { allowed: true, scope: scopeRequired, resource: resource.id };
}
scopedAccess.atomicProperties = {
  charge: 0, valence: 3, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.5, group: 2, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

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

module.exports = { requireRole, scopedAccess, rejectUnauthorized };
