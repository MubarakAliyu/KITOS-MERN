# KITOS 2.0 — Kids In Tech Operating System

The learning management system behind **Kids In Tech**, a STEM programme by
[StarNova Labs](https://www.starnovalabs.com) that teaches coding to children aged 8–18 through
bootcamps in Birnin Kebbi and Sokoto, Nigeria. Three cohorts have completed and more than 111 students
have been trained.

KITOS supports the online half of that: courses and lessons, live and hybrid sessions, attendance,
assignments and quizzes, certificates, parent payments, and chat — with child-safety and parental
consent built into the server rather than bolted onto the interface.

It is also the case study for the GoMyCode MSc checkpoint **Cloud-Based Web System Design**.

> **Status.** Batch 1 of 3 is complete: the backend foundation, identity, families and brand.
> Learning content and sessions arrive in Batch 2; real-time chat, payments and deployment in Batch 3.
> See [`docs/PROGRESS.md`](docs/PROGRESS.md).

---

## The problem

Learning stops when a bootcamp ends. Online sessions run on scattered tools, parents have no single
view of their child's progress, attendance and payments, and children's data is handled without the
enforced consent the Nigeria Data Protection Act 2023 requires.

A frontend for all of this already existed — about 60 screens across four roles — but it ran entirely
on mock data, and the PHP backend behind it could not be deployed: its JWT signature verification was
disabled, its secrets were hard-coded, and its field names disagreed with the frontend.

**KITOS 2.0 keeps that frontend exactly as designed and replaces the backend.**

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16, React 19, Tailwind v4, NextAuth | Already built and complete (ADR-001) |
| API | Node.js 22, Express 5 | Matches the frontend's language; one set of conventions |
| Database | MongoDB Atlas via Mongoose 8 | Replica set, so multi-document transactions are available |
| Validation | Zod | Runtime validation on every body, param and query |
| Auth | `jsonwebtoken` HS256, bcrypt cost 12 | Verified on every request, with a token version for revocation |
| Real-time | Socket.IO 4 | Batch 3 |
| Tests | Vitest, Supertest, `mongodb-memory-server`, Playwright, axe | |
| Hosting | Vercel (client) · Render (API) · Atlas (data) | Batch 3 |

JavaScript throughout, not TypeScript: the frontend is JavaScript, and matching it keeps one set of
conventions (ADR-003).

## Layout

```
KITOS-MERN/
├── client/              Next.js frontend — retained design, see client/README.md
│   ├── e2e/             Playwright smoke tests with axe
│   ├── public/brand/    KIT and StarNova logo files (built, not hand-made)
│   ├── scripts/         prepare-brand, screenshots, certcheck, layoutcheck
│   └── src/
├── server/              Express 5 API
│   ├── scripts/         db-local.mjs — a local MongoDB replica set
│   ├── src/
│   │   ├── config/      env (zod), db, permissions, constants
│   │   ├── controllers/ unpack the request, call one service, respond
│   │   ├── services/    every business rule lives here
│   │   ├── models/      one file per collection
│   │   ├── middleware/  authenticate, requirePermission, validate, rateLimit, error
│   │   ├── routes/      the frontend's contract, path for path
│   │   ├── lib/         tokens, numbering, pagination, mailer, audit, serialize
│   │   └── seed/        the demo world
│   └── test/            Vitest + Supertest
├── docs/                PRD, API, decisions, progress, screenshots
└── .github/workflows/   CI
```

Requests flow **route → controller → service → model**. Controllers hold no business logic and
services never see `req`, so every rule is testable without an HTTP layer.

## Running it locally

Node 22 and npm. Nothing else — no Atlas account, no SMTP, no Paystack keys.

```bash
npm --prefix server install
npm --prefix client install
```

Copy the example environments and fill them in:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env.local
```

For a local run, `server/.env` needs only:

```
MONGODB_URI=mongodb://127.0.0.1:27027/?directConnection=true
JWT_SECRET=<32+ characters, e.g. openssl rand -base64 48>
```

and `client/.env.local`:

```
NEXTAUTH_URL=http://localhost:3004
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Then, in three terminals:

```bash
npm run db:local     # MongoDB replica set on :27027, data kept in server/.local
npm run seed         # the demo world
npm run dev          # API on :4000 and client on :3004
```

Open <http://localhost:3004>.

A replica set rather than a plain `mongod` because KITOS uses transactions — a parent adding a child
writes three records that only make sense together. The first run downloads a MongoDB binary.

### Demo accounts (development only)

| Role | Sign in with | Password |
|---|---|---|
| Admin | `admin@kidsintech.school` | `KIT@admin2025` |
| Instructor | `instructor@kidsintech.school` | `KIT@teach2025` |
| Parent | `parent@kidsintech.school` | `KIT@parent2025` |
| Student | `KIT/26/001` | `KIT@learn2025` |
| Forced-reset demo | `amina@gmail.com` | `default1234` |

Students sign in with an **admission number**, everyone else with an email address.

Two seeded accounts exist to exercise the unhappy paths: `KIT/26/003` is deactivated, and `KIT/26/008`
has no parental consent on record, so neither can sign in.

These passwords are for a local database. The seed refuses to run against production unless
`ALLOW_DEMO_SEED=true` and three 10+ character passwords are supplied, and it then writes them to a
git-ignored `docs/DEMO-ACCOUNTS.md` instead of printing them.

### Email without a mail server

With no SMTP configured, messages are written to `server/.local/outbox/*.eml`. A password-reset link
can be read straight off disk.

## Scripts

From the repository root:

| Command | What it does |
|---|---|
| `npm run dev` | API and client together |
| `npm run db:local` | Local MongoDB replica set |
| `npm run seed` | Recreate the demo world |
| `npm test` | Server test suite |
| `npm run lint` | Lint both packages |
| `npm run build` | Production build of the client |

In `client/`: `npm run brand` rebuilds `public/brand/` from the master logo files, and
`npm run test:e2e` runs the Playwright suite against a running stack.

## Testing

```bash
npm test                              # 325 server tests
npm --prefix client run test:e2e      # smoke + axe, desktop and Pixel 7
```

The server suite starts its own in-memory MongoDB replica set, so it needs nothing running. It covers
sign-in by both identifiers, the forced-reset flow, forged `alg:none` and tampered tokens, expiry,
revocation after a password change or deactivation, the permission matrix against every role, ownership
checks, admission-number uniqueness under 50 parallel creates, and Mongo operator injection.

The end-to-end suite needs the stack running and exercises the real API, not mocks.

## Security and child safety

- JWT HS256, **always verified**, with the algorithm pinned so an `alg: "none"` token is rejected
  rather than trusted — the defect that made the legacy API undeployable.
- A `token_version` claim checked on every request, so a password change or a deactivation ends
  existing sessions immediately rather than in 24 hours.
- bcrypt cost 12. Reset tokens are stored only as a SHA-256 hash, single use, 30 minutes.
- One permission matrix (PRD §10.1) plus ownership checks in services. Hiding a control in the
  interface is not security.
- Zod on every input; MongoDB operator keys stripped before anything reaches a query.
- A child's account is `pending` until a parent's consent is recorded, and a pending child cannot sign
  in. The consent row keeps the version, scopes, time, IP and user agent as evidence.
- No email address is required of a student. No student-to-student chat (Batch 3).
- Every admin mutation and security event writes an append-only `activity_logs` row.
- Secrets only in the environment. `npm audit --omit=dev` reports zero vulnerabilities.

## Documentation

| Document | What it covers |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | The source of truth: scope, data model, API, security |
| [`docs/API.md`](docs/API.md) | Every implemented endpoint, with shapes and errors |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Numbered ADRs, including the open questions |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | What each batch delivered, and what is deferred |
| [`docs/LAB-PHASES.md`](docs/LAB-PHASES.md) | GoMyCode checkpoint coverage |
| [`docs/PROJECT-REPORT.md`](docs/PROJECT-REPORT.md) | The full written report |
| [`CLAUDE.md`](CLAUDE.md) | Build instructions and standing rules |

Where the PRD and a batch prompt disagree, the PRD wins, and the conflict is recorded as an ADR.

## Known limitations

- Batches 2 and 3 are not built. Screens that need them render their empty states against endpoints
  that return empty, correctly shaped data (ADR-018).
- Nine colour pairings in the brand palette fail WCAG AA contrast. The product owner has decided the
  emerald palette stands, so this is an accepted, documented exception (ADR-020) — not an open
  defect. The exemption is a fixed list matched by exact colour, so new violations still fail CI.
- Paystack runs in test mode only.

## Licence and credits

Built for **Kids In Tech**, a programme of **StarNova Labs**.
Owner: Aliyu Mubarak, Founder and CEO.
