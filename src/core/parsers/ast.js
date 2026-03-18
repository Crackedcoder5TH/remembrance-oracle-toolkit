/**
 * AST-based code parser for enhanced coherency scoring.
 *
 * Uses Node's built-in vm module for JS and structural analysis
 * for other languages. Extracts:
 * - Function/class declarations
 * - Dependency references
 * - Complexity metrics (cyclomatic, nesting depth)
 * - Export/import structure
 *
 * @oracle-infrastructure
 */

const vm = require('vm');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * Parse JavaScript into structural info using Node's built-in capabilities.
 */
function parseJavaScript(code) {
  const result = {
    valid: false,
    functions: [],
    classes: [],
    exports: [],
    imports: [],
    complexity: { cyclomatic: 1, maxDepth: 0, lines: 0 },
    errors: [],
  };

  const lines = code.split('\n');
  result.complexity.lines = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;

  // Try to compile (real syntax check, not just brace matching)
  try {
    new vm.Script(code, { filename: 'analysis.js' });
    result.valid = true;
  } catch (err) {
    // Try as module syntax (import/export)
    try {
      new vm.SourceTextModule(code, { identifier: 'analysis.mjs' });
      result.valid = true;
    } catch {
      result.errors.push(err.message);
      // Still extract what we can
    }
  }

  // Extract function declarations
  const funcRegex = /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = funcRegex.exec(code)) !== null) {
    result.functions.push({ name: match[1], params: match[2].split(',').map(p => p.trim()).filter(Boolean) });
  }

  // Extract arrow functions assigned to variables
  const arrowRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|(\w+))\s*=>/g;
  while ((match = arrowRegex.exec(code)) !== null) {
    result.functions.push({ name: match[1], params: [] });
  }

  // Extract class declarations
  const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/g;
  while ((match = classRegex.exec(code)) !== null) {
    result.classes.push({ name: match[1], extends: match[2] || null });
  }

  // Extract exports
  const exportRegex = /(?:module\.exports\s*=|exports\.(\w+)\s*=|export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+))/g;
  while ((match = exportRegex.exec(code)) !== null) {
    result.exports.push(match[1] || match[2] || 'default');
  }

  // Extract imports/requires
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(code)) !== null) {
    result.imports.push(match[1]);
  }
  const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(code)) !== null) {
    result.imports.push(match[1]);
  }

  // Cyclomatic complexity (count decision points)
  const decisions = (code.match(/\b(if|else if|for|while|do|switch|case|\?\?|&&|\|\||catch)\b|\?[^?]/g) || []).length;
  result.complexity.cyclomatic = decisions + 1;

  // Max nesting depth
  let depth = 0, maxDepth = 0;
  for (const ch of code) {
    if (ch === '{') { depth++; maxDepth = Math.max(maxDepth, depth); }
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  result.complexity.maxDepth = maxDepth;

  return result;
}

/**
 * Parse Python into structural info. Uses real `python3 -c compile()` for syntax
 * validation when available, falling back to heuristic analysis.
 */
function parsePython(code) {
  const result = {
    valid: false,
    functions: [],
    classes: [],
    exports: [],
    imports: [],
    complexity: { cyclomatic: 1, maxDepth: 0, lines: 0 },
    errors: [],
  };

  const lines = code.split('\n');
  result.complexity.lines = lines.filter(l => l.trim() && !l.trim().startsWith('#')).length;

  // Real syntax validation via python3 compile()
  result.valid = _validatePythonSyntax(code, result);

  // Extract function definitions
  const funcRegex = /(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = funcRegex.exec(code)) !== null) {
    result.functions.push({ name: match[1], params: match[2].split(',').map(p => p.trim()).filter(Boolean) });
  }

  // Extract class definitions
  const classRegex = /class\s+(\w+)(?:\(([^)]*)\))?\s*:/g;
  while ((match = classRegex.exec(code)) !== null) {
    result.classes.push({ name: match[1], extends: match[2] || null });
  }

  // Extract imports
  const importRegex = /(?:from\s+(\S+)\s+import|import\s+(\S+))/g;
  while ((match = importRegex.exec(code)) !== null) {
    result.imports.push(match[1] || match[2]);
  }

  // Cyclomatic complexity
  const decisions = (code.match(/\b(if|elif|for|while|except|and|or)\b/g) || []).length;
  result.complexity.cyclomatic = decisions + 1;

  // Nesting depth via indentation
  let maxIndent = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    maxIndent = Math.max(maxIndent, indent);
  }
  result.complexity.maxDepth = Math.ceil(maxIndent / 4);

  return result;
}

/**
 * Validate Python syntax by running python3 -c "compile(source, '<ast>', 'exec')".
 * Falls back to heuristic validation if python3 is not available.
 */
