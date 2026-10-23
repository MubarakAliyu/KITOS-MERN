# Progress

| Batch | Branch | Status | Date | Notes |
|---|---|---|---|---|
| Docs | main | ✅ Done | 17 Oct 2026 | Project report (Ch. 1–5), PRD, CLAUDE.md, LAB-PHASES, ADR-001–008, batch prompts |
| 1 — Backend foundation, identity and brand | batch/01-foundation | ✅ Done | 23 Oct 2026 | Express 5 + MongoDB API, 8 models, 29 endpoints, 315 server tests, Playwright + axe, CI, KIT logo and StarNova attribution |
| 2 — Learning core and hybrid sessions | batch/02-learning-sessions | ⏳ Not started | | |
| 3 — Real-time, payments, admin and deployment | batch/03-realtime-payments-deploy | ⏳ Not started | | |

## Log

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
- **Endpoints** — 29 implemented, plus 12 reads that answer empty until Batches 2 and 3 (ADR-018).
- **Seed** — the frontend's demo world: 2 admins, 2 instructors, 3 parents, 8 students on
  `KIT/26/001…`, consents, 3 cohorts, settings. Guarded against production.
- **Brand** — `npm run brand` builds `public/brand/` from the master files; `KitLogo` and
  `PoweredByStarNova`; app icons; the certificate carries both marks.
- **Tests** — 315 server tests, 40 end-to-end (desktop + Pixel 7) with axe, and CI covering both
  packages plus a live end-to-end run.

**Baseline before any change** — `npm run build` in `client/` passed on the untouched copy, 42 routes.
`npm run lint` did **not**: the retained frontend trips 76 React Compiler rules from
`eslint-config-next` 16 (ADR-009).

**How to run it** — see [the README](../README.md). Three terminals: `npm run db:local`, `npm run seed`,
`npm run dev`.

**Tests** — `npm test` → 315 passing across 5 files (auth 30, permissions 205, admin 29, family 22,
validation 29). `npm --prefix client run test:e2e` → 40 passing across two device profiles.

**Endpoints covered** — 29 of roughly 70 in the frontend's contract. Every Batch 1 endpoint in PRD §9.1
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

Nine colour pairings still fail AA and **need a brand decision** (ADR-020) — chiefly white on the
emerald `#10B981` at 2.53:1 against the 4.5:1 small text requires. Reaching 4.5:1 needs roughly
`#047857`, a visibly different green, which CLAUDE.md makes non-negotiable. The E2E assertion allows
those pairs through by exact colour, per node, so any other serious or critical violation still fails
the build. **This is the one acceptance criterion not fully met.**

**ADRs added** — ADR-009 to ADR-022. Two are open and need the client: **ADR-020** (palette contrast)
and **ADR-021** (the permissions screen sends per-admin feature toggles, not the PRD's role matrix).

**Deferred, with reasons**

| Item | Why | When |
|---|---|---|
| Palette contrast | Needs a brand decision; not a developer's call | Batch 3, after the client chooses |
| Per-administrator permissions | Needs a per-user permission model the PRD does not define | Batch 3 (FR19) |
| Instructor narrowing on `/students/:id/progress` | Needs the enrolments collection | Batch 2 (ADR-014) |
| `assign-instructor` writing to a course | No `courses` collection yet; intent is audited | Batch 2 (ADR-012) |
| 76 React Compiler lint warnings | Rewriting them is the redesign the PRD forbids | Cosmetic; optional |
| `token` alias on `/login` | Kept for shape compatibility with the mocks | Drop once Batch 3 confirms nothing reads it |
| Lighthouse measurement | Needs the deployed URL | Batch 3 |

**Needs the student**

1. **A brand decision on contrast** (ADR-020) — darken the emerald for small text, put navy text on
   emerald instead of white, or reserve white-on-emerald for large/bold text only.
2. A GitHub repository, so CI actually runs: `MubarakAliyu/KITOS-MERN` per the PRD.
3. Accounts for Batch 3: MongoDB Atlas, Render, Vercel, Cloudinary, SMTP, Paystack test keys.
4. Answers to PRD §17: the production domains, course fee amounts, a native-speaker pass on the Hausa
   strings, and which KIT address sends mail.
