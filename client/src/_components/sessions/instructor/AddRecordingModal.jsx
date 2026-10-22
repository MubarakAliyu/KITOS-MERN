"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { addRecording } from "@/_lib/api/sessions";
import ModalShell from "./ModalShell";

const SOURCES = ["youtube", "zoom", "other"];

export default function AddRecordingModal({ isOpen, onClose, session, onDone }) {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("youtube");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrl("");
      setSource("youtube");
      setError("");
    }
  }, [isOpen]);

  async function handleSave() {
    const trimmed = url.trim();
    try {
      // Validate URL format.
      new URL(trimmed);
    } catch {
      setError("Enter a valid recording URL");
      return;
    }
    setSaving(true);
    try {
      const updated = await addRecording(session.id, { url: trimmed, source });
      toast.success("Recording added");
      onDone?.(updated);
      onClose?.();
    } catch {
      toast.error("Couldn't add recording");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title="Add Session Recording">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rec-url" className="text-sm font-semibold text-[var(--text-primary)]">
            Recording URL
          </label>
          <input
            id="rec-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
          {error && <p className="text-xs font-medium text-red-500 font-mono-ui">{error}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Source</span>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((s) => (
              <label
                key={s}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm capitalize transition-colors ${
                  source === s
                    ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
                    : "border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
                }`}
              >
                <input
                  type="radio"
                  name="rec-source"
                  value={s}
                  checked={source === s}
                  onChange={() => setSource(s)}
                  className="h-4 w-4 accent-[#10B981]"
                />
                {s}
              </label>
            ))}
          </div>
        </div>
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
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Recording
        </button>
      </footer>
    </ModalShell>
  );
}
