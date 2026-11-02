"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, QrCode } from "lucide-react";
import { minutesSince, minutesRemaining } from "@/_lib/utils/sessions";
import { checkInToSession } from "@/_lib/api/sessions";
import CheckInModal from "@/_components/sessions/CheckInModal";

// Prominent, urgent banner shown at the very top of the student dashboard when
// a session is live. Renders nothing when there is no live session (no empty
// space). The pulsing dot + red surface signal urgency; "Join Now" opens the
// join URL in a new tab.
export default function LiveSessionBanner({ session }) {
  const [scanOpen, setScanOpen] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);

  if (!session || session.status !== "live") return null;

  const started = minutesSince(session.scheduled_at);
  const remaining = minutesRemaining(session.scheduled_at, session.duration_minutes);

  // A physical class has nothing to join, so it only offers the scan.
  const canJoin = Boolean(session.join_url);

  /**
   * Joining an online class marks the pupil present automatically (FR13):
   * opening the meeting *is* the attendance, so making them scan as well
   * would be busywork.
   *
   * The link is not blocked on the request. Attendance failing must not stop
   * a child getting into their lesson, and the instructor can always correct
   * the register afterwards.
   */
  function handleJoin() {
    toast.success("Joining session…", {
      description: session.title,
      duration: 2500,
    });

    checkInToSession(session.id, { method: "auto" })
      .then(() => setCheckedIn(true))
      .catch(() => {
        // Quiet: they are in the lesson, which is what matters.
      });
  }

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl border p-6 sm:p-7"
        style={{
          borderColor: "rgba(220,38,38,0.35)",
          background:
            "linear-gradient(135deg, rgba(220,38,38,0.18) 0%, rgba(220,38,38,0.06) 55%, transparent 100%)",
        }}
      >
        {/* Ambient glow */}
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#DC2626]/20 blur-3xl"
        />

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#DC2626] px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white font-mono-ui">
              <span className="live-dot" style={{ background: "#fff" }} aria-hidden="true" />
              Live Session
            </span>

            <h2 className="text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
              {session.title}
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">{session.course}</p>
            <p className="text-xs text-[var(--text-muted)] font-mono-ui">
              Instructor: {session.instructor_name}
              {session.session_number ? ` · Week ${session.session_number}` : ""}
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {canJoin && (
              <a
                href={session.join_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleJoin}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#10B981] px-6 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#059669] sm:w-auto"
              >
                Join Now <ArrowRight className="h-4 w-4" />
              </a>
            )}

            <button
              type="button"
              onClick={() => setScanOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#10B981] px-6 py-2.5 text-sm font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10 sm:w-auto"
            >
              <QrCode className="h-4 w-4" />
              {checkedIn ? "Checked in" : "Scan to check in"}
            </button>

            <p className="text-center text-[11px] text-[var(--text-muted)] font-mono-ui sm:text-right">
              Started {started} min ago · {remaining} min remaining
            </p>
          </div>
        </div>
      </motion.section>

      <CheckInModal
        isOpen={scanOpen}
        onClose={() => setScanOpen(false)}
        session={session}
        onCheckedIn={() => setCheckedIn(true)}
      />
    </>
  );
}
