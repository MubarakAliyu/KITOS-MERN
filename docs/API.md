# KITOS 2.0 — API reference

Every endpoint implemented so far. Batch 1 covers authentication, accounts, families and platform
settings; Batch 2 adds courses and content, the work a child does, certificates and the live and
hybrid sessions; Batch 3 will add chat and payments.

**Base URL** — `NEXT_PUBLIC_API_URL`. No `/api/v1` prefix: the frontend calls `/login`, `/admin/users`
and so on directly (ADR-005).

**Authentication** — every route except those marked *Public* needs
`Authorization: Bearer <access>`. The token is HS256, 24 hours, and carries `sub`, `role` and `tv`
(token version). The signature and expiry are verified on every request, the account must still exist
and be active, and `tv` must match the user's current `token_version` — so a password change or a
deactivation invalidates existing sessions on the next request rather than in 24 hours.

**Conventions** — JSON in and out, snake_case fields, `id` as a string, ISO 8601 dates, UTC stored and
Africa/Lagos displayed by the client. Request bodies are capped at 1 MB.

**Errors** — `{ "error": "<message>", "reason"?: "<detail>", "fields"?: { "<field>": "<message>" } }`.
`error` is safe to show a user; `fields` drives form validation. No stack traces or database messages
leave the server in production.

| Status | Meaning |
|---|---|
| 400 | Validation failed, malformed JSON, or a bad id |
| 401 | Missing, invalid, expired or revoked token; wrong credentials |
| 403 | Authenticated but not permitted, or consent missing |
| 404 | No such route or record |
| 409 | Duplicate email or admission number |
| 413 | Body over 1 MB |
| 429 | Rate limited |
| 500 | Unexpected — logged server-side with a request id |

Every response carries `x-request-id`; send it back when reporting a problem.

---

## Health

### `GET /health` — *Public*

Liveness and database state. Used by Render's health check and by CI.

```json
{ "ok": true, "db": "up", "version": "2.0.0" }
```

`db` is `"up"` or `"down"`. Always 200: a 500 here would take the service out of rotation for a
database blip it may recover from.

---

## Authentication

### `POST /login` — *Public*

Rate limited: 10 per 15 minutes, keyed on IP **and** identifier, so one attacker cannot lock every
account out from one address and a spray across accounts still trips.

The `email` field carries either an email address or an admission number — the frontend sends both
through the same field. An identifier matching `KIT/YY/NNN` is treated as an admission number.

```json
{ "email": "admin@kidsintech.school", "password": "…" }
```

**200 — signed in**

```json
{
  "access": "<jwt>",
  "token": "<the same jwt>",
  "user": {
    "id": "6ada…", "email": "admin@kidsintech.school", "admission_no": null,
    "role": "admin", "name": "Admin User",
    "language_preference": "en", "must_reset_password": false
  }
}
```

`access` is the field the client reads; `token` is an alias kept for shape compatibility (ADR-011).

**200 — a password change is required first**

```json
{ "must_reset_password": true, "temp_token": "<jwt>", "user": { "…": "…" } }
```

No `access` is issued. The `temp_token` is good only for `POST /user/change-password`; presenting it as
a credential is rejected.

**Errors** — 401 `Invalid credentials` (or `Invalid admission number or password`) for an unknown
account *or* a wrong password, deliberately identical so the response cannot be used to enumerate
users; 401 `Account deactivated`; 403 `Account pending parental consent` for a child whose parent has
not consented.

### `POST /forgot-password` — *Public*

Rate limited: 5 per hour. Always returns `{ "ok": true }`, whether or not the address is registered.
Emails a single-use link to `${CLIENT_ORIGIN}/reset-password?token=…`; only the token's SHA-256 hash is
stored, with a 30-minute expiry.

### `POST /reset-password` — *Public*

`{ "token": "…", "password": "…" }`. Clears `must_reset_password` and increments `token_version`, so
every existing session for that user ends. 400 `Invalid or expired token` covers an unknown, used or
expired token alike.

### `POST /user/change-password` — *Public with a temp token, otherwise authenticated*

Rate limited: 10 per hour.

```json
{ "current_password": "…", "new_password": "…" }
```

or, completing a forced reset before any session exists:

```json
{ "temp_token": "<jwt>", "new_password": "…" }
```

Passwords need 8+ characters with a letter and a digit. On success `token_version` is incremented and
a fresh `access` is returned, so the caller is not logged out by the revocation they just caused. A
temp token cannot be replayed.

