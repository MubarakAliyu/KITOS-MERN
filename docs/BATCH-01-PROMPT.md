# KITOS 2.0 — BATCH 1 BUILD PROMPT

### Backend foundation, identity and brand

> First batch. Read `CLAUDE.md` and `docs/PRD.md` in full before starting.
> Checkpoint alignment: **Design the System Architecture** (back-end, database) and **Develop and Implement**
> (clean, modular code; CI and testing). Tick the matching rows in `docs/LAB-PHASES.md`.
> Goal: by the end, all four demo roles can sign in to the **existing, unchanged frontend** against a real Express +
> MongoDB API, parents can add a child with consent, admins can manage users, and the KIT logo and "Powered by
> StarNova Labs" footer are in place. Screens whose endpoints arrive in Batch 2 or 3 show their empty states
> against the real API. MSW stays switchable for local design checks but is **off by default**.

---

## PART 0 — Ground rules

1. Work only inside `Kids In Tech\KITOS-MERN\`. `..\kit-lms-main\kit-lms-main\` is **read-only reference**.
2. Never read, copy or print `..\mongoDB-credentials.txt`.
3. `git init` in `KITOS-MERN/`; first commit on `main` = `docs/` + `CLAUDE.md`; then branch `batch/01-foundation`.
4. Node 22 and npm. Each of `client/` and `server/` has its own `package.json` and lockfile. A root `package.json`
   only holds convenience scripts (`dev` runs both with `concurrently`, `test`, `lint`, `build`).

## PART A — Copy the frontend (no redesign)

- [ ] Copy `..\kit-lms-main\kit-lms-main\` → `client/` **excluding** `node_modules/`, `.next/`, `api/`,
      `.env.local`, `.claude/`. Keep `AGENTS.md` (Next.js 16 warning) and merge its note into `client/README.md`.
- [ ] `npm ci` in `client/`; confirm `npm run build` passes **before** any change (record result in PROGRESS.md).
- [ ] `client/.env.example`: `NEXT_PUBLIC_LMS_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `NEXT_PUBLIC_API_URL`,
      `NEXT_PUBLIC_SOCKET_URL`, `NEXT_PUBLIC_API_MOCKING` (default `disabled`), `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`,
      optional `GOOGLE_CLIENT_ID/SECRET`. Names and comments only.
- [ ] MSW: start only when `NEXT_PUBLIC_API_MOCKING === "enabled"` — in `MSWProvider.jsx` and
      `src/instrumentation.js`. Production build must not include the worker (verify with a grep of `.next`).
- [ ] `src/_lib/api/client.js`: timeout 20 s; keep the network-retry; on 401 from the API call `signOut({ callbackUrl: "/login" })` once (guard against loops).
- [ ] Audit for numeric id assumptions (`Number(id)`, `parseInt(id)`, `id === 1`) and fix to string ids. List each fix in PROGRESS.md.

## PART B — Brand additions (the only visual change)

- [ ] `client/public/brand/`: `kit-logo.png` (from `..\Branding\kids logo.png`, resized to 600 px wide, optimised),
      `kit-mark.png` (square crop of the logo for the collapsed sidebar, 128 px), `starnova-logo-dark.svg`
      (copy of `StarNova Labs\Branding\new-logo\svg\StarNova-1.svg`, dark wordmark for light theme),
      `starnova-logo-light.svg` (copy of `StarNova.svg`, white wordmark for dark theme), `starnova-mark.svg`
      (`logomark.svg`). Use `sharp` in a one-off `scripts/prepare-brand.mjs`.
- [ ] `src/_components/brand/KitLogo.jsx` (`variant="full|mark"`, `next/image`, alt "Kids In Tech").
- [ ] Replace the lightning-bolt icon in `_components/auth/BrandLockup.jsx` and `_components/layout/Sidebar.jsx`
      (full logo expanded, mark when collapsed). Keep the existing text and spacing; adjust only the icon slot.
- [ ] `src/_components/brand/PoweredByStarNova.jsx`: "Powered by" in Space Mono 10–11 px using `--text-muted`,
      StarNova wordmark 16–18 px high, `dark` / `light` file chosen by `next-themes` (no hydration flash — render both
      and toggle with `dark:` classes), wrapped in `<a href="https://www.starnovalabs.com" target="_blank" rel="noopener noreferrer" aria-label="Powered by StarNova Labs">`.
