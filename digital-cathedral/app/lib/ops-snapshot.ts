/**
 * Operational snapshot helpers powering /api/admin/ops/summary.
 *
 * Kept out of the route so the handler stays the canonical
 * verifyAdmin → assemble → JSON shape and so these probes can be reused
 * from any other status surface (e.g. a future CLI or healthcheck).
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Env vars the cathedral can't run correctly without in production. */
export const CRITICAL_ENV = [
  "DATABASE_URL",
  "ADMIN_API_KEY",
  "NEXTAUTH_SECRET",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
] as const;

/** Env vars that unlock features but aren't strictly required. */
export const FEATURE_ENV = [
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

export function envStatus(keys: readonly string[]): { key: string; set: boolean }[] {
  return keys.map((k) => ({ key: k, set: Boolean(process.env[k]?.trim()) }));
}

export interface DiagnosticSummary {
  mtime: string;
  generatedAt?: string;
  filesScanned: number;
  totalFindings: number;
  byClass: Record<string, number>;
  bySeverity: Record<string, number>;
}

export async function readDiagnostic(): Promise<DiagnosticSummary | null> {
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

/** Roll the critical/feature env probes + diagnostic severity into a verdict. */
export function readinessFrom(
  criticalMissing: number,
  diagnostic: DiagnosticSummary | null,
): "ready" | "warning" | "blocked" {
  if (criticalMissing > 0) return "blocked";
  if ((diagnostic?.bySeverity?.high ?? 0) > 0) return "warning";
  return "ready";
}
