"use client";

import { useMemo } from "react";
import { toRenderableHtml } from "@/_lib/content/lessonContent";

/**
 * Lesson body content, rendered the one way.
 *
 * Used by the student's lesson page, the editor's Preview and Split panes and
 * the preview modal, so that "Student Preview" is a true name for what those
 * panes show. They used to render the same stored string three different ways
 * — as injected HTML, as plain text in a paragraph, and as injected HTML with
 * different styles — which is why Markdown appeared as its own source on the
 * student page while the editor showed it formatted.
 *
 * The class list is the single stylesheet for lesson content. It is long
 * because Tailwind v4 has no typography plugin here and these are the tags a
 * lesson actually contains; keeping it in one component is what stops the
 * three screens drifting again.
 */
const PROSE =
  "max-w-none text-[var(--text-primary)] " +
  "[&>*:first-child]:mt-0 " +
  "[&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-[var(--text-primary)] " +
  "[&_h2]:mb-2.5 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[var(--text-primary)] " +
  "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] " +
  "[&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-semibold " +
  "[&_p]:mb-3 [&_p]:leading-relaxed [&_p]:text-[var(--text-secondary)] " +
  "[&_strong]:font-bold [&_strong]:text-[var(--text-primary)] [&_em]:italic " +
  "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:mb-1 [&_li]:leading-relaxed [&_li]:text-[var(--text-secondary)] " +
  "[&_a]:font-semibold [&_a]:text-[#10B981] [&_a]:underline [&_a]:decoration-[#10B981]/40 hover:[&_a]:decoration-[#10B981] " +
  "[&_code]:rounded [&_code]:bg-[var(--bg-secondary)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono-ui [&_code]:text-[0.9em] [&_code]:text-[#10B981] " +
  "[&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-[#0B1220] [&_pre]:p-4 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px] [&_pre_code]:text-[#e5e7eb] " +
  "[&_blockquote]:mb-3 [&_blockquote]:border-l-4 [&_blockquote]:border-[#10B981]/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-[var(--text-secondary)] " +
  "[&_hr]:my-5 [&_hr]:border-[var(--border-color)] " +
  "[&_img]:mb-3 [&_img]:max-w-full [&_img]:rounded-xl " +
  "[&_table]:mb-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm " +
  "[&_th]:border [&_th]:border-[var(--border-color)] [&_th]:bg-[var(--bg-secondary)] [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold " +
  "[&_td]:border [&_td]:border-[var(--border-color)] [&_td]:px-3 [&_td]:py-2 " +
  // Video embeds: the wrapper the renderer emits, held at 16:9 so the iframe
  // has a height to fill. Any iframe is covered, not only ours, because a
  // lesson saved before this existed carries its own wrapper markup.
  "[&_.lesson-embed]:relative [&_.lesson-embed]:mb-4 [&_.lesson-embed]:h-0 [&_.lesson-embed]:overflow-hidden [&_.lesson-embed]:rounded-xl [&_.lesson-embed]:pb-[56.25%] " +
  "[&_.youtube-embed]:relative [&_.youtube-embed]:mb-4 [&_.youtube-embed]:h-0 [&_.youtube-embed]:overflow-hidden [&_.youtube-embed]:rounded-xl [&_.youtube-embed]:pb-[56.25%] " +
  "[&_iframe]:absolute [&_iframe]:left-0 [&_iframe]:top-0 [&_iframe]:h-full [&_iframe]:w-full [&_iframe]:border-0";

export default function LessonContent({ content, className = "", empty = null }) {
  const html = useMemo(() => toRenderableHtml(content), [content]);

  if (html === "") return empty;

  return (
    <div
      className={`${PROSE} ${className}`.trim()}
      // Sanitised twice over: once by the server before it was stored, and
      // again by `toRenderableHtml` just now, which is what makes the
      // Markdown path safe as well.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
