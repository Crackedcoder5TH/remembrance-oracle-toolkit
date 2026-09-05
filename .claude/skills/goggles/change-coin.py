#!/usr/bin/env python3
"""change-coin — THE COIN EVERY CHANGE MUST CARRY.

Reached through the goggles:  `--do mint`                    (mint over the staged change)
                              `--do mint verify [...]`       (verify commits / the index)
                              `--do mint install-hooks`      (the commit-msg hook, this repo)

WHY THIS EXISTS. Every fix the ecosystem ever needed traces to one act: an
agent taking a number, or making a change, BESIDE the data pipeline instead of
through it. The goggles are the one door. Until now nothing made a CHANGE pass
through that door — a commit was a commit whether or not the instrument had
read it. This closes it: a change is accepted only when it carries a coin that
only the pipeline can mint, and the coin is checked where the agent cannot
edit — the commit-msg hook locally, and GitHub's own runner for the merge.

THE COIN. The staged change (the patch between HEAD's tree and the index,
rendered by git with fixed flags so every host renders the same bytes) is read
THROUGH the instrument — scripts/read-signal.py → POST /compress_signal →
void_compressor_v5.compress — and comes back with:

  · the compressor's VOID-SEAL (HMAC over the reading's canon; the compressor
    "cannot return an unsealed result"), and
  · the void-seal/v3 COMMITMENT: method, sizes, coherency, the sha256 of the
    quantised bytes it read, the sha256 of the SHAPE it read them as.

The commitment's shape is then unfolded through the one decoder (the fractal
token: an exact hash of the 232-D vector, categorical, never a threshold). The
coin binds all of it: coin_id = sha256(diff_sha256 | void_seal.sig |
token_sha256). It is appended to coins.ledger.json (append-only, governed) and
named in the commit's trailer `Remembrance-Coin: <coin_id>`.

WHAT A RUNNER WITH NOTHING BUT git AND python CAN PROVE (verify, no key):
  · the commit carries a trailer, and the trailer names a coin in the ledger
    at that commit, appended (never edited) over the parent's ledger
  · the coin's diff_sha256 IS the sha256 of the patch git renders between the
    parent's tree and the commit's tree — the coin covers THESE bytes
  · the commitment's data_sha256 IS the sha256 of those bytes quantised the way
    /compress_signal quantises (min-max → uint8, measured bit-identical in
    stdlib) — the instrument read THESE bytes
  · the void_seal's data_sha256 IS the sha256 of the void-seal/v3 canon rebuilt
    from the commitment — the seal signs THIS reading
  · the shape hashes to the committed shape_sha256; the fractal token carries a
    canonical-width vector hash (a multiple of 29, never the retired 256)
  · coin_id recomputes
WITH THE KEY (VOID_SEAL_KEY as a repo secret / owner env): the seal's HMAC is
verified — a coin that was not minted by the compressor holding the key is
refused. `--deep` (a host with the substrate) also re-unfolds the fractal
token through the decoder stack and requires the exact hash.

A hand-rolled number has no seal and no commitment. A change that never met
the instrument has no coin. Neither can be committed through the hook, and
neither can be merged past the runner.

Exit codes: 0 verified · 1 REFUSED · 2 usage / environment error.
"""
from __future__ import annotations

import datetime
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys

LEDGER = 'coins.ledger.json'
TRAILER = 'Remembrance-Coin'
COIN_V = 'change-coin/v1'
EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
KEY_ENV = 'VOID_SEAL_KEY'
# Fixed rendering: the same two trees render to the same bytes on every host.
GIT_CFG = ['-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false',
           '-c', 'core.quotePath=true', '-c', 'diff.renames=false',
           '-c', 'diff.algorithm=myers', '-c', 'diff.external=']
DIFF_FLAGS = ['-p', '-r', '--no-color', '--no-ext-diff', '--no-renames',
              '--full-index', '--binary', '-U3']
