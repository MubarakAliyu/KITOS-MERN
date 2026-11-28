"use client";

import { useEffect, useState } from "react";
import { getTracks } from "@/_lib/api/courses";

/**
 * The programme tracks a form may offer, from the API.
 *
 * Four forms — new course, edit course, new user, a parent adding a child —
 * each held their own copy of `["Scratch Programming", "Web Development",
 * "Robotics Basics"]`. Three strings, four times, and a fifth copy in the
 * server's constants. Opening a track therefore meant a code change, and the
 * copies had already drifted: the server stores `robotics` and calls it
 * "Robotics", while every form said "Robotics Basics".
 *
 * The names are returned as the API spells them, so a rename reaches the
 * forms on the next load.
 *
 * `fallback` is what to offer if the request fails — the tracks this
 * programme has always run. A form that cannot reach the API is still a form
 * someone is trying to submit, and an empty `<select>` would block them
 * entirely over a request the server will validate anyway.
 */
const FALLBACK = ["Scratch Programming", "Web Development", "Robotics"];

export function useTracks({ enabled = true } = {}) {
  const [tracks, setTracks] = useState([]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // No setState before the request: `settled` already starts false, and
    // setting state in the body of an effect costs a second render pass for
    // nothing (and React warns about exactly that).
    getTracks()
      .then((rows) => {
        if (cancelled) return;
        const names = (Array.isArray(rows) ? rows : [])
          .map((row) => row?.name)
          .filter((name) => typeof name === "string" && name !== "");
        setTracks(names.length > 0 ? names : FALLBACK);
      })
      .catch(() => {
        if (!cancelled) setTracks(FALLBACK);
      })
      .finally(() => {
        if (!cancelled) setSettled(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { tracks, loading: enabled && !settled };
}
