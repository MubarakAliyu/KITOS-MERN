"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { format, isToday, isTomorrow } from "date-fns";
import { Video, Clock, User, ArrowRight } from "lucide-react";
import { useCountdown } from "@/_hooks/useCountdown";
import { formatDuration } from "@/_lib/utils/sessions";
import SessionStatusBadge from "./SessionStatusBadge";

// Friendly date label: "Today", "Tomorrow", or "Mon, Jul 7".
function friendlyDate(date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

// "Online Classes" dashboard panel — a compact grid of upcoming (scheduled)
// session cards, each with a live-ticking countdown. Renders nothing when
// there are no upcoming sessions so it doesn't leave an empty shell.
export default function UpcomingSessionsPanel({ sessions }) {
  const upcoming = (sessions ?? [])
    .filter((s) => s.status === "scheduled")
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));

  if (upcoming.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6"
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#10B981]/10 text-[#10B981]">
            <Video className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Online Classes
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Your upcoming live sessions
            </p>
          </div>
        </div>
        <Link
          href="/student/sessions"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#10B981] transition-colors hover:text-[#059669] font-mono-ui"
        >
          See All <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {upcoming.map((s, i) => (
          <UpcomingSessionCard key={s.id} session={s} index={i} />
        ))}
      </div>
    </motion.section>
  );
}

function UpcomingSessionCard({ session, index }) {
  const router = useRouter();
  const date = new Date(session.scheduled_at);
  const { label, done } = useCountdown(session.scheduled_at);

  const goToDetail = () => router.push(`/student/sessions/${session.id}`);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06 }}
      whileHover={{ y: -3 }}
      role="link"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
      className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
    >
      <div className="flex items-center justify-between gap-2">
        <SessionStatusBadge status={session.status} />
        {session.session_number != null && (
          <span className="rounded-md bg-[var(--bg-card)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
            Week {session.session_number}
          </span>
        )}
      </div>

      <div>
        <h4 className="text-sm font-bold text-[var(--text-primary)]">{session.title}</h4>
        <p className="text-xs text-[var(--text-secondary)]">{session.course}</p>
      </div>

      <div className="flex flex-col gap-1 text-xs text-[var(--text-muted)] font-mono-ui">
        <span>
          {friendlyDate(date)} · {format(date, "h:mm a")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {formatDuration(session.duration_minutes)}
        </span>
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" /> {session.instructor_name}
        </span>
      </div>

      <div className="mt-auto border-t border-[var(--border-color)] pt-2">
        <p className="text-[11px] text-[var(--text-secondary)] font-mono-ui">Starts in</p>
        <p
          className="text-sm font-bold font-mono-ui"
          style={{ color: done ? "#DC2626" : "#10B981" }}
        >
          {label ?? "—"}
        </p>
      </div>
    </motion.article>
  );
}
