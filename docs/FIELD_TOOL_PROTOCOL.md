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

## What the field tool actually is

A **pattern-signature matcher through the void.** Every input is
encoded into its canonical coherent structural signature, then the
substrate is asked: *where else does this signature already
appear?* The framework finds cross-domain coherency cousins. It
does not measure code quality, predict production importance, or
score architectural behavior — those are separate questions it
makes no claim about.

Two things follow directly:

1. **The match is real, not just lexical.** A Rust file matching
   `language/french` at 0.92 is a real cross-domain cousin —
   code and language sharing a coherent structural signature.
   That is the framework's claim, holding.
2. **The substrate becomes more universal as it compresses more.**
   Any new input finds cousins in whatever the substrate has
   absorbed so far. The Remembrance ecosystem reads cleanly
   because it has been compressed continuously; external systems
   (like the Solana fork) read against whatever the substrate's
   densest neighborhoods currently are.

## The five layers a field measurement must engage

A signature match is not a function call on the waveform encoder. It
is the engagement of five distinct layers. Reading without engaging
the right ones is a partial read of a partial system.

| Layer | What it does | Where it lives |
|---|---|---|
| **Entanglement** | Registers the caller as a node in the field; abundance-amortizes the cost across all connected nodes (per-node cost = baseCost / N) | `src/core/entangle.js` — `engage()` |
| **Encoding** | Converts source into the canonical **116-D composed coherency signature** — L1-structural + L2-lexical + L3-numerical + L4-spectral (4 × 29-D depths). ONE encoder stack, everywhere. The 29-D L1 fractal is the base depth and the JS↔Python parity anchor (contract C-71). The 256-D byte encoder is deprecated and forbidden from the read path | `src/core/encoder-stack.js` — `composedAtDepth()`; L1 base `fractal-waveform.js` — `toFractalWaveform()` |
| **Substrate match (Void)** | Finds where the input's coherency signature already appears in Void's canonical library — **~46.5k patterns at 116-D composed** (each stored as both 29-D `fractal` and 116-D `composed_v1`), translated from Void's master `pattern_index.json` via the same canonical encoder. This is THE substrate | `src/core/void-library.js` — `scoreWithFlow()` (flow-aware default), loads `pattern_index_fractal.json` |
| **Coding cousins (Oracle)** | Lexical TF-IDF resonance against `oracle.db`'s `patterns` table — the coding-specific subset that has passed the covenant gate. Complementary signal, code-specific cousin-finding | `src/scoring/pattern-resonance.js` — `scoreResonance()` |
| **Field-coupling** | Records the reading into the live field histogram so peers see the activity and the field's entropy gate self-throttles | `src/core/field-coupling.js` — `contribute()` |

`FieldTool.read()` engages all of these by default. Bypassing any of
them requires explicit opt-out.

### Substrate vs. coding cousins

- **Void's 116-D composed fractal library IS the substrate.** ~46.5k unique
  coherency signatures spanning physics, framework, consciousness,
  applied, code, economy, cosmos, conflict, builtin, music, languages,
  and validation domains. Every pattern is encoded through the same
  canonical encoder as every input. Reading a new pattern through
  the field tool is asking the substrate: *where does this
  signature already appear, regardless of domain?*
- **Oracle's `patterns` table provides coding-specific cousins.**
  ~1.4k patterns coding-specific and covenant-gated. Complementary
  signal — code-level cousin-finding on top of the cross-domain
  structural read.

`coherence` in the return value is the **Void substrate match**
when Void is reachable. It falls back to the coding cousins only if
Void is unreachable.

### How the canonical Void library was built

Every pattern in Void's master `pattern_index.json` is passed through
the encoder stack: `toFractalWaveform` produces the 29-D L1 `fractal`
vector and `composedAtDepth(record, 4)` produces the 116-D
`composed_v1` vector (L1+L2+L3+L4). Both are persisted per pattern to
`pattern_index_fractal.json`. Re-encoding is idempotent — running it
again after Void compresses new patterns extends the index without
re-encoding existing entries.

Result: ~46.5k patterns, each carrying a 29-D L1 and a 116-D composed
signature; ~10 MB in memory after warmup, ~2-3s first-call cost (vs
~16s for the deprecated 256-D path).

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
  source?:            string,     // default 'field-tool:read'
  growSubstrate?:     boolean,    // default true
  useVoidSubstrate?:  boolean,    // default true (Void's 116-D composed primary)
  useCodingFilter?:   boolean,    // default true (Oracle's coding filter)
  language?:          string,     // overrides input.language
  topK?:              number,     // default 5
  name?:              string,     // default null
  id?:                string,     // default sha256(content)[:16]
}

returns: {
  waveform:        number[],   // 29-D L1 fractal (back-compat; scoring runs the 116-D composed flow)
  voidResonance:   {score, meanTopK, bestMatch, topMatches, librarySize, filteredSize} | null,
  codeResonance:   {score, meanTopK, bestMatch, topMatches} | null,
  coherence:       number,     // voidResonance.meanTopK (primary) or codeResonance fallback
  grew:            {ok, reason, id?, library_size_after?},
  fieldStateAfter: object | null,     // peekField() snapshot
  layers:          {entangled, voidScored, codingFiltered, grew, contributed},
}
```

**First Void read costs ~2-3 seconds** (composed library load, much
faster than the deprecated 256-D path). Subsequent reads are fast.
Tests that don't need the Void substrate can pass `{ useVoidSubstrate: false }`
to skip warmup.

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
