'use strict';

const fs = require('fs');
const path = require('path');

const PROPOSAL_FILE = path.join(process.cwd(), '.remembrance', 'lexicon-proposals.json');

function readProposals() {
  if (!fs.existsSync(PROPOSAL_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PROPOSAL_FILE, 'utf-8')); } catch { return []; }
}

function getActiveProposals() { return readProposals().filter(p => p.status === 'active'); }
function getPendingProposals() { return readProposals().filter(p => p.status === 'pending'); }
function getActiveElements() { return getActiveProposals().filter(p => p.kind === 'element'); }
function getPendingElements() { return getPendingProposals().filter(p => p.kind === 'element'); }

function groupByKind(proposals) {
  return {
    functions: proposals.filter(p => p.kind === 'function'),
    elements: proposals.filter(p => p.kind === 'element'),
    terms: proposals.filter(p => p.kind === 'term'),
    architectural: proposals.filter(p => p.kind === 'architectural'),
  };
}

function integrateInto(lexicon) {
  const active = getActiveProposals();
  const grouped = groupByKind(active);
  return {
    ...lexicon,
    INTEGRATED: {
      count: active.length,
      elementCount: grouped.elements.length,
      elements: grouped.elements,
      functions: grouped.functions,
      terms: grouped.terms,
      architectural: grouped.architectural,
      lastRead: new Date().toISOString(),
      source: PROPOSAL_FILE,
    },
  };
}
integrateInto.atomicProperties = {
  charge: 1, valence: 2, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'stable', electronegativity: 0.7, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

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
    elements: all.filter(p => p.kind === 'element').length,
    activeElements: all.filter(p => p.status === 'active' && p.kind === 'element').length,
    byKind: groupByKind(all),
  };
}

module.exports = { readProposals, getActiveProposals, getPendingProposals, getActiveElements, getPendingElements, groupByKind, integrateInto, approve, stats, PROPOSAL_FILE };
