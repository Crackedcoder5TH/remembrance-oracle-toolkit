'use strict';

/**
 * Cascade Detector — finds assumption mismatches that ripple through callers.
 *
 * Given a bug-fix commit, this module:
 *   1. Parses the diff to find changed functions
 *   2. Finds all callers/dependents of those functions
 *   3. Checks if callers made the same assumption that was just proven wrong
 *   4. Reports cascading assumption mismatches
 *
 * Usage:
 *   node src/cli.js audit cascade --from HEAD~1
 *   node src/cli.js audit cascade --from abc123
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ─── Diff Parsing ───

/**
 * Parse a git diff to extract changed function names and their files.
 *
 * @param {string} diffOutput - Raw `git diff` output
 * @returns {Array<{ file: string, functions: string[], changes: string[] }>}
 */
function parseDiffForFunctions(diffOutput) {
  if (!diffOutput || typeof diffOutput !== 'string') return [];

  const fileChanges = [];
  const fileSections = diffOutput.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const fileMatch = section.match(/^a\/(.+?)\s+b\/(.+)/m);
    if (!fileMatch) continue;
    const file = fileMatch[2];

    // Only process source files
    if (!/\.(js|ts|py|go|rs)$/.test(file)) continue;

    const functions = new Set();
    const changes = [];
    const hunks = section.split(/^@@/m).slice(1);

    for (const hunk of hunks) {
      const addedLines = hunk.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));

      for (const line of addedLines) {
        const cleaned = line.slice(1); // Remove leading +
        changes.push(cleaned);

        // Extract function names from context
        const fnMatch = cleaned.match(/(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\())/);
        if (fnMatch) {
          functions.add(fnMatch[1] || fnMatch[2]);
        }
      }

      // Also check @@ headers for function context
      const headerMatch = hunk.match(/@@.*@@\s*(?:function\s+)?(\w+)/);
      if (headerMatch) {
        functions.add(headerMatch[1]);
      }
    }

    if (functions.size > 0 || changes.length > 0) {
      fileChanges.push({
        file,
        functions: [...functions],
        changes,
      });
    }
  }

  return fileChanges;
}

/**
 * Find all files that import/require a given module.
 *
 * @param {string} targetFile - The changed file path
 * @param {string} cwd - Repository root
 * @returns {string[]} Array of dependent file paths
 */
