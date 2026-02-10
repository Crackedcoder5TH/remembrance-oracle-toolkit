/**
 * Pattern Versioning & Semantic Code Diffing
 *
 * Provides version tracking for patterns and structural code diffing
 * that understands code shape — functions, signatures, imports —
 * rather than just raw text lines.
 *
 * Storage: SQLite (node:sqlite DatabaseSync) with in-memory Map fallback.
 * Diff: LCS-based line diff + function-level semantic analysis.
 * Similarity: Jaccard on normalized tokens.
 */

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch {
  DatabaseSync = null;
}

// ─── VersionManager ─────────────────────────────────────────────────────────

class VersionManager {
  /**
   * @param {object} [sqliteStore] - Optional SQLiteStore instance with a `.db` property.
   *   Falls back to an in-memory Map when not provided or when SQLite is unavailable.
   */
  constructor(sqliteStore) {
    this._useSQLite = false;
    this._map = new Map(); // patternId -> [snapshots] (newest last)

    if (sqliteStore && sqliteStore.db) {
      try {
        this._db = sqliteStore.db;
        this._initSchema();
        this._useSQLite = true;
      } catch {
        // Fall back to in-memory if schema init fails
      }
    }
  }

  _initSchema() {
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS pattern_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        code TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        timestamp TEXT NOT NULL,
        UNIQUE(pattern_id, version)
      );
      CREATE INDEX IF NOT EXISTS idx_versions_pattern ON pattern_versions(pattern_id);
    `);
  }

  /**
   * Save a version snapshot for a pattern.
   * Version numbers auto-increment per pattern starting at 1.
   *
   * @param {string} patternId
   * @param {string} code
   * @param {object} [metadata={}]
   * @returns {{ version: number, patternId: string, code: string, timestamp: string, metadata: object }}
   */
  saveSnapshot(patternId, code, metadata = {}) {
    const nextVersion = this.getLatestVersion(patternId) + 1;
    const timestamp = new Date().toISOString();

    const snapshot = {
      version: nextVersion,
      patternId,
      code,
      timestamp,
      metadata,
    };

    if (this._useSQLite) {
      this._db.prepare(`
        INSERT INTO pattern_versions (pattern_id, version, code, metadata, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(patternId, nextVersion, code, JSON.stringify(metadata), timestamp);
    } else {
      if (!this._map.has(patternId)) {
        this._map.set(patternId, []);
      }
      this._map.get(patternId).push(snapshot);
    }

    return snapshot;
  }

  /**
   * Get full version history for a pattern, newest first.
   *
   * @param {string} patternId
   * @returns {Array<{ version, patternId, code, timestamp, metadata }>}
   */
  getHistory(patternId) {
    if (this._useSQLite) {
      const rows = this._db.prepare(
        'SELECT * FROM pattern_versions WHERE pattern_id = ? ORDER BY version DESC'
      ).all(patternId);
      return rows.map(r => ({
        version: r.version,
        patternId: r.pattern_id,
        code: r.code,
        timestamp: r.timestamp,
        metadata: JSON.parse(r.metadata || '{}'),
      }));
    }

    const snapshots = this._map.get(patternId) || [];
    return [...snapshots].reverse();
  }

  /**
   * Get a specific version snapshot.
   *
   * @param {string} patternId
   * @param {number} version
   * @returns {{ version, patternId, code, timestamp, metadata } | null}
   */
  getVersion(patternId, version) {
    if (this._useSQLite) {
      const row = this._db.prepare(
        'SELECT * FROM pattern_versions WHERE pattern_id = ? AND version = ?'
      ).get(patternId, version);
      if (!row) return null;
      return {
        version: row.version,
        patternId: row.pattern_id,
        code: row.code,
        timestamp: row.timestamp,
        metadata: JSON.parse(row.metadata || '{}'),
      };
    }

    const snapshots = this._map.get(patternId) || [];
    return snapshots.find(s => s.version === version) || null;
  }

  /**
   * Get the latest version number for a pattern. Returns 0 if none exist.
   *
   * @param {string} patternId
   * @returns {number}
   */
  getLatestVersion(patternId) {
    if (this._useSQLite) {
      const row = this._db.prepare(
        'SELECT MAX(version) as max_ver FROM pattern_versions WHERE pattern_id = ?'
      ).get(patternId);
      return row && row.max_ver != null ? row.max_ver : 0;
    }

    const snapshots = this._map.get(patternId) || [];
    if (snapshots.length === 0) return 0;
    return snapshots[snapshots.length - 1].version;
  }

  /**
   * Rollback — retrieve code from a specific version (read-only, no mutation).
   *
   * @param {string} patternId
   * @param {number} toVersion
   * @returns {string | null} The code at that version, or null if not found.
   */
  rollback(patternId, toVersion) {
    const snapshot = this.getVersion(patternId, toVersion);
    return snapshot ? snapshot.code : null;
  }
}

