const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createGraph', () => {
  it('should add vertices and edges', () => {
    const g = createGraph();
    g.addVertex('A');
    g.addVertex('B');
    g.addEdge('A', 'B');
    assert.deepStrictEqual(g.getNeighbors('A'), ['B']);
    assert.deepStrictEqual(g.getNeighbors('B'), ['A']);
  });

  it('should perform BFS traversal', () => {
    const g = createGraph();
    g.addEdge('A', 'B');
    g.addEdge('A', 'C');
    g.addEdge('B', 'D');
    g.addEdge('C', 'D');
    const result = g.bfs('A');
    assert.strictEqual(result[0], 'A');
    assert.strictEqual(result.length, 4);
    assert.strictEqual(result.includes('D'), true);
  });

  it('should perform DFS traversal', () => {
    const g = createGraph();
    g.addEdge('A', 'B');
    g.addEdge('A', 'C');
    g.addEdge('B', 'D');
    const result = g.dfs('A');
    assert.strictEqual(result[0], 'A');
    assert.strictEqual(result.length, 4);
    assert.strictEqual(result.includes('D'), true);
  });

  it('should return empty array for unknown vertex neighbors', () => {
    const g = createGraph();
    assert.deepStrictEqual(g.getNeighbors('Z'), []);
  });

  it('should not add duplicate edges', () => {
    const g = createGraph();
    g.addEdge('A', 'B');
    g.addEdge('A', 'B');
    assert.deepStrictEqual(g.getNeighbors('A'), ['B']);
  });
});
