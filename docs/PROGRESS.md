# Progress

| Batch | Branch | Status | Date | Notes |
|---|---|---|---|---|
| Docs | main | ✅ Done | 17 Oct 2026 | Project report (Ch. 1–5), PRD, CLAUDE.md, LAB-PHASES, ADR-001–008, batch prompts |
| 1 — Backend foundation, identity and brand | batch/01-foundation | ✅ Done | 23 Oct 2026 | Express 5 + MongoDB API, 8 models, 33 endpoints, 325 server tests, Playwright + axe, CI, KIT logo and StarNova attribution |
| 2 — Learning core and hybrid sessions | batch/02-learning-sessions | ✅ Done | 3 Nov 2026 | Courses, modules, lessons, quizzes, assignments, progress, certificates with public verification, live and hybrid sessions with QR attendance and recordings; 21 models, 93 routes, 418 server tests, 46 end-to-end |
| 3 — Real-time, payments, admin and deployment | batch/03-realtime-payments-deploy | 🟡 Built, not yet deployed | 26 Nov 2026 | Socket.IO chat with the child-safety rules, Flutterwave payments confirmed exactly once, admin analytics and activity log, production hardening, render.yaml and the deployment guide; 26 models, 102 endpoints, **542 server tests**, accessibility across all 34 screens. Deployment itself needs the author's accounts |

## Log

### Production fix — the course editor's edit paths (27 Nov 2026)

The create forms were audited after nine of sixteen admin writes turned out to be failing in
production. The audit stopped there, and the **edit** paths went on failing the same way.

| What was broken | Why |
|---|---|
| Saving a lesson answered 400 "Unrecognized key" | `is_published` was not in the body schema, and the editor sends it on every save — so every save failed, not only the ones that touched the switch |
| Attaching a resource failed with it | The rail builds `{ id, name, url }`; the API stores `{ title, url }`, so `title` was missing and `id` unrecognised |
| Choosing File or Link failed with it | The content-type enum was `["video", "text"]` while the editor has offered four kinds all along |
| Modules could not be edited at all | There was no `PUT /modules/:id`. The editor's delete button and reorder arrows changed React state and never reached the API, so both worked until the page was reloaded |
| Editing an assignment answered 400 | The modal sends `module_id`, `course_title` and `submissions` back; `.strict()` refused all three |
| Editing a session answered 400 | The form sends `course_id` even though its course picker is disabled when editing |
| A second module landed on top of the first | The Add Module form's position field defaults to 1, so two modules shared index 1 — and the arrows, which swap two indices, had nothing to swap |
| Markdown lessons showed their own source to the children | The student page printed the body as plain text; the editor injected it as HTML. Same stored string, three renderings |
| The editor's YouTube embeds and code styling vanished on save | The sanitiser allows only `youtube-nocookie.com` frames and strips `style`; the toolbar emitted `youtube.com` and inline styles |
| Bold and the heading buttons did nothing | `mousedown` on a toolbar button moved focus out of the editable area and collapsed the selection before `execCommand` ran |
| The lesson editor was unusable on a phone | Its box sits in a scrolling flex column, where a flex item shrinks below its content — it collapsed to about 50px and `overflow-hidden` clipped the editor inside it to a strip one line tall |

Programme tracks became data in the same pass (ADR-039): a `tracks` collection, an admin screen that
creates, renames and archives them, and four React forms that ask the API instead of each holding
their own copy of the same three strings. The Mongoose enums on `Course`, `Student` and `Cohort` are
gone — an enum compiled from a constant would reject every track a manager added — and the service
checks the collection instead. `ensureTracks()` at boot creates the seeded four and adds an archived
row for any slug a record still references, so a deployed database needs no migration step.

Lesson content now goes through one renderer in both formats (ADR-040), used by the student page,
the editor's preview and split panes, and the preview modal.

Two smaller things fixed along the way, both found by testing rather than reported:

