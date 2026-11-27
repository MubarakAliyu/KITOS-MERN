import { Track, Course, Student, Cohort } from "../models/index.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { logActivity } from "../lib/audit.js";
import { toPlainText } from "../lib/sanitizeContent.js";
import {
  PROGRAMME_TRACKS,
  PROGRAMME_TRACK_LABELS,
  setTrackRegistry,
  trackNameToSlug,
} from "../config/constants.js";

/**
 * Programme tracks as data (PRD §8.2).
 *
 * Every other service asks `toTrackSlug()` and `toTrackLabel()` for a track,
 * and both read a synchronous registry in `config/constants.js` — they are
 * called from serializers and from a Mongoose instance method, neither of
 * which can await. This service owns that registry: it primes it from the
 * collection at boot and re-primes it after every write, so the cache cannot
 * drift from the rows.
 *
 * The collection stays the authority for *validation*. `assertTrackUsable`
 * reads it, so a course cannot be filed under a track that was archived
 * between the form loading and the form being submitted.
 */

function serializeTrack(track, extra = {}) {
  return {
    id: String(track._id),
    name: track.name,
    slug: track.slug,
    description: track.description ?? "",
    status: track.status,
    created_at: track.created_at,
    ...extra,
  };
}

/** Reloads the slug to label registry from the collection. */
export async function primeTrackRegistry() {
  const tracks = await Track.find({}).sort({ name: 1 }).select("slug name");
  if (tracks.length === 0) return;
  setTrackRegistry(tracks.map((t) => ({ slug: t.slug, name: t.name })));
}

/**
 * Creates the four tracks this programme already runs, if they are missing.
 *
 * Called by the seed and by `ensureTracks` below, so a database that predates
 * the `tracks` collection — every deployed one — gains the rows its courses
 * and students already point at. Idempotent: existing rows are left exactly
 * as they are, names included, because a manager may have renamed one since.
 */
export async function seedDefaultTracks() {
  for (const slug of PROGRAMME_TRACKS) {
    await Track.updateOne(
      { slug },
      {
        $setOnInsert: {
          slug,
          name: PROGRAMME_TRACK_LABELS[slug],
          status: "active",
        },
      },
      { upsert: true }
    );
  }
  await primeTrackRegistry();
}

