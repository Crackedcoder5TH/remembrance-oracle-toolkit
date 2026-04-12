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
const { execSync, execFileSync } = require('child_process');
const { safePath } = require('../core/safe-path');

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
    if (!/^[\w.\-~^/]+(?:\.\.\.?[\w.\-~^/]+)?$/.test(range)) throw new Error('Invalid git range');
    const output = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACM', range], {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (!output) return [];
    return output.split('\n').filter(f => CODE_EXTS.test(f));
  } catch (e) {
    // Fallback for initial commit: HEAD~1 doesn't exist, so diff the tree directly
    if (range === 'HEAD~1..HEAD') {
      try {
        const output = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', '--diff-filter=ACM', 'HEAD'], {
          cwd,
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();
        if (output) return output.split('\n').filter(f => CODE_EXTS.test(f));
      } catch (fallbackErr) {
        if (process.env.ORACLE_DEBUG) console.warn('[auto-register:getChangedFiles] fallback also failed:', fallbackErr?.message || fallbackErr);
      }
    }
    if (process.env.ORACLE_DEBUG) console.warn('[auto-register:getChangedFiles] returning empty array on error:', e?.message || e);
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
    if (!/^[\w.\-~^/]+(?:\.\.\.?[\w.\-~^/]+)?$/.test(range)) throw new Error('Invalid git range');
    const diff = execFileSync('git', ['diff', '-U0', range, '--', file], {
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[auto-register:getAddedCode] returning empty string on error:', e?.message || e);
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
// Cache for existing pattern names — populated once per autoRegister() call
let _registeredNamesCache = null;

function isRegistered(oracle, name) {
  try {
    // Use cached names set if available (populated in autoRegister)
    if (_registeredNamesCache) return _registeredNamesCache.has(name);
    // Fallback: use targeted search instead of loading all patterns
    if (typeof oracle.patterns?._sqlite?.getPatternByName === 'function') {
      return !!oracle.patterns._sqlite.getPatternByName(name);
    }
    const results = oracle.search(name, { limit: 5 });
    return results.some(r => r.name === name);
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[auto-register:isRegistered] returning false on error:', e?.message || e);
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
 * Generic single-word names that don't describe reusable patterns.
 * Used by the meaningful-name quality check.
 */
const GENERIC_NAMES = new Set([
  'handle', 'run', 'init', 'exec', 'do', 'go', 'main', 'cb',
  'fn', 'func', 'call', 'process', 'get', 'set', 'put', 'make',
  'load', 'save', 'start', 'stop', 'setup', 'update', 'check',
]);

/**
 * Split a camelCase or snake_case name into its constituent words.
 *
 * @param {string} name — Function/variable name
 * @returns {string[]} — Array of word parts
 */
function splitNameParts(name) {
  // Split on underscores first (snake_case)
  const snakeParts = name.split('_').filter(Boolean);
  const parts = [];
  for (const part of snakeParts) {
    // Split camelCase: insert boundary before uppercase letters
    const camelParts = part.replace(/([a-z])([A-Z])/g, '$1\0$2').split('\0');
    for (const cp of camelParts) {
      if (cp) parts.push(cp.toLowerCase());
    }
  }
  return parts;
}

/**
 * Score a harvested function on a 0-1 quality scale.
 *
 * Criteria:
 *   +0.30 — Has matching test file
 *   +0.25 — Is exported (module.exports, export default, export function)
 *   +0.15 — Has JSDoc or docstring comment block above definition
 *   +0.15 — Meaningful name (3+ word parts, not a single generic word)
 *   +0.15 — Sufficient size (5-50 lines)
 *
 * @param {{ name: string, code: string, language: string }} func — Extracted function
 * @param {string} filePath — Absolute path to the source file
 * @param {string} baseDir — Project root directory
 * @returns {{ score: number, reasons: string[] }}
 */
function _qualityScore(func, filePath, baseDir) {
  let score = 0;
  const reasons = [];

  // 1. Has tests (+0.3)
  const testFile = findTestFile(filePath, baseDir);
  if (testFile) {
    score += 0.3;
    reasons.push('has tests');
  }

  // 2. Is exported (+0.25)
  // Read the full file to check exports — we need the whole file context,
  // not just the extracted function body.
  let fileContent = '';
  try {
    fileContent = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    // If we can't read the file, skip this check
  }

  if (fileContent) {
    const name = func.name;
    const lang = func.language;

    let isExported = false;
    if (lang === 'javascript' || lang === 'typescript') {
      // Check: module.exports = { ..., name, ... } or module.exports.name =
      // or exports.name = or export function name or export default
      // or export { name }
      const exportPatterns = [
        new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${name}\\b`, 's'),
        new RegExp(`module\\.exports\\.${name}\\s*=`),
        new RegExp(`exports\\.${name}\\s*=`),
        new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?function\\s+${name}\\b`),
        new RegExp(`export\\s+(?:const|let|var)\\s+${name}\\b`),
        new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`),
      ];
      isExported = exportPatterns.some(re => re.test(fileContent));
    } else if (lang === 'python') {
      // Python: if it's in __all__ or doesn't start with underscore (already filtered)
      // Check __all__ list
      const allMatch = fileContent.match(/__all__\s*=\s*\[([^\]]*)\]/);
      if (allMatch) {
        isExported = allMatch[1].includes(`'${name}'`) || allMatch[1].includes(`"${name}"`);
      } else {
        // In Python, non-underscore functions are implicitly public
        isExported = !name.startsWith('_');
      }
    } else if (lang === 'go') {
      // Go: exported if first letter is uppercase
      isExported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
    } else if (lang === 'rust') {
      // Rust: exported if preceded by `pub`
      isExported = new RegExp(`pub\\s+fn\\s+${name}\\b`).test(fileContent);
    }

    if (isExported) {
      score += 0.25;
      reasons.push('exported');
    }
  }

  // 3. Has JSDoc/docstring (+0.15)
  // Check if the function definition in the file is preceded by a doc comment
  if (fileContent) {
    const name = func.name;
    const lang = func.language;
    let hasDoc = false;

    if (lang === 'javascript' || lang === 'typescript') {
      // Look for /** ... */ immediately before the function definition
      const docPattern = new RegExp(
        `/\\*\\*[\\s\\S]*?\\*/\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+${name}\\b|(?:const|let|var)\\s+${name}\\s*=)`
      );
      hasDoc = docPattern.test(fileContent);
    } else if (lang === 'python') {
      // Check for docstring (triple-quoted string right after def line)
      const defPattern = new RegExp(
        `def\\s+${name}\\s*\\([^)]*\\)\\s*:\\s*\\n\\s*(?:"""|\\'\\'\\')`
      );
      hasDoc = defPattern.test(fileContent);
    } else if (lang === 'go') {
      // Go: comment line(s) immediately before func
      const commentPattern = new RegExp(`//[^\\n]*\\n\\s*func\\s+(?:\\([^)]+\\)\\s+)?${name}\\b`);
      hasDoc = commentPattern.test(fileContent);
    } else if (lang === 'rust') {
      // Rust: /// doc comments before fn
      const commentPattern = new RegExp(`///[^\\n]*\\n\\s*(?:pub\\s+)?fn\\s+${name}\\b`);
      hasDoc = commentPattern.test(fileContent);
    }

    if (hasDoc) {
      score += 0.15;
      reasons.push('documented');
    }
  }

  // 4. Meaningful name (+0.15)
  // Name must have 3+ word parts (camelCase/snake_case), not a single generic word
  const nameParts = splitNameParts(func.name);
  if (nameParts.length >= 3) {
    score += 0.15;
    reasons.push('meaningful name');
  }

  // 5. Sufficient size (+0.15): 5-50 lines
  const lineCount = func.code.split('\n').length;
  if (lineCount >= 5 && lineCount <= 50) {
    score += 0.15;
    reasons.push('good size');
  }

  // Round to 2 decimal places to avoid floating-point noise
  score = Math.round(score * 100) / 100;

  return { score, reasons };
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
 * @param {number} options.qualityThreshold — Minimum quality score to register (default: 0.4)
 * @returns {{ registered, skipped, alreadyExists, failed, patterns, files, discovered, belowThreshold }}
 */
function autoRegister(oracle, cwd, options = {}) {
  const {
    range = 'HEAD~1..HEAD',
    dryRun = false,
    silent = false,
    wholeFile = false,
    qualityThreshold = 0.4,
  } = options;

  const log = silent ? () => {} : (msg) => console.log(`[auto-register] ${msg}`);

  const report = {
    registered: 0,
    skipped: 0,
    alreadyExists: 0,
    failed: 0,
    discovered: 0,
    belowThreshold: 0,
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[auto-register:lookups] silent failure:', e?.message || e);
    // Fallback: check per-function
  }
  // Set module-level cache so isRegistered() uses it instead of loading all patterns
  _registeredNamesCache = existingNames;

  // Step 2: Process each changed file
  for (const relFile of changedFiles) {
    let absFile;
    try { absFile = safePath(relFile, cwd); } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[auto-register:autoRegister] skipping item:', e?.message || e);
      continue;
    }
    if (!fs.existsSync(absFile)) continue;

    const language = detectLanguage(relFile);
    if (!language) continue;

    let code;
    try {
      code = fs.readFileSync(absFile, 'utf-8');
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[auto-register:lookups] skipping item:', e?.message || e);
      continue;
    }

    // Skip files that are too large or too small
    if (code.length > 50000 || code.length < 30) continue;

    // Get names of new functions from the diff
    const addedCode = getAddedCode(cwd, relFile, range);
    const newFunctionNames = extractFunctionNames(addedCode, language);

    // Find associated test file
    const testFile = findTestFile(absFile, cwd);
    let testCode = null;
    if (testFile) {
      try { testCode = fs.readFileSync(testFile, 'utf-8'); } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[auto-register:lookups] no test:', e?.message || e);
      }
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
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[auto-register:init] operation failed:', e?.message || e);
        report.failed++;
      }
    } else {
      // Split into individual functions and register new ones
      // Only register functions that appear in the diff; skip files where
      // the diff touched only non-function code (whitespace, comments, etc.)
      if (newFunctionNames.length === 0) continue;
      const functions = extractFunctions(code, language, newFunctionNames);

      for (const fn of functions) {
        report.discovered++;

        // Quality scoring — skip low-quality functions
        const quality = _qualityScore(fn, absFile, cwd);

        if (quality.score < qualityThreshold) {
          report.belowThreshold++;
          report.patterns.push({
            name: fn.name,
            file: relFile,
            status: 'below-threshold',
            score: quality.score,
            reasons: quality.reasons,
          });
          if (process.env.ORACLE_DEBUG) {
            console.log(`[auto-register] Skipping ${fn.name} (score ${quality.score.toFixed(2)} < threshold ${qualityThreshold}) — ${quality.reasons.join(', ') || 'no quality signals'}`);
          }
          continue;
        }

        if (existingNames.has(fn.name)) {
          report.alreadyExists++;
          continue;
        }

        const tags = buildTags(fn.name, relFile, language, [fn.name]);

        if (dryRun) {
          report.patterns.push({
            name: fn.name,
            file: relFile,
            status: 'dry-run',
            score: quality.score,
            reasons: quality.reasons,
          });
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
            report.patterns.push({
              name: fn.name,
              id: reg.pattern?.id,
              file: relFile,
              status: 'registered',
              score: quality.score,
              reasons: quality.reasons,
            });
            log(`Registered: ${fn.name} (${language})`);
          } else {
            report.skipped++;
            report.patterns.push({
              name: fn.name,
              file: relFile,
              status: 'skipped',
              reason: reg.reason,
              score: quality.score,
              reasons: quality.reasons,
            });
          }
        } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[auto-register:from] operation failed:', e?.message || e);
          report.failed++;
        }
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[auto-register:from] silent failure:', e?.message || e);
    // Best-effort
  }

  if (!silent) {
    if (report.discovered > 0) {
      const regCount = report.registered;
      const disc = report.discovered;
      const below = report.belowThreshold;
      log(`Auto-registered ${regCount} function(s) from diff (${disc} discovered, ${below} below quality threshold)`);

      for (const p of report.patterns) {
        if (p.score !== undefined) {
          const reasonStr = p.reasons && p.reasons.length > 0 ? p.reasons.join(', ') : 'no quality signals';
          if (p.status === 'below-threshold') {
            log(`  ~ ${p.name} (${p.score.toFixed(2)}) — skipped (below threshold)`);
          } else if (p.status === 'registered' || p.status === 'dry-run') {
            log(`  + ${p.name} (${p.score.toFixed(2)}) — ${reasonStr}`);
          } else if (p.status === 'skipped') {
            log(`  - ${p.name} (${p.score.toFixed(2)}) — skipped: ${p.reason || reasonStr}`);
          }
        }
      }
    } else if (report.registered > 0) {
      log(`Done: ${report.registered} registered, ${report.alreadyExists} already exist, ${report.skipped} skipped`);
    }
  }

  // Clear module-level cache to free memory
  _registeredNamesCache = null;
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
  _qualityScore,
  splitNameParts,
};
