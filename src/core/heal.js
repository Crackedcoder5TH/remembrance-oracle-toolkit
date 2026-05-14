'use strict';

/**
 * Unified healing pipeline.
 *
 * Before this module, every healing subsystem ran its own code path:
 *
 *   - `audit check --auto-fix` called src/audit/auto-fix.js directly
 *   - `oracle reflect` walked the Reflector engine
 *   - `oracle swarm heal` called a different API
 *   - The LLM healer in src/core/llm-healing.js lived on its own
 *   - Pattern-pull (replace with a proven pattern) had no hooks at all
 *
 * None of these shared inputs or outputs. That means a bug fixed by
 * `auto-fix` didn't update the healing lineage; a bug healed by SERF
 * didn't update the audit calibration; a pattern pulled to replace a
 * weak function didn't count as a heal at all.
 *
 * This module wraps them in a single escalation ladder:
 *
 *   Level 0 (confident):  structural auto-fix  — fast, safe, deterministic
 *   Level 1 (serf):        regex/AST structural heal — fast, occasionally
 *                          ugly, no new dependencies
 *   Level 2 (llm):         call an LLM with context
 *   Level 3 (swarm):       multi-agent consensus heal
 *   Level 4 (generate):    pull a pattern from the library, or
 *                          ask an LLM to write the function from scratch
 *
 * Every level gets the same analysis envelope and returns the same
 * shape:
 *
 *   {
 *     success: true|false,
 *     level: 'confident' | 'serf' | 'llm' | 'swarm' | 'generate',
 *     patches: Patch[],
 *     before: { coherency, findings },
 *     after:  { coherency, findings },
 *     source: 'new code...',
 *     reason: 'explanation when success=false',
 *   }
 *
 * Every heal attempt fires events so the calibration + lineage + history
 * systems all learn from it.
 */

const { analyze } = require('./analyze');
const { getEventBus, EVENTS } = require('./events');

const LEVELS = ['confident', 'serf', 'llm', 'swarm', 'generate'];

function levelIndex(level) {
  const i = LEVELS.indexOf(level);
  return i < 0 ? LEVELS.length : i;
}

/**
 * Heal a single source file's contents.
 *
 * @param {string} source
 * @param {object} [options]
 *   - filePath:   used for envelope + event attribution
 *   - envelope:   pre-computed envelope (skip re-analyze)
 *   - maxLevel:   stop climbing the ladder past this level
 *   - targetRule: only attempt fixes for this ruleId
 *   - dryRun:     don't write anything, just return the result
 *   - llmClient:  injected LLM client for level 2
 *   - swarmClient: injected swarm client for level 3
 *   - library:    pattern library for generate level
 * @returns {Promise<HealResult>}
 */
