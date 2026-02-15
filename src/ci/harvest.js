/**
 * GitHub Harvester — Bulk import patterns from any Git repository.
 *
 * Clones a repo (or uses a local path), walks its tested source files,
 * extracts functions, and bulk-registers them as Oracle patterns.
 *
 * Usage:
 *   oracle harvest https://github.com/lodash/lodash
 *   oracle harvest /path/to/local/repo --language javascript
 *   oracle harvest https://github.com/user/repo --dry-run
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { discoverPatterns, extractFunctionNames, detectLanguage } = require('./auto-seed');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.remembrance', 'dist', 'build',
  'coverage', 'vendor', 'target', '__pycache__', '.tox',
]);

/**
 * Clone a Git repo to a temp directory.
 * Supports https and ssh URLs. Shallow clone for speed.
 */
function cloneRepo(repoUrl, options = {}) {
  const { depth = 1, branch } = options;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-harvest-'));
  const args = ['git', 'clone', '--depth', String(depth)];
  if (branch) args.push('--branch', branch);
  args.push(repoUrl, tmpDir);

  try {
    execSync(args.join(' '), { timeout: 60000, stdio: 'pipe', encoding: 'utf-8' });
    return tmpDir;
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`Failed to clone ${repoUrl}: ${err.message}`);
  }
}

/**
 * Walk a directory and extract standalone functions from source files.
 * Unlike auto-seed (which traces test→source), this harvests any
 * source file with extractable functions.
 */
function harvestFunctions(baseDir, options = {}) {
  const { language: langFilter, maxFileSize = 50000, minFunctions = 1 } = options;
  const results = [];
  const seen = new Set();

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const lang = detectLanguage(fullPath);
        if (!lang) continue;
        if (langFilter && lang !== langFilter) continue;
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);

        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > maxFileSize || stat.size < 10) continue;

          const code = fs.readFileSync(fullPath, 'utf-8');
          const functions = extractFunctionNames(code, lang);

          if (functions.length >= minFunctions) {
            results.push({
              file: path.relative(baseDir, fullPath),
              language: lang,
              code,
              functions,
              size: stat.size,
            });
          }
        } catch (e) {
          // Skip unreadable files
          if (process.env.ORACLE_DEBUG) console.warn('skipping unreadable file:', e.message);
        }
      }
    }
  }

  walk(baseDir);
  return results;
}

/**
 * Split a source file into individual function patterns.
 * Extracts each function as a standalone pattern when possible.
 */
function splitFunctions(code, language) {
  const patterns = [];

  if (language === 'javascript' || language === 'typescript') {
    // Match function declarations and arrow functions
    const re = /(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>\s*(?:\{|[^{]))/g;
    let match;
    while ((match = re.exec(code)) !== null) {
      const name = match[1] || match[2];
      if (!name || ['if', 'for', 'while', 'test', 'describe', 'it'].includes(name)) continue;

      // Extract the function body by brace matching
      const start = match.index;
      const body = extractBody(code, start);
      if (body && body.length > 20 && body.length < 5000) {
        patterns.push({ name, code: body, language });
      }
    }
  } else if (language === 'python') {
    const re = /^(def\s+(\w+)\s*\([^)]*\)\s*:)/gm;
    let match;
    while ((match = re.exec(code)) !== null) {
      const name = match[2];
      if (!name || name.startsWith('_')) continue;
      const body = extractPythonBlock(code, match.index);
      if (body && body.length > 20 && body.length < 5000) {
        patterns.push({ name, code: body, language });
      }
    }
  } else if (language === 'go') {
    const re = /^(func\s+(?:\([^)]+\)\s+)?(\w+)\s*\([^)]*\))/gm;
    let match;
    while ((match = re.exec(code)) !== null) {
      const name = match[2];
      if (!name) continue;
      const body = extractBody(code, match.index);
      if (body && body.length > 20 && body.length < 5000) {
        patterns.push({ name, code: body, language });
      }
    }
  } else if (language === 'rust') {
    const re = /^((?:pub\s+)?fn\s+(\w+)\s*[\(<])/gm;
    let match;
    while ((match = re.exec(code)) !== null) {
      const name = match[2];
      if (!name) continue;
      const body = extractBody(code, match.index);
      if (body && body.length > 20 && body.length < 5000) {
        patterns.push({ name, code: body, language });
      }
    }
  }

  return patterns;
}

/**
 * Extract a brace-delimited body starting from a position in code.
 */
