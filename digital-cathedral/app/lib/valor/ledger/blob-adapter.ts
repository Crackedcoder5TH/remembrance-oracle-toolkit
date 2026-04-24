/**
 * Lead Ledger — Vercel Blob adapter.
 *
 * Each admitted lead becomes a single JSON blob at:
 *   {prefix}/{YYYY-MM}/{writtenAt-leadId}.json
 *
 * O(1) append. Reads list the monthly prefix and fetch entry contents in
 * parallel. Monthly rotation falls out of the directory layout — no
 * per-file append-and-rewrite race. Survives Vercel serverless
 * invocations because blob storage is durable across the platform.
 *
 * Requires BLOB_READ_WRITE_TOKEN in the environment (Vercel injects it
 * automatically when a Blob store is linked to the project).
 */

import { del, list, put } from "@vercel/blob";
import type {
  AppendResult,
  LedgerAdapter,
  LedgerEntry,
  LedgerFileStat,
  LedgerMonthInfo,
} from "./types";

const DEFAULT_PREFIX = "valor-ledger";

function prefix(): string {
  const override = process.env.LEAD_LEDGER_BLOB_PREFIX?.trim();
  return override && override.length > 0 ? override : DEFAULT_PREFIX;
}

function monthOf(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function entryPath(entry: LedgerEntry): string {
  const month = monthOf(new Date(entry.writtenAt));
  // Pathname sorts lexicographically — putting writtenAt first gives us
  // chronological order on list(). Lead id disambiguates same-millisecond writes.
  const safeId = entry.leadId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${prefix()}/${month}/${entry.writtenAt}-${safeId}.json`;
}

function monthFromPathname(pathname: string): string | null {
  const rest = pathname.startsWith(prefix() + "/")
    ? pathname.slice(prefix().length + 1)
    : pathname;
  const m = /^(\d{4}-\d{2})\//.exec(rest);
  return m ? m[1] : null;
}

async function listAll(searchPrefix: string): Promise<Array<{ pathname: string; url: string; size: number }>> {
  // list() returns a paginated cursor; iterate until exhausted.
  const out: Array<{ pathname: string; url: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: searchPrefix, cursor, limit: 1000 });
    for (const b of page.blobs) {
      out.push({ pathname: b.pathname, url: b.url, size: b.size });
    }
    cursor = page.cursor ?? undefined;
  } while (cursor);
  return out;
}

async function fetchEntry(url: string): Promise<LedgerEntry | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text) as LedgerEntry;
  } catch {
    return null;
  }
}

export const blobAdapter: LedgerAdapter = {
  name: "blob",

  location: () => `blob:${prefix()}`,

  async append(entry): Promise<AppendResult> {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return {
        ok: false,
        error: "BLOB_READ_WRITE_TOKEN not set — blob adapter cannot append",
      };
    }
    try {
      const pathname = entryPath(entry);
      const blob = await put(pathname, JSON.stringify(entry), {
        access: "public",
        contentType: "application/json",
        // Never silently overwrite a ledger entry. If a collision happens
        // (same timestamp + leadId within the ms), a second write gets a
        // random suffix and both entries are preserved.
        addRandomSuffix: true,
      });
      return { ok: true, location: blob.url };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async listMonths(): Promise<LedgerMonthInfo[]> {
    try {
      const blobs = await listAll(prefix() + "/");
      const byMonth = new Map<string, { lines: number; size: number }>();
      for (const b of blobs) {
        const month = monthFromPathname(b.pathname);
        if (!month) continue;
        const current = byMonth.get(month) ?? { lines: 0, size: 0 };
        byMonth.set(month, { lines: current.lines + 1, size: current.size + b.size });
      }
      return [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, v]) => ({ month, lines: v.lines, size: v.size }));
    } catch {
      return [];
    }
  },

  async statMonth(month): Promise<LedgerFileStat | null> {
    try {
      const blobs = await listAll(`${prefix()}/${month}/`);
      if (blobs.length === 0) return null;
      let size = 0;
      for (const b of blobs) size += b.size;
      return { month, lines: blobs.length, size };
    } catch {
      return null;
    }
  },

  async readRecent(limit): Promise<LedgerEntry[]> {
    try {
      const currentMonth = monthOf(new Date());
      const blobs = await listAll(`${prefix()}/${currentMonth}/`);
      // Pathnames start with writtenAt ISO — reverse-sort gives newest first.
      blobs.sort((a, b) => b.pathname.localeCompare(a.pathname));
      const slice = blobs.slice(0, limit);
      const entries = await Promise.all(slice.map((b) => fetchEntry(b.url)));
      return entries.filter((e): e is LedgerEntry => e !== null);
    } catch {
      return [];
    }
  },

  async readMonth(month): Promise<string | null> {
    try {
      const blobs = await listAll(`${prefix()}/${month}/`);
      if (blobs.length === 0) return null;
      blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
      const entries = await Promise.all(blobs.map((b) => fetchEntry(b.url)));
      const lines = entries
        .filter((e): e is LedgerEntry => e !== null)
        .map((e) => JSON.stringify(e));
      return lines.join("\n") + "\n";
    } catch {
      return null;
    }
  },
};

/**
 * Test-only: wipe every blob under the ledger prefix. Guarded by
 * NODE_ENV === "test" so production can't accidentally trigger it.
 */
export async function _unsafeTestWipe(): Promise<number> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("wipe is test-only");
  }
  const blobs = await listAll(prefix() + "/");
  for (const b of blobs) {
    await del(b.url);
  }
  return blobs.length;
}
