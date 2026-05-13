'use strict';

/**
 * LLM-Powered SERF Healing — Deep Reasoning Mode
 *
 * Extends the structural SERF transforms with frontier model reasoning.
 * Instead of regex-based fixes, the LLM:
 *   1. DIAGNOSE — Analyze WHY coherency is low (logic bugs, missing edge cases, etc.)
 *   2. PLAN    — Propose specific changes with reasoning
 *   3. HEAL    — Apply changes while preserving the original intent
 *   4. EXPLAIN — Document what changed and why (whisper)
 *
 * Uses the fractal pattern: receive → validate → transform → emit
 *
 * Falls back to structural SERF if no LLM is available.
 * Activated when: config.healingMode === 'llm' (or 'auto' with LLM available)
 */

const { applySimplify, applySecure, applyReadable, applyUnify, applyCorrect, applyHeal, applyPatternGuidance } = require('./reflection-transforms');

// ─── Configuration ───────────────────────────────────────────────

const LLM_HEAL_DEFAULTS = {
  mode: 'auto',           // 'llm' | 'structural' | 'auto' (llm if available, else structural)
  maxTokens: 4096,
  temperature: 0.2,       // Low temperature for precise fixes
  model: null,            // null = use default from provider
  provider: null,         // null = auto-detect from env (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
  maxAttempts: 3,         // Max LLM healing iterations
  targetCoherence: 0.80,
  explainChanges: true,   // Generate whisper explaining what changed
  preserveInterface: true, // Don't change function signatures or exports
};

// ─── LLM Provider Detection ─────────────────────────────────────

function detectLlmProvider() {
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GOOGLE_API_KEY) return 'google';
  return null;
}

