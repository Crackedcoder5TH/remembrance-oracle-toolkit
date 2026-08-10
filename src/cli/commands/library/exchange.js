'use strict';

const fs = require('fs');
const path = require('path');
const { safePath } = require('../../../core/safe-path');
const { c, colorScore, colorStatus } = require('../../colors');
const { parseDryRun, parseTags, parseMinCoherency } = require('../../validate-args');
const { out, outErr, writeFile } = require('./out');

/**
 * Library commands — exchange.
 * Move patterns in and out of the library: register one file, import/export sets, seed the starter libraries.
 *
 * Commands: register, export, import, seed
 *
 * Registered onto the shared `handlers` map by the library façade
 * (../library.js). Printing goes through the ./out seam so the organ
 * itself holds zero console sites.
 */
function registerExchangeCommands(handlers, deps) {
  const { oracle } = deps;

  handlers['register'] = (args) => {
    if (!args.file) { outErr(c.boldRed('Error:') + ' --file required'); process.exit(1); }
    let code, testCode;
    try { code = fs.readFileSync(safePath(args.file, process.cwd()), 'utf-8'); }
    catch (e) { outErr(c.boldRed('Error:') + ` Cannot read file: ${e.message}`); process.exit(1); }
    if (args.test) {
      try { testCode = fs.readFileSync(safePath(args.test, process.cwd()), 'utf-8'); }
      catch (e) { outErr(c.boldRed('Error:') + ` Cannot read test file: ${e.message}`); process.exit(1); }
    }
    const tags = parseTags(args);
    const result = oracle.registerPattern({
      name: args.name || path.basename(args.file, path.extname(args.file)),
      code,
      language: args.language,
      description: args.description || '',
      tags,
      testCode,
      author: args.author || process.env.USER || 'cli-user',
    });
    if (result.registered && result.pattern) {
      out(`${c.boldGreen('Pattern registered:')} ${c.bold(result.pattern.name)} [${c.cyan(result.pattern.id)}]`);
      out(`Type: ${c.magenta(result.pattern.patternType)} | Complexity: ${c.blue(result.pattern.complexity)}`);
      out(`Coherency: ${colorScore(result.pattern.coherencyScore?.total ?? 0)}`);
    } else if (result.registered) {
      out(`${c.boldGreen('Pattern registered')}`);
    } else {
      out(`${colorStatus(false)}: ${c.red(result.reason)}`);
    }
  };

  handlers['export'] = (args) => {
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : undefined;
    const output = oracle.export({
      format: args.format || (args.file && args.file.endsWith('.md') ? 'markdown' : 'json'),
      limit: parseInt(args.limit, 10) || 20,
      minCoherency: parseMinCoherency(args, 0.5),
      language: args.language,
      tags,
    });
    if (args.file) {
      writeFile(safePath(args.file, process.cwd()), output);
      out(`${c.boldGreen('Exported')} to ${c.cyan(args.file)}`);
    } else {
      out(output);
    }
  };

  handlers['import'] = (args) => {
    if (!args.file) { outErr(c.boldRed('Error:') + ` --file required. Usage: ${c.cyan('oracle import --file patterns.json [--dry-run]')}`); process.exit(1); }
    const data = fs.readFileSync(safePath(args.file, process.cwd()), 'utf-8');
    const dryRun = parseDryRun(args);
    const result = oracle.import(data, { dryRun, author: args.author || 'cli-import' });
    if (dryRun) out(c.dim('(dry run — no changes written)\n'));
    out(`${c.boldGreen('Imported:')} ${result.imported}  |  ${c.yellow('Skipped:')} ${result.skipped}`);
    for (const r of result.results) {
      const icon = r.status === 'imported' || r.status === 'would_import' ? c.green('+') : r.status === 'duplicate' ? c.yellow('=') : c.red('x');
      out(`  ${icon} ${r.name} — ${r.status}${r.reason ? ' (' + r.reason.slice(0, 60) + ')' : ''}`);
    }
    if (result.errors.length > 0) {
      out(`\n${c.boldRed('Errors:')}`);
      for (const e of result.errors) out(`  ${c.red(e)}`);
    }
  };

  handlers['seed'] = (args) => {
    const { seedLibrary, seedNativeLibrary, seedExtendedLibrary, seedProductionLibrary3, seedProductionLibrary4 } = require('../../../patterns/seed-helpers');
    const results = seedLibrary(oracle);
    out(`Core seeds: ${c.boldGreen(String(results.registered))} registered (${c.dim(results.skipped + ' skipped')}, ${results.failed > 0 ? c.boldRed(String(results.failed)) : c.dim(String(results.failed))} failed)`);

    const ext = seedExtendedLibrary(oracle, { verbose: !!args.verbose });
    out(`Extended seeds: ${c.boldGreen(String(ext.registered))} registered (${c.dim(ext.skipped + ' skipped')}, ${ext.failed > 0 ? c.boldRed(String(ext.failed)) : c.dim(String(ext.failed))} failed)`);

    const native = seedNativeLibrary(oracle, { verbose: !!args.verbose });
    out(`Native seeds (Python/Go/Rust): ${c.boldGreen(String(native.registered))} registered (${c.dim(native.skipped + ' skipped')}, ${native.failed > 0 ? c.boldRed(String(native.failed)) : c.dim(String(native.failed))} failed)`);

    const prod3 = seedProductionLibrary3(oracle, { verbose: !!args.verbose });
    out(`Production seeds 3: ${c.boldGreen(String(prod3.registered))} registered (${c.dim(prod3.skipped + ' skipped')}, ${prod3.failed > 0 ? c.boldRed(String(prod3.failed)) : c.dim(String(prod3.failed))} failed)`);

    const prod4 = seedProductionLibrary4(oracle, { verbose: !!args.verbose });
    out(`Production seeds 4: ${c.boldGreen(String(prod4.registered))} registered (${c.dim(prod4.skipped + ' skipped')}, ${prod4.failed > 0 ? c.boldRed(String(prod4.failed)) : c.dim(String(prod4.failed))} failed)`);

    const total = results.registered + ext.registered + native.registered + prod3.registered + prod4.registered;
    out(`\nTotal seeded: ${c.boldGreen(String(total))} patterns`);
    out(`Library now has ${c.bold(String(oracle.patternStats().totalPatterns))} patterns`);
  };
}


module.exports = { registerExchangeCommands };
