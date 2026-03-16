# Pattern Assumption Mismatch — Full Codebase Audit

> **THE META PATTERN**: What code assumes ≠ What reality is
> Every bug is an assumption mismatch. This document catalogs all discovered mismatches.

## Previous Meta Patterns (1-5)

| # | File | Assumption | Reality | Class |
|---|------|------------|---------|-------|
| 1 | cache-fingerprint | "Count alone identifies cache state" | "Same count, different patterns = stale" | State |
| 2 | timing-safe-jwt | "String === is safe for secrets" | "Timing side-channel leaks bytes" | Security |
| 3 | queue-eviction | "Hard limit is the only option" | "Priority eviction preserves important work" | Logic |
| 4 | backoff-cap | "Exponential growth is bounded" | "2^10 * base = 1024x original delay" | Performance |
| 5 | toctou | "Check-then-set is atomic" | "Re-entrant calls interleave" | Concurrency |

## New Meta Patterns (6-16)

### 6. Negotiation Sort Mutation
- **File**: `debug-fix-negotiation-sort-mutation.js`
- **Assumption**: "Array.sort() is a pure operation"
- **Reality**: "sort() mutates the original array in-place"
- **Location**: `src/cloud/negotiation.js:resolveConflict()`
- **Class**: State mutation
- **Severity**: HIGH

### 7. Daemon Lock Not Released on Throw
- **File**: `debug-fix-daemon-lock-not-released-on-throw.js`
- **Assumption**: "Lock release code after try/catch always runs"
- **Reality**: "If catch throws, code after it is skipped (no finally)"
- **Location**: `src/evolution/daemon.js:runCycle()`
- **Class**: State — lock leak
- **Severity**: CRITICAL

### 8. Sandbox Code Injection via Template Literal
- **File**: `debug-fix-sandbox-code-injection.js`
- **Assumption**: "Code interpolated into template string stays inside the string"
- **Reality**: "Backticks and ${} in code escape the template boundary"
- **Location**: `src/core/sandbox.js:sandboxJS()`, `sandboxPython()`
- **Class**: Security — sandbox escape
- **Severity**: CRITICAL

### 9. Unprotected JSON.parse in Audit Log
- **File**: `debug-fix-json-parse-audit-log.js`
- **Assumption**: "Database detail column always contains valid JSON"
- **Reality**: "Corruption, manual edits, encoding errors produce malformed JSON"
- **Location**: `src/store/sqlite.js:getAuditLog()`
- **Class**: Data — one bad row crashes entire query
- **Severity**: MEDIUM

### 10. Hash Collision in Entry ID Generation
- **File**: `debug-fix-entry-id-collision.js`
- **Assumption**: "Hash(code + timestamp) is unique"
- **Reality**: "Same code + same millisecond = identical hash = collision"
- **Location**: `src/store/sqlite.js:addEntry()`, `_insertPattern()`
- **Class**: Logic — data loss on collision
- **Severity**: MEDIUM

### 11. NaN Propagation in Coherency Scoring
- **File**: `debug-fix-coherency-nan-propagation.js`
- **Assumption**: "Division always produces a valid number"
- **Reality**: "0/0 = NaN, which breaks all comparisons (NaN < x is false)"
- **Location**: `src/store/sqlite.js:recordPatternUsage()`, `refreshAllCoherency()`
- **Class**: Type — NaN is not a number
- **Severity**: HIGH

### 12. Silent Null on Network Error
- **File**: `debug-fix-fetchjson-silent-null.js`
- **Assumption**: "Callers always check _fetchJson() for null"
- **Reality**: "Some callers access .patterns on null, causing TypeError"
- **Location**: `src/cloud/negotiation.js:_fetchJson()` + callers
- **Class**: Integration — error swallowed at boundary
- **Severity**: MEDIUM

### 13. Missing Action Crashes MCP Debug Handler
- **File**: `debug-fix-mcp-debug-missing-action.js`
- **Assumption**: "args.action is always provided by MCP client"
- **Reality**: "Empty {} produces undefined action, crashes switch"
- **Location**: `src/mcp/handlers.js:oracle_debug()`
- **Class**: Edge case — missing parameter
- **Severity**: MEDIUM

### 14. 32-bit Integer Overflow in _quickHash
- **File**: `debug-fix-quickhash-collision-32bit.js`
- **Assumption**: "DJB2 hash produces well-distributed unique values"
- **Reality**: "32-bit truncation + base-36 = high collision rate at scale"
- **Location**: `src/cloud/negotiation.js:_quickHash()`
- **Class**: Logic — false equality in comparisons
- **Severity**: LOW-MEDIUM

### 15. Regex Bypass in Git Range Validation
- **File**: `debug-fix-regex-range-validation.js`
- **Assumption**: "Regex validates git ranges against injection"
- **Reality**: "Allows slashes and dots that could be exploited if shell is used"
- **Location**: `src/ci/auto-register.js:getChangedFiles()`
- **Class**: Security — insufficient validation
- **Severity**: LOW (mitigated by execFileSync)

### 16. Unbounded Memory in Completed Tasks
- **File**: `debug-fix-completed-array-unbounded-growth.js`
- **Assumption**: "Capping at 100 completed tasks bounds memory"
- **Reality**: "Each task retains full LLM output; 100 * 50KB = 5MB permanent"
- **Location**: `src/swarm/task-queue.js:_executeTask()`
- **Class**: Performance — memory leak
- **Severity**: MEDIUM

## Classification by Bug Type

| Bug Class | Patterns | Count |
|-----------|----------|-------|
| State | 1, 6, 7 | 3 |
| Security | 2, 8, 15 | 3 |
| Logic | 3, 10, 14 | 3 |
| Performance | 4, 16 | 2 |
| Concurrency | 5 | 1 |
| Type | 11 | 1 |
| Data | 9 | 1 |
| Integration | 12 | 1 |
| Edge case | 13 | 1 |

## The Meta Pattern at Work

Every single bug above is the same pattern:

> **Code assumes X** ≠ **Reality is Y**

- **#6**: Assumes sort() returns new array ≠ sort() mutates in place
- **#7**: Assumes code after catch always runs ≠ catch can throw too
- **#8**: Assumes interpolated code stays contained ≠ backticks escape
- **#9**: Assumes database values are well-formed ≠ corruption happens
- **#10**: Assumes timestamp provides uniqueness ≠ same millisecond = same hash
- **#11**: Assumes division produces numbers ≠ 0/0 = NaN
- **#12**: Assumes callers check for null ≠ some don't
- **#13**: Assumes parameters are provided ≠ clients send empty objects
- **#14**: Assumes hash distribution is sufficient ≠ 32-bit birthday paradox
- **#15**: Assumes regex covers attack surface ≠ slash and dot pass through
- **#16**: Assumes count bounds memory ≠ size per item matters more