function findDependents(targetFile, cwd) {
  const dependents = [];
  const baseName = path.basename(targetFile, path.extname(targetFile));
  const relativePath = targetFile.replace(/\.(js|ts)$/, '');

  // Search for require/import of this file
  try {
    const patterns = [baseName];
    if (relativePath.includes('/')) {
      patterns.push(relativePath);
      patterns.push('./' + relativePath);
    }

    for (const pattern of patterns) {
      try {
        const result = execFileSync('grep', [
          '-rl',
          '--include=*.js',
          '--include=*.ts',
          pattern,
          cwd,
        ], { encoding: 'utf-8', timeout: 10000 }).trim();

        if (result) {
          for (const file of result.split('\n')) {
            if (file && file !== targetFile && !file.includes('node_modules') && !dependents.includes(file)) {
              dependents.push(file);
            }
          }
        }
      } catch (_) {
        // grep returns exit 1 when no matches — expected
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[cascade:findDependents]', e?.message || e);
  }

  return dependents;
}

/**
 * Find callers of a specific function in a file.
 *
 * @param {string} functionName - Function to search for
 * @param {string} filePath - File to search in
 * @returns {Array<{ line: number, code: string }>}
 */
function findCallers(functionName, filePath) {
  const callers = [];

  try {
    if (!fs.existsSync(filePath)) return callers;
    const code = fs.readFileSync(filePath, 'utf-8');
    const lines = code.split('\n');

    const callPattern = new RegExp(`\\b${functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);

    for (let i = 0; i < lines.length; i++) {
      if (callPattern.test(lines[i])) {
        // Exclude the function definition itself
        if (!/function\s+/.test(lines[i]) && !/=\s*(?:async\s+)?function/.test(lines[i])) {
          callers.push({
            line: i + 1,
            code: lines[i].trim(),
          });
        }
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[cascade:findCallers]', e?.message || e);
  }

  return callers;
}

/**
 * Infer what assumption was broken from the diff changes.
 *
 * @param {string[]} changes - Added lines from diff
 * @returns {Array<{ type: string, description: string, check: function }>}
 */
function inferBrokenAssumptions(changes) {
  const assumptions = [];
  const changeText = changes.join('\n');

  // Null check added → assumption was "never returns null"
  if (/if\s*\(\s*!?\w+\s*(?:===?\s*null|!==?\s*null|===?\s*undefined|\?\.)/.test(changeText)) {
    assumptions.push({
      type: 'null-safety',
      description: 'Return value can be null/undefined',
      check: (callerLine) => {
        // Check if caller uses result without null check
        return !callerLine.includes('?.') && !callerLine.includes('??') &&
               !/if\s*\(\s*!/.test(callerLine) && !/!==?\s*null/.test(callerLine);
      },
    });
  }

  // Error handling added → assumption was "never throws"
  if (/try\s*\{|\.catch\s*\(/.test(changeText)) {
    assumptions.push({
      type: 'error-handling',
      description: 'Operation can throw an error',
      check: (callerLine) => {
        return !callerLine.includes('try') && !callerLine.includes('catch');
      },
    });
  }

  // Bounds check added → assumption was "always in bounds"
  if (/\.length|>=\s*0|<\s*\w+\.length/.test(changeText)) {
    assumptions.push({
      type: 'bounds-check',
      description: 'Array/string access can be out of bounds',
      check: (callerLine) => {
        return callerLine.includes('[') && !callerLine.includes('.length');
      },
    });
  }

  // Type check added → assumption was "always correct type"
  if (/typeof\s+\w+\s*[!=]==?\s*'/.test(changeText)) {
    assumptions.push({
      type: 'type-safety',
      description: 'Argument may be wrong type',
      check: (callerLine) => {
        return !callerLine.includes('typeof');
      },
    });
  }

  // Sort/copy fix → assumption was "immutable operation"
  if (/\.slice\(\)\.sort|\.\.\.(\w+)]\.sort|\bstructuredClone\b/.test(changeText)) {
    assumptions.push({
      type: 'mutation-safety',
      description: 'Operation mutates input',
      check: (callerLine) => {
        return /\.sort\s*\(/.test(callerLine) && !callerLine.includes('.slice(');
      },
    });
  }

  return assumptions;
}

/**
 * Check if a file is a test file (should be excluded from cascade warnings by default).
 */
function isTestFile(filePath) {
  return /\.(test|spec|_test)\.(js|ts|py|go|rs)$/.test(filePath) ||
    /\/tests?\//.test(filePath) ||
    /\/__tests__\//.test(filePath) ||
    /\/test\//.test(filePath);
}

/**
 * Run cascade detection from a commit.
 *
 * @param {string} commitRange - Git commit range (e.g., 'HEAD~1..HEAD', 'abc123')
 * @param {string} cwd - Repository root
 * @param {object} [options] - { dryRun, maxDepth, includeTests }
 * @returns {{ changedFunctions: Array, cascades: Array, summary: object }}
 */
function detectCascade(commitRange, cwd, options = {}) {
  const report = {
    changedFunctions: [],
    cascades: [],
    summary: {
      filesAnalyzed: 0,
      functionsChanged: 0,
      cascadesFound: 0,
      byType: {},
    },
  };

  if (!commitRange || typeof commitRange !== 'string') {
    report.error = 'commitRange must be a non-empty string';
    return report;
  }

  try {
    // Get diff from commit
    let diffOutput;
    try {
      if (commitRange.includes('..')) {
        diffOutput = execFileSync('git', ['diff', commitRange], { cwd, encoding: 'utf-8', timeout: 15000 });
      } else {
        diffOutput = execFileSync('git', ['diff', `${commitRange}~1`, commitRange], { cwd, encoding: 'utf-8', timeout: 15000 });
      }
    } catch (e) {
      // Fallback: try diff of last commit
      diffOutput = execFileSync('git', ['diff', 'HEAD~1', 'HEAD'], { cwd, encoding: 'utf-8', timeout: 15000 });
    }

    if (!diffOutput) return report;

    // Parse diff for changed functions
    const fileChanges = parseDiffForFunctions(diffOutput);
    report.summary.filesAnalyzed = fileChanges.length;

    for (const change of fileChanges) {
      report.changedFunctions.push({
        file: change.file,
        functions: change.functions,
      });
      report.summary.functionsChanged += change.functions.length;

      // Infer what assumptions were broken
      const brokenAssumptions = inferBrokenAssumptions(change.changes);
      if (brokenAssumptions.length === 0) continue;

      // Find dependent files
      const dependents = findDependents(change.file, cwd);

      // Check each function in each dependent file
      const includeTests = options.includeTests || false;
      for (const fn of change.functions) {
        for (const depFile of dependents) {
          // Skip test files by default (they're expected to call without guards)
          if (!includeTests && isTestFile(depFile)) continue;
          // Skip the source file itself (internal callers are usually safe)
          if (path.resolve(depFile) === path.resolve(cwd, change.file)) continue;

          const callers = findCallers(fn, depFile);

          for (const caller of callers) {
            for (const assumption of brokenAssumptions) {
              if (assumption.check(caller.code)) {
                report.cascades.push({
                  sourceFile: change.file,
                  sourceFunction: fn,
                  targetFile: depFile,
                  targetLine: caller.line,
                  targetCode: caller.code,
                  assumptionType: assumption.type,
                  assumptionBroken: assumption.description,
                });
                report.summary.cascadesFound++;
                report.summary.byType[assumption.type] = (report.summary.byType[assumption.type] || 0) + 1;
              }
            }
          }
        }
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[cascade:detectCascade]', e?.message || e);
    report.error = e.message;
  }

  return report;
}

module.exports = {
  detectCascade,
  parseDiffForFunctions,
  findDependents,
  findCallers,
  inferBrokenAssumptions,
  isTestFile,
};

// ── Atomic self-description (batch-generated) ────────────────────
detectCascade.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
parseDiffForFunctions.atomicProperties = {
  charge: 0, valence: 0, mass: 'heavy', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
findDependents.atomicProperties = {
  charge: 0, valence: 1, mass: 'heavy', spin: 'odd', phase: 'liquid',
  reactivity: 'low', electronegativity: 1, group: 2, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
findCallers.atomicProperties = {
  charge: 0, valence: 0, mass: 'heavy', spin: 'odd', phase: 'liquid',
  reactivity: 'medium', electronegativity: 0, group: 3, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
inferBrokenAssumptions.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
isTestFile.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
};
