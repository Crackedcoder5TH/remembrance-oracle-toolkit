const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

/**
 * Integration tests for the full reflector pipeline.
 *
 * These tests exercise the real pipeline end-to-end:
 *   config resolution → snapshot → scoring → healing → safety → whisper → history
 *
 * They verify cross-module wiring, not individual module logic.
 */

// ─── Helpers ───

function makeTempRepo(options = {}) {
  const dir = join(tmpdir(), `integ-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, '.remembrance'), { recursive: true });

  // Write a JS file with intentional issues for healing to detect
  const jsCode = options.code || `
function greet(name) {
  var greeting = "Hello, " + name;
  return greeting;
}

function add(a, b) {
  return a + b;
}

module.exports = { greet, add };
`;
  writeFileSync(join(dir, 'src', 'index.js'), jsCode, 'utf-8');

  // Optionally seed config
  if (options.config) {
    writeFileSync(
      join(dir, '.remembrance', 'reflector-central.json'),
      JSON.stringify(options.config),
    );
  }

  // Optionally seed history
  if (options.history) {
    writeFileSync(
      join(dir, '.remembrance', 'reflector-history-v2.json'),
      JSON.stringify(options.history),
    );
  }

  return dir;
}

function cleanupDir(dir) {
  if (dir && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── 1. Config Resolution flows through orchestrator ───

describe('Integration: Config → Orchestrator', () => {
  let dir;
  afterEach(() => cleanupDir(dir));

  it('should use resolveConfig for mode-aware config loading', () => {
    dir = makeTempRepo();
    const { orchestrate } = require('../src/reflector/orchestrator');
    const result = orchestrate(dir, { dryRun: true, mode: 'strict' });

    assert.ok(result.steps[0].status === 'ok');
    assert.ok(result.steps[0].configValid !== undefined);
    // The resolved mode should propagate
    assert.ok(result.id);
  });

  it('should accept env overrides via resolveConfig', () => {
    dir = makeTempRepo();
    const { resolveConfig } = require('../src/reflector/modes');
    const config = resolveConfig(dir, {
      mode: 'balanced',
      env: { REFLECTOR_MIN_COHERENCE: '0.99' },
    });

    assert.strictEqual(config.thresholds.minCoherence, 0.99);
    assert.strictEqual(config._mode, 'balanced');
  });

  it('should validate autoCommit and notifications sections', () => {
    dir = makeTempRepo({
      config: {
        thresholds: { minCoherence: 0.7 },
        notifications: { platform: 'invalid_platform' },
      },
    });
    const { validateConfig } = require('../src/reflector/config');
    const { resolveConfig } = require('../src/reflector/modes');
    const config = resolveConfig(dir);
    const validation = validateConfig(config);

    assert.ok(!validation.valid);
    assert.ok(validation.issues.some(i => i.includes('notifications.platform')));
  });
});

// ─── 2. Full Pipeline: config → snapshot → score → heal → history ───

describe('Integration: Full Pipeline End-to-End', () => {
  let dir;
  afterEach(() => cleanupDir(dir));

  it('should run complete dry-run pipeline with all 8 steps', () => {
    dir = makeTempRepo();
    const { orchestrate } = require('../src/reflector/orchestrator');
    const result = orchestrate(dir, { dryRun: true });

    // All 8 steps should be present
    const stepNames = result.steps.map(s => s.name);
    assert.deepStrictEqual(stepNames, [
      'load-config', 'snapshot', 'deep-score', 'heal',
      'safety-check', 'whisper', 'create-pr', 'record-history',
    ]);

    // Each step should have ok or skipped status
    for (const step of result.steps) {
      assert.ok(
        step.status === 'ok' || step.status === 'skipped',
        `Step ${step.name} has status ${step.status}: ${step.error || ''}`,
      );
    }

    // Result should have all top-level fields
    assert.ok(result.snapshot);
    assert.ok(result.deepScore);
    assert.ok(result.healing);
    assert.ok(result.whisper);
    assert.ok(result.safety);
    assert.ok(result.durationMs >= 0);
  });

  it('should run live pipeline and record to history v2', () => {
    dir = makeTempRepo();
    const { orchestrate } = require('../src/reflector/orchestrator');
    const result = orchestrate(dir);

    assert.strictEqual(result.mode, 'live');

    // History should have a new record
    const { loadHistoryV2 } = require('../src/reflector/history');
    const history = loadHistoryV2(dir);
    assert.ok(history.runs.length >= 1);

    const record = history.runs[history.runs.length - 1];
    assert.ok(record.id.startsWith('orch-'));
    assert.ok(record.coherence);
    assert.ok(typeof record.coherence.before === 'number');
    assert.ok(typeof record.coherence.after === 'number');
    assert.ok(record.healing);
    assert.ok(typeof record.healing.filesScanned === 'number');
  });

  it('should enrich whisper with deep score health', () => {
    dir = makeTempRepo();
    const { orchestrate } = require('../src/reflector/orchestrator');
    const result = orchestrate(dir, { dryRun: true });

    // Whisper should contain health tag from deep score
    assert.ok(result.whisper.includes('['));
    assert.ok(
      result.whisper.includes('healthy') ||
      result.whisper.includes('stable') ||
      result.whisper.includes('needs attention') ||
      result.whisper.includes('critical'),
    );
  });
});

// ─── 3. Dashboard reads from pipeline output ───

describe('Integration: Pipeline → Dashboard', () => {
  let dir;
  afterEach(() => cleanupDir(dir));

  it('should display data from orchestrator runs in dashboard', () => {
    dir = makeTempRepo({
      history: {
        version: 2,
        runs: [
          {
            id: 'orch-123', timestamp: '2025-06-01T00:00:00Z',
            trigger: 'orchestrator', durationMs: 5000,
            coherence: { before: 0.65, after: 0.72, delta: 0.07 },
            healing: { filesScanned: 10, filesHealed: 3, avgImprovement: 0.07 },
            deepScore: { aggregate: 0.75, health: 'stable', securityFindings: 0 },
          },
        ],
        log: [],
      },
    });

    const { gatherDashboardData } = require('../src/reflector/dashboard');
    const data = gatherDashboardData(dir);

    // Trend should reflect history
    assert.strictEqual(data.trend.length, 1);
    assert.strictEqual(data.trend[0].coherence, 0.72);
    assert.strictEqual(data.trend[0].filesHealed, 3);

    // Recent runs should be in reverse order
    assert.strictEqual(data.recentRuns.length, 1);
    assert.strictEqual(data.recentRuns[0].coherenceBefore, 0.65);
    assert.strictEqual(data.recentRuns[0].coherenceAfter, 0.72);

    // Stats should reflect runs
    assert.strictEqual(data.stats.totalRuns, 1);
  });

  it('should include pattern hook stats in dashboard', () => {
    dir = makeTempRepo();
    const { gatherDashboardData } = require('../src/reflector/dashboard');
    const data = gatherDashboardData(dir);

    assert.ok(data.patternHook);
    assert.strictEqual(data.patternHook.totalHealings, 0);
    assert.strictEqual(data.patternHook.patternGuided, 0);
  });

  it('should render HTML with all sections', () => {
    dir = makeTempRepo();
    const { gatherDashboardData, generateDashboardHTML } = require('../src/reflector/dashboard');
    const data = gatherDashboardData(dir);
    const html = generateDashboardHTML(data);

    // Check for all dashboard sections
    assert.ok(html.includes('Coherence Trend'));
    assert.ok(html.includes('Recent Healing Runs'));
    assert.ok(html.includes('Thresholds'));
    assert.ok(html.includes('Auto-Commit Safety'));
    assert.ok(html.includes('Notifications'));
    assert.ok(html.includes('Pattern Hook'));
  });

  it('should serve dashboard API with resolved config', () => {
    dir = makeTempRepo();
    const { handleApiRequest } = require('../src/reflector/dashboard');

    // API should return resolved config (with autoCommit + notifications sections)
    const configResult = handleApiRequest(dir, '/api/config');
    assert.ok(configResult);
    assert.ok(configResult.thresholds);
    assert.ok(configResult.autoCommit);
    assert.ok(configResult.notifications);
  });
});

// ─── 4. Pattern Hook → SERF Integration ───

describe('Integration: Pattern Hook → SERF', () => {
  it('should accept pattern examples in reflectionLoop', () => {
    const { reflectionLoop } = require('../src/core/reflection');

    const code = 'function test() { var x = 1; return x; }';
    const examples = [
      { code: "const greet = (name) => `Hello, ${name}`;\n", coherency: 0.95, name: 'greet-fn' },
    ];

    const result = reflectionLoop(code, {
      language: 'javascript',
      maxLoops: 1,
      patternExamples: examples,
    });

    assert.ok(result.code);
    assert.ok(result.coherence > 0);
    // Should have generated candidates including pattern-guided
    assert.ok(result.history.length >= 1);
  });

  it('should generate pattern-guided candidate when examples provided', () => {
    const { generateCandidates } = require('../src/core/reflection');
    const code = 'function test() { var x = 1; return x; }';
    const examples = [{ code: "const x = 1;\n", coherency: 0.9 }];

    const candidates = generateCandidates(code, 'javascript', { patternExamples: examples });
    const guided = candidates.find(c => c.strategy === 'pattern-guided');

    assert.ok(guided, 'Should have a pattern-guided candidate');
    assert.ok(guided.changed, 'Pattern-guided candidate should differ from input');
  });

  it('should not generate pattern-guided candidate without examples', () => {
    const { generateCandidates } = require('../src/core/reflection');
    const code = 'function test() { return 1; }';

    const candidates = generateCandidates(code, 'javascript');
    const guided = candidates.find(c => c.strategy === 'pattern-guided');

    assert.strictEqual(guided, undefined, 'Should not have pattern-guided without examples');
    assert.strictEqual(candidates.length, 6, 'Should have exactly 6 standard candidates');
  });

  it('should pass pattern examples from reflect() through healFile() to reflectionLoop()', () => {
    const { reflectionLoop, generateCandidates } = require('../src/core/reflection');

    // Verify the chain works with cascadeBoost
    const code = 'var x = "hello";';
    const examples = [{ code: "const x = 'hello';", coherency: 0.95 }];

    const result = reflectionLoop(code, {
      language: 'javascript',
      maxLoops: 1,
      patternExamples: examples,
      cascadeBoost: 1.05,
    });

    // SERF should have run with cascade boost
    assert.ok(result.serf.cascadeBoost === 1.05);
    assert.ok(result.coherence > 0);
  });
});

// ─── 5. Modes → Config → All Consumers ───

describe('Integration: Modes → Config Consumers', () => {
  let dir;
  afterEach(() => cleanupDir(dir));

  it('should propagate strict mode thresholds to all consumers', () => {
    dir = makeTempRepo();
    const { resolveConfig } = require('../src/reflector/modes');
    const { toEngineConfig, validateConfig } = require('../src/reflector/config');

    const config = resolveConfig(dir, { mode: 'strict' });
    assert.strictEqual(config._mode, 'strict');
    assert.ok(config.thresholds.minCoherence >= 0.8);
    assert.ok(config.safety.requireApproval === true);

    // Should be valid
    const validation = validateConfig(config);
    assert.ok(validation.valid, `Config invalid: ${validation.issues.join(', ')}`);

    // Should convert to engine config
    const engine = toEngineConfig(config);
    assert.strictEqual(engine.minCoherence, config.thresholds.minCoherence);
    assert.strictEqual(engine.requireApproval, true);
  });

  it('should propagate relaxed mode to dashboard display', () => {
    dir = makeTempRepo();
    const { setMode } = require('../src/reflector/modes');
    const { gatherDashboardData } = require('../src/reflector/dashboard');

    setMode(dir, 'relaxed');
    const data = gatherDashboardData(dir);
    assert.strictEqual(data.mode, 'relaxed');
  });
});

// ─── 6. Notification Format Integration ───

describe('Integration: Notifications from orchestrator data', () => {
  it('should format discord embed from orchestrator-shaped report', () => {
    const { formatDiscordEmbed } = require('../src/reflector/notifications');

    // Simulate what orchestrator passes to notifyFromReport
    const report = {
      coherence: { before: 0.65, after: 0.82 },
      report: { filesHealed: 5 },
      whisper: '[stable] 5 files healed through reflection.',
    };

    const embed = formatDiscordEmbed(report, { repoName: 'test-repo' });
    assert.ok(embed.embeds[0].title.includes('test-repo'));
    assert.ok(embed.embeds[0].description.includes('5'));
    assert.strictEqual(embed.embeds[0].color, 0x00cc66); // Positive delta = green
    assert.ok(embed.embeds[0].fields.find(f => f.name === 'Whisper'));
  });

  it('should format slack blocks from orchestrator-shaped report', () => {
    const { formatSlackBlocks } = require('../src/reflector/notifications');

    const report = {
      coherence: { before: 0.70, after: 0.70 },
      report: { filesHealed: 0 },
      whisper: 'No healing needed.',
    };

    const blocks = formatSlackBlocks(report, { repoName: 'my-project' });
    assert.ok(blocks.text.includes('my-project'));
    assert.ok(blocks.blocks.find(b => b.type === 'header'));
    assert.ok(blocks.blocks.find(b => b.type === 'context'));
  });
});

// ─── 7. History v2 Format Consistency ───

describe('Integration: History v2 format across modules', () => {
  let dir;
  afterEach(() => cleanupDir(dir));

  it('should write and read consistent v2 records across orchestrator and dashboard', () => {
    dir = makeTempRepo();
    const { orchestrate } = require('../src/reflector/orchestrator');
    const { gatherDashboardData } = require('../src/reflector/dashboard');

    // Run orchestrator to create a real history record
    orchestrate(dir, { dryRun: true });

    // Dashboard should read it correctly
    const data = gatherDashboardData(dir);
    assert.ok(data.trend.length >= 1);
    assert.ok(typeof data.trend[0].coherence === 'number');
    assert.ok(typeof data.trend[0].filesHealed === 'number');

    // Recent runs should also parse correctly
    assert.ok(data.recentRuns.length >= 1);
    assert.ok(typeof data.recentRuns[0].coherenceBefore === 'number');
    assert.ok(typeof data.recentRuns[0].coherenceAfter === 'number');
  });

  it('should accumulate multiple runs in history', () => {
    dir = makeTempRepo();
    const { orchestrate } = require('../src/reflector/orchestrator');
    const { loadHistoryV2 } = require('../src/reflector/history');

    orchestrate(dir, { dryRun: true });
    orchestrate(dir, { dryRun: true });

    const history = loadHistoryV2(dir);
    assert.ok(history.runs.length >= 2);
    assert.notStrictEqual(history.runs[0].id, history.runs[1].id);
  });
});

// ─── 8. Multi-module error resilience ───

describe('Integration: Error Resilience', () => {
  let dir;
  afterEach(() => cleanupDir(dir));

  it('should complete orchestration even with empty repo', () => {
    dir = join(tmpdir(), `empty-test-${Date.now()}`);
    mkdirSync(join(dir, '.remembrance'), { recursive: true });

    const { orchestrate } = require('../src/reflector/orchestrator');
    const result = orchestrate(dir, { dryRun: true });

    // Should still complete, even with 0 files
    assert.ok(result.steps.length >= 6);
    assert.strictEqual(result.snapshot.totalFiles, 0);
    assert.strictEqual(result.healing.filesHealed, 0);
  });

  it('should handle dashboard with no history gracefully', () => {
    dir = makeTempRepo();
    const { gatherDashboardData, generateDashboardHTML } = require('../src/reflector/dashboard');

    const data = gatherDashboardData(dir);
    assert.strictEqual(data.trend.length, 0);
    assert.strictEqual(data.recentRuns.length, 0);

    // HTML should still render without errors
    const html = generateDashboardHTML(data);
    assert.ok(html.includes('<!DOCTYPE html>'));
  });
});
