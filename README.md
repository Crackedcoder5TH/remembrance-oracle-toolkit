# Remembrance Oracle Toolkit

AI-powered code memory system. Stores **only code that proves itself** (passes validation + coherency scoring) and serves the most relevant, highest-quality snippets to any AI or developer that queries it.

## How It Works

1. **Submit** code with optional tests
2. Code is **validated** — syntax checked, tests executed, coherency scored
3. Only code that **passes the threshold** gets stored in the verified history
4. When you **query**, the Oracle returns the most relevant snippets ranked by coherency + relevance
5. **Feedback** loop — report whether code worked, reliability scores update over time

### Coherency Scoring (0-1 scale)

| Dimension | Weight | What it measures |
|-----------|--------|-----------------|
| Syntax validity | 25% | Does it parse correctly? |
| Completeness | 20% | No TODOs, stubs, or placeholders? |
| Consistency | 15% | Clean indentation, naming conventions? |
| Test proof | 30% | Did it pass actual tests? |
| Historical reliability | 10% | How often has it worked when used? |

## Quick Start

### As a CLI tool

```bash
# Submit code (must prove itself)
node src/cli.js submit --file mycode.js --test mytest.js --tags "sort,algorithm" --description "Quicksort"

# Query for relevant code
node src/cli.js query --description "sorting function" --language javascript --tags "sort"

# Check store stats
node src/cli.js stats

# Report feedback
node src/cli.js feedback --id <entry-id> --success

# Prune low-quality entries
node src/cli.js prune --min-coherency 0.5
```

### As a Node.js library

```javascript
const { RemembranceOracle } = require('remembrance-oracle-toolkit');

const oracle = new RemembranceOracle();

// Submit code — it must prove itself
const result = oracle.submit('function add(a, b) { return a + b; }', {
  description: 'Add two numbers',
  tags: ['math', 'utility'],
  language: 'javascript',
  testCode: 'if (add(2, 3) !== 5) throw new Error("FAIL");',
});

if (result.accepted) {
  console.log(`Stored! Coherency: ${result.entry.coherencyScore.total}`);
}

// Query — get the most relevant, proven code
const results = oracle.query({
  description: 'math utility function',
  tags: ['math'],
  language: 'javascript',
  limit: 5,
  minCoherency: 0.6,
});

// Each result has: code, coherencyScore, relevanceScore, reliability
results.forEach(r => {
  console.log(`[${r.coherencyScore}] ${r.description}`);
  console.log(r.code);
});

// Report feedback — did the code work?
oracle.feedback(results[0].id, true);  // success
oracle.feedback(results[0].id, false); // failure — reliability drops
```

### As a GitHub Action

Use it in any workflow to validate code or query the Oracle:

```yaml
# Validate and store code
- uses: Crackedcoder5TH/remembrance-oracle-toolkit@main
  with:
    command: submit
    file: src/mycode.js
    test-file: tests/mycode.test.js
    description: "Sorting algorithm"
    tags: "sort,algorithm"

# Query for relevant code
- uses: Crackedcoder5TH/remembrance-oracle-toolkit@main
  with:
    command: query
    description: "sorting function"
    language: javascript
    min-coherency: "0.6"
    limit: "5"

# Get store statistics
- uses: Crackedcoder5TH/remembrance-oracle-toolkit@main
  with:
    command: stats
```

You can also trigger queries manually via **Actions > Remembrance Oracle > Run workflow**.

## The Verified History Store

All proven code lives in `.remembrance/verified-history.json`. Each entry contains:

```json
{
  "id": "a1b2c3d4e5f6g7h8",
  "code": "function add(a, b) { return a + b; }",
  "language": "javascript",
  "description": "Add two numbers",
  "tags": ["math", "utility"],
  "author": "developer",
  "coherencyScore": {
    "total": 0.925,
    "breakdown": {
      "syntaxValid": 1.0,
      "completeness": 1.0,
      "consistency": 1.0,
      "testProof": 1.0,
      "historicalReliability": 0.5
    }
  },
  "validation": {
    "testPassed": true,
    "validatedAt": "2026-02-06T..."
  },
  "reliability": {
    "timesUsed": 5,
    "timesSucceeded": 4,
    "historicalScore": 0.8
  }
}
```

## AI Integration

When an AI queries the Oracle, it gets **only relevant, proven code**:

1. **Relevance matching** — TF-IDF text similarity + tag overlap + language match
2. **Coherency gating** — only entries above the minimum threshold are returned
3. **Ranked results** — best matches first (relevance * 0.75 + coherency * 0.25)
4. **Feedback loop** — AIs report back whether code worked, improving future rankings

This means any AI pulling from the Oracle gets the **highest-quality, most relevant code** — not random snippets.

## Project Structure

```
src/
  core/
    coherency.js   — Coherency scoring engine (syntax, completeness, consistency)
    validator.js   — Code validation (test execution, threshold gating)
    relevance.js   — Relevance matching (TF-IDF, tag overlap, ranking)
  store/
    history.js     — Verified code history store (JSON persistence)
  api/
    oracle.js      — Main Oracle API (submit, query, feedback, stats)
  action.js        — GitHub Action entry point
  cli.js           — CLI interface
  index.js         — Library entry point
tests/             — Test suite (37 tests)
.github/workflows/ — CI/CD pipeline
action.yml         — GitHub Action definition
```

## Running Tests

```bash
node --test tests/*.test.js
```

## License

MIT
