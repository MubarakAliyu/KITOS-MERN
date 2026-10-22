"use client";

import { useEffect, useState } from "react";

// Hides children with a navy backdrop until the client has hydrated, then
// flips the wrapper to visible. Same DOM node on both sides — no remount,
// no effect re-fires, no duplicate API calls.
export function MountedProvider({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div
      style={{
        visibility: mounted ? "visible" : "hidden",
        minHeight: "100vh",
        background: "#0B1220",
      }}
    >
      {children}
    </div>
  );
}