---

## Own account

### `GET /user/me`

The signed-in user. A student also gets `student_id`, `age`, `programme_track` and `status`.

### `PUT /user/profile`

`{ "name"?, "phone"?, "avatar_url"? }` → `{ "ok": true, "name", "phone", "avatar_url" }`.

Students cannot change their own name: it appears on their certificates and their parent's dashboard.
The field is accepted and ignored for them.

### `PUT /user/language`

`{ "language_preference": "en" | "ha" }` → `{ "success": true, "language_preference": "ha" }`.
400 on any other value.

---

## Admin — users

All require the `users.manage` permission (admin only by default).

### `GET /admin/users`

Returns a **bare array** — what the users table consumes (ADR-010).

| Query | Meaning |
|---|---|
| `role` | `admin` \| `instructor` \| `parent` \| `student` |
| `status` | `active` \| `inactive` |
| `q` | Contains-match on name, email or admission number; escaped, so `.*` is literal |
| `page`, `limit` | Default page 1, limit 100 here, max 100 |

```json
[{
  "id": "6ada…", "role": "student", "name": "Liam Hassan",
  "email": "student@kidsintech.school", "admission_no": "KIT/26/001",
  "status": "active", "language_preference": "en", "must_reset_password": false,
  "avatar_url": null, "phone": null,
  "last_login_at": "2026-10-22T18:32:20.896Z",
  "created_at": "2026-10-22T18:31:30.831Z",
  "age": 12, "programme_track": "Web Development",
  "student_id": "6ada…", "enrolled_courses": []
}]
```

Rows for administrators also carry `permissions` — their dashboard section toggles (ADR-021).

`status`, not `is_active`. `enrolled_courses` is empty until Batch 2. `password_hash`, `token_version`
and the reset-token fields are never serialised anywhere.

### `POST /admin/users`

```json
{ "role": "student", "name": "New Pupil", "age": 10,
  "programme_track": "Scratch Programming", "parent_id": "6ada…" }
```

`email` is required for every role except `student`; `parent_id`, `age` and `programme_track` are
required for a student. A track may be a slug (`web-development`) or the label the form submits
(`Web Development`).

**201** — the user row plus `"password": "KITeSsjb577"`, the one-time password, **returned once** and
never stored in the clear or logged (ADR-017). The account carries `must_reset_password: true`.

Students get an admission number from an atomic counter, so parallel creates cannot collide. A student
is `active` if the parent has already consented and `pending` otherwise.

409 on a duplicate email.

### `PUT /admin/users/:id`

`{ "name"?, "email"?, "age"?, "programme_track"?, "language_preference"?, "phone"? }`.

A role change is refused with 400: a parent carrying children or a student carrying progress cannot
coherently become something else, and permitting it would be a quiet way to grant admin rights.

### `POST /admin/users/activate` · `POST /admin/users/deactivate`

`{ "user_id": "6ada…" }` → `{ "success": true, "message": "User deactivated", "user": { … } }`.

Deactivation increments `token_version`, so that user's current session is rejected on its next
request. An administrator cannot deactivate themselves. 404 for an unknown user.

### `POST /admin/users/assign-instructor`

`{ "user_id": "6ada…", "course_id"? }` → `{ "success": true }`.

Validates that the target is an active instructor and records the intent in the audit log. There is no
`courses` collection until Batch 2, so nothing is assigned yet (ADR-012).

### `GET /admin/next-admission-no`

`{ "next": "KIT/26/009" }`. A preview for the Add User modal; it does **not** consume the number.

---

## Admin — oversight

### `GET /admin/stats` — `analytics.view`

Platform counts. `total_courses`, `total_revenue` and `active_subscriptions` are 0 until Batches 2
and 3.

### `GET /admin/activity-log` — `audit.view`

Newest first, in the shape the admin screen reads:

```json
[{ "id": "6ada…", "user_name": "Admin User", "user_role": "admin",
   "action": "created_user", "description": "Created instructor account for …",
   "ip": "::1", "timestamp": "2026-10-22T18:32:22.274Z" }]
```

Append-only. Every admin mutation and every security event writes a row: `login`, `login_failed`,
`login_failure_burst`, `login_blocked_inactive`, `login_blocked_pending_consent`, `created_user`,
`updated_user`, `activated_user`, `deactivated_user`, `assigned_instructor`, `added_child`,
`password_changed`, `password_reset`, `password_reset_requested`, `updated_permissions`,
`updated_settings`.

