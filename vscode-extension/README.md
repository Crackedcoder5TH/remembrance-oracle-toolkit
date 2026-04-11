# Remembrance Oracle — VS Code Extension

Pattern memory + code quality scoring for your codebase.

## Features

- **Inline coherency scoring** — 7-dimension code quality analysis (syntax, completeness, readability, simplicity, security, consistency, testability) with VS Code diagnostics on save
- **Status bar indicator** — real-time coherency score with color coding (green >= 0.68, yellow >= 0.50, red < 0.50)
- **Pattern search** — search the Oracle pattern library from within VS Code
- **Cascade resonance** — analyze how your code resonates with known patterns via the Void Compressor
- **Resolve patterns** — get PULL/EVOLVE/GENERATE decisions before writing new code

## Commands

| Command | Description |
|---|---|
| `Remembrance: Score Current File` | Score the active file across all 7 coherency dimensions |
| `Remembrance: Search Patterns` | Search the Oracle pattern library |
| `Remembrance: Cascade Resonance` | Send the active file to the Void Compressor |
| `Remembrance: Resolve Pattern` | Get a smart PULL/EVOLVE/GENERATE decision |

## Settings

| Setting | Default | Description |
|---|---|---|
| `remembrance.oracleUrl` | `http://localhost:3000` | Oracle API server URL |
| `remembrance.voidUrl` | `http://localhost:3001` | Void Compressor service URL |
| `remembrance.autoScore` | `true` | Automatically score files on save |
| `remembrance.threshold` | `0.68` | Minimum coherency threshold for diagnostics |

## Setup

```bash
cd vscode-extension
npm install
npm run compile
```

Then press F5 in VS Code to launch an Extension Development Host, or package with `vsce package`.

## Offline Scoring

The coherency scorer works entirely offline with no API calls. Pattern search, cascade resonance, and resolve require the Oracle and Void Compressor services to be running.

## License

MIT
