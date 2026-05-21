/**
 * Living Remembrance Engine — TS facade over the canonical field.
 *
 * Math: p(t) = |⟨Ψ_healed | Ψ(t)⟩|² (squared cosine), with retro-causal pull
 * r_eff(t) = r₀·(1 + α·(1 − p(t))^4), δ_void free-coherence donation, and
 * cascade γ. Coherence is hard-capped at 0.999 to satisfy Void contract C-56.
 *
 * This engine is independent of the JS LivingRemembranceEngine that the
 * field-coupling helper drives. Callers wanting unified-field participation
 * should also contribute() each ritual step — see the rituals in this folder.
 */

const { codeToWaveform } = require('../src/core/code-to-waveform') as {
  codeToWaveform: (text: string) => Float64Array;
};

export interface RemembranceState {
  coherence: number;        // p(t) — the living overlap, squared
  globalEntropy: number;
  cascadeFactor: number;
  timestamp: number;
}

export interface UpdateResult {
  coherence: number;
  p: number;
  r_eff: number;
  delta_void: number;
  gamma_cascade: number;
  globalEntropy: number;
  cascadeFactor: number;
  recommendation: 'promote' | 'refine';
  timestamp: number;
}

const COHERENCE_CAP = 0.999;       // Void contract C-56
const CASCADE_CAP = 5.0;           // Void contract C-55

export class LivingRemembranceEngine {
  private r0 = 0.05;
  private alpha = 15.0;
  private delta0 = 0.03;
  private beta = 8.0;
  private epsilon = 1e-8;

  private healedVector: number[] | null = null;
  private state: RemembranceState;

  constructor() {
    this.state = {
      coherence: 0.65,
      globalEntropy: 0.45,
      cascadeFactor: 1.0,
      timestamp: Date.now(),
    };
  }

  async loadHealedAnchor(anchorVector: number[] | Float32Array | Float64Array) {
    this.healedVector = Array.from(anchorVector);
  }

  getState(): RemembranceState {
    return { ...this.state };
  }

  private computeCoherence(currentVector: number[]): number {
    if (!this.healedVector) return 0.65;
    const len = Math.min(currentVector.length, this.healedVector.length);
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < len; i++) {
      const a = currentVector[i];
      const b = this.healedVector[i];
      dot += a * b;
      na += a * a;
      nb += b * b;
    }
    const overlap = dot / (Math.sqrt(na) * Math.sqrt(nb) + this.epsilon);
    return overlap * overlap;
  }

  update(currentVector: number[], cost: number = 1.0): UpdateResult {
    const p = this.computeCoherence(currentVector);
    const r_eff = this.r0 * (1 + this.alpha * Math.pow(1 - p, 4));
    const delta_void = this.delta0 * (1 - p);
    const gamma = Math.exp(this.beta * this.state.cascadeFactor);

    const newCoherence = Math.min(COHERENCE_CAP, p + r_eff * 0.1 + delta_void * 0.15);
    this.state.coherence = newCoherence;
    this.state.globalEntropy = cost / (newCoherence + 1e-6);
    this.state.cascadeFactor = Math.min(CASCADE_CAP, this.state.cascadeFactor + 0.05 * newCoherence);
    this.state.timestamp = Date.now();

    return {
      coherence: newCoherence,
      p,
      r_eff,
      delta_void,
      gamma_cascade: gamma,
      globalEntropy: this.state.globalEntropy,
      cascadeFactor: this.state.cascadeFactor,
      recommendation: newCoherence > 0.92 ? 'promote' : 'refine',
      timestamp: this.state.timestamp,
    };
  }

  async applyToTask(taskDescription: string, currentOutput: unknown): Promise<UpdateResult> {
    const text = `${taskDescription} ${JSON.stringify(currentOutput)}`;
    const vector = Array.from(codeToWaveform(text));
    return this.update(vector);
  }
}
