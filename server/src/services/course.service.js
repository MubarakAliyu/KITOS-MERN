import mongoose from "mongoose";
import { Course } from "../models/Course.js";
import { Module } from "../models/Module.js";
import { Lesson } from "../models/Lesson.js";
import { Quiz } from "../models/Quiz.js";
import { Assignment } from "../models/Assignment.js";
import { Submission } from "../models/Submission.js";
import { QuizAttempt } from "../models/QuizAttempt.js";
import { LessonCompletion } from "../models/LessonCompletion.js";
import { Enrollment } from "../models/Enrollment.js";
import { Student } from "../models/Student.js";
import { User } from "../models/User.js";
import { notFound, forbidden, badRequest } from "../lib/errors.js";
import { searchRegex } from "../lib/pagination.js";
import { koboToNaira, nairaToKobo, avatarInitial } from "../lib/serialize.js";
import { sanitizeLessonHtml, toPlainText } from "../lib/sanitizeContent.js";
import { toTrackSlug, toTrackLabel } from "../config/constants.js";
import { recalculateCourse, progressBreakdown } from "./progress.service.js";
import { supportsTransactions } from "../config/db.js";
import { logger } from "../lib/logger.js";

/**
 * Courses, modules and lessons (FR7).
 *
 * Every rule about who may see or change course content lives here. The
 * permission matrix says whether a *role* may edit a course at all; this says
 * whether they may edit *this* course.
 */

/** The student profile for a user, or null for staff. */
async function studentFor(user) {
  if (user.role !== "student") return null;
  return Student.findOne({ user_id: user._id });
}

/**
 * An instructor may only touch a course assigned to them; an admin any.
 * Throws rather than returning false, because every caller would otherwise
 * repeat the same three lines.
 */
export function assertCanEditCourse(course, user) {
  if (user.role === "admin") return;
  if (
    user.role === "instructor" &&
    course.instructor_id &&
    String(course.instructor_id) === String(user._id)
  ) {
    return;
  }
  throw forbidden(
    "You do not have permission to edit this course",
    "An instructor may only edit a course assigned to them"
  );
}

/**
 * May this user read the course's content?
 *
 * The matrix grants `content.read` to students "(enrolled)", and this is
 * where that qualifier is enforced. Two separate rules, both needed:
 *
 *   - a draft course is invisible to students, however they came by the id —
 *     half-written lessons are not for children;
 *   - a published course's content is for the pupils taking it.
 *
 * Staff are unrestricted here; an instructor editing someone else's course is
 * a different question, answered by `assertCanEditCourse`.
 */
export async function assertCanReadContent(course, user) {
  if (user.role === "admin" || user.role === "instructor") return;

  if (course.status !== "published") {
    // Deliberately a 404, not a 403: confirming that a draft exists is itself
    // a small leak of what the school is preparing.
    throw notFound("Course not found");
  }

  if (user.role === "student") {
    const student = await studentFor(user);
    if (!student) throw forbidden("This course is not available to you");

    const enrolled = await Enrollment.exists({
      student_id: student._id,
      course_id: course._id,
      status: { $in: ["active", "completed"] },
    });
    if (!enrolled) {
      throw forbidden(
        "You are not enrolled on this course",
        "Ask an administrator to enrol you to see its lessons"
      );
    }
    return;
  }

  if (user.role === "parent") {
    const children = await Student.find({ parent_id: user._id }).select("_id");
    if (children.length === 0) {
      throw forbidden("This course is not available to you");
    }
    const enrolled = await Enrollment.exists({
      student_id: { $in: children.map((c) => c._id) },
      course_id: course._id,
      status: { $in: ["active", "completed"] },
    });
    if (!enrolled) {
      throw forbidden(
        "None of your children are enrolled on this course"
      );
    }
  }
}

/** The course, or a 404. */
export async function getCourseOrFail(courseId) {
  const course = await Course.findById(courseId);
  if (!course) throw notFound("Course not found");
  return course;
}

/**
 * Counts and the instructor's name, for a course row.
 * Batched by the callers that list many courses, to avoid a query per row.
 */
