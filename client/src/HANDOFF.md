# KIT LMS Frontend — Handoff Document

**Status:** Ready for backend integration.

## What is built

- **Auth** — login with email *or* admission number, NextAuth JWT session,
  forgot-password + reset flow, first-login force-reset for admin-provisioned
  accounts.
- **Student dashboard** — enrolled courses, lesson viewer (YouTube embed),
  assignments (Pending / Submitted / Reviewed), quiz player, certificates
  (PDF), chat with instructors, notifications, settings.
- **Parent dashboard** — child switcher, per-child progress, payments
  (Paystack 4-step flow, receipts, subscription cancellation, CSV-style
  export), support chat with admin, notifications.
- **Instructor dashboard** — course/module/lesson/quiz/assignment CRUD,
  rich-text lesson editor, lesson preview, student roster + per-student
  panel, submission review + feedback, chat with students.
- **Admin dashboard** — KPIs + 4 analytics charts, user management
  (create/deactivate/assign instructor + auto admission-no generation),
  course publish/unpublish + full content editor, payments table with
  search/filters/CSV export, announcements (with notification fan-out),
  roles/permissions matrix, activity log, chat monitor.
- **Chat** — Socket.io-ready UI, optimistic message send, file-attachment
  preview, typing indicator, offline banner, mark-as-read.
- **Payments** — full Paystack 4-step flow (Select → Confirm → Processing →
  Success), printable receipts with `RCP-…` numbers, recurring subscriptions,
  cancel-with-confirm flow.
- **Language** — English / Hausa preference, persisted via `zustand/persist`,
  applied via `useLanguage()` + `t()`. Translation scope is chrome
  (nav/topbar/settings/dropdowns/payment modal); academic content stays
  in English.
- **Theme** — light/dark mode via `next-themes`, persisted, no flash.
- **404 pages** — top-level and dashboard-scoped not-found screens.

## Tech stack

- Next.js 16 (App Router) — JavaScript (no TS)
- Tailwind CSS v4
- Framer Motion (`motion/react`)
- NextAuth.js (Credentials)
- Zustand (UI state — sidebar, notifications, language)
- Recharts (analytics)
- Sonner (toasts)
- socket.io-client (chat — falls back to offline when no server)
- @react-pdf/renderer (certificates)
- MSW (dev-only mocks — see `src/_lib/api/README.md` for removal steps)

## Dev credentials

| Role | Login | Password |
|---|---|---|
| Admin | `admin@kidsintech.school` | `KIT@admin2025` |
| Instructor | `instructor@kidsintech.school` | `KIT@teach2025` |
| Parent | `parent@kidsintech.school` | `KIT@parent2025` |
| Student | `KIT/26/001` | `KIT@learn2025` |
| Force-reset demo | `amina@gmail.com` | `default1234` |

## Environment variables

See `.env.local`. Minimum required:

```
NEXTAUTH_URL=http://localhost:3001
NEXTAUTH_SECRET=<generate one>
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_LMS_URL=http://localhost:3001
```

Optional (off by default):

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Deployment

- Target: Vercel (project name `kids-in-tech-lms`)
- Suggested domain: `lms.kidsintech.school`
- Always run `npm run build` before deploying — Turbopack will surface any
  hydration mismatches early.
- Remove MSW before production: see `src/_lib/api/README.md`.

## Known limitations (dev-only)

- All data is mocked via MSW. The server runtime starts the Node MSW server
  via `src/instrumentation.js` so NextAuth's `authorize()` callback also
  sees the mocks.
- Chat WebSocket is wired but no Socket.io server is running locally — the
  client falls back to local-only state with an offline banner.
- Paystack flow is simulated end-to-end (3-stage progress animation, then
  the verify call persists into `PAYMENTS_DB`).
- Google OAuth is not configured by default — the provider only registers
  if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set.
- File uploads in chat / lesson editor use `URL.createObjectURL` — they
  survive a page session but not a refresh.
- Hausa strings cover navigation + chrome only. Strings need a native
  speaker pass before launch.

## Manual verification before launch

Browser testing that can't be done by static analysis:

- Run dev server, log in as each role, click every nav item, confirm no
  blank/broken pages.
- Toggle EN ↔ HA in Settings → Language: sidebar, topbar titles, payment
  flow, logout modal, notification dropdown all flip immediately.
- Resize browser to 375px; confirm sidebar collapses to overlay, tables
  scroll horizontally, modals fit.
- Toggle dark/light theme on every page.
- Walk a payment end-to-end as parent, confirm the receipt prints
  correctly (Cmd/Ctrl-P).

## Batch history

1. Foundation + Navbar
2. Auth screens
3. Shared layout
4. Student dashboard
5. Parent dashboard
6. Instructor dashboard
7. Admin dashboard
8. Real-time chat
9. Payments
10. Language system
11. Polish + handoff (this batch)
