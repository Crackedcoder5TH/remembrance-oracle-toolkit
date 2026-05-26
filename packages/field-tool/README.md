# remembrance-field

The **Remembrance Field tool** as a tiny, zero-dependency npm package: the
canonical 256-D waveform encoder, cosine **coherency** ("do these mean the
same thing?"), and a best-effort client for the shared **Remembrance Field**.

The encoder is byte-identical to Void's `to_waveform.py` and the oracle
toolkit's `code-to-waveform.js` (cross-language parity contracts C-49/C-50),
so a string encodes to the same waveform in Python, JS, and here.

## Install

```bash
npm install remembrance-field        # library
npm install -g remembrance-field     # CLI
# or run without installing:
npx remembrance-field coherency "hello" "hullo"
```

Requires Node >= 18 (uses the built-in `fetch`). No other dependencies.

## Library

```js
const { toWaveform, coherency, coherencyOf, Field } = require('remembrance-field');

const wf = toWaveform('function add(a, b) { return a + b; }'); // Float64Array(256), values in [0,1]

// "do these mean the same thing?" — cosine in [0,1]
const score = coherencyOf(
  'function add(a, b) { return a + b; }',
  'def add(a, b):\n    return a + b'
);

// contribute a reading to a running Remembrance Field (best-effort, never throws)
const field = new Field(); // http://127.0.0.1:7787/mcp by default
const res = await field.contribute({ coherence: score, source: 'my-app:compare' });
```

### API

| Export | Description |
|---|---|
| `toWaveform(text) -> Float64Array(256)` | Encode any text into the native 256-D waveform (`[0,1]`). |
| `coherency(a, b) -> number` | Cosine similarity of two waveforms (`[-1,1]`, `0` if either is empty). |
| `coherencyOf(textA, textB) -> number` | Convenience: encode both, then `coherency`. |
| `new Field({ url?, token?, timeoutMs? })` | Field client. Defaults from `REMEMBRANCE_FIELD_URL` / `REMEMBRANCE_FIELD_TOKEN`. |
| `field.contribute({ coherence, source, cost? })` | Contribute one observation. Best-effort: returns a result object, never throws. |
| `field.call(action, args)` | Low-level call to the field tool for any supported action. |

## CLI

```bash
remembrance-field encode "some text"          # -> dim=256 mean=… energy=…
remembrance-field encode @file.js --json      # -> full 256-number array
remembrance-field coherency "a" "b"           # -> 0.xxxxxx
remembrance-field coherency @a.js @b.py        # inputs may be @file
remembrance-field contribute --coherence 0.91 --source my-app --cost 1
```

Inputs are literal strings, or `@path` to read a file.

## The Field

`contribute` posts a JSON-RPC `tools/call` to the field endpoint's `field`
tool (`action: "contribute"`), the same contract every Remembrance producer
uses. With no field running, `contribute` simply returns `{ ok: false }` —
the coherency math above works fully offline regardless.

Environment:

- `REMEMBRANCE_FIELD_URL` — field endpoint (default `http://127.0.0.1:7787/mcp`)
- `REMEMBRANCE_FIELD_TOKEN` — bearer token (sent only to https or loopback hosts)

## License

MIT
