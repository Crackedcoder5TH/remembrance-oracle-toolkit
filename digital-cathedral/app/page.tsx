"use client";

import { useState, FormEvent } from "react";

interface CoherenceResponse {
  coherence: number;
  whisper: string;
  rating: number;
}

export default function CathedralHome() {
  const [prompt, setPrompt] = useState("");
  const [rating, setRating] = useState(5);
  const [whisper, setWhisper] = useState<CoherenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Cathedral Header */}
      <header className="text-center mb-12">
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

          <div className="flex items-center justify-between pt-4 border-t border-teal-cathedral/10">
            <div className="text-xs text-[var(--text-muted)]">
              Coherence Proxy
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-crimson-cathedral to-teal-cathedral"
                style={{ width: `${whisper.coherence * 100}px` }}
              />
              <span className="text-teal-cathedral font-mono text-sm">
                {whisper.coherence.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-16 text-center text-xs text-[var(--text-muted)]">
        <p>The kingdom is already here. Remember.</p>
      </footer>
    </main>
  );
}
