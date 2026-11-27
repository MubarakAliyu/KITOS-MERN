/**
 * One renderer for lesson content, wherever it is shown.
 *
 * Lesson bodies arrive in two formats and always have. The rich editor writes
 * HTML (it is a `contentEditable`, so `innerHTML` is its output), while the
 * seeded courses — and anything an instructor pasted from notes — are
 * Markdown. Three screens then rendered that content three different ways:
 *
 *   - the editor's Preview and Split panes injected it as HTML, so Markdown
 *     showed as its own source: "# Introduction", "**Stage:**";
 *   - the student's lesson page put it in a `<p>` as plain text, so Markdown
 *     showed as source *and* HTML showed as literal tags;
 *   - the preview modal did a third thing again.
 *
 * So: detect which format the content is in, convert Markdown to HTML, and
 * sanitise the result. Every screen calls `toRenderableHtml` and they agree
 * by construction. `toEditableHtml` is the same conversion for the editor,
 * which means a lesson opened and saved is stored in the format it was being
 * displayed in — the editor no longer saves something other than what it
 * shows.
 *
 * On sanitising: the server already sanitises `body_content` on the way in
 * (`server/src/lib/sanitizeContent.js`), so nothing unsafe should be in the
 * database to begin with. This pass is the second line, and it is what makes
 * the Markdown path safe too — Markdown can carry raw HTML, and that HTML has
 * never been through the server's sanitiser when it arrives inline.
 */

/** Tags that may survive. Deliberately the server's allow-list, narrowed. */
const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "strong", "b", "em", "i", "u", "s",
  "blockquote", "code", "pre",
  "a", "img", "iframe",
  "table", "thead", "tbody", "tr", "th", "td",
  "span", "div",
]);

/** Attributes kept per tag. Everything else — `onclick` included — is dropped. */
const ALLOWED_ATTRS = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height", "loading"]),
  iframe: new Set([
    "src", "width", "height", "title", "allow", "allowfullscreen", "frameborder",
  ]),
};

/** Allowed on anything, so the editor keeps its own classes. */
const GLOBAL_ATTRS = new Set(["class"]);

