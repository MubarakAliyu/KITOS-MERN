# CLAUDE.md — KITOS 2.0 (Kids In Tech LMS on MERN) build instructions

You are rebuilding **KITOS** (Kids In Tech Operating System), the learning management system for Kids In Tech, a
children's coding and STEM programme (ages 8–18) run by **StarNova Labs** in Sokoto and Birnin Kebbi, Nigeria.
It is also the student's GoMyCode MSc checkpoint **"Cloud-Based Web System Design"**.

**The job in one sentence:** keep the existing Next.js frontend exactly as designed, and give it a real backend —
Node.js 22 + Express 5 + MongoDB Atlas, deployed on Render — replacing the mock data and the old PHP API.

## Before you write any code

1. Read `docs/PRD.md` **completely**. It is the source of truth.
2. Read `docs/LAB-PHASES.md` and confirm every checkpoint instruction is covered by a batch.
3. Execute only the batch you were given (`docs/BATCH-0N-PROMPT.md`). Report, then stop.

## Folders

| Path | What it is | Rules |
|---|---|---|
| `KITOS-MERN/` (this repo) | The new project | All work happens here |
| `KITOS-MERN/client/` | Frontend copied from `kit-lms-main` | Keep the design. Change only what PRD §12 lists |
| `KITOS-MERN/server/` | New Express API | JavaScript ES modules, layered |
| `../kit-lms-main/kit-lms-main/` | Original frontend + PHP API + `api/schema.sql` | **Read-only reference.** Never write, move, delete, install into or run scripts in it |
| `../Branding/` | KIT logo files | Read-only; copy what you need into `client/public/brand/` |
| `C:\Users\n\Documents\StarNova Labs\Branding\new-logo\` | StarNova Labs logos | Read-only; copy `svg/StarNova-1.svg` (dark text) and `svg/StarNova.svg` (white text) |
| `../mongoDB-credentials.txt` | A credentials file | **Never read into the repo, never copy, never commit, never print.** |

## The API contract

The frontend already defines the API. Before writing an endpoint, read:
`client/src/_lib/api/<domain>.js` (paths and methods), `client/src/_lib/mocks/handlers.js` (exact response shapes),
`client/src/_types/schema.js` (fields). Match them: same paths, snake_case fields, `id` as a string, ISO dates.
Use `../kit-lms-main/kit-lms-main/api/index.php` only to understand business rules — never port its code (its JWT
signature check is disabled, its secrets are hard-coded).

## Standing rules

- **One batch at a time.** Branch `batch/0N-<name>`; finish; verify acceptance criteria; update `docs/PROGRESS.md`;
  commit; report; stop.
- **Definition of Done** (every batch): `npm run lint` and `npm test` in `server/`; `npm run lint` and
  `npm run build` in `client/`; acceptance criteria demonstrably met; no TODOs, no lorem ipsum, no commented-out code.
- **The PRD wins.** Conflicts and open questions go to `docs/DECISIONS.md` as numbered ADRs.
- **Never invent scope; never silently drop scope.** Time is short — finish features properly, push cosmetics to
  `PROGRESS.md`.

## Non-negotiables

| Rule | Detail |
|---|---|
| Design | **No redesign.** Keep Plus Jakarta Sans / Space Mono / JetBrains Mono, the emerald `#10B981` + navy `#0B1220` tokens, light/dark themes, layouts. |
| Brand additions | Kids In Tech logo replaces the lightning-bolt icon (sidebar, collapsed sidebar, sign-in, favicon, certificate). "Powered by StarNova Labs" + StarNova logo at the bottom of the sidebar and the sign-in page, theme-aware, links to https://www.starnovalabs.com. |
| Layers | route → controller → **service** → model. Business rules only in services. |
| Auth | JWT HS256 signed with `JWT_SECRET`, **always verified**, 24 h, `tv` (token version) checked. bcrypt cost 12. |
| Permissions | `requirePermission()` from one matrix + ownership checks in services. UI hiding is not security. |
| Child safety | No student↔student chat. Parents observe their child's conversations. Child accounts pending until parent consent. No student email required. |
| Validation | Zod on every body, params and query. Strip Mongo operator keys. Sanitise rich text. |
| Money | Integer kobo in the DB; serialise to the shape the frontend expects (ADR-002). |
| Transactions | Payment confirmation, enrolment activation and certificate issue: one MongoDB transaction, idempotent. |
| Audit | Every admin mutation and security event writes `activity_logs` (append-only). |
| Secrets | Environment only. `.env*` git-ignored; `.env.example` names only. |
| Time | Store UTC; the client shows Africa/Lagos. |

## Commands

`server/`: `npm run dev` (:4000) · `npm run db:local` (in-memory replica set) · `npm run seed` · `npm test` · `npm run lint`
`client/`: `npm run dev` (:3004, as set in `client/package.json`) · `npm run build` · `npm run lint` · `npm run test:e2e`
