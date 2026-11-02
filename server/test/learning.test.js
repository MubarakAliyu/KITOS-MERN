import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, makeUser, makeFamily, auth, resetState } from "./helpers.js";
import { Course } from "../src/models/Course.js";
import { Module } from "../src/models/Module.js";
import { Lesson } from "../src/models/Lesson.js";
import { Quiz } from "../src/models/Quiz.js";
import { QuizAttempt } from "../src/models/QuizAttempt.js";
import { Assignment } from "../src/models/Assignment.js";
import { Submission } from "../src/models/Submission.js";
import { Enrollment } from "../src/models/Enrollment.js";
import { LessonCompletion } from "../src/models/LessonCompletion.js";
import { Certificate } from "../src/models/Certificate.js";
import { progressBreakdown } from "../src/services/progress.service.js";
import { issueCertificate } from "../src/services/enrollment.service.js";
import { sanitizeLessonHtml, toYouTubeEmbedUrl } from "../src/lib/sanitizeContent.js";
import { checkPositiveLanguage } from "../src/lib/positiveLanguage.js";

const server = app();

beforeEach(resetState);

/**
 * Builds a small course with one module, `lessons` lessons, optionally a quiz
 * and an assignment, and returns the ids. Most tests here need a course that
 * exists more than they need a particular course.
 */
