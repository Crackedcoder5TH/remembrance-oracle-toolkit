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
}

const STORAGE_KEY_PREFIX = "uploaded-image-";

export function ImageUpload({ slot, fallback, className = "", imgClassName = "", alt = "Uploaded image" }: ImageUploadProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load saved image URL from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PREFIX + slot);
    if (saved) {
      // Append cache-buster so browser reloads the image after re-upload
      setImageUrl(saved + "?t=" + Date.now());
    }
  }, [slot]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("slot", slot);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error || "Upload failed");
        return;
      }
      const { url } = await res.json();
      localStorage.setItem(STORAGE_KEY_PREFIX + slot, url);
      setImageUrl(url + "?t=" + Date.now());
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

      {/* Upload overlay — visible on hover */}
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
