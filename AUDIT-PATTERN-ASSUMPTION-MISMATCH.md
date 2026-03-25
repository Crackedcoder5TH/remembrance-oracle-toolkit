# Full Audit Report: Pattern Assumption Mismatch Meta-Pattern

**Date:** 2026-03-18
**Meta-Pattern:** `PATTERN ASSUMPTION MISMATCH` — What code assumes the pattern is ≠ What the pattern actually is
**Scope:** Full codebase audit of remembrance-oracle-toolkit
**Total Bugs Found:** 56

---

## The Meta-Pattern

Every bug is an instance of:

```
Code assumes X ≠ Reality is Y
```

This single lens captures: memory bugs, concurrency bugs, logic bugs, type bugs, state bugs, integration bugs, security bugs, performance bugs, edge cases, exotic bugs, and meta bugs.

---

## Severity Distribution

| Severity | Count |
|----------|-------|
| CRITICAL | 5     |
| HIGH     | 10    |
| MEDIUM   | 27    |
| LOW      | 14    |

---

## CRITICAL FINDINGS (Fix Immediately)

### C1. Undefined `result` Variable in Sandbox Python Execution
**File:** `src/core/sandbox.js:140-143`
**Assumes:** `result` is assigned from `execFileSync` return value
**Reality:** `result` is never assigned — the return statement references an undefined variable
**Category:** Logic/State

### C2. Dashboard XSS via Unescaped matchedConcepts
**File:** `src/dashboard/client-script.js:442-444`
**Assumes:** `matchedConcepts` array values are safe because they come from the oracle DB
**Reality:** User-supplied code patterns stored in DB may contain malicious HTML/JS. `matchedConcepts.join(', ')` is injected directly into HTML without escaping
**Category:** Security (XSS)

### C3. Consensus Agreement Formula Inverted
**File:** `src/swarm/consensus.js:66-73`
**Assumes:** `winner.totalScore - r.totalScore < (1 - threshold) * winner.totalScore` identifies agreeing agents
**Reality:** Formula is mathematically inverted. With threshold=0.7, it checks if agents are within 30% absolute margin, not 70% relative. Should be: `r.totalScore >= winner.totalScore * threshold`
**Category:** Logic

### C4. Promise.allSettled Rejections Silently Dropped in Cross-Scoring
**File:** `src/swarm/cross-scoring.js:115-122`
**Assumes:** Rejected promises produce fallback entries with empty reviewer strings
**Reality:** The `if (!reviewer) continue` skips rejected promises entirely, creating incomplete peer score matrices that bias consensus
**Category:** Concurrency

### C5. computePeerScores Returns Empty Map on Empty Input
**File:** `src/swarm/cross-scoring.js:134-152`
**Assumes:** Function returns populated Map
**Reality:** If `agentNames` is empty/null, returns empty Map. Callers using `.get(agent)` get `undefined`, defaulting all peer scores to 0.5
**Category:** State/Null

---

## HIGH SEVERITY FINDINGS

### H1. JSON.parse on Corrupted Tags Crashes Queries
**File:** `src/store/sqlite.js:393`
**Assumes:** If `p.tags` is a string, it's valid JSON
**Reality:** Corrupted/malformed tags crash the entire query with no try-catch boundary
**Category:** Error Handling

### H2. Null Covenant Principle Lookup
**File:** `src/core/covenant.js:95-96`
**Assumes:** Every `hp.principle` ID exists in `COVENANT_PRINCIPLES`
**Reality:** Missing IDs cause `principle` to be undefined; accessing `.name`/`.seal` throws
**Category:** State/Null

### H3. Unverified Command Execution in ChromaDB Bridge
**File:** `src/search/chromadb/bridge.js:144-151`
**Assumes:** `options.pythonBin` is a safe Python binary path
**Reality:** No validation that path points to legitimate Python binary. If controlled by environment, could execute arbitrary binaries
**Category:** Security (Command Injection)

### H4. URL-Encoded Form Parsing Vulnerability
**File:** `src/auth/github-oauth.js:19-35`
**Assumes:** Simple heuristic `!data.includes('<') && data.includes('=')` detects form data
**Reality:** No limit on parameter count (DoS), null byte injection via `decodeURIComponent`, path traversal in decoded values
**Category:** Security (Input Validation)

### H5. Rate Limiter Memory Exhaustion
**File:** `src/dashboard/middleware.js:28-31`
**Assumes:** `hits.size > 10000` check prevents unbounded growth
**Reality:** Attacker creates 10,000 fake IPs via X-Forwarded-For, map clears entirely (losing all legitimate rate-limit state), cycle repeats
**Category:** Security (DoS)

