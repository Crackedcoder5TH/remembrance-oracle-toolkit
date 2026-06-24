"use client";

/**
 * /admin/notifications — who gets emailed when a new lead is submitted.
 *
 * Manages the durable recipient list (stored server-side via the site-content
 * KV store). Any address here is emailed on every new lead, alongside the
 * legacy ADMIN_EMAIL env var (shown read-only). Includes a "send test" so the
 * operator can confirm delivery (and whether SMTP is wired).
 */

import * as React from "react";
import { useCallback, useEffect, useState } from "react";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function NotificationsPage() {
  const [recipients, setRecipients] = useState<string[]>([]);
  const [envEmails, setEnvEmails] = useState<string[]>([]);
  const [smtpConfigured, setSmtpConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setRecipients(data.recipients ?? []);
        setEnvEmails(data.envAdminEmails ?? []);
        setSmtpConfigured(Boolean(data.smtpConfigured));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addDraft = useCallback(() => {
    const email = draft.trim().toLowerCase();
    if (!isValidEmail(email)) {
      setFlash({ ok: false, message: `"${draft}" is not a valid email.` });
      return;
    }
    if (recipients.includes(email)) {
      setFlash({ ok: false, message: `${email} is already on the list.` });
      setDraft("");
      return;
    }
    setRecipients((r) => [...r, email]);
    setDraft("");
    setDirty(true);
    setFlash(null);
  }, [draft, recipients]);

  const remove = useCallback((email: string) => {
    setRecipients((r) => r.filter((e) => e !== email));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setRecipients(data.recipients ?? []);
        setDirty(false);
        setFlash({ ok: true, message: "Recipients saved." });
      } else {
        setFlash({ ok: false, message: data.message || "Save failed." });
      }
    } catch (err) {
      setFlash({ ok: false, message: "Save error: " + (err instanceof Error ? err.message : "unknown") });
    } finally {
      setSaving(false);
    }
  }, [recipients]);

  const sendTest = useCallback(async () => {
    setTesting(true);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/notifications", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setFlash({
          ok: true,
          message:
            `Test sent to ${data.sent} recipient(s)` +
            (data.failed ? `, ${data.failed} failed` : "") +
            (data.note ? `. ${data.note}` : "."),
        });
      } else {
        setFlash({ ok: false, message: data.message || "Test failed." });
      }
    } catch (err) {
      setFlash({ ok: false, message: "Test error: " + (err instanceof Error ? err.message : "unknown") });
    } finally {
      setTesting(false);
    }
  }, []);

  return (
    <main className="min-h-screen text-[var(--text-primary)] px-6 py-8 max-w-3xl mx-auto">
      <header className="flex items-baseline justify-between flex-wrap gap-3 mb-2">
        <h1 className="text-xl font-light text-teal-cathedral">Lead Notifications</h1>
        <a href="/admin" className="text-xs text-teal-cathedral/80 hover:text-teal-cathedral">
          ← back to dashboard
        </a>
      </header>
      <p className="text-xs text-[var(--text-muted)] mb-6 max-w-2xl">
        Everyone listed here is emailed whenever a new lead is submitted. Changes
        save to the database, so they persist across deploys.
      </p>

      {!smtpConfigured && (
        <div className="mb-4 px-3 py-2 rounded text-xs border border-amber-500/30 bg-amber-950/20 text-amber-200">
          Email sending isn&apos;t configured yet (SMTP_HOST unset), so notifications are
          logged to the server console instead of delivered. Set SMTP_HOST / SMTP_USER /
          SMTP_PASS in Vercel to send for real.
        </div>
      )}

      {flash && (
        <div
          className={
            "mb-4 px-3 py-2 rounded text-xs " +
            (flash.ok
              ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
              : "border border-rose-500/30 bg-rose-950/30 text-rose-200")
          }
        >
          {flash.message}
        </div>
      )}

      {loading ? (
        <div className="text-[var(--text-muted)] text-sm">Loading…</div>
      ) : (
        <>
          {/* Add */}
          <div className="flex gap-2 mb-4">
            <input
              type="email"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDraft();
                }
              }}
              placeholder="name@example.com"
              className="flex-1 bg-black/20 border border-teal-cathedral/20 rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-teal-cathedral outline-none"
            />
            <button
              onClick={addDraft}
              className="px-4 py-2 rounded text-sm bg-teal-cathedral/80 text-white hover:bg-teal-cathedral"
            >
              Add
            </button>
          </div>

          {/* Managed list */}
          <div className="border border-teal-cathedral/10 rounded-lg bg-black/10 divide-y divide-teal-cathedral/10 mb-4">
            {recipients.length === 0 ? (
              <div className="px-4 py-6 text-sm text-[var(--text-muted)] text-center">
                No recipients yet. Add an email above to start getting new-lead alerts.
              </div>
            ) : (
              recipients.map((email) => (
                <div key={email} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-[var(--text-primary)]">{email}</span>
                  <button
                    onClick={() => remove(email)}
                    className="text-xs text-rose-300/80 hover:text-rose-300"
                    aria-label={`Remove ${email}`}
                  >
                    remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center gap-3 mb-8">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="px-4 py-2 rounded text-sm bg-indigo-cathedral text-white hover:bg-indigo-cathedral/90 disabled:opacity-50"
            >
              {saving ? "saving…" : dirty ? "Save changes" : "Saved"}
            </button>
            <button
              onClick={sendTest}
              disabled={testing}
              className="px-4 py-2 rounded text-sm text-teal-cathedral/80 border border-teal-cathedral/20 hover:border-teal-cathedral/40 hover:text-teal-cathedral disabled:opacity-50"
            >
              {testing ? "sending…" : "Send test email"}
            </button>
          </div>

          {/* Env fallback (read-only) */}
          {envEmails.length > 0 && (
            <div>
              <h2 className="text-[10px] tracking-[0.2em] uppercase text-teal-cathedral mb-2">
                Always notified · from ADMIN_EMAIL
              </h2>
              <div className="border border-teal-cathedral/10 rounded-lg bg-black/10 divide-y divide-teal-cathedral/10">
                {envEmails.map((email) => (
                  <div key={email} className="px-4 py-2.5 text-sm text-[var(--text-muted)]">
                    {email}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-2">
                Set via the ADMIN_EMAIL environment variable — edit it in Vercel.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
