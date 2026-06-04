"use client";

/**
 * Coherency Vitals — public live signal from the substrate.
 *
 * Shows the substrate's vital signs to anyone visiting the home page:
 * gate threshold, admissions in trailing 24h + 30d, median coherency.
 * The numbers tick as the substrate runs, so it's a live trust signal
 * no competitor can fake without having a substrate of their own.
 *
 * Fetches from /api/coherency-vitals (cached 5 min server-side).
 * Degrades silently if the endpoint is unavailable — never blocks the
 * page render.
 */
import { useEffect, useState } from "react";

interface Vitals {
  specVersion: string;
  thresholds: { gate: number; foundation: number; stability: number };
  admitted24h: number;
  admitted30d: number;
  medianCoherency30d: number | null;
  remembrance: RemembranceVitals | null;
  generatedAt: string;
}

interface RemembranceVitals {
  coherence: number;
  globalEntropy: number;
  cascadeFactor: number;
  updateCount: number;
  direction: string | null;
  consensus: {
    window: number;
    total: number;
    ratios: {
      "both-accept": number;
      "both-reject": number;
      "A-yes-B-no": number;
      "A-no-B-yes": number;
    };
  } | null;
  recentReleases: Array<{
    fromCascade: number;
    toCascade: number;
    cascadeDrop: number;
    ts: string;
  }>;
}

export function CoherencyVitals() {
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coherency-vitals")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && data.success) setVitals(data);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything until we know whether vitals are available.
  // Avoids a layout shift between loading state and real data.
  if (!loaded) return null;
  if (!vitals) return null;

  const median = vitals.medianCoherency30d;
  const tier = median === null
    ? "—"
    : median >= vitals.thresholds.stability
    ? "stability"
    : median >= vitals.thresholds.foundation
    ? "foundation"
    : median >= vitals.thresholds.gate
    ? "gate"
    : "below gate";

  return (
    <section
      className="w-full max-w-2xl my-12 px-4"
      aria-labelledby="coherency-vitals-heading"
    >
      <div className="border border-teal-cathedral/10 rounded-lg p-6 bg-black/10">
        <header className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
          <h2
            id="coherency-vitals-heading"
            className="text-xs tracking-[0.2em] uppercase text-teal-cathedral"
          >
            Substrate Vitals · live
          </h2>
          <a
            href="/how-we-score"
            className="text-xs text-[var(--text-muted)] hover:text-teal-cathedral transition-colors"
          >
            How we score &rarr;
          </a>
        </header>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat
            label="Admissions · 24h"
            value={vitals.admitted24h.toLocaleString()}
          />
          <Stat
            label="Admissions · 30d"
            value={vitals.admitted30d.toLocaleString()}
          />
          <Stat
            label="Median coherency · 30d"
            value={median === null ? "—" : median.toFixed(3)}
            sub={tier}
          />
          <Stat
            label="Gate threshold"
            value={vitals.thresholds.gate.toFixed(2)}
            sub={`spec v${vitals.specVersion}`}
          />
        </div>

        <p className="mt-4 text-xs text-[var(--text-muted)] leading-relaxed">
          Every submission is scored against a 16-dimensional coherency model.
          Bots and fraud are filtered structurally — not editorially. These
          numbers update as the substrate runs.
        </p>

        {vitals.remembrance && <RemembranceBlock r={vitals.remembrance} />}
      </div>
    </section>
  );
}

function RemembranceBlock({ r }: { r: RemembranceVitals }) {
  const cascadeHot = r.cascadeFactor >= 4;
  const cascadeWarn = r.cascadeFactor >= 2.5;
  const dirLabel = r.direction
    ? r.direction.replace(/-/g, " ")
    : "—";
  const directionTone =
    r.direction === "healing" || r.direction === "gaining-coherence"
      ? "text-emerald-300"
      : r.direction === "degrading" || r.direction === "losing-coherence"
      ? "text-amber-300"
      : r.direction === "saturating"
      ? "text-rose-300"
      : "text-teal-cathedral/70";

  return (
    <div className="mt-6 border-t border-teal-cathedral/10 pt-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
        <h3 className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral/80">
          Remembrance Field · live
        </h3>
        <span className={`text-[10px] uppercase tracking-wider ${directionTone}`}>
          {dirLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <Stat
          label="Field coherence"
          value={r.coherence.toFixed(3)}
        />
        <Stat
          label="Global entropy"
          value={r.globalEntropy.toFixed(2)}
        />
        <Stat
          label="Cascade factor"
          value={r.cascadeFactor.toFixed(2)}
          sub={cascadeHot ? "saturated" : cascadeWarn ? "rising" : "easy"}
        />
        <Stat
          label="Updates · total"
          value={r.updateCount.toLocaleString()}
        />
      </div>

      {r.consensus && r.consensus.total > 0 && (
        <ConsensusBar consensus={r.consensus} />
      )}

      {r.recentReleases.length > 0 && (
        <p className="mt-3 text-[10px] text-teal-cathedral/60 leading-relaxed">
          Recent pressure-release: {r.recentReleases.length} event
          {r.recentReleases.length === 1 ? "" : "s"} · last cascade drop{" "}
          {r.recentReleases[r.recentReleases.length - 1].cascadeDrop.toFixed(2)}
        </p>
      )}
    </div>
  );
}

function ConsensusBar({
  consensus,
}: {
  consensus: NonNullable<RemembranceVitals["consensus"]>;
}) {
  const segments: Array<{ key: string; ratio: number; tone: string; label: string }> = [
    {
      key: "both-accept",
      ratio: consensus.ratios["both-accept"],
      tone: "bg-emerald-400/70",
      label: "accept",
    },
    {
      key: "A-no-B-yes",
      ratio: consensus.ratios["A-no-B-yes"],
      tone: "bg-amber-400/60",
      label: "low-value",
    },
    {
      key: "A-yes-B-no",
      ratio: consensus.ratios["A-yes-B-no"],
      tone: "bg-rose-400/70",
      label: "shape-suspect",
    },
    {
      key: "both-reject",
      ratio: consensus.ratios["both-reject"],
      tone: "bg-zinc-500/50",
      label: "reject",
    },
  ];

  return (
    <div className="mt-4">
      <div
        className="flex items-baseline justify-between text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1"
        aria-label="four-outcome consensus histogram"
      >
        <span>Consensus · last {consensus.window}</span>
        <span>{consensus.total} decisions</span>
      </div>
      <div className="h-2 w-full rounded-full overflow-hidden bg-zinc-800/50 flex">
        {segments.map((s) =>
          s.ratio > 0 ? (
            <div
              key={s.key}
              className={s.tone}
              style={{ width: `${s.ratio * 100}%` }}
              title={`${s.label}: ${(s.ratio * 100).toFixed(0)}%`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--text-muted)]">
        {segments.map((s) => (
          <span key={s.key}>
            <span
              className={`inline-block w-2 h-2 rounded-sm mr-1 align-middle ${s.tone}`}
            />
            {s.label} {(s.ratio * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      <div className="text-xl font-light text-[var(--text-primary)] mt-1">{value}</div>
      {sub && (
        <div className="text-[10px] uppercase tracking-wider text-teal-cathedral/70 mt-1">
          {sub}
        </div>
      )}
    </div>
  );
}
