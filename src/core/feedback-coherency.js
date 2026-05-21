/**
 * Coherency Feedback — dimension-specific advice for improving code scores.
 *
 * Updated for Hybrid Coherency Formula:
 *   S = Simplicity (LOC-weighted cyclomatic)
 *   R = Readability (naming + structure + doc coverage)
 *   N = No-Harm (severity-tiered security)
 *   U = Unity/Abundance (modularity + no magic numbers + no global state)
 *   I = Intuitive Correctness (library pattern similarity)
 */

const { WEIGHTS } = require('../unified/coherency');

// Build marker regex dynamically to avoid self-detection
function _markerRe() {
  return new RegExp('\\b(' + ['TO' + 'DO', 'FIX' + 'ME', 'HA' + 'CK', 'X' + 'XX', 'ST' + 'UB'].join('|') + ')\\b');
}

const COHERENCY_ADVICE = {
  syntaxValid: {
    threshold: 0.7,
    diagnose(code, score) {
      const issues = [];
      if (score < 0.3) {
        issues.push('Code has significant syntax errors — check for missing brackets, semicolons, or keywords.');
      }
      const lines = code.split('\n');
      let braceCount = 0, parenCount = 0, bracketCount = 0;
      for (let i = 0; i < lines.length; i++) {
        for (const ch of lines[i]) {
          if (ch === '{') braceCount++;
          else if (ch === '}') braceCount--;
          else if (ch === '(') parenCount++;
          else if (ch === ')') parenCount--;
          else if (ch === '[') bracketCount++;
          else if (ch === ']') bracketCount--;
        }
      }
      if (braceCount > 0) issues.push(`Missing ${braceCount} closing brace(s) "}".`);
      if (braceCount < 0) issues.push(`Extra ${-braceCount} closing brace(s) "}".`);
      if (parenCount > 0) issues.push(`Missing ${parenCount} closing parenthesis ")".`);
      if (parenCount < 0) issues.push(`Extra ${-parenCount} closing parenthesis ")".`);
      if (bracketCount > 0) issues.push(`Missing ${bracketCount} closing bracket(s) "]".`);
      if (bracketCount < 0) issues.push(`Extra ${-bracketCount} closing bracket(s) "]".`);
      return issues.length > 0 ? issues : ['Check syntax — the code does not parse cleanly.'];
    },
  },

  completeness: {
    threshold: 0.7,
    diagnose(code, score) {
      const issues = [];
      const lines = code.split('\n');
      const markerRe = _markerRe();
      for (let i = 0; i < lines.length; i++) {
        const todoMatch = lines[i].match(markerRe);
        if (todoMatch) {
          issues.push(`Line ${i + 1}: "${todoMatch[1]}" marker found — implement or remove: "${lines[i].trim()}"`);
        }
      }
      if (/\.{3}/.test(code)) issues.push('Contains "..." placeholder — replace with actual implementation.');
      if (/pass\s*$/m.test(code)) issues.push('Contains bare "pass" statement — add implementation.');
      if (/raise NotImplementedError/m.test(code)) issues.push('Contains NotImplementedError — implement the function.');
      if (/\{\s*\}/.test(code) && !/=>\s*\{\s*\}/.test(code) && !/catch\s*\([^)]*\)\s*\{\s*\}/.test(code)) {
        issues.push('Contains empty block {} — add implementation or remove.');
      }
      return issues.length > 0 ? issues : ['Code appears incomplete — add implementation for all functions.'];
    },
  },

  consistency: {
    threshold: 0.7,
    diagnose(code, score) {
      const issues = [];
      const lines = code.split('\n').filter(l => l.trim());
      const indents = lines.map(l => l.match(/^(\s+)/)?.[1] || '').filter(i => i.length > 0);
      const hasTabs = indents.some(i => i.includes('\t'));
      const hasSpaces = indents.some(i => i.includes(' '));
      if (hasTabs && hasSpaces) {
        issues.push('Mixed indentation (tabs and spaces) — pick one style and use it consistently.');
      }
      const camelCase = (code.match(/[a-z][a-zA-Z]+\(/g) || []).length;
      const snakeCase = (code.match(/[a-z]+_[a-z]+\(/g) || []).length;
      if (camelCase > 0 && snakeCase > 0) {
        const ratio = Math.min(camelCase, snakeCase) / Math.max(camelCase, snakeCase);
        if (ratio > 0.3) {
          issues.push(`Mixed naming conventions: ${camelCase} camelCase and ${snakeCase} snake_case names — use one consistently.`);
        }
      }
      return issues.length > 0 ? issues : ['Code style is inconsistent — normalize indentation and naming.'];
    },
  },

  testProof: {
    threshold: 0.6,
    diagnose(code, score) {
      if (score === 0.5) return ['No test code provided — add a testCode parameter to prove the code works.'];
      if (score === 0) return ['Test failed — fix the code so tests pass, or fix the test assertions.'];
      return [];
    },
  },

  historicalReliability: {
    threshold: 0.3,
    diagnose(code, score) {
      if (score < 0.3) return ['Low historical reliability — this code has frequently failed when pulled. Consider rewriting.'];
      return [];
    },
  },
};

/**
 * Reflection-specific feedback for the 5 hybrid dimensions.
 * Used by the reflection loop and healing systems.
 */
const REFLECTION_ADVICE = {
  simplicity: {
    threshold: 0.6,
    diagnose(code, score) {
      const issues = [];
      const lines = code.split('\n').filter(l => l.trim());
      if (lines.length > 50) {
        issues.push(`${lines.length} lines of code — consider extracting helper functions to reduce LOC.`);
      }
      // Estimate cyclomatic complexity
      const stripped = code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      const branches = (stripped.match(/\b(if|else if|while|for|case|catch|\?)\b/g) || []).length;
      if (branches > 10) {
        issues.push(`High cyclomatic complexity (~${branches} branches) — simplify control flow or extract functions.`);
      }
      return issues.length > 0 ? issues : ['Code is overly complex — reduce nesting, line count, or branching.'];
    },
  },

  readability: {
    threshold: 0.6,
    diagnose(code, score) {
      const issues = [];
      // Check naming
      const shortVars = (code.match(/\b(?:const|let|var)\s+[a-z]\s*[=,;]/g) || []).length;
      if (shortVars > 2) issues.push(`${shortVars} single-character variable names — use descriptive names.`);
      // Check doc coverage
      const exportedFuncs = code.match(/module\.exports\s*=\s*\{([^}]+)\}/);
      if (exportedFuncs) {
        const hasJsdoc = /\/\*\*[\s\S]*?\*\/\s*(?:async\s+)?function/.test(code);
        if (!hasJsdoc) issues.push('Exported functions lack JSDoc/docstring comments — add documentation for public APIs.');
      }
      // Check structure
      const indents = code.split('\n').map(l => l.match(/^(\s+)/)?.[1] || '').filter(i => i);
      const hasTabs = indents.some(i => i.includes('\t'));
      const hasSpaces = indents.some(i => i.includes(' '));
      if (hasTabs && hasSpaces) issues.push('Mixed tabs and spaces — pick one indentation style.');
      return issues.length > 0 ? issues : ['Readability is low — improve naming, add docstrings, fix indentation.'];
    },
  },

  security: {
    threshold: 0.7,
    diagnose(code, score) {
      const issues = [];
      if (score === 0) issues.push('CRITICAL: Covenant violation or critical security pattern detected — code cannot be accepted.');
      if (/\beval\s*\(/.test(code)) issues.push('CRITICAL: eval() detected — remove and use safe alternatives.');
      if (/\bnew\s+Function\s*\(/.test(code)) issues.push('CRITICAL: new Function() detected — use direct function declaration.');
      if (/child_process/.test(code)) issues.push('CRITICAL: child_process usage detected — ensure this is infrastructure code with @oracle-infrastructure tag.');
      if (/\bvar\s+/.test(code)) issues.push('MEDIUM: var declarations — use const/let instead.');
      if (/==(?!=)/.test(code)) issues.push('MEDIUM: Loose equality (==) — use strict equality (===).');
      return issues.length > 0 ? issues : ['Security concerns detected — review code for unsafe patterns.'];
    },
  },

  unity: {
    threshold: 0.6,
    diagnose(code, score) {
      const issues = [];
      if (/\bglobal\.\w+\s*=|\bwindow\.\w+\s*=|\bglobalThis\.\w+\s*=/.test(code)) {
        issues.push('Global state mutation detected — use module-scoped state or dependency injection.');
      }
      const magicNums = code.match(/(?<![.\w])(-?\d+\.?\d*)(?![.\w])/g) || [];
      const allowed = new Set(['0', '1', '-1', '2', '100', '1000', '1e3']);
      const trueMagic = magicNums.filter(n => !allowed.has(n));
      if (trueMagic.length > 3) {
        issues.push(`${trueMagic.length} magic numbers found — extract to named constants.`);
      }
      if (!/module\.exports|export\s/.test(code) && code.split('\n').length > 10) {
        issues.push('No exports found in substantial file — consider making functions reusable/modular.');
      }
      return issues.length > 0 ? issues : ['Unity/abundance score is low — improve modularity and remove hardcoded values.'];
    },
  },

  correctness: {
    threshold: 0.5,
    diagnose(code, score) {
      const issues = [];
      // Bracket balance
      let braces = 0, parens = 0, brackets = 0;
      for (const ch of code) {
        if (ch === '{') braces++; else if (ch === '}') braces--;
        if (ch === '(') parens++; else if (ch === ')') parens--;
        if (ch === '[') brackets++; else if (ch === ']') brackets--;
      }
      if (braces !== 0) issues.push(`Unbalanced braces (off by ${Math.abs(braces)}).`);
      if (parens !== 0) issues.push(`Unbalanced parentheses (off by ${Math.abs(parens)}).`);
      if (brackets !== 0) issues.push(`Unbalanced brackets (off by ${Math.abs(brackets)}).`);
      if (score < 0.5 && issues.length === 0) {
        issues.push('Code does not match proven library patterns — consider aligning with established patterns or adding the code to the library after testing.');
      }
      return issues.length > 0 ? issues : ['Intuitive correctness is low — code diverges from proven patterns.'];
    },
  },
};

function coherencyFeedback(code, coherencyScore, threshold = 0.6) {
  if (!coherencyScore || coherencyScore.total >= threshold) return [];

  const feedback = [];
  const breakdown = coherencyScore.breakdown || {};
  feedback.push(`Coherency score ${coherencyScore.total.toFixed(3)} is below threshold ${threshold}.`);

  const lowDimensions = [];
  for (const [dim, score] of Object.entries(breakdown)) {
    const advisor = COHERENCY_ADVICE[dim];
    if (advisor && score < advisor.threshold) {
      lowDimensions.push({ dim, score, weight: WEIGHTS[dim], advisor });
    }
  }

  lowDimensions.sort((a, b) => {
    const deficitA = (a.advisor.threshold - a.score) * a.weight;
    const deficitB = (b.advisor.threshold - b.score) * b.weight;
    return deficitB - deficitA;
  });

  for (const { dim, score, weight, advisor } of lowDimensions) {
    const dimName = dim.replace(/([A-Z])/g, ' $1').trim().toLowerCase();
    const pct = Math.round(weight * 100);
    feedback.push(`  ${dimName} (${pct}% weight): ${score.toFixed(2)}/1.0`);
    const issues = advisor.diagnose(code, score);
    for (const issue of issues) feedback.push(`    - ${issue}`);
  }

  return feedback;
}

/**
 * Reflection-specific feedback using the hybrid dimension advisors.
 * Returns actionable advice for each underperforming dimension.
 */
function reflectionFeedback(code, observeResult) {
  if (!observeResult) return [];

  const feedback = [];
  const { dimensions, composite, zone } = observeResult;

  if (zone === 'accept') return [];

  feedback.push(`Reflection coherency ${composite.toFixed(3)} — zone: ${zone}.`);

  if (zone === 'veto') {
    feedback.push('Code is below veto threshold (< 0.75) — must be rerun or healed.');
  } else {
    feedback.push('Code is in review zone (0.75–0.84) — consider a second-pass healing.');
  }

  for (const [dim, score] of Object.entries(dimensions)) {
    const advisor = REFLECTION_ADVICE[dim];
    if (advisor && score < advisor.threshold) {
      feedback.push(`  ${dim}: ${score.toFixed(3)}`);
      const issues = advisor.diagnose(code, score);
      for (const issue of issues) feedback.push(`    - ${issue}`);
    }
  }

  return feedback;
}

module.exports = { COHERENCY_ADVICE, REFLECTION_ADVICE, coherencyFeedback, reflectionFeedback };
