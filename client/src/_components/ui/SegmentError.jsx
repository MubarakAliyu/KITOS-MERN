"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * The fallback a dashboard segment shows when a page throws.
 *
 * It exists because one bad field used to take a whole screen with it: the
 * instructor's pupil panel rendered an object where a string was expected,
 * React unmounted the tree, and the result was a blank page reading "This
 * page couldn't load" — the table behind the panel included. With a boundary
 * at the segment, the sidebar, the header and the navigation all survive,
 * and the person can retry or go somewhere else instead of reloading.
 *
 * This is a safety net, not a fix. Anything that lands here is a bug, which
 * is why the error is logged with its digest: a production build minifies
 * React's messages to a number, and the digest is what ties the number in
 * someone's console to the stack on the server.
 *
 * @param {{ error: unknown, retry: () => void }} props
 *   `retry` is this Next version's name for it — older ones called it
 *   `reset`, and using the wrong one gives a dead button rather than an
 *   error, so it is worth being exact about.
 */
export default function SegmentError({ error, retry }) {
  useEffect(() => {
    console.error("Segment error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 text-amber-500">
        <AlertTriangle className="h-7 w-7" strokeWidth={2} />
      </span>

      <div className="max-w-md">
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          This page didn&apos;t load
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Something on it went wrong. The rest of the dashboard still works —
          try again, or pick another page from the menu.
        </p>
        {/*
          The digest, not the message. A production build replaces React's
          text with a number, so the message would read "Minified React error
          #31" to someone who cannot act on it; the digest is what makes the
          report findable in the logs.
        */}
        {error?.digest && (
          <p className="mt-3 text-[11px] text-[var(--text-muted)] font-mono-ui">
            Reference: {error.digest}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => retry?.()}
        className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
      >
        <RotateCw className="h-4 w-4" strokeWidth={2.5} />
        Try again
      </button>
    </div>
  );
}
