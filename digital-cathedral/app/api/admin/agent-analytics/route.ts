import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  buildAgentAnalyticsSnapshot,
  loadAgentSettings,
  mergeAgentSettings,
  saveAgentSettings,
} from "@/app/lib/agent-analytics-data";

/**
 * GET  /api/admin/agent-analytics — analytics snapshot + current settings
 * POST /api/admin/agent-analytics — partial settings update (typed merge)
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const settings = await loadAgentSettings();
  const snapshot = buildAgentAnalyticsSnapshot();

  return NextResponse.json({
    success: true,
    ...snapshot,
    settings: {
      agentApiEnabled: settings.agentApiEnabled,
      consentExpiryHours: settings.consentExpiryHours,
      rateLimits: settings.rateLimits,
      allowedAgents: settings.allowedAgents,
      llmsTxt: settings.llmsTxt,
    },
  });
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const current = await loadAgentSettings();
  const merged = mergeAgentSettings(current, body);
  await saveAgentSettings(merged);

  return NextResponse.json({
    success: true,
    message: "Agent settings updated.",
    settings: merged,
  });
}
