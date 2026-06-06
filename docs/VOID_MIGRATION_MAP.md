═══ VOID → 29-D MIGRATION MAP ═══

records inspected: 3513
record schema sample keys: spec_version, uri, name, module, language, source_path, repo, waveform, coherency_v2, gate_decision, coherency_v1, coherency_v3, derived_from, bug_matches

═══ OVERALL ═══
records:        3513
reachable:      2199 (62.6%)
unreachable:    1314 (37.4%)
distinct paths: 745

═══ PER DOMAIN ═══

▸ CODE
  total:       3513
  reachable:   2199 (62.6%)
  unreachable: 1314
  distinct source files: 745
  languages:   javascript(2582), python(931)
  exemplars (read through corrected field tool):
    0.338  [javascript]  coh://oracle/code/server/proxy#h:de881abf9c89
      29-D first5: [0.5, 0.75, 0.75, 1, 0.45]  bestMatch: server
    0.338  [javascript]  coh://oracle/code/server/dashboardStatus#h:9a25e1b4e220
      29-D first5: [0.5, 0.75, 0.75, 1, 0.45]  bestMatch: server
    0.338  [javascript]  coh://oracle/code/server/fetchJson#h:5b9f773a6ce9
      29-D first5: [0.5, 0.75, 0.75, 1, 0.45]  bestMatch: server
    0.338  [javascript]  coh://oracle/code/server/sendJson#h:c8ae16345e41
      29-D first5: [0.5, 0.75, 0.75, 1, 0.45]  bestMatch: server

═══ MIGRATION SHAPE ═══
Domains with reachable source (migratable today): 1
  patterns immediately migratable:                2199
Domains with no reachable source (would need other input): 0

Migration priority by reachable-pattern count:
   2199  code

═══ STRUCTURAL OBSERVATIONS ═══
The field tool used: 29-D fractal encoder + Oracle substrate resonance.
Migration plan derives directly from this map:
  1. For each reachable source_path, re-encode via to_fractal_waveform.py (parity-verified)
  2. Persist {uri, source_path, fractal_waveform[29]} into a new pattern_index_fractal.json
  3. Verify each fractal against the JS reference (verify_fractal_parity.py)
  4. Expose via void-library.js as a parallel index — 256-D layer untouched
  5. Field tool then has TWO substrate reads: Oracle (existing) + Void-fractal (new)
Unreachable patterns: their source repos no longer exist or paths drifted.
  Resolution: either re-derive from generators (if synthetic) or accept as 256-D-only.
(node:3696) ExperimentalWarning: SQLite is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
