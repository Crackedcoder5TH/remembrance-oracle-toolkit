// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LAYER_DIM, toRedundancyWaveform, redundancyCoherency, inspectRedundancyWaveform } =
  require('../src/core/redundancy-waveform');

describe('toRedundancyWaveform — invariants', () => {
  it('returns 29-D in [0,1] for arbitrary text', () => {
    const v = toRedundancyWaveform('const x = 42; function f(a) { return a + x; }');
    assert.equal(v.length, LAYER_DIM);
    for (const x of v) assert.ok(x >= 0 && x <= 1 && Number.isFinite(x));
  });
  it('empty and non-string inputs yield zero vectors', () => {
    for (const bad of ['', null, undefined, 7]) {
      const v = toRedundancyWaveform(bad);
      assert.equal(v.length, LAYER_DIM);
      for (const x of v) assert.equal(x, 0);
    }
  });
  it('is deterministic', () => {
    const t = 'abcabcabc'.repeat(50) + ' unique tail 12345';
    assert.deepEqual(Array.from(toRedundancyWaveform(t)), Array.from(toRedundancyWaveform(t)));
  });
  it('pure repetition scores far more redundant than random-ish text', () => {
    const rep = toRedundancyWaveform('lorem ipsum '.repeat(200));
    let s = 3735928559; const rand = Array.from({length: 2000}, () => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0; return String.fromCharCode(33 + s % 90);
    }).join('');
    const rnd = toRedundancyWaveform(rand);
    assert.ok(rep[0] > rnd[0] + 0.3, `deep ratio: rep=${rep[0].toFixed(2)} rnd=${rnd[0].toFixed(2)}`);
    assert.ok(rep[9] > rnd[9], '8-gram repetitiveness should separate');
  });
  it('content sketch differs for disjoint vocabularies, matches for shared', () => {
    const a = toRedundancyWaveform('alpha beta gamma delta epsilon '.repeat(20));
    const b = toRedundancyWaveform('alpha beta gamma delta epsilon '.repeat(25));
    const c = toRedundancyWaveform('zeta eta theta iota kappa '.repeat(20));
    const sketch = v => Array.from(v.slice(13, 29));
    const cos = (x, y) => { let d=0,nx=0,ny=0; for (let i=0;i<x.length;i++){d+=x[i]*y[i];nx+=x[i]*x[i];ny+=y[i]*y[i];} return d/Math.sqrt(nx*ny); };
    assert.ok(cos(sketch(a), sketch(b)) > 0.99, 'same vocabulary → same sketch');
    assert.ok(cos(sketch(a), sketch(c)) < 0.9, 'disjoint vocabulary → different sketch');
  });
  it('inspect exposes named groups', () => {
    const insp = inspectRedundancyWaveform('function f() { return 1; }');
    assert.ok('deflate' in insp && 'repetition' in insp && 'contentSketch' in insp);
    assert.equal(insp.contentSketch.length, 16);
  });
  it('redundancyCoherency is a bounded cosine', () => {
    const a = toRedundancyWaveform('aaa bbb ccc '.repeat(30));
    const b = toRedundancyWaveform('aaa bbb ccc ddd '.repeat(30));
    const c = redundancyCoherency(a, b);
    assert.ok(c >= -1 && c <= 1);
  });
});