/** Turns a slug back into words, for a track that only exists as a reference. */
function titleFromSlug(slug) {
  return String(slug)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Makes sure every track referenced by a course or a student exists as a row.
 *
 * The migration, in other words. Existing records store slugs, so the slug is
 * the row's identity and nothing in them has to change — but a slug nobody
 * has a row for would vanish from the forms and leave those records filed
 * under a track the admin screen does not list. Any such orphan is created as
 * an archived track: visible and renameable, but not offered for new work
 * until someone reactivates it.
 */
export async function ensureTracks() {
  await seedDefaultTracks();

  const [courseTracks, studentTracks, cohortTracks] = await Promise.all([
    Course.distinct("programme_track"),
    Student.distinct("programme_track"),
    Cohort.distinct("programme_track"),
  ]);

  const referenced = new Set(
    [...courseTracks, ...studentTracks, ...cohortTracks].filter(Boolean)
  );
  const known = new Set(
    (await Track.find({}).select("slug")).map((t) => t.slug)
  );

  for (const slug of referenced) {
    if (known.has(slug)) continue;
    await Track.create({
      slug,
      name: titleFromSlug(slug),
      status: "archived",
    });
  }

  await primeTrackRegistry();
}

/** How many records point at each of these slugs. */
async function usageBySlug(slugs) {
  const [courses, students, cohorts] = await Promise.all([
    Course.find({ programme_track: { $in: slugs } }).select("programme_track"),
    Student.find({ programme_track: { $in: slugs } }).select("programme_track"),
    Cohort.find({ programme_track: { $in: slugs } }).select("programme_track"),
  ]);

  const counts = new Map(
    slugs.map((s) => [s, { courses: 0, students: 0, cohorts: 0 }])
  );
  const bump = (slug, key) => {
    const row = counts.get(slug);
    if (row) row[key] += 1;
  };
  for (const c of courses) bump(c.programme_track, "courses");
  for (const s of students) bump(s.programme_track, "students");
  for (const c of cohorts) bump(c.programme_track, "cohorts");
  return counts;
}

/** The counts a track row carries, as the admin page reads them. */
function withUsage(track, usage) {
  const used = usage.get(track.slug) ?? {
    courses: 0,
    students: 0,
    cohorts: 0,
  };
  return serializeTrack(track, {
    courses_count: used.courses,
    students_count: used.students,
    cohorts_count: used.cohorts,
    in_use: used.courses + used.students + used.cohorts > 0,
  });
}

/**
 * `GET /tracks`. Active tracks only unless asked otherwise.
 *
 * The forms call this with no query and get exactly what may be chosen today.
 * The admin page asks for everything, and gets the usage counts with it so it
 * can say why a track cannot be deleted before anyone presses the button.
 */
export async function listTracks({ includeArchived = false } = {}) {
  const filter = includeArchived ? {} : { status: "active" };
  const tracks = await Track.find(filter).sort({ status: 1, name: 1 });
  if (tracks.length === 0) return [];

  const usage = await usageBySlug(tracks.map((t) => t.slug));
  return tracks.map((track) => withUsage(track, usage));
}

/**
 * Checks a track may be assigned, and returns its slug.
 *
 * This is the check the Mongoose enums used to make, moved to where it can
 * read the collection and give a message naming the field.
 */
export async function assertTrackUsable(slug, field = "programme_track") {
  const track = slug ? await Track.findOne({ slug }) : null;
  if (!track) {
    throw badRequest("Validation failed", undefined, {
      [field]: "Choose one of the programme tracks",
    });
  }
  if (track.status === "archived") {
    throw badRequest("Validation failed", undefined, {
      [field]: `${track.name} is archived and cannot take new enrolments`,
    });
  }
  return track.slug;
}

export async function createTrack({ actor, payload, ip }) {
  const name = toPlainText(payload.name, 60);
  const slug = trackNameToSlug(name);
  if (!slug) {
    throw badRequest("Validation failed", undefined, {
      name: "A track name is required",
    });
  }

  if (await Track.exists({ slug })) {
    throw conflict("A track with that name already exists");
  }

  const track = await Track.create({
    name,
    slug,
    description: toPlainText(payload.description ?? "", 500),
    status: "active",
  });

  await primeTrackRegistry();
  await logActivity({
    actor,
    action: "create_track",
    description: `Opened the ${track.name} programme track`,
    target_type: "track",
    target_id: String(track._id),
    meta: { slug: track.slug },
    ip,
  });

  return serializeTrack(track, {
    courses_count: 0,
    students_count: 0,
    cohorts_count: 0,
    in_use: false,
  });
}

/**
 * Renames a track, re-describes it, or archives and reactivates it.
 *
 * The slug never moves. Renaming "Robotics" to "Robotics and Drones" must not
 * orphan the courses filed under `robotics`, and a slug rewrite would have to
 * touch three collections inside a transaction to avoid exactly that. The
 * name is what anyone reads; the slug is an internal key.
 */
export async function updateTrack({ actor, trackId, payload, ip }) {
  const track = await Track.findById(trackId);
  if (!track) throw notFound("Track not found");

  const before = { name: track.name, status: track.status };

  if (payload.name !== undefined) {
    const name = toPlainText(payload.name, 60);
    if (!name) {
      throw badRequest("Validation failed", undefined, {
        name: "A track name is required",
      });
    }
    const clash = await Track.findOne({
      _id: { $ne: track._id },
      slug: trackNameToSlug(name),
    });
    if (clash) throw conflict("A track with that name already exists");
    track.name = name;
  }

  if (payload.description !== undefined) {
    track.description = toPlainText(payload.description, 500);
  }
  if (payload.status !== undefined) track.status = payload.status;

  await track.save();
  await primeTrackRegistry();

  const changes = [];
  if (before.name !== track.name) changes.push(`renamed from ${before.name}`);
  if (before.status !== track.status) changes.push(track.status);

  await logActivity({
    actor,
    action: "update_track",
    description: `Updated the ${track.name} track${
      changes.length > 0 ? ` (${changes.join(", ")})` : ""
    }`,
    target_type: "track",
    target_id: String(track._id),
    meta: { slug: track.slug, status: track.status },
    ip,
  });

  const usage = await usageBySlug([track.slug]);
  return withUsage(track, usage);
}

/**
 * Deletes a track, but only one nothing points at.
 *
 * A track in use is refused with the counts, because the alternative is a
 * course whose programme track names a row that is gone — and the way to
 * retire a track that has history is to archive it, which this says.
 */
export async function deleteTrack({ actor, trackId, ip }) {
  const track = await Track.findById(trackId);
  if (!track) throw notFound("Track not found");

  const usage = (await usageBySlug([track.slug])).get(track.slug);
  const total = usage.courses + usage.students + usage.cohorts;
  if (total > 0) {
    const parts = [
      usage.courses && `${usage.courses} course${usage.courses === 1 ? "" : "s"}`,
      usage.students &&
        `${usage.students} student${usage.students === 1 ? "" : "s"}`,
      usage.cohorts && `${usage.cohorts} cohort${usage.cohorts === 1 ? "" : "s"}`,
    ].filter(Boolean);
    throw conflict(
      `${track.name} is used by ${parts.join(" and ")}. Archive it instead.`
    );
  }

  await Track.deleteOne({ _id: track._id });
  await primeTrackRegistry();

  await logActivity({
    actor,
    action: "delete_track",
    description: `Deleted the unused ${track.name} track`,
    target_type: "track",
    target_id: String(track._id),
    meta: { slug: track.slug },
    ip,
  });

  return { success: true };
}
