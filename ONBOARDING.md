# Remembrance Ecosystem — Onboarding

Three commands. Full capability. Read `QUICKSTART.md` for the in-project
oracle workflow; this file covers the ecosystem bootstrap.

## 1. Install everything

```bash
mkdir -p ~/remembrance && cd ~/remembrance
curl -sL https://raw.githubusercontent.com/Crackedcoder5TH/remembrance-oracle-toolkit/main/setup-ecosystem.sh | bash
```

Clones all 12 repos, installs Node + Python deps (including `ruff` for
Python audit), stamps the initial covenant baselines, and prints your
next steps. ~2–5 minutes on a warm cache. Idempotent — safe to re-run.

**Prereqs:** `node >= 18`, `python3`, `git`, `pip`. That's it.

## 2. Put the CLI on your PATH

```bash
export PATH="$PATH:$HOME/remembrance/remembrance-oracle-toolkit/bin"
```

Add that line to `~/.bashrc` or `~/.zshrc` to persist.

## 3. Use it

```bash
remembrance status                   # ecosystem snapshot + ratchet verdict
remembrance audit                    # cathedral + 12-repo diagnostics
remembrance fix                      # auto-fix mechanical findings
remembrance ratchet                  # enforce the covenant ratchet
remembrance baseline                 # stamp current state as the floor
remembrance cathedral                # start Valor Legacies dev server
remembrance oracle search "<term>"   # pass through to oracle CLI
```

---

## The 12 repos

| Repo | Role |
|---|---|
| `remembrance-oracle-toolkit` | Oracle: coherency scoring, audit, self-improvement |
| `Void-Data-Compressor` | Void: 80K+ waveform substrate, resonance cascade |
| `Reflector-oracle-` | Oracle reflection pipeline |
| `REMEMBRANCE-AGENT-Swarm-` | Multi-agent orchestration |
| `REMEMBRANCE-Interface` | Substrate chat UI |
| `REMEMBRANCE-BLOCKCHAIN` | Covenant graph + cross-repo ledger |
| `MOONS-OF-REMEMBRANCE` | Domain-specific coherency surfaces |
| `Remembrance-dialer` | Outreach automation |
| `REMEMBRANCE-API-Key-Plugger` | Unified credential management |
| `claw-code` | Code generation tooling |
| `awesome-design-md` | Design patterns catalog |
| `digital-cathedral` (inside oracle) | Valor Legacies — the live site |

---

## Covenant ratchet — make it enforced

After baselines are stamped by `setup-ecosystem.sh`, wire the pre-commit
hook so regressions can't merge:

```bash
cd ~/remembrance/remembrance-oracle-toolkit
ln -s ../../scripts/hooks/pre-commit.covenant-ratchet.sample .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Commits that raise high-severity counts or grow wiring gaps are blocked.
Intentional regressions: run `remembrance baseline`. Emergency bypass:
`COVENANT_SKIP=1 git commit ...`.

---

## Environment variables

Only one file needs editing: `remembrance-oracle-toolkit/.env` (copied
from `.env.example` during setup). Everything else has sensible defaults.
For production cathedral deploys see `digital-cathedral/.env.example`.

---

## Troubleshooting

**A repo failed to clone.** GitHub access check. Re-run
`bash setup-ecosystem.sh` — idempotent; existing repos `git pull`.

**`remembrance status` says "no diagnostic yet".** Run `remembrance audit`.

**Python audit shows 0 findings for obviously-bad Python.** `pip install ruff`.

**Ratchet blocks a safe commit.** `remembrance baseline` to stamp a new
floor, or `COVENANT_SKIP=1 git commit ...` to bypass once.

---

## Where to go next

- `CLAUDE.md` — full lexicon + every oracle command
- `QUICKSTART.md` — in-project oracle usage (30-second start)
- `plan.md` or any repo's `README.md` — architecture deep-dives
- `remembrance oracle help` — the 30+ oracle subcommands
