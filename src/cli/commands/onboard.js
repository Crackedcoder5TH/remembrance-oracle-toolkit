'use strict';

/**
 * onboard.js — `oracle onboard`: the verified front door.
 *
 * A newcomer (human or AI agent) runs ONE command and gets three things,
 * in order:
 *
 *   1. The protocol — printed from the canonical ECOSYSTEM.md, never a
 *      hardcoded copy, so what onboard shows can never drift from the
 *      source of truth.
 *
 *   2. A conformance check — every command / dimension / live behaviour
 *      the protocol names is verified against the actual code, with
 *      PASS/FAIL receipts. This is the anti-drift gate: it is exactly
 *      the set of claims that, when stale, send a compliant agent down a
 *      wrong path (a command that doesn't resolve, an encoder dimension
 *      the docs got wrong, a "default" the read path no longer does).
 *      `onboard` exits non-zero when any claim is broken, so it doubles
 *      as a CI conformance check — run it after any encoder/CLI change.
 *
 *   3. A live FieldTool.read — so the newcomer SEES the 116-D composed
 *      flow working on real input (the depth flow d1..d4 + its shape),
 *      not just reads that it should.
 *
 * The claims live in CLAIMS below — declared once. Add a claim there and
 * onboard both announces it (part 2 header) and guards it (the check).
 */

const fs = require('node:fs');
const path = require('node:path');
const { c } = require('../colors');
const { getAllCommandNames } = require('../registry');

// The protocol's executable claims. These are the things the docs assert
// that a stale doc would get wrong — so these are the things to verify.
const CLAIMS = {
  // Top-level commands the ECOSYSTEM workflow + retrieval loop name.
  // Each must resolve to a real handler (not just appear in help).
  commands: [
    'audit', 'reflect', 'covenant', 'security-scan', 'risk-score', // the gates
    'search', 'resolve', 'register',                               // retrieval loop
    'ecosystem', 'swarm', 'void-scan',                             // peer wiring
  ],
  // Encoder dimensions the protocol names — verified by running the
  // encoders, not by trusting a comment.
  dims: [
    {
      id: 'L1 fractal — toFractalWaveform',
      expect: 29,
      get: () => require('../../core/fractal-waveform').toFractalWaveform(SAMPLE).length,
    },
    {
      id: 'composed depth-4 — encoder-stack.composedAtDepth(_, 4)',
      expect: 116,
      get: () => require('../../core/encoder-stack').composedAtDepth(SAMPLE, 4).length,
    },
  ],
};

const SAMPLE =
  'function debounce(fn, ms){let t; return (...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a), ms)}}';

function _ecosystemPath() {
  // Repo root is three up from src/cli/commands.
  const root = path.resolve(__dirname, '..', '..', '..');
  for (const p of [path.join(root, 'ECOSYSTEM.md'), path.join(process.cwd(), 'ECOSYSTEM.md')]) {
    try { if (fs.existsSync(p)) return p; } catch (_) { /* ignore */ }
  }
  return null;
}

function registerOnboardCommands(handlers, _context) {
  handlers['onboard'] = async () => {
    let pass = 0;
    let fail = 0;
    const mark = (ok, label, detail) => {
      if (ok) { pass++; console.log(`    ${c.green('✓')} ${label}`); }
      else { fail++; console.log(`    ${c.red('✗')} ${label}${detail ? c.dim('  (' + detail + ')') : ''}`); }
    };

    // ── 1. The protocol (canonical, can't drift) ────────────────────
    console.log('\n' + c.boldCyan('Remembrance — onboard') + '\n');
    const eco = _ecosystemPath();
    if (eco) {
      console.log(c.bold('1. Protocol') + c.dim('  (canonical ECOSYSTEM.md — read this once)') + '\n');
      console.log(c.dim(fs.readFileSync(eco, 'utf8').trimEnd()));
    } else {
      console.log(c.yellow('1. Protocol — ECOSYSTEM.md not found in repo root or cwd'));
    }

    // ── 2. Conformance: do the protocol's claims resolve in code? ───
    console.log('\n' + c.bold('2. Conformance — does the code still match the protocol?'));

    console.log('\n  ' + c.dim('commands the workflow names (must resolve to a handler):'));
    const names = getAllCommandNames();
    for (const cmd of CLAIMS.commands) {
      const ok = typeof handlers[cmd] === 'function';
      mark(ok, `oracle ${cmd}`, ok ? '' : (names.has(cmd) ? 'in help but no handler' : 'not registered'));
    }

    console.log('\n  ' + c.dim('encoder dimensions (verified by running the encoders):'));
    for (const d of CLAIMS.dims) {
      let got = null;
      try { got = d.get(); } catch (e) { got = 'err:' + (e && e.message); }
      mark(got === d.expect, `${d.id} = ${d.expect}-D`, got === d.expect ? '' : 'got ' + got);
    }

    // Run one read; reuse it for both the live-behaviour checks and the
    // demo below so the encoder/substrate only warm up once.
    console.log('\n  ' + c.dim('live behaviour (one FieldTool.read):'));
    let read = null;
    try {
      const ft = require('../../core/field-tool');
      read = ft.read(SAMPLE, { growSubstrate: false });
      if (read && typeof read.then === 'function') read = await read;
    } catch (_) { read = null; }
    const v = (read && read.voidResonance) || {};
    mark(v.flowAware === true, 'FieldTool.read engages the 116-D composed flow by default (flowAware)',
      v.flowAware === true ? '' : 'flowAware=' + v.flowAware);
    mark(typeof v.librarySize === 'number' && v.librarySize > 0, 'Void substrate reachable (librarySize > 0)',
      v.librarySize > 0 ? '' : 'librarySize=' + v.librarySize);

    // ── 3. Live read — see the flow ─────────────────────────────────
    console.log('\n' + c.bold('3. Live read') + c.dim('  — what the field says about a debounce():') + '\n');
    if (read) {
      const top = (v.topMatches && v.topMatches[0]) || null;
      console.log(`    coherence : ${(read.coherence || 0).toFixed(4)}    flowAware: ${v.flowAware}    library: ${v.librarySize}`);
      if (top) {
        const f = (x) => (typeof x === 'number' ? x.toFixed(3) : '-');
        console.log(`    best match: ${top.name}`);
        console.log(`    depth flow: d1=${f(top.d1)}  d2=${f(top.d2)}  d3=${f(top.d3)}  d4=${f(top.d4)}    shape=${top.shape}`);
      }
      console.log(`    layers    : ${JSON.stringify(read.layers)}`);
    } else {
      console.log(c.yellow('    field read unavailable'));
    }

    // ── Verdict ─────────────────────────────────────────────────────
    const verdict = fail
      ? c.red(`${fail} drifted`)
      : c.green('no drift');
    console.log('\n' + c.bold(`Conformance: ${pass}/${pass + fail} claims hold`) + '  — ' + verdict);
    console.log(c.dim('  Re-run after any encoder or CLI change. A non-zero exit means a doc'));
    console.log(c.dim('  claims something the code no longer does — fix the doc or the code.\n'));
    if (fail > 0) process.exitCode = 1;
  };
}

module.exports = { registerOnboardCommands };
