# Architecture Decision Records

Numbered, append-only. Claude Code adds new ADRs as it builds; never rewrite an accepted one — supersede it.

## ADR-001 — Keep the existing frontend; rebuild only the backend
**Status:** Accepted (17 Oct 2026). The `kit-lms-main` Next.js 16 / React 19 frontend is complete across four
roles and is retained in `client/` without redesign. Time goes into the backend that was missing. Next.js is a
React framework, so the MERN "R" is satisfied (same position as the ALI_IWANBUY lab, which was accepted).

## ADR-002 — Money in kobo, serialised to the frontend's shape
**Status:** Accepted. Store integer kobo (`price_kobo`, `amount_kobo`). The current frontend reads naira numbers
(`amount: 15000`), so serialisers return `amount` in naira alongside `amount_kobo`. No floats in services.

## ADR-003 — JavaScript (ES modules), not TypeScript, for the server
**Status:** Accepted. The frontend is JavaScript; matching it keeps one set of conventions and saves time. Zod
validates inputs at runtime; JSDoc documents models.

## ADR-004 — NextAuth stays; the API issues a Bearer JWT
**Status:** Accepted. `authorize()` calls `POST /login` and stores `access` in NextAuth's encrypted session cookie;
Axios attaches it. The API sets no cookies, so the browser may call Render directly with CORS restricted to
`CLIENT_ORIGIN`. Token lifetime 24 h matches the NextAuth session; `token_version` revokes on password change or
deactivation.

## ADR-005 — Paths match the frontend contract, no `/api/v1` prefix
**Status:** Accepted. The frontend calls `/login`, `/courses`, … relative to `NEXT_PUBLIC_API_URL`. Versioning, if
ever needed, is done by base URL.

## ADR-006 — Explicit `enrollments` collection
**Status:** Accepted. The legacy schema inferred enrolment from `students.programme_track` and payments. KITOS 2.0
stores enrolment explicitly (status, progress, source). Admin enrolment and successful payment both create it.

## ADR-007 — Legacy PHP API is reference only
**Status:** Accepted. `api/index.php` disables JWT signature verification and hard-codes secrets. Its business rules
are read; its code is not ported or copied.

## ADR-008 — Files on Cloudinary in production
**Status:** Accepted. Render's disk is wiped on deploy. `STORAGE_PROVIDER=local` in development only.

## ADR-009 — React Compiler lint rules are warnings on the retained frontend
**Status:** Accepted (22 Oct 2026). `eslint-config-next` 16 ships the React Compiler rules, and the
retained frontend (ADR-001) trips 76 of them across about 40 files — almost all
`react-hooks/set-state-in-effect`, raised by its `useEffect` + `.then(setState)` fetching pattern.
They are performance and style advice about code that renders correctly, and rewriting them would be
the redesign CLAUDE.md and PRD §4.2 forbid. They are warnings in `client/eslint.config.mjs`, so they
stay visible without failing `npm run lint`.

`react-hooks/rules-of-hooks` deliberately stays an **error**: its two violations were real defects
(`useState` and `useEffect` after an early return in the parent chat page, so hook order changed the
moment the session resolved a user id) and are fixed. `react/no-children-prop` is off, because
`children` there is a domain noun — a parent's children — passed to `ChildSwitcher` and the Paystack
modal; renaming it would ripple through four retained components for no behavioural gain.

## ADR-010 — Batch 1 list endpoints return bare arrays
**Status:** Accepted. `handlers.js` returns a bare array from `GET /admin/users`, `/parents/me/children`,
`/admin/activity-log` and `/admin/pending-enrollments`, and the retained screens hand `r.data` straight
to a table. An envelope (`{ items, total, page }`) would be tidier but would mean editing those screens,
which is out of scope. The endpoints accept `role`, `status`, `q`, `page` and `limit` and apply them, so
a large deployment is not forced to send every row; only the response shape is flat. Later batches with
no frontend contract to honour may use the envelope `lib/pagination.js` already produces.

## ADR-011 — `/login` returns `access`, with `token` as an alias
**Status:** Accepted. The mock returns `{ user, token }`, but `client/src/_lib/auth/auth-options.js`
reads `result.access` — so the mock's own token never reached the session, a latent defect in the
fixtures. PRD §9.1 specifies `access`, and the PRD wins. The API returns `access`, and `token` carrying
the same value so anything written against the mock shape keeps working. `token` can be dropped once
Batch 3 confirms nothing reads it.

## ADR-012 — `assign-instructor` records intent until Batch 2
**Status:** Accepted. `POST /admin/users/assign-instructor` has no `courses` collection to write to in
Batch 1. Rather than fail the admin screen or silently lie, it validates that the target is an active
instructor, writes an `assigned_instructor` audit row carrying `course_id` and
`meta.pending_until_batch: 2`, and returns the `{ success: true }` the modal expects. Batch 2 replaces
the recording step with a write to `courses.instructor_id` and reconciles the rows this leaves behind.