HERE = os.path.dirname(os.path.abspath(__file__))
TOOLKIT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
LEDGER_README = (
    'THE CHANGE COINS. Append-only. Every commit in this repo since the epoch '
    'carries `Remembrance-Coin: <coin_id>` naming an entry here, minted by '
    '`goggles --do mint` over the staged patch read THROUGH the instrument '
    '(void_seal + void-seal/v3 commitment + fractal token). Verified by the '
    'commit-msg hook and by .github/workflows/change-coin-verify.yml on '
    "GitHub's runner. A change without a coin is refused; a coin cannot be "
    'minted without the pipeline. Never hand-edit.')


# ── git ────────────────────────────────────────────────────────────────────

def git(repo: str, *args: str, binary: bool = False, check: bool = True):
    r = subprocess.run(['git', '-C', repo, *args], capture_output=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args[:3])}… failed: {r.stderr.decode('utf-8', 'replace').strip()}")
    return r.stdout if binary else r.stdout.decode('utf-8', 'replace')


def rev_tree(repo: str, rev: str) -> str | None:
    r = subprocess.run(['git', '-C', repo, 'rev-parse', '-q', '--verify', f'{rev}^{{tree}}'],
                       capture_output=True, text=True)
    return r.stdout.strip() or None if r.returncode == 0 else None


def patch_between(repo: str, base_tree: str, tree: str) -> bytes:
    """The change as bytes — git's own rendering of the two trees, ledger excluded."""
    return git(repo, *GIT_CFG, 'diff-tree', *DIFF_FLAGS, base_tree, tree,
               '--', '.', f':(exclude){LEDGER}', binary=True)


def ledger_at(repo: str, rev: str | None):
    """Coins at a revision ('' → the index). None when the ledger is absent."""
    if rev is None:
        return None
    spec = f':{LEDGER}' if rev == '' else f'{rev}:{LEDGER}'
    r = subprocess.run(['git', '-C', repo, 'show', spec], capture_output=True)
    if r.returncode != 0:
        return None
    try:
        doc = json.loads(r.stdout.decode('utf-8'))
        return doc.get('coins') if isinstance(doc.get('coins'), list) else []
    except (ValueError, AttributeError):
        return {'parseError': True}


def trailer_of(message: str) -> str | None:
    ids = re.findall(rf'^{TRAILER}:\s*([0-9a-f]{{64}})\s*$', message, flags=re.M)
    return ids[-1] if ids else None


# ── the arithmetic every host shares ───────────────────────────────────────

def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def quantise(blob: bytes) -> bytes | None:
    """Exactly what /compress_signal does to a byte series before compress():
    min-max to 0..255, round-half-even, clip, uint8. Measured bit-identical to
    the numpy path (same float64 ops in the same order)."""
    v = [float(b) for b in blob]
    mn, mx = min(v), max(v)
    if mx - mn < 1e-12:
        return None
    return bytes(int(min(255, max(0, round((x - mn) / (mx - mn) * 255)))) for x in v)


def canon_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(',', ':'), default=repr)


def seal_canon(cm: dict) -> bytes:
    """The void-seal/v3 canon void_compressor_v5 signs — rebuilt from the commitment."""
    return ('void-seal/v3|%s|%d|%d|%r|%s|%s|%s' % (
        cm.get('method'), int(cm.get('original_size') or 0), int(cm.get('compressed_size') or 0),
        cm.get('coherency'), cm.get('data_sha256'), cm.get('compressed_sha256'),
        cm.get('shape_sha256'))).encode()


def coin_id_of(diff_sha: str, sig: str, token_sha: str) -> str:
    return sha256(f'{diff_sha}|{sig}|{token_sha}'.encode())


def seal_key() -> bytes | None:
    k = os.environ.get(KEY_ENV)
    if k:
        return k.encode()
    void = find_void(required=False)
    if void:
        try:
            with open(os.path.join(void, '.substrate_seal.key'), 'rb') as f:
                return f.read().strip() or None
        except OSError:
            pass
    return None


