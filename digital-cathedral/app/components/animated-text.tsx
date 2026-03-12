"use client";

import { useEffect, useRef, useState } from "react";

/**
 * AnimatedText — reveals text letter-by-letter with a staggered fade-in
 * when the element scrolls into view. Each letter rises up and fades in
 * with a slight delay, creating a typewriter-like wave effect.
 */
export function AnimatedText({
  text,
  className = "",
  letterDelay = 18,
  animationDuration = 400,
}: {
  text: string;
  className?: string;
  letterDelay?: number;
  animationDuration?: number;
}) {
  const containerRef = useRef<HTMLParagraphElement>(null);
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
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <p ref={containerRef} className={className} aria-label={text}>
      {text.split("").map((char, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            display: "inline-block",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(8px)",
            transition: `opacity ${animationDuration}ms ease, transform ${animationDuration}ms ease`,
            transitionDelay: visible ? `${i * letterDelay}ms` : "0ms",
            whiteSpace: char === " " ? "pre" : undefined,
          }}
        >
          {char}
        </span>
      ))}
    </p>
  );
}
