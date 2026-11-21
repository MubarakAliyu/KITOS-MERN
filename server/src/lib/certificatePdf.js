import PDFDocument from "pdfkit";
import path from "node:path";
import { existsSync } from "node:fs";
import { env } from "../config/env.js";
import { REPO_ROOT } from "./paths.js";

/**
 * Renders a certificate PDF (FR11).
 *
 * Landscape A4, matching the on-screen certificate the client already draws
 * with @react-pdf so a printed certificate and a previewed one look like the
 * same document. Built with pdfkit's primitives and the standard fonts: no
 * font files to ship, and identical output on every platform.
 *
 * The KIT logo and the StarNova Labs wordmark are read from the client's
 * built brand assets, which `npm run brand` produces. If they are missing the
 * certificate still renders, with the names set in type — a missing image
 * should not stop a child receiving their certificate.
 */

const BRAND_DIR = path.join(REPO_ROOT, "client", "public", "brand");

const TEAL = "#10B981";
const NAVY = "#0B1220";
const MUTED = "#6B7280";
const LIGHT = "#9CA3AF";

function brandAsset(name) {
  const file = path.join(BRAND_DIR, name);
  return existsSync(file) ? file : null;
}

/**
 * @param {object} certificate A Certificate document (or plain object).
 * @returns {Promise<Buffer>}
 */
export function renderCertificatePdf(certificate) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 0,
      info: {
        Title: `Kids In Tech certificate — ${certificate.course_title}`,
        Author: "Kids In Tech · StarNova Labs",
        Subject: `Certificate of completion for ${certificate.student_name}`,
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width;
    const height = doc.page.height;

    // ── Top band ────────────────────────────────────────────────────────
    const bandHeight = 64;
    doc.rect(0, 0, width, bandHeight).fill(TEAL);

    const logo = brandAsset("kit-logo.png");
    if (logo) {
      // Fit inside the band with a little breathing room.
      doc.image(logo, 36, 12, { height: bandHeight - 24 });
    } else {
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(18)
        .text("Kids In Tech", 36, bandHeight / 2 - 9);
    }

    doc
      .fillColor("#FFFFFF")
      .font("Helvetica")
      .fontSize(10)
      .text("CERTIFICATE OF COMPLETION", width - 300, bandHeight / 2 - 5, {
        width: 264,
        align: "right",
        characterSpacing: 3,
      });

    // ── Body ────────────────────────────────────────────────────────────
    let y = 130;

    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(10)
      .text("THIS IS TO CERTIFY THAT", 0, y, {
        width,
        align: "center",
        characterSpacing: 2,
      });

    y += 34;
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(38)
      .text(certificate.student_name, 0, y, { width, align: "center" });

    y += 54;
    doc
      .moveTo(width / 2 - 100, y)
      .lineTo(width / 2 + 100, y)
      .lineWidth(2)
      .stroke(TEAL);

    y += 22;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(12)
      .text("has successfully completed", 0, y, { width, align: "center" });

    y += 24;
    doc
      .fillColor(TEAL)
      .font("Helvetica-Bold")
      .fontSize(24)
      .text(certificate.course_title, 0, y, { width, align: "center" });

    if (certificate.score_average != null) {
      y += 34;
      doc
        .fillColor(NAVY)
        .font("Helvetica")
        .fontSize(13)
        .text(`with an average score of ${certificate.score_average}%`, 0, y, {
          width,
          align: "center",
        });
    }

    // ── Details ─────────────────────────────────────────────────────────
    const detailY = height - 190;
    const issued = new Date(certificate.issued_at ?? Date.now());
    const issuedLabel = issued.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Africa/Lagos",
    });

    const columns = [
      ["COMPLETION DATE", issuedLabel],
      ["ISSUED BY", "StarNova Labs"],
      ["CERTIFICATE SERIAL", certificate.serial],
    ];

    const columnWidth = (width - 120) / columns.length;
    columns.forEach(([label, value], index) => {
      const x = 60 + index * columnWidth;
      doc
        .fillColor(LIGHT)
        .font("Helvetica")
        .fontSize(8)
        .text(label, x, detailY, {
          width: columnWidth,
          align: "center",
          characterSpacing: 1.5,
        });
      doc
        .fillColor(NAVY)
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(value, x, detailY + 14, { width: columnWidth, align: "center" });
    });

    // ── Signature ───────────────────────────────────────────────────────
    const signY = height - 118;
    doc
      .moveTo(width - 260, signY)
      .lineTo(width - 60, signY)
      .lineWidth(1)
      .stroke(NAVY);
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text("Authorised Signature", width - 260, signY + 6, {
        width: 200,
        align: "right",
      });
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(certificate.instructor_name ?? "Course Instructor", width - 260, signY + 18, {
        width: 200,
        align: "right",
      });

    // ── Verification ────────────────────────────────────────────────────
    // The whole point of the code: anyone can check this is genuine.
    const verifyUrl = `${env.CLIENT_ORIGIN}/verify/${certificate.verification_code}`;
    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(8)
      .text("VERIFY THIS CERTIFICATE AT", 60, signY + 2, {
        width: 280,
        characterSpacing: 1.2,
      });
    doc
      .fillColor(TEAL)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(verifyUrl, 60, signY + 16, { width: 320, link: verifyUrl });
    doc
      .fillColor(NAVY)
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(certificate.verification_code, 60, signY + 30, {
        width: 280,
        characterSpacing: 2,
      });

    // ── Bottom band ─────────────────────────────────────────────────────
    const footerHeight = 46;
    const footerY = height - footerHeight;
    doc.rect(0, footerY, width, footerHeight).fill(NAVY);

    doc
      .fillColor(LIGHT)
      .font("Helvetica")
      .fontSize(8)
      .text(`Certificate ID: ${certificate.id ?? certificate.serial}`, 36, footerY + 12)
      .text("kidsintech.school", 36, footerY + 24);

    // "Powered by StarNova Labs", centred, as on every other surface.
    doc
      .fillColor(LIGHT)
      .font("Helvetica")
      .fontSize(6)
      .text("POWERED BY", 0, footerY + 10, {
        width,
        align: "center",
        characterSpacing: 1.5,
      });

    const starnova = brandAsset("starnova-logo-light.png");
    if (starnova) {
      const markWidth = 86;
      doc.image(starnova, width / 2 - markWidth / 2, footerY + 20, {
        width: markWidth,
      });
    } else {
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("StarNova Labs", 0, footerY + 20, { width, align: "center" });
    }

    doc
      .fillColor(LIGHT)
      .font("Helvetica")
      .fontSize(8)
      .text(certificate.verification_code, width - 236, footerY + 18, {
        width: 200,
        align: "right",
      });

    doc.end();
  });
}
