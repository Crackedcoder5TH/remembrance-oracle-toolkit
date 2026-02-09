const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PluginManager, HookEmitter, VALID_HOOKS } = require('../src/plugins/manager');

// ─── Mock oracle for testing ───
function createMockOracle() {
  return {
    patterns: { getAll: () => [], summary: () => ({ total: 0 }) },
    submit: () => ({ accepted: true }),
    query: () => [],
    search: () => [],
    store: { getAll: () => [] },
  };
}

describe('HookEmitter', () => {
  it('emits events to listeners', () => {
    const emitter = new HookEmitter();
    let called = false;
    emitter.on('test', () => { called = true; });
    emitter.emit('test');
    assert.strictEqual(called, true);
  });

  it('passes arguments to listeners', () => {
    const emitter = new HookEmitter();
    let received = null;
    emitter.on('test', (arg) => { received = arg; });
    emitter.emit('test', 'hello');
    assert.strictEqual(received, 'hello');
  });

  it('removes listeners with off()', () => {
    const emitter = new HookEmitter();
    let count = 0;
    const handler = () => { count++; };
    emitter.on('test', handler);
    emitter.emit('test');
    emitter.off('test', handler);
    emitter.emit('test');
    assert.strictEqual(count, 1);
  });

  it('pipeline transforms values', () => {
    const emitter = new HookEmitter();
    emitter.on('transform', (val) => ({ ...val, extra: true }));
    emitter.on('transform', (val) => ({ ...val, count: (val.count || 0) + 1 }));
    const result = emitter.pipeline('transform', { data: 'test' });
    assert.strictEqual(result.data, 'test');
    assert.strictEqual(result.extra, true);
    assert.strictEqual(result.count, 1);
  });

  it('pipeline returns original when no handlers modify', () => {
    const emitter = new HookEmitter();
    const original = { foo: 'bar' };
    const result = emitter.pipeline('noHandlers', original);
    assert.strictEqual(result, original);
  });

  it('clear() removes all listeners', () => {
    const emitter = new HookEmitter();
    let count = 0;
    emitter.on('a', () => count++);
    emitter.on('b', () => count++);
    emitter.clear();
    emitter.emit('a');
    emitter.emit('b');
    assert.strictEqual(count, 0);
  });

  it('clear(event) removes listeners for specific event', () => {
    const emitter = new HookEmitter();
    let countA = 0, countB = 0;
    emitter.on('a', () => countA++);
    emitter.on('b', () => countB++);
    emitter.clear('a');
    emitter.emit('a');
    emitter.emit('b');
    assert.strictEqual(countA, 0);
    assert.strictEqual(countB, 1);
  });
});

