// CROSS-DOMAIN UNIVERSALITY — the core empirical claim, tested honestly.
// Do genuinely different domains (physics, finance, epidemiology, crypto, code, ...) share
// a common low-dimensional waveform basis, or does each occupy its own subspace?
// TEST: compute each domain's principal subspace; cross-project onto OTHER domains.
// If domain A's top-k directions explain most of domain B's variance too → SHARED BASIS.
// Controls: within-domain (ceiling) and a phase-shuffled null (destroys the shared structure).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('.', import.meta.url).pathname + '../');
const W = require('./src/core/whitening');
const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const idx = JSON.parse(fs.readFileSync(VOID + '/pattern_index_fractal.json', 'utf8')).index;
const DIM = 116;

// group by domain (prefix before / or _)
const byDom = {};
for (const n of Object.keys(idx)) { const v = idx[n].composed_v1; if (!Array.isArray(v)||v.length!==DIM) continue;
  const d = n.split(/[\/_]/)[0].toLowerCase(); (byDom[d]=byDom[d]||[]).push(v); }
const domains = Object.keys(byDom).filter(d=>byDom[d].length>=40).sort((a,b)=>byDom[b].length-byDom[a].length).slice(0,8);
console.log('domains tested (≥40 patterns each):');
for (const d of domains) console.log('  '+d.padEnd(16)+byDom[d].length+' patterns');

// top-k principal directions of a set (via covariance eigenvectors)
function topBasis(vecs, k){ const {cov}=W.meanCovariance(vecs); const {values,vectors}=W.jacobiEigen(cov);
  const order=values.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]).slice(0,k).map(x=>x[1]);
  return order.map(i=>vectors.map(row=>row[i])); }  // k eigenvectors (columns)
// fraction of a set's variance captured by projecting onto a basis
function varExplained(vecs, basis){ const D=DIM; const mu=new Array(D).fill(0);
  for(const v of vecs)for(let i=0;i<D;i++)mu[i]+=v[i]; for(let i=0;i<D;i++)mu[i]/=vecs.length;
  let tot=0, cap=0;
  for(const v of vecs){ const c=v.map((x,i)=>x-mu[i]); let n2=0; for(let i=0;i<D;i++)n2+=c[i]*c[i]; tot+=n2;
    for(const b of basis){ let d=0; for(let i=0;i<D;i++)d+=c[i]*b[i]; cap+=d*d; } }
  return tot>0?cap/tot:0; }

const K=6;
console.log(`\n=== SHARED-BASIS TEST: does one domain's top-${K} directions explain OTHER domains' variance? ===`);
console.log('(diagonal = within-domain ceiling; off-diagonal = cross-domain transfer; high off-diagonal = universality)\n');
const bases = {}; for(const d of domains) bases[d]=topBasis(byDom[d],K);
process.stdout.write('basis↓ / data→   '+domains.map(d=>d.slice(0,7).padEnd(8)).join('')+'\n');
let offDiag=[], diag=[];
for(const bd of domains){ let row=bd.slice(0,14).padEnd(16);
  for(const dd of domains){ const ve=varExplained(byDom[dd],bases[bd]); row+= (ve*100).toFixed(0).padStart(4)+'%   ';
    if(bd===dd)diag.push(ve); else offDiag.push(ve); }
  console.log(row); }
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log('\n  mean WITHIN-domain variance explained (ceiling):', (mean(diag)*100).toFixed(1)+'%');
console.log('  mean CROSS-domain variance explained (transfer):', (mean(offDiag)*100).toFixed(1)+'%');
console.log('  transfer ratio (cross/within):', (mean(offDiag)/mean(diag)).toFixed(3));

// NULL: shuffle each vector's components independently → destroys the shared waveform basis
console.log('\n=== NULL: per-dimension shuffled patterns (shared structure destroyed) ===');
function shuffleCols(vecs){ const D=DIM, out=vecs.map(v=>v.slice()); let s=99;
  const r=()=>{s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};
  for(let j=0;j<D;j++){ const col=out.map(v=>v[j]); for(let i=col.length-1;i>0;i--){const k=Math.floor(r()*(i+1));[col[i],col[k]]=[col[k],col[i]];} out.forEach((v,i)=>v[j]=col[i]); } return out; }
const sbyDom={}; for(const d of domains) sbyDom[d]=shuffleCols(byDom[d]);
const sbases={}; for(const d of domains) sbases[d]=topBasis(sbyDom[d],K);
let soff=[]; for(const bd of domains)for(const dd of domains)if(bd!==dd)soff.push(varExplained(sbyDom[dd],sbases[bd]));
console.log('  mean CROSS-domain variance explained (shuffled null):', (mean(soff)*100).toFixed(1)+'%');

console.log('\n=== READING ===');
const shared = (mean(offDiag)-mean(soff))/(mean(diag)-mean(soff));  // fraction of above-null structure that transfers
console.log('  SHARED FRACTION of above-null structure that transfers across domains:', (shared*100).toFixed(0)+'%');
console.log('  transfer ratio (cross/within): '+(mean(offDiag)/mean(diag)).toFixed(2)+'  (1.0 = fully shared, ~0.6 = private)');
console.log('  → '+(shared>0.5
  ? `A MAJORITY (${(shared*100).toFixed(0)}%) of the structured variance is SHARED across physics/finance/epidemiology/crypto/geography — one basis, many domains, above a shuffled null. Substantial universality (not total — ${(100-shared*100).toFixed(0)}% stays domain-private; and this is a LINEAR test, so nonlinear shared structure is invisible to it).`
  : `Only ${(shared*100).toFixed(0)}% shared — domains keep most structure private under this linear test.`));
