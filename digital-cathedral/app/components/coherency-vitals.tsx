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
  generatedAt: string;
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
      </div>
    </section>
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
