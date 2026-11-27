# KITOS 2.0 — API reference

Every endpoint implemented. Batch 1 covers authentication, accounts, families and platform
settings; Batch 2 adds courses and content, the work a child does, certificates and the live and
hybrid sessions; Batch 3 adds chat over Socket.IO, Flutterwave payments, admin analytics and the
activity log. Nothing here is a placeholder any more.

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

A `temp_token` is accepted here as well, on the same terms as
`POST /user/change-password` — including `current_password`. The two doors into a forced reset must
not differ in what they ask for, or the looser one becomes the way in.

### `POST /user/change-password` — *Public with a temp token, otherwise authenticated*

Rate limited: 10 per hour, keyed on the address **and** the credential the request carries — the reset token, or the session's bearer. Per-IP alone was the wrong unit: a KIT centre is one shared connection, so ten password changes an hour covered the whole school.

```json
{ "current_password": "…", "new_password": "…" }
```

or, completing a forced reset before any session exists:

```json
{ "temp_token": "<jwt>", "current_password": "<the temporary password>", "new_password": "…" }
```

Which of the two this is **is decided by the body, not by the `Authorization` header.** A request
carrying a `temp_token` is never authenticated, even if a header is present. That mattered: the
client's session for a must-change account used to carry the temp token as its bearer credential, so
this endpoint saw an `Authorization` header, tried to authenticate it, and answered 401 — "a
password-reset token cannot be used to authenticate a request" — before reaching the service that
handles temp tokens. The account could not set a password and so could not sign in at all.

`current_password` is **required on both paths**: the current password when signed in, the temporary
password when completing a forced reset. 400 with `fields.current_password` when it is missing or
wrong, and a wrong one writes `password_change_failed` to `activity_logs`.

Passwords need 8+ characters with a letter and a digit. On success `token_version` is incremented, so
every existing session for that account ends. The authenticated path returns a fresh `access` as
well, so the caller is not logged out by the revocation it just caused; the forced-reset path returns
`{ "ok": true, "success": true }` and nothing more — there is no session to keep alive, and the
client signs in with the new password. A temp token cannot be replayed.

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

**201** — the user row plus `"password": "KITeSsjb577"` and the same value as `temporary_password`,
the one-time password, **returned once** and never stored in the clear or logged (ADR-017). The
account carries `must_reset_password: true`.

Nothing is emailed. The password reaches the administrator in this response and nowhere else — the
UI shows it in a dialog that closes only on "Done" (ADR-038). Earlier versions emailed it, and that
is what broke the endpoint in production: the request waited on Gmail, Render's free tier blocks
outbound SMTP, the browser timed out first, and the password was lost with a response that never
arrived while the account sat created.

Students get an admission number from an atomic counter, so parallel creates cannot collide. A student
is `active` if the parent has already consented and `pending` otherwise.

409 on a duplicate email.

### `POST /admin/users/:id/reset-password`

No body.

**200** — `{ id, name, email, admission_no, role, must_reset_password: true, password, temporary_password }`,
where `password` and `temporary_password` are the same newly generated one-time password, returned
once. The account's old password stops working immediately and `token_version` is incremented, which
ends every session it has. Writes `reset_user_password` to `activity_logs`, naming the target but
never the password.

Admin only (`users.manage`). 404 for an unknown id.

An administrator cannot usefully reset their own password here — it invalidates the token the screen
is holding — so the UI disables that row and points to Settings.

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

A student and a parent see the **published catalogue** — not only the courses the child is enrolled
on. An instructor sees the courses assigned to them, drafts included; an admin sees everything.

```json
[{ "id": "6ada…", "title": "Scratch Programming", "description": "…",
   "thumbnail_url": null, "price": 15000, "price_kobo": 1500000,
   "payment_type": "subscription", "instructor_id": "6ada…",
   "instructor_name": "Ms. Sarah Aliyu", "programme_track": "Scratch Programming",
   "status": "published", "is_published": true,
   "modules_count": 3, "lessons_count": 5, "students_count": 4,
   "completion_rate": 35, "progress": 100,
   "enrolled": true, "enrollment_status": "active",
   "created_at": "2026-11-02T21:20:28.617Z" }]
```