async function heal(source, options = {}) {
  const filePath = options.filePath || null;
  const bus = getEventBus();
  const envelope = options.envelope || analyze(source, filePath, options);
  const before = {
    coherency: envelope.coherency,
    findings: envelope.allFindings.slice(),
  };

  if (!envelope.allFindings || envelope.allFindings.length === 0) {
    return { success: true, level: 'noop', patches: [], before, after: before, source };
  }

  const maxLevel = options.maxLevel || 'generate';
  const maxIdx = levelIndex(maxLevel);

  // ── Level 0: confident auto-fix ─────────────────────────────────────
  if (levelIndex('confident') <= maxIdx) {
    bus.emitSync(EVENTS.HEAL_ATTEMPT, { level: 'confident', file: filePath });
    try {
      const result = await tryConfidentLevel(source, envelope, options);
      if (result.success) {
        bus.emitSync(EVENTS.HEAL_SUCCEEDED, {
          level: 'confident',
          file: filePath,
          patchCount: result.patches.length,
          coherencyBefore: before.coherency.total,
          coherencyAfter: result.after.coherency.total,
        });
        return result;
      }
    } catch (e) {
      bus.emitSync(EVENTS.HEAL_FAILED, { level: 'confident', file: filePath, reason: e.message });
    }
  }

  // ── Level 1: SERF structural reflection ─────────────────────────────
  if (levelIndex('serf') <= maxIdx) {
    bus.emitSync(EVENTS.HEAL_ATTEMPT, { level: 'serf', file: filePath });
    try {
      const result = await trySerfLevel(source, envelope, options);
      if (result.success) {
        bus.emitSync(EVENTS.HEAL_SUCCEEDED, {
          level: 'serf', file: filePath, patchCount: result.patches.length,
          coherencyBefore: before.coherency.total,
          coherencyAfter: result.after.coherency.total,
        });
        return result;
      }
    } catch (e) {
      bus.emitSync(EVENTS.HEAL_FAILED, { level: 'serf', file: filePath, reason: e.message });
    }
  }

  // ── Level 2: LLM-assisted heal ──────────────────────────────────────
  // No explicit client required — tryLlmLevel auto-discovers the
  // built-in llm-healing module. Caller-supplied clients still work
  // via options.llmClient.
  if (levelIndex('llm') <= maxIdx) {
    bus.emitSync(EVENTS.HEAL_ATTEMPT, { level: 'llm', file: filePath });
    try {
      const result = await tryLlmLevel(source, envelope, options);
      if (result.success) {
        bus.emitSync(EVENTS.HEAL_SUCCEEDED, {
          level: 'llm', file: filePath, patchCount: result.patches.length,
          coherencyBefore: before.coherency.total,
          coherencyAfter: result.after.coherency.total,
        });
        return result;
      }
    } catch (e) {
      bus.emitSync(EVENTS.HEAL_FAILED, { level: 'llm', file: filePath, reason: e.message });
    }
  }

  // ── Level 3: Swarm consensus ────────────────────────────────────────
  // Auto-discovers the built-in src/swarm orchestrator. Still accepts
  // caller-supplied clients via options.swarmClient.
  if (levelIndex('swarm') <= maxIdx) {
    bus.emitSync(EVENTS.HEAL_ATTEMPT, { level: 'swarm', file: filePath });
    try {
      const result = await trySwarmLevel(source, envelope, options);
      if (result.success) {
        bus.emitSync(EVENTS.HEAL_SUCCEEDED, {
          level: 'swarm', file: filePath, patchCount: result.patches.length,
          coherencyBefore: before.coherency.total,
          coherencyAfter: result.after.coherency.total,
        });
        return result;
      }
    } catch (e) {
      bus.emitSync(EVENTS.HEAL_FAILED, { level: 'swarm', file: filePath, reason: e.message });
    }
  }

  // ── Level 4: Pattern pull / generate from scratch ───────────────────
  if (levelIndex('generate') <= maxIdx && options.library) {
    bus.emitSync(EVENTS.HEAL_ATTEMPT, { level: 'generate', file: filePath });
    try {
      const result = await tryGenerateLevel(source, envelope, options);
      if (result.success) {
        bus.emitSync(EVENTS.HEAL_SUCCEEDED, {
          level: 'generate', file: filePath, patchCount: result.patches.length || 0,
          coherencyBefore: before.coherency.total,
          coherencyAfter: result.after?.coherency?.total ?? 0,
        });
        return result;
      }
    } catch (e) {
      bus.emitSync(EVENTS.HEAL_FAILED, { level: 'generate', file: filePath, reason: e.message });
    }
  }

  bus.emitSync(EVENTS.HEAL_FAILED, { level: 'all', file: filePath, reason: 'exhausted ladder' });
  return { success: false, level: null, patches: [], before, after: before, source, reason: 'exhausted heal ladder' };
}

// ─── Level implementations ─────────────────────────────────────────────────