async function courseCounts(courseIds) {
  const [modules, lessons, enrollments] = await Promise.all([
    Module.aggregate([
      { $match: { course_id: { $in: courseIds } } },
      { $group: { _id: "$course_id", count: { $sum: 1 } } },
    ]),
    Lesson.aggregate([
      { $match: { course_id: { $in: courseIds } } },
      { $group: { _id: "$course_id", count: { $sum: 1 } } },
    ]),
    Enrollment.aggregate([
      { $match: { course_id: { $in: courseIds }, status: { $in: ["active", "completed"] } } },
      {
        $group: {
          _id: "$course_id",
          count: { $sum: 1 },
          progress: { $avg: "$progress" },
        },
      },
    ]),
  ]);

  const toMap = (rows) => new Map(rows.map((r) => [String(r._id), r]));
  return {
    modules: toMap(modules),
    lessons: toMap(lessons),
    enrollments: toMap(enrollments),
  };
}

/**
 * The course shape the retained screens read (handlers.js `COURSES`).
 *
 * `price` is naira because that is what the frontend renders (ADR-002);
 * `price_kobo` rides along so a later screen can do money properly.
 */
function serializeCourse(course, { counts, instructorName, progress } = {}) {
  const id = String(course._id);
  return {
    id,
    title: course.title,
    description: course.description,
    thumbnail: course.thumbnail ?? null,
    thumbnail_url: course.thumbnail ?? null,
    price: koboToNaira(course.price_kobo),
    price_kobo: course.price_kobo,
    payment_type: course.payment_type,
    instructor_id: course.instructor_id ? String(course.instructor_id) : null,
    instructor_name: instructorName ?? null,
    programme_track: toTrackLabel(course.programme_track),
    status: course.status,
    is_published: course.status === "published",
    module_count: counts?.modules?.get(id)?.count ?? 0,
    modules_count: counts?.modules?.get(id)?.count ?? 0,
    lessons_count: counts?.lessons?.get(id)?.count ?? 0,
    students_count: counts?.enrollments?.get(id)?.count ?? 0,
    completion_rate: Math.round(counts?.enrollments?.get(id)?.progress ?? 0),
    progress: progress ?? 0,
    created_at: course.created_at?.toISOString() ?? null,
  };
}

/**
 * `GET /courses`, projected for whoever is asking.
 *
 * A student sees the published catalogue with their own progress on the ones
 * they are enrolled on; an instructor sees their assigned courses; an admin
 * sees everything, drafts included.
 */
export async function listCourses({ user, query = {} }) {
  const filter = {};

  if (user.role === "student" || user.role === "parent") {
    filter.status = "published";
  } else if (user.role === "instructor") {
    filter.instructor_id = user._id;
  }

  if (query.status && user.role === "admin") filter.status = query.status;
  if (query.programme_track) {
    const slug = toTrackSlug(query.programme_track);
    if (slug) filter.programme_track = slug;
  }
  if (query.q) {
    const rx = searchRegex(query.q);
    filter.$or = [{ title: rx }, { description: rx }];
  }

  const courses = await Course.find(filter).sort({ created_at: 1 });
  if (courses.length === 0) return [];

  const ids = courses.map((c) => c._id);
  const counts = await courseCounts(ids);

  const instructorIds = courses.map((c) => c.instructor_id).filter(Boolean);
  const instructors = instructorIds.length
    ? await User.find({ _id: { $in: instructorIds } }).select("name")
    : [];
  const nameById = new Map(instructors.map((i) => [String(i._id), i.name]));

  // A student's own progress, in one query rather than one per course.
  let progressById = new Map();
  const student = await studentFor(user);
  if (student) {
    const enrollments = await Enrollment.find({
      student_id: student._id,
      course_id: { $in: ids },
    }).select("course_id progress");
    progressById = new Map(
      enrollments.map((e) => [String(e.course_id), e.progress])
    );
  }

  return courses.map((course) =>
    serializeCourse(course, {
      counts,
      instructorName: course.instructor_id
        ? nameById.get(String(course.instructor_id)) ?? null
        : null,
      progress: progressById.get(String(course._id)) ?? 0,
    })
  );
}

/**
 * `GET /courses/:id/modules` — modules with their lessons nested.
 *
 * The shape mirrors the legacy `get_module_with_relations` helper the
 * frontend was built against: each module carries `lessons`, `lessons_count`,
 * `quiz_id` and `assignment_id`, and each lesson a `completed` flag for the
 * asking student.
 */
