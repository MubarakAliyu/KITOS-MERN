"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { ArrowUp, FileText, Loader2, Paperclip, X } from "lucide-react";

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export function MessageInput({ onSend, disabled, onTyping }) {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  function handleFileSelect(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      toast.error("File must be under 1MB");
      e.target.value = "";
      return;
    }
    const isImage = f.type.startsWith("image/");
    setFile(f);
    if (isImage) {
      const url = URL.createObjectURL(f);
      setFilePreview({ kind: "image", url, name: f.name });
    } else {
      setFilePreview({ kind: "pdf", url: null, name: f.name });
    }
    e.target.value = "";
  }

  function clearFile() {
    if (filePreview?.url) URL.revokeObjectURL(filePreview.url);
    setFile(null);
    setFilePreview(null);
  }

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed && !file) return;
    if (disabled || uploading) return;

    let fileUrl = null;
    let fileType = null;

    if (file) {
      // Upload is stubbed: we hold the object URL so MessageBubble can
      // preview it locally. The real upload service swaps in here.
      setUploading(true);
      await new Promise((r) => setTimeout(r, 500));
      fileUrl = filePreview?.url ?? URL.createObjectURL(file);
      fileType = file.type.startsWith("image/") ? "image" : "pdf";
      setUploading(false);
    }

    onSend({ text: trimmed, fileUrl, fileType });

    setText("");
    setFile(null);
    setFilePreview(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleChange(e) {
    setText(e.target.value);
    onTyping?.();

    // Auto-resize, capped at 4 rows so the message area still gets space.
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      const next = Math.min(ta.scrollHeight, 24 * 4 + 24);
      ta.style.height = `${next}px`;
    }
  }

  const canSend = (text.trim().length > 0 || !!file) && !disabled && !uploading;

  return (
    <div className="border-t border-[var(--border-color)] bg-[var(--bg-primary)] p-4">
      <AnimatePresence>
        {filePreview && (
          <motion.div
            key="file-preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3"
          >
            {filePreview.kind === "image" ? (
              <img
                src={filePreview.url}
                alt="Preview"
                className="h-12 w-12 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-red-500/15 text-red-500">
                <FileText className="h-5 w-5" />
              </div>
            )}
            <span className="flex-1 truncate text-sm text-[var(--text-primary)]">
              {filePreview.name}
            </span>
            <button
              type="button"
              onClick={clearFile}
              aria-label="Remove file"
              className="grid h-7 w-7 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-end gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach file"
          disabled={disabled || uploading}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[#10B981] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Paperclip className="h-4 w-4" />
        </button>

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          className="flex-1 resize-none rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <motion.button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          whileTap={canSend ? { scale: 0.92 } : undefined}
          aria-label="Send message"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#10B981] text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </motion.button>
      </div>
    </div>
  );
}
