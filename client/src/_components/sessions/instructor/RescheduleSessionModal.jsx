"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { rescheduleSession } from "@/_lib/api/sessions";
import ModalShell from "./ModalShell";

const pad = (n) => String(n).padStart(2, "0");
const todayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function RescheduleSessionModal({ isOpen, onClose, session, onDone }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && session) {
      const d = new Date(session.scheduled_at);
      setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
      setError("");
    }
  }, [isOpen, session]);

  async function handleReschedule() {
    if (!date || !time) {
      setError("Pick a new date and time");
      return;
    }
    const when = new Date(`${date}T${time}`);
    if (when.getTime() < Date.now()) {
      setError("New date & time must be in the future");
      return;
    }
    setSaving(true);
    try {
      const updated = await rescheduleSession(session.id, when.toISOString());
      toast.success("Session rescheduled");
      onDone?.(updated);
      onClose?.();
    } catch {
      toast.error("Couldn't reschedule session");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;
  const current = new Date(session.scheduled_at);

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Reschedule Session">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">“{session.title}”</p>
          <p className="text-xs text-[var(--text-secondary)] font-mono-ui">
            Currently: {format(current, "EEE, MMM d")} · {format(current, "h:mm a")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rs-date" className="text-sm font-semibold text-[var(--text-primary)]">New Date</label>
            <input
              id="rs-date"
              type="date"
              min={todayDate()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rs-time" className="text-sm font-semibold text-[var(--text-primary)]">New Time</label>
            <input
              id="rs-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
            />
          </div>
        </div>
        {error && <p className="text-xs font-medium text-red-500 font-mono-ui">{error}</p>}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleReschedule}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Reschedule
        </button>
      </footer>
    </ModalShell>
  );
}
