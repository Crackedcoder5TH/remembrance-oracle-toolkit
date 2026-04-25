/**
 * Tests for app/lib/valor/host-registry.ts — the on-disk `is_host`
 * flag store for Abundance Hosts (REMEMBRANCE_AGENT_ACCESS_SPEC v1.1).
 *
 * Re-implements the registry in plain JS (matching the convention of
 * the other valor tests). The TS module is a thin wrapper around the
 * same JSON shape, so any drift is a bug signal.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Port of host-registry.ts (file-mode) ─────────────────────────

let HOSTS_DIR;
let HOSTS_FILE;

function readFileSafe() {
  try {
    if (!existsSync(HOSTS_FILE)) return { hosts: {} };
    const raw = readFileSync(HOSTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.hosts || typeof parsed.hosts !== "object") return { hosts: {} };
    return parsed;
  } catch {
    return { hosts: {} };
  }
}

function writeFileSafe(file) {
  if (!existsSync(HOSTS_DIR)) mkdirSync(HOSTS_DIR, { recursive: true });
  writeFileSync(HOSTS_FILE, JSON.stringify(file, null, 2), "utf-8");
}

function isHost(subjectId) {
  const file = readFileSafe();
  return Boolean(file.hosts[subjectId]);
}

function setHost(subjectId, enabled, note) {
  const file = readFileSafe();
  const next = { hosts: { ...file.hosts } };
  if (enabled) {
    next.hosts[subjectId] = {
      subjectId,
      enabledAt: new Date().toISOString(),
      ...(note ? { note } : {}),
    };
  } else {
    delete next.hosts[subjectId];
  }
  writeFileSafe(next);
}

function listHosts() {
  return Object.keys(readFileSafe().hosts);
}

// ─── Tests ────────────────────────────────────────────────────────

describe("host-registry", () => {
  beforeEach(() => {
    HOSTS_DIR = mkdtempSync(join(tmpdir(), "valor-hosts-"));
    HOSTS_FILE = join(HOSTS_DIR, "host-registry.json");
  });

  it("returns false for any subject before opt-in", () => {
    assert.equal(isHost("agent:claude"), false);
    assert.equal(isHost("human:abc123"), false);
  });

  it("setHost(true) makes isHost return true", () => {
    setHost("agent:claude", true);
    assert.equal(isHost("agent:claude"), true);
  });

  it("setHost(false) removes the entry", () => {
    setHost("agent:claude", true);
    assert.equal(isHost("agent:claude"), true);
    setHost("agent:claude", false);
    assert.equal(isHost("agent:claude"), false);
  });

  it("subjects are isolated", () => {
    setHost("agent:claude", true);
    assert.equal(isHost("agent:claude"), true);
    assert.equal(isHost("agent:gpt-4"), false);
    assert.equal(isHost("human:abc123"), false);
  });

  it("listHosts returns every opted-in subject", () => {
    setHost("agent:claude", true);
    setHost("agent:gpt-4", true);
    setHost("human:abc123", true);
    const list = listHosts();
    assert.equal(list.length, 3);
    assert.ok(list.includes("agent:claude"));
    assert.ok(list.includes("human:abc123"));
  });

  it("note is preserved on opt-in and dropped on opt-out", () => {
    setHost("agent:claude", true, "I'm running a review service");
    const file = readFileSafe();
    assert.equal(file.hosts["agent:claude"].note, "I'm running a review service");
    setHost("agent:claude", false);
    const after = readFileSafe();
    assert.equal(after.hosts["agent:claude"], undefined);
  });

  it("survives a corrupt file by returning empty registry", () => {
    if (!existsSync(HOSTS_DIR)) mkdirSync(HOSTS_DIR, { recursive: true });
    writeFileSync(HOSTS_FILE, "{ this is not json", "utf-8");
    assert.equal(isHost("agent:claude"), false);
    assert.deepEqual(listHosts(), []);
  });
});
