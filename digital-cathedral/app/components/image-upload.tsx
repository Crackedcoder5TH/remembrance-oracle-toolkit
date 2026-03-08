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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch the current image URL from the server on mount
  useEffect(() => {
    fetch(`/api/upload?slot=${encodeURIComponent(slot)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.url) setImageUrl(data.url);
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
        alert(body?.error || "Upload failed");
        return;
      }
      const { url } = await res.json();
      setImageUrl(url);
    } catch {
      alert("Upload failed. Please try again.");
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

  // Read-only mode: just display image or fallback, no upload UI
  if (!editable) {
    return (
      <div className={className}>
        {imageUrl ? (
          <img src={imageUrl} alt={alt} className={imgClassName} />
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
      {imageUrl ? (
        <img src={imageUrl} alt={alt} className={imgClassName} />
      ) : (
        fallback
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
