'use strict';
const fs = require('fs');
const path = require('path');
const { c } = require('../../colors');
const { out, outErr, outWarn, _quiet } = require('./out');
const { computeSessionMeanRisk } = require('./helpers');

// Extracted from the admin monolith (decomposition #5, 2026-08-09).
// Handler bodies are verbatim except: console.* routed through the
// ./out seam, and every best-effort catch now names its failure via
// _quiet — silence became a measurement.
function registerSessionCommands(handlers, { oracle, jsonOut }) {
  handlers['session'] = (args) => {
    const {
      startSession, endSession, getCurrentSession, saveSession,
      recordEvent, scoreCompliance,
    } = require('../../../core/compliance');
    const repoRoot = process.cwd();
    const sub = args._sub || 'status';

    if (sub === 'start') {
      const s = startSession(repoRoot, { agent: args.agent || process.env.ORACLE_AGENT });
      // Snapshot the baseline risk score so `session end` can show
      // whether the session improved or regressed the codebase.
      const baselineRisk = computeSessionMeanRisk(repoRoot);
      if (baselineRisk !== null) {
        recordEvent(s, 'risk.snapshot', { phase: 'start', meanRisk: baselineRisk });
        saveSession(s, repoRoot);
      }
      out(c.boldGreen('Session started:'));
      out(`  id:      ${c.cyan(s.id)}`);
      out(`  started: ${c.dim(s.startedAt)}`);
      if (baselineRisk !== null) {
        out(`  baseline risk: ${c.dim(baselineRisk.toFixed(4))} ${c.dim('(mean probability across src/)')}`);
      }
      out(c.dim('  Every search / write / audit from now on is tracked.'));
      out(c.dim('  Run `oracle session status` to see compliance live.'));
      out(c.dim('  Run `oracle session end` when the session is done.'));
      return;
    }

    if (sub === 'status') {
      const s = getCurrentSession(repoRoot);
      if (!s) {
        out(c.yellow('No active session. Start one with: oracle session start'));
        return;
      }
      const score = scoreCompliance(s);
      if (args.json === true) { out(JSON.stringify({ session: s, score }, null, 2)); return; }
      const scoreColor = score.score >= 0.9 ? c.boldGreen : score.score >= 0.5 ? c.yellow : c.boldRed;
      out(c.boldCyan('Session status'));
      out(`  id:      ${c.cyan(s.id)}`);
      out(`  agent:   ${c.dim(s.agent || 'unknown')}`);
      out(`  started: ${c.dim(s.startedAt)}`);
      out(`  ended:   ${s.endedAt ? c.dim(s.endedAt) : c.yellow('(open)')}`);
      out('');
      out(`  Compliance:  ${scoreColor((score.score * 100).toFixed(0) + '%')}  [${score.status}]`);
      out(`  Stats:       written=${score.stats.filesWritten} searched=${score.stats.filesSearched} audited=${score.stats.filesAudited} pulled=${score.stats.patternsPulled} fedBack=${score.stats.patternsFedBack}`);
      if (score.violations.length > 0) {
        out('');
        out(c.bold('  Violations:'));
        for (const v of score.violations) {
          out(`    ${c.red('✗')} ${v.check} (weight ${v.weight})`);
          out(`      ${v.message}`);
          out(`      ${c.dim('fix:')} ${c.cyan(v.fix)}`);
          if (v.files && v.files.length > 0) {
            out(`      ${c.dim('files:')} ${v.files.slice(0, 5).join(', ')}${v.files.length > 5 ? ' …' : ''}`);
          }
        }
      } else {
        out('');
        out(c.boldGreen('  ✓ Fully compliant'));
      }
      return;
    }

    if (sub === 'end') {
      const s = endSession(repoRoot);
      if (!s) { out(c.yellow('No session to end.')); return; }
      const score = scoreCompliance(s);
      // Compute the end-of-session risk score and compare against
      // the start snapshot (if any). The delta tells us whether the
      // session improved or regressed codebase risk.
      const endRisk = computeSessionMeanRisk(repoRoot);
      const startSnapshot = (s.events || []).find(e => e.kind === 'risk.snapshot' && e.payload?.phase === 'start');
      const startRisk = startSnapshot?.payload?.meanRisk ?? null;
      out(c.boldCyan('Session ended:'));
      out(`  id:     ${c.cyan(s.id)}`);
      out(`  duration: ${c.dim(s.startedAt)} → ${c.dim(s.endedAt)}`);
      out(`  final compliance: ${(score.score * 100).toFixed(0)}% (${score.status})`);
      if (endRisk !== null) {
        if (startRisk !== null) {
          const delta = endRisk - startRisk;
          const arrow = delta < -0.001 ? c.green('↓') : delta > 0.001 ? c.red('↑') : c.dim('→');
          const sign = delta >= 0 ? '+' : '';
          out(`  risk score: ${startRisk.toFixed(4)} → ${endRisk.toFixed(4)}  ${arrow} ${sign}${delta.toFixed(4)}`);
        } else {
          out(`  risk score: ${c.dim(endRisk.toFixed(4))} ${c.dim('(no start snapshot)')}`);
        }
      }
      if (score.violations.length > 0) {
        out('');
        out(c.yellow('  Final violations:'));
        for (const v of score.violations.slice(0, 5)) {
          out(`    ${c.red('✗')} ${v.check}: ${v.message}`);
        }
      }

      // ── Auto-gather patterns + share with void substrate ─────────
      try {
        const { VoidBridge } = require('../../../compression/void-bridge');
        const bridge = new VoidBridge(repoRoot);
        if (bridge.connected) {
          const result = bridge.exportToSubstrate();
          if (result.exported > 0) {
            out('');
            out(c.boldGreen('Patterns shared with Void substrate:'));
            out(`  ${c.green('+' + result.exported)} new patterns merged (${result.total} total in substrate)`);
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) outErr('[session-end:void-share]', e.message);
      }

      // ── Auto-harvest + auto-submit to capture anything missed ────
      try {
        const { execSync } = require('child_process');
        const { execFileSync } = require('child_process');
        execFileSync('node', [path.join(repoRoot, 'src/cli.js'), 'auto-submit'], {
          cwd: repoRoot, timeout: 30000, stdio: 'pipe',
        });
        out(c.dim('  Auto-submit pipeline ran (harvest + promote + sync)'));
      } catch { _quiet('admin:session'); /* best-effort */ }

      return;
    }

    if (sub === 'bypass') {
      const s = getCurrentSession(repoRoot) || startSession(repoRoot);
      const reason = args.reason || args._positional[1];
      if (!reason) { out(c.yellow('Usage: oracle session bypass <reason> [--files f1,f2]')); return; }
      const files = args.files ? String(args.files).split(',').map(f => f.trim()) : [];
      recordEvent(s, 'bypass', { reason, files });
      saveSession(s, repoRoot);
      out(c.boldGreen('Bypass recorded:'));
      out(`  reason: ${c.yellow(reason)}`);
      if (files.length > 0) out(`  files:  ${files.join(', ')}`);
      out(c.dim('  These files will not count as query-before-write violations.'));
      return;
    }

    // `oracle session record-read <file>` — called by the Claude Code
    // PostToolUse hook after Read. Reads the file, extracts every
    // identifier, and stores them in the session's touchedIdentifiers
    // set so the next `oracle ground` call has fresh ground truth to
    // check against.
    if (sub === 'record-read') {
      const file = args.file || args._positional[1];
      if (!file) { out(c.yellow('Usage: oracle session record-read <file>')); return; }
      const fs = require('fs');
      if (!fs.existsSync(file)) { out(c.yellow('File not found: ' + file)); return; }
      const { extractAllIdentifiers } = require('../../../audit/ground');
      const source = fs.readFileSync(file, 'utf-8');
      const ids = Array.from(extractAllIdentifiers(source));
      const s = getCurrentSession(repoRoot) || startSession(repoRoot);
      recordEvent(s, 'read', { file, identifiers: ids });
      saveSession(s, repoRoot);
      if (args.json === true) {
        out(JSON.stringify({ file, identifiers: ids.length, sessionId: s.id }));
        return;
      }
      out(c.dim(`recorded read: ${file} (${ids.length} identifiers)`));
      return;
    }

    if (sub === 'todo') {
      // Friction-exit mitigation: the agent self-reports open/close/defer
      // for each task. If the session ends with any 'open' todo, the
      // todosAllClosed compliance check drops the score.
      //   oracle session todo open  --id t1 --content "Write parser"
      //   oracle session todo close --id t1
      //   oracle session todo defer --id t1 --reason "waiting on user"
      const action = args.action || args._positional[1];
      const s = getCurrentSession(repoRoot) || startSession(repoRoot);
      if (action === 'open') {
        recordEvent(s, 'todo.open', { id: args.id, content: args.content });
      } else if (action === 'close') {
        recordEvent(s, 'todo.close', { id: args.id });
      } else if (action === 'defer') {
        recordEvent(s, 'todo.defer', { id: args.id, reason: args.reason });
      } else if (action === 'list' || !action) {
        const todos = s.todos || [];
        if (todos.length === 0) { out(c.dim('no todos recorded')); return; }
        for (const t of todos) {
          const mark = t.status === 'closed' ? c.green('✓')
            : t.status === 'deferred' ? c.yellow('⏸')
            : c.red('✗');
          out(`  ${mark} ${c.cyan(t.id.padEnd(16))} ${c.dim(t.status.padEnd(9))} ${t.content || ''}`);
        }
        return;
      } else {
        out(c.yellow('Usage: oracle session todo <open|close|defer|list> [--id <id>] [--content "..."] [--reason "..."]'));
        return;
      }
      saveSession(s, repoRoot);
      out(c.dim(`todo ${action}: ${args.id || '(no id)'}`));
      return;
    }

    if (sub === 'record') {
      // Manual event recording for harnesses that can't emit bus events.
      //   oracle session record search --file foo.js
      //   oracle session record write  --file foo.js
      //   oracle session record audit  --file foo.js
      const kind = args.kind || args._positional[1];
      if (!kind) { out(c.yellow('Usage: oracle session record <search|write|audit> --file <f>')); return; }
      const s = getCurrentSession(repoRoot) || startSession(repoRoot);
      recordEvent(s, kind, { file: args.file });
      saveSession(s, repoRoot);
      out(c.dim(`recorded: ${kind} ${args.file || ''}`));
      return;
    }

    if (sub === 'help' || !sub) {
      out(`
${c.boldCyan('Oracle session — compliance ledger')}

${c.bold('Subcommands:')}
  ${c.cyan('session start')}                 Begin a tracked session
  ${c.cyan('session status')}                Show compliance score + violations
  ${c.cyan('session end')}                   Close the session + final report
  ${c.cyan('session bypass <reason>')}       Record an explicit bypass
  ${c.cyan('session record <kind>')}         Manually record search/write/audit

${c.bold('Environment:')}
  ${c.yellow('ORACLE_WORKFLOW=enforce')}     Pre-commit blocks commits below 100% compliance
  ${c.yellow('ORACLE_AGENT=<name>')}         Tags the session with an agent identifier
`);
      return;
    }

    outErr(c.boldRed('Error:') + ` Unknown session subcommand: ${sub}`);
  };
  handlers['history'] = (args) => {
    const { readHistory, summarizeHistory } = require('../../../core/history');
    const repoRoot = process.cwd();

    if (args.summary === true || args.summary === 'true') {
      const summary = summarizeHistory(repoRoot, { since: args.since });
      if (args.json === true) { out(JSON.stringify(summary, null, 2)); return; }
      out(c.boldCyan('Oracle history summary'));
      out(`  Since:  ${summary.since}`);
      out(`  Total:  ${summary.total}`);
      out('');
      const rows = Object.entries(summary.byType).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of rows.slice(0, 20)) {
        out(`  ${c.cyan(type.padEnd(32))} ${c.bold(String(count))}`);
      }
      return;
    }

    const filters = {
      limit: args.limit ? Number(args.limit) : 50,
      since: args.since,
      until: args.until,
      type: args.type,
      typePrefix: args.prefix,
    };
    const entries = readHistory(repoRoot, filters);
    if (args.json === true) { out(JSON.stringify(entries, null, 2)); return; }

    if (entries.length === 0) {
      out(c.yellow('No history entries match the filters.'));
      out(c.dim('  Tip: run `oracle hooks install` to start capturing events.'));
      return;
    }

    out(c.boldCyan(`Oracle history (${entries.length} entries)`));
    out('');
    for (const e of entries) {
      const when = (e._at || '').slice(11, 19);
      const dim = c.dim;
      out(`  ${dim(when)}  ${c.cyan(e.type.padEnd(24))}  ${formatPayload(e.payload)}`);
    }
  };
}
registerSessionCommands.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 4,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'orchestration',
};

module.exports = { registerSessionCommands };
