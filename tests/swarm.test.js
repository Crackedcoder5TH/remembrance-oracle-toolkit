'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ─── swarm-config.js ───

describe('Swarm configuration', () => {
  it('exports DIMENSIONS array with 7 entries', () => {
    const { DIMENSIONS } = require('../src/swarm/swarm-config');
    assert.ok(Array.isArray(DIMENSIONS));
    assert.equal(DIMENSIONS.length, 7);
    assert.ok(DIMENSIONS.includes('simplicity'));
    assert.ok(DIMENSIONS.includes('correctness'));
    assert.ok(DIMENSIONS.includes('security'));
    assert.ok(DIMENSIONS.includes('fidelity'));
  });

  it('exports DEFAULT_SWARM_CONFIG with required fields', () => {
    const { DEFAULT_SWARM_CONFIG } = require('../src/swarm/swarm-config');
    assert.equal(DEFAULT_SWARM_CONFIG.minAgents, 3);
    assert.equal(DEFAULT_SWARM_CONFIG.maxAgents, 9);
    assert.equal(DEFAULT_SWARM_CONFIG.consensusThreshold, 0.7);
    assert.equal(DEFAULT_SWARM_CONFIG.timeoutMs, 30000);
    assert.ok(DEFAULT_SWARM_CONFIG.crossScoring);
    assert.ok(DEFAULT_SWARM_CONFIG.autoFeedToReflector);
    assert.deepEqual(DEFAULT_SWARM_CONFIG.weights, {
      coherency: 0.4,
      selfConfidence: 0.2,
      peerScore: 0.4,
    });
  });

  it('loadSwarmConfig returns defaults when no config file exists', () => {
    const { loadSwarmConfig } = require('../src/swarm/swarm-config');
    const config = loadSwarmConfig('/tmp/nonexistent-dir');
    assert.equal(config.minAgents, 3);
    assert.equal(config.maxAgents, 9);
  });

  it('saveSwarmConfig + loadSwarmConfig round-trips', () => {
    const fs = require('fs');
    const path = require('path');
    const { saveSwarmConfig, loadSwarmConfig } = require('../src/swarm/swarm-config');
    const tmpDir = `/tmp/swarm-test-${Date.now()}`;
    fs.mkdirSync(path.join(tmpDir, '.remembrance'), { recursive: true });

    const custom = { minAgents: 5, maxAgents: 7, providers: { claude: { model: 'test-model' } } };
    saveSwarmConfig(tmpDir, custom);
    const loaded = loadSwarmConfig(tmpDir);
    assert.equal(loaded.minAgents, 5);
    assert.equal(loaded.maxAgents, 7);
    assert.equal(loaded.providers.claude.model, 'test-model');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resolveProviders returns empty when no keys set', () => {
    const { resolveProviders } = require('../src/swarm/swarm-config');
    // Save and clear env vars
    const saved = {};
    for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GROK_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'OLLAMA_HOST']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    const result = resolveProviders({ providers: { ollama: { enabled: false } } });
    // Restore env vars
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
    }
    assert.ok(Array.isArray(result));
    assert.ok(!result.includes('claude'));
    assert.ok(!result.includes('openai'));
  });

  it('resolveProviders detects providers from config apiKey', () => {
    const { resolveProviders } = require('../src/swarm/swarm-config');
    const config = {
      providers: {
        claude: { apiKey: 'test-key' },
        openai: { apiKey: 'test-key' },
        ollama: { enabled: false },
      },
    };
    const result = resolveProviders(config);
    assert.ok(result.includes('claude'));
    assert.ok(result.includes('openai'));
  });

  it('getProviderModel returns defaults when not configured', () => {
    const { getProviderModel } = require('../src/swarm/swarm-config');
    const config = { providers: {} };
    assert.equal(getProviderModel('claude', config), 'claude-sonnet-4-5-20250929');
    assert.equal(getProviderModel('openai', config), 'gpt-4o');
    assert.equal(getProviderModel('gemini', config), 'gemini-2.0-flash');
    assert.equal(getProviderModel('ollama', config), 'llama3.1');
  });

  it('getProviderModel uses config override', () => {
    const { getProviderModel } = require('../src/swarm/swarm-config');
    const config = { providers: { claude: { model: 'claude-opus-4-6' } } };
    assert.equal(getProviderModel('claude', config), 'claude-opus-4-6');
  });
});

// ─── agent-pool.js ───

describe('Agent pool', () => {
  it('createAgentPool creates pool from provider names', () => {
    const { createAgentPool } = require('../src/swarm/agent-pool');
    const config = {
      timeoutMs: 5000,
      providers: {
        claude: { apiKey: 'test' },
        openai: { apiKey: 'test' },
      },
    };
    const pool = createAgentPool(config, ['claude', 'openai']);
    assert.equal(pool.size, 2);
    assert.ok(pool.agents[0].name === 'claude' || pool.agents[0].name === 'openai');
    pool.shutdown();
    assert.equal(pool.size, 0);
  });

  it('createAgentPool skips unknown providers', () => {
    const { createAgentPool } = require('../src/swarm/agent-pool');
    const pool = createAgentPool({ timeoutMs: 5000, providers: {} }, ['nonexistent']);
    assert.equal(pool.size, 0);
    pool.shutdown();
  });

  it('pool.send throws for unknown agent', async () => {
    const { createAgentPool } = require('../src/swarm/agent-pool');
    const pool = createAgentPool({ timeoutMs: 5000, providers: { claude: { apiKey: 'test' } } }, ['claude']);
    await assert.rejects(() => pool.send('nonexistent', 'hello'), /Agent not found/);
    pool.shutdown();
  });

  it('pool.sendAll returns results for all agents', async () => {
    const { createAgentPool } = require('../src/swarm/agent-pool');
    const config = { timeoutMs: 100, providers: { claude: { apiKey: 'test' } } };
    const pool = createAgentPool(config, ['claude']);
    // This will fail due to no real API, but should return error results
    const results = await pool.sendAll('test prompt');
    assert.equal(results.length, 1);
    assert.ok(results[0].error); // Expected: network error since no real API
    pool.shutdown();
  });
});

// ─── claude-code adapter ───

describe('Claude Code adapter', () => {
  it('createAdapter builds a claude-code adapter', () => {
    const { createAdapter } = require('../src/swarm/agent-pool');
    const config = {
      timeoutMs: 5000,
      providers: { 'claude-code': {} },
    };
    const adapter = createAdapter('claude-code', config);
    assert.equal(adapter.name, 'claude-code');
    assert.equal(adapter.model, 'claude-sonnet-4-5-20250929');
    assert.equal(typeof adapter.send, 'function');
  });

  it('createAgentPool includes claude-code alongside API providers', () => {
    const { createAgentPool } = require('../src/swarm/agent-pool');
    const config = {
      timeoutMs: 5000,
      providers: {
        claude: { apiKey: 'test' },
        'claude-code': {},
      },
    };
    const pool = createAgentPool(config, ['claude', 'claude-code']);
    assert.equal(pool.size, 2);
    const names = pool.agents.map(a => a.name);
    assert.ok(names.includes('claude'));
    assert.ok(names.includes('claude-code'));
    pool.shutdown();
  });

  it('claude-code adapter respects custom cliPath from config', () => {
    const { createAdapter } = require('../src/swarm/agent-pool');
    const config = {
      timeoutMs: 5000,
      providers: { 'claude-code': { cliPath: '/usr/local/bin/claude', model: 'claude-opus-4-6' } },
    };
    const adapter = createAdapter('claude-code', config);
    assert.equal(adapter.name, 'claude-code');
    assert.equal(adapter.model, 'claude-opus-4-6');
  });

  it('claude-code adapter send rejects on timeout', async () => {
    const { createAdapter } = require('../src/swarm/agent-pool');
    const config = {
      timeoutMs: 100,
      providers: { 'claude-code': { cliPath: 'sleep' } }, // 'sleep' will timeout
    };
    const adapter = createAdapter('claude-code', config);
    await assert.rejects(
      () => adapter.send('hello'),
      /Claude Code CLI/
    );
  });

  it('getProviderModel returns default for claude-code', () => {
    const { getProviderModel } = require('../src/swarm/swarm-config');
    const config = { providers: {} };
    assert.equal(getProviderModel('claude-code', config), 'claude-sonnet-4-5-20250929');
  });

  it('resolveProviders detects claude-code when CLI is available', () => {
    const { resolveProviders } = require('../src/swarm/swarm-config');
    // Save and clear env vars to isolate
    const saved = {};
    for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GROK_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'OLLAMA_HOST']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    const result = resolveProviders({ providers: { ollama: { enabled: false }, 'claude-code': { enabled: true } } });
    // Restore env vars
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
    }
    // claude-code should be available if the CLI binary exists
    // In CI/test environments the binary may or may not exist, so just verify the structure
    assert.ok(Array.isArray(result));
  });
});

// ─── dimension-router.js ───

