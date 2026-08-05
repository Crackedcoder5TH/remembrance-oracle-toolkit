#!/usr/bin/env node
'use strict';
// @oracle-infrastructure — bounded internal-state writes to internally-constructed paths (ledger/queue/config/cache persistence, validation temp-scratch, CI output, self-created sandbox scaffolding, auto-heal writeback) — not user-input-driven mutations

/**
 * precompact-digest.js — tell the compactor what is LOAD-BEARING.
 *
 * Fires on PreCompact. Claude Code appends this script's stdout to the
 * compaction prompt as custom instructions, so what we print here decides
 * what survives into the next context window.
 *
 * WHY THIS EXISTS — measured, not assumed:
 *
 *   Conversation accumulation, not file reading, is where context cost
 *   lives. In the session that motivated this tool the file-reading channel
 *   was 615 KB against 580.9M cache-read tokens — under 0.03% of traffic.
 *   Everything else was the transcript being re-read on every request.
 *
 *   The obvious fix — run the transcript through the Void compressor — is a
 *   DEAD END, and we measured it rather than guessing:
 *
 *     raw text     210,027 B -> 58,063 tokens  (3.62 ch/tok)
 *     zlib+base64   85,284 B -> 61,179 tokens  (1.39 ch/tok)  = 1.05x
 *
 *   A 2.5x byte win is cancelled by base64 tokenising 2.6x worse. Entropic
 *   compression cannot reduce context cost. Do not try again without
 *   re-running that control.
 *
 *   What DOES work is selection: most of a transcript is dead by the time
 *   compaction runs. A file written 200 turns ago is on disk. A `git status`
 *   from turn 40 is false now. Those bytes are retrievable or superseded,
 *   and both classes can be dropped without losing a fact.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *
 *   It does not rank content by coherency. Coherency measures STRUCTURE,
 *   never importance — a well-formed dead-end scores high and a scrappy
 *   correction scores low. Using it as an importance selector would be the
 *   exact misuse the goggles banner warns about. Selection here is by
 *   LIVENESS (superseded vs current) and by EVIDENCE (sealed measurements,
 *   user corrections), both of which are decidable from the transcript.
 *
 * Never fails a compaction: every path is guarded and it always exits 0.
 */

const fs = require('fs');
const path = require('path');

const MAX_OUT = 4096;          // our own output enters context — keep it small
const MAX_SEALS = 12;
const MAX_CORRECTIONS = 8;
const MAX_PATHS = 10;          // paths are the cheapest section to lose — cap hard

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

/** Locate the transcript: the hook payload names it; fall back to newest. */
function resolveTranscript(payload) {
  const p = payload && (payload.transcript_path || payload.transcriptPath);
  if (p && fs.existsSync(p)) return p;
  try {
    const dir = path.join(process.env.HOME || '/root', '.claude', 'projects');
    let best = null;
    for (const sub of fs.readdirSync(dir)) {
      const d = path.join(dir, sub);
      if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d)) {
        if (!f.endsWith('.jsonl')) continue;
        const fp = path.join(d, f);
        const m = fs.statSync(fp).mtimeMs;
        if (!best || m > best.m) best = { fp, m };
      }
    }
    return best && best.fp;
  } catch { return null; }
}

/**
 * Walk the transcript once and classify every block.
 *
 * Returns the four things the compactor cannot recompute for itself:
 * evidence (sealed measurements), corrections (the user overruling us),
 * retrievable bodies (already on disk), and superseded outputs.
 */
