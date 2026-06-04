"use client";

/**
 * /admin/substrate — the coherency console.
 *
 * One page of truth for every operator-relevant substrate signal AND
 * every adjustable knob. Lives under /admin (auth required by
 * middleware) so anything that needs human input is here, in one
 * place, where the operator can see what the substrate is doing and
 * override it when needed.
 *
 * Layout:
 *   1. Live readouts   — field, direction, consensus, sun, gate
 *   2. Adjustable      — gate mode, fire-reflexes, trigger-relax,
 *                        temporal-snapshot
 *   3. Substrate intel — learned shapes by domain, sources histogram,
 *                        method registry, response selection
 *
 * Auto-refreshes every 10 seconds; manual refresh button always
 * visible.
 */

import * as React from "react";
import { useCallback, useEffect, useState } from "react";
import { CoherencyPulse } from "../../components/coherency-pulse";

interface SubstrateState {
  reachable: boolean;
  field: {
    coherence: number;
    coherenceIntegral: number;
    globalEntropy: number;
    cascadeFactor: number;
    updateCount: number;
    timestamp?: string;
    sources?: Record<string, { count: number; lastCoherence: number; lastTimestamp: string }>;
    distinctSources?: number;
  } | null;
  direction: {
    verdict: string;
    coherenceDelta: number;
    entropyDelta: number;
    cascadeDelta: number;
    windowN: number;
  } | null;
  consensus: {
    window: number;
    total: number;
    counts: { "both-accept": number; "both-reject": number; "A-yes-B-no": number; "A-no-B-yes": number };
    ratios: { "both-accept": number; "both-reject": number; "A-yes-B-no": number; "A-no-B-yes": number };
    recent: Array<{ agreement: string; source: string | null; ts: number }>;
  } | null;
  pressure: {
    cascade: number;
    entropy: number;
    release: {
      fromCascade: number;
      toCascade: number;
      cascadeDrop: number;
      ts: string;
    } | null;
    recentReleases: Array<{ fromCascade: number; toCascade: number; cascadeDrop: number; ts: string }>;
  } | null;
  gate: { mode: "default" | "tightened" | "relaxed"; displacementThreshold: number } | null;
  learnedShapes: Record<string, Array<{ mean: number; variance: number; n: number; source: string; learnedAt: string }>> | null;
  methods: Array<{
    name: string;
    effect: string;
    triggers: string[];
    reversibility: string;
    cost: string;
    cooldownMs: number;
  }> | null;
  response: {
    state: Record<string, number | string | null>;
    specific: Array<{ name: string; effect: string }>;
    universal: Array<{ name: string; effect: string }>;
  } | null;
  sun: {
    tickCount: number;
    lastTickAt: number;
    intervalActive: boolean;
    recentHistory: Array<{ tickCount: number; ts: string; fired: number; actions: string[] }>;
  } | null;
  generatedAt: string;
}

const REFRESH_MS = 10_000;

