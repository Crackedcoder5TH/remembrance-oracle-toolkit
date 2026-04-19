/**
 * AST-based code parser for enhanced coherency scoring.
 *
 * Uses Node's built-in vm module for JS and structural analysis
 * for other languages. Extracts:
 * - Function/class declarations
 * - Dependency references
 * - Complexity metrics (cyclomatic, nesting depth)
 * - Export/import structure
 */

const vm = require('vm');

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
 * Parse Python into structural info via regex analysis.
 */
function parsePython(code) {
  const result = {
    valid: true,
    functions: [],
    classes: [],
    exports: [],
    imports: [],
    complexity: { cyclomatic: 1, maxDepth: 0, lines: 0 },
    errors: [],
  };

  const lines = code.split('\n');
  result.complexity.lines = lines.filter(l => l.trim() && !l.trim().startsWith('#')).length;

  // Check indentation validity
  let prevIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent % 2 !== 0 && indent % 4 !== 0 && indent > 0) {
      // Inconsistent indentation
    }
    if (indent > prevIndent + 8) {
      result.errors.push(`Suspicious indentation jump at line ${i + 1}`);
    }
    prevIndent = indent;
  }

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

  if (result.errors.length > 0) result.valid = false;

  return result;
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
  parseGeneric,
  astCoherencyBoost,
};
