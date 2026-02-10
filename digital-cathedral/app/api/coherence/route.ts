import { NextRequest, NextResponse } from "next/server";

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
  // Normalize self-rating to 0–1
  const ratingNorm = Math.max(0, Math.min((rating - 1) / 9, 1));

  // Length signal: tapers off around 200 chars
  const lengthNorm = Math.min(input.length / 200, 1);

  // Word diversity: unique / total
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

    const numRating = typeof rating === "number"
      ? Math.max(1, Math.min(10, Math.round(rating)))
      : 5;

    const coherence = computeCoherence(input.trim(), numRating);
    const whisper = pickWhisper(coherence);

    return NextResponse.json({
      coherence,
      whisper,
      rating: numRating,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
