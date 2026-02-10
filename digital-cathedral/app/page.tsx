"use client";

import { useState, useEffect, useCallback, useRef, FormEvent } from "react";
import type { CoherenceResponse, WhisperEntry } from "@cathedral/shared";

const HISTORY_KEY = "cathedral-whisper-history";
const MAX_HISTORY = 50;

// ─── Oracle-evolved debounce (from pattern 18739e9924b6f3c1, coherency 0.970)
function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return function (this: unknown, ...args: Parameters<T>) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

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

// ─── Skeleton Loader ─────────────────────────────────────────────────

function SkeletonLine({ width = "100%" }: { width?: string }) {
  return (
    <div
      className="h-3 rounded-md skeleton-shimmer"
      style={{ width }}
    />
  );
}

function SkeletonCard() {
  return (
    <div className="cathedral-surface p-4 sm:p-6 space-y-4 animate-pulse">
      <SkeletonLine width="40%" />
      <SkeletonLine />
      <SkeletonLine width="75%" />
      <div className="flex justify-between pt-2">
        <SkeletonLine width="30%" />
        <SkeletonLine width="20%" />
      </div>
    </div>
  );
}

function WhisperSkeleton() {
  return (
    <div className="w-full max-w-lg mt-6 cathedral-surface p-4 sm:p-6 md:p-8 space-y-4 animate-pulse">
      <SkeletonLine width="35%" />
      <div className="space-y-2 py-2">
        <SkeletonLine />
        <SkeletonLine width="85%" />
      </div>
      <div className="space-y-3 pt-4 border-t border-teal-cathedral/10">
        <div className="flex justify-between">
          <SkeletonLine width="25%" />
          <SkeletonLine width="30%" />
        </div>
        <div className="flex justify-between">
          <SkeletonLine width="20%" />
          <SkeletonLine width="25%" />
        </div>
      </div>
    </div>
  );
}

// ─── Constants ───────────────────────────────────────────────────────

const ARCHIVE_PAGE_SIZE = 10;

// ─── Types ───────────────────────────────────────────────────────────

interface SolanaStatus {
  connected: boolean;
  slot: number | null;
}

type Section = "oracle" | "archive";

// ─── Navbar ──────────────────────────────────────────────────────────

