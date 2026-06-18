#!/usr/bin/env node
'use strict';

/**
 * goggles-hook — PostToolUse adapter for ambient structural meta-awareness.
 *
 * Fires after every Edit|Write|MultiEdit and injects a concise "where this
 * sits in the whole codebase" note carrying TWO distinct signals:
 *
 *   • coherence  — does this have coherent STRUCTURE (syntax / completeness /
 *     consistency / AST), measured intrinsically from the content by the void
 *     compressor's coherency scorer. Not correctness. The delta tracks how the
 *     edit moved it.
 *   • resonance  — PATTERN RESONANCE: how much the section is shaped like the
 *     library's patterns (voidResonance against the substrate). Drives the
 *     CONSONANT…OUTLIER verdict and the "nearest in codebase" neighbours.
 *
 * These are similar but COMPLETELY DISTINCT — intrinsic structure vs library-
 * fit — and are never collapsed into one number.
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
const verdict = m >= 0.90 ? 'CONSONANT' : m >= 0.82 ? 'FAMILIAR' : m >= 0.70 ? 'DISTINCT' : 'OUTLIER';
// Exclude the file matching itself (the substrate contains it) — "nearest" is
// only useful if it points elsewhere.
const near = (vr.topMatches || [])
  .filter((x) => path.basename(String(x.name || '')) !== base)
  .slice(0, 3)
  .map((x) => `${(x.d4 ?? x.similarity ?? 0).toFixed(3)} ${x.name}`);

// ── (4) Lexical floor: keep lexical neighbours only above a relevance floor ─
const LEX_FLOOR = 0.20;
const lex = ((r.codeResonance && r.codeResonance.topMatches) || [])
  .filter((x) => (x.similarity ?? 0) >= LEX_FLOOR)
  .slice(0, 2)
  .map((x) => `${(x.similarity ?? 0).toFixed(3)} ${x.name}`);

// ── (3) Exception-only: speak when it matters, stay silent otherwise ───────
// The scored region is brace-balanced (a syntactic whole, pre and post scored
// independently), so a structure-neutral edit yields Δ≈0 — measured: a clean
// comment insert is exactly 0.000, no boundary noise. With that margin, 0.08
// flags substantial weakening (broken syntax ~0.34, several compounding issues)
// and leaves minor one-offs alone. Don't lower it much: completeness penalises
// the incomplete-work marker words, so a tight gate flags docs that merely
// mention them (this very file did).
const NOTABLE = 0.08;
const dropped = delta !== null && delta <= -NOTABLE;
const jumped = delta !== null && delta >= NOTABLE;
// Speak on a resonance outlier, a real coherence move, or a whole-file/Write
// pass (no section to vouch for it). A consonant, unchanged section stays quiet.
const notable = verdict === 'OUTLIER' || dropped || jumped || !sec;
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
else lines.push('   a change here most likely echoes in the nearest siblings above.');

out(lines.join('\n'));
process.exit(0);
