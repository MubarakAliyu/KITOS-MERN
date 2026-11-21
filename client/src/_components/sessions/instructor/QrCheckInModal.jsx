"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { getSessionQrToken } from "@/_lib/api/sessions";
import ModalShell from "./ModalShell";

/**
 * The QR code an instructor projects so pupils can check themselves in.
 *
 * The token lasts 60 seconds, which is the actual security control: a
 * photograph of the screen is useless a minute later, so a pupil cannot send
 * the code to a friend at home. That means this has to refresh itself — and
 * show how long is left, or an instructor will not know whether the code on
 * screen still works.
 *
 * The code is also printed underneath, because a pupil whose camera will not
 * focus (or whose browser has no BarcodeDetector) can type it instead.
 */
export default function QrCheckInModal({ isOpen, onClose, session }) {
  const [token, setToken] = useState(null);
  const [dataUrl, setDataUrl] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Guards against a slow request resolving after the modal has closed.
  const activeRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!session?.id) return;
    setLoading(true);
    setError(null);

    try {
      const result = await getSessionQrToken(session.id);
      if (!activeRef.current) return;

      setToken(result.token);
      setSecondsLeft(result.expires_in ?? 60);

      const png = await QRCode.toDataURL(result.token, {
        width: 320,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0B1220", light: "#FFFFFF" },
      });
      if (!activeRef.current) return;
      setDataUrl(png);
    } catch (err) {
      if (!activeRef.current) return;
      setError(
        err.response?.data?.error ?? "Could not create a check-in code."
      );
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [session?.id]);

  // Fetch on open, and clear on close so a stale code is never shown.
  useEffect(() => {
    if (!isOpen) {
      activeRef.current = false;
      setToken(null);
      setDataUrl(null);
      setSecondsLeft(0);
      return;
    }

    activeRef.current = true;
    refresh();

    return () => {
      activeRef.current = false;
    };
  }, [isOpen, refresh]);

  // Count down, then fetch a fresh one. Projecting a dead code would have
  // pupils scanning something that simply fails.
  useEffect(() => {
    if (!isOpen || secondsLeft <= 0) return;

    const timer = setTimeout(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          refresh();
          return 0;
        }
        return value - 1;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOpen, secondsLeft, refresh]);

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Check-in code"
      maxWidth="max-w-sm"
    >
      <div className="flex flex-col items-center gap-4 p-5">
        <p className="text-center text-sm text-[var(--text-secondary)]">
          Show this to the class. It changes every minute.
        </p>

        <div className="grid h-[280px] w-[280px] place-items-center rounded-2xl border border-[var(--border-color)] bg-white p-3">
          {error ? (
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <QrCode className="h-8 w-8 text-[#9CA3AF]" />
              <p className="text-sm text-[#DC2626]">{error}</p>
            </div>
          ) : dataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={dataUrl}
              alt="Check-in QR code"
              className="h-full w-full object-contain"
            />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin text-[#10B981]" />
          )}
        </div>

        {token && !error && (
          <div className="flex w-full flex-col items-center gap-1">
            <span className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
              Expires in {secondsLeft}s
            </span>
            <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-secondary)]">
              <div
                className="h-full rounded-full bg-[#10B981] transition-[width] duration-1000 ease-linear"
                style={{ width: `${Math.max(0, (secondsLeft / 60) * 100)}%` }}
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[#10B981] hover:text-[#10B981] disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          New code
        </button>

        {token && !error && (
          <details className="w-full">
            <summary className="cursor-pointer text-center text-xs text-[var(--text-secondary)]">
              Can&rsquo;t scan? Show the code to type
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <code className="block max-h-24 overflow-y-auto break-all rounded-lg bg-[var(--bg-secondary)] p-3 font-mono-ui text-[10px] leading-relaxed text-[var(--text-secondary)]">
                {token}
              </code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(token);
                    toast.success("Code copied");
                  } catch {
                    toast.error("Could not copy — read it out instead");
                  }
                }}
                className="self-center text-xs font-semibold text-[#10B981] hover:text-[#059669]"
              >
                Copy code
              </button>
            </div>
          </details>
        )}
      </div>
    </ModalShell>
  );
}
