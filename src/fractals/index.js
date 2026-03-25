/**
 * Fractal System — barrel export.
 *
 * Combines:
 *   engines.js   — Pure math implementations of 5 fractal systems
 *   alignment.js — Code-to-fractal alignment scoring (6th coherency dimension)
 */

const engines = require('./engines');
const alignment = require('./alignment');

module.exports = {
  ...engines,
  ...alignment,
};
