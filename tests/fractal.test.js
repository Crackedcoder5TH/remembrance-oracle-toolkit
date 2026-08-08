const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { structuralFingerprint, reconstruct, extractTemplates, detectFamilies, compressionStats } = require('../src/compression/fractal');

describe('Fractal Compression', () => {

  describe('structuralFingerprint', () => {

    it('should produce identical fingerprints for structurally identical functions with different names', () => {
      const codeA = 'function add(a, b) { return a + b; }';
      const codeB = 'function sum(x, y) { return x + y; }';
      const fpA = structuralFingerprint(codeA, 'javascript');
      const fpB = structuralFingerprint(codeB, 'javascript');
      assert.equal(fpA.hash, fpB.hash, 'Same structure should produce same hash');
    });

    it('should produce different fingerprints for structurally different functions', () => {
      const codeA = 'function add(a, b) { return a + b; }';
      const codeB = 'function greet(name) { if (name) { return "Hello " + name; } return "Hi"; }';
      const fpA = structuralFingerprint(codeA, 'javascript');
      const fpB = structuralFingerprint(codeB, 'javascript');
      assert.notEqual(fpA.hash, fpB.hash, 'Different structure should produce different hash');
    });

    it('should extract placeholders for identifiers, strings, and numbers', () => {
      const code = 'const delay = 300;';
      const fp = structuralFingerprint(code, 'javascript');
      assert.ok(fp.skeleton.includes('$ID_'), 'Should have identifier placeholder');
      assert.ok(fp.skeleton.includes('$LIT_'), 'Should have literal placeholder');
      assert.ok(Object.values(fp.placeholders).includes('delay'), 'Should capture identifier value');
      assert.ok(Object.values(fp.placeholders).includes('300'), 'Should capture literal value');
    });

    it('should preserve keywords as structural elements', () => {
      const code = 'function test() { return true; }';
      const fp = structuralFingerprint(code, 'javascript');
      assert.ok(fp.skeleton.includes('function'), 'function keyword preserved');
      assert.ok(fp.skeleton.includes('return'), 'return keyword preserved');
      assert.ok(fp.skeleton.includes('true'), 'true keyword preserved');
    });

    it('should handle empty code', () => {
      const fp = structuralFingerprint('', 'javascript');
      assert.equal(fp.skeleton, '');
      assert.deepEqual(fp.placeholders, {});
    });

    it('should handle Python code via generic tokenizer', () => {
      const code = 'def add(a, b):\n    return a + b';
      const fp = structuralFingerprint(code, 'python');
      assert.ok(fp.skeleton.includes('def'), 'Python keywords preserved');
      assert.ok(fp.skeleton.includes('return'), 'Python return preserved');
      assert.ok(fp.hash, 'Should produce a hash');
    });

    it('should handle Go code', () => {
      const code = 'func add(a int, b int) int { return a + b }';
      const fp = structuralFingerprint(code, 'go');
      assert.ok(fp.skeleton.includes('func'), 'Go func keyword preserved');
      assert.ok(fp.skeleton.includes('return'), 'Go return preserved');
    });

    it('should handle Rust code', () => {
      const code = 'fn add(a: i32, b: i32) -> i32 { return a + b; }';
      const fp = structuralFingerprint(code, 'rust');
      assert.ok(fp.skeleton.includes('fn'), 'Rust fn keyword preserved');
      assert.ok(fp.skeleton.includes('return'), 'Rust return preserved');
    });
  });

  describe('reconstruct', () => {

    it('should reconstruct code from skeleton and delta', () => {
      const code = 'function add(a, b) { return a + b; }';
      const fp = structuralFingerprint(code, 'javascript');
      const result = reconstruct(fp.skeleton, fp.placeholders);
      // The reconstructed form should be token-equivalent (whitespace may differ)
      assert.ok(result.includes('add'), 'Should contain original identifier');
      assert.ok(result.includes('return'), 'Should contain return keyword');
    });

    it('should handle empty skeleton', () => {
      assert.equal(reconstruct('', {}), '');
    });

    it('should handle skeleton with no placeholders', () => {
      assert.equal(reconstruct('return true', {}), 'return true');
    });

    it('should replace all placeholders correctly', () => {
      const skeleton = 'const $ID_0 = $LIT_0';
      const delta = { $ID_0: 'count', $LIT_0: '42' };
      assert.equal(reconstruct(skeleton, delta), 'const count = 42');
    });
  });

  describe('extractTemplates', () => {

    it('should group structurally identical patterns into families', () => {
      const patterns = [
        { id: 'p1', name: 'add', code: 'function add(a, b) { return a + b; }', language: 'javascript' },
        { id: 'p2', name: 'sum', code: 'function sum(x, y) { return x + y; }', language: 'javascript' },
        { id: 'p3', name: 'greet', code: 'function greet(name) { if (name) { return "Hello"; } }', language: 'javascript' },
      ];
      const { families, singletons } = extractTemplates(patterns);
      assert.equal(families.length, 1, 'Should have 1 family');
      assert.equal(families[0].members.length, 2, 'Family should have 2 members');
      assert.equal(singletons.length, 1, 'Should have 1 singleton');
    });

    it('should handle empty input', () => {
      const { families, singletons } = extractTemplates([]);
      assert.equal(families.length, 0);
      assert.equal(singletons.length, 0);
    });

    it('should capture delta size for each member', () => {
      const patterns = [
        { id: 'p1', name: 'add', code: 'function add(a, b) { return a + b; }', language: 'javascript' },
        { id: 'p2', name: 'sum', code: 'function sum(x, y) { return x + y; }', language: 'javascript' },
      ];
      const { families } = extractTemplates(patterns);
      assert.equal(families.length, 1);
      for (const member of families[0].members) {
        assert.ok(member.deltaSize > 0, 'Delta size should be positive');
        assert.ok(member.originalSize > 0, 'Original size should be positive');
      }
    });
  });

  describe('detectFamilies', () => {

    it('should detect families without extracting templates', () => {
      const patterns = [
        { id: 'p1', code: 'function a(x) { return x; }', language: 'javascript' },
        { id: 'p2', code: 'function b(y) { return y; }', language: 'javascript' },
        { id: 'p3', code: 'class Foo { constructor() { this.x = 1; } }', language: 'javascript' },
      ];
      const families = detectFamilies(patterns);
      assert.equal(families.length, 1, 'Should detect 1 family');
      assert.equal(families[0].memberCount, 2);
      assert.deepEqual(families[0].patternIds.sort(), ['p1', 'p2'].sort());
    });

    it('should return empty for all unique patterns', () => {
      const patterns = [
        { id: 'p1', code: 'function a() { return 1; }', language: 'javascript' },
        { id: 'p2', code: 'class B { run() { while(true) { break; } } }', language: 'javascript' },
      ];
      const families = detectFamilies(patterns);
      assert.equal(families.length, 0);
    });
  });

  describe('compressionStats', () => {

    it('should compute stats for a set of patterns', () => {
      const patterns = [
        { id: 'p1', code: 'function add(a, b) { return a + b; }', language: 'javascript' },
        { id: 'p2', code: 'function sum(x, y) { return x + y; }', language: 'javascript' },
        { id: 'p3', code: 'class Unique { constructor() { this.data = []; } }', language: 'javascript' },
      ];
      const stats = compressionStats(patterns);
      assert.equal(stats.totalPatterns, 3);
      assert.equal(stats.familyCount, 1);
      assert.equal(stats.compressedPatterns, 2);
      assert.equal(stats.singletonPatterns, 1);
      assert.ok(parseFloat(stats.compressionRatio) > 0, 'Compression ratio should be positive');
    });

    it('should handle empty input', () => {
      const stats = compressionStats([]);
      assert.equal(stats.totalPatterns, 0);
      assert.equal(stats.familyCount, 0);
    });
  });
});
