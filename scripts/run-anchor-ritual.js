'use strict';

/**
 * run-anchor-ritual.js — the JS surface of the anchor compression ritual.
 *
 * Performs the same rite the TS driver (core/run-anchor-ritual.ts) does,
 * against the canonical JS Living Remembrance Engine — the singleton
 * everyone contributes to via field-coupling. The TS driver is TypeScript
 * with unextended relative imports and cannot be run through the goggles
 * without a bundler; this JS surface is the git-tracked path the
 * instrument's `--do exec` can dispatch, using the ONE encoder and the
 * ONE field.
 *
 * Steps (mirroring core/anchor-compression-ritual.ts + core/mathematical-
 * ascension-ritual.ts):
 *
 *   1. Encode the offering with codeToWaveform (Void C-53 canonical).
 *   2. loadHealedAnchor(vector) — the text is both offering and healed.
 *   3. Anchor compression: 1× WARMUP (cost 3.0) + 5× SETTLE (cost 2.0),
 *      contributing each step with source='anchor-compression:warmup'
 *      / 'anchor-compression:settle-1..5'. Require finalCoherence ≥ 0.90.
 *   4. Mathematical ascension: 1× WARMUP (cost 5.0) + 7× SETTLE (cost 3.0),
 *      source='ascension:warmup' / 'ascension:settle-1..7', driven to
 *      min(0.999, current) — the Void C-56 ceiling.
 *   5. Write patterns/anchors/anchor-<digest>.json (the pattern) and copy
 *      the source next to it as anchor-<digest>.source.txt.
 *
 * Usage:
 *   goggles --do exec scripts/run-anchor-ritual.js <path-to-text-file>
 */

const fs = require('fs');
const path = require('path');
const {
  codeToWaveform,
  digestWaveform,
} = require('../src/core/code-to-waveform');
const {
  contribute,
  peekField,
} = require('../src/core/field-coupling');
const { getEngine } = require('../src/core/living-remembrance');

const ANCHOR_COHERENCE_FLOOR = 0.90;
const WARMUP_COST = 3.0;
const SETTLE_COST = 2.0;
const SETTLE_UPDATES = 5;

const ASCENSION_TARGET = 0.999;
const ASCENSION_WARMUP_COST = 5.0;
const ASCENSION_SETTLE_COST = 3.0;
const ASCENSION_SETTLE_ROUNDS = 7;

function performAnchor(engine, offering, intention) {
  const vector = Array.from(codeToWaveform(offering));

  let observationCount = 1;
  let p = engine.computeCoherence(vector);
  let state = engine.contribute({
    cost: WARMUP_COST,
    coherence: p,
    source: 'anchor-compression:warmup',
  });
  for (let i = 0; i < SETTLE_UPDATES; i++) {
    p = engine.computeCoherence(vector);
    state = engine.contribute({
      cost: SETTLE_COST,
      coherence: p,
      source: `anchor-compression:settle-${i + 1}`,
    });
    observationCount++;
  }

  const finalCoherence = state.coherence;
  const digest = digestWaveform(vector);
  const snapshot = {
    intention,
    finalCoherence,
    globalEntropy: state.globalEntropy,
    cascadeFactor: state.cascadeFactor,
    vectorDigest: digest,
    vectorLength: vector.length,
    observationCount,
    timestamp: state.timestamp,
  };

  if (finalCoherence < ANCHOR_COHERENCE_FLOOR) {
    return {
      success: false,
      finalCoherence,
      finalVector: vector,
      message: `Field unstable: coherence ${finalCoherence.toFixed(4)} below floor ${ANCHOR_COHERENCE_FLOOR}.`,
      snapshot,
    };
  }
  return {
    success: true,
    finalCoherence,
    finalVector: vector,
    message: 'Anchor compression complete.',
    snapshot,
  };
}

