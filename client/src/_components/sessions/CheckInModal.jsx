"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CameraOff, CheckCircle2, Loader2 } from "lucide-react";
import { checkInToSession } from "@/_lib/api/sessions";
import ModalShell from "@/_components/sessions/instructor/ModalShell";

/**
 * A pupil checking themselves in to a live session by scanning the QR code
 * the instructor is showing (FR13).
 *
 * The camera is the nice path, not the only one. `BarcodeDetector` is still
 * missing from Safari and Firefox, a school tablet may refuse camera
 * permission, and a projector at the back of a hall is hard to focus on — so
 * typing the code is a first-class alternative, not a hidden fallback.
 *
 * Nothing is trusted here: the token is verified by the server, which checks
 * it was minted for this session, has not expired, and belongs to a pupil who
 * is actually enrolled.
 */
export default function CheckInModal({ isOpen, onClose, session, onCheckedIn }) {
  const [mode, setMode] = useState("idle"); // idle | scanning | submitting | done
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState(null);
  const [cameraAvailable, setCameraAvailable] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const activeRef = useRef(false);

  const supportsDetector =
    typeof window !== "undefined" && "BarcodeDetector" in window;

  /** Releases the camera. Leaving it on would keep the indicator light lit. */
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const submit = useCallback(
    async (token, method = "qr") => {
      setMode("submitting");
      setError(null);

      try {
        const result = await checkInToSession(session.id, { token, method });
        if (!activeRef.current) return;

        stopCamera();
        setMode("done");
        toast.success(
          result.status === "late" ? "Checked in — a little late" : "You're checked in",
          { description: session.title }
        );
        onCheckedIn?.(result);
      } catch (err) {
        if (!activeRef.current) return;
        setMode("idle");
        // The server's message is the useful one: expired code, wrong
        // session, not enrolled, class not running.
        setError(
          err.response?.data?.error ??
            "That did not work. Ask your instructor for a fresh code."
        );
      }
    },
    [session?.id, session?.title, onCheckedIn, stopCamera]
  );

  /** Opens the camera and watches for a QR code. */
  const startCamera = useCallback(async () => {
    setError(null);

    if (!supportsDetector) {
      setError("This browser cannot scan — type the code instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The back camera on a phone; harmless on a laptop.
        video: { facingMode: "environment" },
      });
      if (!activeRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;
      setCameraAvailable(true);
      setMode("scanning");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

      // Poll rather than requestAnimationFrame: detection is the expensive
      // part, and four looks a second is plenty for a code on a wall.
      const tick = async () => {
        if (!activeRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0 && codes[0].rawValue) {
            await submit(codes[0].rawValue, "qr");
            return;
          }
        } catch {
          // A frame that cannot be decoded is normal; keep looking.
        }
        if (activeRef.current && streamRef.current) {
          setTimeout(tick, 250);
        }
      };
      tick();
    } catch {
      setCameraAvailable(false);
      setError(
        "No camera available. Type the code your instructor is showing."
      );
      setMode("idle");
    }
  }, [supportsDetector, submit]);

  useEffect(() => {
    activeRef.current = isOpen;
    if (!isOpen) {
      stopCamera();
      setMode("idle");
      setManualCode("");
      setError(null);
    }
    return () => {
      activeRef.current = false;
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  function handleManualSubmit(event) {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) {
      setError("Enter the code your instructor is showing.");
      return;
    }
    submit(code, "qr");
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Check in to this class"
      maxWidth="max-w-sm"
    >
      <div className="flex flex-col gap-4 p-5">
        {mode === "done" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-[#10B981]" />
            <p className="text-base font-bold text-[var(--text-primary)]">
              You&rsquo;re checked in
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Your instructor can see you in the register.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-xl bg-[#10B981] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)]">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`h-full w-full object-cover ${
                  mode === "scanning" ? "" : "hidden"
                }`}
              />

              {mode === "scanning" && (
                <>
                  {/* A frame to aim with. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-8 rounded-xl border-2 border-[#10B981]"
                  />
                  <span className="pointer-events-none absolute bottom-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white font-mono-ui">
                    Point at the code
                  </span>
                </>
              )}

              {mode !== "scanning" && (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  {supportsDetector ? (
                    <Camera className="h-10 w-10 text-[var(--text-muted)]" />
                  ) : (
                    <CameraOff className="h-10 w-10 text-[var(--text-muted)]" />
                  )}
                  <p className="text-sm text-[var(--text-secondary)]">
                    {supportsDetector
                      ? "Scan the code your instructor is showing."
                      : "This browser cannot use the camera, so type the code below."}
                  </p>
                  {supportsDetector && (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669]"
                    >
                      Open camera
                    </button>
                  )}
                </div>
              )}

              {mode === "submitting" && (
                <div className="absolute inset-0 grid place-items-center bg-black/50">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-[#DC2626]/10 px-3 py-2 text-center text-xs font-semibold text-[#DC2626]"
              >
                {error}
              </p>
            )}

            <form onSubmit={handleManualSubmit} className="flex flex-col gap-2">
              <label
                htmlFor="checkin-code"
                className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-[var(--text-secondary)]"
              >
                {cameraAvailable ? "Or type the code" : "Type the code"}
              </label>
              <textarea
                id="checkin-code"
                rows={2}
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Paste or type the check-in code"
                className="w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2 font-mono-ui text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[#10B981] focus:outline-none focus:ring-2 focus:ring-[#10B981]/20"
              />
              <button
                type="submit"
                disabled={mode === "submitting"}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#10B981] px-4 py-2.5 text-sm font-semibold text-[#10B981] transition-colors hover:bg-[#10B981]/10 disabled:opacity-60"
              >
                {mode === "submitting" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Check in
              </button>
            </form>
          </>
        )}
      </div>
    </ModalShell>
  );
}