- **A draft lesson was still visible to students.** `is_published` had nowhere to be stored, so the
  switch had never done anything. Drafts are now filtered from the module and lesson reads, answer
  404 by direct link, and are out of the progress denominator — counting a lesson nobody can open
  would cap a finished course below 100% and withhold the certificate.
- **`toPlainText` returned HTML entities.** A track or course named "Scratch & Game Design" was
  stored as `Scratch &amp; Game Design` and the entity showed on screen; a second save escaped it
  again. The function produces plain text, which React escapes on output, so it decodes now.

**Twelve forms emptied themselves while people were using them.** CI found it, and the captured
page said it plainly: the Add Module dialog still open, the title box blank, "Title must be at
least 2 characters" underneath. Each of these modals reset its form and registered its Escape
listener in one effect, with `onClose` in the dependency array — and every parent passes `onClose`
as an inline arrow, so it arrives new on each of the parent's own renders. The effect therefore
re-ran, and the reset went with it, whenever anything re-rendered the page behind the dialog: a
socket notification, a list refreshing, a sibling's state. Whatever was half-typed went with it.
The reset now depends on the dialog opening and nothing else; the listener keeps `onClose`.

**The broad rate limit was per address.** The end-to-end suite found it: two writes failed in the
second half of a long run and passed on their own. 300 requests a minute, counted per IP, is about
twenty-five dashboard loads for an entire KIT centre on one shared connection — so the twenty-sixth
person was told to slow down for doing nothing. It is keyed on the signed-in session now, the same
correction the password limit already had; signed-out traffic keeps the IP bucket.

**Tests.** `server/test/edit-paths.test.js` posts every update and delete with the exact payload its
form builds — 49 cases — which is how the assignment, session and module-collision failures were
found. `client/e2e/edit-paths.spec.js` drives each edit through the UI at both viewports (20 runs),
and asserts the writing area is taller than 150px, because a desktop-only run would never have shown
the mobile collapse. Server: 670 tests. Playwright: the full suite.

### Production fix — the forced first-login password change (27 Nov 2026)

A new account could not be used. Signing in with a temporary password landed on
`/force-reset-password` as intended, and "Set Password & Continue" then answered 401: *a
password-reset token cannot be used to authenticate a request*. The new password was never saved,
and because the temporary one still forced a reset, the account was stuck — including the two
instructor accounts recovered by the reset action added the same day.

The cause was a contract, not a bug in either half. The client's NextAuth session for a must-change
account carried the temp token as its `accessToken`, so the axios interceptor attached it as a Bearer
credential. The route branched on the `Authorization` header being present, `authenticate` correctly
refused a reset-purpose token, and the request died there — in front of a service that handles temp
tokens perfectly well. Every step had a passing server test; what had no test was the step between
the steps.

- **The body decides which flow it is**, not the header. A request carrying a `temp_token` is never
  authenticated, whatever headers it arrives with.
- **No reset token is a session credential.** `accessToken` is empty for a must-change account; the
  temp token travels in the request body, where it belongs.
- **The temporary password is required** to complete a forced reset, on `/user/change-password` and
  `/reset-password` alike. The token already implied knowledge of it, but a password change that
  proves nothing is a hole waiting for the next route that can mint a token.
- **The screen says what is wrong.** Server field errors land on the field; "Couldn't update
  password — try again" was all it ever said, which is no help at all when the answer is "that is
  not the temporary password you signed in with".
- **"& Continue" continues.** On success the page signs in with the new password and goes to the
  role's dashboard instead of returning to the login form to type it a third time. If that sign-in
  fails it falls back to `/login?reset=success`, because the password did save.
- Removed the `default1234` rule and the "You're using the default password" notice. Accounts have
  had a random per-account temporary password for some time; the rule asked people to differ from a
  string they had never seen, and the notice advertised the old shared default.

