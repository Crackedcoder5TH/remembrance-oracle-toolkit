'use strict';

/**
 * Live Lexicon — static lexicon + integrated active proposals.
 *
 * Always returns a fresh view. The static lexicon remains immutable; this module
 * merges pending→active promotions from lexicon-watcher on every call.
 *
 * Use this when you need the CURRENT state of the lexicon (CI checks, dashboard,
 * interactive tools). Use the plain lexicon module when you need the immutable
 * baseline (tests, schema validation).
 */

const lexicon = require('./remembrance-lexicon');
const { integrateInto, stats } = require('./lexicon-integrator');

function getLiveLexicon() {
  return integrateInto(lexicon);
}

function getLiveSnapshot() {
  const live = getLiveLexicon();
  return {
    sealCount: lexicon.sealCount(),
    componentCount: Object.keys(lexicon.COMPONENTS).length,
    processCount: Object.keys(lexicon.PROCESSES).length,
    emergentEffectCount: Object.keys(lexicon.EMERGENT_EFFECTS).length,
    thresholdCount: Object.keys(lexicon.THRESHOLDS).length,
    integrated: stats(),
    takenAt: new Date().toISOString(),
  };
}

if (require.main === module) {
  console.log(JSON.stringify(getLiveSnapshot(), null, 2));
}

module.exports = {
  getLiveLexicon,
  getLiveSnapshot,
  lexicon,
};