- [ ] Place it at the very bottom of the sidebar (below the user card and Logout; collapsed sidebar shows the
      StarNova mark only, with a tooltip) and centred at the foot of the sign-in page's left panel.
- [ ] Favicon / app icon from `kit-mark.png` (`app/icon.png`, `app/apple-icon.png`); remove the old favicon.
- [ ] Certificate template (`_components/certificates/CertificateDocument.jsx`): KIT logo top, "Powered by StarNova
      Labs" + logo in the footer.
- [ ] Check both themes and widths 375 / 768 / 1280; no layout shift.

## PART C — Server foundation

- [ ] `server/package.json` (`"type": "module"`, `"engines": { "node": "22.x" }`), `.node-version` = 22.
      Deps: express@5, mongoose@8, zod, jsonwebtoken, bcryptjs, cors, helmet, express-rate-limit, pino, pino-http,
      nodemailer, sanitize-html, socket.io (wired in Batch 3), dotenv. Dev: vitest, supertest,
      mongodb-memory-server, eslint, nodemon.
- [ ] `src/config/env.js`: zod-parse `process.env`; fail fast naming the missing variable. Variables per PRD §13.1.
- [ ] `src/app.js` factory: helmet, cors (`CLIENT_ORIGIN`, plus `http://localhost:3004` in development), json 1 MB,
      pino-http with request id, Mongo key sanitiser (strip `$` and `.` keys from body/query/params), routers, 404,
      central error handler (`AppError(status, message, reason?)`; Zod → 400 `{ error: "Validation failed", fields }`;
      Mongoose duplicate key → 409). Production responses never include stacks.
- [ ] `src/index.js`: connect Mongo, create HTTP server, listen on `PORT`, graceful shutdown.
- [ ] `GET /health` → `{ ok: true, db: "up" | "down", version }`.
- [ ] `npm run db:local`: `MongoMemoryReplSet` single node on port 27027, data in `server/.local/mongo`, prints URI.
- [ ] `src/lib/serialize.js`: shared `toJSON` plugin (`_id` → `id` string, drop `__v`, `password_hash`,
      `token_version`, reset-token fields). Apply to every schema.
- [ ] `src/lib/numbering.js`: atomic counters (`findOneAndUpdate` `$inc`, upsert) → admission `KIT/26/001`
      (year from Africa/Lagos date, 3-digit pad, extends to 4 when > 999), later receipt and certificate serials.
- [ ] `src/lib/pagination.js`, `src/lib/mailer.js` (SMTP or `server/.local/outbox/*.eml` + log line),
      `src/lib/audit.js` (`logActivity({ actor, action, target, meta, ip })`).

## PART D — Models (Batch 1 set)

`User`, `Student`, `Consent`, `Cohort`, `Counter`, `Setting`, `ActivityLog`, `Notification` (model only; routes in
Batch 3). Fields and indexes exactly as PRD §8.2. `User.email` lowercase, sparse unique; `admission_no` sparse unique.

## PART E — Auth, permissions, users

- [ ] `src/config/permissions.js`: matrix from PRD §10.1; `can(role, key)`; settings overrides merged at boot and on
      `POST /admin/permissions`.
- [ ] Middleware: `authenticate` (Bearer, verify signature + expiry, load user, reject inactive, compare `tv`),
      `requirePermission(key)`, `validate({ body, params, query })`, rate limiters (PRD §10).
- [ ] `POST /login`: identifier = admission number if it matches `/^KIT\/\d{2}\/\d{3,4}$/i`, else email. Response
      shapes exactly as `client/src/_lib/mocks/handlers.js` (`{ access, user }` or
      `{ must_reset_password: true, temp_token, user }`). Students with `status: pending` (no consent) get 403
      `{ error: "Account pending parental consent" }`. Update `last_login_at`. Failed attempts audited after 5 in 15 min.
- [ ] `POST /forgot-password` (always 200), `POST /reset-password` (token or `temp_token`; clears
      `must_reset_password`, increments `token_version`), `POST /user/change-password`, `PUT /user/profile`,
      `PUT /user/language`.
- [ ] Admin: `GET/POST /admin/users` (filters role, status, q; pagination), `PUT /admin/users/:id`,
      `POST /admin/users/activate`, `POST /admin/users/deactivate` (increments `token_version`),
      `POST /admin/users/assign-instructor` (stores on course in Batch 2 — for now validates and records intent; add an
      ADR), `GET /admin/next-admission-no`, `POST /admin/permissions`. Response shapes per handlers.js
      (including `enrolled_courses` arrays — empty until Batch 2).
