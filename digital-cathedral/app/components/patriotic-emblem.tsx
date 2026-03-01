/**
 * Seed of Life — Sacred Geometry Emblem
 *
 * Seven overlapping circles forming the Seed of Life pattern,
 * rendered in the Kingdom's gold palette. Used as the bouncing
 * background emblem and site symbol.
 */

interface EmblemProps {
  size?: number;
  className?: string;
}

export function PatrioticEmblem({ size = 40, className = "" }: EmblemProps) {
  const R = 30; // radius of each circle
  const CX = 100; // center x
  const CY = 100; // center y

  // 6 outer circle centers evenly spaced on the circumference of the center circle
  const outerCircles = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return {
      cx: CX + R * Math.cos(angle),
      cy: CY + R * Math.sin(angle),
    };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="seed-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B8860B" />
          <stop offset="25%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFF8DC" />
          <stop offset="75%" stopColor="#DAA520" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
        <radialGradient id="seed-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Subtle glow behind the pattern */}
      <circle cx={CX} cy={CY} r="70" fill="url(#seed-glow)" />

      {/* Center circle */}
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        stroke="url(#seed-gold)"
        strokeWidth="1.5"
        opacity="0.9"
      />

      {/* 6 outer circles forming the Seed of Life */}
      {outerCircles.map((c, i) => (
        <circle
          key={`seed-${i}`}
          cx={c.cx}
          cy={c.cy}
          r={R}
          fill="none"
          stroke="url(#seed-gold)"
          strokeWidth="1.5"
          opacity="0.9"
        />
      ))}

      {/* Outer bounding circle */}
      <circle
        cx={CX}
        cy={CY}
        r={R * 2}
        fill="none"
        stroke="#DAA520"
        strokeWidth="1"
        opacity="0.4"
      />
    </svg>
  );
}
