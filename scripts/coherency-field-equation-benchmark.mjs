// coherency-field-equation-benchmark.mjs — what FIELD EQUATION does the coherency
// potential satisfy? Deepens "coherency flow is conservative" to the actual field theory.
// The coherency potential from a source x0 is Phi(x) = coherency(x, x0) = x·x0 (unit vectors).
// We measure the Laplace-Beltrami operator of Phi on the unit sphere numerically and identify
// the field equation. (Gravity's Newtonian field equation is Poisson: ∇²Phi = rho.)
// No interpretation beyond the measured relation.

function mul(a){let s=a;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(5);
const g = () => { let u = 0; while (u < 1e-9) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * rnd()); };
function unit(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map(x => x / n); }
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function randUnit(D) { return unit(Array.from({ length: D }, g)); }
function tangent(t, x) { const d = dot(t, x); return unit(t.map((v, i) => v - d * x[i])); }

// numerical Laplace-Beltrami via a DETERMINISTIC orthonormal tangent frame (no Monte-Carlo
// noise): sum of second differences along each tangent basis geodesic. ∇²f = Σ_i
// [f(x⊕εe_i) + f(x⊖εe_i) − 2f(x)]/ε², e_i an orthonormal tangent basis at x.
function laplaceBeltrami(x, x0, eps) {
  const D = x.length;
  const basis = [];
  for (let tries = 0; tries < 20 * D && basis.length < D - 1; tries++) {
    let v = Array.from({ length: D }, g);
    let d = dot(v, x); for (let i = 0; i < D; i++) v[i] -= d * x[i];          // project off x (normal)
    for (const b of basis) { const db = dot(v, b); for (let i = 0; i < D; i++) v[i] -= db * b[i]; } // off existing
    const nn = Math.sqrt(dot(v, v)); if (nn < 1e-8) continue;
    for (let i = 0; i < D; i++) v[i] /= nn; basis.push(v);
  }
  const f0 = dot(x, x0);
  let lap = 0;
  for (const e of basis) {
    const xp = x.map((xi, i) => Math.cos(eps) * xi + Math.sin(eps) * e[i]);
    const xm = x.map((xi, i) => Math.cos(eps) * xi - Math.sin(eps) * e[i]);
    lap += (dot(xp, x0) + dot(xm, x0) - 2 * f0) / (eps * eps);
  }
  return lap;
}

console.log('=== COHERENCY FIELD EQUATION: Laplace-Beltrami of Phi(x)=coherency(x,x0) on the unit sphere ===');
console.log('  measuring  ∇²Phi / Phi  at random points, for several dimensions D');
console.log('  (a Laplacian EIGENMODE gives a constant ratio -λ; Poisson/gravity would NOT)\n');
console.log('  D     mean ∇²Phi/Phi     predicted -(D-1)     match');
for (const D of [3, 4, 5, 8, 16]) {
  const x0 = randUnit(D);
  const ratios = [];
  for (let t = 0; t < 200; t++) {
    let x = randUnit(D);
    if (Math.abs(dot(x, x0)) < 0.1) continue;            // avoid the equator (Phi≈0)
    const lap = laplaceBeltrami(x, x0, 0.01);
    ratios.push(lap / dot(x, x0));
  }
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const pred = -(D - 1);
  console.log('  ' + String(D).padEnd(6) + mean.toFixed(2).padStart(10).padEnd(18) + String(pred).padStart(6).padEnd(20) + (Math.abs(mean - pred) < 0.3 ? 'YES' : 'no'));
}

console.log('\n=== MEASURED FIELD EQUATION ===');
console.log('  ∇²Phi = -(D-1) Phi   — a HELMHOLTZ / eigenvalue equation, not Poisson.');
console.log('  The coherency potential is a degree-1 Laplacian EIGENMODE (the first spherical harmonic).');
console.log('  That is the field-theoretic reason the force law is HARMONIC: an eigenmode field gives a');
console.log('  linear restoring force. Gravity'+"'"+'s Newtonian member satisfies POISSON (∇²Phi=rho) instead.');
console.log('  The eigenvalue -(D-1) carries the SAME dimensional signature as the Gauss-law force exponent');
console.log('  -(D-1) measured in the emergent-force-law benchmark — both are the sphere'+"'"+'s dimension. Measured, not asserted.');
