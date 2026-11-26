# KITOS 2.0 — pitch deck outline

Nine slides, with the talk track underneath each. Sized for eight to ten minutes. Keep the words on
the slides short; everything below the rule is spoken, not printed.

Design notes for whoever builds the deck: emerald `#10B981` on navy `#0B1220`, Plus Jakarta Sans for
headings, JetBrains Mono for figures and code. The KIT mark top-left, "Powered by StarNova Labs"
on the closing slide only.

---

## 1 — Title

> **KITOS 2.0**
> The Kids In Tech Operating System
>
> Mubarak Aliyu · StarNova Labs
> GoMyCode MSc — Cloud-Based Web System Design

---

Thirty seconds. Name, programme, and the one-line claim: *a learning platform for a Nigerian
children's coding programme, rebuilt on MERN and deployed to the cloud.*

## 2 — The problem

> **The bootcamp ends. The learning stops.**
>
> - Kids In Tech: coding, design and robotics, ages 8–18
> - Sokoto and Birnin Kebbi · 3 cohorts · 111+ children
> - Between cohorts: no lessons, no progress record, no contact

---

Lead with the children, not the software. KIT's own founding note names the goal as breaking "the
cycle of one-off events". A bootcamp is a spark; what was missing was somewhere for the fire to go.

Then the parent's side of it, which is the part that sells: a parent who has paid for a term has no
way to see whether their child turned up, what they built, or whether they are getting better.

## 3 — What already existed, and what did not

> **A finished interface with nothing behind it**
>
> | | |
> |---|---|
> | Frontend | Complete. Four roles. Mock data. |
> | Backend | A 3,579-line PHP file. **JWT verification switched off.** Secrets hard-coded. |
> | Deployment | None |

---

This is the honest starting point and it is more interesting than pretending to a blank page. The
audit found the PHP API accepted any forged token — the signature check was commented out "for
development" — and carried its database password in the repository. It was not a backend to improve;
it was a specification of business rules to re-read and rebuild.

So the brief was unusual and worth stating: **keep the design exactly, replace everything under it.**

## 4 — Architecture

> *(the diagram from `docs/DEPLOYMENT.md`)*
>
> Next.js on Vercel → Express + Socket.IO on Render → MongoDB Atlas (Frankfurt)
> Cloudinary · Flutterwave (test) · Brevo

---

Ninety seconds. Three points, no more:

- **Layered**: route → controller → service → model. Rules live in services, so they are tested
  without an HTTP layer.
- **Frankfurt** for both Render and Atlas, because it is the closest region to Nigeria and a
  database on another continent taxes every query.
- **Cloudinary is not optional**: Render's free disk is wiped on every deploy, so local storage
  would lose every submission a child uploads.

## 5 — Child safety is the architecture

> **Rules the API enforces, not the interface**
>
> - Student ↔ student messaging: **refused, 403**
> - Parents read their child's conversations; cannot write in them
> - No student email required
> - Accounts pending until a parent consents — IP and user agent recorded

---

The strongest slide. Make the distinction explicit: these are not settings or hidden buttons. Chat
is an **allow-list** of role pairs checked on every single send, so a pair nobody permitted is
refused by default rather than permitted by oversight.

The parent asymmetry is the one people remember: *reading is the safeguarding requirement; writing
as your child would be impersonation.*

## 6 — Two problems worth the detail

> **Money, exactly once**
> One atomic claim · verify and webhook race · one receipt
>
> **Naira are not kobo**
> Flutterwave quotes ₦15,000 where Paystack quoted 1,500,000

---

Pick these two because they show judgement rather than typing.

**Idempotency**: Flutterwave reports a payment twice — once when the browser returns and once by
webhook — sometimes in the same millisecond. A transaction alone does not fix it, because two
transactions can both read "pending". The gate is a single atomic update whose filter requires the
status still to be pending; whoever wins does the work, everyone else reads the result.

**The unit trap**: the payment provider changed mid-project when Paystack's compliance review
stalled. Paystack took minor units; Flutterwave takes major ones. A port that passed the stored kobo
straight through would have charged a parent one hundred times the fee — and ₦1,500,000 is a
plausible-looking number, not a crash. The conversion lives in one file, and tests assert it in both
directions.

If you only have time for one, use the second. It is concrete, it is a real near-miss, and it shows
why the gateway sits behind a wrapper.

## 7 — Evidence

> | | |
> |---|---|
> | Server tests | 542 |
> | Service coverage | 85% lines, 85% functions |
> | End-to-end | Desktop + Pixel 7, against the live URL |
> | Accessibility | Every role's screens, both themes, every push |
> | Lighthouse | 99 / 92 / 100 performance, a11y, best practices |
> | CI | Lint, tests, build, audit, on every push |

---

Fill the Lighthouse and test numbers from the real run before presenting; do not quote these if they
have drifted.

Worth saying out loud: the SEO score is 63 **on purpose** — the whole application sets
`robots: index: false`, because a children's learning platform should not be indexed.

## 8 — What is not finished

> **Known limits, measured**
>
> - Flutterwave in **test mode** — no real money moves
> - Hausa ships **unreviewed** by a native speaker
> - Free tier sleeps: first load ~40s
> - **Light theme fails AA contrast** — 47 colour pairs, measured

---

Do not skip this slide, and do not soften it. A panel trusts a project that names its own limits
more than one that does not, and every one of these is written up with a number rather than a
hedge.

The light theme is the one to be straight about: it had never been scanned until this batch, the
full audit found about 330 failing nodes, and the cause is structural — text sits on pale tints of
the brand colours, where even the secondary grey falls below 4.5:1. Fixing it needs a palette
decision, not a patch, so it is documented and scheduled rather than quietly exempted.

## 9 — What next

> **Next**
> Hausa review · light-theme palette · **offline-first lessons**
>
> *Powered by StarNova Labs*

---

End on the third one, because it is the one that matters where KIT actually operates: connectivity
in Sokoto is the real constraint on all of this. A lesson a child can download at the centre and
work through at home — syncing progress when they next connect — is worth more to these pupils than
any feature on the current roadmap.

Close by naming the children again. The system exists so that a child who finishes a bootcamp has
somewhere to keep going.
