'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Zero-dependency .env file loader for the swarm.
 * Reads KEY=VALUE pairs from a .env file and sets them on process.env.
 * Does NOT override existing env vars (explicit env takes precedence).
 *
 * Supports:
 *   - KEY=value
 *   - KEY="quoted value"
 *   - KEY='single quoted'
 *   - # comments
 *   - Empty lines
 *   - Inline comments: KEY=value # comment
 *   - export KEY=value (optional export prefix)
 */

/**
 * Parse .env file content into key-value pairs.
 * @param {string} content - Raw .env file content
 * @returns {Map<string, string>} Parsed key-value pairs
 */
function parseEnvContent(content) {
  const vars = new Map();
  const lines = content.split('\n');

  for (const raw of lines) {
    const line = raw.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // Strip optional "export " prefix
    const stripped = line.startsWith('export ') ? line.slice(7) : line;

    // Find the first = sign
    const eqIndex = stripped.indexOf('=');
    if (eqIndex === -1) continue;

    const key = stripped.slice(0, eqIndex).trim();
    let value = stripped.slice(eqIndex + 1).trim();

    // Validate key (must be a valid env var name)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    // Handle quoted values
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments for unquoted values
      const commentIndex = value.indexOf(' #');
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    vars.set(key, value);
  }

  return vars;
}

/**
 * Load a .env file and inject vars into process.env.
 * Existing env vars are NOT overridden (explicit takes precedence).
 *
 * @param {string} [rootDir] - Directory containing the .env file (default: cwd)
 * @param {object} [options] - Options
 * @param {string} [options.filename] - Env file name (default: '.env')
 * @param {boolean} [options.override] - Override existing vars (default: false)
 * @returns {{ loaded: number, file: string|null, vars: string[] }} Load result
 */
function loadEnvFile(rootDir, options = {}) {
  const filename = options.filename || '.env';
  const override = options.override || false;
  const dir = rootDir || process.cwd();
  const envPath = path.resolve(dir, filename);

  const result = { loaded: 0, file: null, vars: [] };

  if (!fs.existsSync(envPath)) {
    return result;
  }

  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return result;
  }

  result.file = envPath;
  const vars = parseEnvContent(content);

  for (const [key, value] of vars) {
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
      result.vars.push(key);
      result.loaded++;
    }
  }

  return result;
}

/**
 * Search for .env file up the directory tree (like git does with .git).
 * @param {string} [startDir] - Starting directory (default: cwd)
 * @param {string} [filename] - Env file name (default: '.env')
 * @returns {string|null} Path to .env file if found, null otherwise
 */
function findEnvFile(startDir, filename = '.env') {
  let dir = path.resolve(startDir || process.cwd());
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Load .env from the nearest ancestor directory that contains one.
 * @param {string} [startDir] - Starting directory
 * @param {object} [options] - Options (same as loadEnvFile)
 * @returns {{ loaded: number, file: string|null, vars: string[] }}
 */
function loadEnvFromAncestors(startDir, options = {}) {
  const filename = options.filename || '.env';
  const envFile = findEnvFile(startDir, filename);
  if (!envFile) {
    return { loaded: 0, file: null, vars: [] };
  }
  const dir = path.dirname(envFile);
  return loadEnvFile(dir, options);
}

module.exports = {
  parseEnvContent,
  loadEnvFile,
  findEnvFile,
  loadEnvFromAncestors,
};
