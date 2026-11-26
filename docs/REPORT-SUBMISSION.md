# KITOS 2.0 — Cloud-Based Web System Design

**Mubarak Aliyu** · StarNova Labs · GoMyCode MSc Software Engineering
Checkpoint: *Cloud-Based Web System Design*

**Word count: 2,842** (body prose, excluding tables, headings and this block)

> **Draft status.** Figures measured locally are final. Rows marked *pending live run* need the
> deployed URLs, which need accounts only the author can create; `docs/DEPLOYMENT.md` lists the
> remaining clicks. Nothing here is ticked that has not been observed.

---

## 1. The problem

Kids In Tech (KIT) is a STEM programme run by StarNova Labs that teaches coding, design and
robotics to children aged eight to eighteen in Sokoto and Birnin Kebbi, northern Nigeria. It has run
three bootcamp cohorts and trained more than 111 children. The bootcamps work, and their weakness is
structural rather than pedagogic: a bootcamp ends. When it does, a child has nowhere to continue, a
parent has no record of what their child did or how they are progressing, and an instructor has no
way to keep teaching between cohorts. KIT's own founding note names the ambition as breaking "the
cycle of one-off events with a sustainable, evolving learning path".

The national context sharpens this. Nigeria's NITDA has set a 95% digital-literacy target for 2030,
with 70% by 2027, while internet penetration passed 50% for the first time only in November 2025.
The gap between the ambition and the access is widest for children outside the major cities — who
typically meet technology as consumers rather than as creators. A learning platform that assumes
abundant connectivity and recent hardware does not serve them; one that works on a mid-range phone
over an intermittent connection does.

This project takes KITOS — the Kids In Tech Operating System — as its case study, and turns a
front-end prototype into a deployed, cloud-native system on the MERN stack.

### 1.1 Related systems, and why none of them fits

The obvious question is why KIT should not simply adopt an existing platform. Three families of
system were considered.

**General-purpose LMSs** — Moodle, Canvas, Google Classroom — are mature, free or cheap, and solve
courses, assignments and grading comprehensively. They are built for institutions where the learner
is the account holder and the teacher is the administrator. KIT's unit is not a learner but a
*family*: the payer, the observer and the learner are three different people with three different
rights over the same record. Modelling a parent in Moodle means either giving them their child's
credentials, which defeats the safeguarding requirement, or a plugin that approximates the
relationship. Neither platform treats fee payment as part of enrolment at all.

**Children's coding platforms** — Scratch's own community, Code.org, Tynker — fit the pedagogy
closely and are strong where KITOS is deliberately thin, in authored interactive content. They do
not provide what KIT actually lacks: a register, an attendance record for physical classes, a fee
ledger, or a certificate an employer can verify. They complement KITOS rather than replace it,
which is why lessons embed external video and Scratch projects rather than reimplementing them.

**Nigerian school-management systems** cover fees, attendance and registers well, and are built for
a secondary school's timetable rather than a rolling bootcamp cohort with a branching learning path.

The literature on technology-enhanced learning in low-connectivity contexts points the same way as
KIT's own experience: the binding constraint is rarely content and usually access, continuity and
the parent's visibility of progress. That is the gap KITOS addresses, and it is also why the
further-work section ends on offline-first lessons rather than on features.

## 2. The existing system, honestly described

An audit of the current codebase established an unusual starting point: a finished interface with
nothing usable behind it.

**The frontend was complete and entirely mocked.** A Next.js 16 / React 19 application with
dashboards for four roles, every API call intercepted by Mock Service Worker and answered from
in-memory fixtures. Its own handoff document said so plainly, and added that the chat WebSocket was
"wired but no Socket.io server is running".

