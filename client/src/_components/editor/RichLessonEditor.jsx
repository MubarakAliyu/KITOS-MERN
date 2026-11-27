"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LessonContent from "@/_components/content/LessonContent";
import {
  toEditableHtml,
  youtubeEmbedHtml,
} from "@/_lib/content/lessonContent";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  Video as Youtube,
} from "lucide-react";

const MODES = [
  { label: "Edit", value: "edit" },
  { label: "Preview", value: "preview" },
  { label: "Split", value: "split" },
];

// contentEditable-based rich editor. We keep this lightweight on purpose:
// pulling in @uiw/react-md-editor (or any other heavyweight WYSIWYG) drags
// in CodeMirror + remark + rehype + tons of CSS. For LMS lessons the kids
// are authoring, this minimal toolbar covers the realistic verbs (bold,
// italic, headings, lists, code, YouTube embed, link, image-paste).
export default function RichLessonEditor({
  value,
  onChange,
  placeholder = "Start writing lesson content...",
  externalMode,
  onModeChange,
}) {
  const [mode, setMode] = useState(externalMode ?? "edit");
  const editorRef = useRef(null);

  // Keep mode in sync when a parent (e.g. EditLessonModal) drives it via
  // its own header tabs.
  useEffect(() => {
    if (externalMode && externalMode !== mode) setMode(externalMode);
  }, [externalMode]);

  function setModeAndNotify(next) {
    setMode(next);
    onModeChange?.(next);
  }

  // Hydrate the contentEditable div on initial mount + whenever a
  // controlled-from-outside value changes while we're not the active
  // editor (e.g. parent reset). We don't re-write the innerHTML on
  // every keystroke — that would move the caret to position 0.
  /**
   * Load the stored content into the editable area, once.
   *
   * Through `toEditableHtml`, which converts Markdown to HTML. Lessons are
   * stored in both formats — the seeded ones are Markdown, the editor writes
   * HTML — and dropping Markdown into a `contentEditable` as `innerHTML`
   * displays its source, hash marks and asterisks included. Converting on
   * open also means the next save stores HTML: the editor saves the format it
   * displays, instead of handing back the Markdown it never rendered.
   *
   * Not re-run on every keystroke: rewriting `innerHTML` under the caret
   * would send it back to position 0.
   */
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = toEditableHtml(value ?? "");
    if (el.innerHTML !== html) {
      el.innerHTML = html;
      // Tell the parent what is now in the box. Without this, opening a
      // Markdown lesson and pressing Save with no other change would store
      // the Markdown again, and the conversion would be undone.
      if (html !== (value ?? "")) onChange?.(html);
    }
    // Only meant to fire when the controlled value diverges from a
    // non-editor source (initial load / external reset). Local typing
    // already drives `value` via onInput.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === "" ? "" : null]);

  const exec = useCallback((command, arg = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    onChange?.(editorRef.current.innerHTML);
  }, [onChange]);

  function handlePaste(e) {
    // Image paste from clipboard → embed as data URL so we can preview
    // without an upload backend.
    const items = e.clipboardData?.items ?? [];
    for (const item of items) {
      if (item.type?.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const html = `<img src="${ev.target.result}" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" alt="Pasted image"/>`;
          document.execCommand("insertHTML", false, html);
          handleInput();
        };
        reader.readAsDataURL(file);
        return;
      }
    }

    // Strip <script>/<style> from pasted HTML before inserting.
    const html = e.clipboardData?.getData("text/html");
    const text = e.clipboardData?.getData("text/plain");
    e.preventDefault();
    if (html) {
      const div = document.createElement("div");
      // Strip HTML comments first — pasting from Word/Chrome injects CF_HTML
      // `<!--StartFragment-->` / `<!--EndFragment-->` markers that otherwise
      // get stored and leak into plain-text renders.
      div.innerHTML = html.replace(/<!--[\s\S]*?-->/g, "");
      div.querySelectorAll("script,style").forEach((n) => n.remove());
      document.execCommand("insertHTML", false, div.innerHTML);
    } else if (text) {
      document.execCommand("insertText", false, text);
    }
    handleInput();
  }

  /**
   * A YouTube embed the sanitiser will keep.
   *
   * It used to insert a `youtube.com/embed/...` iframe with inline styles.
   * The server allows frames only from `youtube-nocookie.com` and strips
   * `style`, so the embed was deleted outright on save: the instructor saw a
   * video in the editor and the students got nothing. `youtubeEmbedHtml`
   * emits the no-cookie URL and the class the shared renderer styles.
   */
  function insertYouTube() {
    const url = window.prompt("Enter YouTube URL or video ID:");
    if (!url) return;
    const html = youtubeEmbedHtml(url.trim());
    if (!html) {
      window.alert("That does not look like a YouTube link or video id.");
      return;
    }
    editorRef.current?.focus();
    // A paragraph after it, so there is somewhere to carry on typing.
    document.execCommand("insertHTML", false, `${html}<p><br></p>`);
    handleInput();
  }

  /**
   * A code block, styled by class rather than by inline style.
   *
   * The server's sanitiser allows `class` and strips `style` (it has to:
   * inline styles are an injection surface). So every inline style this
   * toolbar used to emit was thrown away on save, and a lesson came back
   * looking different from the one that was written. The classes here are
   * the ones `LessonContent` styles, which is also what the preview uses.
   */
  function insertCodeBlock() {
    editorRef.current?.focus();
    document.execCommand(
      "insertHTML",
      false,
      "<pre><code>// Your code here</code></pre><p><br></p>"
    );
    handleInput();
  }

  function insertLink() {
    const url = window.prompt("Enter URL:");
    if (url) exec("createLink", url);
  }

  const buttons = [
    { icon: Bold, action: () => exec("bold"), title: "Bold" },
    { icon: Italic, action: () => exec("italic"), title: "Italic" },
    { divider: true },
    {
      icon: Heading1,
      action: () => exec("formatBlock", "h2"),
      title: "Heading 1",
    },
    {
      icon: Heading2,
      action: () => exec("formatBlock", "h3"),
      title: "Heading 2",
    },
    { divider: true },
    {
      icon: List,
      action: () => exec("insertUnorderedList"),
      title: "Bullet list",
    },
    { icon: Code, action: insertCodeBlock, title: "Code block" },
    { divider: true },
    {
      icon: Youtube,
      action: insertYouTube,
      title: "Embed YouTube",
      className: "text-red-500",
    },
    { icon: LinkIcon, action: insertLink, title: "Insert link" },
  ];

  const charCount = (value ?? "").replace(/<[^>]*>/g, "").length;

  return (
    /*
        `shrink-0` is what makes the writing area the size it says it is.
        This sits in a scrolling flex column, where a flex item shrinks below
        its content by default. The box therefore collapsed to whatever space
        was left over — about 50px on a phone — and, being `overflow-hidden`,
        clipped the editor inside it to a strip barely one line tall. No
        `min-height` on the inner element could win that argument: the
        clipping happens here.
      */
      <div className="shrink-0 overflow-hidden rounded-xl border border-[var(--border-color)]">
      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] p-2">
        <div className="mr-2 flex overflow-hidden rounded-lg border border-[var(--border-color)]">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setModeAndNotify(m.value)}
              className={`px-3 py-1 text-xs font-mono-ui transition-colors ${
                mode === m.value
                  ? "bg-[#10B981] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {buttons.map((b, i) =>
          b.divider ? (
            <div
              key={`d-${i}`}
              aria-hidden="true"
              className="mx-1 h-6 w-px bg-[var(--border-color)]"
            />
          ) : (
            <button
              key={b.title}
              type="button"
              title={b.title}
              /*
                Keep the caret where it is.
                `mousedown` on a button moves focus out of the editable area
                and collapses the selection, so by the time `click` runs
                `document.execCommand` has nothing to format. Selecting a
                word and pressing B did nothing at all; so did putting the
                caret in a line and pressing H1. Preventing the default on
                mousedown stops focus leaving, which is the whole of the fix.
              */
              onMouseDown={(e) => e.preventDefault()}
              onClick={b.action}
              className={`rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] ${
                b.className ?? ""
              }`}
            >
              <b.icon className="h-4 w-4" />
            </button>
          )
        )}
      </div>

      <div
        /*
          Split stacks on a phone. Side by side at 427px gives two ~190px
          columns, which is not a split view of anything — it is two columns
          too narrow to read. The divider follows the direction.
        */
        className={`flex flex-col sm:flex-row ${
          mode === "split"
            ? "divide-y divide-[var(--border-color)] sm:divide-x sm:divide-y-0"
            : ""
        }`}
      >
        {mode !== "preview" && (
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onPaste={handlePaste}
            data-placeholder={placeholder}
            className="prose-style flex-1 min-h-[45vh] max-h-[60vh] sm:min-h-48 overflow-y-auto p-4 text-sm leading-relaxed text-[var(--text-primary)] outline-none empty:before:pointer-events-none empty:before:text-[var(--text-muted)] empty:before:content-[attr(data-placeholder)] [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:rounded-lg [&_pre]:bg-[#1a2234] [&_pre]:p-3 [&_pre]:text-sm [&_img]:max-w-full [&_img]:rounded-lg"
          />
        )}

        {mode !== "edit" && (
          <div className="flex-1 min-h-[45vh] max-h-[60vh] overflow-y-auto bg-[var(--bg-secondary)] p-4 sm:min-h-48">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
              Student Preview
            </p>
            <PreviewPane html={value ?? ""} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2 text-xs text-[var(--text-muted)] font-mono-ui">
        <span>
          Tip: paste images directly. Use the toolbar for YouTube embeds.
        </span>
        <span>{charCount} chars</span>
      </div>
    </div>
  );
}

/**
 * Kept as a named export because three screens already import it.
 *
 * It is now a thin wrapper over the shared renderer rather than a raw
 * `dangerouslySetInnerHTML` with its own styles — which is what made the
 * editor's preview and the student's page disagree about the same lesson.
 */
export function PreviewPane({ html }) {
  return <LessonContent content={html} />;
}
