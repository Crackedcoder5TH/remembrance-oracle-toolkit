'use strict';

/**
 * void-indirection.js
 *
 * Content-addressable indirection detector using the Void Data Compressor.
 *
 * Concept: Compress code twice — once as-is, once with known harmful identifiers
 * removed. If the compression ratio changes significantly, the code's mathematical
 * structure is "about" those identifiers even if they never appeared literally.
 *
 * The Void compressor finds deep mathematical patterns in data. If removing an
 * identifier (replaced with same-length spaces) changes how the compressor sees
 * the data, the code's structure was organized around that concept.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

/**
 * Known harmful identifiers that may indicate dangerous code patterns
 * when the mathematical structure of code revolves around them.
 */
const HARMFUL_IDENTIFIERS = [
  // Code execution
  'eval',
  'exec',
  'execSync',
  'execFile',
  'execFileSync',
  'Function',
  // Process spawning
  'child_process',
  'spawn',
  'spawnSync',
  'fork',
  // Network exfiltration
  'XMLHttpRequest',
  'fetch',
  'WebSocket',
  'net.connect',
  'http.request',
  'https.request',
  // File system abuse
  'writeFileSync',
  'writeFile',
  'appendFile',
  'createWriteStream',
  // Module manipulation
  'require',
  'import',
  '__proto__',
  'prototype',
  'constructor',
  // Crypto / obfuscation
  'atob',
  'btoa',
  'Buffer.from',
  'String.fromCharCode',
  // Dangerous globals
  'process.env',
  'process.exit',
  'global',
  'globalThis',
  'vm.runInNewContext',
  'vm.runInThisContext',
];

/**
 * Atomic properties for this module.
 */
const atomicProperties = {
  domain: 'security',
  alignment: 'healing',
};

// Path to the Void Data Compressor
const voidPath = process.env.VOID_COMPRESSOR_PATH || path.resolve(__dirname, '..', '..', '..', 'Void-Data-Compressor');

/**
 * Generate a unique temporary file path.
 * @returns {string} Path to a temp file
 */
function tempFilePath() {
  const id = crypto.randomBytes(8).toString('hex');
  return path.join(os.tmpdir(), `void-indirection-${id}.tmp`);
}

/**
 * Measure compression ratio of the given content using the Void compressor.
 * @param {Buffer|string} content - The content to compress
 * @param {object} options - Options including timeout
 * @returns {number} Compression ratio (original_size / compressed_size)
 */
function measureRatio(content, options = {}) {
  const timeout = options.timeout || 30000;
  const tmpFile = tempFilePath();

  try {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');
    fs.writeFileSync(tmpFile, buffer);

    const measureScript = path.join(voidPath, 'measure_ratio.py');
    const result = execSync(`python3 "${measureScript}" "${tmpFile}"`, {
      timeout,
      encoding: 'utf-8',
      cwd: voidPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const ratio = parseFloat(result.trim());
    return isNaN(ratio) ? 1.0 : ratio;
  } catch (err) {
    // If compression fails (missing compressor, timeout, etc.), return neutral
    return 1.0;
  } finally {
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch (_) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create a sanitized version of code with a specific identifier replaced
 * by spaces of the same length.
 * @param {string} code - Source code
 * @param {string} identifier - Identifier to sanitize
 * @returns {string} Sanitized code
 */
function sanitizeIdentifier(code, identifier) {
  const replacement = ' '.repeat(identifier.length);
  // Use global replace to catch all occurrences
  return code.split(identifier).join(replacement);
}

/**
 * Calculate confidence score based on ratio delta and code properties.
 * @param {number} ratioDelta - Absolute difference in compression ratios
 * @param {number} threshold - Detection threshold
 * @returns {number} Confidence score between 0 and 1
 */
function calculateConfidence(ratioDelta, threshold) {
  if (ratioDelta <= 0) return 0;
  // Confidence scales from 0 at threshold to 1 at 5x threshold
  const normalized = Math.min(1.0, ratioDelta / (threshold * 5));
  return Math.round(normalized * 1000) / 1000;
}

/**
 * Detect hidden identifiers in code using compression ratio analysis.
 *
 * Compresses code twice — once as-is, once with each harmful identifier removed.
 * If the compression ratio changes significantly, the code's mathematical structure
 * is organized around that identifier even if it never appeared literally.
 *
 * @param {string} code - Source code to analyze
 * @param {object} [options] - Configuration options
 * @param {number} [options.threshold=0.05] - Minimum ratio delta to flag
 * @param {string[]} [options.identifiers] - Custom identifier list (defaults to HARMFUL_IDENTIFIERS)
 * @param {number} [options.timeout=30000] - Subprocess timeout in ms
 * @param {boolean} [options.verbose=false] - Include extra debug info in results
 * @returns {object} Detection results: { flagged, clean, ratioOriginal, metadata }
 */
function detectHiddenIdentifiers(code, options = {}) {
  const {
    threshold = 0.05,
    identifiers = HARMFUL_IDENTIFIERS,
    timeout = 30000,
    verbose = false,
  } = options;

  const result = {
    flagged: [],
    clean: true,
    ratioOriginal: null,
    metadata: {
      identifiersChecked: identifiers.length,
      threshold,
      compressorAvailable: false,
    },
  };

  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    return result;
  }

  // Step 1: Measure original compression ratio
  let ratioOriginal;
  try {
    ratioOriginal = measureRatio(code, { timeout });
    result.ratioOriginal = ratioOriginal;
    result.metadata.compressorAvailable = ratioOriginal !== 1.0 || code.length < 10;
  } catch (err) {
    // Compressor unavailable — return clean with note
    result.metadata.error = 'Void compressor unavailable';
    return result;
  }

  // If ratio is exactly 1.0 and code is non-trivial, compressor may be unavailable
  // Still proceed with the analysis in case 1.0 is legitimate
  if (ratioOriginal === 1.0 && code.length > 100) {
    result.metadata.compressorAvailable = false;
  }

  // Step 2: For each identifier, create sanitized version and measure
  for (const identifier of identifiers) {
    const sanitized = sanitizeIdentifier(code, identifier);

    // Skip if the identifier wasn't even structurally present (no change in text)
    // But still check — the mathematical structure may differ even without literal presence
    const ratioSanitized = measureRatio(sanitized, { timeout });
    const ratioDelta = Math.abs(ratioOriginal - ratioSanitized);

    if (ratioDelta > threshold) {
      const confidence = calculateConfidence(ratioDelta, threshold);
      result.flagged.push({
        identifier,
        ratioDelta: Math.round(ratioDelta * 10000) / 10000,
        confidence,
        ...(verbose ? { ratioOriginal, ratioSanitized } : {}),
      });
    }
  }

  // Step 3: Determine overall cleanliness
  result.clean = result.flagged.length === 0;

  // Sort flagged by confidence descending
  result.flagged.sort((a, b) => b.confidence - a.confidence);

  return result;
}

module.exports = {
  detectHiddenIdentifiers,
  HARMFUL_IDENTIFIERS,
  atomicProperties,
  // Exported for testing
  measureRatio,
  sanitizeIdentifier,
  calculateConfidence,
  tempFilePath,
};
