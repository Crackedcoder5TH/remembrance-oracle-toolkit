'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// TESTS RUN ON LEDGERS OF THEIR OWN (the one-writer trap): every path the
// module touches is redirected into tmp BEFORE anything is required, so a
// test run can never feed the host's real calibration stream, the tracked
// seed, or the governed debt ledger.
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'calibration-test-'));
process.env.CALIBRATION_LEDGER_PATH = path.join(DIR, 'stream.jsonl');
process.env.CALIBRATION_BASELINE_PATH = path.join(DIR, 'baseline.json');
process.env.DEBT_LEDGER_PATH = path.join(DIR, 'debt.ledger.json');

const cal = require('../src/tools/calibration');
const ratchet = require('../scripts/calibration-ratchet');

const LEDGER = process.env.CALIBRATION_LEDGER_PATH;
const BASELINE = process.env.CALIBRATION_BASELINE_PATH;

const writeBaseline = (doc) => fs.writeFileSync(BASELINE, JSON.stringify(doc));
const writeStream = (outcomes) => fs.writeFileSync(
  LEDGER, outcomes.map((d) => JSON.stringify(typeof d === 'object' ? d : { t: Date.now(), d })).join('\n') + '\n');

describe('calibration — the wall measures its operator', () => {
  beforeEach(() => {
    try { fs.unlinkSync(LEDGER); } catch (_e) { /* fresh stream per test */ }
    try { fs.unlinkSync(BASELINE); } catch (_e) { /* fall back to DEFAULTS */ }
  });

  it('(a) a cold ledger is unjudged: s=0 and the window is exactly the calm two hours', () => {
    const r = cal.reading();
    assert.equal(r.attempts, 0);
    assert.equal(r.judged, false);
    assert.equal(r.s, 0);
    assert.equal(r.hot, false);
    assert.equal(cal.windowMs(r), cal.READ_WINDOW_CALM_MS);
  });

  it('(b) a clean judged window stays calm: rate 0, s 0, two hours in force', () => {
    writeStream(Array(60).fill(0));
    const r = cal.reading();
    assert.equal(r.attempts, 60);
    assert.equal(r.judged, true);
    assert.equal(r.ratePer100, 0);
    assert.equal(r.s, 0);
    assert.equal(r.hot, false);
    assert.equal(cal.windowMs(r), cal.READ_WINDOW_CALM_MS);
  });

  it('(c) a hot window saturates: s=1, the window contracts to the fifteen-minute floor, models tallied', () => {
    // 12 denials over 100 attempts = 12/100, over the default line 8.6/100
    const outcomes = Array(88).fill(0).concat(
      Array(12).fill(null).map(() => ({ t: Date.now(), d: 1, model: 'claude-test-model' })));
    writeStream(outcomes);
    const r = cal.reading();
    assert.equal(r.attempts, 100);
    assert.equal(r.denials, 12);
    assert.equal(r.judged, true);
    assert.equal(r.hot, true);
    assert.equal(r.s, 1);
    assert.equal(cal.windowMs(r), cal.READ_WINDOW_FLOOR_MS);
    assert.equal(r.denialsByModel['claude-test-model'], 12);
  });

  it('(d) the contraction is linear in s between the calm window and the floor', () => {
    // line 10/100 for round numbers; 5 denials over 100 attempts → s = 0.5
    writeBaseline({ linePer100: 10, window: 200, minAttempts: 50 });
    writeStream(Array(95).fill(0).concat(Array(5).fill(1)));
    const r = cal.reading();
    assert.equal(r.judged, true);
    assert.ok(Math.abs(r.s - 0.5) < 1e-9, `s=${r.s}`);
    const expected = Math.round(
      cal.READ_WINDOW_CALM_MS - (cal.READ_WINDOW_CALM_MS - cal.READ_WINDOW_FLOOR_MS) * 0.5);
    assert.equal(cal.windowMs(r), expected);
  });

  it('(e) below minAttempts the gate refuses to judge even a terrible rate', () => {
    writeStream(Array(10).fill(1));   // 100% denials, but only 10 commands
    const r = cal.reading();
    assert.equal(r.judged, false);
    assert.equal(r.s, 0);
    assert.equal(r.hot, false);
    assert.equal(cal.windowMs(r), cal.READ_WINDOW_CALM_MS);
  });

  it('(f) record() appends clean and denied outcomes the reading then counts', () => {
    cal.record({ denied: false });
    cal.record({ denied: true, rule: 'GOGGLES — OFF-SURFACE COMMAND refused (test)\n  detail' });
    const rows = cal.entries(10);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].d, 0);
    assert.equal(rows[1].d, 1);
    assert.equal(rows[1].rule, 'GOGGLES — OFF-SURFACE COMMAND refused (test)');
  });

  it('(g) the stream rotates: past the cap only the tail survives', () => {
    const many = Array(5001).fill(0).map(() => JSON.stringify({ t: Date.now(), d: 0 })).join('\n') + '\n';
    fs.writeFileSync(LEDGER, many);
    cal.record({ denied: false });
    const lines = fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean);
    assert.ok(lines.length <= 1001, `rotation kept ${lines.length} lines`);
  });

  it('(h) verdict lines say unjudged / holds / HOT with the numbers in them', () => {
    assert.match(ratchet.verdictLine(cal.reading()), /✓ unjudged/);
    writeStream(Array(60).fill(0));
    assert.match(ratchet.verdictLine(cal.reading()), /✓ holds/);
    writeStream(Array(50).fill(0).concat(Array(50).fill(1)));
    const hot = ratchet.verdictLine(cal.reading());
    assert.match(hot, /✗ HOT/);
    assert.match(hot, /50\.00 denials\/100/);
  });

  it('(i) save-baseline only tightens: a rise is refused, a fall is written, noise is refused', () => {
    writeBaseline({ linePer100: 8.6, window: 200, minAttempts: 50 });
    // unjudged: refused
    writeStream(Array(5).fill(0));
    assert.equal(ratchet.saveBaseline(cal.reading(), []), 1);
    // judged clean: 2x rate 0 floors at 2.0 < 8.6 → tightens
    writeStream(Array(100).fill(0));
    assert.equal(ratchet.saveBaseline(cal.reading(), []), 0);
    assert.equal(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).linePer100, ratchet.SAVE_FLOOR_PER100);
    // judged hot against the now-tight line: 2x rate would RAISE it → refused without --accept-debt
    writeStream(Array(90).fill(0).concat(Array(10).fill(1)));
    assert.equal(ratchet.saveBaseline(cal.reading(), []), 1);
    assert.equal(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).linePer100, ratchet.SAVE_FLOOR_PER100);
  });
});
