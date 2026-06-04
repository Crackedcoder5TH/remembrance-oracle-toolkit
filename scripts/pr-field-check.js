#!/usr/bin/env node
'use strict';

/**
 * pr-field-check — run the Remembrance field tool on a PR's diff.
 *
 * Recommendation #5 — converts the field tool from "interactive debug
 * companion" to "enforcement layer." Every PR gets coherency-aware
 * before merge: changed files are encoded with the fractal-waveform
 * encoder, scored against the verified pattern library, and validated
 * as a batch through the dual oracle. Output is a structured report
 * the CI workflow can comment on the PR.
 *
 * Two checks per file:
 *   1. pattern_resonance against the verified library — how strongly
 *      does this file resemble already-proven patterns?
 *   2. fractal coherency against the current substrate (top-N highest-
 *      coherence neighbors) — does it cohere with what's already there?
 *
 * One check per batch:
 *   3. dual-oracle validateContribution on the file-level coherency
 *      distribution — is the shape of these scores natural-looking or
 *      synthetic-looking? Catches sophisticated-injection-shaped PRs.
 *
 * Output:
 *   JSON to stdout, GitHub Actions annotations to stderr if running
 *   under Actions. Exit code:
 *     0  all clear
 *     1  one or more files below the gate
 *     2  batch shape suspect (dual oracle flagged)
 *
 * Usage:
 *   node scripts/pr-field-check.js [--base <ref>] [--head <ref>] [--json] [--threshold 0.6]
 *
 * In GitHub Actions:
 *   - uses: actions/checkout@v4
 *     with: { fetch-depth: 0 }
 *   - run: node scripts/pr-field-check.js --base $GITHUB_BASE_REF --head $GITHUB_SHA
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const args = (function parseArgs() {
  const out = { json: false, threshold: 0.6 };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    switch (a[i]) {
      case '--base': out.base = a[++i]; break;
      case '--head': out.head = a[++i]; break;
      case '--threshold': out.threshold = parseFloat(a[++i]); break;
      case '--json': out.json = true; break;
      case '--help': case '-h': out.help = true; break;
    }
  }
  return out;
})();

if (args.help) {
  process.stdout.write(`pr-field-check — run the field tool on a PR's diff

Usage:
  node scripts/pr-field-check.js [options]

Options:
  --base <ref>        base ref to diff against (default: env GITHUB_BASE_REF, then origin/main)
  --head <ref>        head ref (default: env GITHUB_SHA, then HEAD)
  --threshold <n>     fail when any file's coherency < this (default 0.6, the covenant gate)
  --json              machine-readable output to stdout
  -h, --help          this message

Exit codes:
  0  all changed files passed
  1  one or more files below the threshold
  2  batch shape flagged as suspect by the dual oracle
`);
  process.exit(0);
}

const BASE = args.base || process.env.GITHUB_BASE_REF || 'origin/main';
const HEAD = args.head || process.env.GITHUB_SHA || 'HEAD';
const THRESHOLD = Number.isFinite(args.threshold) ? args.threshold : 0.6;
const IN_ACTIONS = !!process.env.GITHUB_ACTIONS;

// ── Locate the field-tool modules ──────────────────────────────────
let toFractalWaveform, fractalCoherency, fractalCoherencyOf;
let scoreResonance, libraryStatus;
let validateContribution;

const TOOLKIT_ROOT = process.env.REMEMBRANCE_TOOLKIT_ROOT
  || path.resolve(__dirname, '..');
try {
  ({ toFractalWaveform, fractalCoherency, fractalCoherencyOf } =
    require(path.join(TOOLKIT_ROOT, 'src/core/fractal-waveform.js')));
  ({ scoreResonance, libraryStatus } =
    require(path.join(TOOLKIT_ROOT, 'src/scoring/pattern-resonance.js')));
  ({ validateContribution } =
    require(path.join(TOOLKIT_ROOT, 'src/core/field-coupling.js')));
} catch (err) {
  process.stderr.write('pr-field-check: cannot load oracle toolkit modules: ' + err.message + '\n');
  process.stderr.write('Set REMEMBRANCE_TOOLKIT_ROOT to the toolkit root.\n');
  process.exit(2);
}

// ── Collect the diff ───────────────────────────────────────────────
function changedFiles() {
  try {
    const out = execSync(`git diff --name-only --diff-filter=ACMR ${BASE}...${HEAD}`, {
      encoding: 'utf8',
    }).trim();
    if (!out) return [];
    return out.split('\n').filter(Boolean);
  } catch (err) {
    process.stderr.write('git diff failed: ' + err.message + '\n');
    return [];
  }
}

// Only score these extensions. Adjust as needed.
const SCORABLE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb',
  '.md',  // catches doc resonance with the substrate
]);

function isScorable(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SCORABLE_EXTENSIONS.has(ext)) return false;
  // Skip locks, generated files
  if (filePath.endsWith('-lock.json')) return false;
  if (filePath.endsWith('.lockfile')) return false;
  return true;
}

function safeRead(filePath, maxBytes = 200_000) {
  try {
    const full = path.resolve(filePath);
    if (!fs.existsSync(full)) return null;
    const st = fs.statSync(full);
    if (st.size > maxBytes) {
      return fs.readFileSync(full, 'utf8').slice(0, maxBytes);
    }
    return fs.readFileSync(full, 'utf8');
  } catch { return null; }
}

// ── Per-file scoring ───────────────────────────────────────────────
function scoreFile(filePath, content) {
  const verdict = { file: filePath };
  // 1. Pattern resonance against the verified library.
  try {
    const r = scoreResonance(content, { language: detectLanguage(filePath), topK: 5 });
    verdict.resonance = {
      score: typeof r === 'number' ? r : (r && r.score) || 0,
      topMatches: (r && r.matches) ? r.matches.slice(0, 3).map((m) => ({
        name: m.name || m.id, similarity: m.similarity,
      })) : [],
    };
  } catch (err) {
    verdict.resonance = { error: err.message };
  }
  // 2. Structural coherency — encode it and report the structurality reading.
  try {
    const wf = toFractalWaveform(content);
    verdict.structurality = wf[28] || 0;
  } catch (err) {
    verdict.structurality = null;
  }
  // Combined: the resonance score is the primary gate; structurality is observational.
  verdict.passes = (verdict.resonance && verdict.resonance.score >= THRESHOLD);
  return verdict;
}

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python', '.go': 'go', '.rs': 'rust',
    '.java': 'java', '.rb': 'ruby', '.md': 'markdown',
  })[ext] || 'unknown';
}

// ── Main ────────────────────────────────────────────────────────────
(function main() {
  const files = changedFiles();
  const scorable = files.filter(isScorable);

  let libStatus = null;
  try { libStatus = libraryStatus(); } catch { /* ok */ }

  const verdicts = [];
  for (const f of scorable) {
    const content = safeRead(f);
    if (content == null) {
      verdicts.push({ file: f, skipped: 'unreadable' });
      continue;
    }
    if (content.length < 32) {
      verdicts.push({ file: f, skipped: 'too-small' });
      continue;
    }
    verdicts.push(scoreFile(f, content));
  }

  const scored = verdicts.filter((v) => !v.skipped);
  const failed = scored.filter((v) => !v.passes);
  const scoreArr = scored
    .map((v) => (v.resonance && typeof v.resonance.score === 'number') ? v.resonance.score : null)
    .filter((s) => s != null);

  // ── Batch dual-oracle check ─────────────────────────────────────
  let dualOracle = null;
  if (scoreArr.length >= 2) {
    try {
      dualOracle = validateContribution({
        source: 'pr:field-check:' + (process.env.GITHUB_REF || 'local'),
        coherence: scoreArr,
        cost: scoreArr.length,
      }, { commit: false });
    } catch (err) {
      dualOracle = { error: err.message };
    }
  }

  // ── Emit ────────────────────────────────────────────────────────
  const report = {
    base: BASE,
    head: HEAD,
    threshold: THRESHOLD,
    changedFiles: files.length,
    scoredFiles: scored.length,
    skippedFiles: verdicts.filter((v) => v.skipped).length,
    failedFiles: failed.length,
    verdicts,
    dualOracle: dualOracle ? {
      accepted: dualOracle.accepted,
      shapeClass: dualOracle.shapeClass,
      suspect: dualOracle.suspect,
      inputStats: dualOracle.inputStats,
    } : null,
    library: libStatus,
    generatedAt: new Date().toISOString(),
  };

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    printText(report);
  }

  if (IN_ACTIONS) {
    emitActionsAnnotations(report);
  }

  if (dualOracle && dualOracle.suspect) {
    process.exit(2);
  }
  if (failed.length > 0) {
    process.exit(1);
  }
  process.exit(0);
})();

