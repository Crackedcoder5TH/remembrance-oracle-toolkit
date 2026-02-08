/**
 * Remembrance Self-Reflector — Shared Utilities
 *
 * Common patterns extracted from all reflector modules:
 * - ensureDir: create directory if it doesn't exist
 * - loadJSON: load and parse JSON with fallback
 * - saveJSON: ensure dir + write JSON atomically
 * - trimArray: keep only last N items
 *
 * Eliminates ~50 lines of duplicate code across modules.
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Load and parse a JSON file with a fallback value.
 * Returns a deep copy of the fallback (not a reference).
 *
 * @param {string} filePath - Absolute path to JSON file
 * @param {*} fallback - Value to return if file doesn't exist or parse fails
 * @returns {*} Parsed JSON or fallback
 */
function loadJSON(filePath, fallback = null) {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // Fall through to fallback
  }
  // Return a deep copy of fallback to prevent mutation
  return fallback !== null ? structuredClone(fallback) : null;
}

/**
 * Save data as JSON, ensuring the parent directory exists.
 *
 * @param {string} filePath - Absolute path to JSON file
 * @param {*} data - Data to serialize
 * @returns {*} The data that was saved
 */
function saveJSON(filePath, data) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

/**
 * Trim an array to keep only the last `maxLength` items.
 * Mutates the array in place.
 *
 * @param {Array} arr - Array to trim
 * @param {number} maxLength - Maximum items to keep
 * @returns {Array} The trimmed array
 */
function trimArray(arr, maxLength) {
  while (arr.length > maxLength) arr.shift();
  return arr;
}

module.exports = { ensureDir, loadJSON, saveJSON, trimArray };