function _validatePythonSyntax(code, result) {
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-pycheck-'));
    const tmpFile = path.join(tmpDir, `check-${crypto.randomBytes(4).toString('hex')}.py`);
    fs.writeFileSync(tmpFile, code, { mode: 0o600 });
    try {
      execFileSync('python3', ['-c', `import sys; compile(open(sys.argv[1]).read(), '<ast>', 'exec')`, tmpFile], {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch (err) {
      if (err.stderr && (err.stderr.includes('SyntaxError') || err.stderr.includes('IndentationError'))) {
        result.errors.push(err.stderr.trim().split('\n').pop());
        return false;
      }
      // python3 not found or other error — fall back to heuristic
      return _validatePythonHeuristic(code, result);
    } finally {
      try { fs.unlinkSync(tmpFile); fs.rmdirSync(tmpDir); } catch (_) { /* cleanup best-effort */ }
    }
  } catch (_) {
    return _validatePythonHeuristic(code, result);
  }
}

/** Heuristic fallback for Python when python3 is not available. */
function _validatePythonHeuristic(code, result) {
  const lines = code.split('\n');
  let prevIndent = 0;
  let valid = true;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent > prevIndent + 8) {
      result.errors.push(`Suspicious indentation jump at line ${i + 1}`);
      valid = false;
    }
    prevIndent = indent;
  }
  // Additional heuristic: must have at least one Python structure keyword
  const hasStructure = /^\s*(def|class|import|from|if|for|while|with|try|async\s+def)\b/m.test(code);
  const hasIndent = /^\s{2,}\S/m.test(code);
  if (!hasStructure) {
    result.errors.push('No Python structure keywords found');
    valid = false;
  }
  return valid;
}

/**
 * Parse Rust into structural info. Uses `rustfmt --check` for syntax validation
 * when available, falling back to structural heuristics.
 */
