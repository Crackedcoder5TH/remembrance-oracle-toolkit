/**
 * Re-export shim — self-optimize module has moved to src/evolution/self-optimize.js
 *
 * This file preserves backward compatibility for existing consumers.
 * All functionality is now in the evolution subsystem directory.
 */
module.exports = require('../evolution/self-optimize');
