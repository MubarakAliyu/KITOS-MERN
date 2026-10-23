"use client";

import { motion } from "motion/react";

export function TypingIndicator({ participantName }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-end gap-2 px-1 py-2"
    >
      <div className="h-8 w-8 shrink-0" aria-hidden="true" />
      <div className="flex flex-col items-start">
        <div className="rounded-2xl rounded-bl-sm border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-3">
          <div className="flex items-end gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                animate={{ y: [0, -6, 0] }}
                transition={{
                  duration: 0.6,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
                className="h-2 w-2 rounded-full bg-[var(--text-muted)]"
              />
            ))}
          </div>
        </div>
        <span className="mt-1 px-1 text-xs text-[var(--text-muted)]">
          {participantName} is typing…
        </span>
      </div>
    </motion.div>
  );
}
