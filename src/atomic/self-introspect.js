'use strict';

/**
 * Atomic Self-Introspection — the oracle examines its own code.
 *
 * Scans the oracle's modules for `.atomicProperties` declarations
 * and `._atomicProperties` maps, registers every found element in
 * the periodic table, then runs element discovery on itself to find
 * gaps in its OWN codebase.
 *
 * This is the bootstrap loop: the system that checks code checks
 * itself using the same rules it enforces on everything else.
 *
 * Usage:
 *   const { introspect } = require('./self-introspect');
 *   const result = introspect(table);
 *   // result.registered: elements found and registered
 *   // result.gaps: gaps discovered in the oracle's own code
 */

const path = require('path');

/**
 * Modules to scan for atomic properties. Each entry is:
 *   [requirePath, description]
 *
 * The introspector requires each module and looks for:
 *   - fn.atomicProperties on exported functions
 *   - exports._atomicProperties map for mixin-style modules
 */
const ORACLE_MODULES = [
  ['../unified/quantum-scorer', 'Unified measurement (PULL/EVOLVE/GENERATE decisions)'],
  ['../core/relevance', 'Relevance scoring (ranking, cosine similarity)'],
  ['../api/oracle-core-search', 'Search (hybrid keyword + semantic)'],
  ['../api/oracle-core-resolve', 'Resolve (oracle reflex gateway)'],
  ['./periodic-table', 'Periodic table (encode/decode signatures)'],
  ['../unified/emergent-coherency', 'Emergent SERF (coherency aggregation)'],
  ['../audit/ground', 'Grounding check (symbol resolution)'],
  ['../quality/planner', 'Plan verification (symbol-level pre-generation)'],
  ['../quality/generate-gate', 'Generate gate (plan compliance)'],
];

/**
 * Scan the oracle's own modules and register their atomic properties
 * in the given periodic table.
 *
 * @param {PeriodicTable} table
 * @param {object} [options]
 *   - includeVoid: also scan the void compressor's ATOMIC_PROPERTIES (default true)
 *   - voidPath: path to void compressor root
 * @returns {{ registered: Array, gaps: Array, errors: string[] }}
 */
function introspect(table, options = {}) {
  const { encodeSignature } = require('./periodic-table');
  const registered = [];
  const errors = [];

  // ── Scan oracle modules ──────────────────────────────────────────
  for (const [modPath, description] of ORACLE_MODULES) {
    try {
      const mod = require(modPath);
      // Check exported functions for .atomicProperties
      for (const [name, value] of Object.entries(mod)) {
        if (typeof value === 'function' && value.atomicProperties) {
          const props = value.atomicProperties;
          const sig = encodeSignature(props);
          if (!table.getElement(sig)) {
            table.addElement(props, {
              name: `oracle/${name}`,
              source: 'self-introspection',
            });
          }
          registered.push({ name: `oracle/${name}`, signature: sig, module: modPath });
        }
      }
      // Check for _atomicProperties map (mixin-style modules)
      if (mod._atomicProperties && typeof mod._atomicProperties === 'object') {
        for (const [fnName, props] of Object.entries(mod._atomicProperties)) {
          const sig = encodeSignature(props);
          if (!table.getElement(sig)) {
            table.addElement(props, {
              name: `oracle/${fnName}`,
              source: 'self-introspection',
            });
          }
          registered.push({ name: `oracle/${fnName}`, signature: sig, module: modPath });
        }
      }
    } catch (e) {
      errors.push(`${modPath}: ${e.message || e}`);
    }
  }

  // ── Scan void compressor ATOMIC_PROPERTIES ──────────────────────
  if (options.includeVoid !== false) {
    try {
      const voidRoot = options.voidPath || _findVoidCompressor();
      if (voidRoot) {
        const voidProps = _loadVoidAtomicProperties(voidRoot);
        for (const [fnName, props] of Object.entries(voidProps)) {
          const sig = encodeSignature(props);
          if (!table.getElement(sig)) {
            table.addElement(props, {
              name: `void/${fnName}`,
              source: 'self-introspection',
            });
          }
          registered.push({ name: `void/${fnName}`, signature: sig, module: 'void-compressor' });
        }
      }
    } catch (e) {
      errors.push(`void-compressor: ${e.message || e}`);
    }
  }

  // ── Run element discovery on the now-populated table ────────────
  let gaps = [];
  try {
    const { runDiscovery } = require('./element-discovery');
    gaps = runDiscovery(table, { maxResults: 20 });
  } catch (e) {
    errors.push(`discovery: ${e.message || e}`);
  }

  // ── Auto-propose self-improvement if gaps found ────────────────
  // Every introspection that finds gaps automatically feeds them to
  // the self-improvement engine as proposals. In supervised mode
  // they'll wait for human approval. In semi-autonomous+ they may
  // auto-incorporate. This is observation + proposal, not action.
  if (gaps.length > 0) {
    try {
      const { SelfImprovementEngine } = require('../orchestrator/self-improvement');
      const engine = new SelfImprovementEngine();
      // Only propose if we have fewer than 10 pending — don't flood
      if (engine.getPending().length < 10) {
        engine.discoverAndPropose({
          table, globalCoherency: 0.76, maxProposals: Math.min(5, gaps.length),
        }).catch(() => {}); // async, fire-and-forget
      }
    } catch { /* self-improvement not available */ }
  }

  return { registered, gaps, errors };
}

/**
 * Load ATOMIC_PROPERTIES from the void compressor's Python files
 * by parsing the module-level dict directly (simple regex extraction,
 * no Python runtime needed).
 */
function _loadVoidAtomicProperties(voidRoot) {
  const fs = require('fs');
  const combined = {};

  for (const filename of ['void_compressor_v3.py', 'void_compressor_v5.py']) {
    const filePath = path.join(voidRoot, filename);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');

    // Find ATOMIC_PROPERTIES or V5_ATOMIC_PROPERTIES dict
    const dictPattern = /(?:ATOMIC_PROPERTIES|V5_ATOMIC_PROPERTIES)\s*=\s*\{([\s\S]*?)\n\}/g;
    let match;
    while ((match = dictPattern.exec(content)) !== null) {
      const block = match[1];
      // Parse each entry: 'name': {'charge': N, 'valence': N, ...}
      const entryPattern = /'([^']+)'\s*:\s*\{([^}]+)\}/g;
      let entry;
      while ((entry = entryPattern.exec(block)) !== null) {
        const fnName = entry[1];
        const propsStr = entry[2];
        try {
          const props = {};
          // Extract each property
          const propPattern = /'(\w+)'\s*:\s*([^,}]+)/g;
          let prop;
          while ((prop = propPattern.exec(propsStr)) !== null) {
            let val = prop[2].trim();
            if (val.startsWith("'") || val.startsWith('"')) val = val.slice(1, -1);
            else val = parseFloat(val);
            props[prop[1]] = val;
          }
          if (Object.keys(props).length >= 5) {
            combined[fnName] = props;
          }
        } catch { /* skip malformed */ }
      }
    }
  }

  return combined;
}

function _findVoidCompressor() {
  const fs = require('fs');
  const candidates = [
    process.env.VOID_COMPRESSOR_PATH,
    path.resolve(__dirname, '..', '..', '..', 'Void-Data-Compressor'),
    path.join(require('os').homedir(), 'Void-Data-Compressor'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'void_compressor_v3.py'))) return p;
  }
  return null;
}

module.exports = {
  introspect,
  ORACLE_MODULES,
};

// ── Atomic self-description (batch-generated) ────────────────────
introspect.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