One more thing fell out of writing the tests. `/user/change-password` and `/reset-password` were
limited to **10 an hour per IP address**, and a KIT centre is one shared connection: every family and
every instructor in the building leaves by the same address, so an ordinary intake week would lock
the eleventh family out of an account they could not yet sign in to. The limit is now keyed on the
credential the request carries — a hash of the reset token, or of the session's bearer — so the
budget is ten attempts per sign-in, which is the unit the limit is about. The trade is stated in
`rateLimit.js`: one address now gets ten attempts per account rather than ten in total, the same
trade `loginLimiter` already makes. The force-reset screen also repeats the server's own sentence now
("Too many attempts. Please try again later.") instead of "try again", which in that case was not
just unhelpful but wrong.

Tests: eight server tests on the flow, including one that sends the temp token **as a Bearer header
as well** — the exact shape of the production request, and the test that fails if the route goes back
to branching on the header — and one that walks admin-created → first sign-in → set password → sign
in again. Three Playwright tests drive the whole thing through the browser: the full round trip, the
wrong temporary password followed by the right one, and recovery after an admin reset. The MSW mock
now refuses a forced reset with no `current_password`, so it cannot go on accepting what the API
refuses.

### Production fix — temporary passwords, and nothing waiting on email (27 Nov 2026)

Creating a user reported failure and created the user. The write had always succeeded; `createUser`
then awaited an email of the one-time password, Render's free tier blocks outbound SMTP with no
timeout set, and the browser gave up before the server did. The password existed only in the
response that never arrived, and the server keeps a bcrypt hash — so two instructor accounts were
left unreachable with no way to recover them from the product.

- **Temporary passwords are never emailed** (ADR-038). Create and reset return the password, and
  `TempPasswordDialog` shows it in large monospace with a Copy button, closing only on "Done" — no
  backdrop click, no Escape, no timer, because it is the only copy there will ever be.
- **`POST /admin/users/:id/reset-password`** — admin only, on every user row. Issues a new password,
  ends every session that account has, forces a change at next sign-in, and writes
  `reset_user_password` to `activity_logs`. An administrator's own row is disabled: the reset
  invalidates the token the screen is holding, so they would be signed out before they could read
  the password.
- **No request waits on email.** The remaining senders go through `sendMailInBackground`; failures
  are logged, never reported as a failed action. The SMTP transport now has explicit connection,
  greeting and socket timeouts.
- **A timed-out write is verified before it is called a failure.** `isTimeoutOrNetworkError` tells
  "no reply" from "refused", and the create-user form re-reads the list before reporting anything.

Tests: seven server tests on the reset endpoint (new password, forced change, every session ended,
a different password each time, the audit row, admin-only, 404) plus one asserting a password-reset
request answers in under five seconds with the mail server pointed at a port nothing listens on —
which hangs for minutes without this change. Two Playwright workflows cover the dialog and the row
action end to end, including that it does not close on Escape or a backdrop click.

SMTP configuration is unchanged, as asked: receipts and notifications still fail on Render's free
tier, but they now fail in the background rather than taking a request down with them.

### Batch 3 — Real-time, payments, admin and deployment (26 Nov 2026)

**What was built**

The three things the platform still could not do: talk, take money, and be deployed.

- **Chat over Socket.IO** — an **allow-list** of role pairs (ADR-030), re-checked in the service on
  every send rather than only when a conversation opens. Student↔student is refused with 403, which
  is the rule the product exists for. A parent reads their child's conversations and cannot write in
  them: reading is the safeguarding requirement, writing as the child would be impersonation.
  Handshakes verify the same token, the same expiry and the same token version as REST, so a
  deactivated account's live socket loses the right to reconnect.
- **Payments** — Flutterwave v3 test mode (ADR-036, replacing Paystack mid-batch). The amount comes
  from the course and never from the request; the provider's reported amount must match it;
  confirmation is one atomic `pending → paid` claim, so verify and the webhook racing produce one
  receipt and one enrolment (AC3.3). The webhook re-verifies against the API rather than trusting
  its body, because Flutterwave authenticates with a static header secret and not a body signature.
