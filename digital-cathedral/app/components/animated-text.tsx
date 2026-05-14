"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedText — reveals paragraphs word-by-word with a fun pop-in bounce
 * and subtle gold shimmer on key words when the element scrolls into view.
 * Words are fully visible by default (SSR/no-JS safe).
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
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  // Phase 1: mark ready after hydration
  useEffect(() => {
    setReady(true);
  }, []);

  // Phase 2: observe scroll into view
  useEffect(() => {
    if (!ready) return;
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
  }, [ready]);

  const paragraphs = text.split("\n").filter(Boolean);
  let wordIndex = 0;

  return (
    <>
      <style>{`
        @keyframes gold-shimmer {
          0%, 100% { color: inherit; }
          50% { color: #d4a843; text-shadow: 0 0 8px rgba(212, 168, 67, 0.3); }
        }
        .word-shimmer-active {
          animation: gold-shimmer 2s ease-in-out 1;
        }
      `}</style>
      <div ref={containerRef} className={className} aria-label={text}>
        {paragraphs.map((para, pi) => {
          const words = para.split(" ");
          const spans = words.map((word, wi) => {
            const idx = wordIndex++;
            const shouldHide = ready && !visible;
            const shouldAnimate = ready && visible;
            const isHighlight = /^(veteran|responsibility|families|protect|mission|love|service|guidance|country)$/i.test(
              word.replace(/[.,!?…—]$/, ""),
            );
            return (
              <span
                key={`${pi}-${wi}`}
                aria-hidden="true"
                className={shouldAnimate && isHighlight ? "word-shimmer-active" : ""}
                style={{
                  display: "inline-block",
                  marginRight: "0.3em",
                  opacity: shouldHide ? 0 : 1,
                  transform: shouldAnimate
                    ? "translateY(0) scale(1)"
                    : shouldHide
                      ? "translateY(10px) scale(0.85)"
                      : "none",
                  transition: shouldAnimate
                    ? "opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)"
                    : "none",
                  transitionDelay: shouldAnimate ? `${idx * wordDelay}ms` : "0ms",
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