async function makeCourse({
  instructor,
  lessons = 2,
  withQuiz = false,
  withAssignment = false,
  status = "published",
} = {}) {
  const owner = instructor ?? (await makeUser({ role: "instructor" }));

  const course = await Course.create({
    title: "Test Course",
    description: "For tests",
    programme_track: "scratch",
    instructor_id: owner._id,
    status,
    price_kobo: 1500000,
  });

  const module = await Module.create({
    course_id: course._id,
    title: "Module One",
    order_index: 1,
  });

  const lessonDocs = [];
  for (let i = 0; i < lessons; i += 1) {
    lessonDocs.push(
      await Lesson.create({
        module_id: module._id,
        course_id: course._id,
        title: `Lesson ${i + 1}`,
        content_type: "text",
        body_content: "<p>Content</p>",
        order_index: i + 1,
      })
    );
  }

  let quiz = null;
  if (withQuiz) {
    quiz = await Quiz.create({
      module_id: module._id,
      course_id: course._id,
      title: "Module quiz",
      questions: [
        {
          question_text: "Two plus two?",
          question_type: "mcq",
          options: ["3", "4", "5"],
          correct_answer: "4",
        },
        {
          question_text: "The sky is green.",
          question_type: "true_false",
          options: ["True", "False"],
          correct_answer: "False",
        },
      ],
    });
  }

  let assignment = null;
  if (withAssignment) {
    assignment = await Assignment.create({
      module_id: module._id,
      course_id: course._id,
      title: "Build something",
      instructions: "Make a thing.",
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }

  return { owner, course, module, lessons: lessonDocs, quiz, assignment };
}

async function enrol(student, course) {
  return Enrollment.create({
    student_id: student._id,
    course_id: course._id,
    status: "active",
    source: "admin",
  });
}

// ── Content sanitising ──────────────────────────────────────────────────────

describe("lesson HTML sanitising", () => {
  it("strips scripts and event handlers", () => {
    const dirty = '<p>Hi</p><script>alert(1)</script><img src="x" onerror="alert(1)">';
    const clean = sanitizeLessonHtml(dirty);

    expect(clean).toContain("<p>Hi</p>");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onerror");
  });

  it("keeps the formatting an instructor actually uses", () => {
    const html =
      "<h2>Title</h2><ul><li>One</li></ul><pre><code>x = 1</code></pre><strong>bold</strong>";
    const clean = sanitizeLessonHtml(html);

    expect(clean).toContain("<h2>");
    expect(clean).toContain("<li>");
    expect(clean).toContain("<code>");
    expect(clean).toContain("<strong>");
  });

  it("allows a YouTube no-cookie embed and nothing else", () => {
    const allowed = sanitizeLessonHtml(
      '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>'
    );
    expect(allowed).toContain("youtube-nocookie.com/embed/abc123");

    // Any other host loses its src, so nothing third-party loads next to a
    // child's lesson.
    const blocked = sanitizeLessonHtml(
      '<iframe src="https://evil.example.com/tracker"></iframe>'
    );
    expect(blocked).not.toContain("evil.example.com");
  });

  it("forces links to open safely", () => {
    const clean = sanitizeLessonHtml('<a href="https://example.com">x</a>');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it("refuses a javascript: link", () => {
    const clean = sanitizeLessonHtml('<a href="javascript:alert(1)">x</a>');
    expect(clean).not.toContain("javascript:");
  });

  it("normalises every YouTube URL shape an instructor might paste", () => {
    const expected = "https://www.youtube-nocookie.com/embed/jXUZaf5D12A";
    expect(toYouTubeEmbedUrl("https://www.youtube.com/watch?v=jXUZaf5D12A")).toBe(expected);
    expect(toYouTubeEmbedUrl("https://youtu.be/jXUZaf5D12A")).toBe(expected);
    expect(toYouTubeEmbedUrl("https://www.youtube.com/embed/jXUZaf5D12A")).toBe(expected);
    expect(toYouTubeEmbedUrl("https://example.com/video")).toBeNull();
    expect(toYouTubeEmbedUrl("not a url")).toBeNull();
  });
});

// ── Progress ────────────────────────────────────────────────────────────────

describe("progress recalculation", () => {
  it("counts lessons, passed quizzes and submitted assignments equally", async () => {
    const { course, lessons, quiz, assignment } = await makeCourse({
      lessons: 2,
      withQuiz: true,
      withAssignment: true,
    });
    const { student } = await makeFamily();
    await enrol(student, course);

    // 4 items: 2 lessons, 1 quiz, 1 assignment.
    let breakdown = await progressBreakdown(student._id, course._id);
    expect(breakdown.percentage).toBe(0);

    await LessonCompletion.create({
      student_id: student._id,
      lesson_id: lessons[0]._id,
      course_id: course._id,
    });
    breakdown = await progressBreakdown(student._id, course._id);
    expect(breakdown.percentage).toBe(25);

    await QuizAttempt.create({
      quiz_id: quiz._id,
      student_id: student._id,
      course_id: course._id,
      score: 2,
      total: 2,
      percentage: 100,
    });
    breakdown = await progressBreakdown(student._id, course._id);
    expect(breakdown.percentage).toBe(50);

    await Submission.create({
      assignment_id: assignment._id,
      student_id: student._id,
      course_id: course._id,
      submission_type: "text",
      content: "done",
    });
    breakdown = await progressBreakdown(student._id, course._id);
    expect(breakdown.percentage).toBe(75);
  });

  it("does not count a failed quiz", async () => {
    const { course, quiz } = await makeCourse({ lessons: 1, withQuiz: true });
    const { student } = await makeFamily();
    await enrol(student, course);

    await QuizAttempt.create({
      quiz_id: quiz._id,
      student_id: student._id,
      course_id: course._id,
      score: 0,
      total: 2,
      // Below the 50% pass mark: attempted is not passed.
      percentage: 25,
    });

    const breakdown = await progressBreakdown(student._id, course._id);
    expect(breakdown.quizzes.completed).toBe(0);
  });

  it("falls when a lesson is added and rises when one is removed", async () => {
    const { owner, course, module, lessons } = await makeCourse({ lessons: 2 });
    const { student } = await makeFamily();
    await enrol(student, course);

    for (const lesson of lessons) {
      await LessonCompletion.create({
        student_id: student._id,
        lesson_id: lesson._id,
        course_id: course._id,
      });
    }

    // Everything done: 100%.
    let res = await request(server)
      .post(`/lessons/${lessons[0]._id}/complete`)
      .set(auth(await studentUser(student)));
    expect(res.status).toBe(200);
    let enrollment = await Enrollment.findOne({ student_id: student._id });
    expect(enrollment.progress).toBe(100);

    // The instructor adds a third lesson: everyone drops to 2 of 3.
    res = await request(server)
      .post("/lessons")
      .set(auth(owner))
      .send({ module_id: String(module._id), title: "Lesson 3" });
    expect(res.status).toBe(201);

    enrollment = await Enrollment.findOne({ student_id: student._id });
    expect(enrollment.progress).toBe(67);
    // And they are no longer "completed".
    expect(enrollment.status).toBe("active");

    // Removing it again puts them back.
    const added = res.body.id;
    await request(server).delete(`/lessons/${added}`).set(auth(owner));

    enrollment = await Enrollment.findOne({ student_id: student._id });
    expect(enrollment.progress).toBe(100);
  });

  it("treats an empty course as 0%, not 100%", async () => {
    const { course } = await makeCourse({ lessons: 0 });
    const { student } = await makeFamily();
    await enrol(student, course);

    const breakdown = await progressBreakdown(student._id, course._id);
    // Nothing to do is not the same as everything done — otherwise an empty
    // course would issue certificates.
    expect(breakdown.percentage).toBe(0);
    expect(breakdown.has_content).toBe(false);
  });
});

/** The User behind a Student profile, for signing requests. */
async function studentUser(student) {
  const { User } = await import("../src/models/User.js");
  return User.findById(student.user_id).select("+token_version");
}

// ── Lesson completion and certificates ──────────────────────────────────────

describe("lesson completion", () => {
  it("is idempotent", async () => {
    const { course, lessons } = await makeCourse({ lessons: 2 });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    const first = await request(server)
      .post(`/lessons/${lessons[0]._id}/complete`)
      .set(auth(childUser));
    const second = await request(server)
      .post(`/lessons/${lessons[0]._id}/complete`)
      .set(auth(childUser));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await LessonCompletion.countDocuments({})).toBe(1);
    expect(second.body.progress).toBe(first.body.progress);
  });

  it("refuses a student who is not enrolled", async () => {
    const { lessons } = await makeCourse({ lessons: 1 });
    const { childUser } = await makeFamily();

    const res = await request(server)
      .post(`/lessons/${lessons[0]._id}/complete`)
      .set(auth(childUser));

    expect(res.status).toBe(403);
  });

  it("issues a certificate at 100% and only one", async () => {
    const { course, lessons } = await makeCourse({ lessons: 1 });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    const res = await request(server)
      .post(`/lessons/${lessons[0]._id}/complete`)
      .set(auth(childUser));

    expect(res.status).toBe(200);
    expect(res.body.course_completed).toBe(true);
    expect(res.body.certificate).not.toBeNull();
    expect(res.body.certificate.serial).toMatch(/^KIT-CERT-\d{4}-\d{4}$/);
    expect(res.body.certificate.verification_code).toMatch(/^[A-Z0-9]{10}$/);

    expect(await Certificate.countDocuments({})).toBe(1);

    // Completing again does not issue a second.
    await request(server)
      .post(`/lessons/${lessons[0]._id}/complete`)
      .set(auth(childUser));
    expect(await Certificate.countDocuments({})).toBe(1);
  });
});

describe("certificates", () => {
  it("issuing twice returns the same certificate", async () => {
    const { course } = await makeCourse({ lessons: 1 });
    const { student } = await makeFamily();
    await enrol(student, course);

    const first = await issueCertificate({
      studentId: student._id,
      courseId: course._id,
    });
    const second = await issueCertificate({
      studentId: student._id,
      courseId: course._id,
    });

    expect(String(first._id)).toBe(String(second._id));
    expect(await Certificate.countDocuments({})).toBe(1);
  });

  it("issues unique serials and codes under parallel calls", async () => {
    const { course } = await makeCourse({ lessons: 1 });

    const families = await Promise.all(
      Array.from({ length: 10 }, () => makeFamily())
    );
    await Promise.all(families.map((f) => enrol(f.student, course)));

    const certificates = await Promise.all(
      families.map((f) =>
        issueCertificate({ studentId: f.student._id, courseId: course._id })
      )
    );

    const serials = certificates.map((c) => c.serial);
    const codes = certificates.map((c) => c.verification_code);
    expect(new Set(serials).size).toBe(10);
    expect(new Set(codes).size).toBe(10);
  }, 60000);

  it("snapshots the names, so a later rename cannot rewrite it", async () => {
    const { course } = await makeCourse({ lessons: 1 });
    const { student } = await makeFamily();
    await enrol(student, course);

    const certificate = await issueCertificate({
      studentId: student._id,
      courseId: course._id,
    });

    course.title = "Renamed Course";
    await course.save();

    const reloaded = await Certificate.findById(certificate._id);
    expect(reloaded.course_title).toBe("Test Course");
  });

  it("verifies publicly with initials only", async () => {
    const { course } = await makeCourse({ lessons: 1 });
    const { student } = await makeFamily({
      childOverrides: { name: "Amina Bello Yusuf" },
    });
    await enrol(student, course);

    const certificate = await issueCertificate({
      studentId: student._id,
      courseId: course._id,
    });

    // No Authorization header: this is the point of the endpoint.
    const res = await request(server).get(
      `/certificates/verify/${certificate.verification_code}`
    );

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.student_initials).toBe("A.B.Y.");
    expect(res.body.course_title).toBe("Test Course");
    // Nothing that identifies the child.
    expect(res.body.student_name).toBeUndefined();
    expect(res.body.student_id).toBeUndefined();
  });

  it("404s an unknown code", async () => {
    const res = await request(server).get("/certificates/verify/ZZZZZZZZZZ");
    expect(res.status).toBe(404);
    expect(res.body.valid).toBe(false);
  });

  it("serves a PDF to the owner and refuses a stranger", async () => {
    const { course } = await makeCourse({ lessons: 1 });
    const mine = await makeFamily();
    const theirs = await makeFamily();
    await enrol(mine.student, course);

    const certificate = await issueCertificate({
      studentId: mine.student._id,
      courseId: course._id,
    });

    const owner = await request(server)
      .get(`/certificates/${certificate._id}/pdf`)
      .set(auth(mine.childUser));
    expect(owner.status).toBe(200);
    expect(owner.headers["content-type"]).toContain("application/pdf");
    // A real PDF, not an empty response.
    expect(owner.body.length).toBeGreaterThan(1000);
    expect(owner.body.subarray(0, 4).toString()).toBe("%PDF");

    const parent = await request(server)
      .get(`/certificates/${certificate._id}/pdf`)
      .set(auth(mine.parent));
    expect(parent.status).toBe(200);

    const stranger = await request(server)
      .get(`/certificates/${certificate._id}/pdf`)
      .set(auth(theirs.parent));
    expect(stranger.status).toBe(403);
  }, 30000);
});

// ── Quizzes ─────────────────────────────────────────────────────────────────

describe("quizzes", () => {
  it("never sends correct_answer to a student", async () => {
    const { course, quiz } = await makeCourse({ lessons: 1, withQuiz: true });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    const res = await request(server)
      .get(`/quizzes/${quiz._id}/questions`)
      .set(auth(childUser));

    expect(res.status).toBe(200);
    for (const question of res.body) {
      expect(question.correct_answer).toBeUndefined();
      expect(question.options.length).toBeGreaterThan(1);
    }
  });

  it("does send it to the instructor, who is editing", async () => {
    const { owner, quiz } = await makeCourse({ lessons: 1, withQuiz: true });

    const res = await request(server)
      .get(`/quizzes/${quiz._id}/questions`)
      .set(auth(owner));

    expect(res.body[0].correct_answer).toBe("4");
  });

  it("grades on the server and keeps the best of several attempts", async () => {
    const { course, quiz } = await makeCourse({ lessons: 1, withQuiz: true });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    const ids = quiz.questions.map((q) => String(q._id));

    const wrong = await request(server)
      .post("/quiz/submit")
      .set(auth(childUser))
      .send({ quiz_id: String(quiz._id), answers: { [ids[0]]: "3", [ids[1]]: "True" } });

    expect(wrong.status).toBe(200);
    expect(wrong.body.score).toBe(0);
    expect(wrong.body.percentage).toBe(0);
    expect(wrong.body.passed).toBe(false);

    const right = await request(server)
      .post("/quiz/submit")
      .set(auth(childUser))
      .send({ quiz_id: String(quiz._id), answers: { [ids[0]]: "4", [ids[1]]: "False" } });

    expect(right.body.percentage).toBe(100);
    expect(right.body.passed).toBe(true);
    expect(right.body.attempts).toBe(2);

    // One row per student per quiz, holding the best score.
    expect(await QuizAttempt.countDocuments({})).toBe(1);
    const stored = await QuizAttempt.findOne({});
    expect(stored.percentage).toBe(100);

    // A worse third attempt does not overwrite the best.
    await request(server)
      .post("/quiz/submit")
      .set(auth(childUser))
      .send({ quiz_id: String(quiz._id), answers: { [ids[0]]: "5", [ids[1]]: "True" } });

    const after = await QuizAttempt.findOne({});
    expect(after.percentage).toBe(100);
    expect(after.attempts).toBe(3);
  });

  it("refuses a quiz on a course the student is not enrolled on", async () => {
    const { quiz } = await makeCourse({ lessons: 1, withQuiz: true });
    const { childUser } = await makeFamily();

    const res = await request(server)
      .post("/quiz/submit")
      .set(auth(childUser))
      .send({ quiz_id: String(quiz._id), answers: {} });

    expect(res.status).toBe(403);
  });

  it("refuses a question whose correct answer is not among the options", async () => {
    const { owner, module } = await makeCourse({ lessons: 1 });

    const res = await request(server)
      .post("/quizzes")
      .set(auth(owner))
      .send({
        module_id: String(module._id),
        title: "Broken quiz",
        questions: [
          {
            question_text: "Pick one",
            options: ["A", "B"],
            correct_answer: "C",
          },
        ],
      });

    // Otherwise the quiz would be unpassable and nobody would know why.
    expect(res.status).toBe(400);
  });
});

// ── Assignments and feedback ────────────────────────────────────────────────

describe("assignments", () => {
  it("replaces a resubmission and returns it for review", async () => {
    const { course, assignment } = await makeCourse({
      lessons: 1,
      withAssignment: true,
    });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    await request(server)
      .post("/assignments/submit")
      .set(auth(childUser))
      .send({ assignment_id: String(assignment._id), content: "First go" });

    await request(server)
      .post("/assignments/submit")
      .set(auth(childUser))
      .send({ assignment_id: String(assignment._id), content: "Second go" });

    expect(await Submission.countDocuments({})).toBe(1);
    const stored = await Submission.findOne({});
    expect(stored.content).toBe("Second go");
    expect(stored.status).toBe("submitted");
  });

  it("puts a reviewed piece back in the queue when resubmitted", async () => {
    const { owner, course, assignment } = await makeCourse({
      lessons: 1,
      withAssignment: true,
    });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    await request(server)
      .post("/assignments/submit")
      .set(auth(childUser))
      .send({ assignment_id: String(assignment._id), content: "First" });

    await request(server)
      .put(`/assignments/${assignment._id}/feedback`)
      .set(auth(owner))
      .send({ student_id: String(student._id), grade: "B", feedback: "Good start." });

    let stored = await Submission.findOne({});
    expect(stored.status).toBe("reviewed");
    expect(stored.grade).toBe("B");

    await request(server)
      .post("/assignments/submit")
      .set(auth(childUser))
      .send({ assignment_id: String(assignment._id), content: "Improved" });

    stored = await Submission.findOne({});
    // The old grade no longer describes what is there.
    expect(stored.status).toBe("submitted");
    expect(stored.grade).toBeNull();
  });

  it("refuses an empty text submission and a malformed link", async () => {
    const { course, assignment } = await makeCourse({
      lessons: 1,
      withAssignment: true,
    });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    const empty = await request(server)
      .post("/assignments/submit")
      .set(auth(childUser))
      .send({ assignment_id: String(assignment._id), content: "" });
    expect(empty.status).toBe(400);

    const badLink = await request(server)
      .post("/assignments/submit")
      .set(auth(childUser))
      .send({
        assignment_id: String(assignment._id),
        kind: "link",
        link: "not-a-url",
      });
    expect(badLink.status).toBe(400);
  });
});

describe("the positive-language check", () => {
  it("catches phrases aimed at the child", () => {
    for (const phrase of [
      "This is lazy work.",
      "What a stupid answer.",
      "You never listen.",
      "This is a waste of time.",
      "Just give up.",
    ]) {
      expect(checkPositiveLanguage(phrase).ok).toBe(false);
    }
  });

  it("leaves ordinary corrective feedback alone", () => {
    for (const phrase of [
      "This is wrong — the loop needs to repeat 10 times, not 5.",
      "Good effort. Try adding a second sprite next time.",
      "Nearly there: the sound plays before the move, so swap them.",
      "Incorrect answer on question 3; review the lesson on loops.",
    ]) {
      expect(checkPositiveLanguage(phrase).ok).toBe(true);
    }
  });

  it("refuses discouraging feedback over HTTP with a suggestion", async () => {
    const { owner, course, assignment } = await makeCourse({
      lessons: 1,
      withAssignment: true,
    });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    await request(server)
      .post("/assignments/submit")
      .set(auth(childUser))
      .send({ assignment_id: String(assignment._id), content: "Done" });

    const res = await request(server)
      .put(`/assignments/${assignment._id}/feedback`)
      .set(auth(owner))
      .send({
        student_id: String(student._id),
        grade: "D",
        feedback: "This is lazy and terrible.",
      });

    expect(res.status).toBe(422);
    expect(res.body.reason).toMatch(/encouraging language/i);
    expect(res.body.fields.feedback).toBeTruthy();

    // And nothing was saved.
    const stored = await Submission.findOne({});
    expect(stored.status).toBe("submitted");
    expect(stored.feedback).toBeNull();
  });
});

// ── Ownership ───────────────────────────────────────────────────────────────

describe("course ownership", () => {
  it("stops an instructor editing a course that is not theirs", async () => {
    const { course } = await makeCourse({ lessons: 1 });
    const stranger = await makeUser({ role: "instructor" });

    const res = await request(server)
      .put(`/admin/courses/${course._id}`)
      .set(auth(stranger))
      .send({ title: "Hijacked" });

    expect(res.status).toBe(403);
    expect((await Course.findById(course._id)).title).toBe("Test Course");
  });

  it("lets an admin edit any course", async () => {
    const { course } = await makeCourse({ lessons: 1 });
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .put(`/admin/courses/${course._id}`)
      .set(auth(admin))
      .send({ title: "Renamed by admin" });

    expect(res.status).toBe(200);
  });

  it("hides a draft course from students, and shows it to staff", async () => {
    const { course, owner } = await makeCourse({ lessons: 1, status: "draft" });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    const asStudent = await request(server)
      .get(`/courses/${course._id}/modules`)
      .set(auth(childUser));
    // A 404, not a 403: confirming a draft exists is itself a small leak.
    expect(asStudent.status).toBe(404);

    const asInstructor = await request(server)
      .get(`/courses/${course._id}/modules`)
      .set(auth(owner));
    expect(asInstructor.status).toBe(200);
  });

  it("stops a student reading a published course they are not enrolled on", async () => {
    const { course } = await makeCourse({ lessons: 1 });
    const { childUser } = await makeFamily();

    const res = await request(server)
      .get(`/courses/${course._id}/modules`)
      .set(auth(childUser));

    expect(res.status).toBe(403);
  });

  it("refuses to publish a course with no lessons", async () => {
    const { course } = await makeCourse({ lessons: 0, status: "draft" });
    // Publishing is admin-only by the matrix (PRD §10.1), so an instructor
    // would be refused before the emptiness check is even reached.
    const admin = await makeUser({ role: "admin" });

    const res = await request(server)
      .post(`/admin/courses/${course._id}/publish`)
      .set(auth(admin));

    expect(res.status).toBe(400);
  });

  it("does not let an instructor publish at all", async () => {
    const { course, owner } = await makeCourse({ lessons: 1, status: "draft" });

    const res = await request(server)
      .post(`/admin/courses/${course._id}/publish`)
      .set(auth(owner));

    expect(res.status).toBe(403);
    expect((await Course.findById(course._id)).status).toBe("draft");
  });

  it("stops a student reading another student's submission", async () => {
    const { owner, course, assignment } = await makeCourse({
      lessons: 1,
      withAssignment: true,
    });
    const mine = await makeFamily();
    const theirs = await makeFamily();
    await enrol(mine.student, course);
    await enrol(theirs.student, course);

    await request(server)
      .post("/assignments/submit")
      .set(auth(mine.childUser))
      .send({ assignment_id: String(assignment._id), content: "My work" });

    // The student assignment list only ever carries their own submission.
    const res = await request(server)
      .get("/assignments")
      .set(auth(theirs.childUser));

    expect(res.status).toBe(200);
    const row = res.body.find((a) => a.id === String(assignment._id));
    expect(row.status).toBe("pending");
    expect(row.submission_id).toBeNull();

    // The instructor does see it.
    const queue = await request(server)
      .get("/assignments/instructor")
      .set(auth(owner));
    expect(queue.body[0].submissions).toHaveLength(1);
  });
});

// ── Cascades ────────────────────────────────────────────────────────────────

describe("cascading deletes", () => {
  it("removes everything beneath a deleted course", async () => {
    const { course, lessons, quiz, assignment } = await makeCourse({
      lessons: 2,
      withQuiz: true,
      withAssignment: true,
    });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    await request(server)
      .post(`/lessons/${lessons[0]._id}/complete`)
      .set(auth(childUser));
    await request(server)
      .post("/assignments/submit")
      .set(auth(childUser))
      .send({ assignment_id: String(assignment._id), content: "Work" });
    await request(server)
      .post("/quiz/submit")
      .set(auth(childUser))
      .send({ quiz_id: String(quiz._id), answers: {} });

    const admin = await makeUser({ role: "admin" });
    const res = await request(server)
      .delete(`/admin/courses/${course._id}`)
      .set(auth(admin));
    expect(res.status).toBe(200);

    // Nothing orphaned: orphans would still count toward progress totals.
    expect(await Course.countDocuments({})).toBe(0);
    expect(await Module.countDocuments({})).toBe(0);
    expect(await Lesson.countDocuments({})).toBe(0);
    expect(await Quiz.countDocuments({})).toBe(0);
    expect(await Assignment.countDocuments({})).toBe(0);
    expect(await Submission.countDocuments({})).toBe(0);
    expect(await QuizAttempt.countDocuments({})).toBe(0);
    expect(await LessonCompletion.countDocuments({})).toBe(0);
    expect(await Enrollment.countDocuments({})).toBe(0);
  }, 30000);

  it("removes a module's contents and recalculates the course", async () => {
    const { owner, course, module, lessons } = await makeCourse({ lessons: 2 });
    const { student, childUser } = await makeFamily();
    await enrol(student, course);

    await request(server)
      .post(`/lessons/${lessons[0]._id}/complete`)
      .set(auth(childUser));
    expect((await Enrollment.findOne({})).progress).toBe(50);

    const res = await request(server)
      .delete(`/modules/${module._id}`)
      .set(auth(owner));
    expect(res.status).toBe(200);

    expect(await Lesson.countDocuments({})).toBe(0);
    expect(await LessonCompletion.countDocuments({})).toBe(0);
    // No content left, so there is nothing to have completed.
    expect((await Enrollment.findOne({})).progress).toBe(0);
  });
});