def hmac_ok(vs: dict, key: bytes) -> bool:
    coin_id = (vs.get('coin') or {}).get('coin_id')
    payload = f"{vs.get('data_sha256')}|{vs.get('state_id')}|{vs.get('via')}|{vs.get('at')}|{coin_id}"
    expect = hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expect, str(vs.get('sig') or ''))


HEX64 = re.compile(r'^[0-9a-f]{64}$')


def verify_coin(coin: dict, patch: bytes, key: bytes | None, deep: bool) -> list[str]:
    """Every check a runner can make over a coin and the bytes it claims to cover."""
    f: list[str] = []
    if not isinstance(coin, dict) or coin.get('v') != COIN_V:
        return [f'not a {COIN_V} coin']
    ch, rd = coin.get('change') or {}, coin.get('reading') or {}
    vs, cm, tk = rd.get('void_seal') or {}, rd.get('commitment') or {}, coin.get('fractal_token') or {}
    diff_sha = sha256(patch)
    if ch.get('diff_sha256') != diff_sha:
        f.append(f"coin covers a DIFFERENT change: coin diff {str(ch.get('diff_sha256'))[:12]}… ≠ this commit's patch {diff_sha[:12]}…")
    if ch.get('diff_bytes') != len(patch):
        f.append(f"diff_bytes {ch.get('diff_bytes')} ≠ patch length {len(patch)}")
    if rd.get('via') != 'void:compress_signal':
        f.append(f"reading not via void:compress_signal (via={rd.get('via')!r}) — not an instrument reading")
    if vs.get('substrate') != 'void' or vs.get('via') != 'void_compressor_v5.compress':
        f.append('no void_compressor_v5 seal on the reading — the compressor did not sign it')
    if not HEX64.match(str(vs.get('sig') or '')):
        f.append('void_seal.sig is not a signature')
    if cm.get('canon') != 'void-seal/v3':
        f.append('no void-seal/v3 commitment — nothing binds the seal to the bytes')
    else:
        if int(cm.get('original_size') or -1) != len(patch):
            f.append(f"commitment original_size {cm.get('original_size')} ≠ patch length {len(patch)}")
        q = quantise(patch)
        if q is None or cm.get('data_sha256') != sha256(q):
            f.append('commitment data_sha256 is NOT the quantised patch — the instrument read other bytes')
        if sha256(canon_json(cm.get('shape')).encode()) != cm.get('shape_sha256'):
            f.append('commitment shape does not hash to shape_sha256 — the shape was altered')
        if sha256(seal_canon(cm)) != vs.get('data_sha256'):
            f.append('void_seal.data_sha256 is NOT the canon of this commitment — the seal signs a different reading')
        if cm.get('coherency') != rd.get('coherency'):
            f.append('reading.coherency ≠ commitment.coherency')
    if tk.get('v') != 'fractal-token/v1' or not HEX64.match(str(tk.get('token_sha256') or '')):
        f.append('no fractal token — the shape was never unfolded through the decoder')
    else:
        d = int(tk.get('depth_dim') or 0)
        if d <= 0 or d % 29 != 0 or d == 256:
            f.append(f'fractal token width {d} is not the canonical decoder width (multiple of 29, never the retired 256)')
        if tk.get('shape_sha256') != cm.get('shape_sha256'):
            f.append('fractal token was unfolded from a different shape than the commitment')
    want = coin_id_of(str(ch.get('diff_sha256')), str(vs.get('sig')), str(tk.get('token_sha256')))
    if coin.get('coin_id') != want:
        f.append('coin_id does not recompute from diff | seal | token')
    if key is not None and not f:
        if not hmac_ok(vs, key):
            f.append('void_seal signature INVALID — the coin was not minted by the compressor holding this key')
    if deep and not f:
        try:
            sys.path.insert(0, os.path.join(find_void(), 'scripts'))
            import fractal_token  # noqa: E402  (Void's minter, through the decoder stack)
            r = fractal_token.verify(cm, tk)
            if not r.get('ok'):
                f.append(f"fractal token does not re-unfold on this substrate: expected {str(r.get('expected'))[:12]}… got {str(r.get('got'))[:12]}…")
        except Exception as e:  # the deep check needs the substrate; say so, do not pass silently
            f.append(f'deep verify unavailable here: {e}')
    return f