function analyse(file) {
  const out = {
    bytes: { total: 0, retrievable: 0, superseded: 0, evidence: 0 },
    seals: [], corrections: [], writtenPaths: new Set(), supersededCmds: [],
    lastResultByCmd: new Map(),
  };
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return out; }

  const nameById = new Map(), inputById = new Map();
  const cmdCount = new Map();

  for (const line of text.split('\n')) {
    if (!line) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const msg = d.message || {};
    const role = msg.role || d.type;
    const content = msg.content;

    if (typeof content === 'string') {
      out.bytes.total += content.length;
      if (role === 'user') collectCorrection(content, out);
      continue;
    }
    if (!Array.isArray(content)) continue;

    for (const b of content) {
      if (!b || typeof b !== 'object') continue;

      if (b.type === 'text') {
        out.bytes.total += (b.text || '').length;
        if (role === 'user') collectCorrection(b.text || '', out);

      } else if (b.type === 'tool_use') {
        const inp = b.input || {};
        const size = JSON.stringify(inp).length;
        out.bytes.total += size;
        nameById.set(b.id, b.name);
        inputById.set(b.id, inp);

        // A Write/Edit body is duplicated on disk the moment it lands.
        if ((b.name === 'Write' || b.name === 'Edit') && inp.file_path) {
          try {
            if (fs.existsSync(inp.file_path)) {
              out.writtenPaths.add(inp.file_path);
              out.bytes.retrievable += size;
            }
          } catch { /* path unreadable — treat as live */ }
        }
        if (b.name === 'Bash' && inp.command) {
          const c = inp.command.trim();
          cmdCount.set(c, (cmdCount.get(c) || 0) + 1);
        }

      } else if (b.type === 'tool_result') {
        const c = b.content;
        const s = Array.isArray(c)
          ? c.map(x => (x && x.text) || '').join('')
          : (typeof c === 'string' ? c : '');
        out.bytes.total += s.length;
        const nm = nameById.get(b.tool_use_id);
        const inp = inputById.get(b.tool_use_id) || {};

        if (nm === 'Bash' && inp.command) {
          const c2 = inp.command.trim();
          const prev = out.lastResultByCmd.get(c2);
          // Same command run again: the earlier output is no longer true.
          if (prev !== undefined) out.bytes.superseded += prev;
          out.lastResultByCmd.set(c2, s.length);
        }
        collectSeals(s, out);
      }
    }
  }
  return out;
}

