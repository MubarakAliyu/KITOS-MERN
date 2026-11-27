"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Archive,
  ArchiveRestore,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createTrack,
  deleteTrack,
  getTracks,
  updateTrack,
} from "@/_lib/api/courses";
import { apiErrorMessage, apiFieldErrors } from "@/_lib/api/errors";

/**
 * Programme tracks, as something an administrator manages.
 *
 * They were three strings hard-coded in four React forms and again in the
 * server's constants, so opening a track — which is a decision a centre
 * manager makes, not a developer — meant editing five files and deploying.
 *
 * Three verbs, deliberately not four. A track can be created, renamed and
 * archived; it can only be *deleted* while nothing points at it, and the API
 * refuses the rest with the counts. Deleting a track that courses and
 * students are filed under would leave those records naming something that
 * no longer exists, and archiving is what "we do not run this any more"
 * actually means: it disappears from the forms and stays on the history.
 */
export default function AdminTracksPage() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const rows = await getTracks({ includeArchived: true });
    setTracks(rows);
    return rows;
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {
        if (!cancelled) setError("Couldn't load the programme tracks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleArchiveToggle(track) {
    const next = track.status === "archived" ? "active" : "archived";
    setBusyId(track.id);
    try {
      const saved = await updateTrack(track.id, { status: next });
      setTracks((list) => list.map((t) => (t.id === saved.id ? saved : t)));
      toast.success(
        next === "archived"
          ? `${saved.name} archived — it is no longer offered on new courses`
          : `${saved.name} is available again`
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Couldn't update the track"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(track) {
    if (
      !window.confirm(
        `Delete the ${track.name} track? This cannot be undone.`
      )
    ) {
      return;
    }
    setBusyId(track.id);
    try {
      await deleteTrack(track.id);
      setTracks((list) => list.filter((t) => t.id !== track.id));
      toast.success(`${track.name} deleted`);
    } catch (error) {
      // The API answers 409 with the counts and tells them to archive it
      // instead, which is more use than anything this screen could guess.
      toast.error(apiErrorMessage(error, "Couldn't delete the track"), {
        duration: 8000,
      });
    } finally {
      setBusyId(null);
    }
  }

  const active = tracks.filter((t) => t.status !== "archived");
  const archived = tracks.filter((t) => t.status === "archived");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Programme Tracks
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            The tracks courses and students are filed under. Every course form
            offers the active ones.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New Track
        </button>
      </header>

      {loading ? (
        <div className="grid place-items-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[#10B981]" />
        </div>
      ) : error ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-500">
          {error}
        </p>
      ) : (
        <>
          <TrackList
            tracks={active}
            busyId={busyId}
            onEdit={setEditing}
            onArchiveToggle={handleArchiveToggle}
            onDelete={handleDelete}
            emptyMessage="No active tracks. Add one to start filing courses under it."
          />

          {archived.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                Archived
              </h2>
              <TrackList
                tracks={archived}
                busyId={busyId}
                onEdit={setEditing}
                onArchiveToggle={handleArchiveToggle}
                onDelete={handleDelete}
              />
            </section>
          )}
        </>
      )}

      <TrackFormModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onSaved={(created) => setTracks((list) => [...list, created])}
      />

      <TrackFormModal
        isOpen={Boolean(editing)}
        track={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) =>
          setTracks((list) => list.map((t) => (t.id === saved.id ? saved : t)))
        }
      />
    </div>
  );
}

function TrackList({
  tracks,
  busyId,
  onEdit,
  onArchiveToggle,
  onDelete,
  emptyMessage,
}) {
  if (tracks.length === 0) {
    return emptyMessage ? (
      <p className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-card)] p-6 text-center text-sm text-[var(--text-secondary)]">
        {emptyMessage}
      </p>
    ) : null;
  }

  return (
    <ul className="flex flex-col gap-2">
      {tracks.map((track) => {
        const busy = busyId === track.id;
        const archived = track.status === "archived";
        return (
          <li
            key={track.id}
            data-testid="track-row"
            data-track-slug={track.slug}
            className="flex flex-col gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:flex-row sm:items-center"
          >
            <div
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                archived
                  ? "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
                  : "bg-[#10B981]/10 text-[#10B981]"
              }`}
            >
              <Layers className="h-5 w-5" strokeWidth={2.2} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-[var(--text-primary)]">
                  {track.name}
                </p>
                <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                  {track.slug}
                </span>
                {archived && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 font-mono-ui">
                    Archived
                  </span>
                )}
              </div>
              {track.description && (
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                  {track.description}
                </p>
              )}
              <p className="mt-1 text-xs text-[var(--text-muted)] font-mono-ui">
                {track.courses_count} course
                {track.courses_count === 1 ? "" : "s"} ·{" "}
                {track.students_count} student
                {track.students_count === 1 ? "" : "s"}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onEdit(track)}
                disabled={busy}
                title="Rename this track"
                aria-label={`Edit ${track.name}`}
                className="grid h-9 w-9 place-items-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onArchiveToggle(track)}
                disabled={busy}
                title={archived ? "Make available again" : "Archive this track"}
                aria-label={`${archived ? "Restore" : "Archive"} ${track.name}`}
                className="grid h-9 w-9 place-items-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
              >
                {archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => onDelete(track)}
                disabled={busy || track.in_use}
                title={
                  track.in_use
                    ? "In use by courses or students — archive it instead"
                    : "Delete this track"
                }
                aria-label={`Delete ${track.name}`}
                className="grid h-9 w-9 place-items-center rounded-xl text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** One form for both verbs: a new track, or a rename of an existing one. */
function TrackFormModal({ isOpen, track, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldError, setFieldError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(track?.name ?? "");
    setDescription(track?.description ?? "");
    setFieldError(null);
    setSubmitting(false);
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, track, onClose]);

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setFieldError("A track name of at least 2 characters is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = { name: trimmed, description: description.trim() };
      const saved = track
        ? await updateTrack(track.id, payload)
        : await createTrack(payload);
      toast.success(track ? "Track saved" : `${saved.name} added`);
      onSaved?.(saved);
      onClose?.();
    } catch (error) {
      const fields = apiFieldErrors(error);
      if (fields.name) setFieldError(fields.name);
      toast.error(
        apiErrorMessage(error, track ? "Couldn't save the track" : "Couldn't add the track")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={track ? "Edit track" : "New track"}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {track ? "Edit Track" : "New Programme Track"}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col gap-4 px-5 py-5"
            >
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="track-name"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Track Name
                </label>
                <input
                  id="track-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFieldError(null);
                  }}
                  placeholder="e.g. Drone Engineering"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
                {fieldError && (
                  <p className="text-xs font-medium text-red-500 font-mono-ui">
                    {fieldError}
                  </p>
                )}
                {track && (
                  <p className="text-[11px] text-[var(--text-muted)] font-mono-ui">
                    Filed under {track.slug}. Renaming keeps every course and
                    student where they are.
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="track-description"
                  className="text-sm font-semibold text-[var(--text-primary)]"
                >
                  Description
                </label>
                <textarea
                  id="track-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Who this track is for"
                  className="w-full resize-y rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
                />
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-secondary)] disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {track ? "Save Track" : "Add Track"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
