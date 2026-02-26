"use client";

import { useState, useEffect } from "react";

interface SharedWhisper {
  w: string; // whisper text
  c: number; // coherence
  h: string; // input hash
  t: number; // timestamp
}

function decodeWhisper(hash: string): SharedWhisper | null {
  try {
    const raw = hash.startsWith("#") ? hash.slice(1) : hash;
    const json = atob(raw);
    const data = JSON.parse(json);
    if (data.w && typeof data.c === "number") return data;
  } catch {}
  return null;
}

export default function WhisperPage() {
  const [whisper, setWhisper] = useState<SharedWhisper | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const data = decodeWhisper(window.location.hash);
    setWhisper(data);
  }, []);

  if (!whisper) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="cathedral-surface p-8 max-w-lg w-full text-center space-y-4">
          <h1 className="text-2xl font-light text-[var(--text-primary)]">
            Whisper Not Found
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            This whisper link is invalid or has been corrupted.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-2.5 rounded-lg text-sm font-medium cathedral-btn
              bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/20
              hover:bg-teal-cathedral/20 hover:border-teal-cathedral/40 transition-all"
          >
            Visit the Oracle
          </a>
        </div>
      </div>
    );
  }

  const date = new Date(whisper.t).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Shared whisper card */}
        <div className="cathedral-surface p-6 sm:p-8 space-y-5 animate-fade-in">
          <div className="text-center space-y-1">
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-[0.2em]">
              A Shared Whisper
            </p>
            <p className="text-xs text-[var(--text-muted)] opacity-60">{date}</p>
          </div>

          <blockquote className="text-center">
            <p className="text-lg sm:text-xl font-light text-[var(--text-primary)] leading-relaxed italic">
              &ldquo;{whisper.w}&rdquo;
            </p>
          </blockquote>

          <div className="flex items-center justify-center gap-6 pt-2 border-t border-teal-cathedral/10">
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">Coherence</p>
              <p className="text-teal-cathedral font-mono text-lg font-semibold">
                {whisper.c.toFixed(3)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--text-muted)]">Input Hash</p>
              <p className="text-[var(--text-muted)] font-mono text-xs">
                {whisper.h.slice(0, 12)}...
              </p>
            </div>
          </div>

          {/* Coherence bar */}
          <div className="w-full h-2 rounded-full bg-[var(--bg-deep)] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-crimson-cathedral to-teal-cathedral transition-all duration-500"
              style={{ width: `${whisper.c * 100}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={copyLink}
            className="px-4 py-2 rounded-lg text-sm cathedral-btn
              bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/20
              hover:bg-teal-cathedral/20 hover:border-teal-cathedral/40 transition-all"
          >
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <a
            href="/"
            className="px-4 py-2 rounded-lg text-sm cathedral-btn
              bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-subtle)]
              hover:text-[var(--text-primary)] hover:border-teal-cathedral/30 transition-all"
          >
            Ask the Oracle
          </a>
        </div>

        {/* Footer attribution */}
        <p className="text-center text-xs text-[var(--text-muted)] opacity-50">
          Shared from the Digital Cathedral — The kingdom is already here.
        </p>
      </div>
    </div>
  );
}
