/**
 * Patriotic Emblem — The Kingdom's Seal
 *
 * A shield/crest with eagle, spread wings, globe, stars,
 * and "UNITED STATES OF AMERICA" banner rendered in SVG.
 * Used as the site's staple symbol in the navbar and background.
 */

interface EmblemProps {
  size?: number;
  className?: string;
}

export function PatrioticEmblem({ size = 40, className = "" }: EmblemProps) {
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
        <linearGradient id="emblem-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B8860B" />
          <stop offset="25%" stopColor="#FFD700" />
          <stop offset="50%" stopColor="#FFF8DC" />
          <stop offset="75%" stopColor="#DAA520" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
        <linearGradient id="emblem-gold-dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B6914" />
          <stop offset="50%" stopColor="#DAA520" />
          <stop offset="100%" stopColor="#8B6914" />
        </linearGradient>
        <linearGradient id="shield-blue" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#1A1B3A" />
          <stop offset="100%" stopColor="#0D0E1F" />
        </linearGradient>
      </defs>

      {/* === Wings — spread behind the shield === */}
      {/* Left wing */}
      <path
        d="M100 85 Q75 60 30 50 Q20 48 15 55 Q25 65 35 75 Q45 82 55 88 Q65 92 80 95 Z"
        fill="url(#emblem-gold)"
        opacity="0.9"
      />
      <path
        d="M100 85 Q78 68 40 58 Q30 56 22 60 Q32 70 42 78 Q52 85 65 90 Z"
        fill="url(#emblem-gold-dark)"
        opacity="0.4"
      />
      {/* Left wing feather lines */}
      <path d="M30 52 Q55 62 75 80" stroke="#B8860B" strokeWidth="0.5" opacity="0.5" fill="none" />
      <path d="M25 58 Q50 68 70 85" stroke="#B8860B" strokeWidth="0.5" opacity="0.4" fill="none" />

      {/* Right wing */}
      <path
        d="M100 85 Q125 60 170 50 Q180 48 185 55 Q175 65 165 75 Q155 82 145 88 Q135 92 120 95 Z"
        fill="url(#emblem-gold)"
        opacity="0.9"
      />
      <path
        d="M100 85 Q122 68 160 58 Q170 56 178 60 Q168 70 158 78 Q148 85 135 90 Z"
        fill="url(#emblem-gold-dark)"
        opacity="0.4"
      />
      {/* Right wing feather lines */}
      <path d="M170 52 Q145 62 125 80" stroke="#B8860B" strokeWidth="0.5" opacity="0.5" fill="none" />
      <path d="M175 58 Q150 68 130 85" stroke="#B8860B" strokeWidth="0.5" opacity="0.4" fill="none" />

      {/* === Shield body === */}
      <path
        d="M68 72 L132 72 L132 130 Q132 150 100 162 Q68 150 68 130 Z"
        fill="url(#shield-blue)"
        stroke="url(#emblem-gold)"
        strokeWidth="2.5"
      />

      {/* === Globe inside shield === */}
      <circle cx="100" cy="115" r="28" fill="none" stroke="#DAA520" strokeWidth="0.8" opacity="0.6" />
      {/* Latitude lines */}
      <ellipse cx="100" cy="105" rx="28" ry="8" fill="none" stroke="#DAA520" strokeWidth="0.5" opacity="0.4" />
      <ellipse cx="100" cy="125" rx="28" ry="8" fill="none" stroke="#DAA520" strokeWidth="0.5" opacity="0.4" />
      <line x1="100" y1="87" x2="100" y2="143" stroke="#DAA520" strokeWidth="0.5" opacity="0.4" />
      {/* Longitude curves */}
      <ellipse cx="100" cy="115" rx="14" ry="28" fill="none" stroke="#DAA520" strokeWidth="0.5" opacity="0.4" />
      <ellipse cx="100" cy="115" rx="22" ry="28" fill="none" stroke="#DAA520" strokeWidth="0.5" opacity="0.3" />
      {/* Continent hints */}
      <path d="M85 105 Q90 100 95 102 Q98 108 92 112 Q86 110 85 105Z" fill="#DAA520" opacity="0.25" />
      <path d="M105 98 Q112 96 118 100 Q120 108 115 115 Q108 112 105 105Z" fill="#DAA520" opacity="0.2" />

      {/* === Eagle head above shield === */}
      <ellipse cx="100" cy="65" rx="8" ry="7" fill="url(#emblem-gold)" />
      {/* Beak */}
      <path d="M100 70 L97 76 L103 76 Z" fill="#DAA520" />
      {/* Eye */}
      <circle cx="98" cy="64" r="1.2" fill="#1A1B3A" />
      <circle cx="102" cy="64" r="1.2" fill="#1A1B3A" />
      {/* Head crest */}
      <path d="M96 58 Q100 52 104 58" fill="none" stroke="#FFD700" strokeWidth="1" />

      {/* === Stars arc above eagle === */}
      {[...Array(5)].map((_, i) => {
        const angle = (-Math.PI / 2) + (i - 2) * 0.35;
        const cx = 100 + Math.cos(angle) * 35;
        const cy = 50 + Math.sin(angle) * 20;
        return (
          <polygon
            key={`star-${i}`}
            points={starPoints(cx, cy, 3, 1.5)}
            fill="#FFD700"
            opacity="0.8"
          />
        );
      })}

      {/* === Banner — "UNITED STATES OF AMERICA" === */}
      <path
        id="banner-path"
        d="M45 160 Q72 172 100 168 Q128 172 155 160"
        fill="none"
      />
      {/* Banner ribbon */}
      <path
        d="M42 155 Q72 170 100 165 Q128 170 158 155 L158 165 Q128 180 100 175 Q72 180 42 165 Z"
        fill="url(#emblem-gold)"
        opacity="0.85"
      />
      <text
        fill="#1A1B3A"
        fontSize="7"
        fontWeight="700"
        letterSpacing="0.5"
        textAnchor="middle"
      >
        <textPath href="#banner-path" startOffset="50%">
          UNITED STATES OF AMERICA
        </textPath>
      </text>

      {/* === Shield stripes (American flag nod) === */}
      {[0, 1, 2].map((i) => (
        <line
          key={`stripe-${i}`}
          x1="75"
          y1={140 + i * 5}
          x2="125"
          y2={140 + i * 5}
          stroke="#DAA520"
          strokeWidth="1"
          opacity={0.2 + i * 0.1}
        />
      ))}

      {/* === Olive branches at bottom === */}
      {/* Left branch */}
      <path d="M70 155 Q80 165 85 160" fill="none" stroke="#DAA520" strokeWidth="1" opacity="0.6" />
      <ellipse cx="75" cy="158" rx="3" ry="1.5" fill="#DAA520" opacity="0.3" transform="rotate(-30 75 158)" />
      <ellipse cx="80" cy="162" rx="3" ry="1.5" fill="#DAA520" opacity="0.3" transform="rotate(-20 80 162)" />
      {/* Right branch */}
      <path d="M130 155 Q120 165 115 160" fill="none" stroke="#DAA520" strokeWidth="1" opacity="0.6" />
      <ellipse cx="125" cy="158" rx="3" ry="1.5" fill="#DAA520" opacity="0.3" transform="rotate(30 125 158)" />
      <ellipse cx="120" cy="162" rx="3" ry="1.5" fill="#DAA520" opacity="0.3" transform="rotate(20 120 162)" />
    </svg>
  );
}

/** Generate star polygon points string */
function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}
