"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  Film,
  Link as LinkIcon,
  Loader2,
  Paperclip,
  Plus,
  Trash2,
  X,
  Video as Youtube,
} from "lucide-react";
import { toast } from "sonner";
import { updateLesson } from "@/_lib/api/lessons";
import RichLessonEditor, {
  PreviewPane,
} from "@/_components/editor/RichLessonEditor";

const CONTENT_TYPES = [
  { key: "video", label: "Video", icon: Film },
  { key: "text", label: "Text", icon: FileText },
  { key: "link", label: "Link", icon: LinkIcon },
  { key: "file", label: "File", icon: Paperclip },
];

function youtubeId(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?\s/]+)/
  );
  return match ? match[1] : null;
}

export default function EditLessonModal({ lesson, onClose, onSaved }) {
  // Local draft. Persisted on Save; rolls back on close-without-save by
  // virtue of being scoped to the modal lifecycle.
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState("text");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [body, setBody] = useState("");
  const [orderIndex, setOrderIndex] = useState(1);
  const [isPublished, setIsPublished] = useState(true);
  const [resources, setResources] = useState([]);
  const [resourceDraft, setResourceDraft] = useState({ name: "", url: "" });
  const [editorMode, setEditorMode] = useState("edit");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!lesson) return;
    setTitle(lesson.title ?? "");
    setContentType(lesson.content_type ?? "text");
    setYoutubeUrl(lesson.youtube_url ?? "");
    setBody(lesson.body_content ?? "");
    setOrderIndex(lesson.order_index ?? 1);
    setIsPublished(lesson.is_published !== false);
    setResources(lesson.resources ?? []);
    setResourceDraft({ name: "", url: "" });
    setEditorMode("edit");
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lesson, onClose]);

  function addResource() {
    if (!resourceDraft.name.trim() || !resourceDraft.url.trim()) {
      toast.error("Resource name and URL are both required");
      return;
    }
    setResources((list) => [
      ...list,
      { id: `r-${Date.now()}`, ...resourceDraft },
    ]);
    setResourceDraft({ name: "", url: "" });
  }

  function removeResource(id) {
    setResources((list) => list.filter((r) => r.id !== id));
  }

  async function handleSave() {
    if (!lesson) return;
    if (title.trim().length < 2) {
      toast.error("Lesson title is required");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        content_type: contentType,
        youtube_url: youtubeUrl.trim(),
        body_content: body,
        order_index: Number(orderIndex) || 1,
        is_published: isPublished,
        resources,
      };
      const saved = await updateLesson(lesson.id, payload);
      toast.success("Lesson saved");
      onSaved?.({ ...lesson, ...payload, ...saved });
      onClose?.();
    } catch {
      toast.error("Couldn't save lesson");
    } finally {
      setSubmitting(false);
    }
  }

  const ytId = youtubeId(youtubeUrl);

  return (
    <AnimatePresence>
      {lesson && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] grid place-items-stretch bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Edit lesson"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-[var(--bg-card)] sm:h-[92vh] sm:rounded-2xl sm:border sm:border-[var(--border-color)] sm:shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider text-[#10B981] font-mono-ui">
                  Edit Lesson
                </p>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled lesson"
                  className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] focus:border-[#10B981] focus:bg-[var(--bg-card)] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <RichLessonEditor
                  value={body}
                  onChange={setBody}
                  externalMode={editorMode}
                  onModeChange={setEditorMode}
                  placeholder="Start writing lesson content..."
                />

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="el-yt"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]"
                  >
                    <Youtube className="h-4 w-4 text-red-500" />
                    YouTube Video URL
                  </label>
                  <input
                    id="el-yt"
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                  />
                  <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                    This video appears at the top of the lesson for students.
                  </p>
                  {ytId && (
                    <a
                      href={`https://www.youtube.com/watch?v=${ytId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-2 self-start rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-1.5 transition-colors hover:bg-[var(--bg-card)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                        alt="YouTube preview"
                        className="h-12 w-20 rounded object-cover"
                      />
                      <span className="text-xs text-[var(--text-secondary)] font-mono-ui">
                        Preview
                      </span>
                    </a>
                  )}
                </div>
              </div>

              {/* Right rail: settings OR student preview when in preview mode */}
              <aside className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] lg:w-80 lg:shrink-0 lg:border-l lg:border-t-0">
                {editorMode === "preview" ? (
                  <StudentPreviewRail
                    title={title}
                    body={body}
                    ytId={ytId}
                  />
                ) : (
                  <SettingsRail
                    contentType={contentType}
                    setContentType={setContentType}
                    orderIndex={orderIndex}
                    setOrderIndex={setOrderIndex}
                    isPublished={isPublished}
                    setIsPublished={setIsPublished}
                    resources={resources}
                    resourceDraft={resourceDraft}
                    setResourceDraft={setResourceDraft}
                    addResource={addResource}
                    removeResource={removeResource}
                  />
                )}
              </aside>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SettingsRail({
  contentType,
  setContentType,
  orderIndex,
  setOrderIndex,
  isPublished,
  setIsPublished,
  resources,
  resourceDraft,
  setResourceDraft,
  addResource,
  removeResource,
}) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Content Type
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {CONTENT_TYPES.map((t) => {
            const active = contentType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setContentType(t.key)}
                aria-pressed={active}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
                    : "border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                }`}
              >
                <t.icon className="h-5 w-5" strokeWidth={2.2} />
                <span className="text-xs font-bold uppercase tracking-wider font-mono-ui">
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Order Index
        </h3>
        <input
          type="number"
          min={1}
          value={orderIndex}
          onChange={(e) => setOrderIndex(e.target.value)}
          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
        />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Status
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={isPublished}
          onClick={() => setIsPublished((v) => !v)}
          className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
            isPublished
              ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]"
              : "border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-card)]"
          }`}
        >
          <span>{isPublished ? "Published" : "Draft"}</span>
          <span
            className={`relative h-5 w-9 rounded-full transition-colors ${
              isPublished
                ? "bg-[#10B981]"
                : "bg-[var(--bg-secondary)] border border-[var(--border-color)]"
            }`}
          >
            <motion.span
              animate={{ x: isPublished ? 18 : 2 }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-sm"
            />
          </span>
        </button>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
          Attached Resources
        </h3>
        {resources.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] font-mono-ui">
            No resources attached.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {resources.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--text-primary)]">
                    {r.name}
                  </p>
                  <p className="truncate text-[var(--text-muted)] font-mono-ui">
                    {r.url}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeResource(r.id)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-500"
                  aria-label="Remove resource"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-3">
          <input
            type="text"
            value={resourceDraft.name}
            onChange={(e) =>
              setResourceDraft((r) => ({ ...r, name: e.target.value }))
            }
            placeholder="Resource name"
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
          <input
            type="url"
            value={resourceDraft.url}
            onChange={(e) =>
              setResourceDraft((r) => ({ ...r, url: e.target.value }))
            }
            placeholder="https://…"
            className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
          />
          <button
            type="button"
            onClick={addResource}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#10B981] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#059669]"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Resource
          </button>
        </div>
      </section>
    </div>
  );
}

function StudentPreviewRail({ title, body, ytId }) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-5">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 font-mono-ui">
        Student View
      </span>
      {ytId && (
        <div className="overflow-hidden rounded-xl">
          <div
            style={{
              position: "relative",
              paddingBottom: "56.25%",
              height: 0,
            }}
          >
            <iframe
              src={`https://www.youtube.com/embed/${ytId}`}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: 0,
              }}
              allowFullScreen
              title={title}
            />
          </div>
        </div>
      )}
      <h1 className="text-lg font-bold text-[var(--text-primary)]">
        {title || "Untitled lesson"}
      </h1>
      <PreviewPane html={body} />
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border-color)] pt-3 text-[10px] text-[var(--text-muted)] font-mono-ui">
        <span>← Previous</span>
        <span>Next →</span>
      </div>
    </div>
  );
}
