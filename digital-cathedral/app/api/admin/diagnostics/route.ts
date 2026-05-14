/**
 * /api/admin/diagnostics — cathedral ecosystem diagnostic report.
 *
 * Reads the latest report produced by scripts/cathedral-diagnostic.js at
 * the oracle repo root. The report is generated on demand (or on a cron)
 * by running the oracle's full audit stack — static checkers, AST checks,
 * void-scan coherency, cascade detection — against the cathedral source.
 *
 * Modes:
 *   GET                 → JSON summary + top files by weighted severity
 *   GET ?format=full    → the full JSON report
 *   GET ?format=md      → the human-readable markdown report
 *
 * Admin-auth required. Returns 404 if the diagnostic has never been run.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { verifyAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// The diagnostic script writes into the parent oracle repo's
// .remembrance/diagnostics/ directory so both the cathedral and the
// oracle CLI can consume the same report.
const DIAGNOSTICS_DIR = path.resolve(
  process.cwd(),
  "..",
  ".remembrance",
  "diagnostics",
);

const JSON_PATH = path.join(DIAGNOSTICS_DIR, "cathedral-latest.json");
const MD_PATH = path.join(DIAGNOSTICS_DIR, "cathedral-latest.md");

async function readReport(): Promise<{
  report: Record<string, unknown>;
  mtime: string;
} | null> {
  try {
    const [text, s] = await Promise.all([
      readFile(JSON_PATH, "utf8"),
      stat(JSON_PATH),
    ]);
    return {
      report: JSON.parse(text),
      mtime: s.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const format = url.searchParams.get("format");

  if (format === "md") {
    try {
      const text = await readFile(MD_PATH, "utf8");
      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return NextResponse.json(
        {
          error:
            "no diagnostic report yet — run `node scripts/cathedral-diagnostic.js`",
        },
        { status: 404 },
      );
    }
  }

  const entry = await readReport();
  if (!entry) {
    return NextResponse.json(
      {
        error:
          "no diagnostic report yet — run `node scripts/cathedral-diagnostic.js`",
      },
      { status: 404 },
    );
  }

  const report = entry.report as {
    generatedAt?: string;
    scanRoot?: string;
    audit?: {
      totalFilesScanned?: number;
      totalFilesWithFindings?: number;
      totalFindings?: number;
      byClass?: Record<string, number>;
      bySeverity?: Record<string, number>;
      files?: unknown[];
    };
    summary?: {
      totalFiles?: number;
      topFiles?: unknown[];
    };
    voidScan?: {
      available?: boolean;
      files?: unknown[];
      reason?: string;
    };
  };

  if (format === "full") {
    return NextResponse.json({
      mtime: entry.mtime,
      report,
    });
  }

  // Default: compact summary (safe to render in the admin dashboard without
  // shipping 187 findings across the wire).
  return NextResponse.json({
    mtime: entry.mtime,
    generatedAt: report.generatedAt,
    scanRoot: report.scanRoot,
    filesScanned: report.audit?.totalFilesScanned ?? 0,
    filesWithFindings: report.audit?.totalFilesWithFindings ?? 0,
    totalFindings: report.audit?.totalFindings ?? 0,
    byClass: report.audit?.byClass ?? {},
    bySeverity: report.audit?.bySeverity ?? {},
    topFiles: report.summary?.topFiles ?? [],
    voidScan: {
      available: report.voidScan?.available ?? false,
      fileCount: report.voidScan?.files?.length ?? 0,
      reason: report.voidScan?.reason,
    },
  });
}
