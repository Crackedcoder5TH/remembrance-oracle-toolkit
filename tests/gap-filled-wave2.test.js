'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  runLengthEncode, analyzeElementDensity, delay, snapshot, isSorted,
  binarySearch, simpleHash, compressionRatio, auditAtomicCoverage,
  predictEmergence, mutTransform, reactiveFilter, filterByPattern,
  frozenIdentity, conditionalAnalyze, absFloor, fuzzySearch, semanticSearch,
} = require('../src/utils/gap-filled-wave2');

describe('runLengthEncode', () => {
  it('encodes repeated runs', () => {
    assert.deepEqual(runLengthEncode('aaabbc'), [['a', 3], ['b', 2], ['c', 1]]);
  });
  it('handles single elements', () => {
    assert.deepEqual(runLengthEncode([1, 2, 3]), [[1, 1], [2, 1], [3, 1]]);
  });
  it('handles empty', () => assert.deepEqual(runLengthEncode([]), []));
});

describe('analyzeElementDensity', () => {
  it('computes density', () => {
    const elements = [
      { properties: { group: 1, period: 1, charge: 0 } },
      { properties: { group: 1, period: 2, charge: 1 } },
      { properties: { group: 2, period: 1, charge: -1 } },
    ];
    const r = analyzeElementDensity(elements);
    assert.equal(r.totalElements, 3);
    assert.ok(r.density > 0);
    assert.equal(r.chargeBalance.positive, 1);
    assert.equal(r.chargeBalance.negative, 1);
    assert.equal(r.chargeBalance.neutral, 1);
  });
  it('handles non-array', () => assert.equal(analyzeElementDensity(null).density, 0));
});

describe('delay', () => {
  it('resolves after time', async () => {
    const start = Date.now();
    await delay(50);
    assert.ok(Date.now() - start >= 40);
  });
  it('resolves immediately with 0', async () => {
    await delay(0);
    assert.ok(true);
  });
});

describe('snapshot', () => {
  it('creates frozen deep clone', () => {
    const obj = { a: { b: 1 }, c: [2, 3] };
    const snap = snapshot(obj);
    assert.deepEqual(snap, obj);
    assert.ok(Object.isFrozen(snap));
    assert.ok(Object.isFrozen(snap.a));
    obj.a.b = 99;
    assert.equal(snap.a.b, 1);
  });
  it('handles primitives', () => assert.equal(snapshot(42), 42));
});

describe('isSorted', () => {
  it('returns true for sorted', () => assert.ok(isSorted([1, 2, 3, 4])));
  it('returns false for unsorted', () => assert.ok(!isSorted([3, 1, 2])));
  it('returns true for empty', () => assert.ok(isSorted([])));
  it('returns true for single', () => assert.ok(isSorted([1])));
  it('accepts custom comparator', () => {
    assert.ok(isSorted([3, 2, 1], (a, b) => b - a));
  });
});

describe('binarySearch', () => {
  it('finds element', () => assert.equal(binarySearch([1, 3, 5, 7, 9], 5), 2));
  it('returns -1 for missing', () => assert.equal(binarySearch([1, 3, 5], 4), -1));
  it('handles non-array', () => assert.equal(binarySearch(null, 1), -1));
  it('finds first element', () => assert.equal(binarySearch([1, 2, 3], 1), 0));
  it('finds last element', () => assert.equal(binarySearch([1, 2, 3], 3), 2));
});

describe('simpleHash', () => {
  it('returns hex string', () => {
    const h = simpleHash('hello');
    assert.ok(/^[0-9a-f]{8}$/.test(h));
  });
  it('is deterministic', () => assert.equal(simpleHash('test'), simpleHash('test')));
  it('differs for different inputs', () => assert.notEqual(simpleHash('a'), simpleHash('b')));
  it('handles non-string', () => assert.ok(simpleHash(123)));
});

describe('compressionRatio', () => {
  it('computes ratio', () => assert.equal(compressionRatio(1000, 250), 4));
  it('handles zero', () => assert.equal(compressionRatio(0, 100), 0));
  it('handles negative', () => assert.equal(compressionRatio(-1, 100), 0));
});

describe('auditAtomicCoverage', () => {
  it('audits file list', () => {
    const r = auditAtomicCoverage([require('path').resolve(__dirname, '../src/utils/gap-filled.js')]);
    assert.ok(r.summary.totalFunctions > 0);
    assert.ok(r.summary.overallCoverage > 0);
  });
  it('handles missing file', () => {
    const r = auditAtomicCoverage(['/nonexistent/file.js']);
    assert.ok(r.files[0].error);
  });
  it('handles empty', () => {
    const r = auditAtomicCoverage([]);
    assert.equal(r.summary.totalFiles, 0);
  });
});

describe('predictEmergence', () => {
  it('predicts next threshold', () => {
    const history = [0.70, 0.72, 0.74, 0.76, 0.78];
    const r = predictEmergence(history);
    assert.ok(r.predicted);
    assert.ok(r.estimatedSteps > 0);
    assert.equal(r.nextThreshold, 0.80);
  });
  it('handles insufficient data', () => {
    assert.equal(predictEmergence([0.5]).predicted, false);
  });
  it('handles negative trend', () => {
    const r = predictEmergence([0.8, 0.78, 0.76, 0.74]);
    assert.equal(r.predicted, false);
    assert.equal(r.reason, 'negative or flat trend');
  });
  it('handles all thresholds crossed', () => {
    const r = predictEmergence([0.98, 0.99]);
    assert.equal(r.predicted, false);
    assert.equal(r.reason, 'all thresholds crossed');
  });
});

