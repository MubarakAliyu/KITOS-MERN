import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";

/**
 * Empty, correctly shaped answers for endpoints that Batches 2 and 3 implement.
 *
 * Why this exists: AC1.1 requires every role to reach its dashboard "with no
 * console errors", and screens whose data arrives later to "show their empty
 * states, not crashes". The retained frontend calls these endpoints on page
 * load regardless, so without them each dashboard logs a string of 404s and
 * some screens throw instead of rendering their empty state.
 *
 * The honest alternatives were worse: a 404 is a bug to the client, and a 501
 * would be rendered as an error banner. An empty collection is true — there
 * are no courses, payments or certificates in a Batch 1 database — and it is
 * exactly what these screens are designed to handle.
 *
 * Rules for this file (ADR-018):
 *   - **Reads only.** No endpoint here writes. A write that silently did
 *     nothing would be a lie the UI would believe.
 *   - Shapes come from client/src/_lib/mocks/handlers.js, so the screens bind
 *     against the same structure they will get for real.
 *   - Every route is authenticated: an empty list is still platform data.
 *   - Each entry names the batch that replaces it. This file shrinks to
 *     nothing by the end of Batch 3 and is then deleted.
 */
export const placeholderRouter = Router();

/** Every route below needs a signed-in user. */
placeholderRouter.use(authenticate);

const empty = (body) => (_req, res) => res.status(200).json(body);

// ── Batch 2: learning content ───────────────────────────────────────────────

/** Student's course list, and the admin/instructor catalogues. */
placeholderRouter.get("/courses", empty([]));

/** Admin courses screen reads `{ courses, total_revenue }`. */
placeholderRouter.get("/admin/courses", empty({ courses: [], total_revenue: 0 }));

/** Student assignments, and the instructor's review queue. */
placeholderRouter.get("/assignments", empty([]));
placeholderRouter.get("/assignments/instructor", empty([]));

/** Certificates are issued on completion (FR11). */
placeholderRouter.get("/certificates", empty([]));

// ── Batch 3: payments ───────────────────────────────────────────────────────

placeholderRouter.get("/payments", empty([]));
placeholderRouter.get("/subscriptions", empty([]));

/**
 * The parent payments screen charts six months, so the array must be present
 * and in order even when every figure is zero — an empty array renders a
 * broken chart rather than an empty one.
 */
placeholderRouter.get(
  "/payments/stats",
  empty({
    total_revenue: 0,
    subscription_revenue: 0,
    one_time_revenue: 0,
    pending_count: 0,
    failed_count: 0,
    this_month: 0,
    last_month: 0,
    monthly_data: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"].map((month) => ({
      month,
      subscription: 0,
      one_time: 0,
    })),
  })
);

// ── Batch 3: chat ───────────────────────────────────────────────────────────

placeholderRouter.get("/conversations", empty([]));
placeholderRouter.get("/messages", empty([]));
placeholderRouter.get("/admin/chat/all-conversations", empty([]));

// ── Batch 3: analytics ──────────────────────────────────────────────────────

/**
 * Five named series, each charted by Recharts. Same reasoning as
 * payments/stats: the keys must exist or the charts throw.
 */
placeholderRouter.get(
  "/admin/analytics",
  empty({
    enrollment_trend: [],
    revenue_monthly: [],
    course_completion: [],
    quiz_performance: [],
    payment_split: [],
  })
);

/** Admin payments table, same envelope as the courses screen. */
placeholderRouter.get("/admin/payments", empty({ payments: [], total_revenue: 0 }));