function extractBody(code, start) {
  const braceStart = code.indexOf('{', start);
  if (braceStart === -1) return null;

  let depth = 0;
  for (let i = braceStart; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') depth--;
    if (depth === 0) {
      return code.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract a Python indented block starting from a def line.
 */
function extractPythonBlock(code, start) {
  const lines = code.slice(start).split('\n');
  if (lines.length < 2) return null;

  const defLine = lines[0];
  const result = [defLine];
  const bodyIndent = lines[1]?.match(/^(\s+)/)?.[1];
  if (!bodyIndent) return defLine;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.startsWith(bodyIndent)) {
      result.push(line);
    } else {
      break;
    }
  }
  return result.join('\n');
}

/**
 * Harvest patterns from a Git repo URL or local directory.
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {string} source — Git URL or local path
 * @param {object} options — { language, dryRun, splitMode, branch, maxFiles }
 * @returns {{ harvested, registered, skipped, failed, source, patterns }}
 */
function harvest(oracle, source, options = {}) {
  const { language, dryRun = false, splitMode = 'file', branch, maxFiles = 200 } = options;
  let repoDir = null;
  let isTemp = false;

  // Determine if source is a URL or local path
  if (source.startsWith('http') || source.startsWith('git@') || source.includes('github.com')) {
    repoDir = cloneRepo(source, { branch });
    isTemp = true;
  } else {
    repoDir = path.resolve(source);
    if (!fs.existsSync(repoDir)) {
      throw new Error(`Path does not exist: ${source}`);
    }
  }

  try {
    // First try auto-seed approach (test→source tracing)
    const discovered = discoverPatterns(repoDir, { language });

    // Then harvest any remaining source files
    const harvested = harvestFunctions(repoDir, { language });

    // Merge: prefer test-backed patterns, then standalone
    const seenFiles = new Set(discovered.map(d => d.sourceFile));
    const standalone = harvested.filter(h => !seenFiles.has(h.file)).slice(0, maxFiles);

    const result = {
      source,
      harvested: discovered.length + standalone.length,
      registered: 0,
      skipped: 0,
      failed: 0,
      patterns: [],
    };

    if (dryRun) {
      result.patterns = [
        ...discovered.map(d => ({ name: d.name, file: d.sourceFile, language: d.language, functions: d.functions, hasTests: true })),
        ...standalone.map(s => ({ name: path.basename(s.file, path.extname(s.file)), file: s.file, language: s.language, functions: s.functions, hasTests: false })),
      ];
      return result;
    }

    // Register test-backed patterns first (higher value)
    for (const d of discovered) {
      try {
        const reg = oracle.registerPattern({
          name: d.name,
          code: d.code,
          language: d.language,
          description: `Harvested from ${source} — ${d.sourceFile}`,
          tags: [...d.functions.slice(0, 5), d.language, 'harvested', 'test-backed'],
          testCode: d.testCode,
        });
        if (reg.registered) {
          result.registered++;
          result.patterns.push({ name: d.name, status: 'registered', hasTests: true });
        } else {
          result.skipped++;
          result.patterns.push({ name: d.name, status: 'skipped', reason: reg.reason });
        }
      } catch { result.failed++; }
    }

    // Register standalone patterns (split by function or file)
    for (const s of standalone) {
      if (splitMode === 'function') {
        const fns = splitFunctions(s.code, s.language);
        for (const fn of fns) {
          try {
            const reg = oracle.registerPattern({
              name: fn.name,
              code: fn.code,
              language: fn.language,
              description: `Harvested function from ${source} — ${s.file}`,
              tags: [fn.name, fn.language, 'harvested'],
            });
            if (reg.registered) {
              result.registered++;
              result.patterns.push({ name: fn.name, status: 'registered', hasTests: false });
            } else {
              result.skipped++;
            }
          } catch { result.failed++; }
        }
      } else {
        const name = path.basename(s.file, path.extname(s.file));
        try {
          const reg = oracle.registerPattern({
            name,
            code: s.code,
            language: s.language,
            description: `Harvested from ${source} — ${s.file} (${s.functions.length} functions)`,
            tags: [...s.functions.slice(0, 5), s.language, 'harvested'],
          });
          if (reg.registered) {
            result.registered++;
            result.patterns.push({ name, status: 'registered', hasTests: false });
          } else {
            result.skipped++;
            result.patterns.push({ name, status: 'skipped', reason: reg.reason });
          }
        } catch { result.failed++; }
      }
    }

    oracle._emit({ type: 'harvest_complete', source, registered: result.registered });
    return result;
  } finally {
    if (isTemp && repoDir) {
      fs.rmSync(repoDir, { recursive: true, force: true });
    }
  }
}

module.exports = {
  harvest,
  harvestFunctions,
  splitFunctions,
  extractBody,
  extractPythonBlock,
  cloneRepo,
};
