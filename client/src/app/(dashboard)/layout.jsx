"use client";

import { Toaster } from "sonner";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import RouteGuard from "@/_components/auth/RouteGuard";
import ForceResetGuard from "@/_components/auth/ForceResetGuard";
import Sidebar from "@/_components/layout/Sidebar";
import Topbar from "@/_components/layout/Topbar";

// SessionProvider is mounted once at the root layout — RouteGuard's
// useSession() reads from there. ForceResetGuard sits inside RouteGuard so it
// only fires once we know we have an authenticated session, and it bounces
// must_reset_password users out before any dashboard UI loads.
export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  return (
    <>
      <RouteGuard>
        <ForceResetGuard>
          <div className="flex h-screen overflow-hidden bg-[var(--bg-secondary)]">
            <Sidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Topbar />
              <AnimatePresence mode="wait">
                <motion.main
                  key={pathname}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="flex-1 overflow-y-auto p-6"
                >
                  {children}
                </motion.main>
              </AnimatePresence>
            </div>
          </div>
        </ForceResetGuard>
      </RouteGuard>
      <Toaster position="top-right" richColors />
    </>
  );
}
