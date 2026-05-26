# @crackedcoder5th/remembrance-field

The **Remembrance Field tool** as a tiny, zero-dependency npm package. It works
**standalone**, and — when pointed at **your Void compressor** — uses your
collected substrate (the 77k+ pattern library) to score with real resonance
and to (with your consent) contribute new patterns to the canonical library.

The encoder is byte-identical to Void's `to_waveform.py` and the oracle
toolkit's `code-to-waveform.js` (parity contracts C-49/C-50), so a string
encodes to the same waveform in Python, JS, and here.

## Install

```bash
npm install @crackedcoder5th/remembrance-field        # library
npm install -g @crackedcoder5th/remembrance-field     # CLI
npx @crackedcoder5th/remembrance-field coherency "hello" "hullo"
```

Requires Node >= 18 (built-in `fetch`). No other dependencies.

## Standalone — works with no network

```js
const { toWaveform, coherency, coherencyOf } = require('@crackedcoder5th/remembrance-field');

toWaveform('function add(a, b) { return a + b; }');     // Float64Array(256), [0,1]
coherencyOf('function add(a,b){return a+b}', 'def add(a, b): return a + b'); // cosine in [0,1]
```

```bash
remembrance-field encode "some text"      # dim=256 mean=… energy=…
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

## Environment

| Var | Purpose | Default |
|---|---|---|
| `REMEMBRANCE_VOID_URL` | your Void compressor (scoring + submission) | `http://127.0.0.1:8080` |
| `REMEMBRANCE_AGENT_ID` | stable id stamped on pattern submissions | (required to submit) |
| `REMEMBRANCE_FIELD_URL` | field endpoint for `contribute` | `http://127.0.0.1:7787/mcp` |
| `REMEMBRANCE_FIELD_TOKEN` | field bearer token (https/loopback only) | — |

## License

MIT
