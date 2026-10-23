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
| C2.3 | Database model defined | Docs, 1–2 | Report §3.8 (Figs 3.2, 3.6); PRD §8; `server/src/models/` (8 of 24 collections) | ✅ (Batch 1 set) |
| C2.4 | Cloud infrastructure defined | Docs, 3 | Report §3.7 (Fig 3.5); PRD §15.2; `render.yaml` | ✅ (design) |
| C2.5 | Diagrams | Docs | Report Figs 2.1, 3.1–3.9, 4.1–4.2 | ✅ |
| C2.6 | Technology choices justified | Docs | Report §3.6.1 | ✅ |
| C3.1 | Clean, modular code (layered server, permission matrix) | 1–3 | `server/src/{routes,controllers,services,models}`, `config/permissions.js` | ✅ (Batch 1) |
| C3.2 | Scalability (stateless API, indexes, pagination) | 1–3 | model indexes; `lib/pagination.js`; atomic counters in `lib/numbering.js` | ✅ (Batch 1) |
| C3.3 | Continuous integration | 1 | `.github/workflows/ci.yml` — server lint/test/audit, client lint/build/MSW check, live end-to-end | ✅ |
| C3.4 | Automated testing | 1–3 | `server/test/` (315), `client/e2e/` (40, desktop + Pixel 7, with axe) | ✅ (Batch 1) |
| C3.5 | Cloud deployment tools integrated | 3 | `render.yaml`, Vercel project, Atlas | |
| C4.1 | Deployed on public cloud (Vercel + Render + Atlas) | 3 | `docs/DEPLOYMENT.md` | |
| C4.2 | Public link works | 3 | URL recorded in README and DEPLOYMENT.md | |
| C5.1 | Professional report 2,500–3,500 words | Docs, 3 | `docs/REPORT-SUBMISSION.md` condensed from the full project report | |
| C5.2 | 10-minute presentation / demo | 3 | `docs/DEMO-SCRIPT.md`, `docs/PITCH.md` | |
| C5.3 | Submission link (repo + live URL) | 3 | README header | |

## Batch coverage notes

Claude Code adds a dated note here at the end of each batch: which rows moved, and what still needs the student
(accounts, recording, submission).

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
accounts first — MongoDB Atlas, Render, Vercel, Cloudinary, SMTP and Paystack test keys — and the
GitHub repository `MubarakAliyu/KITOS-MERN`, without which CI cannot actually run. The 10-minute
recording and the condensed submission report are also Batch 3.

**One criterion is not fully met.** PRD NFR2 asks for no serious or critical axe violations. Every
violation that could be fixed without changing colours has been; nine colour pairings in the brand
palette still fail WCAG AA contrast and need a decision from the client (ADR-020).
