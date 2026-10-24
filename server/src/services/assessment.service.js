import { Quiz } from "../models/Quiz.js";
import { QuizAttempt } from "../models/QuizAttempt.js";
import { Assignment } from "../models/Assignment.js";
import { Submission } from "../models/Submission.js";
import { Module } from "../models/Module.js";
import { Course } from "../models/Course.js";
import { Student } from "../models/Student.js";
import { Enrollment } from "../models/Enrollment.js";
import { Notification } from "../models/Notification.js";
import { notFound, forbidden, badRequest, unprocessable } from "../lib/errors.js";
import { toPlainText } from "../lib/sanitizeContent.js";
import { checkPositiveLanguage } from "../lib/positiveLanguage.js";
import { QUIZ_PASS_PERCENTAGE } from "../config/constants.js";
import { assertCanEditCourse, getCourseOrFail } from "./course.service.js";
import { recalculateProgress, recalculateCourse } from "./progress.service.js";
import { storage } from "../lib/storage.js";

/**
 * Quizzes, assignments and submissions (FR8, FR9).
 */

async function studentOrFail(user) {
  const student = await Student.findOne({ user_id: user._id });
  if (!student) {
    throw notFound(
      "Student profile not found",
      "This account has no learning profile — contact an administrator"
    );
  }
  return student;
}

/** A student must be enrolled to take a quiz or submit work. */
async function assertEnrolled(studentId, courseId) {
  const enrollment = await Enrollment.findOne({
    student_id: studentId,
    course_id: courseId,
    status: { $in: ["active", "completed"] },
  });
  if (!enrollment) {
    throw forbidden(
      "You are not enrolled on this course",
      "Ask an administrator to enrol you before continuing"
    );
  }
  return enrollment;
}

// ── Quizzes ─────────────────────────────────────────────────────────────────

export async function createQuiz({ user, payload }) {
  const module = await Module.findById(payload.module_id);
  if (!module) {
    throw badRequest("Validation failed", undefined, {
      module_id: "No module found with that id",
    });
  }
  const course = await getCourseOrFail(module.course_id);
  assertCanEditCourse(course, user);

  const quiz = await Quiz.create({
    module_id: module._id,
    course_id: course._id,
    lesson_id: payload.lesson_id ?? null,
    title: toPlainText(payload.title, 160),
    order_index: payload.order_index ?? 1,
    questions: normaliseQuestions(payload.questions ?? []),
  });

  // A new quiz is one more item everyone on the course must complete.
  await recalculateCourse(course._id);
  return serializeQuiz(quiz);
}

/**
 * Normalises question input.
 *
 * A true/false question gets its options supplied rather than trusted from
 * the client, and the correct answer must be one of the options — otherwise
 * the quiz would be unpassable and nobody would find out until a child had
 * tried it three times.
 */
function normaliseQuestions(questions) {
  return questions.map((question, index) => {
    const type = question.question_type === "true_false" ? "true_false" : "mcq";
    const options =
      type === "true_false"
        ? ["True", "False"]
        : (question.options ?? []).map((o) => toPlainText(o, 200)).filter(Boolean);

    const correct = toPlainText(question.correct_answer, 200);

    if (options.length < 2) {
      throw badRequest("Validation failed", undefined, {
        [`questions.${index}.options`]: "A question needs at least two options",
      });
    }
    if (!options.includes(correct)) {
      throw badRequest("Validation failed", undefined, {
        [`questions.${index}.correct_answer`]:
          "The correct answer must be one of the options",
      });
    }

    return {
      question_text: toPlainText(question.question_text, 500),
      question_type: type,
      options,
      correct_answer: correct,
    };
  });
}

function serializeQuiz(quiz, extra = {}) {
  return {
    id: String(quiz._id),
    module_id: String(quiz.module_id),
    course_id: String(quiz.course_id),
    lesson_id: quiz.lesson_id ? String(quiz.lesson_id) : null,
    title: quiz.title,
    order_index: quiz.order_index,
    question_count: quiz.questions.length,
    ...extra,
  };
}

export async function updateQuiz({ user, quizId, payload }) {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw notFound("Quiz not found");

  const course = await getCourseOrFail(quiz.course_id);
  assertCanEditCourse(course, user);

  if (payload.title !== undefined) quiz.title = toPlainText(payload.title, 160);
  if (payload.order_index !== undefined) quiz.order_index = payload.order_index;
  if (payload.questions !== undefined) {
    quiz.questions = normaliseQuestions(payload.questions);
  }

  await quiz.save();
  return serializeQuiz(quiz);
}

