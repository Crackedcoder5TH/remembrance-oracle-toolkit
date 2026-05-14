/**
 * Tests for app/lib/valor/agent-routing.ts — header parsing,
 * provenance_id generation/verification, and routing validation
 * (per REMEMBRANCE_AGENT_ACCESS_SPEC v1.1).
 *
 * Re-implements the relevant logic in plain JS so the suite doesn't
 * need a TS toolchain. Validation tests use injected stubs for tier
 * derivation + host registry to keep this isolated from I/O.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";

// ─── Port of agent-routing.ts ─────────────────────────────────────

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function makeUlid(now) {
  let timePart = "";
  let n = now;
  for (let i = 0; i < 10; i++) {
    timePart = ULID_ALPHABET[n % 32] + timePart;
    n = Math.floor(n / 32);
  }
  const rand = randomBytes(10);
  let randPart = "";
  for (let i = 0; i < 16; i++) {
    randPart += ULID_ALPHABET[rand[i % rand.length] % 32];
  }
  return timePart + randPart;
}

function getSecret() {
  return (
    process.env.PROVENANCE_SECRET
    || process.env.NEXTAUTH_SECRET
    || "remembrance-default-provenance-secret"
  );
}

function generateProvenanceId(now = Date.now()) {
  const ulid = makeUlid(now);
  const hmac = createHmac("sha256", getSecret()).update(ulid).digest("hex").slice(0, 16);
  return `${ulid}.${hmac}`;
}

function verifyProvenanceId(provenanceId) {
  const [ulid, hmac] = provenanceId.split(".");
  if (!ulid || !hmac || ulid.length !== 26 || hmac.length !== 16) return false;
  const expected = createHmac("sha256", getSecret()).update(ulid).digest("hex").slice(0, 16);
  if (expected.length !== hmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ hmac.charCodeAt(i);
  }
  return diff === 0;
}

function readRoutingIntent(headers, url, body) {
  const headerVal = headers.get("x-via-subject");
  if (headerVal && typeof headerVal === "string" && headerVal.trim()) {
    return headerVal.trim();
  }
  try {
    const parsed = new URL(url, "http://placeholder.invalid");
    const q = parsed.searchParams.get("via");
    if (q && q.trim()) return q.trim();
  } catch {
    // ignored
  }
  if (body && typeof body.viaSubject === "string" && body.viaSubject.trim()) {
    return body.viaSubject.trim();
  }
  return null;
}

async function validateRouting(viaSubject, originatorSubjectId, deps) {
  if (!viaSubject) return { viaSubjectId: null, hostValidated: false };
  if (viaSubject === originatorSubjectId) {
    return {
      viaSubjectId: null,
      hostValidated: false,
      reason: "self-routing not allowed",
    };
  }
  const optedIn = await deps.isHost(viaSubject);
  if (!optedIn) {
    return {
      viaSubjectId: null,
      hostValidated: false,
      reason: "named host has not opted in",
    };
  }
  const tier = await deps.tierOf(viaSubject);
  if (tier !== "merit") {
    return {
      viaSubjectId: null,
      hostValidated: false,
      reason: `named host is currently at tier "${tier}", not merit`,
    };
  }
  return { viaSubjectId: viaSubject, hostValidated: true };
}

// ─── Tests ────────────────────────────────────────────────────────

describe("readRoutingIntent", () => {
  it("returns header X-Via-Subject when set", () => {
    const h = new Headers({ "x-via-subject": "agent:partner" });
    assert.equal(readRoutingIntent(h, "/api/agent/leads"), "agent:partner");
  });

  it("falls back to ?via= query param", () => {
    const h = new Headers();
    assert.equal(
      readRoutingIntent(h, "/api/agent/leads?via=agent:partner"),
      "agent:partner",
    );
  });

  it("falls back to body.viaSubject", () => {
    const h = new Headers();
    assert.equal(
      readRoutingIntent(h, "/api/agent/leads", { viaSubject: "agent:partner" }),
      "agent:partner",
    );
  });

  it("header beats query and body", () => {
    const h = new Headers({ "x-via-subject": "agent:from-header" });
    assert.equal(
      readRoutingIntent(h, "/api/agent/leads?via=agent:from-query", { viaSubject: "agent:from-body" }),
      "agent:from-header",
    );
  });

  it("query beats body when no header", () => {
    const h = new Headers();
    assert.equal(
      readRoutingIntent(h, "/api/agent/leads?via=agent:from-query", { viaSubject: "agent:from-body" }),
      "agent:from-query",
    );
  });

  it("returns null when nothing is set", () => {
    assert.equal(readRoutingIntent(new Headers(), "/api/agent/leads"), null);
  });

  it("trims whitespace", () => {
    const h = new Headers({ "x-via-subject": "  agent:partner  " });
    assert.equal(readRoutingIntent(h, "/api/agent/leads"), "agent:partner");
  });

  it("returns null for empty / whitespace-only values", () => {
    const h = new Headers({ "x-via-subject": "   " });
    assert.equal(readRoutingIntent(h, "/api/agent/leads"), null);
  });
});

describe("validateRouting", () => {
  const meritOptedIn = {
    isHost: async () => true,
    tierOf: async () => "merit",
  };
  const meritNotOptedIn = {
    isHost: async () => false,
    tierOf: async () => "merit",
  };
  const optedInButBasic = {
    isHost: async () => true,
    tierOf: async () => "basic",
  };

  it("null intent returns viaSubjectId=null without reason", async () => {
    const r = await validateRouting(null, "agent:claude", meritOptedIn);
    assert.equal(r.viaSubjectId, null);
    assert.equal(r.hostValidated, false);
    assert.equal(r.reason, undefined);
  });

  it("self-routing is blocked with reason", async () => {
    const r = await validateRouting("agent:claude", "agent:claude", meritOptedIn);
    assert.equal(r.viaSubjectId, null);
    assert.match(r.reason, /self-routing/);
  });

  it("merit + opted-in is honored", async () => {
    const r = await validateRouting("agent:host", "agent:claude", meritOptedIn);
    assert.equal(r.viaSubjectId, "agent:host");
    assert.equal(r.hostValidated, true);
  });

  it("merit but not opted-in is rejected with reason", async () => {
    const r = await validateRouting("agent:host", "agent:claude", meritNotOptedIn);
    assert.equal(r.viaSubjectId, null);
    assert.match(r.reason, /not opted in/);
  });

  it("opted-in but demoted to basic is rejected with reason", async () => {
    const r = await validateRouting("agent:host", "agent:claude", optedInButBasic);
    assert.equal(r.viaSubjectId, null);
    assert.match(r.reason, /not merit/);
  });
});

describe("provenance_id", () => {
  it("generates a 26.16 format ID", () => {
    const id = generateProvenanceId();
    const [ulid, hmac] = id.split(".");
    assert.equal(ulid.length, 26);
    assert.equal(hmac.length, 16);
  });

  it("verifies its own IDs", () => {
    const id = generateProvenanceId();
    assert.equal(verifyProvenanceId(id), true);
  });

  it("rejects tampered IDs", () => {
    const id = generateProvenanceId();
    const [ulid, hmac] = id.split(".");
    const tampered = ulid.slice(0, -1) + "X" + "." + hmac;
    assert.equal(verifyProvenanceId(tampered), false);
  });

  it("rejects malformed IDs", () => {
    assert.equal(verifyProvenanceId("not-a-valid-id"), false);
    assert.equal(verifyProvenanceId(""), false);
    assert.equal(verifyProvenanceId("short.short"), false);
  });

  it("IDs sort by issue time (ULID prefix is monotonic)", () => {
    const t1 = Date.parse("2026-01-01T00:00:00Z");
    const t2 = Date.parse("2026-06-01T00:00:00Z");
    const id1 = generateProvenanceId(t1);
    const id2 = generateProvenanceId(t2);
    assert.ok(id1 < id2, `expected ${id1} < ${id2}`);
  });

  it("two IDs at the same instant differ in the random tail", () => {
    const t = Date.now();
    const a = generateProvenanceId(t);
    const b = generateProvenanceId(t);
    assert.notEqual(a, b);
  });
});
