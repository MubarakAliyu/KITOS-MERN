"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  CertificateDocument,
  downloadCertificate,
} from "@/_components/certificates/CertificateDocument";

// Lazy-loaded PDFViewer — keeps the heavy @react-pdf/renderer chunk out of
// the initial bundle and only fetches it when a user opens a certificate.
function usePdfViewer() {
  const [PdfViewer, setPdfViewer] = useState(null);

  useEffect(() => {
    let alive = true;
    import("@react-pdf/renderer").then((mod) => {
      if (alive) setPdfViewer(() => mod.PDFViewer);
    });
    return () => {
      alive = false;
    };
  }, []);

  return PdfViewer;
}

export default function CertificateViewer({ cert, onClose }) {
  const PdfViewer = usePdfViewer();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadCertificate(cert);
      toast.success("Certificate downloaded");
    } catch {
      toast.error("Couldn't generate PDF");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col bg-black/80 p-2 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#10B981] font-mono-ui">
              Certificate
            </p>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">
              {cert.course_title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-hidden bg-black/40">
          {PdfViewer ? (
            <PdfViewer
              showToolbar={false}
              style={{ width: "100%", height: "100%", border: "none" }}
            >
              <CertificateDocument cert={cert} />
            </PdfViewer>
          ) : (
            <div className="grid h-full place-items-center text-white/70">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end border-t border-[var(--border-color)] px-5 py-3">
          <motion.button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#059669] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download PDF
          </motion.button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
