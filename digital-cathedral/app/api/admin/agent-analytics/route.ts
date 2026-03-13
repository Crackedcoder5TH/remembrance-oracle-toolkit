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

/** Generate last-30-days date labels */
function getLast30Days(): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

/** Deterministic mock number from a seed string */
function mockNum(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  return min + (hash % (max - min + 1));
}

/**
 * GET /api/admin/agent-analytics
 *
 * Returns AI agent analytics data: agent leads, consent metrics,
 * API usage, discovery stats, and top referring agents.
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const settings = await loadSettings();

  const days = getLast30Days();
  const byDay = days.map((date) => ({
    date,
    claude: mockNum(`claude-${date}`, 0, 8),
    "gpt-4": mockNum(`gpt4-${date}`, 0, 6),
    gemini: mockNum(`gemini-${date}`, 0, 4),
    perplexity: mockNum(`pplx-${date}`, 0, 3),
    custom: mockNum(`custom-${date}`, 0, 2),
  }));

  const agentTotals = {
    claude: byDay.reduce((s, d) => s + d.claude, 0),
    "gpt-4": byDay.reduce((s, d) => s + d["gpt-4"], 0),
    gemini: byDay.reduce((s, d) => s + d.gemini, 0),
    perplexity: byDay.reduce((s, d) => s + d.perplexity, 0),
    custom: byDay.reduce((s, d) => s + d.custom, 0),
  };

  const totalLeads = Object.values(agentTotals).reduce((a, b) => a + b, 0);

  const agentLeads = {
    total: totalLeads,
    byAgent: agentTotals,
    byDay,
    conversionRate: 0.23,
  };

  const consentMetrics = {
    total: Math.round(totalLeads * 1.8),
    confirmed: Math.round(totalLeads * 1.3),
    expired: Math.round(totalLeads * 0.3),
    pending: Math.round(totalLeads * 0.2),
    confirmationRate: 0.72,
  };

  const apiUsage = {
    totalRequests: totalLeads * 12,
    byEndpoint: {
      "/api/agent/leads": totalLeads * 4,
      "/api/agent/consent": Math.round(totalLeads * 3.2),
      "/api/agent/register": Math.round(totalLeads * 1.5),
      "/.well-known/schema": totalLeads * 3,
      "/llms.txt": Math.round(totalLeads * 0.3),
    },
    rateLimitHits: mockNum("ratelimit", 2, 18),
    errorRate: 0.012,
    avgResponseTime: 142,
  };

  const discoveryStats = {
    llmsTxtHits: mockNum("llms-hits", 120, 480),
    schemaCrawls: mockNum("schema-crawls", 80, 320),
    mcpConnections: mockNum("mcp-conn", 5, 25),
    aiPluginFetches: mockNum("aiplugin", 40, 160),
    agentJsonFetches: mockNum("agentjson", 60, 200),
  };

  const topReferringAgents = [
    {
      agent: "Claude (Anthropic)",
      leads: agentTotals.claude,
      lastActive: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
    {
      agent: "GPT-4 (OpenAI)",
      leads: agentTotals["gpt-4"],
      lastActive: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    },
    {
      agent: "Gemini (Google)",
      leads: agentTotals.gemini,
      lastActive: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
    {
      agent: "Perplexity",
      leads: agentTotals.perplexity,
      lastActive: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    },
    {
      agent: "Custom Agents",
      leads: agentTotals.custom,
      lastActive: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    },
  ];

  return NextResponse.json({
    success: true,
    agentLeads,
    consentMetrics,
    apiUsage,
    discoveryStats,
    topReferringAgents,
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
