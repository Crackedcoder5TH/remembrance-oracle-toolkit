/**
 * Loading — The Kingdom's Patience
 *
 * Oracle decision: GENERATE (0.364) — no existing pattern, write new
 *
 * Skeleton loading state shown while server components render.
 * Uses a calming pulse animation that matches the cathedral aesthetic.
 */

export default function Loading() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg space-y-6">
        {/* Header skeleton */}
        <div className="text-center space-y-3">
          <div className="h-4 w-32 bg-soft-gray rounded animate-pulse mx-auto" />
          <div className="h-8 w-64 bg-soft-gray rounded animate-pulse mx-auto" />
          <div className="h-3 w-48 bg-soft-gray rounded animate-pulse mx-auto" />
        </div>

        {/* Card skeleton */}
        <div className="cathedral-surface p-6 md:p-8 space-y-5">
          <div className="space-y-3">
            <div className="h-3 w-24 bg-soft-gray rounded animate-pulse" />
            <div className="h-10 w-full bg-soft-gray rounded-lg animate-pulse" />
          </div>
          <div className="space-y-3">
            <div className="h-3 w-20 bg-soft-gray rounded animate-pulse" />
            <div className="h-10 w-full bg-soft-gray rounded-lg animate-pulse" />
          </div>
          <div className="space-y-3">
            <div className="h-3 w-28 bg-soft-gray rounded animate-pulse" />
            <div className="h-10 w-full bg-soft-gray rounded-lg animate-pulse" />
          </div>
          <div className="h-12 w-full bg-emerald-accent/20 rounded-lg animate-pulse" />
        </div>
      </div>

      <div className="mt-8 text-center">
        <p className="text-xs text-[var(--text-muted)] pulse-gentle">Preparing...</p>
      </div>
    </main>
  );
}
