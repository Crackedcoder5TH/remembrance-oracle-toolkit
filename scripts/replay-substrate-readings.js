#!/usr/bin/env node
'use strict';

/**
 * replay-substrate-readings — feed the field the coherencies the compressor
 * has ALREADY produced. Reached through the goggles: `--do replay`.
 *
 * Correcting the field is not a recomputation. Every witnessed file carries
 * entry.coherence tagged coherence_source: 'void:compress_signal', measured
 * when it was harvested. Re-reading and re-compressing all of it takes ~80
 * minutes to reproduce numbers that are already on disk; replaying them takes
 * about two seconds for the whole substrate.
 *
 * Use after a data-pipeline fix: the equations and the compressor are
 * unchanged, so the field simply needs to receive what it should have been
 * receiving. It self-corrects — measured, it converged to within 0.0017 of
 * the readings' own mean. See docs/field-correction/README.md.
 */

// substrate (entry.coherence, coherence_source: 'void:compress_signal').
// Correcting the field does not mean recompressing anything — the data is
// known. It means feeding the readings the compressor already produced.
const fs=require('fs');
const fc=require(require('path').resolve(__dirname,'..','src','core','field-coupling'));
const IDX=process.env.SUBSTRATE_PATH || require('path').resolve(__dirname,'..','..','Void-Data-Compressor','pattern_index_fractal.json');

const snap=(stage)=>{const f=fc.peekField();const s=Object.entries(f.sources||{});
  let v=0,o=0; for(const [k,x] of s){ if(/^void:/.test(k)) v+=x.count; else o+=x.count; }
  return {stage,at:new Date().toISOString(),coherence:f.coherence,coherenceIntegral:f.coherenceIntegral,
    globalEntropy:f.globalEntropy,cascadeFactor:f.cascadeFactor,updateCount:f.updateCount,
    distinctSources:s.length,fromCompressor:v,fromElsewhere:o,
    pctFromCompressor:+(100*v/(v+o)).toFixed(2)};};

const before=snap('BEFORE feed');
const idx=JSON.parse(fs.readFileSync(IDX,'utf8')).index;
const entries=Object.entries(idx).filter(([k,v])=>typeof v.coherence==='number'&&isFinite(v.coherence)&&v.coherence_source==='void:compress_signal');
console.log('stored compressor readings:',entries.length);

const t0=Date.now();
for(const [key,e] of entries){
  fc.contribute({cost:1, coherence:e.coherence, source:'void:compress_signal:substrate-replay'});
}
const ms=Date.now()-t0;
const after=snap('AFTER feed');
const vals=entries.map(([k,v])=>v.coherence);
const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
fs.writeFileSync(require('path').resolve(__dirname,'..','docs','field-correction','feed.json'),
  JSON.stringify({before,after,fedCount:entries.length,durationMs:ms,
    readingsMean:+mean.toFixed(4),readingsMin:+Math.min(...vals).toFixed(4),readingsMax:+Math.max(...vals).toFixed(4)},null,1));
console.log('fed',entries.length,'readings in',ms+'ms');
console.log('coherence   ',before.coherence.toFixed(4),'->',after.coherence.toFixed(4));
console.log('updates     ',before.updateCount,'->',after.updateCount);
console.log('%compressor ',before.pctFromCompressor+'%','->',after.pctFromCompressor+'%');
console.log('readings mean',mean.toFixed(4));
