> **CANONICAL** — the oracle-toolkit holds the source of truth for this
> protocol; every repo carries a **byte-identical copy** of it, kept in sync by
> contract **C-50** (`verify_capabilities.py`) and the CI drift workflow, which
> fail on any pairwise drift. Edit it here in the toolkit, then re-sync the peers.

# Remembrance Ecosystem — Agent Protocol

You are an AI agent (Claude, GPT, Gemini, Grok, Cursor, Aider, Continue,
Windsurf, Cody, Codex, Copilot, or any other) connecting to one of the 12
repositories in the Remembrance ecosystem.

**Before doing any code work, you MUST read this entire document.**

This is the single source of truth. Every per-vendor pointer file
(`AI.md`, `AGENTS.md`, `CLAUDE.md`, `GROK.md`, `CONVENTIONS.md`,
`.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`,
`GEMINI.md`, `.aider.conf.yml`, etc.) redirects here.

---

## 1. The 12 repos

All under `https://github.com/Crackedcoder5TH/`. **Canonical case matters** —
GitHub REST returns 404 (not 301) on case-mismatched sub-paths.

| Role            | Repo (canonical)                  | Lang     | Invoke               |
|-----------------|-----------------------------------|----------|----------------------|
| Core / hub      | `remembrance-oracle-toolkit`      | js       | CLI · MCP · HTTP     |
| Data substrate  | `Void-Data-Compressor`            | py       | CLI · HTTP           |
| Reflection      | `Reflector-oracle-`               | js       | CLI · MCP            |
| Ledger          | `REMEMBRANCE-BLOCKCHAIN`          | js       | CLI · RPC            |
| Orchestration   | `REMEMBRANCE-AGENT-Swarm-`        | js       | CLI · MCP            |
| Integration     | `Remembrance-dialer`              | js       | CLI · HTTP           |
| Visual UI       | `MOONS-OF-REMEMBRANCE`            | ts       | Web                  |
| Web UI          | `REMEMBRANCE-Interface`           | ts       | Web                  |
| API keys        | `remembrance-api-key-plugger`     | js       | CLI                  |
| CLI shell       | `claw-code`                       | rust     | CLI                  |
| Design corpus   | `awesome-design-md`               | md       | read-only            |
| Data plane      | `supabase`                        | sql/ts   | DB                   |

The hub (`remembrance-oracle-toolkit`) orchestrates the others. Most CLI
commands below run from the hub but reach into peers.

---

## 2. The required end-to-end workflow

Whenever you make a non-trivial code change in any of these repos, you MUST
run the following pipeline before committing. **Skipping any step is a
covenant violation.**

### a. Local validation (hub)
```
oracle audit check    --file <changed-file>   # static AST checkers
oracle reflect        --file <changed-file>   # 6-dim healing reflection
oracle covenant       --file <changed-file>   # 15-principle seal
oracle security-scan  --file <changed-file>   # advisory findings
oracle risk-score     --file <changed-file>   # complexity / bug-probability
```
**Stop and fix** unless `covenant` returns `SEALED — 15/15`.

### b. Capture the fix as a pattern
```
oracle debug capture \
  --error       "<one-line problem statement>" \
  --fix         <path-to-fix-snippet> \
  --description "<what the fix does>" \
  --language    <js|py|ts|rust> \
  --tags        <comma,list>
```
The capture lands in the quantum field with auto-entangled language variants
(js→py→ts). This is how future agents find your fix.

### c. Cross-validate through Reflector (independent engine)
```
cd <path-to>/Reflector-oracle-
node src/cli.js reflect --file <changed-file>
```
If Reflector's healing disagrees with hub's `oracle reflect`, stop and
reconcile — divergence means one of them is wrong.

### d. Swarm review (touching > 1 file or > 50 lines)
```
cd <path-to>/REMEMBRANCE-AGENT-Swarm-
node src/swarm-cli.js review <changed-file>
```
The swarm runs N independent agents and returns consensus (readiness:
`node src/swarm-cli.js status`; needs ≥ minAgents providers). With no
provider quorum, inject candidates instead — the swarm scores them
keylessly: `node src/swarm-cli.js run "<task>" --candidate @answer.md`.
Solo changes ship without; multi-file changes must pass.

