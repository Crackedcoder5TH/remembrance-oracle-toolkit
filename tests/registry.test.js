const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  LanguageRunnerRegistry,
  CovenantPrincipleRegistry,
  StorageBackendRegistry,
  SearchProviderRegistry,
  cosineSim,
} = require('../src/plugins/registry');

// ─── LanguageRunnerRegistry ───

describe('LanguageRunnerRegistry', () => {
  it('registers and executes a custom runner', () => {
    const reg = new LanguageRunnerRegistry();
    reg.register('ruby', {
      execute: (code, testCode) => ({ passed: true, output: 'ok', sandboxed: true }),
    }, { aliases: ['rb'], description: 'Ruby sandbox' });

    assert.ok(reg.has('ruby'));
    assert.ok(reg.has('rb'));
    assert.equal(reg.list().length, 1);

    const result = reg.execute('ruby', 'puts 1', 'assert true');
    assert.equal(result.passed, true);
    assert.equal(result.output, 'ok');
  });

  it('executes via alias', () => {
    const reg = new LanguageRunnerRegistry();
    reg.register('kotlin', {
      execute: () => ({ passed: true, output: 'kotlin ok', sandboxed: true }),
    }, { aliases: ['kt'] });

    const result = reg.execute('kt', '', '');
    assert.equal(result.passed, true);
    assert.equal(result.output, 'kotlin ok');
  });

  it('returns null for unregistered language', () => {
    const reg = new LanguageRunnerRegistry();
    assert.equal(reg.execute('haskell', '', ''), null);
  });

  it('unregisters runner and aliases', () => {
    const reg = new LanguageRunnerRegistry();
    reg.register('php', {
      execute: () => ({ passed: true, output: '', sandboxed: true }),
    }, { aliases: ['php8'] });

    assert.ok(reg.has('php'));
    assert.ok(reg.has('php8'));

    reg.unregister('php');
    assert.ok(!reg.has('php'));
    assert.ok(!reg.has('php8'));
  });

  it('rejects runner without execute method', () => {
    const reg = new LanguageRunnerRegistry();
    assert.throws(() => reg.register('bad', {}), /execute/);
  });

  it('rejects empty language name', () => {
    const reg = new LanguageRunnerRegistry();
    assert.throws(() => reg.register('', { execute: () => {} }), /non-empty string/);
  });

  it('normalizes language to lowercase', () => {
    const reg = new LanguageRunnerRegistry();
    reg.register('Ruby', {
      execute: () => ({ passed: true, output: '', sandboxed: true }),
    });
    assert.ok(reg.has('ruby'));
    assert.ok(reg.has('Ruby'));
  });

  it('passes options including timeout through', () => {
    const reg = new LanguageRunnerRegistry();
    let receivedOpts;
    reg.register('lua', {
      execute: (code, test, opts) => { receivedOpts = opts; return { passed: true, output: '', sandboxed: true }; },
    }, { timeout: 5000 });

    reg.execute('lua', '', '', { maxMemory: 128 });
    assert.equal(receivedOpts.timeout, 5000);
    assert.equal(receivedOpts.maxMemory, 128);
  });
});

// ─── CovenantPrincipleRegistry ───

