"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { getSessions } from "@/_lib/api/sessions";
import SessionListCard from "@/_components/sessions/SessionListCard";
import SessionEmptyState from "@/_components/sessions/SessionEmptyState";

const TABS = [
  { key: "live", label: "Live" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];

const VALID_TABS = TABS.map((t) => t.key);

// Filters + sorts the session list for a given tab.
function filterByTab(sessions, tab) {
  const byDateAsc = (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at);
  const byDateDesc = (a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at);

  switch (tab) {
    case "live":
      return sessions.filter((s) => s.status === "live");
    case "upcoming":
      return sessions.filter((s) => s.status === "scheduled").sort(byDateAsc);
    case "completed":
      return sessions.filter((s) => s.status === "completed").sort(byDateDesc);
    case "all":
    default:
      return [...sessions].sort(byDateDesc);
  }
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("live");
  const pathname = usePathname();

  // Load sessions.
  useEffect(() => {
    setLoading(true);
    getSessions()
      .then((data) => setSessions(data ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [pathname]);

  // Restore the active tab from the URL hash (#live, #upcoming, …) so it
  // survives a refresh / deep link.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (VALID_TABS.includes(hash)) setTab(hash);
  }, []);

  function selectTab(key) {
    setTab(key);
    // Update the hash without adding a history entry or scrolling.
    window.history.replaceState(null, "", `#${key}`);
  }

  const visible = useMemo(() => filterByTab(sessions, tab), [sessions, tab]);

  // Per-tab counts for the pill badges.
  const counts = useMemo(
    () => ({
      live: sessions.filter((s) => s.status === "live").length,
      upcoming: sessions.filter((s) => s.status === "scheduled").length,
      completed: sessions.filter((s) => s.status === "completed").length,
      all: sessions.length,
    }),
    [sessions]
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Online Classes</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Join live sessions and watch recordings
        </p>
      </header>

      {/* Tabs — horizontally scrollable on narrow screens. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className={`relative flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors font-mono-ui ${
                active
                  ? "bg-[#10B981] text-white"
                  : "bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.key === "live" && counts.live > 0 && (
                <span className="live-dot" aria-hidden="true" />
              )}
              {t.label}
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold ${
                  active ? "bg-white/20 text-white" : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <SessionsSkeleton />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {visible.length === 0 ? (
              <SessionEmptyState tab={tab} />
            ) : (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {visible.map((s, i) => (
                  <SessionListCard key={s.id} session={s} index={i} />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function SessionsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6"
        >
          <div className="skeleton-shimmer h-5 w-20 rounded-full" />
          <div className="skeleton-shimmer h-5 w-2/3 rounded" />
          <div className="skeleton-shimmer h-3 w-1/2 rounded" />
          <div className="skeleton-shimmer h-3 w-1/3 rounded" />
          <div className="skeleton-shimmer mt-2 h-9 w-36 self-end rounded-xl" />
        </div>
      ))}
    </div>
  );
}
