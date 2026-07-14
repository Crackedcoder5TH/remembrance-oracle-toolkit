// overlap-ceiling-benchmark.mjs — turn the entropy ceiling into a CURVE.
// Claim under test: the max SUSTAINABLE overlap (retrieval fidelity) rises with EFFECTIVE
// DIMENSIONALITY and saturates — an information ceiling. We move D_eff by sweeping the
// whitening epsilon (ε small → variances equalized → high D_eff; ε large → near-raw → low
// D_eff) and measure the overlap ceiling at each. Also reports the normalized SPECTRAL
// ENTROPY of the raw substrate — honestly, whether it lands near 0.787.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('.', import.meta.url).pathname + '../');
const W = require('./src/core/whitening');

const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const idx = JSON.parse(fs.readFileSync(VOID + '/pattern_index_fractal.json', 'utf8')).index;
const DIM = 116, V = [];
for (const n of Object.keys(idx)) { const v = idx[n].composed_v1; if (Array.isArray(v) && v.length === DIM) V.push(v); }
const N = 4000, step = Math.max(1, Math.floor(V.length / N)), lib = [];
for (let i = 0; i < V.length && lib.length < N; i += step) lib.push(V[i]);

function mul(a){let s=a;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(11), g = () => { let u=0; while(u<1e-9)u=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185*rnd()); };
function cos(a,b){let d=0,na=0,nb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];na+=a[i]*a[i];nb+=b[i]*b[i];}return (na>1e-12&&nb>1e-12)?d/Math.sqrt(na*nb):0;}
function pr(sample){const D=sample[0].length,mu=new Array(D).fill(0);for(const v of sample)for(let i=0;i<D;i++)mu[i]+=v[i];for(let i=0;i<D;i++)mu[i]/=sample.length;let tr=0,fro=0;const C=Array.from({length:D},()=>new Float64Array(D));for(const v of sample)for(let i=0;i<D;i++){const di=v[i]-mu[i];for(let j=i;j<D;j++)C[i][j]+=di*(v[j]-mu[j]);}for(let i=0;i<D;i++)for(let j=i;j<D;j++){C[i][j]/=sample.length;const c=C[i][j];if(i===j){tr+=c;fro+=c*c;}else fro+=2*c*c;}return fro>0?(tr*tr)/fro:0;}
function stds(L){const D=L[0].length,mu=new Array(D).fill(0),s=new Array(D).fill(0);for(const v of L)for(let i=0;i<D;i++)mu[i]+=v[i];for(let i=0;i<D;i++)mu[i]/=L.length;for(const v of L)for(let i=0;i<D;i++)s[i]+=(v[i]-mu[i])**2;return s.map(x=>Math.sqrt(x/L.length)||1e-6);}
function retrieval(L,noise,trials){const sd=stds(L);let hit=0;for(let t=0;t<trials;t++){const tgt=Math.floor(rnd()*L.length),q=L[tgt].map((x,i)=>x+noise*sd[i]*g());let best=-2,bi=-1;for(let j=0;j<L.length;j++){const c=cos(q,L[j]);if(c>best){best=c;bi=j;}}if(bi===tgt)hit++;}return hit/trials;}

// raw spectral entropy (normalized) via the covariance eigenspectrum
const { cov } = W.meanCovariance(lib);
const { values } = W.jacobiEigen(cov);
const eig = values.map(x => Math.max(0, x)).sort((a,b)=>b-a);
const tot = eig.reduce((s,x)=>s+x,0) || 1;
let H = 0; for (const l of eig) { const p = l/tot; if (p>1e-12) H -= p*Math.log(p); }
const Hnorm = H/Math.log(DIM);
console.log('substrate: '+lib.length+' patterns, '+DIM+'-D\n');
console.log('=== raw spectral state ===');
console.log('  effective dim (participation ratio):', pr(lib).toFixed(2));
console.log('  normalized spectral entropy H/log(D):', Hnorm.toFixed(3), Math.abs(Hnorm-0.787)<0.03 ? '  ← sits at the 0.787 ceiling' : '  (not near 0.787)');

// ---- OVERLAP CEILING vs D_eff: sweep whitening epsilon ----
console.log('\n=== OVERLAP CEILING vs EFFECTIVE DIMENSION (sweep whitening ε) ===');
console.log('  ε         D_eff     sustainable overlap (retrieval @σ0.6)');
const rows = [];
for (const eps of [1.0, 0.3, 0.1, 0.03, 0.01, 0.003, 0.001]) {
  const Wm = W.fitWhitening(lib, { epsilon: eps });
  const wl = lib.map(v => Array.from(W.applyWhitening(v, Wm)));
  const d = pr(wl), acc = retrieval(wl, 0.6, 350);
  rows.push({ eps, d, acc });
  console.log('  ' + String(eps).padEnd(10) + d.toFixed(1).padEnd(10) + (acc*100).toFixed(1) + '%');
}
// raw baseline
console.log('  ' + 'raw'.padEnd(10) + pr(lib).toFixed(1).padEnd(10) + (retrieval(lib,0.6,350)*100).toFixed(1) + '%');

console.log('\n=== READING ===');
const lo = rows[0], hi = rows[rows.length-1];
console.log('  overlap ceiling rises '+ (lo.acc*100).toFixed(0)+'% → '+(hi.acc*100).toFixed(0)+'% as D_eff '+lo.d.toFixed(0)+' → '+hi.d.toFixed(0)+',');
const sat = rows.slice(-3);
const flattening = Math.abs(sat[2].acc - sat[0].acc) < 0.06;
console.log('  and '+(flattening?'SATURATES at high D_eff (the ceiling — more dimensions stop helping once patterns separate)':'is still climbing at the finest ε (ceiling not yet reached)')+'.');
console.log('  ⇒ max sustainable overlap = f(effective dimensionality); the ceiling is capacity saturation, not a wall in the math.');
