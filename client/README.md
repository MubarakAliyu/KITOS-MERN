# Kids In Tech LMS — KITOS 2.0 client

Learning portal for Kids In Tech (StarNova Labs) — companion app to the marketing site at [kidsintech.school](https://kidsintech.school). Deployed to Vercel at `lms.kidsintech.school`.

This is the `client/` half of [KITOS 2.0](../README.md). The design is retained exactly as built (ADR-001); the Express + MongoDB API it talks to lives in [`../server/`](../server/).

> ## This is NOT the Next.js you know
>
> This version has breaking changes — APIs, conventions, and file structure may all
> differ from your training data. Read the relevant guide in
> `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
>
> (Carried over from `AGENTS.md`, which remains in place for coding agents.)

## Stack

- Next.js 16 (App Router, JS only — no TypeScript)
- React 19, Tailwind CSS v4
- Auth: NextAuth.js (Google OAuth + credentials)
- State: Zustand stores in `src/_store`
- HTTP: Axios services in `src/_lib/api`
- Realtime: socket.io-client (chat, notifications)
- Forms: react-hook-form + zod
- Animation: motion/react
- Charts: recharts
- Toasts: sonner
- Mock API (optional, off by default): msw

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # starts on http://localhost:3004
```

The dev server runs on **port 3004** so the marketing site (port 3000) and the LMS can run side-by-side locally.

The client needs the API running to do anything useful. From the repository root:

```bash
npm run db:local   # in-memory MongoDB replica set on :27027
npm run seed       # demo users, cohorts, settings
npm run dev        # API on :4000 and this client on :3004 together
```

## Scripts

| Command         | Purpose                                    |
|-----------------|--------------------------------------------|
| `npm run dev`   | Start dev server on port 3004 (Turbopack)  |
| `npm run build` | Production build                           |
| `npm run start` | Serve the production build                 |
| `npm run lint`  | ESLint                                     |
| `npm run test:e2e` | Playwright smoke tests (desktop + Pixel 7) |

## Project layout

```
src/
  app/
    (auth)/           Login, forgot/reset password — split-screen layout
    (dashboard)/      Role dashboards (student, parent, instructor, admin)
    layout.js         Root layout: fonts, Sonner toaster, metadata
    page.js           Redirects / → /login
    globals.css       Tailwind + LMS design tokens
  _components/        Shared UI (sidebar, topbar, cards, etc.)
    brand/            KitLogo, PoweredByStarNova
  _lib/api/           Axios service modules — one per domain
  _hooks/             useAuth, useNotifications, useLanguage
  _store/             Zustand stores
  _locales/           en.json, ha.json (English / Hausa)
  _types/schema.js    JSDoc @typedefs for all backend entities
  instrumentation.js  Starts the Node-side MSW server when mocking is enabled
public/
  brand/              KIT and StarNova Labs logo files
```

The leading `_` makes a folder private to App Router (it won't generate routes). Route groups in parentheses (`(auth)`, `(dashboard)`) group routes without adding URL segments — e.g. `(auth)/login/page.jsx` resolves to `/login`.

## Environment variables

Documented in `.env.example`. Highlights:

| Variable                          | Purpose                                                      |
|-----------------------------------|--------------------------------------------------------------|
| `NEXT_PUBLIC_LMS_URL`             | Public base URL (`http://localhost:3004` in dev)             |
| `NEXTAUTH_URL`                    | Must match `NEXT_PUBLIC_LMS_URL`                             |
| `NEXTAUTH_SECRET`                 | NextAuth session secret (`openssl rand -base64 32`)          |
| `NEXT_PUBLIC_API_URL`             | KITOS API base URL (axios services read this)                |
| `NEXT_PUBLIC_SOCKET_URL`          | Socket.IO endpoint — normally the same origin as the API      |
| `NEXT_PUBLIC_API_MOCKING`         | `enabled` starts MSW; anything else (the default) is off      |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Paystack test public key (`pk_test_…`)                       |
| `GOOGLE_CLIENT_ID`                | Google OAuth client ID (optional)                            |
| `GOOGLE_CLIENT_SECRET`            | Google OAuth client secret (optional)                        |

### Mock Service Worker

MSW is an **offline design aid and is off by default**. Set
`NEXT_PUBLIC_API_MOCKING=enabled` to serve `src/_lib/mocks/handlers.js` instead
of the real API — useful for looking at a screen without the backend running.
Both the browser worker (`MSWProvider`) and the Node-side server
(`src/instrumentation.js`, which NextAuth's `authorize()` needs) read the same
flag. It must be `disabled` in production.

The worker is genuinely absent from the production build, not merely switched
off: `next.config.mjs` aliases both mock entry points to a stub unless the flag
is `enabled` (Turbopack emits a dynamic-import chunk even behind a statically
false guard), and `public/mockServiceWorker.js` is not committed, so nothing
MSW-related is deployed. To mock locally:

```bash
npm run mocks:init                      # writes public/mockServiceWorker.js
NEXT_PUBLIC_API_MOCKING=enabled npm run dev
```

## Design tokens

Defined in `src/app/globals.css` and exposed to Tailwind v4 via `@theme inline`:

| Token                  | Value     | Use                          |
|------------------------|-----------|------------------------------|
| `--color-primary`      | `#10B981` | Accent (CTAs, active states) |
| `--color-primary-dark` | `#059669` | Hover / pressed              |
| `--color-navy`         | `#0B1220` | Dark panels, sidebar         |
| `--color-surface`      | `#FFFFFF` | Light backgrounds            |
| `--color-text`         | `#E5E7EB` | Text on dark panels          |

Use as Tailwind utilities: `bg-primary`, `text-navy`, `bg-surface`, etc.

## Schema

`src/_types/schema.js` holds JSDoc `@typedef` for every backend entity. Entries marked `[Backend-confirmed]` match the spec verbatim — never rename their fields. Entries marked `[Pending verification]` need to be reconciled with the backend before live integration.
