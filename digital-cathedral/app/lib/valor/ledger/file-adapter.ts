/**
 * Lead Ledger — file-backed adapter.
 *
 * Append-only JSONL on the local filesystem, rotated per month.
 * Works for self-hosted / containerized deploys with a durable volume.
 * For serverless (Vercel) use the blob adapter instead.
 */

import { appendFile, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { LedgerAdapter, LedgerEntry, LedgerFileStat, LedgerMonthInfo } from "./types";

const DEFAULT_DIR = path.join(process.cwd(), ".valor", "ledger");

function ledgerDir(): string {
  const envDir = process.env.LEAD_LEDGER_DIR;
  return envDir && envDir.trim() ? envDir.trim() : DEFAULT_DIR;
}

function monthOf(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function fileFor(date: Date): string {
  return `ledger-${monthOf(date)}.jsonl`;
}

export const fileAdapter: LedgerAdapter = {
  name: "file",

  location: () => ledgerDir(),

  async append(entry) {
    try {
      const dir = ledgerDir();
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, fileFor(new Date(entry.writtenAt)));
      const line = JSON.stringify(entry) + "\n";
      await appendFile(file, line, "utf8");
      return { ok: true, location: file };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async listMonths(): Promise<LedgerMonthInfo[]> {
    try {
      const dir = ledgerDir();
      const names = await readdir(dir);
      const months: LedgerMonthInfo[] = [];
      for (const name of names.sort()) {
        const m = /^ledger-(\d{4}-\d{2})\.jsonl$/.exec(name);
        if (!m) continue;
        const info = await this.statMonth(m[1]);
        if (info) months.push(info);
      }
      return months;
    } catch {
      return [];
    }
  },

  async statMonth(month): Promise<LedgerFileStat | null> {
    try {
      const filePath = path.join(ledgerDir(), `ledger-${month}.jsonl`);
      const s = await stat(filePath);
      const text = await readFile(filePath, "utf8");
      const lines = text.split("\n").filter((l) => l.trim().length > 0).length;
      return { month, size: s.size, lines };
    } catch {
      return null;
    }
  },

  async readRecent(limit) {
    try {
      const filePath = path.join(ledgerDir(), fileFor(new Date()));
      const text = await readFile(filePath, "utf8");
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const recent = lines.slice(-limit).reverse();
      const out: LedgerEntry[] = [];
      for (const l of recent) {
        try { out.push(JSON.parse(l) as LedgerEntry); } catch { /* skip */ }
      }
      return out;
    } catch {
      return [];
    }
  },

  async readMonth(month) {
    try {
      const filePath = path.join(ledgerDir(), `ledger-${month}.jsonl`);
      return await readFile(filePath, "utf8");
    } catch {
      return null;
    }
  },
};
