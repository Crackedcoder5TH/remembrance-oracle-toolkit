#!/usr/bin/env node
'use strict';

/**
 * goggles-hook — PostToolUse adapter for ambient structural meta-awareness.
 *
 * Wired as a PostToolUse hook on Edit|Write|MultiEdit, this fires after every
 * edit and injects a concise "where this file sits in the whole codebase" note
 * back into the agent's context — so the agent sees BOTH the section it just
 * changed and its structural neighbourhood across the ecosystem, at once.
 *
 * Best-effort by design: any problem (bad input, missing field tool, non-code
 * file) exits 0 silently and never interferes with the edit.
 */

const fs = require('node:fs');
const path = require('node:path');

function out(context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
  }));
}

let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { process.exit(0); }
let input = {};
try { input = JSON.parse(raw || '{}'); } catch (_) { process.exit(0); }

const ti = input.tool_input || {};
const fp = ti.file_path || ti.path || '';
const CODE = /\.(js|jsx|mjs|cjs|ts|tsx|py|rs|go|java)$/;
if (!fp || !CODE.test(fp)) process.exit(0); // only code files

let content;
try { content = fs.readFileSync(fp, 'utf8'); } catch (_) { process.exit(0); }
if (!content || content.length < 40) process.exit(0); // too small to read structurally

let ft;
try { ft = require(path.join(__dirname, '..', 'core', 'field-tool')); } catch (_) { process.exit(0); }

const LANG = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
};

let r;
try {
  r = ft.read(
    { content, name: path.basename(fp), language: LANG[path.extname(fp)] || 'text' },
    { source: 'goggles:hook', growSubstrate: false, topK: 5 },
  );
} catch (_) { process.exit(0); }

const vr = r.voidResonance || r.resonance || {};
const m = vr.meanTopK ?? 0;
const verdict = m >= 0.90 ? 'CONSONANT' : m >= 0.82 ? 'FAMILIAR' : m >= 0.70 ? 'DISTINCT' : 'OUTLIER';
const near = (vr.topMatches || []).slice(0, 3).map((x) => `${(x.d4 ?? x.similarity ?? 0).toFixed(3)} ${x.name}`);
const lex = ((r.codeResonance && r.codeResonance.topMatches) || []).slice(0, 2)
  .map((x) => `${(x.similarity ?? 0).toFixed(3)} ${x.name}`);

const lines = [
  `🥽 goggles · ${path.basename(fp)} — coherence ${(r.coherence ?? 0).toFixed(3)} (STRUCTURE, not correctness), consonance ${m.toFixed(3)} ${verdict}`,
];
if (near.length) lines.push(`   nearest in codebase: ${near.join('  |  ')}`);
if (lex.length) lines.push(`   related (lexical): ${lex.join('  |  ')}`);
if (verdict === 'OUTLIER') lines.push('   ⚠ structurally novel here — confirm this is intentional, not drift.');
else lines.push('   a change here most likely echoes in the nearest siblings above.');

out(lines.join('\n'));
process.exit(0);
