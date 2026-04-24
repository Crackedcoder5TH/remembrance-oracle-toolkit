"use client";

/**
 * AI Agent Intelligence — Admin Portal
 *
 * Protected admin page for viewing and tweaking AI agent data.
 *
 * Tabs:
 *  - Overview: Agent leads, consent rate, API calls, active agents
 *  - Consent Tracking: Consent requests table and funnel
 *  - API Analytics: Request volume, errors, rate limits, response times
 *  - Discovery & SEO: AI discovery file hits, crawler activity
 *  - Settings: Toggle agent API, consent expiry, rate limits, llms.txt
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentLeads {
  total: number;
  byAgent: Record<string, number>;
  byDay: Array<Record<string, number | string>>;
  conversionRate: number;
}

interface ConsentMetrics {
  total: number;
  confirmed: number;
  expired: number;
  pending: number;
  confirmationRate: number;
}

interface ApiUsage {
  totalRequests: number;
  byEndpoint: Record<string, number>;
  rateLimitHits: number;
  errorRate: number;
  avgResponseTime: number;
}

interface DiscoveryStats {
  llmsTxtHits: number;
  schemaCrawls: number;
  mcpConnections: number;
  aiPluginFetches: number;
  agentJsonFetches: number;
}

interface TopAgent {
  agent: string;
  leads: number;
  lastActive: string;
}

interface AgentSettings {
  agentApiEnabled: boolean;
  consentExpiryHours: number;
  rateLimits: Record<string, number>;
  allowedAgents: string[];
  llmsTxt: string;
}

interface AnalyticsData {
  agentLeads: AgentLeads;
  consentMetrics: ConsentMetrics;
  apiUsage: ApiUsage;
  discoveryStats: DiscoveryStats;
  topReferringAgents: TopAgent[];
  settings: AgentSettings;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  "Overview",
  "Consent Tracking",
  "API Analytics",
  "Discovery & SEO",
  "Settings",
] as const;

type Tab = (typeof TABS)[number];

const STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  revoked: "bg-sky-50 text-sky-700 border-sky-200",
};

const AGENT_COLORS: Record<string, string> = {
  claude: "bg-teal-cathedral",
  "gpt-4": "bg-emerald-500",
  gemini: "bg-blue-500",
  perplexity: "bg-purple-500",
  custom: "bg-amber-500",
};

// Mock consent rows for the consent tracking table
function generateMockConsents(): Array<{
  id: string;
  agent: string;
  email: string;
  scope: string;
  status: string;
  timestamp: string;
}> {
  const agents = ["Claude", "GPT-4", "Gemini", "Perplexity", "Custom Agent"];
  const scopes = ["lead-submission", "quote-request", "contact-info", "full-profile"];
  const statuses = ["confirmed", "pending", "expired", "confirmed", "confirmed"];
  const emails = [
    "john.doe@email.com",
    "sarah.m@gmail.com",
    "mike.veteran@mail.com",
    "lisa.jones@yahoo.com",
    "carlos.r@outlook.com",
    "amanda.w@proton.me",
    "james.t@email.com",
    "patricia.h@gmail.com",
  ];

  return Array.from({ length: 12 }, (_, i) => ({
    id: `consent-${(1000 + i).toString(36)}`,
    agent: agents[i % agents.length],
    email: emails[i % emails.length],
    scope: scopes[i % scopes.length],
    status: statuses[i % statuses.length],
    timestamp: new Date(Date.now() - i * 1000 * 60 * 60 * 3).toISOString(),
  }));
}

// Mock crawler activity
const CRAWLERS = [
  { name: "GPTBot", status: "active", lastSeen: "2 hours ago", pages: 47 },
  { name: "Claude-Web", status: "active", lastSeen: "35 minutes ago", pages: 32 },
  { name: "PerplexityBot", status: "active", lastSeen: "4 hours ago", pages: 18 },
  { name: "Google-Extended", status: "idle", lastSeen: "1 day ago", pages: 124 },
  { name: "Bingbot (AI)", status: "active", lastSeen: "6 hours ago", pages: 56 },
  { name: "Cohere-ai", status: "idle", lastSeen: "3 days ago", pages: 8 },
];

// Discovery recommendations
const RECOMMENDATIONS = [
  { text: "Add structured FAQ schema to improve AI answer accuracy", done: true },
  { text: "Create /api/agent/register endpoint for agent self-registration", done: true },
  { text: "Add MCP server configuration for direct tool integration", done: false },
  { text: "Implement agent.json at /.well-known/agent.json", done: true },
  { text: "Add AI-specific sitemap with priority hints", done: false },
  { text: "Set up consent verification webhook for real-time validation", done: false },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AIAgentsAdmin() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<AgentSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/agent-analytics");
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        setError("Failed to load analytics data.");
        return;
      }
      const json = await res.json();
      setData(json);
      if (!settingsForm) {
        setSettingsForm(json.settings);
      }
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setLoading(false);
    }
  }, [router, settingsForm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSettings = async () => {
    if (!settingsForm) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/admin/agent-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsForm),
      });
      if (res.ok) {
        setSaveMessage({ text: "Settings saved successfully.", type: "success" });
        setTimeout(() => setSaveMessage(null), 4000);
      } else {
        const body = await res.json().catch(() => null);
        setSaveMessage({ text: body?.message || "Failed to save settings.", type: "error" });
      }
    } catch {
      setSaveMessage({ text: "Network error.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Helpers
  const formatNum = (n: number) => n.toLocaleString();
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // Bar width for agent leads chart
  const maxAgentLeads = data
    ? Math.max(...Object.values(data.agentLeads.byAgent), 1)
    : 1;

  const mockConsents = generateMockConsents();

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="min-h-screen px-4 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div>
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase pulse-gentle">
            Admin
          </div>
          <h1 className="text-3xl font-light text-[var(--text-primary)]">
            AI Agent Intelligence
          </h1>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 rounded-lg text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <nav className="flex gap-1 mb-8 border-b border-indigo-cathedral/10" aria-label="AI Agent tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              activeTab === tab
                ? "border-teal-cathedral text-teal-cathedral"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-indigo-cathedral/20"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Loading */}
      {loading && !data && (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading analytics...</div>
      )}

      {/* Tab Content */}
      {data && (
        <>
          {/* ============================================================= */}
          {/* OVERVIEW TAB                                                   */}
          {/* ============================================================= */}
          {activeTab === "Overview" && (
            <div className="space-y-8">
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="Agent overview statistics">
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Total Agent Leads
                  </p>
                  <p className="text-2xl font-light text-[var(--text-primary)] mt-1">
                    {formatNum(data.agentLeads.total)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {pct(data.agentLeads.conversionRate)} conversion
                  </p>
                </div>
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Consent Rate
                  </p>
                  <p className="text-2xl font-light text-teal-cathedral mt-1">
                    {pct(data.consentMetrics.confirmationRate)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {formatNum(data.consentMetrics.confirmed)} confirmed
                  </p>
                </div>
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    API Calls (24h)
                  </p>
                  <p className="text-2xl font-light text-[var(--text-primary)] mt-1">
                    {formatNum(data.apiUsage.totalRequests)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {data.apiUsage.avgResponseTime}ms avg
                  </p>
                </div>
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Active Agents
                  </p>
                  <p className="text-2xl font-light text-[var(--text-primary)] mt-1">
                    {Object.keys(data.agentLeads.byAgent).length}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    across all platforms
                  </p>
                </div>
              </div>

              {/* Leads by Agent Bar Chart */}
              <div className="cathedral-surface p-6" role="region" aria-label="Leads by agent">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">
                  Leads by Agent
                </h2>
                <div className="space-y-3">
                  {Object.entries(data.agentLeads.byAgent)
                    .sort(([, a], [, b]) => b - a)
                    .map(([agent, count]) => (
                      <div key={agent} className="flex items-center gap-3">
                        <span className="text-sm text-[var(--text-primary)] w-24 capitalize">
                          {agent}
                        </span>
                        <div className="flex-1 bg-[var(--bg-surface)] rounded-full h-6 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${AGENT_COLORS[agent] || "bg-gray-400"} transition-all duration-500`}
                            style={{ width: `${Math.max((count / maxAgentLeads) * 100, 2)}%` }}
                          />
                        </div>
                        <span className="text-sm text-[var(--text-muted)] w-12 text-right">
                          {count}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Recent Agent Activity */}
              <div className="cathedral-surface p-6" role="region" aria-label="Recent agent activity">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">
                  Recent Agent Activity
                </h2>
                <div className="space-y-3">
                  {data.topReferringAgents.map((agent) => (
                    <div
                      key={agent.agent}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-surface)]"
                    >
                      <div>
                        <span className="text-sm text-[var(--text-primary)]">{agent.agent}</span>
                        <span className="text-xs text-[var(--text-muted)] ml-2">
                          {agent.leads} leads
                        </span>
                      </div>
                      <span className="text-xs text-[var(--text-muted)]">
                        {timeAgo(agent.lastActive)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* CONSENT TRACKING TAB                                           */}
          {/* ============================================================= */}
          {activeTab === "Consent Tracking" && (
            <div className="space-y-8">
              {/* Consent Funnel */}
              <div className="cathedral-surface p-6" role="region" aria-label="Consent funnel">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">
                  Consent Funnel
                </h2>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-light text-[var(--text-primary)]">
                      {formatNum(data.consentMetrics.total)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
                      Requested
                    </p>
                    <div className="mt-2 h-2 bg-blue-200 rounded-full">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-light text-teal-cathedral">
                      {formatNum(data.consentMetrics.confirmed)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
                      Confirmed
                    </p>
                    <div className="mt-2 h-2 bg-emerald-200 rounded-full">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: `${(data.consentMetrics.confirmed / data.consentMetrics.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-light text-[var(--text-primary)]">
                      {formatNum(data.agentLeads.total)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
                      Converted to Leads
                    </p>
                    <div className="mt-2 h-2 bg-teal-200 rounded-full">
                      <div
                        className="h-full bg-teal-cathedral rounded-full"
                        style={{
                          width: `${(data.agentLeads.total / data.consentMetrics.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Expired / Pending Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Expired Tokens
                  </p>
                  <p className="text-2xl font-light text-[var(--text-primary)] mt-1">
                    {formatNum(data.consentMetrics.expired)}
                  </p>
                </div>
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Pending Consent
                  </p>
                  <p className="text-2xl font-light text-amber-600 mt-1">
                    {formatNum(data.consentMetrics.pending)}
                  </p>
                </div>
              </div>

              {/* Consent Requests Table */}
              <div className="cathedral-surface overflow-x-auto" role="region" aria-label="Consent requests table">
                <table className="w-full text-sm">
                  <caption className="sr-only">Recent consent requests from AI agents</caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider border-b border-indigo-cathedral/10 metallic-gold">
                      <th className="px-4 py-3" scope="col">Agent</th>
                      <th className="px-4 py-3" scope="col">Email</th>
                      <th className="px-4 py-3" scope="col">Scope</th>
                      <th className="px-4 py-3" scope="col">Status</th>
                      <th className="px-4 py-3" scope="col">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockConsents.map((consent) => (
                      <tr
                        key={consent.id}
                        className="border-b border-indigo-cathedral/5 hover:bg-[var(--bg-surface)]/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-[var(--text-primary)]">{consent.agent}</td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{consent.email}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-mono text-[var(--text-muted)]">
                            {consent.scope}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[consent.status] || ""}`}
                          >
                            {consent.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)] text-xs whitespace-nowrap">
                          {new Date(consent.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* API ANALYTICS TAB                                              */}
          {/* ============================================================= */}
          {activeTab === "API Analytics" && (
            <div className="space-y-8">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4" role="region" aria-label="API summary statistics">
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Total Requests
                  </p>
                  <p className="text-2xl font-light text-[var(--text-primary)] mt-1">
                    {formatNum(data.apiUsage.totalRequests)}
                  </p>
                </div>
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Error Rate
                  </p>
                  <p className="text-2xl font-light text-[var(--text-primary)] mt-1">
                    {pct(data.apiUsage.errorRate)}
                  </p>
                </div>
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Rate Limit Hits
                  </p>
                  <p className="text-2xl font-light text-amber-600 mt-1">
                    {data.apiUsage.rateLimitHits}
                  </p>
                </div>
                <div className="cathedral-surface p-4">
                  <p className="text-teal-cathedral/80 text-xs uppercase tracking-wider font-medium">
                    Avg Response Time
                  </p>
                  <p className="text-2xl font-light text-teal-cathedral mt-1">
                    {data.apiUsage.avgResponseTime}ms
                  </p>
                </div>
              </div>

              {/* Request Volume by Endpoint */}
              <div className="cathedral-surface p-6" role="region" aria-label="Requests by endpoint">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">
                  Request Volume by Endpoint
                </h2>
                <div className="space-y-3">
                  {Object.entries(data.apiUsage.byEndpoint)
                    .sort(([, a], [, b]) => b - a)
                    .map(([endpoint, count]) => {
                      const maxEndpoint = Math.max(
                        ...Object.values(data.apiUsage.byEndpoint),
                        1,
                      );
                      return (
                        <div key={endpoint} className="flex items-center gap-3">
                          <span className="text-xs font-mono text-[var(--text-muted)] w-44 truncate">
                            {endpoint}
                          </span>
                          <div className="flex-1 bg-[var(--bg-surface)] rounded-full h-5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-teal-cathedral/70 transition-all duration-500"
                              style={{
                                width: `${Math.max((count / maxEndpoint) * 100, 2)}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm text-[var(--text-muted)] w-16 text-right">
                            {formatNum(count)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Top Agents by Request Volume */}
              <div className="cathedral-surface p-6" role="region" aria-label="Top agents by request volume">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">
                  Top Agents by Request Volume
                </h2>
                <div className="space-y-3">
                  {data.topReferringAgents
                    .sort((a, b) => b.leads - a.leads)
                    .map((agent, i) => (
                      <div
                        key={agent.agent}
                        className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-surface)]"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium text-[var(--text-muted)] w-6">
                            #{i + 1}
                          </span>
                          <span className="text-sm text-[var(--text-primary)]">{agent.agent}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-teal-cathedral">
                            {formatNum(agent.leads * 12)} requests
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">
                            {timeAgo(agent.lastActive)}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* DISCOVERY & SEO TAB                                            */}
          {/* ============================================================= */}
          {activeTab === "Discovery & SEO" && (
            <div className="space-y-8">
              {/* Discovery File Hits */}
              <div className="cathedral-surface p-6" role="region" aria-label="Discovery file hits">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">
                  Discovery File Hits
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: "llms.txt", value: data.discoveryStats.llmsTxtHits, path: "/llms.txt" },
                    { label: "Schema Crawls", value: data.discoveryStats.schemaCrawls, path: "/.well-known/schema" },
                    { label: "MCP Connections", value: data.discoveryStats.mcpConnections, path: "/mcp.json" },
                    { label: "ai-plugin.json", value: data.discoveryStats.aiPluginFetches, path: "/.well-known/ai-plugin.json" },
                    { label: "agent.json", value: data.discoveryStats.agentJsonFetches, path: "/.well-known/agent.json" },
                  ].map((item) => (
                    <div key={item.label} className="text-center p-3 rounded-lg bg-[var(--bg-surface)]">
                      <p className="text-2xl font-light text-[var(--text-primary)]">
                        {formatNum(item.value)}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">{item.label}</p>
                      <p className="text-xs font-mono text-teal-cathedral/60 mt-0.5">{item.path}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Crawl Status */}
              <div className="cathedral-surface p-6" role="region" aria-label="AI crawler activity">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">
                  AI Crawler Activity
                </h2>
                <div className="space-y-3">
                  {CRAWLERS.map((crawler) => (
                    <div
                      key={crawler.name}
                      className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg-surface)]"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            crawler.status === "active" ? "bg-emerald-500" : "bg-gray-400"
                          }`}
                        />
                        <span className="text-sm text-[var(--text-primary)]">{crawler.name}</span>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${
                            crawler.status === "active"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-gray-50 text-gray-600 border-gray-200"
                          }`}
                        >
                          {crawler.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-[var(--text-muted)]">
                          {crawler.pages} pages crawled
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {crawler.lastSeen}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              <div className="cathedral-surface p-6" role="region" aria-label="AI discoverability recommendations">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-4">
                  AI Discoverability Recommendations
                </h2>
                <div className="space-y-2">
                  {RECOMMENDATIONS.map((rec, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[var(--bg-surface)]"
                    >
                      <span
                        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                          rec.done
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {rec.done ? "\u2713" : "!"}
                      </span>
                      <span
                        className={`text-sm ${
                          rec.done
                            ? "text-[var(--text-muted)] line-through"
                            : "text-[var(--text-primary)]"
                        }`}
                      >
                        {rec.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================= */}
          {/* SETTINGS TAB                                                   */}
          {/* ============================================================= */}
          {activeTab === "Settings" && settingsForm && (
            <div className="space-y-8">
              {/* Save Message */}
              {saveMessage && (
                <div
                  className={`px-4 py-3 rounded-lg text-sm ${
                    saveMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {saveMessage.text}
                </div>
              )}

              {/* Agent API Toggle */}
              <div className="cathedral-surface p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-light text-[var(--text-primary)]">
                      Agent API
                    </h2>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      Enable or disable the AI agent API endpoints.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setSettingsForm((s) =>
                        s ? { ...s, agentApiEnabled: !s.agentApiEnabled } : s,
                      )
                    }
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                      settingsForm.agentApiEnabled ? "bg-teal-cathedral" : "bg-gray-300"
                    }`}
                    role="switch"
                    aria-checked={settingsForm.agentApiEnabled}
                    aria-label="Toggle agent API"
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                        settingsForm.agentApiEnabled ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Consent Expiry */}
              <div className="cathedral-surface p-6">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-2">
                  Consent Token Expiry
                </h2>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  How many hours before a consent token expires and requires re-confirmation.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={settingsForm.consentExpiryHours}
                    onChange={(e) =>
                      setSettingsForm((s) =>
                        s
                          ? { ...s, consentExpiryHours: parseInt(e.target.value) || 72 }
                          : s,
                      )
                    }
                    min={1}
                    max={720}
                    className="bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:border-indigo-cathedral/25"
                  />
                  <span className="text-sm text-[var(--text-muted)]">hours</span>
                </div>
              </div>

              {/* Rate Limits */}
              <div className="cathedral-surface p-6">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-2">
                  Rate Limits
                </h2>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Maximum requests per minute for each endpoint.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(settingsForm.rateLimits).map(([endpoint, limit]) => (
                    <div key={endpoint}>
                      <label className="block text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">
                        {endpoint}
                      </label>
                      <input
                        type="number"
                        value={limit}
                        onChange={(e) =>
                          setSettingsForm((s) =>
                            s
                              ? {
                                  ...s,
                                  rateLimits: {
                                    ...s.rateLimits,
                                    [endpoint]: parseInt(e.target.value) || 0,
                                  },
                                }
                              : s,
                          )
                        }
                        min={1}
                        className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Allowed Agents */}
              <div className="cathedral-surface p-6">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-2">
                  Allowed Agents
                </h2>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  Comma-separated list of allowed AI agent identifiers.
                </p>
                <input
                  type="text"
                  value={settingsForm.allowedAgents.join(", ")}
                  onChange={(e) =>
                    setSettingsForm((s) =>
                      s
                        ? {
                            ...s,
                            allowedAgents: e.target.value
                              .split(",")
                              .map((a) => a.trim())
                              .filter(Boolean),
                          }
                        : s,
                    )
                  }
                  className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
                  placeholder="claude, gpt-4, gemini, perplexity, custom"
                />
              </div>

              {/* llms.txt Content */}
              <div className="cathedral-surface p-6">
                <h2 className="text-lg font-light text-[var(--text-primary)] mb-2">
                  llms.txt Content
                </h2>
                <p className="text-sm text-[var(--text-muted)] mb-4">
                  (llms.txt === 0 ? 0 : The content served at / llms.txt) for AI agent discovery.
                </p>
                <textarea
                  value={settingsForm.llmsTxt}
                  onChange={(e) =>
                    setSettingsForm((s) =>
                      s ? { ...s, llmsTxt: e.target.value } : s,
                    )
                  }
                  rows={14}
                  className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-indigo-cathedral/25 resize-y"
                  placeholder="# Your llms.txt content..."
                />
              </div>

              {/* Save Button */}
              <div className="flex justify-end">
                <button
                  onClick={handleSaveSettings}
                  disabled={saving}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--text-muted)]">
        <p>AI Agent Intelligence — Agent data is confidential.</p>
      </footer>
    </main>
  );
}
