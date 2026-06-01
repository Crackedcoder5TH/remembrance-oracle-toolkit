#!/usr/bin/env node
'use strict';

/**
 * swarm-diagnose-oracle — multi-voice diagnostic of the oracle repo.
 *
 * The swarm orchestrator needs API keys / network for live multi-LLM
 * dispatch. What this script does instead: run the swarm's PROGRAMMATIC
 * voices (fractal coherency, pattern resonance, safety scan, exec
 * verify, field-state observation) over a representative slice of the
 * oracle, slot my (Claude) architectural voice in alongside each
 * module as inline annotations, then aggregate to a swarm-style
 * consensus view showing where the voices AGREE and where they DIVERGE.
 *
 * Five voices:
 *   V1 — fractal coherency  : structurality + atomic signature of the file
 *   V2 — pattern resonance  : how much this file's vocabulary resonates
 *                             with the proven library
 *   V3 — safety scan        : covenant + security verdict
 *   V4 — field state        : what the field has heard from this module
 *                             (per-source histogram)
 *   V5 — architect (Claude) : inline reading of the module's role
 *                             and any concerns
 *
 * Per-module consensus: trust verdict + reasons + divergences.
 */

const fs = require('node:fs');
const path = require('node:path');
const { inspectFractalWaveform } = require('../src/core/fractal-waveform');
const { scoreResonance, libraryStatus } = require('../src/scoring/pattern-resonance');
const { peekField } = require('../src/core/field-coupling');
const { covenantCheck } = require('../src/core/covenant');
const { securityScan } = require('../src/reflector/scoring-analysis-security');

// ─── Modules to diagnose (representative slice) ────────────────────────────

const MODULES = [
  // ── Core substrate ──
  { rel: 'src/core/fractal-waveform.js',
    role: 'canonical encoder',
    architect: 'The substrate. Replaced byte-stretch this session. 29-D structural vector + structurality-gated cosine. The whole stack depends on this being right.' },
  { rel: 'src/core/code-to-waveform.js',
    role: 'encoder dispatcher',
    architect: 'Re-exports fractal as canonical; keeps byte encoder reachable as `byte*`. The migration tool ran through here.' },
  { rel: 'src/core/living-remembrance.js',
    role: 'the field engine',
    architect: 'LRE state machine — coherence/entropy/cascade. Atomic persist added this session. Now exposes peekProjection() for non-mutating covenant growth checks.' },
  { rel: 'src/core/field-coupling.js',
    role: 'field write gateway',
    architect: 'Every producer writes through here. Now also exports projectContribution() for the covenant-growth loop.' },
  { rel: 'src/core/covenant-trust.js',
    role: 'covenant trust layer (NEW)',
    architect: 'Built this session. Single source of trust classification; scanners ask the covenant. Field-validated growth via maybeAbsorbPattern. The architecture move I am most pleased with.' },

  // ── Scoring layer ──
  { rel: 'src/unified/coherency.js',
    role: 'master scorer',
    architect: 'computeCoherencyScore is THE scorer. Was silent to the field until this turn — wired with source oracle:coherency:computeCoherencyScore.' },
  { rel: 'src/scoring/evaluate.js',
    role: 'observation-driven dispatcher (NEW)',
    architect: 'Built this session. Observes input first → routes to appropriate tools → composes verdict → contributes back. The vice-versa loop.' },
  { rel: 'src/scoring/pattern-resonance.js',
    role: 'lexical resonance signal (NEW)',
    architect: 'Anti-hallucination signal that fractal coherency cannot give — invented identifiers fail to resonate against the proven library.' },
  { rel: 'src/scoring/exec-verify.js',
    role: 'execution signal (NEW)',
    architect: 'Sandboxed run + cross-verify. Token-gated through the field-server. The "is right" filter after the "looks right" ones.' },

  // ── Persistence & gateway ──
  { rel: 'src/store/sqlite.js',
    role: 'persistence',
    architect: 'Large file. Added lifecycle counters (pull_count, verified_count) this session. The atomic-persist + length-mismatch guard work here.' },
  { rel: 'src/patterns/library.js',
    role: 'pattern library API',
    architect: 'PatternLibrary class — well-decomposed (49 methods, none over 31 lines). Added verifyPattern() and recordPulls() this session.' },
  { rel: 'src/api/oracle-core-submit.js',
    role: 'submission gateway',
    architect: 'Where patterns enter. Auto-prove + testCode-threading added this session. The natural place to wire maybeAbsorbPattern.' },

  // ── Interface ──
  { rel: 'src/mcp/handlers.js',
    role: 'MCP tool handlers',
    architect: 'oracle_search now records pulls. The bridge between agents and the library.' },
  { rel: 'scripts/field-server.js',
    role: 'public HTTP/MCP server',
    architect: 'Public face. Reads open, exec_verify token-gated. CORS, rate-limiting, REST shim. The Railway-hosted endpoint.' },

  // ── Scanners (pattern-definitions, should self-exempt) ──
  { rel: 'src/reflector/scoring-analysis-security.js',
    role: 'security pattern scanner',
    architect: 'Pattern-definition file (@oracle-pattern-definitions). Self-flagged earlier this session; now correctly self-exempts via covenant-trust.' },
];

