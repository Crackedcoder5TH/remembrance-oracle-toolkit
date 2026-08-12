import test from 'node:test';
import assert from 'node:assert/strict';
import { observe, detectFluctuation, proposeLexiconEntries, autoApproveIfCoherent, FLUCTUATION_THRESHOLD, SYNERGY_COHERENCY } from '../src/core/lexicon-watcher.js';

test('observe returns no-fluctuation for first sample', () => {
  const r = observe(0.8, { file: 'a.js' });
  assert.equal(r.fluctuated, false);
});

test('detects fluctuation when current deviates past threshold', () => {
  for (let i = 0; i < 7; i++) observe(0.80);
  const r = observe(0.88);
  assert.equal(r.fluctuated, true);
  assert.equal(r.direction, 'rising');
  assert.ok(r.delta >= FLUCTUATION_THRESHOLD);
});

test('flat coherency stays below threshold', () => {
  for (let i = 0; i < 6; i++) observe(0.80);
  const r = observe(0.805);
  assert.equal(r.fluctuated, false);
});

test('proposeLexiconEntries shapes all three finding kinds', () => {
  const findings = {
    functions: [{ name: 'newFunc', file: 'a.js' }],
    terms: [{ name: 'NEW_TERM', file: 'b.js' }],
    architectural: [{ file: 'c.js', hint: 'emitter' }],
  };
  const props = proposeLexiconEntries(findings, { current: 0.9 });
  assert.equal(props.length, 3);
  assert.equal(props[0].kind, 'function');
  assert.equal(props[1].kind, 'term');
  assert.equal(props[2].kind, 'architectural');
  for (const p of props) {
    assert.equal(p.status, 'pending');
    assert.ok(p.proposedAt);
  }
});

test('autoApproveIfCoherent refuses below synergy', () => {
  const r = autoApproveIfCoherent(0.7);
  assert.equal(r.promoted, 0);
  assert.match(r.reason, /synergy/);
});

test('SYNERGY_COHERENCY aligns with approval tiers', () => {
  assert.equal(SYNERGY_COHERENCY, 0.85);
});
