const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('topologicalSort', () => {
  it('should sort a simple linear graph', () => {
    const graph = { A: ['B'], B: ['C'], C: [] };
    const result = topologicalSort(graph);
    assert.deepStrictEqual(result, ['A', 'B', 'C']);
  });

  it('should sort a diamond-shaped DAG', () => {
    const graph = { A: ['B', 'C'], B: ['D'], C: ['D'], D: [] };
    const result = topologicalSort(graph);
    // A must come before B and C; B and C must come before D
    assert.strictEqual(result.indexOf('A'), 0);
    assert.strictEqual(result.indexOf('D'), 3);
    assert.ok(result.indexOf('B') < result.indexOf('D'));
    assert.ok(result.indexOf('C') < result.indexOf('D'));
  });

  it('should handle an empty graph', () => {
    assert.deepStrictEqual(topologicalSort({}), []);
  });

  it('should handle a graph with no edges', () => {
    const graph = { A: [], B: [], C: [] };
    const result = topologicalSort(graph);
    assert.strictEqual(result.length, 3);
    assert.ok(result.includes('A'));
    assert.ok(result.includes('B'));
    assert.ok(result.includes('C'));
  });

  it('should throw for a graph with a cycle', () => {
    const graph = { A: ['B'], B: ['C'], C: ['A'] };
    assert.throws(() => topologicalSort(graph), { message: 'Graph contains a cycle' });
  });
});
