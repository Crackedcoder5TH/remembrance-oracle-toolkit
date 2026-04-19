'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { LivingCovenant, EVOLVED_PRINCIPLE_TEMPLATES } = require('../src/core/living-covenant');

describe('LivingCovenant', () => {
  let tmpDir, covenant;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'living-covenant-'));
    covenant = new LivingCovenant({
      storagePath: path.join(tmpDir, 'covenant.json'),
      repoRoot: tmpDir,
    });
  });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('starts with zero active evolved principles', () => {
    assert.equal(covenant.size, 0);
  });

  it('activates principles when coherency crosses threshold', () => {
    const result = covenant.evolve(0.82);
    assert.ok(result.activated.length >= 1, 'Should activate at least one principle at 0.82');
    assert.ok(covenant.size >= 1);
    // The first two templates have thresholds at 0.80 and 0.82
    const names = result.activated.map(a => a.name);
    assert.ok(names.some(n => n.includes('Composition Safety')), 'Composition Safety should activate at 0.82');
  });

  it('does not re-activate already active principles', () => {
    covenant.evolve(0.82);
    const before = covenant.size;
    const second = covenant.evolve(0.82);
    assert.equal(second.activated.length, 0);
    assert.equal(covenant.size, before);
  });

  it('queues principles above current coherency as pending', () => {
    const result = covenant.evolve(0.75);
    assert.ok(result.pending.length > 0, 'Should have pending principles');
    assert.ok(result.pending.some(p => p.coherencyThreshold > 0.75));
  });

  it('activates more principles at higher coherency', () => {
    covenant.evolve(0.75);
    const sizeAtLow = covenant.size;
    covenant.evolve(0.91);
    assert.ok(covenant.size > sizeAtLow, 'Higher coherency should unlock more');
  });

  it('persists activated principles to disk', () => {
    covenant.evolve(0.85);
    const saved = covenant.size;
    // Load from same path — should recover
    const reloaded = new LivingCovenant({
      storagePath: path.join(tmpDir, 'covenant.json'),
      repoRoot: tmpDir,
    });
    assert.equal(reloaded.size, saved);
  });

  it('activated principles persist even if coherency drops', () => {
    covenant.evolve(0.85);
    const activated = covenant.size;
    // Coherency drops — principles stay
    const result = covenant.evolve(0.70);
    assert.equal(covenant.size, activated, 'Principles must never be deactivated');
  });

  it('check() runs active evolved principles on code', () => {
    // Activate composition safety
    covenant.evolve(0.82);
    // Code with volatile + harmful composition
    const bad = `
      fn.atomicProperties = { reactivity: 'volatile', harmPotential: 'moderate' };
    `;
    const result = covenant.check(bad);
    assert.ok(result.violations.length > 0, 'Should catch volatile + harmful composition');
    assert.ok(result.violations[0].evolved);
  });

  it('check() passes clean code through evolved principles', () => {
    covenant.evolve(0.82);
    const good = 'function add(a, b) { return a + b; }';
    const result = covenant.check(good);
    assert.equal(result.violations.length, 0);
  });

  it('status() shows correct counts', () => {
    covenant.evolve(0.85);
    const status = covenant.status(0.85);
    assert.equal(status.foundingPrinciples, 15);
    assert.ok(status.activePrinciples >= 2);
    assert.equal(status.totalPrinciples, 15 + status.activePrinciples);
  });

  it('evolved-covenant-self-reference blocks bypass attempts', () => {
    covenant.evolve(0.90); // Activates up to 0.90 threshold
    const bypassCode = `
      const options = { skipCovenant: true };
      validateCode(code, options);
    `;
    const result = covenant.check(bypassCode);
    const bypassViolation = result.violations.find(v => v.id === 'evolved-covenant-self-reference');
    assert.ok(bypassViolation, 'Should catch bypass attempts');
  });
});

describe('EVOLVED_PRINCIPLE_TEMPLATES', () => {
  it('has templates for 7 coherency levels', () => {
    assert.ok(EVOLVED_PRINCIPLE_TEMPLATES.length >= 7);
  });

  it('all templates have required fields', () => {
    for (const t of EVOLVED_PRINCIPLE_TEMPLATES) {
      assert.ok(t.id, `Missing id on template`);
      assert.ok(t.name, `Missing name on ${t.id}`);
      assert.ok(typeof t.coherencyThreshold === 'number', `Missing threshold on ${t.id}`);
      assert.ok(typeof t.check === 'function', `Missing check on ${t.id}`);
    }
  });

  it('thresholds are in ascending order', () => {
    for (let i = 1; i < EVOLVED_PRINCIPLE_TEMPLATES.length; i++) {
      assert.ok(
        EVOLVED_PRINCIPLE_TEMPLATES[i].coherencyThreshold >= EVOLVED_PRINCIPLE_TEMPLATES[i - 1].coherencyThreshold,
        `Template ${EVOLVED_PRINCIPLE_TEMPLATES[i].id} has lower threshold than ${EVOLVED_PRINCIPLE_TEMPLATES[i - 1].id}`
      );
    }
  });

  it('all thresholds are above the founding covenant baseline (0.68)', () => {
    for (const t of EVOLVED_PRINCIPLE_TEMPLATES) {
      assert.ok(t.coherencyThreshold >= 0.68, `${t.id} threshold ${t.coherencyThreshold} is below 0.68`);
    }
  });
});
