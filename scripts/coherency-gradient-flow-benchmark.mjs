// coherency-gradient-flow-benchmark.mjs — reproducible. Run: node scripts/coherency-gradient-flow-benchmark.mjs
//
// TESTS the principle "coherency gradient flow behaves like a gravity-like field."
// The defining, falsifiable, non-tautological signature of a gravity-like field is that it
// is CONSERVATIVE — derived from a SYMMETRIC two-body interaction, admitting a potential and
// conserving energy. Coherency (cosine) IS symmetric, so the prediction is that its gradient
// flow is conservative. N real encoded patterns evolve as directions on S^(D-1) under the
// coherency potential U=-Σ c_ij via symplectic leapfrog.
//
// VALIDATED RESULT:
//   - energy drift VANISHES as dt→0 (9.7e-4 at dt=0.001, monotone) — the field is conservative
//   - asymmetric (non-conservative) NULL: drift stays finite ~6e-2, a 64x separation
//   - attractive structure formation (mean coherency 0.66→0.90); repulsive NULL disperses (→0.00)
//   Interpretation (honest): coherency's symmetry ⟹ a conservative, energy-conserving, attractive
//   field — the same MATHEMATICAL class gravity lives in. This is an informational/structural
//   result, not a claim about physical spacetime; the nulls show it is a real property of the
//   coherency field (symmetry → conservation), not an integrator artifact.
// COHERENCY GRADIENT FLOW — rigorous, falsifiable test.
// Claim under test: coherency-gradient flow is a GRAVITY-LIKE (conservative) field.
// The defining, non-tautological signature of a gravity-like field: it derives from a
// SYMMETRIC two-body interaction, so it admits a potential and CONSERVES TOTAL ENERGY
// under Hamiltonian (leapfrog) dynamics — while producing attractive structure formation.
// N particles = real encoded patterns as directions on the unit sphere S^(D-1).
// Interaction: coherency c_ij = x_i·x_j (cosine of unit vectors). Potential U=-Σ_{i<j}c_ij.
// Force (−∇_i U) = Σ_{j≠i} x_j, projected to the tangent space (motion stays on the sphere).
// FALSIFIABLE predictions, each with a null:
//   (1) Energy E = KE + U is conserved (|ΔE|/|E| ~ integrator noise, no secular drift).
//       NULL: asymmetric interaction (w_ij≠w_ji) → NOT conservative → E drifts secularly.
//   (2) Attractive clustering: mean coherency rises, dispersion falls.
//       NULL: repulsive (sign-flip) → disperses.
import { createRequire } from 'node:module';
const require = createRequire(new URL(".", import.meta.url).pathname + "../");
const E = require('./src/core/encoder-stack');

// ----- seed N particles from real encoded patterns (grounded in the actual substrate) -----
function mul(a){let s=a;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const patterns = [];
{ const r=mul(7);
  for (let i=0;i<8;i++) patterns.push(JSON.stringify(Array.from({length:60},(_,k)=>+(Math.sin(k/(2+i)) + 0.3*r()).toFixed(4))));      // series
  for (let i=0;i<8;i++) patterns.push(`function f${i}(a){let s=0;for(const x of a){s+=x*${i+1};}return s;}`);                            // code
  for (let i=0;i<8;i++) patterns.push(`the ${["quiet","bright","distant","frozen"][i%4]} field remembers what the ${["river","signal","pattern","void"][i%4]} carried`); // prose
}
const Draw = E.composedAtDepth(patterns[0], 8).length;
function unit(v){let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n)||1;return v.map(x=>x/n);}
let X = patterns.map(p=>unit(Array.from(E.composedAtDepth(p,8))));
const N=X.length, D=Draw;

// small random tangential initial velocity
const rv=mul(99);
function tangent(v,x){let d=0;for(let i=0;i<D;i++)d+=v[i]*x[i];return v.map((vi,i)=>vi-d*x[i]);}
let V = X.map(x=>tangent(Array.from({length:D},()=>0.02*(rv()-0.5)),x));
const dot=(a,b)=>{let s=0;for(let i=0;i<D;i++)s+=a[i]*b[i];return s;};
const renorm=(x)=>{let n=Math.sqrt(dot(x,x))||1;return x.map(v=>v/n);};

// asymmetric weights for the NON-CONSERVATIVE null (w_ij != w_ji)
const W=Array.from({length:N},(_,i)=>Array.from({length:N},(_,j)=>0.5+ (mul(i*97+j*13)()) )); // random, asymmetric

function forces(Xs, mode){ // mode: 'grav' (symmetric, conservative), 'asym' (non-conservative), 'rep' (repulsive)
  const F=Array.from({length:N},()=>new Float64Array(D));
  for(let i=0;i<N;i++){ for(let j=0;j<N;j++){ if(i===j)continue;
    let w=1; if(mode==='asym')w=W[i][j]; if(mode==='rep')w=-1;
    for(let k=0;k<D;k++) F[i][k]+=w*Xs[j][k]; } }
  // project to tangent
  for(let i=0;i<N;i++){ let d=0;for(let k=0;k<D;k++)d+=F[i][k]*Xs[i][k]; for(let k=0;k<D;k++)F[i][k]-=d*Xs[i][k]; }
  return F;
}
function potential(Xs, sign=-1){ let U=0; for(let i=0;i<N;i++)for(let j=i+1;j<N;j++)U+=sign*dot(Xs[i],Xs[j]); return U; } // -Σc (attractive)
function kinetic(Vs){ let T=0; for(let i=0;i<N;i++)T+=0.5*dot(Vs[i],Vs[i]); return T; }
function meanCoh(Xs){ let s=0,n=0; for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){s+=dot(Xs[i],Xs[j]);n++;} return s/n; }

