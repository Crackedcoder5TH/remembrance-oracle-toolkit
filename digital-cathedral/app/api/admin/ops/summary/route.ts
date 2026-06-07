/**
 * /api/admin/ops/summary — operational health snapshot.
 *
 * One page of truth for operators:
 *   - Ledger backend + current-month entry count
 *   - Latest diagnostic run (if present): findings by severity + class
 *   - Recent lead velocity (today, this week, this month) via /stats surface
 *   - Environment readiness probe — which critical env vars are populated
 *
 * Admin-auth required. Fast (<200ms) so it can back a live status page.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  activeBackendName,
  ledgerLocation,
  listLedgerMonths,
  readRecentEntries,
} from "@/app/lib/valor/lead-ledger";
import {
  CRITICAL_ENV,
  FEATURE_ENV,
  envStatus,
  readDiagnostic,
  readinessFrom,
} from "@/app/lib/ops-snapshot";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const [recent, months, diagnostic, recentForVelocity] = await Promise.all([
    readRecentEntries(1),
    listLedgerMonths(),
    readDiagnostic(),
    readRecentEntries(500),
  ]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthInfo = months.find((m) => m.month === currentMonth) ?? { lines: 0, size: 0 };

  const env = {
    critical: envStatus(CRITICAL_ENV),
    features: envStatus(FEATURE_ENV),
  };
  const criticalMissing = env.critical.filter((e) => !e.set).length;

  const now = Date.now();
  const oneDayMs = 24 * 3600 * 1000;
  const since24 = now - oneDayMs;
  const since7d = now - 7 * oneDayMs;
  const velocity = {
    last24h: recentForVelocity.filter((e) => new Date(e.observedAt).getTime() >= since24).length,
    last7d: recentForVelocity.filter((e) => new Date(e.observedAt).getTime() >= since7d).length,
    currentMonth: currentMonthInfo.lines,
    totalMonths: months.length,
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    readiness: readinessFrom(criticalMissing, diagnostic),
    ledger: {
      backend: activeBackendName(),
      location: ledgerLocation(),
      currentMonth: {
        month: currentMonth,
        entries: currentMonthInfo.lines,
        bytes: currentMonthInfo.size,
      },
      totalMonths: months.length,
      latestEntryObservedAt: recent[0]?.observedAt ?? null,
    },
    velocity,
    diagnostic: diagnostic ?? {
      note: "no diagnostic run yet — execute `node scripts/cathedral-diagnostic.js`",
    },
    environment: {
      criticalMissing,
      critical: env.critical,
      features: env.features,
    },
  });
}