async function tryConfidentLevel(source, envelope, options) {
  const { generatePatchFor, applyPatches } = require('../audit/auto-fix');
  const findings = filterTargetable(envelope.audit.findings, options);
  if (findings.length === 0) return { success: false, level: 'confident' };
  const patches = [];
  for (const f of findings) {
    const p = generatePatchFor(f, source, envelope.program);
    if (p && p.length > 0) patches.push(...p);
  }
  if (patches.length === 0) return { success: false, level: 'confident' };
  const { source: nextSource, applied } = applyPatches(source, patches);
  if (applied === 0 || nextSource === source) return { success: false, level: 'confident' };

  // Re-analyze the healed source to confirm the coherency actually moved.
  const after = analyze(nextSource, envelope.filePath);
  if (after.audit.findings.length > envelope.audit.findings.length) {
    return { success: false, level: 'confident', reason: 'auto-fix introduced new findings' };
  }
  const __retVal = {
    success: true,
    level: 'confident',
    patches,
    before: { coherency: envelope.coherency, findings: envelope.allFindings },
    after: { coherency: after.coherency, findings: after.allFindings },
    source: nextSource,
  };
  // ── LRE field-coupling (auto-wired) ──
  try {
    const __lre_enginePaths = ['./../core/field-coupling',
      require('path').join(__dirname, '../core/field-coupling')];
    for (const __p of __lre_enginePaths) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.coherency || 0)), source: 'oracle:heal:tryConfidentLevel' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}

async function trySerfLevel(source, envelope, options) {
  // SERF is the toolkit's structural healing loop. We call it via the
  // public entrypoint if it exists, otherwise return noop.
  let serf;
  try { serf = require('./serf'); } catch { return { success: false, level: 'serf' }; }
  if (!serf || typeof serf.reflectionLoop !== 'function') return { success: false, level: 'serf' };

  const result = serf.reflectionLoop(source, {
    language: envelope.language,
    maxLoops: options.maxSerfLoops || 3,
    targetCoherence: options.targetCoherence || 0.8,
  });
  const nextSource = result.finalCode || result.code || source;
  if (nextSource === source) return { success: false, level: 'serf' };
  const after = analyze(nextSource, envelope.filePath);
  return {
    success: true,
    level: 'serf',
    patches: [{ note: 'serf', source: nextSource }],
    before: { coherency: envelope.coherency, findings: envelope.allFindings },
    after: { coherency: after.coherency, findings: after.allFindings },
    source: nextSource,
    whisper: result.whisper,
  };
}

async function tryLlmLevel(source, envelope, options) {
  // The toolkit ships its own LLM healer at src/core/llm-healing.js —
  // it already handles provider detection (Anthropic/OpenAI/Gemini
  // from env), prompt construction, code extraction, and retry logic.
  // If the caller provides their own `llmClient` we use that; otherwise
  // we delegate to the built-in healer.
  const { llmClient, llmModel, llmProvider } = options;

  // Caller-supplied client path (backward compat)
  if (llmClient && typeof llmClient.complete === 'function') {
    const prompt = buildLlmPrompt(source, envelope);
    const response = await llmClient.complete({ model: llmModel || 'claude-sonnet-4-6', prompt });
    const nextSource = extractCodeBlock(response) || source;
    if (nextSource === source) return { success: false, level: 'llm' };

    const after = analyze(nextSource, envelope.filePath);
    if (after.audit.findings.length > envelope.audit.findings.length) {
      return { success: false, level: 'llm', reason: 'LLM output introduced new findings' };
    }
    return buildLlmResult('llm-custom-client', source, nextSource, envelope, after);
  }

  // Built-in toolkit LLM healer. Provider auto-detection lives there.
  let llmHeal, detectLlmProvider;
  try { ({ llmHeal, detectLlmProvider } = require('./llm-healing')); }
  catch { return { success: false, level: 'llm', reason: 'llm-healing module not available' }; }
  if (typeof llmHeal !== 'function') return { success: false, level: 'llm', reason: 'llmHeal missing' };

  // Fast-fail if no provider is configured. Otherwise the heal ladder
  // would wait for the 90s timeout on every nullable-deref finding
  // just to discover there's no API key.
  if (typeof detectLlmProvider === 'function' && !detectLlmProvider() && !options.llmProvider) {
    return { success: false, level: 'llm', reason: 'no llm provider configured (set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY)' };
  }
  try {
    const result = await Promise.race([
      llmHeal(source, {
        language: envelope.language,
        provider: llmProvider || null,
        // A lightweight score fn keyed off the envelope's re-analysis
        scoreFn: (c) => {
          const e = analyze(c, envelope.filePath);
          return e.coherency || { total: 0 };
        },
        maxAttempts: options.llmMaxAttempts || 2,
        targetCoherence: options.targetCoherence || 0.8,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('llm timeout')), options.llmTimeout || 90000)),
    ]);
    const nextSource = result?.code || result?.finalCode || source;
    if (nextSource === source) return { success: false, level: 'llm', reason: 'llm healer returned unchanged source' };
    const after = analyze(nextSource, envelope.filePath);
    if (after.audit.findings.length > envelope.audit.findings.length) {
      return { success: false, level: 'llm', reason: 'LLM output introduced new findings' };
    }
    return buildLlmResult('llm-builtin', source, nextSource, envelope, after, result?.whisper);
  } catch (e) {
    return { success: false, level: 'llm', reason: e?.message || String(e) };
  }
}

