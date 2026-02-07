/**
 * IDE Integration — Editor Bridge
 *
 * Provides LSP-style features for any IDE that integrates with the Oracle:
 *
 *   1. DIAGNOSTICS:  Scan code for patterns, flag low-coherency, suggest upgrades
 *   2. HOVER:        Show pattern info on hover (coherency, usage, alternatives)
 *   3. CODE ACTIONS: Quick-fix suggestions from the debug oracle + pattern library
 *   4. COMPLETIONS:  Context-aware pattern suggestions as you type
 *   5. DEFINITIONS:  Jump to pattern source in the oracle store
 *   6. REFERENCES:   Find where patterns are used across projects
 *
 * This is NOT a full LSP server — it's the intelligence layer that any
 * LSP server, VS Code extension, or editor plugin can call.
 */

const { RemembranceOracle } = require('../api/oracle');

// ─── Diagnostic Severity ───

const SEVERITY = {
  error: 1,
  warning: 2,
  info: 3,
  hint: 4,
};

// ─── IDE Bridge ───

class IDEBridge {
  /**
   * @param {object} options
   *   - oracle: RemembranceOracle instance (created if not given)
   *   - minCoherency: threshold for upgrade suggestions (default 0.7)
   *   - maxDiagnostics: max diagnostics per file (default 20)
   *   - enableDebug: use debug oracle for error fixes (default true)
   */
  constructor(options = {}) {
    this.oracle = options.oracle || new RemembranceOracle({ autoSeed: false });
    this.minCoherency = options.minCoherency || 0.7;
    this.maxDiagnostics = options.maxDiagnostics || 20;
    this.enableDebug = options.enableDebug !== false;
  }

  // ─── Diagnostics ───

  /**
   * Analyze code and return LSP-style diagnostics.
   * Checks: covenant violations, coherency, known debug patterns.
   *
   * @param {object} params
   *   - code: The source code to analyze
   *   - language: Programming language
   *   - uri: File URI (for reference)
   * @returns {Array} Array of diagnostic objects
   */
  getDiagnostics(params) {
    const { code, language = 'javascript', uri = '' } = params;
    if (!code) return [];

    const diagnostics = [];

    // 1. Covenant check
    try {
      const { covenantCheck } = require('../core/covenant');
      const covenant = covenantCheck(code, { language });
      if (!covenant.sealed) {
        for (const v of covenant.violations) {
          const line = this._findViolationLine(code, v);
          diagnostics.push({
            severity: SEVERITY.error,
            range: { start: { line, character: 0 }, end: { line, character: 999 } },
            message: `Covenant: [${v.name}] ${v.reason}`,
            source: 'oracle-covenant',
            code: `covenant-${v.principle}`,
          });
        }
      }
    } catch {}

    // 2. Coherency check
    try {
      const { computeCoherencyScore } = require('../core/coherency');
      const score = computeCoherencyScore(code, { language });
      if (score.total < 0.5) {
        diagnostics.push({
          severity: SEVERITY.warning,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 999 } },
          message: `Low coherency: ${score.total.toFixed(3)} — code may need refactoring`,
          source: 'oracle-coherency',
          code: 'low-coherency',
          data: { score },
        });
      }

