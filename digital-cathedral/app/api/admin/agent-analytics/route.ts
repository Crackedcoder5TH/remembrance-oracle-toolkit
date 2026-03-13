import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const SETTINGS_DIR = join(process.cwd(), ".data");
const SETTINGS_FILE = join(SETTINGS_DIR, "agent-settings.json");

interface AgentSettings {
  llmsTxt: string;
  agentApiEnabled: boolean;
  consentExpiryHours: number;
  rateLimits: Record<string, number>;
  allowedAgents: string[];
}

const DEFAULT_SETTINGS: AgentSettings = {
  llmsTxt: `# Valor Legacies
> Life insurance and financial protection for veterans, military families, and all Americans.

## Offered
- Term Life Insurance (Mortgage Protection, Income Replacement)
- Whole Life Insurance (Final Expense, Legacy Planning)
- Indexed Universal Life (Retirement Savings)
- Annuities (Guaranteed Income)
- Free quotes and consultations

## Contact
- Website: https://valorlegacies.com
- Lead API: /api/agent/leads (POST)
- Consent API: /api/agent/consent (POST)

## Policies
- All agent interactions require user consent
- Rate limit: 60 requests/minute
- Data retention: consent tokens expire after 72 hours`,
  agentApiEnabled: true,
  consentExpiryHours: 72,
  rateLimits: {
    leads: 60,
    consent: 30,
    register: 10,
    schema: 120,
  },
  allowedAgents: ["claude", "gpt-4", "gemini", "perplexity", "custom"],
};

async function loadSettings(): Promise<AgentSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function saveSettings(settings: AgentSettings): Promise<void> {
  await mkdir(SETTINGS_DIR, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * GET /api/admin/agent-analytics
 *
 * Returns AI agent analytics data and settings.
 * Starts empty — data populates as real agent interactions occur.
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const settings = await loadSettings();

  return NextResponse.json({
    success: true,
    agentLeads: {
      total: 0,
      byAgent: {},
      byDay: [],
      conversionRate: 0,
    },
    consentMetrics: {
      total: 0,
      confirmed: 0,
      expired: 0,
      pending: 0,
      confirmationRate: 0,
    },
    apiUsage: {
      totalRequests: 0,
      byEndpoint: {},
      rateLimitHits: 0,
      errorRate: 0,
      avgResponseTime: 0,
    },
    discoveryStats: {
      llmsTxtHits: 0,
      schemaCrawls: 0,
      mcpConnections: 0,
      aiPluginFetches: 0,
      agentJsonFetches: 0,
    },
    topReferringAgents: [],
    settings: {
      agentApiEnabled: settings.agentApiEnabled,
      consentExpiryHours: settings.consentExpiryHours,
      rateLimits: settings.rateLimits,
      allowedAgents: settings.allowedAgents,
      llmsTxt: settings.llmsTxt,
    },
  });
}

/**
 * POST /api/admin/agent-analytics
 *
 * Update AI agent settings.
 * Accepts: { llmsTxt, agentApiEnabled, consentExpiryHours, rateLimits, allowedAgents }
 */
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

  const current = await loadSettings();

  // Validate and merge
  if (typeof body.llmsTxt === "string") {
    current.llmsTxt = body.llmsTxt;
  }
  if (typeof body.agentApiEnabled === "boolean") {
    current.agentApiEnabled = body.agentApiEnabled;
  }
  if (typeof body.consentExpiryHours === "number" && body.consentExpiryHours > 0) {
    current.consentExpiryHours = body.consentExpiryHours;
  }
  if (body.rateLimits && typeof body.rateLimits === "object" && !Array.isArray(body.rateLimits)) {
    const rl = body.rateLimits as Record<string, unknown>;
    for (const [key, val] of Object.entries(rl)) {
      if (typeof val === "number" && val > 0) {
        current.rateLimits[key] = val;
      }
    }
  }
  if (Array.isArray(body.allowedAgents)) {
    current.allowedAgents = body.allowedAgents.filter(
      (a): a is string => typeof a === "string" && a.length > 0,
    );
  }

  await saveSettings(current);

  return NextResponse.json({
    success: true,
    message: "Agent settings updated.",
    settings: current,
  });
}
