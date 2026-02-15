/**
 * Re-export shim — whisper module has moved to src/evolution/whisper.js
 *
 * This file preserves backward compatibility for existing consumers.
 * All functionality is now in the evolution subsystem directory.
 */
module.exports = require('../evolution/whisper');
