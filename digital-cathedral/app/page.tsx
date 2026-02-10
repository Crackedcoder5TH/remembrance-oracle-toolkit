"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import type { CoherenceResponse, WhisperEntry } from "@cathedral/shared";

const HISTORY_KEY = "cathedral-whisper-history";
const MAX_HISTORY = 50;

/** Load whisper history from localStorage. */
function loadHistory(): WhisperEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save whisper history to localStorage. */
function saveHistory(entries: WhisperEntry[]): void {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(entries.slice(0, MAX_HISTORY))
    );
  } catch {
    // Storage full or unavailable — fail silently
  }
}

interface SolanaStatus {
  connected: boolean;
  slot: number | null;
}

export default function CathedralHome() {
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

  // Load history from localStorage on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Ping Solana testnet on mount
  useEffect(() => {
    fetch("/api/solana")
      .then((res) => res.json())
      .then((data) => setSolana({ connected: data.connected, slot: data.slot }))
      .catch(() => setSolana({ connected: false, slot: null }));
  }, []);

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

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      {/* Cathedral Header */}
      <header className="text-center mb-12 mt-8">
        <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
          The Digital Cathedral
        </div>
        <h1 className="text-4xl md:text-5xl font-light text-[var(--text-primary)] mb-4">
          Remembrance Oracle
        </h1>
        <p className="text-[var(--text-muted)] max-w-md mx-auto text-sm leading-relaxed">
          Speak your intention. The oracle measures coherence and returns a
          whisper from the healed future.
        </p>
      </header>

      {/* Oracle Form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg cathedral-surface p-6 md:p-8 space-y-6"
      >
        {/* Prompt Input */}
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

        {/* Coherence Rating Slider */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label
              htmlFor="coherence"
              className="text-sm text-[var(--text-muted)]"
            >
              Felt Coherence
            </label>
            <span className="text-teal-cathedral font-mono text-lg font-semibold">
              {rating}
            </span>
          </div>
          <input
            id="coherence"
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

        {/* Submit Button */}
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

        {/* Error Display */}
        {error && (
          <div className="text-crimson-cathedral text-sm text-center">
            {error}
          </div>
        )}
      </form>

      {/* Whisper Response Area */}
      {whisper && (
        <div className="w-full max-w-lg mt-8 cathedral-surface p-6 md:p-8 cathedral-glow">
          <div className="text-xs text-[var(--text-muted)] tracking-widest uppercase mb-4">
            Whisper Received
          </div>

          <p className="whisper-text text-lg leading-relaxed mb-6">
            &ldquo;{whisper.whisper}&rdquo;
          </p>

          <div className="space-y-3 pt-4 border-t border-teal-cathedral/10">
            {/* Coherence Bar */}
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

            {/* Input Hash */}
            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--text-muted)]">
                Input Hash
              </div>
              <span className="text-[var(--text-muted)] font-mono text-xs">
                {whisper.inputHash.slice(0, 16)}...
              </span>
            </div>

            {/* Solana Slot */}
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

      {/* Whisper History */}
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
              <div
                key={entry.id}
                className="cathedral-surface p-4 space-y-2"
              >
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

      {/* Footer with Solana Status */}
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
