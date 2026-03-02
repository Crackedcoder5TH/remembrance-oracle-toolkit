/**
 * StepProgress — Multi-step form progress indicator.
 */

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = ["Identity", "Contact", "Consent"];

const STEP_HINTS = [
  "Tell us about yourself...",
  "How can we reach you?",
  "Review and submit your request...",
];

export function StepProgress({ currentStep, totalSteps }: StepProgressProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full space-y-3" role="navigation" aria-label="Form progress">
      {/* Hint for current step */}
      <p className="text-xs text-center text-black font-bold" aria-hidden="true">
        {STEP_HINTS[currentStep]}
      </p>

      {/* Step indicators */}
      <ol className="flex items-center justify-between list-none p-0 m-0" aria-label="Form steps">
        {STEP_LABELS.map((label, i) => (
          <li key={label} className="flex flex-col items-center flex-1" aria-current={i === currentStep ? "step" : undefined}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                i < currentStep
                  ? "bg-teal-cathedral text-white"
                  : i === currentStep
                    ? "bg-teal-cathedral/10 text-teal-cathedral border border-teal-cathedral/60 cathedral-glow"
                    : "bg-gray-100 text-gray-400 border border-gray-300"
              }`}
              aria-hidden="true"
            >
              {i < currentStep ? "\u2713" : i + 1}
            </div>
            <span
              className="text-xs mt-1 font-bold text-black"
            >
              <span className="sr-only">{i < currentStep ? "Completed: " : i === currentStep ? "Current: " : "Upcoming: "}</span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {/* Progress bar */}
      <div
        className="w-full h-1 rounded-full bg-gray-200 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Form progress: ${Math.round(progress)}% complete`}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(to right, #00A8A8, #008888)`,
            boxShadow: progress > 50 ? "0 0 8px rgba(0,168,168,0.3)" : undefined,
          }}
        />
      </div>
    </div>
  );
}