describe('PluginManager', () => {
  let oracle;
  let pm;

  beforeEach(() => {
    oracle = createMockOracle();
    pm = new PluginManager(oracle);
  });

  it('loads an inline plugin object', () => {
    const manifest = pm.load({
      name: 'test-plugin',
      version: '1.0.0',
      description: 'A test plugin',
      activate: () => {},
    });
    assert.strictEqual(manifest.name, 'test-plugin');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(pm.count, 1);
  });

  it('lists loaded plugins', () => {
    pm.load({ name: 'a', version: '1.0.0', activate: () => {} });
    pm.load({ name: 'b', version: '2.0.0', activate: () => {} });
    const list = pm.list();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].name, 'a');
    assert.strictEqual(list[1].name, 'b');
  });

  it('rejects plugin without name', () => {
    assert.throws(() => pm.load({ version: '1.0.0' }), /must have a "name"/);
  });

  it('rejects plugin without version', () => {
    assert.throws(() => pm.load({ name: 'bad' }), /must have a "version"/);
  });

  it('rejects duplicate plugin names', () => {
    pm.load({ name: 'dupe', version: '1.0.0', activate: () => {} });
    assert.throws(() => pm.load({ name: 'dupe', version: '1.0.0', activate: () => {} }), /already loaded/);
  });

  it('unloads a plugin', () => {
    pm.load({ name: 'removable', version: '1.0.0', activate: () => {} });
    assert.strictEqual(pm.count, 1);
    pm.unload('removable');
    assert.strictEqual(pm.count, 0);
  });

  it('throws when unloading unknown plugin', () => {
    assert.throws(() => pm.unload('nonexistent'), /not loaded/);
  });

  it('calls deactivate function on unload', () => {
    let deactivated = false;
    pm.load({
      name: 'with-deactivate',
      version: '1.0.0',
      activate: () => {},
      deactivate: () => { deactivated = true; },
    });
    pm.unload('with-deactivate');
    assert.strictEqual(deactivated, true);
  });

  it('calls cleanup returned from activate', () => {
    let cleaned = false;
    pm.load({
      name: 'with-cleanup',
      version: '1.0.0',
      activate: () => () => { cleaned = true; },
    });
    pm.unload('with-cleanup');
    assert.strictEqual(cleaned, true);
  });

  it('enable and disable plugins', () => {
    pm.load({ name: 'toggle', version: '1.0.0', activate: () => {} });
    pm.disable('toggle');
    assert.strictEqual(pm.list()[0].enabled, false);
    pm.enable('toggle');
    assert.strictEqual(pm.list()[0].enabled, true);
  });

  it('throws on enable/disable unknown plugin', () => {
    assert.throws(() => pm.enable('nope'), /not loaded/);
    assert.throws(() => pm.disable('nope'), /not loaded/);
  });

  it('provides oracle in context', () => {
    let receivedOracle = null;
    pm.load({
      name: 'context-test',
      version: '1.0.0',
      activate: (ctx) => { receivedOracle = ctx.oracle; },
    });
    assert.strictEqual(receivedOracle, oracle);
  });

  it('provides patterns in context', () => {
    let receivedPatterns = null;
    pm.load({
      name: 'patterns-test',
      version: '1.0.0',
      activate: (ctx) => { receivedPatterns = ctx.patterns; },
    });
    assert.strictEqual(receivedPatterns, oracle.patterns);
  });

  it('provides logger in context', () => {
    let receivedLogger = null;
    pm.load({
      name: 'logger-test',
      version: '1.0.0',
      activate: (ctx) => { receivedLogger = ctx.logger; },
    });
    assert.ok(receivedLogger);
    assert.strictEqual(typeof receivedLogger.info, 'function');
    assert.strictEqual(typeof receivedLogger.warn, 'function');
    assert.strictEqual(typeof receivedLogger.error, 'function');
    assert.strictEqual(typeof receivedLogger.debug, 'function');
  });
});

