"use client";

/**
 * Admin Messages Page
 *
 * Support desk for client/admin messaging: a conversation list (grouped by
 * client, newest first, with unread counts), the selected thread, and a
 * reply box. Opening a conversation marks its inbound messages read.
 */

import * as React from "react";
import { useState, useEffect, useMemo, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface Msg {
  id: number;
  clientId: number;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface Conversation {
  clientId: number;
  items: Msg[];
  latest: Msg;
  unread: number;
}

export default function AdminMessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/admin/messages");
    if (res.status === 401 || res.status === 403) {
      router.push("/admin/login");
      return;
    }
    const data = await res.json();
    if (data.success) {
      setMessages(data.messages || []);
    } else {
      setError(data.message || "Failed to load messages.");
    }
  }, [router]);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const conversations = useMemo<Conversation[]>(() => {
    const byClient = new Map<number, Msg[]>();
    for (const m of messages) {
      const list = byClient.get(m.clientId) ?? [];
      list.push(m);
      byClient.set(m.clientId, list);
    }
    const convos: Conversation[] = [];
    byClient.forEach((items, clientId) => {
      const sorted = [...items].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      convos.push({
        clientId,
        items: sorted,
        latest: sorted[sorted.length - 1],
        unread: sorted.filter((m) => m.direction === "inbound" && !m.read).length,
      });
    });
    return [...convos].sort(
      (a, b) => new Date(b.latest.createdAt).getTime() - new Date(a.latest.createdAt).getTime(),
    );
  }, [messages]);

  const selected = conversations.find((c: Conversation) => c.clientId === selectedClientId) ?? null;

  const handleSelect = useCallback(
    async (clientId: number) => {
      setSelectedClientId(clientId);
      setReplySubject("");
      setReplyBody("");
      const unread = messages.filter(
        (m: Msg) => m.clientId === clientId && m.direction === "inbound" && !m.read,
      );
      if (unread.length > 0) {
        await Promise.all(
          unread.map((m: Msg) =>
            fetch("/api/admin/messages", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ messageId: m.id, clientId }),
            }).catch(() => {}),
          ),
        );
        await fetchAll();
      }
    },
    [messages, fetchAll],
  );

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (selectedClientId == null) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          subject: replySubject,
          message: replyBody,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplySubject("");
        setReplyBody("");
        await fetchAll();
      } else {
        setError(data.message || "Failed to send reply.");
      }
    } catch {
      setError("Failed to send reply.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-muted)] text-sm">Loading messages...</div>
      </main>
    );
  }

  const totalUnread = conversations.reduce((n: number, c: Conversation) => n + c.unread, 0);

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">Admin</div>
            <h1 className="text-3xl font-light text-[var(--text-primary)]">
              Client Messages
              {totalUnread > 0 && (
                <span className="ml-3 text-sm align-middle px-2 py-0.5 rounded-full bg-teal-cathedral text-white">
                  {totalUnread} unread
                </span>
              )}
            </h1>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 rounded-lg text-sm text-teal-cathedral/70 border border-teal-cathedral/20 hover:border-teal-cathedral/40 hover:text-teal-cathedral transition-all"
          >
            Back to Dashboard
          </button>
        </div>

        {error && <div className="text-sm text-red-400">{error}</div>}

        {conversations.length === 0 ? (
          <div className="cathedral-surface p-8 text-center">
            <p className="text-[var(--text-muted)] text-sm">No client messages yet.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Conversation list */}
            <div className="space-y-2">
              {conversations.map((c: Conversation) => (
                <button
                  key={c.clientId}
                  onClick={() => handleSelect(c.clientId)}
                  className={`w-full text-left cathedral-surface p-3 transition-all ${
                    c.clientId === selectedClientId ? "border-l-2 border-teal-cathedral" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      Client #{c.clientId}
                    </span>
                    {c.unread > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-cathedral text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {c.latest.subject || c.latest.body}
                  </p>
                </button>
              ))}
            </div>

            {/* Thread + reply */}
            <div className="md:col-span-2">
              {selected ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {selected.items.map((m: Msg) => (
                      <div
                        key={m.id}
                        className={`cathedral-surface p-4 ${
                          m.direction === "inbound" ? "border-l-2 border-indigo-cathedral" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-[var(--text-muted)]">
                            {m.direction === "inbound" ? `Client #${m.clientId}` : "Valor Legacies Team"}
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">
                            {new Date(m.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {m.subject && (
                          <div className="text-sm font-medium text-[var(--text-primary)] mb-1">{m.subject}</div>
                        )}
                        <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{m.body}</p>
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleReply} className="cathedral-surface p-4 space-y-3">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      Reply to Client #{selected.clientId}
                    </div>
                    <input
                      type="text"
                      placeholder="Subject (optional)"
                      value={replySubject}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReplySubject(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-deep)] text-[var(--text-primary)] border border-indigo-cathedral/10 focus:border-teal-cathedral/50 focus:outline-none transition-colors"
                    />
                    <textarea
                      placeholder="Type your reply..."
                      value={replyBody}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReplyBody(e.target.value)}
                      required
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-deep)] text-[var(--text-primary)] border border-indigo-cathedral/10 focus:border-teal-cathedral/50 focus:outline-none transition-colors resize-none"
                    />
                    <button
                      type="submit"
                      disabled={sending || !replyBody.trim()}
                      className="ml-auto block px-4 py-2 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sending ? "Sending..." : "Send Reply"}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="cathedral-surface p-8 text-center">
                  <p className="text-[var(--text-muted)] text-sm">
                    Select a conversation to view the thread and reply.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
