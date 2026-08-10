'use strict';

const fs = require('fs');
const { execSync } = require('child_process');
const { c } = require('../../colors');
const { loadAuditBackend } = require('./helpers');
const { out, outErr, outWarn, _quiet, removeFile } = require('./out');

// audit subcommands, extracted from the admin monolith (decomposition #5,
// 2026-08-09). Bodies verbatim except the ./out print seam and _quiet
// failure naming.
const _baseline = (args, { oracle, jsonOut }) => {
      const baselineMod = require('../../../audit/baseline');
      const { auditFiles } = loadAuditBackend();
      const repoRoot = process.cwd();
      const baselinePath = baselineMod.resolveBaselinePath(repoRoot);

      if (args.show === true || args.show === 'true') {
        const existing = baselineMod.readBaseline(baselinePath);
        if (args.json === true) { out(JSON.stringify(existing || {})); return; }
        if (!existing) { out(c.yellow('No baseline exists.')); return; }
        out(c.boldCyan('Baseline'));
        out(`  Created:  ${existing.createdAt}`);
        out(`  Total:    ${existing.totalFindings}`);
        out(`  Files:    ${Object.keys(existing.files).length}`);
        return;
      }

      if (args.clear === true || args.clear === 'true') {
        if (fs.existsSync(baselinePath)) removeFile(baselinePath);
        out(c.yellow('Baseline cleared.'));
        return;
      }

      // Default: snapshot current findings
      let files = [];
      try {
        const tracked = execSync('git ls-files "*.js" "*.mjs" "*.cjs" 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules'));
        files = tracked;
      } catch (_) { _quiet('admin:audit-meta:baseline', _); /* empty */ }
      if (files.length === 0) {
        out(c.yellow('No files found to baseline.'));
        return;
      }
      const result = auditFiles(files);
      const findingsByFile = {};
      for (const fr of result.files || []) findingsByFile[fr.file] = fr.findings;
      const baseline = baselineMod.buildBaseline(findingsByFile, repoRoot);
      baselineMod.writeBaseline(baseline, baselinePath);
      out(c.boldGreen(`Baseline written: ${baselinePath}`));
      out(`  ${baseline.totalFindings} finding(s) across ${Object.keys(baseline.files).length} file(s).`);
      out(c.dim(`  Future \`audit check\` runs will hide these and only report new findings.`));
      out(c.dim(`  To rebuild: \`oracle audit baseline\` again, or delete with \`--clear\`.`));
      return;
    };

const _explain = (args, { oracle, jsonOut }) => {
      const { explain, listRules } = require('../../../audit/explain');
      const ruleId = args.rule || args._positional[1];
      if (!ruleId) {
        // List all rules
        const category = args.category || null;
        const rules = listRules(category);
        if (args.json === true) { out(JSON.stringify(rules)); return; }
        out(c.boldCyan(`Audit rules (${rules.length}):\n`));
        const groups = { bug: [], style: [], smell: [] };
        for (const r of rules) (groups[r.category] || []).push(r);
        for (const g of ['bug', 'style', 'smell']) {
          if (groups[g].length === 0) continue;
          out(c.bold(`  ${g.toUpperCase()}:`));
          for (const r of groups[g]) {
            const sev = r.severity === 'high' ? c.red : r.severity === 'medium' ? c.yellow : c.dim;
            out(`    ${sev((r.severity || 'info').padEnd(6))} ${c.cyan(r.ruleId.padEnd(32))} ${c.dim(r.summary)}`);
          }
          out('');
        }
        out(c.dim('  Use `oracle audit explain <rule>` for a worked example.'));
        return;
      }
      const info = explain(ruleId);
      if (args.json === true) { out(JSON.stringify(info || {})); return; }
      if (!info) {
        out(c.yellow(`Unknown rule: ${ruleId}`));
        out(c.dim('  Run `oracle audit explain` to list all rules.'));
        return;
      }
      out(c.boldCyan(`${ruleId}`));
      out(c.dim(`  category: ${info.category}  severity: ${info.severity}`));
      out('');
      out(c.bold('  Summary:'));
      out(`    ${info.summary}`);
      out('');
      out(c.bold('  Why it matters:'));
      out(`    ${info.why}`);
      out('');
      out(c.bold('  Bad:'));
      for (const line of info.bad.split('\n')) out(c.red(`    ${line}`));
      out('');
      out(c.bold('  Good:'));
      for (const line of info.good.split('\n')) out(c.green(`    ${line}`));
      out('');
      // Surface matching library patterns via the secondary indexes.
      // We look up by both ruleId (the explain key) and patternTag
      // so authors can associate patterns either way.
      try {
        const library = oracle.patterns;
        const matches = new Set();
        if (typeof library.findByRuleId === 'function') {
          for (const p of library.findByRuleId(ruleId)) matches.add(p);
        }
        if (info.patternTag && typeof library.findByTag === 'function') {
          for (const p of library.findByTag(info.patternTag)) matches.add(p);
        }
        if (matches.size > 0) {
          out(c.bold('  Library patterns:'));
          for (const p of Array.from(matches).slice(0, 3)) {
            out(`    ${c.cyan(p.name)} (${c.dim(p.language || 'unknown')})`);
          }
          if (info.patternTag) {
            out(c.dim('  Pull with: `oracle resolve --description "..." --tag ' + info.patternTag + '`'));
          }
        }
      } catch { _quiet('admin:audit-meta:explain'); /* no library */ }
      return;
    };

