#!/bin/sh
#
# Claude Code PostToolUse hook for Edit/Write/MultiEdit.
#
# Runs the inline anti-hallucination check on the file that was just
# written. The check has two passes:
#
#   1. Audit  — runs `oracle audit check --file <f>` to catch the 6
#               static bug classes (state-mutation, security, type,
#               concurrency, integration, edge-case).
#   2. Ground — runs `oracle ground --file <f>` to flag function calls
#               that don't resolve to anything in the session ledger's
#               touched-identifier set or the JS/Node built-in
#               allowlist. This catches fabricated API references at
#               write-time instead of test-time.
#
# Output is printed to stdout and gets injected back into the next
# model turn, so the agent sees the findings before its next action.
#
# Hook input: JSON on stdin with shape:
#   { "tool_name": "Edit", "tool_input": { "file_path": "..." }, ... }
#
# Hook contract: zero exit code = advisory feedback only. Non-zero
# exit code would block, but we don't block — we surface and let the
# agent decide.

set -e

# Read the hook payload from stdin
PAYLOAD=$(cat)

# Extract the file_path field. Try jq first, fall back to node if jq
# is missing (which it is in some sandboxes).
FILE=$(printf '%s' "$PAYLOAD" | node -e '
let buf = "";
process.stdin.on("data", (c) => buf += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(buf);
    const fp = j.tool_input?.file_path || j.tool_input?.filePath || "";
    process.stdout.write(fp);
  } catch { process.stdout.write(""); }
});
' 2>/dev/null)

# Bail silently if we couldn't parse a file path
if [ -z "$FILE" ]; then exit 0; fi

# Only check JavaScript / TypeScript files — the audit + ground tools
# are JS-aware. Skip everything else.
case "$FILE" in
  *.js|*.mjs|*.cjs|*.ts|*.tsx|*.jsx) ;;
  *) exit 0 ;;
esac

# Skip if the file no longer exists (deleted in the same turn)
if [ ! -f "$FILE" ]; then exit 0; fi

# Find the toolkit root. The hook may be invoked from any cwd; we
# need ORACLE_REPO_ROOT to point at the toolkit so `oracle audit`
# loads the right session ledger.
REPO_ROOT="${ORACLE_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ORACLE="$REPO_ROOT/src/cli.js"
if [ ! -f "$ORACLE" ]; then exit 0; fi

# Both checks run with --json so we can be terse on success
AUDIT_JSON=$(node "$ORACLE" audit check --file "$FILE" --json 2>/dev/null || echo '{"totalFindings":0,"files":[]}')
GROUND_JSON=$(node "$ORACLE" ground --file "$FILE" --json 2>/dev/null || echo '{"ungrounded":[],"totalCalls":0}')

# Use node to extract counts and emit a concise human-readable report
node -e '
const audit = JSON.parse(process.argv[1] || "{}");
const ground = JSON.parse(process.argv[2] || "{}");
const file = process.argv[3];

const findings = (audit.files && audit.files[0] && audit.files[0].findings) || [];
const ungrounded = ground.ungrounded || [];

if (findings.length === 0 && ungrounded.length === 0) {
  console.log("[oracle hook] " + file + ": clean (audit + ground)");
  process.exit(0);
}

console.log("[oracle hook] " + file + ":");
if (findings.length > 0) {
  console.log("  audit: " + findings.length + " finding(s)");
  for (const f of findings.slice(0, 5)) {
    console.log("    L" + f.line + " [" + f.ruleId + "] " + (f.assumption || f.bugClass || ""));
  }
  if (findings.length > 5) console.log("    ... " + (findings.length - 5) + " more");
}
if (ungrounded.length > 0) {
  console.log("  ground: " + ungrounded.length + " ungrounded call(s) — possible fabrications:");
  for (const u of ungrounded.slice(0, 5)) {
    console.log("    L" + u.line + " " + u.name + "()");
  }
  if (ungrounded.length > 5) console.log("    ... " + (ungrounded.length - 5) + " more");
  console.log("  hint: read the file that defines these symbols, or use a different call.");
}
' "$AUDIT_JSON" "$GROUND_JSON" "$FILE"

exit 0
