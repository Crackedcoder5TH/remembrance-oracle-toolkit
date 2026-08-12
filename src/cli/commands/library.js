'use strict';

/**
 * Library CLI commands — façade.
 *
 * `oracle`'s pattern-library verbs, split (2026-08-10) from one ~1650-line
 * file into six domain organs under ./library/. This façade just wires them
 * onto the shared `handlers` map; each organ owns one clear part of a
 * pattern's life, so a newcomer can open the organ whose name matches the
 * command they care about and read only that:
 *
 *   library/inspect.js   Look at what is in the library.
 *                        → bug-report, reliability, patterns, search,
 *                          smart-search, diff
 *   library/resolve.js   Ask the library to solve a problem (match + heal).
 *                        → resolve
 *   library/exchange.js  Move patterns in and out.
 *                        → register, import, export, seed
 *   library/evolve.js    Grow new patterns.
 *                        → candidates, generate, tournament, promote,
 *                          synthesize
 *   library/compress.js  Compress into fractal families, cluster, audit.
 *                        → compress, cluster, audit-integration
 *   library/publish.js   Publish to the REMEMBRANCE blockchain + verify.
 *                        → publish, publications, _verifyPublication
 *
 *   library/out.js       The one printing + gated-write seam. Every organ
 *                        prints through it, so the organs hold zero console
 *                        sites and the one `export --file` write rides a
 *                        sealed covenant gate — no file-level exemption.
 *
 * All six take the same (handlers, deps) the façade received, so adding a
 * command means editing exactly one organ, and nothing else.
 */

const { registerInspectCommands } = require('./library/inspect');
const { registerResolveCommands } = require('./library/resolve');
const { registerExchangeCommands } = require('./library/exchange');
const { registerEvolveCommands } = require('./library/evolve');
const { registerCompressCommands } = require('./library/compress');
const { registerPublishCommands } = require('./library/publish');

function registerLibraryCommands(handlers, deps) {
  registerInspectCommands(handlers, deps);
  registerResolveCommands(handlers, deps);
  registerExchangeCommands(handlers, deps);
  registerEvolveCommands(handlers, deps);
  registerCompressCommands(handlers, deps);
  registerPublishCommands(handlers, deps);
}

module.exports = { registerLibraryCommands };
