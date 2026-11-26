# GoMyCode Checkpoint — Cloud-Based Web System Design

Programme: MSc Software Engineering (GoMyCode) · Master Degree Highlights · **Cloud-Based Web System Design**.
Case study: **KITOS 2.0 — Kids In Tech LMS** (StarNova Labs). Submission: **link**.

## What the checkpoint asks (verbatim summary)

Design, develop and deploy a modern, cloud-based web system that addresses a real-world problem — robust,
scalable, production-ready — demonstrating research-driven design decisions, cloud deployment and independent
problem-solving.

1. **Identify a real-world problem** (education, health, sustainability, fintech, social innovation) and conduct a
   short research or literature review to justify the problem and solution.
2. **Design the system architecture**: front-end, back-end, database, cloud infrastructure; diagrams; justify
   technology choices (frameworks, database models, APIs).
3. **Develop and implement**: clean code, modularity, scalability; integrate cloud deployment tools; continuous
   integration and testing.
4. **Deploy to the cloud**: AWS, Azure, GCP, Render or Vercel; accessible through a public link.
5. **Document and present**: professional report (2,500–3,500 words) on research, design and deployment; a
   10-minute recorded presentation or demo.

## Coverage checklist (Claude Code ticks each row and fills "Where" as it builds)

| # | Requirement | Batch | Where | Done |
|---|---|---|---|---|
| C1.1 | Real-world problem stated | Docs | Project report Ch. 1; PRD §3 | ✅ |
| C1.2 | Literature review justifying problem and solution | Docs | Project report Ch. 2 | ✅ |
| C2.1 | Front-end architecture defined | Docs, 1 | Report §3.6; `client/`, `client/README.md` | ✅ |
| C2.2 | Back-end architecture defined | Docs, 1 | Report §3.6, §3.9; PRD §7, §9; `server/src/`, `docs/API.md` | ✅ |
| C2.3 | Database model defined | Docs, 1–3 | Report §3.8 (Figs 3.2, 3.6); PRD §8; `server/src/models/` — **26 collections** | ✅ |
| C2.4 | Cloud infrastructure defined | Docs, 3 | Report §3.7 (Fig 3.5); PRD §15.2; **`render.yaml`**, `docs/DEPLOYMENT.md` | ✅ |
| C2.5 | Diagrams | Docs | Report Figs 2.1, 3.1–3.9, 4.1–4.2 | ✅ |
| C2.6 | Technology choices justified | Docs | Report §3.6.1 | ✅ |
| C3.1 | Clean, modular code (layered server, permission matrix) | 1–3 | `server/src/{routes,controllers,services,models}`, `config/permissions.js`; the gateway behind one wrapper (ADR-036) | ✅ |
| C3.2 | Scalability (stateless API, indexes, pagination) | 1–3 | model indexes; `lib/pagination.js`; atomic counters in `lib/numbering.js`; transactions on certificate issue and payment confirmation; the atomic `pending → paid` claim | ✅ |
| C3.3 | Continuous integration | 1 | `.github/workflows/ci.yml` — server lint/test/audit, client lint/build/MSW check, live end-to-end | ✅ |
| C3.4 | Automated testing | 1–3 | `server/test/` — **542 tests**, services at **85% lines**; `client/e2e/` — smoke, two journeys and an accessibility sweep over all 34 screens in both themes, desktop + Pixel 7 | ✅ |
| C3.5 | Cloud deployment tools integrated | 3 | `render.yaml` (Blueprint, health check, generated `JWT_SECRET`, secrets `sync: false`); Vercel root `client`; `docs/DEPLOYMENT.md` | ✅ (configured; the deploy itself is C4.1) |
| C4.1 | Deployed on public cloud (Vercel + Render + Atlas) | 3 | `docs/DEPLOYMENT.md` | |
| C4.2 | Public link works | 3 | URL recorded in README and DEPLOYMENT.md | |
| C5.1 | Professional report 2,500–3,500 words | Docs, 3 | `docs/REPORT-SUBMISSION.md` — **2,842 words**, condensed from the full project report | ✅ (results table awaits the live run) |
| C5.2 | 10-minute presentation / demo | 3 | `docs/DEMO-SCRIPT.md` (timed to 10 min), `docs/PITCH.md` (9 slides with talk track) | ✅ (scripted; the recording needs the live site) |
| C5.3 | Submission link (repo + live URL) | 3 | README **Submission** table — repo filled, live URL pending the deploy | 🟡 |

## Batch coverage notes

Claude Code adds a dated note here at the end of each batch: which rows moved, and what still needs the student
(accounts, recording, submission).

### Batch 3 — 26 November 2026

**Rows that moved.** C2.3, C2.4, C3.1, C3.2 and C3.4 from "(Batches 1–2)" to done — the collection
set is complete at 26, the cloud infrastructure is a committed `render.yaml` rather than a drawing,
and the test suite is 542 server tests with service coverage at 85% lines and 85% functions. C3.5 is
configured. C5.1 and C5.2 are written: the submission report is 2,842 words and the demo script is
timed to ten minutes.

