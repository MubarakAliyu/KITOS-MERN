# Deployment

How KITOS 2.0 gets from this repository to a URL a marker can open, and what has to be true for it
to stay up. Written to be followed in order; every step says what to check before moving on.

Two rules hold throughout:

- **No secret is ever committed.** Every value below marked *secret* is typed into a dashboard, or
  passed on the command line of a single run. `.env*` is git-ignored; `server/.env.example` and
  `client/.env.example` name the variables and nothing else.
- **Nothing in the production test report is ticked until it has been run.** A green table that was
  filled in from intent rather than observation is worse than an empty one, because it cannot be
  distinguished from a real one.

---

## How the pieces fit together

```
                    ┌──────────────────────────────────────────┐
   Browser          │  Vercel — Next.js 16 (root: client/)     │
   (parent,  ──────▶│  kitos-<hash>.vercel.app                 │
    pupil,          │                                          │
    staff)          │  NextAuth session cookie, first-party.   │
                    │  Axios reads the access token out of it  │
                    │  and calls Render directly.              │
                    └───────────────┬──────────────────────────┘
                                    │  browser-to-API, CORS + Bearer
                                    │  WebSocket for chat
                                    ▼
                    ┌──────────────────────────────────────────┐
                    │  Render — Express 5 + Socket.IO (free)   │
                    │  kitos-api.onrender.com                  │
                    └───┬──────────────┬─────────────┬─────────┘
                        │              │             │
                        ▼              ▼             ▼
             ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
             │ MongoDB      │ │ Cloudinary   │ │ SMTP         │
             │ Atlas M0     │ │ (uploads,    │ │ (Brevo or    │
             │ Frankfurt    │ │  attachments)│ │  Gmail)      │
             │ replica set  │ └──────────────┘ └──────────────┘
             └──────────────┘                  ┌──────────────┐
                                               │ Flutterwave  │
                                               │ (test mode)  │
                                               └──────────────┘
```

**The browser talks to both hosts.** That is a deliberate difference from a proxied setup: KITOS
authenticates with a Bearer token rather than an API cookie (ADR-004, ADR-005), so there is no
first-party-cookie problem to solve and no reason to put a rewrite in the path. The consequences to
keep in mind:

- `CLIENT_ORIGIN` on Render must be the Vercel origin **exactly**, or every request fails CORS
  preflight. This is the single most common cause of "the site loads but nothing works".
- The Socket.IO connection is a direct WebSocket to Render, and it is subject to the same origin
  allow-list.
- The Render URL is visible in the browser's network tab. That is fine — it is an API with
  authentication on every route, not a secret.

---

## What goes where

| Variable | Render (API) | Vercel (client) | Notes |
|---|---|---|---|
| `NODE_ENV` | `production` | set by Vercel | |
| `NODE_VERSION` | `22` | `22` | |
| `PORT` | `10000` | — | Render's own port; the app reads it. |
| `MONGODB_URI` | ✅ *secret* | — | Atlas SRV string including the password. |
| `MONGODB_DB_NAME` | `kitos` | — | |
| `JWT_SECRET` | generated | — | `render.yaml` generates it. Never type one in. |
| `JWT_EXPIRES_IN` | `24h` | — | Matches the NextAuth session (ADR-004). |
| `CLIENT_ORIGIN` | ✅ | — | The Vercel production URL, exact, no trailing slash. |
| `STORAGE_PROVIDER` | `cloudinary` | — | Must not be `local` — see below. |
| `CLOUDINARY_URL` | ✅ *secret* | — | `cloudinary://KEY:SECRET@CLOUD_NAME`. |
| `SMTP_HOST/PORT/USER/PASSWORD` | ✅ *secret* | — | Without these, mail is written to a disk that is wiped. |
| `MAIL_FROM` | ✅ | — | Must be a sender the provider verified (ADR-035). |
| `MAIL_REPLY_TO` | `hello@kidsintech.school` | — | So replies reach the school whatever the sender is. |
| `FLW_SECRET_KEY` | ✅ *secret* | — | Flutterwave **test** secret, `FLWSECK_TEST-…` (ADR-036). |
| `FLW_WEBHOOK_HASH` | ✅ *secret* | — | The dashboard's webhook secret hash. |
| `LOGIN_RATE_LIMIT_MAX` | `10` | — | Policy value (PRD §10). Leave alone. |
| `ALLOW_DEMO_SEED` | `false` | — | Set `true` on the command line of the one seeding run only. |
| `DEMO_*_PASSWORD` | **command line only** | — | Never in a dashboard. See step 8. |
| `NEXT_PUBLIC_API_URL` | — | ✅ | The Render URL, e.g. `https://kitos-api.onrender.com`. |
| `NEXT_PUBLIC_SOCKET_URL` | — | ✅ | Normally the same as above. |
| `NEXT_PUBLIC_API_MOCKING` | — | `disabled` | **Must** be `disabled`. MSW in production would serve fixtures. |
| `NEXT_PUBLIC_FLW_PUBLIC_KEY` | — | ✅ | `FLWPUBK_TEST-…`. Public by design; it is in the bundle. |
| `NEXTAUTH_URL` | — | ✅ | The Vercel production URL. |
| `NEXTAUTH_SECRET` | — | ✅ *secret* | `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID/SECRET` | — | optional | The provider only registers when both are set. |

