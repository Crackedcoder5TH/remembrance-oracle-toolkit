'use strict';
/**
 * The wall is default-deny inside the ecosystem, for any model, without
 * exception (2026-09-11). These tests drive the three hooks exactly as the
 * harness does — JSON on stdin, a decision on stdout — from inside a repo and
 * from outside one.
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const HUB = path.resolve(__dirname, '..');
const TOOLS = path.join(HUB, 'src', 'tools');
const OUTSIDE = fs.mkdtempSync(path.join(os.tmpdir(), 'wall-outside-'));

function hook(file, input) {
  // GOGGLES_NO_TRAP_LEARN: these denials are the test's, not a mistake — they
  // must not teach the trap ledger (thirteen of them were promoted once)
  const r = spawnSync('node', [path.join(TOOLS, file)], { input: input === null ? '' : JSON.stringify(input), encoding: 'utf8',
    env: { ...process.env, GOGGLES_NO_TRAP_LEARN: '1' } });
  const out = (r.stdout || '').trim();
  if (!out) return { decision: 'allow', reason: '' };
  const j = JSON.parse(out);
  return { decision: j.hookSpecificOutput.permissionDecision, reason: j.hookSpecificOutput.permissionDecisionReason || '' };
}
const bash = (command, cwd = HUB) => hook('goggles-bash-hook.js', { tool_name: 'Bash', tool_input: { command }, cwd });
const search = (tool_name, tool_input, cwd = HUB) => hook('goggles-search-hook.js', { tool_name, tool_input, cwd });

test('the goggles themselves run inside the ecosystem', () => {
  assert.equal(bash('node .claude/skills/goggles/run.mjs --do contracts').decision, 'allow');
  assert.equal(bash('timeout 600 node /home/user/remembrance-oracle-toolkit/.claude/skills/goggles/run.mjs --do read x.txt --json 2>/dev/null | python3 -c "import sys"').decision, 'allow');
});

test('git and glue run; the coin procedure chain is allowed (commit itself is the coin gate\'s business)', () => {
  let r = bash('git add -A && node .claude/skills/goggles/run.mjs --do mint && for d in 0 2 4; do sleep $d; git push -u origin b 2>&1 | tail -1 && break; done');
  assert.equal(r.decision, 'allow', r.reason);
  r = bash('cd /home/user/Void-Data-Compressor && git status --short | wc -l');
  assert.equal(r.decision, 'allow', r.reason);
  // a bare commit reaches the coin gate (verified against the live index —
  // covered by tests/change-coin.test.js, not asserted here where the index
  // is whatever the session left staged); the default-deny never refuses git
  r = bash('git commit -q -F /tmp/m.txt');
  assert.doesNotMatch(r.reason, /OFF-SURFACE COMMAND/, r.reason);
});

test('one step per command: a commit may not share a command with a stage or a mint', () => {
  for (const c of ['git add -A && git commit -q -F /tmp/m.txt',
                   'node .claude/skills/goggles/run.mjs --do mint && git commit -q -F /tmp/m.txt',
                   'git add -A && node .claude/skills/goggles/run.mjs --do mint && git commit -q -F /tmp/m.txt && git push',
                   'git commit -q -F /tmp/m.txt; git add x.js',
                   'git reset HEAD~1 && git commit -q -F /tmp/m.txt']) {
    const r = bash(c);
    assert.equal(r.decision, 'deny', c);
    assert.match(r.reason, /commit shares a command with a stage or a mint/, c);
  }
  // verify / anchor are reads of the coin, not mints: not index changers
  const r = bash('git commit -q -F /tmp/m.txt && node .claude/skills/goggles/run.mjs --do mint verify --since-epoch && git push -u origin b');
  assert.doesNotMatch(r.reason, /shares a command/, r.reason);
});

test('hand searches and hand runs are refused inside, and the verb is named', () => {
  for (const c of ['grep -rn foo src/', 'sed -n 1,40p src/core/x.js', 'ls tests', 'cat README.md', 'rg pattern .', 'find . -name "*.js"',
                   'python3 -m unittest tests.test_api', 'python3 scripts/x.py', 'node scripts/x.js', 'npm test', 'rm -rf build', 'curl http://example.com']) {
    const r = bash(c);
    assert.equal(r.decision, 'deny', c);
    assert.match(r.reason, /OFF-SURFACE COMMAND refused/, c);
    assert.match(r.reason, /--do find|--do exec|--do test/, c);
  }
});

test('a repo path in the command brings the wall even from outside', () => {
  assert.equal(bash('grep -rn foo /home/user/Void-Data-Compressor/', OUTSIDE).decision, 'deny');
  assert.equal(bash('grep -rn foo .', OUTSIDE).decision, 'allow');
});

test('text filters are allowed only after a pipe', () => {
  assert.equal(bash('node .claude/skills/goggles/run.mjs --do state | grep -c coherency | head -1').decision, 'allow');
  assert.equal(bash('grep -c coherency .remembrance/entropy.json').decision, 'deny');
});

test('heredoc bodies and quoted strings are data, not commands', () => {
  let r = bash("git status <<'EOF'\ngrep sed ls rm\nEOF");
  assert.equal(r.decision, 'allow', r.reason);
  r = bash('echo "grep this is text" && git status');
  assert.equal(r.decision, 'allow', r.reason);
});

test('the wall fails closed on a blind input', () => {
  assert.equal(hook('goggles-bash-hook.js', null).decision, 'deny');
  assert.match(hook('goggles-bash-hook.js', null).reason, /fail closed/);
  assert.equal(hook('goggles-search-hook.js', null).decision, 'deny');
});

test('Grep and Glob are refused inside the ecosystem and allowed outside; Read is allowed', () => {
  const g = search('Grep', { pattern: 'foo', path: HUB });
  assert.equal(g.decision, 'deny');
  assert.match(g.reason, /--do find "foo"/);
  assert.equal(search('Glob', { pattern: '**/*.js' }).decision, 'deny');
  assert.equal(search('Grep', { pattern: 'foo', path: OUTSIDE }, OUTSIDE).decision, 'allow');
  assert.equal(search('Read', { file_path: path.join(HUB, 'README.md') }).decision, 'allow');
});

