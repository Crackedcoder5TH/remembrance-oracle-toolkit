'use strict';

/**
 * Tests for the stage-5 prediction→outcome feedback store.
 * Verifies: append-only writes, round-trip pairing, stats summary,
 * the 200-pair threshold, file-based fallback pairing when no id.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  recordPrediction,
  recordOutcome,
  loadPairs,
  loadStats,
  storeDir,
} = require('../src/quality/feedback-store');

describe('feedback-store — predictions', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-pred-')); });
  afterEach(() => { if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true }); });

  it('appends a prediction and returns its id', () => {
    const id = recordPrediction({
      file: 'src/foo.js',
      probability: 0.42,
      riskLevel: 'MEDIUM',
      cyclomatic: 12,
      totalCoherency: 0.8,
    }, { repoRoot: root });
    assert.ok(typeof id === 'string' && id.length > 0);
    const file = path.join(storeDir(root), 'predictions.jsonl');
    assert.ok(fs.existsSync(file));
    const line = fs.readFileSync(file, 'utf-8').trim();
    const row = JSON.parse(line);
    assert.equal(row.id, id);
    assert.equal(row.file, 'src/foo.js');
    assert.equal(row.probability, 0.42);
  });

  it('rejects predictions without a file', () => {
    assert.throws(() => recordPrediction({ probability: 0.5 }, { repoRoot: root }));
  });

  it('appends multiple predictions without overwriting', () => {
    recordPrediction({ file: 'a.js', probability: 0.1, riskLevel: 'LOW' }, { repoRoot: root });
    recordPrediction({ file: 'b.js', probability: 0.9, riskLevel: 'HIGH' }, { repoRoot: root });
    const lines = fs.readFileSync(path.join(storeDir(root), 'predictions.jsonl'), 'utf-8')
      .trim().split('\n');
    assert.equal(lines.length, 2);
  });
});

describe('feedback-store — outcomes', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-out-')); });
  afterEach(() => { if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true }); });

  it('appends an outcome row', () => {
    recordOutcome({
      file: 'src/foo.js',
      outcome: 'bug_confirmed',
      source: 'feedback.dismiss',
    }, { repoRoot: root });
    const line = fs.readFileSync(path.join(storeDir(root), 'outcomes.jsonl'), 'utf-8').trim();
    const row = JSON.parse(line);
    assert.equal(row.outcome, 'bug_confirmed');
    assert.equal(row.source, 'feedback.dismiss');
  });

  it('rejects outcomes without a file or outcome label', () => {
    assert.throws(() => recordOutcome({ outcome: 'bug_confirmed' }, { repoRoot: root }));
    assert.throws(() => recordOutcome({ file: 'x.js' }, { repoRoot: root }));
  });
});

describe('feedback-store — pairing', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-pair-')); });
  afterEach(() => { if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true }); });

  it('joins predictions and outcomes by id', () => {
    const id = recordPrediction({ file: 'a.js', probability: 0.5, riskLevel: 'MEDIUM' }, { repoRoot: root });
    recordOutcome({ file: 'a.js', outcome: 'bug_confirmed', predictionId: id }, { repoRoot: root });
    const pairs = loadPairs({ repoRoot: root });
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].prediction.id, id);
    assert.equal(pairs[0].outcomes.length, 1);
    assert.equal(pairs[0].outcomes[0].outcome, 'bug_confirmed');
  });

  it('falls back to file-based pairing when outcome has no predictionId', () => {
    recordPrediction({ file: 'b.js', probability: 0.7, riskLevel: 'HIGH' }, { repoRoot: root });
    recordOutcome({ file: 'b.js', outcome: 'healing_succeeded' }, { repoRoot: root });
    const pairs = loadPairs({ repoRoot: root });
    const matched = pairs.find(p => p.prediction.file === 'b.js');
    assert.ok(matched);
    assert.equal(matched.outcomes.length, 1);
  });

  it('leaves unmatched predictions with empty outcome lists', () => {
    recordPrediction({ file: 'c.js', probability: 0.2, riskLevel: 'LOW' }, { repoRoot: root });
    const pairs = loadPairs({ repoRoot: root });
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].outcomes.length, 0);
  });
});

describe('feedback-store — stats', () => {
  let root;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-stats-')); });
  afterEach(() => { if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true }); });

  it('returns zero stats when nothing has been recorded', () => {
    const stats = loadStats({ repoRoot: root });
    assert.equal(stats.totalPredictions, 0);
    assert.equal(stats.totalPaired, 0);
    assert.equal(stats.readyForTraining, false);
  });

  it('counts predictions by risk level', () => {
    recordPrediction({ file: 'a.js', probability: 0.1, riskLevel: 'LOW' }, { repoRoot: root });
    recordPrediction({ file: 'b.js', probability: 0.4, riskLevel: 'MEDIUM' }, { repoRoot: root });
    recordPrediction({ file: 'c.js', probability: 0.7, riskLevel: 'HIGH' }, { repoRoot: root });
    recordPrediction({ file: 'd.js', probability: 0.8, riskLevel: 'HIGH' }, { repoRoot: root });
    const stats = loadStats({ repoRoot: root });
    assert.equal(stats.totalPredictions, 4);
    assert.equal(stats.byRiskLevel.LOW, 1);
    assert.equal(stats.byRiskLevel.MEDIUM, 1);
    assert.equal(stats.byRiskLevel.HIGH, 2);
  });

  it('reports readyForTraining=true at 200+ paired rows', () => {
    for (let i = 0; i < 200; i++) {
      const id = recordPrediction({
        file: `f${i}.js`, probability: 0.5, riskLevel: 'MEDIUM',
      }, { repoRoot: root });
      recordOutcome({
        file: `f${i}.js`, outcome: 'bug_confirmed', predictionId: id,
      }, { repoRoot: root });
    }
    const stats = loadStats({ repoRoot: root });
    assert.equal(stats.totalPaired, 200);
    assert.equal(stats.readyForTraining, true);
  });
});
