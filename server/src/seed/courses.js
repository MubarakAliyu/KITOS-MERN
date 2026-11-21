/**
 * Course content for the demo world (Batch 2, Part F).
 *
 * Titles match the mock fixtures the screens were designed against
 * ("Scratch Programming", "Web Development", "Robotics Basics") so every
 * retained page renders with the data it expects.
 *
 * Kept as plain data, like `data.js`, so Batch 3 can add payments against
 * these courses without rewriting the seeder.
 */

export const COURSES = [
  {
    key: "scratch",
    title: "Scratch Programming",
    description:
      "Visual programming for beginners. Build animations and games by snapping blocks together, and learn loops, events and conditionals along the way.",
    programme_track: "scratch",
    instructor: "sarah",
    status: "published",
    price: 15000,
    payment_type: "subscription",
  },
  {
    key: "web",
    title: "Web Development",
    description:
      "Build real websites with HTML, CSS and JavaScript. By the end of the course each pupil has published a portfolio page of their own.",
    programme_track: "web-development",
    instructor: "sarah",
    status: "published",
    price: 20000,
    payment_type: "one_time",
  },
  {
    key: "robotics",
    title: "Robotics Basics",
    description:
      "An introduction to robotics and hardware: sensors, motors and the code that drives them.",
    programme_track: "robotics",
    instructor: "ahmed",
    // Left as a draft on purpose, so the admin course screen has something to
    // publish and the catalogue has something a student must not see.
    status: "draft",
    price: 25000,
    payment_type: "subscription",
  },
];

/**
 * Modules, lessons, quizzes and assignments.
 *
 * A YouTube link appears on the video lessons because the lesson viewer
 * embeds one; the id is a real Scratch tutorial, as the mock fixtures used.
 */
export const MODULES = [
  {
    course: "scratch",
    title: "Getting Started",
    order_index: 1,
    lessons: [
      {
        title: "What is Scratch?",
        content_type: "video",
        youtube_url: "https://www.youtube.com/watch?v=jXUZaf5D12A",
        body_content:
          "<p>Scratch is a place where you make things move. In this lesson we meet the <strong>stage</strong>, the <strong>sprites</strong> that live on it, and the <strong>block palette</strong> you build with.</p><ul><li>Open the editor</li><li>Find the cat sprite</li><li>Drag your first block</li></ul>",
        duration_minutes: 12,
      },
      {
        title: "Your First Project",
        content_type: "video",
        youtube_url: "https://www.youtube.com/watch?v=jXUZaf5D12A",
        body_content:
          "<p>Time to build something. We will make the cat walk across the stage and say hello when it gets there.</p><p>Use the <code>when green flag clicked</code> block to start everything off.</p>",
        duration_minutes: 15,
      },
    ],
    quiz: {
      title: "Getting Started quiz",
      questions: [
        {
          question_text: "What do we call the characters you move around in Scratch?",
          question_type: "mcq",
          options: ["Sprites", "Blocks", "Stages", "Scripts"],
          correct_answer: "Sprites",
        },
        {
          question_text: "Which block starts a script when you press the green flag?",
          question_type: "mcq",
          options: [
            "when green flag clicked",
            "forever",
            "say Hello!",
            "move 10 steps",
          ],
          correct_answer: "when green flag clicked",
        },
        {
          question_text: "A sprite can only ever say one thing.",
          question_type: "true_false",
          correct_answer: "False",
        },
      ],
    },
    assignment: {
      title: "Build a Simple Animation",
      instructions:
        "Create a Scratch animation with at least 3 sprites and 2 sounds. Share the project link, or upload the .sb3 file.",
      deadline_days: 7,
    },
  },
  {
    course: "scratch",
    title: "Basic Blocks",
    order_index: 2,
    lessons: [
      {
        title: "Motion and Looks",
        content_type: "text",
        body_content:
          "<p>Motion blocks move a sprite. Looks blocks change how it appears. Put them together and you have animation.</p><h3>Try it</h3><p>Make a sprite walk to the right, then change costume.</p>",
        duration_minutes: 10,
      },
      {
        title: "Loops and Repeats",
        content_type: "text",
        body_content:
          "<p>A <strong>loop</strong> does the same thing again and again, so you do not have to drag the same block twenty times.</p><p>Try <code>repeat 10</code> around a <code>move 10 steps</code> block.</p>",
        duration_minutes: 14,
      },
    ],
    quiz: {
      title: "Basic Blocks quiz",
      questions: [
        {
          question_text: "Which block repeats an action a set number of times?",
          question_type: "mcq",
          options: ["repeat", "if then", "when clicked", "switch costume"],
          correct_answer: "repeat",
        },
        {
          question_text: "Loops save you from dragging the same block over and over.",
          question_type: "true_false",
          correct_answer: "True",
        },
      ],
    },
  },
  {
    course: "scratch",
    title: "Animations",
    order_index: 3,
    lessons: [
      {
        title: "Costumes and Timing",
        content_type: "text",
        body_content:
          "<p>Swap costumes on a timer and a sprite looks like it is walking. Add a <code>wait</code> block to slow it down.</p>",
        duration_minutes: 12,
      },
    ],
  },
  {
    course: "web",
    title: "HTML Basics",
    order_index: 1,
    lessons: [
      {
        title: "Your First Web Page",
        content_type: "text",
        body_content:
          "<p>HTML describes what is on a page. A heading is a heading, a paragraph is a paragraph, and the browser works out the rest.</p><pre><code>&lt;h1&gt;Hello&lt;/h1&gt;</code></pre>",
        duration_minutes: 15,
      },
      {
        title: "Links and Images",
        content_type: "text",
        body_content:
          "<p>Two tags that make the web what it is: <code>&lt;a&gt;</code> to go somewhere, and <code>&lt;img&gt;</code> to show something.</p>",
        duration_minutes: 12,
      },
    ],
    quiz: {
      title: "HTML Basics quiz",
      questions: [
        {
          question_text: "Which tag makes the biggest heading?",
          question_type: "mcq",
          options: ["h1", "h6", "p", "div"],
          correct_answer: "h1",
        },
        {
          question_text: "The <img> tag needs a src attribute.",
          question_type: "true_false",
          correct_answer: "True",
        },
      ],
    },
    assignment: {
      title: "Build Your Profile Page",
      instructions:
        "Make a web page about yourself with a heading, two paragraphs and one picture. Paste the link to your page.",
      deadline_days: 10,
    },
  },
  {
    course: "web",
    title: "CSS Styling",
    order_index: 2,
    lessons: [
      {
        title: "Colours and Fonts",
        content_type: "text",
        body_content:
          "<p>CSS decides how a page looks. Start with <code>color</code> and <code>font-family</code> and the page already feels like yours.</p>",
        duration_minutes: 14,
      },
      {
        title: "Boxes and Spacing",
        content_type: "text",
        body_content:
          "<p>Everything on a page is a box. <code>margin</code> pushes boxes apart, <code>padding</code> gives the contents room to breathe.</p>",
        duration_minutes: 16,
      },
    ],
  },
  {
    course: "robotics",
    title: "Robotics Basics",
    order_index: 1,
    lessons: [
      {
        title: "Sensors and Motors",
        content_type: "text",
        body_content:
          "<p>A robot senses the world, decides something, then moves. Today we look at the first and last of those.</p>",
        duration_minutes: 20,
      },
    ],
  },
];

