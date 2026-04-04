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

function getPatternCounts(dir) {
  let base = 0, learned = 0, subFiles = 0;

  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.json') && (f.includes('substrate') || f === 'oracle_patterns.json' || f === 'complete_physics_map.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
        base += (data.patterns || []).length;
        subFiles++;
      } catch {}
    }
  }

  const learnedPath = path.join(dir, 'learned_patterns.json');
  if (fs.existsSync(learnedPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(learnedPath, 'utf-8'));
      learned = (data.patterns || []).length;
    } catch {}
  }

  return { base, learned, total: base + learned, subFiles };
}

function registerVoidCommands(handlers, { oracle }) {

  // oracle void — show help
  handlers['void'] = (args) => {
    const positional = args._positional || [];
    const sub = positional[0] || null;

    if (!sub || sub === 'help') {
      console.log('\n  Void Compressor Controls:\n');
      console.log('    oracle void status     what\'s going on?');
      console.log('    oracle void start      start learning from reality');
      console.log('    oracle void stop       stop the crawler');
      console.log('    oracle void watch      watch it learn live (Ctrl+C to stop)');
      console.log('    oracle void patterns   how many patterns so far?');
      console.log('    oracle void cascade    check any file against reality');
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
        console.log(`  Substrate:  Found at ${dir}`);
        console.log(`  Patterns:   ${counts.total.toLocaleString()} total`);
        console.log(`    Base:     ${counts.base.toLocaleString()} (${counts.subFiles} substrate files)`);
        console.log(`    Learned:  ${counts.learned.toLocaleString()} (from crawler)`);
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

      console.log('\n  ═══════════════════════════════════════');
      console.log('  PATTERN COUNT');
      console.log('  ═══════════════════════════════════════\n');
      console.log(`    Base substrate:     ${counts.base.toLocaleString()}`);
      console.log(`    Crawler learned:    ${counts.learned.toLocaleString()}`);
      console.log(`    ─────────────────────────────`);
      console.log(`    TOTAL:              ${counts.total.toLocaleString()}`);
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

    console.log(`\n  Unknown command: void ${sub}`);
    console.log('  Run: oracle void help\n');
  };
}

module.exports = { registerVoidCommands };