- **Admin** — stats, five analytics series, the payments table and an append-only activity log, every
  figure computed from the collections. `routes/placeholders.js` is **deleted**; nothing in the API
  returns invented data any more.
- **Production hardening** — nine high/critical client advisories cleared, a cold-start notice, the
  Cloudinary delete finished, and a CI step asserting no component imports mock data.
- **Deployment prepared** — `render.yaml` and `docs/DEPLOYMENT.md`, with a 25-row production test
  report left entirely ⏳.

**Measured**

| | |
|---|---|
| Server tests | **542** across 11 files |
| Coverage, `src/services` | **85.0% lines, 84.7% functions** (target ≥ 70%) |
| Coverage, whole server | 87.9% lines, 82.5% functions |
| Models / endpoints | 26 / 102 |
| Lighthouse — production build, local, desktop | Performance **99**, Accessibility **92**, Best practices **100**, SEO 63 |
| Lighthouse — live URL | pending deployment |
| ADRs | 37 (ADR-036, ADR-037 new) |

Lighthouse was measured against `npm run build && npm start`, **not** the dev server: `next dev`
serves unminified bundles with React in development mode and scores about 20 points lower on
Performance for reasons no amount of work on the code would change. `npm run lighthouse` warns if
it is pointed at the dev port. The SEO score of 63 is **correct and deliberate** — the application
sets `robots: index: false` throughout, because a children's learning platform should not be
indexed.

**Three defects found by widening the accessibility scan**

Batch 3 took the axe sweep from four dashboard homes to all 34 main screens in both themes. That
first full scan found three genuine defects the narrow one had never reached, all now fixed: seven
filter dropdowns with no accessible name (critical), three horizontally scrolling tables with no
keyboard tab stop, and a definition list whose groups defined nothing. A gate that covers the four
easiest pages in a product reports green about the pages least likely to be wrong.

**Two defects found by exercising the running system**

- **Receipt number returned blank under a race.** Racing two verifies over HTTP against the live API
  showed the loser being handed a paid payment whose receipt number had not been written yet — which
  the success screen and the receipt modal both render. The unit test for the same race never caught
  it, because the in-memory replica set settles the transaction before a second caller can look. The
  read-back now waits that window out with a deadline; the regression test was confirmed failing
  without the fix.
- **The naira/kobo unit trap**, caught before it shipped. Flutterwave quotes major units where
  Paystack quoted minor ones, so passing `amount_kobo` through unchanged would have charged a parent
  one hundred times the course fee.

**Limitations carried forward**

- **The light theme does not meet WCAG AA for text contrast (ADR-037).** It had never been scanned
  before this batch. The full sweep measured roughly **330 failing nodes across 47 distinct colour
  pairs**, almost all of them in the light theme. The cause is structural, not a set of oversights:
  text sits on pale tints of the brand colours, and on those surfaces **even `--text-secondary`
  (`#6b7280`) measures 4.33–4.42:1**, below the 4.5:1 floor — so no grey passes while still reading
  as quieter than body text. Fixing it needs a palette change, which the product owner has declined
  in order to keep the retained design (ADR-020, ADR-029, ADR-037).

  Adding all 47 pairs to the exemption list was **rejected**: it would have produced a gate that
  passes by naming everything that fails it. Contrast is therefore enforced on the **dark theme**,
  which is the default and passes with its documented exemptions, while the light theme is still
  scanned in full for every other serious and critical rule. The narrowing is stated in the test
  helper's signature and at the top of `a11y.spec.js`, not buried in a list. Reproduce the census
  with `npm run axe:sweep`.
- **Flutterwave is test mode only.** No real money moves. With no key configured the gateway
  simulates, so local development and CI need no account, and such a receipt says "DEMONSTRATION
  PAYMENT" on its face.
