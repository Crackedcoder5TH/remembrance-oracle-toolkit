'use strict';

/**
 * Lexicon Integrator — reads active proposals from .remembrance/lexicon-proposals.json
 * and merges them into the static lexicon at call time. Consumers get a live view
 * without rewriting the lexicon file on every promotion.
 *
 * Proposals are produced by lexicon-watcher when coherency fluctuates and gets
 * auto-promoted once rolling coherency ≥ SYNERGY_COHERENCY (0.85).
 */

const fs = require('fs');
const path = require('path');

const PROPOSAL_FILE = path.join(process.cwd(), '.remembrance', 'lexicon-proposals.json');

function readProposals() {
  if (!fs.existsSync(PROPOSAL_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PROPOSAL_FILE, 'utf-8')); }
  catch { return []; }
}

function getActiveProposals() {
  return readProposals().filter(p => p.status === 'active');
}

function getPendingProposals() {
  return readProposals().filter(p => p.status === 'pending');
}

function groupByKind(proposals) {
  return {
    functions: proposals.filter(p => p.kind === 'function'),
    terms: proposals.filter(p => p.kind === 'term'),
    architectural: proposals.filter(p => p.kind === 'architectural'),
  };
}

/**
 * Merge active proposals into an existing lexicon object. Returns a NEW object
 * so the static lexicon export stays immutable.
 */
function integrateInto(lexicon) {
  const active = getActiveProposals();
  const grouped = groupByKind(active);
  return {
    ...lexicon,
    INTEGRATED: {
      count: active.length,
      functions: grouped.functions,
      terms: grouped.terms,
      architectural: grouped.architectural,
      lastRead: new Date().toISOString(),
      source: PROPOSAL_FILE,
    },
  };
}

function approve(name, kind = 'function') {
  const all = readProposals();
  let changed = 0;
  for (const p of all) {
    if (p.name === name && p.kind === kind && p.status === 'pending') {
      p.status = 'active';
      p.approvedAt = new Date().toISOString();
      p.approvedBy = 'manual';
      changed++;
    }
  }
  if (changed > 0) fs.writeFileSync(PROPOSAL_FILE, JSON.stringify(all, null, 2));
  return { changed };
}

function stats() {
  const all = readProposals();
  return {
    total: all.length,
    active: all.filter(p => p.status === 'active').length,
    pending: all.filter(p => p.status === 'pending').length,
    byKind: groupByKind(all),
  };
}

integrateInto.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

module.exports = {
  readProposals,
  getActiveProposals,
  getPendingProposals,
  groupByKind,
  integrateInto,
  approve,
  stats,
  PROPOSAL_FILE,
};
