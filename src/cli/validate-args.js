/**
 * CLI argument validators — bounds checking + format validation.
 */

const { c } = require('./colors');

function validatePositiveInt(value, name, defaultValue) {
  if (value === undefined || value === true) return defaultValue;
  const n = parseInt(value);
  if (isNaN(n) || n < 1) {
    console.error(c.boldRed('Error:') + ` --${name} must be a positive integer (got "${value}")`);
    process.exit(1);
  }
  return n;
}

function validatePort(value, defaultValue = 3333) {
  if (value === undefined || value === true) return defaultValue;
  const n = parseInt(value);
  if (isNaN(n) || n < 1 || n > 65535) {
    console.error(c.boldRed('Error:') + ` --port must be 1-65535 (got "${value}")`);
    process.exit(1);
  }
  return n;
}

function validateCoherency(value, name = 'min-coherency', defaultValue = 0.5) {
  if (value === undefined || value === true) return defaultValue;
  const n = parseFloat(value);
  if (isNaN(n) || n < 0 || n > 1) {
    console.error(c.boldRed('Error:') + ` --${name} must be 0-1 (got "${value}")`);
    process.exit(1);
  }
  return n;
}

function validateId(value) {
  if (!value || value === true) {
    console.error(c.boldRed('Error:') + ' --id required');
    process.exit(1);
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    console.error(c.boldRed('Error:') + ` --id must be a non-empty string (got "${value}")`);
    process.exit(1);
  }
  return value.trim();
}

module.exports = { validatePositiveInt, validatePort, validateCoherency, validateId };
