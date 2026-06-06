# Test Template Audit — Bucket D

**Agent:** Delta
**Branch:** `claude/audit-remembrance-ecosystem-xaaUr`
**Date:** 2026-06-06
**Bucket:** D — 212 near-duplicate test pairs in `patterns/batch*` and top-level `patterns/`

## Question

The website-coherency audit flagged 212 test-file pairs clustering at >= 0.999
similarity. Are these:

- (a) template-generated stubs that all do the same trivial check, or
- (b) actually-distinct tests that just share scaffold/signature shape?

## Investigation

Sampled 9 files across all three clusters via the field-tool protocol:

### Cluster 1 — `patterns/batch5/*-sort.test.js`

| File | Tests | Assertions distinct? |
|---|---|---|
| `bubble-sort.test.js` | 5 cases | Sorts, no-mutate, already-sorted, empty, negatives |
| `insertion-sort.test.js` | 5 cases | Sorts, no-mutate, already-sorted, empty, **duplicates** |
| `quick-sort.test.js` | 6 cases | Sorts, no-mutate, already-sorted, empty, duplicates, negatives |

Each test file calls a different function (`bubbleSort` vs `insertionSort` vs
`quickSort`). The corresponding source files
(`bubble-sort.js`, `insertion-sort.js`, `quick-sort.js`) implement
genuinely-distinct algorithms: O(n^2) bubble vs O(n^2) insertion vs O(n log n)
partitioning quicksort. The tests share input vectors `[5, 3, 8, 1, 2]` and
the no-mutate invariant — that is by design (a sort is a sort), not by
template laziness.

### Cluster 2 — `patterns/batch6/is-*.test.js`

| File | Tests | Behavior under test |
|---|---|---|
| `is-ipv4.test.js` | 4 cases | Octet-range validation, leading-zero rejection, 4-part split |
| `is-ipv6.test.js` | 4 cases | `::` shorthand, double-`::` rejection, 8-group required |
| `is-semver.test.js` | 5 cases | Major.minor.patch + pre-release + build metadata + leading-zero reject |

Each test uses domain-specific inputs (`'192.168.1.1'`, `'2001:db8::1'`,
`'1.0.0-alpha+001'`). The assertions cover format rules unique to each
validator. Source files implement distinct regex/parsing logic per validator.

### Cluster 3 — top-level `patterns/*.test.js`

| File | Tests | Behavior under test |
|---|---|---|
| `api-helpers.test.js` | 5 cases | `AbortController`, JSON serialization, URL prefix |
| `breadcrumb-nav.test.js` | 4 cases | Trail building, fallback labels, ARIA labels |
| `trust/security-headers.test.js` | 6 cases | HSTS, X-Frame-Options, CSP directives, custom options |

`api-helpers.test.js` IS thinner than the others (assertions like
`assert.ok(url.startsWith('/api/'))` are smoke-checks, not behavioral). But
even there, the test set differs by function under test.

## Verdict

**(b) — actually-distinct tests sharing scaffold shape.**

The 0.999+ similarity signal is driven by:

1. Shared two-line preamble (`require('node:test')`, `require('node:assert/strict')`).
2. Consistent `describe(<name>, () => { it(...) })` skeleton.
3. Repeated input vectors across the sort cluster (intentional — same
   sorting contract).

The assertions, function names, and input domains differ meaningfully. This
is a **convergence in test-scaffold style**, not template-stub duplication.

## Recommendation

**LEAVE-AS-IS.** Do NOT consolidate into a shared per-pattern template.
Rationale:

- Per-file tests are readable: a contributor opening `is-ipv4.test.js`
  immediately sees the IPv4 rules being tested.
- A shared `runValidatorContract(fn, cases)` macro would hide the
  per-validator inputs behind an indirection layer, harming
  discoverability for marginal LOC savings.
- The signal is a false positive of similarity-by-scaffold, not by
  semantic redundancy.

## Optional follow-up (not done here)

