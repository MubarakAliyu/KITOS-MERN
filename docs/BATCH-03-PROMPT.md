# KITOS 2.0 — BATCH 3 BUILD PROMPT

### Real-time, payments, admin, deployment and presentation

> Read `CLAUDE.md`, `docs/PRD.md` (§6 FR15–FR19, §9.5, §10, §11, §13, §14, §15) and the Batch 1–2 reports first.
> Checkpoint alignment: **Deploy to the Cloud** (public link) and **Document and Present**, plus completing
> **Develop and Implement**. Branch `batch/03-realtime-payments-deploy`.
> Goal: every remaining screen on the real API; chat in real time with child-safety rules; Paystack verified on the
> server; the whole system live on Vercel + Render + MongoDB Atlas; the production checklist, report and demo ready.
> Deployment follows the same procedure as the ALI_IWANBUY Gadgets lab (`..\..\ALI-IWANBUY\ALI_IWANBUY-STORE\docs\DEPLOYMENT.md`
> — read it, adapt it, do not modify it).

---

## PART A — Chat and real-time

- [ ] Models `Conversation`, `Message`, `Announcement`. Routes per PRD §9.5 with shapes from handlers.js
      (`/conversations`, `/messages`, `/messages/read`, `/admin/chat/all-conversations`).
- [ ] Conversation rules in `chat.service`: allowed pairs only (PRD §10); student↔instructor requires a shared
      enrolled course; **student↔student refused with 403**; parents of a student added as `observer_ids` and can
      read (not post) in that thread; admin reads all; messages rate-limited; `reported` flag + admin notification.
- [ ] `src/realtime/socket.js`: Socket.IO on the same HTTP server; CORS = `CLIENT_ORIGIN`; handshake
      `auth.token` verified like REST; rooms `user:<id>` and `conv:<id>`; events the client already uses — `join`,
      `message` (persist first, then emit), `typing`; server pushes `notification` and `session:live`.
- [ ] Client: `socket.js` passes `session.accessToken` and uses `NEXT_PUBLIC_SOCKET_URL`; complete
      `messages.js` / `notifications.js`; the "Offline mode" banner disappears when connected. No visual changes.
- [ ] Notifications: `GET /notifications`, mark one/all read; every service that creates a notification also emits
      it to `user:<id>`. Announcements: `POST /admin/notifications/send` (audience all / role / course) with fan-out
      in batches of 500.

## PART B — Payments (Paystack test mode)

- [ ] `Payment`, `Subscription` models. `POST /paystack/initiate`, `POST /paystack/verify`,
      `POST /paystack/webhook` (raw body, HMAC-SHA512 `x-paystack-signature`), per PRD §11.1. Simulated mode when
      `PAYSTACK_SECRET_KEY` is unset so the existing four-step modal works locally.
- [ ] Confirmation service: one transaction, idempotent on `paystack_ref` — payment `success`, receipt
      `RCP-202610-0001`, enrolment active (Batch 2 hook), subscription upsert, notifications, audit.
- [ ] `GET /payments` (parent own; filters), `GET /payments/stats`, `GET /payments/:id/receipt` (shape for
      `ReceiptModal.jsx`; plus `?format=pdf` via pdfkit with KIT logo and StarNova footer), `GET /subscriptions`,
      `POST /subscriptions/cancel`, `GET /admin/payments` (search, filters, CSV export endpoint if the UI calls one).
- [ ] Replace the client's simulated verify with the real Paystack inline popup when
      `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` is set, keeping the same four visual steps.

## PART C — Admin and settings

- [ ] `GET /admin/stats`, `GET /admin/analytics` (enrolment trend by month, revenue by month, completion rate,
      attendance rate, active users — shapes the four Recharts charts expect), `GET /admin/activity-log`
      (paginated, filters), platform settings already in place — verify admin screens end to end.

## PART D — Production hardening

- [ ] `STORAGE_PROVIDER=cloudinary` provider live; API refuses to start without `CLOUDINARY_URL` when selected.
- [ ] `app.set("trust proxy", 1)` for Render; rate limits keyed correctly behind the proxy.
- [ ] Cold-start: jobs run on boot; client first-request timeout 20 s; a small "Waking the server…" toast after 4 s
      using the existing Sonner toaster (copy only, no new styling).
- [ ] `npm audit --omit=dev` clean of high/critical in both packages; remove unused deps (e.g. MSW from the client's
      production deps — keep as devDependency).
- [ ] Remove every remaining reference to mock data paths in production code paths; grep proves it.

