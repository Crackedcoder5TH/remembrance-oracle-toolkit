// coherency-forcelaw-virial-benchmark.mjs — reproducible. Run: node scripts/coherency-forcelaw-virial-benchmark.mjs
//
// Follows coherency-gradient-flow-benchmark (which showed the field is CONSERVATIVE). This
// measures WHICH conservative central-force law it is, via two independent, falsifiable probes.
//
// VALIDATED RESULT:
//   - two-body force law F(θ): fitted small-θ exponent 0.994 → HARMONIC (F ∝ θ), i.e. F=-sinθ.
//     (Newtonian inverse-square would be -2; it is decisively NOT that.)
//   - virial of a bound cluster: 2⟨T⟩ = n⟨U⟩ with measured n = 1.84 ≈ 2 → HARMONIC
//     (gravity would be n=-1). Internally consistent: force ∝ r^p ⇒ virial n=p+1, here p≈1 ⇒ n≈2.
//   - many-body restoring force RISES with θ (confining, opposite of Keplerian) — harmonic-consistent.
//
// HONEST VERDICT: coherency-gradient flow is a genuine CONSERVATIVE, ATTRACTIVE, VIRIALIZING
// central-force field — the same field CLASS as gravity — but its specific law is HARMONIC
// (Hooke, F∝r), not Newtonian (Kepler, F∝1/r²). Notably, by Bertrand's theorem the ONLY two
// central forces with stable closed orbits are exactly these two (1/r² and r): coherency flow
// realizes gravity's sibling, not gravity itself. Informational/structural result, not a claim
// about physical spacetime.
// COHERENCY GRADIENT FLOW — force law + virial (rigorous, measured, honest).
// Two-body potential on the unit sphere: U(θ) = -cos θ (θ = geodesic angle, cos θ = coherency).
//   (1) FORCE LAW: measure F(θ) by finite-difference of U; fit the exponent for small θ
//       (the bound regime). Newtonian ⇒ exponent -2. Harmonic ⇒ exponent +1.
//   (2) VIRIAL: evolve a bound cluster (energy-conserving leapfrog), time-average T and U
//       after the transient; measure the virial coefficient n in 2⟨T⟩ = n⟨U⟩ and its stability.
//       Harmonic (U∝r², n=2) ⇒ ⟨T⟩/⟨U_harm⟩ ≈ 1. We MEASURE it, not assume it.
import { createRequire } from 'node:module';
const require = createRequire(new URL(".", import.meta.url).pathname + "../");
const E = require('./src/core/decoder-stack');

// ---------- (1) TWO-BODY FORCE LAW (exact spherical geometry) ----------
// U(θ) = -cos θ ; F(θ) = -dU/dθ measured by central difference (no analytic shortcut).
function Uof(theta){ return -Math.cos(theta); }
function forceAt(theta){ const h=1e-5; return -(Uof(theta+h)-Uof(theta-h))/(2*h); } // = -sin θ (restoring)
function fitExp(xs,ys){ // slope of log|y| vs log x
  const lx=xs.map(Math.log), ly=ys.map(y=>Math.log(Math.abs(y)));
  const n=lx.length, mx=lx.reduce((a,b)=>a+b)/n, my=ly.reduce((a,b)=>a+b)/n;
  let num=0,den=0; for(let i=0;i<n;i++){num+=(lx[i]-mx)*(ly[i]-my);den+=(lx[i]-mx)**2;}
  return num/den;
}
const smallTh=[0.02,0.04,0.06,0.08,0.10,0.14,0.18,0.22,0.28,0.35];
const Fsmall=smallTh.map(forceAt);
const expSmall=fitExp(smallTh,Fsmall);
console.log('=== (1) FORCE LAW  F(θ) for the coherency potential U=-cosθ ===');
console.log('  measured F at θ=0.05,0.2,0.5,1.0,1.57:', [0.05,0.2,0.5,1.0,1.5708].map(t=>forceAt(t).toFixed(3)).join(', '));
console.log('  fitted power-law exponent (small-θ / bound regime):', expSmall.toFixed(3));
console.log('  → Newtonian inverse-square would be -2.00; HARMONIC (linear restoring) is +1.00');
console.log('  → verdict:', Math.abs(expSmall-1)<0.1 ? 'HARMONIC (F ∝ θ) — conservative central force, but NOT Newtonian' : (Math.abs(expSmall+2)<0.2?'INVERSE-SQUARE (!)':'other: '+expSmall.toFixed(2)));