export async function listCourseModules({ user, courseId }) {
  const course = await getCourseOrFail(courseId);
  await assertCanReadContent(course, user);

  const [modules, lessons, quizzes, assignments] = await Promise.all([
    Module.find({ course_id: courseId }).sort({ order_index: 1 }),
    Lesson.find({ course_id: courseId }).sort({ order_index: 1 }),
    Quiz.find({ course_id: courseId }).select("module_id title"),
    Assignment.find({ course_id: courseId }).select("module_id title"),
  ]);

  const student = await studentFor(user);
  let completed = new Set();
  if (student) {
    const rows = await LessonCompletion.find({
      student_id: student._id,
      course_id: courseId,
    }).select("lesson_id");
    completed = new Set(rows.map((r) => String(r.lesson_id)));
  }

  const quizByModule = new Map(quizzes.map((q) => [String(q.module_id), q]));
  const assignmentByModule = new Map(
    assignments.map((a) => [String(a.module_id), a])
  );

  return modules.map((module) => {
    const moduleId = String(module._id);
    const moduleLessons = lessons
      .filter((lesson) => String(lesson.module_id) === moduleId)
      .map((lesson) => ({
        ...serializeLesson(lesson),
        completed: completed.has(String(lesson._id)),
      }));

    return {
      id: moduleId,
      course_id: String(module.course_id),
      title: module.title,
      order_index: module.order_index,
      lessons: moduleLessons,
      lessons_count: moduleLessons.length,
      quiz_id: quizByModule.has(moduleId)
        ? String(quizByModule.get(moduleId)._id)
        : null,
      assignment_id: assignmentByModule.has(moduleId)
        ? String(assignmentByModule.get(moduleId)._id)
        : null,
    };
  });
}

/** The lesson shape the lesson viewer and editor read. */
export function serializeLesson(lesson, extra = {}) {
  return {
    id: String(lesson._id),
    module_id: String(lesson.module_id),
    course_id: String(lesson.course_id),
    title: lesson.title,
    content_type: lesson.content_type,
    youtube_url: lesson.youtube_url ?? null,
    body_content: lesson.body_content ?? "",
    resources: (lesson.resources ?? []).map((r) => ({
      title: r.title,
      url: r.url,
    })),
    order_index: lesson.order_index,
    duration_minutes: lesson.duration_minutes ?? null,
    ...extra,
  };
}

export async function listModuleLessons({ user, moduleId }) {
  const module = await Module.findById(moduleId);
  if (!module) throw notFound("Module not found");

  const course = await getCourseOrFail(module.course_id);
  await assertCanReadContent(course, user);

  const lessons = await Lesson.find({ module_id: moduleId }).sort({
    order_index: 1,
  });

  const student = await studentFor(user);
  let completed = new Set();
  if (student) {
    const rows = await LessonCompletion.find({
      student_id: student._id,
      lesson_id: { $in: lessons.map((l) => l._id) },
    }).select("lesson_id");
    completed = new Set(rows.map((r) => String(r.lesson_id)));
  }

  return lessons.map((lesson) =>
    serializeLesson(lesson, { completed: completed.has(String(lesson._id)) })
  );
}

/**
 * `GET /lessons/:id` with the breadcrumb fields the viewer needs
 * (`module_title`, `course_id`, `course_title`).
 */
export async function getLesson({ user, lessonId }) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw notFound("Lesson not found");

  const [module, course] = await Promise.all([
    Module.findById(lesson.module_id).select("title"),
    Course.findById(lesson.course_id).select("title status"),
  ]);

  // The same rule as the module list: published, and enrolled.
  if (course) await assertCanReadContent(course, user);

  const student = await studentFor(user);
  let completed = false;
  if (student) {
    completed = Boolean(
      await LessonCompletion.exists({
        student_id: student._id,
        lesson_id: lesson._id,
      })
    );
  }

  return serializeLesson(lesson, {
    module_title: module?.title ?? null,
    course_title: course?.title ?? null,
    completed,
  });
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createCourse({ user, payload }) {
  const track = toTrackSlug(payload.programme_track);
  if (!track) {
    throw badRequest("Validation failed", undefined, {
      programme_track: "Choose one of the programme tracks",
    });
  }

  // An instructor creating a course owns it; an admin may name someone.
  const instructorId =
    user.role === "instructor" ? user._id : payload.instructor_id ?? null;

  const course = await Course.create({
    title: toPlainText(payload.title, 160),
    description: toPlainText(payload.description ?? "", 2000),
    thumbnail: payload.thumbnail ?? null,
    instructor_id: instructorId,
    programme_track: track,
    status: payload.status ?? "draft",
    price_kobo:
      payload.price_kobo ?? nairaToKobo(payload.price ?? 0),
    payment_type: payload.payment_type ?? "one_time",
  });

  const counts = await courseCounts([course._id]);
  return serializeCourse(course, { counts });
}

