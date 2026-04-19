/**
 * dijkstra - Find shortest paths from a start vertex to all other vertices
 * in a weighted graph using Dijkstra's algorithm.
 * @param {Object<string, Array<{node: string, weight: number}>>} graph
 *   Adjacency list where keys are vertex names and values are arrays of
 *   { node, weight } pairs representing edges.
 * @param {string} start - The starting vertex.
 * @returns {{ distances: Object<string, number>, previous: Object<string, string|null> }}
 *   distances: shortest distance from start to each vertex.
 *   previous: the previous vertex on the shortest path (null for start).
 */
function dijkstra(graph, start) {
  const distances = {};
  const previous = {};
  const visited = new Set();

  // Initialize distances to Infinity for all vertices
  for (const vertex of Object.keys(graph)) {
    distances[vertex] = Infinity;
    previous[vertex] = null;
  }
  distances[start] = 0;

  // Simple priority queue using linear scan (no external deps)
  function getMinVertex() {
    let minDist = Infinity;
    let minVertex = null;

    for (const vertex of Object.keys(distances)) {
      if (!visited.has(vertex) && distances[vertex] < minDist) {
        minDist = distances[vertex];
        minVertex = vertex;
      }
    }

    return minVertex;
  }

  let current = getMinVertex();

  while (current !== null) {
    visited.add(current);

    for (const neighbor of graph[current]) {
      if (visited.has(neighbor.node)) continue;

      const newDist = distances[current] + neighbor.weight;
      if (newDist < distances[neighbor.node]) {
        distances[neighbor.node] = newDist;
        previous[neighbor.node] = current;
      }
    }

    current = getMinVertex();
  }

  return { distances, previous };
}

module.exports = dijkstra;
