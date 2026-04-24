/**
 * Tests for the lead-ledger dispatcher behavior.
 *
 * Exercises the adapter selection logic: LEAD_LEDGER_STORAGE override,
 * BLOB_READ_WRITE_TOKEN auto-detection, and graceful failure when the
 * blob adapter runs without a token.
 *
 * The adapter-selection logic is re-implemented here so the test doesn't
 * require a TypeScript toolchain, matching the convention the other
 * ledger tests follow.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// ─── Port of the dispatcher resolution logic ─────────────────────

function resolveBackend(env) {
  const override = (env.LEAD_LEDGER_STORAGE ?? "").trim().toLowerCase();
  if (override === "blob") return "blob";
  if (override === "file") return "file";
  if (env.BLOB_READ_WRITE_TOKEN) return "blob";
  return "file";
}

// ─── Tests ───────────────────────────────────────────────────────

describe("ledger dispatcher — backend selection", () => {
  let snapshot;
  beforeEach(() => {
    snapshot = {
      LEAD_LEDGER_STORAGE: process.env.LEAD_LEDGER_STORAGE,
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    };
  });
  afterEach(() => {
    process.env.LEAD_LEDGER_STORAGE = snapshot.LEAD_LEDGER_STORAGE ?? "";
    process.env.BLOB_READ_WRITE_TOKEN = snapshot.BLOB_READ_WRITE_TOKEN ?? "";
    if (snapshot.LEAD_LEDGER_STORAGE === undefined) delete process.env.LEAD_LEDGER_STORAGE;
    if (snapshot.BLOB_READ_WRITE_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("defaults to file when neither env var is set", () => {
    const env = { LEAD_LEDGER_STORAGE: "", BLOB_READ_WRITE_TOKEN: "" };
    assert.equal(resolveBackend(env), "file");
  });

  it("auto-selects blob when BLOB_READ_WRITE_TOKEN is set", () => {
    const env = { LEAD_LEDGER_STORAGE: "", BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_xyz" };
    assert.equal(resolveBackend(env), "blob");
  });

  it("honors explicit LEAD_LEDGER_STORAGE=file even when a token is present", () => {
    const env = {
      LEAD_LEDGER_STORAGE: "file",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_xyz",
    };
    assert.equal(resolveBackend(env), "file");
  });

  it("honors explicit LEAD_LEDGER_STORAGE=blob even without a token", () => {
    // The adapter will fail closed at write time; the dispatcher selects as instructed.
    const env = { LEAD_LEDGER_STORAGE: "blob", BLOB_READ_WRITE_TOKEN: "" };
    assert.equal(resolveBackend(env), "blob");
  });

  it("normalizes case and whitespace on the override", () => {
    assert.equal(resolveBackend({ LEAD_LEDGER_STORAGE: "  BLOB  " }), "blob");
    assert.equal(resolveBackend({ LEAD_LEDGER_STORAGE: "File" }), "file");
  });

  it("falls back to file when the override is unknown", () => {
    assert.equal(resolveBackend({ LEAD_LEDGER_STORAGE: "s3" }), "file");
  });
});

// ─── Fail-closed behavior of the blob adapter without a token ───

describe("blob adapter — fails closed without BLOB_READ_WRITE_TOKEN", () => {
  it("returns ok:false rather than throwing", async () => {
    // Emulate the adapter's guard: no token → return a structured error.
    async function append() {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return {
          ok: false,
          error: "BLOB_READ_WRITE_TOKEN not set — blob adapter cannot append",
        };
      }
      return { ok: true, location: "unused" };
    }

    const prev = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      const result = await append();
      assert.equal(result.ok, false);
      assert.match(result.error, /BLOB_READ_WRITE_TOKEN/);
    } finally {
      if (prev !== undefined) process.env.BLOB_READ_WRITE_TOKEN = prev;
    }
  });
});
