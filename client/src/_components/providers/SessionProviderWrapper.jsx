"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Client wrapper around NextAuth's SessionProvider so it can sit inside
 * a server-rendered layout (which cannot import client hooks directly).
 *
 * Mounted once at the root layout — every route in the app then has
 * useSession(), signIn(), and signOut() available without further setup.
 */
export default function SessionProviderWrapper({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