### `GET /admin/pending-enrollments` — `users.manage`

Children whose parent has not yet consented, so they cannot sign in.

### `POST /admin/permissions` — `settings.manage`

```json
{ "permissions": { "analytics.view": ["admin", "instructor"] } }
```

→ `{ "success": true, "applied": ["analytics.view"], "ignored": [], "permissions": { … } }`

Takes effect immediately, without a restart. Unknown permission keys and unknown roles are returned in
`ignored` rather than stored, and an override can never strip `admin` from a permission it holds by
default — a saved typo must not make the platform unadministrable.

**This endpoint also accepts the roles screen's own shape** (ADR-021) — per-administrator dashboard
sections, keyed by admin user id:

```json
{ "permissions": { "6ada…": { "dashboard": true, "users": true, "courses": false,
                              "analytics": false, "payments": true,
                              "announcements": true, "settings": false } } }
```

→ `{ "success": true, "applied": ["6ada…"], "ignored": [] }`

These control which sections that administrator sees and **are not authorisation**: what the account
may do is decided solely by the role matrix, which they cannot widen or narrow. They come back on each
administrator's row from `GET /admin/users` as `permissions`, defaulting to every section enabled.

The two shapes are told apart by their keys — a permission key is a dotted name, an administrator id
is 24 hex characters. A payload mixing both is refused rather than guessed at; an unrecognised key is
treated as a mistyped matrix key and reported in `ignored`, so one typo cannot discard a valid save.

---

## Parents, students, instructors

### `GET /parents/me` — parent

```json
{ "id": "6ada…", "user_id": "6ada…", "name": "Mrs. Fatima Hassan",
  "email": "parent@kidsintech.school", "phone": "+234 801 234 5678" }
```

`id` equals `user_id`: there is no separate parents collection (ADR-013).

### `GET /parents/me/children` — parent

Their own children, oldest-added first.

```json
[{ "id": "6ada…", "parent_id": "6ada…", "name": "Liam Hassan", "age": 12,
   "programme_track": "Web Development", "avatar_initial": "L",
   "enrolled_courses": 0, "completed_courses": 0,
   "status": "active", "admission_no": "KIT/26/001" }]
```

`id` is the **student** document id — what `/students/:id/progress` is keyed on. The progress counters
are 0 until Batch 2. `avatar_initial` skips an honorific, so "Ms. Sarah Aliyu" gives `S`.

### `POST /students` — `child.manage` (parent only)

A parent adds a child, with consent.

```json
{ "name": "Zara Hassan", "age": 10, "programme_track": "Scratch Programming",
  "consent": { "version": "1.0", "accepted": true } }
```

`consent.accepted` must be exactly `true`; anything else is a 400 and nothing is written. Age must be
8–18. Unknown fields are rejected rather than ignored.

Creates the sign-in account, the learning profile and the consent record in one transaction, so a
half-made child cannot exist. Notifies every administrator, and emails the parent.

**201**

```json
{ "id": "6ada…", "parent_id": "6ada…", "name": "Zara Hassan", "age": 10,
  "programme_track": "Scratch Programming", "avatar_initial": "Z",
  "enrolled_courses": 0, "completed_courses": 0, "status": "active",
  "admission_no": "KIT/26/009", "password": "KITFqvYa384",
  "consent_id": "6ada…" }
```

`password` is shown **once**, for the parent to note. The child must change it on first sign-in.

The consent row records the version, scopes, timestamp, IP and user agent, as evidence for the Nigeria
Data Protection Act 2023.

### `GET /students/me` — student

```json
{ "id": "6ada…", "parent_id": "6ada…", "name": "Liam Hassan", "age": 12,
  "programme_track": "Web Development", "admission_no": "KIT/26/001",
  "email": "student@kidsintech.school", "status": "active" }
```

404 if the account has no learning profile.

### `GET /students/:id/progress` — `content.read`

Per-course progress, one row per enrolment. Ownership is enforced in the service as well as by the
matrix: a parent may read only their own children, a student only their own record, an admin anyone,
and an instructor only a child enrolled on one of their own courses (the narrowing ADR-014 deferred
to Batch 2). 403 otherwise.

