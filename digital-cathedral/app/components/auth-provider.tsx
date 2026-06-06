"use client";

import * as React from "react";
import { SessionProvider } from "next-auth/react";

export function AuthProvider(props: { children?: React.ReactNode }) {
  return <SessionProvider>{props.children}</SessionProvider>;
}
