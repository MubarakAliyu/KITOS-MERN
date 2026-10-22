"use client";

import { MonitorOff, CalendarX, Video } from "lucide-react";

// Per-tab empty state. Icon + title + hint follow the dashed-border pattern
// used elsewhere (e.g. the courses page EmptyState).
const EMPTY = {
  live: {
    icon: MonitorOff,
    title: "No live sessions right now",
    hint: "Check back when your instructor starts a class.",
  },
  upcoming: {
    icon: CalendarX,
    title: "No upcoming sessions scheduled",
    hint: "Your instructor will schedule sessions soon.",
  },
  completed: {
    icon: Video,
    title: "No past sessions yet",
    hint: "Completed sessions and recordings will appear here.",
  },
  all: {
    icon: Video,
    title: "No sessions yet",
    hint: "Live classes and recordings will show up here.",
  },
};

export default function SessionEmptyState({ tab = "all" }) {
  const cfg = EMPTY[tab] ?? EMPTY.all;
  const Icon = cfg.icon;

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <Icon className="h-7 w-7" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{cfg.title}</p>
      <p className="max-w-xs text-xs text-[var(--text-secondary)]">{cfg.hint}</p>
    </div>
  );
}