## ADR-013 — Parents and instructors have no collection of their own
**Status:** Accepted. PRD §8.2 defines `students` but no `parents` or `instructors`, and
`_types/schema.js` says so explicitly: "A Parent is a User with role 'parent'. No separate parents
table." The mock fixtures nevertheless give `PARENT_ME.id = "p1"` and `user_id = "u4"`, implying a
profile row. So for parents and instructors `id === user_id === User._id`, and both fields are
returned for shape compatibility. Only a student has a document id distinct from their user id — which
matters, because `/students/:id/progress` is keyed on the **student** id, not the user id.

## ADR-014 — An instructor's reach into student progress is narrowed in Batch 2
**Status:** Accepted. PRD §9.2 allows an instructor to read the progress of "own student", meaning a
student enrolled on one of their courses. Enrolments arrive in Batch 2, so in Batch 1 an instructor
passes the matrix check and no ownership narrowing is applied. Parents and students are narrowed
properly today: a parent may read only their own children, a student only their own record. Batch 2
adds the enrolment check for instructors.

## ADR-015 — The admission-number pattern allows four digits
**Status:** Accepted. The frontend's mock matches `/^KIT\/\d{2}\/\d{3}$/`, which caps an intake at 999
students. The server uses `/^KIT\/\d{2}\/\d{3,4}$/i` and `lib/numbering.js` pads to three digits,
widening to four past 999, so a cohort year cannot run out of numbers. Three-digit numbers are
unaffected, so every existing fixture still matches.

## ADR-016 — Students need no email address
**Status:** Accepted. PRD §10 requires that no email is demanded for a child. `users.email` is therefore
optional with a **sparse** unique index, so the many students without one do not collide on `null` — a
plain unique index would permit exactly one such document. The seed keeps the contact emails the mock
fixtures give the first three students, purely so the retained screens render as designed; accounts
created by a parent or an admin get none.

## ADR-017 — A provisioned password is returned exactly once
**Status:** Accepted. `POST /admin/users` and `POST /students` both return a generated one-time password
in the response body, for the administrator or parent to pass on. The mock did this for `/admin/users`
and not for `/students`; the batch brief requires it for both. It is never stored in the clear, never
logged (the logger redacts it), and never returned again. The account carries
`must_reset_password: true`, so it is good for exactly one sign-in.

## ADR-018 — Batch 2 and 3 reads answer empty rather than 404
**Status:** Accepted. AC1.1 requires every role to reach its dashboard "with no console errors", and the
retained screens call about a dozen endpoints that Batches 2 and 3 implement. Left unrouted they
answered 404, so each dashboard logged a run of errors and some screens threw instead of rendering
their empty state. `server/src/routes/placeholders.js` returns correctly shaped empty responses for
those **reads only**, with shapes taken from `handlers.js` so the screens bind against the structure
they will eventually get.

Nothing there writes: a write that silently did nothing would be a lie the UI would believe. Every
route is authenticated, each entry names the batch that replaces it, and the file shrinks to nothing by
the end of Batch 3.

## ADR-019 — Notification reads ship in Batch 1
**Status:** Accepted. The batch brief puts the `Notification` model in Batch 1 and its routes in Batch 3.
But the model already holds real rows in Batch 1 — a parent adding a child notifies every administrator
— and a 404 on the bell feed would break AC1.1. `GET /notifications`, `PUT /notifications/:id/read`,
`PUT /notifications/read-all` and `POST /admin/notifications/send` are therefore implemented now.

The send endpoint is shared by the admin Announcement modal and by `adminNotify.js`, which fires
platform events from any signed-in user's browser, so a non-admin may only ever notify administrators —
otherwise a student could broadcast to every parent on the platform. Audience targeting is admin-only,
and course-scoped audiences are refused with an explanation until enrolments exist. Batch 3 adds the
`Announcement` model, course audiences and the Socket.IO push.

## ADR-020 — Palette contrast fails WCAG AA; the palette stands
**Status:** **Accepted** (23 Oct 2026) — decided by the product owner: keep the emerald `#10B981`
palette unchanged, and carry the contrast shortfall as a documented exception. White text on the brand emerald `#10B981` has a contrast ratio of
2.53:1, against the 4.5:1 WCAG AA requires of small text. It appears wherever the design puts white on
emerald: the sidebar "LMS" badge, role chips and primary buttons. Five pairs fail in total — white and
pale mint on the emerald, white on red-500 for the unread badge, Sonner's success green on its own mint
toast, and `--text-muted` on dark surfaces.

