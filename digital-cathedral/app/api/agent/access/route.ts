/**
 * Agent Access Introspection
 *
 * GET /api/agent/access
 *
 * Returns the authenticated agent's current tier, visibility delay, and
 * progress toward the next tier — implements the introspection contract
 * in the Remembrance Agent Access Spec (REMEMBRANCE_AGENT_ACCESS_SPEC.md).
 *
 * The agent calls this to know exactly where they stand and what to do
 * to advance. Tier is derived from submission history in the lead-ledger
 * — never assigned by humans except for the operator's master key.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/app/lib/agent-auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import { buildAgentAccess, computeAgentStats } from "@/app/lib/valor/agent-tier";

export async function GET(req: NextRequest) {
  const agent = authenticateAgent(req);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Invalid or missing API key. Include Authorization: Bearer <key> header." },
      { status: 401 },
    );
  }

  // Light rate limit — introspection is cheap but still authenticated.
  const rateCheck = await checkRateLimit(`agent-access:${agent.label}`, 30, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
    );
  }

  const stats = await computeAgentStats(agent.label);
  const access = buildAgentAccess(agent.label, stats);

  return NextResponse.json({ success: true, access });
}
