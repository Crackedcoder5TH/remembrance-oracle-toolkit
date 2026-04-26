/**
 * Agent Routing — piggyback / abundance-host header processing.
 *
 * Implements the routing protocol in REMEMBRANCE_AGENT_ACCESS_SPEC.md
 * v1.1.0:
 *
 *   - Parse X-Via-Subject from a request (or ?via= query param for
 *     unauthenticated public-form routing).
 *   - Validate the named host: tier === "merit" AND `is_host = true`
 *     AND host !== originator.
 *   - Generate self-verifying provenance_ids for every submission.
 *
 * Routing is **never** a hard gate — if a routing header is present
 * but invalid, the submission proceeds without routing attribution.
 * Hosts are abundance nodes, not gatekeepers (per the spec).
 */
import { createHmac, randomBytes } from "crypto";
import { computeAgentStats, deriveTier } from "./agent-tier";
import { isHost } from "./host-registry";

export type SubjectKind = "agent" | "human";

export interface SubjectId {
  readonly kind: SubjectKind;
  readonly id: string;        // raw label or hashed-email-prefix
  readonly full: string;      // namespaced form: "agent:claude" / "human:abc123"
}

export interface RoutingResult {
  readonly viaSubjectId: string | null;
  readonly hostValidated: boolean;
  readonly reason?: string;
}

export interface ProvenanceRecord {
  readonly provenanceId: string;
  readonly issuedAt: string;
  readonly originator: { kind: SubjectKind; subjectId: string };
  readonly viaSubjectId: string | null;
  readonly coherencyScore: number;
  readonly covenantVerdict: string;
  readonly royaltyConsent: boolean;
}

/** Build a namespaced subject_id from kind + raw id. */
export function makeSubjectId(kind: SubjectKind, rawId: string): SubjectId {
  return { kind, id: rawId, full: `${kind}:${rawId}` };
}

/**
 * Read the routing intent from a request.
 *
 * Accepts (in priority order):
 *   1. `X-Via-Subject` header              — authenticated routing
 *   2. `?via=<id>` query param             — referral-link routing
 *   3. `viaSubject` field on parsed body   — embedded form / JSON
 *
 * Returns null if no routing intent is present. The returned string is
 * the raw subject_id; validation happens in `validateRouting`.
 */
export function readRoutingIntent(
  headers: Headers,
  url: string,
  body?: { viaSubject?: unknown },
): string | null {
  const headerVal = headers.get("x-via-subject");
  if (headerVal && typeof headerVal === "string" && headerVal.trim()) {
    return headerVal.trim();
  }
  try {
    const parsed = new URL(url, "http://placeholder.invalid");
    const q = parsed.searchParams.get("via");
    if (q && q.trim()) return q.trim();
  } catch {
    // ignored — malformed URL, continue
  }
  if (body && typeof body.viaSubject === "string" && body.viaSubject.trim()) {
    return body.viaSubject.trim();
  }
  return null;
}

/**
 * Validate a routing intent. Returns a RoutingResult describing whether
 * the route was honored.
 *
 * Rules (per spec):
 *   - host MUST currently be at MERIT tier (re-checked here, not at
 *     opt-in time, so a demoted host stops being a valid route)
 *   - host MUST have is_host = true in the host registry
 *   - host !== originator (no self-routing)
 *
 * Failed validation never throws and never rejects the underlying
 * submission — it just returns viaSubjectId=null with a reason.
 */
export async function validateRouting(
  viaSubject: string | null,
  originatorSubjectId: string,
): Promise<RoutingResult> {
  if (!viaSubject) {
    return { viaSubjectId: null, hostValidated: false };
  }
  if (viaSubject === originatorSubjectId) {
    return {
      viaSubjectId: null,
      hostValidated: false,
      reason: "self-routing not allowed",
    };
  }
  const optedIn = await isHost(viaSubject);
  if (!optedIn) {
    return {
      viaSubjectId: null,
      hostValidated: false,
      reason: "named host has not opted in",
    };
  }
  // Extract the raw label from "agent:label" / "human:hash" for stats lookup.
  // Stats are tracked by raw label in the cathedral's lead-ledger.
  const rawLabel = viaSubject.includes(":")
    ? viaSubject.slice(viaSubject.indexOf(":") + 1)
    : viaSubject;
  const stats = await computeAgentStats(rawLabel);
  const hostTier = deriveTier(stats);
  if (hostTier !== "merit") {
    return {
      viaSubjectId: null,
      hostValidated: false,
      reason: `named host is currently at tier "${hostTier}", not merit`,
    };
  }
  return { viaSubjectId: viaSubject, hostValidated: true };
}

/**
 * Generate a self-verifying provenance_id.
 *
 * Format: <ulid-like>.<hmac16>
 *   - ulid-like: 26 char Crockford-base32-ish from random bytes,
 *     time-prefixed so IDs sort by issue time
 *   - hmac16: first 16 hex chars of HMAC-SHA256(ulid, PROVENANCE_SECRET)
 *
 * Holders of PROVENANCE_SECRET can verify an id without a DB lookup.
 * The fallback secret is NEXTAUTH_SECRET so production deployments
 * always have one — `PROVENANCE_SECRET` is preferred when set.
 */
export function generateProvenanceId(now: number = Date.now()): string {
  const ulid = makeUlid(now);
  const secret =
    process.env.PROVENANCE_SECRET
    || process.env.NEXTAUTH_SECRET
    || "remembrance-default-provenance-secret";
  const hmac = createHmac("sha256", secret).update(ulid).digest("hex").slice(0, 16);
  return `${ulid}.${hmac}`;
}

/** Verify a provenance_id was issued by this system. */
export function verifyProvenanceId(provenanceId: string): boolean {
  const [ulid, hmac] = provenanceId.split(".");
  if (!ulid || !hmac || ulid.length !== 26 || hmac.length !== 16) return false;
  const secret =
    process.env.PROVENANCE_SECRET
    || process.env.NEXTAUTH_SECRET
    || "remembrance-default-provenance-secret";
  const expected = createHmac("sha256", secret).update(ulid).digest("hex").slice(0, 16);
  // constant-time compare without importing timingSafeEqual on a 16-char string
  if (expected.length !== hmac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ hmac.charCodeAt(i);
  }
  return diff === 0;
}

const ULID_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function makeUlid(now: number): string {
  // 10 chars time + 16 chars random — Crockford base32 alphabet.
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
