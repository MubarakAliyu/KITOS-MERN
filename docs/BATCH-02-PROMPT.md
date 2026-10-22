# KITOS 2.0 — BATCH 2 BUILD PROMPT

### Learning core and hybrid sessions

> Read `CLAUDE.md`, `docs/PRD.md` (§6 FR7–FR14, §8, §9.3–9.4) and `docs/PROGRESS.md` (Batch 1 report) first.
> Checkpoint alignment: **Develop and Implement** — modular, scalable services with tests.
> Goal: by the end, an instructor builds a course and runs a session, a student learns, is marked present, completes
> the course and receives a verifiable certificate, and the parent sees it all — every screen involved running on
> the real API. Branch `batch/02-learning-sessions` from the merged Batch 1.

---

## PART A — Models

`Course`, `Module`, `Lesson`, `Quiz` (embedded `questions[]`), `QuizAttempt`, `Assignment`, `Submission`,
`Enrollment`, `LessonCompletion`, `Certificate`, `Session`, `Attendance`, `Recording`. Fields and indexes per PRD §8.2.
Deleting a course/module cascades in a transaction (modules → lessons, quizzes, assignments, submissions, attempts,
completions; recalc affected enrolments).

## PART B — Courses and content (match `courses.js`, `lessons.js`, `instructor.js`, `admin.js`)

- [ ] `GET /courses` (students: enrolled + published catalogue; instructor: assigned; admin: all; filters
      `status`, `programme_track`, `q`; shapes per handlers.js incl. counts and `progress` for students).
- [ ] `GET /courses/:id/modules` with nested lessons, `completed` flags for the student, `quiz_id`,
      `assignment_id`, `lessons_count` — same shape the PHP `build_module` helper returned (read it for reference).
- [ ] `POST /courses`, `POST /modules`, `DELETE /modules/:id`, `POST /lessons`, `GET/PUT/DELETE /lessons/:id`,
      `GET /modules/:id/lessons`. Lesson `body_content` sanitised (allow headings, lists, links, code, images,
      YouTube iframes from `youtube-nocookie.com` only). Adding/removing lessons recalculates progress for every
      enrolment of that course (background-safe, in one service).
- [ ] Admin course routes: `GET/POST /admin/courses`, `PUT/DELETE /admin/courses/:id`,
      `POST /admin/courses/:id/publish|unpublish`, `GET /admin/courses/:id/editor`; complete
      `POST /admin/users/assign-instructor` (sets `course.instructor_id`, notifies instructor) — close the Batch 1 ADR.
- [ ] `GET /instructors/me/courses`, `GET /instructors/me/students` (with per-student progress, last activity).

## PART C — Assessment

- [ ] `POST /quizzes`, `PUT/DELETE /quizzes/:id`, `GET /quizzes/:id/questions` (strip `correct_answer` for
      students), `POST /quiz/submit` (auto-grade server-side; store best score; return per-question result shape used
      by `QuizPlayer.jsx`).
- [ ] `POST /assignments`, `PUT /assignments/:id`, `GET /assignments` (student view with status
      pending/submitted/reviewed), `GET /assignments/instructor`, `POST /assignments/submit` (text, link, or file via
      the `storage` interface — `local` provider now, Cloudinary provider written and unit-tested, switched on in
      Batch 3), `PUT /assignments/:id/feedback` (grade + feedback; **positive-language check** returns 422 with
      `reason` and suggestions when a discouraging phrase is found; notifies student and parent).

## PART D — Enrolment, progress, certificates

- [ ] Enrolment service: admin enrol/unenrol (expose on the admin user detail endpoints the frontend already calls;
      add an ADR if a new route is needed), auto-enrol on successful payment (hook used in Batch 3).
      `GET /admin/pending-enrollments` reads `status: pending`.
- [ ] `POST /lessons/:id/complete` → upsert completion → recalc progress (lessons + quizzes passed ≥ 50% +
      assignments submitted, weights in one constant) → at 100% mark enrolment completed and **issue certificate**
      (transaction; idempotent).
