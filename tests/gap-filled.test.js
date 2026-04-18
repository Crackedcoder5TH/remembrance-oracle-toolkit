'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  memoizeOne, clamp, truncate, analyzeModuleCoverage, atomicDistance,
  sortByKey, sortInPlace, errorSentinel, unique, pick, formatBytes,
  parseQueryString, measureComplexity, deepEqual, mutAssign, reactiveMap,
  compact, safeTransform, isSubsetOf, coherencyAccumulator,
} = require('../src/utils/gap-filled');

// ── Existing 5 ──────────────────────────────────────────────────────

describe('memoizeOne', () => {
  it('caches results', () => {
    let calls = 0;
    const fn = memoizeOne(x => { calls++; return x * 2; });
    assert.equal(fn(5), 10);
    assert.equal(fn(5), 10);
    assert.equal(calls, 1);
  });
});

describe('clamp', () => {
  it('clamps within range', () => {
    assert.equal(clamp(15, 0, 10), 10);
    assert.equal(clamp(-5, 0, 10), 0);
    assert.equal(clamp(5, 0, 10), 5);
  });
  it('handles non-number', () => assert.equal(clamp('x', 0, 10), 0));
});

describe('truncate', () => {
  it('truncates long strings', () => assert.equal(truncate('hello world', 8), 'hello...'));
  it('preserves short strings', () => assert.equal(truncate('hi', 10), 'hi'));
  it('handles non-string', () => assert.equal(truncate(42, 10), ''));
});

describe('atomicDistance', () => {
  it('returns 1 for identical properties', () => {
    const p = { charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
      reactivity: 'inert', group: 1, period: 1, harmPotential: 'none',
      alignment: 'neutral', intention: 'neutral' };
    assert.equal(atomicDistance(p, p), 1);
  });
  it('returns 0 for null input', () => assert.equal(atomicDistance(null, {}), 0));
});

// ── New 15 ──────────────────────────────────────────────────────────

describe('sortByKey', () => {
  it('sorts by extracted key', () => {
    const items = [{ n: 'c' }, { n: 'a' }, { n: 'b' }];
    const sorted = sortByKey(items, x => x.n);
    assert.deepEqual(sorted.map(x => x.n), ['a', 'b', 'c']);
  });
  it('does not mutate original', () => {
    const orig = [3, 1, 2];
    sortByKey(orig, x => x);
    assert.deepEqual(orig, [3, 1, 2]);
  });
  it('handles non-array', () => assert.deepEqual(sortByKey(null, x => x), []));
});

describe('sortInPlace', () => {
  it('sorts in place', () => {
    const arr = [3, 1, 2];
    const result = sortInPlace(arr);
    assert.equal(result, arr);
    assert.deepEqual(arr, [1, 2, 3]);
  });
  it('accepts custom comparator', () => {
    const arr = [1, 3, 2];
    sortInPlace(arr, (a, b) => b - a);
    assert.deepEqual(arr, [3, 2, 1]);
  });
});

describe('errorSentinel', () => {
  it('creates frozen sentinel', () => {
    const s = errorSentinel('NOT_FOUND', 'Item missing');
    assert.equal(s.code, 'NOT_FOUND');
    assert.equal(s.message, 'Item missing');
    assert.equal(s.isSentinel(), true);
    assert.ok(Object.isFrozen(s));
  });
  it('defaults to UNKNOWN', () => {
    const s = errorSentinel();
    assert.equal(s.code, 'UNKNOWN');
  });
});

describe('unique', () => {
  it('deduplicates', () => assert.deepEqual(unique([1, 2, 2, 3, 1]), [1, 2, 3]));
  it('handles non-array', () => assert.deepEqual(unique('not array'), []));
  it('preserves order', () => assert.deepEqual(unique([3, 1, 2, 1]), [3, 1, 2]));
});

describe('pick', () => {
  it('picks specified keys', () => {
    assert.deepEqual(pick({ a: 1, b: 2, c: 3 }, ['a', 'c']), { a: 1, c: 3 });
  });
  it('ignores missing keys', () => {
    assert.deepEqual(pick({ a: 1 }, ['a', 'z']), { a: 1 });
  });
  it('handles null', () => assert.deepEqual(pick(null, ['a']), {}));
});

describe('formatBytes', () => {
  it('formats zero', () => assert.equal(formatBytes(0), '0 B'));
  it('formats bytes', () => assert.equal(formatBytes(500), '500.00 B'));
  it('formats kilobytes', () => assert.equal(formatBytes(1024), '1.00 KB'));
  it('formats megabytes', () => assert.equal(formatBytes(1048576), '1.00 MB'));
  it('formats negative', () => assert.ok(formatBytes(-1024).startsWith('-')));
});

describe('parseQueryString', () => {
  it('parses key=value pairs', () => {
    assert.deepEqual(parseQueryString('a=1&b=2'), { a: '1', b: '2' });
  });
  it('handles leading ?', () => {
    assert.deepEqual(parseQueryString('?x=y'), { x: 'y' });
  });
  it('handles keys without values', () => {
    assert.deepEqual(parseQueryString('flag'), { flag: '' });
  });
  it('handles non-string', () => assert.deepEqual(parseQueryString(42), {}));
  it('decodes URI components', () => {
    assert.deepEqual(parseQueryString('name=hello%20world'), { name: 'hello world' });
  });
});

