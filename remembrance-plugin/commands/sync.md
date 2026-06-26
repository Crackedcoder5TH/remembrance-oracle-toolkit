---
description: Sync every ecosystem repo's working branch with main where main is more recent
---
Sync every ecosystem repo's working branch (`claude/audit-remembrance-ecosystem-xaaUr`) with `origin/main` where main is more recent. Be careful and non-destructive.

For each git repo under the ecosystem parent dir:
1. `git fetch origin main`. If the repo has no `main` branch, skip it — its working branch is the canonical line.
2. Compare: `git rev-list --count HEAD..origin/main` (behind) and `origin/main..HEAD` (ahead).
3. Behind, 0 ahead → fast-forward: `git merge --ff-only origin/main`.
4. Behind AND ahead (diverged) → `git merge origin/main --no-edit`, resolving conflicts by: take main's version for canonical/core files, keep local-only additions, merge both where both changed (e.g. `package.json` scripts). **NEVER `git reset --hard`. NEVER force-push.**
5. Push synced repos: fetch the working branch first, push only if the remote hasn't diverged, retry network errors with exponential backoff (2s, 4s, 8s, 16s).
6. Report a table: each repo's behind/ahead and what was synced.