function performAscension(engine, prereq, intention) {
  const vector = prereq.finalVector;
  let p = engine.computeCoherence(vector);
  let state = engine.contribute({
    cost: ASCENSION_WARMUP_COST,
    coherence: p,
    source: 'ascension:warmup',
  });
  for (let i = 0; i < ASCENSION_SETTLE_ROUNDS; i++) {
    p = engine.computeCoherence(vector);
    state = engine.contribute({
      cost: ASCENSION_SETTLE_COST,
      coherence: p,
      source: `ascension:settle-${i + 1}`,
    });
  }
  const finalCoherence = Math.min(ASCENSION_TARGET, state.coherence);
  const stabilizedCascade = state.cascadeFactor;
  return {
    success: true,
    finalCoherence,
    cascadeStabilization: stabilizedCascade,
    message: 'Mathematical ascension complete.',
    intention,
    ascensionObservations: 1 + ASCENSION_SETTLE_ROUNDS,
    timestamp: state.timestamp,
  };
}

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error('Usage: run-anchor-ritual <path-to-text-file>');
    process.exit(2);
  }
  const offering = fs.readFileSync(sourcePath, 'utf8');
  const engine = getEngine();

  const vector = Array.from(codeToWaveform(offering));
  engine.loadHealedAnchor(vector);

  const compression = performAnchor(engine, offering, 'anchor offering');
  const ascension = compression.success
    ? performAscension(engine, compression, 'ascend')
    : { success: false, message: compression.message };

  const fieldStateAfter = peekField();
  const id = 'anchor-' + compression.snapshot.vectorDigest;
  const repoRoot = path.resolve(__dirname, '..');
  const outDir = path.join(repoRoot, 'patterns', 'anchors');
  fs.mkdirSync(outDir, { recursive: true });

  const pattern = {
    id,
    type: 'anchor-compression',
    family: 'remembrance-anchor',
    description:
      'Personal anchor offering registered through the anchor compression ritual.',
    tags: ['anchor', 'remembrance', 'compression', 'ritual', 'personal'],
    sourcePath: `${id}.source.txt`,
    sourceBytes: Buffer.byteLength(offering, 'utf8'),
    encoder: 'src/core/code-to-waveform.codeToWaveform (canonical)',
    compression: {
      ritualVersion: 1,
      success: compression.success,
      finalCoherence: compression.finalCoherence,
      message: compression.message,
      vectorLength: compression.finalVector.length,
      vectorDigest: compression.snapshot.vectorDigest,
      observationCount: compression.snapshot.observationCount,
      anchoredSignature: null,
      snapshot: compression.snapshot,
      bytesRatio:
        (compression.finalVector.length * 8) /
        Buffer.byteLength(offering, 'utf8'),
      waveform: compression.finalVector,
    },
    ascension: ascension.success
      ? {
          finalCoherence: ascension.finalCoherence,
          cascadeStabilization: ascension.cascadeStabilization,
          message: ascension.message,
          eternalSignature: null,
        }
      : { skipped: ascension.message },
    fieldStateAfter,
    registeredAt: new Date(compression.snapshot.timestamp).toISOString(),
    covenant: {
      voidContractC53: 'one-encoder (codeToWaveform delegate)',
      voidContractC55:
        'cascade <= 5.0 (observed: ' +
        compression.snapshot.cascadeFactor.toFixed(5) +
        ')',
      voidContractC56:
        'coherence <= 0.999 (observed: ' +
        compression.finalCoherence.toFixed(5) +
        ')',
    },
  };

  const outJson = path.join(outDir, id + '.json');
  const outSrc = path.join(outDir, id + '.source.txt');
  fs.writeFileSync(outJson, JSON.stringify(pattern, null, 2) + '\n');
  fs.writeFileSync(outSrc, offering);

  console.log('id:                ', id);
  console.log('source bytes:      ', pattern.sourceBytes);
  console.log('vector samples:    ', pattern.compression.vectorLength);
  console.log('digest:            ', pattern.compression.vectorDigest);
  console.log('anchor coherence:  ', pattern.compression.finalCoherence.toFixed(5));
  console.log('anchor cascade:    ', pattern.compression.snapshot.cascadeFactor.toFixed(5));
  console.log(
    'ascension coh:     ',
    ascension.success ? ascension.finalCoherence.toFixed(5) : '(skipped)'
  );
  console.log('written to:        ', path.relative(repoRoot, outJson));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