// ─── Function Extraction ────────────────────────────────────────────────────

/**
 * Extract function-level structures from code.
 *
 * Returns an array of { name, signature, body, startLine, endLine } for each
 * function found.  Supports JS/TS, Python, Go, and Rust.
 *
 * @param {string} code
 * @param {string} [language='javascript']
 * @returns {Array<{ name: string, signature: string, body: string, startLine: number, endLine: number }>}
 */
function extractFunctions(code, language) {
  const lang = (language || 'javascript').toLowerCase();
  switch (lang) {
    case 'javascript':
    case 'js':
    case 'typescript':
    case 'ts':
    case 'jsx':
    case 'tsx':
      return extractJSFunctions(code);
    case 'python':
    case 'py':
      return extractPythonFunctions(code);
    case 'go':
    case 'golang':
      return extractGoFunctions(code);
    case 'rust':
    case 'rs':
      return extractRustFunctions(code);
    default:
      return extractJSFunctions(code);
  }
}

/**
 * Extract JS/TS functions.
 *
 * Patterns matched:
 *   function name(...)
 *   async function name(...)
 *   const/let/var name = (...) =>
 *   const/let/var name = async (...) =>
 *   const/let/var name = function(...)
 *   name(...) { ... }                (method shorthand in objects/classes)
 */
function extractJSFunctions(code) {
  const lines = code.split('\n');
  const results = [];

  // Regex patterns for different function styles
  const patterns = [
    // function declarations: [async] function name(params)
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/,
    // arrow / function expression: const name = [async] (...) => or function(
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(([^)]*)\)\s*=>|function\s*\(([^)]*)\))/,
    // method definition in class/object: [async] name(params) {
    /^\s+(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*\{/,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (!match) continue;

      const name = match[1];
      // Skip language keywords that look like function calls
      if (/^(if|else|for|while|switch|catch|return|class|new|throw|typeof|delete|void)$/.test(name)) continue;

      const params = match[2] || match[3] || '';
      const signature = `${name}(${params.trim()})`;

      // Find the body by brace matching from this line forward
      const { body, endLine } = extractBraceBody(lines, i);

      results.push({
        name,
        signature,
        body,
        startLine: i + 1,
        endLine: endLine + 1,
      });
      break; // Only match one pattern per line
    }
  }

  return results;
}

/**
 * Extract body enclosed in braces, starting from the line where the function
 * signature was found. Handles nested braces correctly.
 */
function extractBraceBody(lines, startIdx) {
  let depth = 0;
  let foundOpen = false;
  const bodyLines = [];

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    bodyLines.push(line);

    for (const ch of line) {
      if (ch === '{') { depth++; foundOpen = true; }
      else if (ch === '}') { depth--; }
    }

    // For arrow functions without braces, body is just the one line
    if (i === startIdx && !foundOpen && /=>\s*[^{]/.test(line)) {
      return { body: line.trim(), endLine: i };
    }

    if (foundOpen && depth === 0) {
      return { body: bodyLines.join('\n'), endLine: i };
    }
  }

  // Never found balanced close — return what we have
  return { body: bodyLines.join('\n'), endLine: lines.length - 1 };
}

/**
 * Extract Python functions (def name(params):).
 * Body is determined by indentation.
 */
function extractPythonFunctions(code) {
  const lines = code.split('\n');
  const results = [];
  const defRegex = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(defRegex);
    if (!match) continue;

    const baseIndent = match[1].length;
    const name = match[2];
    const params = match[3];
    const signature = `${name}(${params.trim()})`;

    // Collect body lines — everything indented deeper than the def
    const bodyLines = [lines[i]];
    let endLine = i;
    for (let j = i + 1; j < lines.length; j++) {
      const ln = lines[j];
      // Empty lines or lines indented deeper belong to the body
      if (ln.trim() === '' || getIndent(ln) > baseIndent) {
        bodyLines.push(ln);
        endLine = j;
      } else {
        break;
      }
    }

    // Trim trailing empty lines from body
    while (bodyLines.length > 1 && bodyLines[bodyLines.length - 1].trim() === '') {
      bodyLines.pop();
      endLine--;
    }

    results.push({
      name,
      signature,
      body: bodyLines.join('\n'),
      startLine: i + 1,
      endLine: endLine + 1,
    });
  }

  return results;
}

function getIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

/**
 * Extract Go functions.
 *
 * Patterns:
 *   func name(params) [returnType] {
 *   func (receiver) name(params) [returnType] {
 */
