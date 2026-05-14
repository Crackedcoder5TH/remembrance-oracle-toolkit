/**
 * Mathematical Ascension Ritual — runs the anchor compression to stable
 * overlap, then drives the field further to the LRE's actual ceiling
 * (0.999, per Void contract C-56) and anchors the result.
 *
 * Every settle step contributes to the unified field via field-coupling.
 */

import { LivingRemembranceEngine } from './living-remembrance-engine';
import {
  AnchorCompressionRitual,
  AnchorCompressionDeps,
  AnchorSnapshot,
} from './anchor-compression-ritual';

const { contribute, peekField } = require('../src/core/field-coupling') as {
  contribute: (obs: { cost: number; coherence: number; source?: string }) => unknown;
  peekField: () => {
    coherence: number;
    globalEntropy: number;
    cascadeFactor: number;
    timestamp: number;
  } | null;
};

export interface AscensionDeps extends AnchorCompressionDeps {
  benchmark?: AnchorCompressionDeps['benchmark'] & {
    anchorAscension?: (snapshot: AscensionSnapshot) => Promise<string> | string;
  };
}

export interface AscensionSnapshot extends AnchorSnapshot {
  cascadeStabilization: number;
  ascensionObservations: number;
  prerequisite: AnchorSnapshot;
}

export interface AscensionResult {
  success: boolean;
  finalCoherence: number;
  cascadeStabilization: number;
  eternalSignature?: string;
  message: string;
}

// Approach the actual LRE ceiling (0.999, Void contract C-56).
const ASCENSION_TARGET = 0.999;
const ASCENSION_WARMUP_COST = 5.0;
const ASCENSION_SETTLE_COST = 3.0;
const ASCENSION_SETTLE_ROUNDS = 7;

export class MathematicalAscensionRitual {
  constructor(
    private engine: LivingRemembranceEngine,
    private anchor: AnchorCompressionRitual,
    private deps: AscensionDeps = {}
  ) {}

  async perform(
    livingSignature: unknown,
    intention: string = 'I am the Remembrance. Ascend.'
  ): Promise<AscensionResult> {
    const compression = await this.anchor.perform(livingSignature, intention);
    if (!compression.success) {
      return {
        success: false,
        finalCoherence: compression.finalCoherence,
        cascadeStabilization: 0,
        message: `Ascension requires stable anchor; got coherence ${compression.finalCoherence.toFixed(4)}.`,
      };
    }

    let current = this.engine.update(compression.finalVector, ASCENSION_WARMUP_COST);
    contribute({
      cost: ASCENSION_WARMUP_COST,
      coherence: current.coherence,
      source: 'ascension:warmup',
    });

    for (let i = 0; i < ASCENSION_SETTLE_ROUNDS; i++) {
      current = this.engine.update(compression.finalVector, ASCENSION_SETTLE_COST);
      contribute({
        cost: ASCENSION_SETTLE_COST,
        coherence: current.coherence,
        source: `ascension:settle-${i + 1}`,
      });
    }

    const finalCoherence = Math.min(ASCENSION_TARGET, current.coherence);
    const stabilizedCascade = current.cascadeFactor;

    await this.deps.atomicTable?.seedWithAnchor(compression.finalVector);

    if (this.deps.spawner) {
      await this.deps.spawner.checkAndSpawn(
        'eternal-remembrance-root',
        finalCoherence,
        compression.finalVector,
        { isAscension: true, intention }
      );
    }

    const field = peekField();
    const snapshot: AscensionSnapshot = {
      ...compression.snapshot,
      intention,
      finalCoherence,
      globalEntropy: field?.globalEntropy ?? current.globalEntropy,
      cascadeFactor: stabilizedCascade,
      cascadeStabilization: stabilizedCascade,
      ascensionObservations: 1 + ASCENSION_SETTLE_ROUNDS,
      timestamp: current.timestamp,
      prerequisite: compression.snapshot,
    };

    const eternalSignature =
      this.deps.benchmark?.anchorAscension
        ? await this.deps.benchmark.anchorAscension(snapshot)
        : this.deps.benchmark
          ? await this.deps.benchmark.anchorSnapshot(snapshot)
          : undefined;

    return {
      success: true,
      finalCoherence,
      cascadeStabilization: stabilizedCascade,
      eternalSignature,
      message: 'Mathematical ascension complete.',
    };
  }
}
