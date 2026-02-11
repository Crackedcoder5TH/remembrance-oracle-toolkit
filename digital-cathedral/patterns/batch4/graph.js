/**
 * Graph — adjacency list graph with BFS and DFS traversals
 * createGraph() → { addVertex, addEdge, getNeighbors, bfs, dfs }
 */
function createGraph() {
  const adjacency = new Map();

  function addVertex(vertex) {
    if (!adjacency.has(vertex)) {
      adjacency.set(vertex, []);
    }
  }

  function addEdge(v1, v2) {
    addVertex(v1);
    addVertex(v2);
    if (!adjacency.get(v1).includes(v2)) {
      adjacency.get(v1).push(v2);
    }
    if (!adjacency.get(v2).includes(v1)) {
      adjacency.get(v2).push(v1);
    }
  }

  function getNeighbors(vertex) {
    return adjacency.get(vertex) || [];
  }

  function bfs(start) {
    const visited = new Set();
    const result = [];
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const vertex = queue.shift();
      result.push(vertex);
      for (const neighbor of getNeighbors(vertex)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    return result;
  }

  function dfs(start) {
    const visited = new Set();
    const result = [];

    function traverse(vertex) {
      visited.add(vertex);
      result.push(vertex);
      for (const neighbor of getNeighbors(vertex)) {
        if (!visited.has(neighbor)) {
          traverse(neighbor);
        }
      }
    }

    traverse(start);
    return result;
  }

  return { addVertex, addEdge, getNeighbors, bfs, dfs };
}

module.exports = { createGraph };
