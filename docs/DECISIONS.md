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
