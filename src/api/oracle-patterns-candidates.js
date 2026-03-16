/**
 * Oracle Patterns — Candidates, tagging, cleaning, promotion.
 */

function _findDuplicates(all) {
  const toRemove = new Map();
  const byCode = new Map();
  for (const p of all) {
    const key = (p.code || '').trim();
    if (!key) continue;
    if (!byCode.has(key)) byCode.set(key, []);
    byCode.get(key).push(p);
  }
  for (const [, group] of byCode) {
    if (group.length <= 1) continue;
    group.sort((a, b) => (b.coherencyScore?.total ?? 0) - (a.coherencyScore?.total ?? 0));
    for (let i = 1; i < group.length; i++) toRemove.set(group[i].id, 'duplicate');
  }
  return toRemove;
}

function _findStubs(all, toRemove) {
  for (const p of all) {
    if (toRemove.has(p.id)) continue;
    const code = (p.code || '').trim();
    if (!code) continue;
    if (/^(?:function|const)\s+\w+[^{]*\{\s*(?:\/[/*][^}]*)?\}$/.test(code)) {
      toRemove.set(p.id, 'stub');
      continue;
    }
    if (code.length < 50) {
      const isOneLiner = /^(?:function|const)\s+\w+[^{]*\{[^{}]*\}$/.test(code);
      const isTestHelper = /^(?:function|const)\s+(?:def-?[Tt]est|hover-?[Tt]est|safeCode|broken|only|hidden|dry|dup|evTest|mcpTest|jsFunc|realFunction|testFunc)\b/.test(code);
      if (isOneLiner || isTestHelper) toRemove.set(p.id, 'stub');
    }
  }
}

function _evaluateCandidate(candidate, provenPatterns, options) {
  const { minCoherency = 0.9, minConfidence = 0.8, manualOverride = false, dryRun = false } = options;
  const { covenantCheck } = require('../core/covenant');
  const { sandboxExecute } = require('../core/sandbox');

  const coherency = candidate.coherencyScore?.total ?? 0;
  if (coherency < minCoherency) {
    return { status: 'skipped', reason: `coherency ${coherency.toFixed(3)} < ${minCoherency}` };
  }

  if (!manualOverride && candidate.parentPattern) {
    const parent = provenPatterns.find(p => p.id === candidate.parentPattern || p.name === candidate.parentPattern);
    if (parent) {
      const parentReliability = parent.usageCount > 0 ? parent.successCount / parent.usageCount : 0.5;
      if (parentReliability < minConfidence) {
        return { status: 'skipped', reason: `parent reliability ${parentReliability.toFixed(3)} < ${minConfidence}` };
      }
    }
  }

  const covenant = covenantCheck(candidate.code);
  if (!covenant.sealed) {
    return { status: 'vetoed', reason: `covenant: ${covenant.violations?.[0]?.principle || 'failed'}` };
  }

  if (candidate.testCode) {
    try {
      const testResult = sandboxExecute(candidate.code, candidate.testCode, candidate.language);
      if (!testResult.passed) {
        return { status: 'vetoed', reason: 'test execution failed' };
      }
    } catch (_) {
      if (process.env.ORACLE_DEBUG) console.warn('[oracle-patterns-candidates:_evaluateCandidate] silent failure:', _?.message || _);
      return { status: 'vetoed', reason: 'sandbox error' };
    }
  }

  if (dryRun) {
    return { status: 'would-promote', coherency: coherency.toFixed(3) };
  }

  return { status: 'promote', coherency };
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

    const result = {
      success: true, id: pattern.id, name: pattern.name,
      oldTags, newTags, added: diff.added,
      updated: !options.dryRun && diff.added.length > 0
    };
    return result;
  },

  retagAll(options = {}) {
    const { dryRun = false, minAdded = 0 } = options;
    const { retagPattern, tagDiff } = require('../core/auto-tagger');
    const all = this.patterns.getAll();
    let enriched = 0, totalTagsAdded = 0;
    const results = [];

    for (const pattern of all) {
      const oldTags = [...(pattern.tags || [])];
      const newTags = retagPattern(pattern);
      const diff = tagDiff(oldTags, newTags);
      if (diff.added.length > 0 && diff.added.length >= minAdded) {
        if (!dryRun) this.patterns.update(pattern.id, { tags: newTags });
        enriched++;
        totalTagsAdded += diff.added.length;
        results.push({ id: pattern.id, name: pattern.name, added: diff.added, total: newTags.length });
      }
    }

    const result = {
      success: true, total: all.length, enriched,
      totalTagsAdded, dryRun, patterns: results.slice(0, 50)
    };
    return result;
  },

  deepClean(options = {}) {
    const { minCodeLength = 35, minNameLength = 3, removeDuplicates = true, removeStubs = true, dryRun = false, maxRemovals = 50 } = options;
    const all = this.patterns.getAll();
    const toRemove = removeDuplicates ? _findDuplicates(all) : new Map();

    if (removeStubs) {
      _findStubs(all, toRemove);
    }

    for (const p of all) {
      if (toRemove.has(p.id)) continue;
      const code = (p.code || '').trim();
      const name = (p.name || '');
      const tags = p.tags || [];
      if (tags.includes('harvested') && code.length < minCodeLength && name.length < minNameLength) {
        toRemove.set(p.id, 'too-short');
      }
    }

    // SAFETY: Never delete patterns with coherency >= 0.7 or test code
    for (const [id] of toRemove) {
      const p = all.find(x => x.id === id);
      if (!p) continue;
      const coherency = p.coherencyScore?.total ?? p.coherency_total ?? 0;
      if (coherency >= 0.7) { toRemove.delete(id); continue; }
      if (p.test_code && p.test_code.trim().length > 20) { toRemove.delete(id); continue; }
    }

    // SAFETY: Cap total removals per run to prevent mass deletion
    if (toRemove.size > maxRemovals) {
      const entries = [...toRemove.entries()];
      toRemove.clear();
      for (let i = 0; i < maxRemovals; i++) toRemove.set(entries[i][0], entries[i][1]);
    }

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
            // Archive before delete for recovery safety
            const row = db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
            if (row) {
              const now = new Date().toISOString();
              const archiveResult = db.prepare(`
                INSERT OR IGNORE INTO pattern_archive
                  (id, name, code, language, pattern_type, coherency_total, coherency_json,
                   test_code, tags, deleted_reason, deleted_at, original_created_at, full_row_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                row.id, row.name, row.code, row.language || 'unknown',
                row.pattern_type || 'utility', row.coherency_total || 0,
                row.coherency_json || '{}', row.test_code || null,
                row.tags || '[]', 'deep-clean:' + reason, now, row.created_at || null,
                JSON.stringify(row)
              );
              // Verify archive before allowing delete
              if (archiveResult.changes === 0) {
                const archived = db.prepare('SELECT 1 FROM pattern_archive WHERE id = ?').get(row.id);
                if (!archived) {
                  if (process.env.ORACLE_DEBUG) console.warn(`[oracle-patterns-candidates:deepClean] ABORT delete of ${id} — archive failed`);
                  continue;
                }
              }
            }
            db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
          }
        } catch (e) {
          if (process.env.ORACLE_DEBUG) console.warn('[oracle-patterns-candidates:code] skip:', e?.message || e);
        }
      }
    }

    const actualRemoved = dryRun ? 0 : toRemove.size;
    const remaining = all.length - actualRemoved;
    this._emit({ type: 'deep_clean', removed: toRemove.size, duplicates, stubs, tooShort, remaining, dryRun });
    return { removed: toRemove.size, duplicates, stubs, tooShort, remaining, dryRun, details };
  },

  recycle(options = {}) { return this.recycler.recycleFailed(options); },
  processSeeds(seeds, options = {}) { return this.recycler.processSeeds(seeds, options); },
  generateCandidates(options = {}) { return this.recycler.generateCandidates(options); },
  candidates(filters = {}) { return this.patterns.getCandidates(filters); },
  candidateStats() { return this.patterns.candidateSummary(); },
  promote(candidateId, testCode) { return this.recycler.promoteWithProof(candidateId, testCode); },
  autoPromote() { return this.recycler.autoPromote(); },

  smartAutoPromote(options = {}) {
    const { dryRun = false, minCoherency = 0.9 } = options;
    const candidates = this.patterns.getCandidates({ minCoherency });
    const provenPatterns = this.patterns.getAll();
    const report = { promoted: 0, skipped: 0, vetoed: 0, total: candidates.length, details: [] };

    for (const candidate of candidates) {
      const evaluation = _evaluateCandidate(candidate, provenPatterns, options);

      if (evaluation.status === 'skipped') {
        report.skipped++;
        report.details.push({ name: candidate.name, status: 'skipped', reason: evaluation.reason });
        continue;
      }

      if (evaluation.status === 'vetoed') {
        report.vetoed++;
        report.details.push({ name: candidate.name, status: 'vetoed', reason: evaluation.reason });
        continue;
      }

      if (evaluation.status === 'would-promote') {
        report.wouldPromote = (report.wouldPromote || 0) + 1;
        report.details.push({ name: candidate.name, status: 'would-promote', coherency: evaluation.coherency });
        continue;
      }

      const result = this.registerPattern({
        name: candidate.name, code: candidate.code, language: candidate.language,
        description: candidate.description || candidate.name, tags: candidate.tags || [],
        testCode: candidate.testCode, author: candidate.author || 'smart-auto-promote',
      });

      if (result.registered) {
        this.patterns.promoteCandidate(candidate.id);
        report.promoted++;
        report.details.push({ name: candidate.name, status: 'promoted', coherency: evaluation.coherency.toFixed(3) });
      } else {
        report.vetoed++;
        report.details.push({ name: candidate.name, status: 'vetoed', reason: result.reason || 'registration failed' });
      }
    }

    this._emit({ type: 'auto_promote', promoted: report.promoted, skipped: report.skipped, vetoed: report.vetoed, total: report.total });
    return report;
  },

  synthesizeTests(options = {}) {
    const { synthesizeForCandidates } = require('../evolution/test-synth');
    const synthReport = synthesizeForCandidates(this, options);
    let promoteReport = null;
    if (options.autoPromote !== false) promoteReport = this.autoPromote();
    return { synthesis: synthReport, promotion: promoteReport };
  },
};
