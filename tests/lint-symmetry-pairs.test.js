'use strict';

/**
 * Tests for the symmetry-pair (paired-operation balance) lint rule.
 *
 * Detection pattern #5 from the coherence-based bug taxonomy:
 * "If operation O exists, inverse O⁻¹ must exist."
 *
 * The rule flags function bodies that call the open side of a known
 * open/close pair more often than the close side. It's lexical, not
 * flow-sensitive, so tests cover the happy path, the setup-name
 * exemption, and the multi-pair case.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { lintCode } = require('../src/audit/lint-checkers');

function symmetryFindings(source) {
  const result = lintCode(source);
  return result.findings.filter(f => f.ruleId === 'lint/symmetry-pair');
}

describe('lint/symmetry-pair: paired-operation balance', () => {
  it('flags lock() without unlock()', () => {
    const source = `
      function transfer(from, to, amount) {
        const l = getMutex();
        l.lock();
        from.balance -= amount;
        to.balance += amount;
        // Missing l.unlock() — if the above throws, the lock leaks.
      }
    `;
    const findings = symmetryFindings(source);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /lock\/unlock/);
    assert.match(findings[0].message, /1 call\(s\) to lock/);
  });

  it('passes when lock() is paired with unlock()', () => {
    const source = `
      function safeTransfer(from, to, amount) {
        const l = getMutex();
        l.lock();
        try {
          from.balance -= amount;
          to.balance += amount;
        } finally {
          l.unlock();
        }
      }
    `;
    assert.equal(symmetryFindings(source).length, 0);
  });

  it('flags setInterval without clearInterval', () => {
    const source = `
      function startPoller(onTick) {
        const handle = setInterval(onTick, 1000);
        return handle;
      }
    `;
    // startPoller is a "start"-named function, so the setup exemption
    // should let this pass — teardown lives elsewhere.
    assert.equal(symmetryFindings(source).length, 0);
  });

  it('flags setInterval in non-setup function', () => {
    const source = `
      function pollAndReport(onTick) {
        setInterval(onTick, 1000);
        onTick();
        // No clearInterval anywhere.
      }
    `;
    const findings = symmetryFindings(source);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /setInterval\/clearInterval/);
  });

  it('catches subscribe/unsubscribe imbalance', () => {
    const source = `
      function wireBus(bus) {
        bus.subscribe('a', handler);
        bus.subscribe('b', handler);
        bus.unsubscribe('a', handler);
        // bus.unsubscribe('b', handler) is missing.
      }
    `;
    const findings = symmetryFindings(source);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /2 call\(s\) to subscribe.*1 to unsubscribe/);
  });

  it('allows balanced subscribe/unsubscribe', () => {
    const source = `
      function wire(bus) {
        bus.subscribe('a', h);
        bus.subscribe('b', h);
        bus.unsubscribe('a', h);
        bus.unsubscribe('b', h);
      }
    `;
    assert.equal(symmetryFindings(source).length, 0);
  });

  it('exempts setup-named functions from teardown requirement', () => {
    const source = `
      function setupListeners(el) {
        el.addEventListener('click', onClick);
        el.addEventListener('mouseover', onHover);
      }
    `;
    // setupListeners legitimately only opens — teardown is in destroy().
    assert.equal(symmetryFindings(source).length, 0);
  });

  it('exempts install/register/init/create/attach/bind/boot too', () => {
    const names = ['install', 'register', 'init', 'create', 'attach', 'bind', 'boot'];
    for (const name of names) {
      const source = `function ${name}Thing(el) { el.addEventListener('x', f); }`;
      assert.equal(symmetryFindings(source).length, 0, `${name} should be exempt`);
    }
  });

  it('catches multiple pair violations in one function', () => {
    const source = `
      function leaky() {
        const l = getMutex();
        l.lock();
        const bus = getBus();
        bus.subscribe('x', h);
        bus.subscribe('y', h);
        // Neither unlock() nor unsubscribe() are called.
      }
    `;
    const findings = symmetryFindings(source);
    const labels = findings.map(f => f.message).sort();
    assert.equal(findings.length, 2);
    assert.match(labels[0], /lock|subscribe/);
    assert.match(labels[1], /lock|subscribe/);
  });

  it('does not fire when close is called more than open', () => {
    // Calling close() more often than open() isn't a symmetry bug —
    // it might be defensive cleanup. Don't flag.
    const source = `
      function defensive(bus) {
        bus.unsubscribe('x', h);
        bus.unsubscribe('y', h);
        bus.subscribe('x', h);
      }
    `;
    assert.equal(symmetryFindings(source).length, 0);
  });

  it('does not false-positive on strings or comments', () => {
    // The parser should strip strings and comments, so "lock" inside
    // a string literal must not be counted as a call.
    const source = `
      function docs() {
        const doc = "How to lock() and unlock() resources";
        console.log(doc);
      }
    `;
    assert.equal(symmetryFindings(source).length, 0);
  });
});