      // Per-dimension warnings
      const breakdown = score.breakdown || {};
      for (const [dim, val] of Object.entries(breakdown)) {
        if (val < 0.4) {
          diagnostics.push({
            severity: SEVERITY.hint,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 999 } },
            message: `${dim}: ${val.toFixed(2)} — below threshold`,
            source: 'oracle-coherency',
            code: `dim-${dim}`,
          });
        }
      }
    } catch {}

    // 3. Pattern match suggestions — does oracle have a better version?
    try {
      const functions = this._extractFunctionNames(code);
      for (const fn of functions.slice(0, 5)) {
        const results = this.oracle.search(fn, { limit: 1, language });
        if (results.length > 0 && results[0].coherency > this.minCoherency) {
          const match = results[0];
          if (match.name !== fn) continue; // Only exact name matches
          diagnostics.push({
            severity: SEVERITY.info,
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 999 } },
            message: `Oracle has proven pattern "${match.name}" (coherency: ${match.coherency.toFixed(3)})`,
            source: 'oracle-pattern',
            code: 'pattern-available',
            data: { patternId: match.id, name: match.name, coherency: match.coherency },
          });
        }
      }
    } catch {}

    return diagnostics.slice(0, this.maxDiagnostics);
  }

  // ─── Hover Info ───

  /**
   * Get hover information for a symbol/function name.
   *
   * @param {object} params
   *   - symbol: The function/variable name being hovered
   *   - language: Programming language
   * @returns {object|null} Hover info with markdown content
   */
  getHoverInfo(params) {
    const { symbol, language } = params;
    if (!symbol || symbol.length < 2) return null;

    // Search for matching patterns
    const results = this.oracle.search(symbol, { limit: 3, language });
    const exactMatch = results.find(r => r.name === symbol);

    if (!exactMatch) return null;

    const lines = [
      `**${exactMatch.name}** (${exactMatch.language})`,
      '',
      `Coherency: **${(exactMatch.coherency || 0).toFixed(3)}** | Source: ${exactMatch.source}`,
    ];

    if (exactMatch.tags?.length > 0) {
      lines.push(`Tags: ${exactMatch.tags.join(', ')}`);
    }

    lines.push('', '```' + (exactMatch.language || ''), exactMatch.code || '', '```');

    // Alternatives
    const alts = results.filter(r => r.id !== exactMatch.id);
    if (alts.length > 0) {
      lines.push('', '---', `**Alternatives:** ${alts.map(a => `${a.name} (${(a.coherency || 0).toFixed(2)})`).join(', ')}`);
    }

    return {
      contents: { kind: 'markdown', value: lines.join('\n') },
      patternId: exactMatch.id,
    };
  }

  // ─── Code Actions ───

  /**
   * Get available code actions for a given context.
   * Includes: debug fixes, pattern replacements, SERF refinement.
   *
   * @param {object} params
   *   - code: The source code
   *   - language: Programming language
   *   - errorMessage: Optional error message for debug fix lookup
   *   - range: Optional line range { start, end }
   * @returns {Array} Available code actions
   */
  getCodeActions(params) {
    const { code, language = 'javascript', errorMessage, range } = params;
    const actions = [];

    // 1. Debug oracle: find fixes for error messages
    if (errorMessage && this.enableDebug) {
      try {
        const fixes = this.oracle.debugSearch({
          errorMessage,
          language,
          limit: 3,
          federated: true,
        });

        for (const fix of fixes) {
          actions.push({
            title: `Fix: ${fix.fixDescription || fix.errorClass} (confidence: ${fix.confidence.toFixed(2)})`,
            kind: 'quickfix',
            source: 'oracle-debug',
            debugPatternId: fix.id,
            fixCode: fix.fixCode,
            confidence: fix.confidence,
            matchType: fix.matchType,
          });
        }
      } catch {}
    }

    // 2. Pattern upgrades: suggest proven replacements
    if (code) {
      try {
        const functions = this._extractFunctionNames(code);
        for (const fn of functions.slice(0, 3)) {
          const results = this.oracle.search(fn, { limit: 1, language });
          if (results.length > 0 && results[0].name === fn && results[0].coherency > this.minCoherency) {
            actions.push({
              title: `Replace with proven "${results[0].name}" (coherency: ${results[0].coherency.toFixed(3)})`,
              kind: 'refactor.rewrite',
              source: 'oracle-pattern',
              patternId: results[0].id,
              code: results[0].code,
            });
          }
        }
      } catch {}
    }

    // 3. SERF refinement: offer to heal low-coherency code
    if (code) {
      try {
        const { computeCoherencyScore } = require('../core/coherency');
        const score = computeCoherencyScore(code, { language });
        if (score.total < 0.7 && score.total > 0.3) {
          actions.push({
            title: `SERF Refine: improve coherency from ${score.total.toFixed(3)}`,
            kind: 'refactor.rewrite',
            source: 'oracle-serf',
            currentCoherency: score.total,
          });
        }
      } catch {}
    }

    // 4. Covenant fix: if code violates covenant, suggest removal of violations
    if (code) {
      try {
        const { covenantCheck } = require('../core/covenant');
        const result = covenantCheck(code, { language });
        if (!result.sealed) {
          for (const v of result.violations.slice(0, 3)) {
            actions.push({
              title: `Fix covenant violation: ${v.name}`,
              kind: 'quickfix',
              source: 'oracle-covenant',
              violation: v,
            });
          }
        }
      } catch {}
    }

    return actions;
  }

  // ─── Completions ───

  /**
   * Get context-aware pattern completions.
   *
   * @param {object} params
   *   - prefix: What the user has typed so far
   *   - language: Programming language
   *   - context: Optional surrounding code context
   *   - limit: Max results (default 10)
   * @returns {Array} Completion items
   */
  getCompletions(params) {
    const { prefix, language, context = '', limit = 10 } = params;
    if (!prefix || prefix.length < 2) return [];

    // Search patterns matching the prefix
    const results = this.oracle.search(prefix, { limit, language });

    return results.map(r => ({
      label: r.name || r.id,
      kind: 'function',
      detail: `(coherency: ${(r.coherency || 0).toFixed(3)}) ${r.tags?.join(', ') || ''}`,
      documentation: {
        kind: 'markdown',
        value: `**${r.name || 'untitled'}** — ${r.language}\n\n\`\`\`${r.language}\n${(r.code || '').slice(0, 300)}\n\`\`\``,
      },
      insertText: r.code || '',
      sortText: String(1 - (r.coherency || 0)), // Higher coherency = earlier sort
      patternId: r.id,
      source: r.source,
    }));
  }

  // ─── Go-to-Definition ───

  /**
   * Find the oracle pattern definition for a symbol.
   *
   * @param {object} params
   *   - symbol: Function/pattern name
   *   - language: Programming language
   * @returns {object|null} Location of the pattern definition
   */
  getDefinition(params) {
    const { symbol, language } = params;
    if (!symbol) return null;

    const results = this.oracle.search(symbol, { limit: 1, language });
    const match = results.find(r => r.name === symbol);
    if (!match) return null;

    return {
      patternId: match.id,
      name: match.name,
      language: match.language,
      source: match.source,
      coherency: match.coherency,
      code: match.code,
      tags: match.tags,
    };
  }

  // ─── Find References ───

  /**
   * Find all patterns that reference or relate to a symbol.
   *
   * @param {object} params
   *   - symbol: Function/pattern name
   *   - language: Optional language filter
   *   - includeVariants: Include transpiled variants (default true)
   * @returns {Array} Related patterns
   */
  findReferences(params) {
    const { symbol, language, includeVariants = true } = params;
    if (!symbol) return [];

    const results = this.oracle.search(symbol, { limit: 20, language: includeVariants ? undefined : language });

    return results
      .filter(r => {
        // Include exact name matches and patterns whose code references the symbol
        const nameMatch = r.name === symbol;
        const codeRef = r.code?.includes(symbol);
        return nameMatch || codeRef;
      })
      .map(r => ({
        patternId: r.id,
        name: r.name,
        language: r.language,
        source: r.source,
        coherency: r.coherency,
        matchType: r.name === symbol ? 'definition' : 'reference',
      }));
  }

  // ─── Batch Operations ───

  /**
   * Analyze an entire file: diagnostics + suggestions + stats.
   * Single call for editors that want everything at once.
   *
   * @param {object} params
   *   - code: Full file source
   *   - language: Language
   *   - uri: File URI
   * @returns {object} Full analysis report
   */
  analyzeFile(params) {
    const { code, language = 'javascript', uri = '' } = params;

    const diagnostics = this.getDiagnostics({ code, language, uri });

    // Coherency score
    let coherency = null;
    try {
      const { computeCoherencyScore } = require('../core/coherency');
      coherency = computeCoherencyScore(code, { language });
    } catch {}

    // Function count
    const functions = this._extractFunctionNames(code);

    // Pattern matches
    const patternMatches = [];
    for (const fn of functions.slice(0, 10)) {
      const results = this.oracle.search(fn, { limit: 1, language });
      if (results.length > 0 && results[0].name === fn) {
        patternMatches.push({
          function: fn,
          patternId: results[0].id,
          coherency: results[0].coherency,
        });
      }
    }

    return {
      uri,
      language,
      diagnostics,
      coherency: coherency ? {
        total: coherency.total,
        breakdown: coherency.breakdown,
      } : null,
      functions: functions.length,
      patternMatches,
      summary: {
        errors: diagnostics.filter(d => d.severity === SEVERITY.error).length,
        warnings: diagnostics.filter(d => d.severity === SEVERITY.warning).length,
        hints: diagnostics.filter(d => d.severity === SEVERITY.hint).length,
        info: diagnostics.filter(d => d.severity === SEVERITY.info).length,
      },
    };
  }

  // ─── Execute Code Action ───

  /**
   * Execute a code action returned by getCodeActions().
   *
   * @param {object} action - The action object to execute
   * @param {object} params - Additional params (code, language)
   * @returns {object} Result with new code or error
   */
  executeAction(action, params = {}) {
    const { code, language = 'javascript' } = params;

    if (action.source === 'oracle-debug' && action.fixCode) {
      // Report feedback to debug oracle
      if (action.debugPatternId) {
        this.oracle.debugFeedback(action.debugPatternId, true);
      }
      return { applied: true, code: action.fixCode, source: 'debug-oracle' };
    }

    if (action.source === 'oracle-pattern' && action.code) {
      // Report feedback
      if (action.patternId) {
        this.oracle.feedback(action.patternId, true);
      }
      return { applied: true, code: action.code, source: 'pattern-library' };
    }

    if (action.source === 'oracle-serf' && code) {
      try {
        const { reflectionLoop } = require('../core/reflection');
        const result = reflectionLoop(code, {
          language,
          maxLoops: 3,
          targetCoherence: 0.9,
        });
        return {
          applied: true,
          code: result.code,
          source: 'serf-reflection',
          improvement: result.serf?.improvement,
          finalCoherency: result.fullCoherency,
        };
      } catch (err) {
        return { applied: false, error: err.message };
      }
    }

    return { applied: false, error: 'Unknown action type' };
  }

  // ─── Helpers ───

  _extractFunctionNames(code) {
    const names = [];
    const patterns = [
      /function\s+(\w+)\s*\(/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\()/g,
      /(\w+)\s*:\s*function/g,
      /def\s+(\w+)\s*\(/g,
      /func\s+(\w+)\s*\(/g,
      /fn\s+(\w+)\s*\(/g,
    ];
    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(code)) !== null) {
        if (m[1] && m[1].length > 1) names.push(m[1]);
      }
    }
    return [...new Set(names)];
  }

  _findViolationLine(code, violation) {
    // Try to find the line where the violation pattern appears
    const lines = code.split('\n');
    const reason = violation.reason || '';
    for (let i = 0; i < lines.length; i++) {
      // Check for common violation patterns
      if (reason.includes('eval') && lines[i].includes('eval(')) return i;
      if (reason.includes('exec') && lines[i].includes('exec(')) return i;
      if (reason.includes('injection') && /\+\s*['"]/.test(lines[i])) return i;
      if (reason.includes('password') && /password/i.test(lines[i])) return i;
    }
    return 0;
  }
}

module.exports = { IDEBridge, SEVERITY };