function extractGoFunctions(code) {
  const lines = code.split('\n');
  const results = [];
  const funcRegex = /^func\s+(?:\(\s*\w+\s+[^)]*\)\s+)?(\w+)\s*\(([^)]*)\)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(funcRegex);
    if (!match) continue;

    const name = match[1];
    const params = match[2];
    const signature = `${name}(${params.trim()})`;
    const { body, endLine } = extractBraceBody(lines, i);

    results.push({
      name,
      signature,
      body,
      startLine: i + 1,
      endLine: endLine + 1,
    });
  }

  return results;
}

/**
 * Extract Rust functions.
 *
 * Pattern: [pub] [async] fn name(params) [-> ReturnType] {
 */
function extractRustFunctions(code) {
  const lines = code.split('\n');
  const results = [];
  const fnRegex = /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(fnRegex);
    if (!match) continue;

    const name = match[1];
    const params = match[2];
    const signature = `${name}(${params.trim()})`;
    const { body, endLine } = extractBraceBody(lines, i);

    results.push({
      name,
      signature,
      body,
      startLine: i + 1,
      endLine: endLine + 1,
    });
  }

  return results;
}

// ─── LCS-Based Line Diff ────────────────────────────────────────────────────

/**
 * Build the Longest Common Subsequence of two arrays.
 * Same approach used in oracle.js — classic DP.
 */