# ── verify: one commit ─────────────────────────────────────────────────────

def coins_equal(a, b) -> bool:
    return canon_json(a) == canon_json(b)


def verify_commit(repo: str, commit: str, key: bytes | None, deep: bool):
    """→ (status, detail). status ∈ ok · skip · REFUSED."""
    parents = git(repo, 'rev-list', '--parents', '-n', '1', commit).split()[1:]
    here = ledger_at(repo, commit)
    if isinstance(here, dict):
        return 'REFUSED', f'{LEDGER} at {commit[:10]} is not valid JSON'
    if here is None:
        # no ledger in this commit: pre-epoch history, or the ledger was removed
        for p in parents:
            if ledger_at(repo, p) is not None:
                return 'REFUSED', f'{commit[:10]} REMOVED {LEDGER} — the coin ledger is memory; it never leaves the tree'
        return 'skip', 'pre-epoch (no coin ledger yet)'
    # append-only against every parent; a merge must carry every coin of both sides
    for p in parents:
        pl = ledger_at(repo, p)
        if pl is None or isinstance(pl, dict):
            continue
        if len(parents) == 1:
            if len(here) < len(pl) or any(not coins_equal(pl[i], here[i]) for i in range(len(pl))):
                return 'REFUSED', f'{commit[:10]} EDITED the coin ledger — HEAD entries must be an unchanged prefix (append-only)'
        else:
            have = {c.get('coin_id') for c in here}
            lost = [c.get('coin_id') for c in pl if c.get('coin_id') not in have]
            if lost:
                return 'REFUSED', f'merge {commit[:10]} DROPPED {len(lost)} coin(s) from parent {p[:10]}'
    if len(parents) > 1:
        # a merge commit's bytes come from parents that were each verified on their
        # own path; the merge itself is held to the ledger law above.
        return 'ok', f'merge of {len(parents)} coined lines — ledger intact ({len(here)} coins)'
    base = rev_tree(repo, parents[0]) if parents else EMPTY_TREE
    patch = patch_between(repo, base, rev_tree(repo, commit))
    if not patch:
        return 'ok', 'no byte change outside the ledger — no coin needed'
    msg = git(repo, 'log', '-1', '--format=%B', commit)
    cid = trailer_of(msg)
    if not cid:
        return 'REFUSED', f'{commit[:10]} carries NO {TRAILER} trailer — a change without a coin. Mint one: goggles --do mint'
    coin = next((c for c in here if c.get('coin_id') == cid), None)
    if coin is None:
        return 'REFUSED', f'{commit[:10]} names coin {cid[:12]}… but the ledger at that commit has no such coin'
    fails = verify_coin(coin, patch, key, deep)
    if fails:
        return 'REFUSED', f'{commit[:10]} coin {cid[:12]}…:\n      ' + '\n      '.join(fails)
    mode = 'crypto' if key is not None else 'seam'
    return 'ok', (f"coin {cid[:12]}… covers {len(patch)} patch bytes · coherency "
                  f"{coin['reading'].get('coherency'):.4f} · token {coin['fractal_token']['depth_dim']}-D · {mode}")