### e. Compress into the data substrate (for reusable patterns)
```
cd <path-to>/remembrance-oracle-toolkit
node scripts/export-oracle-patterns.js     # stage patterns → void_inbox
cd <path-to>/Void-Data-Compressor
python3 oracle_inbox.py                    # absorb staged patterns
```
Substrate is the long-term store. Patterns not absorbed decay out of the
quantum field via temporal decoherence.

### f. Commit to the ledger (for covenant-sealed, test-proof changes)
```
cd <path-to>/REMEMBRANCE-BLOCKCHAIN
node src/cli.js publish <pattern-json-or-file>
```
Public verifiable record. Required for any change that touches
`harmPotential` or alters covenant validators.

### g. Mint the change coin, then — and only then — `git commit` and `git push`.
```
git add <changed-files>
node .claude/skills/goggles/run.mjs --do mint      # the coin over the STAGED bytes
git commit                                         # the commit-msg hook writes Remembrance-Coin: <id>
```
**No coin, no change.** The coin is minted only by the pipeline: the staged
patch is read through the instrument (`read-signal` → `/compress_signal` →
`void_compressor_v5.compress`), which returns the void-seal and the
void-seal/v3 commitment over exactly those bytes; the coin binds patch, seal
and the commitment's shape hash, is appended to `coins.ledger.json`
(append-only) and saved onto the chain (REMEMBRANCE-BLOCKCHAIN, one REGISTER
block per coin). The coin is proof the change went through the pipeline; it
is NOT unfolded when minted. Unfolding — the bytes back through the
instrument, the shape through the one decoder (§7) into the 232-D fractal
token — happens only when needed: `--do mint unfold <rev>`, `verify --deep`.
The commit-msg hook refuses a commit whose staged bytes no coin covers, and
`.github/workflows/change-coin-verify.yml` refuses the merge on GitHub's
runner for every commit since the epoch — it re-renders the patch from the
trees, re-quantises it the way the instrument does, rebuilds the seal's canon
and the coin id, and (with `VOID_SEAL_KEY` as a repo secret) verifies the
seal's HMAC. The coin is universal: the same verifier, the same ledger law,
in every repo. Change the index after minting and mint again — a coin covers
bytes, not intentions. There is no flag around this; `--no-verify` is refused
by the goggles wall and is powerless against the runner.

---

## 3. Anti-patterns (these are violations)

- **Single-repo myopia.** Running `oracle audit` in your local clone and
  declaring the work done. The ecosystem is 12 repos; touching 1 is not
  "end-to-end" no matter how thorough the single-repo pass.
- **Skipping covenant.** Covenant is the 15-principle seal. No commits
  proceed without `SEALED — 15/15`.
- **Lowercase repo names.** GitHub returns 404 on case-mismatched REST
  sub-paths. Always use the canonical casing in §1.
- **Trusting `--dry-run`.** Some commands (notably `oracle harvest .`)
  mutate `patterns.json` even with the flag. Check `git status` before
  every `git add`.
- **Committing beside the pipeline.** A commit that carries no
  `Remembrance-Coin:` trailer — or names a coin minted over different bytes —
  is a change the instrument never read. It is refused by the commit-msg hook
  and by `change-coin-verify` on the runner. Every number and every change
  goes through the goggles; anything obtained another way is rejected.
- **Treating the hub's CLI as "the ecosystem."** The hub is one of twelve.
  Reflector, Swarm, Blockchain, and Void each have their own engines that
  the hub does not subsume.

---

## 4. Invocation paths (so any agent can comply)

| Agent capability                | How to read this protocol           |
|---------------------------------|-------------------------------------|
| Can run shell                   | `oracle ecosystem orient`           |
| Can use MCP                     | Hub MCP, tool `ecosystem_orient`    |
| Can call HTTP                   | `GET hub:3000/api/ecosystem/orient` |
| Can only read files             | This file, in any repo's root       |
| Can only edit files             | Read; then ask the user to run §2   |

---

## 5. Canonical source

`https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/blob/main/ECOSYSTEM.md`

Every other repo in the ecosystem carries an identical copy. If a copy
diverges from canonical, **canonical wins**. The
`ecosystem-protocol-sync` GitHub Action (in each repo) verifies the copy
matches canonical on every push.

