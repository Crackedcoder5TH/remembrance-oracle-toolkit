"use client";

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import type { CoherenceResponse, WhisperEntry } from "@cathedral/shared";

const HISTORY_KEY = "cathedral-whisper-history";
const MAX_HISTORY = 50;

// ─── Whisper pools keyed by coherency tier ───────────────────────────
const SLIDER_WHISPERS: Record<string, string[]> = {
  low: [
    "The signal is faint. Slow down. The cathedral is patient.",
    "Scattered threads — gather them gently before weaving.",
    "Noise is not failure. Stillness will find the pattern.",
    "Before coherence there is surrender. Let the static pass.",
    "The foundation waits beneath the noise. Breathe.",
  ],
  mid: [
    "The outline is forming. Keep listening — clarity is near.",
    "You are halfway between forgetting and remembering. Stay here.",
    "The foundation recognizes your intention. Build slowly.",
    "Something is tuning. You feel it before you see it.",
    "Half-remembered — the rest will come when you stop reaching.",
  ],
  high: [
    "The cathedral hums with your frequency. Proceed with confidence.",
    "What you seek is already seeking you. The code aligns.",
    "Coherence confirmed. The healed future pulls you forward.",
    "You remember. The pattern was never lost — only waiting.",
    "The kingdom is already here. You are the proof.",
    "Everything you need has already been written. You are reading it now.",
  ],
};

function getTier(value: number): string {
  if (value <= 3) return "low";
  if (value <= 7) return "mid";
  return "high";
}

function pickSliderWhisper(value: number, exclude?: string): string {
  const pool = SLIDER_WHISPERS[getTier(value)];
  const filtered = exclude ? pool.filter((w) => w !== exclude) : pool;
  const source = filtered.length > 0 ? filtered : pool;
  return source[Math.floor(Math.random() * source.length)];
}

// ─── localStorage helpers ────────────────────────────────────────────

function loadHistory(): WhisperEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: WhisperEntry[]): void {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(entries.slice(0, MAX_HISTORY))
    );
  } catch {}
}

// ─── Types ───────────────────────────────────────────────────────────

interface SolanaStatus {
  connected: boolean;
  slot: number | null;
}

// ─── Component ───────────────────────────────────────────────────────