Two things about `NEXT_PUBLIC_` variables that cause real confusion:

- They are **compiled into the JavaScript the browser downloads**. The Flutterwave *public* key
  belongs there; the secret key and the webhook hash never do.
- They are **frozen at build time**. Changing one in Vercel's dashboard does nothing until you
  redeploy — not restart, redeploy.

### ⚠️ Storage must be `cloudinary`

Render's disk is ephemeral: everything written to it disappears on the next deploy (ADR-008). With
`STORAGE_PROVIDER=local` every assignment submission, lesson resource and chat attachment would
survive until the next push and then be gone, with the database still holding URLs that 404. The API
refuses to start if `STORAGE_PROVIDER=cloudinary` and `CLOUDINARY_URL` is missing, which is
deliberate — failing loudly at boot beats discovering it a term later.

---

## Step by step

### 1. MongoDB Atlas

1. Create a free **M0** cluster in **Frankfurt (eu-central-1)** — the closest region to Nigeria that
   M0 offers, and the same region as the Render service, so queries do not cross an ocean.
2. **Database Access** → add a user with a strong generated password. Give it *Read and write to any
   database*.
3. **Network Access** → add `0.0.0.0/0`. Render's free tier has no static outbound IP, so there is
   nothing narrower to allow. The database is still protected by its credentials; this is the
   documented trade-off of the free tier, not an oversight.
4. **Connect** → *Drivers* → copy the `mongodb+srv://…` string and put the password into it.

> **Rotate the Atlas password before submission.** A credentials file exists elsewhere in the Kids
> In Tech folder on this machine. It is outside this repository and has never been read into it, but
> a password that has ever been written to a shared file should not be the one guarding the live
> database. Create the cluster user with a fresh password, and if you reuse an existing cluster,
> change its password first.

**Check:** the string starts `mongodb+srv://`, contains your username, and has no `<` or `>` left in
it from the template.

### 2. Cloudinary

1. Create a free account; the dashboard shows an **API Environment variable** of the form
   `cloudinary://KEY:SECRET@CLOUD_NAME`.
2. Copy it whole. That one string is all the API needs.

**Check:** it has three parts and no spaces.

### 3. SMTP — Brevo or Gmail

**Brevo** (recommended, 300 emails/day free): create an account, verify a sender address, then
**SMTP & API** → *SMTP* for the host, port `587`, login and master password.

**Gmail**: turn on 2-Step Verification, create an **App password**, and use
`smtp.gmail.com` / `587` / your address / the 16-character app password. A normal Gmail password
will not work.

`MAIL_FROM` must be the address the provider verified — which may well not be a Kids In Tech
address. That is expected (ADR-035); `MAIL_REPLY_TO` is `hello@kidsintech.school`, so a parent who
replies still reaches the school.

**Check:** send yourself a test from the provider's own interface before trusting it.

### 4. Flutterwave test keys and the webhook

1. Sign in to the Flutterwave dashboard and switch to **Test mode**.
2. **Settings → API Keys**: copy the **public** key (`FLWPUBK_TEST-…`) and the **secret** key
   (`FLWSECK_TEST-…`).
3. **Settings → Webhooks**: set the URL to
   `https://kitos-api.onrender.com/payments/webhook` — substitute your own Render host — and set a
   **Secret hash**. Invent a long random string; it is not shown to you again, so save it where you
   keep the others. This is what goes into `FLW_WEBHOOK_HASH`.

Three things worth knowing about this webhook:

