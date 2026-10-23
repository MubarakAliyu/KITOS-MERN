"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Home, Zap } from "lucide-react";

// Top-level 404 — used when the user lands on an unmatched route outside the
// dashboard tree (e.g. typo in a marketing URL). Kept session-free so it
// renders for logged-out visitors too.
export default function RootNotFound() {
  const router = useRouter();
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg-primary)] px-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col items-center gap-6"
      >
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#10B981] text-white shadow-sm">
            <Zap className="h-5 w-5" strokeWidth={2.5} fill="currentColor" />
          </span>
          <span className="font-sans text-lg font-bold text-[var(--text-primary)]">
            Kids In Tech
          </span>
          <span className="rounded-md bg-[#10B981] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white font-mono-ui">
            LMS
          </span>
        </div>

        <div className="relative">
          <div className="select-none text-[120px] font-bold leading-none text-[var(--border-color)]">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-[#10B981]/10">
              <Home className="h-9 w-9 text-[#10B981]" strokeWidth={2.2} />
            </div>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Page not found
          </h1>
          <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
            The page you are looking for does not exist.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="inline-flex items-center gap-2 rounded-lg bg-[#10B981] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#059669] active:scale-95"
          >
            <Home className="h-4 w-4" />
            Go to Login
          </button>
        </div>
      </motion.div>
    </main>
  );
}