Because the list is the catalogue rather than a timetable, each row says where the asking student
stands on it:

| Field | For a student | For anyone else |
|---|---|---|
| `progress` | 0–100 on their enrolment, `0` if they have none | `0` |
| `enrolled` | `true` when active or completed, else `false` | `null` |
| `enrollment_status` | `active`, `completed`, `cancelled`, or `""` for no enrolment | `null` |

`null` rather than `false` for a non-student is deliberate: "not enrolled" is an answer about a
pupil, and for an administrator the question is meaningless — a `false` would have every card on
their screen badged "Not enrolled".

**There is no payment field here, and a student cannot obtain one.** `payment.view` belongs to
administrators and parents, so `GET /payments` answers a student 403. The retained courses screen
once badged cards from a child's payment rows; it now reads `enrollment_status`. Whether a fee has
been paid is between a parent and the school, and enrolment is in any case the school's answer
rather than the gateway's — an administrator can enrol a child who paid in cash.

`price` is naira for display; `price_kobo` is the stored integer (ADR-002). `module_count` and
`modules_count` are both present because the retained screens read each, and likewise `thumbnail`
and `thumbnail_url`.

### `GET /courses/:id/modules` — `content.read`

Modules in order, each with `description`, `lessons_count`, `quiz_id` and `assignment_id` (null
where absent).

**Unpublished lessons are omitted for students and parents.** A lesson with `is_published: false`
is a draft, and a draft that still shows on the child's timeline is a Published/Draft switch that
does nothing. Staff see every lesson, because they are the ones writing them.

A draft course 404s for a student rather than 403 — confirming that a draft exists is itself a small
leak of what the school is preparing. A published course they are not enrolled on is 403.

### `GET /modules/:id/lessons` · `GET /lessons/:id` — `content.read`

Lesson bodies are sanitised HTML (ADR-024). `GET /lessons/:id` adds `completed` for a student.

Drafts are filtered here too, and `GET /lessons/:id` answers **404** for a student when the lesson
is unpublished — a link handed out last week must not still open content that has been taken down.

Stored bodies are Markdown as well as HTML: the seeded courses are Markdown, the rich editor writes
HTML. The client renders both through one function (ADR-040), so the student page, the editor's
preview and the preview modal cannot disagree.

### `POST /courses` · `POST /admin/courses` — `course.create`

```json
{ "title": "Scratch Programming", "description": "…", "programme_track": "scratch",
  "instructor_id": "6ada…", "price_kobo": 1500000, "payment_type": "subscription" }
```

`programme_track` is a slug from the `tracks` collection — `scratch`, `web-development`,
`robotics` and `advanced` are seeded — and also accepts the display name the form submits. It is
checked against the collection, not against a constant (ADR-039): a slug with no row, or one whose
row is archived, answers 400 with `fields.programme_track`. 201 with the created course.

Editing a course to a *different* track requires that track to be active; leaving it on the one it
already has is always allowed, so a course on a retired track stays editable.

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

### `POST /modules` · `PUT /modules/:id` · `DELETE /modules/:id` — `course.edit`

```json
{ "course_id": "6ada…", "title": "Getting Started", "description": "…", "order_index": 1 }
```

`PUT` takes any of `title`, `description` and `order_index`; `course_id` is not writable, because a
module does not move between courses.

**Reordering is a swap.** Giving a module an `order_index` another module on the same course holds
trades the two positions, which is what the editor's up/down arrows mean and what keeps a course's
indices a permutation of 1..n rather than a list with holes and duplicates in it. On **create**, a
position that is already taken means "put it at the end" instead — the Add Module form's field
defaults to 1, so without that rule a second module would land on top of the first and the arrows
would have nothing to swap.

An instructor may only touch a course assigned to them; an admin, any. Deleting a module removes its
lessons, quizzes and assignments, then recalculates every enrolment on the course — the denominator
has changed for everyone.

### `POST /lessons` · `PUT /lessons/:id` · `DELETE /lessons/:id` — `course.edit`

```json
{ "module_id": "6ada…", "title": "What is Scratch?", "content_type": "text",
  "youtube_url": null, "body_content": "<p>…</p>", "order_index": 1,
  "is_published": true,
  "resources": [{ "title": "Slides", "url": "https://…" }] }
```

