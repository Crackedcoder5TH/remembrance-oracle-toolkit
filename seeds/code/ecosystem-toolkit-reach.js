'use strict';

/**
 * ecosystem-toolkit-reach — the canonical cross-repo wiring pattern for
 * the Remembrance ecosystem.
 *
 * Reach a deep remembrance-oracle-toolkit module that the toolkit's
 * package `exports` map does NOT expose as a bare specifier — e.g.
 * src/unified/coherency, src/core/reflection-serf,
 * src/core/remembrance-lexicon, src/core/field-coupling. A file-path
 * require bypasses the exports gate (exports only governs bare-specifier
 * resolution, not absolute/relative file paths).
 *
 * Resolution order (first hit wins), so the same code works whether the
 * toolkit is an installed dependency or a sibling checkout, and never
 * throws when it is neither — it degrades to null and the caller keeps
 * running without the shared primitive.
 *
 *   1. the installed dep (require.resolve)
 *   2. a sibling clone (../../../remembrance-oracle-toolkit/src)
 *
 * @param {...string} segments  repo-relative module path under src/,
 *                              e.g. reachToolkitModule('unified', 'coherency')
 * @returns {*|null} the required module, or null if unreachable
 */
const { join } = require('path');

function reachToolkitModule(...segments) {
  const tries = [];
  try {
    tries.push(join(require.resolve('remembrance-oracle-toolkit'), '..', ...segments));
  } catch (_e) { /* dep not installed — fall through to sibling */ }
  tries.push(join(__dirname, '..', '..', '..', 'remembrance-oracle-toolkit', 'src', ...segments));
  for (const p of tries) {
    try { return require(p); } catch (_e) { /* try next */ }
  }
  return null;
}

module.exports = { reachToolkitModule };
