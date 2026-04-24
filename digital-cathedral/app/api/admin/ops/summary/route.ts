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
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  activeBackendName,
  ledgerLocation,
  listLedgerMonths,
  readRecentEntries,
} from "@/app/lib/valor/lead-ledger";

export const dynamic = "force-dynamic";

/** Env vars the cathedral can't run correctly without in production. */
const CRITICAL_ENV = [
  "DATABASE_URL",
  "ADMIN_API_KEY",
  "NEXTAUTH_SECRET",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
] as const;

/** Env vars that unlock features but aren't strictly required. */
const FEATURE_ENV = [
  "BLOB_READ_WRITE_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_SENTRY_DSN",
  "CRM_PROVIDER",
  "WEBHOOK_URLS",
] as const;

function envStatus(keys: readonly string[]): { key: string; set: boolean }[] {
  return keys.map((k) => ({ key: k, set: Boolean(process.env[k]?.trim()) }));
}

async function readDiagnostic(): Promise<{
  mtime: string;
  generatedAt?: string;
  filesScanned: number;
  totalFindings: number;
  byClass: Record<string, number>;
  bySeverity: Record<string, number>;
} | null> {
  try {
    const diagPath = path.resolve(
      process.cwd(),
      "..",
      ".remembrance",
      "diagnostics",
      "cathedral-latest.json",
    );
    const [text, s] = await Promise.all([
      readFile(diagPath, "utf8"),
      stat(diagPath),
    ]);
    const parsed = JSON.parse(text);
    return {
      mtime: s.mtime.toISOString(),
      generatedAt: parsed.generatedAt,
      filesScanned: parsed.audit?.totalFilesScanned ?? 0,
      totalFindings: parsed.audit?.totalFindings ?? 0,
      byClass: parsed.audit?.byClass ?? {},
      bySeverity: parsed.audit?.bySeverity ?? {},
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  // Ledger — backend + current month size
  const recent = await readRecentEntries(1);
  const months = await listLedgerMonths();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthInfo = months.find((m) => m.month === currentMonth) ?? { lines: 0, size: 0 };

  // Diagnostic — last run summary if present
  const diagnostic = await readDiagnostic();

  // Environment probe
  const env = {
    critical: envStatus(CRITICAL_ENV),
    features: envStatus(FEATURE_ENV),
  };
  const criticalMissing = env.critical.filter((e) => !e.set).length;

  // Lead velocity from the ledger (cheap — just counts)
  const now = Date.now();
  const oneDayMs = 24 * 3600 * 1000;
  const since24 = now - oneDayMs;
  const since7d = now - 7 * oneDayMs;
  const recentForVelocity = await readRecentEntries(500);
  const velocity = {
    last24h: recentForVelocity.filter((e) => new Date(e.observedAt).getTime() >= since24).length,
    last7d: recentForVelocity.filter((e) => new Date(e.observedAt).getTime() >= since7d).length,
    currentMonth: currentMonthInfo.lines,
    totalMonths: months.length,
  };

  // Overall readiness verdict
  const readiness: "ready" | "warning" | "blocked" =
    criticalMissing > 0 ? "blocked" :
    (diagnostic?.bySeverity?.high ?? 0) > 0 ? "warning" :
    "ready";

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    readiness,
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
