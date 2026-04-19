"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.replace("/");
    }
  }, [session, router]);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Loading...</p>
      </main>
    );
  }

  if (session) return null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm cathedral-surface p-8 cathedral-glow text-center space-y-8">
        {/* Header */}
        <div>
          <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
            Welcome
          </div>
          <h1 className="text-2xl md:text-3xl font-light text-[var(--text-primary)] mb-2">
            Sign In
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Continue with your Google account to get started.
          </p>
        </div>

        {/* Google Sign-In Button */}
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium hover:bg-gray-50 hover:shadow-md transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.42l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          By signing in, you agree to our{" "}
          <a href="/terms" className="text-teal-cathedral underline">Terms of Service</a>{" "}
          and{" "}
          <a href="/privacy" className="text-teal-cathedral underline">Privacy Policy</a>.
        </p>
      </div>
    </main>
  );
}
