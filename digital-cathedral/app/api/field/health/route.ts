import { NextResponse } from "next/server";
import { fieldEndpoint, peekField } from "@/app/lib/valor/remembrance-bridge";

export const dynamic = "force-dynamic";

type Check = { name: string; ok: boolean; level: "critical" | "warn" | "info"; detail: string; fix?: string };

// Field-connection preflight for the cathedral — SAME path and shape as the
// interface (/api/field/health), so "open /api/field/health on either app" is
// the one rule to remember. Every failing check carries a plain-English fix.
// Read-only; the token value is never exposed (only presence + length).
export async function GET() {
  const rawUrl = (process.env.REMEMBRANCE_FIELD_URL || "").trim();
  const token = (process.env.REMEMBRANCE_FIELD_TOKEN || "").trim();
  const hasScheme = /^https?:\/\//i.test(rawUrl);
  const endpoint = fieldEndpoint();
  const state = await peekField({ includeSources: true }).catch(() => null);
  const reachable = !!state;

  const checks: Check[] = [];

  checks.push(rawUrl
    ? { name: "Field URL is set", ok: true, level: "critical", detail: `REMEMBRANCE_FIELD_URL = ${rawUrl}` }
    : {
        name: "Field URL is set", ok: false, level: "critical",
        detail: "REMEMBRANCE_FIELD_URL is not set — the cathedral falls back to localhost, which does not exist on Vercel.",
        fix: "In Vercel → the cathedral project → Settings → Environment Variables, add REMEMBRANCE_FIELD_URL = https://<your-field-server-host>, then Redeploy.",
      });

  if (rawUrl) {
    checks.push(hasScheme
      ? { name: "URL includes https://", ok: true, level: "info", detail: `scheme present — calling ${endpoint}` }
      : {
          name: "URL includes https://", ok: false, level: "warn",
          detail: `The value "${rawUrl}" has no http(s):// — it is auto-treated as ${endpoint}.`,
          fix: "Set REMEMBRANCE_FIELD_URL to the full https:// URL to be explicit, then redeploy.",
        });
  }

  checks.push(reachable
    ? { name: "Field answers", ok: true, level: "critical", detail: `connected — coherence ${state!.coherence}, ${state!.updateCount} updates` }
    : {
        name: "Field answers", ok: false, level: "critical",
        detail: "The field did not answer over /mcp.",
        fix: rawUrl
          ? "Open your field-server URL in a browser — you should see JSON. If it works there but not here, redeploy this app so the env value is applied."
          : "Set the Field URL first (above), then redeploy.",
      });

  checks.push(token
    ? { name: "Write token is set", ok: true, level: "info", detail: `token present (${token.length} chars) — substrate writes and dual-oracle validation are enabled` }
    : {
        name: "Write token is set", ok: false, level: "warn",
        detail: "No REMEMBRANCE_FIELD_TOKEN — reading works, but writes are disabled.",
        fix: "If the cathedral needs to write, set REMEMBRANCE_FIELD_TOKEN to the field-server's FIELD_TOKEN, then redeploy.",
      });

  const ok = checks.filter((c) => c.level === "critical").every((c) => c.ok);
  const failed = checks.filter((c) => !c.ok && c.level === "critical").map((c) => c.name);
  const summary = ok ? "Field connected and wired." : `Not connected — ${failed.join(", ")}. See the fix on each red row.`;

  return NextResponse.json(
    {
      ok,
      summary,
      reachable,
      effectiveEndpoint: endpoint || "(none)",
      env: {
        REMEMBRANCE_FIELD_URL: rawUrl || "(not set)",
        REMEMBRANCE_FIELD_TOKEN: token ? `set (${token.length} chars)` : "(not set — needed for writes only)",
      },
      checks,
      state: state ? { coherence: state.coherence, updateCount: state.updateCount } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
