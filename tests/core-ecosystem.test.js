'use strict';

/**
 * Tests for the ecosystem discovery + auto-wire layer.
 *
 * Covers:
 *   - Static manifest discovery (filesystem walk)
 *   - Runtime registry announce / read
 *   - Health checks (CLI and HTTP)
 *   - byName / byCapability queries
 *   - autoWireAll invokes per-peer bindings
 *   - todosAllClosed compliance check (friction-exit mitigation)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  discoverStatic, discoverEcosystem, announceModule, readRegistry,
  autoWireAll, loadSelfManifest,
} = require('../src/core/ecosystem');

const { resetEventBus } = require('../src/core/events');

function writeManifest(dir, manifest) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'remembrance.json'), JSON.stringify(manifest, null, 2));
}

describe('ecosystem: static manifest discovery', () => {
  let root;
  beforeEach(() => {
    resetEventBus();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-'));
  });
  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('finds a manifest in the root directory', () => {
    writeManifest(root, {
      name: 'test-module',
      version: '1.0.0',
      role: 'test',
      language: 'javascript',
      capabilities: ['foo', 'bar'],
    });
    const found = discoverStatic({ roots: [root] });
    assert.ok(found.length >= 1);
    const m = found.find(m => m.name === 'test-module');
    assert.ok(m);
    assert.equal(m.version, '1.0.0');
    assert.equal(m.repoRoot, root);
  });

  it('finds manifests in sibling directories', () => {
    writeManifest(path.join(root, 'alpha'), { name: 'alpha-svc', version: '0.1.0', role: 'a' });
    writeManifest(path.join(root, 'beta'),  { name: 'beta-svc',  version: '0.2.0', role: 'b' });
    const found = discoverStatic({ roots: [root] });
    const names = found.map(m => m.name);
    assert.ok(names.includes('alpha-svc'));
    assert.ok(names.includes('beta-svc'));
  });

  it('skips duplicates (same name in two roots)', () => {
    writeManifest(path.join(root, 'alpha'), { name: 'same', version: '1.0.0' });
    writeManifest(path.join(root, 'beta'),  { name: 'same', version: '2.0.0' });
    const found = discoverStatic({ roots: [root] });
    const same = found.filter(m => m.name === 'same');
    assert.equal(same.length, 1);
  });

  it('ignores missing directories gracefully', () => {
    const found = discoverStatic({ roots: ['/nonexistent-path-zzz'] });
    assert.ok(Array.isArray(found));
  });
});

describe('ecosystem: runtime registry', () => {
  let root;
  beforeEach(() => {
    resetEventBus();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-reg-'));
    writeManifest(root, {
      name: 'announce-test',
      version: '1.0.0',
      role: 'test',
      api: { host: 'localhost', port: 9999, healthPath: '/health' },
    });
  });
  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('announces a module to the local registry', () => {
    const rec = announceModule(root);
    assert.ok(rec);
    assert.equal(rec.name, 'announce-test');
    assert.equal(rec.pid, process.pid);
    assert.equal(rec.port, 9999);
  });

  it('reads announced records back', () => {
    announceModule(root);
    const records = readRegistry(root);
    const mine = records.find(r => r.name === 'announce-test');
    assert.ok(mine);
    assert.equal(mine.port, 9999);
  });

  it('returns null when no manifest exists', () => {
    const noManifestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-none-'));
    try {
      const rec = announceModule(noManifestDir);
      assert.equal(rec, null);
    } finally {
      fs.rmSync(noManifestDir, { recursive: true, force: true });
    }
  });
});

describe('ecosystem: discoverEcosystem integration', () => {
  let root, subA, subB;
  beforeEach(() => {
    resetEventBus();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-int-'));
    subA = path.join(root, 'svc-a');
    subB = path.join(root, 'svc-b');
    writeManifest(subA, {
      name: 'svc-a',
      version: '1.0.0',
      role: 'cache',
      capabilities: ['cache', 'fast-read'],
      healthCheck: { command: 'true', timeoutMs: 2000 },
    });
    writeManifest(subB, {
      name: 'svc-b',
      version: '1.0.0',
      role: 'store',
      capabilities: ['store', 'persist'],
      healthCheck: { command: 'false', timeoutMs: 2000 },
    });
  });
  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns modules + alive + helpers', async () => {
    const eco = await discoverEcosystem({ roots: [root], checkHealth: true, emit: false });
    assert.ok(eco.modules.length >= 2);
    // svc-a has true as health check -> alive
    // svc-b has false -> not alive
    assert.ok(eco.byName('svc-a'));
    assert.ok(eco.byName('svc-b'));
    assert.equal(eco.byName('svc-a').health?.alive, true);
    assert.equal(eco.byName('svc-b').health?.alive, false);
  });

  it('byCapability filters modules by capability', async () => {
    const eco = await discoverEcosystem({ roots: [root], checkHealth: false, emit: false });
    const caches = eco.byCapability('cache');
    assert.ok(caches.some(m => m.name === 'svc-a'));
    assert.ok(!caches.some(m => m.name === 'svc-b'));
  });
});

describe('ecosystem: autoWireAll invokes bindings', () => {
  let root, peerDir;
  beforeEach(() => {
    resetEventBus();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'eco-wire-'));
    peerDir = path.join(root, 'peer');
    // A test binding file that records its invocation.
    const bindingPath = path.join(root, 'test-binding.js');
    fs.writeFileSync(bindingPath, `
      let _called = 0;
      module.exports = {
        wire(peer) { _called++; module.exports._lastPeer = peer; },
        _called: () => _called,
      };
    `);
    // Self manifest declaring the peer + autoWire path
    writeManifest(root, {
      name: 'self-module',
      version: '1.0.0',
      role: 'self',
      peers: {
        'peer-module': {
          role: 'peer',
          autoWire: 'test-binding.js',
        },
      },
    });
    // Peer manifest
    writeManifest(peerDir, {
      name: 'peer-module',
      version: '0.0.1',
      role: 'peer',
      capabilities: ['thing'],
      healthCheck: { command: 'true', timeoutMs: 2000 },
    });
  });
  afterEach(() => {
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  });

  it('invokes a peer binding when the peer is alive', async () => {
    const result = await autoWireAll({ repoRoot: root, roots: [root] });
    assert.ok(result.wired.length >= 1, `expected >=1 wired, got ${result.wired.length}`);
    const wired = result.wired.find(w => w.peer === 'peer-module');
    assert.ok(wired);
  });
});

describe('compliance: todosAllClosed check (friction-exit mitigation)', () => {
  const {
    startSession, recordEvent, saveSession, scoreCompliance, getCurrentSession,
  } = require('../src/core/compliance');
  const { resetCompliance } = require('../src/core/compliance');
  let tmp;
  beforeEach(() => {
    resetEventBus();
    resetCompliance();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compl-todo-'));
  });
  afterEach(() => {
    if (tmp && fs.existsSync(tmp)) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('no todos recorded = check passes by default', () => {
    const s = startSession(tmp);
    const score = scoreCompliance(s);
    assert.ok(!score.violations.some(v => v.check === 'todosAllClosed'));
  });

  it('open todo at score time drops the score', () => {
    const s = startSession(tmp);
    recordEvent(s, 'todo.open', { id: 't1', content: 'Write thing' });
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    assert.ok(score.violations.some(v => v.check === 'todosAllClosed'));
  });

  it('closed todo passes the check', () => {
    const s = startSession(tmp);
    recordEvent(s, 'todo.open',  { id: 't1', content: 'Write thing' });
    recordEvent(s, 'todo.close', { id: 't1' });
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    assert.ok(!score.violations.some(v => v.check === 'todosAllClosed'));
  });

  it('deferred todo also passes (explicit pause is fine)', () => {
    const s = startSession(tmp);
    recordEvent(s, 'todo.open',  { id: 't1', content: 'Write thing' });
    recordEvent(s, 'todo.defer', { id: 't1', reason: 'waiting on user' });
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    assert.ok(!score.violations.some(v => v.check === 'todosAllClosed'));
  });

  it('partial completion scores proportionally', () => {
    const s = startSession(tmp);
    recordEvent(s, 'todo.open',  { id: 't1' });
    recordEvent(s, 'todo.open',  { id: 't2' });
    recordEvent(s, 'todo.close', { id: 't1' });
    saveSession(s, tmp);
    const score = scoreCompliance(getCurrentSession(tmp));
    // At least one todo is still open → check must be violated
    assert.ok(score.violations.some(v => v.check === 'todosAllClosed'));
    // Stats should reflect 1 open / 2 total
    assert.equal(score.stats.todosOpen, 1);
    assert.equal(score.stats.todosTotal, 2);
  });
});