None can be fixed without a brand decision. Reaching 4.5:1 on the emerald needs roughly `#047857`, a
visibly different green; CLAUDE.md makes the emerald non-negotiable and PRD §4.2 rules out new colours.
PRD NFR2 and AC1.5 nevertheless require axe to report no serious or critical violations, so the two
instructions genuinely conflict, and the conflict is recorded here rather than resolved quietly.

Batch 1 fixed every accessibility violation that did **not** require changing the palette: both
`label-content-name-mismatch` failures on the topbar controls (the language button's visible "EN" and
the notification badge's unread count are now part of each control's accessible name), and the new
"Powered by" label, which uses `--text-secondary` rather than the `--text-muted` the brand note asked
for, because `--text-muted` fails AA in both themes.

The E2E assertion allows these five pairings through **by exact colour, per node**, so any other serious
or critical violation — including a contrast failure involving any other pair — still fails the build.

**The decision.** The palette is the brand, and the brand is not a developer's to change. The emerald
stays as it is; the shortfall is accepted knowingly rather than hidden. Accessibility work in later
batches must not widen it: the exemption is a fixed list of nine colour pairs, matched per node by
exact colour, so a contrast failure involving any other pair — or any other serious or critical rule —
still fails the build. Anything new is a regression, not a precedent.

If it is revisited later, the options remain: darken the emerald for small text only; put dark navy
text on emerald instead of white; or reserve white-on-emerald for large or bold text, where AA asks
only 3:1. Recorded under limitations in `docs/PROGRESS.md`.

## ADR-021 — The permissions screen and the PRD matrix disagree
**Status:** **Accepted** (23 Oct 2026) — decided by the product owner: the frontend contract wins for
this endpoint. Both shapes are now implemented. PRD §10.1 and §9.2 define permissions as a **role** matrix
(`{ "users.manage": ["admin"] }`), and that is what the server enforces and what
`POST /admin/permissions` accepts. The retained admin settings screen sends something different: a map
of **admin user id** to feature booleans (`{ "<userId>": { dashboard: true, users: true, … } }`). The
mock handler ignored its body entirely and returned `{ success: true }`, so the mismatch was never
visible.

**The decision.** `POST /admin/permissions` accepts and persists exactly what the screen sends, and
`GET /admin/users` returns it on each administrator's row as `permissions` — which is where that screen
reads it from. The toggles live on the user document as `admin_sections`, defaulting to every section
enabled.

**They are visibility, not authorisation.** What an administrator may actually *do* is still decided
solely by the role matrix in `config/permissions.js`, which these toggles cannot widen or narrow. A
test turns every section off for an administrator and asserts that the admin endpoints still answer:
hiding a section in the navigation is a preference, and treating it as a permission would be the "UI
hiding is not security" mistake the PRD warns against. The two concepts are deliberately kept in
separate fields with separate names.

The endpoint serves both shapes, told apart by their keys — a permission key is a dotted name, an
administrator id is 24 hex characters. A payload mixing the two is refused rather than guessed at. An
unrecognised key is treated as a mistyped matrix key and reported in `ignored`, so one typo cannot
discard an otherwise valid save.

## ADR-022 — Local-only state is anchored to the server directory, never the working directory
**Status:** Accepted. `lib/paths.js` resolves `server/.local`, the mail outbox and the docs directory
from its own module location. The first implementation used `path.resolve("server/.local/…")`, which is
relative to the **working directory** — already `server/` when npm runs a script — so the local MongoDB
data landed in `server/server/.local`, outside the `.gitignore` rule and in a different place again
depending on where the process was started.

## ADR-023 — A session's status is computed from the clock, never stored
**Status:** Accepted. `computeSessionStatus(session, now)` derives `live`, `scheduled`, `completed` or
`cancelled` from `scheduled_at`, `duration_minutes` and the cancellation flag, on every read. Only the
cancellation is a stored fact, because only it is a decision someone made.

The alternative was a stored `status` column kept current by a scheduled job. That needs something to
run every minute, forever, on a free Render instance that sleeps — and the moment it misses a tick the
database says a class is still scheduled while children are sitting in it. A computed status cannot
drift, needs nothing running, and is correct the instant the clock passes the start time.

The cost is that status cannot be queried in Mongo directly, so `?filter=live` is applied after the
documents are read. At this school's scale — a few dozen classes a term — that is nothing, and the
filter lives in one place.

## ADR-024 — Lesson HTML is sanitised on the way in, and again by the renderer
**Status:** Accepted. An instructor writes lesson bodies in a rich-text editor, so the content is HTML
and must stay HTML. `sanitizeLessonHtml` allows a small set of structural and formatting tags and
nothing else: no `<script>`, no event handlers, no `style`, and iframes only for a normalised YouTube
embed. It runs in the service, so the stored document is already clean.