- **Hausa ships unreviewed** by a native speaker (ADR-034), covering interface chrome only.
- **Socket.IO runs on one instance.** A second would need a Redis adapter or chat would reach only
  the users on the same instance.
- **The free tier sleeps**: the first request after ~15 minutes idle takes 30–50 seconds. The client
  shows a "Waking the server…" notice after four seconds so it reads as a cold start.

**Needs the author**

1. Create the accounts and deploy: Atlas, Cloudinary, SMTP, Flutterwave test keys, Render Blueprint,
   Vercel project with root `client`. Every step is in `docs/DEPLOYMENT.md`.
2. **Rotate the Atlas password** before submission — a credentials file exists elsewhere in the Kids
   In Tech folder. It is outside this repository and has never been read into it.
3. Run the 25-row production test report and fill in the real results; fill the live Lighthouse row.
4. Record the 10-minute demo (`docs/DEMO-SCRIPT.md`) — re-seed first, since the demo session is live
   for 60 minutes from the seed (ADR-028).

### Batch 2 — Learning core and hybrid sessions (3 Nov 2026)

**What was built**

The learning platform itself, and the hybrid classes that are the point of a programme running in two
cities. A child signs in, reads a lesson, sits a quiz, submits an assignment, watches their progress
rise and earns a certificate anyone can verify. An instructor writes that content, schedules a class,
takes the register by hand or by QR code, and posts the recording. A parent watches all of it. Nothing
on any of those screens is mock data any more.

- **Models** (13 new, 21 in all) — `Course`, `Module`, `Lesson`, `LessonCompletion`, `Quiz`,
  `QuizAttempt`, `Assignment`, `Submission`, `Enrollment`, `Certificate`, `Session`, `Attendance`,
  `Recording`.
- **Endpoints** — 54 new, 93 in all. Content authoring, the work a child does, certificates with a
  public verification route, sessions, attendance, QR tokens, recordings, and the admin overview and
  attendance report. Every one is in `docs/API.md`.
- **Progress** — one rule in one service: lessons, passed quizzes and submitted assignments count
  equally, and an empty course is 0%, never 100%. Adding content to a finished course puts a child
  back mid-course without revoking the certificate they already hold.
- **Certificates** — issued in a transaction, once per child and course, idempotent under a double
  click or two requests racing to finish the last lesson. Serial `KIT-CERT-YYYY-NNNN` from an atomic
  counter, a ten-character verification code, a landscape PDF carrying both marks, and a public
  `/verify/<code>` page that shows initials only (FR11).
- **Sessions** — status computed from the clock, never stored (ADR-023), so nothing has to run on a
  timer for a class to start. A 15-minute-early to 24-hour-late attendance window, 60-second QR
  tokens, and three ways to be marked present: the instructor's register, a child scanning the code,
  and the automatic mark when a child opens the meeting link.
- **QR check-in, both ends** — the instructor's display refreshes every 60 seconds with a countdown
  and shows the raw code to read out; the child's scanner uses `BarcodeDetector` where the browser has
  it and offers a typed code where it does not, which is also the path a child on an older Android
  phone takes.
- **Tests** — 418 server tests (93 new) and 46 end-to-end across desktop and Pixel 7,
  including two full journeys: an instructor's new module reaching a child, a parent and a verified
  certificate; and a class scheduled for two minutes' time going live, taking the register both ways,
  and leaving a recording.

**Six real defects found by running it, not by reading it**

The suites and the lint all passed while these were live, which is why Part G is written as journeys
through the UI rather than as unit tests.

1. **Certificates were being lost, not delayed.** Only lesson completion issued one. A child whose
   last outstanding piece of work was a quiz or an assignment reached 100%, was told the course was
   complete, and never received their certificate — and because completion is a one-shot edge, no
   later action could recover it (ADR-026).
