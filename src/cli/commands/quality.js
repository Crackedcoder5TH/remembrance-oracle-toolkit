/**
 * Quality CLI commands: reflect, covenant, security, compose, deps, harvest, recycle, prune, deep-clean, retag
 */

const fs = require('fs');
const path = require('path');
const { c, colorScore, colorStatus } = require('../colors');

function registerQualityCommands(handlers, { oracle, getCode, jsonOut }) {

  handlers['prune'] = (args) => {
    const min = parseFloat(args['min-coherency']) || 0.4;
    const result = oracle.prune(min);
    console.log(`Pruned ${c.boldRed(String(result.removed))} entries. ${c.boldGreen(String(result.remaining))} remaining.`);
  };

  handlers['deep-clean'] = (args) => {
    const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
    const result = oracle.deepClean({
      minCodeLength: parseInt(args['min-code-length']) || 35,
      minNameLength: parseInt(args['min-name-length']) || 3,
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
    const sub = process.argv[3];
    const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;

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

    if (!sub) { console.error(`Usage: ${c.cyan('oracle retag')} <pattern-id> | ${c.cyan('oracle retag all')}`); process.exit(1); }
    const result = oracle.retag(sub, { dryRun });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }
    if (result.error) { console.error(c.boldRed(result.error)); process.exit(1); }
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
      if (!tmpl) { console.error(c.boldRed('Unknown template:') + ' ' + args.template); process.exit(1); }
      result = composer.compose({ patterns: tmpl.patterns, language: lang, glue });
    } else if (args.describe) {
      result = composer.composeFromDescription(args.describe, lang);
    } else if (args.patterns) {
      const patternNames = args.patterns.split(',').map(p => p.trim());
      result = composer.compose({ patterns: patternNames, language: lang, glue });
    } else {
      console.error(c.boldRed('Usage:') + ' oracle compose --patterns p1,p2 | --template name | --describe "..." [--language js] [--glue module|class|function]');
      process.exit(1);
    }

    console.log(`${c.boldGreen('Composed')} ${result.patterns.length} pattern(s):`);
    result.patterns.forEach(p => console.log(`  ${c.cyan('\u2192')} ${p.name} (${p.language})`));
    console.log(`\n${result.code}`);
  };

  handlers['deps'] = (args) => {
    const id = process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle deps')} <pattern-id>`); process.exit(1); }
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
      maxLoops: parseInt(args.loops) || 3,
      targetCoherence: parseFloat(args.target) || 0.9,
      description: args.description || '',
      tags: args.tags ? args.tags.split(',').map(t => t.trim()) : [],
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
    const subCmd = process.argv[3];
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
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
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
    const id = args.id || process.argv[3];
    if (!id && !args.file) { console.error(`Usage: ${c.cyan('oracle security-scan')} <pattern-id> or --file <code.js>`); process.exit(1); }
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
    const source = process.argv[3];
    if (!source) { console.error(c.boldRed('Error:') + ` provide a source. Usage: ${c.cyan('oracle harvest <git-url-or-path> [--language js] [--dry-run] [--split function]')}`); process.exit(1); }
    try {
      const { harvest } = require('../../ci/harvest');
      const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
      const result = harvest(oracle, source, {
        language: args.language,
        dryRun,
        splitMode: args.split || 'file',
        branch: args.branch,
        maxFiles: parseInt(args['max-files']) || 200,
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
      console.error(c.red('Harvest error: ' + err.message));
      process.exit(1);
    }
  };

  handlers['recycle'] = (args) => {
    const { PatternRecycler } = require('../../core/recycler');
    const { SEEDS } = require('../../patterns/seeds');
    const { EXTENDED_SEEDS } = require('../../patterns/seeds-extended');

    const depth = parseInt(args.depth) || 2;
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
}

module.exports = { registerQualityCommands };