```json
[{ "course_id": "6ada…", "course_title": "Scratch Programming",
   "instructor_name": "Ms. Sarah Aliyu", "progress": 100,
   "modules_completed": 8, "modules_total": 8,
   "last_active": "2026-10-31T21:20:28.861Z", "status": "completed" }]
```

`modules_completed` and `modules_total` count completable items — lessons, quizzes and assignments —
which is what the screen labels "modules".

### `GET /instructors/me` — instructor

```json
{ "id": "6ada…", "user_id": "6ada…", "name": "Ms. Sarah Aliyu",
  "email": "instructor@kidsintech.school", "bio": "…", "avatar_initial": "S",
  "courses_count": 2, "students_count": 6, "joined": "2026-10-22" }
```

`students_count` counts distinct children: one pupil on three of their courses is one pupil.

### `GET /instructors/me/courses`

The courses assigned to them, in the `GET /courses` shape below.

### `GET /instructors/me/students`

One row per child they teach — not per enrolment — carrying `student_id`, `admission_no`,
`enrolled_courses` (course ids), `enrolled_courses_details`, quiz scores and averages, and the
assignments completed and outstanding.

### `GET /instructors/me/sessions`

Their own classes, in the `GET /sessions` shape below.

---

## Courses and content

### `GET /courses` — `content.read`

Every course a student may see is a published one they are enrolled on; an instructor and an admin
see all of them. `progress` is present for a student, absent otherwise.

```json
[{ "id": "6ada…", "title": "Scratch Programming", "description": "…",
   "thumbnail_url": null, "price": 15000, "price_kobo": 1500000,
   "payment_type": "subscription", "instructor_id": "6ada…",
   "instructor_name": "Ms. Sarah Aliyu", "programme_track": "Scratch Programming",
   "status": "published", "is_published": true,
   "modules_count": 3, "lessons_count": 5, "students_count": 4,
   "completion_rate": 35, "progress": 100, "created_at": "2026-11-02T21:20:28.617Z" }]
```

`price` is naira for display; `price_kobo` is the stored integer (ADR-002). `module_count` and
`modules_count` are both present because the retained screens read each, and likewise `thumbnail`
and `thumbnail_url`.

### `GET /courses/:id/modules` — `content.read`

Modules in order, each with `lessons_count`, `quiz_id` and `assignment_id` (null where absent).

A draft course 404s for a student rather than 403 — confirming that a draft exists is itself a small
leak of what the school is preparing. A published course they are not enrolled on is 403.

### `GET /modules/:id/lessons` · `GET /lessons/:id` — `content.read`

Lesson bodies are sanitised HTML (ADR-024). `GET /lessons/:id` adds `completed` for a student.

### `POST /courses` · `POST /admin/courses` — `course.create`

```json
{ "title": "Scratch Programming", "description": "…", "programme_track": "scratch",
  "instructor_id": "6ada…", "price_kobo": 1500000, "payment_type": "subscription" }
```

`programme_track` is one of `scratch`, `web-development`, `robotics`, `advanced`, and also accepts
the display label the form submits. 201 with the created course.

### `PUT /admin/courses/:id` — `course.edit` · `DELETE /admin/courses/:id` — `course.create`

Deleting cascades to the course's modules, lessons, quizzes, assignments, submissions, quiz attempts,
lesson completions, enrolments, sessions, attendance marks and recordings. Certificates are
deliberately **not** deleted: a child earned theirs against the course as it stood, the name and
title on it are snapshots, and retiring a course must not void certificates already in a family's
hands or break the code printed on them.

### `POST /admin/courses/:id/publish` · `…/unpublish` — `course.publish`

Admin only (ADR-025). Publishing a course with no lessons is refused with 400 — an empty listing in
front of children is worse than no listing.

### `GET /admin/courses/:id/editor` — `course.edit`

The whole course tree in one response: modules, their lessons, quizzes and assignments, for the
editor screen.

### `POST /modules` · `DELETE /modules/:id` — `course.edit`

An instructor may only touch a course assigned to them; an admin, any. Deleting a module removes its
lessons, quizzes and assignments, then recalculates every enrolment on the course — the denominator
has changed for everyone.

### `POST /lessons` · `PUT /lessons/:id` · `DELETE /lessons/:id` — `course.edit`

```json
{ "module_id": "6ada…", "title": "What is Scratch?", "content_type": "text",
  "body_content": "<p>…</p>", "video_url": null, "order_index": 1 }
```

`content_type` is `text`, `video` or `pdf`. A YouTube URL is normalised to its embed form.