- [ ] Certificates: serial `KIT-CERT-2026-0001`, 10-char verification code, PDF via `pdfkit` (KIT logo, student
      name, course, date, serial, QR/URL to verification page, footer "Powered by StarNova Labs" + logo);
      `GET /certificates` (own; parent sees children's), `GET /certificates/:id/pdf`,
      `GET /certificates/verify/:code` (public; returns name initials + course + date only).
      Add a public `client` page `/verify/[code]` reusing existing card styles (no new design language).
- [ ] Student and parent dashboards (`/students/me`, `/parents/me/children`, `/students/:id/progress`) now return
      real enrolments, progress, recent activity, upcoming sessions and certificates.

## PART E — Sessions, attendance, recordings (replace the client-side mock)

- [ ] Implement every route in PRD §9.4. Status computed exactly like `computeStatus()` in the current
      `client/src/_lib/api/sessions.js`. Response shapes = the objects `buildMockSessions()` returns today.
- [ ] Rewrite the bodies of `client/src/_lib/api/sessions.js` to call `apiClient` (keep every exported function name
      and return shape so no component changes). Delete `buildMockSessions()` and its helpers; keep the mock in
      `handlers.js` for MSW mode.
- [ ] Visibility: students see sessions for their enrolled courses/cohorts; parents see their children's;
      instructors their own; admin all.
- [ ] Attendance: `GET /sessions/:id/roster` (enrolled students + current status), `PUT /sessions/:id/attendance`
      (bulk upsert, instructor/admin, only from start − 15 min to end + 24 h), `GET /sessions/:id/attendance`.
- [ ] QR check-in: `POST /sessions/:id/qr-token` (instructor; JWT with session id, 60 s expiry) and
      `POST /sessions/:id/check-in { token }` (student; must be enrolled; session live; method `qr`). Add a QR display
      to the existing instructor session detail page using the existing modal shell (`ModalShell.jsx`) and a
      "Scan to check in" entry on the student live-session banner (camera via `BarcodeDetector` with manual-code
      fallback). Keep styling consistent with existing components.
- [ ] Online join: the student "Join" action calls `POST /sessions/:id/check-in { method: "auto" }` before opening
      `meeting_url`.
- [ ] Recordings: `POST /sessions/:id/recordings { url, source }`; listed on the student recordings page.
- [ ] Cancel / reschedule notify enrolled students and their parents (in-app now; email if SMTP configured).
- [ ] `src/jobs/reminders.js`: every 5 min and once on boot — 24 h and 15 min reminders (idempotent via a
      `reminders_sent` array on the session), overdue-assignment notices.
- [ ] Admin: overview counts, all-sessions table with filters, attendance report (per course, per student, %).

## PART F — Seed (extend)

Courses for Scratch, Web Development and Robotics with modules, lessons, quizzes and assignments matching the mock
titles ("Scratch Programming — Week 1…", "HTML Basics", "CSS Styling", "Robotics Basics"); enrolments; some
completions and submissions (one reviewed); one certificate; sessions relative to "now" (one live, upcoming,
completed with attendance and a recording, one cancelled).

## PART G — Tests

- [ ] Services: progress recalculation (add/remove lesson), certificate idempotency, quiz grading, feedback
      language check, session status computation, attendance window, QR token expiry and replay.
- [ ] Routes: ownership for every new route (student A cannot read student B's submission; instructor cannot edit
      a course not assigned; parent sees only own children's sessions); cascades.
- [ ] Playwright: instructor creates module + lesson + quiz → student completes → parent sees progress →
      certificate verifies; instructor schedules session → appears for student → attendance saved → recording visible.

## Acceptance criteria

- AC2.1 No component in `client/` imports mock data for courses, lessons, quizzes, assignments, certificates or
  sessions when `NEXT_PUBLIC_API_MOCKING` is disabled.
- AC2.2 The end-to-end learning journey (above) passes on desktop and Pixel 7.
- AC2.3 Physical (QR), online (auto) and roster attendance all record with the right `method`; the admin report
  matches.
- AC2.4 Certificate PDF carries the KIT logo and StarNova footer and verifies at `/verify/<code>`.
- AC2.5 Gates green (server lint + tests; client lint + build; CI). `docs/API.md` covers every Batch 2 route.

**Report** as in Batch 1 (endpoint count n/N, tests, screenshots, ADRs, deferred items). Then stop.