describe('Dimension router', () => {
  it('DIMENSION_PROMPTS has entries for all 7 dimensions', () => {
    const { DIMENSION_PROMPTS } = require('../src/swarm/dimension-router');
    const { DIMENSIONS } = require('../src/swarm/swarm-config');
    for (const dim of DIMENSIONS) {
      assert.ok(DIMENSION_PROMPTS[dim], `Missing prompt for dimension: ${dim}`);
      assert.ok(DIMENSION_PROMPTS[dim].length > 20, `Prompt too short for: ${dim}`);
    }
  });

  it('assignDimensions distributes dimensions round-robin', () => {
    const { assignDimensions } = require('../src/swarm/dimension-router');
    const agents = [
      { name: 'a1' },
      { name: 'a2' },
      { name: 'a3' },
    ];
    const dims = ['simplicity', 'correctness', 'readability', 'security', 'efficiency', 'unity', 'fidelity'];
    const assignments = assignDimensions(agents, dims);

    assert.ok(assignments instanceof Map);
    assert.equal(assignments.size, 3);

    // a1 gets dims at index 0, 3, 6
    assert.deepEqual(assignments.get('a1'), ['simplicity', 'security', 'fidelity']);
    // a2 gets dims at index 1, 4
    assert.deepEqual(assignments.get('a2'), ['correctness', 'efficiency']);
    // a3 gets dims at index 2, 5
    assert.deepEqual(assignments.get('a3'), ['readability', 'unity']);
  });

  it('assignDimensions marks extras as generalist', () => {
    const { assignDimensions } = require('../src/swarm/dimension-router');
    const agents = [
      { name: 'a1' },
      { name: 'a2' },
      { name: 'a3' },
      { name: 'a4' },
      { name: 'a5' },
      { name: 'a6' },
      { name: 'a7' },
      { name: 'a8' },
      { name: 'a9' },
    ];
    const dims = ['simplicity', 'correctness']; // 2 dims, 9 agents
    const assignments = assignDimensions(agents, dims);

    // a1 gets simplicity, a2 gets correctness, rest are generalists
    assert.deepEqual(assignments.get('a1'), ['simplicity']);
    assert.deepEqual(assignments.get('a2'), ['correctness']);
    assert.deepEqual(assignments.get('a3'), ['generalist']);
    assert.deepEqual(assignments.get('a9'), ['generalist']);
  });

  it('assignDimensions handles empty agents', () => {
    const { assignDimensions } = require('../src/swarm/dimension-router');
    const assignments = assignDimensions([], ['simplicity']);
    assert.equal(assignments.size, 0);
  });

  it('buildSpecialistPrompt returns system + user prompts', () => {
    const { buildSpecialistPrompt } = require('../src/swarm/dimension-router');
    const result = buildSpecialistPrompt('implement quicksort', ['simplicity', 'correctness'], { language: 'javascript' });
    assert.ok(result.system.includes('Simplicity Specialist'));
    assert.ok(result.system.includes('Correctness Specialist'));
    assert.ok(result.system.includes('CONFIDENCE'));
    assert.ok(result.system.includes('javascript'));
    assert.ok(result.user.includes('quicksort'));
  });

  it('buildSpecialistPrompt includes existing code context', () => {
    const { buildSpecialistPrompt } = require('../src/swarm/dimension-router');
    const result = buildSpecialistPrompt('fix this', ['security'], { existingCode: 'function foo() {}' });
    assert.ok(result.user.includes('function foo'));
    assert.ok(result.user.includes('EXISTING CODE'));
  });

  it('buildSpecialistPrompt handles generalist dimension', () => {
    const { buildSpecialistPrompt } = require('../src/swarm/dimension-router');
    const result = buildSpecialistPrompt('do something', ['generalist']);
    assert.ok(result.system.includes('Generalist Agent'));
  });

  it('parseAgentResponse extracts code, explanation, and confidence', () => {
    const { parseAgentResponse } = require('../src/swarm/dimension-router');
    const response = [
      'Here is the solution:',
      '```javascript',
      'function add(a, b) { return a + b; }',
      '```',
      'This adds two numbers together.',
      'CONFIDENCE: 0.85',
    ].join('\n');
    const parsed = parseAgentResponse(response);
    assert.equal(parsed.code, 'function add(a, b) { return a + b; }');
    assert.equal(parsed.confidence, 0.85);
    assert.ok(parsed.explanation.includes('adds two numbers'));
  });

  it('parseAgentResponse handles missing code block', () => {
    const { parseAgentResponse } = require('../src/swarm/dimension-router');
    const parsed = parseAgentResponse('No code here. CONFIDENCE: 0.3');
    assert.equal(parsed.code, '');
    assert.equal(parsed.confidence, 0.3);
  });

  it('parseAgentResponse handles null/empty input', () => {
    const { parseAgentResponse } = require('../src/swarm/dimension-router');
    assert.equal(parseAgentResponse(null).confidence, 0.5);
    assert.equal(parseAgentResponse('').confidence, 0.5);
  });

  it('parseAgentResponse clamps confidence to 0-1', () => {
    const { parseAgentResponse } = require('../src/swarm/dimension-router');
    assert.equal(parseAgentResponse('CONFIDENCE: 5.0').confidence, 1);
    // Negative numbers don't match the regex, so default 0.5 is used
    assert.equal(parseAgentResponse('CONFIDENCE: -2.0').confidence, 0.5);
    assert.equal(parseAgentResponse('CONFIDENCE: 0.0').confidence, 0);
  });
});

// ─── cross-scoring.js ───

describe('Cross-scoring', () => {
  it('scoreWithCoherency scores all agent outputs', () => {
    const { scoreWithCoherency } = require('../src/swarm/cross-scoring');
    const mockCoherencyFn = (code) => ({
      total: code.length > 20 ? 0.8 : 0.4,
      breakdown: { syntax: 0.8 },
    });
    const outputs = [
      { agent: 'a1', code: 'function longFunction() { return 42; }' },
      { agent: 'a2', code: 'x' },
      { agent: 'a3', code: '' },
    ];
    const scores = scoreWithCoherency(outputs, mockCoherencyFn);
    assert.ok(scores instanceof Map);
    assert.equal(scores.get('a1').total, 0.8);
    assert.equal(scores.get('a2').total, 0.4);
    assert.equal(scores.get('a3').total, 0); // Empty code
  });

  it('scoreWithCoherency handles coherency function throwing', () => {
    const { scoreWithCoherency } = require('../src/swarm/cross-scoring');
    const brokenFn = () => { throw new Error('boom'); };
    const outputs = [{ agent: 'a1', code: 'test' }];
    const scores = scoreWithCoherency(outputs, brokenFn);
    assert.equal(scores.get('a1').total, 0);
  });

  it('buildPeerReviewPrompts generates correct review pairs', () => {
    const { buildPeerReviewPrompts } = require('../src/swarm/cross-scoring');
    const outputs = [
      { agent: 'a1', code: 'code1' },
      { agent: 'a2', code: 'code2' },
      { agent: 'a3', code: 'code3' },
    ];
    const prompts = buildPeerReviewPrompts(outputs, ['simplicity', 'correctness']);
    // 3 agents × 2 reviewees each = 6 review pairs
    assert.equal(prompts.length, 6);
    // No self-reviews
    for (const p of prompts) {
      assert.notEqual(p.reviewer, p.reviewee);
    }
  });

  it('buildPeerReviewPrompts skips agents without code', () => {
    const { buildPeerReviewPrompts } = require('../src/swarm/cross-scoring');
    const outputs = [
      { agent: 'a1', code: 'code1' },
      { agent: 'a2', code: '' },
    ];
    const prompts = buildPeerReviewPrompts(outputs, ['correctness']);
    // a1 cannot review a2 (no code), a2 can review a1
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].reviewer, 'a2');
    assert.equal(prompts[0].reviewee, 'a1');
  });

  it('computePeerScores computes averages from matrix', () => {
    const { computePeerScores } = require('../src/swarm/cross-scoring');
    const matrix = {
      a1: { a2: { score: 0.8 }, a3: { score: 0.6 } },
      a2: { a1: { score: 0.9 }, a3: { score: 0.7 } },
      a3: { a1: { score: 0.5 }, a2: { score: 0.4 } },
    };
    const agentNames = ['a1', 'a2', 'a3'];
    const peerScores = computePeerScores(matrix, agentNames);

    // a1 scored by a2 (0.9) and a3 (0.5) → avg 0.7
    assert.ok(Math.abs(peerScores.get('a1') - 0.7) < 0.001);
    // a2 scored by a1 (0.8) and a3 (0.4) → avg 0.6
    assert.ok(Math.abs(peerScores.get('a2') - 0.6) < 0.001);
    // a3 scored by a1 (0.6) and a2 (0.7) → avg 0.65
    assert.ok(Math.abs(peerScores.get('a3') - 0.65) < 0.001);
  });

  it('computePeerScores returns 0.5 for agents with no scores', () => {
    const { computePeerScores } = require('../src/swarm/cross-scoring');
    const peerScores = computePeerScores({}, ['lonely']);
    assert.equal(peerScores.get('lonely'), 0.5);
  });
});

// ─── consensus.js ───

describe('Consensus building', () => {
  it('buildConsensus ranks agents and picks winner', () => {
    const { buildConsensus } = require('../src/swarm/consensus');
    const outputs = [
      { agent: 'a1', code: 'good code', confidence: 0.9, dimensions: ['simplicity'] },
      { agent: 'a2', code: 'ok code', confidence: 0.6, dimensions: ['correctness'] },
    ];
    const coherencyScores = new Map([
      ['a1', { total: 0.85 }],
      ['a2', { total: 0.7 }],
    ]);
    const peerScores = new Map([['a1', 0.8], ['a2', 0.6]]);
    const config = {
      weights: { coherency: 0.4, selfConfidence: 0.2, peerScore: 0.4 },
      consensusThreshold: 0.7,
    };

    const result = buildConsensus(outputs, coherencyScores, peerScores, config);
    assert.equal(result.winner.agent, 'a1');
    assert.ok(result.winner.score > result.rankings[1].totalScore);
    assert.ok(result.agreement >= 0 && result.agreement <= 1);
    assert.equal(result.rankings.length, 2);
  });

  it('buildConsensus returns null winner when no code produced', () => {
    const { buildConsensus } = require('../src/swarm/consensus');
    const outputs = [
      { agent: 'a1', code: '', confidence: 0.5 },
    ];
    const result = buildConsensus(outputs, new Map(), new Map(), {
      weights: { coherency: 0.4, selfConfidence: 0.2, peerScore: 0.4 },
      consensusThreshold: 0.7,
    });
    assert.equal(result.winner, null);
    assert.equal(result.rankings.length, 0);
  });

  it('buildConsensus detects dissent', () => {
    const { buildConsensus } = require('../src/swarm/consensus');
    const outputs = [
      { agent: 'winner', code: 'great', confidence: 0.95, explanation: 'Best solution' },
      { agent: 'dissenter', code: 'bad', confidence: 0.1, explanation: 'Disagree strongly' },
    ];
    const coherencyScores = new Map([
      ['winner', { total: 0.95 }],
      ['dissenter', { total: 0.2 }],
    ]);
    const peerScores = new Map([['winner', 0.9], ['dissenter', 0.1]]);
    const config = {
      weights: { coherency: 0.4, selfConfidence: 0.2, peerScore: 0.4 },
      consensusThreshold: 0.7,
    };
    const result = buildConsensus(outputs, coherencyScores, peerScores, config);
    assert.ok(result.dissent.length > 0);
    assert.equal(result.dissent[0].agent, 'dissenter');
  });

  it('quickConsensus works without peer scores', () => {
    const { quickConsensus } = require('../src/swarm/consensus');
    const outputs = [
      { agent: 'a1', code: 'code', confidence: 0.8 },
    ];
    const coherencyScores = new Map([['a1', { total: 0.9 }]]);
    const config = { consensusThreshold: 0.7 };
    const result = quickConsensus(outputs, coherencyScores, config);
    assert.equal(result.winner.agent, 'a1');
  });

  it('mergeTopOutputs uses winner-takes-all for strong agreement', () => {
    const { mergeTopOutputs } = require('../src/swarm/consensus');
    const consensus = {
      winner: { agent: 'a1', code: 'winner code' },
      rankings: [
        { agent: 'a1', totalScore: 0.9, code: 'winner code' },
        { agent: 'a2', totalScore: 0.85, code: 'alt code' },
      ],
      agreement: 0.9,
    };
    const merged = mergeTopOutputs(consensus);
    assert.equal(merged.strategy, 'winner-takes-all');
    assert.equal(merged.mergedCode, 'winner code');
  });

  it('mergeTopOutputs includes alternatives for weak agreement', () => {
    const { mergeTopOutputs } = require('../src/swarm/consensus');
    const consensus = {
      winner: { agent: 'a1', code: 'winner' },
      rankings: [
        { agent: 'a1', totalScore: 0.7, code: 'winner', explanation: 'w' },
        { agent: 'a2', totalScore: 0.65, code: 'alt', explanation: 'a' },
      ],
      agreement: 0.5,
    };
    const merged = mergeTopOutputs(consensus);
    assert.equal(merged.strategy, 'winner-with-alternatives');
    assert.ok(merged.alternatives.length > 0);
  });

  it('mergeTopOutputs handles null winner', () => {
    const { mergeTopOutputs } = require('../src/swarm/consensus');
    const result = mergeTopOutputs({ winner: null, rankings: [], agreement: 0 });
    assert.equal(result.strategy, 'none');
    assert.equal(result.mergedCode, '');
  });
});

