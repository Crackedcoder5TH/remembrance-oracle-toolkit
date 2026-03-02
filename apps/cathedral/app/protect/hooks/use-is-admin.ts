"use client";

import { useState, useEffect } from "react";

/** Check if the current user has an active admin session. */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/admin/check")
      .then((res) => res.json())
      .then((data) => setIsAdmin(data.admin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  return isAdmin;
}
