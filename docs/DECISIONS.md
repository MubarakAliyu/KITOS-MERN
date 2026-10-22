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