function buildLCS(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

/**
 * Produce a line-by-line diff using LCS.
 *
 * @param {string[]} linesA
 * @param {string[]} linesB
 * @returns {Array<{ type: 'added'|'removed'|'same', line: string }>}
 */
function lineDiff(linesA, linesB) {
  const lcs = buildLCS(linesA, linesB);
  const diff = [];
  let i = 0, j = 0, k = 0;

  while (k < lcs.length) {
    while (i < linesA.length && linesA[i] !== lcs[k]) {
      diff.push({ type: 'removed', line: linesA[i] });
      i++;
    }
    while (j < linesB.length && linesB[j] !== lcs[k]) {
      diff.push({ type: 'added', line: linesB[j] });
      j++;
    }
    diff.push({ type: 'same', line: lcs[k] });
    i++;
    j++;
    k++;
  }
  while (i < linesA.length) { diff.push({ type: 'removed', line: linesA[i++] }); }
  while (j < linesB.length) { diff.push({ type: 'added', line: linesB[j++] }); }

  return diff;
}

// ─── Similarity ─────────────────────────────────────────────────────────────

/**
 * Tokenize code into normalized tokens for similarity comparison.
 * Splits on whitespace and punctuation, lowercases.
 */
function normalizeTokens(code) {
  return code
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Jaccard similarity between two token sets.
 * |intersection| / |union|
 *
 * @param {string} codeA
 * @param {string} codeB
 * @returns {number} 0.0 - 1.0
 */
function jaccardSimilarity(codeA, codeB) {
  const tokensA = new Set(normalizeTokens(codeA));
  const tokensB = new Set(normalizeTokens(codeB));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ─── Change Classification ──────────────────────────────────────────────────

/**
 * Classify the magnitude of a change based on similarity score.
 *
 * - 'cosmetic': only whitespace/formatting changes (similarity > 0.95)
 * - 'minor':    small changes within functions  (0.7 - 0.95)
 * - 'major':    function additions/removals/sig  (0.3 - 0.7)
 * - 'rewrite':  fundamentally different code     (< 0.3)
 *
 * @param {number} similarity
 * @returns {'cosmetic'|'minor'|'major'|'rewrite'}
 */
function classifyChange(similarity) {
  if (similarity > 0.95) return 'cosmetic';
  if (similarity >= 0.7) return 'minor';
  if (similarity >= 0.3) return 'major';
  return 'rewrite';
}

// ─── Import Extraction ──────────────────────────────────────────────────────

/**
 * Extract import/require lines from code for structural diff.
 */
function extractImports(code, language) {
  const lang = (language || 'javascript').toLowerCase();
  const imports = [];
  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    switch (lang) {
      case 'javascript':
      case 'js':
      case 'typescript':
      case 'ts':
      case 'jsx':
      case 'tsx':
        if (/^(?:import\s|const\s+\w+\s*=\s*require\()/.test(trimmed) ||
            /^(?:let|var)\s+\w+\s*=\s*require\(/.test(trimmed)) {
          imports.push(trimmed);
        }
        break;
      case 'python':
      case 'py':
        if (/^(?:import\s|from\s)/.test(trimmed)) {
          imports.push(trimmed);
        }
        break;
      case 'go':
      case 'golang':
        if (/^import\s/.test(trimmed) || /^"/.test(trimmed)) {
          imports.push(trimmed);
        }
        break;
      case 'rust':
      case 'rs':
        if (/^use\s/.test(trimmed) || /^extern\s+crate\s/.test(trimmed)) {
          imports.push(trimmed);
        }
        break;
      default:
        if (/^(?:import|require|use|include|from)\b/.test(trimmed)) {
          imports.push(trimmed);
        }
    }
  }

  return imports;
}

// ─── Semantic Diff ──────────────────────────────────────────────────────────

/**
 * Perform a semantic diff between two code strings.
 *
 * Goes beyond raw line diffs to understand:
 * - Which functions were added, removed, modified, or unchanged
 * - Whether modifications were to signatures or bodies
 * - Import changes
 * - Overall similarity and change magnitude classification
 *
 * @param {string} codeA - Old version
 * @param {string} codeB - New version
 * @param {string} [language='javascript']
 * @returns {object} Semantic diff result (see module docs for shape)
 */
function semanticDiff(codeA, codeB, language) {
  const lang = (language || 'javascript').toLowerCase();

  // 1. Extract functions from both versions
  const funcsA = extractFunctions(codeA, lang);
  const funcsB = extractFunctions(codeB, lang);

  const funcMapA = new Map(funcsA.map(f => [f.name, f]));
  const funcMapB = new Map(funcsB.map(f => [f.name, f]));

  const allNames = new Set([...funcMapA.keys(), ...funcMapB.keys()]);

  // 2. Classify each function
  const functions = [];
  const structuralChanges = [];
  let added = 0, removed = 0, modified = 0, unchanged = 0;

  for (const name of allNames) {
    const fA = funcMapA.get(name);
    const fB = funcMapB.get(name);

    if (!fA && fB) {
      // Function added
      added++;
      functions.push({
        name,
        change: 'added',
        newSignature: fB.signature,
        bodyChanged: true,
      });
      structuralChanges.push({
        type: 'function-added',
        detail: `Function '${name}' added with signature ${fB.signature}`,
      });
    } else if (fA && !fB) {
      // Function removed
      removed++;
      functions.push({
        name,
        change: 'removed',
        oldSignature: fA.signature,
        bodyChanged: true,
      });
      structuralChanges.push({
        type: 'function-removed',
        detail: `Function '${name}' removed (was ${fA.signature})`,
      });
    } else if (fA && fB) {
      // Both exist — check for changes
      const sigChanged = fA.signature !== fB.signature;
      const bodyNormA = fA.body.replace(/\s+/g, ' ').trim();
      const bodyNormB = fB.body.replace(/\s+/g, ' ').trim();
      const bodyChanged = bodyNormA !== bodyNormB;

      if (!sigChanged && !bodyChanged) {
        unchanged++;
        functions.push({
          name,
          change: 'unchanged',
          oldSignature: fA.signature,
          newSignature: fB.signature,
          bodyChanged: false,
        });
      } else {
        modified++;
        functions.push({
          name,
          change: 'modified',
          oldSignature: fA.signature,
          newSignature: fB.signature,
          bodyChanged,
        });
        if (sigChanged) {
          structuralChanges.push({
            type: 'signature-changed',
            detail: `'${name}' signature changed: ${fA.signature} -> ${fB.signature}`,
          });
        }
        if (bodyChanged) {
          structuralChanges.push({
            type: 'body-changed',
            detail: `'${name}' body modified`,
          });
        }
      }
    }
  }

  // 3. Detect import changes
  const importsA = extractImports(codeA, lang);
  const importsB = extractImports(codeB, lang);
  const importsSetA = new Set(importsA);
  const importsSetB = new Set(importsB);

  for (const imp of importsB) {
    if (!importsSetA.has(imp)) {
      structuralChanges.push({
        type: 'import-added',
        detail: imp,
      });
    }
  }
  for (const imp of importsA) {
    if (!importsSetB.has(imp)) {
      structuralChanges.push({
        type: 'import-removed',
        detail: imp,
      });
    }
  }

  // 4. LCS-based line diff
  const linesA = codeA.split('\n');
  const linesB = codeB.split('\n');
  const ld = lineDiff(linesA, linesB);

  // 5. Similarity
  const similarity = Math.round(jaccardSimilarity(codeA, codeB) * 1000) / 1000;

  // 6. Change classification
  const changeType = classifyChange(similarity);

  return {
    summary: { added, removed, modified, unchanged },
    functions,
    structuralChanges,
    lineDiff: ld,
    similarity,
    changeType,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  VersionManager,
  semanticDiff,
  extractFunctions,
};