### `POST /quizzes` · `PUT /quizzes/:id` · `DELETE /quizzes/:id` — `course.edit`

One quiz per module. Questions carry `question_text`, `question_type` (`mcq` or `true_false`),
`options` and `correct_answer`.

### `GET /quizzes/:id/questions` — `content.read`

The questions **without** `correct_answer`. Marking happens on the server; a child who opens the
network tab finds nothing to copy.

---

## Doing the work

### `POST /lessons/:id/complete` — `lesson.complete`

Idempotent: completing twice leaves one record and the same progress.

```json
{ "success": true, "progress": 100, "course_completed": true, "certificate": { … } }
```

### `POST /quiz/submit` — `quiz.submit`

```json
{ "quiz_id": "6ada…", "answers": { "<question_id>": "A sprite" } }
```

Marked server-side. The best attempt is kept, and `attempts` counts them all.

```json
{ "success": true, "score": 1, "total": 1, "percentage": 100, "passed": true,
  "pass_mark": 50, "attempts": 1, "best_percentage": 100,
  "results": [ … ], "course_completed": true }
```

A quiz counts toward progress only at or above `pass_mark`.

### `GET /assignments` — student · `POST /assignments/submit` — `assignment.submit`

A submission is a link, a file or written text. Resubmitting puts the work back in the queue and
clears the old grade — it no longer describes what is there.

### `POST /assignments` · `PUT /assignments/:id` — `course.edit` · `GET /assignments/instructor` · `PUT /assignments/:id/feedback` — `submission.review`

Feedback is checked against the positive-language rule (PRD §10): discouraging wording is
refused with 422 and a suggested rewording rather than silently softened — the instructor decides
what to say.

### Progress

One rule, in one place: lessons, passed quizzes and submitted assignments each count equally, and a
course with no content at all is 0%, never 100%. Any of the three can be the last piece of work, and
whichever it is issues the certificate.

---

## Certificates

### `GET /certificates` — `content.read`

A student's own; an admin may read any.

```json
[{ "id": "6ada…", "student_name": "Liam Hassan", "course_title": "Scratch Programming",
   "instructor_name": "Ms. Sarah Aliyu", "serial": "KIT-CERT-2026-0001",
   "verification_code": "7QX2M9KD4P", "issued_at": "2026-11-02T21:20:29.000Z",
   "score_average": 100, "pdf_url": "/certificates/6ada…/pdf", "is_unlocked": true }]
```

Issued once per student and course, inside a transaction, idempotent under a double click or two
requests racing to finish the last lesson. The name and course title are snapshots.

### `GET /certificates/:id/pdf` — `content.read`

The certificate as a PDF: landscape A4, the Kids In Tech logo, the serial, the verification code and
a link to the verification page. The owner, their parent and an admin may fetch it; anyone else 403.

### `GET /certificates/verify/:code` — *Public*

Deliberately unauthenticated: the point is that anyone handed a certificate can check it.

```json
{ "valid": true, "student_initials": "L.H.", "course_title": "Scratch Programming",
  "serial": "KIT-CERT-2026-0001", "issued_at": "2026-11-02T21:20:29.000Z" }
```

Initials only, never a child's name (FR11). An unknown code returns `{ "valid": false }` with 200,
not 404 — the page's job is to answer the question either way.

---

## Live and hybrid sessions

A session's **status is computed from the clock, never stored**: `live` between its start and its
end, `completed` after, `scheduled` before, and `cancelled` whatever the time. Nothing has to run on
a timer for a class to start, and no stored flag can drift out of step with reality.

| Window | Rule |
|---|---|
| Live | `scheduled_at` <= now <= `scheduled_at + duration_minutes` |
| Attendance open | 15 minutes before the start until 24 hours after the end |
| QR token | 60 seconds |

### `GET /sessions` — `session.view`

`?filter=` one of `all` (default), `live`, `upcoming`, `completed`, `cancelled`. A student sees
classes on the courses they are enrolled on, an instructor their own, an admin all.

```json
[{ "id": "6ada…", "title": "Web Development — Week 5", "description": "…",
   "course_id": "6ada…", "course": "Web Development", "instructor_id": "6ada…",
   "instructor_name": "Ms. Sarah Aliyu", "scheduled_at": "2026-11-03T21:20:29.010Z",
   "duration_minutes": 90, "ends_at": "2026-11-03T22:50:29.010Z",
   "session_number": 5, "mode": "hybrid", "join_url": "https://meet.google.com/…",
   "venue": "StarNova Labs, Sokoto", "status": "scheduled" }]
```

