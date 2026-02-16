/**
 * Reflection Transforms — the 5 refinement strategies.
 * Each transform targets a specific dimension of code quality.
 */

function applySimplify(code, lang) {
  let result = code;
  result = result.replace(/[ \t]+$/gm, '');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/\s*===\s*true\b/g, '');
  result = result.replace(/\s*===\s*false\b/g, ' === false');
  result = result.replace(/void\s+0/g, 'undefined');
  result = result.replace(/return\s+undefined\s*;/g, 'return;');
  result = result.replace(/\s*else\s*\{\s*\}/g, '');
  result = result.replace(/=>\s*\{\s*return\s+([^;]+);\s*\}/g, '=> $1');
  return result;
}

function applySecure(code, lang) {
  let result = code;
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    result = result.replace(/\bvar\s+(\w+)\s*=/g, (match, name) => {
      const reassignPattern = new RegExp(`\\b${name}\\s*=[^=]`, 'g');
      const matches = result.match(reassignPattern);
      return (matches && matches.length > 1) ? `let ${name} =` : `const ${name} =`;
    });
    result = result.replace(/([^!=<>])={2}([^=])/g, '$1===$2');
    result = result.replace(/([^!])!={1}([^=])/g, '$1!==$2');
  }
  return result;
}

function applyReadable(code, lang) {
  let result = code;
  const lines = result.split('\n');
  const indentCounts = {};
  for (const line of lines) {
    const match = line.match(/^( +)\S/);
    if (match) {
      const len = match[1].length;
      if (len > 0 && len <= 8) indentCounts[len] = (indentCounts[len] || 0) + 1;
    }
  }
  let targetIndent = 2;
  const entries = Object.entries(indentCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length > 0) targetIndent = Math.min(parseInt(entries[0][0]), 4);
  result = result.replace(/\t/g, ' '.repeat(targetIndent));
  result = result.replace(/\b(if|for|while|switch|catch)\(/g, '$1 (');
  result = result.replace(/([^\s!=<>])=([^=>\s])/g, '$1 = $2');
  return result;
}

function applyUnify(code, lang) {
  let result = code;
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    const singles = (result.match(/'/g) || []).length;
    const doubles = (result.match(/"/g) || []).length;
    if (singles > doubles * 2) {
      result = result.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, content) => {
        if (content.includes("'")) return match;
        return `'${content}'`;
      });
    } else if (doubles > singles * 2) {
      result = result.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, content) => {
        if (content.includes('"')) return match;
        return `"${content}"`;
      });
    }
    const semiLines = result.split('\n');
    for (let i = 0; i < semiLines.length; i++) {
      const trimmed = semiLines[i].trimEnd();
      if (trimmed && !trimmed.endsWith(';') && !trimmed.endsWith('{') &&
          !trimmed.endsWith('}') && !trimmed.endsWith(',') &&
          !trimmed.endsWith('(') && !trimmed.endsWith(':') &&
          !trimmed.startsWith('//') && !trimmed.startsWith('*') &&
          !trimmed.startsWith('/*') && !trimmed.endsWith('*/') &&
          !trimmed.startsWith('import ') && !trimmed.startsWith('export ') &&
          /^\s*(const|let|var|return|throw)\s/.test(trimmed)) {
        semiLines[i] = trimmed + ';';
      }
    }
    result = semiLines.join('\n');
  }
  return result;
}

function applyCorrect(code, lang) {
  let result = code;
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    result = result.replace(
      /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
      (match, name, params) => {
        if (params.includes('=')) return match;
        const newParams = params.replace(/\b(options|opts|config|settings)\b(?!\s*=)/g, '$1 = {}');
        if (newParams !== params) return `function ${name}(${newParams}) {`;
        return match;
      }
    );
    result = result.replace(/for\s*\(\s*const\s+(\w+)\s*=/g, 'for (let $1 =');
  }
  if (lang === 'python' || lang === 'py') {
    result = result.replace(
      /(def\s+\w+\s*\([^)]*\)\s*:)\n(\s+)(?!"""|\s*""")/g,
      '$1\n$2'
    );
  }
  return result;
}

/**
 * Combined "heal" transform — applies all 5 strategies in sequence.
 */
function applyHeal(code, lang) {
  let result = code;
  result = applySimplify(result, lang);
  result = applySecure(result, lang);
  result = applyReadable(result, lang);
  result = applyUnify(result, lang);
  result = applyCorrect(result, lang);
  return result;
}

function detectIndentUnit(code) {
  const indents = {};
  for (const line of code.split('\n')) {
    const match = line.match(/^( +)\S/);
    if (match) {
      const len = match[1].length;
      if (len > 0 && len <= 8) indents[len] = (indents[len] || 0) + 1;
    }
  }
  const entries = Object.entries(indents).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? Math.min(parseInt(entries[0][0]), 4) : 2;
}

/**
 * Apply structural conventions from proven pattern examples to target code.
 */
function applyPatternGuidance(code, lang, examples) {
  if (!examples || examples.length === 0) return code;
  const best = examples.reduce((a, b) =>
    (b.coherency ?? 0) > (a.coherency ?? 0) ? b : a, examples[0]);
  if (!best.code) return code;

  let result = code;
  const exampleCode = best.code;

  // Adopt quote style
  const exSingles = (exampleCode.match(/'/g) || []).length;
  const exDoubles = (exampleCode.match(/"/g) || []).length;
  if (exSingles > exDoubles * 2) {
    result = result.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, content) => {
      if (content.includes("'")) return match;
      return `'${content}'`;
    });
  } else if (exDoubles > exSingles * 2) {
    result = result.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, content) => {
      if (content.includes('"')) return match;
      return `"${content}"`;
    });
  }

  // Adopt indentation style
  const exIndent = detectIndentUnit(exampleCode);
  const curIndent = detectIndentUnit(result);
  if (exIndent > 0 && curIndent > 0 && exIndent !== curIndent) {
    const lines = result.split('\n');
    result = lines.map(line => {
      const match = line.match(/^(\s+)/);
      if (!match) return line;
      const spaces = match[1].length;
      const level = Math.round(spaces / curIndent);
      return ' '.repeat(level * exIndent) + line.slice(match[1].length);
    }).join('\n');
  }

  // Adopt semicolons (JS/TS only)
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    const exHasSemis = (exampleCode.match(/;\s*$/gm) || []).length;
    const exStatements = (exampleCode.match(/^\s*(const|let|var|return|throw)\s/gm) || []).length;
    if (exStatements > 0 && exHasSemis / exStatements > 0.8) {
      result = applyUnify(result, lang);
    }
  }

  result = applySimplify(result, lang);
  result = applySecure(result, lang);
  result = applyReadable(result, lang);
  return result;
}

module.exports = {
  applySimplify,
  applySecure,
  applyReadable,
  applyUnify,
  applyCorrect,
  applyHeal,
  applyPatternGuidance,
  detectIndentUnit,
};
