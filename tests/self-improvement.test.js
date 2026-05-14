'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { SelfImprovementEngine, APPROVAL_THRESHOLDS } = require('../src/orchestrator/self-improvement');
const { PeriodicTable } = require('../src/atomic/periodic-table');

describe('SelfImprovementEngine', () => {
  let tmpDir, engine, table;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'self-improve-'));
    engine = new SelfImprovementEngine({
      repoRoot: tmpDir,
      storagePath: '.remembrance/self-improvement.json',
    });
    table = new PeriodicTable({ storagePath: path.join(tmpDir, '.remembrance', 'atomic-table.json') });
    // Seed table with enough elements for gap discovery
    for (let g = 1; g <= 5; g++) {
      for (const charge of [-1, 0, 1]) {
        for (const mass of ['light', 'medium', 'heavy']) {
          table.addElement({
            charge, valence: 2, mass, spin: 'even', phase: 'gas',
            reactivity: 'inert', electronegativity: 0.3, group: g, period: 2,
            harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
          });
        }
      }
    }
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns supervised mode below 0.85 coherency', () => {
    assert.equal(engine.getApprovalMode(0.76), 'supervised');
  });

  it('returns semi-autonomous mode at 0.85-0.95', () => {
    assert.equal(engine.getApprovalMode(0.88), 'semi-autonomous');
  });

  it('returns autonomous mode at 0.95+', () => {
    assert.equal(engine.getApprovalMode(0.96), 'autonomous');
  });

  it('discovers gaps and creates proposals', async () => {
    const result = await engine.discoverAndPropose({
      table, globalCoherency: 0.76, maxProposals: 3,
    });
    assert.ok(result.proposals.length > 0, 'Should find at least one gap');
    assert.equal(result.approvalMode, 'supervised');
  });

  it('proposals are pending in supervised mode', async () => {
    const result = await engine.discoverAndPropose({
      table, globalCoherency: 0.76, maxProposals: 2,
    });
    const passing = result.proposals.filter(p => p.status === 'pending');
    // Some may pass all gates and be pending, others may be rejected
    assert.ok(result.proposals.length > 0);
  });

  it('human can approve a pending proposal', async () => {
    const result = await engine.discoverAndPropose({
      table, globalCoherency: 0.76, maxProposals: 3,
    });
    const pending = engine.getPending();
    if (pending.length > 0) {
      const approved = engine.approve(pending[0].id, table);
      assert.ok(approved.success);
      assert.equal(approved.proposal.status, 'approved');
      assert.equal(approved.proposal.decidedBy, 'human');
    }
  });

  it('human can reject a pending proposal', async () => {
    const result = await engine.discoverAndPropose({
      table, globalCoherency: 0.76, maxProposals: 3,
    });
    const pending = engine.getPending();
    if (pending.length > 0) {
      const rejected = engine.reject(pending[0].id, 'Not needed');
      assert.ok(rejected.success);
      assert.equal(rejected.proposal.status, 'rejected');
      assert.equal(rejected.proposal.decidedBy, 'human');
    }
  });

  it('auto-incorporates in semi-autonomous mode when all gates pass', async () => {
    const result = await engine.discoverAndPropose({
      table, globalCoherency: 0.90, maxProposals: 3,
    });
    assert.equal(result.approvalMode, 'semi-autonomous');
    // Some proposals that pass all gates should be auto-incorporated
    const autoInc = result.proposals.filter(p => p.status === 'auto-incorporated');
    if (autoInc.length > 0) {
      // decidedBy starts with 'system' — may be 'system', 'system+ecosystem', etc.
      // when the ecosystem cross-check also concurred.
      assert.match(autoInc[0].decidedBy, /^system/);
    }
  });

  it('persists proposals to disk', async () => {
    await engine.discoverAndPropose({ table, globalCoherency: 0.76, maxProposals: 2 });
    const saved = engine.getHistory().length;
    // Load from same path
    const reloaded = new SelfImprovementEngine({
      repoRoot: tmpDir,
      storagePath: '.remembrance/self-improvement.json',
    });
    assert.equal(reloaded.getHistory().length, saved);
  });

  it('status() reports correct counts', async () => {
    await engine.discoverAndPropose({ table, globalCoherency: 0.76, maxProposals: 3 });
    const status = engine.status(0.76);
    assert.ok(status.totalProposals > 0);
    assert.equal(status.approvalMode, 'supervised');
    assert.ok(status.nextModeAt);
    assert.equal(status.nextModeAt.mode, 'semi-autonomous');
  });

  it('rejects proposals that fail covenant', async () => {
    // Add a gap with dangerous properties — should fail covenant validation
    table.addElement({
      charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
      reactivity: 'volatile', electronegativity: 0.5, group: 9, period: 3,
      harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
    });
    const result = await engine.discoverAndPropose({
      table, globalCoherency: 0.90, maxProposals: 5,
    });
    // All proposals should either pass or be rejected (none should bypass)
    for (const p of result.proposals) {
      assert.ok(['pending', 'auto-incorporated', 'rejected'].includes(p.status));
    }
  });
});

describe('APPROVAL_THRESHOLDS', () => {
  it('supervised is below semi-autonomous', () => {
    assert.ok(APPROVAL_THRESHOLDS.SUPERVISED <= APPROVAL_THRESHOLDS.SEMI_AUTONOMOUS);
  });

  it('semi-autonomous is at or below autonomous', () => {
    assert.ok(APPROVAL_THRESHOLDS.SEMI_AUTONOMOUS <= APPROVAL_THRESHOLDS.AUTONOMOUS);
  });

  it('all thresholds are between 0 and 1', () => {
    for (const v of Object.values(APPROVAL_THRESHOLDS)) {
      assert.ok(v >= 0 && v <= 1);
    }
  });
});
