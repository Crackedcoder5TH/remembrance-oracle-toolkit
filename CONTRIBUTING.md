# Contributing to Remembrance Oracle Toolkit

Thank you for your interest in contributing. This guide covers development setup, coding standards, and the submission process.

## Development Setup

**Requirements:** Node.js 22+ (uses built-in `node:sqlite`)

```bash
git clone https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit.git
cd remembrance-oracle-toolkit
oracle seed   # Load 600+ proven patterns
```

No `npm install` needed — the project has **zero external runtime dependencies**.

## Running Tests

```bash
node --test tests/*.test.js
```

This runs 1735+ tests across 54 test files. All tests must pass before submitting a PR.

## The Oracle-First Reflex

Before writing any new function or utility, follow the reflex from [CLAUDE.md](CLAUDE.md):

1. **Search first**: `oracle search "<what you need>" --limit 3`
2. **Resolve if match found**: `oracle resolve --description "<what you need>"`
3. **Use proven code** if the oracle returns PULL (coherency >= 0.68)
4. **Adapt** if the oracle returns EVOLVE
5. **Write new code** only if the oracle returns GENERATE or no match exists

After using a pulled pattern or writing new code that passes tests:

```bash
oracle feedback --id <id> --success   # Report success
oracle register --file <code.js> --test <test.js> --name <name>  # Register new patterns
```

## Code Requirements

All code stored in the oracle must meet these standards:

- **Covenant filter** — passes all 15 safety principles (no SQL injection, XSS, credential exposure, etc.)
- **Test proof** — every proven pattern requires passing tests
- **Coherency threshold** — minimum score of 0.6 (scored across syntax, completeness, consistency, test proof, reliability)
- **Community sharing** — requires coherency >= 0.7

## Coding Conventions

- Zero external dependencies — use only Node.js built-in modules
- SQLite via `node:sqlite` (synchronous `DatabaseSync` — no async needed)
- Tests use `node:test` and `node:assert/strict`
- Each test file uses temp directories via `makeTempDir()` / `cleanTempDir()` helpers
- Use `autoSeed: false` when constructing `RemembranceOracle` in tests

## Submitting Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b my-feature`)
3. Follow the oracle-first reflex for any new code
4. Write tests for new functionality
5. Run the full test suite: `node --test tests/*.test.js`
6. Commit with a clear message describing the change
7. Open a Pull Request against `main`

## VS Code Extension

Extension source lives in `vscode-extension/`. To work on it:

```bash
cd vscode-extension
npm install        # Install dev dependencies (@types/vscode)
npm test           # Run extension tests
```

## Reporting Bugs

Open an issue at: https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/issues

Include:
- Node.js version (`node --version`)
- Steps to reproduce
- Expected vs actual behavior
- Error output (if any)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
