"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cancelSession } from "@/_lib/api/sessions";
import ModalShell from "./ModalShell";

export default function CancelSessionModal({ isOpen, onClose, session, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCancel() {
    setSaving(true);
    try {
      const updated = await cancelSession(session.id, reason.trim());
      toast.success("Session cancelled", { description: "Enrolled students will be notified." });
      onDone?.(updated);
      onClose?.();
      setReason("");
    } catch {
      toast.error("Couldn't cancel session");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Cancel Session?">
      <div className="flex flex-col gap-4 px-5 py-5">
        <p className="text-sm text-[var(--text-secondary)]">
          Are you sure you want to cancel{" "}
          <span className="font-semibold text-[var(--text-primary)]">“{session.title}”</span>?
          Enrolled students will be notified.
        </p>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="cancel-reason" className="text-sm font-semibold text-[var(--text-primary)]">
            Reason (optional)
          </label>
          <textarea
            id="cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Let students know why…"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] transition-colors focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)]"
        >
          Keep Session
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#EF4444] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#DC2626] disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Cancel Session
        </button>
      </footer>
    </ModalShell>
  );
}
