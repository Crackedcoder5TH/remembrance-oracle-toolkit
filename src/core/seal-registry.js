'use strict';

/**
 * Seal Registry — canonical enumeration of every covenant seal.
 *
 * Merges:
 *   - 15 founding principles from covenant-principles.js (tier 1)
 *   - Evolved seals promoted by self-improve from covenant-checks.js (tier 2)
 *
 * This is the single source of truth the lexicon imports. Any new seal
 * must land here (via self-improve approve) before it can be claimed
 * as active by downstream services.
 */

const { COVENANT_PRINCIPLES } = require('./covenant-principles');
const { ACTIVE_SEALS } = require('./covenant-checks');

const FOUNDING = COVENANT_PRINCIPLES.map(p => ({
  ...p,
  status: 'founding',
  tier: 1,
  approvedBy: 'genesis',
}));

const EVOLVED = ACTIVE_SEALS.map(s => ({
  ...s,
  tier: 2,
}));

const SEAL_REGISTRY = [...FOUNDING, ...EVOLVED];

function getSeal(id) {
  return SEAL_REGISTRY.find(s => s.id === id) || null;
}

function activeCount() {
  return SEAL_REGISTRY.filter(s => s.status !== 'proposed').length;
}

function byTier(tier) {
  return SEAL_REGISTRY.filter(s => s.tier === tier);
}

function printAll() {
  console.log(`Seal Registry: ${activeCount()} active across ${[...new Set(SEAL_REGISTRY.map(s => s.tier))].length} tiers`);
  for (const seal of SEAL_REGISTRY) {
    const status = seal.status === 'founding' ? '\u25c9' : seal.status === 'active' ? '\u2713' : '?';
    console.log(`  ${status} [${seal.tier}] #${seal.id} ${seal.name}: ${seal.seal}`);
  }
}

module.exports = {
  SEAL_REGISTRY,
  FOUNDING,
  EVOLVED,
  getSeal,
  activeCount,
  byTier,
  printAll,
};
