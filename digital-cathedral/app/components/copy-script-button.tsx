"use client";
import { useState } from "react";

export function CopyScriptButton({ text, label = "Copy script" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return <button type="button" onClick={copy} className="rounded-lg bg-[#176b65] px-3 py-2 text-xs font-semibold text-white hover:bg-[#125752]" aria-live="polite">{copied ? "Copied" : label}</button>;
}