test('an edit to an existing ecosystem file without a goggle reading is refused; a new file is not', () => {
  const pre = (file_path) => hook('goggles-pre-hook.js', { tool_name: 'Edit', tool_input: { file_path, old_string: 'a', new_string: 'b' }, cwd: HUB });
  const target = path.join(HUB, 'tests', 'goggles-wall.test.js');
  const ledger = path.join(HUB, '.remembrance', 'goggles-readings.json');
  let saved = null;
  try { saved = fs.readFileSync(ledger, 'utf8'); } catch (_) { saved = null; }
  try {
    fs.mkdirSync(path.dirname(ledger), { recursive: true });
    fs.writeFileSync(ledger, JSON.stringify({}));
    const r = pre(target);
    assert.equal(r.decision, 'deny');
    assert.match(r.reason, /EDIT WITHOUT A READING/);
    fs.writeFileSync(ledger, JSON.stringify({ 'tests/goggles-wall.test.js': { at: Date.now() } }));
    let a = pre(target);
    // the brief gate may still fire once per session for a trapped file; a
    // reading present means the goggled-first gate itself is satisfied
    assert.doesNotMatch(a.reason, /EDIT WITHOUT A READING/, a.reason);
    fs.writeFileSync(ledger, JSON.stringify({ 'tests/goggles-wall.test.js': { at: Date.now() - 3 * 60 * 60 * 1000 } }));
    a = pre(target);
    assert.equal(a.decision, 'deny', a.reason);
    assert.match(a.reason, /EDIT WITHOUT A READING/);
    a = pre(path.join(HUB, 'tests', 'does-not-exist-yet.js'));
    assert.doesNotMatch(a.reason, /EDIT WITHOUT A READING/, a.reason);
    a = pre(path.join(OUTSIDE, 'scratch.txt'));
    assert.doesNotMatch(a.reason, /EDIT WITHOUT A READING/, a.reason);   // outside: the goggled-first gate does not apply
  } finally {
    if (saved === null) fs.rmSync(ledger, { force: true }); else fs.writeFileSync(ledger, saved);
  }
});