describe('Plugin Hooks', () => {
  let oracle;
  let pm;

  beforeEach(() => {
    oracle = createMockOracle();
    pm = new PluginManager(oracle);
  });

  it('beforeSubmit hook can modify input', () => {
    pm.load({
      name: 'submit-hook',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onBeforeSubmit(({ code, metadata }) => ({
          code: code + '\n// modified',
          metadata: { ...metadata, modified: true },
        }));
      },
    });

    const result = pm.beforeSubmit('const x = 1;', { tags: ['test'] });
    assert.ok(result.code.includes('// modified'));
    assert.strictEqual(result.metadata.modified, true);
  });

  it('afterSubmit hook receives result', () => {
    let received = null;
    pm.load({
      name: 'after-submit',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onAfterSubmit((result) => { received = result; });
      },
    });

    pm.afterSubmit({ accepted: true, entry: { id: '123' } });
    assert.ok(received);
    assert.strictEqual(received.accepted, true);
  });

  it('beforeValidate hook can modify options', () => {
    pm.load({
      name: 'validate-hook',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onBeforeValidate(({ code, options }) => ({
          code,
          options: { ...options, threshold: 0.8 },
        }));
      },
    });

    const result = pm.beforeValidate('code', { threshold: 0.6 });
    assert.strictEqual(result.options.threshold, 0.8);
  });

  it('afterValidate hook receives result', () => {
    let received = null;
    pm.load({
      name: 'after-validate',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onAfterValidate((result) => { received = result; });
      },
    });

    pm.afterValidate({ valid: true, errors: [] });
    assert.ok(received);
    assert.strictEqual(received.valid, true);
  });

  it('patternRegistered hook fires', () => {
    let received = null;
    pm.load({
      name: 'pattern-hook',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onPatternRegistered((pattern) => { received = pattern; });
      },
    });

    pm.patternRegistered({ id: '123', name: 'test' });
    assert.ok(received);
    assert.strictEqual(received.name, 'test');
  });

  it('candidateGenerated hook fires', () => {
    let received = null;
    pm.load({
      name: 'candidate-hook',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onCandidateGenerated((candidate) => { received = candidate; });
      },
    });

    pm.candidateGenerated({ id: '456', method: 'variant' });
    assert.ok(received);
    assert.strictEqual(received.method, 'variant');
  });

  it('search hook can filter results', () => {
    pm.load({
      name: 'search-hook',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onSearch(({ query, results }) => ({
          query,
          results: results.filter(r => r.score > 0.5),
        }));
      },
    });

    const result = pm.searchHook('test', [
      { name: 'a', score: 0.8 },
      { name: 'b', score: 0.3 },
      { name: 'c', score: 0.9 },
    ]);
    assert.strictEqual(result.results.length, 2);
  });

  it('resolve hook can modify decision', () => {
    pm.load({
      name: 'resolve-hook',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onResolve(({ request, result }) => ({
          request,
          result: { ...result, modified: true },
        }));
      },
    });

    const result = pm.resolveHook(
      { description: 'test' },
      { decision: 'PULL', confidence: 0.8 }
    );
    assert.strictEqual(result.result.modified, true);
  });

  it('multiple hooks chain in order', () => {
    const order = [];
    pm.load({
      name: 'chain-1',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onAfterSubmit(() => order.push('first'));
      },
    });
    pm.load({
      name: 'chain-2',
      version: '1.0.0',
      activate: (ctx) => {
        ctx.hooks.onAfterSubmit(() => order.push('second'));
      },
    });

    pm.afterSubmit({ accepted: true });
    assert.deepStrictEqual(order, ['first', 'second']);
  });
});

describe('Plugin file loading', () => {
  it('loads a plugin from a file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
    const pluginFile = path.join(tmpDir, 'test-plugin.js');
    fs.writeFileSync(pluginFile, `
      module.exports = {
        name: 'file-plugin',
        version: '1.0.0',
        activate(ctx) {
          ctx.logger.info('File plugin activated');
        }
      };
    `);

    const oracle = createMockOracle();
    const pm = new PluginManager(oracle);
    const manifest = pm.load(pluginFile);
    assert.strictEqual(manifest.name, 'file-plugin');
    assert.strictEqual(pm.count, 1);

    pm.unload('file-plugin');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws on missing file', () => {
    const oracle = createMockOracle();
    const pm = new PluginManager(oracle);
    assert.throws(() => pm.load('/nonexistent/plugin.js'), /not found/);
  });

  it('loads from pluginDir', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-dir-'));
    fs.writeFileSync(path.join(tmpDir, 'my-plugin.js'), `
      module.exports = { name: 'dir-plugin', version: '1.0.0', activate() {} };
    `);

    const oracle = createMockOracle();
    const pm = new PluginManager(oracle, { pluginDir: tmpDir });
    const manifest = pm.load('my-plugin.js');
    assert.strictEqual(manifest.name, 'dir-plugin');

    pm.unload('dir-plugin');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('VALID_HOOKS', () => {
  it('exports expected hook names', () => {
    assert.ok(Array.isArray(VALID_HOOKS));
    assert.ok(VALID_HOOKS.includes('beforeSubmit'));
    assert.ok(VALID_HOOKS.includes('afterSubmit'));
    assert.ok(VALID_HOOKS.includes('search'));
    assert.ok(VALID_HOOKS.includes('resolve'));
    assert.strictEqual(VALID_HOOKS.length, 8);
  });
});
