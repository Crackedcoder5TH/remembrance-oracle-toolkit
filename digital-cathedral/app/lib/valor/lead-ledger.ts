/**
 * Lead Ledger — dispatcher.
 *
 * Picks the active storage backend from LEAD_LEDGER_STORAGE:
 *   - "file"  (default in dev / self-hosted) — local JSONL files
 *   - "blob"  (default in prod / Vercel)      — Vercel Blob storage
 *
 * The dispatcher exports the same function surface the API routes and
 * tests already use, so swapping backends is a config change, not a code
 * change. Adapters share a common interface in ./ledger/types.
 *
 * Why an adapter pattern: Vercel's serverless runtime has an ephemeral
 * filesystem — any local file written inside a function invocation
 * disappears when the Lambda recycles. The covenant record must survive
 * that, so production writes go to durable blob storage. Self-hosted or
 * containerized deploys with a persistent volume can keep using files.
 */

import { blobAdapter } from "./ledger/blob-adapter";
import { fileAdapter } from "./ledger/file-adapter";
import type {
  AppendResult,
  LedgerAdapter,
  LedgerEntry,
  LedgerFileStat,
  LedgerMonthInfo,
} from "./ledger/types";

export type { LedgerEntry, LedgerFileStat, LedgerMonthInfo } from "./ledger/types";

/** Resolve the active adapter. Defaults to blob when BLOB_READ_WRITE_TOKEN
 *  is set (strong prod signal), otherwise falls back to file mode. An
 *  explicit LEAD_LEDGER_STORAGE override always wins. */
export function resolveAdapter(): LedgerAdapter {
  const override = process.env.LEAD_LEDGER_STORAGE?.trim().toLowerCase();
  if (override === "blob") return blobAdapter;
  if (override === "file") return fileAdapter;
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobAdapter;
  return fileAdapter;
}

/** Current adapter backend name — reported by /api/admin/ledger for visibility. */
export function activeBackendName(): "file" | "blob" {
  return resolveAdapter().name;
}

/** Where the ledger lives — filesystem path or blob prefix. */
export function ledgerLocation(): string {
  return resolveAdapter().location();
}

export async function appendLedgerEntry(entry: LedgerEntry): Promise<AppendResult> {
  return resolveAdapter().append(entry);
}

export async function listLedgerFiles(): Promise<string[]> {
  // Historical API: callers expected ["ledger-YYYY-MM.jsonl"] names.
  // We translate the adapter's month info back into that legacy shape so
  // existing tests (and any external consumer) keep working.
  const months = await resolveAdapter().listMonths();
  return months.map((m) => `ledger-${m.month}.jsonl`);
}

export async function ledgerFileStats(
  month: string,
): Promise<{ path: string; size: number; lines: number } | null> {
  const adapter = resolveAdapter();
  const info = await adapter.statMonth(month);
  if (!info) return null;
  return {
    path: adapter.name === "file"
      ? `${adapter.location()}/ledger-${month}.jsonl`
      : `${adapter.location()}/${month}`,
    size: info.size,
    lines: info.lines,
  };
}

export async function listLedgerMonths(): Promise<LedgerMonthInfo[]> {
  return resolveAdapter().listMonths();
}

export async function readRecentEntries(limit = 100): Promise<LedgerEntry[]> {
  return resolveAdapter().readRecent(limit);
}

export async function readLedgerMonth(month: string): Promise<string | null> {
  return resolveAdapter().readMonth(month);
}
