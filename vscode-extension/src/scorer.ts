/**
 * Local Coherency Scorer — offline code quality scoring.
 *
 * Scores code across 7 dimensions matching the Oracle's unified scorer:
 *   1. Syntax validity     — balanced braces, language keywords present
 *   2. Completeness        — no placeholders, TODOs, or stubs
 *   3. Readability         — comment density, nesting depth, naming quality
 *   4. Simplicity          — function length, cyclomatic complexity proxy
 *   5. Security            — no eval, no injection patterns, no hardcoded secrets
 *   6. Consistency         — indentation style, naming convention coherence
 *   7. Testability         — function count, parameter count, side-effect indicators
 *
 * Works entirely offline — no API calls needed for basic scoring.
 */

// ─── Types ───

export interface DimensionScore {
  score: number;
  label: string;
  detail: string;
}

export interface CoherencyResult {
  total: number;
  dimensions: {
    syntax: DimensionScore;
    completeness: DimensionScore;
    readability: DimensionScore;
    simplicity: DimensionScore;
    security: DimensionScore;
    consistency: DimensionScore;
    testability: DimensionScore;
  };
  verdict: 'excellent' | 'good' | 'acceptable' | 'needs-work' | 'poor';
}

// ─── Dimension Weights ───

const WEIGHTS = {
  syntax: 0.18,
  completeness: 0.14,
  readability: 0.14,
  simplicity: 0.12,
  security: 0.14,
  consistency: 0.14,
  testability: 0.14,
};

// ─── Scoring Functions ───

/**
 * Check if braces, brackets, and parens are balanced.
 */
function checkBalanced(code: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (const ch of code) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inString) {
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      stack.push(ch);
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.length === 0 || stack[stack.length - 1] !== pairs[ch]) return false;
      stack.pop();
    }
  }

  return stack.length === 0;
}

/**
 * Score syntax validity (0-1).
 */
function scoreSyntax(code: string, language: string): DimensionScore {
  const lang = language.toLowerCase();
  const balanced = checkBalanced(code);

  let hasStructure = false;
  if (['javascript', 'typescript', 'js', 'ts', 'tsx', 'jsx'].includes(lang)) {
    hasStructure = /\b(function|const|let|var|class|export|import|interface|type|enum)\b/.test(code);
  } else if (['python', 'py'].includes(lang)) {
    hasStructure = /\b(def|class|import|from|async)\b/.test(code);
  } else if (['go', 'golang'].includes(lang)) {
    hasStructure = /\b(func|type|package|import|struct)\b/.test(code);
  } else if (['rust', 'rs'].includes(lang)) {
    hasStructure = /\b(fn|struct|impl|use|mod|pub|trait|enum)\b/.test(code);
  } else if (['java'].includes(lang)) {
    hasStructure = /\b(class|interface|public|private|void|static|import)\b/.test(code);
  } else {
    hasStructure = /\b(function|def|class|fn|func|void|int|string)\b/i.test(code);
  }

  let score: number;
  let detail: string;

  if (balanced && hasStructure) {
    score = 1.0;
    detail = 'Balanced structure with language keywords';
  } else if (balanced) {
    score = 0.8;
    detail = 'Balanced braces but no clear structure';
  } else if (hasStructure) {
    score = 0.5;
    detail = 'Has structure but unbalanced delimiters';
  } else {
    score = 0.3;
    detail = 'No recognizable structure';
  }

  return { score, label: 'Syntax', detail };
}

/**
 * Score completeness (0-1). Detects placeholders and incomplete markers.
 */
function scoreCompleteness(code: string): DimensionScore {
  let score = 1.0;
  const issues: string[] = [];

  // Check for TODO/FIXME/HACK/XXX/STUB markers
  const markerRe = /\b(TODO|FIXME|HACK|XXX|STUB)\b/g;
  const markers = (code.match(markerRe) || []).length;
  if (markers > 0) {
    score -= markers * 0.05;
    issues.push(`${markers} incomplete marker(s)`);
  }

  // Placeholder patterns
  if (/\.{3}|pass\s*$|raise NotImplementedError/m.test(code)) {
    score -= 0.15;
    issues.push('Placeholder code detected');
  }

  // Empty function bodies (excluding arrow functions with empty bodies)
  if (/\{\s*\}/.test(code) && !/=>\s*\{\s*\}/.test(code)) {
    score -= 0.1;
    issues.push('Empty function body');
  }

  // Commented-out code blocks
  const commentedCode = (code.match(/^\s*\/\/\s*(const|let|var|function|if|for|while|return)\b/gm) || []).length;
  if (commentedCode > 2) {
    score -= 0.1;
    issues.push('Commented-out code');
  }

  return {
    score: Math.max(score, 0),
    label: 'Completeness',
    detail: issues.length > 0 ? issues.join('; ') : 'No incomplete markers',
  };
}

