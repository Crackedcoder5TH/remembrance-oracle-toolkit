'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Validate that a resolved path stays within the expected base directory.
 * Prevents path traversal attacks via '../' sequences and symlink escapes.
 *
 * @param {string} filePath - The path to validate
 * @param {string} baseDir - The base directory that filePath must stay within
 * @returns {string} The resolved, safe path
 * @throws {Error} If the path escapes the base directory
 */
function safePath(filePath, baseDir) {
  if (typeof filePath !== 'string') throw new Error('filePath must be a string');
  const resolved = path.resolve(baseDir, filePath);
  const resolvedBase = path.resolve(baseDir);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${baseDir}`);
  }
  // Resolve symlinks to prevent symlink-based traversal
  try {
    const realResolved = fs.realpathSync(resolved);
    const realBase = fs.realpathSync(resolvedBase);
    if (!realResolved.startsWith(realBase + path.sep) && realResolved !== realBase) {
      throw new Error(`Symlink traversal detected: ${filePath} resolves outside ${baseDir}`);
    }
    return realResolved;
  } catch (e) {
    // If realpath fails (file doesn't exist yet), fall back to lexical check
    if (e.code === 'ENOENT') return resolved;
    throw e;
  }
}

/**
 * Normalize and sanitize a filename, removing path separators and traversal.
 * Use for user-provided filenames that should be flat (no directory components).
 *
 * @param {string} filename - The filename to sanitize
 * @returns {string} The sanitized filename
 */
function safeFilename(filename) {
  return path.basename(String(filename || '').replace(/\.\./g, ''));
}

module.exports = { safePath, safeFilename };