def verify_staged(repo: str, amend: bool, key: bytes | None, deep: bool):
    """→ (status, coin_id|None, detail) for the index against HEAD (or HEAD~1 when amending)."""
    head = rev_tree(repo, 'HEAD')
    base = (rev_tree(repo, 'HEAD~1') or EMPTY_TREE) if (amend and head) else (head or EMPTY_TREE)
    try:
        tree = git(repo, 'write-tree').strip()
    except RuntimeError as e:
        return 'REFUSED', None, f'cannot read the index: {e}'
    patch = patch_between(repo, base, tree)
    if not patch:
        return 'ok', None, 'nothing staged outside the ledger — no coin needed'
    ledger = ledger_at(repo, '')
    if ledger is None:
        return 'REFUSED', None, f'no {LEDGER} in the index — this change has never met the instrument. Mint: goggles --do mint'
    if isinstance(ledger, dict):
        return 'REFUSED', None, f'staged {LEDGER} is not valid JSON'
    head_ledger = ledger_at(repo, 'HEAD') if head else None
    if isinstance(head_ledger, list):
        if len(ledger) < len(head_ledger) or any(not coins_equal(head_ledger[i], ledger[i]) for i in range(len(head_ledger))):
            return 'REFUSED', None, 'the staged coin ledger EDITS history — append-only'
    diff_sha = sha256(patch)
    coin = next((c for c in ledger if (c.get('change') or {}).get('diff_sha256') == diff_sha), None)
    if coin is None:
        return 'REFUSED', None, (f'no coin over THIS change (patch {diff_sha[:12]}…, {len(patch)} bytes). The index changed '
                                 f'after the last mint, or nothing was minted. Mint: goggles --do mint')
    fails = verify_coin(coin, patch, key, deep)
    if fails:
        return 'REFUSED', coin.get('coin_id'), 'coin does not verify:\n  ' + '\n  '.join(fails)
    return 'ok', coin['coin_id'], f"coin {coin['coin_id'][:12]}… covers the staged {len(patch)} bytes"


# ── mint ───────────────────────────────────────────────────────────────────

def find_void(required: bool = True) -> str | None:
    cands = [os.environ.get('VOID_ROOT'),
             os.path.join(os.environ.get('ECOSYSTEM_HOME', ''), 'Void-Data-Compressor') if os.environ.get('ECOSYSTEM_HOME') else None,
             os.path.join(os.path.dirname(TOOLKIT), 'Void-Data-Compressor'),
             '/home/user/Void-Data-Compressor']
    for c in cands:
        if c and os.path.isfile(os.path.join(c, 'scripts', 'read-signal.py')):
            return os.path.abspath(c)
    if required:
        raise SystemExit('Void-Data-Compressor not found (set VOID_ROOT) — the coin is minted by the instrument, nowhere else')
    return None


