"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";

// Bounces users with `must_reset_password === true` to /force-reset-password
// before any dashboard renders. Mounted inside DashboardLayout so the public
// auth pages aren't affected.
export default function ForceResetGuard({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (
      session?.user?.must_reset_password &&
      pathname !== "/force-reset-password"
    ) {
      router.replace("/force-reset-password");
    }
  }, [session, status, pathname, router]);

  return children;
}
