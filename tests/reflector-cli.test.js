const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const { join } = require('path');

const BIN = join(__dirname, '..', 'bin', 'reflector');
const CWD = join(__dirname, '..');

function run(args, opts = {}) {
  try {
    return execFileSync(process.execPath, [BIN, ...args], {
      cwd: opts.cwd || CWD,
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, NO_COLOR: '1' },
    });
  } catch (err) {
    return err.stdout || err.stderr || err.message;
  }
}

describe('Reflector CLI — help', () => {
  it('should show help with no args', () => {
    const output = run([]);
    assert.ok(output.includes('Remembrance Reflector BOT'));
    assert.ok(output.includes('Usage:'));
  });

  it('should show help with "help" command', () => {
    const output = run(['help']);
    assert.ok(output.includes('Commands:'));
    assert.ok(output.includes('run'));
    assert.ok(output.includes('snapshot'));
    assert.ok(output.includes('evaluate'));
    assert.ok(output.includes('dry-run'));
    assert.ok(output.includes('config'));
    assert.ok(output.includes('trend'));
  });
});

describe('Reflector CLI — evaluate', () => {
  it('should evaluate a file and show coherence', () => {
    const output = run(['evaluate', '--file', 'src/reflector/scoring.js']);
    assert.ok(output.includes('Evaluation:'));
    assert.ok(output.includes('Language:'));
    assert.ok(output.includes('Coherence:'));
    assert.ok(output.includes('Covenant:'));
  });

  it('should output JSON with --json flag', () => {
    const output = run(['evaluate', '--file', 'src/reflector/scoring.js', '--json']);
    const data = JSON.parse(output);
    assert.ok(typeof data.coherence === 'number');
    assert.ok(typeof data.language === 'string');
  });

  it('should error without --file', () => {
    const output = run(['evaluate']);
    assert.ok(output.includes('--file required'));
  });
});

describe('Reflector CLI — score', () => {
  it('should deep-score a file', () => {
    const output = run(['score', '--file', 'src/reflector/scoring.js']);
    assert.ok(output.includes('Deep Score:'));
    assert.ok(output.includes('Aggregate:'));
    assert.ok(output.includes('SERF:'));
    assert.ok(output.includes('Complexity:'));
    assert.ok(output.includes('Security:'));
  });

  it('should output JSON with --json flag', () => {
    const output = run(['score', '--file', 'src/reflector/scoring.js', '--json']);
    const data = JSON.parse(output);
    assert.ok(typeof data.aggregate === 'number');
    assert.ok(typeof data.serfCoherence === 'number');
    assert.ok(data.complexity);
    assert.ok(data.security);
  });
});

describe('Reflector CLI — config', () => {
  it('should show central config', () => {
    const output = run(['config']);
    assert.ok(output.includes('Central Configuration'));
    assert.ok(output.includes('thresholds'));
    assert.ok(output.includes('scanning'));
    assert.ok(output.includes('safety'));
  });

  it('should output config as JSON', () => {
    const output = run(['config', '--json']);
    const data = JSON.parse(output);
    assert.ok(data.thresholds);
    assert.ok(data.scanning);
    assert.ok(data.safety);
    assert.ok(data.scoring);
  });
});

describe('Reflector CLI — stats', () => {
  it('should show statistics', () => {
    const output = run(['stats']);
    assert.ok(output.includes('Reflector Statistics'));
    assert.ok(output.includes('Total runs:'));
    assert.ok(output.includes('Avg coherence:'));
    assert.ok(output.includes('Trend:'));
  });

  it('should output stats as JSON', () => {
    const output = run(['stats', '--json']);
    const data = JSON.parse(output);
    assert.ok(typeof data.totalRuns === 'number');
    assert.ok(typeof data.avgCoherence === 'number');
    assert.ok(typeof data.trend === 'string');
  });
});

describe('Reflector CLI — log', () => {
  it('should show log entries or empty message', () => {
    const output = run(['log']);
    assert.ok(output.includes('Reflector Log') || output.includes('No log entries'));
  });
});

describe('Reflector CLI — unknown command', () => {
  it('should error on unknown command', () => {
    const output = run(['foobar']);
    assert.ok(output.includes('Unknown command'));
  });
});

describe('Reflector CLI — snapshot', () => {
  it('should take a snapshot and show results', () => {
    const output = run(['snapshot', '--max-files', '5']);
    assert.ok(output.includes('Taking Coherence Snapshot'));
    assert.ok(output.includes('Files scanned:'));
    assert.ok(output.includes('Avg coherence:'));
  });
});

describe('Reflector CLI — package.json', () => {
  it('should have reflector in bin field', () => {
    const pkg = require('../package.json');
    assert.ok(pkg.bin.reflector);
    assert.ok(pkg.bin.reflector.includes('bin/reflector'));
  });

  it('should include bin/ in files field', () => {
    const pkg = require('../package.json');
    assert.ok(pkg.files.includes('bin/'));
  });
});
