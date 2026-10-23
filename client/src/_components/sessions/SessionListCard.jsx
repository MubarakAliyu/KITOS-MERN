"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowRight, CalendarPlus, Play, Clock, User, CalendarDays } from "lucide-react";
import { useCountdown } from "@/_hooks/useCountdown";
import {
  formatDuration,
  minutesSince,
  minutesRemaining,
  googleCalendarUrl,
} from "@/_lib/utils/sessions";
import SessionStatusBadge from "./SessionStatusBadge";

// Larger session card used on the Online Classes list page. Renders
// status-specific timing text + a status-specific primary action.
export default function SessionListCard({ session, index = 0 }) {
  const router = useRouter();
  const { status } = session;
  const date = new Date(session.scheduled_at);
  const cancelled = status === "cancelled";

  const goToDetail = () => router.push(`/student/sessions/${session.id}`);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
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
      className="flex cursor-pointer flex-col gap-4 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#10B981]/40 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SessionStatusBadge status={status} size="lg" />
        {session.session_number != null && (
          <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
            Week {session.session_number}
          </span>
        )}
      </div>

      <div>
        <h3
          className={`text-lg font-bold text-[var(--text-primary)] ${
            cancelled ? "line-through opacity-70" : ""
          }`}
        >
          {session.title}
        </h3>
      </div>

      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <Row label="Course" value={session.course} />
        <Row label="Instructor" value={session.instructor_name} icon={User} />
        <Row
          label="Date"
          value={`${format(date, "EEE, MMM d")} · ${format(date, "h:mm a")}`}
          icon={CalendarDays}
        />
        <Row
          label="Duration"
          value={formatDuration(session.duration_minutes)}
          icon={Clock}
        />
      </dl>

      <TimingLine session={session} />

      <div className="mt-auto flex justify-end">
        <SessionAction session={session} />
      </div>
    </motion.article>
  );
}

function Row({ label, value, icon: Icon }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
        {label}
      </span>
      <span className="inline-flex items-center gap-1 text-[var(--text-primary)]">
        {Icon && <Icon className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
        {value}
      </span>
    </div>
  );
}

function TimingLine({ session }) {
  const { status } = session;
  const date = new Date(session.scheduled_at);
  const { label } = useCountdown(session.scheduled_at);

  if (status === "live") {
    const started = minutesSince(session.scheduled_at);
    const remaining = minutesRemaining(session.scheduled_at, session.duration_minutes);
    return (
      <p className="text-sm font-semibold text-[#DC2626] font-mono-ui">
        Started {started} min ago · {remaining} min remaining
      </p>
    );
  }

  if (status === "scheduled") {
    return (
      <p className="text-sm font-mono-ui">
        <span className="text-[var(--text-secondary)]">Starts in: </span>
        <span className="font-bold text-[#10B981]">{label ?? "—"}</span>
      </p>
    );
  }

  if (status === "completed") {
    return (
      <p className="text-sm text-[var(--text-secondary)] font-mono-ui">
        Held {formatDistanceToNow(date, { addSuffix: true })}
      </p>
    );
  }

  if (status === "cancelled") {
    return (
      <p className="text-sm text-[#EF4444] font-mono-ui">
        This session was cancelled by the instructor
      </p>
    );
  }

  return null;
}

function SessionAction({ session }) {
  const { status } = session;

  if (status === "live") {
    return (
      <a
        href={session.join_url || "#"}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.stopPropagation();
          toast.success("Joining session…", { description: session.title });
        }}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#059669]"
      >
        Join Now <ArrowRight className="h-4 w-4" />
      </a>
    );
  }

  if (status === "scheduled") {
    return (
      <a
        href={googleCalendarUrl(session)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981]"
      >
        <CalendarPlus className="h-4 w-4" /> Add to Calendar
      </a>
    );
  }

  if (status === "completed") {
    if (session.recording_url) {
      return (
        <a
          href={session.recording_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
        >
          Watch Recording <Play className="h-4 w-4" fill="currentColor" />
        </a>
      );
    }
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--border-color)] px-5 py-2.5 text-sm font-medium text-[var(--text-muted)]">
        Recording not available
      </span>
    );
  }

  return null;
}