**The backend was fragmented and unsafe to deploy.** A PHP/MySQL API sat alongside an earlier
FastAPI prototype; neither was connected to the current frontend, and the three codebases disagreed
about field names — quizzes belonged to modules in the SQL schema but to lessons in the frontend's
type definitions. The PHP API was a single 3,579-line `index.php` routing roughly 115 endpoints
through a chain of `if` statements over 15 MySQL tables. Its review found defects that ruled out
incremental improvement: **JWT signature verification was switched off** with a comment saying
"disabled for development", so any forged token was accepted; the signing secret and database
credentials were hard-coded in a committed file; the "must reset password" state was detected by
testing whether the password equalled a known default; database errors were returned to the client;
and there was no enrolment table at all, so enrolment was inferred from a free-text field and from
payment rows.

That audit set the brief: **keep the design exactly as built, and replace everything beneath it.**
The legacy PHP was read as a specification of business rules the organisation had already agreed —
and never as code to port.

## 3. Architecture

The system is three deployed pieces and four managed services. The deployment topology is drawn in
`docs/DEPLOYMENT.md` ("How the pieces fit together"); the collection model and the request path
through the layers are Figures 3.2 and 4.1 of the full project report, and the permission matrix is
tabulated in `docs/API.md`.

A **Next.js 16** client on Vercel keeps the retained design unchanged. A **Node 22 / Express 5** API
with **Socket.IO** runs on Render. **MongoDB Atlas** holds the data, in Frankfurt — the closest
region Atlas offers to Nigeria, and the same region as the API, because a database on another
continent adds a round trip to every query that a free tier can least afford. Cloudinary stores
uploads, an SMTP provider sends transactional mail, and Flutterwave processes fees in test mode.

The browser talks to both hosts directly rather than through a proxy. KITOS authenticates with a
Bearer token rather than an API cookie, so there is no first-party-cookie problem that a rewrite
would solve; the cost is that CORS must be configured exactly, and `CLIENT_ORIGIN` mismatches are
the single most likely deployment failure.

**The server is layered — route → controller → service → model — and business rules live only in
services.** Services never see a request object, which is what makes them testable without an HTTP
layer and is why the test suite can exercise a race condition directly. Thirty-seven numbered
architecture decision records document every significant choice and, where a later decision
overrode an earlier one, supersede rather than rewrite it.

Three decisions are worth drawing out.

**Money is integer kobo, never a float** (ADR-002). Naira values are produced only at
serialisation, for the frontend that expects them. No arithmetic in any service touches a decimal.

**Permissions are a single matrix plus an ownership check inside the service.** `requirePermission()`
gates the route; the service then narrows to the specific record — this parent's child, this
instructor's course. Both must pass. Hiding a control in the interface is not security, and the
permission tests assert every route against every role: 205 assertions in one file.

**Computed, not stored, wherever a stored value could go stale.** A session's status is derived from
the clock rather than written by a scheduled job, so a free-tier server that sleeps cannot miss the
moment a class becomes live. Course progress is recomputed from what a child has actually completed,
so it cannot be set. Admin dashboard figures are aggregated per request, because an administrator
asking "what is true now?" should not be shown a number that was true once.

## 4. Implementation

The work ran in three batches, each on its own branch with its own acceptance criteria.

**Batch 1** built authentication, accounts, families and platform settings — and replaced the mock
layer so that every screen the frontend already had rendered against a real API. Authentication is
HS256 JWT, always verified, carrying a token-version claim checked on every request so that a
password change or a deactivation invalidates existing sessions immediately rather than in 24 hours.
Passwords are bcrypt at cost 12. Child accounts require no email address, are created by a parent,
and record consent with timestamp, IP and user agent.

**Batch 2** built courses, modules, lessons, quizzes and assignments; the work a child does;
verifiable certificates; and live and hybrid sessions with QR attendance. Two defects found here are
worth recording because they were invisible from outside. First, a certificate was issued only when
a lesson completion was the final act of a course — if the last item was a quiz or an assignment,
the "just completed" edge was consumed elsewhere and the certificate was **never** issued. One
function now owns that rule and all three paths call it. Second, the browser-rendered certificate
printed a placeholder verification code that verified as nothing; it now prints the issued code.
Both were found by clicking through every screen as all four roles with mocking disabled — not by
the tests, which were passing.