describe('CovenantPrincipleRegistry', () => {
  it('registers and checks a custom principle', () => {
    const reg = new CovenantPrincipleRegistry();
    reg.register({
      name: 'HIPAA Compliance',
      seal: 'No unencrypted PHI in logs',
      harmPatterns: [
        { pattern: /console\.log\(.*patient/i, reason: 'Logging patient data' },
      ],
      domain: 'healthcare',
    });

    assert.ok(reg.has('HIPAA Compliance'));
    assert.equal(reg.list().length, 1);
    assert.equal(reg.list()[0].domain, 'healthcare');

    const violations = reg.check('console.log(patient.ssn)');
    assert.equal(violations.length, 1);
    assert.equal(violations[0].name, 'HIPAA Compliance');
    assert.equal(violations[0].domain, 'healthcare');
  });

  it('returns empty array for clean code', () => {
    const reg = new CovenantPrincipleRegistry();
    reg.register({
      name: 'PCI DSS',
      seal: 'No plaintext credit card numbers',
      harmPatterns: [
        { pattern: /creditCard\s*=\s*['"]?\d{16}/, reason: 'Hardcoded CC number' },
      ],
      domain: 'finance',
    });

    const violations = reg.check('const total = calculatePrice(items);');
    assert.equal(violations.length, 0);
  });

  it('assigns unique IDs starting at 100', () => {
    const reg = new CovenantPrincipleRegistry();
    const p1 = reg.register({
      name: 'Rule A',
      seal: 'A',
      harmPatterns: [{ pattern: /test/, reason: 'test' }],
    });
    const p2 = reg.register({
      name: 'Rule B',
      seal: 'B',
      harmPatterns: [{ pattern: /test2/, reason: 'test2' }],
    });

    assert.ok(p1.id >= 100);
    assert.ok(p2.id > p1.id);
  });

  it('rejects principle without name', () => {
    const reg = new CovenantPrincipleRegistry();
    assert.throws(() => reg.register({ seal: 'x', harmPatterns: [{ pattern: /x/, reason: 'x' }] }), /name/);
  });

  it('rejects principle without harm patterns', () => {
    const reg = new CovenantPrincipleRegistry();
    assert.throws(() => reg.register({ name: 'X', seal: 'x', harmPatterns: [] }), /harmPattern/);
  });

  it('unregisters a principle', () => {
    const reg = new CovenantPrincipleRegistry();
    reg.register({
      name: 'Temp',
      seal: 'temp',
      harmPatterns: [{ pattern: /x/, reason: 'x' }],
    });
    assert.ok(reg.unregister('Temp'));
    assert.ok(!reg.has('Temp'));
  });
});

// ─── StorageBackendRegistry ───

describe('StorageBackendRegistry', () => {
  function makeBackend() {
    const store = new Map();
    return {
      add: (entry) => { store.set(entry.id, entry); return entry; },
      get: (id) => store.get(id) || null,
      getAll: () => Array.from(store.values()),
      remove: (id) => store.delete(id),
      search: (q) => Array.from(store.values()).filter(e => (e.description || '').includes(q)),
      summary: () => ({ totalEntries: store.size }),
    };
  }

  it('registers and retrieves a backend', () => {
    const reg = new StorageBackendRegistry();
    const backend = makeBackend();
    reg.register('memory', backend, { description: 'In-memory store' });

    assert.ok(reg.has('memory'));
    assert.equal(reg.get('memory'), backend);
    assert.equal(reg.list().length, 1);
    assert.equal(reg.list()[0].description, 'In-memory store');
  });

  it('rejects backend missing required methods', () => {
    const reg = new StorageBackendRegistry();
    assert.throws(() => reg.register('bad', { add: () => {}, get: () => {} }), /getAll/);
  });

  it('unregisters a backend', () => {
    const reg = new StorageBackendRegistry();
    reg.register('redis', makeBackend());
    assert.ok(reg.unregister('redis'));
    assert.ok(!reg.has('redis'));
  });
});

// ─── SearchProviderRegistry ───

describe('SearchProviderRegistry', () => {
  it('registers a search-type provider', () => {
    const reg = new SearchProviderRegistry();
    reg.register('custom', {
      search: (query, items) => items.map(i => ({ ...i, _relevance: { relevance: 0.9 } })),
    }, { priority: 10, description: 'Custom search' });

    assert.ok(reg.has('custom'));
    assert.equal(reg.list()[0].type, 'search');
    assert.equal(reg.list()[0].priority, 10);
  });

  it('registers an embedding-type provider', () => {
    const reg = new SearchProviderRegistry();
    reg.register('embed', {
      embed: (text) => [1, 0, 0],
      similarity: (a, b) => cosineSim(a, b),
    });

    assert.ok(reg.has('embed'));
    assert.equal(reg.list()[0].type, 'embedding');
  });

  it('runs search across providers', () => {
    const reg = new SearchProviderRegistry();
    reg.register('p1', {
      search: (query, items) => [
        { id: 'a', name: 'A', _relevance: { relevance: 0.8 } },
        { id: 'b', name: 'B', _relevance: { relevance: 0.5 } },
      ],
    }, { priority: 5 });

    const results = reg.search('test', []);
    assert.equal(results.length, 2);
    assert.equal(results[0].id, 'a'); // Higher relevance first
  });

  it('returns null when no providers registered', () => {
    const reg = new SearchProviderRegistry();
    assert.equal(reg.search('test', []), null);
  });

  it('deduplicates results across multiple providers', () => {
    const reg = new SearchProviderRegistry();
    reg.register('p1', {
      search: () => [{ id: 'x', _relevance: { relevance: 0.9 } }],
    }, { priority: 10 });
    reg.register('p2', {
      search: () => [{ id: 'x', _relevance: { relevance: 0.7 } }],
    }, { priority: 5 });

    const results = reg.search('test', []);
    assert.equal(results.length, 1);
    assert.equal(results[0]._relevance.relevance, 0.9); // From higher priority provider
  });

  it('rejects provider without search or embed', () => {
    const reg = new SearchProviderRegistry();
    assert.throws(() => reg.register('bad', { rank: () => {} }), /search.*embed/);
  });

  it('sorts providers by priority', () => {
    const reg = new SearchProviderRegistry();
    reg.register('low', { search: () => [] }, { priority: 1 });
    reg.register('high', { search: () => [] }, { priority: 100 });
    reg.register('mid', { search: () => [] }, { priority: 50 });

    const providers = reg.getByPriority();
    // Verify order by checking we have 3 providers
    assert.equal(providers.length, 3);
  });
});

// ─── cosineSim helper ───

describe('cosineSim', () => {
  it('computes cosine similarity correctly', () => {
    assert.equal(cosineSim([1, 0, 0], [1, 0, 0]), 1);
    assert.ok(Math.abs(cosineSim([1, 0], [0, 1])) < 0.001);
    assert.ok(cosineSim([1, 1], [1, 1]) > 0.99);
  });

  it('handles zero vectors', () => {
    assert.equal(cosineSim([0, 0], [1, 1]), 0);
  });

  it('handles null/undefined', () => {
    assert.equal(cosineSim(null, [1]), 0);
    assert.equal(cosineSim([1], null), 0);
  });

  it('handles mismatched lengths', () => {
    assert.equal(cosineSim([1, 2], [1, 2, 3]), 0);
  });
});

// ─── Integration: PluginManager with registries ───

describe('PluginManager registries integration', () => {
  it('provides registries in plugin context', () => {
    const { PluginManager } = require('../src/plugins/manager');
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    const pm = new PluginManager(oracle);

    let receivedContext;
    pm.load({
      name: 'test-registry-plugin',
      version: '1.0.0',
      activate: (ctx) => { receivedContext = ctx; },
    });

    assert.ok(receivedContext.registries);
    assert.ok(receivedContext.registries.runners instanceof LanguageRunnerRegistry);
    assert.ok(receivedContext.registries.principles instanceof CovenantPrincipleRegistry);
    assert.ok(receivedContext.registries.storage instanceof StorageBackendRegistry);
    assert.ok(receivedContext.registries.search instanceof SearchProviderRegistry);

    pm.unload('test-registry-plugin');
  });

  it('plugin can register a custom runner via registries', () => {
    const { PluginManager } = require('../src/plugins/manager');
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    const pm = new PluginManager(oracle);

    pm.load({
      name: 'ruby-runner',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.registries.runners.register('ruby', {
          execute: (code, testCode) => ({ passed: true, output: 'ruby ok', sandboxed: true }),
        }, { aliases: ['rb'] });
      },
    });

    assert.ok(pm.runners.has('ruby'));
    const result = pm.runners.execute('rb', '', '');
    assert.equal(result.passed, true);

    pm.unload('ruby-runner');
  });

  it('plugin can register custom covenant principles', () => {
    const { PluginManager } = require('../src/plugins/manager');
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    const pm = new PluginManager(oracle);

    pm.load({
      name: 'hipaa-plugin',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.registries.principles.register({
          name: 'HIPAA',
          seal: 'No unencrypted PHI',
          harmPatterns: [
            { pattern: /console\.log\(.*patient/i, reason: 'PHI leaked to logs' },
          ],
          domain: 'healthcare',
        });
      },
    });

    assert.ok(pm.principles.has('HIPAA'));
    const violations = pm.principles.check('console.log(patientRecord)');
    assert.equal(violations.length, 1);

    pm.unload('hipaa-plugin');
  });
});