export async function updateCourse({ user, courseId, payload }) {
  const course = await getCourseOrFail(courseId);
  assertCanEditCourse(course, user);

  if (payload.title !== undefined) course.title = toPlainText(payload.title, 160);
  if (payload.description !== undefined) {
    course.description = toPlainText(payload.description, 2000);
  }
  if (payload.thumbnail !== undefined) course.thumbnail = payload.thumbnail;
  if (payload.payment_type !== undefined) course.payment_type = payload.payment_type;
  if (payload.price_kobo !== undefined) course.price_kobo = payload.price_kobo;
  else if (payload.price !== undefined) course.price_kobo = nairaToKobo(payload.price);
  if (payload.programme_track !== undefined) {
    const track = toTrackSlug(payload.programme_track);
    if (track) course.programme_track = track;
  }
  // Only an admin may reassign a course to a different instructor.
  if (payload.instructor_id !== undefined && user.role === "admin") {
    course.instructor_id = payload.instructor_id || null;
  }

  await course.save();

  const counts = await courseCounts([course._id]);
  const instructor = course.instructor_id
    ? await User.findById(course.instructor_id).select("name")
    : null;
  return serializeCourse(course, { counts, instructorName: instructor?.name });
}

export async function setCoursePublished({ user, courseId, published }) {
  const course = await getCourseOrFail(courseId);
  assertCanEditCourse(course, user);

  // Publishing an empty course would put a dead listing in front of children.
  if (published) {
    const lessons = await Lesson.countDocuments({ course_id: course._id });
    if (lessons === 0) {
      throw badRequest(
        "This course has no lessons yet",
        "Add at least one lesson before publishing"
      );
    }
  }

  course.status = published ? "published" : "draft";
  await course.save();

  const counts = await courseCounts([course._id]);
  return serializeCourse(course, { counts });
}

/**
 * Deletes a course and everything underneath it, in one transaction.
 *
 * Without the transaction a failure halfway leaves orphaned lessons and
 * submissions pointing at a course that no longer exists — rows nothing will
 * ever read but which still count toward progress denominators.
 */
export async function deleteCourse({ user, courseId }) {
  const course = await getCourseOrFail(courseId);
  assertCanEditCourse(course, user);

  const useTransaction = supportsTransactions();
  const session = useTransaction ? await mongoose.startSession() : null;

  const work = async () => {
    const opts = session ? { session } : {};
    const scope = { course_id: course._id };

    await Promise.all([
      Lesson.deleteMany(scope, opts),
      Quiz.deleteMany(scope, opts),
      Assignment.deleteMany(scope, opts),
      Submission.deleteMany(scope, opts),
      QuizAttempt.deleteMany(scope, opts),
      LessonCompletion.deleteMany(scope, opts),
      Module.deleteMany(scope, opts),
      Enrollment.deleteMany(scope, opts),
    ]);

    await Course.deleteOne({ _id: course._id }, opts);
  };

  try {
    if (session) await session.withTransaction(work);
    else await work();
  } finally {
    await session?.endSession();
  }

  logger.info({ course_id: String(course._id) }, "Deleted course and its content");
  return { success: true };
}

// ── Modules and lessons ─────────────────────────────────────────────────────

export async function createModule({ user, payload }) {
  const course = await getCourseOrFail(payload.course_id);
  assertCanEditCourse(course, user);

  const last = await Module.findOne({ course_id: course._id })
    .sort({ order_index: -1 })
    .select("order_index");

  const module = await Module.create({
    course_id: course._id,
    title: toPlainText(payload.title, 160),
    order_index: payload.order_index ?? (last?.order_index ?? 0) + 1,
  });

  return {
    id: String(module._id),
    course_id: String(module.course_id),
    title: module.title,
    order_index: module.order_index,
    lessons: [],
    lessons_count: 0,
    quiz_id: null,
    assignment_id: null,
  };
}

