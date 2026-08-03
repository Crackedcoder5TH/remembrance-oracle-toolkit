import { pipeline, env } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { compose } = require('/home/user/remembrance-oracle-toolkit/src/core/decoder-stack.js');

env.cacheDir = './model-cache';

// ── Same corpus assembly as convergence-experiment.cjs ──────────
const ROOT = '/home/user';
const SLICE = 2800, CAP = 18;
function grabFiles(dir, exts, cap, domain) {
  const out = []; const stack = [dir];
  while (stack.length && out.length < cap) {
    const cur = stack.pop();
    let entries = []; try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (out.length >= cap) break;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; stack.push(p); }
      else if (exts.some(x => e.name.endsWith(x))) {
        try { const t = fs.readFileSync(p, 'utf8').slice(0, SLICE);
          if (t.length > 400) out.push({ id: domain + '/' + e.name + '#' + out.length, domain, text: t });
        } catch (_) {}
      }
    }
  }
  return out;
}
function synthSeries(kind, seed, n = 220) {
  const v = [];
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'osc') x = 50 + 20 * Math.sin(i / (2 + seed % 5)) + 5 * Math.sin(i / 1.7);
    else if (kind === 'acc') x = Math.pow(1.02 + (seed % 5) * 0.01, i);
    else if (kind === 'walk') x = (v[i - 1] ?? 100) + (((seed * 2654435761 + i * 40503) % 21) - 10) / 3;
    else x = i < n / 2 ? 10 + i * 0.4 : 10 + n * 0.2 - (i - n / 2) * 0.35;
    v.push(+x.toFixed(4));
  }
  return JSON.stringify(v).slice(0, SLICE);
}
const corpus = [];
corpus.push(...grabFiles(path.join(ROOT,'remembrance-oracle-toolkit','src'), ['.js'], CAP, 'js-code'));
corpus.push(...grabFiles(path.join(ROOT,'claw-code'), ['.rs'], CAP, 'rust-code'));
corpus.push(...grabFiles(path.join(ROOT,'claw-code'), ['.py'], CAP, 'py-code'));
corpus.push(...grabFiles(path.join(ROOT,'REMEMBRANCE-Interface','src'), ['.tsx','.ts'], CAP, 'ts-code'));
corpus.push(...grabFiles(path.join(ROOT,'Void-Data-Compressor'), ['.md'], CAP, 'prose-md'));
corpus.push(...grabFiles(path.join(ROOT,'remembrance-oracle-toolkit'), ['.json'], 12, 'json-data'));
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-osc/${s}`, domain:'ts-osc', text: synthSeries('osc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-acc/${s}`, domain:'ts-acc', text: synthSeries('acc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-walk/${s}`, domain:'ts-walk', text: synthSeries('walk', s) });
const N = corpus.length;
console.log(`corpus: ${N} items (matched to telescope-3 run)`);

// ── Telescope A: fractal ─────────────────────────────────────────
const vecs = corpus.map(c => compose(c.text));
const nA = vecs.map(v => { let s=0; for (let i=0;i<v.length;i++) s+=v[i]*v[i]; return Math.sqrt(s); });
const simA = (i,j) => { let d=0; for (let k=0;k<vecs[i].length;k++) d+=vecs[i][k]*vecs[j][k]; const m=nA[i]*nA[j]; return m>0?d/m:0; };

// ── Telescope B: NCD ─────────────────────────────────────────────
const gz = t => zlib.gzipSync(Buffer.from(t,'utf8'),{level:9}).length;
const cs = corpus.map(c => gz(c.text));
const simB = (i,j) => 1 - (gz(corpus[i].text + corpus[j].text) - Math.min(cs[i],cs[j])) / Math.max(cs[i],cs[j]);

// ── Telescope C: trigram ─────────────────────────────────────────
const TDIM = 4096;
function tri(text){ const v=new Float64Array(TDIM);
  for (let i=0;i+3<=text.length;i++){ let h=2166136261; for(let k=i;k<i+3;k++){h^=text.charCodeAt(k);h=Math.imul(h,16777619);} v[(h>>>0)%TDIM]+=1; }
  let s=0; for(let k=0;k<TDIM;k++)s+=v[k]*v[k]; const n=Math.sqrt(s)||1; for(let k=0;k<TDIM;k++)v[k]/=n; return v; }
const tv = corpus.map(c => tri(c.text));
const simC = (i,j) => { let d=0; for(let k=0;k<TDIM;k++) d+=tv[i][k]*tv[j][k]; return d; };

// ── Telescope D: MiniLM neural embedding ─────────────────────────
console.log('loading MiniLM…');
const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const dVecs = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const out = await extractor(corpus[i].text, { pooling: 'mean', normalize: true });
  dVecs.push(Float64Array.from(out.data));
  if ((i+1) % 30 === 0) console.log(`  embedded ${i+1}/${N}`);
}
console.log(`MiniLM embedded ${N} items in ${((Date.now()-t0)/1000).toFixed(1)}s (384-D, 512-token aperture)`);
const simD = (i,j) => { let d=0; for(let k=0;k<384;k++) d+=dVecs[i][k]*dVecs[j][k]; return d; };