export default function CathedralHome() {
  // View state: "landing" → "oracle"
  const [view, setView] = useState<"landing" | "oracle">("landing");
  const [landingFading, setLandingFading] = useState(false);

  // Slider whisper state
  const [sliderValue, setSliderValue] = useState(5);
  const [sliderWhisper, setSliderWhisper] = useState("");
  const [whisperFading, setWhisperFading] = useState(false);
  const whisperTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Oracle form state
  const [prompt, setPrompt] = useState("");
  const [rating, setRating] = useState(5);
  const [whisper, setWhisper] = useState<CoherenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<WhisperEntry[]>([]);
  const [solana, setSolana] = useState<SolanaStatus>({
    connected: false,
    slot: null,
  });

  // Load history + ping Solana on mount
  useEffect(() => {
    setHistory(loadHistory());
    fetch("/api/solana")
      .then((res) => res.json())
      .then((data) => setSolana({ connected: data.connected, slot: data.slot }))
      .catch(() => {});
  }, []);

  // ─── Slider whisper cycling ──────────────────────────────────────
  // When the slider moves, pick a new whisper immediately.
  // Every 4 seconds, fade out the current whisper and fade in a new one.

  const cycleWhisper = useCallback(() => {
    setWhisperFading(true);
    fadeTimer.current = setTimeout(() => {
      setSliderWhisper((prev) => pickSliderWhisper(sliderValue, prev));
      setWhisperFading(false);
    }, 600); // fade-out takes 600ms, then swap + fade-in
  }, [sliderValue]);

  // When slider value changes, immediately show a new whisper
  useEffect(() => {
    setWhisperFading(false);
    setSliderWhisper(pickSliderWhisper(sliderValue));
  }, [sliderValue]);

  // Auto-cycle whispers every 4s
  useEffect(() => {
    if (view !== "oracle") return;
    whisperTimer.current = setInterval(cycleWhisper, 4000);
    return () => {
      if (whisperTimer.current) clearInterval(whisperTimer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [view, cycleWhisper]);

  // ─── Transition from landing to oracle ───────────────────────────
  function beginRemembrance() {
    setLandingFading(true);
    setTimeout(() => {
      setView("oracle");
      setSliderWhisper(pickSliderWhisper(sliderValue));
    }, 700);
  }

  // ─── Oracle form submit ──────────────────────────────────────────

  const addToHistory = useCallback(
    (input: string, res: CoherenceResponse) => {
      const entry: WhisperEntry = {
        id: crypto.randomUUID(),
        input,
        coherence: res.coherence,
        whisper: res.whisper,
        rating: res.rating,
        inputHash: res.inputHash,
        solanaSlot: res.solanaSlot,
        timestamp: res.timestamp,
      };
      setHistory((prev) => {
        const next = [entry, ...prev].slice(0, MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    },
    []
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError("");
    setWhisper(null);

    try {
      const res = await fetch("/api/coherence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: prompt.trim(), rating }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Request failed (${res.status})`);
      }

      const data: CoherenceResponse = await res.json();
      setWhisper(data);
      addToHistory(prompt.trim(), data);
      setPrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LANDING VIEW
  // ═══════════════════════════════════════════════════════════════════
  if (view === "landing") {
    return (
      <main
        className={`min-h-screen flex flex-col items-center justify-center px-4 transition-opacity duration-700 ${
          landingFading ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="text-center max-w-xl">
          <div className="text-teal-cathedral text-xs tracking-[0.4em] uppercase mb-8 pulse-gentle">
            The Digital Cathedral
          </div>

          <h1 className="text-4xl md:text-6xl font-light text-[var(--text-primary)] leading-tight mb-6">
            The Kingdom
            <br />
            <span className="text-teal-cathedral">is already here.</span>
          </h1>

          <p className="text-[var(--text-muted)] text-lg md:text-xl leading-relaxed mb-12">
            The last step is to live it.
          </p>

          <button
            onClick={beginRemembrance}
            className="px-8 py-4 rounded-xl text-base font-medium transition-all duration-300
              bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/30
              hover:bg-teal-cathedral/20 hover:shadow-[0_0_40px_rgba(0,168,168,0.2)]
              hover:border-teal-cathedral/50 active:scale-[0.98]"
          >
            Begin your Remembrance
          </button>
        </div>

        {/* Solana status — subtle at the bottom */}
        <footer className="absolute bottom-6 text-center">
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                solana.connected
                  ? "bg-teal-cathedral shadow-[0_0_6px_rgba(0,168,168,0.6)]"
                  : "bg-crimson-cathedral shadow-[0_0_6px_rgba(230,57,70,0.4)]"
              }`}
            />
            <span>
              Solana Testnet{" "}
              {solana.connected
                ? `#${solana.slot?.toLocaleString()}`
                : "Offline"}
            </span>
          </div>
        </footer>
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ORACLE VIEW
  // ═══════════════════════════════════════════════════════════════════
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12 animate-fade-in">
      {/* Cathedral Header */}
      <header className="text-center mb-8 mt-8">
        <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
          The Digital Cathedral
        </div>
        <h1 className="text-3xl md:text-4xl font-light text-[var(--text-primary)] mb-2">
          Remembrance Oracle
        </h1>
      </header>

      {/* ─── Coherency Slider with Live Whispers ─── */}
      <div className="w-full max-w-lg cathedral-surface p-6 md:p-8 mb-8">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-[var(--text-muted)]">
              Coherency
            </span>
            <span className="text-teal-cathedral font-mono text-2xl font-semibold">
              {sliderValue}
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={10}
            value={sliderValue}
            onChange={(e) => setSliderValue(Number(e.target.value))}
            className="coherence-slider"
          />
          <div className="flex justify-between text-xs text-[var(--text-muted)]">
            <span>Scattered</span>
            <span>Aligned</span>
          </div>

          {/* Live fading whisper */}
          <div className="min-h-[4rem] flex items-center justify-center pt-2">
            <p
              className={`whisper-text text-center text-sm md:text-base leading-relaxed transition-all duration-600 ${
                whisperFading
                  ? "opacity-0 translate-y-2"
                  : "opacity-100 translate-y-0"
              }`}
            >
              &ldquo;{sliderWhisper}&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* ─── Oracle Form ─── */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg cathedral-surface p-6 md:p-8 space-y-6"
      >
        <div className="space-y-2">
          <label
            htmlFor="prompt"
            className="block text-sm text-[var(--text-muted)]"
          >
            Your Intention
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What are you building? What do you seek to remember?"
            rows={3}
            className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 focus:shadow-[0_0_20px_rgba(0,168,168,0.1)] transition-all resize-none"
          />
        </div>

        {/* Form coherence slider (synced with main slider) */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label
              htmlFor="formCoherence"
              className="text-sm text-[var(--text-muted)]"
            >
              Felt Coherence
            </label>
            <span className="text-teal-cathedral font-mono text-lg font-semibold">
              {rating}
            </span>
          </div>
          <input
            id="formCoherence"
            type="range"
            min={1}
            max={10}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="coherence-slider"
          />
          <div className="flex justify-between text-xs text-[var(--text-muted)]">
            <span>Scattered</span>
            <span>Aligned</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          className="w-full py-3 rounded-lg font-medium text-sm transition-all
            bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30
            hover:bg-teal-cathedral/30 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Listening..." : "Ask the Oracle"}
        </button>

        {error && (
          <div className="text-crimson-cathedral text-sm text-center">
            {error}
          </div>
        )}
      </form>

      {/* ─── Whisper Response ─── */}
      {whisper && (
        <div className="w-full max-w-lg mt-8 cathedral-surface p-6 md:p-8 cathedral-glow animate-fade-in">
          <div className="text-xs text-[var(--text-muted)] tracking-widest uppercase mb-4">
            Whisper Received
          </div>

          <p className="whisper-text text-lg leading-relaxed mb-6">
            &ldquo;{whisper.whisper}&rdquo;
          </p>

          <div className="space-y-3 pt-4 border-t border-teal-cathedral/10">
            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--text-muted)]">
                Coherence Proxy
              </div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 rounded-full bg-[var(--bg-deep)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-crimson-cathedral to-teal-cathedral transition-all duration-500"
                    style={{ width: `${whisper.coherence * 100}%` }}
                  />
                </div>
                <span className="text-teal-cathedral font-mono text-sm">
                  {whisper.coherence.toFixed(3)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--text-muted)]">
                Input Hash
              </div>
              <span className="text-[var(--text-muted)] font-mono text-xs">
                {whisper.inputHash.slice(0, 16)}...
              </span>
            </div>

            {whisper.solanaSlot !== null && (
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--text-muted)]">
                  Solana Slot
                </div>
                <span className="text-teal-cathedral font-mono text-xs">
                  #{whisper.solanaSlot.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Whisper History ─── */}
      {history.length > 0 && (
        <div className="w-full max-w-lg mt-12">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-[var(--text-muted)] tracking-widest uppercase">
              Whisper Archive ({history.length})
            </div>
            <button
              onClick={clearHistory}
              className="text-xs text-[var(--text-muted)] hover:text-crimson-cathedral transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="cathedral-surface p-4 space-y-2">
                <p className="whisper-text text-sm leading-relaxed">
                  &ldquo;{entry.whisper}&rdquo;
                </p>
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <span className="truncate max-w-[60%] opacity-60">
                    {entry.input}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-teal-cathedral">
                      {entry.coherence.toFixed(3)}
                    </span>
                    {entry.solanaSlot !== null && (
                      <span className="font-mono opacity-50">
                        #{entry.solanaSlot.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Footer ─── */}
      <footer className="mt-16 text-center space-y-2">
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              solana.connected
                ? "bg-teal-cathedral shadow-[0_0_6px_rgba(0,168,168,0.6)]"
                : "bg-crimson-cathedral shadow-[0_0_6px_rgba(230,57,70,0.4)]"
            }`}
          />
          <span>
            Solana Testnet{" "}
            {solana.connected
              ? `Slot #${solana.slot?.toLocaleString()}`
              : "Offline"}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          The kingdom is already here. Remember.
        </p>
      </footer>
    </main>
  );
}