describe('measureComplexity', () => {
  it('measures simple code', () => {
    const r = measureComplexity('function f() { return 1; }');
    assert.equal(r.rating, 'simple');
    assert.ok(r.complexity >= 1);
  });
  it('detects branches', () => {
    const code = 'if (a) { } else if (b) { } if (c) { }';
    const r = measureComplexity(code);
    assert.ok(r.branches >= 3);
  });
  it('detects loops', () => {
    const r = measureComplexity('for (;;) { while (x) { } }');
    assert.equal(r.loops, 2);
  });
  it('handles non-string', () => {
    assert.equal(measureComplexity(null).complexity, 0);
  });
});

describe('deepEqual', () => {
  it('compares primitives', () => {
    assert.ok(deepEqual(1, 1));
    assert.ok(!deepEqual(1, 2));
    assert.ok(deepEqual('a', 'a'));
  });
  it('compares arrays', () => {
    assert.ok(deepEqual([1, [2, 3]], [1, [2, 3]]));
    assert.ok(!deepEqual([1, 2], [1, 3]));
  });
  it('compares objects', () => {
    assert.ok(deepEqual({ a: { b: 1 } }, { a: { b: 1 } }));
    assert.ok(!deepEqual({ a: 1 }, { a: 2 }));
  });
  it('handles null', () => {
    assert.ok(deepEqual(null, null));
    assert.ok(!deepEqual(null, {}));
  });
  it('caps recursion depth', () => {
    let a = { v: null }, b = { v: null };
    let ca = a, cb = b;
    for (let i = 0; i < 25; i++) { ca.v = { v: null }; cb.v = { v: null }; ca = ca.v; cb = cb.v; }
    assert.ok(!deepEqual(a, b, 5));
  });
});

describe('mutAssign', () => {
  it('assigns properties in place', () => {
    const obj = { a: 1 };
    const result = mutAssign(obj, { b: 2 }, { c: 3 });
    assert.equal(result, obj);
    assert.deepEqual(obj, { a: 1, b: 2, c: 3 });
  });
  it('overwrites existing keys', () => {
    const obj = { a: 1 };
    mutAssign(obj, { a: 99 });
    assert.equal(obj.a, 99);
  });
  it('handles null target', () => assert.equal(mutAssign(null, { a: 1 }), null));
});

describe('reactiveMap', () => {
  it('maps emitted events', (_, done) => {
    const { EventEmitter } = require('events');
    const source = new EventEmitter();
    const mapped = reactiveMap(source, 'data', x => x * 2);
    mapped.on('data', val => {
      assert.equal(val, 10);
      done();
    });
    source.emit('data', 5);
  });
});

describe('compact', () => {
  it('removes falsy values', () => {
    assert.deepEqual(compact([0, 1, false, 2, '', 3, null, undefined, NaN]), [1, 2, 3]);
  });
  it('handles non-array', () => assert.deepEqual(compact('nope'), []));
});

describe('safeTransform', () => {
  it('returns transformed value', () => {
    assert.equal(safeTransform(5, x => x * 2, 0), 10);
  });
  it('returns fallback on error', () => {
    assert.equal(safeTransform(null, x => x.toString().fail(), 'safe'), 'safe');
  });
});

describe('isSubsetOf', () => {
  it('returns true for subset', () => assert.ok(isSubsetOf([1, 2], [1, 2, 3])));
  it('returns false for non-subset', () => assert.ok(!isSubsetOf([1, 4], [1, 2, 3])));
  it('empty is subset of anything', () => assert.ok(isSubsetOf([], [1, 2])));
  it('handles non-array', () => assert.ok(!isSubsetOf('a', [1])));
});

describe('coherencyAccumulator', () => {
  it('accumulates scores', () => {
    const acc = coherencyAccumulator({ minSamples: 2 });
    acc.add(0.8);
    acc.add(0.9);
    acc.add(0.85);
    const val = acc.value();
    assert.ok(val > 0.7 && val < 1.0, `value ${val} not in range`);
  });
  it('returns 0 below minSamples', () => {
    const acc = coherencyAccumulator({ minSamples: 5 });
    acc.add(0.9);
    assert.equal(acc.value(), 0);
  });
  it('tracks confidence', () => {
    const acc = coherencyAccumulator({ minSamples: 3 });
    acc.add(0.8);
    assert.ok(acc.confidence() < 1);
    acc.add(0.8);
    acc.add(0.8);
    acc.add(0.8);
    acc.add(0.8);
    acc.add(0.8);
    acc.add(0.8);
    acc.add(0.8);
    acc.add(0.8);
    assert.equal(acc.confidence(), 1);
  });
  it('resets', () => {
    const acc = coherencyAccumulator({ minSamples: 1 });
    acc.add(0.5);
    acc.reset();
    assert.equal(acc.value(), 0);
  });
});

// ── All functions have atomic properties ────────────────────────────

describe('atomic property coverage', () => {
  it('all 20 exports have atomicProperties', () => {
    const mod = require('../src/utils/gap-filled');
    const fns = Object.entries(mod).filter(([, v]) => typeof v === 'function');
    assert.equal(fns.length, 20);
    for (const [name, fn] of fns) {
      assert.ok(fn.atomicProperties, `${name} missing atomicProperties`);
      assert.ok(fn.atomicProperties.group, `${name} missing group`);
      assert.ok(typeof fn.atomicProperties.charge === 'number', `${name} missing charge`);
    }
  });
});