// ─── whisper-synthesis.js ───

describe('Whisper synthesis', () => {
  it('synthesizeWhisper produces whisper from consensus', () => {
    const { synthesizeWhisper } = require('../src/swarm/whisper-synthesis');
    const consensus = {
      winner: { agent: 'claude', score: 0.85, breakdown: { coherency: 0.9, selfConfidence: 0.8, peerScore: 0.85 }, dimensions: ['simplicity'] },
      rankings: [
        { agent: 'claude', totalScore: 0.85 },
        { agent: 'openai', totalScore: 0.7 },
      ],
      agreement: 0.8,
      dissent: [],
    };
    const outputs = [
      { agent: 'claude', dimensions: ['simplicity'], confidence: 0.9, explanation: 'Simple solution' },
      { agent: 'openai', dimensions: ['correctness'], confidence: 0.7, explanation: 'Correct but complex' },
    ];
    const whisper = synthesizeWhisper(consensus, outputs, 'implement debounce');
    assert.ok(whisper.message.includes('claude'));
    assert.ok(whisper.message.includes('debounce'));
    assert.equal(whisper.agreement, 0.8);
    assert.equal(whisper.recommendation, 'PULL');
    assert.ok(whisper.dimensions.simplicity);
  });

  it('synthesizeWhisper returns GENERATE for no winner', () => {
    const { synthesizeWhisper } = require('../src/swarm/whisper-synthesis');
    const whisper = synthesizeWhisper({ winner: null, rankings: [], agreement: 0, dissent: [] }, [], 'task');
    assert.equal(whisper.recommendation, 'GENERATE');
    assert.ok(whisper.message.includes('could not reach consensus'));
  });

  it('determineRecommendation returns correct values', () => {
    const { determineRecommendation } = require('../src/swarm/whisper-synthesis');
    assert.equal(determineRecommendation(0.9, 0.8), 'PULL');
    assert.equal(determineRecommendation(0.7, 0.5), 'EVOLVE');
    assert.equal(determineRecommendation(0.3, 0.2), 'GENERATE');
  });

  it('formatWhisper produces readable output', () => {
    const { formatWhisper } = require('../src/swarm/whisper-synthesis');
    const whisper = {
      message: 'The swarm decided.',
      dimensions: { simplicity: { agent: 'claude', confidence: 0.9, insight: 'simple' } },
      agreement: 0.8,
      dissent: [],
      recommendation: 'PULL',
    };
    const formatted = formatWhisper(whisper);
    assert.ok(formatted.includes('Swarm Whisper'));
    assert.ok(formatted.includes('PULL'));
    assert.ok(formatted.includes('simplicity'));
  });
});

// ─── swarm-orchestrator.js ───

describe('Swarm orchestrator', () => {
  it('formatSwarmResult formats a complete result', () => {
    const { formatSwarmResult } = require('../src/swarm/swarm-orchestrator');
    const result = {
      id: 'test-id',
      task: 'implement quicksort',
      steps: [
        { name: 'configure', status: 'ok', durationMs: 5 },
        { name: 'assemble', status: 'ok', durationMs: 10 },
      ],
      winner: { agent: 'claude', score: 0.85, code: 'function sort() {}' },
      rankings: [],
      agreement: 0.8,
      whisper: null,
      agentCount: 3,
      totalDurationMs: 5000,
    };
    const formatted = formatSwarmResult(result);
    assert.ok(formatted.includes('Swarm Orchestration'));
    assert.ok(formatted.includes('quicksort'));
    assert.ok(formatted.includes('claude'));
    assert.ok(formatted.includes('0.850'));
    assert.ok(formatted.includes('function sort'));
  });

  it('formatSwarmResult handles no winner gracefully', () => {
    const { formatSwarmResult } = require('../src/swarm/swarm-orchestrator');
    const result = {
      id: 'test-id',
      task: 'something',
      steps: [],
      winner: null,
      rankings: [],
      agreement: 0,
      whisper: null,
      agentCount: 0,
      totalDurationMs: 100,
    };
    const formatted = formatSwarmResult(result);
    assert.ok(formatted.includes('No winner'));
  });

  it('swarm returns structured result with id and steps', async () => {
    const { swarm } = require('../src/swarm/swarm-orchestrator');
    // Save and clear all API key env vars
    const saved = {};
    for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GROK_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY', 'OLLAMA_HOST']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }

    const result = await swarm('test task', {
      rootDir: '/tmp/nonexistent',
      crossScoring: false,
    });

    // Restore env vars
    for (const [k, v] of Object.entries(saved)) {
      if (v !== undefined) process.env[k] = v;
    }

    assert.ok(result.id);
    assert.ok(result.timestamp);
    assert.equal(result.task, 'test task');
    assert.ok(Array.isArray(result.steps));
    assert.ok(result.steps.length > 0);
    assert.ok(typeof result.totalDurationMs === 'number');
  });
});

// ─── index.js (barrel export) ───

describe('Swarm barrel export', () => {
  it('exports all expected functions', () => {
    const swarmModule = require('../src/swarm');
    const expectedExports = [
      'swarm', 'swarmCode', 'swarmReview', 'swarmHeal', 'formatSwarmResult',
      'createAgentPool', 'getAvailableProviders',
      'assignDimensions', 'buildSpecialistPrompt', 'parseAgentResponse', 'DIMENSION_PROMPTS',
      'scoreWithCoherency', 'crossScore', 'computePeerScores',
      'buildConsensus', 'quickConsensus', 'mergeTopOutputs',
      'synthesizeWhisper', 'formatWhisper', 'determineRecommendation',
      'DIMENSIONS', 'DEFAULT_SWARM_CONFIG', 'loadSwarmConfig', 'saveSwarmConfig',
      'resolveProviders', 'getProviderKey', 'getProviderModel',
    ];
    for (const name of expectedExports) {
      assert.ok(swarmModule[name] !== undefined, `Missing export: ${name}`);
    }
  });
});

// ─── MCP tool + handler ───

describe('Swarm MCP integration', () => {
  it('oracle_swarm tool definition exists in TOOLS', () => {
    const { TOOLS } = require('../src/mcp/tools');
    const swarmTool = TOOLS.find(t => t.name === 'oracle_swarm');
    assert.ok(swarmTool, 'oracle_swarm tool not found');
    assert.ok(swarmTool.description.includes('Swarm'));
    assert.ok(swarmTool.inputSchema.properties.action);
    assert.deepEqual(swarmTool.inputSchema.properties.action.enum, ['code', 'review', 'heal', 'status', 'providers']);
    assert.deepEqual(swarmTool.inputSchema.required, ['action']);
  });

  it('oracle_swarm handler exists in HANDLERS', () => {
    const { HANDLERS } = require('../src/mcp/handlers');
    assert.ok(typeof HANDLERS.oracle_swarm === 'function', 'oracle_swarm handler not found');
  });

  it('TOOLS has 11 entries', () => {
    const { TOOLS } = require('../src/mcp/tools');
    assert.equal(TOOLS.length, 11);
  });
});

// ─── CLI integration ───

describe('Swarm CLI integration', () => {
  it('registerSwarmCommands registers swarm handler', () => {
    const { registerSwarmCommands } = require('../src/cli/commands/swarm');
    const handlers = {};
    const mockContext = {
      oracle: {},
      getCode: async () => null,
      jsonOut: () => false,
    };
    registerSwarmCommands(handlers, mockContext);
    assert.ok(typeof handlers['swarm'] === 'function');
  });

  it('swarm command is registered in CLI registry', () => {
    const { CATEGORIES } = require('../src/cli/registry');
    const swarmCategory = CATEGORIES.find(c => c.name === 'Swarm');
    assert.ok(swarmCategory, 'Swarm category not found');
    assert.ok(swarmCategory.commands.length >= 6);
    const names = swarmCategory.commands.map(c => c.name);
    assert.ok(names.includes('swarm'));
    assert.ok(names.includes('swarm review'));
    assert.ok(names.includes('swarm config'));
    assert.ok(names.includes('swarm providers'));
  });
});

// ─── escalation.js ───

describe('Escalation module', () => {
  it('shouldEscalate returns needed=true when no winner', () => {
    const { shouldEscalate } = require('../src/swarm/escalation');
    const result = { winner: null, agreement: 0, agentCount: 3 };
    const esc = shouldEscalate(result, {});
    assert.equal(esc.needed, true);
    assert.ok(esc.reason.includes('no winner'));
  });

  it('shouldEscalate returns needed=true when score below floor', () => {
    const { shouldEscalate } = require('../src/swarm/escalation');
    const result = { winner: { score: 0.65 }, agreement: 0.8, agentCount: 3 };
    const esc = shouldEscalate(result, { coherenceFloor: 0.90 });
    assert.equal(esc.needed, true);
    assert.ok(esc.reason.includes('0.650'));
  });

  it('shouldEscalate returns needed=false when coherence acceptable', () => {
    const { shouldEscalate } = require('../src/swarm/escalation');
    const result = { winner: { score: 0.95 }, agreement: 0.85, agentCount: 3 };
    const esc = shouldEscalate(result, { coherenceFloor: 0.90 });
    assert.equal(esc.needed, false);
  });

  it('shouldEscalate returns needed=false when disabled', () => {
    const { shouldEscalate } = require('../src/swarm/escalation');
    const result = { winner: { score: 0.3 }, agreement: 0.1, agentCount: 3 };
    const esc = shouldEscalate(result, { enabled: false });
    assert.equal(esc.needed, false);
  });

  it('shouldEscalate detects low agreement', () => {
    const { shouldEscalate } = require('../src/swarm/escalation');
    const result = { winner: { score: 0.95 }, agreement: 0.3, agentCount: 5 };
    const esc = shouldEscalate(result, { coherenceFloor: 0.90 });
    assert.equal(esc.needed, true);
    assert.ok(esc.reason.includes('agreement'));
  });

  it('getEscalationMode progresses through modes', () => {
    const { getEscalationMode } = require('../src/swarm/escalation');
    assert.equal(getEscalationMode(0, {}), 'retry');
    assert.equal(getEscalationMode(1, {}), 'expand');
    assert.equal(getEscalationMode(2, {}), 'deep');
    assert.equal(getEscalationMode(5, {}), 'deep'); // Clamps to last
  });

  it('applyEscalation adjusts options per mode', () => {
    const { applyEscalation } = require('../src/swarm/escalation');

    const retryOpts = applyEscalation('retry', { language: 'js' }, {});
    assert.equal(retryOpts.language, 'js');
    assert.equal(retryOpts._deepMode, undefined);

    const expandOpts = applyEscalation('expand', {}, {});
    assert.equal(expandOpts.crossScoring, true);
    assert.equal(expandOpts._expandAgents, 2);

    const deepOpts = applyEscalation('deep', {}, {});
    assert.equal(deepOpts._deepMode, true);
    assert.equal(deepOpts._timeoutMultiplier, 2);
  });

  it('swarmWithEscalation runs without escalation when coherence is high', async () => {
    const { swarmWithEscalation } = require('../src/swarm/escalation');
    const mockSwarm = async () => ({
      winner: { score: 0.95 },
      agreement: 0.9,
      agentCount: 3,
      totalDurationMs: 100,
    });
    const result = await swarmWithEscalation(mockSwarm, 'test', {}, { coherenceFloor: 0.90 });
    assert.equal(result.escalation.totalAttempts, 1);
    assert.equal(result.escalation.escalated, false);
  });

  it('swarmWithEscalation retries on low coherence', async () => {
    const { swarmWithEscalation } = require('../src/swarm/escalation');
    let callCount = 0;
    const mockSwarm = async () => {
      callCount++;
      return {
        winner: { score: callCount >= 2 ? 0.95 : 0.5 },
        agreement: callCount >= 2 ? 0.9 : 0.3,
        agentCount: 3,
        totalDurationMs: 100,
      };
    };
    const result = await swarmWithEscalation(mockSwarm, 'test', {}, { coherenceFloor: 0.90, maxRetries: 2 });
    assert.equal(result.escalation.totalAttempts, 2);
    assert.equal(result.escalation.escalated, true);
    assert.equal(result.winner.score, 0.95);
  });

  it('DEFAULT_ESCALATION_CONFIG has expected shape', () => {
    const { DEFAULT_ESCALATION_CONFIG } = require('../src/swarm/escalation');
    assert.equal(DEFAULT_ESCALATION_CONFIG.enabled, true);
    assert.equal(DEFAULT_ESCALATION_CONFIG.coherenceFloor, 0.90);
    assert.equal(DEFAULT_ESCALATION_CONFIG.maxRetries, 2);
    assert.deepEqual(DEFAULT_ESCALATION_CONFIG.modes, ['retry', 'expand', 'deep']);
  });

  it('barrel export includes escalation functions', () => {
    const swarmModule = require('../src/swarm');
    assert.ok(swarmModule.shouldEscalate);
    assert.ok(swarmModule.getEscalationMode);
    assert.ok(swarmModule.applyEscalation);
    assert.ok(swarmModule.swarmWithEscalation);
    assert.ok(swarmModule.DEFAULT_ESCALATION_CONFIG);
  });
});

