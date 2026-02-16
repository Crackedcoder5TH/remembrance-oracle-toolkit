/**
 * Covenant Pattern Definitions — barrel re-export.
 *
 * Split into focused sub-modules:
 *   covenant-principles.js    — The 15 principles + preprocessing
 *   covenant-harm.js          — Structural harm patterns (grouped by principle)
 *   covenant-deep-security.js — Per-language vulnerability detection
 */

const { COVENANT_PRINCIPLES, stripNonExecutableContent } = require('./covenant-principles');
const { HARM_PATTERNS } = require('./covenant-harm');
const { DEEP_SECURITY_PATTERNS } = require('./covenant-deep-security');

module.exports = {
  COVENANT_PRINCIPLES,
  HARM_PATTERNS,
  DEEP_SECURITY_PATTERNS,
  stripNonExecutableContent,
};