2. **The downloaded certificate could not be verified.** The browser-rendered PDF printed
   `KIT-<record id>-VERIFY`, a placeholder from the mock era that reads like a code and verifies as
   nothing. A family presenting it would have been turned away.
3. **No class could be scheduled through the UI at all.** The session form's course dropdown held
   three hard-coded titles that exist in no database, and it posted a course name where the API wanted
   a `course_id`, so every attempt failed validation. It loads the instructor's own courses now.
4. **The parent's children screen showed nothing.** `GET /students/:id/progress` ran its whole
   ownership check and then returned a hard-coded empty array — a Batch 1 stub. The real feed had been
   written in this batch and nothing called it. The children's course counters and the instructor's
   course and pupil counts were hard-coded zeros for the same reason.
5. **Any instructor could read any child's progress.** ADR-014 deferred the narrowing to this batch;
   it needed doing. An enrolment on one of their own courses is now required.
6. **Deleting a course orphaned its classes.** Sessions, registers and recordings outlived it, so an
   orphan class would have shown on the admin screens as a blank row and still counted in the
   attendance report.

**ADRs added** — ADR-023 to ADR-029, all **Accepted**: computed session status; lesson HTML sanitised
on write; instructors author while only an administrator publishes; whatever finishes a course issues
the certificate; a deleted course keeps its certificates; the seeded live class lasting an hour; and
one tenth colour pair joining the ADR-020 contrast exemption.

**The contrast exemption grew by one pair (ADR-029).** The teal "In Progress" chip on a child's course
card was always in the retained design and was unreachable while progress returned an empty array —
every card read "Not Started" in grey. Real progress rendered it for the first time, and it fails AA
at about 3:1 on a 12% tint of itself. Nothing was restyled. The parent dashboard also failed axe on
its child names and ages, and that one was the scan sampling a half-faded card mid-fetch: the harness
now waits for the loading placeholders to clear before scanning, and no colour was exempted for it.

**Mongoose upgraded to 8.24.10 at merge time**

CI's production audit went red on `main` against the same tree that had been green on the branch:
four high-severity Mongoose advisories were published in between, so the clock had changed, not the
code. Two bear directly on this project — connection-level `sanitizeFilter` not being applied
(GHSA-gg4r-jv3p-qx3c), which is the mechanism keeping Mongo operator keys out of queries, and
prototype pollution through `Schema.virtual()` (GHSA-6972-9mcm-vhwj). 8.24.10 is the last of the 8.x
line and fixes all four without the 9.x major upgrade, which is not this batch's business. All 418
server tests pass unchanged.

**Known limitation of the seed (ADR-028)**

`npm run seed` places one class five minutes in the past, sixty minutes long. The live banner, the QR
display and check-in are demonstrable for about an hour afterwards; after that the class reads
`completed` and those paths have nothing to show. **Re-run the seed before demonstrating or
screenshotting them.** No test depends on it — the journeys schedule their own class.

**Deferred, with reasons**

| Item | Why | When |
|---|---|---|
| Chat, payments, analytics | Batch 3 scope | Batch 3 |
| Cloudinary uploads for assignment files | Needs the account; submissions take links and text | Batch 3 |
| Socket.IO live updates | `NEXT_PUBLIC_SOCKET_URL` stays unset until the server exists | Batch 3 |
| Lighthouse measurement | Needs the deployed URL | Batch 3 |
| 83 React Compiler lint warnings | Rewriting them is the redesign the PRD forbids | Cosmetic; optional |

**Limitations carried forward**

- Palette contrast (ADR-020, accepted) — unchanged from Batch 1: an accepted brand exception, not an
  outstanding defect, and the exemption cannot grow silently.
- Batch 3 is not built; the screens that need it render empty states against endpoints that return
  empty, correctly shaped data (ADR-018).
- Saving the register by hand overwrites the method of an earlier self check-in. The status is
  unchanged and the instructor in the room is the authority on who is there, so this is deliberate.