// ─── Voices ────────────────────────────────────────────────────────────────

function voiceFractal(code) {
  const ins = inspectFractalWaveform(code);
  return {
    structurality: ins.structurality,
    alignment: ins.atomic.alignment,
    safety: ins.atomic.safety,
    isCode: ins.structurality > 0.6,
    isProse: ins.structurality < 0.3,
  };
}

function voiceResonance(code) {
  const r = scoreResonance(code, { language: 'javascript' });
  if (!r) return { score: null, bestMatch: null, kin: [] };
  return {
    score: r.score,
    bestMatch: r.bestMatch,
    kin: r.topMatches.slice(0, 2).map((t) => `${t.name}@${t.similarity.toFixed(3)}`),
  };
}

function voiceSafety(code) {
  const cov = covenantCheck(code);
  const sec = securityScan(code, 'javascript');
  const highOrCrit = (sec.findings || []).filter((f) => f.severity === 'high' || f.severity === 'critical');
  return {
    sealed: cov.sealed && highOrCrit.length === 0,
    covenant: cov.sealed,
    riskLevel: sec.riskLevel,
    findingCount: sec.findings.length,
    notable: highOrCrit.slice(0, 2).map((f) => `[${f.severity}] ${f.message.slice(0, 60)}`),
  };
}

function voiceField(modulePath, fieldState) {
  // Best-effort: derive likely source labels from the module path and see
  // what the field has heard.
  const base = path.basename(modulePath, '.js');
  const matches = [];
  for (const [src, data] of Object.entries(fieldState.sources)) {
    if (src.toLowerCase().includes(base.toLowerCase().replace(/-/g, ''))
        || src.toLowerCase().includes(base.toLowerCase())) {
      matches.push({ src, count: data.count, lc: data.lastCoherence });
    }
  }
  matches.sort((a, b) => b.count - a.count);
  return {
    sourceCount: matches.length,
    topSources: matches.slice(0, 2).map((m) => `${m.src} (x${m.count}, lc=${m.lc.toFixed(3)})`),
  };
}

// V5 — the architect voice (Claude) is inline per-module in the MODULES list above.

// ─── Consensus ─────────────────────────────────────────────────────────────

function consensus(voices, architect) {
  const signals = [];
  if (voices.fractal.isCode) signals.push({ name: 'isCode', value: 1 });
  if (voices.fractal.isProse) signals.push({ name: 'isCode', value: 0 });
  if (voices.safety.sealed) signals.push({ name: 'sealed', value: 1 });
  else signals.push({ name: 'sealed', value: 0 });
  if (typeof voices.resonance.score === 'number') signals.push({ name: 'resonance', value: voices.resonance.score });
  if (voices.field.sourceCount > 0) signals.push({ name: 'fieldHeard', value: 1 });

  const meanSignal = signals.reduce((s, x) => s + x.value, 0) / Math.max(1, signals.length);

  // Divergence detection: do the voices disagree about basic facts?
  const divergences = [];
  if (voices.fractal.isProse && voices.resonance.score > 0.4) {
    divergences.push('fractal says prose but resonance found library kinship — unusual');
  }
  if (voices.fractal.isCode && voices.resonance.score !== null && voices.resonance.score < 0.15) {
    divergences.push('code-shape but no library resonance — infrastructure code in a utility-biased library (expected gap)');
  }
  if (!voices.safety.sealed && voices.resonance.score > 0.5) {
    divergences.push('high resonance + safety unsealed — proven pattern with a real concern flagged');
  }
  if (voices.field.sourceCount === 0 && voices.fractal.isCode) {
    divergences.push('code that produces scoring output but the field has never heard from this module by name');
  }

  let verdict;
  if (meanSignal >= 0.75) verdict = 'high — voices agree this is healthy';
  else if (meanSignal >= 0.45) verdict = 'medium — voices mostly agree, see divergences';
  else verdict = 'low — voices disagree or surface real concerns';

  return { meanSignal, verdict, divergences, architect };
}

