/**
 * Agent API Key Authentication
 *
 * AI agents authenticate via Bearer token in the Authorization header.
 * API keys are configured via AGENT_API_KEYS environment variable.
 *
 * Supports two formats (auto-detected per entry):
 *   Hashed (preferred):   "sha256hex:label"  (64-char hex before colon)
 *   Plaintext (compat):   "key:label"        (hashed at parse time)
 *
 * Generate hashed keys:
 *   node -e "console.log(require('crypto').createHash('sha256').update('my-key').digest('hex'))"
 */

import { NextRequest } from "next/server";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export interface AgentIdentity {
  key: string;
  label: string;
}

/** SHA-256 hash a plaintext API key. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Parse AGENT_API_KEYS env var into a map of sha256-hash → label.
 * Pre-hashed keys (64-char hex) are used as-is; plaintext keys are hashed on load.
 */
function getAgentKeys(): Map<string, string> {
  const raw = process.env.AGENT_API_KEYS || "";
  const keys = new Map<string, string>();

  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const keyPart = trimmed.slice(0, colonIdx);
      const label = trimmed.slice(colonIdx + 1);
      const isPreHashed = /^[0-9a-f]{64}$/.test(keyPart);
      keys.set(isPreHashed ? keyPart : hashApiKey(keyPart), label);
    } else {
      keys.set(hashApiKey(trimmed), "unknown-agent");
    }
  }

  return keys;
}

/**
 * Validate an agent API key from the request.
 * Hashes the incoming bearer token and compares against stored hashes
 * using timing-safe comparison to prevent timing attacks.
 */
export function authenticateAgent(req: NextRequest): AgentIdentity | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const key = match[1].trim();
  const incomingHash = hashApiKey(key);
  const incomingBuf = Buffer.from(incomingHash, "hex");

  const keys = getAgentKeys();

  for (const [storedHash, label] of keys) {
    const storedBuf = Buffer.from(storedHash, "hex");
    if (storedBuf.length === incomingBuf.length && timingSafeEqual(storedBuf, incomingBuf)) {
      return { key: storedHash, label };
    }
  }

  return null;
}

// --- Consent Token System ---

/**
 * Consent tokens are HMAC-signed payloads that prove a human approved
 * an AI agent's action. Format: base64url(payload).signature
 *
 * Payload: { email, scope, agentLabel, exp, confirmed }
 */

export interface ConsentPayload {
  email: string;
  scope: "lead-submission" | "account-registration" | "both";
  agentLabel: string;
  exp: number;
  confirmed: boolean;
  consentId: string;
}

const CONSENT_DURATION_S = 24 * 60 * 60; // 24 hours

function getConsentSecret(): string {
  const key = process.env.AGENT_CONSENT_SECRET || process.env.NEXTAUTH_SECRET || process.env.ADMIN_API_KEY;
  if (!key) throw new Error("AGENT_CONSENT_SECRET, NEXTAUTH_SECRET, or ADMIN_API_KEY must be set");
  return key;
}

function signConsent(payload: string): string {
  return createHmac("sha256", getConsentSecret())
    .update(payload)
    .digest("base64url");
}

/** Create a pending (unconfirmed) consent token */
export function createConsentToken(
  email: string,
  scope: ConsentPayload["scope"],
  agentLabel: string,
): { token: string; consentId: string; expiresAt: string } {
  const consentId = `consent_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
  const exp = Math.floor(Date.now() / 1000) + CONSENT_DURATION_S;
  const payload: ConsentPayload = { email, scope, agentLabel, exp, confirmed: false, consentId };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signConsent(encoded);
  const token = `${encoded}.${sig}`;

  return {
    token,
    consentId,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

/** Confirm a consent token (called when the human clicks the confirmation link) */
export function confirmConsentToken(token: string): { token: string; payload: ConsentPayload } | null {
  const decoded = verifyConsentToken(token);
  if (!decoded) return null;

  // Re-sign with confirmed=true
  const confirmed: ConsentPayload = { ...decoded, confirmed: true };
  const encoded = Buffer.from(JSON.stringify(confirmed)).toString("base64url");
  const sig = signConsent(encoded);

  return {
    token: `${encoded}.${sig}`,
    payload: confirmed,
  };
}

/** Verify and decode a consent token. Returns null if invalid or expired. */
export function verifyConsentToken(token: string): ConsentPayload | null {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;

    const expectedSig = signConsent(encoded);

    // Constant-time comparison
    if (sig.length !== expectedSig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8")) as ConsentPayload;

    if (typeof data.exp !== "number") return null;
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;

    return data;
  } catch {
    return null;
  }
}
