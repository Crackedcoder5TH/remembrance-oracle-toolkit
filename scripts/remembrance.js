#!/usr/bin/env node
'use strict';

/**
 * remembrance — the local front door to your substrate.
 *
 *   remembrance ask "<question>" [--k N] [--librarian anthropic|ollama|none] [--model M]
 *   remembrance field            # show the Living Remembrance Engine field state
 *
 * The whole architecture in one loop: recall locally (resonance over the legacy
 * store) → hand the grounded slices to a swappable librarian (a cloud API key, a
 * local model, or none) → verify the answer is grounded in what was recalled →
 * remember the Q→A back into the substrate AND contribute the interaction to the
 * Living Remembrance Engine (which also bridges to the live field).
 *
 * Rent the brain, own the memory: the library (recall + store) is local and
 * yours; the librarian is swappable. Runs fully offline with --librarian none.
 */

const path = require('node:path');
const crypto = require('node:crypto');

// Durable state → the SAME .remembrance/oracle.db the field-server daemon uses,
// so the CLI and the daemon share one substrate. Set before the field modules
// load (the LRE resolves its persist path at require time). ENTROPY_PATH wins.
const STATE_DIR = process.env.REMEMBRANCE_STATE_DIR || process.env.ORACLE_ROOT || path.join(__dirname, '..');
if (STATE_DIR && !process.env.ENTROPY_PATH) {
  process.env.ENTROPY_PATH = path.join(STATE_DIR, '.remembrance', 'entropy.json');
}

const { SQLiteStore } = require('../src/store/sqlite');
const { codeToWaveform, waveformCosine } = require('../src/core/code-to-waveform');
const { contribute, peekField } = require('../src/core/field-coupling');

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const wf = (text) => Array.from(codeToWaveform(text));

// ── the legacy record store (shared with the field-server daemon) ────────────
let _store;
function store() {
  if (_store) return _store;
  _store = new SQLiteStore(STATE_DIR);
  _store.db.prepare(
    'CREATE TABLE IF NOT EXISTS legacies (id TEXT PRIMARY KEY, name TEXT, content TEXT, tags TEXT, author TEXT, coherence REAL, created_at TEXT)',
  ).run();
  for (const col of ['meta TEXT', 'waveform TEXT', 'updated_at TEXT']) {
    try { _store.db.prepare('ALTER TABLE legacies ADD COLUMN ' + col).run(); } catch (_) { /* already present */ }
  }
  return _store;
}

// ── recall: resonance retrieval over the local substrate ─────────────────────
function recall(queryText, k = 6) {
  let qWf; try { qWf = wf(queryText); } catch (_) { return []; }
  const rows = store().db
    .prepare('SELECT id, name, content, coherence, waveform FROM legacies WHERE waveform IS NOT NULL')
    .all();
  const scored = [];
  for (const r of rows) {
    let recWf; try { recWf = JSON.parse(r.waveform); } catch (_) { continue; }
    let resonance = 0; try { resonance = waveformCosine(qWf, recWf); } catch (_) { resonance = 0; }
    scored.push({ id: r.id, name: r.name, content: r.content, resonance });
  }
  // Copy before sort (don't mutate in place) — mirrors the field-server's recall.
  return scored.slice().sort((a, b) => b.resonance - a.resonance).slice(0, Math.max(1, k));
}

