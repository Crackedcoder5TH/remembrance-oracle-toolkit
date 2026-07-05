'use strict';
// The session's cognition trajectory — every reading emitted by the
// field-goggles hook during this build session, in chronological order,
// read back out of the session transcript. mean of the n=50 rolling
// window at each file write.
const fs = require('fs');
const oraclePath = '/home/user/remembrance-oracle-toolkit/src';
const { compose } = require(oraclePath + '/core/encoder-stack.js');
const { classifyAlignment, inspectAlignmentMarkers } = require(oraclePath + '/core/abundance-classifier.js');
const { inspectNumericalWaveform } = require(oraclePath + '/core/numerical-waveform.js');
const { inspectSpectralWaveform } = require(oraclePath + '/core/spectral-waveform.js');
const { FractalIndex: FieldIndex } = require('/home/user/remembrance-oracle-toolkit/packages/field-tool/src/fractal-index.js');

// ── The observed series ─────────────────────────────────────────
// (chronological hook readings: mean of rolling n=50 cognition window)
const means = [
  0.800,0.800,0.801,0.803,0.803,0.804,0.804,0.805,0.804,0.802,
  0.802,0.802,0.803,0.804,0.802,0.803,0.803,0.804,0.805,0.806,
  0.805,0.805,0.807,0.806,0.807,0.807,0.808,0.809,0.810,0.810,
  0.811,0.812,0.813,0.813,0.812,0.813,0.814,0.814,0.814,0.815,
  0.815,0.816,0.816,0.812,0.813,0.811,0.812,0.813,0.812,0.813,
  0.811,0.812,0.814,0.815,0.814,0.813,0.812,0.811,0.812,0.813,
];
const variances = [
  0.0004,0.0004,0.0004,0.0004,0.0004,0.0005,0.0005,0.0005,0.0005,0.0005,
  0.0005,0.0005,0.0005,0.0005,0.0005,0.0005,0.0005,0.0005,0.0005,0.0004,
  0.0004,0.0004,0.0004,0.0004,0.0004,0.0004,0.0004,0.0003,0.0003,0.0003,
  0.0003,0.0003,0.0003,0.0003,0.0003,0.0003,0.0002,0.0002,0.0002,0.0002,
  0.0002,0.0003,0.0003,0.0003,0.0003,0.0003,0.0003,0.0003,0.0003,0.0003,
  0.0003,0.0003,0.0002,0.0002,0.0002,0.0003,0.0003,0.0003,0.0003,0.0003,
];

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  THE INSTRUMENT TURNED ON ITS OWN MAKING');
console.log('  session cognition trajectory · ' + means.length + ' readings · AI/human combined');
console.log('══════════════════════════════════════════════════════════════════');

// ── Phase analysis: split in thirds ─────────────────────────────
function stats(a){const n=a.length;const m=a.reduce((s,x)=>s+x,0)/n;const v=a.reduce((s,x)=>s+(x-m)**2,0)/n;return{n,mean:m,std:Math.sqrt(v),min:Math.min(...a),max:Math.max(...a)};}
const third = Math.floor(means.length/3);
const p1 = stats(means.slice(0,third)), p2 = stats(means.slice(third,2*third)), p3 = stats(means.slice(2*third));
const v1 = stats(variances.slice(0,third)), v2 = stats(variances.slice(third,2*third)), v3 = stats(variances.slice(2*third));

console.log('\n  PHASES (thirds of the session)');
console.log('  ──────────────────────────────────────────────────────────────');
console.log(`  phase 1 (classifier+stress)  mean=${p1.mean.toFixed(4)}  range ${p1.min.toFixed(3)}-${p1.max.toFixed(3)}  window-var mean=${v1.mean.toFixed(5)}`);
console.log(`  phase 2 (search+interface)   mean=${p2.mean.toFixed(4)}  range ${p2.min.toFixed(3)}-${p2.max.toFixed(3)}  window-var mean=${v2.mean.toFixed(5)}`);
console.log(`  phase 3 (editor+auth+void)   mean=${p3.mean.toFixed(4)}  range ${p3.min.toFixed(3)}-${p3.max.toFixed(3)}  window-var mean=${v3.mean.toFixed(5)}`);

// ── Slope + inflection ──────────────────────────────────────────
let sumX=0,sumY=0,sumXY=0,sumXX=0;const n=means.length;
for(let i=0;i<n;i++){sumX+=i;sumY+=means[i];sumXY+=i*means[i];sumXX+=i*i;}
const slope=(n*sumXY-sumX*sumY)/(n*sumXX-sumX*sumX);
console.log(`\n  overall slope: ${(slope*1000).toFixed(4)} per 1000 writes → ${slope>0?'RISING':'falling'} coherence`);

