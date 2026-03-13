"use client";

import { useState, useRef, useEffect, ReactNode } from "react";

interface ImageUploadProps {
  /** Unique slot name for this upload (e.g. "logo", "profile") */
  slot: string;
  /** Fallback content shown when no image is uploaded */
  fallback: ReactNode;
  /** CSS class for the wrapper */
  className?: string;
  /** CSS class for the uploaded image */
  imgClassName?: string;
  /** alt text for the uploaded image */
  alt?: string;
  /** Enable upload UI — only true for authenticated admins */
  editable?: boolean;
}

export function ImageUpload({ slot, fallback, className = "", imgClassName = "", alt = "Uploaded image", editable = false }: ImageUploadProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch the current image URL from the server on mount
  useEffect(() => {
    fetch(`/api/upload?slot=${encodeURIComponent(slot)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          setImageUrl(data.url);
          setImgError(false);
        }
      })
      .catch(() => {
        // Blob store not configured yet — ignore
      });
  }, [slot]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("slot", slot);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setNotification(body?.error || "Upload failed");
        return;
      }
      const { url } = await res.json();
      // Add cache-buster so browser doesn't show a stale/broken cached image
      setImageUrl(`${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`);
      setImgError(false);
    } catch {
      setNotification("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleClick() {
    fileRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  const showImage = imageUrl && !imgError;

  // Read-only mode: just display image or fallback, no upload UI
  if (!editable) {
    return (
      <div className={className}>
        {showImage ? (
          <img src={imageUrl} alt={alt} className={imgClassName} onError={() => setImgError(true)} />
        ) : (
          fallback
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative group cursor-pointer ${className}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Upload ${slot} image`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); } }}
    >
      {showImage ? (
        <img src={imageUrl} alt={alt} className={imgClassName} onError={() => setImgError(true)} />
      ) : (
        fallback
      )}

      {/* Accessible error notification (replaces alert()) */}
      {notification && (
        <div
          role="status"
          aria-live="assertive"
          className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between gap-2 px-3 py-2 text-xs text-red-200 bg-red-900/90 rounded-lg"
        >
          <span>{notification}</span>
          <button
            onClick={(e) => { e.stopPropagation(); setNotification(null); }}
            aria-label="Dismiss notification"
            className="text-red-300 hover:text-white shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Upload overlay — visible on hover (admin only) */}
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-inherit pointer-events-none">
        <span className="text-white text-xs font-medium px-2 py-1 bg-black/60 rounded">
          {uploading ? "Uploading..." : "Upload"}
        </span>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  );
}
