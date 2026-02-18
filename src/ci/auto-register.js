/**
 * Auto-Register Module — Diff-targeted pattern registration.
 *
 * @oracle-infrastructure
 *
 * Analyzes git diffs to identify new/modified functions in committed code,
 * finds their associated test files, and registers them as Oracle patterns.
 * Much faster and more targeted than full-directory harvest.
 *
 * Usage:
 *   // Post-commit (automatic)
 *   autoRegister(oracle, process.cwd());
 *
 *   // CLI
 *   oracle auto-register [--dry-run] [--commit HEAD~1..HEAD]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { extractFunctionNames, detectLanguage } = require('./auto-seed');
const { splitFunctions } = require('./harvest');

const CODE_EXTS = /\.(js|ts|py|go|rs|jsx|tsx)$/;

/**
 * Get files changed in the most recent commit (or a specific range).
 *
 * @param {string} cwd — Working directory
 * @param {string} range — Git diff range (default: HEAD~1..HEAD)
 * @returns {string[]} — Array of changed file paths (relative to cwd)
 */
function getChangedFiles(cwd, range = 'HEAD~1..HEAD') {
  try {
    const output = execSync(`git diff --name-only --diff-filter=ACM ${range}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (!output) return [];
    return output.split('\n').filter(f => CODE_EXTS.test(f));
  } catch {
    return [];
  }
}

/**
 * Get added lines from a git diff for a specific file.
 * Returns only lines that were added (not context or removed).
 *
 * @param {string} cwd — Working directory
 * @param {string} file — File path relative to cwd
 * @param {string} range — Git diff range
 * @returns {string} — The added code
 */
function getAddedCode(cwd, file, range = 'HEAD~1..HEAD') {
  try {
    const diff = execSync(`git diff -U0 ${range} -- "${file}"`, {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    });

    // Extract only added lines (starting with +, excluding +++ header)
    return diff
      .split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.slice(1))
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * Find the test file for a given source file.
 * Checks common test file naming conventions.
 *
 * @param {string} sourceFile — Absolute path to source file
 * @param {string} baseDir — Project root directory
 * @returns {string|null} — Absolute path to test file, or null
 */
function findTestFile(sourceFile, baseDir) {
  const rel = path.relative(baseDir, sourceFile);
  const ext = path.extname(sourceFile);
  const base = path.basename(sourceFile, ext);
  const dir = path.dirname(sourceFile);

  // Language-specific test patterns
  const candidates = [];

  if (ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx') {
    candidates.push(
      path.join(dir, `${base}.test${ext}`),
      path.join(dir, `${base}.spec${ext}`),
      path.join(baseDir, 'tests', `${base}.test${ext}`),
      path.join(baseDir, 'tests', `${rel.replace(ext, `.test${ext}`)}`),
      path.join(baseDir, 'test', `${base}.test${ext}`),
      path.join(baseDir, '__tests__', `${base}.test${ext}`),
    );
  } else if (ext === '.py') {
    candidates.push(
      path.join(dir, `test_${base}${ext}`),
      path.join(dir, `${base}_test${ext}`),
      path.join(baseDir, 'tests', `test_${base}${ext}`),
    );
  } else if (ext === '.go') {
    candidates.push(path.join(dir, `${base}_test${ext}`));
  } else if (ext === '.rs') {
    candidates.push(path.join(dir, 'tests', `${base}${ext}`));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Check if a function name is already registered as a pattern.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {string} name — Function or pattern name
 * @returns {boolean}
 */
function isRegistered(oracle, name) {
  try {
    if (typeof oracle.patterns?.getAll === 'function') {
      const all = oracle.patterns.getAll();
      return all.some(p => p.name === name);
    }
    // Fallback: search the store
    const results = oracle.search(name, { limit: 5 });
    return results.some(r => r.name === name);
  } catch {
    return false;
  }
}

/**
 * Extract registerable functions from a source file.
 * Splits the file into individual functions and filters out
 * trivial ones (too short, test utilities, private helpers).
 *
 * @param {string} code — Full source code
 * @param {string} language — Detected language
 * @param {string[]} newFunctionNames — Names of functions from the diff (optional filter)
 * @returns {{ name: string, code: string, language: string }[]}
 */
function extractFunctions(code, language, newFunctionNames) {
  const allFunctions = splitFunctions(code, language);
  const newNames = newFunctionNames ? new Set(newFunctionNames) : null;

  return allFunctions.filter(fn => {
    // Skip private/internal helpers (leading underscore)
    if (fn.name.startsWith('_')) return false;

    // Skip very short functions (likely getters/setters)
    if (fn.code.length < 50) return false;

    // If we know which functions were added, only include those
    if (newNames && !newNames.has(fn.name)) return false;

    return true;
  });
}

/**
 * Build pattern tags from function name, file path, and language.
 */
function buildTags(name, filePath, language, functionNames) {
  const tags = [language, 'auto-registered'];
  const dir = path.dirname(filePath);

  // Add directory context
  const dirParts = dir.split(path.sep).filter(p => p && p !== '.' && p !== 'src');
  if (dirParts.length > 0) tags.push(dirParts[dirParts.length - 1]);

  // Add function names (up to 5)
  for (const fn of functionNames.slice(0, 5)) {
    if (!tags.includes(fn)) tags.push(fn);
  }

  return tags;
}

/**
 * Auto-register new functions from the latest commit as Oracle patterns.
 *
 * Workflow:
 *   1. Get changed files from git diff
 *   2. For each file, identify new/modified exported functions
 *   3. Find associated test files
 *   4. Check if already registered (dedup)
 *   5. Register each new function as a pattern
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {string} cwd — Working directory
 * @param {object} options
 * @param {string} options.range — Git diff range (default: HEAD~1..HEAD)
 * @param {boolean} options.dryRun — Preview without registering
 * @param {boolean} options.silent — Suppress output
 * @param {boolean} options.wholeFile — Register whole files instead of splitting functions
 * @returns {{ registered, skipped, alreadyExists, failed, patterns, files }}
 */
function autoRegister(oracle, cwd, options = {}) {
  const {
    range = 'HEAD~1..HEAD',
    dryRun = false,
    silent = false,
    wholeFile = false,
  } = options;

  const log = silent ? () => {} : (msg) => console.log(`[auto-register] ${msg}`);

  const report = {
    registered: 0,
    skipped: 0,
    alreadyExists: 0,
    failed: 0,
    patterns: [],
    files: [],
  };

  // Step 1: Get changed code files
  const changedFiles = getChangedFiles(cwd, range);
  if (changedFiles.length === 0) {
    log('No code files changed — nothing to register');
    return report;
  }

  log(`Found ${changedFiles.length} changed code file(s)`);

  // Build set of existing pattern names once (avoid per-function lookups)
  let existingNames = new Set();
  try {
    if (typeof oracle.patterns?.getAll === 'function') {
      existingNames = new Set(oracle.patterns.getAll().map(p => p.name));
    }
  } catch {
    // Fallback: check per-function
  }

  // Step 2: Process each changed file
  for (const relFile of changedFiles) {
    const absFile = path.resolve(cwd, relFile);
    if (!fs.existsSync(absFile)) continue;

    const language = detectLanguage(relFile);
    if (!language) continue;

    let code;
    try {
      code = fs.readFileSync(absFile, 'utf-8');
    } catch { continue; }

    // Skip files that are too large or too small
    if (code.length > 50000 || code.length < 30) continue;

    // Get names of new functions from the diff
    const addedCode = getAddedCode(cwd, relFile, range);
    const newFunctionNames = extractFunctionNames(addedCode, language);

    // Find associated test file
    const testFile = findTestFile(absFile, cwd);
    let testCode = null;
    if (testFile) {
      try { testCode = fs.readFileSync(testFile, 'utf-8'); } catch { /* no test */ }
    }

    report.files.push({
      file: relFile,
      language,
      hasTest: !!testCode,
      newFunctions: newFunctionNames,
    });

    if (wholeFile) {
      // Register the whole file as a single pattern
      const name = path.basename(relFile, path.extname(relFile));
      if (existingNames.has(name)) {
        report.alreadyExists++;
        continue;
      }

      const allFunctions = extractFunctionNames(code, language);
      const tags = buildTags(name, relFile, language, allFunctions);

      if (dryRun) {
        report.patterns.push({ name, file: relFile, functions: allFunctions, status: 'dry-run' });
        continue;
      }

      try {
        const reg = oracle.registerPattern({
          name,
          code,
          language,
          description: `Auto-registered from ${relFile}`,
          tags,
          testCode: testCode || undefined,
        });
        if (reg.registered) {
          report.registered++;
          report.patterns.push({ name, id: reg.pattern?.id, file: relFile, status: 'registered' });
          log(`Registered: ${name} (${language})`);
        } else {
          report.skipped++;
          report.patterns.push({ name, file: relFile, status: 'skipped', reason: reg.reason });
        }
      } catch { report.failed++; }
    } else {
      // Split into individual functions and register new ones
      const functions = extractFunctions(code, language, newFunctionNames.length > 0 ? newFunctionNames : null);

      for (const fn of functions) {
        if (existingNames.has(fn.name)) {
          report.alreadyExists++;
          continue;
        }

        const tags = buildTags(fn.name, relFile, language, [fn.name]);

        if (dryRun) {
          report.patterns.push({ name: fn.name, file: relFile, status: 'dry-run' });
          continue;
        }

        try {
          const reg = oracle.registerPattern({
            name: fn.name,
            code: fn.code,
            language,
            description: `Auto-registered function from ${relFile}`,
            tags,
            testCode: testCode || undefined,
          });
          if (reg.registered) {
            report.registered++;
            existingNames.add(fn.name); // Prevent duplicates within same commit
            report.patterns.push({ name: fn.name, id: reg.pattern?.id, file: relFile, status: 'registered' });
            log(`Registered: ${fn.name} (${language})`);
          } else {
            report.skipped++;
            report.patterns.push({ name: fn.name, file: relFile, status: 'skipped', reason: reg.reason });
          }
        } catch { report.failed++; }
      }
    }
  }

  // Emit event for lifecycle engine
  try {
    oracle._emit({
      type: 'auto_register_complete',
      registered: report.registered,
      files: report.files.length,
    });
  } catch {
    // Best-effort
  }

  if (!silent && report.registered > 0) {
    log(`Done: ${report.registered} registered, ${report.alreadyExists} already exist, ${report.skipped} skipped`);
  }

  return report;
}

module.exports = {
  autoRegister,
  getChangedFiles,
  getAddedCode,
  findTestFile,
  extractFunctions,
  isRegistered,
  buildTags,
};
