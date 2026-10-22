"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { format, isToday, isTomorrow } from "date-fns";
import { ArrowRight, AlertTriangle } from "lucide-react";
import { getAdminSessionsOverview } from "@/_lib/api/sessions";

// "Online Classes" summary widget for the admin dashboard. Read-only glance at
// live/upcoming/attendance + the next session and any recording gaps.
export default function AdminSessionsWidget() {
  const [data, setData] = useState(null);

  useEffect(() => {
    getAdminSessionsOverview()
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const live = (data?.sessions ?? []).filter((s) => s.status === "live");
  const upcoming = (data?.sessions ?? [])
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const next = upcoming[0];

  function whenLabel(iso) {
    const d = new Date(iso);
    const t = format(d, "h:mm a");
    if (isToday(d)) return `Today ${t}`;
    if (isTomorrow(d)) return `Tomorrow ${t}`;
    return `${format(d, "MMM d")} · ${t}`;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Online Classes</h2>
        <Link
          href="/admin/sessions"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
        >
          View <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {!data ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="skeleton-shimmer h-4 w-2/3 rounded" />
          <div className="skeleton-shimmer h-4 w-1/2 rounded" />
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[var(--text-secondary)] font-mono-ui">
            <span className="inline-flex items-center gap-1.5 font-bold text-[#DC2626]">
              {data.stats.live_now > 0 && <span className="live-dot" aria-hidden="true" />}
              {data.stats.live_now} Live Now
            </span>
            <span aria-hidden="true">·</span>
            <span>{data.stats.upcoming} Upcoming</span>
            <span aria-hidden="true">·</span>
            <span>{data.stats.avg_attendance_pct}% Attendance</span>
          </p>

          {live.length > 0 && (
            <div className="rounded-xl border border-[#DC2626]/30 bg-[#DC2626]/10 px-3 py-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-[#DC2626] font-mono-ui">
                <span className="live-dot" aria-hidden="true" /> {live[0].title}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] font-mono-ui">
                {live[0].instructor_name}
              </p>
            </div>
          )}

          {next && (
            <div className="rounded-xl bg-[var(--bg-secondary)] px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                Next
              </p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{next.title}</p>
              <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
                {whenLabel(next.scheduled_at)} · {next.instructor_name}
              </p>
            </div>
          )}

          {data.stats.missing_recordings > 0 && (
            <Link
              href="/admin/sessions/recordings"
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/15 font-mono-ui"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {data.stats.missing_recordings} session
              {data.stats.missing_recordings === 1 ? "" : "s"} missing recordings
            </Link>
          )}
        </div>
      )}
    </motion.section>
  );
}
