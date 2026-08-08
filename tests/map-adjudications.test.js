'use strict';

// The orphan-adjudication contract: reviewed structural loneliness is
// reported separately from NEW loneliness, the map only READS the store,
// and a file absent from the store always surfaces as new. Arrow-style
// throughout — nothing here is a substrate element.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { _annotateOrphans } = require('../src/core/mapper/pairs');

const makeStore = (entries) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adj-'));
  fs.writeFileSync(path.join(dir, '.map-adjudications.json'),
    JSON.stringify({ adjudications: entries }));
  return dir;
};

describe('orphan adjudications', () => {
  it('stamps reviewed orphans and leaves new ones bare', () => {
    const dir = makeStore({ 'a.js': { verdict: 'wired-verified', reason: 'r', date: 'd' } });
    const rows = [{ rel: 'a.js' }, { rel: 'b.js' }];
    _annotateOrphans(rows, dir);
    assert.equal(rows[0].adjudicated.verdict, 'wired-verified');
    assert.equal(rows[1].adjudicated, undefined, 'unreviewed orphans must surface as NEW');
  });

  it('missing store means nothing adjudicated (never throws)', () => {
    const rows = [{ rel: 'x.js' }];
    const out = _annotateOrphans(rows, fs.mkdtempSync(path.join(os.tmpdir(), 'adj-none-')));
    assert.equal(out[0].adjudicated, undefined);
  });

  it('the live repo store adjudicates the current orphan census', () => {
    const store = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.map-adjudications.json'), 'utf8'));
    const n = Object.keys(store.adjudications).length;
    assert.ok(n >= 90, `expected the 92-orphan census adjudicated, found ${n}`);
    for (const [rel, a] of Object.entries(store.adjudications)) {
      assert.ok(a.verdict && a.reason && a.date, `${rel} entry must carry verdict+reason+date`);
    }
  });
});

describe('pair adjudications — verdict plus live proof', () => {
  const { _annotateDataPairs } = require('../src/core/mapper/pairs');

  const makePairStore = (dir, entries) => {
    fs.writeFileSync(path.join(dir, '.map-adjudications.json'),
      JSON.stringify({ pairs: entries }));
  };

  it('governed-vendored sticks only while bytes are identical', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'padj-'));
    fs.writeFileSync(path.join(dir, 'a.js'), 'same content');
    fs.writeFileSync(path.join(dir, 'b.js'), 'same content');
    makePairStore(dir, { 'a.js ↔ b.js': { verdict: 'governed-vendored', reason: 'r', date: 'd' } });
    const pairs = [{ a: 'a.js', b: 'b.js', score: 1 }];
    _annotateDataPairs(pairs, dir);
    assert.equal(pairs[0].adjudicated, 'governed-vendored');

    fs.writeFileSync(path.join(dir, 'b.js'), 'DRIFTED content');
    const pairs2 = [{ a: 'a.js', b: 'b.js', score: 1 }];
    _annotateDataPairs(pairs2, dir);
    assert.equal(pairs2[0].adjudicated, undefined,
      'drift must VOID the adjudication — the pair surfaces raw again');
  });

  it('review-only verdicts annotate without a byte requirement', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'padj2-'));
    fs.writeFileSync(path.join(dir, 'x.json'), '{"n":1}');
    fs.writeFileSync(path.join(dir, 'y.json'), '{"n":2}');
    makePairStore(dir, { 'x.json ↔ y.json': { verdict: 'scaffold-convention', reason: 'r', date: 'd' } });
    const pairs = [{ a: 'x.json', b: 'y.json', score: 1 }];
    _annotateDataPairs(pairs, dir);
    assert.equal(pairs[0].adjudicated, 'scaffold-convention');
  });
});
