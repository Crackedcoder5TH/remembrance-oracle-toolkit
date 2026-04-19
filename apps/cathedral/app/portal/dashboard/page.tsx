"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PortalUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

interface Lead {
  leadId: string;
  firstName: string;
  lastName: string;
  coverageInterest: string;
  state: string;
  createdAt: string;
}

interface Message {
  id: number;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface Document {
  id: number;
  name: string;
  type: string;
  url: string;
  uploadedAt: string;
}

type Tab = "quotes" | "documents" | "messages";

export default function PortalDashboardPage() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("quotes");
  const router = useRouter();

  // Message form
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState("");

  useEffect(() => {
    fetch("/api/portal/session")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setLeads(data.leads || []);
        setMessages(data.messages || []);
        setDocuments(data.documents || []);
      })
      .catch(() => {
        router.replace("/portal/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/portal/logout", { method: "POST" });
    router.replace("/portal/login");
  }

  async function handleSendMessage(e: FormEvent) {
    e.preventDefault();
    setMsgSending(true);
    setMsgSuccess("");

    try {
      const res = await fetch("/api/portal/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: msgSubject, message: msgBody }),
      });

      if (res.ok) {
        setMsgSubject("");
        setMsgBody("");
        setMsgSuccess("Message sent! Our team will respond shortly.");
        // Refresh messages
        const sessionRes = await fetch("/api/portal/session");
        if (sessionRes.ok) {
          const data = await sessionRes.json();
          setMessages(data.messages || []);
        }
      }
    } catch {
      // ignore
    } finally {
      setMsgSending(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-[var(--text-muted)] text-sm">Loading your portal...</div>
      </main>
    );
  }

  if (!user) return null;

  const unreadCount = messages.filter((m) => m.direction === "outbound" && !m.read).length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "quotes", label: "Quotes & Status" },
    { key: "documents", label: "Documents" },
    { key: "messages", label: "Messages", badge: unreadCount },
  ];

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase mb-1">
              Client Portal
            </div>
            <h1 className="text-2xl font-light text-[var(--text-primary)]">
              Welcome, {user.firstName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--teal)] transition-colors"
            >
              Home
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--teal)] transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--text-muted)]/10">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${
                activeTab === tab.key
                  ? "border-teal-cathedral text-teal-cathedral"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
              {tab.badge ? (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full bg-teal-cathedral text-white">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "quotes" && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-[var(--text-primary)]">Your Quotes & Submissions</h2>
            {leads.length === 0 ? (
              <div className="cathedral-surface p-8 text-center">
                <p className="text-[var(--text-muted)] text-sm">
                  No quote requests yet. When you submit a quote request, it will appear here.
                </p>
                <Link
                  href="/"
                  className="inline-block mt-4 px-4 py-2 text-sm rounded-lg bg-teal-cathedral text-white hover:bg-teal-cathedral/90 transition-colors"
                >
                  Request a Quote
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <div key={lead.leadId} className="cathedral-surface p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">
                        {lead.coverageInterest || "Life Insurance Quote"}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        {lead.state && `${lead.state} · `}
                        Submitted {new Date(lead.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="px-3 py-1 text-xs rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Under Review
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "documents" && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-[var(--text-primary)]">Your Documents</h2>
            {documents.length === 0 ? (
              <div className="cathedral-surface p-8 text-center">
                <p className="text-[var(--text-muted)] text-sm">
                  No documents yet. Once your policy is set up, documents will appear here for download.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="cathedral-surface p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-teal-cathedral shrink-0"
                      >
                        <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <div>
                        <div className="text-sm font-medium text-[var(--text-primary)]">{doc.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">
                          {doc.type} · Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-cathedral hover:text-teal-cathedral/80 transition-colors"
                    >
                      Download
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "messages" && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium text-[var(--text-primary)]">Messages</h2>

            {/* Compose form */}
            <form onSubmit={handleSendMessage} className="cathedral-surface p-4 space-y-3">
              <div className="text-sm font-medium text-[var(--text-primary)]">Send a Message</div>
              <input
                type="text"
                placeholder="Subject (optional)"
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-deep)] text-[var(--text-primary)] border border-indigo-cathedral/10 focus:border-teal-cathedral/50 focus:outline-none transition-colors"
              />
              <textarea
                placeholder="Type your message..."
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                required
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-deep)] text-[var(--text-primary)] border border-indigo-cathedral/10 focus:border-teal-cathedral/50 focus:outline-none transition-colors resize-none"
              />
              <div className="flex items-center justify-between">
                {msgSuccess && (
                  <span className="text-xs text-emerald-400">{msgSuccess}</span>
                )}
                <button
                  type="submit"
                  disabled={msgSending || !msgBody.trim()}
                  className="ml-auto px-4 py-2 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {msgSending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>

            {/* Message history */}
            {messages.length === 0 ? (
              <div className="cathedral-surface p-8 text-center">
                <p className="text-[var(--text-muted)] text-sm">
                  No messages yet. Send one above and our team will respond.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`cathedral-surface p-4 ${
                      msg.direction === "outbound" && !msg.read ? "border-l-2 border-teal-cathedral" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-[var(--text-muted)]">
                        {msg.direction === "inbound" ? "You" : "Valor Legacies Team"}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {msg.subject && (
                      <div className="text-sm font-medium text-[var(--text-primary)] mb-1">
                        {msg.subject}
                      </div>
                    )}
                    <p className="text-sm text-[var(--text-muted)] whitespace-pre-wrap">{msg.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
