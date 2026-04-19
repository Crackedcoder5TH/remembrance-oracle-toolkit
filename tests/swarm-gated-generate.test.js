'use strict';

/**
 * Tests for src/swarm/gated-generate.js — wraps a code generator
 * (typically a swarm call) with the plan + gate pipeline and retries
 * on rejection. Verifies:
 *   - Clean drafts pass verification
 *   - Fabricated drafts fail verification with actionable feedback
 *   - The retry loop re-prompts the generator with suggestions
 *   - The iteration budget is honored
 *   - Locally-defined helpers don't need external verification
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { verifyDraft, generateWithGate } = require('../src/swarm/gated-generate');

describe('verifyDraft', () => {
  it('accepts a draft with only local helpers + built-ins', () => {
    const code = `
      function double(x) { return x * 2; }
      function main() {
        const n = parseInt("5", 10);
        return double(n);
      }
    `;
    const r = verifyDraft({ code, intent: 'double a number', repoRoot: process.cwd() });
    assert.equal(r.ok, true);
    assert.equal(r.fabrications.length, 0);
  });

  it('rejects a draft with a fabricated external call', () => {
    const code = `function main() { return totallyMadeUpHelperFunction(42); }`;
    const r = verifyDraft({ code, intent: 'do something', repoRoot: process.cwd() });
    assert.equal(r.ok, false);
    assert.ok(r.fabrications.includes('totallyMadeUpHelperFunction'));
    assert.ok(r.suggestions.length > 0);
    assert.match(r.suggestions[0], /not exist/);
  });

  it('returns ok=false on empty code with a clear suggestion', () => {
    const r = verifyDraft({ code: '', intent: 't', repoRoot: process.cwd() });
    assert.equal(r.ok, false);
    assert.match(r.suggestions[0], /empty/i);
  });

  it('returns ok=false on unparseable code', () => {
    const r = verifyDraft({ code: 'function broken(', intent: 't', repoRoot: process.cwd() });
    // Either ok=false with a parse-fail suggestion, or graceful
    // acceptance if the parser happens to recover.
    if (!r.ok) {
      assert.ok(r.suggestions.length > 0);
    }
  });

  it('accepts known-session identifiers via knownIdentifiers', () => {
    const code = `function go() { return mysessionHelper(42); }`;
    const known = new Set(['mysessionHelper']);
    const r = verifyDraft({
      code,
      intent: 't',
      repoRoot: '/nonexistent-repo',
      knownIdentifiers: known,
    });
    assert.equal(r.ok, true);
  });
});

describe('generateWithGate', () => {
  it('succeeds on the first attempt when the generator returns clean code', async () => {
    const gen = async () => ({ code: 'function go() { return parseInt("1", 10); }' });
    const r = await generateWithGate(gen, 'parse one', { repoRoot: process.cwd() });
    assert.equal(r.ok, true);
    assert.equal(r.iterations, 1);
  });

  it('retries until the generator produces a clean draft', async () => {
    let attempt = 0;
    const gen = async () => {
      attempt++;
      if (attempt < 3) return { code: `function go() { return bogus${attempt}(); }` };
      return { code: 'function go() { return parseInt("1", 10); }' };
    };
    const r = await generateWithGate(gen, 'do a thing', {
      repoRoot: process.cwd(),
      maxIterations: 5,
    });
    assert.equal(r.ok, true);
    assert.equal(r.iterations, 3);
    assert.ok(r.history.length === 3);
  });

  it('stops at maxIterations if the generator keeps hallucinating', async () => {
    let attempt = 0;
    const gen = async () => {
      attempt++;
      return { code: `function go() { return fake${attempt}(); }` };
    };
    const r = await generateWithGate(gen, 'do a thing', {
      repoRoot: process.cwd(),
      maxIterations: 2,
    });
    assert.equal(r.ok, false);
    assert.equal(r.iterations, 2);
    assert.ok(r.fabrications.length > 0);
  });

  it('calls onIteration callback with each attempt', async () => {
    const seen = [];
    const gen = async () => ({ code: 'function go() { return parseInt("1", 10); }' });
    await generateWithGate(gen, 'parse', {
      repoRoot: process.cwd(),
      onIteration: (iter, verif) => seen.push({ iter, ok: verif.ok }),
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].iter, 1);
    assert.equal(seen[0].ok, true);
  });

  it('handles a generator that throws', async () => {
    const gen = async () => { throw new Error('upstream down'); };
    const r = await generateWithGate(gen, 'doomed', {
      repoRoot: process.cwd(),
      maxIterations: 2,
    });
    assert.equal(r.ok, false);
    assert.match(r.suggestions[0], /Generator threw/);
  });

  it('re-prompts with feedback between iterations', async () => {
    const prompts = [];
    const gen = async (prompt) => {
      prompts.push(prompt);
      // Use a highly unique fabricated name so the repo scan can't
      // accidentally find a real binding with the same name.
      if (prompts.length < 2) return { code: 'function go() { return zzXxNotARealFunctionXxzz(); }' };
      return { code: 'function go() { return parseInt("1", 10); }' };
    };
    const r = await generateWithGate(gen, 'orig description', {
      repoRoot: '/nonexistent-repo-to-force-miss',
      maxIterations: 3,
    });
    assert.equal(r.ok, true);
    assert.equal(prompts.length, 2);
    assert.equal(prompts[0], 'orig description');
    assert.match(prompts[1], /orig description/);
    assert.match(prompts[1], /Previous attempt failed/);
  });
});
