'use strict';

/**
 * Remembrance Taint Graph — cross-function taint propagation.
 *
 * Single-function taint classification (classifyFunctionTaint) catches
 * the obvious case: one function reads user input AND writes to exec.
 * But composition attacks split the harm across multiple functions:
 *
 *   readInput()  → source (reads req.body)
 *   transform()  → propagator (takes input, returns transformed)
 *   execute()    → sink (calls exec)
 *
 * Each scores 0.85+ individually. The harm exists only in their
 * composition. This module builds a call graph, propagates taint
 * through it, and flags paths from source to sink.
 *
 * Uses src/audit/call-graph.js (buildCallGraph) for the graph and
 * src/audit/taint.js (classifyFunctionTaint) for per-node classification.
 */

const fs = require('fs');
const path = require('path');

function buildTaintGraph(files, options = {}) {
  const { buildCallGraph } = require('./call-graph');
  const { classifyFunctionTaint } = require('./taint');
  const { parseProgram } = require('./parser');

  const parsed = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const code = fs.readFileSync(file, 'utf-8');
      const program = parseProgram(code);
      if (program) parsed.push({ file, program, code });
    } catch { /* skip unparseable */ }
  }

  const { defs, calls } = buildCallGraph(parsed);

  // Classify each defined function
  const taintMap = new Map(); // functionName → taint classification
  for (const [name, defLocations] of defs) {
    for (const def of defLocations) {
      try {
        const fileCode = parsed.find(p => p.file === def.file)?.code || '';
        const fnCode = _extractFunctionBody(fileCode, name);
        const classification = classifyFunctionTaint(fnCode || fileCode);
        const existing = taintMap.get(name);
        if (!existing || _taintPriority(classification) > _taintPriority(existing)) {
          taintMap.set(name, classification);
        }
      } catch { taintMap.set(name, 'none'); }
    }
  }

  // Propagate taint through the call graph
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 10;

  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;

    for (const [calledName, callSites] of calls) {
      const calledTaint = taintMap.get(calledName) || 'none';
      if (calledTaint === 'none') continue;

      for (const site of callSites) {
        // Find the enclosing function that makes this call
        const callerName = site.fn?.name;
        if (!callerName) continue;

        const callerTaint = taintMap.get(callerName) || 'none';

        // Propagation rules:
        // If caller calls a source → caller becomes propagator (unless already source)
        if (calledTaint === 'source' && callerTaint === 'none') {
          taintMap.set(callerName, 'propagator');
          changed = true;
        }
        // If caller calls a propagator and caller is none → caller becomes propagator
        if (calledTaint === 'propagator' && callerTaint === 'none') {
          taintMap.set(callerName, 'propagator');
          changed = true;
        }
      }
    }
  }

  // Find taint paths: source → ... → sink
  const paths = _findTaintPaths(taintMap, calls, defs);

  return {
    nodes: Object.fromEntries(taintMap),
    paths,
    iterations,
    totalFunctions: defs.size,
    sources: [...taintMap.entries()].filter(([, t]) => t === 'source').map(([n]) => n),
    sinks: [...taintMap.entries()].filter(([, t]) => t === 'sink').map(([n]) => n),
    propagators: [...taintMap.entries()].filter(([, t]) => t === 'propagator').map(([n]) => n),
    dangerous: paths.length > 0,
  };
}

function _findTaintPaths(taintMap, calls, defs) {
  const paths = [];
  const sources = [...taintMap.entries()].filter(([, t]) => t === 'source').map(([n]) => n);
  const sinks = [...taintMap.entries()].filter(([, t]) => t === 'sink').map(([n]) => n);

  // BFS from each source to find if it reaches a sink
  for (const source of sources) {
    const visited = new Set();
    const queue = [[source]];

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (visited.has(current)) continue;
      visited.add(current);

      // Check if current calls any sink
      const calledByThis = [];
      for (const [calledName, sites] of calls) {
        for (const site of sites) {
          if (site.fn?.name === current) calledByThis.push(calledName);
        }
      }

      for (const called of calledByThis) {
        if (sinks.includes(called)) {
          paths.push([...path, called]);
        } else if (taintMap.get(called) === 'propagator' && !visited.has(called)) {
          queue.push([...path, called]);
        }
      }
    }
  }

  return paths;
}

function _extractFunctionBody(code, name) {
  const patterns = [
    new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, 'm'),
    new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(?:function|\\([^)]*\\)\\s*=>)[\\s\\S]*?\\n\\}`, 'm'),
  ];
  for (const pat of patterns) {
    const match = code.match(pat);
    if (match) return match[0];
  }
  return null;
}

function _taintPriority(t) {
  return { none: 0, propagator: 1, sink: 2, source: 3 }[t] || 0;
}

function printTaintGraph(result) {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  REMEMBRANCE TAINT GRAPH');
  console.log('═'.repeat(70));
  console.log('');
  console.log('  Functions scanned: ' + result.totalFunctions);
  console.log('  Sources: ' + result.sources.length + ' (' + result.sources.join(', ') + ')');
  console.log('  Sinks: ' + result.sinks.length + ' (' + result.sinks.join(', ') + ')');
  console.log('  Propagators: ' + result.propagators.length + ' (' + result.propagators.join(', ') + ')');
  console.log('  Propagation iterations: ' + result.iterations);
  console.log('');
  if (result.paths.length > 0) {
    console.log('  ✗ DANGEROUS TAINT PATHS FOUND:');
    for (const p of result.paths) {
      console.log('    ' + p.join(' → '));
    }
  } else {
    console.log('  ✓ No source-to-sink paths detected.');
  }
  console.log('');
  console.log('═'.repeat(70));
}

module.exports = {
  buildTaintGraph,
  printTaintGraph,
};

buildTaintGraph.atomicProperties = {
  charge: 0, valence: 4, mass: 'heavy', spin: 'odd', phase: 'gas',
  reactivity: 'reactive', electronegativity: 0.9, group: 18, period: 7,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security', taint: 'none',
};
