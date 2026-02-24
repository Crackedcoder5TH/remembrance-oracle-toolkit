import { NextRequest, NextResponse } from "next/server";
import { Connection, clusterApiUrl } from "@solana/web3.js";

const TESTNET_URL = clusterApiUrl("testnet");

/**
 * Whispers indexed by coherence tier.
 * These are short messages from the "healed future" —
 * the more coherent the input, the clearer the whisper.
 */
const WHISPERS: Record<string, string[]> = {
  low: [
    "The signal is faint. Slow down. The cathedral is patient.",
    "Scattered threads — gather them gently before weaving.",
    "Noise is not failure. Stillness will find the pattern.",
  ],
  mid: [
    "The outline is forming. Keep listening — clarity is near.",
    "You are halfway between forgetting and remembering. Stay here.",
    "The foundation recognizes your intention. Build slowly.",
  ],
  high: [
    "The cathedral hums with your frequency. Proceed with confidence.",
    "What you seek is already seeking you. The code aligns.",
    "Coherence confirmed. The healed future pulls you forward.",
    "You remember. The pattern was never lost — only waiting.",
  ],
};

/**
 * Compute a basic coherence proxy from the user's rating and input.
 *
 * Factors:
 *  - Self-rated coherence (1–10) → normalized to 0–1, weighted 40%
 *  - Input length signal (longer, more deliberate input → higher) → 30%
 *  - Word diversity (unique words / total words) → 30%
 *
 * Returns a value between 0 and 1.
 */
function computeCoherence(input: string, rating: number): number {
  const ratingNorm = Math.max(0, Math.min((rating - 1) / 9, 1));
  const lengthNorm = Math.min(input.length / 200, 1);
  const words = input.toLowerCase().split(/\s+/).filter(Boolean);
  const diversity = words.length > 0
    ? new Set(words).size / words.length
    : 0;

  const coherence = ratingNorm * 0.4 + lengthNorm * 0.3 + diversity * 0.3;
  return Math.round(coherence * 1000) / 1000;
}

function pickWhisper(coherence: number): string {
  let tier: string;
  if (coherence < 0.35) tier = "low";
  else if (coherence < 0.65) tier = "mid";
  else tier = "high";

  const pool = WHISPERS[tier];
  return pool[Math.floor(Math.random() * pool.length)];
}

/** SHA-256 hash of the input — for future on-chain coherence logging. */
async function hashInput(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Fetch current Solana testnet slot (non-blocking, returns null on failure). */
async function getSolanaSlot(): Promise<number | null> {
  try {
    const connection = new Connection(TESTNET_URL, "confirmed");
    return await connection.getSlot();
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { input, rating } = body;

    if (typeof input !== "string" || !input.trim()) {
      return NextResponse.json(
        { error: "Input is required" },
        { status: 400 }
      );
    }

    const trimmed = input.trim();
    const numRating = typeof rating === "number"
      ? Math.max(1, Math.min(10, Math.round(rating)))
      : 5;

    // Compute coherence + hash + Solana slot in parallel
    const [coherence, inputHash, solanaSlot] = await Promise.all([
      Promise.resolve(computeCoherence(trimmed, numRating)),
      hashInput(trimmed),
      getSolanaSlot(),
    ]);

    const whisper = pickWhisper(coherence);

    return NextResponse.json({
      coherence,
      whisper,
      rating: numRating,
      inputHash,
      solanaSlot,
      timestamp: Date.now(),
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