function parseRust(code) {
  const result = {
    valid: false,
    functions: [],
    classes: [],
    exports: [],
    imports: [],
    complexity: { cyclomatic: 1, maxDepth: 0, lines: 0 },
    errors: [],
  };

  const lines = code.split('\n');
  result.complexity.lines = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;

  // Real syntax validation via rustfmt
  result.valid = _validateExternalTool('rustfmt', ['--check'], code, 'rs', result);

  // Extract functions
  const funcRegex = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g;
  let match;
  while ((match = funcRegex.exec(code)) !== null) {
    result.functions.push({ name: match[1], params: match[2].split(',').map(p => p.trim()).filter(Boolean) });
  }

  // Extract structs/enums as "classes"
  const structRegex = /(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/g;
  while ((match = structRegex.exec(code)) !== null) {
    result.classes.push({ name: match[1], extends: null });
  }

  // Extract use statements
  const useRegex = /use\s+([^;]+);/g;
  while ((match = useRegex.exec(code)) !== null) {
    result.imports.push(match[1].trim());
  }

  // Cyclomatic complexity
  const decisions = (code.match(/\b(if|else\s+if|for|while|loop|match|&&|\|\|)\b/g) || []).length;
  result.complexity.cyclomatic = decisions + 1;

  // Max nesting depth
  let depth = 0, maxDepth = 0;
  for (const ch of code) {
    if (ch === '{') { depth++; maxDepth = Math.max(maxDepth, depth); }
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  result.complexity.maxDepth = maxDepth;

  return result;
}

/**
 * Parse Go into structural info. Uses `gofmt -e` for syntax validation
 * when available, falling back to structural heuristics.
 */
function parseGo(code) {
  const result = {
    valid: false,
    functions: [],
    classes: [],
    exports: [],
    imports: [],
    complexity: { cyclomatic: 1, maxDepth: 0, lines: 0 },
    errors: [],
  };

  const lines = code.split('\n');
  result.complexity.lines = lines.filter(l => l.trim() && !l.trim().startsWith('//')).length;

  // Real syntax validation via gofmt
  result.valid = _validateExternalTool('gofmt', ['-e'], code, 'go', result);

  // Extract functions
  const funcRegex = /func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = funcRegex.exec(code)) !== null) {
    result.functions.push({ name: match[1], params: match[2].split(',').map(p => p.trim()).filter(Boolean) });
  }

  // Extract types (struct/interface) as "classes"
  const typeRegex = /type\s+(\w+)\s+(?:struct|interface)\b/g;
  while ((match = typeRegex.exec(code)) !== null) {
    result.classes.push({ name: match[1], extends: null });
  }

  // Extract imports
  const importRegex = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
  while ((match = importRegex.exec(code)) !== null) {
    if (match[1]) {
      const imports = match[1].match(/"[^"]+"/g) || [];
      for (const imp of imports) result.imports.push(imp.replace(/"/g, ''));
    } else if (match[2]) {
      result.imports.push(match[2]);
    }
  }

  // Cyclomatic complexity
  const decisions = (code.match(/\b(if|else\s+if|for|switch|case|select|&&|\|\|)\b/g) || []).length;
  result.complexity.cyclomatic = decisions + 1;

  // Max nesting depth
  let depth = 0, maxDepth = 0;
  for (const ch of code) {
    if (ch === '{') { depth++; maxDepth = Math.max(maxDepth, depth); }
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  result.complexity.maxDepth = maxDepth;

  return result;
}

/**
 * Validate code syntax via an external tool (rustfmt, gofmt, etc.).
 * Falls back to brace-balancing heuristic if the tool is unavailable.
 */
function _validateExternalTool(tool, args, code, ext, result) {
  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `oracle-${tool}-`));
    const tmpFile = path.join(tmpDir, `check-${crypto.randomBytes(4).toString('hex')}.${ext}`);
    fs.writeFileSync(tmpFile, code, { mode: 0o600 });
    try {
      execFileSync(tool, [...args, tmpFile], {
        timeout: 5000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch (err) {
      if (err.status != null && err.status !== 0 && err.stderr) {
        // Tool found the code invalid
        const lastLine = err.stderr.trim().split('\n').pop();
        result.errors.push(lastLine || `${tool} validation failed`);
        return false;
      }
      // Tool not found — fall back to heuristic
      return _heuristicBraceValidation(code, result);
    } finally {
      try { fs.unlinkSync(tmpFile); fs.rmdirSync(tmpDir); } catch (_) { /* cleanup best-effort */ }
    }
  } catch (_) {
    return _heuristicBraceValidation(code, result);
  }
}

/** Fallback heuristic: balanced braces + structure keywords. */
function _heuristicBraceValidation(code, result) {
  let depth = 0;
  for (const ch of code) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth < 0) { result.errors.push('Unbalanced braces'); return false; }
  }
  if (depth !== 0) { result.errors.push('Unbalanced braces'); return false; }
  return true;
}

/**
 * Universal parse function — dispatches to language-specific parser.
 */
function parseCode(code, language) {
  switch (language?.toLowerCase()) {
    case 'javascript':
    case 'js':
    case 'jsx':
      return parseJavaScript(code);
    case 'python':
    case 'py':
      return parsePython(code);
    case 'rust':
    case 'rs':
      return parseRust(code);
    case 'go':
    case 'golang':
      return parseGo(code);
    default:
      return parseGeneric(code);
  }
}

/**
 * Generic parser for unsupported languages.
 */
function parseGeneric(code) {
  const lines = code.split('\n').filter(l => l.trim());
  let depth = 0, maxDepth = 0;
  for (const ch of code) {
    if ('{(['.includes(ch)) { depth++; maxDepth = Math.max(maxDepth, depth); }
    else if ('})]'.includes(ch)) depth = Math.max(0, depth - 1);
  }

  return {
    valid: depth === 0, // balanced = probably valid
    functions: [],
    classes: [],
    exports: [],
    imports: [],
    complexity: {
      cyclomatic: (code.match(/\b(if|else|for|while|switch|case|catch)\b/g) || []).length + 1,
      maxDepth,
      lines: lines.length,
    },
    errors: depth !== 0 ? ['Unbalanced brackets'] : [],
  };
}

/**
 * Enhanced coherency scoring using AST data.
 * Returns additional scores that supplement the base coherency engine.
 */
function astCoherencyBoost(code, language) {
  const parsed = parseCode(code, language);

  let boost = 0;

  // Reward: code that actually parses
  if (parsed.valid) boost += 0.05;

  // Reward: has clear structure (functions/classes)
  if (parsed.functions.length > 0 || parsed.classes.length > 0) boost += 0.03;

  // Reward: has exports (is modular/reusable)
  if (parsed.exports.length > 0) boost += 0.02;

  // Penalize: excessive complexity
  if (parsed.complexity.cyclomatic > 15) boost -= 0.05;
  if (parsed.complexity.maxDepth > 6) boost -= 0.03;

  // Penalize: very long files with no structure
  if (parsed.complexity.lines > 100 && parsed.functions.length === 0 && parsed.classes.length === 0) {
    boost -= 0.05;
  }

  return {
    boost: Math.max(-0.1, Math.min(0.1, boost)),
    parsed,
  };
}

module.exports = {
  parseCode,
  parseJavaScript,
  parsePython,
  parseRust,
  parseGo,
  parseGeneric,
  astCoherencyBoost,
};
