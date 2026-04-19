'use strict';

/**
 * Baseline mode for `oracle audit`.
 *
 * A baseline is a snapshot of findings that exist at a point in time,
 * stored in `.remembrance/audit-baseline.json`. When a baseline is
 * active, subsequent `audit check` runs only report NEW findings — the
 * ones already in the baseline are treated as "known debt" and hidden.
 *
 * This lets you adopt the audit on a legacy codebase without being
 * drowned in pre-existing findings. You snapshot once, fix new findings
 * as they appear, and occasionally refresh the baseline as you clean up
 * the legacy debt.
 *
 * The baseline also drives the rich summary's "regressed vs. improved"
 * tallies — we can compare the current run against the baseline to
 * identify files that got better, got worse, or stayed the same.
 *
 * Finding identity is computed from:
 *   (file, ruleId, line, code-line-hash)
 *
 * We use line-hash instead of line-number alone so that unrelated line
 * additions above a finding don't invalidate it. The line-hash is a
 * fingerprint of the line's content, lowercased and whitespace-stripped.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASELINE_DIRS = ['.remembrance', '.oracle'];
const BASELINE_FILE = 'audit-baseline.json';
const CURRENT_VERSION = 1;

/**
 * Resolve the baseline path for a given repo root. We look for an
 * existing `.remembrance` directory first (the Oracle's default) and
 * fall back to creating `.remembrance/` if neither exists.
 */
function resolveBaselinePath(repoRoot) {
  for (const d of BASELINE_DIRS) {
    const candidate = path.join(repoRoot, d, BASELINE_FILE);
    if (fs.existsSync(candidate)) return candidate;
    const dir = path.join(repoRoot, d);
    if (fs.existsSync(dir)) return candidate;
  }
  return path.join(repoRoot, BASELINE_DIRS[0], BASELINE_FILE);
}

/**
 * Compute a stable fingerprint for a single finding.
 *
 * We deliberately do NOT include column in the fingerprint: two
 * findings on the same (file, rule, codeLine) are the same finding
 * even if columns drift slightly due to whitespace edits.
 */
function fingerprint(finding, filePath) {
  const codeLine = (finding.code || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const h = crypto.createHash('sha1');
  h.update(`${filePath || finding.file || ''}\0${finding.ruleId || finding.bugClass || ''}\0${codeLine}`);
  return h.digest('hex').slice(0, 16);
}

/**
 * Build the baseline record for a set of findings. Each file carries
 * its list of fingerprints + enough context to diff later.
 */
function buildBaseline(resultsByFile, repoRoot) {
  const baseline = {
    version: CURRENT_VERSION,
    createdAt: new Date().toISOString(),
    repoRoot: repoRoot || null,
    totalFindings: 0,
    files: {},
  };
  for (const file of Object.keys(resultsByFile)) {
    const rel = repoRoot ? path.relative(repoRoot, file) : file;
    const findings = resultsByFile[file] || [];
    const fps = [];
    for (const f of findings) {
      fps.push({
        fp: fingerprint(f, rel),
        ruleId: f.ruleId || f.bugClass,
        line: f.line,
        severity: f.severity,
      });
    }
    baseline.files[rel] = {
      count: findings.length,
      findings: fps,
    };
    baseline.totalFindings += findings.length;
  }
  return baseline;
}

/**
 * Write a baseline to disk atomically.
 */
function writeBaseline(baseline, baselinePath) {
  const dir = path.dirname(baselinePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = baselinePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(baseline, null, 2));
  fs.renameSync(tmp, baselinePath);
}

/**
 * Load a baseline from disk. Returns null if none exists.
 */
function readBaseline(baselinePath) {
  if (!fs.existsSync(baselinePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
    if (!raw || typeof raw !== 'object') return null;
    if (raw.version !== CURRENT_VERSION) {
      return { ...raw, version: CURRENT_VERSION, migrated: true };
    }
    return raw;
  } catch {
    return null;
  }
}

/**
 * Diff current findings against a baseline.
 *
 * @param {object} baseline - result of readBaseline / buildBaseline
 * @param {object} currentByFile - { [file]: finding[] }
 * @param {string} repoRoot - for relativizing paths
 * @returns {{
 *   new: finding[],
 *   fixed: BaselineFinding[],
 *   persisted: finding[],
 *   regressedFiles: string[],
 *   improvedFiles: string[],
 * }}
 */
function diffAgainstBaseline(baseline, currentByFile, repoRoot) {
  const result = {
    new: [],
    fixed: [],
    persisted: [],
    regressedFiles: [],
    improvedFiles: [],
  };
  if (!baseline || !baseline.files) {
    // No baseline → everything is "new"
    for (const file of Object.keys(currentByFile)) {
      for (const f of currentByFile[file]) result.new.push({ ...f, file });
    }
    return result;
  }

  const seenFps = new Set();

  for (const file of Object.keys(currentByFile)) {
    const rel = repoRoot ? path.relative(repoRoot, file) : file;
    const findings = currentByFile[file] || [];
    const baseEntry = baseline.files[rel] || { findings: [] };
    const baseFps = new Set(baseEntry.findings.map(f => f.fp));

    let newCount = 0;
    for (const f of findings) {
      const fp = fingerprint(f, rel);
      seenFps.add(`${rel}::${fp}`);
      if (baseFps.has(fp)) {
        result.persisted.push({ ...f, file });
      } else {
        result.new.push({ ...f, file });
        newCount++;
      }
    }

    if (newCount > 0 && findings.length > baseEntry.count) {
      result.regressedFiles.push(rel);
    }
    if (findings.length < baseEntry.count) {
      result.improvedFiles.push(rel);
    }
  }

  // Fixed findings: in baseline but not in current
  for (const file of Object.keys(baseline.files)) {
    const baseEntry = baseline.files[file];
    for (const bf of baseEntry.findings) {
      const key = `${file}::${bf.fp}`;
      if (!seenFps.has(key)) {
        result.fixed.push({ file, ...bf });
      }
    }
  }

  return result;
}

module.exports = {
  resolveBaselinePath,
  buildBaseline,
  writeBaseline,
  readBaseline,
  diffAgainstBaseline,
  fingerprint,
  BASELINE_FILE,
};
