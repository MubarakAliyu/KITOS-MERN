import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUTBOX_DIR } from "./paths.js";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Outbound email.
 *
 * With SMTP configured, mail goes out over SMTP. Without it — the normal
 * development case, and NFR6's "runs locally with no external accounts" — each
 * message is written to `server/.local/outbox/*.eml` and a line is logged, so
 * a password-reset link can be read off disk without a mail account.
 */

let transporter;

function smtpConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT);
}

function getTransporter() {
  if (!smtpConfigured()) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: env.SMTP_PORT === 465,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
  return transporter;
}

/** A filename-safe stamp, unique enough for one process writing an outbox. */
function outboxName(to, subject) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = `${to}-${subject}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${stamp}-${slug}.eml`;
}

/**
 * Sends one message, or files it in the outbox when SMTP is unset.
 * Never throws: a failed notification must not fail the request that caused
 * it (a parent's child is still created if the welcome mail bounces).
 *
 * @param {{ to: string, subject: string, text: string, html?: string }} message
 * @returns {Promise<{ delivered: boolean, transport: "smtp"|"outbox", path?: string }>}
 */
export async function sendMail({ to, subject, text, html }) {
  const from = env.MAIL_FROM;

  try {
    const smtp = getTransporter();

    if (smtp) {
      await smtp.sendMail({ from, to, subject, text, html });
      logger.info({ to, subject }, "Email sent over SMTP");
      return { delivered: true, transport: "smtp" };
    }

    await mkdir(OUTBOX_DIR, { recursive: true });
    const file = path.join(OUTBOX_DIR, outboxName(to, subject));
    const body =
      [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        text,
      ].join("\r\n") + "\r\n";
    await writeFile(file, body, "utf8");

    logger.info(
      { to, subject, file },
      "SMTP is not configured — email written to the local outbox"
    );
    return { delivered: true, transport: "outbox", path: file };
  } catch (err) {
    logger.error({ err, to, subject }, "Email delivery failed");
    return { delivered: false, transport: smtpConfigured() ? "smtp" : "outbox" };
  }
}

/** Password reset (PRD §11.3). The link lands on the client, not the API. */
export function passwordResetEmail({ name, token }) {
  const url = `${env.CLIENT_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    subject: "Reset your Kids In Tech password",
    text: [
      `Hello ${name || "there"},`,
      "",
      "Someone asked to reset the password for your Kids In Tech account.",
      "Open the link below to choose a new one. It works once and expires in 30 minutes.",
      "",
      url,
      "",
      "If this was not you, you can ignore this email — nothing has changed.",
      "",
      "Kids In Tech",
    ].join("\n"),
  };
}

/**
 * Sent to the parent when a child's login is provisioned. Carries the
 * admission number and the one-time password the child must change on first
 * sign-in.
 */
export function childAccountEmail({ parentName, childName, admissionNo, tempPassword }) {
  return {
    subject: `Login details for ${childName}`,
    text: [
      `Hello ${parentName || "there"},`,
      "",
      `${childName}'s Kids In Tech account is ready.`,
      "",
      `Admission number: ${admissionNo}`,
      `Temporary password: ${tempPassword}`,
      "",
      "They will be asked to choose their own password the first time they sign in.",
      "Please keep these details safe and share them only with your child.",
      "",
      `Sign in at ${env.CLIENT_ORIGIN}/login`,
      "",
      "Kids In Tech",
    ].join("\n"),
  };
}
