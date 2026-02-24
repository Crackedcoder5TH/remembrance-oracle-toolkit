/**
 * topologicalSort - Perform a topological sort on a directed acyclic graph (DAG).
 * Uses Kahn's algorithm (BFS-based).
 * @param {Object<string, string[]>} graph - Adjacency list where keys are vertices
 *   and values are arrays of vertices that the key depends on (edges point to).
 * @returns {string[]} An array of vertices in topological order.
 * @throws {Error} If the graph contains a cycle.
 */
function topologicalSort(graph) {
  // Compute in-degree for each vertex
  const inDegree = {};
  const adjacency = {};

  // Initialize all vertices
  for (const vertex of Object.keys(graph)) {
    if (!(vertex in inDegree)) inDegree[vertex] = 0;
    if (!(vertex in adjacency)) adjacency[vertex] = [];

    for (const neighbor of graph[vertex]) {
      if (!(neighbor in inDegree)) inDegree[neighbor] = 0;
      if (!(neighbor in adjacency)) adjacency[neighbor] = [];
    }
  }

  // Build adjacency and in-degrees: graph[v] = neighbors that v points to
  for (const vertex of Object.keys(graph)) {
    for (const neighbor of graph[vertex]) {
      adjacency[vertex].push(neighbor);
      inDegree[neighbor]++;
    }
  }

  // Start with vertices having in-degree 0
  const queue = [];
  for (const vertex of Object.keys(inDegree)) {
    if (inDegree[vertex] === 0) {
      queue.push(vertex);
    }
  }

  const result = [];

  while (queue.length > 0) {
    const vertex = queue.shift();
    result.push(vertex);

    for (const neighbor of adjacency[vertex]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  const totalVertices = Object.keys(inDegree).length;
  if (result.length !== totalVertices) {
    throw new Error('Graph contains a cycle');
  }

  return result;
}

module.exports = topologicalSort;
