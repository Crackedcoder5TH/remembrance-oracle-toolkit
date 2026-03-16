/**
 * Meta-Pattern 13 Fix: Missing Action Parameter Crashes MCP Debug Handler
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "args.action is always provided by the MCP client"
 * Reality:    "MCP clients can send {} with no action field, causing
 *              the switch to fall through to default and throw, which
 *              crashes the MCP response instead of returning an error"
 *
 * Bug class: Edge case — missing optional parameter treated as required
 * Location:  src/mcp/handlers.js:oracle_debug() line 88
 *            const action = args.action; ← undefined if not provided
 *            switch (action) { ... default: throw new Error(...) }
 * Severity:  MEDIUM — MCP handler crashes break the protocol contract;
 *            the error message says "Unknown debug action: undefined"
 *            instead of listing valid actions
 *
 * Also affects: oracle_maintain() which does `args.action || 'full-cycle'`
 *   (correctly defaults) but oracle_debug does NOT default.
 *
 * Fix: Default to 'stats' (the safe read-only action) when no action given.
 */

// Before (broken):
// oracle_debug(oracle, args) {
//   const action = args.action;  ← no default
//   switch (action) { ... default: throw ... }
// }

// After (fixed):
function safeDebugAction(args) {
  const action = (args && args.action) || 'stats';
  const validActions = new Set(['capture', 'search', 'feedback', 'stats', 'grow', 'patterns']);
  if (!validActions.has(action)) {
    return {
      valid: false,
      action,
      error: `Unknown debug action: "${action}". Valid: ${[...validActions].join(', ')}`,
    };
  }
  return { valid: true, action, error: null };
}

module.exports = { safeDebugAction };