def mint(repo: str, amend: bool) -> int:
    void = find_void()
    head = rev_tree(repo, 'HEAD')
    base = (rev_tree(repo, 'HEAD~1') or EMPTY_TREE) if (amend and head) else (head or EMPTY_TREE)
    tree = git(repo, 'write-tree').strip()
    patch = patch_between(repo, base, tree)
    if not patch:
        print('nothing staged (outside the coin ledger) — `git add` the change first; a coin covers bytes, not intentions')
        return 2
    diff_sha = sha256(patch)
    files = [ln.split('\t', 1)[1] for ln in git(repo, 'diff-tree', '-r', '--name-status', '--no-renames', base, tree,
                                                 '--', '.', f':(exclude){LEDGER}').splitlines() if '\t' in ln]
    ledger_path = os.path.join(repo, LEDGER)
    doc = {'_README': LEDGER_README, 'coins': []}
    if os.path.isfile(ledger_path):
        with open(ledger_path) as f:
            doc = json.load(f)
        if not isinstance(doc.get('coins'), list):
            doc['coins'] = []
    existing = next((c for c in doc['coins'] if (c.get('change') or {}).get('diff_sha256') == diff_sha), None)
    if existing:
        print(f"already minted over this exact change — coin {existing['coin_id'][:12]}… (idempotent by the patch bytes)")
        git(repo, 'add', LEDGER)
        print(f"\n{TRAILER}: {existing['coin_id']}")
        return 0

    # the patch goes to the instrument as a file under .git (never committed)
    gitdir = git(repo, 'rev-parse', '--git-dir').strip()
    gitdir = gitdir if os.path.isabs(gitdir) else os.path.join(repo, gitdir)
    scratch = os.path.join(gitdir, 'change-coin')
    os.makedirs(scratch, exist_ok=True)
    patch_file = os.path.join(scratch, 'staged.patch')
    with open(patch_file, 'wb') as f:
        f.write(patch)

    print(f'change: {len(files)} file(s), {len(patch)} patch bytes, sha256 {diff_sha[:12]}…  (base tree {base[:10]})')
    proc = subprocess.run([sys.executable, os.path.join(void, 'scripts', 'read-signal.py'), patch_file, '--json'],
                          cwd=void, capture_output=True, text=True, timeout=900)
    if proc.returncode != 0:
        print('the instrument refused or is down — no reading, no coin:\n' + (proc.stdout + proc.stderr).strip())
        print('  goggles --do service status   ·   goggles --do service start --wait')
        return 1
    reading = json.loads(proc.stdout)
    vs, cm = reading.get('void_seal'), reading.get('commitment')
    if not vs or not cm or reading.get('via') != 'void:compress_signal':
        print('reading came back without seal/commitment — not minting over an unsealed number. Is the service the current build?')
        return 1
    q = quantise(patch)
    if q is None or cm.get('data_sha256') != sha256(q):
        print('REFUSED: the instrument read different bytes than the staged patch (data_sha256 mismatch) — nothing minted')
        return 1
    sys.path.insert(0, os.path.join(void, 'scripts'))
    import fractal_token  # noqa: E402
    tok = fractal_token.mint(cm)
    if 'error' in tok:
        print('fractal token could not be minted: ' + tok['error'])
        return 1
    token = {k: tok[k] for k in ('v', 'depth_dim', 'token_sha256', 'shape_sha256')}
    coin = {
        'v': COIN_V,
        'coin_id': coin_id_of(diff_sha, vs['sig'], token['token_sha256']),
        'minted_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'minted_by': 'goggles --do mint',
        'change': {'repo': os.path.basename(os.path.abspath(repo)), 'base_tree': base,
                   'files': files, 'diff_bytes': len(patch), 'diff_sha256': diff_sha},
        'reading': {k: reading.get(k) for k in ('coherency', 'ratio', 'method', 'strategy', 'lossless',
                                                 'via', 'mint', 'void_seal', 'commitment')},
        'fractal_token': token,
    }
    fails = verify_coin(coin, patch, seal_key(), deep=False)
    if fails:
        print('the coin just minted does not verify — refusing to write it:\n  ' + '\n  '.join(fails))
        return 1
    doc['_README'] = LEDGER_README
    doc['coins'].append(coin)
    with open(ledger_path, 'w') as f:
        json.dump(doc, f, indent=1)
        f.write('\n')
    git(repo, 'add', LEDGER)
    print(f"reading: coherency {reading['coherency']:.4f} via void:compress_signal · seal mint {reading['mint']} · "
          f"strategy {reading.get('strategy')} · lossless {reading.get('lossless')}")
    print(f"token:   {token['depth_dim']}-D fractal token {token['token_sha256'][:12]}… over shape {token['shape_sha256'][:12]}…")
    print(f"MINTED coin {coin['coin_id'][:12]}… → {LEDGER} (staged; {len(doc['coins'])} coins). "
          f"Commit now — the commit-msg hook writes the trailer, or add it yourself:")
    print(f"\n{TRAILER}: {coin['coin_id']}")
    return 0


# ── hooks ──────────────────────────────────────────────────────────────────