// The user overruling or correcting us is the single highest-value thing in
// a transcript and the first thing a generic summariser drops. Anchor it.
// "actually" is deliberately absent: it is a discourse marker, not a
// correction, and including it swept in ordinary requests during testing.
const CORRECTION = /\b(no[,.]|not what|that'?s wrong|incorrect|misread|you (?:missed|didn'?t|are wrong)|i (?:said|already|meant)|rather than|stop (?:talking|doing|splitting)|instead of guess)\b/i;
// Machine-generated turns arrive on the user channel but are not the user.
const NOT_USER = /^(Stop hook feedback|<system-reminder|<command-name|Caveat:|\[Request interrupted)/;
function collectCorrection(t, out) {
  const s = (t || '').trim();
  if (s.length < 20 || s.length > 600) return;
  if (NOT_USER.test(s)) return;
  if (!CORRECTION.test(s)) return;
  out.corrections.push(s.replace(/\s+/g, ' ').slice(0, 220));
}

// A VOID-SEAL line is an empirical result this substrate committed to.
// Losing one loses the evidence, not just the prose about it.
const SEAL = /⊙\s*VOID-SEAL[^\n]{0,240}/g;
function collectSeals(s, out) {
  if (!s || s.indexOf('VOID-SEAL') === -1) return;
  let m;
  SEAL.lastIndex = 0;
  while ((m = SEAL.exec(s)) !== null) {
    const line = m[0].replace(/\s+/g, ' ').trim();
    // Reading substrate_seal.py's own source yields the unrendered template.
    // A seal with a live placeholder in it is source code, not evidence.
    if (/\$\{|%[sd]\b|\{[a-z_]+\}/.test(line)) continue;
    if (!out.seals.includes(line)) {
      out.seals.push(line);
      out.bytes.evidence += line.length;
    }
  }
}

function kb(n) { return (n / 1024).toFixed(0) + ' KB'; }

function render(a) {
  const L = [];
  L.push('## Substrate compaction directive (computed from this transcript)');
  L.push('');
  L.push('Selection below is by LIVENESS and EVIDENCE, not by topic salience.');
  L.push('Follow it in addition to your normal summarisation.');
  L.push('');

  if (a.seals.length) {
    L.push('### RETAIN VERBATIM — sealed measurements (evidence, not prose)');
    L.push('These are results this substrate committed to under seal. Paraphrasing');
    L.push('a number here destroys the record. Copy the lines exactly.');
    for (const s of a.seals.slice(0, MAX_SEALS)) L.push('  ' + s.slice(0, 200));
    if (a.seals.length > MAX_SEALS) L.push(`  …and ${a.seals.length - MAX_SEALS} more seal line(s) — retain them too.`);
    L.push('');
  }

  if (a.corrections.length) {
    L.push('### RETAIN VERBATIM — the user\'s corrections');
    L.push('Every one of these overruled something. They must survive compaction');
    L.push('intact; a summary that loses them will repeat the corrected mistake.');
    for (const c of a.corrections.slice(-MAX_CORRECTIONS)) L.push('  · ' + c);
    L.push('');
  }

  if (a.writtenPaths.size) {
    L.push('### DROP THE BODY, KEEP THE PATH — already on disk');
    L.push('These files were written or edited and still exist. Their contents are');
    L.push('retrievable at any time. Record path + what changed and why; do NOT');
    L.push('carry the file bodies or diff hunks forward.');
    const ps = [...a.writtenPaths];
    for (const p of ps.slice(0, MAX_PATHS)) L.push('  ' + p);
    if (ps.length > MAX_PATHS) L.push(`  …and ${ps.length - MAX_PATHS} more path(s)`);
    L.push('');
  }

  // Everything from here is the RESERVED TAIL: it is budgeted out of MAX_OUT
  // before the variable-length sections above, so overflow truncates the path
  // list (cheapest to lose) rather than the accounting and the rule.
  const T = [];
  T.push('### DROP — superseded');
  T.push('Any command run more than once: only the LAST output is still true.');
  T.push('Discard earlier outputs of repeated commands (status, listings, checks).');
  T.push('Discard exploration that a later step already answered, and error output');
  T.push('for errors that were subsequently fixed — keep the fix, drop the trace.');
  T.push('');
  T.push('### Accounting for this transcript');
  T.push(`  total conversational payload : ${kb(a.bytes.total)}`);
  T.push(`  retrievable from disk        : ${kb(a.bytes.retrievable)}  (${a.writtenPaths.size} files)`);
  T.push(`  superseded repeated output   : ${kb(a.bytes.superseded)}`);
  T.push(`  sealed evidence to preserve  : ${kb(a.bytes.evidence)}  (${a.seals.length} seals)`);
  T.push('');
  T.push('Do not attempt to compress text into an encoded blob. Measured on this');
  T.push('substrate: zlib+base64 costs 1.05x the original TOKEN count because');
  T.push('base64 tokenises at 1.39 ch/tok against 3.62 for prose. Drop bytes by');
  T.push('SELECTION only.');


  // Reserve the tail, then spend what is left on the sections above.
  const tail = T.join('\n');
  let head = L.join('\n');
  const budget = MAX_OUT - tail.length - 2;
  if (head.length > budget) head = head.slice(0, Math.max(0, budget - 40)) + '\n  …path list truncated.\n';
  return head + '\n' + tail;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(readStdin() || '{}'); } catch { /* no payload */ }
  const t = resolveTranscript(payload);
  if (!t) process.exit(0);

  const a = analyse(t);
  const text = render(a);
  process.stdout.write(text + '\n');

  // Durable copy: SessionStart can reload this if the session is resumed.
  try {
    const dir = path.join(process.cwd(), '.remembrance');
    if (fs.existsSync(dir)) {
      fs.writeFileSync(path.join(dir, 'session-digest.json'), JSON.stringify({
        at: new Date().toISOString(),
        trigger: payload.trigger || null,
        bytes: a.bytes,
        seals: a.seals,
        corrections: a.corrections,
        writtenPaths: [...a.writtenPaths],
      }, null, 1));
    }
  } catch { /* durability is best-effort */ }
  process.exit(0);
}

if (require.main === module) {
  try { main(); } catch { process.exit(0); }   // never block a compaction
}

module.exports = { analyse, render };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
readStdin.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 6, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
resolveTranscript.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "gas", reactivity: "high", electronegativity: 0, group: 6, period: 3, harmPotential: "none", alignment: "neutral", intention: "malevolent", domain: "utility" };
analyse.atomicProperties = { charge: 1, valence: 0, mass: "heavy", spin: "odd", phase: "solid", reactivity: "medium", electronegativity: 0, group: 2, period: 4, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
collectCorrection.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
collectSeals.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "low", electronegativity: 0, group: 2, period: 2, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };
kb.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
render.atomicProperties = { charge: 1, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 3, period: 4, harmPotential: "minimal", alignment: "neutral", intention: "malevolent", domain: "utility" };
main.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0, group: 9, period: 3, harmPotential: "dangerous", alignment: "neutral", intention: "malevolent", domain: "utility" };
