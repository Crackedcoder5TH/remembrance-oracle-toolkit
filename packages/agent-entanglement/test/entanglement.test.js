'use strict';

/**
 * agent-entanglement tests.
 *
 * Covers the public API contract: heartbeat, snapshot, claim/release,
 * isClaimed, listPeers, listClaims. Uses tmpdir-isolated log files
 * so tests don't pollute the user's real shared state.
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Redirect the storage files to a per-test tmpdir BEFORE requiring the
// module — the env vars are read at module-load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'entangle-test-'));
process.env.AGENT_ENTANGLEMENT_LOG = path.join(tmp, 'entanglement.jsonl');
process.env.AGENT_CLAIMS_LOG = path.join(tmp, 'claims.jsonl');
process.env.AGENT_GOGGLES_STATE = path.join(tmp, 'goggles-state.json');

const e = require('../src/index');

describe('agent-entanglement', () => {
  beforeEach(() => {
    e._resetState();
  });

  describe('heartbeat + listPeers', () => {
    it('records a heartbeat and surfaces it in listPeers', () => {
      const r = e.heartbeat('test-agent');
      assert.ok(r);
      assert.equal(r.tag, 'test-agent');
      assert.equal(r.event, 'heartbeat');
      const peers = e.listPeers();
      assert.equal(peers.length, 1);
      assert.equal(peers[0].tag, 'test-agent');
      assert.equal(peers[0].heartbeats, 1);
    });

    it('aggregates multiple heartbeats from the same tag', () => {
      e.heartbeat('agent-a');
      e.heartbeat('agent-a');
      e.heartbeat('agent-a');
      const peers = e.listPeers();
      assert.equal(peers.length, 1);
      assert.equal(peers[0].heartbeats, 3);
    });

    it('separates heartbeats from different tags', () => {
      e.heartbeat('agent-a');
      e.heartbeat('agent-b');
      e.heartbeat('agent-a');
      const peers = e.listPeers();
      assert.equal(peers.length, 2);
      const a = peers.find((p) => p.tag === 'agent-a');
      const b = peers.find((p) => p.tag === 'agent-b');
      assert.equal(a.heartbeats, 2);
      assert.equal(b.heartbeats, 1);
    });

    it('respects the maxAgeMs window', () => {
      e.heartbeat('agent-a');
      // 0 ms window — everyone is too stale
      const peers = e.listPeers({ maxAgeMs: 0 });
      assert.equal(peers.length, 0);
    });

    it('returns null on invalid tag', () => {
      assert.equal(e.heartbeat(''), null);
      assert.equal(e.heartbeat(undefined), null);
      assert.equal(e.heartbeat(123), null);
    });
  });

  describe('claim / release / isClaimed', () => {
    it('grants a claim on a free file', () => {
      const r = e.claim('/tmp/test.js', { tag: 'agent-a' });
      assert.equal(r.claimed, true);
      assert.equal(r.holder, 'agent-a');
      assert.ok(typeof r.expiresAt === 'number');
    });

    it('blocks a second agent from claiming an active file', () => {
      const r1 = e.claim('/tmp/test.js', { tag: 'agent-a' });
      assert.equal(r1.claimed, true);
      const r2 = e.claim('/tmp/test.js', { tag: 'agent-b' });
      assert.equal(r2.claimed, false);
      assert.equal(r2.holder, 'agent-a');
      assert.equal(r2.reason, 'held by another agent');
    });

    it('allows the same agent to re-claim its own file (idempotent)', () => {
      const r1 = e.claim('/tmp/test.js', { tag: 'agent-a' });
      assert.equal(r1.claimed, true);
      const r2 = e.claim('/tmp/test.js', { tag: 'agent-a' });
      assert.equal(r2.claimed, true);
    });

    it('lets force=true override an existing claim', () => {
      e.claim('/tmp/test.js', { tag: 'agent-a' });
      const r = e.claim('/tmp/test.js', { tag: 'agent-b', force: true });
      assert.equal(r.claimed, true);
      assert.equal(r.holder, 'agent-b');
    });

    it('release frees the file for another agent', () => {
      e.claim('/tmp/test.js', { tag: 'agent-a' });
      const released = e.release('/tmp/test.js', { tag: 'agent-a' });
      assert.equal(released, true);
      const r = e.claim('/tmp/test.js', { tag: 'agent-b' });
      assert.equal(r.claimed, true);
      assert.equal(r.holder, 'agent-b');
    });

    it('release from a non-holder is a no-op', () => {
      e.claim('/tmp/test.js', { tag: 'agent-a' });
      const released = e.release('/tmp/test.js', { tag: 'agent-b' });
      assert.equal(released, false);
      // agent-a still holds it
      const r = e.claim('/tmp/test.js', { tag: 'agent-c' });
      assert.equal(r.claimed, false);
      assert.equal(r.holder, 'agent-a');
    });

    it('isClaimed reports current state', () => {
      assert.equal(e.isClaimed('/tmp/test.js').claimed, false);
      e.claim('/tmp/test.js', { tag: 'agent-a' });
      const c = e.isClaimed('/tmp/test.js');
      assert.equal(c.claimed, true);
      assert.equal(c.holder, 'agent-a');
    });

    it('expired claims are no longer active', async () => {
      e.claim('/tmp/test.js', { tag: 'agent-a', ttlMs: 50 });
      assert.equal(e.isClaimed('/tmp/test.js').claimed, true);
      await new Promise((r) => setTimeout(r, 75));
      assert.equal(e.isClaimed('/tmp/test.js').claimed, false);
    });

    it('rejects invalid input shapes', () => {
      assert.equal(e.claim('', { tag: 'x' }).claimed, false);
      assert.equal(e.claim('/x', {}).claimed, false);
      assert.equal(e.claim('/x', { tag: 123 }).claimed, false);
    });

    it('listClaims returns all currently active claims', () => {
      e.claim('/tmp/a.js', { tag: 'agent-a' });
      e.claim('/tmp/b.js', { tag: 'agent-b' });
      e.claim('/tmp/c.js', { tag: 'agent-c' });
      e.release('/tmp/b.js', { tag: 'agent-b' });
      const claims = e.listClaims();
      const files = claims.map((c) => c.file).sort();
      assert.deepEqual(files, ['/tmp/a.js', '/tmp/c.js']);
    });
  });

  describe('snapshot', () => {
    it('returns a unified view', () => {
      e.heartbeat('agent-a');
      e.claim('/tmp/x.js', { tag: 'agent-a' });
      const s = e.snapshot();
      assert.ok(s.cognition);
      assert.ok(Array.isArray(s.peers));
      assert.ok(Array.isArray(s.claims));
      assert.ok(Array.isArray(s.recent));
      assert.equal(s.peers.length, 1);
      assert.equal(s.claims.length, 1);
      assert.equal(s.claims[0].holder, 'agent-a');
    });

    it('handles missing goggles state gracefully', () => {
      const s = e.snapshot();
      assert.equal(s.cognition.n, 0);
      assert.equal(s.recent.length, 0);
    });
  });

  describe('the coordination contract', () => {
    it('two-agent edit race is prevented', () => {
      // Agent-A claims and starts work
      const a = e.claim('/src/contested.ts', { tag: 'agent-A' });
      assert.equal(a.claimed, true);
      // Agent-B arrives, attempts to claim — must be blocked
      const b = e.claim('/src/contested.ts', { tag: 'agent-B' });
      assert.equal(b.claimed, false);
      assert.equal(b.holder, 'agent-A');
      // Agent-B yields. Agent-A finishes and releases.
      e.release('/src/contested.ts', { tag: 'agent-A' });
      // Now Agent-B can claim.
      const b2 = e.claim('/src/contested.ts', { tag: 'agent-B' });
      assert.equal(b2.claimed, true);
      assert.equal(b2.holder, 'agent-B');
    });
  });
});
