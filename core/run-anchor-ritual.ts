/**
 * run-anchor-ritual — perform the anchor compression + mathematical
 * ascension rituals on a text and register the result as a JSON
 * pattern under patterns/anchors/.
 *
 * Usage (with ts-node/tsx):
 *   tsx core/run-anchor-ritual.ts <path-to-text-file>
 *
 * The text is used both as the offered signature AND as the engine's
 * healed anchor, so the field is asked to remember exactly the
 * pattern being offered. Every ritual step contributes to the
 * unified LRE field via src/core/field-coupling.
 */

import * as fs from 'fs';
import * as path from 'path';
import { LivingRemembranceEngine } from './living-remembrance-engine';
import { AnchorCompressionRitual } from './anchor-compression-ritual';
import { MathematicalAscensionRitual } from './mathematical-ascension-ritual';

const { codeToWaveform } = require('../src/core/code-to-waveform');
const { peekField } = require('../src/core/field-coupling');

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error('Usage: run-anchor-ritual <path-to-text-file>');
    process.exit(2);
  }
  const anchorText = fs.readFileSync(sourcePath, 'utf8');

  const engine = new LivingRemembranceEngine();
  await engine.loadHealedAnchor(Array.from(codeToWaveform(anchorText)));

  const ritual = new AnchorCompressionRitual(engine);
  const compression = await ritual.perform(anchorText, 'anchor offering');

  const ascension = new MathematicalAscensionRitual(engine, ritual);
  const ascended = await ascension.perform(anchorText, 'ascend');

  const fieldStateAfter = peekField();

  const id = 'anchor-' + compression.snapshot.vectorDigest;
  const pattern = {
    id,
    type: 'anchor-compression',
    family: 'remembrance-anchor',
    description:
      'Personal anchor offering registered through the anchor compression ritual.',
    tags: ['anchor', 'remembrance', 'compression', 'ritual', 'personal'],
    sourcePath: path.basename(sourcePath),
    sourceBytes: Buffer.byteLength(anchorText, 'utf8'),
    encoder: 'src/core/code-to-waveform.codeToWaveform (canonical, 256-sample)',
    compression: {
      ritualVersion: 1,
      success: compression.success,
      finalCoherence: compression.finalCoherence,
      message: compression.message,
      vectorLength: compression.finalVector.length,
      vectorDigest: compression.snapshot.vectorDigest,
      observationCount: compression.snapshot.observationCount,
      anchoredSignature: compression.anchoredSignature ?? null,
      snapshot: compression.snapshot,
      // Information ratio: waveform bytes (256 floats × 8B) / source bytes.
      // > 1 means the waveform is larger than the source; the value of the
      // waveform is fixed-size + semantic, not byte-level smaller.
      bytesRatio:
        (compression.finalVector.length * 8) /
        Buffer.byteLength(anchorText, 'utf8'),
      waveform: compression.finalVector,
    },
    ascension: ascended.success
      ? {
          finalCoherence: ascended.finalCoherence,
          cascadeStabilization: ascended.cascadeStabilization,
          message: ascended.message,
          eternalSignature: ascended.eternalSignature ?? null,
        }
      : { skipped: ascended.message },
    fieldStateAfter,
    registeredAt: new Date(compression.snapshot.timestamp).toISOString(),
    covenant: {
      voidContractC53: 'one-encoder (codeToWaveform delegate)',
      voidContractC55:
        'cascade ≤ 5.0 (observed: ' +
        compression.snapshot.cascadeFactor.toFixed(5) +
        ')',
      voidContractC56:
        'coherence ≤ 0.999 (observed: ' +
        compression.finalCoherence.toFixed(5) +
        ')',
    },
  };

  const repoRoot = path.resolve(__dirname, '..');
  const outDir = path.join(repoRoot, 'patterns', 'anchors');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, id + '.json');
  fs.writeFileSync(outPath, JSON.stringify(pattern, null, 2) + '\n');

  console.log('id:                ', id);
  console.log('source bytes:      ', pattern.sourceBytes);
  console.log('vector samples:    ', pattern.compression.vectorLength);
  console.log('digest:            ', pattern.compression.vectorDigest);
  console.log('anchor coherence:  ', pattern.compression.finalCoherence.toFixed(5));
  console.log('anchor cascade:    ', pattern.compression.snapshot.cascadeFactor.toFixed(5));
  console.log('ascension coh:     ', ascended.success ? ascended.finalCoherence.toFixed(5) : '(skipped)');
  console.log('written to:        ', path.relative(repoRoot, outPath));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