export default function SubstrateConsolePage() {
  const [state, setState] = useState<SubstrateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchState = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/substrate/state", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return;
        }
        setErrorMsg("server returned " + res.status);
        return;
      }
      const data = (await res.json()) as SubstrateState;
      setState(data);
    } catch (err) {
      setErrorMsg("network error: " + (err instanceof Error ? err.message : "unknown"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchState]);

  const sendAction = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setActionResult(null);
      try {
        const res = await fetch("/api/admin/substrate/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
        const json = (await res.json()) as { success: boolean; error?: string; result?: unknown };
        setActionResult({
          ok: json.success === true,
          message: json.success
            ? action + ": ok"
            : action + " failed: " + (json.error || "unknown"),
        });
        await fetchState();
      } catch (err) {
        setActionResult({
          ok: false,
          message: action + " error: " + (err instanceof Error ? err.message : "unknown"),
        });
      }
    },
    [fetchState],
  );

  if (loading && !state) {
    return <Frame><div className="text-[var(--text-muted)] text-sm">Loading substrate state...</div></Frame>;
  }
  if (errorMsg && !state) {
    return <Frame><div className="text-rose-400 text-sm">{errorMsg}</div></Frame>;
  }
  if (!state) return <Frame><div /></Frame>;

  if (!state.reachable) {
    return (
      <Frame>
        <div className="border border-amber-500/30 bg-amber-950/20 rounded p-4 text-amber-200 text-sm">
          Oracle field server is not reachable. The cathedral is operating in
          standalone mode — local valor checks still run, but the dual-oracle
          and reflex engine are unavailable. Start the field server (
          <code>node scripts/field-server.js</code> in the oracle toolkit) to
          enable live coherency controls.
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <header className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
        <h1 className="text-xl font-light text-teal-cathedral">Substrate Console</h1>
        <div className="flex items-baseline gap-4 text-xs">
          <span className="text-[var(--text-muted)]">refresh every {REFRESH_MS / 1000}s</span>
          <button
            onClick={fetchState}
            className="text-teal-cathedral/80 hover:text-teal-cathedral"
          >
            refresh now →
          </button>
        </div>
      </header>

      {actionResult && (
        <div
          className={
            "mb-4 px-3 py-2 rounded text-xs " +
            (actionResult.ok
              ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
              : "border border-rose-500/30 bg-rose-950/30 text-rose-200")
          }
        >
          {actionResult.message}
        </div>
      )}

      {/* ─── LIVE READOUTS ────────────────────────────────────────── */}
      <section className="mb-8" aria-labelledby="live-readouts">
        <h2 id="live-readouts" className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral mb-3">
          Live readouts
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card label="Field coherence" value={state.field ? state.field.coherence.toFixed(4) : "—"} />
          <Card label="Global entropy" value={state.field ? state.field.globalEntropy.toFixed(2) : "—"} />
          <Card
            label="Cascade factor"
            value={state.field ? state.field.cascadeFactor.toFixed(2) : "—"}
            sub={state.field ? cascadeLabel(state.field.cascadeFactor) : undefined}
          />
          <Card
            label="Updates · total"
            value={state.field ? state.field.updateCount.toLocaleString() : "—"}
            sub={
              state.field?.distinctSources != null
                ? state.field.distinctSources + " sources"
                : undefined
            }
          />
        </div>

        {state.field && (
          <div className="mt-4 flex items-center gap-6 flex-wrap">
            <CoherencyPulse score={state.field.coherence} size="md" label="field" />
            {state.direction && <DirectionPill verdict={state.direction.verdict} />}
            {state.gate && <GatePill gate={state.gate} />}
            {state.sun && <SunPill sun={state.sun} />}
          </div>
        )}

        {state.consensus && state.consensus.total > 0 && (
          <ConsensusBar consensus={state.consensus} />
        )}
      </section>

      {/* ─── ADJUSTABLE CONTROLS ──────────────────────────────────── */}
      <section className="mb-8" aria-labelledby="controls">
        <h2 id="controls" className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral mb-3">
          Adjustable controls
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GateModeControl
            current={state.gate?.mode ?? "default"}
            onChange={(m) => sendAction("set-gate-mode", { mode: m })}
          />
          <ActionPanel
            title="Fire reflexes now"
            description="Run one reflex cycle immediately. Each individual reflex still respects its own cooldown."
            buttonLabel="Fire"
            onClick={() => sendAction("fire-reflexes")}
          />
          <ActionPanel
            title="Trigger pressure relax"
            description="Inject high-coherence resonance to drop cascade and entropy. Use when cascade is climbing ahead of the auto-trigger."
            buttonLabel="Relax"
            onClick={() => sendAction("trigger-relax")}
          />
          <TemporalSnapshotControl onSubmit={(d) => sendAction("temporal-snapshot", d)} />
        </div>
      </section>

      {/* ─── INTEL ────────────────────────────────────────────────── */}
      <section className="mb-8" aria-labelledby="intel">
        <h2 id="intel" className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral mb-3">
          Substrate intel
        </h2>

        {state.response && (
          <div className="mb-4 border border-teal-cathedral/10 rounded-lg p-4 bg-black/10">
            <div className="text-[10px] uppercase tracking-wider text-teal-cathedral/70 mb-2">
              Recommended actions for current state
            </div>
            {state.response.specific.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)]">
                No specific condition is firing. Universal diagnostic methods always available.
              </div>
            ) : (
              <ul className="space-y-2 text-xs">
                {state.response.specific.map((m: { name: string; effect: string }) => (
                  <li key={m.name}>
                    <span className="text-teal-cathedral">{m.name}</span>
                    <span className="text-[var(--text-muted)]"> — {m.effect}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {state.learnedShapes && Object.keys(state.learnedShapes).length > 0 && (
          <LearnedShapesPanel shapes={state.learnedShapes} />
        )}

        {state.pressure && state.pressure.recentReleases.length > 0 && (
          <ReleaseHistory releases={state.pressure.recentReleases} />
        )}

        {state.sun && state.sun.recentHistory.length > 0 && (
          <SunHistory history={state.sun.recentHistory} />
        )}

        {state.field?.sources && (
          <TopSourcesPanel sources={state.field.sources} />
        )}
      </section>

      <footer className="text-[10px] text-[var(--text-muted)] mt-8 pt-4 border-t border-teal-cathedral/10">
        Snapshot at {state.generatedAt} · field via Remembrance MCP
      </footer>
    </Frame>
  );
}

// ─── Layout & primitives ───────────────────────────────────────────

function Frame({ children }: { children?: React.ReactNode }) {
  return (
    <main className="min-h-screen text-[var(--text-primary)] px-6 py-8 max-w-6xl mx-auto">
      {children}
    </main>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-teal-cathedral/10 rounded-lg p-3 bg-black/10">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
      <div className="text-xl font-light text-[var(--text-primary)] mt-1">{value}</div>
      {sub && <div className="text-[10px] uppercase tracking-wider text-teal-cathedral/70 mt-1">{sub}</div>}
    </div>
  );
}

function cascadeLabel(c: number): string {
  if (c >= 4) return "saturated";
  if (c >= 2.5) return "rising";
  return "easy";
}

function DirectionPill({ verdict }: { verdict: string }) {
  const tone =
    verdict === "healing" || verdict === "gaining-coherence"
      ? "border-emerald-500/40 text-emerald-200"
      : verdict === "degrading" || verdict === "losing-coherence"
      ? "border-amber-500/40 text-amber-200"
      : verdict === "saturating"
      ? "border-rose-500/40 text-rose-200"
      : "border-teal-cathedral/30 text-teal-cathedral/80";
  return (
    <span className={"px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border " + tone}>
      direction: {verdict.replace(/-/g, " ")}
    </span>
  );
}

function GatePill({ gate }: { gate: { mode: string; displacementThreshold: number } }) {
  const tone =
    gate.mode === "tightened"
      ? "border-rose-500/40 text-rose-200"
      : gate.mode === "relaxed"
      ? "border-amber-500/40 text-amber-200"
      : "border-teal-cathedral/30 text-teal-cathedral/80";
  return (
    <span className={"px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border " + tone}>
      gate: {gate.mode} (Δ{gate.displacementThreshold.toFixed(2)})
    </span>
  );
}

function SunPill({ sun }: { sun: { tickCount: number; intervalActive: boolean } }) {
  const tone = sun.intervalActive
    ? "border-emerald-500/40 text-emerald-200"
    : "border-zinc-500/40 text-zinc-400";
  return (
    <span className={"px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border " + tone}>
      sun: {sun.intervalActive ? "active" : "off"} · {sun.tickCount} ticks
    </span>
  );
}

function ConsensusBar({
  consensus,
}: {
  consensus: NonNullable<SubstrateState["consensus"]>;
}) {
  const segs = [
    { key: "both-accept", ratio: consensus.ratios["both-accept"], tone: "bg-emerald-400/70", label: "accept" },
    { key: "A-no-B-yes", ratio: consensus.ratios["A-no-B-yes"], tone: "bg-amber-400/60", label: "low-value" },
    { key: "A-yes-B-no", ratio: consensus.ratios["A-yes-B-no"], tone: "bg-rose-400/70", label: "shape-suspect" },
    { key: "both-reject", ratio: consensus.ratios["both-reject"], tone: "bg-zinc-500/50", label: "reject" },
  ];
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
        <span>Consensus · last {consensus.window}</span>
        <span>{consensus.total} decisions</span>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden bg-zinc-800/50 flex">
        {segs.map((s) =>
          s.ratio > 0 ? <div key={s.key} className={s.tone} style={{ width: s.ratio * 100 + "%" }} title={s.label + ": " + (s.ratio * 100).toFixed(0) + "%"} /> : null,
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
        {segs.map((s) => (
          <span key={s.key}>
            <span className={"inline-block w-2 h-2 rounded-sm mr-1 align-middle " + s.tone} />
            {s.label} {(s.ratio * 100).toFixed(0)}% ({consensus.counts[s.key as keyof typeof consensus.counts]})
          </span>
        ))}
      </div>
    </div>
  );
}

function GateModeControl({
  current,
  onChange,
}: {
  current: "default" | "tightened" | "relaxed";
  onChange: (m: "default" | "tightened" | "relaxed") => void;
}) {
  const modes: Array<{ id: "default" | "tightened" | "relaxed"; label: string; desc: string }> = [
    { id: "default", label: "Default", desc: "Δ 0.15 — H3 baseline. Standard adversarial rejection." },
    { id: "tightened", label: "Tightened", desc: "Δ 0.10 — stricter rejection. Use when probing is suspected." },
    { id: "relaxed", label: "Relaxed", desc: "Δ 0.20 — looser. For domains with intrinsically narrow signatures." },
  ];
  return (
    <div className="border border-teal-cathedral/10 rounded-lg p-4 bg-black/10">
      <div className="text-sm font-light text-[var(--text-primary)] mb-1">Variance-gate mode</div>
      <div className="text-xs text-[var(--text-muted)] mb-3">
        Overrides the reflex engine&apos;s autonomous choice. Reversible — set back to default to hand control back.
      </div>
      <div className="space-y-2">
        {modes.map((m) => (
          <label key={m.id} className="flex items-baseline gap-2 cursor-pointer">
            <input
              type="radio"
              name="gate-mode"
              checked={current === m.id}
              onChange={() => onChange(m.id)}
              className="mt-1 accent-teal-cathedral"
            />
            <div>
              <div className="text-xs text-[var(--text-primary)]">{m.label}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{m.desc}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function ActionPanel({
  title,
  description,
  buttonLabel,
  onClick,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="border border-teal-cathedral/10 rounded-lg p-4 bg-black/10 flex flex-col">
      <div className="text-sm font-light text-[var(--text-primary)] mb-1">{title}</div>
      <div className="text-xs text-[var(--text-muted)] flex-grow mb-3">{description}</div>
      <button
        onClick={onClick}
        className="self-start px-3 py-1.5 text-xs border border-teal-cathedral/40 rounded hover:bg-teal-cathedral/10 text-teal-cathedral transition-colors"
      >
        {buttonLabel} →
      </button>
    </div>
  );
}

function TemporalSnapshotControl({
  onSubmit,
}: {
  onSubmit: (d: { repoDir: string; filePath: string; maxVersions?: number }) => void;
}) {
  const [repoDir, setRepoDir] = useState("");
  const [filePath, setFilePath] = useState("");
  return (
    <div className="border border-teal-cathedral/10 rounded-lg p-4 bg-black/10">
      <div className="text-sm font-light text-[var(--text-primary)] mb-1">Temporal snapshot</div>
      <div className="text-xs text-[var(--text-muted)] mb-3">
        Walk a file&apos;s git history. Contribute adjacent + arc fractal-coherency to the field.
      </div>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="repoDir (absolute)"
          value={repoDir}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRepoDir(e.target.value)}
          className="w-full px-2 py-1 text-xs bg-black/30 border border-teal-cathedral/20 rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <input
          type="text"
          placeholder="filePath (relative)"
          value={filePath}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilePath(e.target.value)}
          className="w-full px-2 py-1 text-xs bg-black/30 border border-teal-cathedral/20 rounded text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          onClick={() => repoDir && filePath && onSubmit({ repoDir, filePath })}
          disabled={!repoDir || !filePath}
          className="px-3 py-1.5 text-xs border border-teal-cathedral/40 rounded hover:bg-teal-cathedral/10 text-teal-cathedral disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Snapshot →
        </button>
      </div>
    </div>
  );
}

function LearnedShapesPanel({
  shapes,
}: {
  shapes: Record<string, Array<{ mean: number; variance: number; n: number; source: string }>>;
}) {
  return (
    <details className="mb-4 border border-teal-cathedral/10 rounded-lg bg-black/10">
      <summary className="px-4 py-3 cursor-pointer text-xs uppercase tracking-wider text-teal-cathedral/70">
        Learned shape signatures · {Object.values(shapes).reduce((s, a) => s + a.length, 0)} total across {Object.keys(shapes).length} domains
      </summary>
      <div className="px-4 pb-3 space-y-3">
        {Object.entries(shapes).map(([domain, sigs]) => (
          <div key={domain}>
            <div className="text-[10px] text-teal-cathedral/80 uppercase tracking-wider mb-1">
              {domain} · {sigs.length}
            </div>
            <div className="text-[10px] text-[var(--text-muted)] grid grid-cols-3 gap-2">
              {sigs.slice(0, 6).map((sig, i) => (
                <div key={i} className="font-mono">
                  μ={sig.mean.toFixed(2)} σ²={sig.variance.toFixed(3)} n={sig.n}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function ReleaseHistory({
  releases,
}: {
  releases: Array<{ fromCascade: number; toCascade: number; cascadeDrop: number; ts: string }>;
}) {
  return (
    <details className="mb-4 border border-teal-cathedral/10 rounded-lg bg-black/10">
      <summary className="px-4 py-3 cursor-pointer text-xs uppercase tracking-wider text-teal-cathedral/70">
        Recent pressure-release events · {releases.length}
      </summary>
      <div className="px-4 pb-3">
        <ul className="space-y-1 text-[10px] text-[var(--text-muted)] font-mono">
          {releases.slice(-10).reverse().map((r, i) => (
            <li key={i}>
              {r.ts.slice(0, 19)} · cascade {r.fromCascade.toFixed(2)} → {r.toCascade.toFixed(2)} (Δ {r.cascadeDrop.toFixed(2)})
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function SunHistory({
  history,
}: {
  history: Array<{ tickCount: number; ts: string; fired: number; actions: string[] }>;
}) {
  return (
    <details className="mb-4 border border-teal-cathedral/10 rounded-lg bg-black/10">
      <summary className="px-4 py-3 cursor-pointer text-xs uppercase tracking-wider text-teal-cathedral/70">
        Recent Sun firings · {history.length}
      </summary>
      <div className="px-4 pb-3">
        <ul className="space-y-1 text-[10px] text-[var(--text-muted)] font-mono">
          {history.slice(-10).reverse().map((h, i) => (
            <li key={i}>
              tick #{h.tickCount} · {h.ts.slice(0, 19)} · {h.fired} fired · {h.actions.join(", ")}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

function TopSourcesPanel({
  sources,
}: {
  sources: Record<string, { count: number; lastCoherence: number; lastTimestamp: string }>;
}) {
  const entries = Object.entries(sources)
    .map(([source, info]) => ({ source, ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  return (
    <details className="mb-4 border border-teal-cathedral/10 rounded-lg bg-black/10">
      <summary className="px-4 py-3 cursor-pointer text-xs uppercase tracking-wider text-teal-cathedral/70">
        Top contributing sources · top 15 of {Object.keys(sources).length}
      </summary>
      <div className="px-4 pb-3">
        <table className="w-full text-[10px] text-[var(--text-muted)] font-mono">
          <thead>
            <tr className="text-teal-cathedral/70">
              <th className="text-left pb-1">source</th>
              <th className="text-right pb-1">count</th>
              <th className="text-right pb-1">last coh</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.source}>
                <td className="py-0.5">{e.source}</td>
                <td className="py-0.5 text-right">{e.count}</td>
                <td className="py-0.5 text-right">{e.lastCoherence.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