## PART E — Deployment (needs the student's accounts — prepare everything, then guide)

- [ ] `render.yaml` at the repo root: web service `kitos-api`, `rootDir: server`, Node 22, build `npm ci`, start
      `node src/index.js`, health check `/health`, region Frankfurt, env vars with `sync: false` for secrets and
      `generateValue: true` for `JWT_SECRET`.
- [ ] `docs/DEPLOYMENT.md` adapted from the ALI_IWANBUY store guide: architecture diagram; variables table (what goes
      on Render vs Vercel); step-by-step Atlas (M0, Frankfurt, user, 0.0.0.0/0, URI) → Cloudinary → SMTP (Brevo or
      Gmail app password) → Paystack test keys + webhook URL → Render Blueprint → `/health` check → Vercel project
      (root `client`, env vars) → set `CLIENT_ORIGIN` → redeploy → guarded seed from a laptop (PowerShell and bash
      blocks, `ALLOW_DEMO_SEED=true`, demo passwords on the command line only) → optional domain
      `lms.kidsintech.school`; redeploy and rollback; free-tier limits; security note to **rotate the Atlas password**
      because a credentials file exists in the KIT folder.
- [ ] **Production test report** table in DEPLOYMENT.md (fill ✅/❌ only after running it live): health; each role
      signs in; parent adds child + consent; forced reset; course build → completion → certificate verify; session
      live + QR + recording; Paystack test payment → receipt → enrolment; chat real-time + student↔student refused;
      announcement fan-out; admin analytics reflect the run; KIT logo + Powered by StarNova in both themes; mobile
      (real phone); Lighthouse (login, student dashboard, lesson); zero console errors; `/health` p95 after warm-up.
      Never tick a row that was not run.

## PART F — Tests and quality

- [ ] Server: chat rules (every allowed/refused pair), socket auth rejection, webhook signature (valid, invalid,
      replay), payment idempotency under two concurrent verifies, analytics aggregation, announcement fan-out.
- [ ] Playwright full suite (desktop + Pixel 7), runnable against `E2E_BASE_URL` for the live site; axe on every
      role's main pages; Lighthouse script (`npm run lighthouse`) records scores in PROGRESS.md.
- [ ] Coverage report for `server/src/services` (target ≥ 70%).

## PART G — Documentation and presentation

- [ ] `docs/API.md` complete (every endpoint, permission, body, response, errors, socket events).
- [ ] `docs/REPORT-SUBMISSION.md`: a **2,500–3,500-word** professional report condensed from the full project
      report (problem and literature, architecture with the key diagrams referenced, implementation, deployment,
      results table filled with the real measured numbers, limitations). Word count stated at the top.
- [ ] `docs/DEMO-SCRIPT.md`: a **10-minute** recorded demo — 0:00 problem (KIT bootcamps, learning stops), 1:00
      architecture diagram, 2:30 live: parent adds child → student signs in → lesson + quiz → instructor session + QR
      attendance → chat (show refused student↔student) → Paystack test payment → certificate verify → admin
      analytics, 8:00 deployment and CI (Render, Vercel, Atlas dashboards, GitHub Actions), 9:00 results and next
      steps. Include "open the site 2 minutes before recording" (Render cold start).
- [ ] `docs/PITCH.md`: 8–10 slide outline with talk track.
- [ ] `docs/screenshots/`: Playwright script capturing each role's key screens in both themes.
- [ ] README header: **Live URL**, **API URL**, **Repository**, demo-account note, checkpoint name — this is the
      submission link page.
- [ ] Final notes in `docs/LAB-PHASES.md` and `docs/PROGRESS.md`.

## Acceptance criteria

- AC3.1 PRD §14 release criteria 1–9 all met on the live URL (or, where an account is missing, everything is
  ready and the remaining clicks are listed in DEPLOYMENT.md with the rows left ⏳ — never falsely ticked).
- AC3.2 Chat works in real time between two browsers; student↔student is refused by the API.
- AC3.3 A Paystack test payment activates an enrolment exactly once, even if verify and webhook both arrive.
- AC3.4 MSW and mock data are absent from production; no secrets in git history (`git log -p | grep` for keys).
- AC3.5 REPORT-SUBMISSION.md is 2,500–3,500 words; DEMO-SCRIPT.md fits 10 minutes.
- AC3.6 All gates and CI green.

**Report**: live URLs, test counts, Lighthouse scores, production checklist status, what the student still needs to
do (record demo, submit link). Then stop.