describe('mutTransform', () => {
  it('mutates object via function', () => {
    const obj = { count: 1 };
    mutTransform(obj, o => { o.count++; o.extra = true; });
    assert.equal(obj.count, 2);
    assert.equal(obj.extra, true);
  });
  it('handles null', () => assert.equal(mutTransform(null, () => {}), null));
});

describe('reactiveFilter', () => {
  it('filters emitted events', (_, done) => {
    const { EventEmitter } = require('events');
    const source = new EventEmitter();
    const filtered = reactiveFilter(source, 'num', n => n > 5);
    const received = [];
    filtered.on('num', n => {
      received.push(n);
      if (received.length === 2) {
        assert.deepEqual(received, [7, 10]);
        done();
      }
    });
    source.emit('num', 3);
    source.emit('num', 7);
    source.emit('num', 2);
    source.emit('num', 10);
  });
});

describe('filterByPattern', () => {
  it('filters by substring', () => {
    assert.deepEqual(filterByPattern(['foo', 'bar', 'foobar'], 'foo'), ['foo', 'foobar']);
  });
  it('filters by RegExp', () => {
    assert.deepEqual(filterByPattern([1, 12, 123], /^\d{2}$/), [12]);
  });
  it('handles non-array', () => assert.deepEqual(filterByPattern('nope', /x/), []));
});

describe('frozenIdentity', () => {
  it('returns frozen copy', () => {
    const obj = { a: 1 };
    const f = frozenIdentity(obj);
    assert.deepEqual(f, obj);
    assert.ok(Object.isFrozen(f));
    assert.notEqual(f, obj);
  });
  it('handles primitives', () => assert.equal(frozenIdentity(42), 42));
  it('handles arrays', () => {
    const f = frozenIdentity([1, 2]);
    assert.ok(Object.isFrozen(f));
  });
});

describe('conditionalAnalyze', () => {
  it('analyzes code', () => {
    const code = 'if (x) { for (;;) { if (y) {} } }';
    const r = conditionalAnalyze(code);
    assert.ok(r.results.length > 0);
    assert.ok('passing' in r);
  });
  it('respects conditions', () => {
    const r = conditionalAnalyze('if (x) {}', { checkLoops: false, checkDepth: false });
    assert.equal(r.results.length, 1);
    assert.equal(r.results[0].check, 'branches');
  });
  it('handles non-string', () => {
    assert.equal(conditionalAnalyze(null).summary, 'no code');
  });
});

describe('absFloor', () => {
  it('computes abs floor', () => {
    assert.equal(absFloor(-3.7), 3);
    assert.equal(absFloor(2.9), 2);
    assert.equal(absFloor(0), 0);
  });
  it('handles NaN', () => assert.equal(absFloor(NaN), 0));
  it('handles non-number', () => assert.equal(absFloor('x'), 0));
});

describe('fuzzySearch', () => {
  it('finds exact match', () => {
    const r = fuzzySearch(['apple', 'banana', 'cherry'], 'banana');
    assert.equal(r[0].item, 'banana');
    assert.equal(r[0].score, 1.0);
  });
  it('finds prefix match', () => {
    const r = fuzzySearch(['apple', 'application', 'cherry'], 'app');
    assert.ok(r.length >= 2);
    assert.ok(r[0].score >= 0.7);
  });
  it('finds subsequence', () => {
    const r = fuzzySearch(['formatting', 'fat', 'fishing'], 'fmt');
    assert.ok(r.length >= 1);
  });
  it('accepts key function', () => {
    const items = [{ name: 'alice' }, { name: 'bob' }];
    const r = fuzzySearch(items, 'ali', x => x.name);
    assert.equal(r[0].item.name, 'alice');
  });
});

describe('semanticSearch', () => {
  it('searches with default scorer', () => {
    const r = semanticSearch(['hello world', 'goodbye', 'hello there'], 'hello');
    assert.ok(r.length >= 2);
    assert.ok(r[0].score >= 0.5);
  });
  it('respects threshold', () => {
    const r = semanticSearch(['a', 'b', 'c'], 'z', undefined, 0.9);
    assert.equal(r.length, 0);
  });
  it('accepts custom scorer', () => {
    const r = semanticSearch([1, 2, 3], 2, (item, q) => item === q ? 1 : 0, 0.5);
    assert.equal(r.length, 1);
    assert.equal(r[0].item, 2);
  });
});

describe('wave 2 atomic property coverage', () => {
  it('all 18 exports have atomicProperties', () => {
    const mod = require('../src/utils/gap-filled-wave2');
    const fns = Object.entries(mod).filter(([, v]) => typeof v === 'function');
    assert.equal(fns.length, 18);
    for (const [name, fn] of fns) {
      assert.ok(fn.atomicProperties, `${name} missing atomicProperties`);
      assert.ok(typeof fn.atomicProperties.charge === 'number', `${name} missing charge`);
    }
  });
});
