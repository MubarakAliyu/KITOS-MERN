/**
 * The demo world, recreated from the frontend's mock fixtures
 * (`client/src/_lib/mocks/handlers.js`) so every retained screen has the data
 * it was designed against.
 *
 * Passwords here are the development ones documented in
 * `client/src/HANDOFF.md`. They are only ever used against a local or test
 * database — `seed.js` refuses to run against production unless
 * ALLOW_DEMO_SEED=true and the three DEMO_*_PASSWORD variables are supplied,
 * and then those are used instead.
 *
 * Structured as plain data, with `password_role` naming which demo password a
 * user gets, so Batch 2 can add courses and sessions and Batch 3 payments and
 * messages by extending these arrays rather than rewriting the seeder.
 */

/** Which demo password each account uses. */
export const PASSWORD_ROLES = {
  admin: "admin",
  staff: "staff",
  family: "family",
};

/** Development defaults, from HANDOFF.md. */
export const DEV_PASSWORDS = {
  admin: "KIT@admin2025",
  staff: "KIT@teach2025",
  family: "KIT@parent2025",
  student: "KIT@learn2025",
  // The force-reset demo: amina@gmail.com signs in with this and is sent
  // straight to the force-reset screen.
  forceReset: "default1234",
};

export const ADMINS = [
  {
    key: "admin",
    name: "Admin User",
    email: "admin@kidsintech.school",
    password_role: PASSWORD_ROLES.admin,
  },
  {
    // Pre-seeded force-reset demo (handlers.js `u_amina`): signing in with
    // the default password lands on /force-reset-password without anyone
    // having to run the Add User flow first.
    key: "amina",
    name: "Amina Ibrahim",
    email: "amina@gmail.com",
    password: DEV_PASSWORDS.forceReset,
    must_reset_password: true,
  },
];

export const INSTRUCTORS = [
  {
    key: "sarah",
    name: "Ms. Sarah Aliyu",
    email: "instructor@kidsintech.school",
    password_role: PASSWORD_ROLES.staff,
    bio: "Experienced tech educator specializing in Scratch and Web Development.",
  },
  {
    key: "ahmed",
    name: "Mr. Ahmed Bello",
    email: "ahmed@kidsintech.school",
    password_role: PASSWORD_ROLES.staff,
    bio: "Robotics instructor and maker, Sokoto.",
  },
];

export const PARENTS = [
  {
    key: "fatima",
    name: "Mrs. Fatima Hassan",
    email: "parent@kidsintech.school",
    phone: "+234 801 234 5678",
    password_role: PASSWORD_ROLES.family,
  },
  {
    key: "ibrahim",
    name: "Mr. Ibrahim Obi",
    email: "ibrahim.obi@example.com",
    phone: "+234 802 345 6789",
    password_role: PASSWORD_ROLES.family,
  },
  {
    key: "zainab",
    name: "Mrs. Zainab Yusuf",
    email: "zainab.yusuf@example.com",
    phone: "+234 803 456 7890",
    password_role: PASSWORD_ROLES.family,
  },
];

/**
 * Eight students taking admission numbers KIT/26/001 upward, in this order.
 *
 * The first three match the frontend's fixtures exactly, including their
 * contact emails, so `/students/me` and the admin table look as designed. The
 * rest fill out the roster for the cohort and attendance screens in Batch 2.
 *
 * `consent: false` on the last one is deliberate: it gives the suite and a
 * demo a student who cannot sign in because consent was never recorded
 * (AC1.2's negative case).
 */
export const STUDENTS = [
  {
    key: "liam",
    name: "Liam Hassan",
    email: "student@kidsintech.school",
    age: 12,
    parent: "fatima",
    programme_track: "web-development",
    cohort: "web-2026",
    consent: true,
  },
  {
    key: "aisha",
    name: "Aisha Hassan",
    email: "aisha@kidsintech.school",
    age: 9,
    parent: "fatima",
    programme_track: "scratch",
    cohort: "scratch-2026",
    consent: true,
  },
  {
    key: "emeka",
    name: "Emeka Obi",
    email: "emeka@kidsintech.school",
    age: 11,
    parent: "ibrahim",
    programme_track: "scratch",
    cohort: "scratch-2026",
    consent: true,
    // Inactive in the fixtures, which gives the admin table a row to
    // reactivate and the suite an inactive account to be refused.
    is_active: false,
  },
  {
    key: "yusuf",
    name: "Yusuf Yusuf",
    age: 13,
    parent: "zainab",
    programme_track: "web-development",
    cohort: "web-2026",
    consent: true,
  },
  {
    key: "maryam",
    name: "Maryam Yusuf",
    age: 10,
    parent: "zainab",
    programme_track: "scratch",
    cohort: "scratch-2026",
    consent: true,
  },
  {
    key: "daniel",
    name: "Daniel Obi",
    age: 15,
    parent: "ibrahim",
    programme_track: "robotics",
    cohort: "robotics-2026",
    consent: true,
  },
  {
    key: "hauwa",
    name: "Hauwa Hassan",
    age: 16,
    parent: "fatima",
    programme_track: "advanced",
    cohort: "web-2026",
    consent: true,
  },
  {
    key: "ngozi",
    name: "Ngozi Obi",
    age: 8,
    parent: "ibrahim",
    programme_track: "scratch",
    cohort: "scratch-2026",
    // No consent on record — this account is `pending` and cannot sign in.
    consent: false,
  },
];

/** One cohort per track, as KIT runs them (PRD §3.1). */
export const COHORTS = [
  {
    key: "scratch-2026",
    name: "Scratch Programming — Birnin Kebbi 2026",
    programme_track: "scratch",
    start_date: "2026-01-12T08:00:00.000Z",
    end_date: "2026-04-10T08:00:00.000Z",
    venue: "StarNova Labs, Birnin Kebbi",
    mode: "hybrid",
    instructors: ["sarah"],
  },
  {
    key: "web-2026",
    name: "Web Development — Sokoto 2026",
    programme_track: "web-development",
    start_date: "2026-02-02T08:00:00.000Z",
    end_date: "2026-05-29T08:00:00.000Z",
    venue: "StarNova Labs, Sokoto",
    mode: "hybrid",
    instructors: ["sarah"],
  },
  {
    key: "robotics-2026",
    name: "Robotics — Sokoto 2026",
    programme_track: "robotics",
    start_date: "2026-03-02T08:00:00.000Z",
    end_date: "2026-06-26T08:00:00.000Z",
    venue: "StarNova Labs, Sokoto",
    mode: "physical",
    instructors: ["ahmed"],
  },
];

export const SETTINGS = {
  platform_name: "Kids In Tech LMS",
  welcome_message:
    "Welcome to Kids In Tech — let's build something today.",
  primary_color: "#10B981",
  logo_url: "/brand/kit-logo.png",
};
