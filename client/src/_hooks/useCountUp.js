"use client";

import { useEffect, useState } from "react";

// Animates a value from 0 → target over `duration` ms. Used by the dashboard
// stat tiles and the quiz score percentage.
export function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!target) {
      setCount(0);
      return;
    }
    let current = 0;
    const step = target / (duration / 16);
    const id = setInterval(() => {
      current += step;
      if (current >= target) {
        setCount(target);
        clearInterval(id);
      } else {
        setCount(Math.floor(current));
      }
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);

  return count;
}