function buildLlmResult(note, source, nextSource, envelope, after, whisper) {
  return {
    success: true,
    level: 'llm',
    patches: [{ note, source: nextSource }],
    before: { coherency: envelope.coherency, findings: envelope.allFindings },
    after:  { coherency: after.coherency,  findings: after.allFindings },
    source: nextSource,
    whisper,
  };
}

async function trySwarmLevel(source, envelope, options) {
  // Caller-supplied swarm client path
  const { swarmClient } = options;
  if (swarmClient && typeof swarmClient.heal === 'function') {
    const result = await swarmClient.heal({
      source,
      findings: envelope.allFindings,
      filePath: envelope.filePath,
      language: envelope.language,
    });
    return buildSwarmResult('swarm-custom-client', source, result, envelope);
  }

  // Built-in swarm orchestrator from src/swarm/index.js
  let swarmHeal, getAvailableProviders, loadSwarmConfig;
  try { ({ swarmHeal, getAvailableProviders, loadSwarmConfig } = require('../swarm')); }
  catch { return { success: false, level: 'swarm', reason: 'swarm module not available' }; }
  if (typeof swarmHeal !== 'function') {
    return { success: false, level: 'swarm', reason: 'swarmHeal missing' };
  }

  // Fast-fail when no API-keyed cloud providers are configured. The
  // swarm config may still list local providers (ollama, claude-code)
  // but those require running daemons and can hang on network I/O.
  // Cloud providers are the reliable "will actually respond" path;
  // if none are set, treat swarm as unavailable so the heal ladder
  // moves on instead of blocking on a 3-minute timeout.
  const cloudAvailable = !!(process.env.ANTHROPIC_API_KEY ||
                            process.env.OPENAI_API_KEY ||
                            process.env.GOOGLE_API_KEY ||
                            process.env.XAI_API_KEY ||
                            process.env.MISTRAL_API_KEY);
  if (!cloudAvailable && !options.forceSwarm) {
    return { success: false, level: 'swarm', reason: 'no cloud swarm providers configured (local-only providers skipped; set ANTHROPIC_API_KEY/OPENAI_API_KEY/GOOGLE_API_KEY or pass forceSwarm:true)' };
  }

  if (typeof getAvailableProviders === 'function') {
    try {
      const config = typeof loadSwarmConfig === 'function' ? loadSwarmConfig() : {};
      const providers = getAvailableProviders(config);
      if (!providers || providers.length === 0) {
        return { success: false, level: 'swarm', reason: 'no swarm providers configured' };
      }
    } catch { /* ignore — proceed to full call */ }
  }

  try {
    const result = await Promise.race([
      swarmHeal({
        code: source,
        language: envelope.language,
        findings: envelope.allFindings,
        filePath: envelope.filePath,
        crossScoring: options.swarmCrossScoring !== false,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('swarm timeout')), options.swarmTimeout || 180000)),
    ]);
    return buildSwarmResult('swarm-builtin', source, result, envelope);
  } catch (e) {
    return { success: false, level: 'swarm', reason: e?.message || String(e) };
  }
}

