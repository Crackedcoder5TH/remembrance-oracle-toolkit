/**
 * Lead Ledger — append-only, per-month JSONL file of every admitted lead.
 *
 * Mirrors the time-ledger pattern the rest of the ecosystem uses:
 * observed_start / observed_end / cadence on each entry, one line per
 * admitted lead, rotated monthly so files stay manageable as volume grows.
 *
 * Design points:
 *  - Append-only. Never rewrites or deletes. Ledgers are covenant records.
 *  - Per-month rotation: ledger-YYYY-MM.jsonl. Monthly files stay under
 *    reasonable size for ingest tools (~tens of thousands of leads/month).
 *  - Non-blocking. The caller (API route) awaits nothing — a write failure
 *    never affects the HTTP response the user sees.
 *  - Directory: process.env.LEAD_LEDGER_DIR or .valor/ledger by default.
 *    Configurable so prod can point at an attached disk or object store.
 *  - Every entry carries the full coherency metadata so downstream
 *    analysis can run the cascade again without touching the DB.
 *
 * The admin side reads this via /api/admin/ledger, which streams the
 * current month's file (or requested month) as JSONL.
 */

import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export interface LedgerEntry {
  readonly leadId: string;
  readonly writtenAt: string;            // ISO timestamp of ledger write
  readonly observedAt: string;           // lead.createdAt — when the signal arrived
  readonly lead: {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly phone: string;
    readonly state: string;
    readonly dateOfBirth: string;
    readonly coverageInterest: string;
    readonly purchaseIntent?: string;
    readonly veteranStatus: string;
    readonly militaryBranch: string;
  };
  readonly coherency: {
    readonly score: number;              // [0, 1]
    readonly tier: string;               // lexicon tier
    readonly dominantArchetype: string;  // e.g. "valor/protective-veteran"
    readonly dominantGroup: string;      // "valor" | "fraud" | "bot" | "unknown"
    readonly shape: readonly number[];   // 16-D normalized lead waveform
  };
  readonly covenant: {
    readonly verdict: string;            // admit | admit-low-coherency | ...
    readonly reason: string;
  };
  readonly source: {
    readonly ip: string;
    readonly userAgent: string;
    readonly referer: string;
    readonly utmSource?: string | null;
    readonly utmMedium?: string | null;
    readonly utmCampaign?: string | null;
  };
}

const DEFAULT_DIR = path.join(process.cwd(), ".valor", "ledger");

/** Resolve the ledger directory, honoring LEAD_LEDGER_DIR override. */
export function ledgerDir(): string {
  const envDir = process.env.LEAD_LEDGER_DIR;
  return envDir && envDir.trim() ? envDir.trim() : DEFAULT_DIR;
}

/** Current month's filename — ledger-YYYY-MM.jsonl. */
export function ledgerFileFor(date: Date = new Date()): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `ledger-${yyyy}-${mm}.jsonl`;
}

/** Full path to the current month's ledger. */
export function currentLedgerPath(): string {
  return path.join(ledgerDir(), ledgerFileFor());
}

/**
 * Append a single entry. Never throws — write failures are surfaced via the
 * returned result object so the caller can log without aborting the lead flow.
 */
export async function appendLedgerEntry(
  entry: LedgerEntry,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const dir = ledgerDir();
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, ledgerFileFor(new Date(entry.writtenAt)));
    const line = JSON.stringify(entry) + "\n";
    await appendFile(file, line, "utf8");
    return { ok: true, path: file };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** List every ledger file (sorted by month ascending). */
export async function listLedgerFiles(): Promise<string[]> {
  try {
    const dir = ledgerDir();
    const names = await readdir(dir);
    return names
      .filter((n) => n.startsWith("ledger-") && n.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }
}

/** Stat for a given ledger month — size, entry count estimate. */
export async function ledgerFileStats(
  month: string,
): Promise<{ path: string; size: number; lines: number } | null> {
  try {
    const filePath = path.join(ledgerDir(), `ledger-${month}.jsonl`);
    const s = await stat(filePath);
    const text = await readFile(filePath, "utf8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0).length;
    return { path: filePath, size: s.size, lines };
  } catch {
    return null;
  }
}

/**
 * Read the last N entries across the current month's file.
 * Returns newest-first. Safe on missing file.
 */
export async function readRecentEntries(limit = 100): Promise<LedgerEntry[]> {
  try {
    const filePath = currentLedgerPath();
    const text = await readFile(filePath, "utf8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const recent = lines.slice(-limit).reverse();
    const out: LedgerEntry[] = [];
    for (const l of recent) {
      try {
        out.push(JSON.parse(l) as LedgerEntry);
      } catch {
        // skip corrupt lines — ledger is append-only but a disk glitch could
        // leave a truncated trailing line; don't let one bad row poison the read.
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Stream a whole month's file as JSONL text. Caller pipes into a Response.
 * Returns null when the file doesn't exist.
 */
export async function readLedgerMonth(month: string): Promise<string | null> {
  try {
    const filePath = path.join(ledgerDir(), `ledger-${month}.jsonl`);
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
