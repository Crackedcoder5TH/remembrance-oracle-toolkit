'use strict';

/**
 * Dependency Scanner — Supply Chain Security
 *
 * The covenant scans YOUR code but not imported node_modules.
 * This module closes that gap: it reads every dependency's entry
 * point, runs the covenant filter on it, computes Shannon entropy
 * to detect obfuscated/malicious payloads, and checks for suspicious
 * postinstall scripts.
 *
 * Exports:
 *   scanDependencies(repoRoot, options)  — scan all deps
 *   scanSinglePackage(pkgPath, options)  — scan one package
 *   computeEntropy(buffer)               — Shannon entropy in bits/byte
 */

const fs = require('fs');
const path = require('path');
const { covenantCheck } = require('../core/covenant');

// ── Entropy thresholds ──────────────────────────────────────────
// Normal JS:              ~4.5-5.0 bits/byte
// Minified JS:            ~5.0-5.5 bits/byte
// Obfuscated/malicious:   ~5.8+ bits/byte
const ENTROPY_THRESHOLD = 5.8;

// Patterns that indicate suspicious postinstall behavior
const SUSPICIOUS_SCRIPT_PATTERNS = [
  /https?:\/\//i,
  /curl\s/i,
  /wget\s/i,
  /node\s+-e\s/i,
  /powershell/i,
  /\beval\b/i,
  /base64/i,
];

/**
 * Compute Shannon entropy of a buffer (or string).
 *
 * Shannon entropy = -sum(p_i * log2(p_i)) for each byte frequency.
 * Returns bits per byte (0 for empty input, max 8 for uniformly random bytes).
 *
 * @param {Buffer|string} buffer — input data
 * @returns {number} entropy in bits/byte
 */
function computeEntropy(buffer) {
  if (!buffer || buffer.length === 0) return 0;

  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, 'utf-8');
  if (buf.length === 0) return 0;

  // Count byte frequencies
  const freq = new Array(256).fill(0);
  for (let i = 0; i < buf.length; i++) {
    freq[buf[i]]++;
  }

  // Shannon entropy
  const len = buf.length;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (freq[i] === 0) continue;
    const p = freq[i] / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Scan a single package directory.
 *
 * @param {string} pkgPath — absolute path to the package directory (e.g. node_modules/foo)
 * @param {object} [options]
 * @param {boolean} [options.deepScan=false] — also scan first 5 files beyond entry point
 * @param {number}  [options.entropyThreshold=5.8] — flag files above this entropy
 * @returns {{ pkg: string, entryPoint: string, entropy: number, covenantPassed: boolean, flags: string[], reason: string }}
 */
function scanSinglePackage(pkgPath, options = {}) {
  const {
    deepScan = false,
    entropyThreshold = ENTROPY_THRESHOLD,
  } = options;

  const flags = [];
  const reasons = [];

  // Read the package's package.json
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return {
      pkg: path.basename(pkgPath),
      entryPoint: null,
      entropy: 0,
      covenantPassed: false,
      flags: ['missing-package-json'],
      reason: 'No package.json found',
    };
  }

  let pkgJson;
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  } catch (err) {
    return {
      pkg: path.basename(pkgPath),
      entryPoint: null,
      entropy: 0,
      covenantPassed: false,
      flags: ['invalid-package-json'],
      reason: `Failed to parse package.json: ${err.message}`,
    };
  }

  const pkgName = pkgJson.name || path.basename(pkgPath);

  // Determine entry point
  const mainField = pkgJson.main || 'index.js';
  const entryPointPath = path.join(pkgPath, mainField);
  let entryPointExists = false;
  let entryCode = '';

  if (fs.existsSync(entryPointPath) && fs.statSync(entryPointPath).isFile()) {
    entryPointExists = true;
    try {
      entryCode = fs.readFileSync(entryPointPath, 'utf-8');
    } catch {
      flags.push('unreadable-entry');
      reasons.push(`Could not read entry point: ${mainField}`);
    }
  } else {
    flags.push('missing-entry-point');
    reasons.push(`Entry point not found: ${mainField}`);
  }

  // Compute entropy of entry point
  let entropy = 0;
  if (entryCode) {
    entropy = computeEntropy(entryCode);
    if (entropy > entropyThreshold) {
      flags.push('high-entropy');
      reasons.push(`Entry point entropy ${entropy.toFixed(2)} exceeds threshold ${entropyThreshold}`);
    }
  }

  // Run covenant check on entry point
  let covenantPassed = true;
  if (entryCode) {
    try {
      const result = covenantCheck(entryCode);
      if (!result.sealed) {
        covenantPassed = false;
        flags.push('covenant-violation');
        const violationNames = result.violations.map(v => v.reason).slice(0, 3);
        reasons.push(`Covenant violation: ${violationNames.join('; ')}`);
      }
    } catch (err) {
      // Covenant check itself failed — treat as suspicious
      flags.push('covenant-error');
      reasons.push(`Covenant check error: ${err.message}`);
    }
  }

  // Check postinstall scripts
  const scripts = pkgJson.scripts || {};
  const dangerousScripts = ['postinstall', 'preinstall', 'install'];
  for (const scriptName of dangerousScripts) {
    const scriptCmd = scripts[scriptName];
    if (!scriptCmd) continue;

    for (const pattern of SUSPICIOUS_SCRIPT_PATTERNS) {
      if (pattern.test(scriptCmd)) {
        flags.push('suspicious-script');
        reasons.push(`Suspicious ${scriptName} script: "${scriptCmd.slice(0, 100)}"`);
        break;
      }
    }
  }

  // Deep scan: check first 5 .js files beyond the entry point
  if (deepScan && entryPointExists) {
    try {
      const files = collectJsFiles(pkgPath, 5, entryPointPath);
      for (const filePath of files) {
        try {
          const code = fs.readFileSync(filePath, 'utf-8');
          const fileEntropy = computeEntropy(code);
          if (fileEntropy > entropyThreshold) {
            const relPath = path.relative(pkgPath, filePath);
            flags.push('high-entropy-deep');
            reasons.push(`Deep scan: ${relPath} entropy ${fileEntropy.toFixed(2)}`);
          }

          const cResult = covenantCheck(code);
          if (!cResult.sealed) {
            const relPath = path.relative(pkgPath, filePath);
            flags.push('covenant-violation-deep');
            reasons.push(`Deep scan: ${relPath} covenant violation`);
          }
        } catch {
          // Skip unreadable files in deep scan
        }
      }
    } catch {
      // Skip if directory listing fails
    }
  }

  return {
    pkg: pkgName,
    entryPoint: mainField,
    entropy: Math.round(entropy * 100) / 100,
    covenantPassed,
    flags,
    reason: reasons.length > 0 ? reasons.join('; ') : 'clean',
  };
}