def hook_commit_msg(repo: str, msgfile: str) -> int:
    key = seal_key()
    status, cid, detail = verify_staged(repo, False, key, False)
    if status == 'REFUSED' and cid is None and rev_tree(repo, 'HEAD~1'):
        s2, c2, d2 = verify_staged(repo, True, key, False)   # an --amend rebuilds from HEAD~1
        if s2 == 'ok':
            status, cid, detail = s2, c2, d2
    if status == 'REFUSED':
        print(f'[change-coin] ✗ commit REFUSED — {detail}', file=sys.stderr)
        print('  the goggles are the one door: stage the change, `goggles --do mint`, commit again.', file=sys.stderr)
        return 1
    if cid is None:
        return 0
    with open(msgfile, encoding='utf-8', errors='replace') as f:
        msg = f.read()
    present = trailer_of(msg)
    if present and present != cid:
        print(f'[change-coin] ✗ commit REFUSED — message names coin {present[:12]}… but the staged change is covered by {cid[:12]}…', file=sys.stderr)
        return 1
    if not present:
        lines = msg.split('\n')
        cut = next((i for i, ln in enumerate(lines) if ln.startswith('#')), len(lines))
        body = '\n'.join(lines[:cut]).rstrip('\n')
        rest = '\n'.join(lines[cut:])
        msg = f'{body}\n\n{TRAILER}: {cid}\n' + (('\n' + rest) if rest.strip() else '')
        with open(msgfile, 'w', encoding='utf-8') as f:
            f.write(msg)
    print(f'[change-coin] ✓ {detail}')
    return 0


HOOK_MARK = 'change-coin.py'
HOOK_BODY = '''#!/bin/sh
# change-coin — a commit that does not carry the pipeline-minted coin is refused,
# and one that does gets its `Remembrance-Coin:` trailer written here.
# Installed by: goggles --do mint install-hooks
TOP="$(git rev-parse --show-toplevel)"
CC="$TOP/.claude/skills/goggles/change-coin.py"
[ -f "$CC" ] || CC="${ORACLE_TOOLKIT:-/home/user/remembrance-oracle-toolkit}/.claude/skills/goggles/change-coin.py"
python3 "$CC" hook-commit-msg "$1" --repo "$TOP" || exit 1
'''


def install_hooks(repo: str) -> int:
    hooks = git(repo, 'rev-parse', '--git-path', 'hooks').strip()
    hooks = hooks if os.path.isabs(hooks) else os.path.join(repo, hooks)
    os.makedirs(hooks, exist_ok=True)
    target = os.path.join(hooks, 'commit-msg')
    if os.path.isfile(target):
        with open(target) as f:
            cur = f.read()
        if HOOK_MARK in cur:
            print(f'commit-msg hook already carries change-coin: {target}')
            return 0
        with open(target, 'a') as f:
            f.write('\n# change-coin (appended by goggles --do mint install-hooks)\n'
                    + '\n'.join(HOOK_BODY.split('\n')[4:]))
        print(f'change-coin appended to the existing commit-msg hook: {target}')
    else:
        with open(target, 'w') as f:
            f.write(HOOK_BODY)
        print(f'commit-msg hook installed: {target}')
    os.chmod(target, 0o755)
    return 0


# ── verify: ranges ─────────────────────────────────────────────────────────

def verify_many(repo: str, revs: list[str], key: bytes | None, deep: bool) -> int:
    refused = ok = skipped = 0
    for c in revs:
        status, detail = verify_commit(repo, c, key, deep)
        if status == 'REFUSED':
            refused += 1
            print(f'  ✗ {detail}')
        elif status == 'skip':
            skipped += 1
        else:
            ok += 1
            print(f'  ✓ {c[:10]} {detail}')
    mode = 'cryptographically' if key is not None else 'structurally (seam — set VOID_SEAL_KEY to make it a wall)'
    if refused:
        print(f'\nCHANGE-COIN VERIFY FAILED — {refused} commit(s) REFUSED, {ok} verified, {skipped} pre-epoch. The merge must be refused.', file=sys.stderr)
        return 1
    print(f'\nCHANGE-COIN VERIFIED {mode} — {ok} commit(s) carry a coin over their own bytes, {skipped} pre-epoch.')
    return 0


