/**
 * Oracle Patterns — Diff, import, and export.
 */

function buildLCS(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift(a[i - 1]); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) i--;
    else j--;
  }
  return result;
}

module.exports = {
  diff(idA, idB) {
    const a = this.patterns.getAll().find(p => p.id === idA) || this.store.get(idA);
    const b = this.patterns.getAll().find(p => p.id === idB) || this.store.get(idB);
    if (!a) return { error: `Entry ${idA} not found` };
    if (!b) return { error: `Entry ${idB} not found` };

    const linesA = a.code.split('\n');
    const linesB = b.code.split('\n');
    const diffLines = [];
    const lcs = buildLCS(linesA, linesB);
    let i = 0, j = 0, k = 0;
    while (k < lcs.length) {
      while (i < linesA.length && linesA[i] !== lcs[k]) { diffLines.push({ type: 'removed', line: linesA[i] }); i++; }
      while (j < linesB.length && linesB[j] !== lcs[k]) { diffLines.push({ type: 'added', line: linesB[j] }); j++; }
      diffLines.push({ type: 'same', line: lcs[k] });
      i++; j++; k++;
    }
    while (i < linesA.length) { diffLines.push({ type: 'removed', line: linesA[i++] }); }
    while (j < linesB.length) { diffLines.push({ type: 'added', line: linesB[j++] }); }

    return {
      a: { id: idA, name: a.name || a.description || idA, language: a.language, coherency: a.coherencyScore?.total ?? '?' },
      b: { id: idB, name: b.name || b.description || idB, language: b.language, coherency: b.coherencyScore?.total ?? '?' },
      diff: diffLines,
      stats: { added: diffLines.filter(d => d.type === 'added').length, removed: diffLines.filter(d => d.type === 'removed').length, same: diffLines.filter(d => d.type === 'same').length },
    };
  },

  export(options = {}) {
    const { format = 'json', limit = 20, minCoherency = 0.5, language, tags } = options;
    let patterns = this.patterns.getAll({ language, minCoherency });
    if (tags && tags.length > 0) {
      const filterTags = new Set(tags.map(t => t.toLowerCase()));
      patterns = patterns.filter(p => p.tags.some(t => filterTags.has(t.toLowerCase())));
    }
    patterns = patterns.sort((a, b) => (b.coherencyScore?.total ?? 0) - (a.coherencyScore?.total ?? 0)).slice(0, limit);
    if (format === 'markdown' || format === 'md') return this._exportMarkdown(patterns);
    return this._exportJSON(patterns);
  },

  _exportJSON(patterns) {
    return JSON.stringify({
      exported: new Date().toISOString(), count: patterns.length,
      patterns: patterns.map(p => ({
        id: p.id, name: p.name, code: p.code, testCode: p.testCode || undefined,
        language: p.language, description: p.description, tags: p.tags,
        patternType: p.patternType, complexity: p.complexity, coherency: p.coherencyScore?.total,
      })),
    }, null, 2);
  },

  _exportMarkdown(patterns) {
    const lines = ['# Remembrance Oracle — Exported Patterns', '', `Exported: ${new Date().toISOString()} | ${patterns.length} patterns`, ''];
    for (const p of patterns) {
      lines.push(`## ${p.name} (${p.coherencyScore?.total ?? '?'})`);
      lines.push(`**${p.language}** | ${p.patternType} | ${p.complexity} | ${(p.tags || []).join(', ')}`);
      lines.push(`> ${p.description}`);
      lines.push('```' + (p.language || '') + '\n' + p.code + '\n```');
      lines.push('');
    }
    return lines.join('\n');
  },

  import(data, options = {}) {
    const { skipValidation = false, dryRun = false, author = 'oracle-import' } = options;
    const { safeJsonParse } = require('../core/covenant');
    const parsed = typeof data === 'string' ? safeJsonParse(data, {}) : data;
    const patterns = parsed.patterns || [];

    const results = [];
    let imported = 0, skipped = 0;
    const errors = [];

    for (const p of patterns) {
      if (!p.code || !p.name) { errors.push(`Skipped pattern without code or name: ${p.name || '(unnamed)'}`); skipped++; continue; }
      const existing = this.patterns.getAll().find(ep => ep.name === p.name && ep.language === p.language);
      if (existing) { results.push({ name: p.name, status: 'duplicate', id: existing.id }); skipped++; continue; }
      if (dryRun) { results.push({ name: p.name, status: 'would_import', language: p.language }); imported++; continue; }

      const regResult = this.registerPattern({
        name: p.name, code: p.code, language: p.language || 'javascript',
        description: p.description || p.name, tags: [...(p.tags || []), 'imported'],
        patternType: p.patternType || 'utility', complexity: p.complexity || 'moderate',
        author, testCode: p.testCode,
      });

      if (regResult.registered) { results.push({ name: p.name, status: 'imported', id: regResult.pattern.id }); imported++; }
      else { results.push({ name: p.name, status: 'rejected', reason: regResult.reason }); errors.push(`${p.name}: ${regResult.reason}`); skipped++; }
    }

    this._emit({ type: 'import_complete', imported, skipped });
    return { imported, skipped, errors, results };
  },
};
