'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// The five gates born 2026-08-09. Each test drives the gate's core verdict
// logic through its exported pure surface — the block direction and the
// pass direction both, because a gate proven only one way is not proven.

describe('cycle-ratchet — compareCycles', () => {
  const { compareCycles } = require('../scripts/cycle-ratchet');
  const baseline = [['a.js', 'b.js', 'c.js'], ['x.js', 'y.js']];

  it('holds when cycles are unchanged', () => {
    const v = compareCycles([['a.js', 'b.js', 'c.js'], ['x.js', 'y.js']], baseline);
    assert.equal(v.ok, true);
  });

  it('blocks a brand-new cycle', () => {
    const v = compareCycles([['a.js', 'b.js', 'c.js'], ['x.js', 'y.js'], ['p.js', 'q.js']], baseline);
    assert.equal(v.ok, false);
    assert.equal(v.newCycles.length, 1);
  });

  it('blocks a cycle gaining a member', () => {
    const v = compareCycles([['a.js', 'b.js', 'c.js', 'd.js'], ['x.js', 'y.js']], baseline);
    assert.equal(v.ok, false);
    assert.deepEqual(v.grownCycles[0].extra, ['d.js']);
  });

  it('blocks two baseline cycles merging', () => {
    const v = compareCycles([['a.js', 'b.js', 'c.js', 'x.js', 'y.js']], baseline);
    assert.equal(v.ok, false);
    assert.equal(v.merged.length, 1);
  });

  it('passes and counts shrinkage', () => {
    const v = compareCycles([['a.js', 'b.js'], ['x.js', 'y.js']], baseline);
    assert.equal(v.ok, true);
    assert.equal(v.shrunk, 1);
  });

  it('passes when a cycle dissolves entirely', () => {
    const v = compareCycles([['x.js', 'y.js']], baseline);
    assert.equal(v.ok, true);
  });
});

describe('cycle-ratchet — dual census: load-time vs lexical', () => {
  const { censusCycles } = require('../scripts/cycle-ratchet');

  it('separates load-time edges from lexical ones — the load graph is acyclic', () => {
    const c = censusCycles();
    assert.ok(Array.isArray(c.load) && Array.isArray(c.lexical));
    assert.equal(c.load.length, 0, 'src/ load-time require graph must stay acyclic — a lazy require is invisible here, a top-level one is not');
    for (const cyc of c.lexical) assert.ok(cyc.length > 1);
  });
});

describe('suite-reachability-ratchet — censusUnreachable', () => {
  const { censusUnreachable } = require('../scripts/suite-reachability-ratchet');

  it('reports only tracked test files the runner glob cannot reach', () => {
    const files = censusUnreachable();
    for (const f of files) {
      assert.match(f, /^tests\/.*\.test\.js$/);
      assert.doesNotMatch(f, /^tests\/[^/]+\.test\.js$/);
    }
  });
});

describe('field-source-ratchet — censusSites', () => {
  const { censusSites } = require('../scripts/field-source-ratchet');

  it('keys every write site uniquely and classifies each', () => {
    const sites = censusSites();
    assert.ok(sites.length > 0, 'the field has a write surface');
    const keys = new Set(sites.map((s) => s.key));
    assert.equal(keys.size, sites.length, 'keys are unique');
    for (const s of sites) assert.ok(['MEASURED', 'SUBSTITUTED', 'CONSTANT'].includes(s.kind));
  });
});

describe('ledger-append-ratchet — verifyAppendOnly', () => {
  const { verifyAppendOnly } = require('../scripts/ledger-append-ratchet');
  const head = [{ n: 1, note: 'first' }, { n: 2, note: 'second' }];

  it('passes a pure append', () => {
    const v = verifyAppendOnly(head, [...head, { n: 3 }]);
    assert.equal(v.ok, true);
    assert.equal(v.appended, 1);
  });

  it('passes an unchanged ledger', () => {
    const v = verifyAppendOnly(head, [{ n: 1, note: 'first' }, { n: 2, note: 'second' }]);
    assert.equal(v.ok, true);
    assert.equal(v.appended, 0);
  });

  it('blocks an edited entry', () => {
    const v = verifyAppendOnly(head, [{ n: 1, note: 'TIDIED' }, { n: 2, note: 'second' }]);
    assert.equal(v.ok, false);
    assert.match(v.reason, /entry 1 modified/);
  });

  it('blocks a deleted entry', () => {
    const v = verifyAppendOnly(head, [head[0]]);
    assert.equal(v.ok, false);
    assert.match(v.reason, /deleted/);
  });

  it('blocks a reorder — order is part of history', () => {
    const v = verifyAppendOnly(head, [head[1], head[0]]);
    assert.equal(v.ok, false);
  });

  it('treats key order inside an entry as irrelevant (bytes of meaning, not of layout)', () => {
    const v = verifyAppendOnly(head, [{ note: 'first', n: 1 }, { n: 2, note: 'second' }]);
    assert.equal(v.ok, true);
  });

  it('passes a ledger born in this commit', () => {
    const v = verifyAppendOnly(null, [{ n: 1 }]);
    assert.equal(v.ok, true);
    assert.equal(v.appended, 1);
  });
});

describe('orphan-ratchet — exportNames and hasConsumer', () => {
  const { exportNames, hasConsumer } = require('../scripts/orphan-ratchet');

  it('reads shorthand, keyed, and single-name export forms', () => {
    assert.deepEqual(exportNames('module.exports = { alpha, beta };'), ['alpha', 'beta']);
    assert.deepEqual(exportNames('module.exports = { gamma: impl };'), ['gamma']);
    assert.deepEqual(exportNames('module.exports = { solo };'), ['solo']);
    assert.deepEqual(exportNames('const x = 1;'), []);
  });

  it('sees an in-file consumer', () => {
    const code = "'use strict';\nconst fn = () => 1;\nconst caller = () => fn();\nmodule.exports = { fn, caller };\n";
    assert.equal(hasConsumer('src/nowhere.js', 'fn', code), 'in-file');
  });

  it('reports no consumer for a function only defined and exported', () => {
    const code = "'use strict';\nconst zq9LonelyName = () => 1;\nmodule.exports = { zq9LonelyName };\n";
    assert.equal(hasConsumer('src/nowhere.js', 'zq9LonelyName', code), null);
  });
});
