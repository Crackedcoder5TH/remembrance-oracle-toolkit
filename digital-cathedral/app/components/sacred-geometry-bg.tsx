"use client";

/**
 * Sacred Geometry Background — The Centerpiece
 *
 * Renders a full-viewport Flower of Life with Seed of Life core as a
 * subtle translucent SVG that continuously drifts and rotates behind
 * all content. The geometry floats throughout the homepage on a slow,
 * smooth path — alive and ever-present.
 *
 * Elements (all low-opacity teal on indigo):
 *   - Flower of Life pattern (overlapping circles in hexagonal grid)
 *   - Seed of Life at the core (7 interlocking circles, brighter)
 *   - Metatron's Cube connecting lines
 *   - Golden spiral accent
 *   - Vesica Piscis and outer Fibonacci circle
 *
 * Placement uses the golden ratio (φ = 1.618) for proportions.
 */

const PHI = 1.618033988749895; // Golden ratio
const R = 55; // Base circle radius (Fibonacci number)

// Seed of Life: 7 circles — center + 6 surrounding at 60° intervals
function seedOfLifeCircles(cx: number, cy: number, r: number) {
  const circles = [{ cx, cy, r }];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    circles.push({
      cx: cx + r * Math.cos(angle),
      cy: cy + r * Math.sin(angle),
      r,
    });
  }
  return circles;
}

// Flower of Life: seed + second ring + third ring of petals
function flowerOfLifeCircles(cx: number, cy: number, r: number) {
  const circles = seedOfLifeCircles(cx, cy, r);
  // Second ring — 12 circles
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + Math.PI / 6;
    circles.push({
      cx: cx + r * Math.sqrt(3) * Math.cos(angle),
      cy: cy + r * Math.sqrt(3) * Math.sin(angle),
      r,
    });
  }
  // Third ring — petals between second ring
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    circles.push({
      cx: cx + r * 2 * Math.cos(angle),
      cy: cy + r * 2 * Math.sin(angle),
      r,
    });
  }
  return circles;
}

// Metatron's cube: lines connecting the 13 center points of the Flower of Life
function metatronLines(cx: number, cy: number, r: number) {
  const seed = seedOfLifeCircles(cx, cy, r);
  const points = seed.map((c) => ({ x: c.cx, y: c.cy }));
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    points.push({
      x: cx + r * 2 * Math.cos(angle),
      y: cy + r * 2 * Math.sin(angle),
    });
  }
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      lines.push({
        x1: points[i].x,
        y1: points[i].y,
        x2: points[j].x,
        y2: points[j].y,
      });
    }
  }
  return lines;
}

// Golden spiral approximation using quarter-circle arcs
function goldenSpiralPath(cx: number, cy: number, startR: number, turns: number) {
  let r = startR;
  let x = cx;
  let y = cy;
  let path = `M ${x} ${y}`;

  for (let i = 0; i < turns * 4; i++) {
    const quarter = i % 4;
    const sweep = 1;
    let ex = x;
    let ey = y;

    switch (quarter) {
      case 0: ex = x + r; ey = y - r; break;
      case 1: ex = x + r; ey = y + r; break;
      case 2: ex = x - r; ey = y + r; break;
      case 3: ex = x - r; ey = y - r; break;
    }

    path += ` A ${r} ${r} 0 0 ${sweep} ${ex} ${ey}`;
    x = ex;
    y = ey;
    r = r * PHI;
  }

  return path;
}