### H6. Cloud Token Decryption Fails Cross-Machine
**File:** `src/cloud/client.js:46-62`
**Assumes:** Encryption key from `os.hostname() + os.userInfo().username` is stable
**Reality:** Different machine = different key = all encrypted tokens unreadable. Returns `null` where callers expect string
**Category:** Integration/State

### H7. GitHub Handler Unhandled File Write Crash
**File:** `src/connectors/github-handler.js:25-37`
**Assumes:** `fs.appendFileSync(GITHUB_OUTPUT, ...)` succeeds
**Reality:** Invalid path or missing permissions throws uncaught exception, crashing the entire GitHub Action
**Category:** Error Handling

### H8. Pattern Registration Returns Silently Dropped
**File:** `src/patterns/library.js:347-349`
**Assumes:** `addPatternIfNotExists()` returns `null` only for duplicates
**Reality:** If store returns `undefined` or `false`, the `!record` check treats them as duplicate, silently dropping new patterns
**Category:** State

### H9. Unchecked JSON from Python Subprocess
**File:** `src/search/chromadb/bridge.js:156-164`
**Assumes:** stdout from Python subprocess is valid JSON
**Reality:** Subprocess can output warnings, partial data, or non-JSON before the result
**Category:** Integration

### H10. Incomplete GitHub OAuth Response Validation
**File:** `src/auth/github-oauth.js:130-161`
**Assumes:** Response always has `login`, `id`, `avatar_url`
**Reality:** Only `login` is validated; `id` could be undefined, `avatar_url` unsanitized
**Category:** Type/Null

---

## MEDIUM SEVERITY FINDINGS

### M1. Regex Match Capture Group Access
**File:** `src/core/coherency.js:221`
**Assumes:** `wm[1]` exists when `wm` is truthy
**Reality:** Captured groups can be `undefined`

### M2. JSON.parse Without Try-Catch on Match Content
**File:** `src/core/claude-bridge.js:357`
**Assumes:** `jsonMatch[0]` is valid JSON
**Reality:** Malformed content causes unhandled throw

### M3. Missing Property Guard on Sorted Array
**File:** `src/core/reflection-loop.js:95`
**Assumes:** Array items have `.strategy` property
**Reality:** Missing property causes undefined access

### M4. Type Coercion in testPassed Field
**File:** `src/store/sqlite.js:463-465`
**Assumes:** `testPassed` is boolean or null
**Reality:** Legacy data may be number/string, causing incorrect ternary coercion

### M5. indexOf Returns -1, Then i++ Makes 0 (Potential Infinite Loop)
**File:** `src/core/coherency.js:112,119`
**Assumes:** `break` after `indexOf === -1` prevents iteration
**Reality:** If final char is `/` without newline, `i` becomes -1, `i++` makes 0

### M6. Session State Serialization Misses Legacy Formats
**File:** `src/core/session-tracker.js:92-94`
**Assumes:** `patternsUsed` is Set or Array
**Reality:** Could be stringified array from partial JSON load

### M7. Unvalidated API Response Structure
**File:** `src/core/llm-generator.js:92,125`
**Assumes:** `data.content` is array with `.text` elements
**Reality:** Malformed API responses silently return empty string

### M8. Unsafe Regex Substitution with $ Characters
**File:** `src/core/persistence.js:111-112`
**Assumes:** Description doesn't contain regex special chars
**Reality:** `$` in paths interpreted as backreference placeholder

### M9. Race Condition in Session Auto-Flush
**File:** `src/core/session-tracker.js:77-101`
**Assumes:** Concurrent writes to session file won't corrupt
**Reality:** File I/O is not atomic; multiple processes can corrupt

### M10. String Slice on Empty String
**File:** `src/core/coherency.js:218`
**Assumes:** `before` is non-empty after `trimEnd()`
**Reality:** Pure whitespace → empty string → `before[-1]` is undefined

### M11. Off-by-One in Reflection Dimension Check
**File:** `src/core/reflection-loop.js:31-59`
**Assumes:** `currentDims` keys match `candidateDims` keys
**Reality:** Missing dimensions in candidate are silently skipped (not treated as violations)

### M12. SQL Injection Potential in Dynamic Queries
**File:** `src/store/sqlite.js:173`
**Assumes:** All SQL construction uses parameterized queries
**Reality:** Some paths may construct WHERE clauses with unescaped user input

