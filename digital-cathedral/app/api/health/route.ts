/**
 * Health Check
 *
 * Returns system health status for uptime monitoring.
 * Checks: database connectivity, uptime, memory usage.
 */

import { NextResponse } from "next/server";

const startTime = Date.now();

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // Database connectivity check — use getLeadCount as a lightweight ping
  try {
    const { getLeadCount } = await import("@/app/lib/database");
    const result = getLeadCount();
    checks.database = result.ok
      ? { status: "healthy", detail: `${result.value} leads stored` }
      : { status: "unhealthy", detail: result.error };
  } catch (err) {
    checks.database = {
      status: "unhealthy",
      detail: err instanceof Error ? err.message : "Unknown error",
    };
  }

  // Memory usage
  const mem = process.memoryUsage();
  checks.memory = {
    status: mem.heapUsed < 500 * 1024 * 1024 ? "healthy" : "warning",
    detail: `${Math.round(mem.heapUsed / 1024 / 1024)}MB heap used`,
  };

  const allHealthy = Object.values(checks).every((c) => c.status === "healthy");
  const uptimeMs = Date.now() - startTime;

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      uptime: `${Math.floor(uptimeMs / 1000)}s`,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 },
  );
}
