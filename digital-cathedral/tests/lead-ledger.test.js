/**
 * Tests for the lead ledger — append-only JSONL record of admitted leads.
 *
 * Re-implements the ledger primitives against a temp directory so the test
 * can exercise real filesystem behavior without depending on the TS build.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdir, readFile, readdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// ─── Port of lead-ledger primitives ──────────────────────────────

function ledgerFileFor(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `ledger-${yyyy}-${mm}.jsonl`;
}

async function appendLedgerEntry(dir, entry) {
  try {
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, ledgerFileFor(new Date(entry.writtenAt)));
    const line = JSON.stringify(entry) + "\n";
    await appendFile(file, line, "utf8");
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, error: err.message ?? String(err) };
  }
}

async function listLedgerFiles(dir) {
  try {
    const names = await readdir(dir);
    return names
      .filter((n) => n.startsWith("ledger-") && n.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }
}

async function ledgerFileStats(dir, month) {
  try {
    const filePath = path.join(dir, `ledger-${month}.jsonl`);
    const s = await stat(filePath);
    const text = await readFile(filePath, "utf8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0).length;
    return { path: filePath, size: s.size, lines };
  } catch {
    return null;
  }
}

async function readRecentEntries(dir, limit) {
  try {
    const filePath = path.join(dir, ledgerFileFor(new Date()));
    const text = await readFile(filePath, "utf8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const recent = lines.slice(-limit).reverse();
    return recent.map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter((e) => e !== null);
  } catch {
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function sampleEntry(overrides = {}) {
  return {
    leadId: overrides.leadId ?? "lead_test_abc",
    writtenAt: overrides.writtenAt ?? new Date().toISOString(),
    observedAt: overrides.observedAt ?? new Date().toISOString(),
    lead: {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "5555551212",
      state: "TX",
      dateOfBirth: "1985-06-15",
      coverageInterest: "mortgage-protection",
      veteranStatus: "veteran",
      militaryBranch: "army",
      ...overrides.lead,
    },
    coherency: {
      score: 0.82,
      tier: "optimization",
      dominantArchetype: "valor/protective-veteran",
      dominantGroup: "valor",
      shape: new Array(16).fill(0.8),
      ...overrides.coherency,
    },
    covenant: {
      verdict: "admit",
      reason: "test fixture",
      ...overrides.covenant,
    },
    source: {
      ip: "127.0.0.1",
      userAgent: "test",
      referer: "/",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      ...overrides.source,
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe("lead ledger — append-only JSONL", () => {
  let tmpDir;

  before(async () => {
    tmpDir = await import("node:fs/promises").then((fs) =>
      fs.mkdtemp(path.join(os.tmpdir(), "valor-ledger-test-")));
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates directory and writes first entry", async () => {
    const entry = sampleEntry({ leadId: "lead_001" });
    const result = await appendLedgerEntry(tmpDir, entry);
    assert.equal(result.ok, true);
    assert.ok(result.path.includes("ledger-"));
    assert.ok(result.path.endsWith(".jsonl"));

    const files = await listLedgerFiles(tmpDir);
    assert.equal(files.length, 1);
  });

  it("appends subsequent entries as new lines without rewriting", async () => {
    await appendLedgerEntry(tmpDir, sampleEntry({ leadId: "lead_002" }));
    await appendLedgerEntry(tmpDir, sampleEntry({ leadId: "lead_003" }));
    const stats = await ledgerFileStats(
      tmpDir,
      ledgerFileFor(new Date()).slice(7, 14),
    );
    assert.ok(stats !== null);
    assert.equal(stats.lines, 3);
  });

  it("returns recent entries newest-first", async () => {
    const entries = await readRecentEntries(tmpDir, 10);
    assert.equal(entries.length, 3);
    assert.equal(entries[0].leadId, "lead_003");
    assert.equal(entries[2].leadId, "lead_001");
  });

  it("respects the limit parameter", async () => {
    const entries = await readRecentEntries(tmpDir, 2);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].leadId, "lead_003");
    assert.equal(entries[1].leadId, "lead_002");
  });

  it("rotates by month — two months produce two files", async () => {
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    await appendLedgerEntry(tmpDir, sampleEntry({
      leadId: "lead_prev_month",
      writtenAt: lastMonth.toISOString(),
    }));

    const files = await listLedgerFiles(tmpDir);
    assert.equal(files.length, 2, `expected two files, got ${files.join(",")}`);
  });

  it("roundtrips coherency shape + archetype data intact", async () => {
    const shape = Array.from({ length: 16 }, (_, i) => i / 16);
    await appendLedgerEntry(tmpDir, sampleEntry({
      leadId: "lead_roundtrip",
      coherency: {
        score: 0.7123,
        tier: "foundation",
        dominantArchetype: "valor/engaged-civilian",
        dominantGroup: "valor",
        shape,
      },
    }));
    const entries = await readRecentEntries(tmpDir, 1);
    assert.equal(entries[0].leadId, "lead_roundtrip");
    assert.deepEqual(entries[0].coherency.shape, shape);
    assert.equal(entries[0].coherency.dominantArchetype, "valor/engaged-civilian");
    assert.equal(entries[0].coherency.score, 0.7123);
  });

  it("handles corrupt lines gracefully during read", async () => {
    const filePath = path.join(tmpDir, ledgerFileFor(new Date()));
    await appendFile(filePath, '{not-valid-json\n', "utf8");
    const entries = await readRecentEntries(tmpDir, 20);
    // All previously written valid entries should still be parsed; the bad line is skipped.
    assert.ok(entries.length >= 4, `expected valid entries to remain, got ${entries.length}`);
    for (const e of entries) {
      assert.ok(typeof e.leadId === "string");
    }
  });
});