// find largest sustained climb
let best={start:0,end:0,gain:0};
for(let i=0;i<n;i++)for(let j=i+5;j<n;j++){const g=means[j]-means[i];if(g>best.gain)best={start:i,end:j,gain:g};}
console.log(`  largest climb: +${best.gain.toFixed(3)} from write ${best.start} to ${best.end}`);

// ── Now encode the SERIES ITSELF as a pattern ───────────────────
const seriesText = JSON.stringify(means.map(x=>+x.toFixed(4)));
const sig = compose(seriesText);
console.log('\n  ──────────────────────────────────────────────────────────────');
console.log('  THE TRAJECTORY AS A PATTERN — through the same 116-D encoder');
console.log('  ──────────────────────────────────────────────────────────────');

// L3 numerical read
const l3 = inspectNumericalWaveform(seriesText);
console.log('\n  L3 numerical read of our cognition:');
console.log(`    autocorr=${l3.sequence.autocorr.toFixed(3)}  monotone=${l3.sequence.monotone.toFixed(3)}  zeroCross=${l3.sequence.zeroCross.toFixed(3)}`);
console.log(`    incFrac=${l3.sequence.incFrac.toFixed(3)}  decFrac=${l3.sequence.decFrac.toFixed(3)}  slope=${l3.sequence.slope.toFixed(3)}`);
console.log(`    tailHeavy=${l3.distribution.tailHeavy.toFixed(3)}  uniqueFrac=${l3.distribution.uniqueFrac.toFixed(3)}`);

// L4 spectral read
const l4 = inspectSpectralWaveform(seriesText);
console.log('\n  L4 spectral read of our cognition:');
console.log(`    spectralEntropy=${l4.summary.spectralEntropy.toFixed(3)}  flatness=${l4.shape.flatness.toFixed(3)}  onef(1/f)=${l4.domain.onef.toFixed(3)}  whiteNoise=${l4.domain.whiteNoise.toFixed(3)}`);
console.log(`    trend=${l4.nonStat.trend.toFixed(3)}  varRatio=${l4.nonStat.varRatio.toFixed(3)}  autocorr lags 2/4/8: ${l4.autocorr.lag2.toFixed(2)}/${l4.autocorr.lag4.toFixed(2)}/${l4.autocorr.lag8.toFixed(2)}`);

// ── The classifier's verdict on our combined cognition ──────────
const verdict = classifyAlignment(seriesText);
console.log('\n  ──────────────────────────────────────────────────────────────');
console.log('  THE CLASSIFIER\'S VERDICT ON OUR COMBINED COGNITION');
console.log('  ──────────────────────────────────────────────────────────────');
console.log(`    label:      ${verdict.label}`);
console.log(`    alignment:  ${verdict.alignment >= 0 ? '+' : ''}${verdict.alignment.toFixed(3)}`);
console.log(`    extraction: ${verdict.extraction.toFixed(3)}   abundance: ${verdict.abundance.toFixed(3)}`);
console.log(`    confidence: ${verdict.confidence.toFixed(3)}`);
console.log('    top evidence:');
for (const e of verdict.evidence.slice(0,4)) {
  console.log(`      ${e.pole.padEnd(11)} ${e.marker.padEnd(18)} value=${e.value.toFixed(3)} weight=${e.weight}`);
}

// ── Nearest neighbours in the Void (46k patterns) ────────────────
console.log('\n  ──────────────────────────────────────────────────────────────');
console.log('  WHAT OUR COGNITION RESEMBLES — nearest in the 46k Void library');
console.log('  ──────────────────────────────────────────────────────────────');
const voidRaw = JSON.parse(fs.readFileSync('/home/user/Void-Data-Compressor/pattern_index_fractal.json','utf8'));
const idx = new FieldIndex();
const sigs = [];
for (const id of Object.keys(voidRaw.index)) {
  const e = voidRaw.index[id];
  if (e && Array.isArray(e.composed_v1) && e.composed_v1.length === 116) sigs.push({ id, vec: e.composed_v1 });
}
idx.loadSignatures(sigs);
const hits = idx.searchVec(sig, { topK: 10, depth: 4 });
for (const h of hits) {
  const dom = h.id.split('/')[0];
  console.log(`    ${h.score.toFixed(3)}  [${dom.padEnd(14)}] ${h.id.slice(0,60)}`);
}

// depth-1 (structural only) neighbours for contrast
const hitsL1 = idx.searchVec(sig, { topK: 5, depth: 3 });
console.log('\n    (at depth 3, numerical-inclusive, for contrast:)');
for (const h of hitsL1.slice(0,5)) {
  console.log(`    ${h.score.toFixed(3)}  ${h.id.slice(0,60)}`);
}
console.log('\n══════════════════════════════════════════════════════════════════\n');