`join_url` is only offered while the class is live or about to be.

### `POST /sessions` — `session.manage`

```json
{ "course_id": "6ada…", "title": "Week 3 — Loops",
  "scheduled_at": "2026-11-10T15:00:00.000Z",
  "duration_minutes": 60, "session_number": 3, "mode": "hybrid",
  "meeting_url": "https://meet.google.com/…", "venue": "…", "max_students": 20 }
```

`course_id`, not a course name. An instructor may only schedule on a course assigned to them.

### `PUT /sessions/:id` · `POST /sessions/:id/cancel` · `POST /sessions/:id/reschedule` — `session.manage`

The course cannot be changed once a class exists: its register, its recordings and the children who
can see it all hang off that course. Cancelling takes a `reason` and notifies the enrolled children.

### `GET /sessions/:id/roster` — `attendance.mark`

Every enrolled child with their mark, and the attendance window.

```json
{ "session_id": "6ada…", "session_title": "Scratch Programming — Week 3",
  "scheduled_at": "2026-11-02T21:15:29.003Z", "status": "completed",
  "attendance_open": true,
  "attendance_opens_at": "2026-11-02T21:00:29.003Z",
  "attendance_closes_at": "2026-11-03T22:15:29.003Z",
  "students": [{ "student_id": "6ada…", "name": "Aisha Hassan",
                 "admission_no": "KIT/26/002", "status": null,
                 "method": null, "marked_at": null }] }
```

### `PUT /sessions/:id/attendance` — `attendance.mark`

```json
{ "records": [{ "student_id": "6ada…", "status": "present" }] }
```

`status` is `present`, `absent`, `late` or `excused`. A child not enrolled on the course is rejected
with 400 naming how many were unrecognised, rather than silently skipped. Saving by hand records
`method: "roster"` and overwrites an earlier self check-in: the instructor in the room is the
authority on who is there.

Outside the attendance window the request is refused with 403 and the window's own times.

### `POST /sessions/:id/qr-token` — `attendance.mark`

A 60-second token for the instructor to display. Short on purpose: a photograph of the screen passed
to a friend at home is stale almost immediately.

```json
{ "token": "…", "expires_in": 60 }
```

### `POST /sessions/:id/check-in` — student

```json
{ "token": "…", "method": "qr" }
```

The class must be live, the child must be enrolled, and a token issued for a different class is
refused — the obvious way to try to be in two places at once. `method: "auto"` is the mark made when
a child opens the meeting link, which is attendance enough for an online class (FR13).

### `POST /sessions/:id/recordings` — `recording.add` · `GET /recordings` — `session.view`

```json
{ "id": "6ada…", "session_id": "6ada…", "session_title": "Scratch Programming — Week 2",
  "course_id": "6ada…", "course_title": "Scratch Programming",
  "title": "Scratch Week 2 — recording", "url": "https://www.youtube.com/watch?v=…",
  "source": "youtube", "recorded_at": "2026-10-30T21:20:29.015Z" }
```

A child sees recordings for their own courses only.

### `GET /sessions/cancellations` — `session.view`

Recent cancellations, for the notice the dashboards show.

---

## Admin — enrolment and session oversight

### `POST /admin/enrollments` · `POST /admin/enrollments/remove` — `users.manage`

```json
{ "student_id": "6ada…", "course_id": "6ada…" }
```

`student_id` is the **Student record** id, not the child's user id. Enrolling someone already
enrolled is 409.

### `GET /admin/sessions` · `GET /admin/sessions/overview` — `analytics.view`

```json
{ "total_sessions": 6, "live_now": 0, "upcoming": 2, "completed": 3, "cancelled": 1,
  "total_attendance_marks": 6, "live_sessions": [ … ], "upcoming_sessions": [ … ] }
```

### `GET /admin/sessions/attendance-report` — `analytics.view`

```json
{ "sessions_held": 3,
  "courses": [{ "course_id": "6ada…", "course_title": "Scratch Programming",
                "sessions_held": 3, "expected_marks": 12, "present_marks": 6, "rate": 50 }],
  "students": [{ "student_id": "6ada…", "student_name": "Liam Hassan",
                 "sessions_attended": 2, "sessions_recorded": 2, "rate": 100,
                 "by_method": { "qr": 1, "roster": 1 } }] }
```