- [ ] Parents and students: `GET /parents/me`, `GET /parents/me/children` (progress fields zero until Batch 2),
      `POST /students` (body per `parents.js` + `consent: { version, accepted: true }`; creates `User` (role
      student, admission number, temp password returned **once** in the response for the parent to note,
      `must_reset_password: true`), `Student`, `Consent`; notifies admin), `GET /students/me`,
      `GET /students/:id/progress` (ownership: own child / own student / admin).
- [ ] Instructors: `GET /instructors/me` (others in Batch 2).
- [ ] `GET/POST /platform/settings` (moves `settings.json` into the DB; admin only for POST).
- [ ] Every admin mutation writes `activity_logs`.

## PART F — Seed

- [ ] `npm run seed` recreates the frontend's demo world from `handlers.js`: admin, 2 instructors, 3 parents, 8
      students (admission numbers `KIT/26/001…`), consents, cohorts for Scratch / Web Development / Robotics,
      settings. Includes `amina@gmail.com` with `must_reset_password: true`.
- [ ] Development passwords are the ones in `client/src/HANDOFF.md`. In production the seed refuses unless
      `ALLOW_DEMO_SEED=true` **and** `DEMO_ADMIN_PASSWORD`, `DEMO_STAFF_PASSWORD`, `DEMO_FAMILY_PASSWORD` are set
      (10+ chars); it then writes `docs/DEMO-ACCOUNTS.md` (git-ignored).
- [ ] Structure the seed so Batch 2 adds courses/sessions and Batch 3 adds payments/messages without rewriting it.

## PART G — Tests and CI

- [ ] Vitest + Supertest against `MongoMemoryReplSet`: health; login by email and by admission number; wrong
      password 401; inactive 401; pending-consent 403; forced reset flow; forged/unsigned token rejected (regression
      for the legacy defect); expired token 401; token revoked after password change; rate limit on login;
      permission matrix (each Batch 1 route × each role); parent cannot read another parent's child; admission
      numbers unique under 50 parallel creates; Zod 400 shape; Mongo operator injection stripped.
- [ ] `client/e2e/` Playwright smoke (desktop + Pixel 7) with the API running on the seeded in-memory DB: each role
      signs in and lands on its dashboard; KIT logo visible in sidebar and login; "Powered by StarNova Labs" link
      visible in both themes; axe has no serious/critical violations on login and each dashboard home.
- [ ] `.github/workflows/ci.yml`: on push/PR — Node 22; server `npm ci`, lint, test; client `npm ci`, lint, build
      (with dummy public env).

## PART H — Docs

- [ ] `README.md` (root): what KITOS is, stack, folder map, setup (`npm i` in both, `.env` from examples,
      `npm run db:local`, `npm run seed`, `npm run dev`), demo accounts (dev), links to PRD and batches.
- [ ] `docs/API.md` started: every Batch 1 endpoint with method, path, permission, body, response, errors.
- [ ] Update `docs/PROGRESS.md`, `docs/LAB-PHASES.md` (note + rows), `docs/DECISIONS.md` (any new ADRs).

## Acceptance criteria

- AC1.1 `npm run db:local`, `npm run seed`, `npm run dev` → the unchanged frontend at :3004 talks to the API at :4000;
  all four demo roles sign in by their usual credentials and reach their dashboards with no console errors
  (screens that depend on Batch 2/3 endpoints show their empty states, not crashes).
- AC1.2 A parent adds a child with consent; the child signs in with the new admission number and is forced to
  reset the password; without consent the child cannot sign in.
- AC1.3 An admin creates, edits, deactivates and reactivates a user; a deactivated user's existing session is
  rejected on the next request; each action appears in `activity_logs`.
- AC1.4 A forged or unsigned JWT is rejected (test proves it).
- AC1.5 KIT logo replaces the bolt icon everywhere listed; "Powered by StarNova Labs" with logo shows at the bottom
  of the sidebar and the sign-in page in light and dark themes and links to starnovalabs.com. No other visual change
  (compare screenshots before/after in `docs/screenshots/batch-01/`).
- AC1.6 MSW is absent from the production build.
- AC1.7 Server lint + tests green; client lint + build green; CI green on the branch.

**Report** at the end: what was built, how to run it, test counts, endpoints implemented (n of the frontend's
total), screenshots, ADRs, and anything that needs the student. Then stop.
