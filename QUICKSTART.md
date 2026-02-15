# 30-Second Quickstart

Get a code memory oracle running in your project in under a minute.

## Install

```bash
npm install -g remembrance-oracle-toolkit
```

Or use without installing:

```bash
npx remembrance-oracle-toolkit help
```

## 1. Seed the library (10 seconds)

```bash
oracle seed
```

This loads 600+ proven, tested patterns across JavaScript, TypeScript, Python, Go, and Rust.

## 2. Search for code (5 seconds)

```bash
oracle search "binary search"
oracle search "rate limiting" --mode semantic
oracle smart-search "debounce function"
```

## 3. Submit your own code (15 seconds)

Your code must **prove itself** — pass the Covenant filter, tests, and coherency scoring:

```bash
oracle submit --file mycode.js --test mytest.js --tags "sort,algorithm"
```

Or pipe it:

```bash
cat mycode.js | oracle submit --language javascript --test mytest.js
```

That's it. You're running.

---

## What happens next

The oracle automatically grows. Every time you register proven code:

- **Candidates spawn** — language variants (JS → TS, Python) and automated refinements
- **Tests synthesize** — `oracle synthesize` generates tests for candidates
- **Quality improves** — feedback tracking makes good code rise, bad code fall

## Use from Node.js

```javascript
const { RemembranceOracle } = require('remembrance-oracle-toolkit');
const oracle = new RemembranceOracle();

// Submit code (must prove itself)
const result = oracle.submit('function add(a, b) { return a + b; }', {
  description: 'Add two numbers',
  tags: ['math', 'utility'],
  language: 'javascript',
  testCode: 'if (add(2, 3) !== 5) throw new Error("FAIL");',
});
console.log(result.accepted); // true

// Query for code
const results = oracle.query({ description: 'math utility', limit: 5 });

// Smart retrieval — pull, evolve, or generate
const decision = oracle.resolve({
  description: 'sorting function',
  language: 'javascript',
});
// → { decision: 'PULL', pattern: { name: 'merge-sort', coherency: 0.925 } }
```

## Use with TypeScript

Full type definitions included:

```typescript
import { RemembranceOracle, ValidationResult, Pattern } from 'remembrance-oracle-toolkit';

const oracle = new RemembranceOracle({ threshold: 0.7 });
const result: ValidationResult = oracle.submit(code, metadata).validation;
```

## Use as an MCP Server (for AI agents)

```bash
oracle mcp
```

Auto-register in your AI editor:

```bash
oracle mcp-install   # Detects Claude Desktop, Cursor, VS Code
```

23 tools across 8 categories — search, submit, validate, reflect, debug, and more.

## Three-tier storage

```
Local (.remembrance/)     → Project-specific, always present
Personal (~/.remembrance/) → Private, syncs across projects
Community                  → Shared, requires tests + coherency ≥ 0.7
```

```bash
oracle sync push         # Local → Personal
oracle share             # Local → Community
oracle community pull    # Community → Local
```

## Common workflows

```bash
# Heal code with reflection
oracle reflect --file code.js --loops 3 --target 0.9

# Check code against the Covenant (15 safety principles)
oracle covenant --file code.js

# Run security scan
oracle security-scan --file code.js

# Start the web dashboard
oracle dashboard

# Start production server
PORT=8080 oracle deploy

# Debug: capture an error→fix pattern
oracle debug capture --error "TypeError: x is not a function" --fix fix.js

# Debug: search for known fixes
oracle debug search --error "Cannot read property of undefined"
```

## Next steps

- [Full CLI Reference](README.md#cli-reference) — all 60+ commands
- [MCP Server](README.md#as-an-mcp-server-for-ai-agents) — AI agent integration
- [VS Code Extension](README.md#vs-code-extension) — editor integration with diagnostics, hover, and completions
- [Plugin System](README.md#plugin-system) — extend the oracle
- [GitHub Action](README.md#as-a-github-action) — CI/CD integration