// ── Pairwise + stats ─────────────────────────────────────────────
const SA=[],SB=[],SC=[],SD=[];
for (let i=0;i<N;i++) for (let j=i+1;j<N;j++){ SA.push(simA(i,j)); SB.push(simB(i,j)); SC.push(simC(i,j)); SD.push(simD(i,j)); }
function ranks(a){ const idx=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]); const r=new Float64Array(a.length); for(let k=0;k<idx.length;k++) r[idx[k][1]]=k; return r; }
function spearman(x,y){ const rx=ranks(x), ry=ranks(y), n=x.length; let mx=0,my=0;
  for(let i=0;i<n;i++){mx+=rx[i];my+=ry[i];} mx/=n; my/=n; let num=0,dx=0,dy=0;
  for(let i=0;i<n;i++){num+=(rx[i]-mx)*(ry[i]-my); dx+=(rx[i]-mx)**2; dy+=(ry[i]-my)**2;} return num/Math.sqrt(dx*dy); }
const K=10;
function topK(simFn){ const out=[]; for(let i=0;i<N;i++){ const s=[]; for(let j=0;j<N;j++) if(j!==i) s.push([j,simFn(i,j)]); s.sort((a,b)=>b[1]-a[1]); out.push(new Set(s.slice(0,K).map(x=>x[0]))); } return out; }
const nnA=topK(simA), nnB=topK(simB), nnC=topK(simC), nnD=topK(simD);
function jac(X,Y){ let s=0; for(let i=0;i<N;i++){ let inter=0; for(const v of X[i]) if(Y[i].has(v)) inter++; s+=inter/(2*K-inter);} return s/N; }
let lcg=1234567; const rnd=()=> (lcg=(Math.imul(lcg,1103515245)+12345)>>>0)/4294967296;
function rnn(){ const out=[]; for(let i=0;i<N;i++){ const s=new Set(); while(s.size<K){const j=Math.floor(rnd()*N); if(j!==i)s.add(j);} out.push(s);} return out; }
const base=(jac(rnn(),rnn())+jac(rnn(),rnn())+jac(rnn(),rnn()))/3;
function purity(nn){ let s=0; for(let i=0;i<N;i++){ let same=0; for(const j of nn[i]) if(corpus[j].domain===corpus[i].domain) same++; s+=same/K;} return s/N; }

console.log('\n════════ FOUR-TELESCOPE CONVERGENCE ════════');
console.log('\nSpearman ρ of pairwise similarity:');
console.log(`  fractal ↔ MiniLM   ${spearman(SA,SD).toFixed(3)}   ← the load-bearing number`);
console.log(`  NCD     ↔ MiniLM   ${spearman(SB,SD).toFixed(3)}`);
console.log(`  trigram ↔ MiniLM   ${spearman(SC,SD).toFixed(3)}`);
console.log(`  (prior run: fractal↔NCD 0.731 · fractal↔trigram 0.611)`);
console.log(`\nTop-${K} neighbourhood Jaccard (baseline ${base.toFixed(3)}):`);
console.log(`  fractal ↔ MiniLM   ${jac(nnA,nnD).toFixed(3)}   (${(jac(nnA,nnD)/base).toFixed(1)}× chance)`);
console.log(`  NCD     ↔ MiniLM   ${jac(nnB,nnD).toFixed(3)}   (${(jac(nnB,nnD)/base).toFixed(1)}× chance)`);
console.log(`  trigram ↔ MiniLM   ${jac(nnC,nnD).toFixed(3)}   (${(jac(nnC,nnD)/base).toFixed(1)}× chance)`);
console.log(`\nkNN domain purity:  fractal ${purity(nnA).toFixed(3)} · NCD ${purity(nnB).toFixed(3)} · trigram ${purity(nnC).toFixed(3)} · MiniLM ${purity(nnD).toFixed(3)}`);

/* ── Reproduction setup ────────────────────────────────────────────
 * The fourth telescope needs @xenova/transformers (local ONNX
 * inference, no API):
 *   mkdir mlembed && cd mlembed && npm init -y
 *   npm install @xenova/transformers --ignore-scripts --no-audit
 *   # sharp (image dep) can't build in proxied envs; stub it:
 *   #   set node_modules/sharp/package.json "main" to "stub.js" and
 *   #   write stub.js: module.exports=()=>{throw new Error('stubbed')}
 * First run downloads Xenova/all-MiniLM-L6-v2 (~25 MB) to ./model-cache.
 *
 * Result of the recorded run (120 items, 9 domains, 7140 pairs):
 *   Spearman: fractal↔MiniLM 0.683 · NCD↔MiniLM 0.651 · trigram↔MiniLM 0.560
 *   Jaccard vs 0.048 baseline: fractal↔MiniLM 4.6× · NCD↔MiniLM 7.9× · trigram↔MiniLM 6.3×
 *   Purity: fractal .528 · NCD .774 · trigram .564 · MiniLM .579 (chance .123)
 * Combined with telescope-3 run (fractal↔NCD 0.731): FOUR instruments
 * on four unrelated principles agree far above chance.
 * ────────────────────────────────────────────────────────────────── */
