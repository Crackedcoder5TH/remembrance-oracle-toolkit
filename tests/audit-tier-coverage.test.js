'use strict';

/**
 * Tests for src/audit/tier-coverage.js — architectural self-similarity
 * checker that catches new modules using only a strict subset of a
 * multi-tier codebase's tiers.
 *
 * Covers: manifest loading, identifier extraction, tier matching,
 * opt-out markers, coverage thresholds, edge cases.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  checkFile,
  loadArchitectureManifest,
  findManifestForFile,
  extractCalledIdentifiers,
  tiersTouched,
  findOptOut,
} = require('../src/audit/tier-coverage');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tier-coverage-'));
}

function writeFile(dir, name, content) {
  const full = path.join(dir, name);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

const THREE_TIER_MANIFEST = {
  codebase: 'test-codebase',
  tiers: [
    {
      name: 'L1',
      description: 'Base pattern library',
      entry_points: ['pattern_library', '_find_best_blend'],
    },
    {
      name: 'L2',
      description: 'Meta-patterns',
      entry_points: ['l2_library', 'compress_recursive', 'compress_whole_recursive'],
      composes: ['L1'],
    },
    {
      name: 'L3',
      description: 'Meta-meta-patterns + adaptive depth',
      entry_points: ['l3_library', 'compress_adaptive', 'AdaptiveVoidCompressor'],
      composes: ['L1', 'L2'],
    },
  ],
};

describe('extractCalledIdentifiers', () => {
  it('finds function calls in JavaScript', () => {
    const ids = extractCalledIdentifiers('const x = foo(); bar(1, 2); baz.qux();');
    assert.ok(ids.has('foo'));
    assert.ok(ids.has('bar'));
    assert.ok(ids.has('qux'));
  });

  it('finds attribute access', () => {
    const ids = extractCalledIdentifiers('const a = obj.pattern_library; self.l2_library = {};');
    assert.ok(ids.has('pattern_library'));
    assert.ok(ids.has('l2_library'));
  });

  it('finds Python method calls', () => {
    const ids = extractCalledIdentifiers(
      'def go(self):\n    return self._find_best_blend(chunk)'
    );
    assert.ok(ids.has('_find_best_blend'));
  });

  it('finds identifiers in import statements', () => {
    const ids = extractCalledIdentifiers(
      'from void_compressor_v5 import AdaptiveVoidCompressor\nimport void_compressor_v3'
    );
    assert.ok(ids.has('AdaptiveVoidCompressor'));
    assert.ok(ids.has('void_compressor_v3'));
  });
});

describe('tiersTouched', () => {
  it('returns only tiers whose entry points appear in the called set', () => {
    const called = new Set(['_find_best_blend', 'pattern_library']);
    const result = tiersTouched(called, THREE_TIER_MANIFEST);
    assert.deepEqual(result, ['L1']);
  });

  it('returns transitive closure: touching L3 implies L1 + L2 via composes', () => {
    const called = new Set(['compress_adaptive']);
    const result = tiersTouched(called, THREE_TIER_MANIFEST);
    assert.deepEqual(result, ['L1', 'L2', 'L3']);
  });

  it('returns transitive closure: touching L2 implies L1', () => {
    const called = new Set(['compress_whole_recursive']);
    const result = tiersTouched(called, THREE_TIER_MANIFEST);
    assert.deepEqual(result, ['L1', 'L2']);
  });

  it('L1 alone does not imply higher tiers (no upward composition)', () => {
    const called = new Set(['_find_best_blend']);
    const result = tiersTouched(called, THREE_TIER_MANIFEST);
    assert.deepEqual(result, ['L1']);
  });

  it('returns empty when nothing matches', () => {
    const called = new Set(['unrelated_fn']);
    const result = tiersTouched(called, THREE_TIER_MANIFEST);
    assert.deepEqual(result, []);
  });
});

describe('findOptOut', () => {
  it('detects JavaScript // opt-out comment', () => {
    const code = '// single-tier-by-design: pure utility\nfunction go() {}';
    assert.equal(findOptOut(code), 'pure utility');
  });

  it('detects Python # opt-out comment', () => {
    const code = '"""docstring"""\n# single-tier-by-design: bootstrap scaffolding\ndef go(): pass';
    assert.equal(findOptOut(code), 'bootstrap scaffolding');
  });

  it('returns null when no opt-out marker is present', () => {
    assert.equal(findOptOut('function go() {}'), null);
  });

  it('requires the marker in the first 50 lines', () => {
    const lines = Array(60).fill('// filler');
    lines.push('// single-tier-by-design: buried');
    assert.equal(findOptOut(lines.join('\n')), null);
  });
});

describe('loadArchitectureManifest + findManifestForFile', () => {
  let root;
  beforeEach(() => { root = makeTempRepo(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('loads a valid manifest', () => {
    const p = writeFile(root, 'architecture.json', JSON.stringify(THREE_TIER_MANIFEST));
    const m = loadArchitectureManifest(p);
    assert.ok(m);
    assert.equal(m.tiers.length, 3);
  });

  it('returns null for a missing manifest', () => {
    assert.equal(loadArchitectureManifest(path.join(root, 'nope.json')), null);
  });

  it('returns null for malformed JSON', () => {
    const p = writeFile(root, 'architecture.json', 'not json');
    assert.equal(loadArchitectureManifest(p), null);
  });

  it('walks up the directory tree to find the nearest manifest', () => {
    writeFile(root, 'architecture.json', JSON.stringify(THREE_TIER_MANIFEST));
    const deepFile = writeFile(root, 'src/deep/nested/module.py', 'pass');
    const found = findManifestForFile(deepFile, { stopDir: root });
    assert.ok(found);
    assert.equal(path.basename(found), 'architecture.json');
  });

  it('returns null when no manifest exists anywhere above the file', () => {
    const file = writeFile(root, 'src/module.py', 'pass');
    const found = findManifestForFile(file, { stopDir: root });
    assert.equal(found, null);
  });
});

describe('checkFile — full pipeline', () => {
  let root;
  beforeEach(() => { root = makeTempRepo(); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function setupRepo(moduleContent, manifest = THREE_TIER_MANIFEST) {
    writeFile(root, 'architecture.json', JSON.stringify(manifest));
    return writeFile(root, 'new_module.py', moduleContent);
  }

  it('flags a module that touches only L1 when the codebase has L1/L2/L3', () => {
    const modulePath = setupRepo(`
from void_compressor_v3 import VoidCompressorV3

def go(block):
    vc = VoidCompressorV3()
    blend = vc._find_best_blend(block)
    return vc.pattern_library[blend.name1]
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 1, 'Expected a single tier-coverage finding');
    const f = result.findings[0];
    assert.equal(f.bugClass, 'tier-coverage');
    assert.equal(f.severity, 'medium');
    assert.deepEqual(result.tiersTouched, ['L1']);
    assert.deepEqual(f.fractalGap.tiersMissing, ['L2', 'L3']);
    assert.match(f.reality, /L2/);
    assert.match(f.reality, /L3/);
  });

  it('passes a module that touches L1 + L2 (meets default min_coverage=2)', () => {
    const modulePath = setupRepo(`
from void_compressor_v4 import V4

def go(block):
    v4 = V4()
    blend = v4._find_best_blend(block)
    return v4.compress_whole_recursive(block)
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 0);
    assert.deepEqual(result.tiersTouched, ['L1', 'L2']);
  });

  it('passes a module that touches L1 + L2 + L3', () => {
    const modulePath = setupRepo(`
from void_compressor_v5 import AdaptiveVoidCompressor

def go(block):
    c = AdaptiveVoidCompressor()
    return c.compress_adaptive(block)
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 0);
    assert.ok(result.tiersTouched.includes('L3'));
  });

  it('respects an explicit single-tier-by-design opt-out', () => {
    const modulePath = setupRepo(`
# single-tier-by-design: pure L1 utility for unit testing
from void_compressor_v3 import VoidCompressorV3

def go():
    return VoidCompressorV3().pattern_library
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 0);
    assert.equal(result.optOut, 'pure L1 utility for unit testing');
  });

  it('does not flag files that do not touch any tier at all', () => {
    const modulePath = setupRepo(`
def unrelated():
    return 42
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 0);
    assert.deepEqual(result.tiersTouched, []);
  });

  it('respects manifest.ignore glob list', () => {
    const manifest = {
      ...THREE_TIER_MANIFEST,
      ignore: ['tests'],
    };
    writeFile(root, 'architecture.json', JSON.stringify(manifest));
    const modulePath = writeFile(root, 'tests/test_thing.py', `
from void_compressor_v3 import V3
V3()._find_best_blend(b)
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 0);
  });

  it('respects a custom min_coverage of 1', () => {
    const manifest = { ...THREE_TIER_MANIFEST, min_coverage: 1 };
    writeFile(root, 'architecture.json', JSON.stringify(manifest));
    const modulePath = writeFile(root, 'new.py', `
from void_compressor_v3 import V3
V3()._find_best_blend(b)
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 0);
  });

  it('respects a custom min_coverage of 3 (all tiers required)', () => {
    const manifest = { ...THREE_TIER_MANIFEST, min_coverage: 3 };
    writeFile(root, 'architecture.json', JSON.stringify(manifest));
    const modulePath = writeFile(root, 'new.py', `
from void_compressor_v4 import V4
v = V4()
v._find_best_blend(b)
v.compress_whole_recursive(b)
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 1);
    assert.deepEqual(result.findings[0].fractalGap.tiersMissing, ['L3']);
  });

  it('emits no finding when no manifest is present', () => {
    const modulePath = writeFile(root, 'lonely.py', `
from void_compressor_v3 import V3
V3()._find_best_blend(b)
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 0);
    assert.equal(result.manifestPath, null);
  });

  it('includes a helpful suggestion message with missing tier descriptions', () => {
    const modulePath = setupRepo(`
from void_compressor_v3 import V3
V3()._find_best_blend(b)
`);
    const result = checkFile(modulePath, { stopDir: root });
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0].suggestion, /single-tier-by-design/);
    assert.match(result.findings[0].suggestion, /L2: Meta-patterns/);
    assert.match(result.findings[0].suggestion, /L3: Meta-meta-patterns/);
  });
});