/** Only YouTube's no-cookie host may be framed, as on the server. */
const ALLOWED_IFRAME_HOSTS = new Set([
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

const ENTITIES = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Undoes the escaping the server applies to stored text.
 *
 * `sanitize-html` runs over every lesson body on the way in, and it escapes
 * bare angle brackets in text — right for HTML, wrong for Markdown, where
 * `> ` at the start of a line is a blockquote and arrives here as `&gt; `.
 * Without this it renders as the literal characters "&gt;", because the
 * Markdown pass escapes the ampersand again on the way out.
 *
 * `&amp;` is decoded last, so `&amp;lt;` — an ampersand that was itself
 * escaped — comes back as the text `&lt;` and not as a tag delimiter.
 */
function decodeEntities(text) {
  return String(text)
    .replace(/&(?:lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m])
    .replace(/&amp;/g, "&");
}

/** Escapes text for insertion into HTML. */
function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/**
 * The video id in any YouTube URL, or null.
 *
 * Instructors paste whatever the address bar gave them, so `watch?v=`,
 * `youtu.be/`, `/embed/` and `/shorts/` are all accepted, with or without a
 * timestamp or playlist hanging off the end.
 */
export function youtubeId(url) {
  if (!url) return null;
  const match = String(url).match(
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/
  );
  return match ? match[1] : null;
}

/** The embed URL for a video id: no-cookie, so nothing is set before play. */
export function youtubeEmbedUrl(idOrUrl) {
  const id = /^[\w-]{6,20}$/.test(String(idOrUrl ?? ""))
    ? String(idOrUrl)
    : youtubeId(idOrUrl);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** The markup a YouTube embed renders as, in the editor and on the page. */
export function youtubeEmbedHtml(idOrUrl) {
  const src = youtubeEmbedUrl(idOrUrl);
  if (!src) return "";
  return `<div class="lesson-embed"><iframe src="${escapeHtml(
    src
  )}" title="Lesson video" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
}

/** Is this URL safe to link to or load? */
function isSafeUrl(value, { allowData = false } = {}) {
  const url = String(value ?? "").trim();
  if (url === "") return false;
  // Relative URLs and fragments are fine; they cannot carry a scheme.
  if (/^[#/]/.test(url) && !url.startsWith("//")) return true;
  if (allowData && /^data:image\/(png|jpe?g|gif|webp|avif);base64,/i.test(url)) {
    return true;
  }
  return /^(https?:|mailto:)/i.test(url);
}

// ── Markdown ────────────────────────────────────────────────────────────────

/**
 * Does this look like HTML rather than Markdown?
 *
 * A block-level tag is the signal. Markdown may contain the odd inline
 * `<em>`, and a lesson written as HTML by the editor always opens a block of
 * some kind, because `contentEditable` wraps lines in `<div>` or `<p>`.
 */
export function isLikelyHtml(content) {
  const text = String(content ?? "");
  if (text.trim() === "") return false;
  return /<(p|div|h[1-6]|ul|ol|li|pre|blockquote|table|img|iframe|br)\b[^>]*>/i.test(
    text
  );
}

/** Bold, italic, inline code, links, images — inside one line of text. */
function renderInline(text) {
  let out = escapeHtml(text);

  // Code spans first: their contents must not be read as emphasis.
  const codeSpans = [];
  out = out.replace(/`([^`]+)`/g, (_m, code) => {
    codeSpans.push(code);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  // Images before links: the syntax differs only by the leading "!".
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, alt, src) =>
    isSafeUrl(src, { allowData: true })
      ? `<img src="${src}" alt="${alt}" loading="lazy" />`
      : m
  );

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (m, label, href) =>
    isSafeUrl(href)
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : m
  );

  out = out
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    // A single `*` or `_` pair, but not one inside a word — `snake_case_name`
    // is a variable name, not emphasis.
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>");

  out = out.replace(
    /\u0000CODE(\d+)\u0000/g,
    (_m, i) => `<code>${codeSpans[Number(i)]}</code>`
  );

  return out;
}

/**
 * Markdown to HTML: the subset lessons are written in.
 *
 * Headings, bold and italic, ordered and unordered lists, links, images,
 * fenced and indented code, blockquotes, rules, and a bare YouTube URL on a
 * line of its own — which becomes a player, because that is what an
 * instructor pasting one means by it.
 *
 * A line-based pass, not a full CommonMark implementation. It covers what the
 * toolbar can produce and what the seeded lessons use; anything else degrades
 * to a paragraph of its own text rather than disappearing.
 */
export function markdownToHtml(markdown) {
  const lines = decodeEntities(String(markdown ?? ""))
    .replace(/\r\n?/g, "\n")
    .split("\n");
  const out = [];
  let paragraph = [];
  let list = null; // "ul" | "ol"
  let quote = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!list) return;
    out.push(`</${list}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    out.push(`<blockquote>${renderInline(quote.join(" "))}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    closeList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Fenced code: everything to the closing fence is literal.
    const fence = line.match(/^\s*(```|~~~)\s*([\w-]*)\s*$/);
    if (fence) {
      flushAll();
      const marker = fence[1];
      const language = fence[2];
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith(marker)) {
        body.push(lines[i]);
        i += 1;
      }
      const className = language ? ` class="language-${escapeHtml(language)}"` : "";
      out.push(`<pre><code${className}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    if (line.trim() === "") {
      flushAll();
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      continue;
    }

    if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) {
      flushAll();
      out.push("<hr />");
      continue;
    }

    const blockquote = line.match(/^\s{0,3}>\s?(.*)$/);
    if (blockquote) {
      flushParagraph();
      closeList();
      quote.push(blockquote[1]);
      continue;
    }

    const bullet = line.match(/^\s{0,3}[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s{0,3}\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      flushQuote();
      const wanted = bullet ? "ul" : "ol";
      if (list !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        list = wanted;
      }
      out.push(`<li>${renderInline((bullet ?? numbered)[1])}</li>`);
      continue;
    }

    // A video URL alone on a line is a video, not a link.
    if (/^\s*https?:\/\/\S+\s*$/.test(line) && youtubeId(line.trim())) {
      flushAll();
      out.push(youtubeEmbedHtml(line.trim()));
      continue;
    }

    closeList();
    flushQuote();
    paragraph.push(line.trim());
  }

  flushAll();
  return out.join("\n");
}

// ── Sanitising ──────────────────────────────────────────────────────────────

/**
 * Strips everything not on the allow-list.
 *
 * A tag walk over the string rather than a DOM parse: this runs during server
 * rendering as well as in the browser, and `DOMParser` does not exist in Node.
 * Unknown tags are removed and their text kept, except for `script`, `style`
 * and friends, whose contents go with them.
 */
export function sanitizeLessonHtml(html) {
  const text = String(html ?? "");
  if (text === "") return "";

  // Comments, and the whole of the tags whose contents are never text.
  let out = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|noscript|textarea|template|object|embed)\b[\s\S]*?<\/\1\s*>/gi,
      ""
    )
    // An unclosed one of those would otherwise leave its opening tag behind.
    .replace(/<\/?(script|style|noscript|textarea|template|object|embed)\b[^>]*>/gi, "");

  /**
   * Frames that are not YouTube embeds go whole, opening tag and closing tag
   * together. Dropping only the opening tag would leave a stray `</iframe>`
   * in the output — harmless to a browser, but it means the sanitiser's
   * result is not well-formed, and that is the kind of detail a later change
   * trips over.
   */
  out = out.replace(
    /<iframe\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/iframe\s*>/gi,
    (match, rawAttrs) => {
      const src = rawAttrs.match(/\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i);
      const value = src ? src[1].replace(/^["']|["']$/g, "") : "";
      return youtubeEmbedUrl(value) ? match : "";
    }
  );

  out = out.replace(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g,
    (match, slash, rawName, rawAttrs) => {
      const tag = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      if (slash) return `</${tag}>`;

      const allowed = ALLOWED_ATTRS[tag];
      const kept = [];
      const attrPattern = /([a-zA-Z][\w:-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
      let attr;
      while ((attr = attrPattern.exec(rawAttrs)) !== null) {
        const name = attr[1].toLowerCase();
        if (!GLOBAL_ATTRS.has(name) && !allowed?.has(name)) continue;

        const raw = attr[2] ?? "";
        const value = raw.replace(/^["']|["']$/g, "");

        if (name === "href" && !isSafeUrl(value)) continue;
        if (name === "src") {
          // An image whose source was rejected is dropped outright: keeping
          // the element with no `src` leaves a broken-image icon in the
          // middle of a lesson, which reads as the lesson being broken.
          if (tag === "img" && !isSafeUrl(value, { allowData: true })) return "";
          if (tag === "iframe") {
            // Only a no-cookie YouTube embed may be framed. Anything else —
            // including a plain youtube.com embed, which the editor used to
            // insert and the server then stripped on save — is rewritten to
            // the allowed host where that is possible, and dropped if not.
            const safe = youtubeEmbedUrl(value);
            if (!safe) return "";
            try {
              const host = new URL(safe).hostname;
              if (!ALLOWED_IFRAME_HOSTS.has(host)) return "";
            } catch {
              return "";
            }
            kept.push(`src="${escapeHtml(safe)}"`);
            continue;
          }
        }

        kept.push(
          raw === "" ? name : `${name}="${escapeHtml(value)}"`
        );
      }

      const attrs = kept.length > 0 ? ` ${kept.join(" ")}` : "";
      return VOID_TAGS.has(tag) ? `<${tag}${attrs} />` : `<${tag}${attrs}>`;
    }
  );

  return out;
}

// ── The two entry points ────────────────────────────────────────────────────

/**
 * Lesson content as HTML ready to render, whichever format it was stored in.
 *
 * Every screen that displays a lesson body calls this, which is the whole
 * point: the student page, the editor's preview and split panes, and the
 * preview modal cannot drift apart if they share one function.
 */
export function toRenderableHtml(content) {
  const text = String(content ?? "");
  if (text.trim() === "") return "";
  return sanitizeLessonHtml(isLikelyHtml(text) ? text : markdownToHtml(text));
}

/**
 * Lesson content as HTML for the editor to load into its editable area.
 *
 * The same conversion, which is what makes the editor save the format it
 * displays: a Markdown lesson is converted once, on open, and the next save
 * stores the HTML that was actually on screen. Without this the editor showed
 * one thing, the student page showed another, and saving kept the mismatch.
 */
export function toEditableHtml(content) {
  return toRenderableHtml(content);
}
