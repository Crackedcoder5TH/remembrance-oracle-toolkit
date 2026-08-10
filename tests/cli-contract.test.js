'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * The CLI layer's contracts.
 *
 * Coverage measured 2026-08-10 put every command module between 3% and 17%
 * line coverage while core sat at 85–100% — and the bugs were exactly where
 * the coverage wasn't. `oracle audit` answered a bare invocation with
 * "Unknown audit subcommand: null. Run `oracle audit` for help.", naming the
 * command that had just produced the error, because no help branch existed.
 * Nothing failed, because nothing looked.
 *
 * These tests encode the two invariants those defects broke. They drive the
 * real CLI as a subprocess (the path a user actually takes) and the real
 * registration (the path the handlers actually take), so neither can be
 * satisfied by a mock.
 */

const CLI = path.join(__dirname, '..', 'src', 'cli.js');

const runCli = (args) => {
  try {
    return { code: 0, out: execFileSync('node', [CLI, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000,
    }) };
  } catch (e) {
    return { code: e.status == null ? -1 : e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
};

// Commands that route on a subcommand and own a help branch.
const DISPATCHERS = [
  'audit', 'debug', 'chromadb', 'fractal', 'meditate', 'reason',
  'reflector', 'void', 'void-store', 'transpile', 'session', 'hooks',
  'registry', 'lifecycle',
];

describe('CLI dispatchers — a bare invocation answers with help', () => {
  // THE INVARIANT: an error that says "run X for help" is only honest if X
  // really prints help. Rather than police error strings, require the far
  // simpler property they all depend on — every dispatcher, run bare, tells
  // you what it can do and exits 0. `oracle audit` violated this.
  for (const cmd of DISPATCHERS) {
    it(`\`oracle ${cmd}\` prints help instead of erroring`, () => {
      const { code, out } = runCli([cmd]);
      assert.equal(code, 0, `\`oracle ${cmd}\` exited ${code}; a bare dispatcher call is a request for help, not an error`);
      assert.ok(out.trim().length > 0, `\`oracle ${cmd}\` printed nothing`);
      // The dead end: being told to run the command you just ran.
      const selfReferential = new RegExp(`Unknown[^\\n]*subcommand[^\\n]*Run[^\\n]*\\b${cmd}\\b[^\\n]*for help`, 'i');
      assert.ok(!selfReferential.test(out),
        `\`oracle ${cmd}\` told the reader to run \`oracle ${cmd}\` for help — the command they just ran`);
    });
  }
});

describe('CLI dispatchers — `help` is a synonym for the bare call', () => {
  for (const cmd of DISPATCHERS) {
    it(`\`oracle ${cmd} help\` prints help`, () => {
      const { code, out } = runCli([cmd, 'help']);
      assert.equal(code, 0, `\`oracle ${cmd} help\` exited ${code}`);
      assert.ok(out.trim().length > 0, `\`oracle ${cmd} help\` printed nothing`);
    });
  }
});

describe('CLI registration — one handler map, 21 writers', () => {
  // Every command module writes into the same `handlers` object, so a name
  // registered twice is silently resolved by registration order in cli.js:
  // the last writer wins and the earlier implementation becomes unreachable.
  // Nothing warns. This walks the real registration in cli.js's order and
  // reports every name whose function identity changed.
  const REGISTRATION_ORDER = [
    'core', 'library', 'quality', 'voting', 'federation', 'versioning',
    'debug', 'transpile', 'integration', 'admin', 'self-manage', 'swarm',
    'reflector', 'chromadb', 'void', 'fractals', 'reasoning', 'meditation',
    'void-store', 'onboard', 'verify',
  ];

  const registerAll = () => {
    const handlers = {};
    const ctx = {
      oracle: {}, jsonOut: () => false, speakCLI: () => {},
      getCode: () => {}, readFile: () => {},
    };
    const owner = {};
    const overwritten = [];
    for (const mod of REGISTRATION_ORDER) {
      let m;
      try { m = require(`../src/cli/commands/${mod}`); } catch { continue; }
      const register = Object.values(m).find((v) => typeof v === 'function' && /^register/.test(v.name));
      if (!register) continue;
      const before = { ...handlers };
      try { register(handlers, ctx); } catch { continue; }
      for (const k of Object.keys(handlers)) {
        if (k in before && before[k] !== handlers[k]) overwritten.push({ name: k, from: owner[k], to: mod });
        if (!(k in before) || before[k] !== handlers[k]) owner[k] = mod;
      }
    }
    return { handlers, overwritten };
  };

  it('every registered handler is callable', () => {
    const { handlers } = registerAll();
    const notFunctions = Object.entries(handlers).filter(([, v]) => typeof v !== 'function').map(([k]) => k);
    assert.deepEqual(notFunctions, [], `registered but not callable: ${notFunctions.join(', ')}`);
    assert.ok(Object.keys(handlers).length > 100, 'expected the full command surface to register');
  });

  it('no NEW handler name is silently overwritten', () => {
    // The three below are real defects, recorded here rather than hidden:
    // each shadows a DIFFERENT implementation, and for two of them the
    // CLI's own help advertises the shadowed behaviour.
    //
    //   deep-clean  quality.js  "Remove duplicates, stubs, and trivial
    //               patterns" (oracle.deepClean) is shadowed by
    //               self-manage.js's SQLite maintenance sweep.
    //   vacuum      same pair, same direction.
    //   verify      versioning.js "Verify pattern integrity" (delegates to
    //               _verifyPublication) is shadowed by verify.js's
    //               ecosystem truth-spine.
    //
    // Which implementation should own each name is a design decision for
    // the owner, so this test does not pick a winner. It freezes the set:
    // these three may shrink, and a fourth blocks.
    const KNOWN = ['deep-clean', 'vacuum', 'verify'];
    const { overwritten } = registerAll();
    const names = [...new Set(overwritten.map((o) => o.name))].sort();
    const fresh = names.filter((n) => !KNOWN.includes(n));
    assert.deepEqual(fresh, [],
      `new silently-shadowed handler(s): ${fresh.join(', ')} — two modules registered the same command name, and the later one won without warning`);
    const healed = KNOWN.filter((n) => !names.includes(n));
    assert.deepEqual(healed, [],
      `handler collision(s) resolved: ${healed.join(', ')} — remove them from KNOWN so the gate ratchets down`);
  });
});