export function SacredGeometryBg() {
  const viewW = 1000;
  const viewH = 1000;
  const centerX = viewW / 2;
  const centerY = viewH / 2;

  const flowerCircles = flowerOfLifeCircles(centerX, centerY, R);
  const metaLines = metatronLines(centerX, centerY, R);
  const spiralPath = goldenSpiralPath(centerX - R * 2, centerY + R, 3, 3);

  return (
    <>
      <style>{`
        @keyframes sacred-drift {
          0% {
            transform: translate(0%, 0%) scale(1.3);
          }
          15% {
            transform: translate(12%, -8%) scale(1.35);
          }
          30% {
            transform: translate(-5%, -18%) scale(1.25);
          }
          45% {
            transform: translate(-15%, 5%) scale(1.4);
          }
          60% {
            transform: translate(8%, 15%) scale(1.3);
          }
          75% {
            transform: translate(18%, -3%) scale(1.35);
          }
          90% {
            transform: translate(-10%, 10%) scale(1.25);
          }
          100% {
            transform: translate(0%, 0%) scale(1.3);
          }
        }
      `}</style>
      <div
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        aria-hidden="true"
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            animation: "sacred-drift 120s ease-in-out infinite",
            willChange: "transform",
          }}
        >
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid slice"
            className="w-full h-full"
          >
            <defs>
              {/* Radial fade — geometry strongest at center, fades to edges */}
              <radialGradient id="geo-fade" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="white" stopOpacity="1" />
                <stop offset="70%" stopColor="white" stopOpacity="0.6" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </radialGradient>
              <mask id="geo-mask">
                <rect width={viewW} height={viewH} fill="url(#geo-fade)" />
              </mask>

              {/* Teal glow filter */}
              <filter id="geo-glow">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g mask="url(#geo-mask)">
              {/* Flower of Life circles */}
              {flowerCircles.map((c, i) => (
                <circle
                  key={`flower-${i}`}
                  cx={c.cx}
                  cy={c.cy}
                  r={c.r}
                  fill="none"
                  stroke="rgba(0, 168, 168, 0.07)"
                  strokeWidth="0.5"
                />
              ))}

              {/* Metatron's Cube lines */}
              {metaLines.map((l, i) => (
                <line
                  key={`meta-${i}`}
                  x1={l.x1}
                  y1={l.y1}
                  x2={l.x2}
                  y2={l.y2}
                  stroke="rgba(0, 168, 168, 0.03)"
                  strokeWidth="0.3"
                />
              ))}

              {/* Seed of Life — inner 7 circles highlighted brighter (the core) */}
              {seedOfLifeCircles(centerX, centerY, R).map((c, i) => (
                <circle
                  key={`seed-${i}`}
                  cx={c.cx}
                  cy={c.cy}
                  r={c.r}
                  fill="none"
                  stroke="rgba(0, 168, 168, 0.12)"
                  strokeWidth="0.8"
                  filter="url(#geo-glow)"
                />
              ))}

              {/* Center point — Crimson dot at the heart */}
              <circle cx={centerX} cy={centerY} r="3" fill="rgba(230, 57, 70, 0.25)" />
              <circle cx={centerX} cy={centerY} r="1" fill="rgba(230, 57, 70, 0.5)" />

              {/* Golden Spiral accent */}
              <path
                d={spiralPath}
                fill="none"
                stroke="rgba(0, 168, 168, 0.05)"
                strokeWidth="0.8"
              />

              {/* Outer containing circle — Fibonacci radius 233 */}
              <circle
                cx={centerX}
                cy={centerY}
                r={233}
                fill="none"
                stroke="rgba(0, 168, 168, 0.04)"
                strokeWidth="0.3"
              />

              {/* Vesica Piscis — two overlapping circles */}
              <circle
                cx={centerX - R / 2}
                cy={centerY}
                r={R}
                fill="none"
                stroke="rgba(230, 57, 70, 0.04)"
                strokeWidth="0.4"
              />
              <circle
                cx={centerX + R / 2}
                cy={centerY}
                r={R}
                fill="none"
                stroke="rgba(230, 57, 70, 0.04)"
                strokeWidth="0.4"
              />
            </g>

            {/* Slow rotation — the geometry breathes as it drifts */}
            <animateTransform
              attributeName="transform"
              attributeType="XML"
              type="rotate"
              from={`0 ${centerX} ${centerY}`}
              to={`360 ${centerX} ${centerY}`}
              dur="300s"
              repeatCount="indefinite"
            />
          </svg>
        </div>
      </div>
    </>
  );
}