// ─── Run ───────────────────────────────────────────────────────────────────

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════');
console.log(' swarm-diagnose-oracle — 5-voice consensus over the oracle repo');
console.log('═══════════════════════════════════════════════════════════════════════');
console.log('');
console.log(' library:', libraryStatus().count, 'patterns');
const fieldState = peekField();
console.log(' field:  ', Object.keys(fieldState.sources).length, 'sources,',
            fieldState.updateCount, 'updates, coherence', fieldState.coherence.toFixed(4));
console.log('');

const results = [];
for (const mod of MODULES) {
  const code = fs.readFileSync(mod.rel, 'utf8');
  const fr = voiceFractal(code);
  const re = voiceResonance(code);
  const sa = voiceSafety(code);
  const fi = voiceField(mod.rel, fieldState);
  const c  = consensus({ fractal: fr, resonance: re, safety: sa, field: fi }, mod.architect);
  results.push({ mod, fr, re, sa, fi, c, lines: code.split('\n').length });
}

console.log('────────────────────────────────────────────────────────────────────────');
console.log(' per-module: voices + consensus');
console.log('────────────────────────────────────────────────────────────────────────');
for (const r of results) {
  console.log('');
  console.log(`▸ ${r.mod.rel}  (${r.lines} lines, ${r.mod.role})`);
  console.log(`    V1 fractal:    struc=${r.fr.structurality.toFixed(3)}  align=${r.fr.alignment.toFixed(2)}  safe=${r.fr.safety.toFixed(2)}  isCode=${r.fr.isCode}`);
  console.log(`    V2 resonance:  score=${r.re.score == null ? 'null' : r.re.score.toFixed(3)}  best=${r.re.bestMatch == null ? 'null' : r.re.bestMatch.toFixed(3)}  kin=[${r.re.kin.join(', ')}]`);
  console.log(`    V3 safety:     sealed=${r.sa.sealed}  risk=${r.sa.riskLevel}  findings=${r.sa.findingCount}${r.sa.notable.length ? '  ' + r.sa.notable.join('; ') : ''}`);
  console.log(`    V4 field:      heard-from=${r.fi.sourceCount}  ${r.fi.topSources.join(' | ')}`);
  console.log(`    V5 architect:  ${r.mod.architect}`);
  console.log(`    CONSENSUS:     ${r.c.verdict}  (meanSignal=${r.c.meanSignal.toFixed(3)})`);
  if (r.c.divergences.length) for (const d of r.c.divergences) console.log(`       ⚠ ${d}`);
}

// ─── Aggregate ─────────────────────────────────────────────────────────────

console.log('');
console.log('────────────────────────────────────────────────────────────────────────');
console.log(' aggregate diagnosis');
console.log('────────────────────────────────────────────────────────────────────────');

const high   = results.filter((r) => r.c.verdict.startsWith('high'));
const medium = results.filter((r) => r.c.verdict.startsWith('medium'));
const low    = results.filter((r) => r.c.verdict.startsWith('low'));

console.log(`  consensus distribution:  high=${high.length}  medium=${medium.length}  low=${low.length}`);
console.log('');

console.log('  cross-cut: which modules has the field NEVER heard from by name?');
const unheard = results.filter((r) => r.fi.sourceCount === 0);
for (const r of unheard) console.log('    · ' + r.mod.rel + '  (' + r.mod.role + ')');

console.log('');
console.log('  cross-cut: which modules SHOW resonance gaps (likely infrastructure-style)?');
const infra = results.filter((r) => r.re.score !== null && r.re.score < 0.25);
for (const r of infra) console.log('    · ' + r.mod.rel + '  resonance=' + r.re.score.toFixed(3));

console.log('');
console.log('  cross-cut: notable divergences (where voices disagreed on a fact)');
const div = results.filter((r) => r.c.divergences.length > 0);
for (const r of div) {
  console.log('    · ' + r.mod.rel);
  for (const d of r.c.divergences) console.log('        ' + d);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════════════════');