function getProviderConfig(provider) {
  const configs = {
    anthropic: {
      url: 'https://api.anthropic.com/v1/messages',
      model: 'claude-sonnet-4-20250514',
      headers: (key) => ({
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      }),
      buildBody: (system, user, model, maxTokens) => JSON.stringify({
        model, max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      extractResponse: (data) => data.content?.[0]?.text || '',
      keyEnv: 'ANTHROPIC_API_KEY',
    },
    openai: {
      url: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o',
      headers: (key) => ({
        'Authorization': 'Bearer ' + key,
        'content-type': 'application/json',
      }),
      buildBody: (system, user, model, maxTokens) => JSON.stringify({
        model, max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
      extractResponse: (data) => data.choices?.[0]?.message?.content || '',
      keyEnv: 'OPENAI_API_KEY',
    },
    google: {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      model: 'gemini-pro',
      headers: (key) => ({ 'content-type': 'application/json' }),
      buildBody: (system, user, model, maxTokens) => JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
      extractResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      keyEnv: 'GOOGLE_API_KEY',
    },
  };
  return configs[provider] || null;
}

// ─── LLM Call ────────────────────────────────────────────────────

async function callLlm(systemPrompt, userPrompt, options = {}) {
  const provider = options.provider || detectLlmProvider();
  if (!provider) return null;

  const config = getProviderConfig(provider);
  if (!config) return null;

  const key = process.env[config.keyEnv];
  if (!key) return null;

  const model = options.model || config.model;
  const maxTokens = options.maxTokens || LLM_HEAL_DEFAULTS.maxTokens;

  const https = require('https');
  const url = new URL(provider === 'google' ? config.url + '?key=' + key : config.url);
  const body = config.buildBody(systemPrompt, userPrompt, model, maxTokens);
  const headers = config.headers(key);

  return new Promise((resolve) => {
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(config.extractResponse(parsed));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ─── Diagnosis Prompt ────────────────────────────────────────────

function buildDiagnosisPrompt(code, language, coherencyResult) {
  const dims = coherencyResult.dimensions || coherencyResult.breakdown || {};
  const weakDims = Object.entries(dims)
    .filter(([, v]) => v < 0.7)
    .sort((a, b) => a[1] - b[1])
    .map(([k, v]) => `${k}: ${v.toFixed(3)}`);

  return {
    system: `You are a code quality expert. You analyze code and produce PRECISE, MINIMAL fixes.

RULES:
1. Identify the specific issues causing low coherency scores
2. Fix ONLY what's broken — don't rewrite working code
3. Preserve all function signatures and exports
4. Explain each change in one sentence
5. Return the fixed code in a single fenced code block
6. After the code block, add a "## Changes" section listing what you changed and why

SCORING DIMENSIONS (0.0-1.0):
- syntax: balanced braces, valid structure
- completeness: no TODOs, no placeholders
- readability: comment density >= 5%, clear naming
- simplicity: max nesting depth 5
- security: no eval(), no innerHTML, no injection risks
- consistency: uniform style
- testability: exported functions, clear interfaces`,

    user: `This ${language} code scored ${(coherencyResult.total || 0).toFixed(3)} coherency (threshold: 0.68).

WEAK DIMENSIONS: ${weakDims.length > 0 ? weakDims.join(', ') : 'none specifically weak — overall below threshold'}

\`\`\`${language}
${code}
\`\`\`

Fix the code to score >= 0.80 coherency. Return the complete fixed code in a fenced code block, then explain your changes.`,
  };
}

// ─── Extract Code from LLM Response ─────────────────────────────

function extractCodeFromResponse(response, language) {
  if (!response) return null;

  // Try language-specific fence first
  const langFence = new RegExp('```' + language + '\\s*\\n([\\s\\S]*?)```', 'i');
  const langMatch = response.match(langFence);
  if (langMatch) return langMatch[1].trim();

  // Try generic fence
  const genericMatch = response.match(/```\w*\s*\n([\s\S]*?)```/);
  if (genericMatch) return genericMatch[1].trim();

  // If the whole response looks like code (no markdown), use it
  if (!response.includes('```') && (response.includes('function ') || response.includes('def ') || response.includes('class '))) {
    return response.trim();
  }

  return null;
}

function extractWhisper(response) {
  if (!response) return '';
  const changesMatch = response.match(/##\s*Changes?\s*\n([\s\S]*?)(?:\n##|\n```|$)/i);
  if (changesMatch) return changesMatch[1].trim();

  // Try to extract any explanation after the code block
  const parts = response.split('```');
  if (parts.length >= 3) {
    const afterCode = parts[parts.length - 1].trim();
    if (afterCode.length > 10) return afterCode.slice(0, 500);
  }
  return '';
}

// ─── LLM Healing Loop ───────────────────────────────────────────

/**
 * Run the LLM-powered SERF healing loop.
 *
 * Flow per iteration:
 *   1. Score current code (7 dimensions)
 *   2. If above target → done
 *   3. Build diagnosis prompt with weak dimensions
 *   4. Call LLM for fix + explanation
 *   5. Extract code from response
 *   6. Score healed code
 *   7. Accept only if improved (monotonic dimension check)
 *   8. Repeat until target met or max attempts
 *
 * @param {string} code - Code to heal
 * @param {object} options - { language, scoreFn, maxAttempts, targetCoherence, provider }
 * @returns {object} { code, coherency, improved, loops, whisper, changes[] }
 */
async function llmHeal(code, options = {}) {
  const {
    language = 'javascript',
    scoreFn,
    maxAttempts = LLM_HEAL_DEFAULTS.maxAttempts,
    targetCoherence = LLM_HEAL_DEFAULTS.targetCoherence,
    provider = null,
  } = options;

  // Score function: use Oracle's scorer or fallback
  const score = scoreFn || ((c) => {
    const lines = c.split('\n');
    const nonEmpty = lines.filter(l => l.trim());
    const opens = (c.match(/[{(]/g) || []).length;
    const closes = (c.match(/[})]/g) || []).length;
    const syntax = Math.max(0, 1 - Math.abs(opens - closes) * 0.02);
    const todos = (c.match(/TODO|FIXME/gi) || []).length;
    const completeness = Math.max(0, 1 - todos * 0.05);
    const comments = nonEmpty.filter(l => /^\s*(\/\/|#|\*|\/\*)/.test(l)).length;
    const readability = (comments / Math.max(nonEmpty.length, 1)) >= 0.05 ? 1.0 : 0.85;
    let maxD = 0, d = 0;
    for (const ch of c) { if (ch === '{') { d++; maxD = Math.max(maxD, d); } else if (ch === '}') d = Math.max(0, d - 1); }
    const simplicity = Math.max(0, 1 - Math.max(0, maxD - 5) * 0.1);
    const total = (syntax + completeness + readability + simplicity) / 4;
    return { total, dimensions: { syntax, completeness, readability, simplicity } };
  });

  let currentCode = code;
  let currentScore = score(code);
  const changes = [];
  let whisper = '';

  // Already above target
  if ((currentScore.total || 0) >= targetCoherence) {
    return { code: currentCode, coherency: currentScore.total, improved: false, loops: 0, whisper: '', changes: [] };
  }

  // Check if LLM is available
  const llmProvider = provider || detectLlmProvider();
  if (!llmProvider) {
    // Fall back to structural SERF
    return structuralHeal(code, language, currentScore);
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Build diagnosis
    const prompt = buildDiagnosisPrompt(currentCode, language, currentScore);

    // Call LLM
    const response = await callLlm(prompt.system, prompt.user, { provider: llmProvider });
    if (!response) {
      // LLM failed — fall back to structural for this iteration
      const structural = structuralHeal(currentCode, language, currentScore);
      currentCode = structural.code;
      currentScore = score(currentCode);
      changes.push({ attempt, method: 'structural-fallback', coherency: currentScore.total });
      continue;
    }

    // Extract healed code
    const healedCode = extractCodeFromResponse(response, language);
    if (!healedCode) {
      changes.push({ attempt, method: 'llm-parse-failed', coherency: currentScore.total });
      continue;
    }

    // Score healed code
    const healedScore = score(healedCode);

    // Accept only if improved
    if ((healedScore.total || 0) > (currentScore.total || 0)) {
      const iterWhisper = extractWhisper(response);
      changes.push({
        attempt,
        method: 'llm',
        before: currentScore.total,
        after: healedScore.total,
        improvement: Math.round((healedScore.total - currentScore.total) * 1000) / 1000,
        whisper: iterWhisper,
      });
      currentCode = healedCode;
      currentScore = healedScore;
      whisper = iterWhisper || whisper;

      // Check if target met
      if ((currentScore.total || 0) >= targetCoherence) break;
    } else {
      changes.push({ attempt, method: 'llm-rejected', reason: 'no improvement', before: currentScore.total, after: healedScore.total });
    }
  }

  return {
    code: currentCode,
    coherency: currentScore.total || 0,
    improved: currentCode !== code,
    loops: changes.length,
    whisper,
    changes,
    method: changes.some(c => c.method === 'llm') ? 'llm' : 'structural',
  };
}

// ─── Structural Fallback ─────────────────────────────────────────

function structuralHeal(code, language, currentScore) {
  let healed = code;
  healed = applySimplify(healed, language);
  healed = applySecure(healed, language);
  healed = applyReadable(healed, language);
  try { healed = applyUnify(healed, language); } catch {}
  try { healed = applyCorrect(healed, language); } catch {}
  const __retVal = {
    code: healed,
    coherency: currentScore.total || 0,
    improved: healed !== code,
    loops: 1,
    whisper: 'structural-transforms-applied',
    changes: [{ attempt: 0, method: 'structural' }],
    method: 'structural',
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.coherency || 0)), source: 'oracle:llm-healing:structuralHeal' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}

// ─── Integrated Healing (auto mode) ──────────────────────────────

/**
 * Smart healing that picks the best mode automatically.
 *
 * Mode: 'auto' (default)
 *   - If LLM available AND score < 0.50 → use LLM (deep reasoning needed)
 *   - If LLM available AND score 0.50-0.68 → try structural first, LLM if still low
 *   - If no LLM → structural only
 *
 * Mode: 'llm' → always use LLM
 * Mode: 'structural' → always use structural SERF
 */
async function smartHeal(code, options = {}) {
  const mode = options.mode || LLM_HEAL_DEFAULTS.mode;
  const language = options.language || 'javascript';
  const scoreFn = options.scoreFn;

  if (mode === 'structural') {
    const score = scoreFn ? scoreFn(code) : { total: 0.5 };
    return structuralHeal(code, language, score);
  }

  if (mode === 'llm') {
    return llmHeal(code, options);
  }

  // Auto mode
  const score = scoreFn ? scoreFn(code) : { total: 0.5 };
  const llmAvailable = !!detectLlmProvider();

  if (!llmAvailable) {
    return structuralHeal(code, language, score);
  }

  // Try structural first for moderate issues
  if ((score.total || 0) >= 0.50) {
    const structural = structuralHeal(code, language, score);
    const newScore = scoreFn ? scoreFn(structural.code) : { total: (score.total || 0) + 0.05 };

    if ((newScore.total || 0) >= (options.targetCoherence || LLM_HEAL_DEFAULTS.targetCoherence)) {
      return { ...structural, coherency: newScore.total };
    }

    // Structural wasn't enough — escalate to LLM
    return llmHeal(structural.code, { ...options, language });
  }

  // Deep issues (< 0.50) — go straight to LLM
  return llmHeal(code, options);
}

module.exports = {
  llmHeal,
  smartHeal,
  structuralHeal,
  detectLlmProvider,
  callLlm,
  buildDiagnosisPrompt,
  extractCodeFromResponse,
  extractWhisper,
  LLM_HEAL_DEFAULTS,
};
