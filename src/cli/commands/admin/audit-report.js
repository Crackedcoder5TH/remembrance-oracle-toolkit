'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const { c } = require('../../colors');
const { loadAuditBackend } = require('./helpers');
const { out, outErr, outWarn, _quiet } = require('./out');

// audit subcommands, extracted from the admin monolith (decomposition #5,
// 2026-08-09). Bodies verbatim except the ./out print seam and _quiet
// failure naming.
const _summary = (args, { oracle, jsonOut }) => {
      const { auditFiles } = loadAuditBackend();
      const { smellFiles } = require('../../../audit/smell-checkers');
      const { lintFiles } = require('../../../audit/lint-checkers');
      const { scorePrior } = require('../../../audit/bayesian-prior');
      const baselineMod = require('../../../audit/baseline');
      const { summarizeStore } = require('../../../audit/feedback');
      const { buildSummary, recordRun, loadHistory } = require('../../../audit/rich-summary');
      const repoRoot = process.cwd();

      // Collect files: prefer tracked files, fall back to src/
      let files = [];
      try {
        const tracked = execSync('git ls-files "*.js" "*.mjs" "*.cjs" 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules')).slice(0, 300);
        files = tracked;
      } catch (_) { _quiet('admin:audit-report:summary', _); /* empty */ }

      // Run all three analyses in one pass
      const bugResult = auditFiles(files);
      const smellResult = smellFiles(files);
      const lintResult = lintFiles(files);

      const bugFlat = [];
      for (const fr of bugResult.files || []) {
        for (const f of fr.findings) bugFlat.push({ ...f, file: fr.file });
      }
      const smellFlat = [];
      for (const fr of smellResult.files || []) {
        for (const f of fr.findings) smellFlat.push({ ...f, file: fr.file });
      }
      const lintFlat = [];
      for (const fr of lintResult.files || []) {
        for (const f of fr.findings) lintFlat.push({ ...f, file: fr.file });
      }

      // Bayesian prior (top files only, it's cheap but let's cap)
      const priorFlat = [];
      for (const f of files.slice(0, 100)) {
        try {
          const src = fs.readFileSync(f, 'utf-8');
          const found = scorePrior(src, f);
          for (const fnd of found) priorFlat.push({ ...fnd, file: f });
        } catch { _quiet('admin:audit-report:summary'); /* skip */ }
      }

      // Baseline diff
      const baselinePath = baselineMod.resolveBaselinePath(repoRoot);
      const baseline = baselineMod.readBaseline(baselinePath);
      const findingsByFile = {};
      for (const fr of bugResult.files || []) findingsByFile[fr.file] = fr.findings;
      const diff = baseline ? baselineMod.diffAgainstBaseline(baseline, findingsByFile, repoRoot) : null;

      // Feedback calibration state
      const calibration = summarizeStore(repoRoot);

      // Healing stats (best-effort)
      let healing = null;
      try {
        const oracleHealing = oracle.healing || (oracle.store && oracle.store.getSQLiteStore()?.getAllHealingStats?.());
        if (oracleHealing) {
          const stats = Array.isArray(oracleHealing) ? oracleHealing : [oracleHealing];
          let attempts = 0, succeeded = 0;
          for (const s of stats) {
            attempts += s.attempts || 0;
            succeeded += s.succeeded || 0;
          }
          if (attempts > 0) healing = { attempts, succeeded };
        }
      } catch { _quiet('admin:audit-report:summary'); /* no healing data */ }

      const history = loadHistory(repoRoot);
      const rich = buildSummary({
        findings: bugFlat,
        smellFindings: smellFlat,
        lintFindings: lintFlat,
        priorFindings: priorFlat,
        diff: diff || undefined,
        calibration,
        healing,
        history,
      });
      // Record for trend tracking
      try { recordRun(repoRoot, bugFlat); } catch { _quiet('admin:audit-report:summary'); /* non-fatal */ }

      if (args.json === true) { out(JSON.stringify(rich, null, 2)); return; }

      out(c.boldCyan('Audit Summary\n'));
      out(c.bold('  Totals:'));
      out(`    Bugs:          ${rich.totals.bugs > 0 ? c.boldRed(String(rich.totals.bugs)) : c.boldGreen('0')}`);
      out(`    Style hints:   ${c.dim(String(rich.totals.styleHints))}`);
      out(`    Smells:        ${c.dim(String(rich.totals.smells))}`);
      out(`    Prior risks:   ${c.dim(String(rich.totals.priorRisks))}`);

      if (rich.breakdown.topBugClasses.length > 0) {
        out('\n' + c.bold('  Top bug classes:'));
        for (const { cls, count } of rich.breakdown.topBugClasses) {
          out(`    ${c.cyan(cls.padEnd(20))} ${c.bold(String(count))}`);
        }
      }
      if (rich.breakdown.topRules.length > 0) {
        out('\n' + c.bold('  Top rules:'));
        for (const { rule, count } of rich.breakdown.topRules.slice(0, 5)) {
          out(`    ${c.cyan(rule.padEnd(32))} ${c.bold(String(count))}`);
        }
      }

      if (rich.baseline.hasBaseline) {
        out('\n' + c.bold('  Baseline diff:'));
        out(`    New:          ${rich.baseline.newSinceBaseline > 0 ? c.yellow(String(rich.baseline.newSinceBaseline)) : c.dim('0')}`);
        out(`    Fixed:        ${rich.baseline.fixedSinceBaseline > 0 ? c.green(String(rich.baseline.fixedSinceBaseline)) : c.dim('0')}`);
        out(`    Persisted:    ${c.dim(String(rich.baseline.persistedFromBaseline))}`);
        if (rich.baseline.regressedFiles.length > 0) {
          out(c.bold('  Regressed files:'));
          for (const f of rich.baseline.regressedFiles.slice(0, 10)) out(`    ${c.red(f)}`);
        }
        if (rich.baseline.improvedFiles.length > 0) {
          out(c.bold('  Improved files:'));
          for (const f of rich.baseline.improvedFiles.slice(0, 10)) out(`    ${c.green(f)}`);
        }
      } else {
        out(c.dim('\n  No baseline — run `oracle audit baseline` to snapshot current state.'));
      }

      if (rich.worstFiles.length > 0) {
        out('\n' + c.bold('  Worst files:'));
        for (const { file, count } of rich.worstFiles.slice(0, 5)) {
          out(`    ${c.cyan(String(count).padStart(3))} ${c.dim(file)}`);
        }
      }

      if (rich.healing) {
        const rate = (rich.healing.successRate * 100).toFixed(0);
        out('\n' + c.bold('  Healing:'));
        out(`    ${rich.healing.succeeded}/${rich.healing.attempts} (${rate}%) fixes succeeded`);
      }

      if (rich.calibration.downgradedRules.length > 0) {
        out('\n' + c.bold('  Calibration:'));
        out(`    ${c.dim(String(rich.calibration.downgradedRules.length) + ' rule(s) downgraded based on feedback')}`);
        for (const r of rich.calibration.downgradedRules.slice(0, 5)) {
          out(`    ${c.cyan(r.ruleId.padEnd(32))} conf=${r.confidence.toFixed(2)}`);
        }
      }

      if (rich.trend.recent.length > 0) {
        const arrow = rich.trend.direction === 'up' ? c.red('\u2191')
                    : rich.trend.direction === 'down' ? c.green('\u2193')
                    : c.dim('\u2192');
        out('\n' + c.bold(`  Trend: ${arrow} delta ${rich.trend.delta >= 0 ? '+' : ''}${rich.trend.delta}`));
      }

      // Top-risk files from the Phase 2 bug-probability scorer. This
      // surfaces the files with the highest combined coherency +
      // cyclomatic risk at the end of `audit summary` so users see
      // them where they actually look. Skipped if `--no-risk` was
      // passed or if the scanner fails (e.g. empty tree).
      if (args['no-risk'] !== true) {
        try {
          const { computeBugProbability } = require('../../../quality/risk-score');
          const perFile = [];
          for (const file of files.slice(0, 300)) {
            try {
              const code = fs.readFileSync(file, 'utf-8');
              const r = computeBugProbability(code, { filePath: file });
              if (r.meta?.skipped) continue;
              perFile.push({ file, probability: r.probability, riskLevel: r.riskLevel, cyclomatic: r.signals.cyclomatic });
            } catch { _quiet('admin:audit-report:summary'); /* skip unreadable files */ }
          }
          const topRisk = perFile.slice().sort((a, b) => b.probability - a.probability).slice(0, 5);
          if (topRisk.length > 0) {
            out('\n' + c.bold('  Top-risk files (risk-score):'));
            for (const r of topRisk) {
              const color = r.riskLevel === 'HIGH' ? c.red
                          : r.riskLevel === 'MEDIUM' ? c.yellow
                          : c.green;
              out(`    ${color(r.riskLevel.padEnd(6))} ${c.bold(r.probability.toFixed(3))}  ${c.dim('cyc:' + r.cyclomatic)}  ${c.dim(r.file)}`);
            }
          }
        } catch { _quiet('admin:audit-report:summary'); /* non-fatal — risk-score is advisory */ }
      }

      out('');
      return;
    };

