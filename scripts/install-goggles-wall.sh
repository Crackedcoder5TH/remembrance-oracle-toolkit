#!/usr/bin/env sh
# install-goggles-wall.sh — make the goggles wall reach an agent that the repo
# hooks cannot.
#
# WHY: a remote / web Claude Code session does NOT execute the repo's own
# .claude/settings.json PreToolUse hook (tested: a raw bypass runs unrefused
# from the repo root). It DOES honor the user-level ~/.claude/settings.json,
# loaded at the start of each turn. So this installs the goggles-bash-hook
# there — after which every Bash command in the session is screened and a
# substrate bypass (np.corrcoef, a hand-rolled cosine, a raw service curl, a
# /tmp measurement script, running the raw cli.js instead of the goggles) is
# DENIED with arrows to the front door. Proven live: it refuses the bypass on
# the very next command.
#
# Idempotent + merge-safe: it never clobbers other keys in ~/.claude/settings.json.
#
# DURABILITY: the container is ephemeral, so run this at session start. Either
# (a) add `sh <toolkit>/scripts/install-goggles-wall.sh` to your code.claude.com
# environment SETUP SCRIPT (runs on every container build — the durable path),
# or (b) it is already invoked from scripts/ecosystem-orient.sh (the SessionStart
# orient step) for environments that run repo SessionStart hooks.

set -eu

HOOK="${ORACLE_TOOLKIT:-/home/user/remembrance-oracle-toolkit}/src/tools/goggles-bash-hook.js"
SETTINGS_DIR="$HOME/.claude"
SETTINGS="$SETTINGS_DIR/settings.json"

if [ ! -f "$HOOK" ]; then
  # locate the toolkit relative to this script if the default path is wrong
  HERE=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
  HOOK="$HERE/src/tools/goggles-bash-hook.js"
fi
if [ ! -f "$HOOK" ]; then
  echo "install-goggles-wall: cannot find goggles-bash-hook.js; not installing" >&2
  exit 0
fi

mkdir -p "$SETTINGS_DIR"
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"

# Merge the PreToolUse Bash hook in without disturbing existing settings.
HOOK="$HOOK" SETTINGS="$SETTINGS" node -e '
  const fs = require("fs");
  const p = process.env.SETTINGS, hook = process.env.HOOK;
  let s = {};
  try { s = JSON.parse(fs.readFileSync(p, "utf8") || "{}"); } catch (_) { s = {}; }
  s.hooks = s.hooks || {};
  const cmd = "node " + hook + " || true";
  const entries = Array.isArray(s.hooks.PreToolUse) ? s.hooks.PreToolUse : (s.hooks.PreToolUse = []);
  // already installed? (same hook command anywhere in a Bash matcher)
  const present = entries.some((e) => (e.matcher === "Bash" || e.matcher === "" || e.matcher == null)
    && Array.isArray(e.hooks) && e.hooks.some((h) => typeof h.command === "string" && h.command.includes("goggles-bash-hook.js")));
  if (!present) {
    entries.push({ matcher: "Bash", hooks: [{ type: "command", command: cmd }] });
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
    console.log("goggles wall installed at " + p + " (fires on next command)");
  } else {
    console.log("goggles wall already present at " + p);
  }
'
