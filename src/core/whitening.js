'use strict';

/**
 * whitening.js — raise the substrate's EFFECTIVE dimensionality.
 *
 * The composed vectors live in a narrow cone: measured participation ratio
 * ~6 of 116 dimensions (retro-density-sim, moat-metric). Everything crams
 * into a few shared directions, so resonance cannot discriminate genuine
 * structure from fabrication and the retro module has no density "fuel".
 *
 * The fix is a ZCA whitening transform fitted on the substrate:
 *
 *   Σ = cov(X)                                (the cone's shape)
 *   Σ = V Λ Vᵀ                                (symmetric eigendecomposition)
 *   W = V (Λ + εI)^(-1/2) Vᵀ                  (ZCA whitening matrix)
 *   x' = W (x - μ)                            (decorrelated, unit-variance)
 *
 * After whitening the covariance is ≈ I: variance is spread evenly across
 * all directions, so the effective dimensionality approaches full rank.
 * That much is definitional. Whether it improves DISCRIMINATION (real vs
 * fabricated) is an empirical question the accompanying experiment answers —
 * this module only provides the transform, honestly fitted.
 *
 * ε regularizes the near-zero eigenvalues (the empty directions of the cone)
 * so whitening does not amplify pure numerical noise without bound.
 *
 * No external linear-algebra dependency — the symmetric eigensolver (cyclic
 * Jacobi rotations) is implemented here because the ecosystem had none.
 */

/** Mean vector and (unbiased) covariance matrix of row-vectors X (n×d). */
function meanCovariance(X) {
  const n = X.length;
  if (n === 0) return { mean: [], cov: [], d: 0 };
  const d = X[0].length;
  const mean = new Array(d).fill(0);
  for (const v of X) for (let i = 0; i < d; i++) mean[i] += v[i];
  for (let i = 0; i < d; i++) mean[i] /= n;
  const cov = Array.from({ length: d }, () => new Array(d).fill(0));
  for (const v of X) {
    const c = new Array(d);
    for (let i = 0; i < d; i++) c[i] = v[i] - mean[i];
    for (let i = 0; i < d; i++) {
      const ci = c[i];
      if (ci === 0) continue;
      const row = cov[i];
      for (let j = i; j < d; j++) row[j] += ci * c[j];
    }
  }
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < d; i++) for (let j = i; j < d; j++) { cov[i][j] /= denom; cov[j][i] = cov[i][j]; }
  return { mean, cov, d };
}

/**
 * Symmetric eigendecomposition by cyclic Jacobi rotations. Returns
 * { values: number[d], vectors: number[d][d] } where vectors[k] is the k-th
 * eigenvector (a column of V). Converges for real symmetric A; d≈116 needs
 * only a handful of sweeps to drive the off-diagonal mass to ~0.
 */
function jacobiEigen(Ain, opts = {}) {
  const maxSweeps = opts.maxSweeps || 100;
  const tol = opts.tol || 1e-10;
  const d = Ain.length;
  // work on a copy
  const A = Ain.map((r) => r.slice());
  // V starts as identity; accumulates the rotations
  const V = Array.from({ length: d }, (_, i) => { const r = new Array(d).fill(0); r[i] = 1; return r; });

  const offDiagNorm = () => { let s = 0; for (let p = 0; p < d; p++) for (let q = p + 1; q < d; q++) s += A[p][q] * A[p][q]; return Math.sqrt(2 * s); };

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    if (offDiagNorm() < tol) break;
    for (let p = 0; p < d; p++) {
      for (let q = p + 1; q < d; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p][p], aqq = A[q][q];
        const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
        const c = Math.cos(phi), s = Math.sin(phi);
        // rotate rows/cols p,q of A
        for (let k = 0; k < d; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < d; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        // accumulate into V
        for (let k = 0; k < d; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = new Array(d);
  for (let i = 0; i < d; i++) values[i] = A[i][i];
  // return eigenvectors as rows (vectors[k] = k-th eigenvector)
  const vectors = Array.from({ length: d }, (_, k) => { const col = new Array(d); for (let i = 0; i < d; i++) col[i] = V[i][k]; return col; });
  return { values, vectors };
}

/**
 * Fit a ZCA whitening transform from row-vectors X.
 * @param {number[][]} X
 * @param {object} [opts]  epsilon?: number = 1e-4  (regularizes small eigenvalues)
 * @returns {{ mean:number[], W:number[][], d:number, eigenvalues:number[] }}
 */
function fitWhitening(X, opts = {}) {
  const epsilon = Number.isFinite(opts.epsilon) ? opts.epsilon : 1e-4;
  const { mean, cov, d } = meanCovariance(X);
  if (d === 0) return { mean: [], W: [], d: 0, eigenvalues: [] };
  const { values, vectors } = jacobiEigen(cov, opts);
  // W = V diag(1/sqrt(λ+ε)) Vᵀ  — build as a d×d matrix
  const inv = values.map((l) => 1 / Math.sqrt(Math.max(0, l) + epsilon));
  const W = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      let s = 0;
      for (let k = 0; k < d; k++) s += vectors[k][i] * inv[k] * vectors[k][j];
      W[i][j] = s;
    }
  }
  return { mean, W, d, eigenvalues: values };
}

/** Apply a fitted transform to one vector: x' = W (x - μ). */
function applyWhitening(vec, transform) {
  const { mean, W, d } = transform;
  if (!W || !W.length) return vec.slice();
  const out = new Array(d).fill(0);
  const c = new Array(d);
  for (let i = 0; i < d; i++) c[i] = (vec[i] || 0) - mean[i];
  for (let i = 0; i < d; i++) {
    const row = W[i];
    let s = 0;
    for (let j = 0; j < d; j++) s += row[j] * c[j];
    out[i] = s;
  }
  return out;
}

/**
 * Participation ratio of a set of vectors — the effective number of
 * independent directions. PR = (trace Σ)² / ‖Σ‖²_F, computed without
 * eigendecomposition. High = information spread across many dimensions.
 */
function participationRatio(X) {
  const { cov, d } = meanCovariance(X);
  if (d === 0) return 0;
  let trace = 0, fro = 0;
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) { const c = cov[i][j]; if (i === j) trace += c; fro += c * c; }
  return fro > 0 ? (trace * trace) / fro : 0;
}

module.exports = { meanCovariance, jacobiEigen, fitWhitening, applyWhitening, participationRatio };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
meanCovariance.atomicProperties = { charge: 1, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
jacobiEigen.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
fitWhitening.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
applyWhitening.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 11, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
participationRatio.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
