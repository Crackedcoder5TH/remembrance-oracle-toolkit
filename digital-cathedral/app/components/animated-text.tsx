"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedText — reveals paragraphs word-by-word with a fun pop-in bounce
 * when the element scrolls into view. Words are fully visible by default
 * and only animate if JS + IntersectionObserver are available.
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
  const [ready, setReady] = useState(false);   // JS loaded, hide words
  const [visible, setVisible] = useState(false); // scrolled into view, animate in

  // Phase 1: mark ready so we can hide words (only after JS hydrates)
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
    <div ref={containerRef} className={className} aria-label={text}>
      {paragraphs.map((para, pi) => {
        const words = para.split(" ");
        const spans = words.map((word, wi) => {
          const idx = wordIndex++;
          // Before JS hydrates: words are fully visible (no animation)
          // After ready but before visible: words hidden, waiting for scroll
          // After visible: words animate in with staggered delay
          const shouldHide = ready && !visible;
          const shouldAnimate = ready && visible;
          return (
            <span
              key={`${pi}-${wi}`}
              aria-hidden="true"
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
                  ? `opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)`
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
  );
}