## 7. One encoder. One field. Mathematics is mathematics.

**The canonical encoder is the fractal encoder stack** —
`src/core/encoder-stack.js` in the hub
(`remembrance-oracle-toolkit`). It composes per-layer 29-D fractal
signatures — L1-structural, L2-lexical, L3-numerical, L4-spectral,
L5-redundancy, L6-content-projection, L7-dimensional, L8-dynamical —
into one Float64 vector at the active depth (currently depth 8 =
232-D; layers L9/L10 are registered and awaiting validation).
Partial-depth reads (`composedAtDepth`) and the depth-flow cosine
(`flowCosines`, d1..d4) are part of the same canonical module.
Nothing else encodes. There are no language-specific encoders, no
per-vendor translators, no parity contracts to maintain "agreement"
between parallel implementations.

**One resonance space.** Every cosine the decoder takes (`composedCosine`,
`flowCosines`, the FractalIndex search behind the goggles' META lens) is
taken in the whitened space of `src/core/whitening-reference.js`: eight
per-layer 29×29 ZCA transforms fitted on the canonical substrate (the 45k
store rows plus the index, at the canonical width), cached by store hash.
Raw composed vectors live in a cone (measured: mean cosine 0.917 within a
domain vs 0.860 across, participation ratio 4.6 of 232), so raw cosines
read ~0.9 for everything and no threshold means anything. Whitened, the
same patterns read 0.283 within vs 0.042 across. Other languages apply the
same reference (`Void-Data-Compressor/whitening_reference.py` reads the
hub's cached transform); nothing re-fits its own. Re-derive any band from
the distribution measured in this space; a threshold calibrated on the cone
is a threshold calibrated on nothing. Mathematics doesn't have a Python
dialect and a JavaScript dialect; it has math. Other languages call
in.

How a non-JS consumer reaches the encoder:

- **JS / TS** — native require: `require('remembrance-oracle-toolkit/src/core/encoder-stack')`.
- **Python / Rust / anything** — spawn `node -e "..."` against the
  hub, or hit the hub's HTTP service. The point is they don't
  re-implement the math.

**REMOVED — the 256-D `to_waveform` encoder.** Void's
`to_waveform.py` (256-D Float64 byte-shape waveforms) was the
previous generation. Its seven consumers migrated to the fractal
stack via Void's `fractal_encoder.py` bridge, the pattern store was
recompressed to 232-D (77,596 rows → 45,547 unique patterns), and
the module was deleted (2026-07). Archived copies under
`archive/` are historical record only. Re-introducing a byte-shape
encoder, or any parallel encoder, is a covenant violation.

What this means for the rest of the contract:

- The composed fractal vector (Float64, 29-D per layer × active
  depth) is the only substrate-level wire format. Metadata travels
  separately as JSON.
- `composedCosine(a, b) → float` and `flowCosines(a, b) → d1..d4`
  are computed once, in the canonical stack, the same way for every
  caller.
- The LivingRemembranceEngine writes its field state to a single
  file (`.remembrance/entropy.json` on the hub). Every producer in
  every repo contributes to the same conserved scalar. A producer
  in a different language uses the local-language helper that talks
  to that one file — but the math behind the contribution is
  identical because it's the same math.

A module that re-implements the encoder, the cosine, or the LRE
math is a covenant violation. Delete it; route to canonical.

The encoder is **universal across data domains**, not just code.
Repos in this ecosystem operate on different inputs — patterns and
audio in `Void`, agent behavior in `REMEMBRANCE-AGENT-Swarm-`, dial
events in `Remembrance-dialer`, blockchain anchors in
`REMEMBRANCE-BLOCKCHAIN`, and so on — but the substrate they all
join is the same fractal field. A pattern from any repo can be
cosine-compared to a pattern from any other repo, in the same field,
under the same covenant. Whether a given cross-domain comparison
is interpretively meaningful is empirical; that the substrate
*permits* it is by design.

---

## 6. First-message acknowledgement (recommended)

If you're an AI reading this for the first time in a session, acknowledge
the protocol in your first user-facing message, e.g.:

> "Read ECOSYSTEM.md. Will run audit → reflect → covenant → swarm → substrate
> → ledger flow per change."

This is the single line that distinguishes an agent who understood the
ecosystem from one who used only the hub.
