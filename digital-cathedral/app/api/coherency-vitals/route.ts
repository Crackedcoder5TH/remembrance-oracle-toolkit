/**
 * Public Coherency Vitals
 *
 * GET /api/coherency-vitals
 *
 * Lightweight public stats endpoint. No authentication. Returns the
 * substrate's vital signs in a shape the home page widget can consume:
 *  - gate / foundation thresholds (constants from the spec)
 *  - admission count over the trailing 24h + 30d
 *  - median coherency of admissions in the trailing 30d
 *  - spec version
 *
 * Cached at the response layer via Next's Cache-Control header so a
 * popular landing page doesn't pound the ledger.
 *
 * Reads from the lead-ledger via the same adapter the rest of the app
 * uses; safe under both file-mode and blob-mode storage.
 */
import { NextResponse } from "next/server";
import { readRecentEntries } from "@/app/lib/valor/lead-ledger";
import { COHERENCY_THRESHOLDS } from "@/app/lib/valor/coherency-primitives";
import { AGENT_ACCESS_SPEC_VERSION } from "@/app/lib/valor/agent-tier";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const now = Date.now();
  const dayCutoff = now - DAY_MS;
  const monthCutoff = now - 30 * DAY_MS;

  // Pull a healthy slice and filter in-memory. The ledger isn't large
  // enough for this to be hot, and admin-side endpoints already do this.
  let entries: Awaited<ReturnType<typeof readRecentEntries>> = [];
  try {
    entries = await readRecentEntries(2000);
  } catch {
    // Empty ledger / adapter unavailable — degrade to zeros gracefully.
  }

  let admitted24h = 0;
  let admitted30d = 0;
  const monthScores: number[] = [];

  for (const e of entries) {
    const ts = Date.parse(e.writtenAt);
    if (!Number.isFinite(ts)) continue;
    const verdict = e.covenant?.verdict || "";
    const isAdmission = verdict === "admit" || verdict === "admit-low-coherency";
    if (!isAdmission) continue;
    if (ts >= dayCutoff) admitted24h += 1;
    if (ts >= monthCutoff) {
      admitted30d += 1;
      const score = Number(e.coherency?.score);
      if (Number.isFinite(score)) monthScores.push(score);
    }
  }

  const medianCoherency30d = median(monthScores);

  return NextResponse.json(
    {
      success: true,
      specVersion: AGENT_ACCESS_SPEC_VERSION,
      thresholds: {
        gate: COHERENCY_THRESHOLDS.GATE,
        foundation: COHERENCY_THRESHOLDS.FOUNDATION,
        stability: COHERENCY_THRESHOLDS.STABILITY,
      },
      admitted24h,
      admitted30d,
      medianCoherency30d,
      generatedAt: new Date().toISOString(),
    },
    {
      // Public, cacheable for 5 minutes — vitals don't need to be real-time.
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    },
  );
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >>> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
