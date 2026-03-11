"use client";

import { useState, useEffect } from "react";

interface PortalUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

export function usePortalSession() {
  const [user, setUser] = useState<PortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/session")
      .then((res) => {
        if (!res.ok) throw new Error("Not authenticated");
        return res.json();
      })
      .then((data) => {
        if (data.authenticated) setUser(data.user);
      })
      .catch(() => {
        // Not logged in — that's fine
      })
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
