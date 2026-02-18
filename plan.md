# Swarm Orchestrator Module — Implementation Plan

## Oracle Verdict: EVOLVE
Foundations to evolve from:
- `multi-orchestrator.js` (0.790) → 8-step pipeline pattern
- `generateCollectiveWhisper` (0.840) → whisper synthesis
- `voting` (0.576) → agent consensus mechanism
- `pipe` (0.970) → functional composition
- `coherency.js` → 5-dimension scoring engine

## Architecture

```
src/swarm/
├── index.js              # Public API barrel export
├── swarm-orchestrator.js # Main orchestrator (routes, collects, synthesizes)
├── agent-pool.js         # Agent registry + provider adapters (Claude, GPT, Gemini, Grok, DeepSeek, Llama)
├── dimension-router.js   # Maps remembrance dimensions → specialist agents
├── cross-scoring.js      # Agents score each other's outputs via coherency
├── consensus.js          # Weighted voting + aggregation → winner selection
├── whisper-synthesis.js  # Final whisper from all agent voices
└── swarm-config.js       # Configuration defaults + provider key management
```

## File-by-File Plan

### 1. `src/swarm/swarm-config.js` — Configuration
```javascript
// Default config for the swarm
module.exports = {
  DEFAULT_SWARM_CONFIG: {
    minAgents: 3,
    maxAgents: 9,
    consensusThreshold: 0.7,      // Minimum agreement for winner
    timeoutMs: 30000,              // Per-agent timeout
    dimensions: ['simplicity', 'correctness', 'readability', 'security', 'efficiency', 'unity', 'fidelity'],
    crossScoring: true,            // Agents score each other
    autoFeedToReflector: true,     // Winner auto-fed to Reflector
    providers: {}                  // { claude: { apiKey, model }, openai: { apiKey, model }, ... }
  },
  loadSwarmConfig(rootDir),        // Load from .remembrance/swarm-config.json
  saveSwarmConfig(rootDir, config), // Persist
  resolveProviders(config),        // Validate which providers have keys
}
```

### 2. `src/swarm/agent-pool.js` — Provider Adapters
```javascript
// Each provider adapter implements:
//   { name, send(prompt, options) → { response, meta } }
//
// Supported providers:
//   - claude (Anthropic API)
//   - openai (GPT-4o/4.5)
//   - gemini (Google AI)
//   - grok (xAI)
//   - deepseek (DeepSeek API)
//   - ollama (local Llama/Mistral/etc.)
//
// Exports:
//   createAgentPool(config) → { agents[], send(agentName, prompt), sendAll(prompt), shutdown() }
//   getAvailableProviders(config) → string[]
//
// Each adapter:
//   - Uses native fetch (Node 22+)
//   - Respects timeoutMs
//   - Returns structured { code, explanation, confidence, dimension }
//   - Handles rate limits with exponential backoff
```

### 3. `src/swarm/dimension-router.js` — Specialist Assignment
```javascript
// Maps each remembrance dimension to a specialist agent
// If 7 dimensions and 5 agents → some agents cover 2 dimensions
// If 9 agents → each dimension gets 1+ agent, extras become "generalists"
//
// Exports:
//   assignDimensions(agents, dimensions) → Map<agentName, dimension[]>
//   buildSpecialistPrompt(task, dimension, context) → string
//     Each agent gets a system prompt focused on their dimension:
//     - simplicity agent: "Prioritize the simplest possible solution..."
//     - correctness agent: "Focus on edge cases, error handling, type safety..."
//     - security agent: "Evaluate for OWASP top 10, injection, XSS..."
//     - etc.
```

### 4. `src/swarm/cross-scoring.js` — Mutual Evaluation
```javascript
// After all agents produce outputs, each agent scores the others
// Uses the existing computeCoherencyScore() as the baseline
//
// Exports:
//   crossScore(agentOutputs, agents, coherencyFn) → scoringMatrix
//     scoringMatrix[agentA][agentB] = { score, reasoning }
//   computePeerScores(scoringMatrix) → Map<agentName, avgPeerScore>
//
// The scoring prompt:
//   "Given this code produced by another agent, score it 0-1 on [dimension].
//    Explain your reasoning briefly."
//
// Optimization: If crossScoring is disabled, skip this step and use
// only coherencyFn scores (faster, fewer API calls)
```

### 5. `src/swarm/consensus.js` — Voting + Aggregation
```javascript
// Combines self-scores + peer-scores + coherency scores into final ranking
//
// Exports:
//   buildConsensus(agentOutputs, peerScores, coherencyScores, config) → {
//     winner: { agent, code, score, dimension },
//     rankings: [{ agent, totalScore, breakdown }],
//     agreement: 0-1,  // How much agents agree on the winner
//     dissent: [{ agent, reasoning }],  // Minority opinions
//   }
//
// Scoring formula:
//   totalScore = (coherencyScore * 0.4) + (selfConfidence * 0.2) + (avgPeerScore * 0.4)
//
// Agreement calculation:
//   agreement = fraction of agents whose top pick matches the winner
//
// Tie-breaking: highest coherency score wins
```

