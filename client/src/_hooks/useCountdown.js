"use client";

import { useEffect, useState } from "react";

// Formats a millisecond duration as "Xd Xh Xm Xs", dropping leading zero
// units. Returns "Starting now…" once the countdown reaches zero.
function formatRemaining(ms) {
  if (ms <= 0) return "Starting now…";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  let text = "";
  if (d > 0) text += `${d}d `;
  if (d > 0 || h > 0) text += `${h}h `;
  text += `${m}m ${s}s`;
  return text;
}

/**
 * Live countdown to a target datetime. Ticks every second and cleans up its
 * interval on unmount / when the target changes.
 *
 * Initial render (server + first client paint) returns `label: null` so there
 * is no hydration mismatch — the ticking value only appears after mount.
 *
 * @param {string|number|Date} target  When the session starts.
 * @returns {{ remaining: number|null, done: boolean, label: string|null }}
 */
export function useCountdown(target) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!target) {
      setRemaining(null);
      return;
    }
    const targetMs = new Date(target).getTime();
    const tick = () => setRemaining(targetMs - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const done = remaining !== null && remaining <= 0;
  return {
    remaining,
    done,
    label: remaining === null ? null : formatRemaining(remaining),
  };
}