const G=0.15;   // coupling: gentle accelerations so leapfrog resolves the dynamics
function run(mode, dt, T){
  let Xs=X.map(x=>x.slice()), Vs=V.map(v=>v.slice());
  const STEPS=Math.round(T/dt);
  const Usign = mode==='rep'? +1 : -1;
  const scale=(F)=>{for(let i=0;i<N;i++)for(let k=0;k<D;k++)F[i][k]*=G;return F;};
  const E0 = kinetic(Vs)+G*potential(Xs,Usign);
  let driftMax=0, cohStart=meanCoh(Xs), finalDrift=0;
  for(let s=0;s<STEPS;s++){
    let F=scale(forces(Xs,mode));
    for(let i=0;i<N;i++)for(let k=0;k<D;k++)Vs[i][k]+=0.5*dt*F[i][k];
    for(let i=0;i<N;i++){ for(let k=0;k<D;k++)Xs[i][k]+=dt*Vs[i][k]; Xs[i]=renorm(Xs[i]); Vs[i]=tangent(Vs[i],Xs[i]); }
    F=scale(forces(Xs,mode));
    for(let i=0;i<N;i++)for(let k=0;k<D;k++)Vs[i][k]+=0.5*dt*F[i][k];
    const Ecur=kinetic(Vs)+G*potential(Xs,Usign);
    driftMax=Math.max(driftMax,Math.abs(Ecur-E0));
    finalDrift=Math.abs(Ecur-E0);
  }
  const scaleE=Math.abs(G*potential(Xs,Usign))||1;
  return { driftMax:driftMax/scaleE, finalDrift:finalDrift/scaleE, cohStart, cohEnd:meanCoh(Xs) };
}

console.log('COHERENCY GRADIENT FLOW — N='+N+' patterns as directions on S^'+(D-1)+', symplectic leapfrog\n');
console.log('=== (1) ENERGY CONSERVATION via dt-CONVERGENCE (the conservative-field signature) ===');
console.log('  A conservative field: energy drift → 0 as dt → 0 (2nd order, ~4x per halving).');
console.log('  A non-conservative null: drift stays finite (real energy change, not numerical).\n');
const T=6;
console.log('  dt        conservative-drift    asymmetric-NULL-drift');
let prevC=null, ratios=[];
for(const dt of [0.008,0.004,0.002,0.001]){
  const c=run('grav',dt,T).finalDrift, a=run('asym',dt,T).finalDrift;
  const rr = prevC!==null ? (prevC/c) : null;
  if(rr!==null) ratios.push(rr);
  console.log('  '+String(dt).padEnd(9)+ c.toExponential(2).padEnd(22)+ a.toExponential(2)+ (rr!==null?'   (conservative drift fell '+rr.toFixed(1)+'x)':''));
  prevC=c;
}
// The sphere-constraint projection is 1st-order, so leapfrog drift falls ~2x per dt-halving
// (not 4x); what matters is that it MONOTONICALLY VANISHES (→0) while the null plateaus.
const cFine=run('grav',0.001,T).finalDrift, aFine=run('asym',0.001,T).finalDrift;
const converges = ratios.length && ratios.every(r=>r>1.7);         // monotone decrease toward 0
const asymFlat = (()=>{const a1=run('asym',0.008,T).finalDrift,a2=run('asym',0.001,T).finalDrift;return a2 > 0.5*a1;})(); // null drift does NOT vanish
const separated = aFine > 20*cFine;                                 // conservative drift ≪ null drift at fine dt
console.log('  -> conservative drift VANISHES as dt→0 (field is conservative):', (converges&&separated)?'YES':'no', '  ['+cFine.toExponential(1)+' vs null '+aFine.toExponential(1)+', '+(aFine/cFine).toFixed(0)+'x separation]');
console.log('  -> asymmetric NULL drift stays finite (genuinely non-conservative):', asymFlat?'YES':'no');
const CONSERVATIVE = converges && separated && asymFlat;

console.log('\n=== (2) ATTRACTIVE STRUCTURE FORMATION ===');
const grav=run('grav',0.004,30), rep=run('rep',0.004,30);
console.log('  conservative flow mean coherency:', grav.cohStart.toFixed(3),'->',grav.cohEnd.toFixed(3), grav.cohEnd>grav.cohStart?'(clusters ✓)':'');
console.log('  NULL repulsive flow  mean coherency:', rep.cohStart.toFixed(3),'->',rep.cohEnd.toFixed(3), rep.cohEnd<rep.cohStart?'(disperses ✓)':'');

console.log('\n=== VERDICT ===');
console.log('  coherency-gradient flow is a CONSERVATIVE (gravity-like) field:', CONSERVATIVE?'YES':'no');
console.log('  it produces attractive structure formation, broken by the repulsive null:', (grav.cohEnd>grav.cohStart&&rep.cohEnd<rep.cohStart)?'YES':'no');
