# Remembrance — a deterministic telescope into the shape of information

**A zero-dependency instrument that reads the *structure* of anything —
code, prose, DNA, music, time-series — as a signature, and measures how
things resemble each other. Same input, same output, forever. No model,
no API, no training. Just math you can read.**

```bash
npx @crackedcoder5th/remembrance-field demo
```

Runs in ~2 seconds, offline. That's the whole pitch: **don't trust it —
run it.**

---

## Why this might be worth 30 seconds of your time

Everyone measuring "how similar are two things" reaches for a neural
embedding — which needs a vendor, a model version, a GPU, and gives a
*different* answer every model release. This is the opposite: a small,
deterministic, fully-inspectable encoder that turns any input into a
145-dimensional signature by reading its structure across five layers
(shape, style, numerical character, spectral character, redundancy).

The natural objection is *"sure, but that's just YOUR instrument seeing
what it wants."* So the first demo answers exactly that.

### 1. The structure is real — not just this instrument

```bash
npx @crackedcoder5th/remembrance-field demo convergence
```

Three instruments built on **completely unrelated principles** —
this tool's hand-designed encoder, **gzip** compression distance
(an approximation of Kolmogorov complexity), and raw **character
trigram** statistics — read the same 60-item corpus and agree, far
above chance, about what resembles what:

```
  fractal <-> gzip      rho = 0.43
  fractal <-> trigram   rho = 0.71
  domain purity:  fractal 0.97 . gzip 0.98 . trigram 1.00   (chance 0.17)
```

(The full 46,000-pattern run reaches rho ~ 0.73 — this demo is a small
self-contained slice.) When a hand-built encoder, a compressor, and a
character-counter *agree* on the neighborhood structure of a corpus,
the structure is in the **data**, not the telescope. That's the whole
foundation: this measures something real.

### 2. It reads biological function from shape alone

```bash
npx @crackedcoder5th/remembrance-field demo dna
```

Four DNA sequence families, encoded by structure only. Repetitive
"satellite" DNA clusters (0.96) and separates from coding DNA (0.88) —
**repetitiveness is the encoder's first axis for DNA, which is exactly
the axis molecular biology uses first.** (In the full run, coding DNA's
nearest cross-domain neighbor is *dolphin echolocation clicks* —
structured biological signal next to structured biological signal.)

### 3. Encode your own input

```bash
npx @crackedcoder5th/remembrance-field demo self "your code or text here"
```

See its 145-D signature and its nearest kin. Run it twice — identical
numbers. That determinism is the point.

---

## Use it as a library

```js
const { composed, composedCosine } = require('@crackedcoder5th/remembrance-field');

const a = composed('function debounce(fn, ms) { /* ... */ }');
const b = composed('function throttle(fn, ms) { /* ... */ }');
composedCosine(a, b);   // -> ~0.9, deterministic, forever
```

Or the in-memory search index over your own corpus:

```js
const { FractalIndex } = require('@crackedcoder5th/remembrance-field');
const idx = new FractalIndex();
idx.loadSignatures(mySignatures);      // [{ id, vec }]
idx.searchVec(composed(query), { topK: 5 });
```

---

## What it's for

- **Provenance & drift** — fingerprint any artifact deterministically;
  re-fingerprint later; detect when its *character* has changed. The
  determinism is the moat: neural embeddings can't give reproducible,
  attestable signatures across model versions. This can.
- **Structural search** — "find things shaped like this" over code,
  contracts, sequences, signals — one operation, every domain.
- **Classification without training** — the signature's geometry
  separates pattern classes (e.g. accumulation vs circulation) with
  no labels, because the geometry corresponds to real dynamics.

## What it is not

Not a topic/semantic model — it reads **structure and dynamics**, not
meaning. Two prose passages on different subjects can look similar; two
programs doing the same thing in different styles look different. That's
a feature (it sees form), and it's why topical search blends this with
keywords. Know which question you're asking.

---

## Design

- **Zero dependencies.** Pure JavaScript + the Node standard library.
  Runs anywhere Node runs; nothing phones home.
- **Deterministic.** Same input -> byte-identical 145-D vector. Two
  independent reference implementations produce identical signatures
  across thousands of adversarial inputs (parity gate in `test/`).
- **Inspectable.** Every one of the 145 dimensions is a named, readable
  quantity. Read `src/compose.js` and `src/*-waveform.js` — the whole
  instrument is a few hundred lines of arithmetic. No black box.

## Connected mode (optional)

Standalone needs nothing. Pointed at a running Void compressor or
field-server (env: `REMEMBRANCE_VOID_URL`, `REMEMBRANCE_FIELD_URL`), the
CLI also does substrate-backed scoring, TF-IDF resonance, covenant
safety checks, sandboxed verification, and field contribution — run
`remembrance-field help` for the full command set.

Part of the [Remembrance ecosystem](https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit).
The full 5-layer stack, the 46k-pattern substrate, and the research
runs (DNA-by-function, musical-history recovery, four-telescope
convergence, self-reflective field dynamics) live in the parent repo's
`scripts/` and `docs/` — every finding a committed, re-runnable script.

MIT.
