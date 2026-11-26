/**
 * Lighthouse over the three pages the batch brief names (Part F).
 *
 *   npm run lighthouse                      # against http://localhost:3004
 *   LH_BASE_URL=https://… npm run lighthouse  # against the deployed site
 *
 * Prints a markdown table ready to paste into `docs/PROGRESS.md`, and writes
 * the full HTML reports to `lighthouse-reports/` for anything that needs
 * explaining.
 *
 * **Measure a production build, never `next dev`.** The dev server serves
 * unminified bundles with React in development mode and no route
 * pre-rendering, so its Performance score says something about the dev
 * server rather than about the product — about 20 points lower, for reasons
 * no amount of work on the code would change. Build and start first:
 *
 *   npm run build && npm start   (client/, serves :3000 — set LH_BASE_URL)
 *
 * Why a script rather than a CI gate: a Lighthouse score depends on the
 * machine it ran on, and on a free Render tier it depends on whether the API
 * was awake. A number that moves for reasons unrelated to the code is a bad
 * gate and a useful measurement, so this records rather than enforces — and
 * prints where and when it ran, because a score without those is not a
 * result anyone can check.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const BASE = (process.env.LH_BASE_URL ?? "http://localhost:3004").replace(
  /\/$/,
  ""
);

/**
 * The lesson viewer needs a real lesson id, which differs per seed, so it is
 * resolved at run time from the API rather than hard-coded.
 */
const API = (process.env.LH_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);

const CATEGORIES = [
  ["performance", "Performance"],
  ["accessibility", "Accessibility"],
  ["best-practices", "Best practices"],
  ["seo", "SEO"],
];

async function signedInLessonPath() {
  try {
    const res = await fetch(`${API}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: "KIT/26/001",
        password: "KIT@learn2025",
      }),
    });
    if (!res.ok) return null;
    const { token } = await res.json();

    const auth = { Authorization: `Bearer ${token}` };
    const courses = await fetch(`${API}/courses`, { headers: auth }).then((r) =>
      r.json()
    );

    for (const course of courses) {
      // Lessons come nested inside the module list; there is no
      // `GET /courses/:id` that returns the whole tree.
      const modules = await fetch(`${API}/courses/${course.id}/modules`, {
        headers: auth,
      }).then((r) => r.json());

      const lesson = modules
        ?.flatMap?.((module) => module.lessons ?? [])
        ?.find?.((candidate) => candidate?.id);
      if (lesson) return `/student/lessons/${lesson.id}`;
    }
  } catch {
    // The API is not up, or the seed differs. The lesson page is skipped
    // rather than failing the whole run.
  }
  return null;
}

async function run(chrome, url) {
  const result = await lighthouse(
    url,
    {
      port: chrome.port,
      output: "html",
      logLevel: "error",
      // Desktop: a KIT administrator is on a laptop, and the mobile throttle
      // would measure a simulated 3G connection rather than this code.
      formFactor: "desktop",
      screenEmulation: {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      },
      throttling: {
        rttMs: 40,
        throughputKbps: 10 * 1024,
        cpuSlowdownMultiplier: 1,
      },
    },
    null
  );

  return result;
}

const lessonPath = await signedInLessonPath();

const PAGES = [
  ["Sign-in", "/login"],
  ["Student dashboard", "/student"],
  ...(lessonPath ? [["Lesson viewer", lessonPath]] : []),
];

if (!lessonPath) {
  console.warn(
    "! Could not resolve a lesson id from the API — the lesson page is skipped.\n" +
      "  Start the API and run the seed if you want that row.\n"
  );
}

if (BASE.includes(":3004")) {
  console.warn(
    "! Port 3004 is this project's `next dev` port. A dev build scores far\n" +
      "  lower on Performance for reasons unrelated to the code. Run\n" +
      "  `npm run build && npm start` and set LH_BASE_URL to that origin.\n"
  );
}

const outDir = path.join(process.cwd(), "lighthouse-reports");
await fs.mkdir(outDir, { recursive: true });

const chrome = await launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
const rows = [];

try {
  for (const [label, route] of PAGES) {
    const url = `${BASE}${route}`;
    process.stdout.write(`Measuring ${label} (${url}) … `);

    const result = await run(chrome, url);
    const scores = Object.fromEntries(
      CATEGORIES.map(([key]) => [
        key,
        Math.round((result.lhr.categories[key]?.score ?? 0) * 100),
      ])
    );

    const file = path.join(
      outDir,
      `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.html`
    );
    await fs.writeFile(file, result.report);

    rows.push([label, route, scores]);
    console.log(
      CATEGORIES.map(([key, name]) => `${name} ${scores[key]}`).join("  ")
    );
  }
} finally {
  await chrome.kill();
}

// ── The table, ready for PROGRESS.md ────────────────────────────────────────
const when = new Date().toISOString().slice(0, 16).replace("T", " ");

console.log(`\nMeasured ${when} UTC against ${BASE}, desktop form factor.\n`);
console.log(
  `| Page | ${CATEGORIES.map(([, name]) => name).join(" | ")} |`
);
console.log(`|---|${CATEGORIES.map(() => "---").join("|")}|`);
for (const [label, , scores] of rows) {
  console.log(
    `| ${label} | ${CATEGORIES.map(([key]) => scores[key]).join(" | ")} |`
  );
}
console.log(`\nFull reports: ${outDir}`);
