'use strict';
const fs = require('fs');
const path = require('path');
const { c } = require('../../colors');
const { out, outErr, outWarn, _quiet } = require('./out');

// Extracted from the admin monolith (decomposition #5, 2026-08-09).
// Handler bodies are verbatim except: console.* routed through the
// ./out seam, and every best-effort catch now names its failure via
// _quiet — silence became a measurement.
function registerAtomicCommands(handlers, { oracle, jsonOut }) {
  handlers['atomic'] = (args) => {
    const sub = args._sub || args._positional[1];
    const path = require('path');
    const fs = require('fs');

    const tablePath = path.join(process.cwd(), '.remembrance', 'atomic-table.json');
    const { PeriodicTable, encodeSignature, GROUPS } = require('../../../atomic/periodic-table');
    const table = new PeriodicTable({ storagePath: tablePath });

    // ── oracle atomic analyze ─────────────────────────────────────
    if (sub === 'analyze') {
      const { extractAtomicProperties } = require('../../../atomic/property-extractor');
      const targetFile = args.file || args._positional[2];
      if (!targetFile || !fs.existsSync(targetFile)) {
        outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle atomic analyze --file <code.js>')}`);
        process.exit(1);
      }
      const code = fs.readFileSync(targetFile, 'utf-8');
      const props = extractAtomicProperties(code);
      const sig = encodeSignature(props);

      // Auto-register in the periodic table BEFORE any output
      const existing = table.getElement(sig);
      if (!existing) {
        table.addElement(props, { name: path.basename(targetFile), source: 'analyze' });
      } else {
        table.recordUsage(sig);
      }

      if (jsonOut()) {
        out(JSON.stringify({ file: targetFile, signature: sig, properties: props, registered: !existing }));
        return;
      }
      out('');
      out(c.boldCyan('Atomic Analysis') + ' — ' + c.bold(targetFile));
      out(`  signature: ${c.bold(sig)}`);
      out('');
      const labels = {
        charge: props.charge > 0 ? c.green('+1 expands') : props.charge < 0 ? c.red('-1 contracts') : c.dim('0 transforms'),
        mass: props.mass === 'light' ? c.green(props.mass) : props.mass === 'heavy' ? c.red(props.mass) : c.yellow(props.mass),
        spin: props.spin === 'even' ? c.green('even (pure)') : c.yellow('odd (side-effects)'),
        phase: props.phase === 'solid' ? c.cyan('solid (cached)') : props.phase === 'liquid' ? c.yellow('liquid (mutable)') : c.dim('gas (computed)'),
        reactivity: props.reactivity === 'inert' ? c.green(props.reactivity) : props.reactivity === 'volatile' ? c.red(props.reactivity) : c.yellow(props.reactivity),
      };
      out(`  charge          : ${labels.charge}`);
      out(`  valence         : ${c.bold(String(props.valence))} dependencies`);
      out(`  mass            : ${labels.mass}`);
      out(`  spin            : ${labels.spin}`);
      out(`  phase           : ${labels.phase}`);
      out(`  reactivity      : ${labels.reactivity}`);
      out(`  electronegativity: ${c.bold(String(props.electronegativity))}`);
      out(`  group           : ${c.bold(String(props.group))} (${GROUPS[props.group] || 'unknown'})`);
      out(`  period          : ${c.bold(String(props.period))}`);

      // Report registration status
      if (!existing) {
        out('');
        out(c.dim(`  Registered as new element in periodic table.`));
      } else {
        out('');
        out(c.dim(`  Element already in table (usage: ${(existing.usageCount || 0) + 1}).`));
      }
      out('');
      return;
    }

    // ── oracle atomic discover ────────────────────────────────────
    // ── oracle atomic introspect ────────────────────────────────────
    if (sub === 'introspect') {
      const { introspect } = require('../../../atomic/self-introspect');
      const result = introspect(table);
      if (jsonOut()) { out(JSON.stringify(result)); return; }
      out('');
      out(c.boldCyan('Atomic Self-Introspection'));
      out(`  scanned: oracle + void compressor`);
      out(`  registered: ${c.bold(String(result.registered.length))} elements from own code`);
      out('');
      if (result.registered.length > 0) {
        out(c.bold('  Own elements:'));
        for (const r of result.registered) {
          const icon = r.name.startsWith('void/') ? c.magenta('\u25c6') : c.cyan('\u25c6');
          out(`    ${icon} ${c.bold(r.name.padEnd(35))} ${c.dim(r.signature)}`);
        }
        out('');
      }
      if (result.gaps.length > 0) {
        out(c.boldYellow(`  Self-gaps found: ${result.gaps.length}`));
        for (const gap of result.gaps.slice(0, 5)) {
          out(`    ${c.yellow('?')} ${c.bold(gap.signature)}`);
          out(`      ${c.dim(gap.description)}`);
        }
        if (result.gaps.length > 5) out(c.dim(`    ... and ${result.gaps.length - 5} more`));
        out('');
      } else {
        out(c.dim('  No self-gaps detected.'));
        out('');
      }
      if (result.errors.length > 0) out(c.dim(`  (${result.errors.length} modules skipped)`));
      return;
    }

    if (sub === 'discover') {
      const { runDiscovery } = require('../../../atomic/element-discovery');
      const maxResults = parseInt(args.max || args.limit || '10', 10);
      const gaps = runDiscovery(table, { maxResults });

      if (jsonOut()) {
        out(JSON.stringify(gaps));
        return;
      }
      out('');
      out(c.boldCyan('Element Discovery') + ` — ${table.size} elements in table, ${gaps.length} gaps found`);
      out('');
      if (gaps.length === 0) {
        out(c.dim('  No gaps discovered. Add more elements via `oracle atomic analyze` to seed discovery.'));
      }
      for (let i = 0; i < gaps.length; i++) {
        const gap = gaps[i];
        const stratIcon = gap.strategy === 'neighbor' ? c.blue('\u25c6')
                        : gap.strategy === 'group' ? c.magenta('\u25c6')
                        : c.green('\u25c6');
        out(`  ${stratIcon} ${c.bold(gap.signature)}`);
        out(`    ${c.dim(gap.description)}`);
        out(`    strategy: ${gap.strategy}  priority: ${gap.priority.toFixed(3)}`);
        const cstr = gap.generationSpec?.constraints;
        if (cstr) {
          out(`    constraints: ${c.dim(`${cstr.complexity} | pure=${cstr.pure} | composable=${cstr.composable} | deps≤${cstr.maxDependencies}`)}`);
        }
        out('');
      }
      return;
    }

    // ── oracle atomic table ───────────────────────────────────────
    if (sub === 'table' || !sub) {
      const stats = table.stats();
      if (jsonOut()) {
        out(JSON.stringify({ stats, elements: table.exportJSON().elements }));
        return;
      }
      out('');
      out(c.boldCyan('Periodic Table of Code'));
      out(`  total elements: ${c.bold(String(stats.totalElements))}`);
      out('');
      if (stats.totalElements === 0) {
        out(c.dim('  Empty. Run `oracle atomic analyze --file <code.js>` to register elements.'));
        out('');
        return;
      }
      out(c.bold('  By charge:'));
      out(`    ${c.green('positive')}  ${stats.byCharge.positive}`);
      out(`    ${c.dim('neutral ')}  ${stats.byCharge.neutral}`);
      out(`    ${c.red('negative')}  ${stats.byCharge.negative}`);
      out('');
      out(c.bold('  By mass:'));
      out(`    ${c.green('light ')}  ${stats.byMass.light || 0}`);
      out(`    ${c.yellow('medium')}  ${stats.byMass.medium || 0}`);
      out(`    ${c.red('heavy ')}  ${stats.byMass.heavy || 0}`);
      out('');
      out(c.bold('  By group:'));
      for (const [name, count] of Object.entries(stats.byGroup).sort((a, b) => b[1] - a[1])) {
        out(`    ${name.padEnd(16)} ${count}`);
      }
      out('');
      if (stats.gaps > 0) {
        out(c.dim(`  ${stats.gaps} discoverable gaps. Run \`oracle atomic discover\` to see them.`));
        out('');
      }
      return;
    }

    outErr(c.boldRed('Error:') + ` Unknown atomic subcommand: ${sub}`);
    outErr(c.dim('  Available: analyze, discover, table'));
    process.exit(1);
  };
  handlers['plan'] = (args) => {
    const { planFromIntent } = require('../../../quality/planner');
    const fs = require('fs');
    const intent = args.intent || '';
    let symbols = [];
    if (args.symbols) {
      symbols = String(args.symbols).split(',').map(s => s.trim()).filter(Boolean);
    }
    // Allow a plan file as input: --from <path> loads { intent, symbols }.
    if (args.from) {
      try {
        const raw = JSON.parse(fs.readFileSync(args.from, 'utf-8'));
        if (raw.intent && !intent) args.intent = raw.intent;
        if (Array.isArray(raw.symbols) && symbols.length === 0) symbols = raw.symbols;
      } catch (e) {
        outErr(c.boldRed('Error:') + ' cannot read --from file: ' + e.message);
        process.exit(1);
      }
    }
    if (symbols.length === 0) {
      outErr(c.boldRed('Error:') + ' Usage: ' + c.cyan('oracle plan --intent "..." --symbols a,b,c'));
      process.exit(1);
    }

    // Pull session-touched identifiers as ground truth
    let knownIdentifiers = new Set();
    try {
      const { getCurrentSession } = require('../../../core/compliance');
      const sess = getCurrentSession(process.cwd());
      if (sess?.touchedIdentifiers) knownIdentifiers = new Set(sess.touchedIdentifiers);
    } catch { _quiet('admin:atomic'); /* no session is fine */ }

    const plan = planFromIntent({
      intent: args.intent || intent,
      symbols,
      oracle,
      repoRoot: process.cwd(),
      knownIdentifiers,
    });

    if (jsonOut()) { out(JSON.stringify(plan)); return; }

    out('');
    out(c.boldCyan('Plan verification'));
    if (plan.intent) out(`  ${c.dim('intent:')} ${plan.intent}`);
    out(`  ${c.dim('symbols:')} ${plan.symbols.length}`);
    out('');
    out(c.bold('  Verified:'));
    if (plan.verified.length === 0) {
      out(c.dim('    (none)'));
    } else {
      for (const v of plan.verified) {
        const icon = v.status === 'builtin' ? c.blue('\u25c6')
                   : v.status === 'seen'    ? c.cyan('\u25c6')
                   : v.status === 'pattern' ? c.magenta('\u25c6')
                   : c.green('\u25c6');
        out(`    ${icon} ${c.bold(v.symbol.padEnd(28))} ${c.dim(v.status.padEnd(8))} ${c.dim(v.source)}`);
      }
    }
    out('');
    if (plan.missing.length > 0) {
      out(c.boldYellow(`  Missing (${plan.missing.length}):`));
      for (const m of plan.missing) {
        out(`    ${c.yellow('?')} ${c.bold(m.symbol.padEnd(28))} ${c.dim(m.evidence)}`);
      }
      out('');
      out(c.dim('  Revise the plan: remove these symbols, or search/read the files that define them.'));
    } else {
      out(c.boldGreen(`  \u2713 Plan verified (${plan.summary.verified}/${plan.summary.total})`));
      out(c.dim('  Pass to `oracle generate --plan <path>` to constrain code generation.'));
    }
    out('');
  };
  handlers['generate-gate'] = (args) => {
    const { checkAgainstPlan } = require('../../../quality/generate-gate');
    const fs = require('fs');
    const planPath = args.plan;
    const draftPath = args.draft || args.file;
    if (!planPath || !draftPath) {
      outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle generate-gate --plan <plan.json> --draft <file>')}`);
      process.exit(1);
    }
    if (!fs.existsSync(planPath)) {
      outErr(c.boldRed('Error:') + ` Plan not found: ${planPath}`);
      process.exit(1);
    }
    if (!fs.existsSync(draftPath)) {
      outErr(c.boldRed('Error:') + ` Draft not found: ${draftPath}`);
      process.exit(1);
    }
    let plan;
    try { plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')); }
    catch (e) {
      outErr(c.boldRed('Error:') + ' cannot parse plan: ' + e.message);
      process.exit(1);
    }

    const result = checkAgainstPlan({ plan, draftPath });
    if (jsonOut()) { out(JSON.stringify(result)); return; }
    if (result.error) {
      outErr(c.boldRed('Error:') + ' ' + result.error);
      process.exit(1);
    }

    out('');
    out(c.boldCyan('Generate-gate —') + ' ' + c.bold(draftPath));
    out(`  plan: ${plan.intent || c.dim('(no intent)')}`);
    out(`  verified symbols in plan: ${result.plan.verifiedSymbols.length}`);
    out(`  call sites in draft: ${result.summary.totalCalls}`);
    out(`  grounded: ${result.summary.grounded}`);
    out(`  violations: ${result.summary.violations}`);
    out('');
    if (result.ok) {
      out(c.boldGreen('  \u2713 Draft conforms to the plan'));
      out(c.dim('  Every call site resolves to a verified symbol, local definition, or built-in.'));
    } else {
      out(c.boldRed(`  \u2717 Draft violates the plan (${result.violations.length} symbol(s) not in plan):`));
      for (const v of result.violations) {
        out(`    ${c.red('!')} L${String(v.line).padStart(4)}  ${c.bold(v.name)}()`);
      }
      out('');
      out(c.dim('  Either: (a) revise the plan to include these symbols and re-run planning,'));
      out(c.dim('          (b) revise the draft to use only plan symbols.'));
      process.exit(2); // distinct exit code for gate rejection
    }
    out('');
  };
  handlers['ground'] = (args) => {
    const { groundFile } = require('../../../audit/ground');
    const targetFile = args.file || args._positional[0];
    if (!targetFile) {
      outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle ground <file>')} [--json]`);
      process.exit(1);
    }
    const fs = require('fs');
    if (!fs.existsSync(targetFile)) {
      outErr(c.boldRed('Error:') + ` File not found: ${targetFile}`);
      process.exit(1);
    }

    // Pull the touched-identifier set from the current compliance session.
    let knownSet = new Set();
    try {
      const { getCurrentSession } = require('../../../core/compliance');
      const sess = getCurrentSession(process.cwd());
      if (sess?.touchedIdentifiers) knownSet = new Set(sess.touchedIdentifiers);
    } catch { _quiet('admin:atomic'); /* no session — only built-ins */ }

    const result = groundFile(targetFile, knownSet);
    if (jsonOut()) { out(JSON.stringify(result)); return; }

    if (result.error) {
      outErr(c.boldRed('Error:') + ' ' + result.error);
      process.exit(1);
    }

    out('');
    out(`${c.boldCyan('Grounding —')} ${c.bold(targetFile)}`);
    out(`  ${result.totalCalls} call site(s), ${result.definedLocally} local def(s), ${result.grounded} grounded`);
    if (result.ungrounded.length === 0) {
      out(`  ${c.boldGreen('\u2713 All calls grounded')}`);
    } else {
      out('');
      out(c.boldYellow(`  ${result.ungrounded.length} ungrounded call(s) — possible fabrications:`));
      for (const u of result.ungrounded) {
        out(`    ${c.yellow('?')} L${String(u.line).padStart(4)}  ${c.bold(u.name)}()`);
      }
      out('');
      out(c.dim('  Either read the file that defines these symbols, or replace them with proven calls.'));
    }
    out('');
  };
  handlers['void-scan'] = async (args) => {
    const targetFile = args.file || args._positional[0];
    if (!targetFile) {
      outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle void-scan <file>')} [--window 20] [--stride 5] [--top 5]`);
      process.exit(1);
    }
    if (!process.env.VOID_API_KEY) {
      outErr(c.boldRed('Error:') + ' VOID_API_KEY is not set. Start Void and export a key.');
      process.exit(1);
    }
    const { voidScanFile } = require('../../../audit/void-scan');
    const result = await voidScanFile(targetFile, {
      windowLines: Number(args.window) || 20,
      stride: Number(args.stride) || 5,
      topN: Number(args.top) || 5,
    });
    if (jsonOut()) { out(JSON.stringify(result)); return; }
    if (result.error) {
      outErr(c.boldRed('Error:') + ' ' + result.error);
      process.exit(1);
    }
    out(c.boldCyan(`Void-scan — ${result.file}`));
    out(`  ${result.totalLines} lines, ${result.windowsScored} windows scored\n`);
    out(c.dim('  DIAGNOSTIC: low coherence = unfamiliar to Void substrate, NOT always a bug.\n'));
    out(c.bold(`  Lowest-coherence windows (${result.candidates.length}):`));
    for (const w of result.candidates) {
      out(`    ${c.yellow('L' + String(w.startLine).padStart(4) + '-' + String(w.endLine).padEnd(4))}  coh: ${c.bold(w.coherence.toFixed(4))}  bytes: ${w.bytes}  ratio: ${w.voidRatio}x`);
    }
    out('');
  };
}
registerAtomicCommands.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 4,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'orchestration',
};

module.exports = { registerAtomicCommands };
