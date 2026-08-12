'use strict';

const { execSync } = require('child_process');
const { c } = require('../../colors');
const { loadAuditBackend } = require('./helpers');
const { out, outErr, outWarn, _quiet } = require('./out');

// audit subcommands, extracted from the admin monolith (decomposition #5,
// 2026-08-09). Bodies verbatim except the ./out print seam and _quiet
// failure naming.
const _check = (args, { oracle, jsonOut }) => {
      const { auditFiles, auditFile, BUG_CLASSES } = loadAuditBackend();
      const targetFile = args.file || args._positional[1];

      let files = [];
      if (targetFile) {
        files = [targetFile];
      } else {
        // Default: scan staged or recently changed files
        try {
          const staged = execSync('git diff --cached --name-only --diff-filter=ACM 2>/dev/null || git diff HEAD~1 --name-only --diff-filter=ACM 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => /\.(js|ts)$/.test(f) && f.trim());
          files = staged;
        } catch (_) {
          // Fall back to all JS files in src/
          try {
            const allSrc = execSync('find src -name "*.js" -not -path "*/node_modules/*" 2>/dev/null | head -100', { encoding: 'utf-8' })
              .trim().split('\n').filter(f => f.trim());
            files = allSrc;
          } catch (__) { _quiet('admin:audit-run:check', __); /* empty */ }
        }
      }

      if (files.length === 0) {
        out(c.yellow('No files to audit. Specify --file or have staged changes.'));
        return;
      }

      const bugClasses = args['bug-class'] ? args['bug-class'].split(',').map(s => s.trim()) : undefined;
      const minSeverity = args['min-severity'] || undefined;
      const result = auditFiles(files, { bugClasses, minSeverity });

      // ─── Tier-coverage check — architectural self-similarity ────────
      // Runs alongside the static checkers. For each file, if there's
      // a nearest architecture.json walking up the directory tree, the
      // file's call graph is compared against the declared tiers and
      // a finding is emitted when the file engages a strict subset
      // (unless it opts out with a `single-tier-by-design:` marker).
      // Silent no-op when no manifest exists anywhere above the file.
      try {
        const tierCoverage = require('../../../audit/tier-coverage');
        const fileResultMap = new Map();
        for (const fr of result.files || []) {
          fileResultMap.set(fr.file, fr);
        }
        for (const f of files) {
          const tcResult = tierCoverage.checkFile(f);
          if (!tcResult || tcResult.findings.length === 0) continue;
          let fr = fileResultMap.get(f);
          if (!fr) {
            fr = { file: f, findings: [], summary: { total: 0, byClass: {}, bySeverity: {} } };
            result.files.push(fr);
            fileResultMap.set(f, fr);
          }
          fr.findings.push(...tcResult.findings);
          fr.summary.total = (fr.summary.total || 0) + tcResult.findings.length;
          fr.summary.byClass = fr.summary.byClass || {};
          fr.summary.byClass['tier-coverage'] = (fr.summary.byClass['tier-coverage'] || 0) + tcResult.findings.length;
          fr.summary.bySeverity = fr.summary.bySeverity || {};
          for (const tf of tcResult.findings) {
            fr.summary.bySeverity[tf.severity] = (fr.summary.bySeverity[tf.severity] || 0) + 1;
          }
          result.totalFindings = (result.totalFindings || 0) + tcResult.findings.length;
          if (result.summary) {
            result.summary.byClass = result.summary.byClass || {};
            result.summary.byClass['tier-coverage'] = (result.summary.byClass['tier-coverage'] || 0) + tcResult.findings.length;
            result.summary.bySeverity = result.summary.bySeverity || {};
            for (const tf of tcResult.findings) {
              result.summary.bySeverity[tf.severity] = (result.summary.bySeverity[tf.severity] || 0) + 1;
            }
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) outWarn('[audit:tier-coverage]', e.message);
      }

      // Compliance: every audited file counts toward the audit-on-write
      // check. Emit a bus event per file so the session ledger records it.
      try {
        const { getEventBus } = require('../../../core/events');
        const bus = getEventBus();
        for (const f of files) bus.emitSync('audit.file-scanned', { file: f });
      } catch { _quiet('admin:audit-run:check'); /* ignore */ }

      // ─── Tier 3: baseline + calibration + auto-fix ────────────────────
      // Each file result carries a `findings` array. Re-key them into a
      // per-file map so baseline / feedback can diff and calibrate.
      const repoRoot = process.cwd();
      const useBaseline = args['no-baseline'] !== true && args['no-baseline'] !== 'true';
      const useCalibration = args['no-calibrate'] !== true && args['no-calibrate'] !== 'true';

      const findingsByFile = {};
      for (const fr of result.files || []) {
        findingsByFile[fr.file] = fr.findings;
      }

      let diff = null;
      if (useBaseline) {
        try {
          const baselineMod = require('../../../audit/baseline');
          const baselinePath = baselineMod.resolveBaselinePath(repoRoot);
          const baseline = baselineMod.readBaseline(baselinePath);
          if (baseline) {
            diff = baselineMod.diffAgainstBaseline(baseline, findingsByFile, repoRoot);
            // Replace per-file findings with NEW findings only (baseline hides known debt)
            const hiddenCount = diff.persisted.length;
            for (const fr of result.files) {
              fr.findings = fr.findings.filter(f =>
                diff.new.some(n => n.file === fr.file && n.line === f.line && n.ruleId === f.ruleId)
              );
            }
            result.files = result.files.filter(fr => fr.findings.length > 0);
            result.totalFindings = diff.new.length;
            result._baselineHidden = hiddenCount;
            result._baselineNew = diff.new.length;
            result._baselineFixed = diff.fixed.length;
          }
        } catch (e) { if (process.env.ORACLE_DEBUG) outWarn('[audit:baseline]', e.message); }
      }

      if (useCalibration) {
        try {
          const { calibrateFindings } = require('../../../audit/feedback');
          for (const fr of result.files) {
            fr.findings = calibrateFindings(fr.findings, repoRoot);
          }
          // Recount after calibration (drops noise-gated findings)
          let newTotal = 0;
          for (const fr of result.files) newTotal += fr.findings.length;
          result.totalFindings = newTotal;
        } catch (e) { if (process.env.ORACLE_DEBUG) outWarn('[audit:calibration]', e.message); }
      }

      // Auto-fix pass
      let autoFixReport = null;
      if (args['auto-fix'] === true || args['auto-fix'] === 'true' || args.fix === true) {
        try {
          const { autoFixFile } = require('../../../audit/auto-fix');
          autoFixReport = { fixed: 0, unfixed: 0, touched: [] };
          const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
          for (const fr of result.files) {
            const r = autoFixFile(fr.file, fr.findings, { write: !dryRun });
            autoFixReport.fixed += r.fixed;
            autoFixReport.unfixed += r.unfixed.length;
            if (r.fixed > 0) autoFixReport.touched.push({ file: fr.file, fixed: r.fixed, dryRun });
            fr.findings = r.unfixed;
          }
          let newTotal = 0;
          for (const fr of result.files) newTotal += fr.findings.length;
          result.totalFindings = newTotal;
        } catch (e) { if (process.env.ORACLE_DEBUG) outWarn('[audit:auto-fix]', e.message); }
      }

      if (args.json === true) { out(JSON.stringify(result)); return; }

      out(c.boldCyan(`Audit Check \u2014 ${result.summary.filesScanned} files scanned\n`));

      if (typeof result._baselineHidden === 'number') {
        out(c.dim(`  Baseline: ${result._baselineHidden} known-debt finding(s) hidden, ${result._baselineNew} new, ${result._baselineFixed} fixed since baseline.\n`));
      }

      if (autoFixReport) {
        const verb = (args['dry-run'] === true || args['dry-run'] === 'true') ? 'would fix' : 'fixed';
        out(c.boldGreen(`  Auto-fix: ${verb} ${autoFixReport.fixed} finding(s), ${autoFixReport.unfixed} remaining.`));
        for (const t of autoFixReport.touched) {
          out(c.dim(`    ${t.file}: ${t.fixed} patch(es)${t.dryRun ? ' (dry run)' : ''}`));
        }
        out('');
      }

      // Session compliance banner — visible on every audit check run
      // so the score stays in the developer's face until it's fixed.
      try {
        const { complianceBanner } = require('../../../core/compliance');
        const banner = complianceBanner(repoRoot);
        if (banner) {
          const color = banner.score >= 0.5 ? c.yellow : c.boldRed;
          out(color(`  Session compliance: ${(banner.score * 100).toFixed(0)}% (${banner.status})`));
          if (banner.topViolation) {
            out(c.dim(`    top issue: ${banner.topViolation.message}`));
            out(c.dim(`    fix: ${banner.topViolation.fix}`));
          }
          out('');
        }
      } catch { _quiet('admin:audit-run:check'); /* ignore */ }

      if (result.totalFindings === 0) {
        out(c.boldGreen('  \u2713 No assumption mismatches found!\n'));
        return;
      }

      out(c.boldRed(`  ${result.totalFindings} assumption mismatch(es) found:\n`));

      for (const fileResult of result.files) {
        out(`  ${c.bold(fileResult.file)}:`);
        for (const f of fileResult.findings) {
          const sevColor = f.severity === 'high' ? c.red : f.severity === 'medium' ? c.yellow : c.dim;
          out(`    ${sevColor(f.severity.toUpperCase().padEnd(6))} L${String(f.line).padStart(4)} [${c.cyan(f.bugClass)}]`);
          out(`      ${c.dim('Assumes:')} ${f.assumption}`);
          out(`      ${c.dim('Reality:')} ${f.reality}`);
          out(`      ${c.dim('Fix:')}     ${f.suggestion}`);
        }
        out('');
      }

      // Cross-reference with debug patterns if oracle available
      try {
        const { crossReference, crossReferenceSummary } = require('../../../audit/cross-reference');
        const allFindings = result.files.flatMap(f => f.findings);
        const enriched = crossReference(allFindings, oracle);
        const xrefSummary = crossReferenceSummary(enriched);
        if (xrefSummary.withFixes > 0) {
          out(c.bold('  Known Fixes:'));
          for (const item of xrefSummary.actionable) {
            out(`    L${String(item.line).padStart(4)} [${c.cyan(item.bugClass)}] ${c.dim('\u2192')} ${c.green(item.topFix.fixDescription || 'fix available')}`);
            if (item.alternativeFixes > 0) out(`          ${c.dim(`+${item.alternativeFixes} alternative fix(es)`)}`);
          }
          out('');
        }
      } catch (_) { _quiet('admin:audit-run:check', _);
        // Cross-reference not available — non-critical
      }

      out(c.bold('  Summary:'));
      for (const [cls, count] of Object.entries(result.summary.byClass)) {
        out(`    ${c.cyan(cls.padEnd(16))} ${c.bold(String(count))}`);
      }
      return;
    };

const _cascade = (args, { oracle, jsonOut }) => {
      const { detectCascade } = require('../../../audit/cascade-detector');
      const commitRange = args.from || 'HEAD~1..HEAD';
      const result = detectCascade(commitRange, process.cwd());

      if (args.json === true) { out(JSON.stringify(result)); return; }

      out(c.boldCyan(`Cascade Detection \u2014 from ${c.bold(commitRange)}\n`));

      if (result.changedFunctions.length > 0) {
        out(c.bold('  Changed functions:'));
        for (const cf of result.changedFunctions) {
          out(`    ${c.dim(cf.file)}: ${cf.functions.map(f => c.cyan(f)).join(', ')}`);
        }
        out('');
      }

      if (result.cascades.length === 0) {
        out(c.boldGreen('  \u2713 No cascading assumption mismatches found!\n'));
        return;
      }

      out(c.boldRed(`  ${result.summary.cascadesFound} cascading mismatch(es):\n`));

      for (const cascade of result.cascades) {
        out(`    ${c.red('\u26A0')} ${c.bold(cascade.sourceFunction)} (${c.dim(cascade.sourceFile)})`);
        out(`      \u2192 ${c.cyan(cascade.targetFile)}:${cascade.targetLine}`);
        out(`      ${c.dim('Type:')} ${cascade.assumptionType}`);
        out(`      ${c.dim('Risk:')} ${cascade.assumptionBroken}`);
        out(`      ${c.dim('Code:')} ${cascade.targetCode}`);
        out('');
      }

      if (Object.keys(result.summary.byType).length > 0) {
        out(c.bold('  By type:'));
        for (const [type, count] of Object.entries(result.summary.byType)) {
          out(`    ${c.cyan(type.padEnd(16))} ${c.bold(String(count))}`);
        }
      }
      return;
    };

module.exports = { _check, _cascade };
