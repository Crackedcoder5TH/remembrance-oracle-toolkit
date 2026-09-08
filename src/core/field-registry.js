'use strict';

/**
 * field-registry.js — the entangled-node registry: presence, not a reading.
 *
 * entangle.js used to announce a node by contributing a flat
 * `coherence: 0.9` under source `entangle:node:<id>`, then counted those
 * sources to get the node census. So a REGISTRY lived inside the coherency
 * field, and every heartbeat moved the global scalar by a constant that
 * described nothing about the node.
 *
 * It could not simply be deleted — the contribution WAS the census.
 * Presence has its own store (`state.nodes`, persisted with the field), so
 * the registry and the field are separate concerns and the data can flow
 * without one distorting the other. Decomposed out of living-remembrance.js
 * (the size ratchet's cap, 2026-09-07); the engine keeps thin delegates.
 *
 * Nodes carry a last-seen stamp so the census reflects who is actually
 * here. A registry that only ever grows is not a census, it is a log.
 */

const DEFAULT_TTL_MS = 15 * 60 * 1000;

/** Stamp a node as present now, drop nodes unseen within the TTL, persist. Returns the live count. */
function registerNode(engine, nodeId, ttlMs = DEFAULT_TTL_MS) {
  if (!nodeId) return 0;
  const now = Date.now();
  const nodes = { ...(engine._state.nodes || {}) };
  nodes[String(nodeId)] = now;
  // Drop nodes not seen within the TTL — otherwise a machine that ran once
  // inflates the abundance divisor forever and every later node
  // under-reports its cost.
  for (const [id, seen] of Object.entries(nodes)) {
    if (typeof seen !== 'number' || now - seen > ttlMs) delete nodes[id];
  }
  engine._state = { ...engine._state, nodes };
  engine._persist();
  return Object.keys(nodes).length;
}
registerNode.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 5, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** How many distinct nodes are currently entangled. Never below 1. */
function nodeCount(engine, ttlMs = DEFAULT_TTL_MS) {
  const now = Date.now();
  const nodes = engine._state.nodes || {};
  let n = 0;
  for (const seen of Object.values(nodes)) {
    if (typeof seen === 'number' && now - seen <= ttlMs) n++;
  }
  return Math.max(1, n);
}
nodeCount.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { registerNode, nodeCount, DEFAULT_TTL_MS };
