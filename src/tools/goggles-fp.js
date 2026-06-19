#!/usr/bin/env node
'use strict';

/**
 * goggles-fp — tell the goggles a finding was a FALSE POSITIVE.
 *
 * The field records the mistake (in the source histogram + the learning ledger)
 * and never surfaces that finding again. Self-correcting: if the finding ever
 * turns out real and gets fixed, the loop forgets the flag.
 *
 *   goggles-fp --match "<substring>"   flag every learned finding whose
 *                                      fingerprint contains the substring
 *                                      (e.g.  goggles-fp --match "_auditMod")
 *   goggles-fp "<fingerprint>"         flag one exact fingerprint
 *                                      (bugClass/ruleId:signature)
 */

let learning;
try { learning = require('../debug/goggles-learning'); }
catch (e) { console.error('goggles-learning unavailable:', e.message); process.exit(1); }

const argv = process.argv.slice(2);
const arg = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const reason = arg('--reason') || 'cli';

const match = arg('--match');
if (match) {
  const n = learning.flagFalsePositivesMatching(match, { reason });
  console.log(`🥽 remembered ${n} false-positive class(es) matching "${match}" — they will not surface again.`);
  process.exit(0);
}

const fp = argv.find((a) => !a.startsWith('--'));
if (!fp) {
  console.error('usage: goggles-fp --match "<substring>"   |   goggles-fp "<fingerprint>"');
  process.exit(2);
}
const res = learning.flagFalsePositive(fp, { reason });
console.log('🥽 remembered as a false positive — will not surface again:', res.fp);
