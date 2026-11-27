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
    /**
     * Give up rather than hang.
     *
     * Render's free tier blocks outbound SMTP, and a blocked port does not
     * refuse the connection — it drops the packets. With no timeout set,
     * nodemailer waits on the operating system's default, which is minutes.
     * That is what made creating a user look as though it had failed: the
     * account was written, the request then sat waiting on Gmail, and the
     * browser gave up first. The administrator saw "Couldn't create user"
     * about a user who existed, and the one-time password was lost with the
     * response that never arrived.
     *
     * Nothing waits on email any more (`sendMailInBackground`), so these
     * bound a background task rather than a request — but an unbounded
     * socket is still a socket held open for nothing.
     */
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
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
 * Sends a message **without making anyone wait for it**.
 *
 * No request may depend on email (see the timeouts in `getTransporter` for
 * what happens when one does). Delivery is a side effect of an action, not
 * part of it: a receipt that cannot be emailed is still a receipt, and a
 * parent whose welcome message bounces still has a child on the platform.
 *
 * Deliberately not awaited by callers, which is why it takes the logging on
 * itself — a rejected promise nobody is holding would otherwise be an
 * unhandled rejection, and in Node that is a process-level event rather
 * than a line in a log. `sendMail` already swallows its own errors; this
 * guards the case where it somehow throws anyway.
 *
 * @param {{ to: string, subject: string, text: string, html?: string }} message
 * @param {string} [context] What the mail was for, for the log line.
 */
export function sendMailInBackground(message, context = "email") {
  queueMicrotask(() => {
    sendMail(message)
      .then((result) => {
        if (!result.delivered) {
          logger.warn(
            { to: message.to, subject: message.subject, context },
            "Background email was not delivered"
          );
        }
      })
      .catch((err) => {
        logger.error(
          { err, to: message.to, subject: message.subject, context },
          "Background email threw"
        );
      });
  });
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
  // The sender must be an address the provider has verified; replies belong
  // to the school (ADR-035).
  const replyTo = env.MAIL_REPLY_TO;

  try {
    const smtp = getTransporter();

    if (smtp) {
      await smtp.sendMail({ from, replyTo, to, subject, text, html });
      logger.info({ to, subject }, "Email sent over SMTP");
      return { delivered: true, transport: "smtp" };
    }

    await mkdir(OUTBOX_DIR, { recursive: true });
    const file = path.join(OUTBOX_DIR, outboxName(to, subject));
    const body =
      [
        `From: ${from}`,
        `Reply-To: ${replyTo}`,
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
 * Sent to the parent when a child's login is provisioned.
 *
 * Carries the admission number and **not** the password. A temporary
 * password is shown once, on screen, to whoever created the account; an
 * emailed copy sits in an inbox for years, and is a credential sitting in
 * the least controlled place anyone owns. The admission number is an
 * identifier rather than a secret, so it is useful here and safe to send.
 */
export function childAccountEmail({ parentName, childName, admissionNo }) {
  return {
    subject: `Login details for ${childName}`,
    text: [
      `Hello ${parentName || "there"},`,
      "",
      `${childName}'s Kids In Tech account is ready.`,
      "",
      `Admission number: ${admissionNo}`,
      "",
      "The temporary password was shown on screen when the account was",
      "created. If you no longer have it, ask Kids In Tech to reset it.",
      "",
      "They will be asked to choose their own password the first time they sign in.",
      "",
      `Sign in at ${env.CLIENT_ORIGIN}/login`,
      "",
      "Kids In Tech",
    ].join("\n"),
  };
}
