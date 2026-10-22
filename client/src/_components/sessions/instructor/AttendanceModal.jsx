"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSessionAttendance } from "@/_lib/api/sessions";
import ModalShell from "./ModalShell";

export default function AttendanceModal({ isOpen, onClose, session }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !session) return;
    setLoading(true);
    getSessionAttendance(session.id)
      .then(setData)
      .finally(() => setLoading(false));
  }, [isOpen, session]);

  function exportCsv() {
    if (!data) return;
    const header = ["Student", "Joined", "Duration (min)", "Attendance %"];
    const lines = data.rows.map((r) =>
      [r.student_name, r.joined_at ?? "—", r.minutes, r.percent].join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${session.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Attendance exported");
  }

  if (!session) return null;

  return (
    <ModalShell isOpen={isOpen} onClose={onClose} title={`Attendance — ${session.title}`} maxWidth="max-w-lg">
      <div className="flex flex-col gap-4 px-5 py-5">
        {loading || !data ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-secondary)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading attendance…
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {data.attended} of {data.total} students attended{" "}
              <span className="text-[#10B981]">({data.percent}%)</span>
            </p>

            <div className="overflow-x-auto rounded-xl border border-[var(--border-color)]">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                    <th className="px-3 py-2 font-semibold">Student</th>
                    <th className="px-3 py-2 font-semibold">Joined</th>
                    <th className="px-3 py-2 font-semibold">Duration</th>
                    <th className="px-3 py-2 font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const absent = !r.joined_at;
                    return (
                      <tr key={r.student_id} className="border-b border-[var(--border-color)] last:border-0">
                        <td className="px-3 py-2 text-[var(--text-primary)]">{r.student_name}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)] font-mono-ui">{r.joined_at ?? "—"}</td>
                        <td className="px-3 py-2 text-[var(--text-secondary)] font-mono-ui">{absent ? "—" : `${r.minutes} min`}</td>
                        <td className="px-3 py-2 font-mono-ui font-bold" style={{ color: absent ? "#EF4444" : r.percent >= 80 ? "#10B981" : "#F59E0B" }}>
                          {r.percent}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <footer className="flex items-center justify-end border-t border-[var(--border-color)] px-5 py-3">
        <button
          type="button"
          onClick={exportCsv}
          disabled={!data}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981] disabled:opacity-60"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </footer>
    </ModalShell>
  );
}
