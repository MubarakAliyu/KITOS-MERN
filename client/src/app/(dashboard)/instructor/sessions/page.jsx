"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { Plus, Pencil, CalendarClock, Ban, Users, Video, CheckCircle } from "lucide-react";
import { getInstructorSessions } from "@/_lib/api/sessions";
import { formatDuration } from "@/_lib/utils/sessions";
import { emitSessionNotification } from "@/_lib/notifications/sessionNotify";
import SessionStatusBadge from "@/_components/sessions/SessionStatusBadge";
import SessionFormModal from "@/_components/sessions/instructor/SessionFormModal";
import CancelSessionModal from "@/_components/sessions/instructor/CancelSessionModal";
import RescheduleSessionModal from "@/_components/sessions/instructor/RescheduleSessionModal";
import AttendanceModal from "@/_components/sessions/instructor/AttendanceModal";
import AddRecordingModal from "@/_components/sessions/instructor/AddRecordingModal";

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

function matchesTab(session, tab) {
  switch (tab) {
    case "upcoming":
      return session.status === "scheduled" || session.status === "live";
    case "completed":
      return session.status === "completed";
    case "cancelled":
      return session.status === "cancelled";
    default:
      return true;
  }
}

export default function InstructorSessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("upcoming");
  const pathname = usePathname();

  // Modal state — `modal` names the open dialog; `active` is the session it acts on.
  const [modal, setModal] = useState(null); // "create" | "edit" | "cancel" | "reschedule" | "attendance" | "recording"
  const [active, setActive] = useState(null);

  function load() {
    setLoading(true);
    getInstructorSessions()
      .then((data) => {
        setSessions(data ?? []);
        // Remind the instructor of their soonest upcoming session via the bell.
        const soon = (data ?? [])
          .filter((s) => s.status === "scheduled")
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
        if (soon) {
          emitSessionNotification(
            "session_starting_soon",
            { ...soon, when: format(new Date(soon.scheduled_at), "MMM d, h:mm a") },
            { role: "instructor" }
          );
        }
      })
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [pathname]);

  const counts = useMemo(
    () => ({
      upcoming: sessions.filter((s) => matchesTab(s, "upcoming")).length,
      completed: sessions.filter((s) => matchesTab(s, "completed")).length,
      cancelled: sessions.filter((s) => matchesTab(s, "cancelled")).length,
      all: sessions.length,
    }),
    [sessions]
  );

  const visible = useMemo(
    () =>
      sessions
        .filter((s) => matchesTab(s, tab))
        .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at)),
    [sessions, tab]
  );

  function openModal(name, session = null) {
    setActive(session);
    setModal(name);
  }
  function closeModal() {
    setModal(null);
    setActive(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Manage Live Sessions</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Create and manage online classes</p>
        </div>
        <button
          type="button"
          onClick={() => openModal("create")}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
        >
          <Plus className="h-4 w-4" /> Create Session
        </button>
      </header>

      {/* Tabs */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const activeTab = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors font-mono-ui ${
                activeTab
                  ? "bg-[#10B981] text-white"
                  : "border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-bold ${activeTab ? "bg-white/20 text-white" : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"}`}>
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <ListSkeleton />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            {visible.length === 0 ? (
              <EmptyState />
            ) : (
              visible.map((s, i) => (
                <InstructorSessionCard
                  key={s.id}
                  session={s}
                  index={i}
                  onEdit={() => openModal("edit", s)}
                  onCancel={() => openModal("cancel", s)}
                  onReschedule={() => openModal("reschedule", s)}
                  onAttendance={() => openModal("attendance", s)}
                  onAddRecording={() => openModal("recording", s)}
                />
              ))
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Modals */}
      <SessionFormModal
        isOpen={modal === "create" || modal === "edit"}
        session={modal === "edit" ? active : null}
        onClose={closeModal}
        onSaved={(saved) => {
          load();
          if (modal === "create" && saved) {
            emitSessionNotification(
              "session_scheduled",
              { ...saved, when: format(new Date(saved.scheduled_at), "MMM d, h:mm a") },
              { role: "instructor" }
            );
          }
        }}
      />
      <CancelSessionModal
        isOpen={modal === "cancel"}
        session={active}
        onClose={closeModal}
        onDone={(updated) => {
          load();
          if (updated) {
            emitSessionNotification(
              "session_cancelled",
              { ...updated, reason: updated.cancellation_reason },
              { role: "instructor" }
            );
          }
        }}
      />
      <RescheduleSessionModal isOpen={modal === "reschedule"} session={active} onClose={closeModal} onDone={load} />
      <AttendanceModal isOpen={modal === "attendance"} session={active} onClose={closeModal} />
      <AddRecordingModal
        isOpen={modal === "recording"}
        session={active}
        onClose={closeModal}
        onDone={(updated) => {
          load();
          if (updated) emitSessionNotification("session_recording_added", updated, { role: "instructor" });
        }}
      />
    </div>
  );
}

function InstructorSessionCard({ session, index, onEdit, onCancel, onReschedule, onAttendance, onAddRecording }) {
  const router = useRouter();
  const { status } = session;
  const date = new Date(session.scheduled_at);
  const cancelled = status === "cancelled";
  const isUpcoming = status === "scheduled" || status === "live";
  const isCompleted = status === "completed";

  const goToDetail = () => router.push(`/instructor/sessions/${session.id}`);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      role="link"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
      className="flex cursor-pointer flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#10B981]/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SessionStatusBadge status={status} />
        {session.session_number != null && (
          <span className="rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono-ui">
            Week {session.session_number}
          </span>
        )}
        <h3 className={`text-base font-bold text-[var(--text-primary)] ${cancelled ? "line-through opacity-70" : ""}`}>
          {session.title}
        </h3>
      </div>

      <p className="text-sm text-[var(--text-secondary)] font-mono-ui">
        {session.course} · {format(date, "EEE, MMM d")} · {format(date, "h:mm a")}
      </p>

      <p className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono-ui">
        {formatDuration(session.duration_minutes)}
        <span aria-hidden="true">·</span>
        {isCompleted ? (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {session.students_attended}/{session.total_students} students attended
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {session.students_joined ?? 0} students joined
          </span>
        )}
      </p>

      {cancelled && session.cancellation_reason && (
        <p className="text-xs text-[#EF4444] font-mono-ui">Reason: {session.cancellation_reason}</p>
      )}

      {/* Actions */}
      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-[var(--border-color)] pt-3">
        {isUpcoming && (
          <>
            <ActionButton icon={Pencil} label="Edit" onClick={onEdit} />
            <ActionButton icon={CalendarClock} label="Reschedule" onClick={onReschedule} />
            <ActionButton icon={Ban} label="Cancel" onClick={onCancel} danger />
          </>
        )}
        {isCompleted && (
          <>
            <ActionButton icon={Users} label="View Attendance" onClick={onAttendance} />
            {!session.recording_url && (
              <ActionButton icon={Video} label="Add Recording" onClick={onAddRecording} />
            )}
            {session.recording_url && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#10B981] font-mono-ui">
                <CheckCircle className="h-3.5 w-3.5" /> Recording added
              </span>
            )}
          </>
        )}
        {isUpcoming && (
          <span className="ml-auto text-xs text-[var(--text-muted)] font-mono-ui">
            Published:{" "}
            <span className={session.is_published ? "text-[#10B981]" : "text-[var(--text-muted)]"}>
              {session.is_published ? "✓ Yes" : "No"}
            </span>
          </span>
        )}
      </div>
    </motion.article>
  );
}

function ActionButton({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors font-mono-ui ${
        danger
          ? "border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[#EF4444] hover:text-[#EF4444]"
          : "border-[var(--border-color)] text-[var(--text-primary)] hover:border-[#10B981] hover:text-[#10B981]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
          <div className="skeleton-shimmer h-5 w-24 rounded-full" />
          <div className="skeleton-shimmer h-5 w-2/3 rounded" />
          <div className="skeleton-shimmer h-3 w-1/2 rounded" />
          <div className="skeleton-shimmer h-8 w-48 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
        <Video className="h-7 w-7" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">No sessions in this view</p>
      <p className="text-xs text-[var(--text-secondary)]">Create a session to get started.</p>
    </div>
  );
}