const _feedback = (args, { oracle, jsonOut }) => {
      const { recordFeedback, summarizeStore } = require('../../../audit/feedback');
      const action = args.action || args._positional[1]; // 'fix' | 'dismiss' | 'show'
      const ruleId = args.rule || args._positional[2];
      const repoRoot = process.cwd();

      if (!action || action === 'show') {
        const summary = summarizeStore(repoRoot);
        if (args.json === true) { out(JSON.stringify(summary)); return; }
        out(c.boldCyan(`Audit feedback (${summary.total} rule(s) observed):\n`));
        for (const row of summary.rules) {
          const conf = row.confidence == null ? '—' : row.confidence.toFixed(2);
          const sev = row.confidence != null && row.confidence < 0.4 ? c.red
            : row.confidence != null && row.confidence < 0.7 ? c.yellow : c.dim;
          out(`  ${c.cyan(row.ruleId.padEnd(32))} fixed=${row.fixed} dismissed=${row.dismissed} conf=${sev(conf)}`);
        }
        return;
      }

      if (action !== 'fix' && action !== 'dismiss') {
        out(c.yellow('Usage: oracle audit feedback fix|dismiss <ruleId> [--file <path> --line <n>]'));
        return;
      }
      if (!ruleId) {
        out(c.yellow('Usage: oracle audit feedback ' + action + ' <ruleId>'));
        return;
      }
      const rule = recordFeedback(repoRoot, action, ruleId, { file: args.file, line: args.line });
      out(c.boldGreen(`Recorded: ${ruleId} ${action}ed`));
      if (rule) {
        out(c.dim(`  fixed=${rule.fixed} dismissed=${rule.dismissed}`));
      }
      return;
    };

const _prior = (args, { oracle, jsonOut }) => {
      const { scorePrior, loadPrior } = require('../../../audit/bayesian-prior');
      const targetFile = args.file || args._positional[1];
      if (args.show === true || args.show === 'true') {
        const prior = loadPrior();
        out(c.boldCyan(`Bayesian bug-prior (${prior.patterns?.length || 0} entries):\n`));
        for (const e of (prior.patterns || [])) {
          out(`  ${c.cyan(e.name)} (${e.language || 'any'}) prior=${(e.priorBugRate || 0).toFixed(2)}`);
          out(`    ${c.dim(e.suggestion || '')}`);
        }
        return;
      }
      let files = [];
      if (targetFile) files = [targetFile];
      else {
        try {
          const tracked = execSync('git ls-files "*.js" 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules')).slice(0, 100);
          files = tracked;
        } catch { _quiet('admin:audit-meta:prior'); /* empty */ }
      }
      const allFindings = [];
      for (const f of files) {
        try {
          const src = fs.readFileSync(f, 'utf-8');
          const found = scorePrior(src, f);
          for (const fnd of found) allFindings.push({ ...fnd, file: f });
        } catch { _quiet('admin:audit-meta:prior'); /* skip */ }
      }
      if (args.json === true) { out(JSON.stringify(allFindings)); return; }
      if (allFindings.length === 0) {
        out(c.boldGreen('  \u2713 No bug-prior matches.'));
        return;
      }
      out(c.boldCyan(`Bug-prior matches (${allFindings.length}):\n`));
      for (const f of allFindings) {
        const sev = f.severity === 'medium' ? c.yellow : c.dim;
        out(`  ${sev(f.severity.toUpperCase().padEnd(6))} ${c.bold(f.file)}  (${c.dim(f.evidence.matchedPattern)} sim=${f.evidence.similarity.toFixed(2)})`);
        out(`    ${c.dim(f.suggestion)}`);
      }
      return;
    };

