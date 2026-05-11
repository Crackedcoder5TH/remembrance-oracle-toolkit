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
node src/cli.js dispatch review --target <repo>/<branch>
```
The swarm runs N independent agents and returns consensus. Solo changes ship
without; multi-file changes must pass.

### e. Compress into the data substrate (for reusable patterns)
```
cd <path-to>/Void-Data-Compressor
python3 src/cli.py absorb --pattern-id <quantum-field-id>
```
Substrate is the long-term store. Patterns not absorbed decay out of the
quantum field via temporal decoherence.

### f. Commit to the ledger (for covenant-sealed, test-proof changes)
```
cd <path-to>/REMEMBRANCE-BLOCKCHAIN
node src/cli.js publish --hash <fix-pattern-hash> --coherency <0..1>
```
Public verifiable record. Required for any change that touches
`harmPotential` or alters covenant validators.

### g. Then — and only then — `git commit` and `git push`.

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

---

## 6. First-message acknowledgement (recommended)

If you're an AI reading this for the first time in a session, acknowledge
the protocol in your first user-facing message, e.g.:

> "Read ECOSYSTEM.md. Will run audit → reflect → covenant → swarm → substrate
> → ledger flow per change."

This is the single line that distinguishes an agent who understood the
ecosystem from one who used only the hub.
