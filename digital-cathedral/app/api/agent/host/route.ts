/**
 * Abundance Host Opt-In
 *
 * POST   /api/agent/host  { enabled: true|false, note?: string }
 * GET    /api/agent/host
 *
 * Lets a MERIT-tier subject flip their `is_host` flag. Per the spec,
 * only merit subjects may opt in — basic subjects get a 403 with a
 * clear reason and their current promotion progress so they know
 * what's left.
 *
 * Hosting is non-monetary on both sides. The host's reward is leverage
 * (real-time view of routed submissions) plus a small slice of any
 * royalty downstream triggered by submissions they hosted (Stage 2).
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent } from "@/app/lib/agent-auth";
import { checkRateLimit } from "@/app/lib/rate-limit";
import {
  buildAgentAccess,
  computeAgentStats,
  deriveTier,
} from "@/app/lib/valor/agent-tier";
import { isHost, setHost } from "@/app/lib/valor/host-registry";
import { makeSubjectId } from "@/app/lib/valor/agent-routing";

export async function GET(req: NextRequest) {
  const agent = authenticateAgent(req);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Invalid or missing API key." },
      { status: 401 },
    );
  }
  const subjectId = makeSubjectId("agent", agent.label).full;
  const enabled = await isHost(subjectId);
  return NextResponse.json({ success: true, subjectId, isHost: enabled });
}

export async function POST(req: NextRequest) {
  const agent = authenticateAgent(req);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Invalid or missing API key." },
      { status: 401 },
    );
  }

  const rateCheck = await checkRateLimit(`agent-host:${agent.label}`, 10, 60_000);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rateCheck.retryAfterMs / 1000)) } },
    );
  }

  let body: { enabled?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body. Expected { enabled: boolean, note?: string }." },
      { status: 400 },
    );
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { success: false, error: "Field `enabled` must be a boolean." },
      { status: 400 },
    );
  }

  const subjectId = makeSubjectId("agent", agent.label).full;
  const stats = await computeAgentStats(agent.label);
  const tier = deriveTier(stats);

  // Only merit subjects can opt in. Disabling is allowed at any tier
  // (a former-merit subject who got demoted should still be able to
  // explicitly disable their flag).
  if (body.enabled && tier !== "merit") {
    return NextResponse.json(
      {
        success: false,
        error: "Only MERIT-tier subjects can opt in to hosting.",
        access: buildAgentAccess(agent.label, stats),
      },
      { status: 403 },
    );
  }

  const note = typeof body.note === "string" ? body.note.slice(0, 200) : undefined;
  await setHost(subjectId, body.enabled, note);

  return NextResponse.json({
    success: true,
    subjectId,
    isHost: body.enabled,
    access: buildAgentAccess(agent.label, stats),
  });
}
