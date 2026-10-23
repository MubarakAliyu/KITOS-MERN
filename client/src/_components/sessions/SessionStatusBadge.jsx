"use client";

import { statusMeta } from "@/_lib/utils/sessions";

// Small pill badge for a session's status. LIVE renders the pulsing dot; the
// others show their lucide icon. Colours come from statusMeta; the surface is
// a translucent tint of that colour so it reads correctly in light + dark.
export default function SessionStatusBadge({ status, size = "sm" }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  const pad = size === "lg" ? "px-3 py-1 text-[11px]" : "px-2.5 py-0.5 text-[10px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider font-mono-ui ${pad}`}
      style={{ color: meta.color, backgroundColor: `${meta.color}1a` }}
    >
      {meta.dot ? (
        <span className="live-dot" aria-hidden="true" />
      ) : (
        <Icon className="h-3 w-3" strokeWidth={2.5} />
      )}
      {meta.label}
    </span>
  );
}