- The secret hash is a **static** value sent in a `verif-hash` header on every call. It is not a
  signature over the request body, so KITOS treats a matching hash as "worth looking at" and then
  **re-verifies the transaction against Flutterwave's API** before marking anything paid (ADR-036).
- The webhook cannot be registered until Render exists, so this step is finished after step 6.
- Until `FLW_SECRET_KEY` is set, payments run in **simulated mode**: the four-step modal works end
  to end and the receipt says "DEMONSTRATION PAYMENT". That is a correct state to demo in, not a
  broken one.

### 5. Push the repository

Render and Vercel both deploy from GitHub.

```powershell
git remote add origin https://github.com/MubarakAliyu/KITOS-MERN.git
git push -u origin main
```

**Check:** the Actions tab shows the CI workflow running and going green.

### 6. Render — the API

1. **New → Blueprint**, choose this repository. Render reads `render.yaml` and proposes one service,
   `kitos-api`.
2. It will prompt for every variable marked `sync: false`: `MONGODB_URI`, `CLIENT_ORIGIN`,
   `CLOUDINARY_URL`, the four `SMTP_*`, `MAIL_FROM`, `FLW_SECRET_KEY` and `FLW_WEBHOOK_HASH`.
   `CLIENT_ORIGIN` is not known yet — put `http://localhost:3004` in for now and correct it in step
   7. `JWT_SECRET` is generated for you; do not supply one.
3. Deploy, and watch the log. The API logs `MongoDB connected`, then
   `Socket.IO attached to the HTTP server`, then `KITOS API listening`.

**Check:**

```powershell
curl https://kitos-api.onrender.com/health
```

must answer `{"ok":true,"db":"up","version":"2.0.0"}`. `"db":"down"` means the Atlas URI or the IP
allow-list is wrong — not the deploy.

### 7. Vercel — the client

1. **Add New → Project**, choose the same repository.
2. **Root Directory: `client`.** Vercel detects Next.js from there. Do not set a custom build
   command.
3. Add the client variables from the table above. `NEXT_PUBLIC_API_URL` and
   `NEXT_PUBLIC_SOCKET_URL` are the Render URL; `NEXT_PUBLIC_API_MOCKING` is `disabled`;
   `NEXTAUTH_URL` is the Vercel production URL Vercel is about to give you (set it after the first
   deploy and redeploy, or set it to the predicted `https://<project>.vercel.app`).
4. Deploy.
5. **Go back to Render** and set `CLIENT_ORIGIN` to the exact Vercel production URL — scheme and
   host, no trailing slash, no path. Render redeploys on save.

**Check:** open the Vercel URL, sign in, and watch the browser's network tab. Requests to the Render
host should return 200. A CORS error here is always `CLIENT_ORIGIN`.

### 8. Seed the demo data, once, from a laptop

The seed refuses to touch a production database unless it is explicitly permitted and given three
passwords of its own. Those passwords belong on the command line of this one run and **nowhere
else** — not in the repository, not in Render's dashboard. The demo admin can read every child's
record and confirm payments; a password sitting in a dashboard is a password anyone with dashboard
access has.

PowerShell:

```powershell
cd server
$env:MONGODB_URI = "<the Atlas string>"
$env:ALLOW_DEMO_SEED = "true"
$env:DEMO_ADMIN_PASSWORD = "<10+ characters>"
$env:DEMO_STAFF_PASSWORD = "<10+ characters>"
$env:DEMO_FAMILY_PASSWORD = "<10+ characters>"
npm run seed
Remove-Item Env:ALLOW_DEMO_SEED, Env:DEMO_ADMIN_PASSWORD, Env:DEMO_STAFF_PASSWORD, Env:DEMO_FAMILY_PASSWORD
```

bash:

```bash
cd server
MONGODB_URI="<the Atlas string>" \
ALLOW_DEMO_SEED=true \
DEMO_ADMIN_PASSWORD="<10+ characters>" \
DEMO_STAFF_PASSWORD="<10+ characters>" \
DEMO_FAMILY_PASSWORD="<10+ characters>" \
npm run seed
```

**Check:** the summary prints users, courses, enrolments, sessions, payments and conversations, and
the live session it creates is in a 60-minute window from now (ADR-028) — so demo it today.

### 9. Optional: a custom domain

Not required for submission (ADR-032). If DNS for `kidsintech.school` is available:

