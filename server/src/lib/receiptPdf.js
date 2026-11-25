import PDFDocument from "pdfkit";
import path from "node:path";
import { existsSync } from "node:fs";
import { REPO_ROOT } from "./paths.js";

/**
 * Renders a payment receipt PDF (FR16).
 *
 * Portrait A4 — a receipt is filed and printed, not hung on a wall like the
 * certificate — and built from pdfkit's primitives with the standard fonts,
 * so there are no font files to ship and the output is identical on every
 * platform.
 *
 * Carries the same two marks as the certificate (FR20): the Kids In Tech
 * logo at the top and "Powered by StarNova Labs" at the foot. If either image
 * is missing the receipt still renders with the names set in type — a missing
 * asset must not stop a family getting proof that they paid.
 */

const BRAND_DIR = path.join(REPO_ROOT, "client", "public", "brand");

const TEAL = "#10B981";
const NAVY = "#0B1220";
const MUTED = "#6B7280";
const LIGHT = "#9CA3AF";
const RULE = "#E5E7EB";

function brandAsset(name) {
  const file = path.join(BRAND_DIR, name);
  return existsSync(file) ? file : null;
}

const naira = (amount) =>
  `NGN ${Number(amount ?? 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * @param {object} receipt The shape `payment.service.getReceipt` returns.
 * @returns {Promise<Buffer>}
 */
export function renderReceiptPdf(receipt) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `Kids In Tech receipt — ${receipt.receipt_number}`,
        Author: "Kids In Tech · StarNova Labs",
        Subject: `Receipt for ${receipt.course_title}`,
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width;
    const left = 56;
    const right = width - 56;

    // ── Header band ───────────────────────────────────────────────────────
    const bandHeight = 92;
    doc.rect(0, 0, width, bandHeight).fill(TEAL);

    // The same asset the certificate puts on its teal band, so the two
    // documents a family receives carry an identical mark.
    const logo = brandAsset("kit-logo.png");
    if (logo) {
      doc.image(logo, left, 26, { height: 40 });
    } else {
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(22)
        .text("Kids In Tech", left, 36);
    }

    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("RECEIPT", left, 34, { width: right - left, align: "right" })
      .font("Helvetica")
      .fontSize(10)
      .text(receipt.receipt_number ?? "—", left, 58, {
        width: right - left,
        align: "right",
      });

    // ── Who and when ──────────────────────────────────────────────────────
    let y = bandHeight + 36;

    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text("RECEIVED FROM", left, y);
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text(receipt.parent_name || "—", left, y + 14);

    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9)
      .text("DATE PAID", left, y, { width: right - left, align: "right" });
    doc
      .fillColor(NAVY)
      .font("Helvetica")
      .fontSize(11)
      .text(formatDate(receipt.paid_at ?? receipt.created_at), left, y + 15, {
        width: right - left,
        align: "right",
      });

    y += 58;
    doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();

    // ── What was bought ───────────────────────────────────────────────────
    y += 22;
    const rows = [
      ["Course", receipt.course_title || "—"],
      ["Pupil", receipt.student_name || "—"],
      ["Admission number", receipt.student_admission_no || "—"],
      [
        "Payment type",
        receipt.type === "subscription" ? "Monthly subscription" : "One-time payment",
      ],
      ["Transaction reference", receipt.paystack_ref || "—"],
    ];

    for (const [label, value] of rows) {
      doc
        .fillColor(MUTED)
        .font("Helvetica")
        .fontSize(10)
        .text(label, left, y, { width: 190 });
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(10)
        .text(String(value), left + 200, y, { width: right - left - 200 });
      y += 24;
    }

    // ── Total ─────────────────────────────────────────────────────────────
    y += 10;
    doc.rect(left, y, right - left, 64).fill("#F0FDF4");
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text("TOTAL PAID", left + 18, y + 16);
    doc
      .fillColor(TEAL)
      .font("Helvetica-Bold")
      .fontSize(22)
      .text(naira(receipt.amount), left + 18, y + 30);

    doc
      .fillColor(TEAL)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("PAID", left, y + 26, { width: right - left - 18, align: "right" });

    y += 92;

    /**
     * Said on the document itself, not only in the dashboard.
     *
     * A receipt is the thing a family keeps and may show to someone else, so
     * if it was settled in Paystack's test mode it has to say so — a receipt
     * that looks like proof of a real payment and is not would be the one
     * genuinely misleading artefact this system could produce.
     */
    if (receipt.confirmed_via === "simulated") {
      doc
        .fillColor("#B45309")
        .font("Helvetica-Bold")
        .fontSize(9)
        .text(
          "DEMONSTRATION PAYMENT — no money changed hands. Issued by a Kids In Tech test environment.",
          left,
          y,
          { width: right - left }
        );
      y += 22;
    }

    doc
      .fillColor(LIGHT)
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        "Kids In Tech is a programme of StarNova Labs, Sokoto and Birnin Kebbi, Nigeria. " +
          "Keep this receipt as proof of payment. Questions: hello@kidsintech.school",
        left,
        y,
        { width: right - left, lineGap: 2 }
      );

    // ── Footer ────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 78;
    doc
      .moveTo(left, footerY)
      .lineTo(right, footerY)
      .strokeColor(RULE)
      .lineWidth(1)
      .stroke();

    doc
      .fillColor(LIGHT)
      .font("Helvetica")
      .fontSize(8)
      .text("POWERED BY", left, footerY + 16);

    // Dark wordmark: this footer is on white, unlike the certificate's.
    const starnova = brandAsset("starnova-logo-dark.png");
    if (starnova) {
      doc.image(starnova, left, footerY + 28, { height: 16 });
    } else {
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("StarNova Labs", left, footerY + 28);
    }

    doc
      .fillColor(LIGHT)
      .font("Helvetica")
      .fontSize(8)
      .text(
        `Receipt ${receipt.receipt_number ?? "—"} · generated ${formatDate(
          new Date().toISOString()
        )}`,
        left,
        footerY + 32,
        { width: right - left, align: "right" }
      );

    doc.end();
  });
}