`content_type` is `video`, `text`, `link` or `file` — the four the lesson editor offers. A YouTube
URL is normalised to its `youtube-nocookie.com` embed form, which is the only host a lesson body may
frame.

`is_published` is the editor's Published/Draft switch. It is sent on **every** save, so a body that
did not name it refused every save with 400 "Unrecognized key" — the failure this endpoint was
fixed for.

A resource may arrive as `{ "title", "url" }` or as the editor rail's `{ "id", "name", "url" }`; the
id is dropped and `name` is folded into `title`, so only one shape is ever stored.

The unpublished-lesson rules above apply to the reads.

### `GET /tracks` — any signed-in user

The programme tracks a form may offer, each with `id`, `name`, `slug`, `description`, `status`, the
`courses_count`, `students_count` and `cohorts_count` that reference it, and `in_use`.

Active tracks only, unless `?include_archived=1` — the admin screen asks for everything, the forms
ask for what may be chosen today. Readable by every role, because the course forms, the student
forms and a parent's "add a child" form all need the list and a track name is not sensitive.

### `POST /admin/tracks` · `PUT /admin/tracks/:id` · `DELETE /admin/tracks/:id` — `users.manage`

```json
{ "name": "Drone Engineering", "description": "Flight, sensors and safety." }
```

The `slug` is derived from the name on creation and **never changes** — it is what every course,
student and cohort stores, so a rename that moved it would orphan all of them. `PUT` therefore
takes `name`, `description` and `status` (`active` or `archived`), and no slug.

A duplicate name answers 409. `DELETE` answers 409 naming the counts when anything still references
the track, and says to archive it instead; archiving takes a track off the forms while leaving it
on the records already filed under it. Every one of the three writes an `activity_logs` row.

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

`PUT /assignments/:id` accepts and ignores `module_id`, `course_title` and `submissions`. An
assignment does not move between modules, and the other two are state the Edit Assignment modal
holds for its own display and sends back; under `.strict()` all three refused the whole request, so
editing an assignment failed for fields the server never reads.

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
can see it all hang off that course. `course_id` is therefore accepted and ignored rather than
refused — the session form disables its course picker when editing but still sends the value, and
rejecting it made every session edit fail. Cancelling takes a `reason` and notifies the enrolled
children.

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

## Chat (Batch 3)

Who may talk to whom is an **allow-list**, not a deny-list, and it is enforced in the service on
every send — not only when a conversation is opened (ADR-030):

| | admin | instructor | parent | student |
|---|---|---|---|---|
| **admin** | ✔ | ✔ | ✔ | ✔ |
| **instructor** | ✔ | | ✔ | ✔ (shared course) |
| **parent** | ✔ | ✔ | | (observes own child) |
| **student** | ✔ | ✔ (shared course) | | **never** |

Student↔student is refused with 403 and is the rule the product exists to enforce (PRD §10). A
parent **observes** their child's conversations: they are returned with `observing: true` and a
write is refused with 403 — reading a child's messages is the safeguarding requirement, writing as
them would be impersonation.

### `GET /conversations` — `chat.use`

Every conversation the caller may see, newest activity first. A parent also receives their child's,
marked `observing: true` with `child_name` set.

```json
[
  {
    "id": "...",
    "participant_ids": ["...", "..."],
    "other_party": { "id": "...", "name": "Ms. Sarah Aliyu", "role": "instructor" },
    "last_message": "Liam did well on the quiz.",
    "last_message_at": "2026-11-25T10:04:00.000Z",
    "unread_count": 2,
    "observing": false,
    "child_name": null,
    "reported": false
  }
]
```

### `GET /messages?conversation_id=…` — `chat.use`

The transcript, oldest first. 403 if the caller is neither a participant nor the observing parent.

### `POST /messages` — `chat.use`

`{ conversation_id?, recipient_id?, body, attachment_url? }`. One of `conversation_id` or
`recipient_id` is required; with `recipient_id` the conversation is found or created. The pair is
re-checked here, so a conversation that was legitimate when opened cannot be used after the
relationship ends.

| Status | When |
|---|---|
| 201 | Sent; the message is also emitted to both parties' sockets |
| 403 | Pair not allowed, observer attempting to write, or admin not a participant |
| 404 | No such conversation or recipient |
| 429 | More than 30 messages a minute |

