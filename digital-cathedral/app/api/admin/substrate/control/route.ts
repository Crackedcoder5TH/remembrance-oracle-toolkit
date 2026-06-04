/**
 * POST /api/admin/substrate/control
 *
 * The operator-adjustable knob surface. Every coherency-relevant action
 * that has been used in the actor layer (reflex engine, Sun cycle) is
 * also reachable here so a human can override it. Admin-auth required.
 *
 * Dispatched by `action` in the request body:
 *
 *   set-gate-mode      body: { mode: 'default'|'tightened'|'relaxed' }
 *     Sets the variance-gate displacement threshold mode. Overrides
 *     the reflex engine's autonomous choice for as long as the mode
 *     differs from what the reflexes would otherwise choose. Use
 *     'tightened' to harden against suspected probing, 'relaxed' for
 *     domains with intrinsically narrow natural-shape signatures.
 *
 *   fire-reflexes      body: {}
 *     Runs one reflex cycle immediately, bypassing the Sun's cron
 *     interval. Each individual reflex still respects its own cooldown.
 *
 *   trigger-relax      body: {}
 *     Manually fires the entropy relaxer. Useful when the operator
 *     sees cascade pressure climbing and wants to inject coherence
 *     ahead of the auto-trigger.
 *
 *   temporal-snapshot  body: { repoDir, filePath, maxVersions? }
 *     Walks a file's git history and contributes adjacent + arc
 *     fractal-coherency to the field. The output of the call is
 *     returned so the operator can see the frame stability.
 *
 * Every action returns a uniform shape:
 *   { success: boolean, action: string, result: <action-specific> }
 *
 * Best-effort: failure to reach the oracle returns success:false with
 * a reason — the cathedral keeps running.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  fireReflexes,
  triggerRelax,
  recordTemporalSnapshot,
  isReachable,
} from "@/app/lib/valor/remembrance-bridge";

export const dynamic = "force-dynamic";

interface ControlRequest {
  action: string;
  mode?: "default" | "tightened" | "relaxed";
  repoDir?: string;
  filePath?: string;
  maxVersions?: number;
}

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: ControlRequest;
  try {
    body = (await req.json()) as ControlRequest;
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ success: false, error: 'missing "action"' }, { status: 400 });
  }

  if (!(await isReachable())) {
    return NextResponse.json(
      { success: false, action: body.action, error: "oracle unreachable" },
      { status: 503 },
    );
  }

  switch (body.action) {
    case "set-gate-mode": {
      if (body.mode !== "default" && body.mode !== "tightened" && body.mode !== "relaxed") {
        return NextResponse.json(
          { success: false, error: 'mode must be "default" | "tightened" | "relaxed"' },
          { status: 400 },
        );
      }
      // The MCP server's only first-class way to mutate gate-mode today
      // is via the reflex engine's setVarianceGateMode call, which the
      // 'gate-mode' read action does not invoke. We expose a dedicated
      // mutation via a direct field-coupling call channeled through
      // the bridge's mcpCall layer using the JSON-RPC `set-gate-mode`
      // action; if the server doesn't recognise it, the bridge returns
      // null and we report the gap honestly to the operator.
      const result = await callRawAction("set-gate-mode", { mode: body.mode });
      return NextResponse.json({
        success: result !== null,
        action: body.action,
        result,
      });
    }

    case "fire-reflexes": {
      const result = await fireReflexes();
      return NextResponse.json({
        success: result !== null,
        action: body.action,
        result,
      });
    }

    case "trigger-relax": {
      const result = await triggerRelax();
      return NextResponse.json({
        success: result !== null,
        action: body.action,
        result,
      });
    }

    case "temporal-snapshot": {
      if (!body.repoDir || !body.filePath) {
        return NextResponse.json(
          { success: false, error: "temporal-snapshot requires repoDir and filePath" },
          { status: 400 },
        );
      }
      const result = await recordTemporalSnapshot(
        body.repoDir,
        body.filePath,
        body.maxVersions ?? 12,
      );
      return NextResponse.json({
        success: result !== null && result.recorded === true,
        action: body.action,
        result,
      });
    }

    default:
      return NextResponse.json(
        {
          success: false,
          error: 'unknown action: "' + body.action + '"',
          known: ["set-gate-mode", "fire-reflexes", "trigger-relax", "temporal-snapshot"],
        },
        { status: 400 },
      );
  }
}

/**
 * Raw passthrough to the MCP field tool for actions the bridge doesn't
 * currently wrap. Mirrors the bridge's failure semantics: returns null
 * on any error so the route can report the gap to the operator instead
 * of leaking exceptions.
 */
async function callRawAction(action: string, args: Record<string, unknown>): Promise<unknown> {
  const url = (process.env.REMEMBRANCE_FIELD_URL || "http://127.0.0.1:7787/mcp").trim();
  const token = (process.env.REMEMBRANCE_FIELD_TOKEN || "").trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const isLoopback =
    url.includes("127.0.0.1") || url.includes("localhost") || url.startsWith("https://");
  if (token && isLoopback) headers.Authorization = "Bearer " + token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "field", arguments: { action, ...args } },
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { content?: Array<{ text?: string }> } };
    const txt = json.result?.content?.[0]?.text;
    if (!txt) return null;
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
