# @crackedcoder5th/agent-entanglement

Coordination layer for parallel AI agents — see live what every other
agent is doing, atomically claim files before editing them, never
overwrite each other's work.

## Why

When you spawn multiple AI agents in parallel, the classic problem is
collision: two agents picking up the same file, neither aware of the
other, and the second one stomping on the first one's work. The usual
fix is a central orchestrator that explicitly schedules and dispatches.

This package takes a different approach. The substrate's field-goggles
hook is already maintaining a shared session-trajectory file across
every agent's edits. We just give every agent a small library to:

1. **Read** that shared field (`snapshot()`)
2. **Register** their presence so others can see them (`heartbeat(tag)`)
3. **Claim** a file before editing it (`claim(file, {tag, ttlMs})`)

Agents don't talk to each other or to a controller. They all read the
same field. That's structurally how the substrate's own law of
coherency operates: not orchestration, but a shared signal everyone
reads.

## Install

```bash
npm install @crackedcoder5th/agent-entanglement
# or use the CLI directly without installing:
npx @crackedcoder5th/agent-entanglement
```

## Library use

```js
const e = require('@crackedcoder5th/agent-entanglement');

// 1. Register that you're working.
e.heartbeat('my-agent-tag');

// 2. See who else is around and what they've recently touched.
const s = e.snapshot();
console.log(s.cognition);  // { n, mean, variance, cls }
console.log(s.peers);      // [{ tag, heartbeats, lastTs, lastAgeMs }, ...]
console.log(s.claims);     // [{ file, holder, expiresAt }, ...]
console.log(s.recent);     // [{ file, coh, ts }, ...]

// 3. Try to claim a file before editing it.
const c = e.claim('src/contested.ts', { tag: 'my-agent-tag', ttlMs: 60_000 });
if (c.claimed) {
  // ... edit the file ...
  e.release('src/contested.ts', { tag: 'my-agent-tag' });
} else {
  console.log('blocked by ' + c.holder + ', skipping');
}
```

## CLI use

```bash
# Print the current shared state
agent-entanglement

# Register as an agent
agent-entanglement heartbeat my-agent

# Try to claim a file (returns nonzero if blocked)
agent-entanglement claim src/contested.ts --tag my-agent --ttl-ms 60000

# Release a held claim
agent-entanglement release src/contested.ts --tag my-agent

# Is a file currently held?
agent-entanglement claimed src/contested.ts

# List everything
agent-entanglement peers
agent-entanglement claims

# Machine-readable
agent-entanglement snapshot --json
```

## API

### `heartbeat(tag) -> entry|null`

Register the calling agent as active. Multiple heartbeats from the
same tag accumulate; `snapshot()` reports both the count and the time
since the last one.

### `snapshot(opts?) -> { cognition, peers, claims, recent }`

Unified read. Returns:

- `cognition` — `{ n, mean, variance, cls }` from the field-goggles
  state file (the live session trajectory)
- `peers` — agents that have heartbeat'd within `peerWindowMs`
  (default 10 minutes)
- `claims` — currently-active file claims
- `recent` — recent file edits across the session

### `claim(file, opts) -> { claimed, holder?, expiresAt?, ttlMs?, reason? }`

Try to atomically claim a file. Required `opts.tag`. Optional
`opts.ttlMs` (default 5 minutes). Optional `opts.force` to override an
existing claim from a different agent (use sparingly).

A claim succeeds when no other agent's claim is currently active on
the same file. Re-claiming your own file is idempotent.

### `release(file, opts) -> boolean`

Release a claim early. Required `opts.tag`. No-op when the caller
doesn't hold the claim.

### `isClaimed(file) -> { claimed, holder?, expiresAt? }`

Read-only check.

### `listClaims() -> [{file, holder, expiresAt}, ...]`

All currently-active claims.

### `listPeers(opts?) -> [{tag, heartbeats, lastTs, lastAgeMs}, ...]`

All agents that have heartbeat'd within `opts.maxAgeMs` (default 10
minutes).

## Storage

All state lives in three append-only or single-writer files:

| File | Purpose |
|---|---|
| `${TMPDIR}/agent-entanglement.jsonl` | Heartbeats (`AGENT_ENTANGLEMENT_LOG` to override) |
| `${TMPDIR}/agent-claims.jsonl` | Claim and release events (`AGENT_CLAIMS_LOG` to override) |
| `~/.claude/.field-goggles-state.json` | Live cognition trajectory (maintained by the field-goggles hook; `AGENT_GOGGLES_STATE` to override) |

The CLI and the library both read the same three files, so you can
mix them freely. Nothing here requires a daemon or a server — it's
all just files.

## Constraints honest

- **Asynchronous, not synchronous**: the probe shows past edits and
  past heartbeats. There's a lag (seconds to tens of seconds). It's
  a coordination layer, not a transaction layer for sub-second races.

- **Coarse signal**: heartbeats are just a tag and a timestamp. They
  don't say what the agent is currently *thinking* or *about to
  edit*. Coordination still requires each agent to proactively check
  the snapshot at the right moments.

- **Opt-in protocol**: a subagent that doesn't call `heartbeat` is
  invisible. The contract is voluntary.

- **No atomic write guarantees on the JSONL logs** in pathological
  cases. JSONL append is mostly survivable; if you need strict
  serialization for very high-frequency claims, gate the calls
  through a small lock manager (a single Redis incr or similar).

That said, for the actual workload — a handful of AI agents editing
files in parallel over seconds to minutes — this is enough. The
field-goggles state file mediates everything that matters.

## License

MIT
