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
    assert.equal(swarmCategory.commands.length, 6);
    const names = swarmCategory.commands.map(c => c.name);
    assert.ok(names.includes('swarm'));
    assert.ok(names.includes('swarm review'));
    assert.ok(names.includes('swarm config'));
    assert.ok(names.includes('swarm providers'));
  });
});
