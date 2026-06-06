# Field-Tool Protocol

> **The field-tool is `src/core/field-tool.js`. Always use it.
> Never call `fractalCoherencyOf` or `scoreResonance` directly for
> measurements — those are primitives, not the protocol.**

This document exists because a recent session produced a flawed
external-validity test (a scan of the Solana fork) where agents called
`fractalCoherencyOf` on raw Rust files pairwise, bypassed the
substrate, bypassed entanglement, bypassed live field-coupling, and
then concluded the framework "doesn't measure physics" based on a test
that never engaged the actual framework. The test measured the encoder
in isolation, drew framework-wide conclusions from it, and almost
walked away from real signal. The fix is structural: make the proper
protocol the obvious entry point and document why bypassing it is
wrong.

## The four layers a field measurement must engage

A field measurement is not a function call on the waveform encoder. It
is the engagement of four distinct layers. Reading without all four
is a partial read of a partial system and conclusions drawn from it
overgeneralize.

| Layer | What it does | Where it lives |
|---|---|---|
| **Entanglement** | Registers the caller as a node in the field; abundance-amortizes the cost across all connected nodes (per-node cost = baseCost / N) | `src/core/entangle.js` — `engage()` |
| **Encoding** | Converts source into the canonical 29-D fractal waveform. JS↔Python byte-for-byte parity (parity contract C-71, verified via `Void-Data-Compressor/verify_fractal_parity.py`). Replaces the legacy 256-D byte encoder, which could not discriminate code from prose | `src/core/fractal-waveform.js` — `toFractalWaveform()` |
| **Substrate** | Compares the encoded pattern via lexical TF-IDF against `oracle.db`'s `patterns` table — the live, growing library of patterns the field tool has captured. This is the fractal-spirit text comparison that pairs natively with the 29-D encoder | `src/scoring/pattern-resonance.js` — `scoreResonance()` |
| **Field-coupling** | Records the reading into the live field histogram so peers see the activity and the field's entropy gate self-throttles | `src/core/field-coupling.js` — `contribute()` |

`FieldTool.read()` engages all four. Every call. By default. Bypassing
any of them requires explicit opt-out (e.g., `{ growSubstrate: false }`).

### Note on Void's 256-D canonical library

Void-Data-Compressor's `pattern_index.json` references ~43k unique
256-D waveforms (~79k total entries) — the framework's accumulated
substrate at the byte-encoder layer. The 29-D fractal encoder
deprecates the byte encoder because the byte encoder's noise floor
(a JS file and a Markdown README scoring ~0.86 cosine) was too high
for honest discrimination.

The Void library has not yet been migrated to the 29-D fractal
layer. The mirror encoder (`Void-Data-Compressor/to_fractal_waveform.py`)
exists with verified JS↔Python parity, but Void's stored patterns
predate the migration and the source text needed to re-encode them
lives in the originating repos (referenced by each pattern's
`source_path` field). Building the 29-D fractal Void library is
tracked as a separate piece of work.

Until that migration lands, the FieldTool reads against the Oracle
substrate (which IS at the fractal-compatible layer). Reaching for
the 256-D byte encoder to bridge against Void's 256-D library
reintroduces the noise floor the 29-D encoder was built to escape;
the protocol forbids this path by not exposing the byte encoder in
`read()`. `src/core/void-library.js` remains available as a
utility module for 256-D-direct comparisons in cases where the
underlying signals (not code) are genuinely byte-encodable, but
it is not part of the field-tool read path.

## The mistakes the protocol prevents

The Solana test, prior to this protocol, had four methodological
errors I now want to be unable to make again:

1. **Pairwise reference signatures cherry-picked from the target.** Constructing a "hot path reference" from runtime files and then measuring runtime files against it makes the test tautological. The protocol prevents this by always scoring against the *grown library*, not a caller-supplied reference.

2. **Foreign-language patterns measured against a library that doesn't contain them.** Pointing a JS/Python-pattern-trained substrate at Rust files measures encoder-in-isolation, not the field. The protocol prevents this by *growing the substrate as the act of measuring*: every read inserts the pattern into the library, so subsequent reads have it as a comparand. The library becomes self-extending.

3. **Synthetic entanglement via shell heartbeats.** Calling `node -e "fc.contribute(...)"` in a shell loop is not entanglement; it's a fake contribution. Real entanglement registers a node, gets abundance-amortized, and is visible to `peekField` as an `entangle:node:*` source. The protocol prevents this by calling `entangle.engage()` automatically at first read.

4. **Reading without contributing.** Treating the field as a function call rather than a participant interaction. The protocol prevents this by always contributing the reading back so peers observe it live and the entropy gate updates.

