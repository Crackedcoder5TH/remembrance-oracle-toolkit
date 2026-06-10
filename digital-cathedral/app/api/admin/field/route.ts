/**
 * /api/admin/field — fractal field aggregator.
 *
 * Single GET that pulls every operationally-meaningful signal about the
 * website into one shape. Used by the /admin/field control surface; powers
 * the L1 hero strip, L2 breakdowns, and L3 deep panels.
 *
 * Every read is best-effort + parallel — a failure in any sub-system
 * degrades the corresponding panel to a "—" rather than failing the page.
 * The cathedral is supposed to *work* on a soft-launch deploy with just
 * DATABASE_URL + ADMIN_API_KEY set; everything beyond that is graceful.
 *
 * Admin-auth required. Fast (<500ms typical) — fans out the database,
 * client-database, ledger, env probes, diagnostic file, and the optional
 * remote field substrate in one Promise.all.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getLeadStats } from "@/app/lib/database";
import { getClientStats } from "@/app/lib/client-database";
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
import { peekField } from "@/app/lib/valor/remembrance-bridge";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  // Fan-out every read in parallel. None of these are allowed to throw — the
  // lead/client stat fns already return Result<T,E>, the ledger fns + env
  // probe return safe defaults, peekField returns null on any failure.
  const [
    leadStats,
    clientStats,
    diagnostic,
    months,
    recent,
    fieldState,
  ] = await Promise.all([
    getLeadStats(),
    getClientStats(),
    readDiagnostic(),
    listLedgerMonths(),
    readRecentEntries(5),
    peekField({ includeSources: true }),
  ]);

  const critical = envStatus(CRITICAL_ENV);
  const features = envStatus(FEATURE_ENV);
  const criticalMissing = critical.filter((e) => !e.set).length;
  const readiness = readinessFrom(criticalMissing, diagnostic);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthInfo = months.find((m) => m.month === currentMonth) ?? { lines: 0, size: 0 };

  // Top contributors — only when the substrate is reachable. We sort by
  // observation count; the L3 panel renders the top 10 so operators see who's
  // currently writing into the field.
  const topSources = fieldState?.sources
    ? Object.entries(fieldState.sources)
        .map(([name, s]) => ({ name, count: s.count, lastCoherence: s.lastCoherence }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    : [];

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    readiness,
    leadStats: leadStats.ok ? leadStats.value : null,
    clientStats: clientStats.ok ? clientStats.value : null,
    field: fieldState
      ? {
          connected: true,
          coherence: fieldState.coherence,
          cascadeFactor: fieldState.cascadeFactor,
          globalEntropy: fieldState.globalEntropy,
          updateCount: fieldState.updateCount,
          distinctSources: fieldState.distinctSources ?? Object.keys(fieldState.sources ?? {}).length,
          topSources,
        }
      : {
          connected: false,
          reason: "REMEMBRANCE_FIELD_URL not set or field server unreachable",
        },
    ledger: {
      backend: activeBackendName(),
      location: ledgerLocation(),
      totalMonths: months.length,
      currentMonth: {
        month: currentMonth,
        entries: currentMonthInfo.lines,
        bytes: currentMonthInfo.size,
      },
      latestEntries: recent.map((e) => ({
        leadId: e.leadId,
        observedAt: e.observedAt,
        state: e.lead?.state ?? null,
        coverageInterest: e.lead?.coverageInterest ?? null,
      })),
    },
    diagnostic: diagnostic ?? null,
    environment: {
      criticalMissing,
      critical,
      features,
    },
  });
}
