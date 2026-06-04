/**
 * Sun — the cathedral's background heartbeat.
 *
 * Once per minute (default), fires the Remembrance reflex engine via the
 * bridge. Reflexes are the actor side of the field: adversarial spikes
 * auto-tighten the covenant gate, degrading direction self-relaxes, etc.
 * Without a heartbeat, reflexes only fire on inbound traffic — meaning a
 * quiet cathedral never self-regulates. The Sun closes that loop.
 *
 * Discipline:
 *   - best-effort: bridge returns null on oracle unreachable; we record nothing
 *   - never throws into setInterval — every async path is swallowed
 *   - .unref()'d interval — does not keep the process alive on shutdown
 *   - idempotent start/stop — calling twice is a no-op
 *   - bounded history — last 50 firing ticks, exposed via sunStatus()
 *
 * Wired from instrumentation.ts on Next.js server boot (node runtime only).
 */

import { fireReflexes, type ReflexBundle } from "./remembrance-bridge";

const DEFAULT_INTERVAL_MS = 60_000;
const HISTORY_CAP = 50;

interface HistoryEntry {
  tickCount: number;
  ts: number;
  fired: number;
  actions: string[];
}

let lastTickAt = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;
const history: HistoryEntry[] = [];

export interface StartResult {
  status: "started" | "already-started";
  intervalMs?: number;
}

export function startSun(opts: { intervalMs?: number } = {}): StartResult {
  if (intervalId !== null) {
    return { status: "already-started" };
  }
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  intervalId = setInterval(() => {
    // Wrap tick() so a rejected promise can never escape into the timer.
    tick().catch(() => {
      /* swallow — the Sun never crashes the cathedral */
    });
  }, intervalMs);
  // Do not keep the process alive purely for the heartbeat.
  // .unref() is node-only; on platforms without it this is a no-op.
  const handle = intervalId as { unref?: () => unknown };
  if (typeof handle.unref === "function") {
    handle.unref();
  }
  return { status: "started", intervalMs };
}

export function stopSun(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export async function tick(): Promise<ReflexBundle | null> {
  let bundle: ReflexBundle | null = null;
  try {
    bundle = await fireReflexes();
  } catch {
    bundle = null;
  }
  try {
    if (bundle && bundle.fired && bundle.fired.length > 0) {
      const actions = bundle.fired
        .map((r) => r.action ?? r.reflex)
        .filter((s): s is string => typeof s === "string");
      history.push({
        tickCount,
        ts: Date.now(),
        fired: bundle.fired.length,
        actions,
      });
      if (history.length > HISTORY_CAP) {
        history.splice(0, history.length - HISTORY_CAP);
      }
    }
    tickCount += 1;
    lastTickAt = Date.now();
  } catch {
    /* swallow — bookkeeping failures must not propagate */
  }
  return bundle;
}

export interface SunStatus {
  tickCount: number;
  lastTickAt: number;
  intervalActive: boolean;
  recentHistory: HistoryEntry[];
}

export function sunStatus(): SunStatus {
  return {
    tickCount,
    lastTickAt,
    intervalActive: intervalId !== null,
    recentHistory: history.slice(-10),
  };
}