### M13. Unbounded Query Cache Growth
**File:** `src/search/embeddings.js:328-363`
**Assumes:** LRU eviction prevents growth
**Reality:** Concurrent queries can exceed `_QUERY_CACHE_MAX` before cleanup

### M14. Race Condition in Cache Eviction
**File:** `src/search/embedding-engine.js:477-484`
**Assumes:** Single-threaded cache operations
**Reality:** In async event loop, multiple tasks can check condition simultaneously, exceeding max

### M15. NULL Vector in Cosine Similarity
**File:** `src/search/embedding-engine.js:127-137`
**Assumes:** Input vectors are valid arrays with matching lengths
**Reality:** Empty arrays rejected by falsy check; NaN/undefined elements propagate silently

### M16. Auth Header Parsing Rejects Extra Spaces
**File:** `src/auth/auth.js:436-449`
**Assumes:** Exactly one space between scheme and credential
**Reality:** `"Bearer  token"` (two spaces) fails `parts.length === 2` check → silent 401

### M17. Path Traversal via Tag Strings
**File:** `src/search/chromadb/bridge.js:187-199`
**Assumes:** Tags from split are safe to store
**Reality:** Tags like `../../etc/passwd` pass through without sanitization

### M18. Missing Content-Type Validation in HTTP Client
**File:** `src/client/oracle-client.js:44-64`
**Assumes:** 2xx response is valid JSON
**Reality:** Returns raw string when JSON parse fails on success status

### M19. Bigram Similarity Formula Incorrect
**File:** `src/evolution/self-optimize.js:399-411`
**Assumes:** `totalBigrams = lenA - 1 + lenB - 1` gives Jaccard denominator
**Reality:** Sums bigram counts instead of computing union size; scores always ≤ 0.5

### M20. Off-by-One in Task Queue Size
**File:** `src/swarm/task-queue.js:161-163`
**Assumes:** `>` check truncates to exactly `_maxCompleted`
**Reality:** Array temporarily grows to `_maxCompleted + 1` before next truncation

### M21. Division-by-Zero Fallback Misleading
**File:** `src/swarm/consensus.js:71-73`
**Assumes:** Single-agent agreement = 1.0
**Reality:** Reports "perfect agreement" when no peers exist to agree

### M22. Silent Auto-Register Failure on Git Errors
**File:** `src/ci/auto-register.js:35-61`
**Assumes:** Empty array return on error is safe
**Reality:** Users get no indication that pattern registration silently failed

### M23. Compression Family Member Loss
**File:** `src/compression/index.js:122-136`
**Assumes:** `members.length >= 2` means page is valid
**Reality:** Failed embeddings silently remove family members; page may represent only 20% of family

### M24. Plugin Manager Unsafe Require Cache Clear
**File:** `src/plugins/manager.js:238-241`
**Assumes:** Deleting require.cache entry cleanly unloads plugin
**Reality:** Other modules may re-require it, re-executing module-level side effects

### M25. Rate Limiter Per-IP Array Unbounded
**File:** `src/dashboard/middleware.js:32-34`
**Assumes:** Filter removes old entries keeping arrays small
**Reality:** High-frequency single IP grows array to thousands of entries within window

### M26. Temporal Memory Array Access
**File:** `src/evolution/temporal-memory.js:156-157`
**Assumes:** `failures[0]` and `successes[0]` exist
**Reality:** Can be undefined if filter returns empty arrays

### M27. Events Array Empty Access
**File:** `src/evolution/temporal-memory.js:185`
**Assumes:** Events array has elements
**Reality:** `events[events.length - 1]` returns undefined if empty

---

## LOW SEVERITY FINDINGS

### L1. Split Without Validation
**File:** `src/core/auto-tagger.js:118`
**Assumes:** Split by `:` produces valid elements
**Reality:** Empty strings produce undefined values

### L2. Regex Capture Group Undefined
**File:** `src/core/auto-tagger.js:106-110`
**Assumes:** `m[1]` always exists
**Reality:** Edge cases could produce undefined

### L3. CLI Argument Assumption
**File:** `src/cli.js:127-128`
**Assumes:** Command argument present
**Reality:** Handled by fallback, but assumption exists

### L4. Prototype Pollution Risk
**File:** `src/core/persistence.js:44`
**Assumes:** Pattern objects have safe properties only
**Reality:** `__proto__`/`constructor` keys could pollute prototype chain