**Batch 3** added real-time chat, payments, admin analytics and deployment.

Chat is the part where the product's purpose is enforced in code. Who may talk to whom is an
**allow-list** of role pairs, not a deny-list, checked in the service on every send rather than only
when a conversation is opened. Student-to-student messaging is refused with 403 — not hidden, not
discouraged. A parent **observes** their child's conversations: the transcripts are returned to them
and a write attempt is refused, because reading is the safeguarding requirement and writing as the
child would be impersonation. Sockets authenticate with the same token and the same token-version
check as REST, so a deactivated account loses its live connection's right to reconnect.

Payments moved provider mid-batch. Paystack's compliance review for the KIT account stalled with no
date attached while the school's Flutterwave account was already verified, so the gateway changed
(ADR-036). Because the provider sat behind a single wrapper, the business rules did not move at all
— but two differences would have been silent bugs. **Flutterwave quotes amounts in naira where
Paystack quoted minor units**, so passing the stored kobo straight through would have asked a
parent's card for one hundred times the course fee; ₦1,500,000 for a ₦15,000 course is a
plausible-looking number rather than an obvious crash. And **the figure to compare is `amount`, not
`charged_amount`**, which includes the provider's fee — comparing the latter would have rejected
every genuine payment. Both are handled at the wrapper's edge and asserted in both directions.

The webhook required a second look. Flutterwave authenticates webhooks with a **static secret** in a
header rather than an HMAC over the request body. That establishes that the sender knows the secret
and says nothing about whether the figures in the body are genuine, so the webhook treats the body
as a prompt only — it re-verifies the transaction against the provider's API and acts solely on that
answer. Trusting the body would hand anyone who ever read the hash from a log a way to mark an
enrolment paid for nothing.

Confirmation must happen exactly once. Verify and the webhook both arrive for the same reference, in
either order and sometimes within milliseconds. A database transaction alone does not solve this —
two concurrent transactions can both read "pending" and both proceed. The gate is a single atomic
update whose filter requires the status still to be `pending`: whoever flips it does the side
effects, and everyone else reads the finished row. Testing this against the running API, rather than
only in the unit suite, exposed a further defect the unit test could not see: the loser of the race
was handed a paid payment whose receipt number had not been written yet, which the success screen
renders. The read-back now waits that window out, with a deadline.

## 5. Testing and quality

| Measure | Result |
|---|---|
| Server tests | **542** across 11 files |
| Service coverage | **85.0% lines, 84.7% functions** (target ≥ 70%) |
| Whole-server coverage | 87.9% lines, 82.5% functions |
| Endpoints | **102** (89 distinct paths; 48 GET, 37 POST, 13 PUT, 4 DELETE) |
| Models / services | 26 / 14 |
| End-to-end | Playwright, desktop + Pixel 7, against a real API |
| Accessibility | axe on all 34 main screens, both themes, every push |
| Lighthouse (production build, local) | Performance **99**, Accessibility **92**, Best practices **100**, SEO 63 |
| Lighthouse (live URL) | *pending live run* |
| Live production checklist | *pending live run* — 25 rows, all ⏳ |

Tests run against an in-memory MongoDB replica set, so transactions behave as they do on Atlas. The
suite deliberately includes adversarial cases rather than only happy paths: a browser that sets its
own price, a webhook body that contradicts the gateway, a payment confirmed twice at once, a
student messaging another student, an instructor reading a child they do not teach.

The SEO score of 63 is **correct**, not a defect: the application sets `robots: index: false`
throughout, because a children's learning platform should not be indexed.

CI runs lint, the server suite, the client build, a production dependency audit and the end-to-end
suite on every push, plus a check that no component imports mock data — a guard written after
establishing by hand that none did, because a fact verified once is not a fact that stays true.

## 6. Deployment

`render.yaml` defines the API as a Render Blueprint: Node 22, Frankfurt, health check at `/health`,
`JWT_SECRET` generated by the platform so no human ever sees it, and every credential marked
`sync: false` so Render prompts for it rather than reading it from the repository. The client is a
Vercel project with its root set to `client`. `docs/DEPLOYMENT.md` gives the full sequence with a
check to perform after each step.