function Navbar({
  section,
  onNavigate,
  searchQuery,
  onSearch,
  historyCount,
}: {
  section: Section;
  onNavigate: (s: Section) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  historyCount: number;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { id: Section; label: string; count?: number }[] = [
    { id: "oracle", label: "Oracle" },
    { id: "archive", label: "Archive", count: historyCount },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full cathedral-nav">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo / Home */}
        <button
          onClick={() => onNavigate("oracle")}
          className="text-teal-cathedral text-sm tracking-[0.2em] uppercase font-medium shrink-0"
        >
          Cathedral
        </button>

        {/* Desktop nav + search */}
        <div className="hidden md:flex items-center gap-6 flex-1 justify-end">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`text-sm transition-colors ${
                section === item.id
                  ? "text-teal-cathedral"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.label}
              {item.count ? (
                <span className="ml-1.5 text-xs opacity-50">
                  {item.count}
                </span>
              ) : null}
            </button>
          ))}

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search whispers..."
              className="w-48 bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-teal-cathedral/50 focus:w-64 transition-all"
            />
          </div>
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden text-[var(--text-muted)] hover:text-teal-cathedral transition-colors p-1"
          aria-label="Toggle menu"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            {mobileOpen ? (
              <path d="M5 5l10 10M15 5L5 15" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-teal-cathedral/10 px-4 py-3 space-y-3 animate-fade-in">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                onNavigate(item.id);
                setMobileOpen(false);
              }}
              className={`block w-full text-left text-sm py-1 ${
                section === item.id
                  ? "text-teal-cathedral"
                  : "text-[var(--text-muted)]"
              }`}
            >
              {item.label}
              {item.count ? (
                <span className="ml-1.5 text-xs opacity-50">{item.count}</span>
              ) : null}
            </button>
          ))}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search whispers..."
            className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-cathedral/50"
          />
        </div>
      )}
    </nav>
  );
}

// ─── Breadcrumbs ─────────────────────────────────────────────────────

function Breadcrumbs({
  section,
  onNavigate,
}: {
  section: Section;
  onNavigate: (s: Section) => void;
}) {
  const labels: Record<Section, string> = {
    oracle: "Oracle",
    archive: "Whisper Archive",
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-2">
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <button
          onClick={() => onNavigate("oracle")}
          className="hover:text-teal-cathedral transition-colors"
        >
          Home
        </button>
        <span className="opacity-40">/</span>
        <span className="text-[var(--text-primary)]">{labels[section]}</span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function CathedralHome() {
  // View state: "landing" → "oracle"
  const [view, setView] = useState<"landing" | "oracle">("landing");
  const [landingFading, setLandingFading] = useState(false);

  // Section navigation within oracle view
  const [section, setSection] = useState<Section>("oracle");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Load-more pagination for archive
  const [visibleCount, setVisibleCount] = useState(ARCHIVE_PAGE_SIZE);

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

  // Debounced search (oracle-evolved debounce, 250ms)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetQuery = useCallback(
    debounce((q: string) => setDebouncedQuery(q), 250),
    []
  );

  function handleSearch(q: string) {
    setSearchQuery(q);
    debouncedSetQuery(q);
    setVisibleCount(ARCHIVE_PAGE_SIZE);
    if (q.trim()) setSection("archive");
  }

  // Filter history by search
  const filteredHistory = debouncedQuery.trim()
    ? history.filter(
        (e) =>
          e.whisper.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
          e.input.toLowerCase().includes(debouncedQuery.toLowerCase())
      )
    : history;

  // ─── Slider whisper cycling ──────────────────────────────────────

  const cycleWhisper = useCallback(() => {
    setWhisperFading(true);
    fadeTimer.current = setTimeout(() => {
      setSliderWhisper((prev) => pickSliderWhisper(sliderValue, prev));
      setWhisperFading(false);
    }, 600);
  }, [sliderValue]);

  useEffect(() => {
    setWhisperFading(false);
    setSliderWhisper(pickSliderWhisper(sliderValue));
  }, [sliderValue]);

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
        <div className="text-center max-w-xl px-4">
          <div className="text-teal-cathedral text-xs tracking-[0.4em] uppercase mb-8 pulse-gentle">
            The Digital Cathedral
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-6xl font-light text-[var(--text-primary)] leading-tight mb-6">
            The Kingdom
            <br />
            <span className="text-teal-cathedral">is already here.</span>
          </h1>

          <p className="text-[var(--text-muted)] text-base sm:text-lg md:text-xl leading-relaxed mb-12">
            The last step is to live it.
          </p>

          <button
            onClick={beginRemembrance}
            className="px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-sm sm:text-base font-medium transition-all duration-300
              bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/30
              hover:bg-teal-cathedral/20 hover:shadow-[0_0_40px_rgba(0,168,168,0.2)]
              hover:border-teal-cathedral/50 active:scale-[0.98]"
          >
            Begin your Remembrance
          </button>
        </div>

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
  //  ORACLE VIEW (with navbar, breadcrumbs, sections)
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col animate-fade-in">
      {/* Sticky Navbar */}
      <Navbar
        section={section}
        onNavigate={setSection}
        searchQuery={searchQuery}
        onSearch={handleSearch}
        historyCount={history.length}
      />

      {/* Breadcrumbs */}
      <Breadcrumbs section={section} onNavigate={setSection} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-4 pb-12 pt-4">
        {/* ─── ORACLE SECTION ─── */}
        {section === "oracle" && (
          <>
            {/* Header */}
            <header className="text-center mb-6 mt-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-light text-[var(--text-primary)] mb-2">
                Remembrance Oracle
              </h1>
            </header>

            {/* Coherency Slider with Live Whispers */}
            <div className="w-full max-w-lg cathedral-surface p-4 sm:p-6 md:p-8 mb-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--text-muted)]">
                    Coherency
                  </span>
                  <span className="text-teal-cathedral font-mono text-xl sm:text-2xl font-semibold">
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

                <div className="min-h-[3.5rem] sm:min-h-[4rem] flex items-center justify-center pt-2">
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

            {/* Oracle Form */}
            <form
              onSubmit={handleSubmit}
              className="w-full max-w-lg cathedral-surface p-4 sm:p-6 md:p-8 space-y-5"
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
                  className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-3 sm:px-4 py-3 text-sm focus:outline-none focus:border-teal-cathedral/60 focus:shadow-[0_0_20px_rgba(0,168,168,0.1)] transition-all resize-none"
                />
              </div>

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

            {/* Skeleton Loader while processing */}
            {loading && <WhisperSkeleton />}

            {/* Whisper Response */}
            {whisper && !loading && (
              <div className="w-full max-w-lg mt-6 cathedral-surface p-4 sm:p-6 md:p-8 cathedral-glow animate-fade-in">
                <div className="text-xs text-[var(--text-muted)] tracking-widest uppercase mb-4">
                  Whisper Received
                </div>
                <p className="whisper-text text-base sm:text-lg leading-relaxed mb-6">
                  &ldquo;{whisper.whisper}&rdquo;
                </p>
                <div className="space-y-3 pt-4 border-t border-teal-cathedral/10">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-[var(--text-muted)]">
                      Coherence Proxy
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 sm:w-24 h-2 rounded-full bg-[var(--bg-deep)] overflow-hidden">
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
                      {whisper.inputHash.slice(0, 12)}...
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
          </>
        )}

        {/* ─── ARCHIVE SECTION ─── */}
        {section === "archive" && (
          <div className="w-full max-w-lg mt-2 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg sm:text-xl font-light text-[var(--text-primary)]">
                Whisper Archive
              </h2>
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-xs text-[var(--text-muted)] hover:text-crimson-cathedral transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>

            {debouncedQuery.trim() && (
              <div className="text-xs text-[var(--text-muted)] mb-3">
                {filteredHistory.length} result
                {filteredHistory.length !== 1 ? "s" : ""} for &ldquo;
                {debouncedQuery}&rdquo;
              </div>
            )}

            {filteredHistory.length === 0 ? (
              <div className="cathedral-surface p-8 text-center">
                <p className="text-[var(--text-muted)] text-sm">
                  {history.length === 0
                    ? "No whispers yet. Ask the oracle to begin."
                    : "No whispers match your search."}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {filteredHistory.slice(0, visibleCount).map((entry) => (
                    <div
                      key={entry.id}
                      className="cathedral-surface p-3 sm:p-4 space-y-2"
                    >
                      <p className="whisper-text text-sm leading-relaxed">
                        &ldquo;{entry.whisper}&rdquo;
                      </p>
                      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] gap-2">
                        <span className="truncate max-w-[55%] sm:max-w-[60%] opacity-60">
                          {entry.input}
                        </span>
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          <span className="font-mono text-teal-cathedral">
                            {entry.coherence.toFixed(3)}
                          </span>
                          {entry.solanaSlot !== null && (
                            <span className="font-mono opacity-50 hidden sm:inline">
                              #{entry.solanaSlot.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Load More */}
                {visibleCount < filteredHistory.length && (
                  <div className="flex flex-col items-center gap-2 mt-6">
                    <button
                      onClick={() =>
                        setVisibleCount((c) => c + ARCHIVE_PAGE_SIZE)
                      }
                      className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all
                        bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/20
                        hover:bg-teal-cathedral/20 hover:border-teal-cathedral/40"
                    >
                      Load More
                    </button>
                    <span className="text-xs text-[var(--text-muted)]">
                      Showing {Math.min(visibleCount, filteredHistory.length)}{" "}
                      of {filteredHistory.length}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center space-y-2">
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
    </div>
  );
}
