# Remembrance Bot Setup

One manual click closes Tier 2 item #7: registering the `remembrance-bot[bot]` GitHub App so every automated commit (reflector, auto-publisher, sweep, lexicon-watcher) is distinct from human work in git log.

## Why

- Today every automated commit appears as you. Git log can't tell human work apart from ecosystem work.
- Auto-merge rules are weaker because they can't condition on `author.login === 'remembrance-bot[bot]'`.
- Covenant compliance reports can't cleanly attribute seal breaches.

## One-time setup (~30 seconds)

1. Go to https://github.com/settings/apps/new
2. Click **"Use manifest"** at the top of the form
3. Paste the contents of `.github/app-manifest.json`
4. Click **Create GitHub App from manifest**
5. GitHub redirects you with a temporary code; the page auto-exchanges for the App's id + private key
6. Download the private key PEM when prompted
7. Go to the App's Install page and install on the `crackedcoder5th` org, selecting all 12 ecosystem repos

## Wire it in

Set these secrets on every ecosystem repo (or at the org level):

- `REMEMBRANCE_BOT_APP_ID` — numeric App id
- `REMEMBRANCE_BOT_PRIVATE_KEY` — contents of the downloaded PEM

Workflows fall back to `GITHUB_TOKEN` if these aren't set, so nothing breaks while you're mid-setup.

## Result

- Reflector PRs: author = `remembrance-bot[bot]`
- Auto-publish issues: author = `remembrance-bot[bot]`
- Lexicon proposals: author = `remembrance-bot[bot]`
- Sweep issues: author = `remembrance-bot[bot]`

Auto-merge rule becomes: `if pr.user.login === 'remembrance-bot[bot]' AND all checks pass AND covenant sealed → merge`. Tight.