/**
 * Collect up to `limit` .js files in a directory (shallow + one level deep),
 * excluding the entry point itself.
 */
function collectJsFiles(dir, limit, excludePath) {
  const results = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit) break;
      const fullPath = path.join(dir, entry.name);

      if (entry.isFile() && entry.name.endsWith('.js') && fullPath !== excludePath) {
        results.push(fullPath);
      } else if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
        // One level deep
        try {
          const subEntries = fs.readdirSync(fullPath, { withFileTypes: true });
          for (const sub of subEntries) {
            if (results.length >= limit) break;
            if (sub.isFile() && sub.name.endsWith('.js')) {
              results.push(path.join(fullPath, sub.name));
            }
          }
        } catch {
          // Skip inaccessible subdirectories
        }
      }
    }
  } catch {
    // Skip inaccessible directories
  }

  return results;
}

/**
 * Scan all dependencies listed in a repo's package.json.
 *
 * @param {string} repoRoot — path to the repo root (must contain package.json)
 * @param {object} [options]
 * @param {boolean} [options.deepScan=false] — scan beyond entry points
 * @param {number}  [options.entropyThreshold=5.8] — entropy flag threshold
 * @param {boolean} [options.devDependencies=true] — include devDependencies
 * @returns {{ scanned: number, clean: number, flagged: number, details: Array }}
 */
function scanDependencies(repoRoot, options = {}) {
  const {
    deepScan = false,
    entropyThreshold = ENTROPY_THRESHOLD,
    devDependencies = true,
  } = options;

  // Read the repo's package.json
  const repoPackageJsonPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(repoPackageJsonPath)) {
    return {
      scanned: 0,
      clean: 0,
      flagged: 0,
      details: [],
      error: 'No package.json found at repo root',
    };
  }

  let repoPkgJson;
  try {
    repoPkgJson = JSON.parse(fs.readFileSync(repoPackageJsonPath, 'utf-8'));
  } catch (err) {
    return {
      scanned: 0,
      clean: 0,
      flagged: 0,
      details: [],
      error: `Failed to parse package.json: ${err.message}`,
    };
  }

  // Collect dependency names
  const deps = Object.keys(repoPkgJson.dependencies || {});
  const devDeps = devDependencies ? Object.keys(repoPkgJson.devDependencies || {}) : [];
  const allDeps = [...new Set([...deps, ...devDeps])];

  const details = [];
  let clean = 0;
  let flagged = 0;

  const nodeModulesDir = path.join(repoRoot, 'node_modules');

  for (const depName of allDeps) {
    // Handle scoped packages (e.g. @scope/pkg)
    const pkgPath = path.join(nodeModulesDir, depName);

    if (!fs.existsSync(pkgPath)) {
      details.push({
        pkg: depName,
        entryPoint: null,
        entropy: 0,
        covenantPassed: true,
        flags: ['not-installed'],
        reason: 'Package not installed in node_modules',
      });
      flagged++;
      continue;
    }

    const result = scanSinglePackage(pkgPath, { deepScan, entropyThreshold });
    details.push(result);

    if (result.flags.length > 0) {
      flagged++;
    } else {
      clean++;
    }
  }

  return {
    scanned: allDeps.length,
    clean,
    flagged,
    details,
  };
}

// ── Exports ─────────────────────────────────────────────────────
module.exports = {
  scanDependencies,
  scanSinglePackage,
  computeEntropy,
};

// ── Atomic self-description ─────────────────────────────────────
scanDependencies.atomicProperties = {
  charge: 0, valence: 3, mass: 'heavy', spin: 'odd', phase: 'solid',
  reactivity: 'reactive', electronegativity: 0.5, group: 11, period: 3,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};
scanSinglePackage.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'odd', phase: 'solid',
  reactivity: 'reactive', electronegativity: 0.4, group: 11, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};
computeEntropy.atomicProperties = {
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 1, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'security',
};
