'use strict';

/**
 * Batch Atomizer — scans a module for exported functions and appends
 * .atomicProperties to each one. Uses the property extractor for
 * initial suggestions, then applies them non-destructively.
 *
 * Usage:
 *   const { batchAtomize } = require('./batch-atomizer');
 *   const result = batchAtomize('src/core/validator.js');
 *   // result.atomized: number of functions that got properties
 *   // result.codeToAppend: string to add at the end of the file
 */

const fs = require('fs');
const path = require('path');
const { extractAtomicProperties } = require('./property-extractor');
const { encodeSignature } = require('./periodic-table');

/**
 * Scan a JS file for exported functions that lack .atomicProperties.
 * Returns an array of { name, suggestedProperties, signature }.
 */
function scanForUnatomized(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const code = fs.readFileSync(filePath, 'utf-8');

  // Find all exported names
  const exportedNames = new Set();
  const objExport = code.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  if (objExport) {
    const names = objExport[1].match(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g) || [];
    for (const n of names) {
      if (!/^(function|async|const|let|var|return|if|for|module|exports|require)$/.test(n)) {
        exportedNames.add(n);
      }
    }
  }
  // Named exports: exports.name = ...
  const namedExports = code.match(/exports\.([A-Za-z_][A-Za-z0-9_]*)\s*=/g) || [];
  for (const e of namedExports) {
    const m = e.match(/exports\.([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) exportedNames.add(m[1]);
  }

  // Filter to only names that are functions (not constants/classes)
  const functionNames = [];
  for (const name of exportedNames) {
    // Check if already atomized
    if (code.includes(`${name}.atomicProperties`)) continue;
    // Check if it's a function
    const funcPattern = new RegExp(`\\bfunction\\s+${name}\\s*\\(|\\b${name}\\s*=\\s*(?:async\\s+)?(?:function|\\()`);
    if (funcPattern.test(code)) {
      functionNames.push(name);
    }
  }

  // Extract suggested properties from the full file code
  // then customize per function by looking at the function body
  const results = [];
  for (const name of functionNames) {
    // Try to extract just this function's code
    const funcBodyMatch = code.match(new RegExp(
      `(?:function\\s+${name}|(?:const|let|var)\\s+${name}\\s*=)\\s*[^{]*\\{`,
      's'
    ));
    let funcCode = code; // fallback to full file
    if (funcBodyMatch) {
      const start = funcBodyMatch.index;
      let depth = 0;
      let end = start;
      for (let i = start; i < code.length; i++) {
        if (code[i] === '{') depth++;
        if (code[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
      }
      funcCode = code.slice(start, end);
    }

    const props = extractAtomicProperties(funcCode);
    const sig = encodeSignature(props);
    results.push({ name, suggestedProperties: props, signature: sig });
  }

  return results;
}

/**
 * Generate the code block to append to a file to atomize its functions.
 */
function generateAtomicBlock(functions) {
  if (functions.length === 0) return '';
  const lines = [
    '',
    '// ── Atomic self-description (batch-generated) ────────────────────',
  ];
  for (const fn of functions) {
    const p = fn.suggestedProperties;
    lines.push(`${fn.name}.atomicProperties = {`);
    lines.push(`  charge: ${p.charge}, valence: ${p.valence}, mass: '${p.mass}', spin: '${p.spin}', phase: '${p.phase}',`);
    lines.push(`  reactivity: '${p.reactivity}', electronegativity: ${p.electronegativity}, group: ${p.group}, period: ${p.period},`);
    lines.push(`  harmPotential: '${p.harmPotential}', alignment: '${p.alignment}', intention: '${p.intention}',`);
    lines.push(`};`);
  }
  return lines.join('\n');
}

/**
 * Atomize a file: scan for un-atomized exports, generate the block,
 * append it to the file. Returns the result summary.
 *
 * @param {string} filePath
 * @param {object} [options]
 *   - dryRun: if true, don't write (default false)
 * @returns {{ file, atomized, functions, codeToAppend }}
 */
function batchAtomize(filePath, options = {}) {
  const functions = scanForUnatomized(filePath);
  const block = generateAtomicBlock(functions);

  if (functions.length > 0 && !options.dryRun && block) {
    fs.appendFileSync(filePath, block + '\n');
  }

  return {
    file: filePath,
    atomized: functions.length,
    functions: functions.map(f => ({ name: f.name, signature: f.signature })),
    codeToAppend: block,
  };
}

/**
 * Batch atomize multiple files. Returns aggregate results.
 */
function batchAtomizeFiles(filePaths, options = {}) {
  const results = [];
  let totalAtomized = 0;
  for (const fp of filePaths) {
    const result = batchAtomize(fp, options);
    if (result.atomized > 0) {
      results.push(result);
      totalAtomized += result.atomized;
    }
  }
  return { files: results, totalAtomized };
}

module.exports = {
  scanForUnatomized,
  generateAtomicBlock,
  batchAtomize,
  batchAtomizeFiles,
};
