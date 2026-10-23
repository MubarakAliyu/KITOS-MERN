"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== (value ?? "")) {
      el.innerHTML = value ?? "";
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

  function insertYouTube() {
    const url = window.prompt("Enter YouTube URL or video ID:");
    if (!url) return;
    const match = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/
    );
    const videoId = match ? match[1] : url.trim();
    if (!videoId) {
      window.alert("Invalid YouTube URL");
      return;
    }
    const embed = `<div class="youtube-embed" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:16px 0;border-radius:8px;"><iframe src="https://www.youtube.com/embed/${videoId}" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>`;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, embed);
    handleInput();
  }

  function insertCodeBlock() {
    const code = `<pre style="background:#1a2234;color:#e5e7eb;padding:16px;border-radius:8px;overflow-x:auto;font-family:monospace;font-size:14px;margin:12px 0;"><code>// Your code here</code></pre>`;
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, code);
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
    <div className="overflow-hidden rounded-xl border border-[var(--border-color)]">
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
        className={`flex ${
          mode === "split" ? "divide-x divide-[var(--border-color)]" : ""
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
            className="prose-style flex-1 min-h-48 max-h-[60vh] overflow-y-auto p-4 text-sm leading-relaxed text-[var(--text-primary)] outline-none empty:before:pointer-events-none empty:before:text-[var(--text-muted)] empty:before:content-[attr(data-placeholder)] [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:rounded-lg [&_pre]:bg-[#1a2234] [&_pre]:p-3 [&_pre]:text-sm [&_img]:max-w-full [&_img]:rounded-lg"
          />
        )}

        {mode !== "edit" && (
          <div className="flex-1 min-h-48 max-h-[60vh] overflow-y-auto bg-[var(--bg-secondary)] p-4">
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

export function PreviewPane({ html }) {
  return (
    <div
      className="prose prose-sm max-w-none text-[var(--text-primary)] [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_code]:rounded [&_code]:bg-[var(--bg-secondary)] [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[#1a2234] [&_pre]:p-4 [&_img]:max-w-full [&_img]:rounded-lg [&_a]:text-[#10B981] [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