/**
 * Deletes a module and its contents, then recalculates everyone's progress on
 * the course — removing content raises the percentage for every student.
 */
export async function deleteModule({ user, moduleId }) {
  const module = await Module.findById(moduleId);
  if (!module) throw notFound("Module not found");

  const course = await getCourseOrFail(module.course_id);
  assertCanEditCourse(course, user);

  const lessons = await Lesson.find({ module_id: module._id }).select("_id");
  const lessonIds = lessons.map((l) => l._id);
  const quizzes = await Quiz.find({ module_id: module._id }).select("_id");
  const assignments = await Assignment.find({ module_id: module._id }).select("_id");

  const useTransaction = supportsTransactions();
  const session = useTransaction ? await mongoose.startSession() : null;

  const work = async () => {
    const opts = session ? { session } : {};
    await Promise.all([
      LessonCompletion.deleteMany({ lesson_id: { $in: lessonIds } }, opts),
      Lesson.deleteMany({ module_id: module._id }, opts),
      QuizAttempt.deleteMany({ quiz_id: { $in: quizzes.map((q) => q._id) } }, opts),
      Quiz.deleteMany({ module_id: module._id }, opts),
      Submission.deleteMany(
        { assignment_id: { $in: assignments.map((a) => a._id) } },
        opts
      ),
      Assignment.deleteMany({ module_id: module._id }, opts),
    ]);
    await Module.deleteOne({ _id: module._id }, opts);
  };

  try {
    if (session) await session.withTransaction(work);
    else await work();
  } finally {
    await session?.endSession();
  }

  await recalculateCourse(course._id);
  return { success: true };
}

export async function createLesson({ user, payload }) {
  const module = await Module.findById(payload.module_id);
  if (!module) {
    throw badRequest("Validation failed", undefined, {
      module_id: "No module found with that id",
    });
  }
  const course = await getCourseOrFail(module.course_id);
  assertCanEditCourse(course, user);

  const last = await Lesson.findOne({ module_id: module._id })
    .sort({ order_index: -1 })
    .select("order_index");

  const lesson = await Lesson.create({
    module_id: module._id,
    course_id: course._id,
    title: toPlainText(payload.title, 160),
    content_type: payload.content_type ?? "text",
    youtube_url: payload.youtube_url ?? null,
    // Sanitised on the way in, so nothing unsafe is ever stored.
    body_content: sanitizeLessonHtml(payload.body_content ?? ""),
    resources: payload.resources ?? [],
    order_index: payload.order_index ?? (last?.order_index ?? 0) + 1,
    duration_minutes: payload.duration_minutes ?? null,
  });

  // A new lesson lowers the percentage for everyone already enrolled.
  await recalculateCourse(course._id);

  return serializeLesson(lesson);
}

export async function updateLesson({ user, lessonId, payload }) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw notFound("Lesson not found");

  const course = await getCourseOrFail(lesson.course_id);
  assertCanEditCourse(course, user);

  if (payload.title !== undefined) lesson.title = toPlainText(payload.title, 160);
  if (payload.content_type !== undefined) lesson.content_type = payload.content_type;
  if (payload.youtube_url !== undefined) lesson.youtube_url = payload.youtube_url;
  if (payload.body_content !== undefined) {
    lesson.body_content = sanitizeLessonHtml(payload.body_content);
  }
  if (payload.resources !== undefined) lesson.resources = payload.resources;
  if (payload.order_index !== undefined) lesson.order_index = payload.order_index;
  if (payload.duration_minutes !== undefined) {
    lesson.duration_minutes = payload.duration_minutes;
  }

  await lesson.save();
  return serializeLesson(lesson);
}

export async function deleteLesson({ user, lessonId }) {
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) throw notFound("Lesson not found");

  const course = await getCourseOrFail(lesson.course_id);
  assertCanEditCourse(course, user);

  await LessonCompletion.deleteMany({ lesson_id: lesson._id });
  await Lesson.deleteOne({ _id: lesson._id });

  // One fewer item for everyone on the course.
  await recalculateCourse(course._id);
  return { success: true };
}

// ── Admin views ─────────────────────────────────────────────────────────────

