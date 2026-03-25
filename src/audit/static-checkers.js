'use strict';

/**
 * Audit Static Checkers — automated assumption-mismatch detection.
 *
 * Codifies the 6 meta-pattern bug classes as static checkers:
 *   1. State Mutation   — .sort() without .slice(), in-place ops on shared refs
 *   2. Security         — string === on secrets, template literal interpolation of untrusted code
 *   3. Concurrency      — check-then-set without locks, missing finally after lock acquire
 *   4. Type             — division without zero-guard, unchecked JSON.parse
 *   5. Integration      — null-returning functions whose callers don't null-check
 *   6. Edge Case        — switch without default, missing parameter validation
 *
 * Each checker returns an array of findings: { line, column, bugClass, assumption, reality, severity, suggestion }
 */

// ─── Bug Classes ───

const BUG_CLASSES = {
  STATE_MUTATION: 'state-mutation',
  SECURITY: 'security',
  CONCURRENCY: 'concurrency',
  TYPE: 'type',
  INTEGRATION: 'integration',
  EDGE_CASE: 'edge-case',
};

const SEVERITY = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

// ─── Checker: State Mutation ───

function checkStateMutation(code, lines) {
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // .sort() without preceding .slice() or [...spread]
    const sortMatch = line.match(/(\w+)\.sort\s*\(/);
    if (sortMatch) {
      const varName = sortMatch[1];
      // Check if this is on a copy (slice, spread, Array.from, structuredClone)
      const isCopy = line.includes('.slice(') ||
                     line.includes('[...') ||
                     line.includes('Array.from(') ||
                     line.includes('structuredClone(') ||
                     line.includes('.concat(');
      if (!isCopy) {
        findings.push({
          line: lineNum,
          bugClass: BUG_CLASSES.STATE_MUTATION,
          assumption: `.sort() creates a new array`,
          reality: `.sort() mutates the original array in-place`,
          severity: SEVERITY.HIGH,
          suggestion: `Use ${varName}.slice().sort(...) or [...${varName}].sort(...)`,
          code: line.trim(),
        });
      }
    }

    // .reverse() without .slice()
    const reverseMatch = line.match(/(\w+)\.reverse\s*\(\s*\)/);
    if (reverseMatch) {
      const varName = reverseMatch[1];
      const isCopy = line.includes('.slice(') || line.includes('[...');
      if (!isCopy) {
        findings.push({
          line: lineNum,
          bugClass: BUG_CLASSES.STATE_MUTATION,
          assumption: `.reverse() creates a new array`,
          reality: `.reverse() mutates the original array in-place`,
          severity: SEVERITY.MEDIUM,
          suggestion: `Use ${varName}.slice().reverse() or [...${varName}].reverse()`,
          code: line.trim(),
        });
      }
    }

    // .splice() on shared refs (just flag it — splice always mutates)
    if (/\w+\.splice\s*\(/.test(line) && !line.includes('// mutation-ok')) {
      findings.push({
        line: lineNum,
        bugClass: BUG_CLASSES.STATE_MUTATION,
        assumption: `splice is safe on this array`,
        reality: `.splice() mutates in-place — dangerous on shared references`,
        severity: SEVERITY.MEDIUM,
        suggestion: `Ensure the array is not shared, or use .filter()/.slice() instead`,
        code: line.trim(),
      });
    }

    // Object.assign modifying first arg that might be shared
    const assignMatch = line.match(/Object\.assign\s*\(\s*(\w+)\s*,/);
    if (assignMatch && assignMatch[1] !== '{}') {
      findings.push({
        line: lineNum,
        bugClass: BUG_CLASSES.STATE_MUTATION,
        assumption: `Object.assign target is safe to mutate`,
        reality: `Object.assign mutates the first argument — use Object.assign({}, ...) for immutability`,
        severity: SEVERITY.MEDIUM,
        suggestion: `Use Object.assign({}, ${assignMatch[1]}, ...) or spread: { ...${assignMatch[1]}, ... }`,
        code: line.trim(),
      });
    }
  }

  return findings;
}

// ─── Checker: Security ───

function checkSecurity(code, lines) {
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // String === comparison on secrets/passwords/tokens
    const secretCompare = line.match(/(password|secret|token|apiKey|api_key|auth)\s*===?\s*['"]/i);
    if (secretCompare) {
      findings.push({
        line: lineNum,
        bugClass: BUG_CLASSES.SECURITY,
        assumption: `String comparison on secrets is safe`,
        reality: `String === is vulnerable to timing attacks — use crypto.timingSafeEqual()`,
        severity: SEVERITY.HIGH,
        suggestion: `Use require('crypto').timingSafeEqual(Buffer.from(a), Buffer.from(b))`,
        code: line.trim(),
      });
    }

    // Template literal with eval-like patterns
    if (/new\s+Function\s*\(\s*`/.test(line) || /eval\s*\(\s*`/.test(line)) {
      findings.push({
        line: lineNum,
        bugClass: BUG_CLASSES.SECURITY,
        assumption: `Template literal in eval/Function is safe`,
        reality: `Template literals in eval/Function constructors enable code injection`,
        severity: SEVERITY.HIGH,
        suggestion: `Avoid eval/new Function with interpolated strings. Use a whitelist or AST-based approach`,
        code: line.trim(),
      });
    }

    // SQL template literal interpolation (not parameterized)
    // Skip DDL/migration statements and internal table/column name interpolation
    const sqlInterp = line.match(/(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b.*\$\{/i);
    const isDDLOrInternalNames = /ALTER\s+TABLE|CREATE\s+(INDEX|TABLE)\b|PRAGMA\s+table_info|ADD\s+COLUMN/i.test(line) ||
      // Skip lines where all ${...} interpolations are simple identifiers matching
      // internal schema patterns: table/column names, loop variables, or constants
      (sqlInterp && [...line.matchAll(/\$\{(\w+)\}/g)].every(m =>
        /^(table|t|.*[Cc]ol|.*[Tt]able|.*[Cc]olumn|[A-Z_]+)$/.test(m[1])
      ));
    if (sqlInterp && !isDDLOrInternalNames) {
      findings.push({
        line: lineNum,
        bugClass: BUG_CLASSES.SECURITY,
        assumption: `Template literal in SQL is safe`,
        reality: `String interpolation in SQL enables injection — use parameterized queries`,
        severity: SEVERITY.HIGH,
        suggestion: `Use prepared statements with ? placeholders`,
        code: line.trim(),
      });
    }

    // exec/execSync with string interpolation — skip CREATE INDEX statements (DDL, not shell)
    if ((/exec(?:Sync|File|FileSync)?\s*\(\s*`/.test(line) || /exec(?:Sync)?\s*\(\s*['"].*\$\{/.test(line)) &&
        !/CREATE\s+(INDEX|TABLE)/i.test(line)) {
      findings.push({
        line: lineNum,
        bugClass: BUG_CLASSES.SECURITY,
        assumption: `Shell command with interpolation is safe`,
        reality: `Command interpolation enables shell injection — use execFile with array args`,
        severity: SEVERITY.HIGH,
        suggestion: `Use execFile/execFileSync with argument arrays instead of string interpolation`,
        code: line.trim(),
      });
    }
  }

  return findings;
}

// ─── Checker: Concurrency ───

function checkConcurrency(code, lines) {
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check-then-set pattern without lock (async context)
    // Detect: if (thing) { thing = ... } without mutex/lock
    if (/await\s+/.test(line) || /async\s+/.test(line)) {
      // Look for check-then-set: if (x) followed by x = in nearby lines
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        const checkMatch = lines[j].match(/if\s*\(\s*!?(\w+(?:\.\w+)*)\s*\)/);
        if (checkMatch) {
          const varName = checkMatch[1];
          for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
            if (lines[k].includes(`${varName} =`) || lines[k].includes(`${varName}=`)) {
              // Check if there's a lock/mutex around this
              const contextSlice = lines.slice(Math.max(0, j - 3), k + 1).join('\n');
              if (!/mutex|lock|semaphore|atomic|synchronized/i.test(contextSlice)) {
                findings.push({
                  line: j + 1,
                  bugClass: BUG_CLASSES.CONCURRENCY,
                  assumption: `Check-then-set on ${varName} is atomic`,
                  reality: `In async code, another operation can modify ${varName} between check and set`,
                  severity: SEVERITY.HIGH,
                  suggestion: `Use a mutex/lock around the check-then-set, or use an atomic operation`,
                  code: lines[j].trim(),
                });
                break;
              }
            }
          }
        }
      }
    }

    // Lock acquire without finally for release
    const lockAcquire = line.match(/(?:await\s+)?(\w+)\.(acquire|lock)\s*\(/);
    if (lockAcquire) {
      const lockVar = lockAcquire[1];
      // Look for a finally block within 20 lines (release without finally is still unsafe)
      let hasFinallyRelease = false;
      const scanEnd = Math.min(i + 20, lines.length);
      for (let j = i + 1; j < scanEnd; j++) {
        if (/finally\s*\{/.test(lines[j])) {
          // Check if the release is inside this finally block
          for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
            if (lines[k].includes(`${lockVar}.release`)) {
              hasFinallyRelease = true;
              break;
            }
          }
          break;
        }
      }
      if (!hasFinallyRelease) {
        findings.push({
          line: lineNum,
          bugClass: BUG_CLASSES.CONCURRENCY,
          assumption: `Lock will always be released`,
          reality: `Without try/finally, exceptions leave the lock held forever (deadlock)`,
          severity: SEVERITY.HIGH,
          suggestion: `Wrap in try { ... } finally { ${lockVar}.release(); }`,
          code: line.trim(),
        });
      }
    }
  }

  return findings;
}

// ─── Checker: Type ───

function checkType(code, lines, options = {}) {
  const findings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Division without zero-guard (conservative: only flag obvious risky divisions)
    // Skip lines that are string literals, paths, shebangs, imports, or shell script fragments
    const trimmedLine = line.trim();
    const isInString = /['"`].*\/.*['"`]/.test(line) || /require\s*\(/.test(line) || /import\s+/.test(line) || /^#!/.test(trimmedLine) || /`.*#!/.test(line) || />\s*\/dev\/null/.test(line);
    // Skip comment lines (JSDoc, block comments, single-line comments)
    const isInComment = /^\s*\*/.test(line) || /^\s*\/\//.test(line) || /^\s*\/\*/.test(line);
    // Detect shell script context: $((x / y)), $((...)), or common shell patterns
    const isShellScript = /\$\(\(.*\//.test(line) || /\becho\b/.test(line) || /\bexit\b\s+\d/.test(line) || /\bfi\b\s*$/.test(trimmedLine) || /\bdone\b\s*$/.test(trimmedLine) || /^\s*#\s/.test(line);
    // Detect template literal block context: if surrounding lines look like a template literal
    // containing shell script (return `#!/bin/sh ... `)
    const isInTemplateLiteralShell = (() => {
      // Look backward for opening backtick with shell indicators
      for (let j = Math.max(0, i - 50); j < i; j++) {
        const prev = lines[j];
        if (/return\s*`/.test(prev) || /=\s*`/.test(prev)) {
          // Found template literal start — check if it contains shell markers
          const block = lines.slice(j, i + 1).join('\n');
          if (/#!/.test(block) || /\bfi\b/.test(block) || /\bdone\b/.test(block) || /\bexit\b/.test(block)) {
            return true;
          }
        }
      }
      return false;
    })();
    const divMatch = !isInString && !isInComment && !isShellScript && !isInTemplateLiteralShell && line.match(/(\w+(?:\.\w+)*)\s*\/\s*(\w+(?:\.\w+)*)/);
    if (divMatch && !/\/\/|\/\*|\*\//.test(line.slice(0, line.indexOf(divMatch[0])))) {
      const divisor = divMatch[2];
      // Skip known-safe divisors: literal numbers > 0, common safe patterns
      // Note: .length/.size/.count can be 0, so they are NOT safe divisors
      const isSafeDivisor = /^\d+(\.\d+)?$/.test(divisor) && divisor !== '0' ||
        /total|sum|max|min/i.test(divisor);
      if (!isSafeDivisor) {
        // Check if there's a zero-guard nearby (wider context)
        const context = lines.slice(Math.max(0, i - 5), i + 2).join('\n');
        const hasGuard = context.includes(`${divisor} !== 0`) ||
          context.includes(`${divisor} > 0`) ||
          context.includes(`${divisor} != 0`) ||
          context.includes(`${divisor} === 0`) ||
          context.includes(`${divisor} > 1`) ||
          /if\s*\(.*\b0\b/.test(context) ||
          /Math\.(max|min|abs)/.test(line) ||
          /\?\s*.*\//.test(line) || // ternary guard: x ? a / x : 0
          /\|\|\s*1/.test(line);     // fallback: x || 1
        if (!hasGuard) {
          findings.push({
            line: lineNum,
            bugClass: BUG_CLASSES.TYPE,
            assumption: `${divisor} is never zero`,
            reality: `Division by zero produces Infinity/NaN — add a zero-guard`,
            severity: SEVERITY.MEDIUM,
            suggestion: `Guard: ${divisor} !== 0 ? ... / ${divisor} : <default>`,
            code: line.trim(),
          });
        }
      }
    }

    // JSON.parse without try-catch
    if (/JSON\.parse\s*\(/.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(i + 2, lines.length)).join('\n');
      if (!/try\s*\{/.test(context) && !/catch\s*\(/.test(context) && !/safeParse/.test(context)) {
        findings.push({
          line: lineNum,
          bugClass: BUG_CLASSES.TYPE,
          assumption: `JSON.parse input is always valid JSON`,
          reality: `JSON.parse throws SyntaxError on invalid input`,
          severity: SEVERITY.MEDIUM,
          suggestion: `Wrap in try/catch or use a safeParse helper`,
          code: line.trim(),
        });
      }
    }

    // parseInt without radix — only flag in pedantic mode (very common, low risk in modern JS)
    if (options.pedantic) {
      if (/parseInt\s*\(\s*\w/.test(line) && !/parseInt\s*\([^,]+,\s*\d+/.test(line)) {
        findings.push({
          line: lineNum,
          bugClass: BUG_CLASSES.TYPE,
          assumption: `parseInt defaults to base 10`,
          reality: `Without explicit radix, parseInt can misparse strings starting with "0"`,
          severity: SEVERITY.LOW,
          suggestion: `Use parseInt(value, 10) to be explicit`,
          code: line.trim(),
        });
      }
    }
  }

  return findings;
}

// ─── Checker: Integration ───

function checkIntegration(code, lines) {
  const findings = [];

  // Track functions that return null/undefined
  const nullReturners = new Set();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Find functions that explicitly return null
    if (/return\s+null\s*;/.test(line)) {
      // Walk back to find function name
      for (let j = i; j >= Math.max(0, i - 20); j--) {
        const fnMatch = lines[j].match(/(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?(?:function|\())/);
        if (fnMatch) {
          nullReturners.add(fnMatch[1] || fnMatch[2]);
          break;
        }
      }
    }
  }

  // Check callers of null-returning functions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const fnName of nullReturners) {
      const callPattern = new RegExp(`(\\w+)\\s*=\\s*(?:await\\s+)?${fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`);
      const callMatch = line.match(callPattern);
      if (callMatch) {
        const resultVar = callMatch[1];
        // Check if there's a null check within 5 lines
        let hasNullCheck = false;
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          if (lines[j].includes(`${resultVar} ===`) || lines[j].includes(`${resultVar} !==`) ||
              lines[j].includes(`!${resultVar}`) || lines[j].includes(`${resultVar} ==`) ||
              lines[j].includes(`${resultVar}?`) || lines[j].includes(`${resultVar} &&`)) {
            hasNullCheck = true;
            break;
          }
        }
        if (!hasNullCheck) {
          findings.push({
            line: lineNum,
            bugClass: BUG_CLASSES.INTEGRATION,
            assumption: `${fnName}() always returns a value`,
            reality: `${fnName}() can return null — callers must check before using`,
            severity: SEVERITY.HIGH,
            suggestion: `Add null check: if (!${resultVar}) { handle error }`,
            code: line.trim(),
          });
        }
      }
    }

    // .get() / .find() result used without null check
    const getMatch = line.match(/(\w+)\s*=\s*\w+\.(get|find|querySelector)\s*\(/);
    if (getMatch) {
      const resultVar = getMatch[1];
      // Check next 3 lines for property access without null check
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (new RegExp(`${resultVar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\w+`).test(lines[j])) {
          // Check if there was a null check in between
          const between = lines.slice(i + 1, j).join('\n');
          if (!between.includes(`!${resultVar}`) && !between.includes(`${resultVar} !==`) &&
              !between.includes(`${resultVar}?`) && !between.includes(`${resultVar} &&`) &&
              !between.includes(`${resultVar} ==`)) {
            findings.push({
              line: j + 1,
              bugClass: BUG_CLASSES.INTEGRATION,
              assumption: `${getMatch[2]}() always returns a result`,
              reality: `${getMatch[2]}() can return null/undefined — accessing .property will throw`,
              severity: SEVERITY.HIGH,
              suggestion: `Add: if (${resultVar}) { ... } or use optional chaining: ${resultVar}?.property`,
              code: lines[j].trim(),
            });
            break;
          }
        }
      }
    }
  }

  return findings;
}

// ─── Checker: Edge Case ───

function checkEdgeCase(code, lines) {
  const findings = [];

  // Track switch statements and check for default using a stack for nesting
  const switchStack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect switch statement start — push state onto stack
    if (/switch\s*\(/.test(line)) {
      switchStack.push({ switchLine: lineNum, hasDefault: false, braceCount: 0 });
    }

    if (switchStack.length > 0) {
      const current = switchStack[switchStack.length - 1];
      current.braceCount += (line.match(/\{/g) || []).length;
      current.braceCount -= (line.match(/\}/g) || []).length;

      if (/\bdefault\s*:/.test(line)) {
        current.hasDefault = true;
      }

      if (current.braceCount <= 0 && i > current.switchLine - 1) {
        if (!current.hasDefault) {
          findings.push({
            line: current.switchLine,
            bugClass: BUG_CLASSES.EDGE_CASE,
            assumption: `Switch statement covers all cases`,
            reality: `Missing default case — unmatched values silently fall through`,
            severity: SEVERITY.MEDIUM,
            suggestion: `Add a default: case with error handling or explicit no-op`,
            code: lines[current.switchLine - 1].trim(),
          });
        }
        switchStack.pop();
      }
    }

    // Function without parameter validation
    const fnMatch = line.match(/(?:function\s+(\w+)|(\w+)\s*=\s*(?:async\s+)?(?:function\s*)?\()\s*([^)]*)\)/);
    if (fnMatch) {
      const fnName = fnMatch[1] || fnMatch[2];
      const params = fnMatch[3];
      if (params && params.trim() && !params.includes('=')) {
        // Has required params — check next 5 lines for validation
        const requiredParams = params.split(',').map(p => p.trim()).filter(p => p && !p.includes('=') && !p.startsWith('...'));
        if (requiredParams.length > 0) {
          let hasValidation = false;
          for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
            if (/if\s*\(\s*!/.test(lines[j]) || /throw\s+/.test(lines[j]) ||
                /typeof\s+/.test(lines[j]) || /\?\?/.test(lines[j])) {
              hasValidation = true;
              break;
            }
          }
          // Only flag exported/public functions (heuristic: not starting with _)
          if (!hasValidation && fnName && !fnName.startsWith('_') && requiredParams.length >= 2) {
            findings.push({
              line: lineNum,
              bugClass: BUG_CLASSES.EDGE_CASE,
              assumption: `${fnName}() always receives valid parameters`,
              reality: `No parameter validation — undefined/null args will cause silent failures`,
              severity: SEVERITY.LOW,
              suggestion: `Validate required parameters at function entry`,
              code: line.trim(),
            });
          }
        }
      }
    }

    // Array access with unchecked index
    const indexAccess = line.match(/(\w+)\[(\w+)\]/);
    if (indexAccess) {
      const arrName = indexAccess[1];
      const indexVar = indexAccess[2];
      // Check if index is bounds-checked
      if (!/length/.test(lines.slice(Math.max(0, i - 3), i + 1).join('\n')) &&
          !/^\d+$/.test(indexVar) && arrName !== 'process' && arrName !== 'args') {
        // Don't flag common safe patterns
        if (arrName !== 'arguments' && !line.includes('||') && !line.includes('??')) {
          // This is low-severity since many array accesses are safe
        }
      }
    }
  }

  return findings;
}

// ─── Main Audit Runner ───

/**
 * Run all static checkers on a code string.
 *
 * @param {string} code - Source code to analyze
 * @param {object} [options] - { language, bugClasses, minSeverity }
 * @returns {{ findings: Array, summary: object }}
 */
function auditCode(code, options = {}) {
  if (!code || typeof code !== 'string') {
    return { findings: [], summary: { total: 0, byClass: {}, bySeverity: {} } };
  }

  const lines = code.split('\n');
  const enabledClasses = options.bugClasses
    ? new Set(Array.isArray(options.bugClasses) ? options.bugClasses : [options.bugClasses])
    : null;

  const checkerOptions = { pedantic: options.pedantic || false };
  const checkers = [
    { bugClass: BUG_CLASSES.STATE_MUTATION, fn: (c, l) => checkStateMutation(c, l) },
    { bugClass: BUG_CLASSES.SECURITY, fn: (c, l) => checkSecurity(c, l) },
    { bugClass: BUG_CLASSES.CONCURRENCY, fn: (c, l) => checkConcurrency(c, l) },
    { bugClass: BUG_CLASSES.TYPE, fn: (c, l) => checkType(c, l, checkerOptions) },
    { bugClass: BUG_CLASSES.INTEGRATION, fn: (c, l) => checkIntegration(c, l) },
    { bugClass: BUG_CLASSES.EDGE_CASE, fn: (c, l) => checkEdgeCase(c, l) },
  ];

  let findings = [];

  for (const { bugClass, fn } of checkers) {
    if (enabledClasses && !enabledClasses.has(bugClass)) continue;
    try {
      const results = fn(code, lines);
      findings.push(...results);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn(`[audit:${bugClass}]`, e?.message || e);
    }
  }

  // Filter by severity if requested
  if (options.minSeverity) {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    const minLevel = severityOrder[options.minSeverity] || 0;
    findings = findings.filter(f => (severityOrder[f.severity] || 0) >= minLevel);
  }

  // Sort by severity (high first), then by line number
  const severityOrder = { high: 3, medium: 2, low: 1 };
  findings.sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0) || a.line - b.line);

  // Build summary
  const byClass = {};
  const bySeverity = {};
  for (const f of findings) {
    byClass[f.bugClass] = (byClass[f.bugClass] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
  }

  return {
    findings,
    summary: {
      total: findings.length,
      byClass,
      bySeverity,
    },
  };
}

/**
 * Audit a file from the filesystem.
 *
 * @param {string} filePath - Path to file
 * @param {object} [options] - Audit options
 * @returns {{ file: string, findings: Array, summary: object }}
 */
function auditFile(filePath, options = {}) {
  const fs = require('fs');
  if (!fs.existsSync(filePath)) {
    return { file: filePath, findings: [], summary: { total: 0, byClass: {}, bySeverity: {} }, error: 'File not found' };
  }

  const code = fs.readFileSync(filePath, 'utf-8');
  const result = auditCode(code, options);

  return {
    file: filePath,
    ...result,
  };
}

/**
 * Audit multiple files and return combined results.
 *
 * @param {string[]} files - Array of file paths
 * @param {object} [options] - Audit options
 * @returns {{ files: Array, totalFindings: number, summary: object }}
 */
function auditFiles(files, options = {}) {
  if (!files || !Array.isArray(files)) {
    return { files: [], totalFindings: 0, summary: { filesScanned: 0, filesWithFindings: 0, byClass: {}, bySeverity: {} } };
  }

  const results = [];
  let totalFindings = 0;
  const globalByClass = {};
  const globalBySeverity = {};

  for (const file of files) {
    const result = auditFile(file, options);
    if (result.findings.length > 0) {
      results.push(result);
      totalFindings += result.findings.length;
      for (const [cls, count] of Object.entries(result.summary.byClass)) {
        globalByClass[cls] = (globalByClass[cls] || 0) + count;
      }
      for (const [sev, count] of Object.entries(result.summary.bySeverity)) {
        globalBySeverity[sev] = (globalBySeverity[sev] || 0) + count;
      }
    }
  }

  return {
    files: results,
    totalFindings,
    summary: {
      filesScanned: files.length,
      filesWithFindings: results.length,
      byClass: globalByClass,
      bySeverity: globalBySeverity,
    },
  };
}

module.exports = {
  auditCode,
  auditFile,
  auditFiles,
  checkStateMutation,
  checkSecurity,
  checkConcurrency,
  checkType,
  checkIntegration,
  checkEdgeCase,
  BUG_CLASSES,
  SEVERITY,
};