Rich text is sanitised on write (ADR-024), so a stored message can never carry script.

### `PUT /messages/read` — `chat.use`

`{ conversation_id }`. Marks everything the caller has received as read. An observing parent reading
their child's conversation does **not** mark it read for the child.

### `GET /chat/contacts` — `chat.use`

Who this caller is allowed to start a conversation with, already filtered by the matrix above, so
the UI never offers a recipient the API would refuse.

### `POST /chat/report` — `chat.use`

`{ conversation_id, reason }`. Flags a conversation for an administrator and writes an activity-log
row. Reporting is available to everyone including children.

### `GET /admin/chat/all-conversations` — `chat.monitor`

Every conversation on the platform for the monitoring screen, **reported ones first**. Admins can
read transcripts here without being participants; doing so is audited.

---

## Socket.IO (Batch 3)

Same origin as the API, default path `/socket.io`. The handshake carries the same Bearer token as
REST:

```js
io(SOCKET_URL, { auth: { token: accessToken } });
```

The handshake is verified exactly as a request is — signature, expiry, account still active, and
`tv` against the user's current `token_version` — so a password change or a deactivation drops the
socket's right to reconnect rather than leaving a live connection trusted for 24 hours. A bad or
missing token is refused with `connect_error`.

Each connection joins a private room for its own user id. Conversation rooms are joined on demand
and only after the same allow-list check the REST route makes.

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `message` | client → server | `{ conversation_id, body }` or `{ id }` | With `id` it relays an already-persisted message; otherwise it persists through the same service the REST route uses (ADR-031), so a message cannot exist in one path and not the other |
| `message` | server → client | the serialised message | To both participants, and to the observing parent |
| `typing` | both | `{ conversation_id, typing }` | Not persisted |
| `read` | server → client | `{ conversation_id, reader_id }` | |
| `notification` | server → client | the serialised notification | Payments, announcements, sessions and submissions all push here |
| `connect_error` | server → client | `Error` | Bad, expired or revoked token |

---

## Payments (Batch 3)

**Flutterwave v3, test mode** (ADR-036, which replaced Paystack). Two rules govern everything here:

1. **The amount comes from the course, never from the request.** The retained modal sends an
   `amount` because its mock handlers did; the validator accepts it and the service ignores it.
2. **Confirmation happens exactly once**, whether verify arrives first, the webhook does, or both
   land in the same millisecond (AC3.3). A single atomic update whose filter requires
   `status: "pending"` is what claims the payment; the winner alone issues the receipt number and
   activates the enrolment, in one transaction.

Money is stored as integer kobo and serialised as naira (ADR-002). Flutterwave quotes **naira**, so
the conversion happens in `lib/flutterwave.js` and nowhere else.

**Simulated mode.** With `FLW_SECRET_KEY` unset the gateway answers locally: initiate returns an
inert link, verify reports success for the amount on the row, and the webhook refuses to act. The
whole four-step flow therefore runs offline and in CI with no Flutterwave account, and a payment
confirmed that way is stamped `confirmed_via: "simulated"` so no receipt can be mistaken for a
settled one — the PDF says so on its face.

### `POST /payments/initiate` — `payment.make` (parent)

`{ student_id, course_id, type?, amount?(ignored) }`

```json
{
  "reference": "KIT-0MWWP97CN2B14429D5AEA5793",
  "link": "https://checkout.flutterwave.com/v3/hosted/pay/…",
  "amount": 15000,
  "amount_kobo": 1500000,
  "simulated": false,
  "payment": { "id": "...", "status": "pending", "...": "..." }
}
```

The pending row is written **before** the gateway is called, so a checkout that is started and
abandoned is still visible to an administrator rather than vanishing.

| Status | When |
|---|---|
| 201 | Opened |
| 400 | The course has no fee set, or the gateway refused (the row is marked `failed`) |
| 403 | A parent paying for another family's child |
| 404 | No such student or course |

### `POST /payments/verify` — `payment.make` (parent)

`{ reference }` — everything else is read from the payment row. Calls
`GET /v3/transactions/verify_by_reference`, checks status, amount, currency NGN and the returned
reference, then confirms.