/** `GET /admin/courses` → `{ courses, total_revenue }`. */
export async function listAdminCourses() {
  const courses = await Course.find({}).sort({ created_at: 1 });
  if (courses.length === 0) return { courses: [], total_revenue: 0 };

  const counts = await courseCounts(courses.map((c) => c._id));
  const instructors = await User.find({
    _id: { $in: courses.map((c) => c.instructor_id).filter(Boolean) },
  }).select("name");
  const nameById = new Map(instructors.map((i) => [String(i._id), i.name]));

  return {
    courses: courses.map((course) =>
      serializeCourse(course, {
        counts,
        instructorName: course.instructor_id
          ? nameById.get(String(course.instructor_id)) ?? null
          : null,
      })
    ),
    // Revenue is payments, which arrive in Batch 3.
    total_revenue: 0,
  };
}

/**
 * `GET /admin/courses/:id/editor` — the course with modules, lessons and
 * assignments joined, as the admin course editor reads it.
 */
export async function getCourseEditor({ user, courseId }) {
  const course = await getCourseOrFail(courseId);
  const modules = await listCourseModules({ user, courseId });
  const assignments = await Assignment.find({ course_id: courseId });

  const counts = await courseCounts([course._id]);
  const instructor = course.instructor_id
    ? await User.findById(course.instructor_id).select("name")
    : null;

  const lessonsByModule = {};
  for (const module of modules) lessonsByModule[module.id] = module.lessons;

  return {
    course: serializeCourse(course, { counts, instructorName: instructor?.name }),
    modules,
    lessons_by_module: lessonsByModule,
    assignments: assignments.map((a) => ({
      id: String(a._id),
      module_id: String(a.module_id),
      course_id: String(a.course_id),
      title: a.title,
      instructions: a.instructions,
      deadline: a.deadline ? a.deadline.toISOString().slice(0, 10) : null,
    })),
  };
}

/** Instructor's own courses, with the counts their dashboard shows. */
export async function listInstructorCourses(user) {
  return listCourses({ user, query: {} });
}

/**
 * `GET /instructors/me/students` — every student on the instructor's courses.
 *
 * **One row per student, not per enrolment.** The students table keys on the
 * student id and filters with `enrolled_courses.includes(courseId)`, so a
 * pupil taking two of an instructor's courses must appear once with both
 * course ids, not twice. Returning a row per enrolment gave React duplicate
 * keys and crashed the detail panel.
 *
 * The row carries everything both the table and the detail panel read, so
 * opening a pupil needs no second request.
 */
