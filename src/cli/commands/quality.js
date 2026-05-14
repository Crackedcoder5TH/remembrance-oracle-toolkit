/**
 * Quality CLI commands: reflect, covenant, security, compose, deps, harvest, recycle, prune, deep-clean, retag, restore
 */

const fs = require('fs');
const path = require('path');
const { c, colorScore, colorStatus } = require('../colors');
const { parseDryRun, parseTags, parseMinCoherency } = require('../validate-args');

function registerQualityCommands(handlers, { oracle, getCode, jsonOut }) {

  handlers['prune'] = (args) => {
    if (args.untested) {
      const result = oracle.pruneUntested();
      console.log(`Pruned ${c.boldRed(String(result.removed))} untested entries. ${c.boldGreen(String(result.remaining))} remaining.`);
      return;
    }
    const min = parseMinCoherency(args, 0.4);
    const result = oracle.prune(min);
    console.log(`Pruned ${c.boldRed(String(result.removed))} entries. ${c.boldGreen(String(result.remaining))} remaining.`);
  };

  handlers['deep-clean'] = (args) => {
    const dryRun = parseDryRun(args);
    const result = oracle.deepClean({
      minCodeLength: parseInt(args['min-code-length'], 10) || 35,
      minNameLength: parseInt(args['min-name-length'], 10) || 3,
      dryRun,
    });
    console.log(`${dryRun ? c.yellow('DRY RUN — ') : ''}Deep Clean Results:`);
    console.log(`  Duplicates removed: ${c.boldRed(String(result.duplicates))}`);
    console.log(`  Stubs removed:      ${c.boldRed(String(result.stubs))}`);
    console.log(`  Too short removed:  ${c.boldRed(String(result.tooShort))}`);
    console.log(`  ${c.bold('Total removed:')}     ${c.boldRed(String(result.removed))}`);
    console.log(`  ${c.bold('Remaining:')}         ${c.boldGreen(String(result.remaining))}`);
    if (dryRun && result.details.length > 0) {
      console.log(`\nPreview (first 20):`);
      result.details.slice(0, 20).forEach(d =>
        console.log(`  [${d.reason}] ${d.name}: ${d.code}`)
      );
    }
  };

  handlers['retag'] = (args) => {
    const sub = args._sub;
    const dryRun = parseDryRun(args);

    if (sub === 'all') {
      console.log(c.boldCyan('Auto-Tag All Patterns') + (dryRun ? c.yellow(' (dry run)') : '') + '\n');
      const report = oracle.retagAll({ dryRun });
      if (jsonOut()) { console.log(JSON.stringify(report)); return; }
      console.log(`  Total patterns: ${c.bold(String(report.total))}`);
      console.log(`  Enriched:       ${c.boldGreen(String(report.enriched))}`);
      console.log(`  Tags added:     ${c.cyan(String(report.totalTagsAdded))}`);
      if (report.patterns.length > 0) {
        console.log(`\n  ${c.dim('Top enriched patterns:')}`);
        for (const p of report.patterns.slice(0, 20)) {
          console.log(`    ${c.bold(p.name)} ${c.dim('+')}${c.green(String(p.added.length))}: ${p.added.map(t => c.magenta(t)).join(', ')}`);
        }
      }
      if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));
      return;
    }

    if (!sub) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle retag')} <pattern-id> | ${c.cyan('oracle retag all')}`); process.exit(1); }
    const result = oracle.retag(sub, { dryRun });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }
    if (result.error) { console.error(c.boldRed('Error:') + ' ' + result.error); process.exit(1); }
    console.log(`${c.boldCyan('Auto-Tag:')} ${c.bold(result.name)} [${c.cyan(result.id)}]`);
    console.log(`  Old tags: ${result.oldTags.map(t => c.dim(t)).join(', ') || c.dim('(none)')}`);
    console.log(`  New tags: ${result.newTags.map(t => c.magenta(t)).join(', ')}`);
    console.log(`  Added:    ${result.added.length > 0 ? result.added.map(t => c.green('+' + t)).join(', ') : c.dim('(no new tags)')}`);
    if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));
  };

  handlers['compose'] = (args) => {
    const { PatternComposer } = require('../../patterns/composer');
    const composer = new PatternComposer(oracle);

    if (args.templates || args.template === 'list') {
      const templates = composer.templates();
      console.log(`${c.bold('Composition Templates:')}\n`);
      templates.forEach(t => {
        console.log(`  ${c.cyan(t.name)}: ${t.description}`);
        console.log(`    ${c.dim('Patterns:')} ${t.patterns.join(', ')}`);
      });
      return;
    }

    let result;
    const lang = args.language || 'javascript';
    const glue = args.glue || 'module';

    if (args.template) {
      const tmpl = composer.templates().find(t => t.name === args.template);
      if (!tmpl) { console.error(c.boldRed('Error:') + ' Unknown template: ' + args.template); process.exit(1); }
      result = composer.compose({ patterns: tmpl.patterns, language: lang, glue });
    } else if (args.describe) {
      result = composer.composeFromDescription(args.describe, lang);
    } else if (args.patterns) {
      const patternNames = args.patterns.split(',').map(p => p.trim());
      result = composer.compose({ patterns: patternNames, language: lang, glue });
    } else {
      console.error(c.boldRed('Error:') + ' Usage: oracle compose --patterns p1,p2 | --template name | --describe "..." [--language js] [--glue module|class|function]');
      process.exit(1);
    }

    console.log(`${c.boldGreen('Composed')} ${result.patterns.length} pattern(s):`);
    result.patterns.forEach(p => console.log(`  ${c.cyan('\u2192')} ${p.name} (${p.language})`));
    console.log(`\n${result.code}`);
  };

  handlers['deps'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle deps')} <pattern-id>`); process.exit(1); }
    const deps = oracle.patterns.resolveDependencies(id);
    if (deps.length === 0) {
      console.log(c.yellow('Pattern not found or has no dependencies.'));
    } else {
      console.log(`Dependency tree for ${c.cyan(id)}:\n`);
      for (let i = 0; i < deps.length; i++) {
        const prefix = i === deps.length - 1 ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
        console.log(`  ${c.dim(prefix)}${c.bold(deps[i].name)} [${c.cyan(deps[i].id)}]`);
      }
    }
  };

  handlers['reflect'] = (args) => {
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ` --file required or pipe code via stdin. Usage: ${c.cyan('cat code.js | oracle reflect')}`); process.exit(1); }
    const { reflectionLoop } = require('../../core/reflection');
    const result = reflectionLoop(code, {
      language: args.language,
      maxLoops: parseInt(args.loops, 10) || 3,
      targetCoherence: args.target != null ? parseFloat(args.target) : 0.9,
      description: args.description || '',
      tags: parseTags(args),
    });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }
    console.log(c.boldCyan('Infinite Reflection Loop\n'));
    console.log(`${c.bold('I_AM:')} ${colorScore(result.reflection.I_AM)} \u2192 ${c.bold('Final:')} ${colorScore(result.reflection.finalCoherence)} (${result.reflection.improvement >= 0 ? c.green('+' + result.reflection.improvement.toFixed(3)) : c.red(result.reflection.improvement.toFixed(3))})`);
    console.log(`${c.bold('Loops:')} ${result.loops}  |  ${c.bold('Full coherency:')} ${colorScore(result.fullCoherency)}\n`);
    console.log(c.bold('Dimensions:'));
    for (const [dim, val] of Object.entries(result.dimensions)) {
      const bar = '\u2588'.repeat(Math.round(val * 25));
      const faded = '\u2591'.repeat(25 - Math.round(val * 25));
      console.log(`  ${c.cyan(dim.padEnd(14))} ${c.green(bar)}${c.dim(faded)} ${colorScore(val)}`);
    }
    if (result.healingPath.length > 0) {
      console.log(`\n${c.bold('Healing path:')}`);
      for (const h of result.healingPath) { console.log(`  ${c.green('+')} ${h}`); }
    }
    console.log(`\n${c.magenta('Whisper from the healed future:')}`);
    console.log(`  ${c.dim('"' + result.whisper + '"')}`);
    console.log(`\n${c.dim(result.healingSummary)}`);
    if (args.output) {
      fs.writeFileSync(path.resolve(args.output), result.code, 'utf-8');
      console.log(`\n${c.boldGreen('Healed code written to:')} ${c.cyan(args.output)}`);
    }
  };

  handlers['covenant'] = (args) => {
    const { covenantCheck, getCovenant } = require('../../core/covenant');
    const subCmd = args._sub;
    if (subCmd === 'list' || (!subCmd && !args.file)) {
      const principles = getCovenant();
      console.log(c.boldCyan("The Kingdom's Weave \u2014 15 Covenant Principles:\n"));
      for (const p of principles) {
        console.log(`  ${c.bold(String(p.id).padStart(2))}. ${c.cyan(p.name)}`);
        console.log(`      ${c.dim(p.seal)}`);
      }
      return;
    }
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ` --file required or pipe code via stdin. Usage: ${c.cyan('cat code.js | oracle covenant')}`); process.exit(1); }
    const tags = parseTags(args);
    const result = covenantCheck(code, { description: args.description || '', tags, language: args.language });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }
    if (result.sealed) {
      console.log(`${c.boldGreen('SEALED')} \u2014 Covenant upheld (${result.principlesPassed}/${result.totalPrinciples} principles)`);
    } else {
      console.log(`${c.boldRed('BROKEN')} \u2014 Covenant violated:\n`);
      for (const v of result.violations) {
        console.log(`  ${c.red('[' + v.principle + ']')} ${c.bold(v.name)}: ${v.reason}`);
        console.log(`      ${c.dim('Seal: "' + v.seal + '"')}`);
      }
      process.exit(1);
    }
  };

  handlers['security-scan'] = (args) => {
    const id = args.id || args._sub;
    if (!id && !args.file) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle security-scan')} <pattern-id> or --file <code.js>`); process.exit(1); }
    let target = id;
    if (args.file) target = fs.readFileSync(path.resolve(args.file), 'utf-8');
    const external = args.external === 'true' || args.external === true;
    const result = oracle.securityScan(target, { language: args.language, runExternalTools: external });
    if (result.passed) {
      console.log(`${c.boldGreen('PASSED')}${result.patternName ? ` \u2014 ${c.bold(result.patternName)}` : ''}`);
    } else {
      console.log(`${c.boldRed('VETOED')}${result.patternName ? ` \u2014 ${c.bold(result.patternName)}` : ''}`);
    }
    console.log(`  Covenant: ${result.covenant.sealed ? c.green('sealed') : c.red('broken')} (${result.covenant.principlesPassed}/15)`);
    if (result.deepFindings.length > 0) {
      console.log(`  Deep findings: ${c.yellow(String(result.deepFindings.length))}`);
      for (const f of result.deepFindings) {
        const sev = f.severity === 'high' ? c.red(f.severity) : f.severity === 'medium' ? c.yellow(f.severity) : c.dim(f.severity);
        console.log(`    [${sev}] ${f.reason}`);
      }
    }
    if (result.externalTools.length > 0) {
      console.log(`  External tools: ${c.yellow(String(result.externalTools.length))}`);
      for (const f of result.externalTools) console.log(`    [${f.tool}] ${f.reason}`);
    }
    console.log(`\n${c.dim('Whisper:')} ${result.whisper}`);
  };

  handlers['security-audit'] = (args) => {
    const external = args.external === 'true' || args.external === true;
    const result = oracle.securityAudit({ runExternalTools: external });
    console.log(c.boldCyan('Security Audit Report:\n'));
    console.log(`  Scanned:  ${c.bold(String(result.scanned))}`);
    console.log(`  Clean:    ${c.boldGreen(String(result.clean))}`);
    console.log(`  Advisory: ${result.advisory > 0 ? c.yellow(String(result.advisory)) : c.dim('0')}`);
    console.log(`  Vetoed:   ${result.vetoed > 0 ? c.boldRed(String(result.vetoed)) : c.dim('0')}`);
    if (result.details.length > 0) {
      console.log('');
      for (const d of result.details) {
        const icon = d.status === 'vetoed' ? c.red('x') : c.yellow('!');
        console.log(`  ${icon} ${c.bold(d.name)} \u2014 ${d.status} (${d.findings} finding${d.findings !== 1 ? 's' : ''})${d.whisper ? '\n    ' + c.italic(d.whisper) : ''}`);
      }
    }
  };

  handlers['harvest'] = (args) => {
    const source = args._sub;
    if (!source) { console.error(c.boldRed('Error:') + ` provide a source. Usage: ${c.cyan('oracle harvest <git-url-or-path> [--language js] [--dry-run] [--split function]')}`); process.exit(1); }
    try {
      const { harvest } = require('../../ci/harvest');
      const dryRun = parseDryRun(args);
      const result = harvest(oracle, source, {
        language: args.language,
        dryRun,
        splitMode: args.split || 'file',
        branch: args.branch,
        maxFiles: parseInt(args['max-files'], 10) || 200,
      });
      console.log(c.boldCyan(`Harvest: ${source}\n`));
      console.log(`  Discovered: ${c.bold(String(result.harvested))}`);
      if (!dryRun) {
        console.log(`  Registered: ${c.boldGreen(String(result.registered))}`);
        console.log(`  Skipped:    ${c.yellow(String(result.skipped))}`);
        console.log(`  Failed:     ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);
      }
      if (result.patterns.length > 0) {
        console.log(`\n${c.bold('Patterns:')}`);
        for (const p of result.patterns.slice(0, 50)) {
          const icon = p.status === 'registered' ? c.green('+') : p.hasTests ? c.cyan('T') : c.dim('-');
          const testBadge = p.hasTests ? c.cyan(' [tested]') : '';
          console.log(`  ${icon} ${c.bold(p.name)} (${c.blue(p.language)})${testBadge}${p.reason ? c.dim(' \u2014 ' + p.reason) : ''}`);
        }
        if (result.patterns.length > 50) {
          console.log(c.dim(`  ... and ${result.patterns.length - 50} more`));
        }
      }
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Harvest error: ' + err.message);
      process.exit(1);
    }
  };

  handlers['recycle'] = (args) => {
    const { PatternRecycler } = require('../../evolution/recycler');
    const { SEEDS, EXTENDED_SEEDS } = require('../../patterns/seed-helpers');

    const depth = parseInt(args.depth, 10) || 2;
    const allSeeds = [...SEEDS, ...EXTENDED_SEEDS];

    console.log(c.boldCyan('Pattern Recycler') + ' \u2014 exponential growth engine\n');
    console.log(`Processing ${c.bold(String(allSeeds.length))} seeds at depth ${c.bold(String(depth))}...\n`);

    oracle.recycler.verbose = true;
    oracle.recycler.generateVariants = true;
    oracle.recycler.variantLanguages = (args.languages || 'python,typescript').split(',').map(s => s.trim());

    const report = oracle.processSeeds(allSeeds, { depth });

    console.log('\n' + c.boldCyan('\u2500'.repeat(50)));
    console.log(PatternRecycler.formatReport(report));
    console.log(c.boldCyan('\u2500'.repeat(50)));
  };
  handlers['retention'] = (args) => {
    const dryRun = parseDryRun(args);
    const sqliteStore = oracle.store?.getSQLiteStore?.() || oracle.patterns?._sqlite;
    if (!sqliteStore) { console.error(c.boldRed('Error:') + ' No SQLite store available.'); process.exit(1); }

    if (jsonOut()) {
      console.log(JSON.stringify(sqliteStore.retentionSweep({ dryRun })));
      return;
    }

    console.log(c.boldCyan('Retention Sweep') + (dryRun ? c.yellow(' (dry run)') : '') + '\n');
    const result = sqliteStore.retentionSweep({ dryRun });

    console.log(`  ${c.bold('candidate_archive:')} ${c.boldRed(String(result.candidateArchive.removed))} purged (${result.candidateArchive.before} → ${result.candidateArchive.after})`);
    console.log(`  ${c.bold('pattern_archive:')}   ${c.boldRed(String(result.patternArchive.removed))} purged (${result.patternArchive.before} → ${result.patternArchive.after})`);
    console.log(`  ${c.bold('entries:')}           ${c.boldRed(String(result.entries.staleRemoved))} stale + ${c.boldRed(String(result.entries.duplicateRemoved))} dupes removed (${result.entries.remaining} remaining)`);
    console.log(`  ${c.bold('audit_log:')}         ${result.auditLog.removed} rotated (${result.auditLog.before} → ${result.auditLog.after})`);

    if (!dryRun) {
      console.log(`\n  ${c.dim('Run')} ${c.cyan('oracle vacuum')} ${c.dim('to reclaim disk space.')}`);
    }
  };

  handlers['vacuum'] = (args) => {
    const sqliteStore = oracle.store?.getSQLiteStore?.() || oracle.patterns?._sqlite;
    if (!sqliteStore) { console.error(c.boldRed('Error:') + ' No SQLite store available.'); process.exit(1); }
    const result = sqliteStore.vacuum();
    console.log(`VACUUM complete: ${result.beforeMB} MB → ${result.afterMB} MB (saved ${c.boldGreen(String(result.savedMB))} MB)`);
  };

  handlers['restore'] = (args) => {
    const dryRun = parseDryRun(args);
    const name = args._sub || args.name;

    const db = oracle.patterns._sqlite?.db || oracle.store?.db;
    if (!db) { console.log(c.red('No database available.')); return; }

    // Ensure archive table exists
    try { db.prepare('SELECT 1 FROM pattern_archive LIMIT 1').get(); }
    catch { console.log(c.yellow('No archive table found — nothing to restore.')); return; }

    if (name === 'lost' || name === 'all-lost') {
      // Restore all patterns that no longer exist in the active library
      const lost = db.prepare(`
        SELECT pa.* FROM pattern_archive pa
        WHERE NOT EXISTS (SELECT 1 FROM patterns p WHERE p.name = pa.name AND p.language = pa.language)
        ORDER BY pa.coherency_total DESC
      `).all();

      const seen = new Set();
      let restored = 0;
      for (const row of lost) {
        const key = row.name + ':' + row.language;
        if (seen.has(key)) continue;
        seen.add(key);

        if (dryRun) {
          console.log(`  ${c.yellow('[dry-run]')} ${c.cyan(row.name)} (${row.language}) coherency=${row.coherency_total}`);
          restored++;
          continue;
        }

        let fullRow;
        try { fullRow = JSON.parse(row.full_row_json); } catch { fullRow = null; }
        const now = new Date().toISOString();
        db.prepare(`
          INSERT OR IGNORE INTO patterns
            (id, name, code, language, pattern_type, complexity, description, tags,
             coherency_total, coherency_json, test_code, usage_count, success_count,
             version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          row.id, row.name, row.code, row.language || 'javascript',
          row.pattern_type || 'utility', fullRow?.complexity || 'atomic',
          fullRow?.description || '', row.tags || '[]',
          row.coherency_total || 0, row.coherency_json || '{}',
          row.test_code || null, fullRow?.usage_count || 0,
          fullRow?.success_count || 0, fullRow?.version || 1,
          row.original_created_at || now, now
        );
        restored++;
      }
      console.log(`${dryRun ? c.yellow('DRY RUN — ') : ''}Restored ${c.boldGreen(String(restored))} lost patterns.`);
      return;
    }

    if (name === 'stats') {
      const total = db.prepare('SELECT COUNT(*) as c FROM pattern_archive').get();
      const reasons = db.prepare('SELECT deleted_reason, COUNT(*) as c FROM pattern_archive GROUP BY deleted_reason ORDER BY c DESC').all();
      const lostCount = db.prepare(`SELECT COUNT(DISTINCT name || ':' || language) as c FROM pattern_archive pa
        WHERE NOT EXISTS (SELECT 1 FROM patterns p WHERE p.name = pa.name AND p.language = pa.language)`).get();
      console.log(c.boldCyan('Archive Stats'));
      console.log(`  Total archived: ${c.bold(String(total.c))}`);
      console.log(`  Unique lost:    ${c.boldRed(String(lostCount.c))}`);
      console.log(`\n  ${c.bold('By reason:')}`);
      reasons.forEach(r => console.log(`    ${r.deleted_reason}: ${r.c}`));
      return;
    }

    if (name) {
      // Restore specific pattern by name
      const row = db.prepare(`SELECT * FROM pattern_archive WHERE name = ? ORDER BY coherency_total DESC LIMIT 1`).get(name);
      if (!row) { console.log(c.yellow(`No archived pattern named '${name}'.`)); return; }
      if (!dryRun) {
        let fullRow;
        try { fullRow = JSON.parse(row.full_row_json); } catch { fullRow = null; }
        const now = new Date().toISOString();
        db.prepare(`INSERT OR REPLACE INTO patterns
          (id, name, code, language, pattern_type, complexity, description, tags,
           coherency_total, coherency_json, test_code, usage_count, success_count,
           version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(row.id, row.name, row.code, row.language || 'javascript',
          row.pattern_type || 'utility', fullRow?.complexity || 'atomic',
          fullRow?.description || '', row.tags || '[]',
          row.coherency_total || 0, row.coherency_json || '{}',
          row.test_code || null, fullRow?.usage_count || 0,
          fullRow?.success_count || 0, fullRow?.version || 1,
          row.original_created_at || now, now);
      }
      console.log(`${dryRun ? c.yellow('DRY RUN — ') : ''}Restored ${c.boldGreen(row.name)} (${row.language}, coherency=${row.coherency_total})`);
      return;
    }

    console.log(c.boldCyan('Usage:'));
    console.log(`  oracle restore stats          Show archive statistics`);
    console.log(`  oracle restore lost            Restore all lost patterns`);
    console.log(`  oracle restore <name>          Restore a specific pattern`);
    console.log(`  oracle restore lost --dry-run  Preview what would be restored`);
  };
}

module.exports = { registerQualityCommands };
