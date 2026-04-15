#!/bin/sh
#
# Claude Code PostToolUse hook for Read.
#
# Records the file the agent just read into the compliance session
# ledger AND extracts every identifier from the file into the session's
# touchedIdentifiers set. The next `oracle ground` call uses this set
# as ground truth to decide whether function calls in newly-written
# files are real or fabricated.
#
# Without this hook, the grounding check would have an empty known-set
# and would flag almost every external function call as ungrounded.
# With it, the agent's read history becomes the ground truth.
#
# Hook input: JSON on stdin with shape:
#   { "tool_name": "Read", "tool_input": { "file_path": "..." }, ... }

set -e

PAYLOAD=$(cat)

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

if [ -z "$FILE" ]; then exit 0; fi
if [ ! -f "$FILE" ]; then exit 0; fi

# Only track JS/TS reads — that's what the grounding tokenizer handles.
case "$FILE" in
  *.js|*.mjs|*.cjs|*.ts|*.tsx|*.jsx) ;;
  *) exit 0 ;;
esac

REPO_ROOT="${ORACLE_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ORACLE="$REPO_ROOT/src/cli.js"
if [ ! -f "$ORACLE" ]; then exit 0; fi

# Silently record. We don't want every Read tool call to dump output
# in the agent's context — the ledger is the side effect.
node "$ORACLE" session record-read --file "$FILE" --json >/dev/null 2>&1 || true

exit 0