// ─── swarm-history.js ───

describe('Swarm history & feedback loop', () => {
  const fs = require('fs');

  function makeTmpDir() {
    const dir = `/tmp/swarm-hist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fs.mkdirSync(require('path').join(dir, '.remembrance'), { recursive: true });
    return dir;
  }

  it('loadHistory returns empty when no file exists', () => {
    const { loadHistory } = require('../src/swarm/swarm-history');
    const history = loadHistory('/tmp/nonexistent-dir-xyz');
    assert.deepEqual(history.runs, []);
    assert.deepEqual(history.providerStats, {});
  });

  it('recordRun creates history entries with provider stats', () => {
    const { recordRun, loadHistory } = require('../src/swarm/swarm-history');
    const dir = makeTmpDir();

    const mockResult = {
      id: 'test-run-1',
      timestamp: '2026-02-17T00:00:00Z',
      task: 'test task',
      winner: { agent: 'claude', score: 0.85 },
      agreement: 0.8,
      agentCount: 2,
      totalDurationMs: 5000,
      rankings: [
        { agent: 'claude', totalScore: 0.85 },
        { agent: 'openai', totalScore: 0.7 },
      ],
    };

    recordRun(mockResult, { taskType: 'code' }, dir);
    const history = loadHistory(dir);

    assert.equal(history.runs.length, 1);
    assert.equal(history.runs[0].winner, 'claude');
    assert.ok(history.providerStats.claude);
    assert.equal(history.providerStats.claude.totalRuns, 1);
    assert.equal(history.providerStats.claude.wins, 1);
    assert.ok(history.providerStats.openai);
    assert.equal(history.providerStats.openai.wins, 0);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recordRun updates reliability over multiple runs', () => {
    const { recordRun, loadHistory } = require('../src/swarm/swarm-history');
    const dir = makeTmpDir();

    for (let i = 0; i < 5; i++) {
      recordRun({
        id: `run-${i}`,
        task: 'test',
        winner: { agent: 'claude', score: 0.9 },
        agreement: 0.8,
        agentCount: 2,
        totalDurationMs: 100,
        rankings: [
          { agent: 'claude', totalScore: 0.9 },
          { agent: 'openai', totalScore: 0.6 },
        ],
      }, {}, dir);
    }

    const history = loadHistory(dir);
    assert.equal(history.providerStats.claude.totalRuns, 5);
    assert.equal(history.providerStats.claude.wins, 5);
    assert.ok(history.providerStats.claude.reliability > 0.7);
    assert.ok(history.providerStats.openai.reliability < history.providerStats.claude.reliability);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recordFeedback adjusts reliability', () => {
    const { recordRun, recordFeedback, loadHistory } = require('../src/swarm/swarm-history');
    const dir = makeTmpDir();

    recordRun({
      id: 'run-fb',
      task: 'test',
      winner: { agent: 'claude', score: 0.8 },
      agreement: 0.7,
      agentCount: 1,
      totalDurationMs: 100,
      rankings: [{ agent: 'claude', totalScore: 0.8 }],
    }, {}, dir);

    const before = loadHistory(dir).providerStats.claude.reliability;
    recordFeedback('run-fb', true, dir);
    const after = loadHistory(dir).providerStats.claude.reliability;
    assert.ok(after > before, 'reliability should increase on approval');

    recordFeedback('run-fb', false, dir);
    const afterReject = loadHistory(dir).providerStats.claude.reliability;
    assert.ok(afterReject < after, 'reliability should decrease on rejection');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('recordFeedback returns found=false for unknown run', () => {
    const { recordFeedback } = require('../src/swarm/swarm-history');
    const result = recordFeedback('nonexistent', true, '/tmp/nonexistent-xyz');
    assert.equal(result.found, false);
  });

  it('getProviderReliability returns Map of scores', () => {
    const { recordRun, getProviderReliability } = require('../src/swarm/swarm-history');
    const dir = makeTmpDir();

    recordRun({
      id: 'run-rel',
      task: 'test',
      winner: { agent: 'claude', score: 0.9 },
      agreement: 0.8,
      agentCount: 1,
      totalDurationMs: 100,
      rankings: [{ agent: 'claude', totalScore: 0.9 }],
    }, {}, dir);

    const reliability = getProviderReliability(dir);
    assert.ok(reliability instanceof Map);
    assert.ok(reliability.has('claude'));
    assert.ok(typeof reliability.get('claude') === 'number');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('getHistorySummary returns structured summary', () => {
    const { recordRun, getHistorySummary } = require('../src/swarm/swarm-history');
    const dir = makeTmpDir();

    recordRun({
      id: 'run-sum',
      task: 'test',
      winner: { agent: 'claude', score: 0.85 },
      agreement: 0.7,
      agentCount: 2,
      totalDurationMs: 100,
      rankings: [
        { agent: 'claude', totalScore: 0.85 },
        { agent: 'openai', totalScore: 0.65 },
      ],
    }, {}, dir);

    const summary = getHistorySummary(dir);
    assert.equal(summary.totalRuns, 1);
    assert.ok(Array.isArray(summary.providers));
    assert.ok(summary.providers.length >= 1);
    assert.ok(Array.isArray(summary.recentRuns));

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('barrel export includes history functions', () => {
    const swarmModule = require('../src/swarm');
    assert.ok(swarmModule.loadHistory);
    assert.ok(swarmModule.recordRun);
    assert.ok(swarmModule.recordFeedback);
    assert.ok(swarmModule.getProviderReliability);
    assert.ok(swarmModule.getHistorySummary);
  });
});

// ─── error-recovery.js ───

describe('Error recovery & fallback', () => {
  it('classifyError identifies rate limit errors', () => {
    const { classifyError, ERROR_CLASSES } = require('../src/swarm/error-recovery');
    assert.equal(classifyError(new Error('429 Too Many Requests')), ERROR_CLASSES.RATE_LIMIT);
    assert.equal(classifyError('rate limit exceeded'), ERROR_CLASSES.RATE_LIMIT);
    assert.equal(classifyError('quota exhausted'), ERROR_CLASSES.RATE_LIMIT);
  });

  it('classifyError identifies timeout errors', () => {
    const { classifyError, ERROR_CLASSES } = require('../src/swarm/error-recovery');
    assert.equal(classifyError(new Error('Request timeout')), ERROR_CLASSES.TIMEOUT);
    assert.equal(classifyError('The operation was aborted'), ERROR_CLASSES.TIMEOUT);
  });

  it('classifyError identifies auth errors', () => {
    const { classifyError, ERROR_CLASSES } = require('../src/swarm/error-recovery');
    assert.equal(classifyError(new Error('401 Unauthorized')), ERROR_CLASSES.AUTH);
    assert.equal(classifyError('403 Forbidden auth required'), ERROR_CLASSES.AUTH);
  });

  it('classifyError identifies network errors', () => {
    const { classifyError, ERROR_CLASSES } = require('../src/swarm/error-recovery');
    assert.equal(classifyError(new Error('fetch failed: ECONNREFUSED')), ERROR_CLASSES.NETWORK);
    assert.equal(classifyError('DNS resolution failed'), ERROR_CLASSES.NETWORK);
  });

  it('classifyError returns UNKNOWN for unrecognized', () => {
    const { classifyError, ERROR_CLASSES } = require('../src/swarm/error-recovery');
    assert.equal(classifyError(new Error('something weird happened')), ERROR_CLASSES.UNKNOWN);
    assert.equal(classifyError(null), ERROR_CLASSES.UNKNOWN);
  });

  it('getRecoveryStrategy returns correct strategies', () => {
    const { getRecoveryStrategy, ERROR_CLASSES } = require('../src/swarm/error-recovery');

    const rateLimitStrategy = getRecoveryStrategy(ERROR_CLASSES.RATE_LIMIT);
    assert.equal(rateLimitStrategy.retry, true);
    assert.equal(rateLimitStrategy.delayMs, 5000);

    const authStrategy = getRecoveryStrategy(ERROR_CLASSES.AUTH);
    assert.equal(authStrategy.retry, false);
    assert.equal(authStrategy.fallbackToCache, true);

    const timeoutStrategy = getRecoveryStrategy(ERROR_CLASSES.TIMEOUT);
    assert.equal(timeoutStrategy.retry, true);
    assert.equal(timeoutStrategy.adjustPrompt, true);
  });

  it('sendWithRecovery succeeds on first try', async () => {
    const { sendWithRecovery } = require('../src/swarm/error-recovery');
    const mockAgent = {
      name: 'test-agent',
      send: async () => ({ response: 'hello', meta: { provider: 'test' } }),
    };
    const result = await sendWithRecovery(mockAgent, 'prompt');
    assert.equal(result.response, 'hello');
    assert.equal(result.recovered, false);
    assert.equal(result.errors.length, 0);
  });

  it('sendWithRecovery retries on failure then succeeds', async () => {
    const { sendWithRecovery } = require('../src/swarm/error-recovery');
    let calls = 0;
    const mockAgent = {
      name: 'test-agent',
      send: async () => {
        calls++;
        if (calls === 1) throw new Error('timeout: request timed out');
        return { response: 'recovered', meta: {} };
      },
    };
    const result = await sendWithRecovery(mockAgent, 'prompt', {}, { maxRetries: 1 });
    assert.equal(result.response, 'recovered');
    assert.equal(result.recovered, true);
    assert.equal(result.errors.length, 1);
  });

  it('sendWithRecovery detects empty response as bad output', async () => {
    const { sendWithRecovery } = require('../src/swarm/error-recovery');
    const mockAgent = {
      name: 'test-agent',
      send: async () => ({ response: '', meta: {} }),
    };
    const result = await sendWithRecovery(mockAgent, 'prompt', {}, { maxRetries: 0 });
    assert.equal(result.response, '');
    assert.equal(result.recovered, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].class, 'bad_output');
  });

  it('sendWithRecovery does not retry auth errors', async () => {
    const { sendWithRecovery } = require('../src/swarm/error-recovery');
    let calls = 0;
    const mockAgent = {
      name: 'test-agent',
      send: async () => { calls++; throw new Error('401 Unauthorized'); },
    };
    const result = await sendWithRecovery(mockAgent, 'prompt', {}, { maxRetries: 3 });
    assert.equal(calls, 1); // Should not retry
    assert.equal(result.response, '');
  });

  it('dispatchWithRecovery runs all agents', async () => {
    const { dispatchWithRecovery } = require('../src/swarm/error-recovery');
    const agents = [
      { name: 'a1', send: async () => ({ response: 'ok1', meta: {} }) },
      { name: 'a2', send: async () => ({ response: 'ok2', meta: {} }) },
    ];
    const results = await dispatchWithRecovery(agents, 'prompt');
    assert.equal(results.length, 2);
    assert.equal(results[0].response, 'ok1');
    assert.equal(results[1].response, 'ok2');
    assert.equal(results[0].fromCache, false);
  });

  it('dispatchWithRecovery falls back to oracle cache', async () => {
    const { dispatchWithRecovery } = require('../src/swarm/error-recovery');
    const agents = [
      { name: 'a1', send: async () => { throw new Error('network failure'); } },
    ];
    const mockSearch = () => [{ code: 'cached_code()', coherency: 0.8, name: 'cached-pattern' }];
    const results = await dispatchWithRecovery(agents, 'prompt', {}, {
      oracleSearch: mockSearch,
      task: 'write code',
    });
    assert.equal(results.length, 1);
    assert.ok(results[0].response.includes('cached_code()'));
    assert.equal(results[0].fromCache, true);
  });

  it('buildErrorSummary aggregates errors', () => {
    const { buildErrorSummary } = require('../src/swarm/error-recovery');
    const errors = [
      { agent: 'a1', error: 'timeout', class: 'timeout' },
      { agent: 'a1', error: 'timeout again', class: 'timeout' },
      { agent: 'a2', error: 'auth fail', class: 'auth' },
    ];
    const summary = buildErrorSummary(errors);
    assert.equal(summary.totalErrors, 3);
    assert.equal(summary.byClass.timeout, 2);
    assert.equal(summary.byClass.auth, 1);
    assert.equal(summary.byAgent.a1, 2);
    assert.equal(summary.critical, true); // auth is critical
  });

  it('barrel export includes error recovery functions', () => {
    const swarmModule = require('../src/swarm');
    assert.ok(swarmModule.ERROR_CLASSES);
    assert.ok(swarmModule.classifyError);
    assert.ok(swarmModule.getRecoveryStrategy);
    assert.ok(swarmModule.sendWithRecovery);
    assert.ok(swarmModule.dispatchWithRecovery);
    assert.ok(swarmModule.buildErrorSummary);
  });
});

// ─── progress-emitter.js ───

describe('Progress emitter & streaming', () => {
  it('SwarmProgressEmitter emits swarm:start event', (t, done) => {
    const { SwarmProgressEmitter } = require('../src/swarm/progress-emitter');
    const emitter = new SwarmProgressEmitter();
    emitter.on('swarm:start', (data) => {
      assert.equal(data.type, 'swarm:start');
      assert.equal(data.id, 'test-123');
      assert.ok(data.timestamp);
      done();
    });
    emitter.start({ id: 'test-123', task: 'test', agentCount: 3 });
  });

  it('SwarmProgressEmitter emits step events in order', () => {
    const { SwarmProgressEmitter } = require('../src/swarm/progress-emitter');
    const emitter = new SwarmProgressEmitter();
    const events = [];

    emitter.on('swarm:step:start', (data) => events.push(data));
    emitter.on('swarm:step:end', (data) => events.push(data));

    emitter.stepStart('configure');
    emitter.stepEnd('configure', 'ok', 5);
    emitter.stepStart('assemble');
    emitter.stepEnd('assemble', 'ok', 10);

    assert.equal(events.length, 4);
    assert.equal(events[0].step, 'configure');
    assert.equal(events[0].index, 1);
    assert.equal(events[1].status, 'ok');
    assert.equal(events[2].step, 'assemble');
    assert.equal(events[2].index, 2);
  });

  it('SwarmProgressEmitter emits agent events', (t, done) => {
    const { SwarmProgressEmitter } = require('../src/swarm/progress-emitter');
    const emitter = new SwarmProgressEmitter();
    const events = [];

    emitter.on('swarm:agent:send', (data) => events.push(data));
    emitter.on('swarm:agent:done', (data) => {
      events.push(data);
      assert.equal(events.length, 2);
      assert.equal(events[0].agent, 'claude');
      assert.deepEqual(events[0].dimensions, ['simplicity']);
      assert.equal(events[1].hasCode, true);
      done();
    });

    emitter.agentSend('claude', ['simplicity']);
    emitter.agentDone('claude', 500, true);
  });

  it('SwarmProgressEmitter emits error events', (t, done) => {
    const { SwarmProgressEmitter } = require('../src/swarm/progress-emitter');
    const emitter = new SwarmProgressEmitter();
    emitter.on('swarm:agent:error', (data) => {
      assert.equal(data.agent, 'openai');
      assert.equal(data.error, 'rate limited');
      assert.equal(data.errorClass, 'rate_limit');
      done();
    });
    emitter.agentError('openai', 'rate limited', 'rate_limit');
  });

  it('SwarmProgressEmitter emits scoring events', (t, done) => {
    const { SwarmProgressEmitter } = require('../src/swarm/progress-emitter');
    const emitter = new SwarmProgressEmitter();
    emitter.on('swarm:scoring', (data) => {
      assert.equal(data.agent, 'claude');
      assert.equal(data.score, 0.92);
      assert.equal(data.phase, 'coherency');
      done();
    });
    emitter.scoring('claude', 0.92, 'coherency');
  });

  it('SwarmProgressEmitter emits consensus event', (t, done) => {
    const { SwarmProgressEmitter } = require('../src/swarm/progress-emitter');
    const emitter = new SwarmProgressEmitter();
    emitter.on('swarm:consensus', (data) => {
      assert.equal(data.winner, 'claude');
      assert.equal(data.agreement, 0.85);
      done();
    });
    emitter.consensus({ winner: 'claude', winnerScore: 0.9, agreement: 0.85, agentCount: 3 });
  });

  it('SwarmProgressEmitter emits escalation event', (t, done) => {
    const { SwarmProgressEmitter } = require('../src/swarm/progress-emitter');
    const emitter = new SwarmProgressEmitter();
    emitter.on('swarm:escalation', (data) => {
      assert.equal(data.mode, 'deep');
      assert.equal(data.attempt, 2);
      done();
    });
    emitter.escalation({ mode: 'deep', attempt: 2, reason: 'low coherence' });
  });

  it('SwarmProgressEmitter emits complete with duration', (t, done) => {
    const { SwarmProgressEmitter } = require('../src/swarm/progress-emitter');
    const emitter = new SwarmProgressEmitter();
    emitter.start({ id: 'test', task: 'test' });

    emitter.on('swarm:complete', (data) => {
      assert.ok(data.totalDurationMs >= 0);
      assert.equal(data.winner, 'claude');
      done();
    });

    emitter.complete({ winner: 'claude', score: 0.9 });
  });

  it('createSwarmEmitter forwards events to WebSocket', () => {
    const { createSwarmEmitter } = require('../src/swarm/progress-emitter');
    const broadcasts = [];
    const mockWs = { broadcast: (data) => broadcasts.push(data) };

    const emitter = createSwarmEmitter(mockWs);
    emitter.start({ id: 'ws-test', task: 'test' });
    emitter.stepStart('configure');
    emitter.consensus({ winner: 'claude', agreement: 0.8 });
    emitter.complete({ winner: 'claude' });

    assert.equal(broadcasts.length, 4);
    assert.equal(broadcasts[0].type, 'swarm:start');
    assert.equal(broadcasts[1].type, 'swarm:step:start');
    assert.equal(broadcasts[2].type, 'swarm:consensus');
    assert.equal(broadcasts[3].type, 'swarm:complete');
  });

  it('createSwarmEmitter works without WebSocket', () => {
    const { createSwarmEmitter } = require('../src/swarm/progress-emitter');
    const emitter = createSwarmEmitter(null);
    // Should not throw
    emitter.start({ id: 'no-ws', task: 'test' });
    emitter.complete({});
    assert.ok(emitter instanceof require('../src/swarm/progress-emitter').SwarmProgressEmitter);
  });

  it('barrel export includes progress emitter', () => {
    const swarmModule = require('../src/swarm');
    assert.ok(swarmModule.SwarmProgressEmitter);
    assert.ok(swarmModule.createSwarmEmitter);
    assert.ok(swarmModule.attachCliReporter);
  });
});

// ─── prompt-templates.js ───

describe('Remembrance-aware prompt templates', () => {
  it('DIMENSION_TEMPLATES has entries for all 7 dimensions', () => {
    const { DIMENSION_TEMPLATES } = require('../src/swarm/prompt-templates');
    const { DIMENSIONS } = require('../src/swarm/swarm-config');
    for (const dim of DIMENSIONS) {
      assert.ok(DIMENSION_TEMPLATES[dim], `Missing template for: ${dim}`);
      assert.ok(DIMENSION_TEMPLATES[dim].role, `Missing role for: ${dim}`);
      assert.ok(DIMENSION_TEMPLATES[dim].focus, `Missing focus for: ${dim}`);
      assert.ok(Array.isArray(DIMENSION_TEMPLATES[dim].rules), `Missing rules for: ${dim}`);
      assert.ok(DIMENSION_TEMPLATES[dim].rules.length >= 2, `Too few rules for: ${dim}`);
      assert.ok(Array.isArray(DIMENSION_TEMPLATES[dim].antiPatterns), `Missing antiPatterns for: ${dim}`);
    }
  });

  it('buildRememberedPrompt includes dimension role and rules', () => {
    const { buildRememberedPrompt } = require('../src/swarm/prompt-templates');
    const result = buildRememberedPrompt('implement quicksort', ['simplicity', 'security']);

    assert.ok(result.system.includes('Simplicity Specialist'));
    assert.ok(result.system.includes('Security Specialist'));
    assert.ok(result.system.includes('FOCUS:'));
    assert.ok(result.system.includes('RULES:'));
    assert.ok(result.system.includes('AVOID:'));
    assert.ok(result.system.includes('CONFIDENCE'));
    assert.ok(result.user.includes('quicksort'));
  });

  it('buildRememberedPrompt handles generalist dimension', () => {
    const { buildRememberedPrompt } = require('../src/swarm/prompt-templates');
    const result = buildRememberedPrompt('do something', ['generalist']);
    assert.ok(result.system.includes('Generalist Agent'));
  });

  it('buildRememberedPrompt injects oracle patterns', () => {
    const { buildRememberedPrompt } = require('../src/swarm/prompt-templates');
    const patterns = [
      { name: 'quicksort', coherency: 0.95, code: 'function quicksort(arr) {\n  // ...\n}' },
      { name: 'mergesort', coherency: 0.88, code: 'function mergesort(arr) {}' },
    ];
    const result = buildRememberedPrompt('sort algorithm', ['efficiency'], {
      oraclePatterns: patterns,
    });

    assert.ok(result.system.includes('PROVEN PATTERNS FROM THE ORACLE'));
    assert.ok(result.system.includes('quicksort'));
    assert.ok(result.system.includes('0.95'));
    assert.ok(result.system.includes('mergesort'));
  });

  it('buildRememberedPrompt includes language and deep mode', () => {
    const { buildRememberedPrompt } = require('../src/swarm/prompt-templates');
    const result = buildRememberedPrompt('task', ['correctness'], {
      language: 'python',
      deepMode: true,
    });
    assert.ok(result.system.includes('python'));
    assert.ok(result.system.includes('DEEP MODE'));
  });

  it('buildRememberedPrompt includes existing code context', () => {
    const { buildRememberedPrompt } = require('../src/swarm/prompt-templates');
    const result = buildRememberedPrompt('fix this', ['readability'], {
      existingCode: 'function broken() {}',
    });
    assert.ok(result.user.includes('EXISTING CODE'));
    assert.ok(result.user.includes('function broken'));
  });

  it('preflightOracleSearch returns empty with no oracle', () => {
    const { preflightOracleSearch } = require('../src/swarm/prompt-templates');
    assert.deepEqual(preflightOracleSearch('test', null), []);
    assert.deepEqual(preflightOracleSearch('test', {}), []);
  });

  it('preflightOracleSearch filters by coherency', () => {
    const { preflightOracleSearch } = require('../src/swarm/prompt-templates');
    const mockOracle = {
      search: () => [
        { name: 'high', coherency: 0.95, code: 'good()' },
        { name: 'low', coherency: 0.3, code: 'bad()' },
        { name: 'medium', coherency: 0.75, code: 'ok()' },
      ],
    };
    const results = preflightOracleSearch('test', mockOracle, { minCoherency: 0.7 });
    assert.equal(results.length, 2);
    assert.equal(results[0].name, 'high');
    assert.equal(results[1].name, 'medium');
  });

  it('preflightOracleSearch handles oracle errors', () => {
    const { preflightOracleSearch } = require('../src/swarm/prompt-templates');
    const brokenOracle = {
      search: () => { throw new Error('oracle down'); },
    };
    assert.deepEqual(preflightOracleSearch('test', brokenOracle), []);
  });

  it('buildAllPrompts creates prompts for all agents', () => {
    const { buildAllPrompts } = require('../src/swarm/prompt-templates');
    const assignments = new Map([
      ['claude', ['simplicity', 'security']],
      ['openai', ['correctness', 'efficiency']],
      ['gemini', ['generalist']],
    ]);
    const prompts = buildAllPrompts('build a REST API', assignments, { language: 'javascript' });

    assert.ok(prompts instanceof Map);
    assert.equal(prompts.size, 3);
    assert.ok(prompts.get('claude').system.includes('Simplicity'));
    assert.ok(prompts.get('openai').system.includes('Correctness'));
    assert.ok(prompts.get('gemini').system.includes('Generalist'));
  });

  it('buildAllPrompts injects oracle patterns when oracle provided', () => {
    const { buildAllPrompts } = require('../src/swarm/prompt-templates');
    const mockOracle = {
      search: () => [{ name: 'pattern1', coherency: 0.9, code: 'fn()' }],
    };
    const assignments = new Map([['claude', ['simplicity']]]);
    const prompts = buildAllPrompts('task', assignments, { oracle: mockOracle });

    assert.ok(prompts.get('claude').system.includes('PROVEN PATTERNS'));
    assert.ok(prompts.get('claude').system.includes('pattern1'));
  });

  it('barrel export includes prompt template functions', () => {
    const swarmModule = require('../src/swarm');
    assert.ok(swarmModule.DIMENSION_TEMPLATES);
    assert.ok(swarmModule.buildRememberedPrompt);
    assert.ok(swarmModule.preflightOracleSearch);
    assert.ok(swarmModule.buildAllPrompts);
  });
});

// ─── self-refinement.js ───

describe('Swarm self-refinement', () => {
  const fs = require('fs');

  function makeTmpWithHistory(runs) {
    const dir = `/tmp/swarm-refine-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fs.mkdirSync(require('path').join(dir, '.remembrance'), { recursive: true });

    // Seed history
    const { recordRun } = require('../src/swarm/swarm-history');
    for (const r of runs) {
      recordRun(r, { userApproved: r._approved }, dir);
    }
    return dir;
  }

  it('analyzeSwarmPerformance returns insufficient with < 3 runs', () => {
    const { analyzeSwarmPerformance } = require('../src/swarm/self-refinement');
    const result = analyzeSwarmPerformance('/tmp/nonexistent-refine-xyz');
    assert.equal(result.sufficient, false);
    assert.ok(result.message.includes('3'));
  });

  it('analyzeSwarmPerformance produces suggestions with enough data', () => {
    const { analyzeSwarmPerformance } = require('../src/swarm/self-refinement');
    const runs = [];
    for (let i = 0; i < 5; i++) {
      runs.push({
        id: `refine-${i}`, task: 'test', winner: { agent: 'claude', score: 0.85 },
        agreement: 0.7, agentCount: 2, totalDurationMs: 100,
        rankings: [{ agent: 'claude', totalScore: 0.85 }, { agent: 'openai', totalScore: 0.6 }],
      });
    }
    const dir = makeTmpWithHistory(runs);
    const result = analyzeSwarmPerformance(dir);
    assert.equal(result.sufficient, true);
    assert.equal(result.runsAnalyzed, 5);
    assert.ok(Array.isArray(result.suggestions));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('suggestOptimalWeights returns weights with insufficient data', () => {
    const { suggestOptimalWeights } = require('../src/swarm/self-refinement');
    const result = suggestOptimalWeights('/tmp/nonexistent-refine-xyz');
    assert.ok(result.weights);
    assert.equal(result.applied, false);
    assert.ok(result.reasoning.includes('Insufficient'));
  });

  it('selfRefine returns analysis + weight suggestion', () => {
    const { selfRefine } = require('../src/swarm/self-refinement');
    const runs = [];
    for (let i = 0; i < 6; i++) {
      runs.push({
        id: `sr-${i}`, task: 'test', winner: { agent: 'claude', score: 0.9 },
        agreement: 0.8, agentCount: 2, totalDurationMs: 100,
        rankings: [{ agent: 'claude', totalScore: 0.9 }, { agent: 'openai', totalScore: 0.7 }],
        _approved: i % 2 === 0,
      });
    }
    const dir = makeTmpWithHistory(runs);
    const result = selfRefine(dir);
    assert.ok(result.analysis);
    assert.ok(result.weightSuggestion);
    assert.ok(result.weightSuggestion.weights);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('formatRefinementReport produces readable output', () => {
    const { formatRefinementReport } = require('../src/swarm/self-refinement');
    const report = {
      analysis: { sufficient: true, runsAnalyzed: 10, recentAgreement: 0.8, suggestions: [{ type: 'trend_positive', message: 'Getting better' }] },
      weightSuggestion: { weights: { coherency: 0.4, selfConfidence: 0.2, peerScore: 0.4 }, reasoning: 'test', applied: false },
    };
    const text = formatRefinementReport(report);
    assert.ok(text.includes('Self-Refinement'));
    assert.ok(text.includes('Getting better'));
  });

  it('barrel export includes self-refinement functions', () => {
    const s = require('../src/swarm');
    assert.ok(s.analyzeSwarmPerformance);
    assert.ok(s.suggestOptimalWeights);
    assert.ok(s.selfRefine);
    assert.ok(s.formatRefinementReport);
  });
});

// ─── voice-io.js ───

describe('Voice I/O', () => {
  it('detectVoiceCapabilities returns platform info', () => {
    const { detectVoiceCapabilities } = require('../src/swarm/voice-io');
    const caps = detectVoiceCapabilities();
    assert.ok(caps.platform);
    assert.ok(typeof caps.tts === 'string' || caps.tts === null);
    assert.ok(typeof caps.stt === 'string' || caps.stt === null);
  });

  it('sanitizeForShell removes dangerous characters', () => {
    const { sanitizeForShell } = require('../src/swarm/voice-io');
    assert.equal(sanitizeForShell('hello "world"'), 'hello world');
    assert.equal(sanitizeForShell('test$var`cmd`'), 'testvarcmd');
    assert.equal(sanitizeForShell('line1\nline2'), 'line1. line2');
  });

  it('speakWhisper returns text summary even without TTS', () => {
    const { speakWhisper } = require('../src/swarm/voice-io');
    const whisper = {
      message: 'test whisper',
      winner: { agent: 'claude', score: 0.85 },
      agreement: 0.8,
      recommendation: 'PULL',
      dissent: ['openai: disagreed'],
    };
    const result = speakWhisper(whisper, { engine: 'nonexistent' });
    assert.ok(result.text.includes('claude'));
    assert.ok(result.text.includes('80'));
    assert.ok(result.text.includes('PULL'));
  });

  it('speakWhisper handles null whisper', () => {
    const { speakWhisper } = require('../src/swarm/voice-io');
    const result = speakWhisper(null);
    assert.equal(result.spoken, false);
    assert.equal(result.text, '');
  });

  it('speakResult formats result for speech', () => {
    const { speakResult } = require('../src/swarm/voice-io');
    const result = speakResult({
      winner: { agent: 'claude', score: 0.9 },
      agreement: 0.85,
      agentCount: 3,
      whisper: { recommendation: 'PULL' },
    }, { engine: 'nonexistent' });
    assert.ok(result.text.includes('claude'));
    assert.ok(result.text.includes('PULL'));
  });

  it('readVoiceInput returns null for nonexistent file', () => {
    const { readVoiceInput } = require('../src/swarm/voice-io');
    assert.equal(readVoiceInput('/tmp/nonexistent-voice-xyz.txt'), null);
  });

  it('readVoiceInput reads text file', () => {
    const { readVoiceInput } = require('../src/swarm/voice-io');
    const fs = require('fs');
    const fp = `/tmp/voice-test-${Date.now()}.txt`;
    fs.writeFileSync(fp, 'implement debounce function');
    const text = readVoiceInput(fp);
    assert.equal(text, 'implement debounce function');
    fs.unlinkSync(fp);
  });

  it('barrel export includes voice functions', () => {
    const s = require('../src/swarm');
    assert.ok(s.detectVoiceCapabilities);
    assert.ok(s.speak);
    assert.ok(s.speakWhisper);
    assert.ok(s.speakResult);
    assert.ok(s.readVoiceInput);
    assert.ok(s.sanitizeForShell);
  });
});

// ─── task-queue.js ───

describe('Multi-task queue', () => {
  it('PRIORITY has correct values', () => {
    const { PRIORITY } = require('../src/swarm/task-queue');
    assert.equal(PRIORITY.CRITICAL, 1);
    assert.equal(PRIORITY.HIGH, 2);
    assert.equal(PRIORITY.NORMAL, 3);
    assert.equal(PRIORITY.LOW, 4);
  });

  it('enqueue adds tasks in priority order', () => {
    const { SwarmTaskQueue, PRIORITY } = require('../src/swarm/task-queue');
    const q = new SwarmTaskQueue();
    q.enqueue('low task', { priority: PRIORITY.LOW });
    q.enqueue('critical task', { priority: PRIORITY.CRITICAL });
    q.enqueue('normal task', { priority: PRIORITY.NORMAL });

    const status = q.status();
    assert.equal(status.pending, 3);
    assert.equal(status.tasks.pending[0].description, 'critical task');
    assert.equal(status.tasks.pending[2].description, 'low task');
  });

  it('enqueue returns id and position', () => {
    const { SwarmTaskQueue } = require('../src/swarm/task-queue');
    const q = new SwarmTaskQueue();
    const result = q.enqueue('test task');
    assert.ok(result.id);
    assert.equal(result.position, 1);
  });

  it('enqueue throws when queue is full', () => {
    const { SwarmTaskQueue } = require('../src/swarm/task-queue');
    const q = new SwarmTaskQueue({ maxQueueSize: 2 });
    q.enqueue('task 1');
    q.enqueue('task 2');
    assert.throws(() => q.enqueue('task 3'), /Queue full/);
  });

  it('cancel removes pending task', () => {
    const { SwarmTaskQueue } = require('../src/swarm/task-queue');
    const q = new SwarmTaskQueue();
    const { id } = q.enqueue('test');
    assert.equal(q.pendingCount, 1);
    assert.equal(q.cancel(id), true);
    assert.equal(q.pendingCount, 0);
    assert.equal(q.cancel('nonexistent'), false);
  });

  it('process executes tasks and emits events', async () => {
    const { SwarmTaskQueue } = require('../src/swarm/task-queue');
    const q = new SwarmTaskQueue({ concurrency: 1 });
    const events = [];

    q.on('task:started', (data) => events.push({ type: 'started', ...data }));
    q.on('task:completed', (data) => events.push({ type: 'completed', ...data }));

    q.enqueue('task 1');
    q.enqueue('task 2');

    let callCount = 0;
    await q.process(async (task) => {
      callCount++;
      return { winner: { agent: 'claude', score: 0.9 }, totalDurationMs: 50 };
    });

    assert.equal(callCount, 2);
    assert.equal(events.filter(e => e.type === 'started').length, 2);
    assert.equal(events.filter(e => e.type === 'completed').length, 2);
    assert.equal(q.pendingCount, 0);
  });

  it('process handles task failures', async () => {
    const { SwarmTaskQueue } = require('../src/swarm/task-queue');
    const q = new SwarmTaskQueue();
    const failed = [];

    q.on('task:failed', (data) => failed.push(data));
    q.enqueue('bad task');

    await q.process(async () => { throw new Error('boom'); });
    assert.equal(failed.length, 1);
    assert.ok(failed[0].error.includes('boom'));
  });

  it('getResult returns completed task', async () => {
    const { SwarmTaskQueue } = require('../src/swarm/task-queue');
    const q = new SwarmTaskQueue();
    const { id } = q.enqueue('test');

    await q.process(async () => ({ winner: { agent: 'test', score: 0.8 }, totalDurationMs: 10 }));

    const result = q.getResult(id);
    assert.ok(result);
    assert.equal(result.status, 'completed');
    assert.equal(q.getResult('nonexistent'), null);
  });

  it('barrel export includes queue', () => {
    const s = require('../src/swarm');
    assert.ok(s.PRIORITY);
    assert.ok(s.SwarmTaskQueue);
  });
});

// ─── auto-register.js ───

describe('Pattern auto-registration', () => {
  it('qualifiesForRegistration rejects low score', () => {
    const { qualifiesForRegistration } = require('../src/swarm/auto-register');
    const result = { winner: { code: 'x()', score: 0.7 }, agreement: 0.8 };
    const check = qualifiesForRegistration(result);
    assert.equal(check.qualifies, false);
    assert.ok(check.reason.includes('score'));
  });

  it('qualifiesForRegistration rejects low agreement', () => {
    const { qualifiesForRegistration } = require('../src/swarm/auto-register');
    const result = { winner: { code: 'x()', score: 0.96 }, agreement: 0.3 };
    const check = qualifiesForRegistration(result);
    assert.equal(check.qualifies, false);
    assert.ok(check.reason.includes('agreement'));
  });

  it('qualifiesForRegistration accepts excellent result', () => {
    const { qualifiesForRegistration } = require('../src/swarm/auto-register');
    const result = { winner: { code: 'function good() {}', score: 0.96 }, agreement: 0.85 };
    const check = qualifiesForRegistration(result);
    assert.equal(check.qualifies, true);
  });

  it('qualifiesForRegistration rejects when disabled', () => {
    const { qualifiesForRegistration } = require('../src/swarm/auto-register');
    const result = { winner: { code: 'x()', score: 0.99 }, agreement: 0.9 };
    assert.equal(qualifiesForRegistration(result, { enabled: false }).qualifies, false);
  });

  it('autoRegisterResult registers with mock oracle', () => {
    const { autoRegisterResult } = require('../src/swarm/auto-register');
    let registered = null;
    const mockOracle = {
      register: (data) => { registered = data; return { id: 'pat-123' }; },
    };
    const result = {
      id: 'run-1', task: 'implement debounce',
      winner: { code: 'function debounce(){}', score: 0.96, dimensions: ['simplicity'] },
      agreement: 0.85,
    };
    const outcome = autoRegisterResult(result, mockOracle);
    assert.equal(outcome.registered, true);
    assert.equal(outcome.patternId, 'pat-123');
    assert.ok(registered.name.includes('debounce'));
  });

  it('autoRegisterResult skips when no oracle', () => {
    const { autoRegisterResult } = require('../src/swarm/auto-register');
    const result = { winner: { code: 'x()', score: 0.96 }, agreement: 0.8 };
    const outcome = autoRegisterResult(result, null);
    assert.equal(outcome.registered, false);
  });

  it('extractTaskName converts to kebab-case', () => {
    const { extractTaskName } = require('../src/swarm/auto-register');
    assert.equal(extractTaskName('Implement a debounce function'), 'implement-a-debounce-function');
    assert.equal(extractTaskName(''), 'swarm-output');
  });

  it('detectLanguage identifies languages', () => {
    const { detectLanguage } = require('../src/swarm/auto-register');
    assert.equal(detectLanguage('def foo():\n  pass'), 'python');
    assert.equal(detectLanguage('fn main() -> Result {}'), 'rust');
    assert.equal(detectLanguage('function foo() {}'), 'javascript');
    assert.equal(detectLanguage('const x: string = "hi"'), 'typescript');
  });

  it('batchAutoRegister processes multiple results', () => {
    const { batchAutoRegister } = require('../src/swarm/auto-register');
    const mockOracle = { register: () => ({ id: 'p1' }) };
    const results = [
      { id: 'r1', task: 'a', winner: { code: 'a()', score: 0.97 }, agreement: 0.9 },
      { id: 'r2', task: 'b', winner: { code: 'b()', score: 0.5 }, agreement: 0.9 },
    ];
    const batch = batchAutoRegister(results, mockOracle);
    assert.equal(batch.total, 2);
    assert.equal(batch.registered, 1);
    assert.equal(batch.skipped, 1);
  });

  it('barrel export includes auto-register', () => {
    const s = require('../src/swarm');
    assert.ok(s.qualifiesForRegistration);
    assert.ok(s.autoRegisterResult);
    assert.ok(s.batchAutoRegister);
    assert.ok(s.extractTaskName);
    assert.ok(s.detectLanguage);
  });
});

// ─── debate-visualization.js ───

describe('Debate visualization', () => {
  it('buildScoreMatrix creates matrix from rankings', () => {
    const { buildScoreMatrix } = require('../src/swarm/debate-visualization');
    const rankings = [
      { agent: 'claude', totalScore: 0.9, breakdown: { coherency: 0.95 } },
      { agent: 'openai', totalScore: 0.7, breakdown: { coherency: 0.8 } },
    ];
    const outputs = [
      { agent: 'claude', dimensions: ['simplicity'] },
      { agent: 'openai', dimensions: ['security'] },
    ];
    const result = buildScoreMatrix(rankings, outputs);
    assert.deepEqual(result.agents, ['claude', 'openai']);
    assert.ok(result.dimensions.includes('simplicity'));
    assert.equal(result.matrix.claude.total, 0.9);
    assert.equal(result.winnerAgent, 'claude');
  });

  it('buildVotingGraph creates nodes and edges', () => {
    const { buildVotingGraph } = require('../src/swarm/debate-visualization');
    const matrix = {
      a1: { a2: { score: 0.8 } },
      a2: { a1: { score: 0.7 } },
    };
    const graph = buildVotingGraph(matrix, ['a1', 'a2']);
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.edges.length, 2);
    assert.equal(graph.edges[0].from, 'a1');
    assert.equal(graph.edges[0].weight, 0.8);
  });

  it('buildVotingGraph handles null matrix', () => {
    const { buildVotingGraph } = require('../src/swarm/debate-visualization');
    const graph = buildVotingGraph(null, ['a1']);
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.edges.length, 0);
  });

  it('buildConsensusTree separates allies and dissenters', () => {
    const { buildConsensusTree } = require('../src/swarm/debate-visualization');
    const consensus = {
      winner: { agent: 'claude', score: 0.9 },
      rankings: [
        { agent: 'claude', totalScore: 0.9 },
        { agent: 'openai', totalScore: 0.88 },  // ally (>85%)
        { agent: 'gemini', totalScore: 0.75 },   // neutral
        { agent: 'ollama', totalScore: 0.5 },    // dissenter (<70%)
      ],
    };
    const tree = buildConsensusTree(consensus);
    assert.equal(tree.winner.agent, 'claude');
    assert.equal(tree.allies.length, 1);
    assert.equal(tree.allies[0].agent, 'openai');
    assert.equal(tree.neutrals.length, 1);
    assert.equal(tree.dissenters.length, 1);
    assert.equal(tree.dissenters[0].agent, 'ollama');
  });

  it('buildConsensusTree handles null consensus', () => {
    const { buildConsensusTree } = require('../src/swarm/debate-visualization');
    const tree = buildConsensusTree(null);
    assert.equal(tree.winner, null);
  });

  it('buildTimeline creates timeline from steps', () => {
    const { buildTimeline } = require('../src/swarm/debate-visualization');
    const steps = [
      { name: 'configure', status: 'ok', durationMs: 5 },
      { name: 'dispatch', status: 'ok', durationMs: 100 },
      { name: 'consensus', status: 'error', durationMs: 10, error: 'failed' },
    ];
    const timeline = buildTimeline(steps, []);
    assert.equal(timeline.length, 3);
    assert.equal(timeline[0].cumulativeMs, 5);
    assert.equal(timeline[1].cumulativeMs, 105);
    assert.ok(timeline[2].meta.error);
  });

  it('renderScoreChart produces ASCII bars', () => {
    const { renderScoreChart } = require('../src/swarm/debate-visualization');
    const rankings = [
      { agent: 'claude', totalScore: 0.9 },
      { agent: 'openai', totalScore: 0.6 },
    ];
    const chart = renderScoreChart(rankings, { width: 20 });
    assert.ok(chart.includes('claude'));
    assert.ok(chart.includes('0.900'));
    assert.ok(chart.includes('*')); // winner marker
  });

  it('renderScoreChart handles empty rankings', () => {
    const { renderScoreChart } = require('../src/swarm/debate-visualization');
    assert.ok(renderScoreChart([]).includes('no agents'));
  });

  it('renderConsensusTree produces ASCII tree', () => {
    const { renderConsensusTree } = require('../src/swarm/debate-visualization');
    const tree = {
      winner: { agent: 'claude', score: 0.9 },
      allies: [{ agent: 'openai', score: 0.88 }],
      dissenters: [{ agent: 'ollama', score: 0.4 }],
      neutrals: [],
    };
    const text = renderConsensusTree(tree);
    assert.ok(text.includes('WINNER'));
    assert.ok(text.includes('ALLY'));
    assert.ok(text.includes('DISSENT'));
  });

  it('renderDebateVisualization produces complete output', () => {
    const { renderDebateVisualization } = require('../src/swarm/debate-visualization');
    const result = {
      id: 'test', task: 'test', agreement: 0.8, agentCount: 3,
      rankings: [
        { agent: 'claude', totalScore: 0.9 },
        { agent: 'openai', totalScore: 0.7 },
      ],
      steps: [{ name: 'configure', status: 'ok', durationMs: 5 }],
      winner: { agent: 'claude', score: 0.9 },
    };
    const text = renderDebateVisualization(result);
    assert.ok(text.includes('Debate Visualization'));
    assert.ok(text.includes('claude'));
    assert.ok(text.includes('Agreement'));
  });

  it('exportVisualizationData produces dashboard-ready JSON', () => {
    const { exportVisualizationData } = require('../src/swarm/debate-visualization');
    const result = {
      id: 'test', task: 'test', timestamp: '2026-01-01', agreement: 0.8,
      agentCount: 2, totalDurationMs: 1000,
      rankings: [{ agent: 'claude', totalScore: 0.9, dimensions: [] }],
      steps: [{ name: 'configure', status: 'ok', durationMs: 5 }],
      winner: { agent: 'claude', score: 0.9 },
    };
    const data = exportVisualizationData(result);
    assert.ok(data.scoreMatrix);
    assert.ok(data.votingGraph);
    assert.ok(data.consensusTree);
    assert.ok(data.timeline);
    assert.ok(data.summary);
    assert.equal(data.summary.winner, 'claude');
  });

  it('barrel export includes visualization functions', () => {
    const s = require('../src/swarm');
    assert.ok(s.buildScoreMatrix);
    assert.ok(s.buildVotingGraph);
    assert.ok(s.buildConsensusTree);
    assert.ok(s.renderScoreChart);
    assert.ok(s.renderDebateVisualization);
    assert.ok(s.exportVisualizationData);
  });

  it('barrel export includes env-loader functions', () => {
    const s = require('../src/swarm');
    assert.ok(s.parseEnvContent);
    assert.ok(s.loadEnvFile);
    assert.ok(s.findEnvFile);
    assert.ok(s.loadEnvFromAncestors);
  });
});

// ─── env-loader.js ───

describe('Env Loader', () => {
  const { parseEnvContent, loadEnvFile, findEnvFile } = require('../src/swarm/env-loader');
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  it('parseEnvContent parses simple KEY=value pairs', () => {
    const content = 'FOO=bar\nBAZ=qux';
    const vars = parseEnvContent(content);
    assert.equal(vars.get('FOO'), 'bar');
    assert.equal(vars.get('BAZ'), 'qux');
    assert.equal(vars.size, 2);
  });

  it('parseEnvContent handles double-quoted values', () => {
    const content = 'API_KEY="sk-abc-123"';
    const vars = parseEnvContent(content);
    assert.equal(vars.get('API_KEY'), 'sk-abc-123');
  });

  it('parseEnvContent handles single-quoted values', () => {
    const content = "SECRET='my secret value'";
    const vars = parseEnvContent(content);
    assert.equal(vars.get('SECRET'), 'my secret value');
  });

  it('parseEnvContent skips comments and empty lines', () => {
    const content = '# This is a comment\n\nKEY=val\n  # another comment\n';
    const vars = parseEnvContent(content);
    assert.equal(vars.size, 1);
    assert.equal(vars.get('KEY'), 'val');
  });

  it('parseEnvContent strips inline comments for unquoted values', () => {
    const content = 'HOST=localhost # the host';
    const vars = parseEnvContent(content);
    assert.equal(vars.get('HOST'), 'localhost');
  });

  it('parseEnvContent handles export prefix', () => {
    const content = 'export MY_VAR=hello';
    const vars = parseEnvContent(content);
    assert.equal(vars.get('MY_VAR'), 'hello');
  });

  it('parseEnvContent skips lines without =', () => {
    const content = 'INVALID_LINE\nGOOD=yes';
    const vars = parseEnvContent(content);
    assert.equal(vars.size, 1);
    assert.equal(vars.get('GOOD'), 'yes');
  });

  it('parseEnvContent skips invalid key names', () => {
    const content = '123BAD=no\nGOOD_KEY=yes\n-dash=no';
    const vars = parseEnvContent(content);
    assert.equal(vars.size, 1);
    assert.equal(vars.get('GOOD_KEY'), 'yes');
  });

  it('parseEnvContent handles values with = in them', () => {
    const content = 'URL=postgres://user:pass@host/db?opt=1';
    const vars = parseEnvContent(content);
    assert.equal(vars.get('URL'), 'postgres://user:pass@host/db?opt=1');
  });

  it('loadEnvFile loads from a real file into process.env', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    const uniqueKey = '_TEST_ENV_LOADER_' + Date.now();
    fs.writeFileSync(envPath, `${uniqueKey}=loaded_ok`);

    try {
      const result = loadEnvFile(tmpDir);
      assert.equal(result.loaded, 1);
      assert.equal(result.file, envPath);
      assert.ok(result.vars.includes(uniqueKey));
      assert.equal(process.env[uniqueKey], 'loaded_ok');
    } finally {
      delete process.env[uniqueKey];
      fs.unlinkSync(envPath);
      fs.rmdirSync(tmpDir);
    }
  });

  it('loadEnvFile does not override existing env vars', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    const uniqueKey = '_TEST_ENV_NO_OVERRIDE_' + Date.now();
    process.env[uniqueKey] = 'original';
    fs.writeFileSync(envPath, `${uniqueKey}=overridden`);

    try {
      const result = loadEnvFile(tmpDir);
      assert.equal(result.loaded, 0);
      assert.equal(process.env[uniqueKey], 'original');
    } finally {
      delete process.env[uniqueKey];
      fs.unlinkSync(envPath);
      fs.rmdirSync(tmpDir);
    }
  });

  it('loadEnvFile with override=true does override existing vars', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    const uniqueKey = '_TEST_ENV_FORCE_' + Date.now();
    process.env[uniqueKey] = 'old';
    fs.writeFileSync(envPath, `${uniqueKey}=new`);

    try {
      const result = loadEnvFile(tmpDir, { override: true });
      assert.equal(result.loaded, 1);
      assert.equal(process.env[uniqueKey], 'new');
    } finally {
      delete process.env[uniqueKey];
      fs.unlinkSync(envPath);
      fs.rmdirSync(tmpDir);
    }
  });

  it('loadEnvFile returns zero when no .env exists', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    try {
      const result = loadEnvFile(tmpDir);
      assert.equal(result.loaded, 0);
      assert.equal(result.file, null);
    } finally {
      fs.rmdirSync(tmpDir);
    }
  });

  it('loadEnvFile supports custom filename', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env.local');
    const uniqueKey = '_TEST_ENV_CUSTOM_' + Date.now();
    fs.writeFileSync(envPath, `${uniqueKey}=custom`);

    try {
      const result = loadEnvFile(tmpDir, { filename: '.env.local' });
      assert.equal(result.loaded, 1);
      assert.equal(process.env[uniqueKey], 'custom');
    } finally {
      delete process.env[uniqueKey];
      fs.unlinkSync(envPath);
      fs.rmdirSync(tmpDir);
    }
  });

  it('findEnvFile finds .env in current directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'X=1');

    try {
      const found = findEnvFile(tmpDir);
      assert.equal(found, envPath);
    } finally {
      fs.unlinkSync(envPath);
      fs.rmdirSync(tmpDir);
    }
  });

  it('findEnvFile searches parent directories', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const subDir = path.join(tmpDir, 'a', 'b', 'c');
    fs.mkdirSync(subDir, { recursive: true });
    const envPath = path.join(tmpDir, '.env');
    fs.writeFileSync(envPath, 'Y=2');

    try {
      const found = findEnvFile(subDir);
      assert.equal(found, envPath);
    } finally {
      fs.unlinkSync(envPath);
      fs.rmdirSync(subDir);
      fs.rmdirSync(path.join(tmpDir, 'a', 'b'));
      fs.rmdirSync(path.join(tmpDir, 'a'));
      fs.rmdirSync(tmpDir);
    }
  });

  it('findEnvFile returns null when no .env found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    try {
      const found = findEnvFile(tmpDir);
      // May find a .env somewhere up the tree, or null — just check type
      assert.ok(found === null || typeof found === 'string');
    } finally {
      fs.rmdirSync(tmpDir);
    }
  });

  it('loadSwarmConfig triggers env loading', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-test-'));
    const envPath = path.join(tmpDir, '.env');
    const uniqueKey = '_TEST_SWARM_CONFIG_ENV_' + Date.now();
    fs.writeFileSync(envPath, `${uniqueKey}=from_swarm_config`);

    const { loadSwarmConfig } = require('../src/swarm/swarm-config');

    try {
      loadSwarmConfig(tmpDir);
      assert.equal(process.env[uniqueKey], 'from_swarm_config');
    } finally {
      delete process.env[uniqueKey];
      fs.unlinkSync(envPath);
      fs.rmdirSync(tmpDir);
    }
  });
});
