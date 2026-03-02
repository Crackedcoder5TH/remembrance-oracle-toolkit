"use client";

/**
 * Bouncing Emblem Background — Screensaver Style
 *
 * Renders the patriotic emblem as a background element that
 * bounces off the viewport edges like a classic DVD screensaver.
 * Uses requestAnimationFrame for smooth 60fps motion.
 */

import { useEffect, useRef } from "react";
import { PatrioticEmblem } from "./patriotic-emblem";

const EMBLEM_SIZE = 120;
const SPEED = 0.7; // pixels per frame (~42px/sec at 60fps)

export function BouncingEmblemBg() {
  const containerRef = useRef<HTMLDivElement>(null);
  const emblemRef = useRef<HTMLDivElement>(null);
  const state = useRef({
    x: 80,
    y: 60,
    dx: SPEED,
    dy: SPEED * 0.75,
  });

  useEffect(() => {
    const container = containerRef.current;
    const emblem = emblemRef.current;
    if (!container || !emblem) return;

    let rafId: number;

    function animate() {
      const s = state.current;
      const maxX = window.innerWidth - EMBLEM_SIZE;
      const maxY = window.innerHeight - EMBLEM_SIZE;

      // Update position
      s.x += s.dx;
      s.y += s.dy;

      // Bounce off edges
      if (s.x <= 0) {
        s.x = 0;
        s.dx = Math.abs(s.dx);
      } else if (s.x >= maxX) {
        s.x = maxX;
        s.dx = -Math.abs(s.dx);
      }

      if (s.y <= 0) {
        s.y = 0;
        s.dy = Math.abs(s.dy);
      } else if (s.y >= maxY) {
        s.y = maxY;
        s.dy = -Math.abs(s.dy);
      }

      // Apply transform (GPU-accelerated)
      if (emblem) {
        emblem.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
      }

      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <div
        ref={emblemRef}
        className="absolute top-0 left-0"
        style={{ width: EMBLEM_SIZE, height: EMBLEM_SIZE, willChange: "transform" }}
      >
        <PatrioticEmblem size={EMBLEM_SIZE} className="opacity-[0.12] drop-shadow-[0_0_12px_rgba(218,165,32,0.15)]" />
      </div>
    </div>
  );
}
