"use client";

import { motion } from "motion/react";

const LEVELS = [
  { label: "", color: "transparent" },
  { label: "Weak", color: "#EF4444" },
  { label: "Fair", color: "#F59E0B" },
  { label: "Good", color: "#3B82F6" },
  { label: "Strong", color: "#10B981" },
];

export function scorePassword(value) {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value) && value.length >= 12) score += 1;
  return Math.min(score, 4);
}

export default function PasswordStrengthBar({ value = "" }) {
  const score = scorePassword(value);
  const meta = LEVELS[score];

  return (
    <div aria-live="polite">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((slot) => (
          <div key={slot} className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
            <motion.div
              initial={false}
              animate={{
                width: slot <= score ? "100%" : "0%",
                backgroundColor: slot <= score ? meta.color : "transparent",
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full"
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 h-4 text-xs font-medium" style={{ color: meta.color }}>
        {meta.label}
      </div>
    </div>
  );
}
