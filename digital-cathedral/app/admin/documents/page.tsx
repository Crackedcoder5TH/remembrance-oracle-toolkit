"use client";

/**
 * Admin Documents Page
 *
 * Attach policy documents (name + URL) to a portal client and review what
 * a client already has. Clients see and download these from their portal.
 */

import * as React from "react";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

interface Doc {
  id: number;
  clientId: number;
  name: string;
  url: string;
  type: string;
  createdAt: string;
}

export default function AdminDocumentsPage() {
  const router = useRouter();
  const [clientIdInput, setClientIdInput] = useState("");
  const [loadedClientId, setLoadedClientId] = useState<number | null>(null);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [docType, setDocType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadDocuments(clientId: number) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/documents?clientId=${clientId}`);
      if (res.status === 401 || res.status === 403) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      if (data.success) {
        setDocuments(data.documents || []);
        setLoadedClientId(clientId);
      } else {
        setError(data.message || "Failed to load documents.");
      }
    } catch {
      setError("Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }

  function handleLoad(e: FormEvent) {
    e.preventDefault();
    const clientId = Number(clientIdInput);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      setError("Enter a valid numeric client ID.");
      return;
    }
    loadDocuments(clientId);
  }

  async function handleAttach(e: FormEvent) {
    e.preventDefault();
    if (loadedClientId == null) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: loadedClientId, name, url, type: docType }),
      });
      const data = await res.json();
      if (data.success) {
        setName("");
        setUrl("");
        setDocType("");
        setSuccess("Document attached.");
        await loadDocuments(loadedClientId);
      } else {
        setError(data.message || "Failed to attach document.");
      }
    } catch {
      setError("Failed to attach document.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-deep)] text-[var(--text-primary)] border border-indigo-cathedral/10 focus:border-teal-cathedral/50 focus:outline-none transition-colors";

  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">Admin</div>
            <h1 className="text-3xl font-light text-[var(--text-primary)]">Client Documents</h1>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="px-4 py-2 rounded-lg text-sm text-teal-cathedral/70 border border-teal-cathedral/20 hover:border-teal-cathedral/40 hover:text-teal-cathedral transition-all"
          >
            Back to Dashboard
          </button>
        </div>

        <form onSubmit={handleLoad} className="cathedral-surface p-4 flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-[var(--text-muted)] block mb-1">Portal Client ID</label>
            <input
              type="number"
              value={clientIdInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientIdInput(e.target.value)}
              placeholder="e.g. 42"
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-teal-cathedral text-white hover:bg-teal-cathedral/90 transition-all"
          >
            Load
          </button>
        </form>

        {error && <div className="text-sm text-red-400">{error}</div>}
        {success && <div className="text-sm text-emerald-400">{success}</div>}
        {loading && <div className="text-sm text-[var(--text-muted)]">Loading...</div>}

        {loadedClientId != null && !loading && (
          <>
            <form onSubmit={handleAttach} className="cathedral-surface p-4 space-y-3">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Attach a document for Client #{loadedClientId}
              </div>
              <input
                type="text"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="Document name (e.g. Policy Summary)"
                required
                className={inputClass}
              />
              <input
                type="url"
                value={url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                placeholder="https://... document URL"
                required
                className={inputClass}
              />
              <input
                type="text"
                value={docType}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDocType(e.target.value)}
                placeholder="Type (optional, e.g. PDF)"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={submitting || !name.trim() || !url.trim()}
                className="ml-auto block px-4 py-2 rounded-lg text-sm font-medium bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? "Attaching..." : "Attach Document"}
              </button>
            </form>

            {documents.length === 0 ? (
              <div className="cathedral-surface p-8 text-center">
                <p className="text-[var(--text-muted)] text-sm">No documents for this client yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc: Doc) => (
                  <div key={doc.id} className="cathedral-surface p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">{doc.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {doc.type || "Document"} · {new Date(doc.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-cathedral hover:text-teal-cathedral/80 transition-colors"
                    >
                      Open
                    </a>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
