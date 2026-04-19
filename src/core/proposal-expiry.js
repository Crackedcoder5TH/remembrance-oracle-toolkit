'use strict';

/**
 * Proposal Expiry — trims the lexicon-proposals.json queue.
 *
 * Pending proposals older than 7 days get marked 'expired' (not deleted, so
 * the trail stays auditable). Expired proposals 30+ days old get dropped.
 * Active proposals are never touched.
 *
 * Without this, the queue grows forever and coherency-aware auto-approval
 * slows down the more history piles up.
 */

const fs = require('fs');
const path = require('path');

const PROPOSAL_FILE = path.join(process.cwd(), '.remembrance', 'lexicon-proposals.json');
const EXPIRE_AFTER_DAYS = 7;
const DROP_EXPIRED_AFTER_DAYS = 30;

function ageDays(iso) {
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function runExpiry() {
  if (!fs.existsSync(PROPOSAL_FILE)) return { changed: false, reason: 'no proposal file' };
  const all = JSON.parse(fs.readFileSync(PROPOSAL_FILE, 'utf-8'));
  let expired = 0, dropped = 0;
  const kept = [];
  for (const p of all) {
    const age = ageDays(p.proposedAt);
    if (p.status === 'pending' && age > EXPIRE_AFTER_DAYS) {
      p.status = 'expired';
      p.expiredAt = new Date().toISOString();
      expired++;
      kept.push(p);
      continue;
    }
    if (p.status === 'expired' && ageDays(p.expiredAt || p.proposedAt) > DROP_EXPIRED_AFTER_DAYS) {
      dropped++;
      continue;
    }
    kept.push(p);
  }
  if (expired === 0 && dropped === 0) return { changed: false, totalRemaining: kept.length };
  fs.writeFileSync(PROPOSAL_FILE, JSON.stringify(kept, null, 2));
  return { changed: true, expired, dropped, totalRemaining: kept.length };
}
runExpiry.atomicProperties = {
  charge: -1, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 12, period: 4,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'covenant',
};

if (require.main === module) {
  const r = runExpiry();
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}

module.exports = { runExpiry, EXPIRE_AFTER_DAYS, DROP_EXPIRED_AFTER_DAYS };