Two constraints of the free tier shape the design rather than merely inconveniencing it. **Render's
disk is wiped on every deploy**, so file storage must be Cloudinary in production and the API
refuses to start if it is configured for Cloudinary without credentials — failing loudly at boot
beats discovering it a term later. **Render sleeps after about fifteen minutes idle**, and the first
request then takes 30–50 seconds; the client shows a "Waking the server…" notice after four seconds
so the wait reads as a cold start rather than a hang.

No secret is committed. `.env*` is git-ignored, the example files name variables only, and the
credentials for the one demo-seeding run are passed on that run's command line and nowhere else —
demo accounts can read every child's record, so a password sitting in a dashboard is a password
anyone with dashboard access has.

## 7. Limitations

These are measured, not estimated, and none is presented as finished work.

**Payments run in Flutterwave's test mode.** No real money moves. The flow, the verification, the
idempotency and the receipts are real; the settlement is not. A payment confirmed without gateway
keys is stamped as simulated and its receipt says "DEMONSTRATION PAYMENT" on its face.

**The Hausa translation ships unreviewed by a native speaker** (ADR-034), and covers interface
chrome rather than lesson content. English is the default, so no child meets the Hausa strings
unless they choose them. Shipping an unreviewed translation is a documented limitation; shipping it
silently would be a claim about quality nobody has checked.

**The light theme does not meet WCAG AA for text contrast.** This batch widened the accessibility
sweep from four dashboard homes to all 34 main screens in both themes, and that first full scan
found roughly 330 failing nodes across 47 distinct colour pairs — almost all in the light theme,
which had never been scanned. The cause is structural rather than a set of oversights: text
routinely sits on pale tints of the brand colours, and on those surfaces even the secondary grey
measures 4.33–4.42:1, below the 4.5:1 floor. There is therefore no grey that passes while still
reading as quieter than body text; fixing it requires changing the palette, which the product owner
has declined in order to preserve the retained design. The alternative — adding all 47 pairs to the
exemption list — was rejected because it produces a gate that passes by naming everything that fails
it. Contrast is therefore enforced on the dark theme, which is the default and passes with ten
documented exemptions, while the light theme is still scanned for every other serious and critical
rule. That narrowing is stated in the test helper's own signature rather than buried.

The same widened sweep found and fixed three genuine defects that the narrow one had never reached:
seven filter dropdowns with no accessible name, three horizontally scrolling tables unreachable by
keyboard, and a definition list containing no definitions. The lesson generalises: a gate that
covers the four easiest pages reports green about the pages least likely to be wrong.

**Evaluation is limited** to the development team, KIT instructors and a small pilot group rather
than a controlled trial. **The free tier sleeps**, as described above. **Socket.IO runs on a single
instance**; a second would need a Redis adapter or chat would reach only half the users.

## 8. Conclusion and further work

KITOS 2.0 takes a complete but inert interface and makes it a working cloud system: four roles end
to end, real-time chat with child-safety rules enforced by the API rather than the interface,
payments that confirm exactly once under a race, verifiable certificates, and an administrative
view whose every figure is computed from the data rather than cached.

The most valuable next step is not a feature on the current roadmap. Connectivity in Sokoto and
Birnin Kebbi is the real constraint on everything above, and **offline-first lessons** — downloaded
at the centre, worked through at home, synchronised at the next connection — would do more for these
children than anything else that could be built. After that: a native-speaker pass on the Hausa, and
a palette decision that makes the light theme accessible.

The broader lesson from the build is about verification. Every defect that mattered in this project
— the certificate that was never issued, the amount unit that would have overcharged by a hundred,
the receipt number returned blank under a race, the light theme nobody had ever scanned — was
invisible to a passing test suite and visible the moment the system was exercised as a user, or as
two users at once. Tests are necessary and they are not sufficient.
