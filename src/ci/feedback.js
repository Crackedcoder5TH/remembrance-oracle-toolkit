/**
 * CI Feedback Loop — Automatic reliability tracking.
 *
 * When code pulled from the Oracle is used in a project and CI runs,
 * this module:
 *
 * 1. Scans for a tracking manifest (.remembrance/pulled-patterns.json)
 *    that records which patterns/entries were pulled into the project
 * 2. Checks CI test results (exit code, test output)
 * 3. Reports success/failure back to the Oracle store
 * 4. Logs feedback to an append-only audit trail
 *
 * Usage from CI:
 *   # After tests pass:
 *   node src/cli.js ci-feedback --status pass
 *   # After tests fail:
 *   node src/cli.js ci-feedback --status fail
 *   # Auto-detect from exit code:
 *   npm test && node src/cli.js ci-feedback --status pass || node src/cli.js ci-feedback --status fail
 */

const fs = require('fs');
const path = require('path');

const PULLED_MANIFEST = 'pulled-patterns.json';
const FEEDBACK_LOG = 'ci-feedback-log.json';

class CIFeedbackReporter {
  constructor(oracle, options = {}) {
    this.oracle = oracle;
    this.storeDir = oracle.store.storeDir || path.join(options.baseDir || process.cwd(), '.remembrance');
    this.manifestPath = path.join(this.storeDir, PULLED_MANIFEST);
    this.logPath = path.join(this.storeDir, FEEDBACK_LOG);
  }

  /**
   * Record that a pattern/entry was pulled from the Oracle.
   * Call this when code is retrieved so we know what to track.
   */
  trackPull(entry) {
    const manifest = this._readManifest();
    const record = {
      id: entry.id,
      name: entry.name || null,
      source: entry.source || 'unknown',
      pulledAt: new Date().toISOString(),
      reported: false,
    };

    // Dedupe: don't track the same ID twice
    if (!manifest.tracked.find(t => t.id === entry.id)) {
      manifest.tracked.push(record);
      this._writeManifest(manifest);
    }

    return record;
  }

  /**
   * Report CI results back to the Oracle.
   * Called after CI tests run — updates reliability scores for all tracked patterns.
   *
   * Returns: { reported, updated, errors }
   */
  reportResults(status, options = {}) {
    const { testOutput = '', commitSha = '', ciProvider = 'unknown' } = options;
    const succeeded = status === 'pass' || status === 'success' || status === true;
    const manifest = this._readManifest();

    if (manifest.tracked.length === 0) {
      return { reported: 0, updated: [], errors: [], message: 'No tracked patterns to report on' };
    }

    const unreported = manifest.tracked.filter(t => !t.reported);
    if (unreported.length === 0) {
      return { reported: 0, updated: [], errors: [], message: 'All tracked patterns already reported' };
    }

    const updated = [];
    const errors = [];
    const now = new Date().toISOString();

    for (const tracked of unreported) {
      try {
        // Try pattern feedback first, then entry feedback
        let result = this.oracle.patternFeedback(tracked.id, succeeded);
        if (!result.success) {
          result = this.oracle.feedback(tracked.id, succeeded);
        }

        if (result.success || result.newReliability != null) {
          tracked.reported = true;
          tracked.reportedAt = now;
          tracked.status = succeeded ? 'pass' : 'fail';
          updated.push({
            id: tracked.id,
            name: tracked.name,
            succeeded,
            newReliability: result.newReliability ?? result.successCount / result.usageCount,
          });
        } else {
          errors.push({ id: tracked.id, error: result.error || 'Unknown error' });
        }
      } catch (err) {
        errors.push({ id: tracked.id, error: err.message });
      }
    }

    // Update manifest
    this._writeManifest(manifest);

    // Append to audit log
    this._appendLog({
      timestamp: now,
      status: succeeded ? 'pass' : 'fail',
      commitSha,
      ciProvider,
      testOutput: testOutput.slice(0, 500), // Truncate to keep log manageable
      patternsReported: updated.length,
      errorsCount: errors.length,
      details: updated,
    });

    return {
      reported: updated.length,
      updated,
      errors,
      message: `Reported ${updated.length} pattern(s) as ${succeeded ? 'pass' : 'fail'}`,
    };
  }

  /**
   * Get feedback statistics.
   */
  stats() {
    const manifest = this._readManifest();
    const log = this._readLog();

    return {
      trackedPatterns: manifest.tracked.length,
      unreported: manifest.tracked.filter(t => !t.reported).length,
      reported: manifest.tracked.filter(t => t.reported).length,
      totalFeedbackEvents: log.length,
      recentFeedback: log.slice(-5),
    };
  }

  /**
   * Clear the tracking manifest (e.g. after a release).
   */
  clearTracking() {
    this._writeManifest({ tracked: [], clearedAt: new Date().toISOString() });
  }

  // ─── Internal ───

  _readManifest() {
    if (!fs.existsSync(this.manifestPath)) {
      return { tracked: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'));
    } catch {
      return { tracked: [] };
    }
  }

  _writeManifest(data) {
    if (!fs.existsSync(this.storeDir)) {
      fs.mkdirSync(this.storeDir, { recursive: true });
    }
    fs.writeFileSync(this.manifestPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  _readLog() {
    if (!fs.existsSync(this.logPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.logPath, 'utf-8'));
    } catch {
      return [];
    }
  }

  _appendLog(entry) {
    const log = this._readLog();
    log.push(entry);
    // Keep last 1000 entries
    const trimmed = log.slice(-1000);
    fs.writeFileSync(this.logPath, JSON.stringify(trimmed, null, 2), 'utf-8');
  }
}

/**
 * Auto-track pulled patterns.
 * Wraps Oracle.resolve() and Oracle.query() to automatically track
 * which patterns are being used in the project.
 */
function wrapWithTracking(oracle) {
  const reporter = new CIFeedbackReporter(oracle);

  const origResolve = oracle.resolve.bind(oracle);
  oracle.resolve = function (request) {
    const result = origResolve(request);
    if (result.pattern && result.decision === 'pull') {
      reporter.trackPull({ id: result.pattern.id, name: result.pattern.name, source: 'pattern' });
    }
    return result;
  };

  const origQuery = oracle.query.bind(oracle);
  oracle.query = function (query) {
    const results = origQuery(query);
    for (const r of results.slice(0, 1)) { // Track only the top result
      reporter.trackPull({ id: r.id, name: r.description, source: 'history' });
    }
    return results;
  };

  oracle._feedbackReporter = reporter;
  return reporter;
}

module.exports = { CIFeedbackReporter, wrapWithTracking };
