'use strict';
// Controlled diagnosis of the self-read coherence drop (0.512 -> 0.444).
// Isolated field per trial (ENTROPY_PATH fixture), replaying the exact
// five contributions under varied order/cost, testing each hypothesis.
const fs = require('fs');
const path = require('path');
const os = require('os');

function isolatedEngine(preState) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lre-diag-'));
  const p = path.join(dir, 'entropy.json');
  fs.writeFileSync(p, JSON.stringify(preState));
  // Fresh module instance per trial: clear the require cache so getEngine()
  // rebuilds against the new ENTROPY_PATH.
  const modPath = '/home/user/remembrance-oracle-toolkit/src/core/living-remembrance.js';
  delete require.cache[require.resolve(modPath)];
  process.env.ENTROPY_PATH = p;
  const { LivingRemembranceEngine } = require(modPath);
  return new LivingRemembranceEngine({ persistPath: p });
}

// The pre-run field snapshot (from the recorded run).
const PRE = {
  coherence: 0.5119374999999999,
  coherenceIntegral: 188.1016598119384,
  globalEntropy: 0.2790519156471712,
  cascadeFactor: 1.1607714265175464,
  updateCount: 20393,
  timestamp: Date.now() - 60000,
  sources: {},
};

// The five readings exactly as the self-read contributed them
// (0.5 + alignment, clamped): now, then, diary, contributors, cognition.
const READINGS = [
  { id: 'field:now',      v: 1.0   },
  { id: 'field:then',     v: 1.0   },
  { id: 'field:diary',    v: 0.931 },
  { id: 'field:contrib',  v: 1.0   },
  { id: 'cognition',      v: 0.429 },
];

function run(label, seq, cost) {
  const eng = isolatedEngine({ ...PRE, timestamp: Date.now() - 60000 });
  for (const r of seq) eng.contribute({ cost, coherence: r.v, source: 'diag' });
  const c = eng.getState().coherence;
  console.log(`  ${label.padEnd(46)} final coherence ${c.toFixed(4)}`);
  return c;
}

console.log('\n  DIAGNOSIS — replaying the self-read against isolated fields');
console.log('  pre-state coherence: 0.5119\n');

console.log('  H-order (recency dominance):');
run('original order (cognition LAST)', READINGS, 0.5);
run('reversed order (cognition FIRST)', [...READINGS].reverse(), 0.5);

console.log('\n  H-single (does the last voice alone reproduce it?):');
run('ONLY the cognition reading', [READINGS[4]], 0.5);
run('ONLY the field:now reading', [READINGS[0]], 0.5);

console.log('\n  H-cost (does cost touch coherence at all?):');
run('original order, cost 0.1', READINGS, 0.1);
run('original order, cost 2.0', READINGS, 2.0);

console.log('\n  H-decay (long idle gap before contributing):');
const engIdle = isolatedEngine({ ...PRE, timestamp: Date.now() - 1000 * 60 * 60 * 24 * 20 });
for (const r of READINGS) engIdle.contribute({ cost: 0.5, coherence: r.v, source: 'diag' });
console.log(`  ${'20-day idle gap, original order'.padEnd(46)} final coherence ${engIdle.getState().coherence.toFixed(4)}`);

console.log('\n  analytic prediction for last-voice 0.429: 0.4445');