export async function deleteQuiz({ user, quizId }) {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw notFound("Quiz not found");

  const course = await getCourseOrFail(quiz.course_id);
  assertCanEditCourse(course, user);

  await QuizAttempt.deleteMany({ quiz_id: quiz._id });
  await Quiz.deleteOne({ _id: quiz._id });

  await recalculateCourse(course._id);
  return { success: true };
}

/**
 * `GET /quizzes/:id/questions`.
 *
 * Students get `toStudentJSON()`, which has no `correct_answer` — sending the
 * answers to the quiz player would make the whole exercise pointless. Staff
 * get the full questions, because they are editing them.
 */
export async function getQuizQuestions({ user, quizId }) {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw notFound("Quiz not found");

  if (user.role === "student") {
    const student = await studentOrFail(user);
    await assertEnrolled(student._id, quiz.course_id);
    return quiz.toStudentJSON();
  }

  return quiz.questions.map((question) => ({
    id: String(question._id),
    quiz_id: String(quiz._id),
    question_text: question.question_text,
    question_type: question.question_type,
    options: [...question.options],
    correct_answer: question.correct_answer,
  }));
}

/**
 * Grades a submission (FR8).
 *
 * Grading happens here, never on the client: a score the browser calculated
 * is a score the browser can choose. Retakes are allowed and the **best**
 * score is kept, which is what the PRD asks for — a child who improves should
 * keep the better mark.
 *
 * @param {{ user: object, quizId: string, answers: Record<string,string> }} input
 */
export async function submitQuiz({ user, quizId, answers }) {
  const quiz = await Quiz.findById(quizId);
  if (!quiz) throw notFound("Quiz not found");

  const student = await studentOrFail(user);
  await assertEnrolled(student._id, quiz.course_id);

  if (quiz.questions.length === 0) {
    throw badRequest("This quiz has no questions yet");
  }

  const results = quiz.questions.map((question) => {
    const questionId = String(question._id);
    const given = toPlainText(answers?.[questionId] ?? "", 200);
    const correct = given === question.correct_answer;

    return {
      question_id: questionId,
      question_text: question.question_text,
      answer: given,
      correct_answer: question.correct_answer,
      correct,
    };
  });

  const score = results.filter((r) => r.correct).length;
  const total = results.length;
  const percentage = Math.round((score / total) * 100);
  const passed = percentage >= QUIZ_PASS_PERCENTAGE;

  const existing = await QuizAttempt.findOne({
    quiz_id: quiz._id,
    student_id: student._id,
  });

  let attempt;
  if (existing) {
    existing.attempts += 1;
    // Keep the better result, and the answers that produced it.
    if (percentage >= existing.percentage) {
      existing.answers = results.map((r) => ({
        question_id: r.question_id,
        answer: r.answer,
        correct: r.correct,
      }));
      existing.score = score;
      existing.total = total;
      existing.percentage = percentage;
    }
    await existing.save();
    attempt = existing;
  } else {
    attempt = await QuizAttempt.create({
      quiz_id: quiz._id,
      student_id: student._id,
      course_id: quiz.course_id,
      answers: results.map((r) => ({
        question_id: r.question_id,
        answer: r.answer,
        correct: r.correct,
      })),
      score,
      total,
      percentage,
      attempts: 1,
    });
  }

  const { justCompleted } = await recalculateProgress({
    studentId: student._id,
    courseId: quiz.course_id,
    touchActivity: true,
  });

  return {
    success: true,
    score,
    total,
    percentage,
    passed,
    pass_mark: QUIZ_PASS_PERCENTAGE,
    attempts: attempt.attempts,
    best_percentage: attempt.percentage,
    results,
    course_completed: justCompleted,
  };
}

// ── Assignments ─────────────────────────────────────────────────────────────

export async function createAssignment({ user, payload }) {
  const module = await Module.findById(payload.module_id);
  if (!module) {
    throw badRequest("Validation failed", undefined, {
      module_id: "No module found with that id",
    });
  }
  const course = await getCourseOrFail(module.course_id);
  assertCanEditCourse(course, user);

  const assignment = await Assignment.create({
    module_id: module._id,
    course_id: course._id,
    title: toPlainText(payload.title, 160),
    instructions: toPlainText(payload.instructions ?? "", 4000),
    deadline: payload.deadline ? new Date(payload.deadline) : null,
  });

  await recalculateCourse(course._id);
  return serializeAssignment(assignment);
}

