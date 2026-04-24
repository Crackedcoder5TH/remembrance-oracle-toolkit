/**
 * Ledger adapter types — shared by file, blob, and any future backends.
 *
 * An adapter is a small interface: append one entry, list months with
 * stats, stat a month, read recent entries, export a month as JSONL.
 * The dispatcher (lead-ledger.ts) picks the active adapter based on
 * LEAD_LEDGER_STORAGE and delegates uniformly.
 */

export interface LedgerEntry {
  readonly leadId: string;
  readonly writtenAt: string;
  readonly observedAt: string;
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
    readonly score: number;
    readonly tier: string;
    readonly dominantArchetype: string;
    readonly dominantGroup: string;
    readonly shape: readonly number[];
  };
  readonly covenant: {
    readonly verdict: string;
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

export type AppendResult =
  | { ok: true; location: string }
  | { ok: false; error: string };

export interface LedgerFileStat {
  readonly month: string;         // YYYY-MM
  readonly lines: number;          // number of entries
  readonly size: number;           // bytes
}

export interface LedgerMonthInfo extends LedgerFileStat {}

/** The minimal interface every backend implements. */
export interface LedgerAdapter {
  /** Human-readable name of this backend. */
  readonly name: "file" | "blob";

  /** Location descriptor — filesystem path or blob URL prefix. */
  location(): string;

  /** Append one entry. Never throws; failures are reported via the return value. */
  append(entry: LedgerEntry): Promise<AppendResult>;

  /** List every month that has entries, with stats. */
  listMonths(): Promise<LedgerMonthInfo[]>;

  /** Stat one month. Returns null if the month has no entries. */
  statMonth(month: string): Promise<LedgerFileStat | null>;

  /** Read the N most recent entries across the current month (newest first). */
  readRecent(limit: number): Promise<LedgerEntry[]>;

  /** Return a month's entries as JSONL text. Null if the month is empty. */
  readMonth(month: string): Promise<string | null>;
}
