/**
 * StepProgress — Multi-step form progress indicator with coherence visualization.
 * Oracle: GENERATE — no existing pattern in the kingdom.
 *
 * Maps the kingdom's coherence model to form steps:
 *   Step 1 (identity)  → coherence 0.33 — "The signal is forming..."
 *   Step 2 (contact)   → coherence 0.66 — "The outline is forming..."
 *   Step 3 (consent)   → coherence 1.00 — "Coherence confirmed."
 */

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = ["Identity", "Contact", "Consent"];

const STEP_WHISPERS = [
  "Begin with who you are...",
  "The outline is forming. Keep going...",
  "Almost there. Seal the covenant...",
];

export function StepProgress({ currentStep, totalSteps }: StepProgressProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full space-y-3">
      {/* Whisper for current step */}
      <p className="whisper-text text-xs text-center">
        &ldquo;{STEP_WHISPERS[currentStep]}&rdquo;
      </p>

      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                i < currentStep
                  ? "bg-teal-cathedral text-indigo-cathedral"
                  : i === currentStep
                    ? "bg-teal-cathedral/20 text-teal-cathedral border border-teal-cathedral/60 cathedral-glow"
                    : "bg-[var(--bg-deep)] text-[var(--text-muted)] border border-teal-cathedral/10"
              }`}
            >
              {i < currentStep ? "\u2713" : i + 1}
            </div>
            <span
              className={`text-xs mt-1 ${
                i <= currentStep ? "text-teal-cathedral" : "text-[var(--text-muted)]"
              }`}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Coherence bar */}
      <div className="w-full h-1 rounded-full bg-[var(--bg-deep)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(to right, var(--crimson), var(--teal))`,
            boxShadow: progress > 50 ? "0 0 8px var(--glow-teal)" : undefined,
          }}
        />
      </div>
    </div>
  );
}