- `patterns/api-helpers.test.js` is a candidate to strengthen — its
  assertions (`assert.ok(url.startsWith('/api/'))`) test JS primitives, not
  the helper module itself. Worth fleshing out in a follow-up PR but
  out of scope for this audit (constraint: "do not delete or refactor any
  tests").

## Files inspected

- `digital-cathedral/patterns/batch5/bubble-sort.test.js` + `bubble-sort.js`
- `digital-cathedral/patterns/batch5/insertion-sort.test.js` + `insertion-sort.js`
- `digital-cathedral/patterns/batch5/quick-sort.test.js` + `quick-sort.js`
- `digital-cathedral/patterns/batch6/is-ipv4.test.js` + `is-ipv4.js`
- `digital-cathedral/patterns/batch6/is-ipv6.test.js` + `is-ipv6.js`
- `digital-cathedral/patterns/batch6/is-semver.test.js`
- `digital-cathedral/patterns/api-helpers.test.js`
- `digital-cathedral/patterns/breadcrumb-nav.test.js`
- `digital-cathedral/patterns/trust/security-headers.test.js`

# Bucket E — Category-Orphan Triage

9 files flagged as having no in-website cousin (matched only to
cross-repo files in solana/, oracle/, claw/).

| File | Cross-repo match | Verdict | Reason |
|---|---|---|---|
| `digital-cathedral/README.md` | `solana/docs/proposals/block-confirmation.md` @ 0.993 | **ORPHAN-LEGITIMATE** | Valor Legacies project README — unique to this app. 0.993 is README-shape collision (markdown headings + stack list). |
| `digital-cathedral/csp-directives.mjs` | `solana/multinode-demo/faucet.sh` @ 0.957 | **ORPHAN-LEGITIMATE** | CSP source-of-truth for next.config + middleware. Match score is spurious (a shell script and a JS array share zero domain semantics). |
| `digital-cathedral/tailwind.config.js` | `solana/docs/sidebars.js` @ 0.988 | **ORPHAN-LEGITIMATE** | Active Tailwind config consumed by Next.js build. Match is config-shape collision (both are CJS module.exports objects). |
| `digital-cathedral/tools/bots/index.js` | `claw/rust/crates/telemetry/Cargo.toml` @ 0.996 | **ORPHAN-LEGITIMATE** | Stub manifest declaring `@digital-cathedral/bots`. JS-vs-TOML; cross-language false positive. |
| `digital-cathedral/public/.well-known/mcp.json` | `oracle/vscode-extension/package.json` @ 0.992 | **ORPHAN-LEGITIMATE** | Live MCP manifest for Valor Legacies API. JSON-shape collision with a package.json. |
| `digital-cathedral/patterns/trust/security-headers.js` | `solana/clap-v3-utils/src/fee_payer.rs` @ 0.971 | **ORPHAN-LEGITIMATE** | JS module under test by `security-headers.test.js`. Cross-language false positive. |
| `digital-cathedral/patterns/batch3/event-emitter.test.js` | `oracle/tests/auto-tagger.test.js` @ 0.980 | **ORPHAN-LEGITIMATE** | Tests `createEventEmitter` — distinct surface from auto-tagger. Match is `node:test` scaffold collision. |
| `digital-cathedral/packages/shared/src/index.ts` | `claw/rust/crates/compat-harness/Cargo.toml` @ 0.979 | **ORPHAN-LEGITIMATE** | TS barrel re-exporting Valor Legacies shared types (`palette`, `LeadSubmission`, validators). TS-vs-TOML false positive. |
| `digital-cathedral/packages/shared/src/palette.ts` | `oracle/packages/shared/src/palette.ts` @ **1.000** | **NEEDS-ATTENTION → ORPHAN-LEGITIMATE-WITH-CAVEAT** | See below. |

## packages/shared/src/palette.ts @ 1.000 deep-dive

Compared `/home/user/remembrance-oracle-toolkit/digital-cathedral/packages/shared/src/palette.ts`
against `/home/user/remembrance-oracle-toolkit/packages/shared/src/palette.ts`:

- **Code portion (the `palette` object + type export):** byte-identical, 8 hex values.
- **Doc comment:** intentionally different.
  - digital-cathedral: `"Brand Palette"`, `"trust, clarity"`,
    `"trust (header & footer frames)"`, `"error states, urgency"`.
  - oracle root: `"Remembrance Palette"`, `"the living water, coherence, presence"`,
    `"the sacred pulse, urgency of remembrance"`.

The 1.000 score is the code-vector match; the comments add semantic divergence
in narrative but not in execution.

**Is this another dedup opportunity?** Technically yes, but:

- The two `packages/shared` directories belong to **different apps** with no
  shared workspace tooling (digital-cathedral has its own `index.ts` exporting
  Lead validators; oracle root's `index.ts` exports `solana.ts` types).
- Deduping would require introducing a monorepo workspace or a
  shared-styling package, which is structural work outside an audit's scope.
- The narrative-distinct comments are a deliberate signal: each app frames
  the same palette with its own brand voice.

**No mechanical fix applied.** Recommend tracking as a follow-up
"extract `@remembrance/palette` shared package" ticket if/when workspace
unification is on the roadmap.

## Mechanical fixes applied this pass

**None.** All 9 orphans are either legitimate or require structural
unification beyond the 1-2-fix bound for this audit.