/**
 * Score readability (0-1). Comment density, naming quality, nesting depth.
 */
function scoreReadability(code: string, language: string): DimensionScore {
  const lines = code.split('\n');
  const nonEmpty = lines.filter(l => l.trim().length > 0);
  if (nonEmpty.length === 0) return { score: 0.5, label: 'Readability', detail: 'Empty file' };

  const issues: string[] = [];
  let score = 1.0;

  // Comment density
  const lang = language.toLowerCase();
  let commentLines = 0;
  if (['python', 'py'].includes(lang)) {
    commentLines = lines.filter(l => l.trim().startsWith('#')).length;
  } else {
    commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('*') || l.trim().startsWith('/*')).length;
  }
  const commentRatio = commentLines / nonEmpty.length;
  if (commentRatio < 0.05 && nonEmpty.length > 10) {
    score -= 0.1;
    issues.push('Low comment density');
  } else if (commentRatio > 0.5) {
    score -= 0.05;
    issues.push('Excessive comments');
  }

  // Max nesting depth
  let maxDepth = 0;
  let currentDepth = 0;
  for (const line of lines) {
    const opens = (line.match(/[{(]/g) || []).length;
    const closes = (line.match(/[})]/g) || []).length;
    currentDepth += opens - closes;
    if (currentDepth > maxDepth) maxDepth = currentDepth;
  }
  if (maxDepth > 6) {
    score -= 0.2;
    issues.push(`Deep nesting (depth ${maxDepth})`);
  } else if (maxDepth > 4) {
    score -= 0.1;
    issues.push(`Moderate nesting (depth ${maxDepth})`);
  }

  // Line length
  const longLines = lines.filter(l => l.length > 120).length;
  if (longLines > 0) {
    score -= Math.min(longLines * 0.02, 0.15);
    issues.push(`${longLines} long line(s) (>120 chars)`);
  }

  // Naming quality: check for single-char names (excluding common loop vars)
  const funcNames = (code.match(/(?:function|const|let|var)\s+(\w+)/g) || [])
    .map(m => m.replace(/(?:function|const|let|var)\s+/, ''));
  const shortNames = funcNames.filter(n => n.length <= 1 && !['i', 'j', 'k', 'n', 'x', 'y', '_'].includes(n));
  if (shortNames.length > 0) {
    score -= 0.1;
    issues.push('Single-character variable names');
  }

  return {
    score: Math.max(score, 0),
    label: 'Readability',
    detail: issues.length > 0 ? issues.join('; ') : 'Clean and readable',
  };
}

/**
 * Score simplicity (0-1). Function length, branching complexity.
 */
function scoreSimplicity(code: string): DimensionScore {
  const lines = code.split('\n').filter(l => l.trim().length > 0);
  const issues: string[] = [];
  let score = 1.0;

  // Overall file length
  if (lines.length > 500) {
    score -= 0.15;
    issues.push('File exceeds 500 lines');
  } else if (lines.length > 300) {
    score -= 0.08;
    issues.push('File exceeds 300 lines');
  }

  // Cyclomatic complexity proxy: count branching keywords
  const branches = (code.match(/\b(if|else if|elif|switch|case|catch|while|for|&&|\|\||\?)\b/g) || []).length;
  const branchDensity = lines.length > 0 ? branches / lines.length : 0;
  if (branchDensity > 0.15) {
    score -= 0.2;
    issues.push('High branching density');
  } else if (branchDensity > 0.08) {
    score -= 0.1;
    issues.push('Moderate branching density');
  }

  // Long functions (lines between function openings)
  const functionStarts = lines.reduce((acc: number[], line, i) => {
    if (/\b(function|def|fn|func)\b/.test(line)) acc.push(i);
    return acc;
  }, []);
  if (functionStarts.length >= 2) {
    const gaps = functionStarts.slice(1).map((start, i) => start - functionStarts[i]);
    const maxGap = Math.max(...gaps);
    if (maxGap > 80) {
      score -= 0.15;
      issues.push(`Long function (~${maxGap} lines)`);
    } else if (maxGap > 50) {
      score -= 0.08;
      issues.push(`Moderate function length (~${maxGap} lines)`);
    }
  }

  return {
    score: Math.max(score, 0),
    label: 'Simplicity',
    detail: issues.length > 0 ? issues.join('; ') : 'Well-structured code',
  };
}

/**
 * Score security (0-1). Detects unsafe patterns.
 */