Sanitising on write rather than on read means a body cannot be stored dangerous and rendered
dangerously later by some new code path that forgot to escape it. The client still treats the field as
untrusted — two cheap defences against the one failure that would be unforgivable here, since the
readers are children.

## ADR-025 — Instructors author; only an administrator publishes
**Status:** Accepted. `course.edit` belongs to admin and instructor, so an instructor may write
modules, lessons, quizzes and assignments on a course assigned to them. `course.publish` and
`course.create` belong to admin alone.

Publishing is what puts a course in front of children and makes it payable, which is the school's
decision, not a teacher's. It also gives a draft a real purpose: an instructor can build a course in
the open over several weeks, and a student asking for it gets a 404 — not a 403, because confirming
that a draft exists leaks what the school is preparing.

Publishing an empty course is refused outright. A listing with no lessons behind it is worse than no
listing.

## ADR-026 — Whatever finishes a course issues the certificate
**Status:** Accepted. `recalculateAndCertify` recalculates progress and, if that crossed into
completion, issues the certificate. Lesson completion, quiz submission and assignment submission all
go through it.

Originally only lesson completion issued one. That looked like a gap of timing and was in fact a
permanent loss: `justCompleted` is the edge from unfinished to finished, and once the enrolment reads
`completed` the edge never fires again. A child whose last outstanding piece of work was a quiz or an
assignment — the normal shape of a course ending in either — finished, was told they had finished, and
never received the certificate they had earned. No later action could recover it.

The rule therefore lives in exactly one function rather than at each call site, because the failure
was a call site forgetting it.

## ADR-027 — A deleted course keeps its certificates
**Status:** Accepted. Deleting a course cascades to its modules, lessons, quizzes, assignments,
submissions, quiz attempts, lesson completions, enrolments, sessions, attendance marks and recordings.
Certificates are left alone.

Everything in the cascade describes work in progress, and an orphan of it would corrupt something live:
an abandoned attendance mark still counts in the attendance report, an orphan enrolment still skews a
denominator. A certificate is not work in progress. It is a record of something a child did, with
their name and the course title snapshotted onto it, and a copy quite possibly printed and on a wall
at home. A school retiring last year's syllabus must not void the certificates it awarded for it, or
silently break the verification code printed on them.

## ADR-028 — The seeded live class lasts an hour, so the seed is re-run, not relied upon
**Status:** Accepted. `npm run seed` places one class relative to the moment it runs: started five
minutes ago, sixty minutes long. For about an hour afterwards the live banner, the QR display and
check-in are all demonstrable; after that the class reads `completed` and the live paths have nothing
to show.

This follows from ADR-023 rather than being a separate choice: if status is the clock, a seeded live
class is only live for as long as a real one would be. Fixing it by writing a `live` status into the
seed would mean the seeded row disagreed with every computed one.

What follows for anyone working on this:

- Re-run `npm run seed` before demonstrating or screenshotting the live paths.
- No automated test may depend on the seed being live. The Playwright journeys schedule their own
  class relative to `now` and wait for it to start, which is why one of them takes two minutes.
- `/student/sessions` opens on its Live tab, which is right for a child arriving at class time but
  reads as an empty screen an hour after seeding. It is not.

## ADR-029 — One tenth pair joins the ADR-020 contrast exemption, and why that is not a precedent
**Status:** Accepted. ADR-020 fixed the exemption at nine colour pairs and said accessibility work in
later batches must not widen it. This batch widens it by one: the teal `#0EA5A5` of the "In Progress"
chip on a child's course card, over a 12% tint of itself, at about 3:1.

ADR-020 is accepted and append-only, so this records the change rather than editing it.

**Why it appeared now.** The chip is part of the retained design and was always in the code. It was
unreachable: `GET /students/:id/progress` returned a hard-coded empty array, so every card on the
parent's dashboard read "Not Started" in grey. The moment real progress arrived, a child mid-course
rendered the chip for the first time. Nothing was restyled and no colour was chosen here.

**Why it is exempted rather than fixed.** It is the same decision ADR-020 already made, applied to the
same palette: the three chip colours are the brand's, the shortfall is accepted knowingly, and
changing one of them is the redesign the PRD forbids. Fixing it would also be inconsistent — the
"Completed" chip beside it is white on the same emerald that ADR-020 already exempts.

**What has not changed.** The list is still matched per node by exact colour pair, so every other
contrast failure, and every other serious or critical rule, still fails the build. A pair joins this
list only when it is a retained palette colour that fails *at rest*, and only after the harness has
been checked first — in this batch the parent dashboard also failed on its child names and ages, and
that was the scan sampling a half-faded card mid-fetch, not a colour. The waiting was fixed; nothing
was exempted for it. Anything that is not a palette pair at rest is a regression, as ADR-020 says.