function serializeAssignment(assignment, extra = {}) {
  return {
    id: String(assignment._id),
    module_id: String(assignment.module_id),
    course_id: String(assignment.course_id),
    title: assignment.title,
    instructions: assignment.instructions,
    deadline: assignment.deadline
      ? assignment.deadline.toISOString().slice(0, 10)
      : null,
    ...extra,
  };
}

export async function updateAssignment({ user, assignmentId, payload }) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw notFound("Assignment not found");

  const course = await getCourseOrFail(assignment.course_id);
  assertCanEditCourse(course, user);

  if (payload.title !== undefined) {
    assignment.title = toPlainText(payload.title, 160);
  }
  if (payload.instructions !== undefined) {
    assignment.instructions = toPlainText(payload.instructions, 4000);
  }
  if (payload.deadline !== undefined) {
    assignment.deadline = payload.deadline ? new Date(payload.deadline) : null;
  }

  await assignment.save();
  return serializeAssignment(assignment);
}

/**
 * `GET /assignments` — the student's list, with the status the UI tabs on
 * (pending / submitted / reviewed).
 */
export async function listStudentAssignments(user) {
  const student = await studentOrFail(user);

  const enrollments = await Enrollment.find({
    student_id: student._id,
    status: { $in: ["active", "completed"] },
  }).select("course_id");
  if (enrollments.length === 0) return [];

  const courseIds = enrollments.map((e) => e.course_id);
  const assignments = await Assignment.find({ course_id: { $in: courseIds } });
  if (assignments.length === 0) return [];

  const submissions = await Submission.find({
    student_id: student._id,
    assignment_id: { $in: assignments.map((a) => a._id) },
  });
  const submissionByAssignment = new Map(
    submissions.map((s) => [String(s.assignment_id), s])
  );

  const courses = await Course.find({ _id: { $in: courseIds } }).select("title");
  const courseTitle = new Map(courses.map((c) => [String(c._id), c.title]));

  return assignments.map((assignment) => {
    const submission = submissionByAssignment.get(String(assignment._id));
    return serializeAssignment(assignment, {
      course_title: courseTitle.get(String(assignment.course_id)) ?? null,
      status: submission ? submission.status : "pending",
      grade: submission?.grade ?? null,
      feedback: submission?.feedback ?? null,
      submitted_at: submission?.created_at?.toISOString() ?? null,
      submission_id: submission ? String(submission._id) : null,
    });
  });
}

/** `GET /assignments/instructor` — the review queue. */
export async function listInstructorAssignments(user) {
  const courseFilter = user.role === "admin" ? {} : { instructor_id: user._id };
  const courses = await Course.find(courseFilter).select("title");
  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c._id);
  const courseTitle = new Map(courses.map((c) => [String(c._id), c.title]));

  const assignments = await Assignment.find({ course_id: { $in: courseIds } });
  if (assignments.length === 0) return [];

  const submissions = await Submission.find({
    assignment_id: { $in: assignments.map((a) => a._id) },
  });

  const students = await Student.find({
    _id: { $in: submissions.map((s) => s.student_id) },
  }).select("name");
  const studentName = new Map(students.map((s) => [String(s._id), s.name]));

  const byAssignment = new Map();
  for (const submission of submissions) {
    const key = String(submission.assignment_id);
    if (!byAssignment.has(key)) byAssignment.set(key, []);
    byAssignment.get(key).push({
      id: String(submission._id),
      student_id: String(submission.student_id),
      student_name: studentName.get(String(submission.student_id)) ?? null,
      submission_type: submission.submission_type,
      content: submission.content,
      file_url: submission.file_url,
      status: submission.status,
      grade: submission.grade,
      feedback: submission.feedback,
      submitted_at: submission.created_at?.toISOString() ?? null,
      reviewed_at: submission.reviewed_at?.toISOString() ?? null,
    });
  }

  return assignments.map((assignment) => {
    const rows = byAssignment.get(String(assignment._id)) ?? [];
    return serializeAssignment(assignment, {
      course_title: courseTitle.get(String(assignment.course_id)) ?? null,
      submissions: rows,
      submission_count: rows.length,
      pending_review: rows.filter((r) => r.status === "submitted").length,
    });
  });
}