### Batch 1 — Backend foundation, identity and brand (23 Oct 2026)

**What was built**

A working Express 5 + MongoDB API behind the retained Next.js frontend. All four demo roles sign in
against real data, a parent can add a child with consent, an admin can manage users, and the Kids In
Tech logo and "Powered by StarNova Labs" attribution are in place.

- **Server** — layered route → controller → service → model. Zod-validated environment that fails fast
  naming the bad variable; helmet, CORS restricted to `CLIENT_ORIGIN`, 1 MB JSON limit, pino-http with
  a request id echoed back as `x-request-id`, a MongoDB operator-key sanitiser, one central error
  handler, and graceful shutdown.
- **Models** (8) — `User`, `Student`, `Consent`, `Cohort`, `Counter`, `Setting`, `ActivityLog`,
  `Notification`, with PRD §8.2 fields and indexes.
- **Auth** — JWT HS256 with the algorithm pinned, 24 h, `tv` token-version check; bcrypt cost 12;
  SHA-256 hashed single-use reset tokens; rate limits on sign-in and password routes.
- **Endpoints** — 33 implemented, plus 13 reads that answer empty until Batches 2 and 3 (ADR-018).
- **Seed** — the frontend's demo world: 2 admins, 2 instructors, 3 parents, 8 students on
  `KIT/26/001…`, consents, 3 cohorts, settings. Guarded against production.
- **Brand** — `npm run brand` builds `public/brand/` from the master files; `KitLogo` and
  `PoweredByStarNova`; app icons; the certificate carries both marks. The sidebar and sign-in lockup
  show the **full logotype**, which spells out the name and so replaces both the old bolt icon and the
  wordmark that was set in type beside it; the collapsed sidebar uses the same logotype letterboxed
  into a transparent square, with no tile behind it.
- **Tests** — 325 server tests, 40 end-to-end (desktop + Pixel 7) with axe, and CI covering both
  packages plus a live end-to-end run.

**Baseline before any change** — `npm run build` in `client/` passed on the untouched copy, 42 routes.
`npm run lint` did **not**: the retained frontend trips 76 React Compiler rules from
`eslint-config-next` 16 (ADR-009).

**How to run it** — see [the README](../README.md). Three terminals: `npm run db:local`, `npm run seed`,
`npm run dev`.

**Tests** — `npm test` → 325 passing across 5 files (auth 30, permissions 205, admin 29, family 22,
validation 39). `npm --prefix client run test:e2e` → 40 passing across two device profiles.

**Endpoints covered** — 33 of roughly 70 in the frontend's contract. Every Batch 1 endpoint in PRD §9.1
and §9.2, plus the notification reads brought forward (ADR-019). Documented in
[`docs/API.md`](API.md).

**Numeric-id audit** — no fixes needed from the static sweep: every `Number()`/`parseInt()` call is on
money, age, duration or `order_index`, and all id comparisons are string equality. Running the app
against real data then found two **mock-id** assumptions the static sweep could not:

- `parentStore` defaulted `activeChildId` to `"s1"`, the first mock child, so the parent dashboard
  requested `/students/s1/progress` on every load and took a 400.
- The admin dashboard requested notifications as `"admin1"` and the chat monitor ran
  `useChat("admin1")` — both mock keys. The second also meant every message would have aligned as
  though someone else had sent it.

**Bugs found by running the thing**

