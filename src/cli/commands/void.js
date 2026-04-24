/**
 * CLI commands for the Oracle-Void Bridge + Crawler Controls
 *
 * Simple enough for a 10-year-old:
 *
 *   oracle void status    — what's going on?
 *   oracle void start     — start learning from reality
 *   oracle void stop      — stop the crawler
 *   oracle void watch     — watch it learn live
 *   oracle void patterns  — how many patterns so far?
 *   oracle void cascade   — check any file against reality
 *   oracle void connect   — connect oracle to void substrate
 *   oracle void export    — share oracle patterns with substrate
 *   oracle void measure   — measure coherence of a file
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

function findVoidDir() {
  const candidates = [
    path.join(process.cwd(), '..', 'Void-Data-Compressor'),
    path.join(require('os').homedir(), 'Void-Data-Compressor'),
    '/root/Void-Data-Compressor',
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'realtime_crawler.py'))) return dir;
  }
  return null;
}

function isCrawlerRunning() {
  try {
    const out = execSync('ps aux', { encoding: 'utf-8' });
    return out.includes('realtime_crawler.py') && !out.includes('grep');
  } catch { return false; }
}

function extractCount(data) {
  if (!data || typeof data !== 'object') return 0;
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data.patterns)) return data.patterns.length;
  if (Array.isArray(data.waveforms)) return data.waveforms.length;
  if (Array.isArray(data.entries)) return data.entries.length;
  if (typeof data.count === 'number') return data.count;
  let max = 0;
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && data[k].length > max) max = data[k].length;
  }
  return max;
}

// Classify a file into a flow domain so the catalog can show WHERE data
// comes from and WHAT KIND it is. Order matters — first match wins.
function classifyFile(name) {
  if (name === 'oracle_patterns.json')          return { source: 'oracle',   kind: 'code patterns' };
  if (name.startsWith('learned_patterns'))      return { source: 'crawler',  kind: 'live feed waveforms' };
  if (name.startsWith('learned_archive_'))      return { source: 'crawler',  kind: 'archived harvest' };
  if (name.startsWith('field_substrate'))       return { source: 'field',    kind: 'field waveforms' };
  if (name.startsWith('code_'))                 return { source: 'seed',     kind: 'code: ' + name.replace(/^code_|_substrate\.json$/g, '').replace(/_/g, ' ') };
  if (name.includes('physics') || name.includes('einstein') || name.includes('maxwell') ||
      name.includes('schrodinger') || name.includes('navier') || name.includes('lorenz') ||
      name.includes('newton') || name.includes('dirac') || name.includes('hbar'))
                                                return { source: 'seed',     kind: 'physics' };
  if (name.includes('market') || name.includes('crypto') || name.includes('stock') ||
      name.includes('solana'))                  return { source: 'seed',     kind: 'markets' };
  if (name.includes('astronomy') || name.includes('cosmic') || name.includes('solar'))
                                                return { source: 'seed',     kind: 'astronomy' };
  if (name.includes('bio') || name.includes('earth') || name.includes('climate'))
                                                return { source: 'seed',     kind: 'earth / bio' };
  if (name.includes('covenant') || name.includes('codex') || name.includes('remembrance'))
                                                return { source: 'seed',     kind: 'remembrance core' };
  if (name.includes('consciousness') || name.includes('abundance') || name.includes('collective'))
                                                return { source: 'seed',     kind: 'consciousness' };
  if (name.includes('history') || name.includes('timeline') || name.includes('war'))
                                                return { source: 'seed',     kind: 'history' };
  if (name.includes('resonance') || name.includes('l2_') || name.includes('information') ||
      name.includes('ecosystem'))               return { source: 'derived',  kind: 'meta / resonance' };
  return { source: 'seed', kind: 'other' };
}

function scanSubstrate(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'api_keys.json');
  const rows = [];
  for (const f of files) {
    try {
      const stat = fs.statSync(path.join(dir, f));
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
      const n = extractCount(data);
      const { source, kind } = classifyFile(f);
      rows.push({ file: f, count: n, source, kind, bytes: stat.size, mtime: stat.mtime });
    } catch {
      rows.push({ file: f, count: 0, source: 'unknown', kind: 'parse error', bytes: 0, mtime: new Date(0) });
    }
  }
  return rows;
}

function getPatternCounts(dir) {
  const rows = scanSubstrate(dir);
  const bySource = { oracle: 0, crawler: 0, field: 0, seed: 0, derived: 0, unknown: 0 };
  let total = 0, subFiles = 0;
  for (const r of rows) {
    total += r.count;
    if (r.count > 0) subFiles++;
    bySource[r.source] = (bySource[r.source] || 0) + r.count;
  }
  return {
    total,
    subFiles,
    base: total - bySource.crawler,
    learned: bySource.crawler,
    bySource,
    rows,
  };
}

function registerVoidCommands(handlers, { oracle }) {

  // oracle void — show help
  handlers['void'] = (args) => {
    const positional = args._positional || [];
    const sub = positional[0] || null;

    if (!sub || sub === 'help') {
      console.log('\n  Void Compressor Controls:\n');
      console.log('    oracle void status     what\'s going on?');
      console.log('    oracle void catalog    show all data: where it is, what kind, who made it');
      console.log('    oracle void find <q>   find a pattern by name across ALL substrate files');
      console.log('    oracle void index      (re)build the unified pattern index');
      console.log('    oracle void start      start learning from reality');
      console.log('    oracle void stop       stop the crawler');
      console.log('    oracle void watch      watch it learn live (Ctrl+C to stop)');
      console.log('    oracle void patterns   how many patterns so far?');
      console.log('    oracle void cascade    check any file against reality');
      console.log('    oracle void integrity  full Solana integrity audit');
      console.log('    oracle void storage    check/fix substrate file sizes');
      console.log('    oracle void api        start the REST API');
      console.log('    oracle void api stop   stop the REST API');
      console.log('    oracle void connect    connect oracle to void substrate');
      console.log('    oracle void export     share oracle patterns with substrate');
      console.log('    oracle void measure    measure coherence of a file');
      console.log();
      return;
    }

    // ── STATUS ────────────────────────────────────────────────────

    if (sub === 'status') {
      const dir = findVoidDir();
      const running = isCrawlerRunning();

      console.log('\n  ═══════════════════════════════════════');
      console.log('  VOID COMPRESSOR STATUS');
      console.log('  ═══════════════════════════════════════\n');

      if (dir) {
        const counts = getPatternCounts(dir);
        const bs = counts.bySource;
        console.log(`  Substrate:  Found at ${dir}`);
        console.log(`  Patterns:   ${counts.total.toLocaleString()} total across ${counts.subFiles} files`);
        console.log(`    oracle:   ${(bs.oracle || 0).toLocaleString()}`);
        console.log(`    crawler:  ${(bs.crawler || 0).toLocaleString()}`);
        console.log(`    field:    ${(bs.field || 0).toLocaleString()}`);
        console.log(`    seed:     ${(bs.seed || 0).toLocaleString()}`);
        console.log(`    derived:  ${(bs.derived || 0).toLocaleString()}`);
        console.log(`  Crawler:    ${running ? 'RUNNING' : 'STOPPED'}`);

        if (running) {
          try {
            const log = execSync(`grep "SAVE" "${path.join(dir, 'crawler.log')}" | tail -1`, { encoding: 'utf-8' }).trim();
            if (log) console.log(`  Last save:  ${log.replace(/.*======/, '').replace(/======.*/, '').trim()}`);
          } catch {}
        }
      } else {
        console.log('  Substrate:  Not found');
        console.log('  Crawler:    Not available');
      }

      // Bridge status
      try {
        const { VoidBridge } = require('../../compression/void-bridge');
        const bridge = new VoidBridge(process.cwd());
        const status = bridge.getStatus();
        console.log(`\n  Bridge:     ${status.mode}`);
        if (status.connected) {
          console.log(`  Connected:  ${status.substratePath}`);
        }
      } catch {}

      console.log();
      return;
    }

    // ── START ─────────────────────────────────────────────────────

    if (sub === 'start') {
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }

      if (isCrawlerRunning()) {
        console.log('\n  Crawler is already running!');
        console.log('  Use: oracle void watch    — to see it live');
        console.log('  Use: oracle void patterns — to check progress\n');
        return;
      }

      try {
        execSync(
          `cd "${dir}" && nohup python3 realtime_crawler.py --live --duration 0 --interval 10 >> crawler.log 2>&1 &`,
          { shell: true }
        );

        console.log('\n  Crawler started!\n');
        console.log('  Learning from:');
        console.log('    Crypto prices       (CoinGecko, every 30s)');
        console.log('    Earthquakes         (USGS, every 60s)');
        console.log('    Weather             (8 cities, every 2min)');
        console.log('    Ocean tides         (5 stations, every 3min)');
        console.log('    Space weather       (NASA, every 15min)');
        console.log('    Economy             (FRED, every 15min)');
        console.log('\n  Patterns saved every 5 minutes.');
        console.log('\n  oracle void watch    — see it live');
        console.log('  oracle void patterns — check progress\n');
      } catch (e) {
        console.log(`\n  Error starting: ${e.message}\n`);
      }
      return;
    }

    // ── STOP ──────────────────────────────────────────────────────

    if (sub === 'stop') {
      if (!isCrawlerRunning()) {
        console.log('\n  Crawler is not running.\n');
        return;
      }

      try {
        execSync('pkill -f realtime_crawler', { shell: true });
      } catch {}

      console.log('\n  Crawler stopped.');
      console.log('  All learned patterns are safe on disk.');
      console.log('  Use: oracle void start — to start again\n');
      return;
    }

    // ── WATCH ─────────────────────────────────────────────────────

    if (sub === 'watch') {
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }

      const logFile = path.join(dir, 'crawler.log');
      if (!fs.existsSync(logFile)) {
        console.log('\n  No log file yet. Start the crawler first:');
        console.log('    oracle void start\n');
        return;
      }

      if (!isCrawlerRunning()) {
        console.log('\n  Crawler is not running. Showing last output:\n');
      } else {
        console.log('\n  Watching crawler live (Ctrl+C to stop watching):\n');
      }

      const tail = spawn('tail', ['-f', '-n', '30', logFile], { stdio: 'inherit' });
      process.on('SIGINT', () => { tail.kill(); process.exit(0); });
      return;
    }

    // ── PATTERNS ──────────────────────────────────────────────────

    if (sub === 'patterns') {
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }

      const counts = getPatternCounts(dir);
      const running = isCrawlerRunning();

      const bs = counts.bySource;
      console.log('\n  ═══════════════════════════════════════');
      console.log('  PATTERN COUNT');
      console.log('  ═══════════════════════════════════════\n');
      console.log(`    oracle patterns:    ${(bs.oracle || 0).toLocaleString()}`);
      console.log(`    crawler learned:    ${(bs.crawler || 0).toLocaleString()}`);
      console.log(`    field waveforms:    ${(bs.field || 0).toLocaleString()}`);
      console.log(`    seed substrates:    ${(bs.seed || 0).toLocaleString()}`);
      console.log(`    derived/meta:       ${(bs.derived || 0).toLocaleString()}`);
      console.log(`    ─────────────────────────────`);
      console.log(`    TOTAL:              ${counts.total.toLocaleString()}  (${counts.subFiles} files)`);
      console.log(`\n    Crawler: ${running ? 'RUNNING' : 'STOPPED'}`);

      if (running) {
        try {
          const saves = execSync(`grep -c "SAVE" "${path.join(dir, 'crawler.log')}" 2>/dev/null`, { encoding: 'utf-8' }).trim();
          console.log(`    Save checkpoints:   ${saves}`);
        } catch {}

        try {
          const cascades = execSync(`grep -c "CASCADE" "${path.join(dir, 'crawler.log')}" 2>/dev/null`, { encoding: 'utf-8' }).trim();
          console.log(`    Cascade events:     ${cascades}`);
        } catch {}
      }
      console.log();
      return;
    }

    // ── INTEGRITY ──────────────────────────────────────────────────

    if (sub === 'integrity') {
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }

      console.log('\n  Running integrity audit...\n');

      try {
        const output = execSync(
          `cd "${dir}" && python3 solana_integrity.py`,
          { encoding: 'utf-8', timeout: 60000 }
        );
        console.log(output);
      } catch (e) {
        if (e.stdout) console.log(e.stdout);
        else console.log(`\n  Error: ${e.message}\n`);
      }
      return;
    }

    // ── STORAGE ───────────────────────────────────────────────────

    if (sub === 'storage') {
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }

      const action = positional[1] || 'status';
      const flag = action === 'fix' ? '' : `--${action}`;

      try {
        const output = execSync(
          `cd "${dir}" && python3 storage_manager.py ${flag}`,
          { encoding: 'utf-8', timeout: 60000 }
        );
        console.log(output);
      } catch (e) {
        if (e.stdout) console.log(e.stdout);
        else console.log(`\n  Error: ${e.message}\n`);
      }
      return;
    }

    // ── API ───────────────────────────────────────────────────────

    if (sub === 'api') {
      const action = positional[1] || 'start';
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }

      if (action === 'stop') {
        try {
          execSync('pkill -f "api.py"', { shell: true });
        } catch {}
        console.log('\n  API stopped.\n');
        return;
      }

      // Check if already running
      try {
        const out = execSync('ps aux', { encoding: 'utf-8' });
        if (out.includes('api.py')) {
          console.log('\n  API is already running!');
          console.log('  Use: oracle void api stop — to stop it\n');
          return;
        }
      } catch {}

      const port = positional[1] && !isNaN(positional[1]) ? positional[1] : '8080';

      try {
        execSync(
          `cd "${dir}" && nohup python3 api.py --port ${port} >> api.log 2>&1 &`,
          { shell: true }
        );
        console.log(`\n  API started on port ${port}!\n`);
        console.log('  Endpoints:');
        console.log(`    GET  http://your-server:${port}/status`);
        console.log(`    GET  http://your-server:${port}/patterns`);
        console.log(`    GET  http://your-server:${port}/resonance`);
        console.log(`    POST http://your-server:${port}/coherence`);
        console.log(`    POST http://your-server:${port}/cascade`);
        console.log(`    POST http://your-server:${port}/cascade/batch`);
        console.log(`\n  Use: oracle void api stop — to stop it\n`);
      } catch (e) {
        console.log(`\n  Error: ${e.message}\n`);
      }
      return;
    }

    // ── CASCADE ───────────────────────────────────────────────────

    if (sub === 'cascade') {
      const target = positional[1] || args.file;
      if (!target) {
        console.log('\n  Usage: oracle void cascade <file-or-folder>');
        console.log('  Example: oracle void cascade src/\n');
        return;
      }

      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }

      const targetPath = path.resolve(target);
      if (!fs.existsSync(targetPath)) {
        console.log(`\n  Not found: ${target}\n`);
        return;
      }

      console.log(`\n  Running fast cascade on: ${target}\n`);

      try {
        const output = execSync(
          `cd "${dir}" && python3 resonance_detector.py cascade "${targetPath}"`,
          { encoding: 'utf-8', timeout: 60000 }
        );
        console.log(output);
      } catch (e) {
        if (e.stdout) console.log(e.stdout);
        else console.log(`\n  Error: ${e.message}\n`);
      }
      return;
    }

    // ── CONNECT ───────────────────────────────────────────────────

    if (sub === 'connect') {
      try {
        const { VoidBridge } = require('../../compression/void-bridge');
        const bridge = new VoidBridge(process.cwd());
        const searchPath = positional[1] || findVoidDir() || path.join(process.cwd(), '..', 'Void-Data-Compressor');
        const result = bridge.connect(searchPath);

        if (result.connected) {
          console.log('\n  Connected to void substrate!');
          console.log(`  Patterns: ${result.patterns.toLocaleString()}`);
          console.log(`  Mode: enhanced\n`);
        } else {
          console.log('\n  Could not connect. Oracle continues standalone.\n');
        }
      } catch (e) {
        console.log(`\n  Error: ${e.message}\n`);
      }
      return;
    }

    // ── EXPORT ────────────────────────────────────────────────────

    if (sub === 'export') {
      try {
        const { VoidBridge } = require('../../compression/void-bridge');
        const bridge = new VoidBridge(process.cwd());
        if (!bridge.connected) {
          // Try auto-connect
          const dir = findVoidDir();
          if (dir) bridge.connect(dir);
        }
        if (!bridge.connected) {
          console.log('\n  No substrate connected. Run: oracle void connect\n');
          return;
        }
        const result = bridge.exportToSubstrate();
        console.log(`\n  ${result.message}`);
        console.log(`  Both systems are now stronger.\n`);
      } catch (e) {
        console.log(`\n  Error: ${e.message}\n`);
      }
      return;
    }

    // ── MEASURE ───────────────────────────────────────────────────

    if (sub === 'measure') {
      const file = positional[2] || args.file;
      if (!file) {
        console.log('\n  Usage: oracle void measure <file>\n');
        return;
      }
      if (!fs.existsSync(file)) {
        console.log(`\n  File not found: ${file}\n`);
        return;
      }

      try {
        const { VoidBridge } = require('../../compression/void-bridge');
        const bridge = new VoidBridge(process.cwd());
        const dir = findVoidDir();
        if (dir && !bridge.connected) bridge.connect(dir);

        const code = fs.readFileSync(file, 'utf-8');
        const score = bridge.scoreCoherency({ code, name: path.basename(file) });

        console.log(`\n  Coherence: ${file}\n`);
        console.log(`  Mode:     ${score.mode}`);
        console.log(`  Score:    ${score.total.toFixed(3)}`);
        if (score.enhanced) {
          console.log(`  Substrate: ${score.substrateCoherence.toFixed(3)}`);
        }
        console.log();
      } catch (e) {
        console.log(`\n  Error: ${e.message}\n`);
      }
      return;
    }

    // ── CATALOG ───────────────────────────────────────────────────
    // One screen that shows the full data flow: every file, its count,
    // its kind, and its source. Sorted by source then count descending.

    if (sub === 'catalog') {
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }
      const counts = getPatternCounts(dir);
      const rows = counts.rows.slice().sort((a, b) => {
        if (a.source !== b.source) return a.source.localeCompare(b.source);
        return b.count - a.count;
      });

      console.log('\n  ═══════════════════════════════════════════════════════════════════');
      console.log('  VOID SUBSTRATE CATALOG');
      console.log('  ═══════════════════════════════════════════════════════════════════\n');
      console.log('  Data flow:');
      console.log('    crawler (20 live feeds) ──▶ learned_patterns + learned_archive_*');
      console.log('    oracle  (code patterns) ──▶ oracle_patterns.json');
      console.log('    seed    (static domains) ─▶ *_substrate.json');
      console.log('    field   (waveforms)     ──▶ field_substrate*');
      console.log('    derived (meta/resonance) ─▶ resonance_field / l2_substrate / ecosystem_harvest');
      console.log('');

      let currentSource = null;
      for (const r of rows) {
        if (r.source !== currentSource) {
          currentSource = r.source;
          const subtotal = counts.bySource[currentSource] || 0;
          console.log(`\n  [${currentSource.toUpperCase()}]  ${subtotal.toLocaleString()} patterns`);
          console.log('  ' + '─'.repeat(67));
        }
        const count = String(r.count.toLocaleString()).padStart(7);
        const kind = r.kind.padEnd(28);
        console.log(`    ${count}  ${kind}  ${r.file}`);
      }
      console.log('\n  ───────────────────────────────────────────────────────────────────');
      console.log(`  TOTAL: ${counts.total.toLocaleString()} patterns  across ${counts.subFiles} files`);
      console.log('  ───────────────────────────────────────────────────────────────────\n');
      console.log('  Next:');
      console.log('    oracle void index       (re)build unified lookup index');
      console.log('    oracle void find <q>    search across every file at once\n');
      return;
    }

    // ── INDEX ─────────────────────────────────────────────────────
    // Build a single pattern_index.json that makes every pattern findable
    // by name, regardless of which of the 100+ substrate files it lives in.

    if (sub === 'index') {
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }
      console.log('\n  Building unified pattern index...\n');
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'api_keys.json' && f !== 'pattern_index.json');
      const index = {};
      let totalIndexed = 0;
      for (const f of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          const arr = data.patterns || data.waveforms || data.entries || (Array.isArray(data) ? data : null);
          if (!Array.isArray(arr)) continue;
          for (let i = 0; i < arr.length; i++) {
            const p = arr[i];
            const name = (p && (p.name || p.id || p.pattern || p.key)) || `${f}#${i}`;
            if (!index[name]) index[name] = [];
            index[name].push({ file: f, i });
            totalIndexed++;
          }
        } catch {}
      }
      const out = {
        built: new Date().toISOString(),
        files: files.length,
        totalEntries: totalIndexed,
        uniqueNames: Object.keys(index).length,
        index,
      };
      const outPath = path.join(dir, 'pattern_index.json');
      fs.writeFileSync(outPath, JSON.stringify(out));
      console.log(`  Indexed: ${totalIndexed.toLocaleString()} entries`);
      console.log(`  Unique names: ${out.uniqueNames.toLocaleString()}`);
      console.log(`  Written: ${outPath}\n`);
      console.log('  Now any pattern is findable:  oracle void find <query>\n');
      return;
    }

    // ── FIND ──────────────────────────────────────────────────────
    // Search the unified index by name substring. Builds the index on
    // first run if it isn't there yet.

    if (sub === 'find') {
      const query = positional.slice(1).join(' ').trim();
      if (!query) {
        console.log('\n  Usage: oracle void find <query>');
        console.log('  Example: oracle void find debounce\n');
        return;
      }
      const dir = findVoidDir();
      if (!dir) {
        console.log('\n  Could not find Void-Data-Compressor.\n');
        return;
      }
      const indexPath = path.join(dir, 'pattern_index.json');
      if (!fs.existsSync(indexPath)) {
        console.log('\n  No index yet. Run: oracle void index\n');
        return;
      }
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf-8')).index;
      const q = query.toLowerCase();
      const matches = [];
      for (const name of Object.keys(idx)) {
        if (name.toLowerCase().includes(q)) {
          for (const loc of idx[name]) matches.push({ name, ...loc });
          if (matches.length >= 200) break;
        }
      }
      if (matches.length === 0) {
        console.log(`\n  No patterns matching "${query}".\n`);
        return;
      }
      console.log(`\n  ${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query}":\n`);
      for (const m of matches.slice(0, 40)) {
        console.log(`    ${m.file.padEnd(42)}  #${String(m.i).padStart(5)}  ${m.name}`);
      }
      if (matches.length > 40) console.log(`    ... and ${matches.length - 40} more`);
      console.log();
      return;
    }

    console.log(`\n  Unknown command: void ${sub}`);
    console.log('  Run: oracle void help\n');
  };
}

module.exports = { registerVoidCommands };