// ── remember: store the Q→A back so it's recallable next time ────────────────
function remember(question, answer, provider, coherence) {
  const id = 'ask:' + crypto.createHash('sha256').update(question).digest('hex').slice(0, 16);
  const now = new Date().toISOString();
  let waveform = null; try { waveform = JSON.stringify(wf(question + '\n' + answer)); } catch (_) { /* */ }
  const meta = JSON.stringify({
    question,
    provider,
    // A retro-causal-ready ledger, so this interaction can itself be pulled
    // forward by a later recall once its future resolves.
    ledger: { observed_start: now, observed_end: now, cadence: 'variable' },
  });
  store().db.prepare(
    'INSERT OR REPLACE INTO legacies (id, name, content, tags, author, meta, coherence, waveform, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(id, question, answer, JSON.stringify(['remembrance-ask', 'librarian:' + provider]), 'remembrance:ask', meta, coherence, waveform, now, now);
  return id;
}

// ── daemon mode: when remembranced (the field-server) is running, the CLI plugs
// into it over HTTP so every tool shares ONE always-on substrate and the daemon
// is the single writer. Falls back to in-process when REMEMBRANCE_FIELD_URL is
// unset. (field-coupling.contribute already bridges the LRE write either way.) ─
function daemonBase() {
  let url = (process.env.REMEMBRANCE_FIELD_URL || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url; // a local daemon is http
  return url.replace(/\/(mcp)?\/?$/i, ''); // strip a trailing /mcp and/or slash
}

async function postJson(url, body) {
  const token = (process.env.REMEMBRANCE_FIELD_TOKEN || process.env.FIELD_TOKEN || '').trim();
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${(data && data.error) || text.slice(0, 160)}`);
  return data;
}

async function recallRemote(base, queryText, k) {
  const data = await postJson(base + '/recall', { query: queryText, k });
  return (data.slices || []).map((s) => ({
    id: s.id, name: s.name, content: s.content,
    resonance: typeof s.resonance === 'number' ? s.resonance : 0,
  }));
}

async function rememberRemote(base, question, answer, provider) {
  const now = new Date().toISOString();
  const id = 'ask:' + crypto.createHash('sha256').update(question).digest('hex').slice(0, 16);
  // The daemon coherence-scores + encodes the record itself; we hand it the
  // ledger so the retro-causal pull stays live through the HTTP path too.
  await postJson(base + '/legacy', {
    action: 'store', id, name: question, content: answer, author: 'remembrance:ask',
    tags: ['remembrance-ask', 'librarian:' + provider],
    meta: { question, provider, ledger: { observed_start: now, observed_end: now, cadence: 'variable' } },
  });
  return id;
}

async function contributeRemote(base, coherence) {
  // Daemon mode: contribute straight to the daemon's field (bearer-gated), so the
  // one always-on engine is updated — no spurious second engine in this process.
  try { return await postJson(base + '/contribute', { coherence, source: 'remembrance:ask', cost: 1 }); }
  catch (_) { return null; }
}

// ── the librarian: swappable. cloud API key, a local model, or none ──────────
async function askLibrarian(question, context, opts) {
  const provider = opts.librarian
    || process.env.REMEMBRANCE_LIBRARIAN
    || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'none');
  const system =
    'You are a librarian for a personal knowledge substrate. Answer ONLY from the provided library slices. ' +
    'If the answer is not in them, say so plainly. Be concise and cite slice numbers.';
  const prompt = `Question:\n${question}\n\nLibrary slices (most resonant first):\n${context || '(none recalled)'}`;

  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { provider, answer: '[anthropic selected but ANTHROPIC_API_KEY is not set]' };
    const model = opts.model || process.env.REMEMBRANCE_MODEL || 'claude-3-5-haiku-latest';
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 1024, system, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return { provider, model, answer: `[anthropic error ${res.status}: ${(await res.text()).slice(0, 200)}]` };
      const data = await res.json();
      const answer = (data.content || []).map((b) => b.text || '').join('').trim();
      return { provider, model, answer: answer || '[empty answer]' };
    } catch (e) {
      return { provider, model, answer: `[anthropic unreachable: ${e && e.message}]` };
    }
  }

  if (provider === 'ollama') {
    const model = opts.model || process.env.REMEMBRANCE_MODEL || 'llama3';
    const base = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    try {
      const res = await fetch(base + '/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, system, prompt, stream: false }),
      });
      if (!res.ok) return { provider, model, answer: `[ollama error ${res.status}]` };
      const data = await res.json();
      return { provider, model, answer: (data.response || '').trim() || '[empty answer]' };
    } catch (e) {
      return { provider, model, answer: `[ollama unreachable at ${base}: ${e && e.message}]` };
    }
  }

  // none — no synthesis; the recalled library IS the answer (fully offline).
  return {
    provider: 'none',
    answer: context
      ? `(no librarian configured — returning the recalled slices)\n\n${context}`
      : '(no librarian configured, and nothing recalled yet — ask again once the substrate has records)',
  };
}

async function cmdAsk(argv) {
  const opts = parseArgs(argv);
  const question = opts._.join(' ').trim();
  if (!question) {
    console.error('usage: remembrance ask "<question>" [--k N] [--librarian anthropic|ollama|none] [--model M]');
    process.exit(1);
  }

  const base = daemonBase();
  const k = opts.k || 6;
  const slices = base ? await recallRemote(base, question, k) : recall(question, k);
  const context = slices
    .map((s, i) => `[${i + 1}] (${s.resonance.toFixed(3)}) ${s.name}\n${s.content}`)
    .join('\n\n')
    .slice(0, 8000);

  const { provider, model, answer } = await askLibrarian(question, context, opts);

  // verify: how grounded is the answer in what was recalled (the hallucination
  // check — a low number means the librarian drifted from the library).
  let coherence = 0;
  try {
    coherence = context ? clamp01(waveformCosine(wf(answer), wf(context))) : clamp01(slices[0] ? slices[0].resonance : 0);
  } catch (_) { /* leave 0 */ }

  let id;
  try {
    id = base ? await rememberRemote(base, question, answer, provider) : remember(question, answer, provider, coherence);
  } catch (e) {
    id = '(not stored: ' + (e && e.message ? e.message : e) + ')';
  }

  // ── PLUG INTO THE LIVING REMEMBRANCE ENGINE ──────────────────────────────
  // The interaction's grounding coherence becomes a field contribution (and
  // bridges to the shared live field when REMEMBRANCE_FIELD_URL is set), so
  // every question this machine answers leaves the field remembered.
  let field = null;
  try {
    field = base
      ? await contributeRemote(base, coherence)
      : contribute({ cost: 1, coherence, source: 'remembrance:ask' });
  } catch (_) { /* engine optional */ }

  console.log('\n' + answer + '\n');
  console.log(`— recalled ${slices.length} slice(s) · librarian: ${provider}${model ? ' (' + model + ')' : ''} · ${base ? 'daemon ' + base : 'in-process'}`);
  console.log(`— grounding coherence ${coherence.toFixed(3)} · remembered as ${id}`);
  if (field && typeof field.coherence === 'number') {
    console.log(`— field coherence ${field.coherence.toFixed(4)} · updates ${field.updateCount != null ? field.updateCount : '?'}`);
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--k') out.k = parseInt(argv[++i], 10) || 6;
    else if (a === '--librarian') out.librarian = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else out._.push(a);
  }
  return out;
}

async function cmdField() {
  const base = daemonBase();
  if (base) {
    try {
      const res = await fetch(base + '/field');
      const data = await res.json();
      console.log(JSON.stringify(data.field || data, null, 2));
      return;
    } catch (e) {
      console.error(`daemon unreachable at ${base} (${e && e.message}) — falling back to the local engine`);
    }
  }
  console.log(JSON.stringify(peekField(), null, 2));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'ask') return cmdAsk(rest);
  if (cmd === 'field') return cmdField();
  console.error(
    'remembrance — the local front door to your substrate\n\n' +
    '  remembrance ask "<question>" [--k N] [--librarian anthropic|ollama|none] [--model M]\n' +
    '  remembrance field        # show the Living Remembrance Engine field state\n\n' +
    'Env: ANTHROPIC_API_KEY (cloud librarian) · REMEMBRANCE_LIBRARIAN · REMEMBRANCE_MODEL\n' +
    '     OLLAMA_URL (local librarian) · REMEMBRANCE_STATE_DIR · REMEMBRANCE_FIELD_URL (live field)\n',
  );
  process.exit(cmd ? 1 : 0);
}

main().catch((e) => { console.error('remembrance: ' + (e && e.message ? e.message : e)); process.exit(1); });
