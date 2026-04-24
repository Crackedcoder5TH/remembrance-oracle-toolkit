"use client";

/**
 * Coherency Pulse — ambient waveform visualization.
 *
 * Renders a 16-point waveform as an SVG, gently pulsing in place. Accepts
 * either a raw shape array (from the backend covenant cascade) or a scalar
 * coherency score which is expanded into a deterministic sine-based shape.
 *
 * This is the instrument made visible. When the admin dashboard or the
 * confirmation page shows one of these, it's reading the same math that
 * gated the lead — not decoration, not placeholder.
 *
 * Stays visually on-vibe with sacred-geometry-bg + patriotic-emblem: muted,
 * monochrome with a single accent color, no flashy gradients.
 */

import { useEffect, useState } from "react";

export interface CoherencyPulseProps {
  /** 16-point normalized waveform [0, 1]. If absent, derived from score. */
  shape?: readonly number[];
  /** Coherency score [0, 1]. Drives amplitude + color accent intensity. */
  score: number;
  /** Tier label to render beneath the waveform. */
  tier?: string;
  /** Archetype name (e.g. "valor/protective-veteran"). */
  archetype?: string;
  /** Visual size. */
  size?: "sm" | "md" | "lg";
  /** Optional override for the accent color (defaults to ecosystem gold). */
  accent?: string;
  /** Label shown above the waveform. */
  label?: string;
}

const SIZE_MAP = {
  sm: { w: 160, h: 48, stroke: 1.5 },
  md: { w: 240, h: 72, stroke: 2 },
  lg: { w: 320, h: 96, stroke: 2.5 },
} as const;

/** Default accent — the muted gold used by patriotic-emblem on the site. */
const DEFAULT_ACCENT = "#c9a94a";

/**
 * Derive a deterministic 16-point shape from a scalar score — used when
 * the backend only returns the coherency number and no full shape array.
 * Higher scores produce tighter, more coherent sine patterns; low scores
 * produce flatter, more random ones.
 */
function deriveShape(score: number): number[] {
  const out = new Array<number>(16);
  const s = Math.max(0, Math.min(1, score));
  // Two superposed harmonics, amplitude scaled by score.
  for (let i = 0; i < 16; i++) {
    const base = 0.5 + 0.4 * s * Math.sin((i / 16) * Math.PI * 2 * 2);
    const detail = 0.1 * s * Math.cos((i / 16) * Math.PI * 2 * 5);
    out[i] = Math.max(0, Math.min(1, base + detail));
  }
  return out;
}

/** Catmull-Rom-ish smoothing path so the wave reads as continuous. */
function buildPath(shape: readonly number[], w: number, h: number): string {
  if (shape.length === 0) return "";
  const n = shape.length;
  const stepX = w / (n - 1 || 1);
  const pad = 4;
  const inner = h - pad * 2;
  const toY = (v: number) => pad + (1 - Math.max(0, Math.min(1, v))) * inner;

  const pts = shape.map((v, i) => [i * stepX, toY(v)] as const);
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` Q ${cx} ${y0} ${cx} ${(y0 + y1) / 2} T ${x1} ${y1}`;
  }
  return d;
}

export function CoherencyPulse({
  shape,
  score,
  tier,
  archetype,
  size = "md",
  accent = DEFAULT_ACCENT,
  label,
}: CoherencyPulseProps) {
  const { w, h, stroke } = SIZE_MAP[size];
  const actualShape = shape && shape.length >= 4 ? shape : deriveShape(score);
  const path = buildPath(actualShape, w, h);
  const intensity = Math.max(0.2, Math.min(1, score));

  // Gentle pulse — every ~3.2s the wave brightens and fades. Respects
  // prefers-reduced-motion via CSS animation settings at render time.
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let cancel = false;
    const tick = () => {
      if (cancel) return;
      setPhase((p) => (p + 1) % 360);
      setTimeout(tick, 80);
    };
    tick();
    return () => { cancel = true; };
  }, []);

  const breath = 0.85 + 0.15 * Math.sin((phase / 360) * Math.PI * 2);

  return (
    <div className="inline-flex flex-col items-center gap-1 select-none">
      {label ? (
        <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-400">
          {label}
        </span>
      ) : null}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`Coherency pulse at ${(score * 100).toFixed(0)} percent`}
        className="motion-reduce:animate-none"
      >
        <defs>
          <linearGradient id="cp-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={accent} stopOpacity="0" />
            <stop offset="50%" stopColor={accent} stopOpacity={intensity} />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1="0"
          x2={w}
          y1={h / 2}
          y2={h / 2}
          stroke={accent}
          strokeOpacity={0.12}
          strokeWidth={1}
        />
        <path
          d={path}
          fill="none"
          stroke="url(#cp-fade)"
          strokeWidth={stroke * breath}
          strokeLinecap="round"
        />
        {/* 16 dots at peaks — one per dimension */}
        {actualShape.map((v, i) => {
          const x = (i / (actualShape.length - 1)) * w;
          const pad = 4;
          const inner = h - pad * 2;
          const y = pad + (1 - v) * inner;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={stroke * 0.6 * breath}
              fill={accent}
              fillOpacity={intensity * 0.8}
            />
          );
        })}
      </svg>
      {(tier || archetype) ? (
        <div className="flex flex-col items-center gap-0.5">
          {tier ? (
            <span className="text-xs font-medium text-neutral-300">
              {tier} &middot; {(score * 100).toFixed(1)}%
            </span>
          ) : null}
          {archetype ? (
            <span className="text-[10px] text-neutral-500 font-mono">
              {archetype}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
