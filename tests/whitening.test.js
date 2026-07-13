'use strict';
// ZCA whitening: the numerical core (symmetric eigensolver) + the property
// that whitening raises a low-rank cloud's effective dimensionality.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { jacobiEigen, fitWhitening, applyWhitening, participationRatio, meanCovariance } = require('../src/core/whitening');

test('Jacobi eigensolver: correct eigenvalues, orthonormal vectors', () => {
  const A = [[2, 1, 0], [1, 2, 1], [0, 1, 2]];
  const { values, vectors } = jacobiEigen(A);
  const sorted = [...values].sort((a, b) => a - b);
  assert.ok(Math.abs(sorted[0] - 0.5858) < 1e-3, `λ0 ${sorted[0]}`);
  assert.ok(Math.abs(sorted[1] - 2.0) < 1e-3);
  assert.ok(Math.abs(sorted[2] - 3.4142) < 1e-3);
  const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  for (const v of vectors) assert.ok(Math.abs(dot(v, v) - 1) < 1e-6, 'unit norm');
  assert.ok(Math.abs(dot(vectors[0], vectors[1])) < 1e-6, 'orthogonal');
});

test('whitening raises the effective dimensionality of a low-rank cloud', () => {
  // 8-D vectors that live near a 2-D subspace (a narrow cone)
  function mb(s){let a=s>>>0;return()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  const rnd = mb(1);
  const X = [];
  for (let i = 0; i < 400; i++) {
    const a = rnd(), b = rnd();
    const v = [a, a * 0.9, a * 1.1, b, b * 0.8, a + b, 0.01 * (rnd() - 0.5), 0.01 * (rnd() - 0.5)];
    X.push(v);
  }
  const prBefore = participationRatio(X);
  const W = fitWhitening(X, { epsilon: 1e-4 });
  const prAfter = participationRatio(X.map((v) => applyWhitening(v, W)));
  assert.ok(prBefore < 4, `cone PR should be low, got ${prBefore.toFixed(2)}`);
  // Whitening strictly raises effective dimensionality; the magnitude depends
  // on epsilon and the cloud (on the real 116-D substrate it rose 7.2 → 43.3).
  assert.ok(prAfter > prBefore, `whitening should raise PR: ${prBefore.toFixed(2)} → ${prAfter.toFixed(2)}`);
});

test('applyWhitening is a no-op with an empty transform (safe fallback)', () => {
  const v = [1, 2, 3];
  assert.deepEqual(applyWhitening(v, { mean: [], W: [], d: 0 }), v);
});