function scoreSecurity(code: string, language: string): DimensionScore {
  const issues: string[] = [];
  let score = 1.0;
  const lang = language.toLowerCase();

  // eval / Function constructor
  if (/\beval\s*\(/.test(code)) {
    score -= 0.3;
    issues.push('eval() usage detected');
  }
  if (/new\s+Function\s*\(/.test(code)) {
    score -= 0.25;
    issues.push('new Function() detected');
  }

  // innerHTML assignment
  if (/\.innerHTML\s*=/.test(code)) {
    score -= 0.15;
    issues.push('Direct innerHTML assignment');
  }

  // SQL injection patterns
  if (/['"`]\s*\+\s*\w+.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b/i.test(code) ||
      /(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b.*\+\s*\w+/i.test(code)) {
    score -= 0.25;
    issues.push('Potential SQL injection');
  }

  // Hardcoded secrets/tokens
  if (/(?:password|secret|token|api_key|apikey)\s*[:=]\s*['"][^'"]{8,}/i.test(code)) {
    score -= 0.3;
    issues.push('Hardcoded secret/credential');
  }

  // Shell injection (command construction)
  if (/exec\(\s*['"`]/.test(code) || /execSync\(\s*['"`].*\$\{/.test(code)) {
    score -= 0.2;
    issues.push('Potential command injection');
  }

  // Python-specific
  if (['python', 'py'].includes(lang)) {
    if (/\bos\.system\(/.test(code) || /subprocess\.call\(.*shell\s*=\s*True/i.test(code)) {
      score -= 0.2;
      issues.push('Unsafe subprocess/system call');
    }
    if (/\bpickle\.loads?\(/.test(code)) {
      score -= 0.15;
      issues.push('Unsafe pickle deserialization');
    }
  }

  // Prototype pollution
  if (/\.__proto__\s*=/.test(code) || /Object\.assign\(\s*\{\}/.test(code) === false && /\[.*\]\s*=/.test(code)) {
    // Only flag direct __proto__ assignment
    if (/\.__proto__\s*=/.test(code)) {
      score -= 0.2;
      issues.push('Prototype pollution risk');
    }
  }

  return {
    score: Math.max(score, 0),
    label: 'Security',
    detail: issues.length > 0 ? issues.join('; ') : 'No security issues detected',
  };
}

/**
 * Score consistency (0-1). Indentation and naming convention coherence.
 */
function scoreConsistency(code: string, language: string): DimensionScore {
  const lines = code.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return { score: 1.0, label: 'Consistency', detail: 'Too short to evaluate' };

  const issues: string[] = [];
  let score = 1.0;
  const lang = language.toLowerCase();

  // Indentation consistency
  const indents = lines
    .map(l => {
      const match = l.match(/^(\s+)/);
      return match ? match[1] : '';
    })
    .filter(i => i.length > 0);

  if (indents.length > 0) {
    const usesTabs = indents.some(i => i.includes('\t'));
    const usesSpaces = indents.some(i => i.includes(' '));
    if (usesTabs && usesSpaces) {
      score -= 0.15;
      issues.push('Mixed tabs and spaces');
    }
    // Python should use spaces
    if (['python', 'py'].includes(lang) && usesTabs) {
      score -= 0.1;
      issues.push('Python: tabs instead of spaces');
    }
    // Go should use tabs
    if (['go', 'golang'].includes(lang) && usesSpaces && !usesTabs) {
      score -= 0.1;
      issues.push('Go: spaces instead of tabs');
    }
  }

  // Naming convention consistency
  const camelCase = (code.match(/[a-z][a-zA-Z]+\(/g) || []).length;
  const snakeCase = (code.match(/[a-z]+_[a-z]+\(/g) || []).length;

  if (camelCase > 0 && snakeCase > 0) {
    const ratio = Math.min(camelCase, snakeCase) / Math.max(camelCase, snakeCase);
    if (['python', 'py'].includes(lang)) {
      // Python prefers snake_case; penalize if too many camelCase
      const camelRatio = camelCase / (camelCase + snakeCase);
      if (camelRatio > 0.3) {
        score -= 0.1;
        issues.push('Mixed naming conventions (Python prefers snake_case)');
      }
    } else if (ratio > 0.3) {
      score -= 0.1;
      issues.push('Mixed naming conventions');
    }
  }

  // Semicolon consistency for JS/TS
  if (['javascript', 'typescript', 'js', 'ts'].includes(lang)) {
    const withSemicolon = lines.filter(l => l.trim().endsWith(';')).length;
    const withoutSemicolon = lines.filter(l => {
      const trimmed = l.trim();
      return trimmed.length > 0 &&
        !trimmed.endsWith('{') && !trimmed.endsWith('}') &&
        !trimmed.endsWith(',') && !trimmed.endsWith('(') &&
        !trimmed.startsWith('//') && !trimmed.startsWith('*') &&
        !trimmed.startsWith('/*') && !trimmed.startsWith('import') &&
        !trimmed.startsWith('export') &&
        !trimmed.endsWith(';');
    }).length;

    if (withSemicolon > 0 && withoutSemicolon > 0) {
      const semiRatio = withSemicolon / (withSemicolon + withoutSemicolon);
      if (semiRatio > 0.2 && semiRatio < 0.8) {
        score -= 0.08;
        issues.push('Inconsistent semicolon usage');
      }
    }
  }

  return {
    score: Math.max(score, 0),
    label: 'Consistency',
    detail: issues.length > 0 ? issues.join('; ') : 'Consistent style',
  };
}

/**
 * Score testability (0-1). Pure functions, parameter counts, side effects.
 */
function scoreTestability(code: string, language: string): DimensionScore {
  const issues: string[] = [];
  let score = 1.0;
  const lang = language.toLowerCase();

  // Count exported/public functions
  let funcCount: number;
  if (['python', 'py'].includes(lang)) {
    funcCount = (code.match(/\bdef\s+\w+/g) || []).length;
  } else if (['go', 'golang'].includes(lang)) {
    funcCount = (code.match(/\bfunc\s+/g) || []).length;
  } else if (['rust', 'rs'].includes(lang)) {
    funcCount = (code.match(/\bfn\s+/g) || []).length;
  } else {
    funcCount = (code.match(/\b(function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:\([^)]*\)|[\w]+)\s*=>)/g) || []).length;
  }

  if (funcCount === 0 && code.split('\n').length > 20) {
    score -= 0.15;
    issues.push('No distinct functions (monolithic code)');
  }

  // Side-effect indicators
  const sideEffects = [
    /\bconsole\.(log|warn|error)\b/,
    /\bfs\.\w+Sync\b/,
    /\bglobal\.\w+\s*=/,
    /\bwindow\.\w+\s*=/,
    /\bprocess\.exit\b/,
  ];
  let sideEffectCount = 0;
  for (const re of sideEffects) {
    if (re.test(code)) sideEffectCount++;
  }
  if (sideEffectCount > 2) {
    score -= 0.15;
    issues.push('Multiple side effects');
  } else if (sideEffectCount > 0) {
    score -= 0.05;
    issues.push('Some side effects');
  }

  // High parameter count
  const paramLists = code.match(/\(([^)]{20,})\)/g) || [];
  const highParamFuncs = paramLists.filter(p => (p.match(/,/g) || []).length >= 4).length;
  if (highParamFuncs > 0) {
    score -= 0.1;
    issues.push(`${highParamFuncs} function(s) with 5+ parameters`);
  }

  // Global state mutation
  const globalMutations = (code.match(/\b(global|window|document)\.\w+\s*=/g) || []).length;
  if (globalMutations > 0) {
    score -= 0.1;
    issues.push('Global state mutation');
  }

  return {
    score: Math.max(score, 0),
    label: 'Testability',
    detail: issues.length > 0 ? issues.join('; ') : 'Well-structured for testing',
  };
}

// ─── Verdict ───

function getVerdict(total: number): CoherencyResult['verdict'] {
  if (total >= 0.85) return 'excellent';
  if (total >= 0.68) return 'good';
  if (total >= 0.50) return 'acceptable';
  if (total >= 0.30) return 'needs-work';
  return 'poor';
}

// ─── Public API ───

/**
 * Score code across all 7 coherency dimensions.
 * Works entirely offline with no external dependencies.
 */
export function scoreCode(code: string, language: string): CoherencyResult {
  if (!code || code.trim().length === 0) {
    const emptyDim: DimensionScore = { score: 0, label: '', detail: 'Empty input' };
    return {
      total: 0,
      dimensions: {
        syntax: { ...emptyDim, label: 'Syntax' },
        completeness: { ...emptyDim, label: 'Completeness' },
        readability: { ...emptyDim, label: 'Readability' },
        simplicity: { ...emptyDim, label: 'Simplicity' },
        security: { ...emptyDim, label: 'Security' },
        consistency: { ...emptyDim, label: 'Consistency' },
        testability: { ...emptyDim, label: 'Testability' },
      },
      verdict: 'poor',
    };
  }

  const lang = language || 'plaintext';
  const syntax = scoreSyntax(code, lang);
  const completeness = scoreCompleteness(code);
  const readability = scoreReadability(code, lang);
  const simplicity = scoreSimplicity(code);
  const security = scoreSecurity(code, lang);
  const consistency = scoreConsistency(code, lang);
  const testability = scoreTestability(code, lang);

  const total =
    syntax.score * WEIGHTS.syntax +
    completeness.score * WEIGHTS.completeness +
    readability.score * WEIGHTS.readability +
    simplicity.score * WEIGHTS.simplicity +
    security.score * WEIGHTS.security +
    consistency.score * WEIGHTS.consistency +
    testability.score * WEIGHTS.testability;

  const rounded = Math.round(total * 1000) / 1000;

  return {
    total: rounded,
    dimensions: { syntax, completeness, readability, simplicity, security, consistency, testability },
    verdict: getVerdict(rounded),
  };
}