/**
 * A student submits work (FR9).
 *
 * One row per student per assignment: resubmitting replaces the content
 * rather than stacking rows, which is what the instructor's queue expects.
 * Resubmitting also returns the work to `submitted`, so a previously reviewed
 * piece goes back for another look rather than keeping a grade that no longer
 * matches what is there.
 */
export async function submitAssignment({ user, payload }) {
  const assignment = await Assignment.findById(payload.assignment_id);
  if (!assignment) throw notFound("Assignment not found");

  const student = await studentOrFail(user);
  await assertEnrolled(student._id, assignment.course_id);

  // The client calls this `kind`; the schema calls it `submission_type`.
  const type = payload.submission_type ?? payload.kind ?? "text";

  let content = "";
  let fileUrl = null;

  if (type === "file") {
    if (!payload.file) {
      throw badRequest("Validation failed", undefined, {
        file: "Attach a file to submit",
      });
    }
    const stored = await storage.save({
      buffer: Buffer.from(payload.file.data ?? "", "base64"),
      filename: payload.file.name ?? "submission",
      folder: `submissions/${assignment._id}`,
    });
    fileUrl = stored.url;
    content = payload.file.name ?? "";
  } else if (type === "link") {
    content = toPlainText(payload.link ?? payload.content ?? "", 500);
    if (!/^https?:\/\//i.test(content)) {
      throw badRequest("Validation failed", undefined, {
        link: "Enter a link starting with http:// or https://",
      });
    }
  } else {
    content = toPlainText(payload.content ?? "", 10000);
    if (!content) {
      throw badRequest("Validation failed", undefined, {
        content: "Write something before submitting",
      });
    }
  }

  const submission = await Submission.findOneAndUpdate(
    { assignment_id: assignment._id, student_id: student._id },
    {
      $set: {
        course_id: assignment.course_id,
        submission_type: type,
        content,
        file_url: fileUrl,
        // Resubmission goes back into the queue; the old grade no longer
        // describes what is there.
        status: "submitted",
        grade: null,
        feedback: null,
        reviewed_by: null,
        reviewed_at: null,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const { justCompleted } = await recalculateProgress({
    studentId: student._id,
    courseId: assignment.course_id,
    touchActivity: true,
  });

  return {
    success: true,
    id: String(submission._id),
    status: submission.status,
    submitted_at: submission.created_at?.toISOString() ?? null,
    course_completed: justCompleted,
  };
}

/**
 * An instructor grades and comments (FR9), subject to the positive-language
 * rule (PRD §10).
 *
 * Discouraging feedback is refused with 422 and a suggested rewording, not
 * softened automatically — the instructor should decide what to say, and a
 * machine rewriting a teacher's words would be worse than asking.
 */
export async function reviewSubmission({ user, assignmentId, payload }) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw notFound("Assignment not found");

  const course = await getCourseOrFail(assignment.course_id);
  assertCanEditCourse(course, user);

  const feedback = toPlainText(payload.feedback ?? "", 4000);

  const check = checkPositiveLanguage(feedback);
  if (!check.ok) {
    throw unprocessable(
      "Please reword this feedback",
      `Kids In Tech asks for encouraging language. Found: ${check.matches.join(", ")}`,
      { feedback: check.suggestions.join(" ") }
    );
  }

  // Which pupil's submission is being graded.
  const submission = await Submission.findOne({
    assignment_id: assignment._id,
    ...(payload.student_id
      ? { student_id: payload.student_id }
      : payload.submission_id
        ? { _id: payload.submission_id }
        : {}),
  });

  if (!submission) throw notFound("Submission not found");

  submission.grade = payload.grade != null ? String(payload.grade) : null;
  submission.feedback = feedback;
  submission.status = "reviewed";
  submission.reviewed_by = user._id;
  submission.reviewed_at = new Date();
  await submission.save();

  // Tell the pupil, and their parent.
  const student = await Student.findById(submission.student_id);
  if (student) {
    const recipients = [student.user_id, student.parent_id].filter(Boolean);
    await Notification.insertMany(
      recipients.map((userId) => ({
        user_id: userId,
        type: "assignment_feedback",
        title: "Assignment reviewed",
        message: `${assignment.title} has been reviewed${
          submission.grade ? ` — grade ${submission.grade}` : ""
        }.`,
        link: "/student/assignments",
      }))
    );
  }

  return {
    success: true,
    id: String(submission._id),
    status: submission.status,
    grade: submission.grade,
    feedback: submission.feedback,
    reviewed_at: submission.reviewed_at.toISOString(),
  };
}
