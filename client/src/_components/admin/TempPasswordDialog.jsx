"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Copy, KeyRound } from "lucide-react";

/**
 * The one place a temporary password is ever shown.
 *
 * It is not a toast. A toast slides away on a timer, can be covered by the
 * next one, and is gone if the tab is busy — and this is the only copy of
 * the password that will ever exist. Nothing stores it: the server keeps a
 * bcrypt hash and hands the plain text back exactly once, in the response
 * that created or reset the account. Lose this and the only way out is
 * another reset.
 *
 * So: a modal that closes on an explicit "Done", the password in large
 * monospace, and a Copy button. No auto-dismiss, no backdrop click, no
 * Escape — the three ways a person loses a dialog without meaning to.
 */
export default function TempPasswordDialog({
  isOpen,
  onClose,
  name,
  identifier,
  password,
  title = "Account created",
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          /* No onClick handler: a stray click outside must not close this. */
          className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
          >
            <header className="flex items-center gap-3 bg-[#10B981] px-5 py-4 text-white">
              <KeyRound className="h-5 w-5 shrink-0" strokeWidth={2.5} />
              <h2 className="text-base font-bold">{title}</h2>
            </header>

            <div className="flex flex-col gap-4 px-5 py-5">
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {name}
                </p>
                {identifier && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)] font-mono-ui">
                    Signs in with {identifier}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] font-mono-ui">
                  Temporary password
                </p>
                <div className="mt-2 flex items-center gap-3">
                  {/*
                    `select-all` so a tap or click takes the whole string:
                    these are deliberately unambiguous characters, but a
                    half-selected password is still a wrong password.
                  */}
                  <code className="flex-1 select-all break-all font-mono-ui text-2xl font-bold tracking-wide text-[#10B981]">
                    {password}
                  </code>
                  <CopyButton key={password} password={password} />
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)]">
                Send this to them directly — it won&apos;t be shown again.
                They must change it at first sign-in.
              </p>
            </div>

            <footer className="flex justify-end border-t border-[var(--border-color)] px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#059669] active:scale-95"
              >
                Done
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Copies the password and says so for a moment.
 *
 * Keyed by the password where it is used, so showing a different one mounts
 * a fresh button. That is why there is no effect resetting `copied` when the
 * dialog opens — remounting does it, and setting state from an effect to
 * undo a previous render is the pattern React now warns about.
 */
function CopyButton({ password }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      // Long enough to be read, short enough that a second copy reads as a
      // second copy rather than the first one still showing.
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be refused — an insecure origin, a permissions
      // policy, an older browser. The password is on screen either way, so
      // this is a convenience failing, not the dialog failing.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copy the temporary password"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[#10B981] px-3 py-2 text-xs font-bold text-[#10B981] transition-colors hover:bg-[#10B981]/10 active:scale-95"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" strokeWidth={2.5} />
          Copy
        </>
      )}
    </button>
  );
}
