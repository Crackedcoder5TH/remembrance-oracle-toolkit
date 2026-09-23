'use strict';
// The trap ledger cannot be lost: the gate refuses a seed that shrank below
// the chain anchor, an anchored entry rewritten, or a mirror that drifted;
// it names unwitnessed growth and unpromoted local traps instead of hiding them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createGate, requireGate } = require('../src/core/covenant-fractal');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'traps-ledger-ratchet.js');
const SEED = path.join(__dirname, '..', 'seeds', 'traps.seed.json');
const FIXTURE_GATE = createGate().seal({ charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid', reactivity: 'inert', electronegativity: 0.3, group: 18, period: 3, harmPotential: 'none', alignment: 'healing', intention: 'benevolent', domain: 'testing' });
const writeFixture = requireGate((gate, file, data) => fs.writeFileSync(file, data));

const digestOf = (t) => crypto.createHash('sha256').update(JSON.stringify(t)).digest('hex').slice(0, 16);

/** Run the gate against a fixture chain and baseline; the real seed and mirrors are read as they are. */
function gate(chainDoc, baselineDoc) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'traps-'));
  const chain = path.join(dir, 'ledger.json');
  if (chainDoc) writeFixture(FIXTURE_GATE, chain, JSON.stringify(chainDoc));
  const base = path.join(dir, 'baseline.json');
  if (baselineDoc) writeFixture(FIXTURE_GATE, base, JSON.stringify(baselineDoc));
  try {
    const out = execFileSync('node', [SCRIPT, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TRAPS_CHAIN: chain, TRAPS_BASELINE: base } });
    return { code: 0, out: JSON.parse(out) };
  } catch (e) { return { code: e.status, out: JSON.parse((e.stdout || '{}').toString()) }; }
}
gate.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

const seedTraps = () => JSON.parse(fs.readFileSync(SEED, 'utf8')).traps;
const anchorBlock = (count, entryDigests) => ({ chain: [{ index: 1, data: { type: 'REGISTER', patternId: 'traps-ledger', metadata: { digest: 'x', count, entryDigests } } }] });

test('holds when the seed carries every anchored entry in order (growth past the anchor is named, not refused)', () => {
  const traps = seedTraps();
  const anchored = traps.slice(0, traps.length - 1).map(digestOf);
  const r = gate(anchorBlock(anchored.length, anchored), { count: anchored.length });
  assert.equal(r.code, 0, JSON.stringify(r.out.problems));
  assert.equal(r.out.unwitnessed, 1);
});

test('a seed that shrank below the anchor or the floor blocks', () => {
  const traps = seedTraps();
  const r = gate(anchorBlock(traps.length + 3, traps.map(digestOf)), { count: traps.length });
  assert.equal(r.code, 1);
  assert.ok(r.out.problems.some((p) => /SHRANK below the chain anchor/.test(p)));
  const f = gate(null, { count: traps.length + 1 });
  assert.equal(f.code, 1);
  assert.ok(f.out.problems.some((p) => /SHRANK below the floor/.test(p)));
});

test('an anchored entry rewritten blocks — the ledger is append-only', () => {
  const traps = seedTraps();
  const tampered = traps.map(digestOf);
  tampered[0] = 'deadbeefdeadbeef';
  const r = gate(anchorBlock(traps.length, tampered), { count: traps.length });
  assert.equal(r.code, 1);
  assert.ok(r.out.problems.some((p) => /rewritten or reordered/.test(p)));
});

test('the mirrors on this host are byte-identical to the seed', () => {
  const r = gate(null, null);
  assert.equal(r.code, 0, JSON.stringify(r.out.problems));
  for (const m of r.out.mirrors) assert.equal(m.state, 'identical', `${m.repo}: ${m.state}`);
});