### L5. Promise Rejection Escape
**File:** `src/core/sandbox.js:283-288`
**Assumes:** execSync catches all errors
**Reality:** Nested async operations could escape try-catch

### L6. Concept Cluster Regex Word Boundary
**File:** `src/search/embeddings.js:187-209`
**Assumes:** Escaped special chars work with `\b` boundaries
**Reality:** `\b\+\b` doesn't match `+` correctly

### L7. Role Validation Without Normalization
**File:** `src/auth/teams.js:146-147`
**Assumes:** Role string matches canonical format
**Reality:** Case differences cause inconsistent validation

### L8. MD5 Cache Key Collision
**File:** `src/search/embeddings.js:346`
**Assumes:** MD5 is collision-resistant for cache keys
**Reality:** MD5 is cryptographically broken; theoretical collision risk

### L9. Unbounded Code String in Search
**File:** `src/search/embedding-engine.js:255,418`
**Assumes:** 500-char slice per item is bounded
**Reality:** 10,000 items × 500 chars = 5MB per search, no streaming

### L10. Coherency Score Upper Bound Missing
**File:** `src/health/monitor.js:148-154`
**Assumes:** Scores are 0-1
**Reality:** Scores > 1.0 silently bucketed into '0.8-1.0'

### L11. Self-Optimize Slice Threshold
**File:** `src/evolution/self-optimize.js:490-495`
**Assumes:** `> 10` check is correct
**Reality:** Off-by-one in messaging (uses `>` not `>=`)

### L12. scryptSync Default Parameters
**File:** `src/cloud/server.js:62-74`
**Assumes:** Default scrypt cost parameters are sufficient
**Reality:** No configurable cost; timing leak in early length check before timingSafeEqual

### L13. Silent Partial Embedding
**File:** `src/compression/holographic.js:70-74`
**Assumes:** builtinEmbed returns 64-dim vector
**Reality:** Short vectors silently produce partial initialization with no logging

### L14. Single Agent Consensus Semantics
**File:** `src/swarm/consensus.js:71-73`
**Assumes:** Default 1.0 agreement for solo agent is meaningful
**Reality:** Misrepresents consensus quality

---

## Pattern Categories Distribution

| Category | Count | Examples |
|----------|-------|---------|
| Logic | 14 | Inverted formulas, off-by-one, incorrect algorithms |
| Null/State | 12 | Undefined access, uninitialized returns, missing guards |
| Security | 7 | XSS, command injection, path traversal, DoS |
| Error Handling | 7 | Unhandled throws, silent failures, missing try-catch |
| Type/Coercion | 5 | Boolean/number confusion, string assumptions |
| Concurrency | 4 | Race conditions, async cache corruption |
| Integration | 4 | Cross-machine failures, API contract violations |
| Memory/Performance | 3 | Unbounded growth, cache leaks |

---

## Meta-Observations

1. **The Most Common Assumption Mismatch:** "This value will always exist" — null/undefined access accounts for ~21% of all bugs found.

2. **The Most Dangerous Assumption Mismatch:** "Input from our own database is safe" — the XSS in dashboard (C2) and unvalidated pattern data demonstrate that internal data boundaries are not security boundaries.

3. **The Most Subtle Assumption Mismatch:** "This formula is correct" — the consensus agreement inversion (C3) and bigram similarity error (M19) produce wrong results silently, never throwing errors.

4. **The Systemic Pattern:** Many bugs share the form "works for the common case, breaks for the edge case." The code handles the 95% path well but assumes the 5% path doesn't exist.

5. **Information Theory Connection:** Each bug represents an entropy gap — the code's model of reality has lower entropy (fewer possible states) than actual reality. The quantum debugger's strength is precisely in detecting these entropy mismatches.

---

## Recommendations

### Immediate (Critical)
1. Fix sandbox.js undefined result variable
2. Escape matchedConcepts in dashboard client-script.js
3. Correct consensus agreement formula
4. Handle Promise.allSettled rejections in cross-scoring
5. Guard computePeerScores against empty input

### This Sprint (High)
6. Wrap JSON.parse calls in sqlite.js with try-catch
7. Add covenant principle existence guards
8. Validate pythonBin path before execFile
9. Bound form parsing parameter count
10. Fix rate limiter memory exhaustion vulnerability

### Next Sprint (Medium)
11. Add null guards to all array[0] accesses
12. Implement atomic file writes for session tracker
13. Fix bigram similarity formula
14. Add content-type validation to HTTP client
15. Sanitize tag strings for path traversal