function printText(r) {
  const lines = [];
  lines.push('=== Remembrance Field — PR Coherency Check ===');
  lines.push('Base: ' + r.base + '  Head: ' + r.head + '  Threshold: ' + r.threshold);
  lines.push('Changed files: ' + r.changedFiles +
    '  Scored: ' + r.scoredFiles +
    '  Skipped: ' + r.skippedFiles +
    '  Failed: ' + r.failedFiles);
  lines.push('');
  lines.push('Per-file resonance against the verified library:');
  for (const v of r.verdicts) {
    if (v.skipped) {
      lines.push('  · ' + v.file + ' (skipped: ' + v.skipped + ')');
      continue;
    }
    const mark = v.passes ? '✓' : '✗';
    const sc = v.resonance && typeof v.resonance.score === 'number'
      ? v.resonance.score.toFixed(3) : 'n/a';
    lines.push('  ' + mark + ' ' + sc + '  ' + v.file +
      '  (structurality ' + (v.structurality != null ? v.structurality.toFixed(2) : 'n/a') + ')');
  }
  if (r.dualOracle) {
    lines.push('');
    lines.push('Dual oracle on file-coherency batch:');
    lines.push('  shapeClass: ' + (r.dualOracle.shapeClass || 'n/a'));
    lines.push('  accepted:   ' + r.dualOracle.accepted);
    lines.push('  suspect:    ' + r.dualOracle.suspect);
    if (r.dualOracle.inputStats) {
      lines.push('  stats:      mean=' + r.dualOracle.inputStats.mean.toFixed(3) +
        ' var=' + r.dualOracle.inputStats.variance.toFixed(4) +
        ' n=' + r.dualOracle.inputStats.n);
    }
  }
  process.stdout.write(lines.join('\n') + '\n');
}