const _priorPromote = (args, { oracle, jsonOut }) => {
      const { promoteFromSubstrate } = require('../../../audit/prior-promoter');
      const opts = {
        amplitudeThreshold: args.threshold ? Number(args.threshold) : 0.7,
        maxPromote: args['max-promote'] ? Number(args['max-promote']) : 50,
        dryRun: args['dry-run'] === true || args['dry-run'] === 'true',
      };
      const result = promoteFromSubstrate(oracle, opts);
      if (args.json === true) { out(JSON.stringify(result, null, 2)); return; }
      out(c.boldCyan('Bayesian bug-prior promotion'));
      out(`  Considered: ${result.considered}`);
      out(`  Promoted:   ${result.promoted > 0 ? c.boldGreen(String(result.promoted)) : c.dim('0')}`);
      out(`  Updated:    ${result.updated > 0 ? c.yellow(String(result.updated)) : c.dim('0')}`);
      out(`  Skipped:    ${c.dim(String(result.skipped))}`);
      if (result.dryRun) out(c.yellow('  DRY RUN — seed file not written'));
      if (result.reason) out(c.dim('  ' + result.reason));
      if (result.entries.length > 0) {
        out('');
        for (const e of result.entries.slice(0, 10)) {
          const icon = e.action === 'promote' ? c.green('+') : c.yellow('~');
          out(`  ${icon} ${c.cyan(e.name)}  amp=${(e.amplitude || 0).toFixed(2)}  prior=${e.priorBugRate.toFixed(2)}`);
        }
      }
      return;
    };

const _xref = (args, { oracle, jsonOut }) => {
      const { auditFiles } = loadAuditBackend();
      const { crossReference, crossReferenceSummary } = require('../../../audit/cross-reference');

      let files = [];
      const targetFile = args.file || args._positional[1];
      if (targetFile) {
        files = [targetFile];
      } else {
        try {
          const changed = execSync('git diff HEAD~1 --name-only --diff-filter=ACM 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => /\.(js|ts)$/.test(f) && f.trim());
          files = changed;
        } catch (_) { _quiet('admin:audit-meta:xref', _); /* empty */ }
      }

      if (files.length === 0) {
        out(c.yellow('No files to cross-reference.'));
        return;
      }

      const result = auditFiles(files);
      const allFindings = result.files.flatMap(f => f.findings);
      const enriched = crossReference(allFindings, oracle);
      const summary = crossReferenceSummary(enriched);

      if (args.json === true) { out(JSON.stringify({ findings: enriched, summary })); return; }

      out(c.boldCyan(`Cross-Reference Report \u2014 ${files.length} file(s)\n`));
      out(`  Findings:    ${c.bold(String(summary.totalFindings))}`);
      out(`  With fixes:  ${summary.withFixes > 0 ? c.boldGreen(String(summary.withFixes)) : c.dim('0')}`);
      out(`  Fix rate:    ${c.bold(summary.fixRate)}\n`);

      if (summary.actionable.length > 0) {
        out(c.bold('  Actionable items:'));
        for (const item of summary.actionable) {
          out(`    L${String(item.line).padStart(4)} [${c.cyan(item.bugClass)}]`);
          out(`      ${c.dim('Issue:')}  ${item.assumption}`);
          out(`      ${c.dim('Fix:')}    ${c.green(item.topFix.fixDescription || item.topFix.fixCode?.slice(0, 80) || 'available')}`);
          out(`      ${c.dim('Source:')} ${item.topFix.errorMessage || 'debug pattern'} (amplitude: ${c.bold(String((item.topFix.amplitude || 0).toFixed(2)))})`);
          if (item.alternativeFixes > 0) out(`      ${c.dim(`+${item.alternativeFixes} alternative(s)`)}`);
        }
        out('');
      }

      if (Object.keys(summary.coverage).length > 0) {
        out(c.bold('  Coverage by bug class:'));
        for (const [cls, cov] of Object.entries(summary.coverage)) {
          const rate = cov.total > 0 ? (cov.withFix / cov.total * 100).toFixed(0) : '0';
          out(`    ${c.cyan(cls.padEnd(16))} ${cov.withFix}/${cov.total} (${rate}%)`);
        }
      }
      return;
    };

const _log = (args, { oracle, jsonOut }) => {
      // Original audit log behavior
      const entries = sqliteStore.getAuditLog({
        limit: parseInt(args.limit, 10) || 20,
        table: args.table,
        id: args.id,
        action: args.action,
      });
      if (entries.length === 0) {
        out(c.yellow('No audit log entries found.'));
      } else {
        out(c.boldCyan(`Audit Log (${entries.length} entries):\n`));
        for (const e of entries) {
          const actionColor = e.action === 'add' ? c.green : e.action === 'prune' || e.action === 'retire' ? c.red : c.yellow;
          out(`  ${c.dim(e.timestamp)} ${actionColor(e.action.padEnd(7))} ${c.cyan(e.table.padEnd(8))} ${c.dim(e.id)} ${c.dim(JSON.stringify(e.detail))}`);
        }
      }
      return;
    };

module.exports = { _baseline, _explain, _feedback, _prior, _priorPromote, _xref, _log };