Only classes that have actually been held count toward `sessions_held`: a class still to come would
drag every rate down for no reason.

---

## Notifications

The model ships in Batch 1 and already holds real rows, so the read side is implemented now (ADR-019).

### `GET /notifications`

The caller's own feed, newest first, capped at 100. `?user_id=` is honoured only for an admin; every
other caller gets their own feed whatever they ask for.

```json
[{ "id": "6ada…", "user_id": "6ada…", "type": "child_added",
   "title": "New child added", "message": "…", "link": "/admin/users",
   "is_read": false, "created_at": "2026-10-22T18:31:31.477Z" }]
```

### `PUT /notifications/:id/read` · `PUT /notifications/read-all`

Mark one, or the caller's whole feed. Only the owner may mark their own.

### `POST /admin/notifications/send` — `chat.use`

Shared by the admin Announcement modal and by the client's platform-event helper. A non-admin may only
ever notify administrators, so a student cannot broadcast to every parent. Audience targeting
(`audience: "all" | "role"`, with `target`) is admin-only; `audience: "course"` is refused until
enrolments exist. Title and message are stripped of all markup.

→ `{ "success": true, "delivered": 3 }`

---

## Platform settings

### `GET /platform/settings` — any signed-in user

The UI reads the platform name and logo, so every role may read it.

```json
{ "id": "6ada…", "platform_name": "Kids In Tech LMS",
  "welcome_message": "…", "primary_color": "#10B981",
  "logo_url": "/brand/kit-logo.png",
  "permissions": { "users.manage": ["admin"], "…": ["…"] },
  "updated_at": "2026-10-22T18:31:31.000Z" }
```

### `POST /platform/settings` — `settings.manage`

`{ "platform_name"?, "welcome_message"?, "primary_color"?, "logo_url"?, "permissions"? }`.
`primary_color` must be a hex colour such as `#10B981`.

---

## Awaiting later batches

These answer with correctly shaped **empty** data so the retained screens render their empty states
rather than logging 404s (ADR-018). All are authenticated reads; none writes.

| Endpoint | Returns | Arrives |
|---|---|---|
| `GET /payments`, `GET /subscriptions` | `[]` | Batch 3 |
| `GET /payments/stats` | zeroed totals with six named months | Batch 3 |
| `GET /conversations`, `GET /messages` | `[]` | Batch 3 |
| `GET /admin/chat/all-conversations` | `[]` | Batch 3 |
| `GET /admin/analytics` | five empty named series | Batch 3 |
| `GET /admin/payments` | `{ payments: [], total_revenue: 0 }` | Batch 3 |

---

## Permission matrix

`requirePermission(key)` gates the route; the service then narrows to the specific record. Both must
pass — hiding a control in the UI is not security.

| Permission | admin | instructor | parent | student |
|---|:--:|:--:|:--:|:--:|
| `users.manage` | ✔ | | | |
| `course.create`, `course.publish` | ✔ | | | |
| `course.edit` | ✔ | ✔ | | |
| `content.read` | ✔ | ✔ | ✔ | ✔ |
| `lesson.complete`, `quiz.submit`, `assignment.submit` | | | | ✔ |
| `submission.review` | ✔ | ✔ | | |
| `session.manage`, `attendance.mark`, `recording.add` | ✔ | ✔ | | |
| `session.view` | ✔ | ✔ | ✔ | ✔ |
| `child.manage`, `payment.make` | | | ✔ | |
| `payment.view` | ✔ | | ✔ | |
| `chat.use` | ✔ | ✔ | ✔ | ✔ |
| `chat.monitor`, `analytics.view`, `settings.manage`, `audit.view` | ✔ | | | |

A tick that the PRD qualifies as "(assigned)", "(own)", "(child's)" or "(enrolled)" is a full tick
here; the narrowing lives in the service. Overrides are stored with the platform settings and merged at
boot.

## Rate limits

| Route | Limit |
|---|---|
| `POST /login` | 10 per 15 min, per IP **and** identifier |
| `POST /forgot-password` | 5 per hour, per IP |
| `POST /reset-password`, `POST /user/change-password` | 10 per hour, per IP |
| Everything else | 300 per minute, per IP |
| Messages (Batch 3) | 30 per minute, per user |

Disabled under `NODE_ENV=test`; the limiter itself is covered by its own tests.
