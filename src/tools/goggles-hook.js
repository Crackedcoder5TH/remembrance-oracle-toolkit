#!/usr/bin/env node
'use strict';

/**
 * goggles-hook — PostToolUse adapter for ambient structural meta-awareness.
 *
 * Fires after every Edit|Write|MultiEdit and injects a concise "where this
 * sits in the whole codebase" note carrying THREE distinct signals:
 *
 *   • coherence  — does this have coherent STRUCTURE (syntax / completeness /
 *     consistency / AST), measured intrinsically from the content by the void
 *     compressor's coherency scorer. Not correctness. The delta tracks how the
 *     edit moved it.
 *   • resonance  — PATTERN RESONANCE: how much the section is shaped like the
 *     library's patterns (voidResonance against the substrate). Drives the
 *     CONSONANT…OUTLIER verdict and the "nearest in codebase" neighbours.
 *   • meta-debug — the toolkit's audit checkers (audit/ast-checkers) run on the
 *     file; HIGH-severity findings in the edited region surface as action items.
 *     This is the one that catches a real defect — eval on input, SQL by concat,
 *     a type/edge-case bug — that reads CLEAN on the first two (a bug can be
 *     perfectly coherent and perfectly consonant). Correct what it flags.
 *
 * coherence and resonance are similar but COMPLETELY DISTINCT — intrinsic
 * structure vs library-fit — and are never collapsed into one number; meta-debug
 * is the orthogonal correctness axis the other two can't see.
 *
 * Tunings: section-aware scope; coherence delta; exception-only (silent unless
 * the edit moves coherence or the section reads as a resonance outlier); a
 * lexical-neighbour relevance floor. Note: pattern resonance is a mean of top-K
 * nearest patterns, so it resolves at function/file scale — a few changed lines
 * sit inside its noise floor; the verdict speaks to substantial change.
 *
 * Best-effort: any problem exits 0 silently and never interferes with the edit.
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

// Moving numbers consolidated in the Living Remembrance Engine (the core).
let GOG;
try { GOG = require(path.join(__dirname, '..', 'core', 'living-remembrance')).gogglesParams(); }
catch (_) { GOG = { notable: 0.08, lexFloor: 0.20, resonanceConsonant: 0.90, resonanceFamiliar: 0.82, resonanceDistinct: 0.70 }; }

const LANG = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.rs': 'rust', '.go': 'go', '.java': 'java',
};
const lang = LANG[path.extname(fp)] || 'text';
const base = path.basename(fp);

// ── (1) Section-aware: the region the edit actually touched ────────────────
// Edit carries old_string/new_string; MultiEdit an edits[] array; Write the
// whole file. Score the enclosing region of the new text, snapped outward to
// blank-line (≈ function/paragraph) boundaries; fall back to the whole file
// when there's nothing to localise (e.g. a Write).
function editPair() {
  if (Array.isArray(ti.edits) && ti.edits.length) {
    return { oldStr: ti.edits[0].old_string || '', newStr: ti.edits[0].new_string || '' };
  }
  if (typeof ti.new_string === 'string') {
    return { oldStr: ti.old_string || '', newStr: ti.new_string };
  }
  return { oldStr: '', newStr: '' };
}
const { oldStr, newStr } = editPair();

// Locate the changed lines, then expand to a syntactic whole: pad ±25 lines,
// snap to blank boundaries, then balance braces so the scored region is an
// enclosing block, not a fragment. A cut '{'/'}' would tank scoreSyntax and
// inject noise into the coherence delta. (Brace-less languages like Python keep
// the blank-snapped window — netBraces stays 0.)
function lineRangeOf(text, needle) {
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  const startLine = text.slice(0, idx).split('\n').length - 1;
  return { startLine, endLine: startLine + needle.split('\n').length - 1 };
}

function regionAt(text, startLine, endLine) {
  const all = text.split('\n');
  const PAD = 25;
  let s = Math.max(0, startLine - PAD);
  let e = Math.min(all.length - 1, Math.max(startLine, endLine) + PAD);
  while (s > 0 && all[s].trim() !== '') s--;              // snap up to a blank line
  while (e < all.length - 1 && all[e].trim() !== '') e++; // snap down to a blank line
  const lineNet = (ln) => { let n = 0; for (const ch of ln) { if (ch === '{') n += 1; else if (ch === '}') n -= 1; } return n; };
  let net = 0;
  for (let i = s; i <= e; i++) net += lineNet(all[i]);
  for (let g = 0; g < 400 && net !== 0; g++) {            // extend to a balanced block
    if (net > 0 && e < all.length - 1) { e += 1; net += lineNet(all[e]); }
    else if (net < 0 && s > 0) { s -= 1; net += lineNet(all[s]); }
    else break;
  }
  return { text: all.slice(s, e + 1).join('\n'), startLine: s + 1, endLine: e + 1 };
}

const postRange = lineRangeOf(content, newStr);
const sec = postRange ? regionAt(content, postRange.startLine, postRange.endLine) : null;
const scopeText = sec ? sec.text : content;
const scopeLabel = sec ? `§ L${sec.startLine}–${sec.endLine}` : 'whole file';

function score(text, name) {
  return ft.read(
    { content: text, name, language: lang },
    { source: 'goggles:hook', growSubstrate: false, topK: 5 },
  );
}

let r;
try { r = score(scopeText, base); } catch (_) { process.exit(0); }

// ── (2) Delta: intrinsic coherence now vs before this edit ─────────────────
// Compare two INDEPENDENTLY balanced regions — the edited block now, and the
// same block reconstructed before the edit (new_string swapped back to old) —
// so the delta reflects the change, not a fragment boundary shifting. read() is
// stateless, so the second scoring call is safe and side-effect-free.
let delta = null;
if (sec && postRange) {
  try {
    const preContent = content.replace(newStr, oldStr);
    const preEnd = oldStr ? postRange.startLine + oldStr.split('\n').length - 1 : postRange.startLine - 1;
    const preRegion = regionAt(preContent, postRange.startLine, Math.max(postRange.startLine, preEnd));
    if (preRegion.text !== scopeText) {
      delta = (r.coherence ?? 0) - (score(preRegion.text, `${base}#pre`).coherence ?? 0);
    }
  } catch (_) { /* delta is optional */ }
}

