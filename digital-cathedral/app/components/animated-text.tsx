"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedText — reveals paragraphs word-by-word with a fun pop-in bounce
 * and subtle gold shimmer sweep when the element scrolls into view.
 * Split text into paragraphs with "\n".
 */
export function AnimatedText({
  text,
  className = "",
  wordDelay = 40,
}: {
  text: string;
  className?: string;
  wordDelay?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const paragraphs = text.split("\n").filter(Boolean);
  let wordIndex = 0;

  return (
    <>
      {/* Keyframes for the pop-in bounce and gold shimmer */}
      <style>{`
        @keyframes word-pop-in {
          0% {
            opacity: 0;
            transform: translateY(12px) scale(0.7) rotate(-2deg);
            filter: blur(4px);
          }
          50% {
            opacity: 0.8;
            transform: translateY(-3px) scale(1.05) rotate(0.5deg);
            filter: blur(0px);
          }
          75% {
            transform: translateY(1px) scale(0.98) rotate(0deg);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0deg);
            filter: blur(0px);
          }
        }
        @keyframes gold-shimmer {
          0%, 100% { color: inherit; }
          50% { color: #d4a843; text-shadow: 0 0 8px rgba(212, 168, 67, 0.3); }
        }
        .word-animated {
          display: inline-block;
          opacity: 0;
          margin-right: 0.3em;
        }
        .word-animated.visible {
          animation: word-pop-in 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .word-shimmer.visible {
          animation: word-pop-in 500ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                     gold-shimmer 2s ease-in-out 1;
        }
      `}</style>
      <div ref={containerRef} className={className} aria-label={text}>
        {paragraphs.map((para, pi) => {
          const words = para.split(" ");
          const spans = words.map((word, wi) => {
            const idx = wordIndex++;
            // Highlight key emotional words with a gold shimmer
            const isHighlight = /^(veteran|responsibility|families|protect|mission|love|service|guidance|country|families\.|platform\.)$/i.test(word.replace(/[.,!?…—]$/, ""));
            return (
              <span
                key={`${pi}-${wi}`}
                aria-hidden="true"
                className={`word-animated ${visible ? (isHighlight ? "visible word-shimmer" : "visible") : ""}`}
                style={{
                  animationDelay: visible ? `${idx * wordDelay}ms` : "0ms",
                }}
              >
                {word}
              </span>
            );
          });
          return (
            <p key={pi} className="mb-4 last:mb-0">
              {spans}
            </p>
          );
        })}
      </div>
    </>
  );
}
