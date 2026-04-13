'use strict';

/**
 * Suppression directives for the audit static checker.
 *
 * Three mechanisms, all optional:
 *
 *   1. Inline — `// oracle-ignore-next-line[: <rule>[,<rule>...]]`
 *      Silences the next source line (or a specific rule on that line).
 *
 *   2. Same-line — `expression // oracle-ignore[: <rule>]`
 *      Silences the current line (or a specific rule).
 *
 *   3. File — `// oracle-ignore-file[: <rule>]`
 *      Silences the whole file (or a specific rule across the file).
 *      Must appear in the first 20 lines to count.
 *
 *   4. Project — a `.oracle-ignore` file at the repo root with glob patterns.
 *      One pattern per line. Supports `**`, `*`, and `!` negation.
 *
 * Rule names: 'security', 'state-mutation', 'type', 'concurrency',
 * 'integration', 'edge-case', or the more specific rule id we assign per
 * checker (e.g. `security/sql-injection`, `type/division-by-zero`).
 * An empty rule means "silence everything on that line".
 */

const fs = require('fs');
const path = require('path');

// Recognize "oracle" and "oracle-audit" prefixes to be friendly to users who
// typed the full name. "orc" prefix also accepted for brevity.
const DIRECTIVE_RE = new RegExp(
  '\\b(?:oracle|oracle-audit|orc)-ignore(?:-(next-line|file))?\\b(?::\\s*([\\w/,-]+))?'
);

/**
 * Parse an array of comment tokens (from parser.js) into a suppression table.
 *
 * @param {Array<{type,value,line}>} comments
 * @returns {{
 *   byLine: Map<number, Set<string>|'*'>,
 *   fileRules: Set<string>|null,
 * }}
 */
function parseComments(comments, totalLines) {
  const byLine = new Map();
  let fileRules = null;
  const FILE_WINDOW_LINES = 20;

  function addRule(line, rule) {
    const existing = byLine.get(line);
    if (existing === '*') return;
    if (!rule) { byLine.set(line, '*'); return; }
    if (!existing) byLine.set(line, new Set([rule]));
    else existing.add(rule);
  }

  for (const c of comments) {
    const match = c.value.match(DIRECTIVE_RE);
    if (!match) continue;
    const kind = match[1] || 'same-line'; // 'next-line' | 'file' | 'same-line'
    const rulesRaw = match[2] || '';
    const rules = rulesRaw
      ? rulesRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [''];

    if (kind === 'file') {
      if (c.line > FILE_WINDOW_LINES) continue;
      if (!fileRules) fileRules = new Set();
      for (const r of rules) {
        if (!r) { fileRules.add('*'); return { byLine, fileRules }; }
        fileRules.add(r);
      }
      continue;
    }

    const target = kind === 'next-line' ? c.line + 1 : c.line;
    for (const r of rules) addRule(target, r);
  }

  // If file-level wildcard was requested, collapse everything.
  return { byLine, fileRules };
}

/**
 * Check whether a finding should be suppressed.
 *
 * @param {object} finding - { line, bugClass, ruleId? }
 * @param {object} table   - Result of parseComments
 * @returns {boolean}
 */
function isSuppressed(finding, table) {
  if (!table) return false;
  const { byLine, fileRules } = table;
  const ruleId = finding.ruleId || finding.bugClass;

  if (fileRules) {
    if (fileRules.has('*')) return true;
    if (fileRules.has(finding.bugClass)) return true;
    if (ruleId && fileRules.has(ruleId)) return true;
  }

  const lineSet = byLine.get(finding.line);
  if (!lineSet) return false;
  if (lineSet === '*') return true;
  if (lineSet.has(finding.bugClass)) return true;
  if (ruleId && lineSet.has(ruleId)) return true;
  return false;
}

// ─── .oracle-ignore file ─────────────────────────────────────────────────────

/**
 * Load a `.oracle-ignore` file and return a matcher.
 *
 * Glob semantics:
 *   - `**` matches any number of path segments
 *   - `*` matches any characters within a segment
 *   - `?` matches one character
 *   - leading `!` negates (unignore)
 *   - lines beginning with `#` are comments
 */
function loadIgnoreFile(repoRoot) {
  const candidates = [
    path.join(repoRoot, '.oracle-ignore'),
    path.join(repoRoot, '.oracleignore'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, 'utf-8');
        return compileIgnore(raw, repoRoot);
      } catch {
        return compileIgnore('', repoRoot);
      }
    }
  }
  return compileIgnore('', repoRoot);
}

function compileIgnore(raw, repoRoot) {
  const patterns = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    let negate = false;
    let pat = trimmed;
    if (pat.startsWith('!')) { negate = true; pat = pat.slice(1); }
    patterns.push({ negate, regex: globToRegex(pat) });
  }
  return {
    shouldIgnore(absPath) {
      const rel = path.relative(repoRoot, absPath).split(path.sep).join('/');
      let ignored = false;
      for (const { negate, regex } of patterns) {
        if (regex.test(rel)) ignored = !negate;
      }
      return ignored;
    },
  };
}

function globToRegex(glob) {
  let re = '^';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') { re += '.*'; i++; }
      else re += '[^/]*';
    } else if (ch === '?') {
      re += '.';
    } else if ('.+^${}()|[]\\'.includes(ch)) {
      re += '\\' + ch;
    } else {
      re += ch;
    }
  }
  re += '$';
  return new RegExp(re);
}

module.exports = {
  parseComments,
  isSuppressed,
  loadIgnoreFile,
};