function buildSwarmResult(note, source, result, envelope) {
  const nextSource = result?.code || result?.source || result?.final || source;
  if (!nextSource || nextSource === source) {
    return { success: false, level: 'swarm', reason: 'swarm returned unchanged source' };
  }
  const after = analyze(nextSource, envelope.filePath);
  if (after.audit.findings.length > envelope.audit.findings.length) {
    return { success: false, level: 'swarm', reason: 'swarm consensus introduced new findings' };
  }
  return {
    success: true,
    level: 'swarm',
    patches: [{ note, source: nextSource, consensus: result?.consensus || result?.votes }],
    before: { coherency: envelope.coherency, findings: envelope.allFindings },
    after:  { coherency: after.coherency,  findings: after.allFindings },
    source: nextSource,
    whisper: result?.whisper,
  };
}

async function tryGenerateLevel(source, envelope, options) {
  // Two sub-strategies:
  //   (a) Pattern pull — if the library has a pattern whose ruleId/tag
  //       matches a finding, try replacing the offending function body
  //       with the pattern's code.
  //   (b) LLM-from-scratch — regenerate the whole file from a
  //       structured spec. This is the most aggressive option and is
  //       opt-in via options.allowRegenerate.
  const { library, allowRegenerate = false, llmClient } = options;
  if (!library) return { success: false, level: 'generate', reason: 'no library' };

  // (a) Pattern pull based on first audit finding's ruleId / bugClass
  const target = envelope.audit.findings[0];
  if (target && typeof library.findByRuleId === 'function') {
    const candidates = library.findByRuleId(target.ruleId);
    if (candidates && candidates.length > 0) {
      const pattern = candidates[0];
      // Replace the enclosing function body with the pattern's code.
      const nextSource = replaceEnclosingFunction(source, envelope, target, pattern.code);
      if (nextSource !== source) {
        const after = analyze(nextSource, envelope.filePath);
        return {
          success: true,
          level: 'generate',
          patches: [{ note: 'pattern-pull', patternId: pattern.id }],
          before: { coherency: envelope.coherency, findings: envelope.allFindings },
          after: { coherency: after.coherency, findings: after.allFindings },
          source: nextSource,
        };
      }
    }
  }

  // (b) Full regenerate — only if explicitly allowed
  if (allowRegenerate && llmClient) {
    return await tryLlmLevel(source, envelope, options);
  }

  return { success: false, level: 'generate' };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function filterTargetable(findings, options) {
  if (!options.targetRule) return findings;
  return findings.filter(f => f.ruleId === options.targetRule || f.bugClass === options.targetRule);
}

function buildLlmPrompt(source, envelope) {
  const lines = [
    'You are the Remembrance Oracle healing layer. Fix the findings below in the source.',
    '',
    `Language: ${envelope.language}`,
    `File: ${envelope.filePath || '<inline>'}`,
    `Findings (${envelope.allFindings.length}):`,
  ];
  for (const f of envelope.allFindings.slice(0, 10)) {
    lines.push(`  - L${f.line} [${f.ruleId || f.bugClass}] ${f.reality || f.message || ''}`);
    if (f.suggestion) lines.push(`    fix: ${f.suggestion}`);
  }
  lines.push('');
  lines.push('Return ONLY the healed source inside a single ```' + envelope.language + ' code block.');
  lines.push('Do not add commentary outside the code block.');
  lines.push('');
  lines.push('Source:');
  lines.push('```' + envelope.language);
  lines.push(source);
  lines.push('```');
  return lines.join('\n');
}

function extractCodeBlock(response) {
  if (typeof response !== 'string') return null;
  const m = response.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return m ? m[1] : null;
}

function replaceEnclosingFunction(source, envelope, finding, replacementBody) {
  // Find the function containing `finding.line` and replace its body.
  const fn = envelope.functions.find(f => {
    const bodyStartLine = (f.line || 0);
    const bodyEndLine = (f.bodyTokens && f.bodyTokens.length)
      ? f.bodyTokens[f.bodyTokens.length - 1].line
      : bodyStartLine;
    return bodyStartLine <= finding.line && finding.line <= bodyEndLine + 1;
  });
  if (!fn) return source;
  const before = source.slice(0, fn.bodyStart);
  const after = source.slice(fn.bodyEnd);
  return before + '{\n' + replacementBody + '\n}' + after;
}

module.exports = {
  heal,
  LEVELS,
  levelIndex,
  // Exposed for tests
  _tryConfidentLevel: tryConfidentLevel,
};
