"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedText — reveals paragraphs word-by-word with a subtle slide-up
 * when the element scrolls into view. Gold shimmer comes from the parent
 * CSS class (e.g. metallic-gold). Words are ALWAYS fully opaque.
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
      { threshold: 0.1 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const paragraphs = text.split("\n").filter(Boolean);
  let wordIndex = 0;

  return (
    <div ref={containerRef} className={className} aria-label={text}>
      {paragraphs.map((para, pi) => {
        const words = para.split(" ");
        const spans = words.map((word, wi) => {
          const idx = wordIndex++;
          return (
            <span
              key={`${pi}-${wi}`}
              aria-hidden="true"
              style={{
                display: "inline-block",
                marginRight: "0.3em",
                transform: visible ? "translateY(0)" : "translateY(8px)",
                transition: visible
                  ? `transform 350ms ease-out ${idx * wordDelay}ms`
                  : "none",
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
  );
}
