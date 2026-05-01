# Remembrance Oracle Toolkit — Verified Capabilities

This repo's piece of the [ecosystem](../Void-Data-Compressor/CAPABILITIES.md).
The canonical, cross-repo capabilities matrix lives there. This file
records what is verified to work **here**, in this repo, end-to-end.

Last verified: 2026-04-30, branch `claude/audit-remembrance-ecosystem-xaaUr`.

---

## Role in ecosystem

The oracle is the **scorer + judge layer**. The void substrate provides
77k patterns and waveform similarity; this repo provides text + atomic
scoring, the periodic-table-of-code (13D atomic properties), the
covenant validator, and the user-facing CLI / MCP server.

By function count: this is the largest repo in the ecosystem
(2,188 functions across 1,829 PULL / 351 REFINE / 8 SPAWN), so
the oracle's own coherency carries weight in the per-repo modulator
(currently μ=0.9152, modulator=1.015 — slightly above ecosystem mean).

---

## ✅ Verified inside this repo

| # | Capability | Where | Test |
|---|---|---|---|
| 1 | Text + atomic scoring service (oracle-scorer) | `oracle-scorer-service.js` | `node oracle-scorer-service.js` then `curl http://127.0.0.1:8766/health` |
| 2 | 13D atomic properties / periodic-table-of-code | `src/atomic/periodic-table.js` | `node -e "const {PeriodicTable}=require('./src/atomic/periodic-table'); console.log(new PeriodicTable().size)"` |
| 3 | Coherency scoring CLI | `src/unified/coherency.js` | `node src/cli.js audit check --file <some.js>` |
| 4 | Covenant validator (15+ founding principles) | `src/core/covenant.js` | `node src/cli.js audit check --file <some.js>` rejects code that violates covenant |
| 5 | Search / resolve / submit / register pipeline | `src/cli.js` | `node src/cli.js search "<query>"` |
| 6 | Auto-tagger (keyword detection) | `src/core/auto-tagger-detectors.js` | run on any file with `audit check` |
| 7 | Compliance ledger with 5 enforcement checks | `.remembrance/sessions/` | `node src/cli.js session status` |
| 8 | Pre-commit hook enforcement | `node src/cli.js hooks install` | tries `git commit` without prior search → blocked at `ORACLE_WORKFLOW=enforce` |
| 9 | MCP server with 12 tools | `node src/cli.js mcp` | start server, connect MCP client, call `oracle_search` |
| 10 | Sync (local ↔ personal ↔ community) | `node src/cli.js sync push/pull` | `~/.remembrance/personal/` populated after `sync push` |
| 11 | Auto-submit pipeline (register + harvest + promote + sync) | `node src/cli.js auto-submit` | runs after every commit via post-commit hook |

### How the oracle plugs into the ecosystem

- The **void compressor** calls `oracle-scorer-service` for `text_score`
  and `atomic_score` on each function record (when both services are up,
  v1 becomes a true 3-component geometric mean instead of waveform-only).
- The oracle's atomic table feeds the void's `atomic_substrate.json` (404
  generated element waveforms used as an orthogonal embedding dimension
  in `cascade_potential.py`).
- The oracle's covenant validator (`src/core/covenant.js`) runs on the
  oracle side; the void has its own `covenant_filter.py` that mirrors
  the same 15+ principles for Python-side enforcement.

---

## ⚠️ Verified with caveat

| Capability | Caveat |
|---|---|
| Auto-tagger keyword detection | Pattern-matching against tag keywords. The "neural" tag matches the regex `\bneural\b` — it does NOT mean a neural network is running. |
| 13D atomic properties (harm_potential / alignment / intention) | These are properties **set manually** during `register` / `submit`. There is no inferred-from-code mechanism. `dangerous` / `degrading` / `malevolent` flags reject patterns at admission, but the flags themselves come from the submitter, not introspection. |
| Search-before-write enforcement | Real (the pre-commit hook blocks at `ORACLE_WORKFLOW=enforce`). Effectiveness depends on agents/devs honouring it; the social pressure is structural via the compliance ledger. |

---

## ❌ Out of scope here

- Pattern coherency scoring of itself — oracle's 2,188 functions are
  scored by the void compressor, not by this repo. See the void's
  `cross_repo_function_records.json`.
- The 77k-pattern substrate — lives in `Void-Data-Compressor/pattern_store.npz`
- The cascade-of-cascades / promote_spawn loop — void-side
- Translation between languages — separate connected NN (not in this repo
  and not in void either)

---

## Quick verification

```bash
# 1. Service alive?
node oracle-scorer-service.js &
until curl -sf http://127.0.0.1:8766/health > /dev/null; do sleep 1; done

# 2. Score a file
node src/cli.js audit check --file src/cli.js

# 3. Search the substrate
node src/cli.js search "debounce" --limit 3

# 4. Compliance status
node src/cli.js session status

# 5. End-to-end against void
cd ../Void-Data-Compressor
python3 compressor_service.py &     # void's scorer
python3 score_cross_repo_records.py # both services contribute → 3-component v1
```

If `oracle-scorer-service` is up but `compressor_service` is not, void
falls back to `waveform-only` scoring (v1 = waveform_score, text/atomic
both null). That's a documented degradation, not a bug.

---

*Cross-cutting capabilities: see [`Void-Data-Compressor/CAPABILITIES.md`](../Void-Data-Compressor/CAPABILITIES.md).*