def since_epoch(repo: str, cap: int = 2000) -> list[str]:
    revs = git(repo, 'rev-list', '--topo-order', '-n', str(cap), 'HEAD').split()
    out = []
    for c in revs:
        if subprocess.run(['git', '-C', repo, 'cat-file', '-e', f'{c}:{LEDGER}'], capture_output=True).returncode == 0:
            out.append(c)
        else:
            # a commit without the ledger is still checked once: did it REMOVE it?
            parents = git(repo, 'rev-list', '--parents', '-n', '1', c).split()[1:]
            if any(subprocess.run(['git', '-C', repo, 'cat-file', '-e', f'{p}:{LEDGER}'], capture_output=True).returncode == 0 for p in parents):
                out.append(c)
    return out


# ── cli ────────────────────────────────────────────────────────────────────

def _flag(argv: list[str], name: str, default=None):
    if name in argv:
        i = argv.index(name)
        v = argv[i + 1] if i + 1 < len(argv) else None
        del argv[i:i + 2]
        return v
    return default


def main() -> int:
    argv = sys.argv[1:]
    repo = _flag(argv, '--repo') or os.getcwd()
    repo = os.path.abspath(repo)
    if subprocess.run(['git', '-C', repo, 'rev-parse', '--show-toplevel'], capture_output=True).returncode != 0:
        print(f'not a git repository: {repo}', file=sys.stderr)
        return 2
    repo = git(repo, 'rev-parse', '--show-toplevel').strip()
    sub = argv[0] if argv and not argv[0].startswith('-') else 'mint'
    args = argv[1:] if argv and not argv[0].startswith('-') else argv
    amend = '--amend' in args
    deep = '--deep' in args
    args = [a for a in args if a not in ('--amend', '--deep')]
    if sub == 'mint':
        return mint(repo, amend)
    if sub == 'install-hooks':
        return install_hooks(repo)
    if sub == 'anchor':
        # the Witness records every repo's coin ledger (REMEMBRANCE-BLOCKCHAIN)
        chain = os.environ.get('REMEMBRANCE_BLOCKCHAIN') or os.path.join(os.path.dirname(TOOLKIT), 'REMEMBRANCE-BLOCKCHAIN')
        script = os.path.join(chain, 'scripts', 'anchor-change-coins.js')
        if not os.path.isfile(script):
            print(f'REMEMBRANCE-BLOCKCHAIN not reachable at {chain} (set REMEMBRANCE_BLOCKCHAIN)', file=sys.stderr)
            return 2
        return subprocess.run(['node', script, *args], cwd=chain).returncode
    if sub == 'hook-commit-msg':
        if not args:
            print('hook-commit-msg needs the message file', file=sys.stderr)
            return 2
        return hook_commit_msg(repo, args[0])
    if sub == 'verify':
        key = seal_key()
        if '--staged' in args:
            status, cid, detail = verify_staged(repo, amend, key, deep)
            print(('✓ ' if status == 'ok' else '✗ ') + detail)
            return 0 if status == 'ok' else 1
        if '--since-epoch' in args or not args:
            revs = since_epoch(repo)
            print(f'verifying {len(revs)} commit(s) since the coin epoch in {os.path.basename(repo)}')
            return verify_many(repo, revs, key, deep)
        revs: list[str] = []
        for a in args:
            if '..' in a:
                revs += git(repo, 'rev-list', '--topo-order', a).split()
            else:
                revs.append(git(repo, 'rev-parse', '--verify', a).strip())
        return verify_many(repo, revs, key, deep)
    print(__doc__.split('\n\n')[0], file=sys.stderr)
    print('  mint [--amend] · verify [--staged | --since-epoch | A..B | <rev>…] [--deep] · install-hooks · anchor [--status] · hook-commit-msg <file>   (--repo <abs>)', file=sys.stderr)
    return 2


if __name__ == '__main__':
    try:
        sys.exit(main())
    except RuntimeError as e:
        print(f'change-coin: {e}', file=sys.stderr)
        sys.exit(2)
