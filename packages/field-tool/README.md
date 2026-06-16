# @crackedcoder5th/remembrance-field

The **Remembrance Field tool** as a tiny, zero-dependency npm package. It works
**standalone**, and — when pointed at **your Void compressor** — uses your
collected substrate (the 77k+ pattern library) to score with real resonance
and to (with your consent) contribute new patterns to the canonical library.

This package ships the **L1 structural encoder** — `toWaveform` produces a
29-D structural vector in the ecosystem's fractal language (atomic
properties + structural histograms + structurality), the JS↔Python parity
anchor (contract C-71, blueprint for Void's `to_fractal_waveform.py`), with
a `coherency` cosine gated by structurality agreement so code-vs-prose is
correctly damped. Algorithm spec: `docs/FRACTAL_WAVEFORM_SPEC.md` in the
oracle toolkit.

The **canonical read** in the full system is the **116-D composed stack** —
L1-structural + L2-lexical + L3-numerical + L4-spectral (4 × 29-D depths),
scored flow-aware across depths. This package bundles only L1; its index
(`fractal-index.js`) accepts 116-D composed vectors for full-depth queries,
but the L2/L3/L4 encoders live in the oracle core
(`src/core/encoder-stack.js`), not here.

The legacy 256-D byte-stretch encoder is still exported under
`byteToWaveform`/`byteCoherency` for binary or non-text inputs, and
remains byte-identical to Void's `to_waveform.py` (contracts C-49/C-50)
for cross-language callers that need raw-byte parity.

## Install

```bash
npm install @crackedcoder5th/remembrance-field        # library
npm install -g @crackedcoder5th/remembrance-field     # CLI
npx @crackedcoder5th/remembrance-field coherency "hello" "hullo"
```

Requires Node >= 18 (built-in `fetch`). No other dependencies.

## Standalone — works with no network

```js
const { toWaveform, coherency, coherencyOf, DIM } = require('@crackedcoder5th/remembrance-field');

toWaveform('function add(a, b) { return a + b; }');     // Float64Array(DIM=29), [0,1]
coherencyOf('function add(a,b){return a+b}', 'def add(a, b): return a + b'); // ~0.91 — fractal sees structural kinship across languages

// Diagnostic — inspect the named dimensions:
const { inspectFractalWaveform } = require('@crackedcoder5th/remembrance-field');
inspectFractalWaveform('function add(a,b){return a+b}').structurality;  // ≈ 1 (code)

// Legacy byte-stretch (binary / non-text inputs only):
const { byteToWaveform, byteCoherency } = require('@crackedcoder5th/remembrance-field');
byteToWaveform(buffer.toString('utf8'));                // Float64Array(256), [0,1]
```

```bash
remembrance-field encode "some text"      # dim=29 mean=… energy=…
remembrance-field coherency "a" "b"       # 0.xxxxxx   (inputs may be @file)
```

## Connected — enhanced by your Void compressor

Point the tool at your running Void instance and it uses your collected data
for accuracy instead of a bare pairwise cosine. Everything degrades gracefully
when Void is offline.

```bash
export REMEMBRANCE_VOID_URL=http://127.0.0.1:8080   # your Void api.py
export REMEMBRANCE_AGENT_ID=my-agent-v1             # stable submitter id

remembrance-field score @mypattern.js               # substrate-backed coherence
```

```js
const { VoidClient } = require('@crackedcoder5th/remembrance-field');
const void_ = new VoidClient();                       // REMEMBRANCE_VOID_URL or 127.0.0.1:8080
const r = await void_.coherence('some code');         // { ok, body:{ coherence, ... } }
```

### Contributing a pattern — always asks first

`submit` scores your pattern against the substrate, then **asks whether you
want to add it to the canonical pattern library**. Nothing is contributed
unless you say yes (the default is **no**, and a non-interactive shell never
contributes unless you pass `--yes`).

```bash
remembrance-field submit @mypattern.js --name debounce-timeout --language javascript
# Pattern "debounce-timeout" — 412 chars, substrate coherence 0.83
# Add this pattern to the canonical pattern library? [y/N]
```

Flags: `--yes`/`-y` (contribute without prompting), `--no` (never), `--language`,
`--tags a,b`, `--description "…"`. Submissions go to Void's public
`POST /patterns/submit` and return an accept/reject decision, coherence, and tier.

## The Field (shared conserved scalar)

```bash
remembrance-field contribute --coherence 0.91 --source my-app
```

```js
const { Field } = require('@crackedcoder5th/remembrance-field');
await new Field().contribute({ coherence: 0.91, source: 'my-app' }); // best-effort, never throws
```

## Connect to your ecosystem

By default everything runs against `localhost`. To use **your** hosted services
(e.g. the field on Railway, your Void compressor), set these where the tool runs
— your app's `.env`, your shell, or CI secrets. Copy [`.env.example`](./.env.example)
to `.env` and fill in:

```bash
# Hosted Living Remembrance Engine (the oracle field-server)
REMEMBRANCE_FIELD_URL=https://<your-host>/mcp
REMEMBRANCE_FIELD_TOKEN=<your FIELD_TOKEN>
# Your Void compressor / data hub
REMEMBRANCE_VOID_URL=https://<your-void-host>
REMEMBRANCE_AGENT_ID=<your-stable-agent-id>     # only needed to submit patterns
```

What each unlocks:
- **`REMEMBRANCE_FIELD_URL` (+ `_TOKEN`)** → `Field.contribute()` / `contribute` feed your shared field.
- **`REMEMBRANCE_VOID_URL`** → `score` / `VoidClient.coherence()` use your collected substrate (real resonance, not a bare cosine).
- **`REMEMBRANCE_AGENT_ID`** → stamped on `submit` (consent-gated pattern contributions).

`encode` / `coherency` / `coherencyOf` always work **offline** regardless — the
connection only adds the substrate-backed and field features.

## Environment

| Var | Purpose | Default |
|---|---|---|
| `REMEMBRANCE_VOID_URL` | your Void compressor (scoring + submission) | `http://127.0.0.1:8080` |
| `REMEMBRANCE_AGENT_ID` | stable id stamped on pattern submissions | (required to submit) |
| `REMEMBRANCE_FIELD_URL` | field endpoint for `contribute` | `http://127.0.0.1:7787/mcp` |
| `REMEMBRANCE_FIELD_TOKEN` | field bearer token (https/loopback only) | — |

## License

MIT
