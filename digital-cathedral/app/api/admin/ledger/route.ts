/**
 * /api/admin/ledger — covenant-gate lead ledger access.
 *
 * GET (default): returns the N most recent entries from the current
 *   month's file as JSON.
 *
 * GET ?month=YYYY-MM: returns stats + the requested month's entries.
 *
 * GET ?month=YYYY-MM&format=jsonl: streams the raw JSONL file —
 *   suitable for download, re-ingest, or offline analysis.
 *
 * GET ?list=1: returns the list of available months with per-file stats.
 *
 * All methods require admin auth via verifyAdmin (same pattern as the
 * rest of the admin API surface).
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  ledgerDir,
  ledgerFileStats,
  listLedgerFiles,
  readLedgerMonth,
  readRecentEntries,
} from "@/app/lib/valor/lead-ledger";

export const dynamic = "force-dynamic";

const MAX_RECENT = 500;

function parseLimit(raw: string | null): number {
  if (!raw) return 100;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 100;
  return Math.min(n, MAX_RECENT);
}

function monthFromFilename(name: string): string | null {
  const m = /^ledger-(\d{4}-\d{2})\.jsonl$/.exec(name);
  return m ? m[1] : null;
}

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const list = url.searchParams.get("list");
  const month = url.searchParams.get("month");
  const format = url.searchParams.get("format");
  const limit = parseLimit(url.searchParams.get("limit"));

  // Mode 1: list available months
  if (list) {
    const files = await listLedgerFiles();
    const months = [];
    for (const f of files) {
      const m = monthFromFilename(f);
      if (!m) continue;
      const stats = await ledgerFileStats(m);
      months.push({
        month: m,
        lines: stats?.lines ?? 0,
        size: stats?.size ?? 0,
      });
    }
    return NextResponse.json({
      directory: ledgerDir(),
      months,
    });
  }

  // Mode 2: specific month — optionally streamed as JSONL
  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month must be YYYY-MM" },
        { status: 400 },
      );
    }

    if (format === "jsonl") {
      const raw = await readLedgerMonth(month);
      if (raw === null) {
        return NextResponse.json(
          { error: `no ledger file for ${month}` },
          { status: 404 },
        );
      }
      return new NextResponse(raw, {
        status: 200,
        headers: {
          "Content-Type": "application/x-ndjson",
          "Content-Disposition": `attachment; filename="ledger-${month}.jsonl"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const raw = await readLedgerMonth(month);
    if (raw === null) {
      return NextResponse.json(
        { month, entries: [], count: 0 },
        { status: 200 },
      );
    }
    const entries = raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((e) => e !== null);
    return NextResponse.json({
      month,
      count: entries.length,
      entries: entries.slice(-limit).reverse(),
    });
  }

  // Mode 3 (default): recent entries from current month
  const entries = await readRecentEntries(limit);
  return NextResponse.json({
    count: entries.length,
    entries,
  });
}
