'use strict';
// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
// The live information-density signal (the retro fuel).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const sd = require('../src/core/substrate-density');

test('getDensityFactor is a fast, safe read (number ≥ 0, defaults to 1)', () => {
  const isolated = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sdf-')), 'c.json');
  assert.equal(sd.getDensityFactor({ cachePath: isolated }), 1, 'neutral when no cache');
});

test('refreshDensity fits from a substrate; factor = effDim / reference, starts at 1', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-'));
  const sub = path.join(dir, 'index.json');
  const cache = path.join(dir, 'cache.json');
  function mb(s){let a=s>>>0;return()=>{a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
  const rnd = mb(2);
  const index = {};
  for (let i = 0; i < 400; i++) { const v = []; for (let j = 0; j < 116; j++) v.push(rnd()); index['x/p' + i] = { composed_v1: v }; }
  fs.writeFileSync(sub, JSON.stringify({ index }));
  const e = sd.refreshDensity({ substratePath: sub, sample: 400, cachePath: cache });
  assert.ok(e && e.effectiveDim > 0, 'refresh returned a valid entry');
  assert.equal(e.factor, 1, 'first fit: reference == effDim → factor 1 (backward compatible)');
  // a later read of that isolated cache returns the same factor
  assert.equal(sd.getDensityFactor({ cachePath: cache }), 1);
});
