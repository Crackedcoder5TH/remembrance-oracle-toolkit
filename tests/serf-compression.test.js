const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  prioritizeForCompression,
  partitionByReadiness,
  healFamily,
  serfDimensions,
  serfEmbeddingDims,
  validateReconstruction,
} = require('../src/compression/serf-integration');

const { reconstruct } = require('../src/compression/fractal');

// ─── Test patterns ───

const highCoherencePattern = {
  id: 'hc1',
  name: 'add',
  code: 'function add(a, b) { return a + b; }',
  language: 'javascript',
  tags: ['math'],
};

const lowCoherencePattern = {
  id: 'lc1',
  name: 'messy',
  code: 'function x(a,b,c,d,e,f,g,h,i,j){var z=a+b+c;var y=d+e+f;var w=g+h+i+j;eval(z);return z+y+w}',
  language: 'javascript',
  tags: ['util'],
};

const mediumCoherencePattern = {
  id: 'mc1',
  name: 'greet',
  code: 'function greet(name) { if (name) { return "Hello " + name; } return "Hi"; }',
  language: 'javascript',
  tags: ['string'],
};

describe('SERF × Compression Integration', () => {

  // ─── 1. SERF-scored compression priority ───

  describe('prioritizeForCompression', () => {

    it('should sort patterns by SERF coherence descending', () => {
      const patterns = [lowCoherencePattern, highCoherencePattern, mediumCoherencePattern];
      const sorted = prioritizeForCompression(patterns);

      assert.equal(sorted.length, 3);
      // High coherence should come first
      assert.ok(sorted[0]._serfCoherence >= sorted[1]._serfCoherence,
        `First (${sorted[0]._serfCoherence}) should be >= second (${sorted[1]._serfCoherence})`);
      assert.ok(sorted[1]._serfCoherence >= sorted[2]._serfCoherence,
        `Second (${sorted[1]._serfCoherence}) should be >= third (${sorted[2]._serfCoherence})`);
    });

    it('should attach _serfCoherence to each pattern', () => {
      const sorted = prioritizeForCompression([highCoherencePattern]);
      assert.ok(typeof sorted[0]._serfCoherence === 'number');
      assert.ok(sorted[0]._serfCoherence >= 0 && sorted[0]._serfCoherence <= 1);
    });

    it('should attach _serfDimensions to each pattern', () => {
      const sorted = prioritizeForCompression([highCoherencePattern]);
      assert.ok(sorted[0]._serfDimensions != null);
      assert.ok(typeof sorted[0]._serfDimensions === 'object');
    });

    it('should return empty array for empty input', () => {
      assert.deepEqual(prioritizeForCompression([]), []);
      assert.deepEqual(prioritizeForCompression(null), []);
    });
  });

  // ─── 2. Partition by readiness ───

  describe('partitionByReadiness', () => {

    it('should partition patterns into ready and healing', () => {
      const { ready, healing } = partitionByReadiness([
        highCoherencePattern, lowCoherencePattern, mediumCoherencePattern,
      ]);

      assert.ok(ready.length + healing.length === 3);
      // All ready patterns should have coherence >= 0.6
      for (const r of ready) {
        assert.ok(r._serfCoherence >= 0.6, `Ready pattern ${r.name} has coherence ${r._serfCoherence}`);
      }
      // All healing patterns should have coherence < 0.6
      for (const h of healing) {
        assert.ok(h._serfCoherence < 0.6, `Healing pattern ${h.name} has coherence ${h._serfCoherence}`);
      }
    });

    it('should respect custom minCoherence threshold', () => {
      // Use a lower threshold to ensure all patterns pass as ready
      const { ready: allReady } = partitionByReadiness(
        [highCoherencePattern, mediumCoherencePattern],
        0.0
      );
      assert.equal(allReady.length, 2, 'All patterns should be ready at 0.0 threshold');

      // Use a threshold higher than any possible score (>1.0)
      const { healing: allHealing } = partitionByReadiness(
        [highCoherencePattern, mediumCoherencePattern],
        1.01
      );
      assert.equal(allHealing.length, 2, 'All patterns should be healing at >1.0 threshold');
    });
  });

  // ─── 3. SERF dimensions for embeddings ───

  describe('serfDimensions', () => {

    it('should return 5 dimension scores plus composite', () => {
      const dims = serfDimensions('function add(a, b) { return a + b; }', 'javascript');
      assert.ok('simplicity' in dims);
      assert.ok('readability' in dims);
      assert.ok('security' in dims);
      assert.ok('unity' in dims);
      assert.ok('correctness' in dims);
      assert.ok('composite' in dims);
    });

    it('should return scores between 0 and 1', () => {
      const dims = serfDimensions('function add(a, b) { return a + b; }', 'javascript');
      for (const [key, val] of Object.entries(dims)) {
        assert.ok(val >= 0 && val <= 1, `${key} should be in [0,1], got ${val}`);
      }
    });

    it('should return zeros for empty code', () => {
      const dims = serfDimensions('', 'javascript');
      assert.equal(dims.composite, 0);
    });
  });

  describe('serfEmbeddingDims', () => {

    it('should return an 8-element array', () => {
      const dims = serfEmbeddingDims('function add(a, b) { return a + b; }', 'javascript');
      assert.equal(dims.length, 8);
    });

    it('should have values in [0, 1]', () => {
      const dims = serfEmbeddingDims('function sort(arr) { return arr.sort(); }', 'javascript');
      for (let i = 0; i < dims.length; i++) {
        assert.ok(dims[i] >= 0 && dims[i] <= 1, `dim[${i}] should be in [0,1], got ${dims[i]}`);
      }
    });

    it('should have reserved dims 14-15 as zero', () => {
      const dims = serfEmbeddingDims('function x() { return 1; }', 'javascript');
      assert.equal(dims[6], 0, 'dim 14 (index 6) should be reserved zero');
      assert.equal(dims[7], 0, 'dim 15 (index 7) should be reserved zero');
    });
  });

  // ─── 4. Post-compression SERF validation ───

  describe('validateReconstruction', () => {

    it('should validate identical reconstruction as valid', () => {
      const code = 'function add(a, b) { return a + b; }';
      // Skeleton with placeholder, delta restores it exactly
      const skeleton = 'function $ID_0($ID_1, $ID_2) { return $ID_1 + $ID_2; }';
      const delta = { $ID_0: 'add', $ID_1: 'a', $ID_2: 'b' };

      const reconstructed = reconstruct(skeleton, delta);
      // Verify the reconstruction is correct first
      assert.equal(reconstructed, code);

      const result = validateReconstruction(code, skeleton, delta, 'javascript');
      assert.ok(result.valid, `Should be valid, coherence delta: ${result.delta}`);
      assert.ok(result.delta <= 0.05, `Coherence delta should be <= 0.05, got ${result.delta}`);
    });

    it('should return invalid for empty inputs', () => {
      const result = validateReconstruction('', 'skeleton', {}, 'javascript');
      assert.equal(result.valid, false);
    });

    it('should include dimension deltas', () => {
      const code = 'function add(a, b) { return a + b; }';
      const skeleton = 'function $ID_0($ID_1, $ID_2) { return $ID_1 + $ID_2; }';
      const delta = { $ID_0: 'add', $ID_1: 'a', $ID_2: 'b' };

      const result = validateReconstruction(code, skeleton, delta, 'javascript');
      assert.ok(result.dimensions != null, 'Should include dimension deltas');
      assert.ok(typeof result.dimensions === 'object');
    });

    it('should include reconstructed code', () => {
      const code = 'function add(a, b) { return a + b; }';
      const skeleton = 'function $ID_0($ID_1, $ID_2) { return $ID_1 + $ID_2; }';
      const delta = { $ID_0: 'add', $ID_1: 'a', $ID_2: 'b' };

      const result = validateReconstruction(code, skeleton, delta, 'javascript');
      assert.ok(result.reconstructedCode, 'Should include reconstructed code');
      assert.equal(result.reconstructedCode, code);
    });
  });

  // ─── 5. Family healing ───

  describe('healFamily', () => {

    it('should return healed patterns with improvement scores', () => {
      const family = [
        { code: 'function add(a,b){return a+b}', language: 'javascript', description: 'add', tags: ['math'] },
        { code: 'function sub(a,b){return a-b}', language: 'javascript', description: 'subtract', tags: ['math'] },
      ];

      const result = healFamily(family, { maxLoops: 1 });
      assert.ok(Array.isArray(result.healed));
      assert.equal(result.healed.length, 2);
      assert.ok(typeof result.bestStrategy === 'string');
      assert.ok(typeof result.avgImprovement === 'number');
    });

    it('should return empty for empty input', () => {
      const result = healFamily([]);
      assert.deepEqual(result.healed, []);
      assert.equal(result.bestStrategy, null);
      assert.equal(result.avgImprovement, 0);
    });

    it('should attach healedCode to each member', () => {
      const family = [
        { code: 'function add(a,b){return a+b}', language: 'javascript', description: 'add', tags: [] },
      ];

      const result = healFamily(family, { maxLoops: 1 });
      assert.ok(result.healed[0].healedCode, 'Should have healedCode');
      assert.ok(typeof result.healed[0].originalCoherence === 'number');
      assert.ok(typeof result.healed[0].healedCoherence === 'number');
    });
  });
});
