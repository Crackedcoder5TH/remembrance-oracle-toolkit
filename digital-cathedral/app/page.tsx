"use client";

import { useState, useEffect, useCallback, useMemo, useRef, FormEvent } from "react";
import type { CoherenceResponse, WhisperEntry } from "@cathedral/shared";

const HISTORY_KEY = "cathedral-whisper-history";
const THEME_KEY = "cathedral-theme";
const MAX_HISTORY = 50;
const MIN_PROMPT_LENGTH = 3;

// ─── Toast Types ──────────────────────────────────────────────────────

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

type Theme = "dark" | "light" | "system";

// ─── Theme helpers ──────────────────────────────────────────────────

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function loadThemePreference(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light" || stored === "system")
      return stored;
  } catch {}
  return "system";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = theme === "system" ? getSystemTheme() : theme;
  if (resolved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

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

// ─── API helpers (guarded, abort-safe, single-flight) ────────────────

const apiRequest = globalThis.fetch?.bind(globalThis);

async function getSolanaStatus(signal?: AbortSignal): Promise<{ connected: boolean; slot: number | null }> {
  const res = await apiRequest("/api/solana", { signal });
  return res.json();
}

async function postCoherence(input: string, rating: number, signal?: AbortSignal): Promise<CoherenceResponse> {
  const res = await apiRequest("/api/coherence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, rating }),
    signal,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error || `Request failed (${res.status})`);
  }
  return res.json();
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

// ─── Oracle-evolved throttle (from pattern 0e7a39d95c5a5355, coherency 0.970)
function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      fn.apply(this, args);
    }
  };
}

// ─── Color-blind palette types ──────────────────────────────────────

type A11yPalette = "default" | "deuteranopia" | "protanopia" | "tritanopia";

const PALETTE_KEY = "cathedral-a11y-palette";

function loadPalette(): A11yPalette {
  if (typeof window === "undefined") return "default";
  try {
    const stored = localStorage.getItem(PALETTE_KEY);
    if (stored === "deuteranopia" || stored === "protanopia" || stored === "tritanopia") return stored;
  } catch {}
  return "default";
}

function applyPalette(palette: A11yPalette) {
  if (typeof document === "undefined") return;
  if (palette === "default") {
    document.documentElement.removeAttribute("data-a11y-palette");
  } else {
    document.documentElement.setAttribute("data-a11y-palette", palette);
  }
}

// ─── Voice Input Hook ───────────────────────────────────────────────

