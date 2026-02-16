/**
 * Oracle Patterns — candidates, versioning, security, voting, import/export.
 * Pattern lifecycle management beyond core submit/query operations.
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
  retag(id, options = {}) {
    const { retagPattern, tagDiff } = require('../core/auto-tagger');
    const pattern = this.patterns.getAll().find(p => p.id === id);
    if (!pattern) return { success: false, error: `Pattern ${id} not found` };

    const oldTags = [...(pattern.tags || [])];
    const newTags = retagPattern(pattern);
    const diff = tagDiff(oldTags, newTags);

    if (!options.dryRun && diff.added.length > 0) {
      this.patterns.update(id, { tags: newTags });
    }

    return {
      success: true,
      id: pattern.id,
      name: pattern.name,
      oldTags,
      newTags,
      added: diff.added,
      updated: !options.dryRun && diff.added.length > 0,
    };
  },

  retagAll(options = {}) {
    const { dryRun = false, minAdded = 0 } = options;
    const { retagPattern, tagDiff } = require('../core/auto-tagger');
    const all = this.patterns.getAll();

    let enriched = 0;
    let totalTagsAdded = 0;
    const results = [];

    for (const pattern of all) {
      const oldTags = [...(pattern.tags || [])];
      const newTags = retagPattern(pattern);
      const diff = tagDiff(oldTags, newTags);

      if (diff.added.length > minAdded) {
        if (!dryRun) {
          this.patterns.update(pattern.id, { tags: newTags });
        }
        enriched++;
        totalTagsAdded += diff.added.length;
        results.push({
          id: pattern.id,
          name: pattern.name,
          added: diff.added,
          total: newTags.length,
        });
      }
    }

    return {
      success: true,
      total: all.length,
      enriched,
      totalTagsAdded,
      dryRun,
      patterns: results.slice(0, 50), // Cap output at 50 patterns
    };
  },

  deepClean(options = {}) {
    const {
      minCodeLength = 35,
      minNameLength = 3,
      removeDuplicates = true,
      removeStubs = true,
      dryRun = false,
    } = options;

    const all = this.patterns.getAll();
    const toRemove = new Map(); // id → reason

    // 1. Find exact duplicates (keep highest coherency version)
    if (removeDuplicates) {
      const byCode = new Map();
      for (const p of all) {
        const key = (p.code || '').trim();
        if (!key) continue;
        if (!byCode.has(key)) {
          byCode.set(key, []);
        }
        byCode.get(key).push(p);
      }
      for (const [, group] of byCode) {
        if (group.length <= 1) continue;
        // Sort by coherency desc, keep first
        group.sort((a, b) => (b.coherencyScore?.total ?? 0) - (a.coherencyScore?.total ?? 0));
        for (let i = 1; i < group.length; i++) {
          toRemove.set(group[i].id, 'duplicate');
        }
      }
    }

    // 2. Find trivial stubs (empty functions, test helpers, one-expression returns under 50 chars)
    if (removeStubs) {
      for (const p of all) {
        if (toRemove.has(p.id)) continue;
        const code = (p.code || '').trim();
        if (!code) continue;

        // Empty function bodies: function f() {} or function f() { /* comment */ }
        if (/^(?:function|const)\s+\w+[^{]*\{\s*(?:\/[/*][^}]*)?\}$/.test(code)) {
          toRemove.set(p.id, 'stub');
          continue;
        }

        // Only flag short code (<50 chars) as stubs
        if (code.length < 50) {
          // One-liner returns: function f() { return 1; } or function add(a,b) { return a + b; }
          const isOneLiner = /^(?:function|const)\s+\w+[^{]*\{[^{}]*\}$/.test(code);
          // Test helper names
          const isTestHelper = /^(?:function|const)\s+(?:def-?[Tt]est|hover-?[Tt]est|safeCode|broken|only|hidden|dry|dup|evTest|mcpTest|jsFunc|realFunction|testFunc)\b/.test(code);
          if (isOneLiner || isTestHelper) {
            toRemove.set(p.id, 'stub');
          }
        }
      }
    }

    // 3. Find too-short code from harvested patterns
    for (const p of all) {
      if (toRemove.has(p.id)) continue;
      const code = (p.code || '').trim();
      const name = (p.name || '');
      const tags = p.tags || [];
      const isHarvested = tags.includes('harvested');

      if (isHarvested && code.length < minCodeLength && name.length < minNameLength) {
        toRemove.set(p.id, 'too-short');
      }
    }

    // Execute deletions
    let duplicates = 0, stubs = 0, tooShort = 0;
    const details = [];
    for (const [id, reason] of toRemove) {
      const p = all.find(x => x.id === id);
      details.push({ id, name: p?.name, reason, code: (p?.code || '').slice(0, 60) });
      if (reason === 'duplicate') duplicates++;
      else if (reason === 'stub') stubs++;
      else tooShort++;

      if (!dryRun) {
        try {
          const db = this.patterns._sqlite?.db || this.store?.db;
          if (db) {
            db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
          }
        } catch { /* skip if store type doesn't support direct delete */ }
      }
    }

    const remaining = all.length - toRemove.size;
    this._emit({ type: 'deep_clean', removed: toRemove.size, duplicates, stubs, tooShort, remaining, dryRun });
    return { removed: toRemove.size, duplicates, stubs, tooShort, remaining, details };
  },

  recycle(options = {}) {
    return this.recycler.recycleFailed(options);
  },

  processSeeds(seeds, options = {}) {
    return this.recycler.processSeeds(seeds, options);
  },

  generateCandidates(options = {}) {
    return this.recycler.generateCandidates(options);
  },

  candidates(filters = {}) {
    return this.patterns.getCandidates(filters);
  },

  candidateStats() {
    return this.patterns.candidateSummary();
  },

  promote(candidateId, testCode) {
    return this.recycler.promoteWithProof(candidateId, testCode);
  },

  autoPromote() {
    return this.recycler.autoPromote();
  },

  smartAutoPromote(options = {}) {
    const {
      minCoherency = 0.9,
      minConfidence = 0.8,
      manualOverride = false,
      dryRun = false,
    } = options;

    const { covenantCheck } = require('../core/covenant');
    const { sandboxExecute } = require('../core/sandbox');

    const candidates = this.patterns.getCandidates();
    const provenPatterns = this.patterns.getAll();
    const report = { promoted: 0, skipped: 0, vetoed: 0, total: candidates.length, details: [] };

    for (const candidate of candidates) {
      // Step 1: Coherency gate
      const coherency = candidate.coherencyScore?.total ?? 0;
      if (coherency < minCoherency) {
        report.skipped++;
        report.details.push({ name: candidate.name, status: 'skipped', reason: `coherency ${coherency.toFixed(3)} < ${minCoherency}` });
        continue;
      }

      // Step 2: Confidence gate (parent pattern reliability)
      if (!manualOverride && candidate.parentPattern) {
        const parent = provenPatterns.find(p => p.id === candidate.parentPattern || p.name === candidate.parentPattern);
        if (parent) {
          const parentReliability = parent.usageCount > 0 ? parent.successCount / parent.usageCount : 0.5;
          if (parentReliability < minConfidence) {
            report.skipped++;
            report.details.push({ name: candidate.name, status: 'skipped', reason: `parent reliability ${parentReliability.toFixed(3)} < ${minConfidence}` });
            continue;
          }
        }
      }

      // Step 3: Covenant check
      const covenant = covenantCheck(candidate.code);
      if (!covenant.passed) {
        report.vetoed++;
        report.details.push({ name: candidate.name, status: 'vetoed', reason: `covenant: ${covenant.violations?.[0]?.principle || 'failed'}` });
        continue;
      }

      // Step 4: Sandbox test execution (if test code available)
      if (candidate.testCode) {
        try {
          const testResult = sandboxExecute(candidate.code, candidate.testCode, { language: candidate.language });
          if (!testResult.passed) {
            report.vetoed++;
            report.details.push({ name: candidate.name, status: 'vetoed', reason: 'test execution failed' });
            continue;
          }
        } catch (_) {
          report.vetoed++;
          report.details.push({ name: candidate.name, status: 'vetoed', reason: 'sandbox error' });
          continue;
        }
      }

      if (dryRun) {
        report.promoted++;
        report.details.push({ name: candidate.name, status: 'would-promote', coherency: coherency.toFixed(3) });
        continue;
      }

      // Step 5: Register as proven pattern
      const result = this.registerPattern({
        name: candidate.name,
        code: candidate.code,
        language: candidate.language,
        description: candidate.description || candidate.name,
        tags: candidate.tags || [],
        testCode: candidate.testCode,
        author: candidate.author || 'smart-auto-promote',
      });

      if (result.registered) {
        this.patterns.promoteCandidate(candidate.id);
        report.promoted++;
        report.details.push({ name: candidate.name, status: 'promoted', coherency: coherency.toFixed(3) });
      } else {
        report.vetoed++;
        report.details.push({ name: candidate.name, status: 'vetoed', reason: result.reason || 'registration failed' });
      }
    }

    // Emit event for real-time dashboard updates
    this._emit({
      type: 'auto_promote',
      promoted: report.promoted,
      skipped: report.skipped,
      vetoed: report.vetoed,
      total: report.total,
    });

    return report;
  },

  synthesizeTests(options = {}) {
    const { synthesizeForCandidates } = require('../evolution/test-synth');
    const synthReport = synthesizeForCandidates(this, options);

    // If autoPromote requested, try promoting candidates with new tests
    let promoteReport = null;
    if (options.autoPromote !== false) {
      promoteReport = this.autoPromote();
    }

    return { synthesis: synthReport, promotion: promoteReport };
  },

  rollback(patternId, targetVersion) {
    const { VersionManager } = require('../core/versioning');
    const vm = new VersionManager(this.patterns._sqlite);

    const history = vm.getHistory(patternId);
    if (!history || history.length === 0) {
      return { success: false, reason: 'No version history found for this pattern' };
    }

    // If no target version specified, go to the previous one
    const latest = history[0].version;
    const target = targetVersion || (latest > 1 ? latest - 1 : latest);

    const snapshot = vm.getVersion(patternId, target);
    if (!snapshot) {
      return { success: false, reason: `Version ${target} not found` };
    }

    // Get the current pattern
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) {
      return { success: false, reason: 'Pattern not found' };
    }

    const previousCode = pattern.code;

    // Update the pattern's code to the restored version
    if (this.patterns._sqlite) {
      this.patterns._sqlite.updatePattern(patternId, { code: snapshot.code });
    }

    // Save a new version snapshot marking this as a rollback
    vm.saveSnapshot(patternId, snapshot.code, { action: 'rollback', restoredFrom: target });

    this._emit({
      type: 'rollback',
      patternId,
      patternName: pattern.name,
      restoredVersion: target,
      previousVersion: latest,
    });

    return {
      success: true,
      patternId,
      patternName: pattern.name,
      restoredVersion: target,
      previousVersion: latest,
      previousCode,
      restoredCode: snapshot.code,
    };
  },

  verifyOrRollback(patternId) {
    const { sandboxExecute } = require('../core/sandbox');

    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { passed: false, reason: 'Pattern not found' };
    if (!pattern.testCode) return { passed: true, reason: 'No test code — skipped' };

    try {
      const result = sandboxExecute(pattern.code, pattern.testCode, { language: pattern.language });
      if (result.passed) {
        // Track healing success
        this._trackHealingSuccess(patternId, true);
        return { passed: true, patternId, patternName: pattern.name };
      }
    } catch (_) {
      // Test failed — fall through to rollback
    }

    // Test failed — rollback to previous version
    this._trackHealingSuccess(patternId, false);
    const rollbackResult = this.rollback(patternId);
    return {
      passed: false,
      patternId,
      patternName: pattern.name,
      rolledBack: rollbackResult.success,
      restoredVersion: rollbackResult.restoredVersion,
    };
  },

  _trackHealingSuccess(patternId, succeeded) {
    if (!this._healingStats) this._healingStats = new Map();
    const stats = this._healingStats.get(patternId) || { attempts: 0, successes: 0 };
    stats.attempts++;
    if (succeeded) stats.successes++;
    this._healingStats.set(patternId, stats);
  },

  getHealingSuccessRate(patternId) {
    if (!this._healingStats) return 1.0;
    const stats = this._healingStats.get(patternId);
    if (!stats || stats.attempts === 0) return 1.0;
    return stats.successes / stats.attempts;
  },

  healingStats() {
    if (!this._healingStats) return { patterns: 0, totalAttempts: 0, totalSuccesses: 0, details: [] };
    const details = [];
    let totalAttempts = 0, totalSuccesses = 0;
    for (const [id, stats] of this._healingStats) {
      const pattern = this.patterns.getAll().find(p => p.id === id);
      details.push({
        id,
        name: pattern?.name || 'unknown',
        attempts: stats.attempts,
        successes: stats.successes,
        rate: stats.attempts > 0 ? (stats.successes / stats.attempts).toFixed(3) : 'N/A',
      });
      totalAttempts += stats.attempts;
      totalSuccesses += stats.successes;
    }
    return {
      patterns: this._healingStats.size,
      totalAttempts,
      totalSuccesses,
      overallRate: totalAttempts > 0 ? (totalSuccesses / totalAttempts).toFixed(3) : 'N/A',
      details,
    };
  },

  securityScan(codeOrPatternId, options = {}) {
    const { deepSecurityScan } = require('../core/covenant');

    let code, language, patternName;
    if (typeof codeOrPatternId === 'string' && codeOrPatternId.length < 32) {
      // Might be a pattern ID
      const pattern = this.patterns.getAll().find(p => p.id === codeOrPatternId || p.name === codeOrPatternId);
      if (pattern) {
        code = pattern.code;
        language = options.language || pattern.language;
        patternName = pattern.name;
      } else {
        code = codeOrPatternId;
        language = options.language || 'javascript';
      }
    } else {
      code = codeOrPatternId;
      language = options.language || 'javascript';
    }

    const result = deepSecurityScan(code, { language, runExternalTools: options.runExternalTools });

    if (result.veto && patternName) {
      this._emit({
        type: 'security_veto',
        patternName,
        tool: result.externalTools.length > 0 ? result.externalTools[0].tool : 'covenant',
        findings: result.totalFindings,
        whisper: result.whisper,
      });
    }

    return { ...result, patternName };
  },

  securityAudit(options = {}) {
    const { deepSecurityScan } = require('../core/covenant');
    const patterns = this.patterns.getAll();
    const report = { scanned: 0, clean: 0, advisory: 0, vetoed: 0, details: [] };

    for (const p of patterns) {
      const result = deepSecurityScan(p.code, { language: p.language, runExternalTools: options.runExternalTools });
      report.scanned++;
      if (result.veto) {
        report.vetoed++;
        report.details.push({ id: p.id, name: p.name, status: 'vetoed', findings: result.totalFindings, whisper: result.whisper });
      } else if (result.deepFindings.length > 0) {
        report.advisory++;
        report.details.push({ id: p.id, name: p.name, status: 'advisory', findings: result.deepFindings.length });
      } else {
        report.clean++;
      }
    }

    return report;
  },

  vote(patternId, voter, vote) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return { success: false, error: 'No SQLite store available' };
    const result = sqliteStore.votePattern(patternId, voter, vote);
    if (result.success) {
      this._emit({ type: 'vote', patternId, voter, vote, voteScore: result.voteScore });
    }
    return result;
  },

  getVotes(patternId) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return null;
    return sqliteStore.getVotes(patternId);
  },

  topVoted(limit = 20) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return [];
    return sqliteStore.topVoted(limit);
  },

  getVoterReputation(voterId) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return null;
    const voter = sqliteStore.getVoter(voterId);
    const history = sqliteStore.getVoterHistory(voterId, 10);
    return {
      ...voter,
      weight: sqliteStore.getVoteWeight(voterId),
      recentVotes: history,
    };
  },

  topVoters(limit = 20) {
    const sqliteStore = this.patterns._sqlite;
    if (!sqliteStore) return [];
    return sqliteStore.topVoters(limit);
  },

  getGitHubIdentity() {
    if (!this._githubIdentity) {
      const { GitHubIdentity } = require('../auth/github-oauth');
      const sqliteStore = this.patterns._sqlite;
      this._githubIdentity = new GitHubIdentity({ store: sqliteStore });
    }
    return this._githubIdentity;
  },

  async verifyGitHubToken(token) {
    return this.getGitHubIdentity().verifyToken(token);
  },

  async startGitHubLogin() {
    return this.getGitHubIdentity().startDeviceFlow();
  },

  async pollGitHubLogin(deviceCode) {
    return this.getGitHubIdentity().pollDeviceFlow(deviceCode);
  },

  getVerifiedIdentity(voterId) {
    return this.getGitHubIdentity().getIdentity(voterId);
  },

  listVerifiedIdentities(limit = 50) {
    return this.getGitHubIdentity().listIdentities(limit);
  },

  isVerifiedVoter(voterId) {
    return this.getGitHubIdentity().isVerified(voterId);
  },

  diff(idA, idB) {
    const a = this.patterns.getAll().find(p => p.id === idA) || this.store.get(idA);
    const b = this.patterns.getAll().find(p => p.id === idB) || this.store.get(idB);
    if (!a) return { error: `Entry ${idA} not found` };
    if (!b) return { error: `Entry ${idB} not found` };

    const linesA = a.code.split('\n');
    const linesB = b.code.split('\n');
    const diffLines = [];

    // Simple LCS-based diff
    const lcs = buildLCS(linesA, linesB);
    let i = 0, j = 0, k = 0;
    while (k < lcs.length) {
      while (i < linesA.length && linesA[i] !== lcs[k]) {
        diffLines.push({ type: 'removed', line: linesA[i] });
        i++;
      }
      while (j < linesB.length && linesB[j] !== lcs[k]) {
        diffLines.push({ type: 'added', line: linesB[j] });
        j++;
      }
      diffLines.push({ type: 'same', line: lcs[k] });
      i++; j++; k++;
    }
    while (i < linesA.length) { diffLines.push({ type: 'removed', line: linesA[i++] }); }
    while (j < linesB.length) { diffLines.push({ type: 'added', line: linesB[j++] }); }

    const nameA = a.name || a.description || idA;
    const nameB = b.name || b.description || idB;
    const coherencyA = a.coherencyScore?.total ?? '?';
    const coherencyB = b.coherencyScore?.total ?? '?';

    return {
      a: { id: idA, name: nameA, language: a.language, coherency: coherencyA },
      b: { id: idB, name: nameB, language: b.language, coherency: coherencyB },
      diff: diffLines,
      stats: {
        added: diffLines.filter(d => d.type === 'added').length,
        removed: diffLines.filter(d => d.type === 'removed').length,
        same: diffLines.filter(d => d.type === 'same').length,
      },
    };
  },

  export(options = {}) {
    const {
      format = 'json',
      limit = 20,
      minCoherency = 0.5,
      language,
      tags,
    } = options;

    let patterns = this.patterns.getAll({ language, minCoherency });
    if (tags && tags.length > 0) {
      const filterTags = new Set(tags.map(t => t.toLowerCase()));
      patterns = patterns.filter(p => p.tags.some(t => filterTags.has(t.toLowerCase())));
    }

    // Sort by coherency descending, take top N
    patterns = patterns
      .sort((a, b) => (b.coherencyScore?.total ?? 0) - (a.coherencyScore?.total ?? 0))
      .slice(0, limit);

    if (format === 'markdown' || format === 'md') {
      return this._exportMarkdown(patterns);
    }
    return this._exportJSON(patterns);
  },

  _exportJSON(patterns) {
    return JSON.stringify({
      exported: new Date().toISOString(),
      count: patterns.length,
      patterns: patterns.map(p => ({
        id: p.id,
        name: p.name,
        code: p.code,
        testCode: p.testCode || undefined,
        language: p.language,
        description: p.description,
        tags: p.tags,
        patternType: p.patternType,
        complexity: p.complexity,
        coherency: p.coherencyScore?.total,
      })),
    }, null, 2);
  },

  _exportMarkdown(patterns) {
    const lines = [
      '# Remembrance Oracle — Exported Patterns',
      '',
      `Exported: ${new Date().toISOString()} | ${patterns.length} patterns`,
      '',
    ];
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
    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const p of patterns) {
      if (!p.code || !p.name) {
        errors.push(`Skipped pattern without code or name: ${p.name || '(unnamed)'}`);
        skipped++;
        continue;
      }

      // Check for duplicate by name
      const existing = this.patterns.getAll().find(
        ep => ep.name === p.name && ep.language === p.language
      );
      if (existing) {
        results.push({ name: p.name, status: 'duplicate', id: existing.id });
        skipped++;
        continue;
      }

      if (dryRun) {
        results.push({ name: p.name, status: 'would_import', language: p.language });
        imported++;
        continue;
      }

      const regResult = this.registerPattern({
        name: p.name,
        code: p.code,
        language: p.language || 'javascript',
        description: p.description || p.name,
        tags: [...(p.tags || []), 'imported'],
        patternType: p.patternType || 'utility',
        complexity: p.complexity || 'moderate',
        author,
        testCode: p.testCode,
      });

      if (regResult.registered) {
        results.push({ name: p.name, status: 'imported', id: regResult.pattern.id });
        imported++;
      } else {
        results.push({ name: p.name, status: 'rejected', reason: regResult.reason });
        errors.push(`${p.name}: ${regResult.reason}`);
        skipped++;
      }
    }

    this._emit({ type: 'import_complete', imported, skipped });

    return { imported, skipped, errors, results };
  },
};
