// Toast notification system — React hook + container
// Non-intrusive success/error/info toasts with slide animation, auto-dismiss, and stacking

import { useState, useCallback } from "react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  exiting?: boolean;
}

const MAX_TOASTS = 5;
const TOAST_DURATION = 2500;
const EXIT_DURATION = 250;

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    }, TOAST_DURATION);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, TOAST_DURATION + EXIT_DURATION);
  }, []);

  return { toasts, addToast };
}

function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}${toast.exiting ? " toast-exiting" : ""}`}
          role="status"
        >
          {toast.type === "success" && <span aria-hidden="true">&#10003; </span>}
          {toast.type === "error" && <span aria-hidden="true">&#10007; </span>}
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export { useToast, ToastContainer };
export type { ToastType, ToastItem };
