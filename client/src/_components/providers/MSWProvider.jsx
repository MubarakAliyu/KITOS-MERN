"use client";

import { useEffect, useState } from "react";

// Mock Service Worker is an offline design aid, not a runtime dependency.
// It starts only when NEXT_PUBLIC_API_MOCKING is exactly "enabled"; in every
// other case — including unset, and always in production — this provider is a
// pass-through and the app talks to the real KITOS API.
//
// NEXT_PUBLIC_* values are inlined at build time, so when mocking is off the
// import below is unreachable and the worker never reaches the bundle.
const MOCKING_ENABLED = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

// Module-level singleton — survives provider re-mounts so the loader only
// ever appears once per browser session. Without this, navigating between
// pages that re-mount this provider (e.g. via fast-refresh in dev) would
// flash the boot screen each time.
let mswStarted = false;

// Single source of truth for browser MSW boot. Gates the app until
// `worker.start()` resolves so no client API call escapes to the network
// before the handlers are registered.
export function MSWProvider({ children }) {
  const [ready, setReady] = useState(!MOCKING_ENABLED || mswStarted);

  useEffect(() => {
    if (!MOCKING_ENABLED || mswStarted) {
      setReady(true);
      return;
    }

    let cancelled = false;

    async function startWorker() {
      try {
        const { worker } = await import("@/_lib/mocks/browser");
        await worker.start({
          onUnhandledRequest: "bypass",
          serviceWorker: { url: "/mockServiceWorker.js" },
        });
        mswStarted = true;
      } catch (err) {
        // Surface in console but unblock the app — better to render with
        // failed mocks than to leave the user staring at a loader.
        console.warn("MSW failed to start:", err);
        mswStarted = true;
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    startWorker();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0B1220",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            color: "#10B981",
            fontFamily: "monospace",
            fontSize: 13,
            opacity: 0.7,
          }}
        >
          Starting mock environment...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