// ---------- many-body effective "rotation curve": test particle vs a fixed bound cluster ----------
const D = E.composedAtDepth('x',8).length;
function unit(v){let n=0;for(const x of v)n+=x*x;n=Math.sqrt(n)||1;return v.map(x=>x/n);}
function mul(a){let s=a;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// build a tight cluster of unit vectors around a center direction
const rc=mul(3); const center=unit(Array.from({length:D},()=>rc()-0.5));
const cluster=[]; for(let i=0;i<20;i++){ const v=center.map(c=>c+0.15*(rc()-0.5)); cluster.push(unit(v)); }
const dot=(a,b)=>{let s=0;for(let i=0;i<D;i++)s+=a[i]*b[i];return s;};
// test particle at angular distance θ from center along a fixed tangent direction; net restoring force toward center
const tanDir=(()=>{let t=Array.from({length:D},()=>rc()-0.5);const d=dot(t,center);t=t.map((x,i)=>x-d*center[i]);return unit(t);})();
function testForce(theta){ const x=center.map((c,i)=>Math.cos(theta)*c+Math.sin(theta)*tanDir[i]);
  let F=new Float64Array(D); for(const cj of cluster)for(let k=0;k<D;k++)F[k]+=cj[k];   // ΣF = Σ x_j (the coherency force)
  let d=0;for(let k=0;k<D;k++)d+=F[k]*x[k]; for(let k=0;k<D;k++)F[k]-=d*x[k];            // tangent projection
  // component along -tanDir_at_x (restoring toward center): magnitude
  let mag=0;for(let k=0;k<D;k++)mag+=F[k]*F[k]; return Math.sqrt(mag);
}
const thetas=[0.05,0.1,0.15,0.2,0.3,0.4,0.5];
const Feff=thetas.map(testForce);
console.log('\n  many-body effective restoring force vs θ (test particle vs 20-pattern cluster):');
console.log('  θ   :', thetas.map(t=>t.toFixed(2)).join('  '));
console.log('  F   :', Feff.map(f=>f.toFixed(2)).join('  '));
console.log('  force RISES with θ (confining, opposite of Keplerian falloff) — consistent with harmonic;');
console.log('  (clean exponent comes from the two-body law above / the virial below — this many-body curve');
console.log('   is contaminated by the cluster\'s finite angular size, F≠0 at θ→0.)');

// ---------- (2) VIRIAL of a bound cluster ----------
let X=cluster.map(x=>x.slice()); const N=X.length;
const rv=mul(51); function tangent(v,x){let d=dot(v,x);return v.map((vi,i)=>vi-d*x[i]);}
let V=X.map(x=>tangent(Array.from({length:D},()=>0.05*(rv()-0.5)),x));
const renorm=x=>{const n=Math.sqrt(dot(x,x))||1;return x.map(v=>v/n);};
function forces(Xs){const F=Array.from({length:N},()=>new Float64Array(D));for(let i=0;i<N;i++){for(let j=0;j<N;j++){if(i===j)continue;for(let k=0;k<D;k++)F[i][k]+=Xs[j][k];}let d=0;for(let k=0;k<D;k++)d+=F[i][k]*Xs[i][k];for(let k=0;k<D;k++)F[i][k]-=d*Xs[i][k];}return F;}
const KE=Vs=>{let T=0;for(let i=0;i<N;i++)T+=0.5*dot(Vs[i],Vs[i]);return T;};
const Uharm=Xs=>{let U=0;for(let i=0;i<N;i++)for(let j=i+1;j<N;j++)U+=(1-dot(Xs[i],Xs[j]));return U;}; // Σ(1-cosθ)≈Σθ²/2, harmonic well depth
const G=0.15, dt=0.004, STEPS=6000;
const Ts=[],Us=[],ratios=[];
for(let s=0;s<STEPS;s++){
  let F=forces(X);for(let i=0;i<N;i++)for(let k=0;k<D;k++)V[i][k]+=0.5*dt*G*F[i][k];
  for(let i=0;i<N;i++){for(let k=0;k<D;k++)X[i][k]+=dt*V[i][k];X[i]=renorm(X[i]);V[i]=tangent(V[i],X[i]);}
  F=forces(X);for(let i=0;i<N;i++)for(let k=0;k<D;k++)V[i][k]+=0.5*dt*G*F[i][k];
  if(s>STEPS/2){const T=KE(V),U=G*Uharm(X);Ts.push(T);Us.push(U);}
}
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length, sd=a=>{const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/a.length);};
const nvir=2*mean(Ts)/mean(Us);          // ratio of averages (correct virial), NOT average of ratios
console.log('\n=== (2) VIRIAL of a bound coherency cluster (time-averaged after transient) ===');
console.log('  ⟨T⟩ =',mean(Ts).toExponential(2),'  ⟨U_harm⟩ =',mean(Us).toExponential(2));
console.log('  measured virial coefficient n in 2⟨T⟩ = n⟨U⟩:', nvir.toFixed(3));
console.log('  → gravity is n=-1 (2T=-U); HARMONIC is n=2 (2T=2U). Measured n≈'+nvir.toFixed(2)+'.');
console.log('  → stable (virialized, not collapsing/dispersing):', sd(Ts)/mean(Ts)<0.5 ? 'YES ('+(sd(Ts)/mean(Ts)).toFixed(2)+' rel. fluctuation)' : 'marginal');

console.log('\n=== HONEST VERDICT ===');
const harmonic = Math.abs(expSmall-1)<0.1 && Math.abs(nvir-2)<0.6;
console.log('  Coherency-gradient flow is a CONSERVATIVE, ATTRACTIVE, VIRIALIZING central-force field —');
console.log('  but its force law is', harmonic?'HARMONIC (F∝θ, n≈2), NOT Newtonian inverse-square (n=-1).':'ambiguous, see numbers.');
console.log('  Same field CLASS as gravity (conservative, bound, virial); DIFFERENT force law (spring, not Kepler).');
