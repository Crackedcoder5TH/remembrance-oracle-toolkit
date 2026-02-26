const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('dijkstra', () => {
  it('should find shortest paths in a simple graph', () => {
    const graph = {
      A: [{ node: 'B', weight: 1 }, { node: 'C', weight: 4 }],
      B: [{ node: 'C', weight: 2 }, { node: 'D', weight: 6 }],
      C: [{ node: 'D', weight: 3 }],
      D: []
    };
    const result = dijkstra(graph, 'A');
    assert.strictEqual(result.distances.A, 0);
    assert.strictEqual(result.distances.B, 1);
    assert.strictEqual(result.distances.C, 3);
    assert.strictEqual(result.distances.D, 6);
  });

  it('should track previous vertices for path reconstruction', () => {
    const graph = {
      A: [{ node: 'B', weight: 1 }, { node: 'C', weight: 4 }],
      B: [{ node: 'C', weight: 2 }],
      C: []
    };
    const result = dijkstra(graph, 'A');
    assert.strictEqual(result.previous.A, null);
    assert.strictEqual(result.previous.B, 'A');
    assert.strictEqual(result.previous.C, 'B');
  });

  it('should handle a single-node graph', () => {
    const graph = { A: [] };
    const result = dijkstra(graph, 'A');
    assert.strictEqual(result.distances.A, 0);
    assert.strictEqual(result.previous.A, null);
  });

  it('should handle disconnected vertices', () => {
    const graph = {
      A: [{ node: 'B', weight: 1 }],
      B: [],
      C: []
    };
    const result = dijkstra(graph, 'A');
    assert.strictEqual(result.distances.A, 0);
    assert.strictEqual(result.distances.B, 1);
    assert.strictEqual(result.distances.C, Infinity);
    assert.strictEqual(result.previous.C, null);
  });

  it('should choose the shortest path among multiple options', () => {
    const graph = {
      A: [{ node: 'B', weight: 10 }, { node: 'C', weight: 3 }],
      B: [{ node: 'D', weight: 1 }],
      C: [{ node: 'B', weight: 2 }, { node: 'D', weight: 8 }],
      D: []
    };
    const result = dijkstra(graph, 'A');
    assert.strictEqual(result.distances.B, 5);
    assert.strictEqual(result.distances.D, 6);
    assert.strictEqual(result.previous.B, 'C');
  });
});