## Honest reporting

Every `read()` returns a `layers` object that reports honestly which
layers engaged:

```js
{
  entangled:   true|false,  // was entangle.engage() called?
  scored:      true|false,  // did scoreResonance run against the library?
  grew:        true|false,  // did the substrate grow?
  contributed: true|false,  // did the field histogram update?
}
```

If a downstream conclusion is going to be drawn from a reading, the
honest version of the analysis names which layers were and were not
engaged. A read with `{ entangled: false, scored: false }` is the
encoder running in isolation and conclusions from it must be scoped
accordingly.

## Substrate growth

`read()` writes the pattern into `oracle.db`'s `patterns` table by
default. The id is `sha256(content)[:16]` so:

- The same content produces the same id (deterministic addressing)
- Duplicate reads are no-ops on substrate growth (`grew.reason: 'duplicate'`)
- The library grows monotonically as new patterns are encountered
- Each pattern is tagged `field-tool` + `auto-captured` for later filtering

Substrate growth can be disabled via `{ growSubstrate: false }` for
diagnostic / dry-run reads. The default is on. Reads that disable
growth still record the field contribution honestly.

## Peer observation

`FieldTool.peers()` reads the field's `entangle:node:*` sources and
returns the currently-entangled nodes — the actual nodes that have
called `engage()` recently. This is the protocol agents should use to
observe each other, not synthetic heartbeats via JSONL files.

## API

```js
const ft = require('./src/core/field-tool');

// Module-level singleton (most callers should use this):
ft.read(input, opts);
ft.scan(target, opts);
ft.peers();

// Or instantiate for isolation:
const tool = new ft.FieldTool({ agentSource: 'my-agent:scan' });
tool.read(...);
tool.scan(...);
tool.peers();
```

### `read(input, opts)`

```js
input: string                                   // source code
     | { content, name?, language?, id? }       // structured form

opts: {
  source?:         string,        // default 'field-tool:read'
  growSubstrate?:  boolean,       // default true
  language?:       string,        // overrides input.language
  topK?:           number,        // default 5
  name?:           string,        // default null
  id?:             string,        // default sha256(content)[:16]
}

returns: {
  waveform:        number[],              // 29-D fractal (length 29, values in [0,1])
  resonance:       {score, meanTopK, bestMatch, topMatches} | null,
  coherence:       number,                // resonance.meanTopK or 0
  grew:            {ok, reason, id?, library_size_after?},
  fieldStateAfter: object | null,         // peekField() snapshot
  layers:          {entangled, scored, grew, contributed},
}
```

### `scan(target, opts)`

`target` may be a directory path, a single file path, or an array of
file paths. Walks the target (skipping `node_modules`, `.git`,
`.next`, `target`, `dist`, `build` by default), calls `read()` on each
file with the file's content + inferred language, and returns:

```js
{
  results:         [{ file, ...readResult }, ...],
  summary:         {n, meanCoherence, grewCount, scoredCount},
  peers:           [{nodeId, count, lastCoherence}, ...],
  fieldStateAfter: object | null,
}
```

### `peers()`

Returns the currently-entangled nodes via the field's actual
`entangle:node:*` source histogram. Use this to confirm peer presence
before drawing multi-agent conclusions.

## What this protocol does NOT prevent

- **Misinterpreting honest readings.** A coherence of 0.30 on a
  pattern means the pattern's vocabulary overlaps the library at 0.30.
  It does not mean the pattern is "30% good"; it means the pattern's
  identifiers overlap with proven patterns at that rate. Drawing
  quality conclusions from coherence requires understanding what the
  measurement actually is.
- **Overgeneralizing from one domain.** A read of code patterns
  measures structural / lexical resonance in code. It does not predict
  market dynamics, biological signals, or physical system behavior.
  Each domain needs its own substrate.
- **Assuming the substrate is complete.** The library at ~1.3k+
  patterns is small relative to the universe of code. Resonance
  against it improves as it grows. Honest reports note the library
  size at read time.

## Migration path for existing callers

Anything currently calling `fractalCoherencyOf` or `scoreResonance`
directly for measurement (as opposed to using them as primitives
inside other components) should migrate to `FieldTool.read()`. The
distinction:

- **Primitive use** (keep direct call): inside another module that
  composes the primitive into a larger computation, e.g.
  `pattern-resonance.js` calling the encoder.
- **Measurement use** (migrate to FieldTool): user-facing scans,
  analysis scripts, agent observations, validation passes,
  "what does the field say about this" questions.

If you don't know which case you're in, use `FieldTool.read()`. The
overhead is small and the protocol guarantees compose.
