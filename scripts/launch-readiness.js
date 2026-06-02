#!/usr/bin/env node
'use strict';

/**
 * launch-readiness — single-shot diagnostic that says GO or NO-GO.
 *
 * Runs every check that determines whether the system is ready for a soft
 * launch. Each check is a one-line GREEN/YELLOW/RED verdict with a short
 * explanation. The exit code is the number of RED checks (0 = ready).
 *
 *   GREEN  — check passed, no action needed
 *   YELLOW — check passed with caveats, review before public deploy
 *   RED    — check failed, MUST address before launch
 *
 * Run with: `node scripts/launch-readiness.js`
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let red = 0, yellow = 0, green = 0;

function check(level, label, detail) {
  const colors = {
    GREEN:  '\x1b[32m', YELLOW: '\x1b[33m', RED: '\x1b[31m', RESET: '\x1b[0m',
  };
  const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  const tag = useColor ? `${colors[level]}${level}${colors.RESET}` : level;
  if (level === 'GREEN') green++;
  else if (level === 'YELLOW') yellow++;
  else if (level === 'RED') red++;
  process.stdout.write(`  [${tag.padEnd(useColor ? 14 : 6)}] ${label}`);
  if (detail) process.stdout.write(`\n              ${detail}`);
  process.stdout.write('\n');
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log(' Remembrance Field — launch-readiness diagnostic');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// ─── 1. Node version ─────────────────────────────────────────────────────
const nodeVer = process.versions.node.split('.').map(Number);
const nodeOK = nodeVer[0] >= 20;
const permOK = nodeVer[0] >= 22 || (nodeVer[0] === 20 && nodeVer[1] >= 18);
console.log('Runtime');
check(nodeOK ? 'GREEN' : 'RED', `Node version: v${process.versions.node}`,
  nodeOK ? 'meets Node 20+ requirement' : 'Node 20+ required');
check(permOK ? 'GREEN' : 'YELLOW', `Node --permission support`,
  permOK ? 'in-process JS sandbox available for exec_verify'
         : 'older Node — exec_verify will run JS WITHOUT --permission isolation; upgrade to Node 22+ before public deploy');

// ─── 2. Persistent storage ───────────────────────────────────────────────
console.log('\nPersistence');
const entropyPath = process.env.ENTROPY_PATH;
if (entropyPath) {
  const dir = path.dirname(entropyPath);
  const dirExists = fs.existsSync(dir);
  check(dirExists ? 'GREEN' : 'RED', `ENTROPY_PATH: ${entropyPath}`,
    dirExists ? 'parent directory exists (writable persistence)'
              : 'parent directory does NOT exist — field cannot persist');
} else {
  check('YELLOW', 'ENTROPY_PATH not set',
    'will use default ./.remembrance/entropy.json — fine for local, set explicitly for production');
}

// ─── 3. Authentication ───────────────────────────────────────────────────
console.log('\nAuthentication');
const fieldToken = (process.env.FIELD_TOKEN || process.env.REMEMBRANCE_FIELD_TOKEN || '').trim();
if (!fieldToken) {
  check('RED', 'FIELD_TOKEN not set',
    'field-server will allow ANYONE to write to your field and execute code — never deploy publicly without a token');
} else if (fieldToken.length < 32) {
  check('YELLOW', `FIELD_TOKEN set (length ${fieldToken.length})`,
    'token is shorter than 32 chars — use `openssl rand -hex 32` for a strong token');
} else {
  check('GREEN', `FIELD_TOKEN set (length ${fieldToken.length})`,
    'writes + exec_verify are bearer-gated');
}

// ─── 4. Execution sandbox ────────────────────────────────────────────────
console.log('\nExecution sandbox');
const execEnabled = process.env.EXEC_VERIFY_ENABLED !== '0' && process.env.EXEC_VERIFY_ENABLED !== 'false';
const pyEnabled = process.env.EXEC_VERIFY_PYTHON !== '0';
if (!execEnabled) {
  check('GREEN', 'exec_verify DISABLED (EXEC_VERIFY_ENABLED=0)',
    'no untrusted code execution surface exposed');
} else {
  if (permOK) {
    check('GREEN', 'exec_verify enabled with Node --permission sandbox (JS)',
      'JS execution is sandboxed: no network, no child_process, no FS outside tempdir');
  } else {
    check('RED', 'exec_verify enabled but Node version lacks --permission',
      'JS execution would run UNSANDBOXED — upgrade Node, disable EXEC_VERIFY_ENABLED, or run under container');
  }
  if (pyEnabled) {
    check('YELLOW', 'Python execution enabled (EXEC_VERIFY_PYTHON=1)',
      'CPython has NO in-process sandbox — set EXEC_VERIFY_PYTHON=0 OR run the server inside a container (seccomp/gVisor/Firecracker) before public deploy');
  } else {
    check('GREEN', 'Python execution DISABLED (EXEC_VERIFY_PYTHON=0)',
      'only sandboxed JS runs in exec_verify');
  }
}

// ─── 5. Swarm providers ──────────────────────────────────────────────────
console.log('\nSwarm providers');
const providers = {
  claude:   ['REMEMBRANCE_AGENT_CLAUDE', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  grok:     ['REMEMBRANCE_AGENT_GROK', 'GROK_API_KEY', 'XAI_API_KEY'],
  gemini:   ['REMEMBRANCE_AGENT_GEMINI', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  groq:     ['REMEMBRANCE_AGENT_GROQ', 'GROQ_API_KEY'],
  openai:   ['REMEMBRANCE_AGENT_OPENAI', 'OPENAI_API_KEY'],
  deepseek: ['REMEMBRANCE_AGENT_DEEPSEEK', 'DEEPSEEK_API_KEY'],
  cerebras: ['REMEMBRANCE_AGENT_CEREBRAS', 'CEREBRAS_API_KEY'],
};
const activeProviders = [];
for (const [p, vars] of Object.entries(providers)) {
  for (const v of vars) {
    if (process.env[v] && process.env[v].trim()) { activeProviders.push({ provider: p, var: v }); break; }
  }
}
if (activeProviders.length === 0) {
  check('YELLOW', 'No swarm provider API keys detected',
    'swarm will fall back to local providers only (ollama, claude-code). Set REMEMBRANCE_AGENT_* vars for cloud agents.');
} else if (activeProviders.length < 2) {
  check('YELLOW', `Only ${activeProviders.length} cloud provider configured`,
    'swarm consensus is stronger with ≥2 distinct providers — set at least one more REMEMBRANCE_AGENT_* var');
} else {
  check('GREEN', `${activeProviders.length} cloud providers configured`,
    activeProviders.map(p => `${p.provider} via ${p.var}`).join(', '));
}

// ─── 6. Cross-language parity (the known gap) ────────────────────────────
console.log('\nCross-language parity');
const fractalSpec = path.join(ROOT, 'docs', 'FRACTAL_WAVEFORM_SPEC.md');
const pyMirror = path.join(ROOT, '..', 'Void-Data-Compressor', 'to_fractal_waveform.py');
const specExists = fs.existsSync(fractalSpec);
const mirrorExists = fs.existsSync(pyMirror);
if (mirrorExists) {
  check('GREEN', 'Python fractal-waveform mirror present',
    'JS↔Python parity for the canonical fractal encoder');
} else if (specExists) {
  check('YELLOW', 'Python fractal-waveform mirror NOT built',
    'spec is in docs/FRACTAL_WAVEFORM_SPEC.md but Void-Data-Compressor/to_fractal_waveform.py does not exist — Python consumers speak the legacy byte encoder only');
} else {
  check('YELLOW', 'No fractal-waveform spec OR mirror',
    'cross-language consumers cannot reproduce the canonical encoder');
}

// ─── 7. Live engine + library check ──────────────────────────────────────
console.log('\nField + library');
try {
  const { peekField } = require('../src/core/field-coupling');
  const s = peekField();
  if (s && typeof s.coherence === 'number') {
    check('GREEN', `Field engine operational (coherence ${s.coherence.toFixed(4)})`,
      `${s.updateCount} updates accumulated, ${Object.keys(s.sources || {}).length} sources`);
  } else {
    check('RED', 'Field engine returned no state', 'getEngine() bootstrap failed');
  }
} catch (e) {
  check('RED', 'Field engine unreachable', String((e && e.message) || e).slice(0, 80));
}
try {
  const { libraryStatus } = require('../src/scoring/pattern-resonance');
  const ls = libraryStatus();
  if (ls.loaded && ls.count > 0) {
    check(ls.count >= 500 ? 'GREEN' : 'YELLOW',
      `Pattern library loaded (${ls.count} patterns)`,
      ls.count >= 500 ? 'enough substrate for resonance to discriminate' : 'library is small — resonance signal will be weaker on novel domains');
  } else {
    check('RED', 'Pattern library could not load', ls.error || 'unknown');
  }
} catch (e) {
  check('RED', 'Pattern resonance unreachable', String((e && e.message) || e).slice(0, 80));
}

// ─── Summary ─────────────────────────────────────────────────────────────
console.log('\n───────────────────────────────────────────────────────────────────────');
console.log(`  ${green} GREEN  ·  ${yellow} YELLOW  ·  ${red} RED`);
if (red === 0 && yellow === 0) {
  console.log('  ✓ GO — every check is GREEN. Safe to launch.\n');
} else if (red === 0) {
  console.log('  ⚠ SOFT-GO — no RED, but review YELLOWs before public deploy.\n');
} else {
  console.log(`  ✗ NO-GO — ${red} RED check(s) must be addressed.\n`);
}
process.exit(red);
