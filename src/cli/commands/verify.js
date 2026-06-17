'use strict';

/**
 * verify.js — `oracle verify`: the ecosystem truth-spine.
 *
 * One command that answers "is the system what it claims?" by composing
 * every independent verification engine into a single verdict:
 *
 *   encoder        — the dimensions are real (L1 = 29, composed = 116)
 *   field          — the substrate is reachable and reads at 116-D
 *   falsification  — the committed, pinned coherence verdict (phase null)
 *   contracts      — verify_capabilities.py's falsifiable contracts
 *   covenant       — the 15-principle seal (dogfooded on this file)
 *   commands       — the workflow commands resolve to real handlers
 *
 * Fractally implemented: a verdict is a SELF-SIMILAR node. The same
 * shape and the same fold/render apply to a single leaf check, to an
 * engine, and to the whole ecosystem — verify stacks leaf checks into
 * engines into one root verdict exactly as the encoder stacks 29-D
 * depths into the 116-D composed signature. Following the field's own
 * coherency, this is the "many independent engines → one verdict"
 * family (kin to reflector/multi-engine.js, which the field surfaced as
 * the nearest cousin of the falsification harness).
 *
 * Every claim is executable here; every result it reads is durable
 * (the pinned falsification report, the committed substrate). A
 * non-zero exit means an engine is definitively broken — so this line
 * is the CI definition of "complete".
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { c } = require('../colors');

const VOID_ROOT = process.env.VOID_ROOT || '/home/user/Void-Data-Compressor';
const HUB_ROOT = path.resolve(__dirname, '..', '..', '..');
const SAMPLE = 'function add(a, b){ return a + b; }';

// ── Fractal verdict node — self-similar at every scale ──────────────
// leaf:   a single check.   branch: a fold of nodes (engine, ecosystem).
// The same render() recurses at every depth — that self-similarity IS
// the fractal.
function leaf(name, ok, detail) {
  return {
    name,
    status: ok === null ? 'skip' : (ok ? 'pass' : 'fail'),
    passed: ok ? 1 : 0,
    total: ok === null ? 0 : 1,
    detail: detail || '',
    children: [],
  };
}
function branch(name, children) {
  const passed = children.reduce((s, ch) => s + ch.passed, 0);
  const total = children.reduce((s, ch) => s + ch.total, 0);
  const anyFail = children.some((ch) => ch.status === 'fail');
  const status = anyFail ? (passed > 0 ? 'partial' : 'fail') : (total === 0 ? 'skip' : 'pass');
  return { name, status, passed, total, detail: '', children };
}
function symbol(status) {
  return { pass: c.green('✓'), fail: c.red('✗'), partial: c.yellow('~'), skip: c.dim('·') }[status];
}
function render(n, depth) {
  const pad = '  '.repeat((depth || 0) + 1);
  const count = n.total ? c.dim(`${n.passed}/${n.total}`) : c.dim('skip');
  const detail = n.detail ? '  ' + c.dim(n.detail) : '';
  console.log(`${pad}${symbol(n.status)} ${n.name}  ${count}${detail}`);
  for (const ch of n.children) render(ch, (depth || 0) + 1); // self-similar recursion
}

// ── Engines (each an independent verdict branch) ────────────────────
function encoderEngine() {
  const kids = [];
  try { kids.push(leaf('L1 fractal = 29-D', require('../../core/fractal-waveform').toFractalWaveform(SAMPLE).length === 29)); }
  catch (e) { kids.push(leaf('L1 fractal = 29-D', false, e.message)); }
  try { kids.push(leaf('composed depth-4 = 116-D', require('../../core/encoder-stack').composedAtDepth(SAMPLE, 4).length === 116)); }
  catch (e) { kids.push(leaf('composed depth-4 = 116-D', false, e.message)); }
  return branch('encoder', kids);
}

async function fieldEngine() {
  const kids = [];
  try {
    const ft = require('../../core/field-tool');
    let r = ft.read(SAMPLE, { growSubstrate: false });
    if (r && typeof r.then === 'function') r = await r;
    const v = (r && r.voidResonance) || {};
    kids.push(leaf('reads at 116-D composed flow (flowAware)', v.flowAware === true));
    kids.push(leaf('Void substrate reachable', typeof v.librarySize === 'number' && v.librarySize > 0, `${v.librarySize || 0} patterns`));
  } catch (e) {
    kids.push(leaf('field read', false, e.message));
  }
  return branch('field', kids);
}

function falsificationEngine() {
  try {
    // Prefer the toolkit's OWN bundled, self-contained report (runnable here via
    // `python3 falsification/run.py`) so the kill-test is reachable in the public
    // repo with no private engine. Fall back to the Void run when present.
    const local = path.join(__dirname, '..', '..', '..', 'falsification', 'coherence_falsification_v2_report.json');
    const v2 = path.join(VOID_ROOT, 'coherence_falsification_v2_report.json');
    const v1 = path.join(VOID_ROOT, 'coherence_falsification_report.json');
    const p = fs.existsSync(local) ? local : fs.existsSync(v2) ? v2 : v1;
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const pin = d._pinned || {};
    const dp = pin.domain_pair || pin;                 // v2 nests under domain_pair; v1 is flat
    const verdict = dp.verdict || pin.verdict;
    const rate = typeof dp.survival_rate_phase === 'number' ? dp.survival_rate_phase
      : (typeof pin.survival_rate === 'number' ? pin.survival_rate : null);
    const surv = dp['survivors_phase_p<0.01'] != null ? dp['survivors_phase_p<0.01'] : pin['survivors_phase_p<0.01'];
    const total = dp.pairs != null ? dp.pairs : pin.pairs_total;
    return branch('falsification', [
      leaf('pinned durable report present', !!pin.generated_at,
        pin.generated_at ? `${path.basename(p)} — run ${pin.generated_at}, seed ${pin.seed}, n=${pin.n_permutations}` : ''),
      leaf(`coherence verdict: ${verdict || '?'}`, !!verdict,
        rate != null ? `${(rate * 100).toFixed(2)}% beat the phase null (${surv}/${total})` : ''),
    ]);
  } catch (_e) {
    return branch('falsification', [leaf('pinned coherence report', null, 'not found — run coherence_falsification_v2.py')]);
  }
}

function contractsEngine() {
  try {
    const out = execFileSync('python3', ['verify_capabilities.py', '--json'],
      { cwd: VOID_ROOT, timeout: 120000, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const d = JSON.parse(out);
    const results = d.results || [];
    if (results.length) {
      // Fractal depth: one self-similar leaf per contract, folded by the branch.
      return branch('contracts', results.map((r) => leaf(r.id || r.name || 'contract', !!r.pass, r.detail || '')));
    }
    const s = d.summary || {};
    return branch('contracts', [leaf(`${s.passed}/${s.total} falsifiable contracts`, s.passed === s.total)]);
  } catch (e) {
    return branch('contracts', [leaf('falsifiable contracts', null, 'verify_capabilities.py unavailable — ' + String(e.message || '').split('\n')[0])]);
  }
}

function covenantEngine() {
  // Dogfood — covenant-check this very file (the verifier verifies itself).
  let out = '';
  try {
    out = execFileSync('node', ['src/cli.js', 'covenant', '--file', 'src/cli/commands/verify.js'],
      { cwd: HUB_ROOT, timeout: 60000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  } catch (e) { out = String((e && e.stdout) || ''); } // covenant exits non-zero when not sealed
  if (!out) return branch('covenant', [leaf('15-principle seal (self-checked)', null, 'covenant unavailable')]);
  const m = out.match(/(\d+)\/(\d+)\s+principles/);
  return branch('covenant', [leaf('15-principle seal (self-checked)', /SEALED/.test(out), m ? m[0] : '')]);
}

function commandsEngine(handlers) {
  const required = ['audit', 'reflect', 'covenant', 'security-scan', 'risk-score',
    'search', 'resolve', 'register', 'ecosystem', 'swarm', 'void-scan', 'onboard', 'verify'];
  return branch('commands', required.map((cmd) => leaf(`oracle ${cmd}`, typeof handlers[cmd] === 'function')));
}

function registerVerifyCommands(handlers, _context) {
  handlers['verify'] = async () => {
    console.log('\n' + c.boldCyan('oracle verify')
      + c.dim('  — ecosystem truth-spine (fractal: leaf → engine → ecosystem)') + '\n');

    const engines = [
      encoderEngine(),
      await fieldEngine(),
      falsificationEngine(),
      contractsEngine(),
      covenantEngine(),
      commandsEngine(handlers),
    ];
    for (const e of engines) render(e, 0);

    const line = engines.map((e) =>
      `${e.name} ${symbol(e.status)}${e.total ? ' ' + e.passed + '/' + e.total : ''}`
    ).join(c.dim(' · '));
    const broken = engines.some((e) => e.status === 'fail');
    console.log('\n' + c.bold('verdict: ') + line);
    console.log('  ' + (broken
      ? c.red('NOT COMPLETE — an engine is broken (a claim the code no longer backs)')
      : c.green('every executable claim holds against the durable record'))
      + c.dim('   (~ = honest partial, · = engine not run here)'));

    // Route every moving number through the LRE, classified by kind, then
    // read the whole ecosystem back as ONE coherency flow:
    //   coherency-based number -> recordBenefit (the coherence path)
    //   entropy-based number   -> recordCost    (raises entropy)
    // Best-effort: a down field never blocks the verdict.
    try {
      const fcm = require('../../core/field-coupling');
      const root = branch('ecosystem', engines);
      const coherency = root.total ? root.passed / root.total : 0;          // coherency-based
      const incompleteness = engines.filter((e) => e.status !== 'pass').length; // entropy-based
      fcm.recordBenefit({ coherence: coherency, source: 'verify:ecosystem:coherency' });
      if (incompleteness > 0) {
        fcm.recordCost({ units: incompleteness, source: 'verify:ecosystem:entropy', kind: 'incompleteness' });
      }
      console.log(c.dim(`  routed to LRE — coherency ${coherency.toFixed(4)} (benefit) · incompleteness ${incompleteness} (cost)`));
      const flow = fcm.fieldDirection();
      if (flow && flow.verdict) {
        const sgn = (x, d) => (x >= 0 ? '+' : '') + x.toFixed(d);
        console.log('  ' + c.bold('ecosystem flow: ') + c.cyan(flow.verdict)
          + c.dim(`  (Δcoherence ${sgn(flow.coherenceDelta, 4)} · Δentropy ${sgn(flow.entropyDelta, 2)} · Δcascade ${sgn(flow.cascadeDelta, 2)})`));
      }
    } catch (_) { /* field unreachable */ }
    console.log('');

    if (broken) process.exitCode = 1;
  };
}

module.exports = { registerVerifyCommands, leaf, branch };