| Where | What |
|---|---|
| `lib/paths.js` | Local state landed in `server/server/.local`: `path.resolve("server/…")` is relative to the working directory, which npm had already set to `server/`. Outside the `.gitignore` rule (ADR-022). |
| `serialize.js` | `avatar_initial` was `"M"` for "Ms. Sarah Aliyu". An honorific is not an initial; the fixture expects `"S"`. |
| `User` model | No `bio` field, so the instructor profile always returned null while the seed carried one. |
| `parent/chat/page.jsx` | `useState` and `useEffect` sat after an early return, so hook order changed the moment the session resolved a user id — a crash that real sessions make routine. |
| `POST /admin/permissions` | Saved nothing and reported success: the operator sanitiser strips dotted keys, and permission keys are dotted by design. |
| Unknown routes | Answered 401 instead of 404 — `router.use(authenticate)` on the placeholder router ran on every unmatched path. |
| `Setting.permissions` | Stored under dotted field names, which MongoDB allows but cannot address by a dot path. Now `[{ key, roles }]`. |
| Test harness | `config/env.js` caches `process.env` on first read, during module import; the setup was setting the test environment in `beforeAll`, far too late, so the app had cached the developer's `server/.env`. Two tests were passing only because the secrets did not match. |

**Accessibility** — every violation that did not require changing the palette is fixed: both
`label-content-name-mismatch` failures on the topbar controls, and the new "Powered by" label, which
uses `--text-secondary` rather than the `--text-muted` the brand note asked for, because
`--text-muted` fails AA in both themes.

Nine colour pairings still fail AA. The product owner has decided the emerald palette stands, so these
are an accepted, documented exception rather than an open defect (ADR-020). The E2E assertion allows
exactly those pairs through, by exact colour and per node, so any other serious or critical violation
still fails the build.

**ADRs added** — ADR-009 to ADR-022, all **Accepted**. The two that were open were decided by the
product owner on 23 October:

- **ADR-020 — palette contrast.** Keep the emerald `#10B981` unchanged and carry the WCAG AA
  shortfall as a documented exception. The exemption is a fixed list of nine colour pairs matched by
  exact colour, per node, so any other violation still fails the build.
- **ADR-021 — the permissions screen.** The frontend contract wins: `POST /admin/permissions` now
  accepts and persists the per-administrator section toggles the screen sends, and `GET /admin/users`
  returns them on each admin row. They are visibility only — enforcement stays with the role matrix,
  and a test proves that turning every section off does not change what the account may do.

**Deferred, with reasons**

| Item | Why | When |
|---|---|---|
| Instructor narrowing on `/students/:id/progress` | Needs the enrolments collection | Batch 2 (ADR-014) |
| `assign-instructor` writing to a course | No `courses` collection yet; intent is audited | Batch 2 (ADR-012) |
| 76 React Compiler lint warnings | Rewriting them is the redesign the PRD forbids | Cosmetic; optional |
| `token` alias on `/login` | Kept for shape compatibility with the mocks | Drop once Batch 3 confirms nothing reads it |
| Lighthouse measurement | Needs the deployed URL | Batch 3 |

**Limitations carried forward**

- **Palette contrast (ADR-020, accepted).** Nine colour pairings fail WCAG AA, chiefly white on the
  emerald `#10B981` at 2.53:1 where AA asks 4.5:1 of small text. This is an accepted brand exception,
  not an outstanding defect: the product owner has decided the palette stands. Every violation that
  did not require changing a colour is fixed. The exemption cannot grow silently — it is a fixed list
  matched by exact colour pair, per node.
- Batches 2 and 3 are not built; the screens that need them render empty states against endpoints
  that return empty, correctly shaped data (ADR-018).
- The payment gateway is test mode only, and in Batch 1 it did not exist yet — `/payments` and
  `/subscriptions` returned correctly shaped empty data (ADR-018). See the Batch 3 entry for what
  was actually built, and ADR-036 for the change of provider.

**Needs the student**

1. **Create the GitHub repository and push** — the remote `MubarakAliyu/KITOS-MERN` does not exist yet
   and `gh` is not authenticated here, so CI has never run. Commands are in the Batch 1 hand-off.
2. Accounts for Batch 3: MongoDB Atlas, Render, Vercel, Cloudinary, SMTP, Flutterwave test keys.
3. Answers to PRD §17: the production domains, course fee amounts, a native-speaker pass on the Hausa
   strings, and which KIT address sends mail.
