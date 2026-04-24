/**
 * Tests for the valor/coherency module and the covenant gate.
 *
 * These tests re-implement the same archetype-cascade scoring in pure JS
 * so the test suite doesn't need a TypeScript toolchain. The numeric
 * thresholds mirror app/lib/valor/coherency-primitives.ts exactly, and
 * any drift between this file and the TS module is a bug signal.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Port of coherency-primitives ────────────────────────────────

const EPSILON = 1e-9;

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

function geometricMean(values) {
  if (values.length === 0) return 0;
  let logSum = 0;
  for (const v of values) {
    const c = clamp01(v);
    if (c <= EPSILON) return 0;
    logSum += Math.log(c);
  }
  return Math.exp(logSum / values.length);
}

function pearson(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const d = Math.sqrt(da * db);
  if (d <= EPSILON) return 0;
  const r = num / d;
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : 0;
}

const THRESHOLDS = {
  GATE: 0.60,
  FOUNDATION: 0.70,
  STABILITY: 0.75,
  SYNERGY: 0.85,
  TRANSCENDENCE: 0.95,
};

function tierFor(score) {
  if (score >= 0.98) return "unity";
  if (score >= 0.95) return "transcendence";
  if (score >= 0.90) return "intelligence";
  if (score >= 0.85) return "synergy";
  if (score >= 0.80) return "optimization";
  if (score >= 0.75) return "stability";
  if (score >= 0.70) return "foundation";
  if (score >= 0.68) return "pull";
  if (score >= 0.60) return "gate";
  return "rejection";
}

// ─── Geometric mean: weakest-link law ────────────────────────────

describe("geometricMean — weakest link", () => {
  it("returns 0 when any dimension is 0", () => {
    assert.equal(geometricMean([0.99, 0.99, 0.99, 0]), 0);
  });

  it("is the geometric mean for uniform values", () => {
    const v = geometricMean([0.5, 0.5, 0.5, 0.5]);
    assert.ok(Math.abs(v - 0.5) < 1e-12);
  });

  it("is dragged by the lowest signal (weakest link)", () => {
    const high = geometricMean([0.9, 0.9, 0.9, 0.9, 0.9]);
    const dragged = geometricMean([0.9, 0.9, 0.9, 0.9, 0.3]);
    assert.ok(high > 0.85);
    // The single low dimension pulls the geometric mean materially below
    // the arithmetic mean (which would be 0.78) but doesn't zero it.
    assert.ok(dragged < high - 0.15, `expected dragged < high−0.15, got high=${high} dragged=${dragged}`);
    assert.ok(dragged < 0.75, `expected dragged < 0.75, got ${dragged}`);
  });

  it("returns 0 for empty array", () => {
    assert.equal(geometricMean([]), 0);
  });
});

// ─── Pearson ────────────────────────────────────────────────────

describe("pearson", () => {
  it("is 1 for identical waveforms", () => {
    const w = [1, 2, 3, 4, 5, 6, 7, 8];
    assert.ok(Math.abs(pearson(w, w) - 1) < 1e-12);
  });

  it("is -1 for inverted waveforms", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [5, 4, 3, 2, 1];
    assert.ok(Math.abs(pearson(a, b) - -1) < 1e-12);
  });

  it("is 0 for zero-variance waveforms", () => {
    assert.equal(pearson([1, 1, 1, 1], [1, 2, 3, 4]), 0);
  });

  it("returns 0 on length mismatch", () => {
    assert.equal(pearson([1, 2], [1, 2, 3]), 0);
  });
});

// ─── Tier assignment ────────────────────────────────────────────

describe("tierFor — coherency to lexicon tier", () => {
  it("maps 0.3 to rejection", () => {
    assert.equal(tierFor(0.3), "rejection");
  });
  it("maps 0.65 to gate", () => {
    assert.equal(tierFor(0.65), "gate");
  });
  it("maps 0.72 to foundation", () => {
    assert.equal(tierFor(0.72), "foundation");
  });
  it("maps 0.86 to synergy", () => {
    assert.equal(tierFor(0.86), "synergy");
  });
  it("maps 0.97 to transcendence", () => {
    assert.equal(tierFor(0.97), "transcendence");
  });
});

// ─── Archetype cascade — the core covenant test ─────────────────

// Minimal archetype library matching lead-substrates.ts
const PROTECTIVE_VETERAN = [
  0.95, 0.95, 0.98, 0.90, 0.85, 0.98, 0.98,
  0.98, 0.90, 0.90, 0.90, 0.95, 0.65, 0.80, 0.80, 0.80,
];
const BOT_UNIFORM_FAST = [
  0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98,
  0.98, 0.98, 0.98, 0.98, 0.98, 0.05, 0.05, 0.05, 0.05,
];

describe("archetype resonance", () => {
  it("veteran-shaped lead correlates > 0.5 with protective-veteran archetype", () => {
    const leadShape = [
      0.92, 0.95, 0.95, 0.92, 0.90, 0.95, 0.98,
      0.95, 0.90, 0.90, 0.90, 0.95, 0.60, 0.75, 0.80, 0.78,
    ];
    const r = pearson(leadShape, PROTECTIVE_VETERAN);
    assert.ok(r > 0.5, `expected r > 0.5 against valor archetype, got ${r}`);
  });

  it("bot-shaped lead correlates strongly with bot archetype", () => {
    const botShape = [
      0.95, 0.96, 0.97, 0.97, 0.96, 0.98, 0.98,
      0.98, 0.95, 0.96, 0.95, 0.96, 0.08, 0.06, 0.04, 0.06,
    ];
    const r = pearson(botShape, BOT_UNIFORM_FAST);
    assert.ok(r > 0.9, `expected r > 0.9 against bot archetype, got ${r}`);
  });

  it("bot shape correlates higher with bot archetype than with valor", () => {
    const botShape = [
      0.95, 0.96, 0.97, 0.97, 0.96, 0.98, 0.98,
      0.98, 0.95, 0.96, 0.95, 0.96, 0.08, 0.06, 0.04, 0.06,
    ];
    const botR = pearson(botShape, BOT_UNIFORM_FAST);
    const valorR = pearson(botShape, PROTECTIVE_VETERAN);
    // Pearson only sees shape, not magnitude — both archetypes rise then fall,
    // so valor correlation isn't zero. The correct signal is dominance.
    assert.ok(botR > valorR, `bot should dominate (bot=${botR}, valor=${valorR})`);
    assert.ok(botR - valorR > 0.08, `expected clear margin, got ${botR - valorR}`);
  });
});

// ─── Covenant admission end-to-end ──────────────────────────────

function admitDecision(shape, valorArchetype, botArchetype) {
  const intrinsic = geometricMean(shape);
  const valorR = Math.max(0, pearson(shape, valorArchetype));
  const botR = Math.max(0, pearson(shape, botArchetype));
  // Suppression fires only when bot resonance WINS over valor resonance —
  // mirrors the production logic in lead-coherency.ts.
  const suppression = botR > valorR ? clamp01(1 - botR) : 1.0;
  const score = geometricMean([intrinsic, clamp01(valorR), suppression]);
  const tier = tierFor(score);
  const dominant = botR > valorR ? "bot" : "valor";
  const admitted = score >= THRESHOLDS.GATE && dominant !== "bot";
  return { score, tier, admitted, dominant };
}

describe("covenant admission", () => {
  it("admits a high-quality veteran lead at foundation or above", () => {
    const shape = [
      0.92, 0.95, 0.95, 0.92, 0.90, 0.95, 0.98,
      0.95, 0.90, 0.90, 0.90, 0.95, 0.60, 0.75, 0.80, 0.78,
    ];
    const d = admitDecision(shape, PROTECTIVE_VETERAN, BOT_UNIFORM_FAST);
    assert.ok(d.admitted, `expected admission, got ${JSON.stringify(d)}`);
    assert.ok(d.score >= THRESHOLDS.FOUNDATION, `expected foundation+, got ${d.score}`);
  });

  it("silent-rejects a bot with uniform shape + fast submit", () => {
    const shape = [
      0.95, 0.96, 0.97, 0.97, 0.96, 0.98, 0.98,
      0.98, 0.95, 0.96, 0.95, 0.96, 0.08, 0.06, 0.04, 0.06,
    ];
    const d = admitDecision(shape, PROTECTIVE_VETERAN, BOT_UNIFORM_FAST);
    assert.equal(d.dominant, "bot");
    assert.equal(d.admitted, false);
  });

  it("rejects a lead with any zero dimension (weakest link)", () => {
    const shape = [
      0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9,
      0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0, // zero timing — catastrophic
    ];
    const d = admitDecision(shape, PROTECTIVE_VETERAN, BOT_UNIFORM_FAST);
    assert.equal(d.score, 0);
    assert.equal(d.admitted, false);
  });
});
