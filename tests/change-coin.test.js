'use strict';
/**
 * change-coin — the coin every change must carry.
 *
 * These tests drive the minter/verifier (.claude/skills/goggles/change-coin.py)
 * over a throwaway repository. Minting needs the instrument (the compressor
 * service on :8765): when it is DOWN the mint tests are SKIPPED — visibly —
 * rather than faked with a hand-built coin, because a coin the instrument did
 * not mint is exactly what the wall refuses.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, spawnSync } = require('node:child_process');

const CC = path.join(__dirname, '..', '.claude', 'skills', 'goggles', 'change-coin.py');
// A test coin is not a memory: every mint below (and every hook the commits
// run) stays off the Witness. Inherited by the python and git children.
process.env.CHANGE_COIN_NO_CHAIN = '1';

// Fixed commands, argument arrays, no shell: execFile is the instrument's own
// prescription for a child process; exit status and output come back either way.
function run(cmd, argv) {
  try {
    return { code: 0, out: execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: typeof e.status === 'number' ? e.status : 1, out: (e.stdout || '') + (e.stderr || '') };
  }
}
function cc(repo, ...args) { return run('python3', [CC, ...args, '--repo', repo]); }
function git(repo, ...args) { return run('git', ['-C', repo, ...args]); }
function freshRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'change-coin-'));
  git(repo, 'init', '-q', '.');
  git(repo, 'config', 'user.email', 't@t');
  git(repo, 'config', 'user.name', 't');
  assert.strictEqual(cc(repo, 'install-hooks').code, 0);
  return repo;
}
function serviceUp() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8765/health', (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

test('a commit with no coin is refused by the commit-msg hook', () => {
  const repo = freshRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'first\n');
  git(repo, 'add', 'a.txt');
  const r = git(repo, 'commit', '-q', '-m', 'no coin');
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /commit REFUSED/);
  assert.match(r.out, /--do mint/);
});

test('verify: a commit that slipped past the hook (--no-verify) is refused; an empty-diff commit needs no coin', () => {
  const repo = freshRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'first\n');
  git(repo, 'add', 'a.txt');
  assert.strictEqual(git(repo, 'commit', '-q', '--no-verify', '-m', 'slipped').code, 0);
  // pre-epoch: no ledger anywhere yet → skipped, not refused
  let v = cc(repo, 'verify', '--since-epoch');
  assert.strictEqual(v.code, 0, v.out);
  assert.match(v.out, /pre-epoch/);
  // once a ledger exists, a later coinless commit is refused
  fs.writeFileSync(path.join(repo, 'coins.ledger.json'), JSON.stringify({ coins: [] }) + '\n');
  git(repo, 'add', 'coins.ledger.json');
  assert.strictEqual(git(repo, 'commit', '-q', '--no-verify', '-m', 'epoch (ledger only)').code, 0);
  fs.writeFileSync(path.join(repo, 'b.txt'), 'second\n');
  git(repo, 'add', 'b.txt');
  assert.strictEqual(git(repo, 'commit', '-q', '--no-verify', '-m', 'coinless after epoch').code, 0);
  v = cc(repo, 'verify', '--since-epoch');
  assert.strictEqual(v.code, 1);
  assert.match(v.out, /carries NO Remembrance-Coin trailer/);
  // removing the ledger is refused too
  git(repo, 'rm', '-q', 'coins.ledger.json');
  assert.strictEqual(git(repo, 'commit', '-q', '--no-verify', '-m', 'tidy').code, 0);
  v = cc(repo, 'verify', 'HEAD');
  assert.strictEqual(v.code, 1);
  assert.match(v.out, /REMOVED coins.ledger.json/);
});

test('mint through the instrument → hook writes the trailer → verify recomputes everything', async (t) => {
  if (!(await serviceUp())) { t.skip('compressor service DOWN — cannot mint; start it: goggles --do service start --wait'); return; }
  const repo = freshRepo();
  fs.writeFileSync(path.join(repo, 'add.js'), 'function add(a, b) {\n  return a + b;\n}\nmodule.exports = { add };\n');
  git(repo, 'add', 'add.js');
  const m = cc(repo, 'mint');
  assert.strictEqual(m.code, 0, m.out);
  assert.match(m.out, /via void:compress_signal/);
  assert.match(m.out, /NOT saved \(CHANGE_COIN_NO_CHAIN/);
  const coinId = /Remembrance-Coin: ([0-9a-f]{64})/.exec(m.out)[1];
  const ledger = JSON.parse(fs.readFileSync(path.join(repo, 'coins.ledger.json'), 'utf8'));
  assert.strictEqual(ledger.coins.length, 1);
  const coin = ledger.coins[0];
  assert.strictEqual(coin.coin_id, coinId);
  assert.strictEqual(coin.reading.via, 'void:compress_signal');
  assert.strictEqual(coin.reading.void_seal.via, 'void_compressor_v5.compress');
  assert.strictEqual(coin.reading.commitment.canon, 'void-seal/v3');
  // minted, not unfolded: the coin carries the sealed commitment WITHOUT its
  // shape and no fractal token — proof of the pipeline, unfolded only when needed
  assert.strictEqual(coin.reading.commitment.shape, undefined);
  assert.strictEqual(coin.fractal_token, undefined);
  assert.match(coin.reading.commitment.shape_sha256, /^[0-9a-f]{64}$/);
  // idempotent by the patch bytes
  const m2 = cc(repo, 'mint');
  assert.strictEqual(m2.code, 0);
  assert.match(m2.out, /already minted/);
  // the hook writes the trailer
  assert.strictEqual(git(repo, 'commit', '-q', '-m', 'add: coined').code, 0);
  assert.match(git(repo, 'log', '-1', '--format=%B').out, new RegExp('Remembrance-Coin: ' + coinId));
  const v = cc(repo, 'verify', '--since-epoch');
  assert.strictEqual(v.code, 0, v.out);
  assert.match(v.out, /1 commit\(s\) carry a coin over their own bytes/);
  // unfold WHEN NEEDED: the bytes back through the instrument, the shape
  // through the decoder — a canonical-width token, exact hash
  const u = cc(repo, 'unfold', 'HEAD');
  assert.strictEqual(u.code, 0, u.out);
  assert.match(u.out, /232-D fractal token [0-9a-f]{64}/);
  const deep = cc(repo, 'verify', 'HEAD', '--deep');
  assert.strictEqual(deep.code, 0, deep.out);
  // change the index after minting → the coin no longer covers it
  fs.appendFileSync(path.join(repo, 'add.js'), '\n// drift\n');
  git(repo, 'add', 'add.js');
  const r = git(repo, 'commit', '-q', '-m', 'drifted');
  assert.notStrictEqual(r.code, 0);
  assert.match(r.out, /no coin over THIS change/);
  // edit a past coin → append-only refuses it
  const doc = JSON.parse(fs.readFileSync(path.join(repo, 'coins.ledger.json'), 'utf8'));
  doc.coins[0].reading.coherency = 0.99;
  fs.writeFileSync(path.join(repo, 'coins.ledger.json'), JSON.stringify(doc, null, 1) + '\n');
  git(repo, 'add', 'coins.ledger.json');
  git(repo, 'reset', '-q', 'add.js');
  assert.strictEqual(git(repo, 'commit', '-q', '--no-verify', '-m', 'tidy the ledger').code, 0);
  const v2 = cc(repo, 'verify', '--since-epoch');
  assert.strictEqual(v2.code, 1);
  assert.match(v2.out, /EDITED the coin ledger/);
});

test('verify: a coin whose seal covers other bytes is refused (the reading must be of THIS patch)', async (t) => {
  if (!(await serviceUp())) { t.skip('compressor service DOWN — cannot mint'); return; }
  const repo = freshRepo();
  fs.writeFileSync(path.join(repo, 'a.txt'), 'the first change, read by the instrument\n');
  git(repo, 'add', 'a.txt');
  assert.strictEqual(cc(repo, 'mint').code, 0);
  const doc = JSON.parse(fs.readFileSync(path.join(repo, 'coins.ledger.json'), 'utf8'));
  const coin = doc.coins[0];
  // forge: point the coin at a different patch but keep the seal — the runner
  // rebuilds the patch from the trees and the quantised bytes the seal covers
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a different change, never read\n');
  git(repo, 'add', 'a.txt');
  const crypto = require('node:crypto');
  const patch = spawnSync('git', ['-C', repo, '-c', 'diff.noprefix=false', '-c', 'diff.mnemonicPrefix=false', '-c', 'core.quotePath=true',
    '-c', 'diff.renames=false', '-c', 'diff.algorithm=myers', '-c', 'diff.external=', 'diff-tree', '-p', '-r', '--no-color', '--no-ext-diff',
    '--no-renames', '--full-index', '--binary', '-U3', '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    spawnSync('git', ['-C', repo, 'write-tree'], { encoding: 'utf8' }).stdout.trim(), '--', '.', ':(exclude)coins.ledger.json']).stdout;
  coin.change.diff_sha256 = crypto.createHash('sha256').update(patch).digest('hex');
  coin.change.diff_bytes = patch.length;
  coin.coin_id = crypto.createHash('sha256').update(`${coin.change.diff_sha256}|${coin.reading.void_seal.sig}|${coin.reading.commitment.shape_sha256}`).digest('hex');
  fs.writeFileSync(path.join(repo, 'coins.ledger.json'), JSON.stringify(doc, null, 1) + '\n');
  git(repo, 'add', 'coins.ledger.json');
  assert.strictEqual(git(repo, 'commit', '-q', '--no-verify', '-m', `forged\n\nRemembrance-Coin: ${coin.coin_id}`).code, 0);
  const v = cc(repo, 'verify', 'HEAD');
  assert.strictEqual(v.code, 1);
  assert.match(v.out, /instrument read other bytes|original_size/);
});