// ── Pattern resonance (library-fit): drives the verdict + neighbours ───────
const vr = r.voidResonance || r.resonance || {};
const m = vr.meanTopK ?? 0;
const verdict = m >= GOG.resonanceConsonant ? 'CONSONANT' : m >= GOG.resonanceFamiliar ? 'FAMILIAR' : m >= GOG.resonanceDistinct ? 'DISTINCT' : 'OUTLIER';
// Exclude the file matching itself (the substrate contains it) — "nearest" is
// only useful if it points elsewhere.
const near = (vr.topMatches || [])
  .filter((x) => path.basename(String(x.name || '')) !== base)
  .slice(0, 3)
  .map((x) => `${(x.d4 ?? x.similarity ?? 0).toFixed(3)} ${x.name}`);

// ── (4) Lexical floor: keep lexical neighbours only above a relevance floor ─
const LEX_FLOOR = GOG.lexFloor;
const lex = ((r.codeResonance && r.codeResonance.topMatches) || [])
  .filter((x) => (x.similarity ?? 0) >= LEX_FLOOR)
  .slice(0, 2)
  .map((x) => `${(x.similarity ?? 0).toFixed(3)} ${x.name}`);

// ── (5) Meta-debug: run the toolkit's audit checkers on the file and surface
// HIGH-severity findings in the region just edited — so a real defect (eval on
// user input, SQL built by concat, a type/concurrency/edge-case bug) is caught
// in the edit loop and corrected now, not at CI. AST-based checker preferred,
// regex checker as fallback; best-effort, silent if the audit layer is absent.
let debugFindings = [];
try {
  let audit;
  try { audit = require(path.join(__dirname, '..', 'audit', 'ast-checkers')); }
  catch (_) { audit = require(path.join(__dirname, '..', 'audit', 'static-checkers')); }
  if (audit && typeof audit.auditCode === 'function') {
    const found = (audit.auditCode(content, { minSeverity: 'high', filePath: fp }) || {}).findings || [];
    // Only what this edit touched (or everything, for a whole-file write).
    debugFindings = sec ? found.filter((f) => f.line >= sec.startLine && f.line <= sec.endLine) : found;
  }
} catch (_) { /* audit layer unavailable — skip */ }