export async function listInstructorStudents(user) {
  const courseFilter = user.role === "admin" ? {} : { instructor_id: user._id };
  const courses = await Course.find(courseFilter).select("title");
  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c._id);
  const titleById = new Map(courses.map((c) => [String(c._id), c.title]));

  const enrollments = await Enrollment.find({
    course_id: { $in: courseIds },
    status: { $in: ["active", "completed"] },
  });
  if (enrollments.length === 0) return [];

  const studentIds = [...new Set(enrollments.map((e) => String(e.student_id)))];

  const [students, attempts, submissions, assignments] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }),
    QuizAttempt.find({
      student_id: { $in: studentIds },
      course_id: { $in: courseIds },
    }),
    Submission.find({
      student_id: { $in: studentIds },
      course_id: { $in: courseIds },
    }),
    Assignment.find({ course_id: { $in: courseIds } }),
  ]);

  const accounts = await User.find({
    _id: { $in: students.map((s) => s.user_id) },
  }).select("admission_no last_login_at");
  const accountById = new Map(accounts.map((a) => [String(a._id), a]));

  // Quiz titles, for the detail panel's per-quiz list.
  const quizzes = await Quiz.find({
    _id: { $in: attempts.map((a) => a.quiz_id) },
  }).select("title");
  const quizTitle = new Map(quizzes.map((q) => [String(q._id), q.title]));

  const assignmentTitle = new Map(
    assignments.map((a) => [String(a._id), a.title])
  );

  // Group everything by student, once, rather than filtering inside a loop.
  const byStudent = new Map();
  const ensure = (id) => {
    if (!byStudent.has(id)) {
      byStudent.set(id, {
        enrolments: [],
        attempts: [],
        submissions: [],
      });
    }
    return byStudent.get(id);
  };

  for (const enrollment of enrollments) {
    ensure(String(enrollment.student_id)).enrolments.push(enrollment);
  }
  for (const attempt of attempts) {
    ensure(String(attempt.student_id)).attempts.push(attempt);
  }
  for (const submission of submissions) {
    ensure(String(submission.student_id)).submissions.push(submission);
  }

  return students.map((student) => {
    const key = String(student._id);
    const bucket = byStudent.get(key) ?? {
      enrolments: [],
      attempts: [],
      submissions: [],
    };
    const account = accountById.get(String(student.user_id));

    const enrolledCourseIds = bucket.enrolments.map((e) => String(e.course_id));

    const quizRows = bucket.attempts.map((attempt) => ({
      id: String(attempt.quiz_id),
      title: quizTitle.get(String(attempt.quiz_id)) ?? "Quiz",
      score: attempt.percentage,
    }));

    const quizAverage = quizRows.length
      ? Math.round(
          quizRows.reduce((sum, q) => sum + q.score, 0) / quizRows.length
        )
      : 0;

    const submittedIds = new Set(
      bucket.submissions.map((s) => String(s.assignment_id))
    );

    // Pending means: set on a course this pupil is taking, not yet handed in.
    const theirAssignments = assignments.filter((a) =>
      enrolledCourseIds.includes(String(a.course_id))
    );

    const completedAssignments = bucket.submissions.map((submission) => ({
      id: String(submission.assignment_id),
      title:
        assignmentTitle.get(String(submission.assignment_id)) ?? "Assignment",
      status: submission.status,
      grade: submission.grade ?? null,
    }));

    const pendingAssignments = theirAssignments
      .filter((a) => !submittedIds.has(String(a._id)))
      .map((a) => ({
        id: String(a._id),
        title: a.title,
        deadline: a.deadline ? a.deadline.toISOString().slice(0, 10) : null,
      }));

    // The most recent activity across their enrolments.
    const lastActivity = bucket.enrolments
      .map((e) => e.last_activity_at)
      .filter(Boolean)
      .sort((a, b) => b - a)[0];

    return {
      id: key,
      student_id: key,
      name: student.name,
      avatar_initial: avatarInitial(student.name),
      admission_no: account?.admission_no ?? null,
      age: student.age,
      programme_track: toTrackLabel(student.programme_track),

      // Course **ids**: the table's filter does enrolled_courses.includes(id).
      enrolled_courses: enrolledCourseIds,
      enrolled_courses_details: bucket.enrolments.map((enrollment) => ({
        course_id: String(enrollment.course_id),
        course_title: titleById.get(String(enrollment.course_id)) ?? null,
        progress: enrollment.progress,
        status: enrollment.status,
      })),

      quizzes: quizRows,
      quiz_average: quizAverage,

      assignments_completed: completedAssignments.length,
      assignments_pending: pendingAssignments.length,
      completed_assignments: completedAssignments,
      pending_assignments: pendingAssignments,

      last_active:
        lastActivity?.toISOString() ??
        account?.last_login_at?.toISOString() ??
        null,
    };
  });
}

/** The per-course progress feed the parent dashboard reads. */
export async function studentProgressFeed(studentId) {
  const enrollments = await Enrollment.find({ student_id: studentId });
  if (enrollments.length === 0) return [];

  const courses = await Course.find({
    _id: { $in: enrollments.map((e) => e.course_id) },
  });
  const courseById = new Map(courses.map((c) => [String(c._id), c]));

  const instructors = await User.find({
    _id: { $in: courses.map((c) => c.instructor_id).filter(Boolean) },
  }).select("name");
  const nameById = new Map(instructors.map((i) => [String(i._id), i.name]));

  const feed = [];
  for (const enrollment of enrollments) {
    const course = courseById.get(String(enrollment.course_id));
    if (!course) continue;

    const breakdown = await progressBreakdown(studentId, course._id);

    feed.push({
      course_id: String(course._id),
      course_title: course.title,
      instructor_name: course.instructor_id
        ? nameById.get(String(course.instructor_id)) ?? null
        : null,
      progress: enrollment.progress,
      // The dashboard labels these "modules", which is how the fixture reads;
      // the honest unit is completable items.
      modules_completed:
        breakdown.lessons.completed +
        breakdown.quizzes.completed +
        breakdown.assignments.completed,
      modules_total:
        breakdown.lessons.total +
        breakdown.quizzes.total +
        breakdown.assignments.total,
      last_active: enrollment.last_activity_at?.toISOString() ?? null,
      status: enrollment.status,
    });
  }

  return feed;
}
