/**
 * AI-agent settings persistence + mock analytics generation.
 *
 * Settings live in .data/agent-settings.json on the local filesystem. This
 * is fine for local dev but ephemeral on Vercel — saveSettings() warns when
 * it detects the serverless environment. Migrate to Postgres or Blob before
 * relying on persisted edits in production.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

const SETTINGS_DIR = join(process.cwd(), ".data");
const SETTINGS_FILE = join(SETTINGS_DIR, "agent-settings.json");

export interface AgentSettings {
  llmsTxt: string;
  agentApiEnabled: boolean;
  consentExpiryHours: number;
  rateLimits: Record<string, number>;
  allowedAgents: string[];
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
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

export async function loadAgentSettings(): Promise<AgentSettings> {
  try {
    const raw = await readFile(SETTINGS_FILE, "utf-8");
    return { ...DEFAULT_AGENT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_AGENT_SETTINGS;
  }
}

export async function saveAgentSettings(settings: AgentSettings): Promise<void> {
  if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
    // eslint-disable-next-line no-console
    console.warn(
      "[agent-analytics] WARNING: settings write goes to ephemeral filesystem. " +
        "Changes will NOT persist across cold starts. Migrate to Postgres or Blob.",
    );
  }
  await mkdir(SETTINGS_DIR, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Merge a partial untrusted body into an existing AgentSettings record,
 * filtering by type. Unknown fields are dropped.
 */
export function mergeAgentSettings(
  current: AgentSettings,
  body: Record<string, unknown>,
): AgentSettings {
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
  return current;
}

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

function mockNum(seed: string, min: number, max: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }
  return min + (hash % (max - min + 1));
}

/**
 * Build the mock analytics payload returned by GET /api/admin/agent-analytics.
 * Deterministic per-day so the dashboard renders stable values until real
 * usage data lands.
 */
export function buildAgentAnalyticsSnapshot() {
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

  return {
    agentLeads: {
      total: totalLeads,
      byAgent: agentTotals,
      byDay,
      conversionRate: 0.23,
    },
    consentMetrics: {
      total: Math.round(totalLeads * 1.8),
      confirmed: Math.round(totalLeads * 1.3),
      expired: Math.round(totalLeads * 0.3),
      pending: Math.round(totalLeads * 0.2),
      confirmationRate: 0.72,
    },
    apiUsage: {
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
    },
    discoveryStats: {
      llmsTxtHits: mockNum("llms-hits", 120, 480),
      schemaCrawls: mockNum("schema-crawls", 80, 320),
      mcpConnections: mockNum("mcp-conn", 5, 25),
      aiPluginFetches: mockNum("aiplugin", 40, 160),
      agentJsonFetches: mockNum("agentjson", 60, 200),
    },
    topReferringAgents: [
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
    ],
  };
}