- `lms.kidsintech.school` → Vercel: add the domain in the project, add the `CNAME` Vercel gives you.
- `api.kidsintech.school` → Render: add the custom domain, add its `CNAME`.
- Then update `CLIENT_ORIGIN` (Render), `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL` and
  `NEXTAUTH_URL` (Vercel), redeploy both, and re-point the Flutterwave webhook.

Budget an hour: DNS propagation and certificate issue are waits, not work.

---

## Redeploying

Both hosts deploy on a push to `main`. Without a code change: Render → **Manual Deploy** → *Deploy
latest commit*; Vercel → **Deployments** → ⋯ → *Redeploy*.

Remember that a `NEXT_PUBLIC_*` change needs a Vercel **redeploy**, not a restart.

## Rolling back

- **Vercel**: *Deployments* → the last good one → **Promote to Production**. Instant.
- **Render**: *Events* → the previous successful deploy → **Rollback to this version**. A minute or
  two while it rebuilds.
- **Neither rolls back the database.** A bad data change is fixed forward, which is why the seed is
  idempotent and the payment confirmation claims its row atomically.

## Known limits of the free tier

| Limit | What it means in practice |
|---|---|
| Render sleeps after ~15 minutes idle | The first request wakes it and takes **30–50 seconds**; everything after is normal. The client shows a "Waking the server…" notice after 4 seconds so the wait reads as a cold start rather than a hang. **Open the site two minutes before any demo.** |
| Render's disk is ephemeral | Wiped on every deploy. This is why `STORAGE_PROVIDER` must be `cloudinary` and why the outbox mailer is development-only. |
| Atlas M0: 512 MB, shared CPU | Far more than KIT needs; queries can be slower under load. Transactions are supported — M0 is a replica set — which the payment confirmation relies on. |
| Cloudinary free: 25 credits/month | Ample for submissions and attachments at this scale. |
| Brevo free: 300 emails/day | A welcome plus a receipt is two. Comfortable. |
| One Render instance | Socket.IO needs no adapter at one instance. A second would need a Redis adapter, or chat would only reach the half of the users on the same instance. |

---

## Production test report

> **Not yet run.** Filled in only after the hosting above exists. Every row below is ⏳ until it has
> actually been executed against the live URL. A ❌ is fixed, redeployed and re-tested, and the row
> then records both the failure and the fix.

| # | Check | Result | Notes |
|---|---|---|---|
| 1 | `GET /health` answers `{"ok":true,"db":"up"}` | ⏳ | |
| 2 | Admin signs in | ⏳ | |
| 3 | Instructor signs in | ⏳ | |
| 4 | Parent signs in | ⏳ | |
| 5 | Student signs in with an admission number | ⏳ | |
| 6 | Parent adds a child; consent is recorded with IP and user agent | ⏳ | |
| 7 | The new child signs in and is forced to reset their password | ⏳ | |
| 8 | Instructor builds a course; admin publishes it (instructors cannot) | ⏳ | |
| 9 | Student completes every item; a certificate is issued | ⏳ | |
| 10 | The certificate verifies at `/verify/<code>` and the PDF downloads | ⏳ | |
| 11 | A session goes live; QR check-in marks attendance; a recording is added | ⏳ | |
| 12 | Flutterwave **test** payment → receipt → enrolment active | ⏳ | |
| 13 | The same payment confirmed twice (verify + webhook) stays one receipt | ⏳ | |
| 14 | Chat is real time between two browsers | ⏳ | |
| 15 | Student↔student chat is refused by the API | ⏳ | |
| 16 | A parent can read their child's conversation and cannot write in it | ⏳ | |
| 17 | An announcement reaches every intended recipient | ⏳ | |
| 18 | Admin analytics reflect everything done in this run | ⏳ | |
| 19 | The activity log shows every admin action from this run | ⏳ | |
| 20 | KIT logo and "Powered by StarNova Labs" in both themes | ⏳ | |
| 21 | All of the above on a real phone | ⏳ | |
| 22 | Playwright suite green against `E2E_BASE_URL` | ⏳ | |
| 23 | Lighthouse on sign-in, student dashboard and a lesson | ⏳ | |
| 24 | Zero console errors across every role's main screens | ⏳ | |
| 25 | `/health` p95 noted after warm-up | ⏳ | |

Rows 12 and 13 need `FLW_SECRET_KEY` set; without it they are demonstrating simulated mode, which is
worth saying in the Notes column rather than ticking as a live payment.