/**
 * Who is enrolled on what.
 *
 * `completed` runs a student all the way through a course so the demo has a
 * real certificate to show, rather than an empty certificates page.
 */
export const ENROLMENTS = [
  { student: "liam", course: "scratch", completed: true },
  { student: "liam", course: "web", progressLessons: 1 },
  { student: "aisha", course: "scratch", progressLessons: 2 },
  { student: "emeka", course: "scratch", progressLessons: 1 },
  { student: "yusuf", course: "web", progressLessons: 1 },
  { student: "maryam", course: "scratch" },
  { student: "daniel", course: "robotics" },
  { student: "hauwa", course: "web", progressLessons: 2 },
];

/**
 * Sessions, placed relative to "now" so the demo never goes stale: one is
 * genuinely live whenever the seed is run, one is upcoming, two have
 * finished and one is cancelled.
 */
export const SESSIONS = [
  {
    key: "live",
    course: "scratch",
    instructor: "sarah",
    title: "Scratch Programming — Week 3",
    description:
      "We build an interactive game using sprites and events, and meet loops and conditionals properly.",
    // Started five minutes ago, runs an hour: live right now.
    offsetMinutes: -5,
    duration_minutes: 60,
    session_number: 3,
    mode: "online",
    meeting_url: "https://meet.google.com/kit-scratch-w3",
  },
  {
    key: "upcoming",
    course: "web",
    instructor: "sarah",
    title: "Web Development — Week 5",
    description:
      "Responsive layouts with Flexbox and CSS Grid, then we style a portfolio page together.",
    offsetMinutes: 24 * 60,
    duration_minutes: 90,
    session_number: 5,
    mode: "hybrid",
    meeting_url: "https://meet.google.com/kit-web-w5",
    venue: "StarNova Labs, Sokoto",
  },
  {
    key: "completed",
    course: "scratch",
    instructor: "sarah",
    title: "Scratch Programming — Week 2",
    description:
      "Motion and looks blocks, and animating a sprite walking across the stage with a loop.",
    offsetMinutes: -3 * 24 * 60,
    duration_minutes: 60,
    session_number: 2,
    mode: "physical",
    venue: "StarNova Labs, Birnin Kebbi",
    // Gives the attendance report and the recordings page real data.
    attendance: [
      { student: "liam", status: "present", method: "qr" },
      { student: "aisha", status: "present", method: "roster" },
      { student: "emeka", status: "late", method: "qr" },
      { student: "maryam", status: "absent", method: "roster" },
    ],
    recording: {
      title: "Scratch Week 2 — recording",
      url: "https://www.youtube.com/watch?v=jXUZaf5D12A",
      source: "youtube",
    },
  },
  {
    key: "completed-week-1",
    course: "scratch",
    instructor: "sarah",
    title: "Scratch Programming — Week 1",
    description: "A gentle tour of the Scratch editor: the stage, sprites and the block palette.",
    offsetMinutes: -10 * 24 * 60,
    duration_minutes: 60,
    session_number: 1,
    mode: "physical",
    venue: "StarNova Labs, Birnin Kebbi",
    attendance: [
      { student: "liam", status: "present", method: "roster" },
      { student: "aisha", status: "present", method: "roster" },
      { student: "emeka", status: "present", method: "roster" },
    ],
  },
  {
    key: "cancelled",
    course: "robotics",
    instructor: "ahmed",
    title: "Robotics — Week 1",
    description: "Introduction to sensors and motors.",
    offsetMinutes: 3 * 24 * 60,
    duration_minutes: 60,
    session_number: 1,
    mode: "physical",
    venue: "StarNova Labs, Sokoto",
    cancelled: true,
    cancel_reason: "The kit has not arrived yet — we will reschedule next week.",
  },
];