function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createRecognition> | null>(null);

  useEffect(() => {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ||
               (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  function createRecognition() {
    const SR = (window as unknown as Record<string, unknown>).SpeechRecognition ||
               (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    if (!SR) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = new (SR as any)();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    return r;
  }

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const r = createRecognition();
    if (!r) return;
    recognitionRef.current = r;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      onResult(text);
      setListening(false);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    setListening(true);
  }

  return { listening, supported, toggle };
}

// ─── Command Palette ────────────────────────────────────────────────

interface CmdItem {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: CmdItem[];
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [query, items]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="cmd-palette-overlay" onClick={onClose} role="dialog" aria-label="Command palette" aria-modal="true">
      <div className="cmd-palette-box animate-fade-in" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search commands..."
          className="cmd-palette-input"
          aria-label="Search commands"
        />
        <div className="max-h-64 overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[var(--text-muted)]">No matching commands</div>
          ) : (
            filtered.map((item, i) => (
              <div
                key={item.id}
                role="option"
                aria-selected={i === selectedIndex}
                data-selected={i === selectedIndex}
                className="cmd-palette-item"
                onClick={() => { item.action(); onClose(); }}
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="cmd-palette-item-key">{item.shortcut}</span>}
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-teal-cathedral/10 text-xs text-[var(--text-muted)] flex justify-between">
          <span>Navigate with <kbd className="font-mono">↑↓</kbd> Enter to select</span>
          <span><kbd className="font-mono">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}

// ─── Cookie Consent Banner ──────────────────────────────────────────

const CONSENT_KEY = "cathedral-cookie-consent";

function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch {}
  }, []);

  function accept() {
    try { localStorage.setItem(CONSENT_KEY, "accepted"); } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-fade-in"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="max-w-lg mx-auto cathedral-surface p-4 sm:p-5 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 border border-teal-cathedral/20">
        <p className="text-xs text-[var(--text-muted)] leading-relaxed flex-1">
          This site uses <strong className="text-[var(--text-primary)]">localStorage</strong> to
          save your whisper history and theme preference. No cookies or
          third-party trackers are used.{" "}
          <a href="/privacy" className="text-teal-cathedral hover:underline">
            Privacy Policy
          </a>
        </p>
        <button
          onClick={accept}
          className="shrink-0 px-5 py-2 rounded-lg text-xs font-medium cathedral-btn
            bg-teal-cathedral/15 text-teal-cathedral border border-teal-cathedral/30
            hover:bg-teal-cathedral/25"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ─── Back-to-Top Button ─────────────────────────────────────────────

function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = throttle(() => {
      setVisible(window.scrollY > 300);
    }, 150);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className="fixed bottom-6 right-6 z-40 p-3 rounded-full transition-all duration-300
        bg-teal-cathedral/15 text-teal-cathedral border border-teal-cathedral/25
        hover:bg-teal-cathedral/25 hover:shadow-[0_0_20px_rgba(0,168,168,0.2)]
        animate-fade-in"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}

// ─── Copy-to-Clipboard Button ───────────────────────────────────────

function CopyButton({
  text,
  label = "Copy",
  onToast,
}: {
  text: string;
  label?: string;
  onToast?: (msg: string, type: ToastType) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onToast?.("Copied to clipboard", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast?.("Failed to copy", "error");
    }
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-all cathedral-btn
        text-[var(--text-muted)] hover:text-teal-cathedral hover:bg-teal-cathedral/10"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

// ─── Share Buttons ──────────────────────────────────────────────────

function ShareButtons({
  whisperText,
  coherence,
  onToast,
}: {
  whisperText: string;
  coherence: number;
  onToast?: (msg: string, type: ToastType) => void;
}) {
  const shareText = `"${whisperText}" — Coherence ${coherence.toFixed(3)} | Digital Cathedral`;

  function shareOnX() {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onToast?.("Opened share dialog", "info");
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={shareOnX}
        aria-label="Share on X"
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-all cathedral-btn
          text-[var(--text-muted)] hover:text-teal-cathedral hover:bg-teal-cathedral/10"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        <span>Share</span>
      </button>
      <CopyButton text={whisperText} label="Copy whisper" onToast={onToast} />
    </div>
  );
}

// ─── Toast Container ─────────────────────────────────────────────────

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}${toast.exiting ? " toast-exiting" : ""}`}
          role="status"
        >
          {toast.type === "success" && (
            <span aria-hidden="true" className="mr-1.5">&#10003;</span>
          )}
          {toast.type === "error" && (
            <span aria-hidden="true" className="mr-1.5">&#10007;</span>
          )}
          {toast.message}
        </div>
      ))}
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

function ThemeIcon({ theme }: { theme: Theme }) {
  if (theme === "light") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    );
  }
  if (theme === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  // system
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function Navbar({
  section,
  onNavigate,
  searchQuery,
  onSearch,
  historyCount,
  theme,
  onThemeToggle,
  palette,
  onPaletteToggle,
  onCmdOpen,
}: {
  section: Section;
  onNavigate: (s: Section) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  historyCount: number;
  theme: Theme;
  onThemeToggle: () => void;
  palette: A11yPalette;
  onPaletteToggle: () => void;
  onCmdOpen: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: { id: Section; label: string; count?: number }[] = [
    { id: "oracle", label: "Oracle" },
    { id: "archive", label: "Archive", count: historyCount },
  ];

  const themeLabel =
    theme === "dark" ? "Dark mode" : theme === "light" ? "Light mode" : "System theme";

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mobileOpen]);

  return (
    <nav className="sticky top-0 z-50 w-full cathedral-nav" role="navigation" aria-label="Main navigation">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo / Home */}
        <button
          onClick={() => onNavigate("oracle")}
          className="text-teal-cathedral text-sm tracking-[0.2em] uppercase font-medium shrink-0"
          aria-label="Cathedral home"
        >
          Cathedral
        </button>

        {/* Desktop nav + search + theme toggle */}
        <div className="hidden md:flex items-center gap-6 flex-1 justify-end">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={section === item.id ? "page" : undefined}
              className={`text-sm transition-colors ${
                section === item.id
                  ? "text-teal-cathedral"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.label}
              {item.count ? (
                <span className="ml-1.5 text-xs opacity-50" aria-label={`${item.count} entries`}>
                  {item.count}
                </span>
              ) : null}
            </button>
          ))}

          {/* Search */}
          <div className="relative">
            <label htmlFor="nav-search" className="sr-only">Search whispers</label>
            <input
              id="nav-search"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search whispers..."
              className="w-48 bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-3 py-1.5 text-xs focus:border-teal-cathedral/50 focus:w-64 transition-all"
            />
          </div>

          {/* Theme toggle */}
          <button
            onClick={onThemeToggle}
            aria-label={`Switch theme. Currently: ${themeLabel}`}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-teal-cathedral hover:bg-teal-cathedral/10 transition-all"
          >
            <ThemeIcon theme={theme} />
          </button>

          {/* Color-blind palette toggle */}
          <button
            onClick={onPaletteToggle}
            aria-label={`Color palette: ${palette === "default" ? "Standard" : palette}`}
            title={`Palette: ${palette}`}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-teal-cathedral hover:bg-teal-cathedral/10 transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="8" r="2" fill={palette !== "default" ? "currentColor" : "none"} />
              <circle cx="8" cy="14" r="2" fill={palette !== "default" ? "currentColor" : "none"} />
              <circle cx="16" cy="14" r="2" fill={palette !== "default" ? "currentColor" : "none"} />
            </svg>
          </button>

          {/* Command palette trigger */}
          <button
            onClick={onCmdOpen}
            aria-label="Open command palette"
            className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-[var(--text-muted)] border border-teal-cathedral/15 hover:border-teal-cathedral/30 hover:text-teal-cathedral transition-all"
          >
            <kbd className="font-mono text-[0.65rem]">⌘K</kbd>
          </button>
        </div>

        {/* Mobile: theme toggle + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={onThemeToggle}
            aria-label={`Switch theme. Currently: ${themeLabel}`}
            className="p-2 rounded-lg text-[var(--text-muted)] hover:text-teal-cathedral transition-colors"
          >
            <ThemeIcon theme={theme} />
          </button>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-[var(--text-muted)] hover:text-teal-cathedral transition-colors p-1"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              {mobileOpen ? (
                <path d="M5 5l10 10M15 5L5 15" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-teal-cathedral/10 px-4 py-3 space-y-3 animate-fade-in" role="menu">
          {navItems.map((item) => (
            <button
              key={item.id}
              role="menuitem"
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
          <label htmlFor="nav-search-mobile" className="sr-only">Search whispers</label>
          <input
            id="nav-search-mobile"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search whispers..."
            className="w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-teal-cathedral/20 rounded-lg px-3 py-2 text-sm focus:border-teal-cathedral/50"
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
    <nav className="w-full max-w-4xl mx-auto px-4 py-2" aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]" role="list">
        <li>
          <button
            onClick={() => onNavigate("oracle")}
            className="cathedral-link"
          >
            Home
          </button>
        </li>
        <li aria-hidden="true"><span className="opacity-40">/</span></li>
        <li aria-current="page">
          <span className="text-[var(--text-primary)]">{labels[section]}</span>
        </li>
      </ol>
    </nav>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export default function CathedralHome() {
  // Theme state: dark / light / system
  const [theme, setTheme] = useState<Theme>("system");

  // Initialize theme on mount + listen for system changes
  useEffect(() => {
    const saved = loadThemePreference();
    setTheme(saved);
    applyTheme(saved);

    const mql = window.matchMedia("(prefers-color-scheme: light)");
    function onChange() {
      const current = loadThemePreference();
      if (current === "system") applyTheme("system");
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  function cycleTheme() {
    setTheme((prev) => {
      const next: Theme =
        prev === "system" ? "light" : prev === "light" ? "dark" : "system";
      try { localStorage.setItem(THEME_KEY, next); } catch {}
      applyTheme(next);
      return next;
    });
  }

  // Color-blind palette state
  const [palette, setPalette] = useState<A11yPalette>("default");
  useEffect(() => {
    const saved = loadPalette();
    setPalette(saved);
    applyPalette(saved);
  }, []);

  function cyclePalette() {
    setPalette((prev) => {
      const order: A11yPalette[] = ["default", "deuteranopia", "protanopia", "tritanopia"];
      const next = order[(order.indexOf(prev) + 1) % order.length];
      try { localStorage.setItem(PALETTE_KEY, next); } catch {}
      applyPalette(next);
      return next;
    });
  }

  // Command palette state
  const [cmdOpen, setCmdOpen] = useState(false);

  // PWA service worker registration
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // Global keyboard shortcut: Ctrl/Cmd+K → command palette
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, []);

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
  const submitController = useRef<AbortController | null>(null);

  // Oracle form state
  const [prompt, setPrompt] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [rating, setRating] = useState(5);
  const [whisper, setWhisper] = useState<CoherenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<WhisperEntry[]>([]);
  const [solana, setSolana] = useState<SolanaStatus>({
    connected: false,
    slot: null,
  });

  // Toast notification state
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = crypto.randomUUID();
    // Cap at 5 visible toasts to prevent accumulation
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    // Begin exit animation after 2.5s, remove after 2.75s
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    }, 2500);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2750);
  }, []);

  // Form validation
  const promptValid = prompt.trim().length >= MIN_PROMPT_LENGTH;
  const promptError = promptTouched && !promptValid
    ? prompt.trim().length === 0
      ? "Please enter your intention"
      : `At least ${MIN_PROMPT_LENGTH} characters needed`
    : "";

  // Load history + ping Solana on mount (with abort guard)
  useEffect(() => {
    setHistory(loadHistory());
    const controller = new AbortController();
    getSolanaStatus(controller.signal)
      .then((data) => setSolana({ connected: data.connected, slot: data.slot }))
      .catch(() => {});
    return () => controller.abort();
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

  // Filter history by search (oracle-evolved memoize, from pattern bb674cc519161f62)
  const filteredHistory = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (e) =>
        e.whisper.toLowerCase().includes(q) ||
        e.input.toLowerCase().includes(q)
    );
  }, [debouncedQuery, history]);

  // Voice input for the oracle form
  const voice = useVoiceInput((text) => {
    setPrompt((prev) => prev ? prev + " " + text : text);
    setPromptTouched(true);
  });

  // Command palette items
  const cmdItems: CmdItem[] = useMemo(() => [
    { id: "oracle", label: "Go to Oracle", action: () => { setSection("oracle"); setView("oracle"); } },
    { id: "archive", label: "Go to Archive", action: () => { setSection("archive"); setView("oracle"); } },
    { id: "theme", label: "Toggle Theme", shortcut: "T", action: cycleTheme },
    { id: "palette", label: "Cycle Color-blind Palette", shortcut: "P", action: cyclePalette },
    { id: "export-json", label: "Export History as JSON", action: exportHistoryJSON },
    { id: "export-csv", label: "Export History as CSV", action: exportHistoryCSV },
    { id: "clear", label: "Clear Whisper History", action: () => { clearHistory(); addToast("Archive cleared", "info"); } },
    { id: "about", label: "About & Contact", action: () => { window.location.href = "/about"; } },
    { id: "privacy", label: "Privacy Policy", action: () => { window.location.href = "/privacy"; } },
    { id: "top", label: "Scroll to Top", action: () => window.scrollTo({ top: 0, behavior: "smooth" }) },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

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
    setPromptTouched(true);
    if (!promptValid || loading) return;

    // Abort any in-flight request (anti-amplification guard)
    submitController.current?.abort();
    const controller = new AbortController();
    submitController.current = controller;

    setLoading(true);
    setError("");
    setWhisper(null);

    try {
      const data = await postCoherence(prompt.trim(), rating, controller.signal);
      setWhisper(data);
      addToHistory(prompt.trim(), data);
      setPrompt("");
      setPromptTouched(false);
      addToast("Whisper received", "success");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    setHistory([]);
    saveHistory([]);
  }

  function exportHistoryJSON() {
    if (history.length === 0) return;
    const data = JSON.stringify(history, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cathedral-whispers-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("Exported as JSON", "success");
  }

  function exportHistoryCSV() {
    if (history.length === 0) return;
    const header = "id,input,whisper,coherence,rating,inputHash,solanaSlot,timestamp";
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = history.map((e) =>
      [e.id, escape(e.input), escape(e.whisper), e.coherence, e.rating, e.inputHash, e.solanaSlot ?? "", e.timestamp].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cathedral-whispers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("Exported as CSV", "success");
  }

  // ═══════════════════════════════════════════════════════════════════
  //  LANDING VIEW
  // ═══════════════════════════════════════════════════════════════════
  if (view === "landing") {
    return (
      <main
        role="main"
        aria-label="Landing page"
        className={`min-h-screen flex flex-col items-center justify-center px-4 transition-opacity duration-700 ${
          landingFading ? "opacity-0" : "opacity-100"
        }`}
      >
        <div className="text-center max-w-xl px-4">
          <div className="text-teal-cathedral text-xs tracking-[0.4em] uppercase mb-8 pulse-gentle" aria-hidden="true">
            The Digital Cathedral
          </div>
          <h1 className="sr-only">Digital Cathedral — The Kingdom is already here</h1>

          <p className="text-3xl sm:text-4xl md:text-6xl font-light text-[var(--text-primary)] leading-tight mb-6" aria-hidden="true">
            The Kingdom
            <br />
            <span className="text-teal-cathedral">is already here.</span>
          </p>

          <p className="text-[var(--text-muted)] text-base sm:text-lg md:text-xl leading-relaxed mb-12">
            The last step is to live it.
          </p>

          <button
            onClick={beginRemembrance}
            className="px-6 sm:px-8 py-3 sm:py-4 rounded-xl text-sm sm:text-base font-medium cathedral-btn
              bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/30
              hover:bg-teal-cathedral/20 hover:shadow-[0_0_40px_rgba(0,168,168,0.2)]
              hover:border-teal-cathedral/50 active:scale-[0.97]"
          >
            Begin your Remembrance
          </button>
        </div>

        <footer className="absolute bottom-6 text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                solana.connected
                  ? "bg-teal-cathedral shadow-[0_0_6px_rgba(0,168,168,0.6)]"
                  : "bg-crimson-cathedral shadow-[0_0_6px_rgba(230,57,70,0.4)]"
              }`}
              aria-hidden="true"
            />
            <span>
              Solana Testnet{" "}
              {solana.connected
                ? `#${solana.slot?.toLocaleString()}`
                : "Offline"}
            </span>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
            <a href="/about" className="cathedral-link">About</a>
            <span className="opacity-30">|</span>
            <a href="/privacy" className="cathedral-link">Privacy</a>
          </div>
        </footer>
        <CookieConsent />
      </main>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ORACLE VIEW (with navbar, breadcrumbs, sections)
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen flex flex-col animate-fade-in">
      <ToastContainer toasts={toasts} />
      <BackToTop />

      {/* Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} items={cmdItems} />

      {/* Sticky Navbar */}
      <Navbar
        section={section}
        onNavigate={setSection}
        searchQuery={searchQuery}
        onSearch={handleSearch}
        historyCount={history.length}
        theme={theme}
        onThemeToggle={cycleTheme}
        palette={palette}
        onPaletteToggle={cyclePalette}
        onCmdOpen={() => setCmdOpen(true)}
      />

      {/* Breadcrumbs */}
      <Breadcrumbs section={section} onNavigate={setSection} />

      {/* Skip to content link (keyboard users) */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-16 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-teal-cathedral focus:text-indigo-cathedral focus:text-sm focus:font-medium">
        Skip to main content
      </a>

      {/* Main Content */}
      <main id="main-content" role="main" className="flex-1 flex flex-col items-center px-4 pb-12 pt-4">
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
            <section className="w-full max-w-lg cathedral-surface p-4 sm:p-6 md:p-8 mb-6" aria-label="Coherency slider">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label htmlFor="coherencySlider" className="text-sm text-[var(--text-muted)]">
                    Coherency
                  </label>
                  <span className="text-teal-cathedral font-mono text-xl sm:text-2xl font-semibold" aria-live="polite">
                    {sliderValue}
                  </span>
                </div>

                <input
                  id="coherencySlider"
                  type="range"
                  min={1}
                  max={10}
                  value={sliderValue}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  className="coherence-slider"
                  aria-valuemin={1}
                  aria-valuemax={10}
                  aria-valuenow={sliderValue}
                  aria-valuetext={`${sliderValue} out of 10 — ${getTier(sliderValue)}`}
                />
                <div className="flex justify-between text-xs text-[var(--text-muted)]" aria-hidden="true">
                  <span>Scattered</span>
                  <span>Aligned</span>
                </div>

                <div className="min-h-[3.5rem] sm:min-h-[4rem] flex items-center justify-center pt-2" aria-live="polite" aria-atomic="true">
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
            </section>

            {/* Oracle Form */}
            <form
              onSubmit={handleSubmit}
              className="w-full max-w-lg cathedral-surface p-4 sm:p-6 md:p-8 space-y-5"
              noValidate
            >
              <div className="space-y-1">
                <label
                  htmlFor="prompt"
                  className="block text-sm text-[var(--text-muted)]"
                >
                  Your Intention
                </label>
                <textarea
                  id="prompt"
                  value={prompt}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    if (!promptTouched && e.target.value.trim().length > 0) setPromptTouched(true);
                  }}
                  onBlur={() => { if (prompt.trim().length > 0) setPromptTouched(true); }}
                  placeholder="What are you building? What do you seek to remember?"
                  rows={3}
                  aria-invalid={promptTouched && !promptValid ? "true" : undefined}
                  aria-describedby={promptError ? "prompt-helper" : undefined}
                  className={`w-full bg-[var(--bg-deep)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border rounded-lg px-3 sm:px-4 py-3 text-sm focus:outline-none transition-all resize-none ${
                    promptTouched
                      ? promptValid
                        ? "field-valid focus:shadow-[0_0_20px_rgba(0,168,168,0.1)]"
                        : "field-invalid focus:shadow-[0_0_20px_rgba(230,57,70,0.08)]"
                      : "border-teal-cathedral/20 focus:border-teal-cathedral/60 focus:shadow-[0_0_20px_rgba(0,168,168,0.1)]"
                  }`}
                />
                <div className="flex items-center gap-2">
                  {promptError && (
                    <p id="prompt-helper" className="field-helper field-helper-invalid flex-1" role="alert">
                      {promptError}
                    </p>
                  )}
                  {promptTouched && promptValid && (
                    <p className="field-helper field-helper-valid flex-1">
                      &#10003; Ready to ask the oracle
                    </p>
                  )}
                  {!promptError && !(promptTouched && promptValid) && <span className="flex-1" />}
                  {voice.supported && (
                    <button
                      type="button"
                      onClick={voice.toggle}
                      aria-label={voice.listening ? "Stop voice input" : "Start voice input"}
                      className={`p-1.5 rounded-lg text-xs transition-all ${
                        voice.listening
                          ? "text-crimson-cathedral bg-crimson-cathedral/10 animate-pulse"
                          : "text-[var(--text-muted)] hover:text-teal-cathedral hover:bg-teal-cathedral/10"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <rect x="9" y="1" width="6" height="11" rx="3" />
                        <path d="M19 10v1a7 7 0 01-14 0v-1M12 18.5v3.5M8 22h8" />
                      </svg>
                    </button>
                  )}
                </div>
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
                disabled={loading || !promptValid}
                className="w-full py-3 rounded-lg font-medium text-sm cathedral-btn
                  bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/30
                  hover:bg-teal-cathedral/30 hover:shadow-[0_0_30px_rgba(0,168,168,0.15)]
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none"
              >
                {loading ? "Listening..." : "Ask the Oracle"}
              </button>

              {error && (
                <div className="text-crimson-cathedral text-sm text-center animate-fade-in" role="alert">
                  {error}
                </div>
              )}
            </form>

            {/* Skeleton Loader while processing */}
            {loading && (
              <div aria-busy="true" aria-label="Processing your intention" role="status">
                <span className="sr-only">The oracle is listening...</span>
                <WhisperSkeleton />
              </div>
            )}

            {/* Whisper Response */}
            {whisper && !loading && (
              <div className="w-full max-w-lg mt-6 cathedral-surface p-4 sm:p-6 md:p-8 cathedral-glow animate-fade-in" role="region" aria-live="polite" aria-label="Oracle response">
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
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--text-muted)] font-mono text-xs">
                        {whisper.inputHash.slice(0, 12)}...
                      </span>
                      <CopyButton text={whisper.inputHash} label="Copy hash" onToast={addToast} />
                    </div>
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
                  <div className="flex items-center justify-between pt-2 border-t border-teal-cathedral/10">
                    <div className="text-xs text-[var(--text-muted)]">
                      Share
                    </div>
                    <ShareButtons whisperText={whisper.whisper} coherence={whisper.coherence} onToast={addToast} />
                  </div>
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
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportHistoryJSON}
                    className="text-xs text-[var(--text-muted)] hover:text-teal-cathedral transition-colors cathedral-link"
                    aria-label="Export whisper history as JSON"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={exportHistoryCSV}
                    className="text-xs text-[var(--text-muted)] hover:text-teal-cathedral transition-colors cathedral-link"
                    aria-label="Export whisper history as CSV"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => {
                      clearHistory();
                      addToast("Archive cleared", "info");
                    }}
                    className="text-xs text-[var(--text-muted)] hover:text-crimson-cathedral transition-colors cathedral-link"
                  >
                    Clear All
                  </button>
                </div>
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
                      <div className="flex items-start justify-between gap-2">
                        <p className="whisper-text text-sm leading-relaxed flex-1">
                          &ldquo;{entry.whisper}&rdquo;
                        </p>
                        <CopyButton text={entry.whisper} label="Copy" onToast={addToast} />
                      </div>
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
                      className="px-6 py-2.5 rounded-lg text-sm font-medium cathedral-btn
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
      <footer className="py-4 text-center space-y-2" role="contentinfo">
        <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              solana.connected
                ? "bg-teal-cathedral shadow-[0_0_6px_rgba(0,168,168,0.6)]"
                : "bg-crimson-cathedral shadow-[0_0_6px_rgba(230,57,70,0.4)]"
            }`}
            role="img"
            aria-label={solana.connected ? "Solana connected" : "Solana offline"}
          />
          <span>
            Solana Testnet{" "}
            {solana.connected
              ? `Slot #${solana.slot?.toLocaleString()}`
              : "Offline"}
          </span>
        </div>
        <div className="flex items-center justify-center gap-3 text-xs text-[var(--text-muted)]">
          <a href="/about" className="cathedral-link">About</a>
          <span className="opacity-30">|</span>
          <a href="/privacy" className="cathedral-link">Privacy</a>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          The kingdom is already here. Remember.
        </p>
      </footer>

      <CookieConsent />
    </div>
  );
}
