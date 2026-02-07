/**
 * Auto-Seed Module
 *
 * Discovers test files in a repository, identifies the source code they test,
 * and automatically registers those as Oracle patterns.
 *
 * Used by the GitHub Action and can be run standalone via CLI.
 */

const fs = require('fs');
const path = require('path');

const TEST_PATTERNS = {
  javascript: ['**/*.test.js', '**/*.spec.js', 'tests/**/*.js', 'test/**/*.js', '__tests__/**/*.js'],
  typescript: ['**/*.test.ts', '**/*.spec.ts', 'tests/**/*.ts', 'test/**/*.ts', '__tests__/**/*.ts'],
  python: ['**/test_*.py', '**/*_test.py', 'tests/**/*.py', 'test/**/*.py'],
  go: ['**/*_test.go'],
  rust: ['**/tests/**/*.rs'],
};

const SKIP_DIRS = new Set(['node_modules', '.git', '.remembrance', 'dist', 'build', 'coverage', 'vendor', 'target']);

function detectLanguage(filePath) {
  const ext = path.extname(filePath);
  const map = { '.js': 'javascript', '.ts': 'typescript', '.py': 'python', '.go': 'go', '.rs': 'rust' };
  return map[ext] || null;
}

function matchGlob(filePath, pattern) {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\0/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp('^' + regexStr + '$').test(filePath);
}

function walkDir(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function findTestFiles(baseDir, language) {
  const allFiles = walkDir(baseDir);
  const patterns = TEST_PATTERNS[language] || [];
  return allFiles.filter(f => {
    const rel = path.relative(baseDir, f);
    return patterns.some(p => matchGlob(rel, p));
  });
}

function extractImports(code, language) {
  const imports = [];
  if (language === 'javascript' || language === 'typescript') {
    const requireRe = /require\(['"]([^'"]+)['"]\)/g;
    const importRe = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = requireRe.exec(code)) !== null) {
      if (m[1].startsWith('.')) imports.push(m[1]);
    }
    while ((m = importRe.exec(code)) !== null) {
      if (m[1].startsWith('.')) imports.push(m[1]);
    }
  } else if (language === 'python') {
    const re = /^from\s+(\.[\w.]+)\s+import/gm;
    let m;
    while ((m = re.exec(code)) !== null) {
      imports.push(m[1]);
    }
  }
  return imports;
}

function extractFunctionNames(code, language) {
  const fns = [];
  const patterns = {
    javascript: /(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?)/gm,
    typescript: /(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?)/gm,
    python: /^def\s+(\w+)\s*\(/gm,
    go: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm,
    rust: /(?:pub\s+)?fn\s+(\w+)\s*[\(<]/gm,
  };
  const re = patterns[language];
  if (!re) return fns;
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1] || m[2];
    if (name && !['if', 'for', 'while', 'switch', 'catch', 'test', 'describe', 'it'].includes(name)) {
      fns.push(name);
    }
  }
  return [...new Set(fns)];
}

function resolveSourceFile(testFile, importPath) {
  const sourceBase = path.resolve(path.dirname(testFile), importPath);
  const exts = ['', '.js', '.ts', '.mjs', '.py', '.go', '.rs'];
  for (const ext of exts) {
    const candidate = sourceBase + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
    const indexCandidate = path.join(sourceBase, 'index' + ext);
    if (fs.existsSync(indexCandidate)) {
      return indexCandidate;
    }
  }
  return null;
}

/**
 * Discover testable source files in a directory.
 * Returns array of { sourceFile, testFile, language, code, testCode, functions, name }
 */
function discoverPatterns(baseDir, options = {}) {
  const { language: langFilter } = options;
  const languages = langFilter ? [langFilter] : Object.keys(TEST_PATTERNS);
  const discovered = [];
  const seen = new Set();

  for (const lang of languages) {
    const testFiles = findTestFiles(baseDir, lang);

    for (const testFile of testFiles) {
      try {
        const testCode = fs.readFileSync(testFile, 'utf-8');
        const imports = extractImports(testCode, lang);

        for (const imp of imports) {
          const sourceFile = resolveSourceFile(testFile, imp);
          if (!sourceFile || seen.has(sourceFile)) continue;
          seen.add(sourceFile);

          const code = fs.readFileSync(sourceFile, 'utf-8');
          const detectedLang = detectLanguage(sourceFile) || lang;
          const functions = extractFunctionNames(code, detectedLang);

          if (functions.length === 0) continue;

          discovered.push({
            sourceFile: path.relative(baseDir, sourceFile),
            testFile: path.relative(baseDir, testFile),
            language: detectedLang,
            code,
            testCode,
            functions,
            name: path.basename(sourceFile, path.extname(sourceFile)),
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  return discovered;
}

/**
 * Auto-seed an Oracle instance from discovered patterns.
 * Returns { registered, skipped, failed, patterns: [] }
 */
function autoSeed(oracle, baseDir, options = {}) {
  const { language, dryRun = false } = options;
  const discovered = discoverPatterns(baseDir, { language });
  const result = { registered: 0, skipped: 0, failed: 0, discovered: discovered.length, patterns: [] };

  if (dryRun) {
    result.patterns = discovered.map(d => ({
      name: d.name,
      language: d.language,
      functions: d.functions,
      sourceFile: d.sourceFile,
      testFile: d.testFile,
    }));
    return result;
  }

  for (const d of discovered) {
    try {
      const tags = [
        ...d.functions.slice(0, 5),
        d.language,
        'auto-seeded',
      ];

      const reg = oracle.registerPattern({
        name: d.name,
        code: d.code,
        language: d.language,
        description: `Auto-seeded from ${d.sourceFile} (tested by ${d.testFile})`,
        tags,
        testCode: d.testCode,
      });

      if (reg.registered) {
        result.registered++;
        result.patterns.push({
          name: d.name,
          id: reg.pattern.id,
          coherency: reg.validation?.coherencyScore?.total || 0,
        });
      } else {
        result.skipped++;
      }
    } catch {
      result.failed++;
    }
  }

  return result;
}

module.exports = { discoverPatterns, autoSeed, extractFunctionNames, extractImports, detectLanguage };
