# Fractal Waveform — Cross-Language Blueprint

**Status:** spec v0.1. Reference implementation:
[`packages/field-tool/src/fractal-waveform.js`](../packages/field-tool/src/fractal-waveform.js).
Mirror target: `Void-Data-Compressor/to_fractal_waveform.py` (to be implemented).

## Why this exists

The canonical byte-stretch encoder (`to_waveform.py` / `waveform.js`, pinned
by Void contracts C-49/C-50) UTF-8-encodes the input, linearly interpolates
the byte values to 256 samples, then min-max normalizes. It is intentionally
language-agnostic — *any* input becomes a 256-D vector and the same cosine
math applies. That universality is the design.

The cost is empirical: two JS source files and a markdown README with
similar bytes-per-line distributions all produce similar-looking waveforms,
so cosine `coherency` cannot reliably tell code from prose. Measured on
`packages/field-tool/`:

| pair                       | byte-stretch | fractal (this spec) |
|---                         |---           |---                  |
| `field.js` vs `cli.js`     | 0.83         | **0.92**            |
| `field.js` vs `README.md`  | 0.86         | **0.40**            |
| `field.js` vs prose×8      | 0.84         | **0.46**            |

The fractal encoder solves the discrimination problem by encoding the
**structure** of the input in the ecosystem's existing **fractal language**
(atomic properties from `extractAtomicProperties` + structural histograms),
instead of the input's byte stream. It coexists with the byte-stretch — both
remain available; consumers pick based on intent.

## Algorithm — what every language MUST produce

`to_fractal_waveform(text)` returns a length-29 float64 vector where every
dimension has a NAMED structural meaning. Empty input → all zeros.

### Dimension layout

| index | name              | range  | derivation                                                                           |
|---    |---                |---     |---                                                                                   |
| 0     | charge            | [0,1]  | `(charge + 1) / 2` where charge ∈ {-1,0,1} from expansions vs contractions of structure |
| 1     | valence           | [0,1]  | `min(8, importCount) / 8`                                                            |
| 2     | mass              | [0,1]  | size+depth bucket: light=0.25, medium=0.5, heavy=0.75                                |
| 3     | spin              | {0,1}  | even=0 (pure), odd=1 (any side effect)                                               |
| 4     | phase             | [0,1]  | state of mutability: solid=0.2, liquid=0.45, gas=0.7, plasma=0.95                    |
| 5     | reactivity        | [0,1]  | I/O density: inert=0, low=0.33, medium=0.67, high=1                                  |
| 6     | electronegativity | [0,1]  | `imports / (imports + exports)`                                                      |
| 7     | group             | [0,1]  | periodic-table column / 18                                                           |
| 8     | period            | [0,1]  | periodic-table row / 7 (size-based)                                                  |
| 9     | safety            | [0,1]  | inverted harmPotential: none=1, minimal=0.75, moderate=0.4, dangerous=0              |
| 10    | alignment         | [0,1]  | healing=1, neutral=0.5, degrading=0                                                  |
| 11    | intention         | [0,1]  | benevolent=1, neutral=0.5, malevolent=0                                              |
| 12-16 | depth_l0..l4plus  | [0,1]  | fraction of lines at indent depth 0,1,2,3,≥4                                         |
| 17    | keywords          | [0,1]  | keyword characters / total characters                                                |
| 18    | identifiers       | [0,1]  | identifier characters / total characters                                             |
| 19    | strings           | [0,1]  | string-literal characters / total characters                                         |
| 20    | numbers           | [0,1]  | number-literal characters / total characters                                         |
| 21    | operators         | [0,1]  | operator characters / total characters                                               |
| 22    | branches          | [0,1]  | `min(1, ifElseSwitchTernary_per_line × 10)`                                          |
| 23    | loops             | [0,1]  | `min(1, forWhileForeachMap_per_line × 10)`                                           |
| 24    | functions         | [0,1]  | `min(1, functionDeclarations_per_line × 10)`                                         |
| 25    | returns           | [0,1]  | `min(1, returnYield_per_line × 10)`                                                  |
| 26    | errors            | [0,1]  | `min(1, tryCatchThrowRaiseExcept_per_line × 10)`                                     |
| 27    | comments          | [0,1]  | comment characters / total characters                                                |
| 28    | structurality     | [0,1]  | fraction of non-blank lines containing a code token (keyword OR brace/paren/semi/=)  |

### `fractal_coherency(a, b)`

```
cos = dot(a,b) / (||a|| * ||b||)
gate = 1 - |a[28] - b[28]|        # structurality-agreement
return cos * gate
```

The gate damps the cosine when one input is structural (code) and the
other is unstructured (prose), independent of how many surface-word dims
happen to agree. Self-similarity is preserved: `Δstructurality = 0 → gate = 1`.

## Cross-language parity contract (proposed C-71)

Both languages MUST produce identical vectors for identical input:

- **Atomic dims (0-11)** come from `extractAtomicProperties`
  (JS: `src/atomic/property-extractor.js`; Python: `atomic_substrate_generator.py`).
  The regex banks may differ to suit each language's idioms, but the OUTPUT
  schema is fixed. Parity is at the bucketed/normalized layer, not the
  per-language regex.
- **Structural dims (12-27)** must be computed identically — same depth
  binning, same multi-language regex bank for token classes and control
  flow. The JS reference contains the full pattern bank; Python copies it.
- **Structurality (28)** uses the same regex.
- **`fractal_coherency`** is the same one-line formula.

A `verify_capabilities.py` test SHOULD pin three reference vectors:
- the fractal vector for `to_waveform.py` itself
- the fractal vector for a 200-word prose paragraph
- the cross-coherency between them — must agree to 6 decimals across JS & Python.

## Why this is "native" to the ecosystem

- **Native dimensionality:** 29 dims that each *mean something* (charge,
  valence, branches density, etc.). Not 256 byte positions.
- **Native language:** the dims are the same vocabulary the oracle already
  speaks — `decodeSignature` returns these exact field names, the periodic-
  table-of-code coordinates anchor `group` and `period`, and the field
  ledger already carries `oracle:property-extractor:extractAtomicProperties`
  contributions as one of its highest-volume sources.
- **Noise vs signal:** the structurality dim is itself the signal/noise
  measurement, and the coherency gate uses it to refuse over-claim of
  similarity between heterogeneous inputs.

## What this does NOT replace

- The byte-stretch encoder remains for universal input (binary blobs,
  arbitrary bytes, any-language any-format strings). Contracts C-49/C-50
  are untouched.
- The fractal encoder is the structural reading for *actual code or
  text-as-structure*; it is callable alongside the byte-stretch via the
  same package.

## Implementation checklist

- [x] `packages/field-tool/src/fractal-waveform.js` (JS reference)
- [x] `packages/field-tool/test/fractal-waveform.test.js` (discrimination tests pass)
- [x] Exposed via `packages/field-tool/src/index.js` (additive)
- [ ] `Void-Data-Compressor/to_fractal_waveform.py` (Python mirror)
- [ ] `Void-Data-Compressor/verify_capabilities.py` adds C-71 (parity test)
- [ ] Field tool CLI: `remembrance-field fractal-encode <text|@file>` and
      `remembrance-field fractal-coherency <a> <b>` subcommands (opt-in,
      doesn't change the existing `encode`/`coherency` semantics)
