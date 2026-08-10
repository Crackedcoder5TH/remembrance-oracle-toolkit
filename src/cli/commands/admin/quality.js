'use strict';
const fs = require('fs');
const { execSync } = require('child_process');
const { c } = require('../../colors');
const { out, outErr, outWarn, _quiet } = require('./out');

// Extracted from the admin monolith (decomposition #5, 2026-08-09).
// Handler bodies are verbatim except: console.* routed through the
// ./out seam, and every best-effort catch now names its failure via
// _quiet — silence became a measurement.
function registerQualityCommands(handlers, { oracle, jsonOut }) {
  handlers['lint'] = (args) => {
    const { lintFiles } = require('../../../audit/lint-checkers');
    const targetFile = args.file || args._positional[1];

    let files = [];
    if (targetFile) {
      files = [targetFile];
    } else {
      try {
        const staged = execSync('git diff --cached --name-only --diff-filter=ACM 2>/dev/null || git diff HEAD~1 --name-only --diff-filter=ACM 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => /\.(js|ts|mjs|cjs)$/.test(f) && f.trim());
        files = staged;
      } catch (_) { _quiet('admin:quality', _); /* empty */ }
    }

    if (files.length === 0) {
      out(c.yellow('No files to lint. Specify --file or have staged changes.'));
      return;
    }

    const result = lintFiles(files);
    if (args.json === true) { out(JSON.stringify(result)); return; }

    out(c.boldCyan(`Lint \u2014 ${result.summary.filesScanned} files scanned\n`));

    if (result.totalFindings === 0) {
      out(c.boldGreen('  \u2713 No lint findings.\n'));
      return;
    }

    out(c.bold(`  ${result.totalFindings} finding(s):\n`));
    for (const fileResult of result.files) {
      out(`  ${c.bold(fileResult.file)}:`);
      for (const f of fileResult.findings) {
        const sevColor = f.severity === 'warn' ? c.yellow : c.dim;
        out(`    ${sevColor((f.severity || 'info').toUpperCase().padEnd(5))} L${String(f.line).padStart(4)} [${c.cyan(f.ruleId)}]`);
        out(`      ${f.message}`);
        if (f.suggestion) out(`      ${c.dim('Fix:')}  ${f.suggestion}`);
      }
      out('');
    }

    out(c.bold('  Summary:'));
    for (const [rule, count] of Object.entries(result.summary.byRule)) {
      out(`    ${c.cyan(rule.padEnd(28))} ${c.bold(String(count))}`);
    }
  };
  handlers['risk-score'] = (args) => {
    const { computeBugProbability } = require('../../../quality/risk-score');
    const targetFile = args.file || args._positional[1];
    if (!targetFile) {
      outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle risk-score <file>')} [--json]`);
      process.exit(1);
    }
    const fs = require('fs');
    if (!fs.existsSync(targetFile)) {
      outErr(c.boldRed('Error:') + ` File not found: ${targetFile}`);
      process.exit(1);
    }
    const code = fs.readFileSync(targetFile, 'utf-8');
    const result = computeBugProbability(code, { filePath: targetFile });

    // Stage-5 feedback harness: log every prediction so we can join
    // it to outcomes later and retune weights once we have ~200+
    // paired rows. Silent, best-effort, never blocks the command.
    try {
      const { recordPrediction } = require('../../../quality/feedback-store');
      const { getCurrentSession } = require('../../../core/compliance');
      const sess = getCurrentSession(process.cwd());
      recordPrediction({
        file: targetFile,
        probability: result.probability,
        riskLevel: result.riskLevel,
        cyclomatic: result.signals?.cyclomatic || 0,
        totalCoherency: result.signals?.totalCoherency || 0,
        sessionId: sess?.id || null,
      }, { repoRoot: process.cwd() });
    } catch { _quiet('admin:quality'); /* advisory — never break risk-score */ }

    if (jsonOut()) { out(JSON.stringify(result)); return; }

    const color =
      result.riskLevel === 'HIGH'   ? c.boldRed   :
      result.riskLevel === 'MEDIUM' ? c.boldYellow :
      c.boldGreen;
    out('');
    out(`${c.boldCyan('Risk score —')} ${c.bold(targetFile)}`);
    out(`  ${color(result.riskLevel.padEnd(6))}  probability: ${c.bold(result.probability.toFixed(4))}`);
    out('');
    out(c.bold('  Components:'));
    out(`    coherency risk:  ${result.components.coherencyRisk.toFixed(4)}`);
    out(`    cyclomatic risk: ${result.components.cyclomaticRisk.toFixed(4)}`);
    out('');
    out(c.bold('  Signals:'));
    out(`    total coherency:   ${result.signals.totalCoherency}`);
    out(`    cyclomatic:        ${result.signals.cyclomatic}`);
    out(`    max depth:         ${result.signals.maxDepth}`);
    out(`    lines:             ${result.signals.lines}`);
    out(`    fractal alignment: ${result.signals.fractalAlignment}`);
    out('');
    if (result.topFactors.length > 0) {
      out(c.bold('  Top risk factors:'));
      for (const f of result.topFactors) {
        out(`    ${c.yellow('•')} ${c.bold(f.name)}  severity: ${f.severity.toFixed(3)}`);
        out(`      ${c.dim(f.message)}`);
      }
      out('');
    }
    if (result.recommendations.length > 0) {
      out(c.bold('  Recommendations:'));
      for (const rec of result.recommendations) {
        out(`    ${c.cyan('→')} ${rec}`);
      }
      out('');
    }
  };
  handlers['risk-scan'] = (args) => {
    const { scanDirectory } = require('../../../quality/risk-scanner');
    const targetDir = args.dir || args._positional[1] || process.cwd();
    const topN = Number(args.top) || 10;
    const filter = args.filter || null; // 'HIGH' | 'MEDIUM' | 'LOW'

    const report = scanDirectory(targetDir, {
      topN,
      onFile: args.verbose
        ? (file, idx, total) => outErr(c.dim(`[${idx}/${total}] ${file}`))
        : null,
    });

    if (jsonOut()) { out(JSON.stringify(report)); return; }

    if (report.error) {
      outErr(c.boldRed('Error:') + ' ' + report.error);
      process.exit(1);
    }

    out('');
    out(`${c.boldCyan('Risk scan —')} ${c.bold(report.root)}`);
    out(`  ${c.dim(report.scannedAt)}`);
    out('');
    out(c.bold('  Summary:'));
    out(`    files scanned:      ${report.stats.total}`);
    out(`    mean probability:   ${report.stats.meanProbability.toFixed(4)}`);
    out(`    median probability: ${report.stats.medianProbability.toFixed(4)}`);
    out('');
    out(c.bold('  By risk level:'));
    out(`    ${c.boldRed('HIGH  ')}  ${String(report.stats.byRisk.HIGH).padStart(4)}`);
    out(`    ${c.boldYellow('MEDIUM')}  ${String(report.stats.byRisk.MEDIUM).padStart(4)}`);
    out(`    ${c.boldGreen('LOW   ')}  ${String(report.stats.byRisk.LOW).padStart(4)}`);
    if (report.stats.byRisk.SKIPPED > 0) {
      out(`    ${c.dim('SKIPPED')} ${String(report.stats.byRisk.SKIPPED).padStart(4)}  ${c.dim('(unparseable / empty)')}`);
    }
    out('');

    const toShow = filter
      ? report.files.filter(f => f.riskLevel === filter.toUpperCase()).slice(0, topN)
      : report.stats.top;

    if (toShow.length > 0) {
      const label = filter ? `All ${filter.toUpperCase()} files (top ${topN}):` : `Top ${topN} worst offenders:`;
      out(c.bold(`  ${label}`));
      for (const f of toShow) {
        const color =
          f.riskLevel === 'HIGH'   ? c.red   :
          f.riskLevel === 'MEDIUM' ? c.yellow :
          c.green;
        out(`    ${color(f.riskLevel.padEnd(6))} ${c.bold(f.probability.toFixed(4))}  ${f.file}  ${c.dim('cyc:' + f.signals.cyclomatic + ' lines:' + f.signals.lines)}`);
      }
      out('');
    }
  };
  handlers['feedback-stats'] = (_args) => {
    const { loadStats } = require('../../../quality/feedback-store');
    const stats = loadStats({ repoRoot: process.cwd() });
    if (jsonOut()) { out(JSON.stringify(stats)); return; }
    out('');
    out(c.boldCyan('Feedback store'));
    out(`  total predictions  : ${stats.totalPredictions}`);
    out(`  outcomes paired    : ${stats.totalPaired}`);
    out(`  unpaired           : ${stats.unpaired}`);
    out('');
    out(c.bold('  By risk level:'));
    out(`    ${c.boldRed('HIGH  ')}  ${String(stats.byRiskLevel.HIGH).padStart(4)}`);
    out(`    ${c.boldYellow('MEDIUM')}  ${String(stats.byRiskLevel.MEDIUM).padStart(4)}`);
    out(`    ${c.boldGreen('LOW   ')}  ${String(stats.byRiskLevel.LOW).padStart(4)}`);
    out('');
    if (stats.readyForTraining) {
      out(c.boldGreen('  \u2713 Ready for training (200+ paired rows)'));
    } else {
      const need = 200 - stats.totalPaired;
      out(c.dim(`  Need ${need} more paired rows before training is worthwhile.`));
    }
    out('');
  };
  handlers['smell'] = (args) => {
    const { smellFiles } = require('../../../audit/smell-checkers');
    const targetFile = args.file || args._positional[1];
    let files = [];
    if (targetFile) files = [targetFile];
    else {
      try {
        const tracked = execSync('git ls-files "*.js" "*.mjs" "*.cjs" 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules'));
        files = tracked;
      } catch (_) { _quiet('admin:quality', _); /* empty */ }
    }
    if (files.length === 0) {
      out(c.yellow('No files found.'));
      return;
    }

    // Parse --threshold k=v flags
    const thresholds = {};
    if (args.threshold) {
      const parts = (Array.isArray(args.threshold) ? args.threshold : [args.threshold]);
      for (const p of parts) {
        const [k, v] = String(p).split('=');
        if (k && v != null) thresholds[k] = Number(v) || v;
      }
    }

    const result = smellFiles(files, { thresholds });
    if (args.json === true) { out(JSON.stringify(result)); return; }

    out(c.boldCyan(`Smell \u2014 ${result.summary.filesScanned} files scanned\n`));
    if (result.totalFindings === 0) {
      out(c.boldGreen('  \u2713 No smells found.\n'));
      return;
    }
    out(c.bold(`  ${result.totalFindings} finding(s):\n`));
    for (const fileResult of result.files) {
      out(`  ${c.bold(fileResult.file)}:`);
      for (const f of fileResult.findings) {
        out(`    ${c.dim('INFO ')} L${String(f.line).padStart(4)} [${c.cyan(f.ruleId)}]`);
        out(`      ${f.message}`);
        if (f.suggestion) out(`      ${c.dim('Fix:')}  ${f.suggestion}`);
      }
      out('');
    }
    out(c.bold('  Summary:'));
    for (const [rule, count] of Object.entries(result.summary.byRule)) {
      out(`    ${c.cyan(rule.padEnd(28))} ${c.bold(String(count))}`);
    }
  };
}
registerQualityCommands.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 4,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'orchestration',
};

module.exports = { registerQualityCommands };