**Still outstanding, and why.** C4.1 and C4.2 — deployment and a working public link — need accounts
only the author can create: MongoDB Atlas, Cloudinary, an SMTP sender, Flutterwave test keys, a
Render Blueprint and a Vercel project with root `client`. Every click is written out in
`docs/DEPLOYMENT.md`, whose 25-row production test report is left entirely ⏳. C5.3 is half done: the
README's submission table carries the repository, and the live URL goes in when it exists. **No row
above is ticked on the strength of being ready to run.**

**The criterion that is still not fully met, and it got larger.** PRD NFR2 asks for no serious or
critical axe violations. This batch widened the sweep from four dashboard homes to **all 34 main
screens in both themes**, which is what the brief asks for and which had never been done. Three
genuine defects fell out and were fixed: seven filter dropdowns with no accessible name (critical),
three scrolling tables with no keyboard tab stop, and a definition list defining nothing.

It also established that **the light theme fails AA contrast broadly** — about 330 nodes across 47
colour pairs — for a structural reason: text sits on pale tints of the brand colours, where even
`--text-secondary` measures 4.33–4.42:1. No grey passes there while still reading as muted, so it
needs a palette change, which ADR-020 and now ADR-037 record the product owner declining in order to
keep the retained design. Listing all 47 pairs as exemptions was rejected as a gate that passes by
naming everything that fails it. Contrast is enforced on the dark theme, which is the default and
passes; every other serious and critical rule is enforced in both. The narrowing is stated in the
test helper and in `a11y.spec.js`, and the census is in `docs/PROGRESS.md` — reproducible with
`npm run axe:sweep`.

**Also recorded.** Lighthouse is now measurable with `npm run lighthouse`: 99 performance, 92
accessibility, 100 best practices against a production build locally. The SEO score of 63 is correct
and deliberate — the application sets `robots: index: false`, because a children's learning platform
should not be indexed. The live-URL run is pending deployment.

### Batch 2 — 3 November 2026

**Rows that moved.** C2.3 from the Batch 1 set to 21 of the 24 collections in PRD §8.2 — the three
outstanding are Batch 3's chat and payment collections. C3.1, C3.2 and C3.4 now read "Batches 1–2":
the layering and the permission matrix held across 54 new endpoints without exception, certificate
issue runs in a MongoDB transaction, and the test count rose from 315 to 418 server tests plus
46 end-to-end.

**What that covers.** Instruction 3 asks for clean, modular, scalable code with CI and automated
testing. The new work is where that claim gets tested: every business rule in this batch lives in a
service, the progress rule lives in exactly one function, and the one defect class that mattered most
— a child losing a certificate they had earned — came from a rule that had been duplicated across
call sites instead. It is now in one place, with tests for each path that reaches it.

Part G is written as two journeys through the real UI rather than as more unit tests, and that choice
earned its keep: six defects were live while every suite and every lint passed, including a session
form that could not schedule a class at all and a parent screen that showed no courses for a child on
three of them. They are listed in `docs/PROGRESS.md`.

**Still outstanding.** Unchanged from Batch 1: C2.4 and C3.5 remain at design stage, and C4.1, C4.2,
C5.1, C5.2 and C5.3 are Batch 3 work needing the student's cloud accounts first. CI now runs on
`MubarakAliyu/KITOS-MERN`, so C3.3 is no longer only configured — it executes on every push.

**One criterion is still not fully met.** PRD NFR2, for the same reason as before: brand palette
pairings fail WCAG AA contrast, and ADR-020 records the product owner's decision that the palette
stands, so this is an accepted exception rather than open work. The exemption grew from nine pairs to
ten this batch — the teal "In Progress" chip, which was unreachable while progress returned nothing
and which no one restyled. ADR-029 records that, and why it is not a precedent.

### Batch 1 — 23 October 2026

**Rows that moved.** C2.1 and C2.2 from "design" to done: the architecture is no longer only described,
it is built and documented endpoint by endpoint in `docs/API.md`. C2.3 is done for the Batch 1 set —
8 of the 24 collections in PRD §8.2, with the rest arriving with the features that need them. C3.1,
C3.2, C3.3 and C3.4 are newly ticked.

**What that covers.** The checkpoint asks for clean, modular, scalable code with CI and testing
(instruction 3). The server is layered route → controller → service → model with every business rule in
a service and one permission matrix; it is stateless, indexed on every query path, paginated, and uses
atomic counters so admission numbers stay unique under concurrency. CI runs on every push: lint, 315
server tests, a client build, a check that the mock worker is absent from it, and a full end-to-end run
against a real API on a seeded database.

**Still outstanding.** C2.4 and C3.5 (cloud infrastructure and deployment tooling) remain at design
stage, and C4.1, C4.2, C5.1, C5.2 and C5.3 are Batch 3 work. Those need the student to create the
accounts first — MongoDB Atlas, Render, Vercel, Cloudinary, SMTP and Flutterwave test keys — and the
GitHub repository `MubarakAliyu/KITOS-MERN`, without which CI cannot actually run. The 10-minute
recording and the condensed submission report are also Batch 3.

**One criterion is not fully met.** PRD NFR2 asks for no serious or critical axe violations. Every
violation that could be fixed without changing colours has been; nine colour pairings in the brand
palette still fail WCAG AA contrast and need a decision from the client (ADR-020).