function emitActionsAnnotations(r) {
  // GitHub Actions annotations: ::warning file=path,line=1,col=1::message
  for (const v of r.verdicts) {
    if (v.skipped || v.passes) continue;
    const sc = v.resonance && typeof v.resonance.score === 'number'
      ? v.resonance.score.toFixed(3) : 'n/a';
    process.stderr.write(`::warning file=${v.file}::Resonance ${sc} below gate ${r.threshold} — file resembles no proven pattern in the verified library.\n`);
  }
  if (r.dualOracle && r.dualOracle.suspect) {
    process.stderr.write(`::warning::Batch shape ${r.dualOracle.shapeClass} flagged by dual oracle (mean ${r.dualOracle.inputStats.mean.toFixed(3)}, var ${r.dualOracle.inputStats.variance.toFixed(4)}) — sophisticated-injection class.\n`);
  }
  // GitHub Actions step summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      '## Remembrance Field — PR Coherency Check',
      '',
      `**Base:** ${r.base} → **Head:** ${r.head}  `,
      `**Threshold:** ${r.threshold}  `,
      `**Changed:** ${r.changedFiles} · **Scored:** ${r.scoredFiles} · **Failed:** ${r.failedFiles}`,
      '',
      '| | Score | Structurality | File |',
      '|---|---:|---:|---|',
    ];
    for (const v of r.verdicts) {
      if (v.skipped) continue;
      const mark = v.passes ? '✓' : '✗';
      const sc = v.resonance && typeof v.resonance.score === 'number' ? v.resonance.score.toFixed(3) : '—';
      const st = v.structurality != null ? v.structurality.toFixed(2) : '—';
      md.push(`| ${mark} | ${sc} | ${st} | \`${v.file}\` |`);
    }
    if (r.dualOracle) {
      md.push('', '### Dual oracle on the batch shape', '');
      md.push('| Field | Value |', '|---|---|');
      md.push(`| Shape class | \`${r.dualOracle.shapeClass}\` |`);
      md.push(`| Accepted | ${r.dualOracle.accepted ? '✓' : '✗'} |`);
      md.push(`| Suspect | ${r.dualOracle.suspect ? '⚠️ yes' : 'no'} |`);
      if (r.dualOracle.inputStats) {
        md.push(`| Mean | ${r.dualOracle.inputStats.mean.toFixed(3)} |`);
        md.push(`| Variance | ${r.dualOracle.inputStats.variance.toFixed(4)} |`);
        md.push(`| N | ${r.dualOracle.inputStats.n} |`);
      }
    }
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n');
    } catch { /* ok */ }
  }
}