const _crossFile = (args, { oracle, jsonOut }) => {
      const { parseProgram } = require('../../../audit/parser');
      const { inferNullability, mergeProjectNullability } = require('../../../audit/type-inference');
      const { buildCallGraph, findNullDerefCascades } = require('../../../audit/call-graph');

      let files = [];
      const targetFile = args.file || args._positional[1];
      if (targetFile) {
        files = [targetFile];
      } else {
        try {
          const tracked = execSync('git ls-files "*.js" "*.mjs" "*.cjs" 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules') && !f.includes('/tests/'));
          files = tracked.slice(0, 200); // cap at 200 files for time
        } catch (_) { _quiet('admin:audit-report:cross-file', _); /* empty */ }
      }

      if (files.length === 0) {
        out(c.yellow('No files to analyze.'));
        return;
      }

      const parsed = [];
      const parsedByFile = new Map();
      for (const f of files) {
        try {
          const src = fs.readFileSync(f, 'utf-8');
          const program = parseProgram(src);
          parsed.push({ file: f, program });
          parsedByFile.set(f, program);
        } catch (_) { _quiet('admin:audit-report:cross-file', _); /* skip parse errors */ }
      }

      const graph = buildCallGraph(parsed);
      const perFile = parsed.map(({ program }) => inferNullability(program));
      const nullability = mergeProjectNullability(perFile);
      const findings = findNullDerefCascades(graph, nullability, parsedByFile);

      if (args.json === true) { out(JSON.stringify({ findings, stats: { files: parsed.length, functions: graph.defs.size } })); return; }

      out(c.boldCyan(`Cross-File Cascade Analysis \u2014 ${parsed.length} files, ${graph.defs.size} function(s)\n`));
      if (findings.length === 0) {
        out(c.boldGreen('  \u2713 No cross-file nullable-deref cascades found.\n'));
        return;
      }
      out(c.boldRed(`  ${findings.length} cross-file cascade(s):\n`));
      for (const f of findings) {
        out(`  ${c.bold(f.file)}:${f.line}`);
        out(`    ${c.dim('Assumes:')} ${f.assumption}`);
        out(`    ${c.dim('Reality:')} ${f.reality}`);
        out(`    ${c.dim('Fix:')}     ${f.suggestion}`);
      }
      return;
    };

module.exports = { _summary, _crossFile };