```json
{ "status": "success", "reference": "KIT-…", "payment": { "...": "..." }, "already_confirmed": false }
```

`already_confirmed: true` means the webhook got there first; the response is identical otherwise, and
the receipt number is the same one. Safe to call repeatedly.

| Status | When |
|---|---|
| 200 | Confirmed, or already was |
| 400 | The gateway's amount does not match the course fee — the payment is marked `failed` and nothing is activated |
| 403 | Another family's payment |
| 404 | Unknown reference |

### `POST /payments/webhook` — *Public, authenticated by header*

Flutterwave authenticates webhooks with a **static secret** in the `verif-hash` header, compared in
constant time against `FLW_WEBHOOK_HASH`. That is weaker than a body signature: it proves the sender
knows the secret and says nothing about whether the figures in the body are genuine. So the body is
used for exactly one thing — learning which reference to ask about — and the transaction is
**re-verified against the API** before anything is marked paid.

Always answers 200, including for a rejected hash: a wrong hash will never become right, and a 4xx
earns hours of retries. An unknown reference is dropped before any API call.

```json
{ "received": true, "handled": true, "already_confirmed": false }
```

### `GET /payments` — `payment.view`

A parent sees their own; an admin sees all. Query: `parent_id`, `student_id`, `status`, `type`,
`from`, `to`, `q` (searches names, course and reference). Filters that would widen a parent's view
are ignored rather than obeyed.

### `GET /payments/stats` — `payment.view`

Totals, the subscription/one-off split, pending and failed counts, and six months of bars — always
six, so a quiet month is a gap rather than a missing category the chart would silently drop.

### `GET /payments/:id/receipt` — `payment.view`

JSON by default; `?format=pdf` returns the A4 receipt with the KIT and StarNova marks. The owner or
an admin; 400 while the payment is not yet paid.

### `GET /subscriptions` · `POST /subscriptions/cancel` — `payment.view` / `payment.make`

One plan per child per course. Cancelling marks the plan cancelled **here**; it cancels nothing at
Flutterwave, because KITOS never created a payment plan there — each month is charged as its own
transaction, so there is nothing to cancel and no further charge simply arrives.

### `GET /admin/payments` — `payment.view` + admin

`{ payments: [...], total_revenue: 0 }`.

---

## Admin analytics (Batch 3)

### `GET /admin/stats` — `analytics.view`

The dashboard tiles, every figure computed from the collections rather than stored: a cached total is
a number that was true once, which is worse than slow because nobody can tell by looking. The
`*_change` fields compare this month with last.

### `GET /admin/analytics?months=6` — `analytics.view`

Five series plus three scalars, keyed exactly as the retained Recharts components read them — a
renamed field does not degrade a chart, it draws an empty one.

| Field | Shape | Note |
|---|---|---|
| `enrollment_trend` | `[{ month, students }]` | **Cumulative**: per-month arrivals would dip in a quiet month and read as pupils leaving |
| `revenue_monthly` | `[{ month, subscription, one_time }]` | Always the full span |
| `course_completion` | `[{ course, rate }]` | A course nobody is on is 0%, not absent |
| `quiz_performance` | `[{ month, average }]` | **Months with no attempts are omitted**, not plotted as zero, which would read as a cohort that failed everything |
| `payment_split` | `[{ name, value, fill }]` | |
| `attendance_rate` | number | Over classes actually held; a future class would drag it down for no reason |
| `active_users`, `sessions_held` | number | |

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
| `POST /reset-password`, `POST /user/change-password` | 10 per hour, per IP **and credential** |
| Everything else | 300 per minute, per signed-in session (per IP when signed out) |
| Messages (Batch 3) | 30 per minute, per user |

The broad ceiling is keyed on the bearer token, not the address, for the reason the password limit
is: a KIT centre is one shared connection, and 300 requests a minute divided between everyone in
the room is about twenty-five dashboard loads for the whole centre. Signed-out traffic keeps the IP
bucket, which is where a flood with no account behind it has to be caught. The token is not
verified to build the key — it is a bucket, not an authorization decision, and anything sent with a
forged one still fails `authenticate` a moment later.

Disabled under `NODE_ENV=test`; the limiter itself is covered by its own tests.
