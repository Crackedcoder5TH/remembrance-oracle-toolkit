/**
 * Coherency Feedback — dimension-specific advice for improving code scores.
 */

const { WEIGHTS } = require('./coherency');

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

function coherencyFeedback(code, coherencyScore, threshold = 0.6) {
  if (!coherencyScore || coherencyScore.total >= threshold) return [];

  const feedback = [];
  const { breakdown } = coherencyScore;
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

module.exports = { COHERENCY_ADVICE, coherencyFeedback };