### 6. `src/swarm/whisper-synthesis.js` — Final Voice
```javascript
// Synthesizes a collective whisper from all agent perspectives
//
// Exports:
//   synthesizeWhisper(consensus, agentOutputs, task) → {
//     message: string,      // Human-readable summary
//     dimensions: {},        // Per-dimension insight from specialist
//     agreement: number,     // Consensus strength
//     dissent: string[],     // Notable minority views
//     recommendation: string // PULL / EVOLVE / GENERATE
//   }
//
// Reuses generateCollectiveWhisper() pattern from multi-engine.js
```

### 7. `src/swarm/swarm-orchestrator.js` — Main Pipeline
```javascript
// The heart of the swarm. 7-step pipeline:
//
// Step 1: CONFIGURE   — Load config, resolve available providers
// Step 2: ASSEMBLE    — Create agent pool, assign dimensions
// Step 3: DISPATCH    — Send task to all agents in parallel
// Step 4: COLLECT     — Gather responses, handle timeouts/failures
// Step 5: CROSS-SCORE — Agents evaluate each other (optional)
// Step 6: CONSENSUS   — Weighted vote → winner
// Step 7: INTEGRATE   — Feed winner to Reflector + Oracle
//
// Exports:
//   swarm(task, options) → SwarmResult
//   swarmCode(description, language, options) → SwarmResult  // Code generation
//   swarmReview(code, options) → SwarmResult                 // Code review
//   swarmHeal(filePath, options) → SwarmResult               // Healing via swarm
//   formatSwarmResult(result) → string                       // Terminal output
//
// SwarmResult = {
//   task, winner, rankings, agreement, whisper,
//   steps: [{ name, status, durationMs }],
//   totalDurationMs, agentCount,
// }
```

### 8. `src/swarm/index.js` — Public API
```javascript
module.exports = {
  swarm, swarmCode, swarmReview, swarmHeal,
  createAgentPool, getAvailableProviders,
  buildConsensus, crossScore,
  synthesizeWhisper,
  formatSwarmResult,
  DEFAULT_SWARM_CONFIG, loadSwarmConfig,
};
```

## CLI Integration

Add to `src/cli/commands/swarm.js`:
```
node src/cli.js swarm "implement a debounce function" --language javascript
node src/cli.js swarm review --file src/utils.js
node src/cli.js swarm heal --file src/broken.js
node src/cli.js swarm config                    # Show/edit swarm config
node src/cli.js swarm providers                  # List available providers
node src/cli.js swarm status                     # Last run, agent stats
```

## MCP Integration

Add 1 new consolidated MCP tool:
```
oracle_swarm — Swarm orchestration (code/review/heal/config via `action` param)
  Inputs: { action, task?, code?, filePath?, language?, options? }
```

## Test Plan

`tests/swarm.test.js`:
1. Config loading/saving/defaults
2. Agent pool creation with mock providers
3. Dimension assignment (balanced distribution)
4. Cross-scoring matrix computation
5. Consensus building (winner selection, agreement calc, tie-breaking)
6. Whisper synthesis from multi-agent outputs
7. Full pipeline with mock agents (no real API calls)
8. Timeout handling (agent doesn't respond)
9. Graceful degradation (only 1 provider available)
10. Integration with Reflector (winner fed to healFile)

## Implementation Order

1. `swarm-config.js` + tests — Foundation
2. `agent-pool.js` + tests — Provider adapters with mocks
3. `dimension-router.js` + tests — Specialist assignment
4. `cross-scoring.js` + tests — Mutual evaluation
5. `consensus.js` + tests — Voting engine
6. `whisper-synthesis.js` + tests — Final voice
7. `swarm-orchestrator.js` + tests — Main pipeline
8. `index.js` — Barrel export
9. CLI commands (`src/cli/commands/swarm.js`)
10. MCP tool (`oracle_swarm` in tools.js)
11. Full integration test with mock swarm

## Key Design Decisions

- **No real API calls in tests** — All tests use mock providers
- **Graceful degradation** — Works with 1 agent (just no cross-scoring)
- **Provider-agnostic** — Each adapter normalizes to same interface
- **Reuses coherency engine** — Not a separate scoring system
- **Reuses whisper pattern** — Same narrative style as Reflector
- **Local-first** — Ollama support means it works fully offline
- **Pipeline pattern** — Same step-tracking as multi-orchestrator
