"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import PageSkeleton from "@/_components/ui/PageSkeleton";
import { roleToPath } from "@/_lib/auth/role-routing";

const KNOWN_ROLE_SEGMENTS = new Set(["admin", "instructor", "student", "parent"]);

function getExpectedRole(pathname) {
  const first = pathname.split("/").filter(Boolean)[0];
  return KNOWN_ROLE_SEGMENTS.has(first) ? first : null;
}

export default function RouteGuard({ children }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const expectedRole = getExpectedRole(pathname);
  const userRole = session?.user?.role;
  const roleMismatch =
    !!expectedRole && !!userRole && expectedRole !== userRole;

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }

    if (roleMismatch) {
      router.replace(roleToPath(userRole));
    }
  }, [status, roleMismatch, userRole, router]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "unauthenticated") return <PageSkeleton />;
  if (roleMismatch) return <PageSkeleton />;

  return children;
}