// ── (6) Learning loop: feed findings through the quantum debug-oracle. It
// learns which finding classes are worth surfacing (resolved → reinforced,
// dismissed/persisting → decayed) and suppresses ones that have decayed below
// the floor — so a false-positive class self-suppresses instead of needing a
// hand-patch. Proven fixes promote into the shared void pattern library.
try {
  const learning = require(path.join(__dirname, '..', 'debug', 'goggles-learning'));
  const res = learning.processFindings({ filePath: fp, findings: debugFindings, content, language: lang });
  if (res && Array.isArray(res.surface)) debugFindings = res.surface;
} catch (_) { /* learning optional — surface everything */ }

// ── (3) Exception-only: speak when it matters, stay silent otherwise ───────
// The scored region is brace-balanced (a syntactic whole, pre and post scored
// independently), so a structure-neutral edit yields Δ≈0 — measured: a clean
// comment insert is exactly 0.000, no boundary noise. With that margin, 0.08
// flags substantial weakening (broken syntax ~0.34, several compounding issues)
// and leaves minor one-offs alone. Don't lower it much: completeness penalises
// the incomplete-work marker words, so a tight gate flags docs that merely
// mention them (this very file did).
const NOTABLE = GOG.notable;
const dropped = delta !== null && delta <= -NOTABLE;
const jumped = delta !== null && delta >= NOTABLE;
// Speak on a HIGH-severity meta-debug finding, a resonance outlier, a real
// coherence move, or a whole-file/Write pass. An otherwise consonant, unchanged
// section with no findings stays quiet.
const notable = debugFindings.length > 0 || verdict === 'OUTLIER' || dropped || jumped || !sec;
if (!notable) process.exit(0); // no news is good news

// ── Render: TWO distinct signals, each on its own line ─────────────────────
//   coherence = intrinsic structure (does this hold together on its own);
//   resonance = ecosystem-fit + its nearest neighbour (where this sits in the
//               whole codebase). Never collapsed — they answer different questions.
const cohStr = (r.coherence ?? 0).toFixed(3);
const resStr = m.toFixed(3);
const deltaStr = delta === null
  ? ''
  : ` Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}${dropped ? ' ↓' : jumped ? ' ↑' : ''}`;

const lines = [
  `🥽 goggles · ${base} ${scopeLabel}`,
  `   coherence ${cohStr}${deltaStr} — intrinsic structure (not correctness)`,
  `   resonance ${resStr} ${verdict} — fit with the whole ecosystem`,
];
if (near.length) lines.push(`     ↳ nearest by resonance: ${near.join('  |  ')}`);
if (lex.length) lines.push(`   related (lexical): ${lex.join('  |  ')}`);
if (verdict === 'OUTLIER') lines.push('   ⚠ structurally novel here — confirm this is intentional, not drift.');
else if (dropped) lines.push('   ⚠ coherence dropped on this edit — the change weakened its structure.');
else if (!debugFindings.length) lines.push('   a change here most likely echoes in the nearest siblings above.');

// ── Meta-debug findings: the action items — correct these now ──────────────
for (const fnd of debugFindings.slice(0, 3)) {
  const what = fnd.reality || fnd.message || fnd.assumption || `${fnd.bugClass} issue`;
  lines.push(`   🛑 meta-debug [${fnd.severity}/${fnd.bugClass}] L${fnd.line}: ${what}`);
  if (fnd.suggestion) lines.push(`        → fix: ${fnd.suggestion}`);
}
if (debugFindings.length > 3) lines.push(`   …and ${debugFindings.length - 3} more high-severity finding(s) — correct these before moving on.`);

out(lines.join('\n'));
process.exit(0);
