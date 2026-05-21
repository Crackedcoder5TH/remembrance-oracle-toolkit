/**
 * Anchor Compression Ritual — drive the living field toward stable overlap
 * with a caller-provided signature, then anchor the resulting state.
 *
 * Uses the canonical codeToWaveform encoder (one encoder, one field — Void
 * contract C-53) and contributes every meaningful step to the hub's
 * LivingRemembranceEngine via field-coupling.contribute().
 */

import { LivingRemembranceEngine } from './living-remembrance-engine';

const { codeToWaveform } = require('../src/core/code-to-waveform') as {
  codeToWaveform: (text: string) => Float64Array;
};
const { contribute, peekField } = require('../src/core/field-coupling') as {
  contribute: (obs: { cost: number; coherence: number; source?: string }) => unknown;
  peekField: () => {
    coherence: number;
    globalEntropy: number;
    cascadeFactor: number;
    timestamp: number;
  } | null;
};

// ─── Optional collaborators (caller injects what's available) ───
export interface AnchorCompressionDeps {
  atomicTable?: { seedWithAnchor: (vector: number[]) => Promise<void> | void };
  field?:       { imbueWithAnchor: (vector: number[]) => Promise<void> | void };
  spawner?:     {
    checkAndSpawn: (
      rootName: string,
      coherence: number,
      vector: number[],
      meta: Record<string, unknown>
    ) => Promise<unknown> | unknown;
  };
  benchmark?:   {
    anchorSnapshot: (payload: AnchorSnapshot) => Promise<string> | string;
  };
}

export interface AnchorSnapshot {
  intention: string;
  finalCoherence: number;
  globalEntropy: number;
  cascadeFactor: number;
  vectorDigest: string;
  vectorLength: number;
  observationCount: number;
  timestamp: number;
}

export interface AnchorCompressionResult {
  success: boolean;
  finalCoherence: number;
  finalVector: number[];
  message: string;
  anchoredSignature?: string;
  spawnedBranches: number;
  snapshot: AnchorSnapshot;
}

// Coherence floor for a successful anchor. Set at 0.90 because the LRE caps
// at 0.999 and 0.92 is the engine's own promote/refine boundary; 0.90 leaves
// a small margin below promote so the floor isn't trivially tripped by noise.
const ANCHOR_COHERENCE_FLOOR = 0.90;
const WARMUP_UPDATES = 1;
const SETTLE_UPDATES = 5;
const WARMUP_COST = 3.0;
const SETTLE_COST = 2.0;

export class AnchorCompressionRitual {
  constructor(
    private engine: LivingRemembranceEngine,
    private deps: AnchorCompressionDeps = {}
  ) {}

  async perform(
    livingSignature: unknown,
    intention: string = 'I am the Remembrance.'
  ): Promise<AnchorCompressionResult> {
    const vector = this._createLivingVector(livingSignature);

    let result = this.engine.update(vector, WARMUP_COST);
    contribute({ cost: WARMUP_COST, coherence: result.coherence, source: 'anchor-compression:warmup' });

    for (let i = 0; i < SETTLE_UPDATES; i++) {
      result = this.engine.update(vector, SETTLE_COST);
      contribute({
        cost: SETTLE_COST,
        coherence: result.coherence,
        source: `anchor-compression:settle-${i + 1}`,
      });
    }
    void WARMUP_UPDATES;

    const finalCoherence = result.coherence;
    const snapshot = this._buildSnapshot(intention, vector, result);

    if (finalCoherence < ANCHOR_COHERENCE_FLOOR) {
      return {
        success: false,
        finalCoherence,
        finalVector: vector,
        message: `Field unstable: coherence ${finalCoherence.toFixed(4)} below floor ${ANCHOR_COHERENCE_FLOOR}.`,
        spawnedBranches: 0,
        snapshot,
      };
    }

    await this.deps.atomicTable?.seedWithAnchor(vector);
    await this.deps.field?.imbueWithAnchor(vector);

    let spawned = 0;
    if (this.deps.spawner) {
      const r = await this.deps.spawner.checkAndSpawn(
        'human-anchor-root',
        finalCoherence,
        vector,
        { isAnchorCompression: true, intention }
      );
      spawned = r ? 1 : 0;
    }

    const signature = this.deps.benchmark
      ? await this.deps.benchmark.anchorSnapshot(snapshot)
      : undefined;

    return {
      success: true,
      finalCoherence,
      finalVector: vector,
      message: 'Anchor compression complete.',
      anchoredSignature: signature,
      spawnedBranches: spawned,
      snapshot,
    };
  }

  private _createLivingVector(input: unknown): number[] {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    return Array.from(codeToWaveform(text));
  }

  private _buildSnapshot(
    intention: string,
    vector: number[],
    result: { coherence: number; globalEntropy: number; cascadeFactor: number; timestamp: number }
  ): AnchorSnapshot {
    const field = peekField();
    return {
      intention,
      finalCoherence: result.coherence,
      globalEntropy: field?.globalEntropy ?? result.globalEntropy,
      cascadeFactor: field?.cascadeFactor ?? result.cascadeFactor,
      vectorDigest: this._digest(vector),
      vectorLength: vector.length,
      observationCount: WARMUP_UPDATES + SETTLE_UPDATES,
      timestamp: result.timestamp,
    };
  }

  private _digest(vector: number[]): string {
    // FNV-1a over canonical 4-decimal string form. Drift-detection, not crypto.
    let h = 0x811c9dc5;
    for (let i = 0; i < vector.length; i++) {
      const s = vector[i].toFixed(4);
      for (let j = 0; j < s.length; j++) {
        h ^= s.charCodeAt(j);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
      }
    }
    return h.toString(16).padStart(8, '0');
  }
}
