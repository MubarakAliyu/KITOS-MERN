import sanitizeHtml from "sanitize-html";

/**
 * Sanitises lesson rich text (PRD §10, "Input").
 *
 * Lesson bodies are written by instructors in a rich-text editor and rendered
 * as HTML to children. An allow-list, not a block-list: anything not named
 * here is stripped, so a tag nobody thought of cannot get through.
 *
 * Sanitising happens on the way *in*, in the service, so nothing unsafe is
 * ever stored — a database that only holds safe HTML stays safe even if some
 * future screen renders it without thinking.
 */

/**
 * Video embeds are allowed, but only from YouTube's no-cookie domain.
 *
 * `youtube-nocookie.com` does not set tracking cookies until the child
 * presses play, which matters when the audience is eight years old and the
 * platform promises no third-party scripts in the student area.
 */
const ALLOWED_IFRAME_HOSTS = ["www.youtube-nocookie.com", "youtube-nocookie.com"];

const OPTIONS = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "strong", "b", "em", "i", "u", "s",
    "blockquote", "code", "pre",
    "a", "img", "iframe",
    "table", "thead", "tbody", "tr", "th", "td",
    "span", "div",
  ],

  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    iframe: ["src", "width", "height", "title", "allow", "allowfullscreen", "frameborder"],
    // Lets the editor keep its alignment and highlight classes without
    // allowing arbitrary inline styles.
    "*": ["class"],
  },

  // No `javascript:` or `vbscript:`; `data:` only for inline images.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },

  allowedIframeHostnames: ALLOWED_IFRAME_HOSTS,
  allowIframeRelativeUrls: false,

  transformTags: {
    // Any link out of a lesson opens in a new tab and cannot reach back
    // through window.opener.
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
  },

  // Drop the contents of these outright rather than keeping the text inside.
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

/**
 * @param {string} html
 * @returns {string}
 */
export function sanitizeLessonHtml(html) {
  if (!html) return "";
  return sanitizeHtml(String(html), OPTIONS);
}

/**
 * Strips every tag, for text that is rendered as plain text — titles,
 * instructions, feedback. Keeps the words, drops the markup.
 */
export function toPlainText(value, maxLength) {
  const text = sanitizeHtml(String(value ?? ""), {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();
  return maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Turns any YouTube URL into a no-cookie embed URL, or returns null.
 *
 * Instructors paste whatever the address bar gave them — `watch?v=`,
 * `youtu.be/`, `/embed/`, sometimes with a playlist or a timestamp — so the
 * id is extracted rather than the URL trusted.
 */
export function toYouTubeEmbedUrl(url) {
  if (!url) return null;

  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "");
  let id = null;

  if (host === "youtu.be") {
    id = parsed.pathname.slice(1);
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    if (parsed.pathname === "/watch") id = parsed.searchParams.get("v");
    else if (parsed.pathname.startsWith("/embed/")) id = parsed.pathname.slice(7);
    else if (parsed.pathname.startsWith("/v/")) id = parsed.pathname.slice(3);
  }

  if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
