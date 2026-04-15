#!/bin/sh
#
# Claude Code Stop hook — final anti-hallucination gate.
#
# This runs when Claude Code is about to end a turn (Stop event). It's
# the last chance to catch fabrications that slipped past the
# per-edit PostToolUse hook — or that were introduced by rapid-fire
# edits where the agent didn't read the affected symbols in between.
#
# Algorithm:
#   1. Read the current compliance session's filesWritten list.
#   2. For each file the agent wrote this turn, run:
#        - oracle audit check --file <f> --json
#        - oracle ground --file <f> --json
#   3. If any file has audit findings OR ungrounded calls, print the
#      full summary and return decision=block to keep Claude alive
#      for one more correction round.
#   4. Honor a session bypass: if the agent has recorded a
#      `session bypass` for this turn, skip the gate.
#
# Claude Code Stop hook protocol:
#   stdin:  { "session_id": "...", "stop_hook_active": bool }
#   stdout: plain text → shown to user
#   exit 0 with JSON on stdout containing {"decision":"block",
#          "reason":"..."} → keeps Claude in the loop with the reason
#          injected as a system message
#   non-zero exit → error shown to user
#
# We only block when there are REAL problems. A clean session exits 0
# with empty stdout (silent success).

set -e

PAYLOAD=$(cat)

# Parse stop_hook_active — if we've already blocked once, don't block
# again. Prevents infinite loops.
ALREADY_ACTIVE=$(printf '%s' "$PAYLOAD" | node -e '
let buf = "";
process.stdin.on("data", (c) => buf += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(buf);
    process.stdout.write(j.stop_hook_active ? "1" : "0");
  } catch { process.stdout.write("0"); }
});
' 2>/dev/null)

if [ "$ALREADY_ACTIVE" = "1" ]; then
  # Already blocked once this turn — let the agent finish.
  exit 0
fi

REPO_ROOT="${ORACLE_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ORACLE="$REPO_ROOT/src/cli.js"
if [ ! -f "$ORACLE" ]; then exit 0; fi

# Fetch the list of files written this session. The compliance
# ledger tracks this in the session state under filesWritten.
WRITTEN=$(node "$ORACLE" session status --json 2>/dev/null | node -e '
let buf = "";
process.stdin.on("data", (c) => buf += c);
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(buf);
    const files = (j.session && j.session.filesWritten) || [];
    // Filter to JS/TS only and existing files
    const fs = require("fs");
    const keep = files.filter((f) => /\.(js|mjs|cjs|ts|tsx|jsx)$/.test(f) && fs.existsSync(f));
    process.stdout.write(keep.join("\n"));
  } catch { /* silent */ }
});
' 2>/dev/null)

if [ -z "$WRITTEN" ]; then
  # No files to check — clean exit.
  exit 0
fi

# Run both gates on every written file and collect problems.
PROBLEM_COUNT=0
PROBLEM_REPORT=""
for FILE in $WRITTEN; do
  [ -f "$FILE" ] || continue

  AUDIT_JSON=$(node "$ORACLE" audit check --file "$FILE" --json 2>/dev/null || echo '{"totalFindings":0,"files":[]}')
  GROUND_JSON=$(node "$ORACLE" ground --file "$FILE" --json 2>/dev/null || echo '{"ungrounded":[],"totalCalls":0}')

  FILE_REPORT=$(node -e '
    const audit = JSON.parse(process.argv[1] || "{}");
    const ground = JSON.parse(process.argv[2] || "{}");
    const file = process.argv[3];
    const findings = (audit.files && audit.files[0] && audit.files[0].findings) || [];
    const ungrounded = ground.ungrounded || [];
    if (findings.length === 0 && ungrounded.length === 0) {
      process.stdout.write("");
      process.exit(0);
    }
    const parts = ["  " + file + ":"];
    if (findings.length > 0) {
      parts.push("    audit: " + findings.length + " finding(s)");
      for (const f of findings.slice(0, 3)) {
        parts.push("      L" + f.line + " [" + f.ruleId + "]");
      }
      if (findings.length > 3) parts.push("      ... " + (findings.length - 3) + " more");
    }
    if (ungrounded.length > 0) {
      parts.push("    ground: " + ungrounded.length + " ungrounded call(s)");
      for (const u of ungrounded.slice(0, 3)) {
        parts.push("      L" + u.line + " " + u.name + "()");
      }
      if (ungrounded.length > 3) parts.push("      ... " + (ungrounded.length - 3) + " more");
    }
    process.stdout.write(parts.join("\n"));
  ' "$AUDIT_JSON" "$GROUND_JSON" "$FILE")

  if [ -n "$FILE_REPORT" ]; then
    PROBLEM_COUNT=$((PROBLEM_COUNT + 1))
    PROBLEM_REPORT="$PROBLEM_REPORT
$FILE_REPORT"
  fi
done

if [ "$PROBLEM_COUNT" = "0" ]; then
  # All clean — exit silently so the turn ends normally.
  exit 0
fi

# Emit a JSON decision to keep Claude alive for one correction round.
# The `reason` field gets shown to the agent as a system message so
# it can address the findings in a follow-up response.
REASON=$(printf 'Stop-hook final verification: %d file(s) have outstanding issues.\nAddress these before ending the turn, or record a bypass if they are known-acceptable:\n%s\n\nRun `oracle audit check --file <f>` or `oracle ground --file <f>` for details.' "$PROBLEM_COUNT" "$PROBLEM_REPORT")

node -e '
const reason = process.argv[1];
console.log(JSON.stringify({ decision: "block", reason }));
' "$REASON"

exit 0
